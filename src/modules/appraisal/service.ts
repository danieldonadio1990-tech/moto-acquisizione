import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { leadAppraisals, leadComparables, leads } from "@/db/schema";
import { BusinessRuleError } from "@/modules/leads/service";
import { getApprovedSettings } from "@/modules/valuation/service";
import type { AppraisalParams } from "@/modules/valuation/params";
import { computeAppraisal, comparableStats, type AppraisalResult } from "./calc";
import type { AppraisalInput, ComparableInput } from "./validation";

/**
 * Scheda di valutazione interna (solo back office: ogni chiamata arriva da un'azione che esegue prima requireAdmin()).
 * Comparabili inseriti a mano (nessuna ricerca automatica), revisioni append-only con autore e data, costi presi dalla versione
 * APPROVATA dei parametri. Le righe si cancellano a cascata con la richiesta (cancellazione privacy).
 */

export type ComparableRow = typeof leadComparables.$inferSelect;
export type AppraisalRow = typeof leadAppraisals.$inferSelect;

/** Parametri della scheda dalla versione approvata; null se non c'è una versione approvata o non ha il blocco della scheda. */
export async function getAppraisalParams(): Promise<{ version: number; params: AppraisalParams } | null> {
  const s = await getApprovedSettings();
  return s?.params.appraisal ? { version: s.version, params: s.params.appraisal } : null;
}

async function assertLead(leadId: string) {
  const db = await getDb();
  const [l] = await db.select({ id: leads.id }).from(leads).where(eq(leads.id, leadId));
  if (!l) throw new BusinessRuleError("Richiesta non trovata");
}

export async function listComparables(leadId: string): Promise<ComparableRow[]> {
  const db = await getDb();
  return db.select().from(leadComparables).where(eq(leadComparables.leadId, leadId)).orderBy(asc(leadComparables.createdAt));
}

export async function addComparable(leadId: string, input: ComparableInput, by: string): Promise<ComparableRow> {
  await assertLead(leadId);
  const db = await getDb();
  const [row] = await db
    .insert(leadComparables)
    .values({ leadId, ...input, priceCents: input.priceCents as number, createdBy: by })
    .returning();
  return row;
}

/** Esclude (con motivo) o reinclude un annuncio: resta visibile e tracciato, non viene cancellato. */
export async function setComparableIncluded(leadId: string, comparableId: string, included: boolean, reason: string | null, by: string) {
  if (!included && (!reason || reason.trim().length < 5)) throw new BusinessRuleError("Indica perché escludi l'annuncio");
  const db = await getDb();
  const done = await db
    .update(leadComparables)
    .set({ included, exclusionReason: included ? null : reason!.trim(), updatedBy: by, updatedAt: sql`now()` })
    .where(and(eq(leadComparables.id, comparableId), eq(leadComparables.leadId, leadId)))
    .returning({ id: leadComparables.id });
  if (done.length === 0) throw new BusinessRuleError("Annuncio non trovato");
}

export async function listAppraisalRevisions(leadId: string, limit = 20): Promise<AppraisalRow[]> {
  const db = await getDb();
  return db.select().from(leadAppraisals).where(eq(leadAppraisals.leadId, leadId)).orderBy(desc(leadAppraisals.revision)).limit(limit);
}

/**
 * Salva una NUOVA revisione della scheda. Il calcolo avviene qui sul server con i comparabili inclusi e i parametri approvati:
 * dal modulo arrivano solo i valori inseriti a mano. Errori bloccanti (sconto fuori intervallo, prima offerta manuale oltre il
 * massimo o senza massimo) → nessuna revisione. Revisioni serializzate sulla riga della richiesta (nessun numero doppio).
 */
