/**
 * Guardia della migrazione 0005 (scripts/migration-0005/guard.ts): rifiuta i bersagli sbagliati PRIMA di connettersi,
 * non stampa mai credenziali. Le prove di rifiuto non hanno bisogno di un database; quelle di applicazione girano solo con
 * TEST_DATABASE_URL (PostgreSQL di prova) e sono saltate in modo esplicito altrimenti.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const CANARY = "CANARY_pw_81c2_do_not_print";
const GUARD = "scripts/migration-0005/guard.ts";
const TSX = path.resolve("node_modules/.bin/tsx");

function run(args: string[], env: Record<string, string | undefined>) {
  const clean = {} as NodeJS.ProcessEnv;
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !/^DATABASE_URL/.test(k)) clean[k] = v;
  for (const [k, v] of Object.entries(env)) if (v !== undefined) clean[k] = v;
  const r = spawnSync(TSX, ["--conditions=react-server", GUARD, ...args], { env: clean, encoding: "utf8", timeout: 60_000 });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}
const noCanary = (out: string) => assert.ok(!out.includes(CANARY) && !/postgres(ql)?:\/\/[^\s]*@/.test(out), "credenziali o stringa di connessione nell'output");

describe("rifiuti prima di qualunque connessione", () => {
  test("senza DATABASE_URL_DIRECT: rifiuta; DATABASE_URL (anche valorizzato) non viene mai usato come ripiego", () => {
    const a = run(["check"], {});
    assert.equal(a.code, 1);
    assert.match(a.out, /DATABASE_URL_DIRECT mancante/);
    const b = run(["check"], { DATABASE_URL: `postgres://u:${CANARY}@127.0.0.1:1/x` });
    assert.equal(b.code, 1);
    assert.match(b.out, /DATABASE_URL_DIRECT mancante/);
    noCanary(b.out);
  });
  test("indirizzo del pooler Neon: rifiutato senza connettersi e senza stampare l'indirizzo", () => {
    const r = run(["check"], { DATABASE_URL_DIRECT: `postgres://u:${CANARY}@ep-cool-darkness-123456-pooler.eu-central-1.aws.neon.tech/neondb` });
    assert.equal(r.code, 1);
    assert.match(r.out, /pooler/);
    assert.ok(!r.out.includes("ep-cool-darkness"), "l'indirizzo completo non va stampato");
    noCanary(r.out);
  });
  test("indirizzo non valido o senza database", () => {
    assert.match(run(["check"], { DATABASE_URL_DIRECT: "non-un-indirizzo" }).out, /non è un indirizzo valido/);
    assert.match(run(["check"], { DATABASE_URL_DIRECT: `postgres://u:${CANARY}@127.0.0.1:1` }).out, /nome del database/);
    assert.match(run(["check"], { DATABASE_URL_DIRECT: "mysql://u:p@127.0.0.1/x" }).out, /postgres:\/\//);
  });
  test("apply senza --confirm o con codice sbagliato: rifiuta prima di connettersi", () => {
    const url = `postgres://u:${CANARY}@127.0.0.1:1/miodb`;
    const a = run(["apply"], { DATABASE_URL_DIRECT: url });
    assert.equal(a.code, 1);
    assert.match(a.out, /--confirm/);
    assert.ok(!/Bersaglio:/.test(a.out), "non deve nemmeno arrivare a mostrare il bersaglio/connettersi");
    const b = run(["apply", "--confirm=miodb:00000000"], { DATABASE_URL_DIRECT: url });
    assert.equal(b.code, 1);
    assert.match(b.out, /non corrisponde/);
    assert.ok(!/ECONNREFUSED/.test(b.out), "nessun tentativo di connessione");
    noCanary(a.out + b.out);
  });
  test("i controlli passano SEMPRE da una transazione di sola lettura (verifica nel codice)", () => {
    const src = readFileSync(GUARD, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.match(src, /sql\.begin\("read only"/);
    assert.equal((src.match(/\.unsafe\(/g) ?? []).length, 1, "l'SQL dei file si esegue in un solo punto, dentro la transazione di sola lettura");
    assert.doesNotMatch(src, /\b(insert\s+into|update\s+\w+\s+set|delete\s+from|drop\s+(table|schema|database)|alter\s+(table|role)|truncate\s+table|grant\s|revoke\s)/i, "nessuna istruzione di scrittura nel guard");
  });
  test("modalità sconosciuta: uso", () => {
    assert.match(run(["boh"], { DATABASE_URL_DIRECT: "postgres://u:p@127.0.0.1:1/x" }).out, /uso:/);
  });
  test("bersaglio irraggiungibile: mostra database e ruolo, ma mai la password né l'URL", () => {
    const r = run(["check"], { DATABASE_URL_DIRECT: `postgres://ruolo:${CANARY}@127.0.0.1:1/miodb` });
    assert.equal(r.code, 1);
    assert.match(r.out, /Bersaglio: host .* · database «miodb» · ruolo «ruolo»/);
    assert.match(r.out, /Impronta del bersaglio: [0-9a-f]{8}/);
    noCanary(r.out);
    assert.ok(!r.out.includes("127.0.0.1"), "l'indirizzo completo non compare nemmeno negli errori");
  });
  test("lo script non legge .env.local né usa --env-file (un URL dimenticato lì non può essere usato)", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
    assert.ok(pkg.scripts["migrate:0005"].includes("guard.ts"));
    assert.ok(!/env-file/.test(pkg.scripts["migrate:0005"]));
    assert.doesNotMatch(readFileSync(GUARD, "utf8").replace(/\/\*[\s\S]*?\*\//g, ""), /process\.env\.DATABASE_URL\b(?!_DIRECT)/);
  });
});

describe("con un PostgreSQL di prova (TEST_DATABASE_URL)", { skip: process.env.TEST_DATABASE_URL ? false : "TEST_DATABASE_URL non impostata: prove di applicazione saltate (eseguite in locale su PostgreSQL 16)" }, () => {
  const TMP = mkdtempSync(path.join(tmpdir(), "moto-guard-test-"));
  const URL_ = process.env.TEST_DATABASE_URL ?? "";
  let dbmod: typeof import("@/db/client");
  let orm: typeof import("drizzle-orm");
  const exec = async (q: string) => (await dbmod.getDb()).execute(orm.sql.raw(q));
  const count = async () => Number(((await exec("select count(*)::int as n from drizzle.__drizzle_migrations")) as unknown as { 0: { n: number } })[0].n);

  before(async () => {
    Object.assign(process.env, { NODE_ENV: "test", DATABASE_URL: URL_, SESSION_SECRET: "test-secret-test-secret-test-secret-123456", STORAGE_DRIVER: "", ADMIN_PASSWORD: "", UPLOADS_DIR: path.join(TMP, "u") });
    dbmod = await import("@/db/client");
    orm = await import("drizzle-orm");
    await dbmod.getDb(); // migrazioni 0000–0005
    await exec("drop table if exists valuations");
    await exec("drop table if exists market_references");
    await exec("drop table if exists valuation_settings");
    await exec("delete from drizzle.__drizzle_migrations where created_at = 1793054993829");
  });
  after(async () => {
    await dbmod.closeDb();
    rmSync(TMP, { recursive: true, force: true });
  });

  test("check non scrive nulla: nemmeno se il file SQL del controllo venisse modificato per scrivere (transazione di sola lettura)", async () => {
    const snapshot = async () => {
      const names = (await exec("select table_name from information_schema.tables where table_schema in ('public','drizzle') and table_type='BASE TABLE' order by 1")) as unknown as { table_name: string }[];
      const parts: string[] = [];
      for (const { table_name } of names) {
        const schemaName = table_name === "__drizzle_migrations" ? "drizzle" : "public";
        const r = (await exec(`select count(*)::int as n from ${schemaName}."${table_name}"`)) as unknown as { n: number }[];
        parts.push(`${table_name}=${r[0].n}`);
      }
      return parts.join(",");
    };
    const before = await snapshot();
    // 1) il controllo vero
    const real = run(["check"], { DATABASE_URL_DIRECT: URL_ });
    assert.equal(real.code, 0, real.out);
    assert.equal(await snapshot(), before, "il check non ha cambiato nulla");
    // 2) un file «malevolo» che prova a scrivere in events: PostgreSQL deve rifiutare
    const dir = mkdtempSync(path.join(tmpdir(), "moto-guard-sql-"));
    try {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(path.join(dir, "pre-check.sql"), "with w as (insert into events(name) values ('scrittura-vietata') returning 1) select 1 as n, 'x' as controllo, true as ok, '' as dettaglio from w");
      const bad = run(["check"], { DATABASE_URL_DIRECT: URL_, MIGRATION_SQL_DIR: dir });
      assert.equal(bad.code, 1);
      assert.match(bad.out, /read-only/i);
      assert.equal(await snapshot(), before, "nessuna scrittura è passata");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("apply con il codice GIUSTO ma pre-controllo non superato (registro anomalo): rifiutato, nessuna migrazione", async () => {
    await exec("delete from drizzle.__drizzle_migrations where created_at = 1792676806531"); // finge un registro diverso dall'atteso
    try {
      const chk = run(["check"], { DATABASE_URL_DIRECT: URL_ });
      assert.equal(chk.code, 1, chk.out);
      const fp = /Impronta del bersaglio: ([0-9a-f]{8})/.exec(chk.out)![1];
      const db = /database «([^»]+)»/.exec(chk.out)![1];
      const r = run(["apply", `--confirm=${db}:${fp}`], { DATABASE_URL_DIRECT: URL_ });
      assert.equal(r.code, 1);
      assert.match(r.out, /Pre-controllo NON superato: nessuna migrazione applicata/);
      assert.equal(await count(), 4, "il registro non è stato toccato");
      const tbl = (await exec("select to_regclass('public.valuations') as t")) as unknown as { t: string | null }[];
      assert.equal(tbl[0].t, null, "le tabelle non sono state create");
    } finally {
      await exec("insert into drizzle.__drizzle_migrations (hash, created_at) values ('test-0004', 1792676806531)");
    }
    assert.equal(await count(), 5);
  });

  test("check → pre-controllo verde; apply con codice errato non cambia nulla; apply col codice giusto migra; una seconda apply è rifiutata", async () => {
    const env = { DATABASE_URL_DIRECT: URL_ };
    const check = run(["check"], env);
    assert.equal(check.code, 0, check.out);
    assert.match(check.out, /Pre-controllo superato/);
    noCanary(check.out);
    const code = /--confirm=(\S+)/.exec(check.out)![1];
    assert.equal(await count(), 5);

    const wrong = run(["apply", "--confirm=altro:12345678"], env);
    assert.equal(wrong.code, 1);
    assert.equal(await count(), 5, "nessuna migrazione con codice errato");

    const ok = run(["apply", `--confirm=${code}`], env);
    assert.equal(ok.code, 0, ok.out);
    assert.match(ok.out, /Migrazioni applicate/);
    assert.match(ok.out, /ESITO MIGRAZIONE positivo/);
    assert.equal(await count(), 6);

    const again = run(["apply", `--confirm=${code}`], env);
    assert.equal(again.code, 1);
    assert.match(again.out, /Pre-controllo NON superato/);
    assert.equal(await count(), 6, "nessuna doppia applicazione");
    const check2 = run(["check"], env);
    assert.equal(check2.code, 1, "dopo la migrazione il pre-controllo non è più verde");
  });
});
