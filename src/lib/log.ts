/**
 * Log degli errori SENZA dati personali.
 *
 * Gli errori del database riportano la query con i valori ("params: Mario, +39333…"):
 * qui vengono rimossi. Non loggare mai body delle richieste, form o oggetti cliente.
 */
type Safe = { name: string; message: string; code?: string };

const REDACTIONS: [RegExp, string][] = [
  [/params:[\s\S]*/i, "params: [rimossi]"],
  // stringhe di connessione (postgres://utente:password@host/db): mai nei log
  [/\b[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@\S+/gi, "[url-con-credenziali]"],
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]"],
  [/\+?\d[\d\s-]{7,}\d/g, "[numero]"],
];

export function redact(text: string): string {
  return REDACTIONS.reduce((s, [re, rep]) => s.replace(re, rep), text);
}

export function safeError(err: unknown, depth = 0): Safe & { cause?: Safe } {
  if (!(err instanceof Error)) return { name: "NonError", message: redact(String(err)).slice(0, 300) };
  const code = (err as { code?: unknown }).code;
  const out: Safe & { cause?: Safe } = {
    name: err.name,
    message: redact(err.message).slice(0, 500),
    ...(typeof code === "string" ? { code } : {}),
  };
  if (err.cause && depth < 2) out.cause = safeError(err.cause, depth + 1);
  return out;
}

export function logError(context: string, err: unknown) {
  console.error(`[${context}]`, JSON.stringify(safeError(err)));
}

export function logWarn(context: string, message: string) {
  console.warn(`[${context}] ${redact(message)}`);
}
