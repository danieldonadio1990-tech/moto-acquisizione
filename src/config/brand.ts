/**
 * BRAND — tutto ciò che riguarda nome e identità sta qui.
 * Il nome definitivo arriverà dopo la fase di naming: sostituire i valori sotto.
 * Nessun altro file contiene il nome del brand.
 */
export const BRAND = {
  name: "[BRAND]",
  /** Numero WhatsApp in formato internazionale senza "+" né spazi (es. 393331234567) */
  whatsappNumber: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "390000000000",
  email: "info@[brand].it",
  area: "Milano e provincia",
} as const;

/** Dati del titolare del trattamento (informativa privacy). DA COMPILARE. */
export const LEGAL = {
  companyName: "[Ragione sociale]",
  vatNumber: "[P.IVA]",
  address: "[Indirizzo sede legale], Milano",
  privacyEmail: "[email privacy]",
} as const;

/** Incrementare quando cambia il testo dell'informativa: viene salvato con ogni consenso. */
export const PRIVACY_POLICY_VERSION = "2026-10-draft";

/** Link wa.me: di default verso il numero aziendale, oppure verso un numero indicato (es. cliente). */
export function whatsappLink(message?: string, toNumber: string = BRAND.whatsappNumber) {
  const base = `https://wa.me/${toNumber.replace(/\D/g, "")}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
