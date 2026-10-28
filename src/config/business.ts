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
  /**
   * Nome commerciale scelto. NON è ancora stata verificata la disponibilità legale del nome (marchio) né del dominio:
   * farlo prima di investire in comunicazione.
   */
  name: "Compriamo Moto",
  /** Area servita, mostrata nei testi */
  area: "Milano e provincia",
  /** Testo usato in titolo e descrizione per i motori di ricerca e la condivisione */
  tagline: "Valuta la tua moto in pochi passaggi",
  description:
    "Vendi la tua moto a Milano: la compriamo direttamente da te, ti guidiamo in una procedura chiara e, dopo la vendita, della rivendita non devi occuparti tu.",
} as const;

export const CONTACTS = {
  /** Formato internazionale, solo cifre, senza "+" (es. 393331234567) */
  whatsapp: "[DA COMPLETARE: numero WhatsApp, es. 393331234567]",
  /**
   * Telefono come va mostrato (es. "02 1234 5678" o "+39 333 123 4567"). Il link "tel:" si ricava dalle cifre: senza
   * prefisso internazionale si assume l'Italia (+39). Può essere diverso dal numero WhatsApp.
   */
  phone: "[DA COMPLETARE: telefono]",
  email: "[DA COMPLETARE: email di contatto]",
} as const;

/**
 * Dati del titolare, forniti e confermati dal titolare. Impresa individuale: non ha una ragione sociale né una denominazione
 * commerciale diversa dal nome del titolare (non inventarne una).
 */
export const LEGAL = {
  /** nome con cui l'impresa compare in pagina (piè di pagina) */
  companyName: "Donadio Luca (impresa individuale)",
  holderName: "Donadio Luca",
  legalForm: "impresa individuale",
  activity: "commercio al dettaglio online di motocicli e ciclomotori per corrispondenza",
  vatNumber: "13723400969",
  address: "Via F.lli Bronzetti 8, 20129 Milano (MI)",
  privacyEmail: "compriamo.moto.support@gmail.com",
  pec: "lucadonadio4@pec.it",
} as const;

export const SITE = {
  /**
   * Dominio di produzione, con https:// e senza "/" finale (es. https://www.nomedominio.it).
   * Usato per URL canonici, sitemap, robots e anteprime social.
   * Finché è un segnaposto si usa l'indirizzo del deploy (Netlify/Vercel) o localhost.
   */
  domain: "[DA COMPLETARE: https://www.dominio.it]",
} as const;

/**
 * Servizi che trattano i dati. Solo i nomi dei fornitori: nessuna località né garanzia è dichiarata se non è verificata.
 *  - hosting: Netlify (configurazione del progetto);  database: Neon, regione AWS eu-central-1 (dal nome dell'indirizzo del database);
 *  - archivio foto: Supabase (indicato dal titolare);  notifiche interne: Resend (codice richiesta e dati della moto, non i contatti);
 *  - posta e gestione delle richieste: Gmail (indicato dal titolare).
 */
export const PROVIDERS = {
  hosting: "Netlify",
  database: "Neon",
  databaseRegion: "regione AWS eu-central-1 (Francoforte)",
  storage: "Supabase",
  notifications: "Resend",
  mail: "Gmail (Google)",
} as const;

/**
 * Versione dell'informativa, salvata insieme alla presa visione dell'utente.
 * Resta "draft-…" finché il testo e i dati sopra non sono completati e approvati;
 * poi passare a "1.0" (e incrementare a ogni modifica del testo).
 */
export const PRIVACY_POLICY_VERSION = "draft-4";

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
  if (BRAND.name.startsWith("[")) out.push("BRAND.name (nome provvisorio)");
  if (!hasWhatsapp()) out.push("CONTACTS.whatsapp (finché manca, il pulsante WhatsApp è nascosto)");
  if (!hasPhone()) out.push("CONTACTS.phone (finché manca, il pulsante Chiama è nascosto)");
  return out;
}

