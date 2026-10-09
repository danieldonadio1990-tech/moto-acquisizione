/**
 * ============================================================================
 *  DATI AZIENDALI — UNICO PUNTO DA MODIFICARE
 * ============================================================================
 * Brand, dati legali, contatti, dominio e fornitori stanno SOLO qui.
 * Nessun altro file contiene questi valori: pagine, informativa, metadati SEO,
 * link WhatsApp e footer li leggono da questo file.
 *
 * I valori che iniziano con "[DA COMPLETARE" sono segnaposto:
 *  - nella pagina /privacy vengono evidenziati in giallo;
 *  - all'avvio in produzione il log elenca quelli ancora mancanti.
 */

export const BRAND = {
  /** Nome provvisorio: sostituire dopo la fase di naming e verifica disponibilità */
  name: "[BRAND]",
  /** Area servita, mostrata nei testi */
  area: "Milano e provincia",
  /** Testo usato in titolo e descrizione per i motori di ricerca e la condivisione */
  tagline: "Vendi la tua moto a Milano",
  description:
    "Hai una moto o uno scooter da vendere a Milano? Raccontaci che moto hai: la valutiamo e, se ci interessa, ti facciamo un'offerta.",
} as const;

export const CONTACTS = {
  /** Formato internazionale, solo cifre, senza "+" (es. 393331234567) */
  whatsapp: "[DA COMPLETARE: numero WhatsApp, es. 393331234567]",
  /** Telefono come va mostrato */
  phone: "[DA COMPLETARE: telefono]",
  email: "[DA COMPLETARE: email di contatto]",
} as const;

export const LEGAL = {
  companyName: "[DA COMPLETARE: ragione sociale]",
  vatNumber: "[DA COMPLETARE: P.IVA]",
  address: "[DA COMPLETARE: indirizzo sede legale]",
  privacyEmail: "[DA COMPLETARE: email per la privacy]",
  pec: "[DA COMPLETARE: PEC, se presente]",
} as const;

export const SITE = {
  /**
   * Dominio di produzione, con https:// e senza "/" finale (es. https://www.nomedominio.it).
   * Usato per URL canonici, sitemap, robots e anteprime social.
   * Finché è un segnaposto si usa l'indirizzo del deploy (Vercel) o localhost.
   */
  domain: "[DA COMPLETARE: https://www.dominio.it]",
} as const;

export const PROVIDERS = {
  hosting: "[DA COMPLETARE: fornitore hosting del sito, es. Vercel]",
  database: "[DA COMPLETARE: fornitore database, es. Neon o Supabase, regione UE]",
  storage: "[DA COMPLETARE: fornitore storage foto, es. Cloudflare R2 (UE) o Supabase Storage]",
} as const;

/**
 * Versione dell'informativa, salvata insieme a ogni consenso.
 * Resta "draft-…" finché il testo e i dati sopra non sono completati e approvati;
 * poi passare a "1.0" (e incrementare a ogni modifica del testo).
 */
export const PRIVACY_POLICY_VERSION = "draft-2";

// ----------------------------------------------------------------------------
// Funzioni di supporto (non contengono dati: non serve modificarle)
// ----------------------------------------------------------------------------

export const isPlaceholder = (v: string) => v.startsWith("[DA COMPLETARE");

export const PRIVACY_POLICY_IS_DRAFT = PRIVACY_POLICY_VERSION.startsWith("draft");

/** Segnaposto ancora presenti (mostrati nel log di avvio in produzione). */
export function missingBusinessData(): string[] {
  const groups = { BRAND, CONTACTS, LEGAL, SITE, PROVIDERS } as Record<string, Record<string, string>>;
  const out: string[] = [];
  for (const [g, obj] of Object.entries(groups)) {
    for (const [k, v] of Object.entries(obj)) if (isPlaceholder(v)) out.push(`${g}.${k}`);
  }
  if (BRAND.name === "[BRAND]") out.push("BRAND.name (nome provvisorio)");
  return out;
}

/** URL pubblico del sito: dominio configurato, altrimenti indirizzo di produzione Vercel, altrimenti locale. */
export function siteUrl(): URL {
  if (!isPlaceholder(SITE.domain)) return new URL(SITE.domain);
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercel) return new URL(`https://${vercel}`);
  return new URL(`http://localhost:${process.env.PORT || 3000}`);
}

/** Link wa.me verso il numero aziendale, oppure verso un numero indicato (es. il cliente, dal backoffice). */
export function whatsappLink(message?: string, toNumber: string = CONTACTS.whatsapp) {
  const digits = toNumber.replace(/\D/g, "");
  const base = digits ? `https://wa.me/${digits}` : "https://wa.me/";
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

export const hasWhatsapp = () => !isPlaceholder(CONTACTS.whatsapp);
