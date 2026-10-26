/**
 * Script di verifica pre e post migrazione 0005 (scripts/migration-0005/*.sql) e manuale.
 * Si provano su un database TEMPORANEO (PGlite, o PostgreSQL con TEST_DATABASE_URL): mai su produzione.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const TMP = mkdtempSync(path.join(tmpdir(), "moto-migscripts-test-"));
Object.assign(process.env, {
  NODE_ENV: "test",
  PGLITE_DIR: path.join(TMP, "db"),
  UPLOADS_DIR: path.join(TMP, "uploads"),
  SESSION_SECRET: "test-secret-test-secret-test-secret-123456",
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
  STORAGE_DRIVER: "",
  ADMIN_PASSWORD: "",
});

const PRE = readFileSync("scripts/migration-0005/pre-check.sql", "utf8");
const POST = readFileSync("scripts/migration-0005/post-check.sql", "utf8");
const MIGRATION = readFileSync("drizzle/0005_valuation_engine.sql", "utf8");
const MANUAL = readFileSync("docs/MIGRAZIONE-0005.md", "utf8");
const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as { entries: { idx: number; tag: string; when: number }[] };
const when = (tag: string) => journal.entries.find((e) => e.tag === tag)!.when;

let dbmod: typeof import("@/db/client");
let orm: typeof import("drizzle-orm");
let schema: typeof import("@/db/schema");

type Row = { n: number; controllo: string; ok: boolean; dettaglio: string };
async function run(sqlText: string): Promise<Row[]> {
  const db = await dbmod.getDb();
  const r = (await db.execute(orm.sql.raw(sqlText))) as unknown as Row[] | { rows: Row[] };
  return Array.isArray(r) ? r : r.rows;
}
const byN = (rows: Row[], n: number) => rows.find((r) => Number(r.n) === n)!;
const exec = async (q: string) => (await dbmod.getDb()).execute(orm.sql.raw(q));
const MIGRATION_STATEMENTS = MIGRATION.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
async function applyMigration0005() {
  for (const stmt of MIGRATION_STATEMENTS) await exec(stmt);
  await exec(`insert into drizzle.__drizzle_migrations (hash, created_at) values ('test-0005', ${when("0005_valuation_engine")})`);
}
async function unapply0005() {
  await exec("drop table if exists valuations");
  await exec("drop table if exists market_references");
  await exec("drop table if exists valuation_settings");
  await exec(`delete from drizzle.__drizzle_migrations where created_at = ${when("0005_valuation_engine")}`);
}

before(async () => {
  dbmod = await import("@/db/client");
  orm = await import("drizzle-orm");
  schema = await import("@/db/schema");
  await dbmod.getDb(); // applica le migrazioni (0000–0005) sul database temporaneo
});
after(async () => {
  await dbmod.closeDb();
  rmSync(TMP, { recursive: true, force: true });
});

describe("presupposti codificati negli script coincidono con il repository", () => {
  test("il registro: 5 migrazioni prima (ultima 0004), 6 dopo (ultima 0005), con i valori del journal", () => {
    assert.equal(journal.entries.length, 6);
    assert.ok(PRE.includes(String(when("0004_rate_limit_and_throttled"))));
    assert.ok(POST.includes(String(when("0005_valuation_engine"))));
    assert.match(PRE, /n = 5/);
    assert.match(POST, /n = 6/);
    assert.equal(journal.entries[4].tag, "0004_rate_limit_and_throttled");
    assert.equal(journal.entries[5].tag, "0005_valuation_engine");
  });
  test("colonne e vincoli attesi dal post-controllo = quelli dello schema e della migrazione", async () => {
    const { getTableConfig } = await import("drizzle-orm/pg-core");
    const cols = (t: Parameters<typeof getTableConfig>[0]) => getTableConfig(t).columns.length;
    assert.equal(cols(schema.valuations), 25);
    assert.equal(cols(schema.marketReferences), 14);
    assert.equal(cols(schema.valuationSettings), 9);
    assert.match(POST, /valuations'\) = 25/);
    assert.match(POST, /market_references'\) = 14/);
    assert.match(POST, /valuation_settings'\) = 9/);
    assert.equal((MIGRATION.match(/FOREIGN KEY/g) ?? []).length, 2);
    const named = [...POST.matchAll(/'((?:valuations|valuation_settings|market_references)_[a-z_]+)'/g)].map((m) => m[1]);
    assert.ok(named.length >= 12);
    for (const n of named) assert.ok(MIGRATION.includes(n), `${n} non è nella migrazione`);
  });
  test("gli script sono di SOLA LETTURA: nessuna istruzione di scrittura (commenti e stringhe esclusi)", () => {
    for (const [name, text] of [["pre", PRE], ["post", POST]] as const) {
      const code = text.replace(/--[^\n]*/g, "").replace(/'(?:[^']|'')*'/g, "''");
      assert.doesNotMatch(code, /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|vacuum|call|do)\b/i, name);
      assert.match(code.trim(), /^with\b/i);
    }
  });
  test("il manuale distingue snapshot e backup, descrive i due esiti e un rollback senza perdita di richieste", () => {
    assert.match(MANUAL, /Uno snapshot Neon NON è un backup indipendente/);
    assert.match(MANUAL, /ESITO MIGRAZIONE/);
    assert.match(MANUAL, /ESITO BACKUP[\s\S]{0,400}non fare rollback/);
    assert.match(MANUAL, /Rollback \(senza perdita di richieste dei clienti\)/);
    assert.match(MANUAL, /Non ripristinare lo snapshot per annullare la `0005`/);
    assert.match(MANUAL, /uguali \*\*o maggiori\*\*/);
    assert.doesNotMatch(MANUAL, /INFO[^\n]*\*\*identiche\*\*/);
  });
});

