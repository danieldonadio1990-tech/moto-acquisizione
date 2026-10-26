import "server-only";
import { and, asc, desc, eq, isNull, lte, gte, or, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import { leads, marketReferences, motorcycles, valuationSettings, valuations, type ValuationStatus } from "@/db/schema";
import { getModel } from "@/modules/catalog";
import { logError } from "@/lib/log";
import { addOfferInTx, BusinessRuleError, type Tx } from "@/modules/leads/service";
import { computeValuation } from "./engine";
import type { PublicValuation } from "./public";
import { valuationParamsSchema, type ValuationParams } from "./params";
import type { MarketDataProvider, MarketSnapshot, NormalizedVehicle, ValuationResult, VehicleInput } from "./types";

/**
 * Persistenza e orchestrazione. Il calcolo avviene SEMPRE qui, sul server, da dati letti dal database:
 * il browser non invia mai prezzi, costi o margini.
 */

// ---- Interruttore dell'esposizione al cliente ---------------------------------------------------------------------------
/**
 * Importi mostrati al cliente SOLO con VALUATION_PUBLIC_OFFERS=true. Spento (predefinito), il calcolo interno può esistere
 * ma il cliente vede sempre «verifica manuale». Va acceso solo dopo l'approvazione dei parametri, dei dati di mercato e
 * della formulazione commerciale/legale.
 */
export const publicOffersEnabled = (e: NodeJS.ProcessEnv = process.env) => e.VALUATION_PUBLIC_OFFERS === "true";

// ---- Parametri approvati ---------------------------------------------------------------------------------------------------
export async function getApprovedSettings(): Promise<{ id: string; version: number; params: ValuationParams } | null> {
  const db = await getDb();
  const [row] = await db.select().from(valuationSettings).where(eq(valuationSettings.status, "approved")).limit(1);
  if (!row) return null;
  const parsed = valuationParamsSchema.safeParse(row.params);
  if (!parsed.success) {
    logError("valutazione: parametri approvati non validi", new Error("schema"));
    return null; // parametri corrotti = nessuna offerta, mai un calcolo con valori incerti
  }
  return { id: row.id, version: row.version, params: parsed.data };
}

// ---- Dati di mercato: tabella market_references, inserita dagli amministratori con provenienza -----------------------------
export class DbMarketProvider implements MarketDataProvider {
  async lookup(v: NormalizedVehicle): Promise<MarketSnapshot | null> {
    const db = await getDb();
    const rows = await db
      .select()
      .from(marketReferences)
      .where(
        and(
          sql`lower(${marketReferences.brand}) = ${v.brand.toLowerCase()}`,
          lte(marketReferences.yearFrom, v.year),
          gte(marketReferences.yearTo, v.year),
          v.family ? or(eq(marketReferences.family, v.family), isNull(marketReferences.family)) : isNull(marketReferences.family),
        ),
      )
      // prima il modello esatto, poi il marchio intero; a parità la rilevazione più recente
      .orderBy(sql`(${marketReferences.family} is null)`, desc(marketReferences.asOf))
      .limit(1);
    const r = rows[0];
    if (!r) return null;
    return {
      source: r.source,
      kind: r.kind,
      asOf: r.asOf,
      sampleCount: r.sampleCount,
      medianCents: r.medianCents,
      p25Cents: r.p25Cents,
      p75Cents: r.p75Cents,
      match: r.family !== null ? "exact" : "family",
      simulated: false,
    };
  }
}

let providerOverride: MarketDataProvider | null = null;
/** Solo per i test: sostituisce il fornitore di dati di mercato. */
export function setMarketProvider(p: MarketDataProvider | null) {
  providerOverride = p;
}
const provider = (): MarketDataProvider => providerOverride ?? new DbMarketProvider();

// ---- Stato e vista pubblica -------------------------------------------------------------------------------------------------
function statusFor(r: ValuationResult): ValuationStatus {
  if (r.decision !== "manual_review") return "preliminary_generated";
  const missing = r.reasons.some((x) => ["no_approved_settings", "no_market_data", "invalid_input", "vehicle_not_recognized", "simulated_data"].includes(x));
  return missing ? "insufficient_data" : "manual_review";
}

export type { PublicValuation };

type ValuationRow = typeof valuations.$inferSelect;

/** Ciò che il cliente può vedere. Mai margini, costi o formula. */
export function toPublicValuation(row: Pick<ValuationRow, "decision" | "maxOfferCents" | "rangeLowCents" | "rangeHighCents" | "disclosedToCustomer" | "kind">): PublicValuation {
  if (!row.disclosedToCustomer || row.kind !== "automatic") return { kind: "manual" };
  if (row.decision === "preliminary_offer" && row.maxOfferCents) return { kind: "offer", amountCents: row.maxOfferCents };
  if (row.decision === "indicative_range" && row.rangeLowCents && row.rangeHighCents) {
    return { kind: "range", lowCents: row.rangeLowCents, highCents: row.rangeHighCents };
  }
  return { kind: "manual" };
}

// ---- Lettura del veicolo di una richiesta -----------------------------------------------------------------------------------
async function loadVehicle(leadId: string): Promise<VehicleInput | null> {
  const db = await getDb();
  const [r] = await db
    .select({
      brand: motorcycles.brand,
      model: motorcycles.model,
      version: motorcycles.version,
      catalogModelId: motorcycles.catalogModelId,
      year: motorcycles.year,
      displacement: motorcycles.displacement,
      mileage: leads.mileage,
      isRunning: leads.isRunning,
      accident: leads.accident,
      mechanicalIssues: leads.mechanicalIssues,
      maintenance: leads.maintenance,
    })
    .from(leads)
    .innerJoin(motorcycles, eq(leads.motorcycleId, motorcycles.id))
    .where(eq(leads.id, leadId));
  if (!r) return null;
  const catalog = r.catalogModelId ? getModel(r.catalogModelId) : undefined;
  return { ...r, family: catalog?.family ?? null };
}

// ---- Calcolo e salvataggio --------------------------------------------------------------------------------------------------
/** Revisione successiva dentro una transazione: la riga della richiesta dev'essere già bloccata da chi chiama. */
async function insertRevisionTx(tx: Tx, leadId: string, build: (revision: number) => typeof valuations.$inferInsert): Promise<ValuationRow> {
  const [last] = await tx
    .select({ r: sql<number>`coalesce(max(${valuations.revision}), 0)::int` })
    .from(valuations)
    .where(eq(valuations.leadId, leadId));
  const [row] = await tx.insert(valuations).values(build((last?.r ?? 0) + 1)).returning();
  return row;
}

async function insertRevision(
  leadId: string,
  build: (revision: number) => typeof valuations.$inferInsert,
): Promise<ValuationRow> {
  const db = await getDb();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      // la riga della richiesta viene bloccata: due revisioni simultanee si accodano e ricevono numeri consecutivi
      return await db.transaction(async (tx) => {
        await tx.select({ id: leads.id }).from(leads).where(eq(leads.id, leadId)).for("update");
        return insertRevisionTx(tx, leadId, build);
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err; // improbabile con il blocco: si riprova col numero successivo
    }
  }
  throw new Error("Impossibile salvare la revisione della valutazione");
}

async function computeFor(leadId: string) {
  const vehicle = await loadVehicle(leadId);
  if (!vehicle) return null;
  const settings = await getApprovedSettings();
  // il fornitore usa il veicolo normalizzato: lo si ricava dal motore con una prima passata senza mercato
  const probe = computeValuation({ vehicle, params: settings?.params ?? null, market: null, now: new Date() });
  const market = probe.input ? await provider().lookup(probe.input) : null;
  const result = computeValuation({ vehicle, params: settings?.params ?? null, market, now: new Date(), allowSimulated: providerOverride !== null && process.env.NODE_ENV === "test" });
  return { result, settingsId: settings?.id ?? null };
}

function rowFromResult(leadId: string, revision: number, result: ValuationResult, settingsId: string | null, by: string | null, disclose: boolean) {
  return {
    leadId,
    revision,
    kind: "automatic" as const,
    status: statusFor(result),
    decision: result.decision,
    reasons: result.reasons,
    confidenceBp: result.confidenceBp,
    inputs: result.input,
    market: result.market,
    resaleCents: result.resaleCents,
    costs: result.costs,
    costTotalCents: result.costTotalCents,
    marginCents: result.marginCents,
    maxOfferCents: result.maxOfferCents,
    rangeLowCents: result.rangeLowCents,
    rangeHighCents: result.rangeHighCents,
    formulaVersion: result.formulaVersion,
    settingsId,
    disclosedToCustomer: disclose && result.decision !== "manual_review",
    createdBy: by,
  };
}

/**
 * Valutazione alla creazione della richiesta. IDEMPOTENTE: un retry restituisce quella già salvata.
 * Non lancia mai eccezioni: un problema del motore non deve impedire il salvataggio né la risposta al cliente
 * (in quel caso il cliente vede «verifica manuale»).
 */
export async function evaluateLeadOnCreate(leadId: string): Promise<PublicValuation> {
  try {
    const db = await getDb();
    const [existing] = await db.select().from(valuations).where(and(eq(valuations.leadId, leadId), eq(valuations.revision, 1)));
    if (existing) return toPublicValuation(existing);
    const calc = await computeFor(leadId);
    if (!calc) return { kind: "manual" };
    const reasons = [...calc.result.reasons];
    const disclose = publicOffersEnabled();
    if (!disclose && calc.result.decision !== "manual_review") reasons.push("public_offers_disabled");
    // la revisione 1 è unica per richiesta: se un'altra richiesta simultanea l'ha già scritta, vale quella
    const inserted = await db
      .insert(valuations)
      .values(rowFromResult(leadId, 1, { ...calc.result, reasons }, calc.settingsId, null, disclose))
      .onConflictDoNothing({ target: [valuations.leadId, valuations.revision] })
      .returning();
    if (inserted[0]) return toPublicValuation(inserted[0]);
    const [first] = await db.select().from(valuations).where(and(eq(valuations.leadId, leadId), eq(valuations.revision, 1)));
    return first ? toPublicValuation(first) : { kind: "manual" };
  } catch (err) {
    logError("valutazione alla creazione", err);
    return { kind: "manual" };
  }
}

/** Ricalcolo richiesto da un amministratore: nuova revisione automatica, lo storico resta. */
export async function recomputeValuation(leadId: string, by: string) {
  const calc = await computeFor(leadId);
  if (!calc) throw new BusinessRuleError("Richiesta non trovata");
  const reasons = [...calc.result.reasons];
  return insertRevision(leadId, (rev) => rowFromResult(leadId, rev, { ...calc.result, reasons }, calc.settingsId, by, false));
}

export async function getCurrentValuation(leadId: string): Promise<ValuationRow | null> {
  const db = await getDb();
  const [row] = await db.select().from(valuations).where(eq(valuations.leadId, leadId)).orderBy(desc(valuations.revision)).limit(1);
  return row ?? null;
}

export async function listValuationRevisions(leadId: string): Promise<ValuationRow[]> {
  const db = await getDb();
  return db.select().from(valuations).where(eq(valuations.leadId, leadId)).orderBy(asc(valuations.revision));
}

// ---- Revisioni amministrative -----------------------------------------------------------------------------------------------
const MIN_REASON = 5;

function carry(prev: ValuationRow, patch: Partial<typeof valuations.$inferInsert>, revision: number, by: string): typeof valuations.$inferInsert {
  return {
    leadId: prev.leadId,
    revision,
    kind: "manual",
    status: prev.status,
    decision: prev.decision,
    reasons: prev.reasons,
    confidenceBp: prev.confidenceBp,
    inputs: prev.inputs,
    market: prev.market,
    resaleCents: prev.resaleCents,
    costs: prev.costs,
    costTotalCents: prev.costTotalCents,
    marginCents: prev.marginCents,
    maxOfferCents: prev.maxOfferCents,
    rangeLowCents: prev.rangeLowCents,
    rangeHighCents: prev.rangeHighCents,
    manualOfferCents: prev.manualOfferCents,
    manualReason: prev.manualReason,
    formulaVersion: prev.formulaVersion,
    settingsId: prev.settingsId,
    disclosedToCustomer: false,
    createdBy: by,
    ...patch,
  };
}

/** Prezzo impostato a mano: nuova revisione «Offerta da confermare». Mai oltre il tetto approvato. */
export async function setManualOffer(leadId: string, amountCents: number, reason: string, by: string, exceedCalculatedMax = false) {
  const reasonText = reason.trim();
  if (reasonText.length < MIN_REASON) throw new BusinessRuleError("Indica il motivo della modifica (almeno 5 caratteri)");
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new BusinessRuleError("Importo non valido");
  if (amountCents % 100 !== 0) throw new BusinessRuleError("Inserisci euro interi");
  const settings = await getApprovedSettings();
  if (!settings) throw new BusinessRuleError("Approva prima i parametri economici (Valutazione → Parametri)");
  if (amountCents > settings.params.offer.maxCents) throw new BusinessRuleError("L'importo supera il tetto massimo configurato");
  const prev = (await getCurrentValuation(leadId)) ?? (await recomputeValuation(leadId, by));
  if (prev.status === "offer_confirmed") throw new BusinessRuleError("L'offerta è già confermata");
  if (prev.maxOfferCents !== null && amountCents > prev.maxOfferCents && !exceedCalculatedMax) {
    throw new BusinessRuleError("L'importo supera l'offerta massima calcolata: conferma esplicitamente per procedere");
  }
  return insertRevision(leadId, (rev) =>
    carry(prev, { status: "offer_to_confirm", manualOfferCents: amountCents, manualReason: reasonText, kind: "manual" }, rev, by),
  );
}

/**
 * Conferma l'offerta in vigore (manuale, o calcolata se è «preliminare generata» ed esiste un importo): crea l'offerta
 * nel flusso già esistente (tabella offers, stato richiesta «Offerta fatta»). NON invia nulla al cliente.
 */
export async function confirmOffer(leadId: string, by: string) {
  const settings = await getApprovedSettings();
  if (!settings) throw new BusinessRuleError("Approva prima i parametri economici");
  const db = await getDb();
  // tutto in UNA transazione con la richiesta bloccata: due conferme simultanee creano una sola offerta
  return db.transaction(async (tx) => {
    const locked = await tx.select({ id: leads.id }).from(leads).where(eq(leads.id, leadId)).for("update");
    if (locked.length === 0) throw new BusinessRuleError("Richiesta non trovata");
    const [cur] = await tx.select().from(valuations).where(eq(valuations.leadId, leadId)).orderBy(desc(valuations.revision)).limit(1);
    if (!cur) throw new BusinessRuleError("Nessuna valutazione da confermare");
    if (cur.status === "offer_confirmed") throw new BusinessRuleError("L'offerta è già confermata");
    let cents: number | null = null;
    if (cur.status === "offer_to_confirm") cents = cur.manualOfferCents;
    else if (cur.status === "preliminary_generated" && cur.decision === "preliminary_offer") cents = cur.maxOfferCents;
    if (!cents || cents <= 0) throw new BusinessRuleError("Non c'è un importo da confermare: imposta un'offerta manuale");
    if (cents % 100 !== 0) throw new BusinessRuleError("L'importo deve essere in euro interi");
    if (cents > settings.params.offer.maxCents) throw new BusinessRuleError("L'importo supera il tetto massimo configurato");
    await addOfferInTx(tx, leadId, cents / 100, by);
    return insertRevisionTx(tx, leadId, (rev) =>
      carry(cur, { status: "offer_confirmed", manualOfferCents: cur.manualOfferCents ?? cents, manualReason: cur.manualReason ?? "Offerta calcolata confermata", kind: "manual" }, rev, by),
    );
  });
}

export async function closeValuation(leadId: string, status: "rejected" | "expired", reason: string, by: string) {
  const text = reason.trim();
  if (text.length < MIN_REASON) throw new BusinessRuleError("Indica il motivo (almeno 5 caratteri)");
  const cur = await getCurrentValuation(leadId);
  if (!cur) throw new BusinessRuleError("Nessuna valutazione");
  return insertRevision(leadId, (rev) =>
    carry(cur, { status, manualReason: cur.manualOfferCents ? cur.manualReason : text, kind: "manual" }, rev, by),
  );
}

// ---- Parametri e dati di mercato (amministrazione) --------------------------------------------------------------------------
export async function listSettings() {
  const db = await getDb();
  return db.select().from(valuationSettings).orderBy(desc(valuationSettings.version));
}

export async function createSettingsDraft(params: unknown, note: string | null, by: string) {
  const parsed = valuationParamsSchema.safeParse(params);
  if (!parsed.success) {
    throw new BusinessRuleError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).slice(0, 3).join("; "));
  }
  const db = await getDb();
  for (let i = 0; i < 5; i++) {
    const [last] = await db.select({ v: sql<number>`coalesce(max(${valuationSettings.version}), 0)::int` }).from(valuationSettings);
    try {
      const [row] = await db
        .insert(valuationSettings)
        .values({ version: (last?.v ?? 0) + 1, status: "draft", params: parsed.data, note: note?.trim() || null, createdBy: by })
        .returning();
      return row;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
  throw new Error("Impossibile creare la bozza");
}

/** Approva una bozza: la precedente approvata passa a «retired». Una versione approvata non si modifica più. */
export async function approveSettings(settingsId: string, by: string) {
  const db = await getDb();
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(valuationSettings).where(eq(valuationSettings.id, settingsId)).for("update");
    if (!row) throw new BusinessRuleError("Versione non trovata");
    if (row.status !== "draft") throw new BusinessRuleError("Si possono approvare solo le bozze");
    if (!valuationParamsSchema.safeParse(row.params).success) throw new BusinessRuleError("I parametri della bozza non sono validi");
    if (row.createdBy === by && process.env.VALUATION_ALLOW_SELF_APPROVAL !== "true") {
      // doppio controllo: chi prepara i parametri non li approva da solo (con un solo amministratore si imposta VALUATION_ALLOW_SELF_APPROVAL=true)
      throw new BusinessRuleError("I parametri devono essere approvati da un altro amministratore");
    }
    await tx.update(valuationSettings).set({ status: "retired" }).where(eq(valuationSettings.status, "approved"));
    await tx.update(valuationSettings).set({ status: "approved", approvedBy: by, approvedAt: sql`now()` }).where(eq(valuationSettings.id, settingsId));
  });
}

