import type { ValuationStatus } from "@/db/schema";
import type { ReasonCode } from "./types";

export const VALUATION_STATUS_LABELS: Record<ValuationStatus, string> = {
  to_evaluate: "Da valutare",
  insufficient_data: "Dati insufficienti",
  preliminary_generated: "Valutazione preliminare generata",
  manual_review: "Verifica manuale richiesta",
  offer_to_confirm: "Offerta da confermare",
  offer_confirmed: "Offerta confermata",
  rejected: "Rifiutata",
  expired: "Scaduta",
};

export const REASON_LABELS: Record<ReasonCode, string> = {
  no_approved_settings: "Nessun parametro economico approvato",
  invalid_input: "Dati della moto incoerenti o fuori intervallo",
  vehicle_not_recognized: "Modello non presente nel catalogo",
  no_market_data: "Nessun dato di mercato per questa moto",
  simulated_data: "Dati di mercato simulati: non utilizzabili",
  market_data_stale: "Dati di mercato troppo vecchi",
  market_data_asking_only: "Solo prezzi richiesti (annunci), non di vendita",
  few_samples: "Pochi casi nella rilevazione",
  wide_dispersion: "Prezzi molto dispersi",
  condition_requires_review: "Condizioni dichiarate che richiedono verifica (incidente, non funzionante, problemi meccanici)",
  unknown_answers: "Alcune risposte del cliente sono «non so»",
  low_confidence: "Affidabilità sotto la soglia minima",
  margin_insufficient: "Margine insufficiente: costi e margine superano il valore",
  offer_below_minimum: "Offerta calcolata sotto il minimo configurato",
  offer_capped: "Offerta limitata dal tetto massimo",
  public_offers_disabled: "Importo non mostrato al cliente (interruttore spento)",
};

export const MARKET_KIND_LABELS = { sold: "prezzi di vendita", asking: "prezzi richiesti", internal: "vendite interne", manual: "stima manuale" } as const;
