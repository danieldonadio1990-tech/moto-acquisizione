import type { AppraisalParams } from "@/modules/valuation/params";

/**
 * Calcolo della scheda di valutazione: funzione PURA (nessun database, nessuna rete), usata dal server e provata dai test.
 * Importi in centesimi interi.
 *
 * Regole approvate dal titolare (10/11/2026):
 *  - valore dei comparabili e valore di rivendita previsto sono DISTINTI: il primo è il riferimento commerciale per la prima offerta,
 *    il secondo serve solo a verificare la sostenibilità;
 *  - massimo sostenibile = rivendita − margine − preparazione e imprevisti − trasporto − passaggio e altri costi. Un costo non
 *    configurato NON vale zero: il massimo resta «non calcolabile»;
 *  - prima offerta = valore dei comparabili − sconto (nell'intervallo approvato), arrotondata per difetto all'euro; se supera il
 *    massimo sostenibile NON viene forzata: avviso «criteri incompatibili» e nessuna offerta calcolata;
 *  - prima offerta manuale: ammessa solo entro il massimo sostenibile e con motivo;
 *  - prezzo obiettivo: solo manuale; se supera il massimo, avviso non bloccante con il margine previsto.
 * Nessun valore è inventato o dedotto senza una di queste regole.
 */

export type ComparableStats = { count: number; minCents: number; maxCents: number; medianCents: number; p25Cents: number | null; p75Cents: number | null };

