import "server-only";
import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  buyBoxRules,
  customers,
  leadPhotos,
  leadStatusHistory,
  leads,
  motorcycles,
  offers,
} from "@/db/schema";
import { getModel, OTHER_MODEL_ID } from "@/modules/catalog";
import { matchBuyBox } from "@/modules/buybox/match";
import { recordEvent } from "@/modules/analytics/server";
import { getPhotoStorage } from "@/modules/photos/storage";
import { MAX_PHOTOS_PER_LEAD, processPhoto } from "@/modules/photos/process";
import { PRIVACY_POLICY_VERSION } from "@/config/brand";
import type { LeadSubmission } from "./validation";
import { CLOSED_STATUSES, type LeadStatus } from "./statuses";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const PHOTO_TOKEN_TTL_MS = 48 * 60 * 60 * 1000;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function newCode() {
  return Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
}

// ---------------------------------------------------------------------------
// Lato pubblico (funnel)
// ---------------------------------------------------------------------------

/**
 * Crea il lead appena il cliente lascia i contatti.
 * Le foto arrivano dopo, con un token monouso: se il cliente abbandona allo step foto,
 * il contatto non è comunque perso.
 */
export async function createLead(input: LeadSubmission) {
  const db = await getDb();
  const m = input.motorcycle;
  const catalog = m.modelId === OTHER_MODEL_ID ? undefined : getModel(m.modelId);
  if (m.modelId !== OTHER_MODEL_ID && !catalog) throw new Error("Modello non valido");

  const uploadToken = randomBytes(24).toString("base64url");

  const result = await db.transaction(async (tx) => {
    const [moto] = await tx
      .insert(motorcycles)
      .values({
        catalogModelId: catalog?.id ?? null,
        brand: catalog?.brand ?? m.brand,
        model: catalog?.name ?? m.modelOther!,
        version: m.version || null,
        year: m.year,
        displacement: m.displacement ?? null,
      })
      .returning({ id: motorcycles.id });

    const c = input.contact;
    const [customer] = await tx
      .insert(customers)
      .values({
        firstName: c.firstName,
        lastName: c.lastName,
        phone: c.phone,
        email: c.email,
        city: c.city,
        privacyConsentAt: new Date(),
        privacyPolicyVersion: PRIVACY_POLICY_VERSION,
      })
      .returning({ id: customers.id });

    // codice univoco breve (ritenta in caso di collisione)
    let code = newCode();
    for (let i = 0; i < 5; i++) {
      const exists = await tx.select({ id: leads.id }).from(leads).where(eq(leads.code, code));
      if (exists.length === 0) break;
      code = newCode();
    }

    const [lead] = await tx
      .insert(leads)
      .values({
        code,
        motorcycleId: moto.id,
        customerId: customer.id,
        mileage: input.mileage,
        isRunning: input.condition.isRunning,
        accident: input.condition.accident,
        mechanicalIssues: input.condition.mechanicalIssues,
        maintenance: input.condition.maintenance,
        preferredContact: c.preferredContact,
        status: "new",
        photoUploadTokenHash: sha256(uploadToken),
        photoUploadTokenExpiresAt: new Date(Date.now() + PHOTO_TOKEN_TTL_MS),
        utmSource: input.attribution?.utmSource || null,
        utmMedium: input.attribution?.utmMedium || null,
        utmCampaign: input.attribution?.utmCampaign || null,
      })
      .returning({ id: leads.id, code: leads.code });

    await tx.insert(leadStatusHistory).values({ leadId: lead.id, fromStatus: null, toStatus: "new" });
    return lead;
  });

  await recordEvent("lead_created", { sessionId: input.sessionId, leadId: result.id });
  return { id: result.id, code: result.code, uploadToken };
}

export class UploadAuthError extends Error {}

/** Aggiunge foto a un lead usando il token ricevuto alla creazione. */
export async function addPhotosWithToken(leadId: string, token: string, files: Buffer[]) {
  const db = await getDb();
  const [lead] = await db
    .select({
      id: leads.id,
      hash: leads.photoUploadTokenHash,
      expires: leads.photoUploadTokenExpiresAt,
    })
    .from(leads)
    .where(eq(leads.id, leadId));

  if (!lead || !lead.hash || !lead.expires || lead.expires < new Date() || lead.hash !== sha256(token)) {
    throw new UploadAuthError("Link per le foto non valido o scaduto");
  }
  return storePhotos(leadId, files);
}

