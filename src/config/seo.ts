import { PRIVACY_POLICY_IS_DRAFT } from "./business";

/**
 * Indicizzazione sui motori di ricerca.
 * Spenta finché l'informativa è in bozza (soft launch: il sito non va pubblicizzato),
 * sui deploy di anteprima e se SITE_INDEXING=false. Si accende da sola con informativa "1.0".
 */
export function indexingEnabled() {
  if (process.env.SITE_INDEXING === "false") return false;
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") return false;
  if (process.env.NETLIFY === "true" && process.env.CONTEXT && process.env.CONTEXT !== "production") return false;
  return !PRIVACY_POLICY_IS_DRAFT;
}
