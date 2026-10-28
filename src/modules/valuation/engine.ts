import { BP, floorToStep, mulBpCeil, mulBpFloor } from "./money";
import type { ValuationParams } from "./params";
import {
  FORMULA_VERSION,
  type CostLine,
  type MarketSnapshot,
  type NormalizedVehicle,
  type ReasonCode,
  type ValuationResult,
  type VehicleInput,
} from "./types";

/**
 * Motore di valutazione: funzione PURA e deterministica.
 *
 *   Offerta massima = valore di rivendita prudente − costi totali − margine obiettivo
 *
 * Fasi (ognuna una funzione piccola, testabile da sola):
 *   1 normalizzazione e validazione degli input   2 riconoscimento del veicolo   3 dati di mercato (passati dal chiamante)
 *   4 stima prudente del valore di rivendita      5 costi                       6 margine
 *   7 offerta massima                              8 affidabilità                9 decisione
 * Non esegue mai accessi a database o rete e non legge l'orologio: `now` arriva dal chiamante.
 * Se mancano parametri approvati o dati di mercato affidabili NON produce nessun importo.
 */

const CURRENT_YEAR_SLACK = 1; // modelli dell'anno successivo già in vendita

// ---- 1. Normalizzazione ---------------------------------------------------------------------------------------------
export function normalizeVehicle(v: VehicleInput, now: Date): NormalizedVehicle | null {
  const year = Math.trunc(v.year);
  const mileage = Math.trunc(v.mileage);
  const thisYear = now.getUTCFullYear();
  if (!Number.isFinite(year) || year < 1950 || year > thisYear + CURRENT_YEAR_SLACK) return null;
  if (!Number.isFinite(mileage) || mileage < 0 || mileage > 400_000) return null;
  if (v.displacement !== null && (!Number.isInteger(v.displacement) || v.displacement < 20 || v.displacement > 3000)) return null;
  if (!v.brand.trim() || !v.model.trim()) return null;
  const age = Math.max(0, thisYear - year);
  // incoerenza evidente: moto di 1 anno con più di 150.000 km, o chilometri medi oltre 60.000 l'anno
  if (mileage > 60_000 * Math.max(1, age)) return null;
  return { ...v, brand: v.brand.trim(), model: v.model.trim(), year, mileage, ageYears: age };
}

// ---- 2. Riconoscimento ----------------------------------------------------------------------------------------------
export const isRecognized = (v: NormalizedVehicle) => v.catalogModelId !== null && v.family !== null;

// ---- 4. Valore di rivendita prudente ---------------------------------------------------------------------------------
export function estimateResale(m: MarketSnapshot, v: NormalizedVehicle, p: ValuationParams): number {
  const { basis, haircutBp } = p.resale;
  let base = m.medianCents;
  if (basis === "p25" && m.p25Cents !== null) base = m.p25Cents;
  if (basis === "lower_of_median_p25" && m.p25Cents !== null) base = Math.min(m.medianCents, m.p25Cents);
  const adj = p.conditionAdjustmentsBp;
  let reductionBp = haircutBp;
  if (!v.isRunning) reductionBp += adj.notRunning;
  if (v.accident === "yes") reductionBp += adj.accident;
  if (v.mechanicalIssues === "yes") reductionBp += adj.mechanicalIssues;
  if (v.maintenance === "no") reductionBp += adj.noRegularMaintenance;
  reductionBp = Math.min(reductionBp, BP);
  return mulBpFloor(base, BP - reductionBp);
}

// ---- 5. Costi ---------------------------------------------------------------------------------------------------------
export function estimateCosts(resale: number, p: ValuationParams): { lines: CostLine[]; total: number } {
  const c = p.costs;
  const lines: CostLine[] = [
    { code: "transport", label: "Trasporto", cents: c.transportCents },
    { code: "inspection", label: "Controlli e ispezioni", cents: c.inspectionCents },
    { code: "preparation", label: "Preparazione e riparazioni", cents: c.preparationCents },
    { code: "admin", label: "Pratiche amministrative", cents: c.adminCents },
    { code: "warranty", label: "Garanzia", cents: c.warrantyCents },
    { code: "other", label: "Altri costi", cents: c.otherCents },
    { code: "selling", label: "Costi commerciali di vendita", cents: mulBpCeil(resale, c.sellingPctBp) },
    { code: "contingency", label: "Riserva per imprevisti", cents: mulBpCeil(resale, c.contingencyPctBp) },
    { code: "taxes", label: "Imposte e oneri", cents: mulBpCeil(resale, c.taxesPctBp) },
  ];
  return { lines, total: lines.reduce((s, l) => s + l.cents, 0) };
}

// ---- 6. Margine -------------------------------------------------------------------------------------------------------
export const estimateMargin = (resale: number, p: ValuationParams) =>
  Math.max(p.margin.targetCents, mulBpCeil(resale, p.margin.minPctBp));