async function storePhotos(leadId: string, files: Buffer[]) {
  const db = await getDb();
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leadPhotos)
    .where(eq(leadPhotos.leadId, leadId));
  const room = MAX_PHOTOS_PER_LEAD - count;
  if (room <= 0) return { saved: 0, rejected: files.length, errors: ["Numero massimo di foto raggiunto"] };

  const storage = getPhotoStorage();
  let saved = 0;
  const errors: string[] = [];
  for (const file of files.slice(0, room)) {
    try {
      const p = await processPhoto(file);
      const key = `leads/${leadId}/${randomUUID()}.jpg`;
      await storage.put(key, p.data, p.contentType);
      await db.insert(leadPhotos).values({
        leadId,
        storageKey: key,
        mimeType: p.contentType,
        sizeBytes: p.data.byteLength,
        width: p.width,
        height: p.height,
      });
      saved++;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "Errore foto");
    }
  }
  return { saved, rejected: files.length - saved, errors };
}

// ---------------------------------------------------------------------------
// Backoffice
// ---------------------------------------------------------------------------

export type LeadListFilter = { status?: LeadStatus | "open" | "all" };

export async function listLeads(filter: LeadListFilter = {}) {
  const db = await getDb();
  const lastOffer = sql<number | null>`(
    select o.amount from ${offers} o where o.lead_id = ${leads.id}
    order by o.created_at desc limit 1
  )`;
  const photoCount = sql<number>`(select count(*)::int from ${leadPhotos} p where p.lead_id = ${leads.id})`;

  const where =
    !filter.status || filter.status === "all"
      ? undefined
      : filter.status === "open"
        ? sql`${leads.status} not in (${sql.join(
            CLOSED_STATUSES.map((s) => sql`${s}`),
            sql`, `,
          )})`
        : eq(leads.status, filter.status);

  const rows = await db
    .select({
      id: leads.id,
      code: leads.code,
      createdAt: leads.createdAt,
      status: leads.status,
      mileage: leads.mileage,
      isRunning: leads.isRunning,
      notes: leads.notes,
      purchasePrice: leads.purchasePrice,
      market: leads.market,
      firstName: customers.firstName,
      lastName: customers.lastName,
      city: customers.city,
      brand: motorcycles.brand,
      model: motorcycles.model,
      catalogModelId: motorcycles.catalogModelId,
      displacement: motorcycles.displacement,
      year: motorcycles.year,
      lastOffer,
      photoCount,
    })
    .from(leads)
    .innerJoin(customers, eq(leads.customerId, customers.id))
    .innerJoin(motorcycles, eq(leads.motorcycleId, motorcycles.id))
    .where(where)
    .orderBy(desc(leads.createdAt))
    .limit(500);

  const rules = await db.select().from(buyBoxRules).where(eq(buyBoxRules.active, true));
  return rows.map((r) => ({
    ...r,
    buyBox: matchBuyBox(
      {
        brand: r.brand,
        family: r.catalogModelId ? (getModel(r.catalogModelId)?.family ?? null) : null,
        year: r.year,
        mileage: r.mileage,
        isRunning: r.isRunning,
        market: r.market,
      },
      rules,
    ),
  }));
}

export async function countLeadsByStatus() {
  const db = await getDb();
  return db
    .select({ status: leads.status, count: sql<number>`count(*)::int` })
    .from(leads)
    .groupBy(leads.status);
}

export async function getLeadDetail(id: string) {
  const db = await getDb();
  const [row] = await db
    .select({ lead: leads, customer: customers, motorcycle: motorcycles })
    .from(leads)
    .innerJoin(customers, eq(leads.customerId, customers.id))
    .innerJoin(motorcycles, eq(leads.motorcycleId, motorcycles.id))
    .where(eq(leads.id, id));
  if (!row) return null;

  const [photos, history, leadOffers, rules] = await Promise.all([
    db.select().from(leadPhotos).where(eq(leadPhotos.leadId, id)).orderBy(asc(leadPhotos.createdAt)),
    db
      .select()
      .from(leadStatusHistory)
      .where(eq(leadStatusHistory.leadId, id))
      .orderBy(desc(leadStatusHistory.createdAt)),
    db.select().from(offers).where(eq(offers.leadId, id)).orderBy(desc(offers.createdAt)),
    db.select().from(buyBoxRules).where(eq(buyBoxRules.active, true)),
  ]);

  const family = row.motorcycle.catalogModelId
    ? (getModel(row.motorcycle.catalogModelId)?.family ?? null)
    : null;
  const buyBox = matchBuyBox(
    {
      brand: row.motorcycle.brand,
      family,
      year: row.motorcycle.year,
      mileage: row.lead.mileage,
      isRunning: row.lead.isRunning,
      market: row.lead.market,
    },
    rules,
  );

  // il token foto non deve mai uscire dal server
  const lead: Omit<typeof row.lead, "photoUploadTokenHash" | "photoUploadTokenExpiresAt"> = { ...row.lead };
  delete (lead as Partial<typeof row.lead>).photoUploadTokenHash;
  delete (lead as Partial<typeof row.lead>).photoUploadTokenExpiresAt;
  return { lead, customer: row.customer, motorcycle: row.motorcycle, photos, history, offers: leadOffers, buyBox };
}

