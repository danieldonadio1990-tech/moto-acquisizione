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
