/** Configurazione: produzione senza database/storage persistente non deve partire. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ConfigError, loadServerConfig } from "@/config/env";
import { redact, safeError } from "@/lib/log";
import { rateLimit, type Rule } from "@/lib/rate-limit";

const SECRET = "x".repeat(40);
const prodS3 = {
  NODE_ENV: "production",
  DATABASE_URL: "postgres://u:p@db:5432/app",
  SESSION_SECRET: SECRET,
  STORAGE_DRIVER: "s3",
  S3_BUCKET: "foto",
  S3_ACCESS_KEY_ID: "k",
  S3_SECRET_ACCESS_KEY: "s",
} as NodeJS.ProcessEnv;

const problems = (env: NodeJS.ProcessEnv) => {
  try {
    loadServerConfig(env);
    return [];
  } catch (e) {
    assert.ok(e instanceof ConfigError);
    return e.problems.join("\n");
  }
};

test("produzione senza DATABASE_URL → errore chiaro, nessun fallback locale", () => {
  const p = problems({ ...prodS3, DATABASE_URL: "" });
  assert.match(String(p), /DATABASE_URL mancante/);
});

test("produzione senza STORAGE_DRIVER → errore", () => {
  assert.match(String(problems({ ...prodS3, STORAGE_DRIVER: "" })), /STORAGE_DRIVER mancante/);
});

test("produzione con disco locale non dichiarato persistente → errore", () => {
  assert.match(String(problems({ ...prodS3, STORAGE_DRIVER: "local" })), /disco persistente/);
  assert.match(
    String(problems({ ...prodS3, STORAGE_DRIVER: "local", UPLOADS_DIR: "rel/path", STORAGE_LOCAL_PERSISTENT: "true" })),
    /percorso assoluto/,
  );
  const ok = loadServerConfig({ ...prodS3, STORAGE_DRIVER: "local", UPLOADS_DIR: "/srv/foto", STORAGE_LOCAL_PERSISTENT: "true" });
  assert.equal(ok.storage.driver, "local");
});

test("produzione S3 senza credenziali → errore; completa → ok", () => {
  assert.match(String(problems({ ...prodS3, S3_BUCKET: "" })), /S3_BUCKET mancante/);
  const cfg = loadServerConfig(prodS3);
  assert.equal(cfg.database.kind, "postgres");
  assert.equal(cfg.storage.driver, "s3");
});

test("sviluppo: database e storage locali ammessi", () => {
  const cfg = loadServerConfig({ NODE_ENV: "development", SESSION_SECRET: SECRET } as NodeJS.ProcessEnv);
  assert.equal(cfg.database.kind, "pglite");
  assert.equal(cfg.storage.driver, "local");
});

test("SESSION_SECRET corta → errore anche in sviluppo", () => {
  assert.match(String(problems({ NODE_ENV: "development", SESSION_SECRET: "corta" } as NodeJS.ProcessEnv)), /SESSION_SECRET/);
});

test("log: niente dati personali dagli errori del database", () => {
  const err = new Error(
    'Failed query: insert into "customers" ("first_name","phone","email") values ($1, $2, $3)\nparams: Mario,+393331234567,mario@example.com',
  );
  const s = JSON.stringify(safeError(err));
  assert.ok(!s.includes("Mario") && !s.includes("3331234567") && !s.includes("mario@example.com"), s);
  assert.equal(redact("scrivi a luigi@example.it o al 347 123 4567"), "scrivi a [email] o al [numero]");
});

test("rate limit: oltre il limite → bloccato", async () => {
  const rule: Rule = { name: `t-${Math.random()}`, limit: 3, windowMs: 60_000 };
  const r = [];
  for (let i = 0; i < 5; i++) r.push((await rateLimit(rule, "1.2.3.4")).ok);
  assert.deepEqual(r, [true, true, true, false, false]);
  assert.equal((await rateLimit(rule, "5.6.7.8")).ok, true, "altri IP non coinvolti");
});