export async function getPhotoForAdmin(photoId: string) {
  const db = await getDb();
  const [p] = await db.select().from(leadPhotos).where(eq(leadPhotos.id, photoId));
  if (!p) return null;
  const data = await getPhotoStorage().get(p.storageKey);
  return data ? { data, mimeType: p.mimeType } : null;
}

type Tx = Parameters<Parameters<Awaited<ReturnType<typeof getDb>>["transaction"]>[0]>[0];

async function setStatusTx(tx: Tx, leadId: string, to: LeadStatus, by: string) {
  const [current] = await tx.select({ status: leads.status }).from(leads).where(eq(leads.id, leadId));
  if (!current) throw new Error("Lead non trovato");
  if (current.status === to) return false;
  await tx.update(leads).set({ status: to, updatedAt: new Date() }).where(eq(leads.id, leadId));
  await tx.insert(leadStatusHistory).values({ leadId, fromStatus: current.status, toStatus: to, changedBy: by });
  return true;
}

export async function changeStatus(leadId: string, to: LeadStatus, by: string) {
  if (to === "purchased") throw new Error("Per segnare l'acquisto usa 'Registra acquisto' con il prezzo");
  const db = await getDb();
  await db.transaction((tx) => setStatusTx(tx, leadId, to, by));
}

export async function updateNotes(leadId: string, notes: string) {
  const db = await getDb();
  await db
    .update(leads)
    .set({ notes: notes.trim() || null, updatedAt: new Date() })
    .where(eq(leads.id, leadId));
}

/** Nuova offerta: lo stato passa a "Offerta fatta" (se non è già più avanti). */
export async function addOffer(leadId: string, amount: number, by: string) {
  const db = await getDb();
  await db.transaction(async (tx) => {
    const [current] = await tx.select({ status: leads.status }).from(leads).where(eq(leads.id, leadId));
    if (!current) throw new Error("Lead non trovato");
    await tx.insert(offers).values({ leadId, amount, createdBy: by });
    if (!["accepted", "purchased"].includes(current.status)) {
      await setStatusTx(tx, leadId, "offer_made", by);
    }
  });
}

/** Esito di un'offerta. Accettata → lead "Accettata"; rifiutata → lead "Rifiutata". */
export async function setOfferStatus(offerId: string, status: "accepted" | "rejected", by: string) {
  const db = await getDb();
  await db.transaction(async (tx) => {
    const [offer] = await tx.select().from(offers).where(eq(offers.id, offerId));
    if (!offer) throw new Error("Offerta non trovata");
    await tx.update(offers).set({ status }).where(eq(offers.id, offerId));
    await setStatusTx(tx, offer.leadId, status === "accepted" ? "accepted" : "rejected", by);
  });
}

/** Moto acquistata: salva il prezzo reale e chiude il lead. */
export async function recordPurchase(leadId: string, price: number, purchasedAt: Date, by: string) {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(leads)
      .set({ purchasePrice: price, purchasedAt, updatedAt: new Date() })
      .where(eq(leads.id, leadId));
    await setStatusTx(tx, leadId, "purchased", by);
  });
}

/** Annulla un acquisto registrato per errore: torna ad "Accettata". */
export async function undoPurchase(leadId: string, by: string) {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(leads)
      .set({ purchasePrice: null, purchasedAt: null, updatedAt: new Date() })
      .where(and(eq(leads.id, leadId), eq(leads.status, "purchased")));
    await setStatusTx(tx, leadId, "accepted", by);
  });
}