export type MarketReferenceInput = {
  brand: string;
  family: string | null;
  yearFrom: number;
  yearTo: number;
  medianCents: number;
  p25Cents: number | null;
  p75Cents: number | null;
  sampleCount: number;
  kind: "sold" | "asking" | "internal" | "manual";
  source: string;
  asOf: Date;
};

export async function addMarketReference(input: MarketReferenceInput, by: string) {
  const i = input;
  if (!i.brand.trim() || i.source.trim().length < 3) throw new BusinessRuleError("Marca e fonte sono obbligatorie");
  if (!(i.medianCents > 0) || i.sampleCount < 1) throw new BusinessRuleError("Mediana e numero di casi devono essere positivi");
  if (i.yearFrom > i.yearTo || i.yearFrom < 1950) throw new BusinessRuleError("Intervallo di anni non valido");
  if (i.p25Cents !== null && i.p75Cents !== null && !(i.p25Cents <= i.medianCents && i.medianCents <= i.p75Cents)) {
    throw new BusinessRuleError("Deve valere 25° percentile ≤ mediana ≤ 75° percentile");
  }
  if (i.asOf.getTime() > Date.now() + 86_400_000) throw new BusinessRuleError("La data di rilevazione è nel futuro");
  const db = await getDb();
  const [row] = await db
    .insert(marketReferences)
    .values({ ...i, brand: i.brand.trim(), family: i.family?.trim() || null, source: i.source.trim().slice(0, 200), createdBy: by })
    .returning();
  return row;
}

export async function listMarketReferences() {
  const db = await getDb();
  return db.select().from(marketReferences).orderBy(desc(marketReferences.asOf)).limit(200);
}
