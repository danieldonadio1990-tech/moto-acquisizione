/**
 * Applica le migrazioni al database indicato da DATABASE_URL_DIRECT (o DATABASE_URL).
 * Le migrazioni partono anche da sole all'avvio del server (MIGRATE_ON_START, default attivo):
 * questo comando serve per applicarle prima del deploy o da un terminale.
 */
import { runPostgresMigrations } from "@/db/client";

const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
if (!url) {
  console.error("✗ DATABASE_URL (o DATABASE_URL_DIRECT) mancante");
  process.exit(1);
}
runPostgresMigrations(url)
  .then(() => console.log("✓ Migrazioni applicate"))
  .catch((err) => {
    console.error("✗ Migrazioni fallite:", err instanceof Error ? err.message.split("\nparams")[0] : err);
    process.exit(1);
  });