/** Statistiche dei prezzi degli annunci INCLUSI (prezzi richiesti, non di vendita). null se non ce ne sono. */
export function comparableStats(pricesCents: number[]): ComparableStats | null {
  const v = pricesCents.filter((p) => Number.isSafeInteger(p) && p > 0).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const at = (q: number) => {
    // interpolazione lineare tra i due valori vicini, arrotondata per difetto (prudente)
    const pos = (v.length - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return Math.floor(v[lo] + (v[hi] - v[lo]) * (pos - lo));
  };
  return {
    count: v.length,
    minCents: v[0],
    maxCents: v[v.length - 1],
    medianCents: at(0.5),
    p25Cents: v.length >= 4 ? at(0.25) : null,
    p75Cents: v.length >= 4 ? at(0.75) : null,
  };
}

export const COST_LABELS = {
  marginCents: "Margine lordo obiettivo",
  preparationContingencyCents: "Fondo preparazione e imprevisti",
  transportCents: "Trasporto",
  transferAndOtherCents: "Passaggio di proprietà e altri costi",
} as const;
type CostKey = keyof typeof COST_LABELS;
const COST_KEYS = Object.keys(COST_LABELS) as CostKey[];

export type WarningCode =
  | "few_comparables"
  | "asking_prices"
  | "comparables_value_missing"
  | "resale_value_missing"
  | "settings_missing"
  | "costs_not_configured"
  | "discount_range_not_configured"
  | "discount_missing"
  | "discount_out_of_range"
  | "max_not_available"
  | "max_not_positive"
  | "criteria_incompatible"
  | "target_above_max";

export type Warning = { code: WarningCode; message: string };

export type AppraisalInput = {
  /** parametri della scheda dalla versione APPROVATA (null = nessuna versione approvata o blocco assente) */
  params: AppraisalParams | null;
  /** prezzi degli annunci inclusi */
  includedPricesCents: number[];
  comparablesValueCents: number | null;
  resaleValueCents: number | null;
  discountCents: number | null;
  /** prima offerta manuale (facoltativa): ammessa solo entro il massimo sostenibile */
  manualFirstOfferCents: number | null;
  targetPriceCents: number | null;
};

export type AppraisalResult = {
  stats: ComparableStats | null;
  /** costi usati (solo se tutti configurati) e totale dei costi esclusa la quota di margine */
  costs: Record<CostKey, number> | null;
  costsMissing: CostKey[];
  maxSustainableCents: number | null;
  /** prima offerta calcolata dalla regola (anche se poi risulta incompatibile, per mostrare lo scarto) */
  proposedFirstOfferCents: number | null;
  /** prima offerta VALIDA da salvare: calcolata e compatibile, oppure manuale entro il massimo; altrimenti null */
  firstOfferCents: number | null;
  firstOfferKind: "calculated" | "manual" | null;
  /** scarto della prima offerta calcolata oltre il massimo (criteri incompatibili) */
  incompatibilityGapCents: number | null;
  /** margine previsto a quel prezzo d'acquisto: rivendita − prezzo − costi (esclusa la quota di margine) */
  marginAtFirstOfferCents: number | null;
  marginAtTargetCents: number | null;
  warnings: Warning[];
  /** errori bloccanti: la revisione non si può salvare finché non sono risolti */
  errors: string[];
};

const eur = (c: number) => `${(c / 100).toLocaleString("it-IT", { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })} €`;
const floorEuro = (c: number) => Math.floor(c / 100) * 100;

export function computeAppraisal(input: AppraisalInput): AppraisalResult {
  const warnings: Warning[] = [];
  const errors: string[] = [];
  const w = (code: WarningCode, message: string) => warnings.push({ code, message });
  const p = input.params;

  // --- comparabili ---------------------------------------------------------------------------------------------------------
  const stats = comparableStats(input.includedPricesCents);
  if (stats) w("asking_prices", "I comparabili sono prezzi RICHIESTI negli annunci, non prezzi di vendita.");
  if (!stats || stats.count < 3) w("few_comparables", `Comparabili inclusi: ${stats?.count ?? 0}. Con meno di 3 il riferimento è debole.`);
  if (input.comparablesValueCents === null) w("comparables_value_missing", "Valore dei comparabili non inserito: la prima offerta non si calcola.");
  if (input.resaleValueCents === null) w("resale_value_missing", "Valore di rivendita previsto non inserito: il massimo sostenibile non si calcola.");

  // --- costi e massimo sostenibile -------------------------------------------------------------------------------------------
  if (!p) w("settings_missing", "Parametri della scheda non configurati in una versione approvata (Back office → Valutazione).");
  const costsMissing = p ? COST_KEYS.filter((k) => p[k] === null) : [...COST_KEYS];
  if (p && costsMissing.length) {
    w("costs_not_configured", `Costi non configurati (non valgono zero): ${costsMissing.map((k) => COST_LABELS[k]).join(", ")}. Il massimo sostenibile non si calcola.`);
  }
  const costs = p && costsMissing.length === 0 ? (Object.fromEntries(COST_KEYS.map((k) => [k, p[k] as number])) as Record<CostKey, number>) : null;
  const costsExMargin = costs ? costs.preparationContingencyCents + costs.transportCents + costs.transferAndOtherCents : null;
  const maxSustainableCents =
    costs && input.resaleValueCents !== null ? floorEuro(input.resaleValueCents - costs.marginCents - (costsExMargin as number)) : null;
  if (maxSustainableCents === null) w("max_not_available", "Massimo sostenibile non calcolabile: nessuna prima offerta può essere salvata come valida.");
  else if (maxSustainableCents <= 0) {
    w("max_not_positive", `Con questo valore di rivendita i costi e il margine non sono coperti (massimo sostenibile ${eur(maxSustainableCents)}): nessuna offerta è sostenibile.`);
  }

  // --- prima offerta calcolata -----------------------------------------------------------------------------------------------
  let proposedFirstOfferCents: number | null = null;
  const lo = p?.firstOfferDiscountMinCents ?? null;
  const hi = p?.firstOfferDiscountMaxCents ?? null;
  if (p && (lo === null || hi === null)) w("discount_range_not_configured", "Intervallo dello sconto della prima offerta non configurato.");
  if (input.comparablesValueCents !== null && lo !== null && hi !== null) {
    if (input.discountCents === null) w("discount_missing", `Scegli lo sconto della prima offerta (tra ${eur(lo)} e ${eur(hi)}).`);
    else if (input.discountCents < lo || input.discountCents > hi) {
      w("discount_out_of_range", `Sconto ${eur(input.discountCents)} fuori dall'intervallo approvato (${eur(lo)}–${eur(hi)}).`);
      errors.push(`Lo sconto deve stare tra ${eur(lo)} e ${eur(hi)}.`);
    } else proposedFirstOfferCents = floorEuro(input.comparablesValueCents - input.discountCents);
  }

  let firstOfferCents: number | null = null;
  let firstOfferKind: AppraisalResult["firstOfferKind"] = null;
  let incompatibilityGapCents: number | null = null;
  if (proposedFirstOfferCents !== null && maxSustainableCents !== null) {
    if (proposedFirstOfferCents > maxSustainableCents) {
      incompatibilityGapCents = proposedFirstOfferCents - maxSustainableCents;
      w(
        "criteria_incompatible",
        `Criteri incompatibili: la prima offerta calcolata (${eur(proposedFirstOfferCents)}) supera il massimo sostenibile ` +
          `(${eur(maxSustainableCents)}) di ${eur(incompatibilityGapCents)}. Nessuna offerta calcolata: puoi inserirne una manuale entro il massimo, con motivo.`,
      );
    } else {
      firstOfferCents = proposedFirstOfferCents;
      firstOfferKind = "calculated";
    }
  }

  // --- prima offerta manuale -------------------------------------------------------------------------------------------------
  if (input.manualFirstOfferCents !== null) {
    if (input.manualFirstOfferCents <= 0) errors.push("La prima offerta manuale deve essere maggiore di zero.");
    else if (maxSustainableCents === null) errors.push("Prima offerta manuale non salvabile: il massimo sostenibile non è calcolabile.");
    else if (input.manualFirstOfferCents > maxSustainableCents) {
      errors.push(`La prima offerta manuale (${eur(input.manualFirstOfferCents)}) supera il massimo sostenibile (${eur(maxSustainableCents)}).`);
    } else {
      firstOfferCents = input.manualFirstOfferCents;
      firstOfferKind = "manual";
    }
  }

  // --- margini e prezzo obiettivo --------------------------------------------------------------------------------------------
  const marginAt = (price: number | null) =>
    price !== null && costsExMargin !== null && input.resaleValueCents !== null ? input.resaleValueCents - price - costsExMargin : null;
  const marginAtFirstOfferCents = marginAt(firstOfferCents);
  const marginAtTargetCents = marginAt(input.targetPriceCents);
  if (input.targetPriceCents !== null && maxSustainableCents !== null && input.targetPriceCents > maxSustainableCents) {
    w(
      "target_above_max",
      `Il prezzo obiettivo (${eur(input.targetPriceCents)}) supera il massimo sostenibile (${eur(maxSustainableCents)}): ` +
        `margine previsto ${marginAtTargetCents === null ? "non calcolabile" : eur(marginAtTargetCents)} invece di ${eur(costs!.marginCents)}.`,
    );
  }

  return {
    stats,
    costs,
    costsMissing,
    maxSustainableCents,
    proposedFirstOfferCents,
    firstOfferCents,
    firstOfferKind,
    incompatibilityGapCents,
    marginAtFirstOfferCents,
    marginAtTargetCents,
    warnings,
    errors,
  };
}
