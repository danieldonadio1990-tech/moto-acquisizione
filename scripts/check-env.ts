/**
 * Controllo della configurazione PRIMA del deploy (usato da `npm run build:production` e da vercel.json).
 * Fallisce se manca una variabile obbligatoria: il deploy si ferma invece di andare online rotto.
 */
import { ConfigError, loadServerConfig } from "@/config/env";
import { missingBusinessData, PRIVACY_POLICY_IS_DRAFT } from "@/config/business";

try {
  const cfg = loadServerConfig({ ...process.env, NODE_ENV: "production" });
  console.log(
    `✓ Configurazione production valida (database=${cfg.database.kind}, storage=${cfg.storage.driver}, ip=${cfg.clientIp.source})`,
  );
  for (const w of cfg.warnings) console.warn(`! ${w}`);
  const missing = missingBusinessData();
  if (missing.length) console.warn(`! Dati aziendali da completare in src/config/business.ts: ${missing.join(", ")}`);
  if (PRIVACY_POLICY_IS_DRAFT) console.warn("! Informativa privacy in BOZZA: non pubblicizzare il sito");
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(`✗ ${err.message}`);
    process.exit(1);
  }
  throw err;
}
