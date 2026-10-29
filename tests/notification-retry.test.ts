/**
 * Recupero automatico delle notifiche email: rotta protetta + script chiamato da GitHub Actions.
 * Nessuna email reale (provider finto), nessuna rete esterna (server HTTP locale per lo script).
 * Database: PGlite in una cartella temporanea. Esecuzione: npm test
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import type { EmailMessage, EmailTransport, SendResult } from "@/modules/notifications/transport";

const TMP = mkdtempSync(path.join(tmpdir(), "moto-retry-test-"));
const TOKEN = randomBytes(24).toString("hex"); // generato a ogni esecuzione: nessun valore fisso nel repository
const TO = "notifiche@example.invalid";
Object.assign(process.env, {
  NODE_ENV: "test",
  PGLITE_DIR: path.join(TMP, "db"),
  UPLOADS_DIR: path.join(TMP, "uploads"),
  SESSION_SECRET: "test-secret-test-secret-test-secret-123456",
  DATABASE_URL: "",
  STORAGE_DRIVER: "",
  ADMIN_PASSWORD: "",
  RESEND_API_KEY: "dummy-key-not-real",
  NOTIFY_EMAIL_TO: TO,
  NOTIFY_RETRY_TOKEN: TOKEN,
});
delete process.env.RATE_LIMIT_DISABLED; // il limite sui tentativi sbagliati fa parte di ciò che si prova

type Mode = "ok" | "fail" | "throw";
class Provider implements EmailTransport {
  mode: Mode = "ok";
  delayMs = 0;
  attempts = 0;
  /** consegne reali: stessa chiave = una sola (come l'idempotenza di Resend) */
  delivered = new Set<string>();
  async send(msg: EmailMessage): Promise<SendResult> {
    this.attempts++;
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    if (this.mode === "throw") throw new Error("provider giù");
    if (this.mode === "fail") return { ok: false as const, code: "http_503" };
    this.delivered.add(msg.idempotencyKey);
    return { ok: true as const, id: "x" };
  }
}

let route: typeof import("@/app/api/internal/notifications/retry/route");
let nl: typeof import("@/modules/notifications/new-lead");
let tr: typeof import("@/modules/notifications/transport");
let cfgmod: typeof import("@/modules/notifications/config");
let svc: typeof import("@/modules/leads/service");
let dbmod: typeof import("@/db/client");
let schema: typeof import("@/db/schema");
let orm: typeof import("drizzle-orm");
let provider: Provider;

const submission = () => ({
  submissionId: randomUUID(),
  motorcycle: { brand: "Honda", modelId: "honda-sh", year: 2019, displacement: 125 },
  mileage: 18000,
  condition: { isRunning: true, accident: "no" as const, mechanicalIssues: "no" as const, maintenance: "yes" as const },
  contact: {
    firstName: "Mario",
    lastName: "Verdi",
    phone: "+393331234567",
    email: `mario.${randomUUID().slice(0, 8)}@example.com`,
    city: "Pavia",
    preferredContact: "whatsapp" as const,
    privacyConsent: true as const,
  },
});

let ipSeq = 10;
const nextIp = () => `198.51.100.${ipSeq++}`;
const call = (headers: Record<string, string> = {}, init: { url?: string } = {}) =>
  route.POST(
    new Request(init.url ?? "http://localhost/api/internal/notifications/retry", {
      method: "POST",
      headers: { "x-forwarded-for": nextIp(), ...headers },
    }),
  );
const authed = () => call({ authorization: `Bearer ${TOKEN}` });

async function row(id: string) {
  const db = await dbmod.getDb();
  const [r] = await db.select().from(schema.leads).where(orm.eq(schema.leads.id, id));
  return r;
}
async function patch(id: string, set: Record<string, unknown>) {
  const db = await dbmod.getDb();
  await db.update(schema.leads).set(set).where(orm.eq(schema.leads.id, id));
}
const minutesAgo = (m: number) => orm.sql`now() - make_interval(mins => ${m})`;

