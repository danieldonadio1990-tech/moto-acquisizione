/**
 * Tipi del motore di valutazione. Il motore è PURO (nessun database, nessuna rete, nessun orologio implicito):
 * stessi input + stessi parametri + stessi dati di mercato = stesso risultato.
 */
export const FORMULA_VERSION = "v1-2026-10";

export type TriState = "yes" | "no" | "unknown";

/** Ciò che il cliente ha dichiarato, già letto dal database (mai dal browser per prezzi o margini). */
export type VehicleInput = {
  brand: string;
  model: string;
  /** famiglia del catalogo (es. "SH" per SH 125/150/350); null se il modello non è nel catalogo */
  family: string | null;
  catalogModelId: string | null;
  version: string | null;
  year: number;
  displacement: number | null;
  mileage: number;
  isRunning: boolean;
  accident: TriState;
  mechanicalIssues: TriState;
  maintenance: TriState;
};

export type NormalizedVehicle = VehicleInput & { ageYears: number };

/** Origine dei dati di prezzo: un prezzo RICHIESTO non è un prezzo di vendita. */
export type MarketSourceKind = "sold" | "asking" | "internal" | "manual";

/** Rilevazione di mercato per un tipo di moto. Tutti gli importi in centesimi. */
export type MarketSnapshot = {
  /** descrizione leggibile della fonte (nome del listino, "vendite interne 2026"…) */
  source: string;
  kind: MarketSourceKind;
  asOf: Date;
  sampleCount: number;
  medianCents: number;
  /** 25° e 75° percentile, se noti */
  p25Cents: number | null;
  p75Cents: number | null;
  /** quanto la rilevazione corrisponde alla moto: modello esatto e anno nella fascia, o solo famiglia */
  match: "exact" | "family";
  /** true solo per le fixture dei test: il motore non le usa mai per offerte reali */
  simulated: boolean;
};

export interface MarketDataProvider {
  lookup(v: NormalizedVehicle): Promise<MarketSnapshot | null>;
}

export type ValuationDecision = "preliminary_offer" | "indicative_range" | "manual_review";

/** Motivi (codici stabili) per cui una valutazione non è automatica o è meno affidabile. */
export type ReasonCode =
  | "no_approved_settings"
  | "invalid_input"
  | "vehicle_not_recognized"
  | "no_market_data"
  | "simulated_data"
  | "market_data_stale"
  | "market_data_asking_only"
  | "few_samples"
  | "wide_dispersion"
  | "condition_requires_review"
  | "unknown_answers"
  | "low_confidence"
  | "margin_insufficient"
  | "offer_below_minimum"
  | "offer_capped"
  | "public_offers_disabled";

export type CostLine = { code: string; label: string; cents: number };

export type ValuationResult = {
  formulaVersion: string;
  decision: ValuationDecision;
  reasons: ReasonCode[];
  /** 0–10000 */
  confidenceBp: number;
  input: NormalizedVehicle | null;
  market: Omit<MarketSnapshot, "asOf"> & { asOf: string } | null;
  resaleCents: number | null;
  costs: CostLine[];
  costTotalCents: number | null;
  marginCents: number | null;
  /** offerta massima sostenibile (dopo costi, margine, arrotondamento e tetti) */
  maxOfferCents: number | null;
  rangeLowCents: number | null;
  rangeHighCents: number | null;
};
