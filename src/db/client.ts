import "server-only";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import * as schema from "./schema";
import { bootstrap } from "./bootstrap";

/**
 * Connessione al database.
 * - DATABASE_URL=postgres://...  → PostgreSQL vero (produzione: Supabase, Neon, ecc.)
 * - DATABASE_URL assente           → PGlite embedded in ./data/pglite (sviluppo locale)
 *
 * Le migrazioni (cartella ./drizzle) vengono applicate all'avvio.
 */
export type Db = PgliteDatabase<typeof schema>;

const MIGRATIONS = path.join(process.cwd(), "drizzle");

const globalForDb = globalThis as unknown as { __dbPromise?: Promise<Db> };

async function init(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  let db: Db;
  if (url && url.startsWith("postgres")) {
    const { default: postgres } = await import("postgres");
    const client = postgres(url, { max: 5, prepare: false });
    const pg = drizzlePostgres(client, { schema });
    await migratePostgres(pg, { migrationsFolder: MIGRATIONS });
    db = pg as unknown as Db;
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const dir = path.join(process.cwd(), "data", "pglite");
    mkdirSync(dir, { recursive: true });
    const client = new PGlite(dir);
    const lite = drizzlePglite(client, { schema });
    await migratePglite(lite, { migrationsFolder: MIGRATIONS });
    db = lite;
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