describe("esecuzione su database temporaneo", () => {
  test("stato POST-migrazione: il post-controllo dà ESITO MIGRAZIONE true; il pre-controllo dà false sui controlli 3, 4 e 5", async () => {
    const post = await run(POST);
    assert.equal(byN(post, 98).ok, true);
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) assert.equal(byN(post, n).ok, true, `post ${n}`);
    const pre = await run(PRE);
    assert.equal(byN(pre, 99).ok, false);
    assert.deepEqual([3, 4, 5].filter((n) => !byN(pre, n).ok), [3, 4, 5]);
  });

  test("stato PRE-migrazione: il pre-controllo dà ESITO true; il post-controllo dà MIGRAZIONE false senza errori", async () => {
    await unapply0005();
    try {
      const pre = await run(PRE);
      assert.equal(byN(pre, 99).ok, true, JSON.stringify(pre.filter((r) => !r.ok)));
      assert.equal(byN(pre, 3).dettaglio, "5");
      const post = await run(POST);
      assert.equal(byN(post, 98).ok, false);
      assert.equal(byN(post, 3).ok, false);
      assert.equal(byN(post, 8).dettaglio, "tabelle assenti");
    } finally {
      await applyMigration0005();
    }
    assert.equal(byN(await run(POST), 98).ok, true, "stato ripristinato");
  });

  test("applicazione parziale (tabelle presenti, registro a 5): il pre-controllo si ferma", async () => {
    await exec(`delete from drizzle.__drizzle_migrations where created_at = ${when("0005_valuation_engine")}`);
    try {
      const pre = await run(PRE);
      assert.equal(byN(pre, 99).ok, false);
      assert.equal(byN(pre, 3).ok, true);
      assert.equal(byN(pre, 5).ok, false);
    } finally {
      await exec(`insert into drizzle.__drizzle_migrations (hash, created_at) values ('test-0005', ${when("0005_valuation_engine")})`);
    }
  });

  test("backup_reader senza permessi sulle tabelle nuove: ESITO BACKUP false ma ESITO MIGRAZIONE true; con SELECT diventa true", async () => {
    // i ruoli sono globali nel server: se il ruolo esiste già (PostgreSQL condiviso) non lo si crea né lo si elimina
    const existed = ((await run("select 1 as n, 'x' as controllo, true as ok, '' as dettaglio from pg_roles where rolname = 'backup_reader'")).length) > 0;
    if (!existed) await exec("create role backup_reader");
    try {
      await exec("revoke all on valuations, market_references, valuation_settings from backup_reader");
      const sans = await run(POST);
      assert.equal(byN(sans, 98).ok, true, "la migrazione è riuscita");
      assert.equal(byN(sans, 99).ok, false, "il backup non vede le tabelle nuove");
      await exec("grant select on valuations, market_references, valuation_settings to backup_reader");
      assert.equal(byN(await run(POST), 99).ok, true);
    } finally {
      await exec("revoke all on valuations, market_references, valuation_settings from backup_reader");
      if (!existed) await exec("drop role backup_reader");
    }
    if (!existed) assert.equal(byN(await run(POST), 99).ok, true, "ruolo assente: controllo saltato");
  });

  test("le richieste possono AUMENTARE tra pre e post senza invalidare l'esito; le colonne di leads non cambiano", async () => {
    const before = await run(POST);
    const leadsBefore = Number(byN(before, 20).dettaglio);
    const { createLead } = await import("@/modules/leads/service");
    await createLead({
      submissionId: crypto.randomUUID(),
      motorcycle: { brand: "Honda", modelId: "honda-sh", year: 2019, displacement: 125 },
      mileage: 1000,
      condition: { isRunning: true, accident: "no", mechanicalIssues: "no", maintenance: "yes" },
      contact: { firstName: "Prova", lastName: "Script", phone: "+393339990000", email: "script@example.invalid", city: "Milano", preferredContact: "email", privacyConsent: true },
    } as never);
    const after_ = await run(POST);
    assert.equal(Number(byN(after_, 20).dettaglio), leadsBefore + 1);
    assert.equal(byN(after_, 98).ok, true);
    assert.equal(byN(after_, 22).dettaglio, byN(before, 22).dettaglio);
  });

  test("gli script non modificano nulla: il registro delle migrazioni è identico prima e dopo", async () => {
    const db = await dbmod.getDb();
    const snap = async () => JSON.stringify(((await db.execute(orm.sql`select hash, created_at from drizzle.__drizzle_migrations order by created_at`)) as unknown as { rows?: unknown[] }).rows ?? []);
    const a = await snap();
    await run(PRE);
    await run(POST);
    assert.equal(await snap(), a);
  });
});
