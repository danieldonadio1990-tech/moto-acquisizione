import { ConfigError, loadServerConfig } from "./config/env";
import { missingBusinessData, PRIVACY_POLICY_IS_DRAFT } from "./config/business";
import { logError } from "./lib/log";

/**
 * FAIL FAST: se la configurazione non è valida (es. manca DATABASE_URL in produzione)
 * o il database non risponde, l'istanza si ferma e il log spiega cosa correggere.
 * Applica anche le migrazioni (con lock: più istanze in parallelo non si pestano i piedi).
 */
export async function startup() {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  try {
    const cfg = loadServerConfig();
    for (const w of cfg.warnings) console.warn(`[config] ${w}`);
    console.info(
      `[config] ambiente=${cfg.env} database=${cfg.database.kind} storage=${cfg.storage.driver} ip=${cfg.clientIp.source}`,
    );
    if (cfg.env === "production") {
      const missing = missingBusinessData();
      if (missing.length) console.warn(`[dati aziendali] da completare in src/config/business.ts: ${missing.join(", ")}`);
      if (PRIVACY_POLICY_IS_DRAFT) console.warn("[privacy] informativa in BOZZA: non pubblicizzare il sito");
    }
    const { getDb } = await import("./db/client");
    await getDb();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`\n[config] ${err.message}\n`);
    } else {
      logError("avvio", err);
      console.error("[avvio] Database non raggiungibile o migrazioni fallite: il server non parte.");
    }
    process.exit(1);
  }
}