/** Crea un lead mentre le notifiche sono spente, così resta `pending`, e lo porta nello stato voluto. */
async function leadIn(set: Record<string, unknown> = {}) {
  tr.setEmailTransport(null);
  const l = await svc.createLead(submission());
  await patch(l.id, { createdAt: minutesAgo(5), ...set });
  return l.id;
}
const arm = (mode: Mode = "ok") => {
  provider = new Provider();
  provider.mode = mode;
  tr.setEmailTransport(provider);
  return provider;
};

// i log non devono mai contenere il token
const logged: string[] = [];
const origs = { log: console.log, error: console.error, warn: console.warn, info: console.info };
before(async () => {
  for (const k of ["log", "error", "warn", "info"] as const) {
    console[k] = (...a: unknown[]) => {
      logged.push(a.map(String).join(" "));
      origs[k](...a);
    };
  }
  route = await import("@/app/api/internal/notifications/retry/route");
  nl = await import("@/modules/notifications/new-lead");
  tr = await import("@/modules/notifications/transport");
  cfgmod = await import("@/modules/notifications/config");
  svc = await import("@/modules/leads/service");
  dbmod = await import("@/db/client");
  schema = await import("@/db/schema");
  orm = await import("drizzle-orm");
});
after(async () => {
  Object.assign(console, origs);
  tr.setEmailTransport(undefined);
  await dbmod.closeDb();
  rmSync(TMP, { recursive: true, force: true });
});

describe("1. Autenticazione della rotta", () => {
  test("senza intestazione, con token errato, con schema errato o con il token nell'URL: 401 e nessuna elaborazione", async () => {
    const p = arm();
    const id = await leadIn();
    const attempts: [Record<string, string>, { url?: string }][] = [
      [{}, {}],
      [{ authorization: "Bearer " + "x".repeat(TOKEN.length) }, {}],
      [{ authorization: `Bearer ${TOKEN.slice(0, -1)}` }, {}],
      [{ authorization: `Basic ${TOKEN}` }, {}],
      [{ authorization: TOKEN }, {}],
      [{}, { url: `http://localhost/api/internal/notifications/retry?token=${TOKEN}` }],
      [{ "x-notify-retry-token": TOKEN }, {}],
    ];
    for (const [h, init] of attempts) {
      const res = await call(h, init);
      assert.equal(res.status, 401, JSON.stringify(Object.keys(h)));
      assert.equal(res.headers.get("www-authenticate"), "Bearer");
      assert.deepEqual(await res.json(), { error: "Non autorizzato" });
    }
    assert.equal(p.attempts, 0, "nessun invio senza autenticazione");
    assert.equal((await row(id)).notificationStatus, "pending");
  });

  test("solo POST: non esistono altri metodi", () => {
    for (const m of ["GET", "PUT", "PATCH", "DELETE"]) assert.ok(!(m in route), m);
  });

  test("token non configurato o troppo corto: 404, nulla viene elaborato", async () => {
    const p = arm();
    await leadIn();
    for (const v of [undefined, "", "corto", "x".repeat(cfgmod.MIN_RETRY_TOKEN_LENGTH - 1), "con spazi " + "y".repeat(40)]) {
      const prev = process.env.NOTIFY_RETRY_TOKEN;
      try {
        if (v === undefined) delete process.env.NOTIFY_RETRY_TOKEN;
        else process.env.NOTIFY_RETRY_TOKEN = v;
        const res = await call({ authorization: `Bearer ${v ?? TOKEN}` });
        assert.equal(res.status, 404);
        assert.equal(await res.text(), "");
      } finally {
        process.env.NOTIFY_RETRY_TOKEN = prev;
      }
    }
    assert.equal(p.attempts, 0);
  });

  test("troppi tentativi con token errato dallo stesso IP: 429 (e il token giusto di un altro IP funziona)", async () => {
    arm();
    const ip = "203.0.113.200";
    let last = 0;
    for (let i = 0; i < 31; i++) {
      last = (await route.POST(new Request("http://localhost/x", { method: "POST", headers: { "x-forwarded-for": ip, authorization: "Bearer sbagliato" } }))).status;
    }
    assert.equal(last, 429);
    assert.equal((await authed()).status, 200);
  });

  test("token corretto: 200 con soli conteggi (nessun id, codice, indirizzo o dato personale)", async () => {
    arm();
    const id = await leadIn();
    const res = await authed();
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "private, no-store");
    const text = await res.text();
    const body = JSON.parse(text) as Record<string, unknown>;
    assert.deepEqual(Object.keys(body).sort(), ["candidates", "configured", "failed", "notClaimed", "sent", "throttled", "unsent"]);
    assert.ok(Object.values(body).every((v) => typeof v === "number" || typeof v === "boolean"));
    const lead = await row(id);
    for (const secret of [id, lead.code, TOKEN, TO, "Mario", "Verdi", "3331234567"]) assert.ok(!text.includes(secret));
  });
});

