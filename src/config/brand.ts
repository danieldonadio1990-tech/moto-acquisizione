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

/**
 * Dati del titolare del trattamento e dei fornitori (informativa privacy).
 * I valori tra [parentesi quadre] sono SEGNAPOSTO da completare prima della pubblicazione:
 * nella pagina /privacy vengono evidenziati in giallo.
 */
export const LEGAL = {
  companyName: "[DA COMPLETARE: ragione sociale]",
  vatNumber: "[DA COMPLETARE: P.IVA]",
  address: "[DA COMPLETARE: indirizzo sede legale]",
  privacyEmail: "[DA COMPLETARE: email per la privacy]",
  pec: "[DA COMPLETARE: PEC, se presente]",
} as const;

export const PROVIDERS = {
  hosting: "[DA COMPLETARE: fornitore hosting del sito, es. Vercel]",
  database: "[DA COMPLETARE: fornitore database, es. Supabase o Neon, regione UE]",
  storage: "[DA COMPLETARE: fornitore storage foto, es. Cloudflare R2 o Supabase Storage]",
} as const;

/**
 * Versione dell'informativa, salvata insieme a ogni consenso.
 * Resta "draft-…" finché il testo non è approvato; poi passare a "1.0" (e incrementare a ogni modifica).
 * Il testo di ogni versione resta recuperabile dalla cronologia git di src/app/privacy/page.tsx.
 */
export const PRIVACY_POLICY_VERSION = "draft-2";
export const PRIVACY_POLICY_IS_DRAFT = PRIVACY_POLICY_VERSION.startsWith("draft");

/** Link wa.me: di default verso il numero aziendale, oppure verso un numero indicato (es. cliente). */
export function whatsappLink(message?: string, toNumber: string = BRAND.whatsappNumber) {
  const base = `https://wa.me/${toNumber.replace(/\D/g, "")}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
