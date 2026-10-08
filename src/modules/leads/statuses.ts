/** Stati del lead, nell'ordine della pipeline di acquisizione. */
export const LEAD_STATUSES = [
  "new",
  "to_contact",
  "contacted",
  "interesting",
  "appointment",
  "offer_made",
  "accepted",
  "purchased",
  "rejected",
  "not_interesting",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "Nuova",
  to_contact: "Da contattare",
  contacted: "Contattato",
  interesting: "Interessante",
  appointment: "Appuntamento",
  offer_made: "Offerta fatta",
  accepted: "Accettata",
  purchased: "Acquistata",
  rejected: "Rifiutata",
  not_interesting: "Non interessante",
};

/** Stati chiusi: il lead è uscito dalla pipeline. */
export const CLOSED_STATUSES: LeadStatus[] = ["purchased", "rejected", "not_interesting"];

export function isLeadStatus(v: unknown): v is LeadStatus {
  return typeof v === "string" && (LEAD_STATUSES as readonly string[]).includes(v);
}