// ---- 8. Affidabilità --------------------------------------------------------------------------------------------------
export function assessConfidence(
  m: MarketSnapshot,
  v: NormalizedVehicle,
  p: ValuationParams,
  now: Date,
): { confidenceBp: number; reasons: ReasonCode[]; stale: boolean } {
  const k = p.confidence;
  const reasons: ReasonCode[] = [];
  let conf = BP;
  const scale = (num: number, den: number) => {
    conf = Math.floor((conf * num) / den);
  };

  if (m.sampleCount < k.minSamples) {
    scale(Math.max(m.sampleCount, 0), k.minSamples);
    reasons.push("few_samples");
  }
  if (m.p25Cents !== null && m.p75Cents !== null && m.medianCents > 0) {
    const dispersion = Math.floor(((m.p75Cents - m.p25Cents) * BP) / m.medianCents);
    if (dispersion > k.maxDispersionBp) {
      scale(k.maxDispersionBp, dispersion);
      reasons.push("wide_dispersion");
    }
  }
  if (m.kind === "asking") {
    scale(BP - k.penaltyAskingPriceBp, BP);
    reasons.push("market_data_asking_only");
  }
  if (m.match === "family") scale(BP - k.penaltyFamilyMatchBp, BP);
  const unknowns = [v.accident, v.mechanicalIssues, v.maintenance].filter((x) => x === "unknown").length;
  if (unknowns > 0) {
    scale(Math.max(0, BP - k.penaltyUnknownAnswerBp * unknowns), BP);
    reasons.push("unknown_answers");
  }
  const ageDays = (now.getTime() - m.asOf.getTime()) / 86_400_000;
  const stale = ageDays > k.maxMarketAgeDays || ageDays < -1;
  if (stale) reasons.push("market_data_stale");
  return { confidenceBp: Math.max(0, Math.min(BP, conf)), reasons, stale };
}

// ---- Orchestrazione ---------------------------------------------------------------------------------------------------
export type ComputeArgs = {
  vehicle: VehicleInput;
  /** parametri APPROVATI; null = nessuna configurazione approvata */
  params: ValuationParams | null;
  market: MarketSnapshot | null;
  now: Date;
  /** solo per i test: accetta dati di mercato marcati come simulati */
  allowSimulated?: boolean;
};

const empty = (
  decision: ValuationResult["decision"],
  reasons: ReasonCode[],
  extra: Partial<ValuationResult> = {},
): ValuationResult => ({
  formulaVersion: FORMULA_VERSION,
  decision,
  reasons,
  confidenceBp: 0,
  input: null,
  market: null,
  resaleCents: null,
  costs: [],
  costTotalCents: null,
  marginCents: null,
  maxOfferCents: null,
  rangeLowCents: null,
  rangeHighCents: null,
  ...extra,
});

export function computeValuation({ vehicle, params, market, now, allowSimulated = false }: ComputeArgs): ValuationResult {
  const v = normalizeVehicle(vehicle, now);
  if (!v) return empty("manual_review", ["invalid_input"]);
  if (!isRecognized(v)) return empty("manual_review", ["vehicle_not_recognized"], { input: v });
  if (!params) return empty("manual_review", ["no_approved_settings"], { input: v });
  if (!market) return empty("manual_review", ["no_market_data"], { input: v });
  if (market.simulated && !allowSimulated) return empty("manual_review", ["simulated_data"], { input: v });
  if (!(market.medianCents > 0) || !Number.isSafeInteger(market.medianCents)) {
    return empty("manual_review", ["no_market_data"], { input: v });
  }

  const marketView = { ...market, asOf: market.asOf.toISOString() };
  const hard: ReasonCode[] = [];
  if (params.review.manualIfAccident && v.accident === "yes") hard.push("condition_requires_review");
  if (params.review.manualIfNotRunning && !v.isRunning) hard.push("condition_requires_review");
  if (params.review.manualIfMechanicalIssues && v.mechanicalIssues === "yes") hard.push("condition_requires_review");

  const conf = assessConfidence(market, v, params, now);
  const resale = estimateResale(market, v, params);
  const { lines, total } = estimateCosts(resale, params);
  const margin = estimateMargin(resale, params);

  const base: Partial<ValuationResult> = {
    input: v,
    market: marketView,
    resaleCents: resale,
    costs: lines,
    costTotalCents: total,
    marginCents: margin,
    confidenceBp: conf.confidenceBp,
  };
  const reasons = Array.from(new Set<ReasonCode>([...hard, ...conf.reasons]));

  if (conf.stale || hard.length > 0) return empty("manual_review", reasons, base);

  const raw = resale - total - margin;
  if (raw <= 0) return empty("manual_review", [...reasons, "margin_insufficient"], base);

  let maxOffer = floorToStep(raw, params.offer.roundingStepCents);
  if (maxOffer > params.offer.maxCents) {
    maxOffer = floorToStep(params.offer.maxCents, params.offer.roundingStepCents);
    reasons.push("offer_capped");
  }
  if (maxOffer <= 0 || maxOffer < params.offer.minCents) {
    return empty("manual_review", [...reasons, "offer_below_minimum"], base);
  }

  // coerenza finale: l'offerta non può mai far scendere il margine sotto l'obiettivo
  if (resale - total - maxOffer < margin) return empty("manual_review", [...reasons, "margin_insufficient"], base);

  const withOffer: Partial<ValuationResult> = { ...base, maxOfferCents: maxOffer };
  if (conf.confidenceBp >= params.confidence.minOfferBp) {
    return empty("preliminary_offer", reasons, { ...withOffer, rangeLowCents: null, rangeHighCents: null });
  }
  if (conf.confidenceBp >= params.confidence.minRangeBp) {
    const low = Math.max(params.offer.minCents, floorToStep(mulBpFloor(maxOffer, BP - params.range.lowerBp), params.offer.roundingStepCents));
    return empty("indicative_range", reasons, { ...withOffer, rangeLowCents: low, rangeHighCents: maxOffer });
  }
  return empty("manual_review", [...reasons, "low_confidence"], withOffer);
}
