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
  const cfg = serverConfig().database;
  let db: Db;
  if (cfg.kind === "postgres") {
    const { default: postgres } = await import("postgres");
    const client = postgres(cfg.url, { max: 5, prepare: false, onnotice: () => {} });
    const pg = drizzlePostgres(client, { schema });
    await migratePostgres(pg, { migrationsFolder: MIGRATIONS });
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
