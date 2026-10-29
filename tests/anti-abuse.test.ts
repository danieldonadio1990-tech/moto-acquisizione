/**
 * Protezioni anti-abuso: rate limit condiviso su database, gettone anti-bot del modulo, limite giornaliero delle notifiche.
 * Nessuna email reale (provider finto). Database: PGlite temporaneo, oppure PostgreSQL vero con TEST_DATABASE_URL
 * (in quel caso le prove di concorrenza usano connessioni parallele vere). Esecuzione: npm test
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { EmailMessage, EmailTransport, SendResult } from "@/modules/notifications/transport";

const TMP = mkdtempSync(path.join(tmpdir(), "moto-abuse-test-"));
Object.assign(process.env, {
  NODE_ENV: "test",
  PGLITE_DIR: path.join(TMP, "db"),
  UPLOADS_DIR: path.join(TMP, "uploads"),
  SESSION_SECRET: "test-secret-test-secret-test-secret-123456",
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
  DB_POOL_MAX: "10",
  STORAGE_DRIVER: "",
  ADMIN_PASSWORD: "",
  RESEND_API_KEY: "dummy-key-not-real",
  NOTIFY_EMAIL_TO: "notifiche@example.invalid",
  FORM_TOKEN_REQUIRED: "false",
});
delete process.env.RATE_LIMIT_DISABLED;

type Mode = "ok" | "fail";
class Provider implements EmailTransport {
  mode: Mode = "ok";
  delayMs = 0;
  sent: EmailMessage[] = [];
  attempts = 0;
  async send(msg: EmailMessage): Promise<SendResult> {
    this.attempts++;
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    if (this.mode === "fail") return { ok: false, code: "http_503" };
    this.sent.push(msg);
    return { ok: true };
  }
}

let rl: typeof import("@/lib/rate-limit");
let ft: typeof import("@/modules/leads/form-token");
let leadsRoute: typeof import("@/app/api/leads/route");
let tokenRoute: typeof import("@/app/api/leads/form-token/route");
let nl: typeof import("@/modules/notifications/new-lead");
let tr: typeof import("@/modules/notifications/transport");
let cfgmod: typeof import("@/modules/notifications/config");
let statusmod: typeof import("@/modules/notifications/status");
let svc: typeof import("@/modules/leads/service");
let dbmod: typeof import("@/db/client");
let schema: typeof import("@/db/schema");
let orm: typeof import("drizzle-orm");
let provider: Provider;

before(async () => {
  rl = await import("@/lib/rate-limit");
  ft = await import("@/modules/leads/form-token");
  leadsRoute = await import("@/app/api/leads/route");
  tokenRoute = await import("@/app/api/leads/form-token/route");
  nl = await import("@/modules/notifications/new-lead");
  tr = await import("@/modules/notifications/transport");
  cfgmod = await import("@/modules/notifications/config");
  statusmod = await import("@/modules/notifications/status");
  svc = await import("@/modules/leads/service");
  dbmod = await import("@/db/client");
  schema = await import("@/db/schema");
  orm = await import("drizzle-orm");
});
after(async () => {
  tr.setEmailTransport(undefined);
  await dbmod.closeDb();
  rmSync(TMP, { recursive: true, force: true });
});

const rnd = () => randomUUID().slice(0, 8);
let phoneSeq = 3330000000 + Math.floor(Math.random() * 90_000_000);
const submission = (over: { phone?: string; email?: string; formToken?: string; submissionId?: string } = {}) => ({
  submissionId: over.submissionId ?? randomUUID(),
  motorcycle: { brand: "Honda", modelId: "honda-sh", year: 2019, displacement: 125 },
  mileage: 18000,
  condition: { isRunning: true, accident: "no" as const, mechanicalIssues: "no" as const, maintenance: "yes" as const },
  contact: {
    firstName: "Prova",
    lastName: "Test",
    phone: over.phone ?? `+39${phoneSeq++}`,
    email: over.email ?? `prova.${rnd()}@example.invalid`,
    city: "Milano",
    preferredContact: "email" as const,
    privacyConsent: true as const,
  },
  ...(over.formToken ? { formToken: over.formToken } : {}),
});
let ipSeq = 1;
const nextIp = () => `203.0.113.${(ipSeq++ % 250) + 1}`;
const post = (body: unknown, ip = nextIp()) =>
  leadsRoute.POST(new Request("http://localhost/api/leads", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", "x-forwarded-for": ip } }));
const arm = (mode: Mode = "ok") => {
  provider = new Provider();
  provider.mode = mode;
  tr.setEmailTransport(provider);
  return provider;
};
async function row(id: string) {
  const db = await dbmod.getDb();
  return (await db.select().from(schema.leads).where(orm.eq(schema.leads.id, id)))[0];
}
async function patch(id: string, set: Record<string, unknown>) {
  const db = await dbmod.getDb();
  await db.update(schema.leads).set(set).where(orm.eq(schema.leads.id, id));
}
const minutesAgo = (m: number) => orm.sql`now() - make_interval(mins => ${m})`;

describe("1. Rate limit condiviso su database", () => {
  const rule = { name: `t-${rnd()}`, limit: 3, windowMs: 60_000, shared: true };

  test("conta in modo atomico anche con colpi simultanei e blocca oltre il limite", async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => rl.rateLimit(rule, "valore-condiviso")));
    assert.equal(results.filter((r) => r.ok).length, 3, "passano esattamente 3 colpi su 20");
    assert.ok(results.every((r) => r.retryAfterSec >= 1 && r.retryAfterSec <= 60));
    const other = await rl.rateLimit(rule, "un-altro-valore");
    assert.equal(other.ok, true, "un altro valore ha il suo contatore");
  });

  test("nel database non finiscono IP, telefoni o email in chiaro (solo hash)", async () => {
    const secrets = ["198.51.100.77", "+393331112222", "persona.privata@example.invalid"];
    for (const v of secrets) await rl.rateLimit(rule, v);
    const db = await dbmod.getDb();
    const rows = await db.select().from(schema.rateLimitBuckets);
    assert.ok(rows.length >= 4);
    const raw = JSON.stringify(rows);
    for (const v of secrets) assert.ok(!raw.includes(v), `«${v}» non deve comparire`);
    assert.ok(rows.every((r) => /^[a-z0-9-]+:[A-Za-z0-9_-]{32}$/.test(r.key)));
  });

  test("la finestra scade: dopo reset_at il contatore riparte; release restituisce un colpo", async () => {
    const r2 = { name: `t-${rnd()}`, limit: 2, windowMs: 60_000, shared: true };
    assert.equal((await rl.rateLimit(r2, "k")).ok, true);
    assert.equal((await rl.rateLimit(r2, "k")).ok, true);
    assert.equal((await rl.rateLimit(r2, "k")).ok, false);
    await rl.releaseRateLimit(r2, "k"); // 3 → 2
    assert.equal((await rl.rateLimit(r2, "k")).ok, false, "dopo il rilascio il colpo successivo è ancora il terzo");
    const db = await dbmod.getDb();
    await db.update(schema.rateLimitBuckets).set({ resetAt: minutesAgo(1) }).where(orm.like(schema.rateLimitBuckets.key, `${r2.name}:%`));
    assert.equal((await rl.rateLimit(r2, "k")).ok, true, "finestra scaduta: riparte da 1");
  });

  test("se il database non risponde il limite ripiega sulla memoria (fail-open) invece di bloccare i clienti", async () => {
    const warn = console.warn;
    const warned: string[] = [];
    console.warn = (...a: unknown[]) => void warned.push(a.map(String).join(" "));
    try {
      rl.setSharedRateLimitStore({
        hit() {
          throw new Error("database giù");
        },
        reset() {},
        release() {},
      });
      const r3 = { name: `t-${rnd()}`, limit: 2, windowMs: 60_000, shared: true };
      const out = [await rl.rateLimit(r3, "x"), await rl.rateLimit(r3, "x"), await rl.rateLimit(r3, "x")];
      assert.deepEqual(out.map((o) => o.ok), [true, true, false], "il limite vale comunque sull'istanza");
      assert.ok(warned.some((w) => w.includes("memoria dell'istanza")));
    } finally {
      rl.setSharedRateLimitStore(null);
      console.warn = warn;
    }
  });

  test("le regole delicate sono condivise; quelle ad alto volume restano in memoria", () => {
    for (const k of ["leadCreatePerIp", "leadCreatePerPhone", "leadCreatePerEmail", "leadCreatePerFormToken", "loginPerIp", "loginPerIpEmail", "notifyRetryPerIp"] as const) {
      assert.equal(rl.RULES[k].shared, true, k);
    }
    for (const k of ["eventsPerIp", "photoUploadPerIp", "photoUploadPerLead", "formTokenPerIp"] as const) assert.ok(!("shared" in rl.RULES[k]), k);
  });
});

describe("2. Creazione richieste: limiti per IP e per contatto, senza penalizzare chi sta dietro lo stesso IP", () => {
  test("10 persone diverse dietro lo STESSO IP: tutte accettate; il tredicesimo invio nell'ora è limitato", async () => {
    tr.setEmailTransport(null);
    const ip = "198.51.100.200";
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await post(submission(), ip)).status);
    assert.deepEqual(codes, Array(12).fill(201), "fino a 12 richieste diverse nell'ora dallo stesso IP");
    const res = await post(submission(), ip);
    assert.equal(res.status, 429);
    assert.ok(Number(res.headers.get("retry-after")) >= 1);
    assert.match(((await res.json()) as { error: string }).error, /troppe richieste/i);
    // un altro IP non risente di quel limite
    assert.equal((await post(submission(), "198.51.100.201")).status, 201);
  });

  test("lo stesso telefono (o la stessa email) da IP diversi: dalla quarta richiesta del giorno si limita, con un messaggio chiaro", async () => {
    tr.setEmailTransport(null);
    const phone = "+393399990001";
    const results: number[] = [];
    for (let i = 0; i < 4; i++) results.push((await post(submission({ phone }))).status);
    assert.deepEqual(results, [201, 201, 201, 429]);
    const blocked = await post(submission({ phone }));
    assert.match(((await blocked.json()) as { error: string }).error, /già ricevuto alcune richieste con questi contatti/);

    const email = `stessa.${rnd()}@example.invalid`;
    const r2: number[] = [];
    for (let i = 0; i < 4; i++) r2.push((await post(submission({ email }))).status);
    assert.deepEqual(r2, [201, 201, 201, 429]);
  });

  test("un invio ripetuto (stesso submissionId) non viene mai bloccato dai limiti", async () => {
    tr.setEmailTransport(null);
    const phone = "+393399990002";
    const first = submission({ phone });
    assert.equal((await post(first)).status, 201);
    for (let i = 0; i < 3; i++) assert.equal((await post(submission({ phone }))).status, i < 2 ? 201 : 429);
    assert.equal((await post(first)).status, 200, "il retry dello stesso invio passa comunque");
  });

  test("le richieste rifiutate dai limiti NON creano nessun lead; quelle accettate sì", async () => {
    tr.setEmailTransport(null);
    const phone = "+393399990003";
    const db = await dbmod.getDb();
    const before = (await db.select({ n: orm.sql<number>`count(*)::int` }).from(schema.customers).where(orm.eq(schema.customers.phone, phone)))[0].n;
    for (let i = 0; i < 6; i++) await post(submission({ phone }));
    const after = (await db.select({ n: orm.sql<number>`count(*)::int` }).from(schema.customers).where(orm.eq(schema.customers.phone, phone)))[0].n;
    assert.equal(after - before, 3);
  });
});

describe("3. Gettone anti-bot del modulo", () => {
  const withRequired = async (fn: () => Promise<void>) => {
    process.env.FORM_TOKEN_REQUIRED = "true";
    try {
      await fn();
    } finally {
      process.env.FORM_TOKEN_REQUIRED = "false";
    }
  };
  const reason = async (res: Response) => ((await res.json()) as { reason?: string }).reason;

  test("obbligatorio in produzione e opzionale altrove; ogni controllo rifiuta con 422 e un motivo", async () => {
    assert.equal(ft.formTokenRequired({ NODE_ENV: "production" } as unknown as NodeJS.ProcessEnv), true);
    assert.equal(ft.formTokenRequired({ NODE_ENV: "development" } as unknown as NodeJS.ProcessEnv), false);
    assert.equal(ft.formTokenRequired({ NODE_ENV: "production", FORM_TOKEN_REQUIRED: "false" } as unknown as NodeJS.ProcessEnv), false);
    await withRequired(async () => {
      tr.setEmailTransport(null);
      const ok = ft.issueFormToken(Date.now() - 10_000);
      const cases: [string | undefined, string][] = [
        [undefined, "form_token_missing"],
        ["spazzatura", "form_token_invalid"],
        [ok.slice(0, -2) + "xx", "form_token_invalid"],
        [ok.replace(/^\d+/, String(Date.now() - 20_000)), "form_token_invalid"], // data alterata: la firma non torna
        [ft.issueFormToken(Date.now()), "form_token_too_fast"],
        [ft.issueFormToken(Date.now() - 3 * 60 * 60 * 1000), "form_token_expired"],
      ];
      for (const [t, why] of cases) {
        const res = await post(submission({ formToken: t }));
        assert.equal(res.status, 422, why);
        assert.equal(await reason(res), why);
      }
      assert.equal((await post(submission({ formToken: ok }))).status, 201, "gettone valido");
    });
  });

  test("un gettone genera al massimo 3 richieste; un retry dello stesso invio passa anche con gettone scaduto", async () => {
    await withRequired(async () => {
      tr.setEmailTransport(null);
      const token = ft.issueFormToken(Date.now() - 10_000);
      const first = submission({ formToken: token });
      const statuses: number[] = [];
      statuses.push((await post(first)).status);
      for (let i = 0; i < 3; i++) statuses.push((await post(submission({ formToken: token }))).status);
      assert.deepEqual(statuses, [201, 201, 201, 422]);
      // il browser ripete lo STESSO invio più tardi: il lead esiste già, nessun controllo sul gettone
      const stale = { ...first, formToken: ft.issueFormToken(Date.now() - 5 * 60 * 60 * 1000) };
      assert.equal((await post(stale)).status, 200);
    });
  });

  test("GET /api/leads/form-token: un gettone valido, senza dati personali, con un limite per IP", async () => {
    const ip = "192.0.2.150";
    const res = await tokenRoute.GET(new Request("http://localhost/api/leads/form-token", { headers: { "x-forwarded-for": ip } }));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "private, no-store");
    const { token } = (await res.json()) as { token: string };
    assert.equal(ft.checkFormToken(token, Date.now() + 4_000).ok, true);
    assert.equal(ft.checkFormToken(token, Date.now() + 1_000).ok, false, "troppo presto");
    let last = 200;
    for (let i = 0; i < 61; i++) last = (await tokenRoute.GET(new Request("http://localhost/x", { headers: { "x-forwarded-for": ip } }))).status;
    assert.equal(last, 429);
  });

  test("il modulo del sito richiede il gettone all'apertura, lo rinnova e riprova una volta con il gettone nuovo", async () => {
    const { readFileSync } = await import("node:fs");
    const f = readFileSync("src/modules/funnel/Funnel.tsx", "utf8");
    assert.match(f, /\/api\/leads\/form-token/);
    assert.match(f, /formToken: formToken\.current/);
    assert.match(f, /form_token/);
    assert.match(f, /45 \* 60 \* 1000/);
  });
});

describe("4. Limite giornaliero delle notifiche", () => {
  const setLimit = (v: string | undefined) => {
    if (v === undefined) delete process.env.NOTIFY_DAILY_LIMIT;
    else process.env.NOTIFY_DAILY_LIMIT = v;
  };
  const resetBudget = async () => {
    const db = await dbmod.getDb();
    await db.delete(schema.rateLimitBuckets).where(orm.like(schema.rateLimitBuckets.key, "notify-day:%"));
  };
  async function freshLead() {
    tr.setEmailTransport(null);
    const l = await svc.createLead(submission());
    await patch(l.id, { createdAt: minutesAgo(30) });
    return l.id;
  }
  /** porta tutto ciò che è ancora recuperabile a «skipped», così le prove non si influenzano */
  const quiet = async () => {
    const db = await dbmod.getDb();
    await db.update(schema.leads).set({ notificationStatus: "skipped" });
  };

  test("oltre il limite le richieste restano SALVATE (201), la notifica passa a «throttled», con evento e senza consumare tentativi", async () => {
    await quiet();
    await resetBudget();
    setLimit("3");
    const p = arm();
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await post(submission());
      assert.equal(res.status, 201, "la richiesta del cliente non viene mai bloccata dal limite delle notifiche");
      ids.push(((await res.json()) as { id: string }).id);
    }
    assert.equal(p.sent.length, 3, "solo 3 email partite");
    const rows = await Promise.all(ids.map(row));
    assert.deepEqual(rows.map((r) => r.notificationStatus), ["sent", "sent", "sent", "throttled", "throttled"]);
    for (const r of rows.slice(3)) {
      assert.equal(r.notificationError, "daily_limit");
      assert.equal(r.notificationAttempts, 0, "la sospensione non consuma tentativi");
    }
    const db = await dbmod.getDb();
    for (const id of ids.slice(3)) {
      const ev = await db.select().from(schema.events).where(orm.and(orm.eq(schema.events.leadId, id), orm.eq(schema.events.name, "notification_throttled")));
      assert.equal(ev.length, 1, "un solo evento per richiesta");
      assert.deepEqual(ev[0].props, { limit: 3 });
    }
    assert.ok((await nl.countThrottledNotifications()) >= 2);
    assert.ok((await nl.countUnsentNotifications()) >= 2, "le sospese compaiono tra le notifiche non inviate");
    setLimit(undefined);
  });

  test("le sospese ripartono da sole quando il limite lo consente (giorno dopo), le più vecchie per prime", async () => {
    await quiet();
    await resetBudget();
    setLimit("2");
    const p = arm();
    const a = await freshLead();
    const b = await freshLead();
    const c = await freshLead();
    tr.setEmailTransport(p);
    for (const id of [a, b, c]) await nl.notifyNewLead(id);
    assert.deepEqual((await Promise.all([a, b, c].map(row))).map((r) => r.notificationStatus), ["sent", "sent", "throttled"]);
    // stesso giorno: il recupero non sblocca nulla (il limite vale ancora) e non consuma tentativi
    await patch(c, { notificationClaimedAt: minutesAgo(10) });
    assert.equal((await nl.retryNotificationsBatch(10)).throttled, 1);
    assert.equal((await row(c)).notificationAttempts, 0);
    // «giorno dopo»: il contatore del giorno non esiste più
    await resetBudget();
    await patch(c, { notificationClaimedAt: minutesAgo(10) });
    const batch = await nl.retryNotificationsBatch(10);
    assert.deepEqual([batch.sent, batch.throttled], [1, 0]);
    assert.equal((await row(c)).notificationStatus, "sent");
    assert.equal(p.sent.length, 3);
    setLimit(undefined);
  });

  test("un invio fallito restituisce la quota; il retry manuale di un admin non è bloccato dal limite", async () => {
    await quiet();
    await resetBudget();
    setLimit("2");
    const ids = [await freshLead(), await freshLead(), await freshLead()];
    const p = arm("fail");
    for (const id of ids) await nl.notifyNewLead(id);
    assert.deepEqual((await Promise.all(ids.map(row))).map((r) => r.notificationStatus), ["failed", "failed", "failed"], "i fallimenti non hanno consumato la quota");
    p.mode = "ok";
    for (const id of ids) await patch(id, { notificationClaimedAt: minutesAgo(10) });
    for (const id of ids.slice(0, 2)) assert.equal(await nl.notifyNewLead(id), "sent");
    assert.equal(await nl.notifyNewLead(ids[2]), "throttled", "quota finita");
    const manual = await nl.manualRetryNotification(ids[2], "admin@example.invalid");
    assert.equal(manual.outcome, "sent", "l'admin decide: il retry manuale non è bloccato");
    assert.equal(p.sent.length, 3);
    setLimit(undefined);
  });

  test("0 = nessun limite; valore non valido = predefinito (50) con un avviso senza valori", async () => {
    await quiet();
    await resetBudget();
    setLimit("0");
    const ids = [await freshLead(), await freshLead(), await freshLead(), await freshLead()];
    const p = arm();
    for (const id of ids) assert.equal(await nl.notifyNewLead(id), "sent");
    assert.equal(p.sent.length, 4);
    const e = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;
    const on = { RESEND_API_KEY: "k", NOTIFY_EMAIL_TO: "a@example.invalid", NOTIFY_EMAIL_FROM: "Test <n@example.invalid>", NOTIFY_RETRY_TOKEN: "t".repeat(40) };
    assert.equal(cfgmod.parseDailyLimit(e({})).value, 50);
    assert.deepEqual(cfgmod.parseDailyLimit(e({ NOTIFY_DAILY_LIMIT: "abc" })), { value: 50, invalid: true });
    assert.deepEqual(cfgmod.parseDailyLimit(e({ NOTIFY_DAILY_LIMIT: "-3" })), { value: 50, invalid: true });
    const w = cfgmod.notificationWarnings(e({ ...on, NOTIFY_DAILY_LIMIT: "abc" })).join(" ");
    assert.match(w, /NOTIFY_DAILY_LIMIT non valido/);
    assert.ok(!w.includes("abc"));
    assert.deepEqual(cfgmod.notificationWarnings(e({ ...on, NOTIFY_DAILY_LIMIT: "10" })), []);
    setLimit(undefined);
  });

  test("richieste simultanee: il limite non viene superato (contatore atomico)", async () => {
    await quiet();
    await resetBudget();
    setLimit("5");
    const p = arm();
    p.delayMs = 20;
    const ids: string[] = [];
    for (let i = 0; i < 12; i++) ids.push(await freshLead());
    tr.setEmailTransport(p);
    await Promise.all(ids.map((id) => nl.notifyNewLead(id)));
    assert.equal(p.sent.length, 5, "esattamente 5 invii su 12 richieste simultanee");
    const rows = await Promise.all(ids.map(row));
    assert.equal(rows.filter((r) => r.notificationStatus === "throttled").length, 7);
    setLimit(undefined);
  });

  test("lo stato «throttled» è spiegato nel back office e il retry manuale è offerto", () => {
    const d = statusmod.describeNotification({ notificationStatus: "throttled", notificationAttempts: 0, notificationSentAt: null, notificationError: "daily_limit" }, () => "x", 5, true);
    assert.equal(d.label, "Sospesa: limite giornaliero");
    assert.match(d.detail ?? "", /richiesta è salva.*riparte da sola dal giorno dopo.*a mano/);
    arm();
    assert.equal(nl.canOfferManualRetry({ notificationStatus: "throttled", createdAt: new Date() }), true);
    assert.match((statusmod.manualRetryMessage({ outcome: "throttled", error: null, attempts: 0 }, 5) as { error: string }).error, /già inviata o è in corso/);
  });
});