describe("2. Quali notifiche si recuperano", () => {
  test("solo quelle pendenti o recuperabili, entro la finestra di 7 giorni e il tetto di tentativi", async () => {
    // parte da un database pulito: ciò che è rimasto dai test precedenti non è oggetto di questa verifica
    await (await dbmod.getDb()).update(schema.leads).set({ notificationStatus: "skipped" });
    const pendingOld = await leadIn();
    const pendingFresh = await leadIn({ createdAt: minutesAgo(0) });
    const legacy = await leadIn({ notificationStatus: "skipped" });
    const alreadySent = await leadIn({ notificationStatus: "sent", notificationSentAt: minutesAgo(3) });
    const tooOld = await leadIn({ createdAt: minutesAgo((nl.RETRY_WINDOW_DAYS + 1) * 24 * 60) });
    const failedCooling = await leadIn({ notificationStatus: "failed", notificationAttempts: 1, notificationClaimedAt: minutesAgo(1) });
    const failedReady = await leadIn({ notificationStatus: "failed", notificationAttempts: 2, notificationClaimedAt: minutesAgo(nl.RETRY_AFTER_MINUTES + 1) });
    const exhausted = await leadIn({ notificationStatus: "failed", notificationAttempts: nl.MAX_ATTEMPTS, notificationClaimedAt: minutesAgo(600) });
    const sendingFresh = await leadIn({ notificationStatus: "sending", notificationAttempts: 1, notificationClaimedAt: minutesAgo(1) });
    const sendingStale = await leadIn({ notificationStatus: "sending", notificationAttempts: 1, notificationClaimedAt: minutesAgo(nl.RETRY_AFTER_MINUTES + 1) });

    const p = arm();
    const res = await authed();
    const body = (await res.json()) as { candidates: number; sent: number; failed: number };
    assert.equal(res.status, 200);
    assert.deepEqual([body.candidates, body.sent, body.failed], [3, 3, 0]);
    assert.equal(p.attempts, 3);

    const status = async (id: string) => (await row(id)).notificationStatus;
    for (const id of [pendingOld, failedReady, sendingStale]) assert.equal(await status(id), "sent");
    assert.equal(await status(pendingFresh), "pending");
    assert.equal(await status(legacy), "skipped");
    assert.equal(await status(alreadySent), "sent");
    assert.equal((await row(alreadySent)).notificationAttempts, 0, "già inviata: nessun nuovo tentativo");
    assert.equal(await status(tooOld), "pending");
    assert.equal(await status(failedCooling), "failed");
    assert.equal((await row(failedCooling)).notificationAttempts, 1);
    assert.equal(await status(exhausted), "failed");
    assert.equal((await row(exhausted)).notificationAttempts, nl.MAX_ATTEMPTS);
    assert.equal(await status(sendingFresh), "sending");
  });

  test("a ogni giro al massimo 10 richieste, le più vecchie per prime; le altre al giro successivo", async () => {
    // ripulisce lo stato dei test precedenti: tutto ciò che è ancora recuperabile viene segnato come già inviato
    const db = await dbmod.getDb();
    await db.update(schema.leads).set({ notificationStatus: "skipped" });
    const ids: string[] = [];
    for (let i = 0; i < 12; i++) ids.push(await leadIn({ createdAt: minutesAgo(60 - i) }));
    arm();
    const first = (await (await authed()).json()) as { candidates: number; sent: number };
    assert.deepEqual([first.candidates, first.sent], [10, 10]);
    assert.equal((await row(ids[0])).notificationStatus, "sent");
    assert.equal((await row(ids[11])).notificationStatus, "pending");
    const second = (await (await authed()).json()) as { candidates: number; sent: number };
    assert.deepEqual([second.candidates, second.sent], [2, 2]);
  });

  test("notifiche non configurate sul sito: 200 con configured=false, nessun tentativo", async () => {
    const id = await leadIn();
    tr.setEmailTransport(null);
    const body = (await (await authed()).json()) as { configured: boolean; sent: number; candidates: number };
    assert.deepEqual([body.configured, body.sent, body.candidates], [false, 0, 0]);
    assert.equal((await row(id)).notificationStatus, "pending");
  });
});

