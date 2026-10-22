/** Configurazione: produzione senza database/storage persistente non deve partire. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ConfigError, loadServerConfig } from "@/config/env";
import { redact, safeError } from "@/lib/log";
import { clientIp, rateLimit, type Rule } from "@/lib/rate-limit";

const SECRET = "x".repeat(40);
const prodS3 = {
  NODE_ENV: "production",
  DATABASE_URL: "postgres://u:p@db:5432/app",
  SESSION_SECRET: SECRET,
  STORAGE_DRIVER: "s3",
  S3_BUCKET: "foto",
  S3_ENDPOINT: "https://abc.storage.supabase.co/storage/v1/s3",
  S3_REGION: "eu-central-1",
  S3_FORCE_PATH_STYLE: "true",
  S3_ACCESS_KEY_ID: "k",
  S3_SECRET_ACCESS_KEY: "s",
  VERCEL: "1",
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

// --- S3 in produzione: ogni variabile obbligatoria, errori chiari, mai segreti nei messaggi ---
const SECRET_KEY = "CANARY_SECRET_KEY_9f3a";
const SECRET_ID = "CANARY_KEY_ID_77b1";
const S3_REQUIRED = ["S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_FORCE_PATH_STYLE", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const;

for (const name of S3_REQUIRED) {
  test(`produzione con S3: ${name} mancante → errore chiaro che nomina la variabile`, () => {
    const msg = String(problems({ ...prodS3, S3_ACCESS_KEY_ID: SECRET_ID, S3_SECRET_ACCESS_KEY: SECRET_KEY, [name]: "" }));
    assert.match(msg, new RegExp(`${name} mancante`));
    assert.ok(!msg.includes(SECRET_KEY) && !msg.includes(SECRET_ID), "il messaggio non deve contenere credenziali");
  });
}

test("produzione con S3: più variabili mancanti → tutte segnalate in un solo errore", () => {
  const msg = String(problems({ ...prodS3, S3_ENDPOINT: "", S3_REGION: "", S3_FORCE_PATH_STYLE: "" }));
  assert.match(msg, /S3_ENDPOINT mancante/);
  assert.match(msg, /S3_REGION mancante/);
  assert.match(msg, /S3_FORCE_PATH_STYLE mancante/);
});

test("produzione con S3: valori non validi rifiutati", () => {
  assert.match(String(problems({ ...prodS3, S3_ENDPOINT: "http://esempio.it/s3" })), /S3_ENDPOINT non valido/);
  assert.match(String(problems({ ...prodS3, S3_ENDPOINT: "non-un-url" })), /S3_ENDPOINT non valido/);
  assert.match(String(problems({ ...prodS3, S3_FORCE_PATH_STYLE: "si" })), /S3_FORCE_PATH_STYLE non valido/);
  // http è ammesso solo verso localhost (prove locali)
  assert.equal(loadServerConfig({ ...prodS3, S3_ENDPOINT: "http://127.0.0.1:5055" }).storage.driver, "s3");
});

test("produzione con S3 completo: configurazione letta correttamente", () => {
  const cfg = loadServerConfig(prodS3);
  assert.equal(cfg.storage.driver, "s3");
  if (cfg.storage.driver === "s3") {
    assert.equal(cfg.storage.region, "eu-central-1");
    assert.equal(cfg.storage.endpoint, "https://abc.storage.supabase.co/storage/v1/s3");
    assert.equal(cfg.storage.forcePathStyle, true);
  }
});

test("driver alternativo (local persistente): le variabili S3 non servono", () => {
  const env: NodeJS.ProcessEnv = { ...prodS3, STORAGE_DRIVER: "local", UPLOADS_DIR: "/srv/foto", STORAGE_LOCAL_PERSISTENT: "true" };
  for (const k of S3_REQUIRED) delete env[k];
  const cfg = loadServerConfig(env);
  assert.equal(cfg.storage.driver, "local");
});

test("sviluppo con S3: endpoint, regione e path-style restano facoltativi (comportamento invariato)", () => {
  const cfg = loadServerConfig({
    NODE_ENV: "development",
    SESSION_SECRET: SECRET,
    STORAGE_DRIVER: "s3",
    S3_BUCKET: "foto",
    S3_ACCESS_KEY_ID: "k",
    S3_SECRET_ACCESS_KEY: "s",
  } as NodeJS.ProcessEnv);
  assert.equal(cfg.storage.driver, "s3");
});

// --- DATABASE_URL_DIRECT: serve alle migrazioni, non al runtime ---
const NEON_POOLED = "postgres://u:PW_CANARY_81c2@ep-cool-name-123456-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require";
const NEON_DIRECT = "postgres://u:PW_CANARY_81c2@ep-cool-name-123456.eu-central-1.aws.neon.tech/neondb?sslmode=require";

test("Neon pooled senza DATABASE_URL_DIRECT con migrazioni all'avvio → errore chiaro, senza URL né password", () => {
  const msg = String(problems({ ...prodS3, DATABASE_URL: NEON_POOLED }));
  assert.match(msg, /DATABASE_URL_DIRECT/);
  assert.match(msg, /MIGRATE_ON_START=false/);
  assert.ok(!msg.includes("PW_CANARY_81c2") && !msg.includes("neon.tech"), "il messaggio non deve contenere l'URL");
});

test("Neon pooled + DATABASE_URL_DIRECT diretta → ok", () => {
  const cfg = loadServerConfig({ ...prodS3, DATABASE_URL: NEON_POOLED, DATABASE_URL_DIRECT: NEON_DIRECT });
  assert.equal(cfg.database.kind, "postgres");
  if (cfg.database.kind === "postgres") assert.equal(cfg.database.migrationUrl, NEON_DIRECT);
});

test("Neon pooled con MIGRATE_ON_START=false: il runtime NON richiede DATABASE_URL_DIRECT", () => {
  const cfg = loadServerConfig({ ...prodS3, DATABASE_URL: NEON_POOLED, MIGRATE_ON_START: "false" });
  assert.equal(cfg.migrateOnStart, false);
  if (cfg.database.kind === "postgres") assert.equal(cfg.database.migrationUrl, undefined);
});

test("DATABASE_URL_DIRECT che punta al pooler → errore (non serve a nulla per le migrazioni)", () => {
  assert.match(String(problems({ ...prodS3, DATABASE_URL: NEON_POOLED, DATABASE_URL_DIRECT: NEON_POOLED })), /punta al pooler/);
});

test("connessione non pooled senza DATABASE_URL_DIRECT → ok (non si blocca inutilmente)", () => {
  assert.equal(loadServerConfig({ ...prodS3, DATABASE_URL: NEON_DIRECT }).database.kind, "postgres");
  assert.equal(loadServerConfig({ ...prodS3, DATABASE_URL: "postgres://u:p@db:5432/app" }).database.kind, "postgres");
});

test("fuori dalla produzione il controllo su DATABASE_URL_DIRECT non scatta", () => {
  const cfg = loadServerConfig({ ...prodS3, NODE_ENV: "development", DATABASE_URL: NEON_POOLED });
  assert.equal(cfg.database.kind, "postgres");
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
  assert.equal(redact("scrivi a luigi@example.invalid o al 347 123 4567"), "scrivi a [email] o al [numero]");
});

test("log: le stringhe di connessione con password non compaiono mai", () => {
  const url = "postgres://neondb_owner:S3cr3tPwd@ep-test-123.eu-central-1.aws.neon.tech/neondb?sslmode=require";
  const out = redact(`connect failed for ${url} (timeout)`);
  assert.ok(!out.includes("S3cr3tPwd") && !out.includes("neondb_owner"), out);
  assert.match(out, /\[url-con-credenziali\]/);
  const s = JSON.stringify(safeError(new Error(`getaddrinfo ENOTFOUND ${url}`)));
  assert.ok(!s.includes("S3cr3tPwd"), s);
});

test("rate limit: oltre il limite → bloccato", async () => {
  const rule: Rule = { name: `t-${Math.random()}`, limit: 3, windowMs: 60_000 };
  const r = [];
  for (let i = 0; i < 5; i++) r.push((await rateLimit(rule, "1.2.3.4")).ok);
  assert.deepEqual(r, [true, true, true, false, false]);
  assert.equal((await rateLimit(rule, "5.6.7.8")).ok, true, "altri IP non coinvolti");
});

test("IP client: su Vercel si usa x-vercel-forwarded-for, non l'header falsificabile", () => {
  const cfg = loadServerConfig(prodS3);
  assert.equal(cfg.clientIp.source, "vercel");
  const h = new Headers({ "x-forwarded-for": "6.6.6.6", "x-vercel-forwarded-for": "93.40.1.2" });
  assert.equal(clientIp(h, cfg.clientIp), "93.40.1.2");
});

test("IP client: fuori da Vercel in produzione serve una fonte esplicita e affidabile", () => {
  const noVercel = { ...prodS3, VERCEL: "" };
  assert.match(String(problems(noVercel)), /CLIENT_IP_SOURCE mancante/);
  assert.match(String(problems({ ...noVercel, CLIENT_IP_SOURCE: "forwarded" })), /non è ammesso in produzione/);
  assert.match(String(problems({ ...noVercel, CLIENT_IP_SOURCE: "header", CLIENT_IP_HEADER: "x-forwarded-for" })), /non è affidabile/);
  const cfg = loadServerConfig({ ...noVercel, CLIENT_IP_SOURCE: "header", CLIENT_IP_HEADER: "x-real-ip" });
  assert.equal(clientIp(new Headers({ "x-real-ip": "1.2.3.4", "x-forwarded-for": "6.6.6.6" }), cfg.clientIp), "1.2.3.4");
  const cf = loadServerConfig({ ...noVercel, CLIENT_IP_SOURCE: "cloudflare" });
  assert.equal(clientIp(new Headers({ "cf-connecting-ip": "5.5.5.5", "x-forwarded-for": "6.6.6.6" }), cf.clientIp), "5.5.5.5");
});

test("IP client: header atteso assente → contatore comune 'unknown' (più restrittivo)", () => {
  assert.equal(clientIp(new Headers({ "x-forwarded-for": "6.6.6.6" }), { source: "vercel" }), "unknown");
});

test("Netlify: IP client da x-nf-client-connection-ip via CLIENT_IP_SOURCE=header, non da x-forwarded-for", () => {
  const env = { ...prodS3, VERCEL: "", CLIENT_IP_SOURCE: "header", CLIENT_IP_HEADER: "x-nf-client-connection-ip" };
  const cfg = loadServerConfig(env);
  const h = new Headers({ "x-forwarded-for": "6.6.6.6", "x-nf-client-connection-ip": "93.40.1.2" });
  assert.equal(clientIp(h, cfg.clientIp), "93.40.1.2");
  assert.equal(clientIp(new Headers({ "x-forwarded-for": "6.6.6.6" }), cfg.clientIp), "unknown");
});

test("guardia Netlify: i contesti non di produzione sono rifiutati", () => {
  const env = { ...prodS3, VERCEL: "", CLIENT_IP_SOURCE: "header", CLIENT_IP_HEADER: "x-nf-client-connection-ip", NETLIFY: "true" };
  assert.doesNotThrow(() => loadServerConfig({ ...env, CONTEXT: "production" }));
  assert.doesNotThrow(() => loadServerConfig(env), "CONTEXT assente a runtime: ok");
  for (const ctx of ["deploy-preview", "branch-deploy", "dev"]) {
    assert.match(String(problems({ ...env, CONTEXT: ctx })), /non di produzione/);
  }
});
