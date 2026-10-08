/**
 * Eventi di funnel tracciati in modo first-party (tabella `events`).
 * Gli eventi del ciclo di vita del lead (contattato, appuntamento, offerta, acquisto)
 * si ricavano da lead_status_history e offers: non vanno duplicati qui.
 */
export const CLIENT_EVENTS = [
  "landing_view",
  "cta_click",
  "funnel_start",
  "funnel_step_completed",
  "photos_uploaded",
  "photos_skipped",
  "whatsapp_click",
] as const;

export const SERVER_EVENTS = ["lead_created"] as const;

export type ClientEventName = (typeof CLIENT_EVENTS)[number];
export type EventName = ClientEventName | (typeof SERVER_EVENTS)[number];

export function isClientEvent(v: unknown): v is ClientEventName {
  return typeof v === "string" && (CLIENT_EVENTS as readonly string[]).includes(v);
}