describe("3. Errori del provider: i tentativi successivi non si interrompono", () => {
  test("errore o eccezione del provider: la rotta risponde 200, la richiesta resta recuperabile e viene inviata al giro dopo", async () => {
    for (const mode of ["fail", "throw"] as const) {
      const db = await dbmod.getDb();
      await db.update(schema.leads).set({ notificationStatus: "skipped" });
      const id = await leadIn();
      const p = arm(mode);
      const first = await authed();
      assert.equal(first.status, 200, mode);
      assert.deepEqual(await first.json(), { configured: true, candidates: 1, sent: 0, failed: 1, throttled: 0, notClaimed: 0, unsent: 1 });
      const r1 = await row(id);
      assert.equal(r1.notificationStatus, "failed");
      assert.equal(r1.notificationAttempts, 1);
      assert.ok(r1.notificationError);

      // subito dopo: ancora in attesa del tempo minimo, nessun nuovo tentativo
      const again = (await (await authed()).json()) as { candidates: number };
      assert.equal(again.candidates, 0);
      assert.equal(p.attempts, 1);

      // passato il tempo minimo, con il provider tornato sano, parte
      await patch(id, { notificationClaimedAt: minutesAgo(nl.RETRY_AFTER_MINUTES + 1) });
      p.mode = "ok";
      const later = (await (await authed()).json()) as { sent: number; unsent: number };
      assert.deepEqual([later.sent, later.unsent], [1, 0]);
      assert.equal((await row(id)).notificationStatus, "sent");
    }
  });

  test("un provider che fallisce non blocca le altre richieste dello stesso giro né i giri successivi", async () => {
    const db = await dbmod.getDb();
    await db.update(schema.leads).set({ notificationStatus: "skipped" });
    const a = await leadIn();
    const b = await leadIn();
    const flaky = new Provider();
    let n = 0;
    flaky.send = async (msg: EmailMessage) => {
      n++;
      if (n === 1) return { ok: false as const, code: "http_500" };
      flaky.delivered.add(msg.idempotencyKey);
      return { ok: true as const };
    };
    tr.setEmailTransport(flaky);
    const res = (await (await authed()).json()) as { sent: number; failed: number };
    assert.deepEqual([res.sent, res.failed], [1, 1]);
    assert.deepEqual([(await row(a)).notificationStatus, (await row(b)).notificationStatus].sort(), ["failed", "sent"]);
  });

  test("tentativi esauriti: la richiesta non viene più riprovata, ma resta segnalata come «senza notifica»", async () => {
    const db = await dbmod.getDb();
    await db.update(schema.leads).set({ notificationStatus: "skipped" });
    const id = await leadIn({ notificationStatus: "failed", notificationAttempts: nl.MAX_ATTEMPTS - 1, notificationClaimedAt: minutesAgo(30) });
    const p = arm("fail");
    const first = (await (await authed()).json()) as { failed: number };
    assert.equal(first.failed, 1);
    assert.equal((await row(id)).notificationAttempts, nl.MAX_ATTEMPTS);
    await patch(id, { notificationClaimedAt: minutesAgo(60) });
    const second = (await (await authed()).json()) as { candidates: number; unsent: number };
    assert.deepEqual([second.candidates, second.unsent], [0, 1]);
    assert.equal(p.attempts, 1);
  });
});