/**
 * URL pubblico del sito: dominio configurato, altrimenti indirizzo del sito su Netlify, altrimenti Vercel, altrimenti locale.
 * Su Netlify la variabile URL esiste durante il build ma NON è tra quelle disponibili nelle funzioni a runtime
 * (lì ci sono solo SITE_NAME e SITE_ID): per i link generati a runtime (es. email di notifica) si ricava
 * l'indirizzo predefinito <SITE_NAME>.netlify.app. Un dominio proprio va indicato in SITE.domain.
 */
export function siteUrl(): URL {
  if (!isPlaceholder(SITE.domain)) return new URL(SITE.domain);
  const netlify = process.env.URL;
  if (netlify && /^https:\/\//.test(netlify)) return new URL(netlify);
  const netlifyName = process.env.SITE_NAME;
  if (netlifyName && /^[a-z0-9-]{1,63}$/i.test(netlifyName)) return new URL(`https://${netlifyName.toLowerCase()}.netlify.app`);
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercel) return new URL(`https://${vercel}`);
  return new URL(`http://localhost:${process.env.PORT || 3000}`);
}

/** Un numero WhatsApp valido: solo cifre in formato internazionale, senza "+" (es. 393331234567). */
const WHATSAPP_DIGITS = /^\d{8,15}$/;

/** Vero solo se il numero aziendale è stato configurato davvero (mai per un segnaposto). */
export const hasWhatsapp = () => !isPlaceholder(CONTACTS.whatsapp) && WHATSAPP_DIGITS.test(CONTACTS.whatsapp.trim());

/**
 * Link wa.me verso il numero aziendale, oppure verso un numero indicato (es. il cliente, dal backoffice).
 * Restituisce null se non c'è un numero valido: in particolare NON genera mai un link dalle cifre di un segnaposto.
 */
export function whatsappLink(message?: string, toNumber?: string): string | null {
  let digits: string;
  if (toNumber === undefined) {
    if (!hasWhatsapp()) return null;
    digits = CONTACTS.whatsapp.trim();
  } else {
    if (isPlaceholder(toNumber)) return null;
    digits = toNumber.replace(/\D/g, "");
    if (!WHATSAPP_DIGITS.test(digits)) return null;
  }
  const base = `https://wa.me/${digits}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

/** Primo messaggio precompilato nella conversazione WhatsApp dal sito. */
export const WHATSAPP_MESSAGE = "Ciao, vorrei informazioni per vendere la mia moto";

/**
 * Link "tel:" in formato internazionale ricavato dal numero indicato (mostrato così com'è). Restituisce null se il numero
 * è un segnaposto o non è valido: in quel caso il pulsante "Chiama" non deve comparire.
 */
export function phoneTelHref(raw: string): string | null {
  const v = raw.trim();
  if (isPlaceholder(v) || !/^\+?[\d\s().\-/]{6,24}$/.test(v)) return null;
  let digits = v.replace(/\D/g, "");
  if (v.startsWith("+")) {
    /* già internazionale */
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2);
  } else {
    digits = `39${digits}`;
  }
  return /^\d{8,15}$/.test(digits) ? `tel:+${digits}` : null;
}

/** Vero solo se il telefono aziendale è stato configurato davvero. */
export const hasPhone = () => phoneTelHref(CONTACTS.phone) !== null;

export type ContactLinks = {
  /** link wa.me con messaggio precompilato, oppure null (pulsante nascosto) */
  whatsapp: string | null;
  /** link tel: e testo da mostrare, oppure null (pulsante nascosto) */
  phone: { href: string; label: string } | null;
};

/** Pulsanti di contatto da mostrare per i numeri dati. Funzione pura (testabile con numeri di prova). */
export function buildContactLinks(c: { whatsapp: string; phone: string }, message: string = WHATSAPP_MESSAGE): ContactLinks {
  const wa = c.whatsapp.trim();
  const waOk = !isPlaceholder(wa) && WHATSAPP_DIGITS.test(wa);
  const tel = phoneTelHref(c.phone);
  return {
    whatsapp: waOk ? `https://wa.me/${wa}?text=${encodeURIComponent(message)}` : null,
    phone: tel ? { href: tel, label: c.phone.trim() } : null,
  };
}

/** Contatti aziendali configurati (vuoti finché i numeri sono segnaposto). */
export const contactLinks = (message?: string): ContactLinks => buildContactLinks(CONTACTS, message);
