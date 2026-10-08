import "server-only";
import { eq, ilike, inArray, or, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { customers, events, leadPhotos, leads, motorcycles } from "@/db/schema";
import { getPhotoStorage } from "@/modules/photos/storage";
import { normalizeItalianPhone } from "@/modules/leads/validation";

/**
 * Cancellazione completa dei dati di una persona (diritto all'oblio, scadenza conservazione).
 *
 * Per ogni lead trovato cancella: file delle foto (storage, compresi eventuali orfani),
 * righe foto, offerte, storico stati, dati di acquisto, lead, moto e cliente.
 * Gli eventi statistici NON vengono cancellati ma anonimizzati (lead_id → null): restano solo
 * conteggi aggregati senza collegamento alla persona.
 *
 * Ordine: prima i file, poi il database. Se lo storage fallisce il database resta intatto
 * e l'operazione si può ripetere (è idempotente).
 */
export type ErasureQuery = { leadId?: string; code?: string; email?: string; phone?: string };

export type SubjectPreview = {
  leadId: string;
  code: string;
  createdAt: Date;
  status: string;
  name: string;
  email: string;
  phone: string;
  motorcycle: string;
  photos: number;
};

export async function findSubjects(q: ErasureQuery): Promise<SubjectPreview[]> {
  const conds = [];
  if (q.leadId) conds.push(eq(leads.id, q.leadId));
  if (q.code) conds.push(eq(leads.code, q.code.trim().toUpperCase()));
  if (q.email) conds.push(ilike(customers.email, q.email.trim()));
  if (q.phone) {
    const p = normalizeItalianPhone(q.phone);
    if (p) conds.push(eq(customers.phone, p));
  }
  if (conds.length === 0) return [];
  const db = await getDb();
  const rows = await db
    .select({
      leadId: leads.id,
      code: leads.code,
      createdAt: leads.createdAt,
      status: leads.status,
      first: customers.firstName,
      last: customers.lastName,
      email: customers.email,
      phone: customers.phone,
      brand: motorcycles.brand,
      model: motorcycles.model,
      photos: sql<number>`(select count(*)::int from ${leadPhotos} p where p.lead_id = ${leads.id})`,
    })
    .from(leads)
    .innerJoin(customers, eq(leads.customerId, customers.id))
    .innerJoin(motorcycles, eq(leads.motorcycleId, motorcycles.id))
    .where(or(...conds));
  return rows.map((r) => ({
    leadId: r.leadId,
    code: r.code,
    createdAt: r.createdAt,
    status: r.status,
    name: `${r.first} ${r.last}`,
    email: r.email,
    phone: r.phone,
    motorcycle: `${r.brand} ${r.model}`,
    photos: r.photos,
  }));
}

export type ErasureReport = { code: string; storageObjectsDeleted: number; eventsAnonymized: number };

export async function eraseLead(leadId: string): Promise<ErasureReport> {
  const db = await getDb();
  const [lead] = await db
    .select({ id: leads.id, code: leads.code, customerId: leads.customerId, motorcycleId: leads.motorcycleId })
    .from(leads)
    .where(eq(leads.id, leadId));
  if (!lead) throw new Error("Lead non trovato (forse già cancellato)");

  // 1) file: prima quelli noti dal database, poi tutto il prefisso del lead (orfani)
  const storage = getPhotoStorage();
  const photos = await db.select({ key: leadPhotos.storageKey }).from(leadPhotos).where(eq(leadPhotos.leadId, leadId));
  for (const p of photos) await storage.delete(p.key);
  const orphans = await storage.deletePrefix(`leads/${leadId}`);
  const left = await storage.list(`leads/${leadId}`);
  if (left.length > 0) throw new Error(`Restano ${left.length} file nello storage: cancellazione interrotta, riprovare`);

  // 2) database, in un'unica transazione
  const anonymized = await db.transaction(async (tx) => {
    const ev = await tx.update(events).set({ leadId: null }).where(eq(events.leadId, leadId)).returning({ id: events.id });
    await tx.delete(leads).where(eq(leads.id, leadId)); // cascade: foto, offerte, storico stati
    await tx.delete(motorcycles).where(eq(motorcycles.id, lead.motorcycleId));
    const stillUsed = await tx.select({ id: leads.id }).from(leads).where(eq(leads.customerId, lead.customerId));
    if (stillUsed.length === 0) await tx.delete(customers).where(eq(customers.id, lead.customerId));
    return ev.length;
  });

  return { code: lead.code, storageObjectsDeleted: photos.length + orphans, eventsAnonymized: anonymized };
}

export async function eraseSubjects(leadIds: string[]): Promise<ErasureReport[]> {
  const out: ErasureReport[] = [];
  for (const id of leadIds) out.push(await eraseLead(id));
  return out;
}

/** Utile ai test: verifica che non resti nessun riferimento ai lead indicati. */
export async function remainingReferences(leadIds: string[]) {
  const db = await getDb();
  const [l] = await db.select({ n: sql<number>`count(*)::int` }).from(leads).where(inArray(leads.id, leadIds));
  const [e] = await db.select({ n: sql<number>`count(*)::int` }).from(events).where(inArray(events.leadId, leadIds));
  const [p] = await db.select({ n: sql<number>`count(*)::int` }).from(leadPhotos).where(inArray(leadPhotos.leadId, leadIds));
  return { leads: l.n, events: e.n, photos: p.n };
}
