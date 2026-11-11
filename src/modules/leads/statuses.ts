/**
 * Stati della richiesta.
 *
 * LEAD_STATUSES contiene TUTTI i valori ammessi dal database (enum `lead_status`), compresi quelli storici: le richieste già
 * esistenti restano leggibili. SELECTABLE_STATUSES è il flusso di lavoro attuale (scheda di valutazione, migrazione 0008), nell'ordine
 * in cui si percorre; gli stati storici non si possono più scegliere ma si mostrano con l'indicazione «storico».
 */
export const LEAD_STATUSES = [
  "new",
  "to_evaluate",
  "evaluated",
  "offer_prepared",
  "to_contact",
  "contacted",
  "interesting",
  "appointment",
  "offer_made",
  "awaiting_response",
  "accepted",
  "purchased",
  "rejected",
  "not_interesting",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Flusso di lavoro attuale, nell'ordine della pipeline. */
export const SELECTABLE_STATUSES = [
  "new",
  "to_evaluate",
  "evaluated",
  "offer_prepared",
  "offer_made",
  "awaiting_response",
  "accepted",
  "appointment",
  "purchased",
  "rejected",
] as const satisfies readonly LeadStatus[];

/** Stati del flusso precedente: leggibili sulle richieste esistenti, non più selezionabili. */
export const LEGACY_STATUSES = ["to_contact", "contacted", "interesting", "not_interesting"] as const satisfies readonly LeadStatus[];

export const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "Nuova richiesta",
  to_evaluate: "Da valutare",
  evaluated: "Valutata",
  offer_prepared: "Offerta preparata",
  offer_made: "Offerta inviata",
  awaiting_response: "In attesa di risposta",
  // l'accettazione dell'offerta porta qui: la valutazione dal vivo NON risulta fissata finché un admin non lo indica
  accepted: "Offerta accettata – valutazione da fissare",
  appointment: "Valutazione dal vivo fissata",
  purchased: "Acquistata",
  rejected: "Non interessato / rifiutata",
  to_contact: "Da contattare (storico)",
  contacted: "Contattato (storico)",
  interesting: "Interessante (storico)",
  not_interesting: "Non interessante (storico)",
};

/** Stati chiusi: il lead è uscito dalla pipeline. */
export const CLOSED_STATUSES: LeadStatus[] = ["purchased", "rejected", "not_interesting"];

export function isLeadStatus(v: unknown): v is LeadStatus {
  return typeof v === "string" && (LEAD_STATUSES as readonly string[]).includes(v);
}

export function isSelectableStatus(v: unknown): v is (typeof SELECTABLE_STATUSES)[number] {
  return typeof v === "string" && (SELECTABLE_STATUSES as readonly string[]).includes(v);
}

export const isLegacyStatus = (v: LeadStatus) => (LEGACY_STATUSES as readonly string[]).includes(v);