describe("4. Esecuzioni concorrenti: nessun invio duplicato", () => {
  test("4 chiamate simultanee alla rotta + il recupero del back office: ogni richiesta parte una sola volta", async () => {
    const db = await dbmod.getDb();
    await db.update(schema.leads).set({ notificationStatus: "skipped" });
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) ids.push(await leadIn());
    const p = arm();
    p.delayMs = 40;
    const runs = await Promise.all([authed(), authed(), authed(), authed(), nl.retryPendingNotifications(10)]);
    for (const r of runs.slice(0, 4) as Response[]) assert.equal(r.status, 200);

    assert.equal(p.attempts, 6, "un solo invio per richiesta");
    assert.equal(p.delivered.size, 6);
    for (const id of ids) {
      const r = await row(id);
      assert.equal(r.notificationStatus, "sent");
      assert.equal(r.notificationAttempts, 1);
    }
    const totalSent = (await Promise.all(runs.slice(0, 4).map((r) => (r as Response).clone().json()))).reduce((a, b) => a + (b as { sent: number }).sent, 0);
    assert.ok(totalSent <= 6);
  });

  test("richiesta già inviata da un'altra esecuzione mentre questa lavora: nessun secondo invio", async () => {
    const db = await dbmod.getDb();
    await db.update(schema.leads).set({ notificationStatus: "skipped" });
    const id = await leadIn();
    const p = arm();
    p.delayMs = 60;
    const [a, b] = await Promise.all([nl.notifyNewLead(id), nl.notifyNewLead(id)]);
    assert.deepEqual([a, b].sort(), ["not_claimed", "sent"]);
    assert.equal(p.attempts, 1);
  });
});

describe("5. Il token non compare né nei log né nelle risposte", () => {
  test("nessun log contiene il token (nemmeno con provider rotto e richieste non autorizzate)", async () => {
    arm("throw");
    await leadIn();
    await call({ authorization: `Bearer ${TOKEN}` });
    await call({ authorization: `Bearer ${TOKEN}x` });
    assert.ok(logged.length > 0);
    assert.ok(logged.every((l) => !l.includes(TOKEN)));
  });

  test("avviso di configurazione senza valori; token valido solo se lungo e senza spazi", () => {
    const e = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;
    const on = { RESEND_API_KEY: "k", NOTIFY_EMAIL_TO: TO, NOTIFY_EMAIL_FROM: "Test <n@example.invalid>" };
    assert.equal(cfgmod.loadRetryToken(e({ NOTIFY_RETRY_TOKEN: TOKEN })), TOKEN);
    assert.equal(cfgmod.loadRetryToken(e({ NOTIFY_RETRY_TOKEN: "Zq9-x" })), null);
    assert.equal(cfgmod.loadRetryToken(e({})), null);
    assert.deepEqual(cfgmod.notificationWarnings(e({ ...on, NOTIFY_RETRY_TOKEN: TOKEN })), []);
    const w = cfgmod.notificationWarnings(e({ ...on, NOTIFY_RETRY_TOKEN: "Zq9-x" })).join(" ");
    assert.match(w, /NOTIFY_RETRY_TOKEN/);
    assert.ok(!w.includes("Zq9-x"), "l'avviso non riporta il valore");
  });
});