export async function saveAppraisal(leadId: string, input: AppraisalInput, by: string): Promise<{ revision: number; result: AppraisalResult }> {
  const settings = await getAppraisalParams();
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [lead] = await tx.select({ id: leads.id }).from(leads).where(eq(leads.id, leadId)).for("update");
    if (!lead) throw new BusinessRuleError("Richiesta non trovata");

    const included = await tx
      .select({ price: leadComparables.priceCents })
      .from(leadComparables)
      .where(and(eq(leadComparables.leadId, leadId), eq(leadComparables.included, true)));
    const stats = comparableStats(included.map((r) => r.price));

    // valore dei comparabili diverso dalla mediana (o senza comparabili): è una scelta manuale e va motivata
    if (input.comparablesValueCents !== null && input.comparablesValueCents !== stats?.medianCents) {
      if (!input.comparablesValueNote || input.comparablesValueNote.length < 5) {
        throw new BusinessRuleError(
          stats ? "Il valore dei comparabili è diverso dalla mediana degli annunci inclusi: motiva la scelta (almeno 5 caratteri)." : "Non ci sono comparabili inclusi: motiva il valore inserito (almeno 5 caratteri).",
        );
      }
    }

    const result = computeAppraisal({
      params: settings?.params ?? null,
      includedPricesCents: included.map((r) => r.price),
      comparablesValueCents: input.comparablesValueCents,
      resaleValueCents: input.resaleValueCents,
      discountCents: input.discountCents,
      manualFirstOfferCents: input.manualFirstOfferCents,
      targetPriceCents: input.targetPriceCents,
    });
    if (result.errors.length) throw new BusinessRuleError(result.errors.join(" "));

    const [{ next }] = await tx
      .select({ next: sql<number>`coalesce(max(${leadAppraisals.revision}), 0)::int + 1` })
      .from(leadAppraisals)
      .where(eq(leadAppraisals.leadId, leadId));

    await tx.insert(leadAppraisals).values({
      leadId,
      revision: next,
      settingsVersion: settings?.version ?? null,
      comparablesCount: stats?.count ?? 0,
      comparablesMedianCents: stats?.medianCents ?? null,
      comparablesValueCents: input.comparablesValueCents,
      comparablesValueNote: input.comparablesValueNote,
      resaleValueCents: input.resaleValueCents,
      resaleValueNote: input.resaleValueNote,
      discountCents: input.discountCents,
      maxSustainableCents: result.maxSustainableCents,
      firstOfferCents: result.firstOfferCents,
      firstOfferKind: result.firstOfferKind,
      firstOfferReason: result.firstOfferKind === "manual" ? input.firstOfferReason : null,
      targetPriceCents: input.targetPriceCents,
      targetPriceNote: input.targetPriceNote,
      costs: result.costs,
      warnings: result.warnings,
      declaredAskingPriceCents: input.declaredAskingPriceCents,
      accessories: input.accessories,
      cosmeticCondition: input.cosmeticCondition,
      defects: input.defects,
      maintenanceRecords: input.maintenanceRecords,
      revisionNote: input.revisionNote,
      createdBy: by,
    });
    return { revision: next, result };
  });
}

/** Tutto ciò che serve alla scheda nel back office. Il calcolo «attuale» usa i comparabili e i parametri di adesso. */
export async function getAppraisalSheet(leadId: string) {
  const [comparables, revisions, settings] = await Promise.all([listComparables(leadId), listAppraisalRevisions(leadId), getAppraisalParams()]);
  const latest = revisions[0] ?? null;
  const included = comparables.filter((c) => c.included).map((c) => c.priceCents);
  const live = computeAppraisal({
    params: settings?.params ?? null,
    includedPricesCents: included,
    comparablesValueCents: latest?.comparablesValueCents ?? null,
    resaleValueCents: latest?.resaleValueCents ?? null,
    discountCents: latest?.discountCents ?? null,
    manualFirstOfferCents: latest?.firstOfferKind === "manual" ? latest.firstOfferCents : null,
    targetPriceCents: latest?.targetPriceCents ?? null,
  });
  // i comparabili sono cambiati dall'ultima revisione? (la revisione salvata resta com'era: serve salvarne una nuova)
  const comparablesChanged = latest !== null && (latest.comparablesCount !== (live.stats?.count ?? 0) || latest.comparablesMedianCents !== (live.stats?.medianCents ?? null));
  return { comparables, revisions, latest, settings, live, comparablesChanged };
}
