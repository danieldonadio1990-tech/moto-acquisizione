/** Codici errore PostgreSQL (validi sia per postgres-js che per PGlite, anche se avvolti da Drizzle). */
function pgCode(err: unknown): string | undefined {
  let e: unknown = err;
  for (let i = 0; i < 4 && e; i++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    e = (e as { cause?: unknown }).cause;
  }
  return undefined;
}

export const isUniqueViolation = (err: unknown) => pgCode(err) === "23505";
export const isCheckViolation = (err: unknown) => pgCode(err) === "23514";

/** Tabelle del motore di valutazione (migrazione 0005): le uniche per cui si tollera uno schema non ancora migrato. */
const VALUATION_TABLES = /\b(valuations|market_references|valuation_settings)\b/;

function chain(err: unknown): unknown[] {
  const out: unknown[] = [];
  for (let e = err, i = 0; e && i < 6; i++, e = (e as { cause?: unknown }).cause) out.push(e);
  return out;
}

/**
 * Vero SOLO se l'errore è «tabella mancante» (42P01) o «permesso negato sulla tabella» (42501) PER UNA delle tabelle del motore di
 * valutazione, cioè la migrazione 0005 non è (ancora) disponibile. Qualsiasi altro errore (connessione, colonna mancante, bug,
 * errore su altre tabelle) NON è riconosciuto e va lasciato propagare. Si legge il messaggio del livello PostgreSQL (quello con il codice),
 * non il testo della query riportato da Drizzle, che nomina le tabelle anche per errori non correlati.
 */
export function isValuationSchemaUnavailable(err: unknown): boolean {
  for (const e of chain(err)) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) {
      if (code !== "42P01" && code !== "42501") return false;
      const msg = String((e as { message?: unknown }).message ?? "");
      return VALUATION_TABLES.test(msg);
    }
  }
  return false;
}
