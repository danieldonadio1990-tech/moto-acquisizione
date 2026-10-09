import "server-only";
import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { getDb, type Db } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
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
import { PRIVACY_POLICY_VERSION } from "@/config/business";
import { serverConfig } from "@/config/env";
import type { LeadSubmission } from "./validation";
import { CLOSED_STATUSES, type LeadStatus } from "./statuses";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const PHOTO_TOKEN_TTL_MS = 48 * 60 * 60 * 1000;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function newCode() {
  return Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
}

/**
 * Token per caricare le foto di UN lead. Deterministico (HMAC con il segreto del server)
 * così un retry dello stesso invio riceve lo stesso token, senza invalidare quello già in uso.
 * Nel database si salva solo l'hash.
 */
function uploadTokenFor(leadId: string, submissionId: string) {
  return createHmac("sha256", serverConfig().sessionSecret)
    .update(`photo-upload:${leadId}:${submissionId}`)
    .digest("base64url");
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export class BusinessRuleError extends Error {}

// ---------------------------------------------------------------------------
// Lato pubblico (funnel)
// ---------------------------------------------------------------------------

export type CreatedLead = { id: string; code: string; uploadToken: string; duplicate: boolean };

/**
 * Crea il lead appena il cliente lascia i contatti (le foto arrivano dopo, col token).
 *
 * IDEMPOTENTE: lo stesso submissionId produce sempre lo stesso lead. Doppio click, retry dopo
 * timeout o risposta persa, refresh: la seconda richiesta restituisce il lead già creato.
 * Anche due richieste simultanee producono un solo lead (vincolo UNIQUE sul database).
 */
export async function createLead(input: LeadSubmission): Promise<CreatedLead> {
  const existing = await findExistingLead(input.submissionId);
  if (existing) return existing;

  const db = await getDb();
  const m = input.motorcycle;
  const catalog = m.modelId === OTHER_MODEL_ID ? undefined : getModel(m.modelId);
  if (m.modelId !== OTHER_MODEL_ID && !catalog) throw new BusinessRuleError("Modello non valido");

  try {
    const lead = await db.transaction(async (tx) => {
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

      let code = newCode();
      for (let i = 0; i < 5; i++) {
        const taken = await tx.select({ id: leads.id }).from(leads).where(eq(leads.code, code));
        if (taken.length === 0) break;
        code = newCode();
      }

      const [created] = await tx
        .insert(leads)
        .values({
          code,
          submissionId: input.submissionId,
          motorcycleId: moto.id,
          customerId: customer.id,
          mileage: input.mileage,
          isRunning: input.condition.isRunning,
          accident: input.condition.accident,
          mechanicalIssues: input.condition.mechanicalIssues,
          maintenance: input.condition.maintenance,
          preferredContact: c.preferredContact,
          status: "new",
          photoUploadTokenExpiresAt: new Date(Date.now() + PHOTO_TOKEN_TTL_MS),
          utmSource: input.attribution?.utmSource || null,
          utmMedium: input.attribution?.utmMedium || null,
          utmCampaign: input.attribution?.utmCampaign || null,
        })
        .returning({ id: leads.id, code: leads.code });

      await tx
        .update(leads)
        .set({ photoUploadTokenHash: sha256(uploadTokenFor(created.id, input.submissionId)) })
        .where(eq(leads.id, created.id));
      await tx.insert(leadStatusHistory).values({ leadId: created.id, fromStatus: null, toStatus: "new" });
      return created;
    });

    // evento aggregato: nessun collegamento con la sessione di navigazione
    await recordEvent("lead_created", { leadId: lead.id });
    return {
      id: lead.id,
      code: lead.code,
      uploadToken: uploadTokenFor(lead.id, input.submissionId),
      duplicate: false,
    };
  } catch (err) {
    // due richieste simultanee con lo stesso submissionId: la seconda trova il lead della prima
    if (isUniqueViolation(err)) {
      const again = await findExistingLead(input.submissionId);
      if (again) return again;
    }
    throw err;
  }
}

export async function findExistingLead(submissionId: string): Promise<CreatedLead | null> {
  const db = await getDb();
  const [row] = await db
    .select({ id: leads.id, code: leads.code, expires: leads.photoUploadTokenExpiresAt })
    .from(leads)
    .where(eq(leads.submissionId, submissionId));
  if (!row) return null;
  // il cliente sta ancora completando l'invio: rinnova la finestra per le foto
  if (!row.expires || row.expires.getTime() < Date.now() + PHOTO_TOKEN_TTL_MS / 2) {
    await db
      .update(leads)
      .set({ photoUploadTokenExpiresAt: new Date(Date.now() + PHOTO_TOKEN_TTL_MS) })
      .where(eq(leads.id, row.id));
  }
  return { id: row.id, code: row.code, uploadToken: uploadTokenFor(row.id, submissionId), duplicate: true };
}

/** Verifica il token foto. Da chiamare PRIMA di leggere il corpo della richiesta. */
export async function verifyUploadToken(leadId: string, token: string): Promise<boolean> {
  const db = await getDb();
  const [lead] = await db
    .select({ hash: leads.photoUploadTokenHash, expires: leads.photoUploadTokenExpiresAt })
    .from(leads)
    .where(eq(leads.id, leadId));
  if (!lead?.hash || !lead.expires || lead.expires < new Date()) return false;
  const a = Buffer.from(lead.hash, "hex");
  const b = Buffer.from(sha256(token), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
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
      photoCount: leads.photoCount,
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

  // token e chiave di idempotenza non escono mai dal server
  const lead: Omit<typeof row.lead, "photoUploadTokenHash" | "photoUploadTokenExpiresAt" | "submissionId"> = {
    ...row.lead,
  };
  for (const k of ["photoUploadTokenHash", "photoUploadTokenExpiresAt", "submissionId"] as const) {
    delete (lead as Partial<typeof row.lead>)[k];
  }
  return { lead, customer: row.customer, motorcycle: row.motorcycle, photos, history, offers: leadOffers, buyBox };
}

export async function getPhotoForAdmin(photoId: string) {
  const db = await getDb();
  const [p] = await db.select().from(leadPhotos).where(eq(leadPhotos.id, photoId));
  if (!p) return null;
  const data = await getPhotoStorage().get(p.storageKey);
  return data ? { data, mimeType: p.mimeType } : null;
}

/** Legge e blocca la riga del lead per tutta la transazione (serializza le modifiche concorrenti). */
async function lockLead(tx: Tx, leadId: string) {
  const [lead] = await tx
    .select({ status: leads.status, createdAt: leads.createdAt })
    .from(leads)
    .where(eq(leads.id, leadId))
    .for("update");
  if (!lead) throw new BusinessRuleError("Lead non trovato");
  return lead;
}

async function setStatusTx(tx: Tx, leadId: string, from: LeadStatus, to: LeadStatus, by: string) {
  if (from === to) return false;
  await tx.update(leads).set({ status: to, updatedAt: new Date() }).where(eq(leads.id, leadId));
  await tx.insert(leadStatusHistory).values({ leadId, fromStatus: from, toStatus: to, changedBy: by });
  return true;
}

/** Cambio stato manuale. "Acquistata" si entra ed esce solo con registra/annulla acquisto. */
export async function changeStatus(leadId: string, to: LeadStatus, by: string) {
  if (to === "purchased") {
    throw new BusinessRuleError("Per segnare l'acquisto usa 'Registra acquisto' con il prezzo pagato");
  }
  const db = await getDb();
  await db.transaction(async (tx) => {
    const lead = await lockLead(tx, leadId);
    if (lead.status === "purchased") {
      throw new BusinessRuleError("La moto risulta acquistata: per cambiare stato usa prima 'Annulla acquisto'");
    }
    await setStatusTx(tx, leadId, lead.status, to, by);
  });
}

export async function updateNotes(leadId: string, notes: string) {
  const db = await getDb();
  const res = await db
    .update(leads)
    .set({ notes: notes.trim() || null, updatedAt: new Date() })
    .where(eq(leads.id, leadId))
    .returning({ id: leads.id });
  if (res.length === 0) throw new BusinessRuleError("Lead non trovato");
}

/** Nuova offerta: lo stato passa a "Offerta fatta" (se non c'è già un'offerta accettata). */
export async function addOffer(leadId: string, amount: number, by: string) {
  const db = await getDb();
  await db.transaction(async (tx) => {
    const lead = await lockLead(tx, leadId);
    if (lead.status === "purchased") throw new BusinessRuleError("La moto risulta già acquistata");
    await tx.insert(offers).values({ leadId, amount, createdBy: by });
    if (lead.status !== "accepted") await setStatusTx(tx, leadId, lead.status, "offer_made", by);
  });
}

/**
 * Esito di un'offerta "proposta".
 * - Accettata: eventuale offerta accettata precedente diventa "superata" (una sola accettata per lead,
 *   garantito anche dal database); il lead passa ad "Accettata".
 * - Rifiutata: il lead passa a "Rifiutata" solo se non resta un'altra offerta accettata.
 */
export async function setOfferStatus(offerId: string, status: "accepted" | "rejected", by: string) {
  const db = await getDb();
  await db.transaction(async (tx) => {
    const [offer] = await tx.select().from(offers).where(eq(offers.id, offerId));
    if (!offer) throw new BusinessRuleError("Offerta non trovata");
    const lead = await lockLead(tx, offer.leadId);
    if (lead.status === "purchased") throw new BusinessRuleError("La moto risulta già acquistata");
    if (offer.status !== "proposed") throw new BusinessRuleError("Questa offerta ha già un esito");

    if (status === "accepted") {
      await tx
        .update(offers)
        .set({ status: "superseded" })
        .where(and(eq(offers.leadId, offer.leadId), eq(offers.status, "accepted")));
      await tx.update(offers).set({ status: "accepted" }).where(eq(offers.id, offerId));
      await setStatusTx(tx, offer.leadId, lead.status, "accepted", by);
    } else {
      await tx.update(offers).set({ status: "rejected" }).where(eq(offers.id, offerId));
      const [stillAccepted] = await tx
        .select({ id: offers.id })
        .from(offers)
        .where(and(eq(offers.leadId, offer.leadId), eq(offers.status, "accepted"), ne(offers.id, offerId)));
      if (!stillAccepted) await setStatusTx(tx, offer.leadId, lead.status, "rejected", by);
    }
  });
}

/** Data di calendario valida "AAAA-MM-GG" (rifiuta 2026-02-30, 2026-13-45…). */
export function parseCalendarDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d, 12));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? date : null;
}

