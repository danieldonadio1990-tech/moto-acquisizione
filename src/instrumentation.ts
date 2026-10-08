/**
 * Eseguito una volta all'avvio del server, prima di accettare richieste.
 * Se la configurazione non è valida (es. manca DATABASE_URL in produzione) il server NON parte.
 * Applica anche le migrazioni e verifica che il database risponda.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { loadServerConfig, ConfigError } = await import("./config/env");
  try {
    const cfg = loadServerConfig();
    for (const w of cfg.warnings) console.warn(`[config] ${w}`);
    console.info(
      `[config] ambiente=${cfg.env} database=${cfg.database.kind} storage=${cfg.storage.driver}`,
    );
    const { getDb } = await import("./db/client");
    await getDb();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`\n[config] ${err.message}\n`);
    } else {
      const { logError } = await import("./lib/log");
      logError("avvio", err);
      console.error("[avvio] Database non raggiungibile o migrazioni fallite: il server non parte.");
    }
    process.exit(1);
  }
}