// ---- script chiamato da GitHub Actions ---------------------------------------------------------------------------------
type Seen = { method: string; url: string; headers: IncomingMessage["headers"] };
describe("6. Script scripts/notify-retry/call.sh (server HTTP locale, nessuna rete esterna)", () => {
  let server: Server;
  let port = 0;
  const seen: Seen[] = [];
  let allowedFile = "";
  let reply: { status: number; body: string } = { status: 200, body: "" };
  const JSON_OK = '{"configured":true,"candidates":2,"sent":2,"failed":0,"notClaimed":0,"unsent":0}';

  before(async () => {
    server = createServer((req, res) => {
      seen.push({ method: req.method ?? "", url: req.url ?? "", headers: req.headers });
      res.writeHead(reply.status, { "content-type": "application/json" });
      res.end(reply.body);
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.address() as { port: number }).port;
    allowedFile = path.join(TMP, "allowed-origins.txt");
    writeFileSync(allowedFile, `# origini di prova\nhttp://127.0.0.1:${port}\n`);
  });
  after(() => new Promise<void>((r) => server.close(() => r())));

  const run = (env: Record<string, string | undefined>) =>
    new Promise<{ code: number; out: string }>((resolve) => {
      const clean = { ...process.env };
      delete clean.NOTIFY_RETRY_URL;
      delete clean.NOTIFY_RETRY_TOKEN;
      delete clean.NOTIFY_RETRY_ALLOWED_ORIGINS_FILE;
      const withAllow = { NOTIFY_RETRY_ALLOWED_ORIGINS_FILE: allowedFile, ...env };
      execFile("bash", ["scripts/notify-retry/call.sh"], { env: { ...clean, ...withAllow } as NodeJS.ProcessEnv, timeout: 30_000 }, (err, stdout, stderr) =>
        resolve({ code: err ? ((err as { code?: number }).code ?? 1) : 0, out: stdout + stderr }),
      );
    });
  const url = () => `http://127.0.0.1:${port}`;

  test("200: POST sul percorso giusto, token solo nell'intestazione, riepilogo dei conteggi, uscita 0", async () => {
    seen.length = 0;
    reply = { status: 200, body: JSON_OK };
    const r = await run({ NOTIFY_RETRY_URL: url() + "/", NOTIFY_RETRY_TOKEN: TOKEN });
    assert.equal(r.code, 0, r.out);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].method, "POST");
    assert.equal(seen[0].url, "/api/internal/notifications/retry");
    assert.equal(seen[0].headers.authorization, `Bearer ${TOKEN}`);
    assert.ok(!seen[0].url.includes(TOKEN));
    assert.match(r.out, /recuperabili=2 inviate=2 fallite=0 sospese=0 ancora senza notifica=0/);
    assert.ok(!r.out.includes(TOKEN), "il token non compare nell'output");
    assert.doesNotMatch(r.out, /::(warning|error)::/);
  });

  test("invii falliti o notifiche non configurate: uscita 0 ma con avviso (il giro dopo riprova)", async () => {
    reply = { status: 200, body: '{"configured":true,"candidates":1,"sent":0,"failed":1,"notClaimed":0,"unsent":1}' };
    let r = await run({ NOTIFY_RETRY_URL: url(), NOTIFY_RETRY_TOKEN: TOKEN });
    assert.equal(r.code, 0);
    assert.match(r.out, /::warning::/);
    reply = { status: 200, body: '{"configured":false,"candidates":0,"sent":0,"failed":0,"notClaimed":0,"unsent":0}' };
    r = await run({ NOTIFY_RETRY_URL: url(), NOTIFY_RETRY_TOKEN: TOKEN });
    assert.equal(r.code, 0);
    assert.match(r.out, /::warning::.*non sono configurate/);
  });

  test("401 e 404: uscita 1 con messaggio chiaro; il corpo della risposta e il token non vengono stampati", async () => {
    for (const [status, re] of [[401, /rifiutato \(401\)/], [404, /non attivo sul sito \(404\)/]] as const) {
      reply = { status, body: "CORPO-DA-NON-STAMPARE" };
      const r = await run({ NOTIFY_RETRY_URL: url(), NOTIFY_RETRY_TOKEN: TOKEN });
      assert.equal(r.code, 1);
      assert.match(r.out, re);
      assert.ok(!r.out.includes("CORPO-DA-NON-STAMPARE") && !r.out.includes(TOKEN));
    }
  });

  test("configurazione mancante o non valida: uscita 1 e nessuna richiesta di rete", async () => {
    seen.length = 0;
    for (const env of [
      { NOTIFY_RETRY_URL: url() },
      { NOTIFY_RETRY_TOKEN: TOKEN },
      { NOTIFY_RETRY_URL: "https://esempio.it/percorso", NOTIFY_RETRY_TOKEN: TOKEN },
      { NOTIFY_RETRY_URL: "ftp://esempio.it", NOTIFY_RETRY_TOKEN: TOKEN },
      { NOTIFY_RETRY_URL: "http://sito-non-cifrato.example", NOTIFY_RETRY_TOKEN: TOKEN },
      { NOTIFY_RETRY_URL: "https://esempio.it?x=1", NOTIFY_RETRY_TOKEN: TOKEN },
    ]) {
      const r = await run(env);
      assert.equal(r.code, 1, JSON.stringify(Object.keys(env)));
      assert.ok(!r.out.includes(TOKEN));
    }
    assert.equal(seen.length, 0);
  });

  test("origine NON autorizzata (anche se https valido o con host simile): il token non viene inviato, nessuna richiesta", async () => {
    seen.length = 0;
    for (const evil of ["https://sito-estraneo.example", `http://127.0.0.1:${port + 1}`, `http://127.0.0.1:${port}.evil.example`, "https://papaya-taffy-ba2f1a.netlify.app.evil.example"]) {
      const r = await run({ NOTIFY_RETRY_URL: evil, NOTIFY_RETRY_TOKEN: TOKEN });
      assert.equal(r.code, 1, evil);
      assert.match(r.out, /non è tra le origini autorizzate.*il token NON è stato inviato|non valido/, evil);
      assert.ok(!r.out.includes(TOKEN));
    }
    // il file di origini non è leggibile o è vuoto: stesso risultato
    const empty = path.join(TMP, "vuoto.txt");
    writeFileSync(empty, "# nessuna origine\n");
    for (const f of [empty, path.join(TMP, "non-esiste.txt")]) {
      const r = await run({ NOTIFY_RETRY_URL: url(), NOTIFY_RETRY_TOKEN: TOKEN, NOTIFY_RETRY_ALLOWED_ORIGINS_FILE: f });
      assert.equal(r.code, 1);
    }
    assert.equal(seen.length, 0, "nessuna richiesta di rete verso nessuno");
  });

  test("i reindirizzamenti non vengono seguiti: il token non può finire altrove", async () => {
    const other: Seen[] = [];
    const second = createServer((req, res) => {
      other.push({ method: req.method ?? "", url: req.url ?? "", headers: req.headers });
      res.writeHead(200).end("{}");
    });
    await new Promise<void>((r) => second.listen(0, "127.0.0.1", r));
    const p2 = (second.address() as { port: number }).port;
    server.removeAllListeners("request");
    server.on("request", (req, res) => {
      seen.push({ method: req.method ?? "", url: req.url ?? "", headers: req.headers });
      res.writeHead(302, { location: `http://127.0.0.1:${p2}/rubato` }).end();
    });
    try {
      const r = await run({ NOTIFY_RETRY_URL: url(), NOTIFY_RETRY_TOKEN: TOKEN });
      assert.equal(r.code, 1);
      assert.match(r.out, /HTTP 302/);
      assert.equal(other.length, 0, "il secondo server non ha ricevuto nulla");
    } finally {
      await new Promise<void>((r) => second.close(() => r()));
      server.removeAllListeners("request");
      server.on("request", (req, res) => {
        seen.push({ method: req.method ?? "", url: req.url ?? "", headers: req.headers });
        res.writeHead(reply.status, { "content-type": "application/json" });
        res.end(reply.body);
      });
    }
  });

  test("il file di origini autorizzate nel repository: solo https, senza jolly, con il sito atteso", () => {
    const lines = readFileSync("scripts/notify-retry/allowed-origins.txt", "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
    assert.ok(lines.length >= 1);
    for (const l of lines) assert.match(l, /^https:\/\/[a-z0-9.-]+$/, l);
    assert.ok(lines.every((l) => !l.includes("*")));
    assert.ok(lines.includes("https://papaya-taffy-ba2f1a.netlify.app"));
  });

  test("il workflow è disattivato finché non si imposta NOTIFY_RETRY_ENABLED, non si sovrappone e non contiene segreti", () => {
    const wf = readFileSync(".github/workflows/notify-retry.yml", "utf8");
    assert.match(wf, /vars\.NOTIFY_RETRY_ENABLED == 'true'/);
    assert.match(wf, /cancel-in-progress: false/);
    assert.match(wf, /secrets\.NOTIFY_RETRY_TOKEN/);
    assert.match(wf, /schedule:/);
    assert.doesNotMatch(wf, new RegExp(TOKEN));
    assert.doesNotMatch(wf, /NOTIFY_RETRY_TOKEN:\s*[A-Za-z0-9]{20,}/);
  });
});
