import "server-only";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import { serverConfig } from "@/config/env";
import * as schema from "./schema";
import { bootstrap } from "./bootstrap";

/**
 * Connessione al database, scelta da src/config/env.ts:
 * - postgres → PostgreSQL vero (obbligatorio in produzione)
 * - pglite   → database integrato in ./data/pglite (solo sviluppo e test)
 *
 * Le migrazioni (cartella ./drizzle) vengono applicate all'avvio del server.
 */
export type Db = PgliteDatabase<typeof schema>;

const MIGRATIONS = path.join(process.cwd(), "drizzle");

const globalForDb = globalThis as unknown as { __dbPromise?: Promise<Db>; __dbClose?: () => Promise<void> };

async function init(): Promise<Db> {
  const { database: cfg, migrateOnStart } = serverConfig();
  let db: Db;
  if (cfg.kind === "postgres") {
    const { default: postgres } = await import("postgres");
    // prepare:false → compatibile con i pooler in modalità transaction (Supabase :6543, Neon -pooler)
    const client = postgres(cfg.url, {
      max: Number(process.env.DB_POOL_MAX || 3),
      prepare: false,
      connect_timeout: 10,
      idle_timeout: 20,
      onnotice: () => {},
    });
    const pg = drizzlePostgres(client, { schema });
    if (migrateOnStart) await runPostgresMigrations(cfg.migrationUrl ?? cfg.url);
    db = pg as unknown as Db;
    globalForDb.__dbClose = () => client.end();
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    mkdirSync(cfg.dir, { recursive: true });
    const client = new PGlite(cfg.dir);
    const lite = drizzlePglite(client, { schema });
    await migratePglite(lite, { migrationsFolder: MIGRATIONS });
    db = lite;
    globalForDb.__dbClose = () => client.close();
  }
  await bootstrap(db);
  return db;
}

/**
 * Migrazioni sotto advisory lock di PostgreSQL: se più istanze partono insieme
 * (tipico su hosting serverless) una sola applica le migrazioni, le altre aspettano.
 * Usa una connessione dedicata (max 1) così lock e migrazioni stanno sulla stessa sessione:
 * per questo, se DATABASE_URL passa da un pooler in modalità "transaction", va indicata
 * anche DATABASE_URL_DIRECT (connessione diretta o pooler in modalità "session").
 */
export async function runPostgresMigrations(url: string) {
  const { default: postgres } = await import("postgres");
  const LOCK_ID = 72_019_441; // costante arbitraria del progetto
  const client = postgres(url, { max: 1, prepare: false, connect_timeout: 10, onnotice: () => {} });
  try {
    await client`select pg_advisory_lock(${LOCK_ID})`;
    await migratePostgres(drizzlePostgres(client), { migrationsFolder: MIGRATIONS });
  } finally {
    await client`select pg_advisory_unlock(${LOCK_ID})`.catch(() => {});
    await client.end();
  }
}

export function getDb(): Promise<Db> {
  if (!globalForDb.__dbPromise) {
    globalForDb.__dbPromise = init().catch((err) => {
      globalForDb.__dbPromise = undefined;
      throw err;
    });
  }
  return globalForDb.__dbPromise;
}

/** Chiude la connessione (script e test). */
export async function closeDb() {
  if (globalForDb.__dbPromise) {
    await globalForDb.__dbPromise.catch(() => {});
    await globalForDb.__dbClose?.();
    globalForDb.__dbPromise = undefined;
    globalForDb.__dbClose = undefined;
  }
}
