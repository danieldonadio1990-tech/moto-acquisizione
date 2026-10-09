/**
 * Eventi statistici first-party (tabella `events`), senza cookie e senza terze parti.
 *
 * Funnel:
 *   landing_view → valuation_start → step_completed (Moto, Km, Condizioni) → contact_submitted
 *   → photos_uploaded | photos_skipped        (+ lead_created, registrato dal server)
 * Altro: cta_click, whatsapp_click.
 *
 * Ogni evento del browser porta con sé source/medium/campaign (UTM della visita), così si
 * misura il funnel per campagna. Privacy: gli eventi del browser hanno solo un id di sessione
 * anonimo e NON sono mai collegati al lead; "lead_created" ha il lead ma nessuna sessione.
 * Lo stato successivo del lead (contattato, appuntamento, offerta, acquisto) si legge da
 * lead_status_history, offers e leads: non va duplicato qui.
 */
export const CLIENT_EVENTS = [
  "landing_view",
  "cta_click",
  "valuation_start",
  "step_completed",
  "contact_submitted",
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