const romeDay = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" }); // AAAA-MM-GG

/** Moto acquistata: salva il prezzo realmente pagato (distinto dalle offerte) e chiude il lead. */
export async function recordPurchase(leadId: string, price: number, day: string, by: string) {
  const date = parseCalendarDate(day);
  if (!date) throw new BusinessRuleError("Data non valida");
  if (!Number.isInteger(price) || price <= 0) throw new BusinessRuleError("Importo non valido");
  const db = await getDb();
  await db.transaction(async (tx) => {
    const lead = await lockLead(tx, leadId);
    if (lead.status === "purchased") throw new BusinessRuleError("Acquisto già registrato");
    if (day > romeDay(new Date())) throw new BusinessRuleError("La data non può essere nel futuro");
    if (day < romeDay(lead.createdAt)) {
      throw new BusinessRuleError("La data non può essere precedente alla richiesta");
    }
    await tx
      .update(leads)
      .set({ status: "purchased", purchasePrice: price, purchasedAt: date, updatedAt: new Date() })
      .where(eq(leads.id, leadId));
    await tx
      .insert(leadStatusHistory)
      .values({ leadId, fromStatus: lead.status, toStatus: "purchased", changedBy: by });
  });
}

/** Annulla un acquisto registrato per errore: torna allo stato precedente all'acquisto. */
export async function undoPurchase(leadId: string, by: string) {
  const db = await getDb();
  await db.transaction(async (tx) => {
    const lead = await lockLead(tx, leadId);
    if (lead.status !== "purchased") throw new BusinessRuleError("Questa moto non risulta acquistata");
    const [last] = await tx
      .select({ from: leadStatusHistory.fromStatus })
      .from(leadStatusHistory)
      .where(and(eq(leadStatusHistory.leadId, leadId), eq(leadStatusHistory.toStatus, "purchased")))
      .orderBy(desc(leadStatusHistory.createdAt))
      .limit(1);
    const back: LeadStatus = last?.from && last.from !== "purchased" ? last.from : "accepted";
    await tx
      .update(leads)
      .set({ status: back, purchasePrice: null, purchasedAt: null, updatedAt: new Date() })
      .where(eq(leads.id, leadId));
    await tx.insert(leadStatusHistory).values({ leadId, fromStatus: "purchased", toStatus: back, changedBy: by });
  });
}
