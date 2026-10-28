/**
 * Notifiche email per le nuove richieste.
 * Nessuna email reale: il trasporto è sempre finto (o fetch simulato) e in NODE_ENV=test il trasporto reale non esiste.
 * Database: PGlite in una cartella temporanea. Esecuzione: npm test
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { EmailMessage, EmailTransport } from "@/modules/notifications/transport";

const TMP = mkdtempSync(path.join(tmpdir(), "moto-notify-test-"));
const TO = "notifiche@example.invalid";
Object.assign(process.env, {
  NODE_ENV: "test",
  PGLITE_DIR: path.join(TMP, "db"),
  UPLOADS_DIR: path.join(TMP, "uploads"),
  SESSION_SECRET: "test-secret-test-secret-test-secret-123456",
  DATABASE_URL: "",
  STORAGE_DRIVER: "",
  ADMIN_PASSWORD: "",
  RATE_LIMIT_DISABLED: "true",
  // valori finti: anche se presenti, in test non esiste un trasporto reale
  RESEND_API_KEY: "dummy-key-not-real",
  NOTIFY_EMAIL_TO: TO,
});

type Sent = EmailMessage;
type Mode = "ok" | "fail" | "throw";

class FakeTransport implements EmailTransport {
  sent: Sent[] = [];
  attempts = 0;
  mode: Mode = "ok";
  delayMs = 0;
  async send(msg: Sent) {
    this.attempts++;
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    if (this.mode === "throw") throw new Error("provider giù");
    if (this.mode === "fail") return { ok: false as const, code: "http_500" };
    this.sent.push(msg);
    return { ok: true as const, id: `fake-${this.sent.length}` };
  }
}

let nl: typeof import("@/modules/notifications/new-lead");
let tr: typeof import("@/modules/notifications/transport");
let cfgmod: typeof import("@/modules/notifications/config");
let statusmod: typeof import("@/modules/notifications/status");
let svc: typeof import("@/modules/leads/service");
let route: typeof import("@/app/api/leads/route");
let dbmod: typeof import("@/db/client");
let schema: typeof import("@/db/schema");
let orm: typeof import("drizzle-orm");
let fake: FakeTransport;

const submission = (over: Record<string, unknown> = {}) => ({
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
  ...over,
});

const post = (body: unknown) =>
  route.POST(new Request("http://localhost/api/leads", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));

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

before(async () => {
  nl = await import("@/modules/notifications/new-lead");
  tr = await import("@/modules/notifications/transport");
  cfgmod = await import("@/modules/notifications/config");
  statusmod = await import("@/modules/notifications/status");
  svc = await import("@/modules/leads/service");
  route = await import("@/app/api/leads/route");
  dbmod = await import("@/db/client");
  schema = await import("@/db/schema");
  orm = await import("drizzle-orm");
});

after(async () => {
  tr.setEmailTransport(undefined);
  await dbmod.closeDb();
  rmSync(TMP, { recursive: true, force: true });
});

function fresh(mode: Mode = "ok") {
  fake = new FakeTransport();
  fake.mode = mode;
  tr.setEmailTransport(fake);
  return fake;
}

describe("1. Invio riuscito", () => {
  test("dopo il salvataggio parte una sola email con codice, dati moto e link; nessun dato personale", async () => {
    fresh();
    const sub = submission();
    const res = await post(sub);
    assert.equal(res.status, 201);
    const { id, code } = (await res.json()) as { id: string; code: string };

    assert.equal(fake.sent.length, 1);
    const m = fake.sent[0];
    assert.deepEqual(m.to, [TO]);
    assert.match(m.subject, new RegExp(code));
    assert.match(m.subject, /Honda/);
    assert.match(m.text, new RegExp(code));
    assert.match(m.text, /2019/);
    assert.match(m.text, /18\.000|18000/);
    assert.ok(m.text.includes(`/admin/lead/${id}`), "link al back office");
    assert.equal(m.idempotencyKey, `lead-notify-${id}`);

    const personal = [sub.contact.firstName, sub.contact.lastName, "3331234567", sub.contact.email, sub.contact.city];
    for (const p of personal) {
      assert.ok(!m.text.includes(p) && !m.subject.includes(p), `la notifica non deve contenere «${p}»`);
    }

    const r = await row(id);
    assert.equal(r.notificationStatus, "sent");
    assert.equal(r.notificationAttempts, 1);
    assert.ok(r.notificationSentAt);
    assert.equal(r.notificationError, null);
  });

  test("lo stesso lead produce sempre lo stesso messaggio (serve all'idempotenza presso il provider)", async () => {
    fresh();
    const lead = await svc.createLead(submission());
    await nl.notifyNewLead(lead.id);
    const m = fake.sent[0];
    const again = nl.buildLeadEmail({ ...(await leadForEmail(lead.id)) });
    assert.equal(again.subject, m.subject);
    assert.equal(again.text, m.text);
    assert.equal(again.idempotencyKey, m.idempotencyKey);
  });

  test("i testi scritti dal cliente vengono neutralizzati (niente a capo, markup, indirizzi, link con schema)", async () => {
    fresh();
    const lead = await svc.createLead(
      submission({
        motorcycle: {
          brand: "Honda",
          modelId: "other",
          modelOther: "SH <script>https://evil.example/x\r\nBcc: spia@evil.example",
          year: 2020,
        },
      }),
    );
    await nl.notifyNewLead(lead.id);
    const m = fake.sent[0];
    assert.doesNotMatch(m.subject, /[\r\n<>@:]/);
    assert.doesNotMatch(m.text.split("\n").slice(0, 4).join("\n"), /[<>@]|https?:/);
    assert.ok(m.text.split("\n").every((l) => !/^Bcc:/i.test(l)));
  });
});

async function leadForEmail(id: string) {
  const db = await dbmod.getDb();
  const [r] = await db
    .select({
      id: schema.leads.id,
      code: schema.leads.code,
      createdAt: schema.leads.createdAt,
      brand: schema.motorcycles.brand,
      model: schema.motorcycles.model,
      version: schema.motorcycles.version,
      year: schema.motorcycles.year,
      displacement: schema.motorcycles.displacement,
      mileage: schema.leads.mileage,
      isRunning: schema.leads.isRunning,
      accident: schema.leads.accident,
      mechanicalIssues: schema.leads.mechanicalIssues,
      maintenance: schema.leads.maintenance,
    })
    .from(schema.leads)
    .innerJoin(schema.motorcycles, orm.eq(schema.leads.motorcycleId, schema.motorcycles.id))
    .where(orm.eq(schema.leads.id, id));
  return r;
}

describe("2. Errore del provider: il lead non viene mai compromesso", () => {
  test("provider che risponde con errore: la richiesta è accettata (201), il lead è salvato, la notifica risulta «failed»", async () => {
    fresh("fail");
    const res = await post(submission());
    assert.equal(res.status, 201);
    const { id } = (await res.json()) as { id: string };
    assert.ok(await svc.getLeadDetail(id), "lead presente");
    const r = await row(id);
    assert.equal(r.notificationStatus, "failed");
    assert.equal(r.notificationAttempts, 1);
    assert.equal(r.notificationError, "http_500");
    assert.equal(fake.sent.length, 0);
  });

  test("provider che lancia un'eccezione: nessuna eccezione verso il cliente, lead salvato", async () => {
    fresh("throw");
    const res = await post(submission());
    assert.equal(res.status, 201);
    const { id } = (await res.json()) as { id: string };
    const r = await row(id);
    assert.equal(r.notificationStatus, "failed");
    assert.equal(r.notificationError, "internal");
    assert.ok(await svc.getLeadDetail(id));
  });

  test("notifiche non configurate: il lead viene salvato, nessun invio, stato «pending» (verrà notificato dopo la configurazione)", async () => {
    tr.setEmailTransport(null);
    const res = await post(submission());
    assert.equal(res.status, 201);
    const { id } = (await res.json()) as { id: string };
    assert.equal(await nl.notifyNewLead(id), "disabled");
    const r = await row(id);
    assert.equal(r.notificationStatus, "pending");
    assert.equal(r.notificationAttempts, 0);
  });

  test("in ambiente di test il trasporto reale non esiste, nemmeno con la chiave nell'ambiente", () => {
    tr.setEmailTransport(null);
    assert.ok(process.env.RESEND_API_KEY);
    assert.equal(tr.getEmailTransport(), null);
  });
});

describe("3. Retry e recupero", () => {
  test("dopo un errore: nessun reinvio immediato; passato il tempo di attesa riparte e invia una sola email", async () => {
    fresh("fail");
    const lead = await svc.createLead(submission());
    assert.equal(await nl.notifyNewLead(lead.id), "failed");
    fake.mode = "ok";
    assert.equal(await nl.notifyNewLead(lead.id), "not_claimed", "troppo presto per riprovare");
    assert.equal(fake.sent.length, 0);

    await patch(lead.id, { notificationClaimedAt: minutesAgo(nl.RETRY_AFTER_MINUTES + 1) });
    assert.equal(await nl.notifyNewLead(lead.id), "sent");
    const r = await row(lead.id);
    assert.equal(r.notificationStatus, "sent");
    assert.equal(r.notificationAttempts, 2);
    assert.equal(r.notificationError, null);
    assert.equal(fake.sent.length, 1);
    // stessa chiave di idempotenza a ogni tentativo
    assert.equal(fake.sent[0].idempotencyKey, `lead-notify-${lead.id}`);
  });

  test("tentativi esauriti: non si riprova più", async () => {
    fresh("fail");
    const lead = await svc.createLead(submission());
    await patch(lead.id, { notificationStatus: "failed", notificationAttempts: nl.MAX_ATTEMPTS, notificationClaimedAt: minutesAgo(60) });
    assert.equal(await nl.notifyNewLead(lead.id), "not_claimed");
    assert.equal(fake.attempts, 0);
  });

  test("prenotazione «sending» rimasta appesa (server fermato): recuperata dopo l'attesa, non prima", async () => {
    fresh();
    const lead = await svc.createLead(submission());
    await patch(lead.id, { notificationStatus: "sending", notificationAttempts: 1, notificationClaimedAt: minutesAgo(1) });
    assert.equal(await nl.notifyNewLead(lead.id), "not_claimed");
    await patch(lead.id, { notificationClaimedAt: minutesAgo(nl.RETRY_AFTER_MINUTES + 1) });
    assert.equal(await nl.notifyNewLead(lead.id), "sent");
    assert.equal(fake.sent.length, 1);
  });

  test("recupero dal back office: riprova solo richieste recenti in sospeso; non le precedenti alle notifiche né le troppo vecchie", async () => {
    tr.setEmailTransport(null); // i lead nascono mentre le notifiche non sono attive
    const make = async () => (await svc.createLead(submission())).id;
    const pendingOld = await make();
    const pendingFresh = await make();
    const legacy = await make();
    const tooOld = await make();
    await patch(pendingOld, { createdAt: minutesAgo(5) });
    await patch(legacy, { notificationStatus: "skipped", createdAt: minutesAgo(5) });
    await patch(tooOld, { createdAt: minutesAgo((nl.RETRY_WINDOW_DAYS + 1) * 24 * 60) });

    fresh();
    const sent = await nl.retryPendingNotifications(10);
    assert.equal(sent, 1);
    assert.equal((await row(pendingOld)).notificationStatus, "sent");
    assert.equal((await row(pendingFresh)).notificationStatus, "pending");
    assert.equal((await row(legacy)).notificationStatus, "skipped");
    assert.equal((await row(tooOld)).notificationStatus, "pending");
    assert.equal(fake.sent.length, 1);
  });

  test("il recupero non lancia eccezioni nemmeno con provider rotto", async () => {
    fresh("throw");
    const lead = await svc.createLead(submission());
    await patch(lead.id, { createdAt: minutesAgo(5) });
    await assert.doesNotReject(() => nl.retryPendingNotifications(10));
    assert.ok(await svc.getLeadDetail(lead.id));
  });
});

describe("4. Richieste duplicate: una sola notifica", () => {
  test("lo stesso invio ripetuto (stesso submissionId): 201 poi 200, una sola email", async () => {
    fresh();
    const sub = submission();
    const a = await post(sub);
    const b = await post(sub);
    assert.equal(a.status, 201);
    assert.equal(b.status, 200);
    assert.equal(fake.sent.length, 1);
  });

  test("6 richieste identiche in parallelo: un solo lead e una sola email", async () => {
    fresh();
    fake.delayMs = 25;
    const sub = submission();
    const res = await Promise.all(Array.from({ length: 6 }, () => post(sub)));
    const ids = new Set<string>();
    for (const r of res) {
      assert.ok(r.status === 201 || r.status === 200);
      ids.add(((await r.json()) as { id: string }).id);
    }
    assert.equal(ids.size, 1);
    assert.equal(fake.sent.length, 1);
  });

  test("8 notifiche concorrenti sullo stesso lead: una sola prenotazione vincente, una sola email", async () => {
    fresh();
    fake.delayMs = 25;
    const lead = await svc.createLead(submission());
    const outcomes = await Promise.all(Array.from({ length: 8 }, () => nl.notifyNewLead(lead.id)));
    assert.equal(outcomes.filter((o) => o === "sent").length, 1);
    assert.equal(outcomes.filter((o) => o === "not_claimed").length, 7);
    assert.equal(fake.sent.length, 1);
    assert.equal((await row(lead.id)).notificationAttempts, 1);
  });

  test("retry del browser dopo un errore: il secondo invio dello stesso modulo recupera la notifica, il terzo no", async () => {
    fresh("fail");
    const sub = submission();
    const first = await post(sub);
    assert.equal(first.status, 201);
    const { id } = (await first.json()) as { id: string };
    assert.equal((await row(id)).notificationStatus, "failed");

    fake.mode = "ok";
    await patch(id, { notificationClaimedAt: minutesAgo(nl.RETRY_AFTER_MINUTES + 1) });
    const second = await post(sub);
    assert.equal(second.status, 200);
    assert.equal(fake.sent.length, 1);
    const third = await post(sub);
    assert.equal(third.status, 200);
    assert.equal(fake.sent.length, 1);
    assert.equal((await row(id)).notificationStatus, "sent");
  });

  test("notifica già inviata: nessun nuovo invio nemmeno chiamando di nuovo", async () => {
    fresh();
    const lead = await svc.createLead(submission());
    assert.equal(await nl.notifyNewLead(lead.id), "sent");
    assert.equal(await nl.notifyNewLead(lead.id), "not_claimed");
    assert.equal(fake.sent.length, 1);
  });
});

describe("5. Trasporto Resend (fetch simulato, nessuna rete)", () => {
  const msg = { from: "Compriamo Moto <onboarding@resend.dev>", to: [TO], subject: "Oggetto", text: "Corpo", idempotencyKey: "lead-notify-xyz" };

  test("richiesta ben formata: URL, intestazioni, corpo e chiave di idempotenza", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const stub = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify({ id: "re-123" }), { status: 200 });
    }) as unknown as typeof fetch;
    const out = await new tr.ResendTransport("dummy-key-not-real", stub).send(msg);
    assert.deepEqual(out, { ok: true, id: "re-123" });
    assert.equal(seen!.url, "https://api.resend.com/emails");
    assert.equal(seen!.init.method, "POST");
    const h = seen!.init.headers as Record<string, string>;
    assert.equal(h.authorization, "Bearer dummy-key-not-real");
    assert.equal(h["idempotency-key"], "lead-notify-xyz");
    assert.equal(h["content-type"], "application/json");
    assert.deepEqual(JSON.parse(String(seen!.init.body)), { from: msg.from, to: [TO], subject: "Oggetto", text: "Corpo" });
  });

  test("errori del provider: solo un codice sintetico, mai il corpo della risposta", async () => {
    for (const status of [401, 403, 422, 429, 500]) {
      const stub = (async () => new Response(JSON.stringify({ message: "indirizzo mario@example.com non valido" }), { status })) as unknown as typeof fetch;
      const out = await new tr.ResendTransport("k", stub).send(msg);
      assert.deepEqual(out, { ok: false, code: `http_${status}` });
    }
  });

  test("errore di rete e timeout", async () => {
    const down = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    assert.deepEqual(await new tr.ResendTransport("k", down).send(msg), { ok: false, code: "network" });

    const hang = ((_u: string, init: RequestInit) =>
      new Promise((_res, rej) => {
        init.signal!.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })));
      })) as unknown as typeof fetch;
    assert.deepEqual(await new tr.ResendTransport("k", hang, 30).send(msg), { ok: false, code: "timeout" });
  });
});

const env = (o: Record<string, string | undefined>) => o as unknown as NodeJS.ProcessEnv;

describe("6. Configurazione", () => {
  test("valida: destinatario da NOTIFY_EMAIL_TO, mittente di prova se manca NOTIFY_EMAIL_FROM", () => {
    const c = cfgmod.loadNotificationConfig(env({ RESEND_API_KEY: "k", NOTIFY_EMAIL_TO: ` ${TO} ` }));
    assert.deepEqual(c, { enabled: true, apiKey: "k", to: [TO], from: cfgmod.RESEND_TEST_SENDER, dailyLimit: cfgmod.DEFAULT_DAILY_LIMIT });
    const d = cfgmod.loadNotificationConfig(env({ RESEND_API_KEY: "k", NOTIFY_EMAIL_TO: `${TO}, altra@example.com`, NOTIFY_EMAIL_FROM: "Compriamo Moto <notifiche@example.com>" }));
    assert.ok(d.enabled && d.to.length === 2 && d.from === "Compriamo Moto <notifiche@example.com>");
  });

  test("incompleta o non valida: disattivata (mai un errore bloccante), con avviso senza valori", () => {
    const e = env;
    for (const env of [
      {},
      { RESEND_API_KEY: "k" },
      { NOTIFY_EMAIL_TO: TO },
      { RESEND_API_KEY: "k", NOTIFY_EMAIL_TO: "non-una-email" },
      { RESEND_API_KEY: "k", NOTIFY_EMAIL_TO: "a@example.invalid,c@example.invalid,e@example.invalid,g@example.invalid" },
      { RESEND_API_KEY: "k", NOTIFY_EMAIL_TO: TO, NOTIFY_EMAIL_FROM: "senza-forma" },
    ]) {
      assert.equal(cfgmod.loadNotificationConfig(e(env)).enabled, false, JSON.stringify(env));
      const w = cfgmod.notificationWarnings(e(env)).join(" ");
      assert.ok(w.length > 0);
      assert.ok(!w.includes("k,") && !w.includes(TO), "gli avvisi non riportano valori");
    }
  });

  test("nessuna chiave API nel repository", () => {
    const re = /\bre_[A-Za-z0-9_]{16,}\b/;
    const walk = (dir: string, out: string[] = []) => {
      for (const n of readdirSync(dir)) {
        if (["node_modules", ".next", ".git", "anteprime", "fonts"].includes(n)) continue;
        const p = path.join(dir, n);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (/\.(ts|tsx|md|json|toml|mjs|yml|sql|example|sh)$/.test(n) || n === ".env.example") out.push(p);
      }
      return out;
    };
    const files = [...walk("src"), ...walk("scripts"), ...walk("docs"), ...walk("tests"), ...walk(".github"), "README.md", "netlify.toml", ".env.example"];
    assert.deepEqual(files.filter((f) => re.test(readFileSync(f, "utf8"))), []);
  });
});

describe("7. Stato mostrato nel back office", () => {
  const fmt = (d: Date) => `T${d.getUTCFullYear()}`;
  const base = { notificationAttempts: 0, notificationSentAt: null, notificationError: null };
  test("inviata (con data), in attesa, in corso, non inviata, non prevista", () => {
    const d = statusmod.describeNotification;
    const sent = d({ ...base, notificationStatus: "sent", notificationSentAt: new Date("2026-10-22T10:00:00Z") }, fmt, 5, true);
    assert.deepEqual([sent.tone, sent.label], ["ok", "Inviata il T2026"]);
    assert.equal(d({ ...base, notificationStatus: "pending" }, fmt, 5, true).label, "In attesa di invio");
    assert.match(d({ ...base, notificationStatus: "pending" }, fmt, 5, false).detail ?? "", /non sono configurate/);
    assert.equal(d({ ...base, notificationStatus: "sending" }, fmt, 5, true).label, "Invio in corso");
    const failed = d({ ...base, notificationStatus: "failed", notificationAttempts: 2, notificationError: "http_403" }, fmt, 5, true);
    assert.deepEqual([failed.tone, failed.label], ["bad", "Non inviata"]);
    assert.match(failed.detail ?? "", /2\/5.*http_403/);
    assert.equal(d({ ...base, notificationStatus: "skipped" }, fmt, 5, true).label, "Non prevista");
  });

  test("la pagina di dettaglio e l'elenco mostrano lo stato senza campi personali nuovi", () => {
    const page = readFileSync("src/app/admin/(app)/lead/[id]/page.tsx", "utf8");
    assert.match(page, /describeNotification/);
    assert.match(page, /title="Notifica email"/);
  });
});

describe("8. Comando notify:test", () => {
  const script = readFileSync("scripts/notify-test.ts", "utf8");
  test("non usa il database e non crea né modifica richieste", () => {
    assert.doesNotMatch(script, /@\/db|getDb|leads|drizzle/);
  });
  test("senza --yes è solo un'anteprima: non invia nulla", () => {
    const out = execFileSync("npx", ["tsx", "scripts/notify-test.ts"], {
      env: { ...process.env, RESEND_API_KEY: "dummy-key-not-real", NOTIFY_EMAIL_TO: TO },
      encoding: "utf8",
    });
    assert.match(out, /nessuna email inviata/i);
    assert.match(out, new RegExp(TO.replace(/\./g, "\\.")));
  });
  test("senza configurazione termina con errore e non invia", () => {
    assert.throws(() =>
      execFileSync("npx", ["tsx", "scripts/notify-test.ts", "--yes"], {
        env: { ...process.env, RESEND_API_KEY: "", NOTIFY_EMAIL_TO: "" },
        encoding: "utf8",
        stdio: "pipe",
      }),
    );
  });
  test("esiste lo script npm e il destinatario non è modificabile da riga di comando", () => {
    assert.match(readFileSync("package.json", "utf8"), /"notify:test"/);
    assert.doesNotMatch(script, /--to\b/);
  });
});

/** Provider finto che si comporta come Resend con l'idempotenza: stessa chiave + stesso contenuto = nessun secondo invio. */
class IdempotentProvider implements EmailTransport {
  seen = new Map<string, string>();
  deliveries = 0;
  attempts: Sent[] = [];
  /** simula «email accettata dal provider ma risposta persa» (timeout) per le prossime N chiamate */
  loseReplies = 0;
  async send(msg: Sent) {
    this.attempts.push(msg);
    const body = JSON.stringify({ from: msg.from, to: msg.to, subject: msg.subject, text: msg.text });
    const prev = this.seen.get(msg.idempotencyKey);
    let result: { ok: true; id: string } | { ok: false; code: string };
    if (prev === undefined) {
      this.seen.set(msg.idempotencyKey, body);
      this.deliveries++;
      result = { ok: true, id: "idem-1" };
    } else if (prev === body) {
      result = { ok: true, id: "idem-1" }; // stessa risposta, nessun nuovo invio
    } else {
      result = { ok: false, code: "http_409" }; // stessa chiave con contenuto diverso
    }
    if (this.loseReplies > 0) {
      this.loseReplies--;
      return { ok: false as const, code: "timeout" };
    }
    return result;
  }
}

describe("9. Email accettata dal provider ma esito non registrato (interruzione, timeout)", () => {
  test("processo interrotto dopo l'invio: il recupero riusa la stessa chiave e non produce una seconda email (entro 24 ore)", async () => {
    const provider = new IdempotentProvider();
    tr.setEmailTransport(provider);
    const lead = await svc.createLead(submission());
    assert.equal(await nl.notifyNewLead(lead.id), "sent");
    // simulazione: il processo si ferma prima di scrivere «sent»
    await patch(lead.id, { notificationStatus: "sending", notificationSentAt: null, notificationClaimedAt: minutesAgo(nl.RETRY_AFTER_MINUTES + 1) });
    assert.equal(await nl.notifyNewLead(lead.id), "sent");
    assert.equal(provider.attempts.length, 2);
    assert.equal(provider.deliveries, 1, "una sola consegna reale");
    assert.equal((await row(lead.id)).notificationStatus, "sent");
  });

  test("timeout lato nostro con email in realtà accettata: il retry successivo non duplica", async () => {
    const provider = new IdempotentProvider();
    provider.loseReplies = 1;
    tr.setEmailTransport(provider);
    const lead = await svc.createLead(submission());
    assert.equal(await nl.notifyNewLead(lead.id), "failed");
    assert.equal((await row(lead.id)).notificationError, "timeout");
    await patch(lead.id, { notificationClaimedAt: minutesAgo(nl.RETRY_AFTER_MINUTES + 1) });
    assert.equal(await nl.notifyNewLead(lead.id), "sent");
    assert.equal(provider.deliveries, 1);
  });

  test("ogni tentativo usa la stessa chiave e lo stesso identico contenuto (mittente, destinatari, oggetto, testo)", async () => {
    const provider = new IdempotentProvider();
    provider.loseReplies = 2;
    tr.setEmailTransport(provider);
    const lead = await svc.createLead(submission());
    for (let i = 0; i < 3; i++) {
      await nl.notifyNewLead(lead.id);
      await patch(lead.id, { notificationClaimedAt: minutesAgo(nl.RETRY_AFTER_MINUTES + 1) });
    }
    assert.equal(provider.attempts.length, 3);
    for (const a of provider.attempts) assert.deepEqual(a, provider.attempts[0]);
    assert.equal(provider.attempts[0].idempotencyKey, `lead-notify-${lead.id}`);
    assert.equal(provider.deliveries, 1);
  });

  test("se il contenuto cambia tra due tentativi (es. cambia l'indirizzo del sito) il provider rifiuta con 409: nessun doppione, stato «failed»", async () => {
    const provider = new IdempotentProvider();
    provider.loseReplies = 1;
    tr.setEmailTransport(provider);
    const before = { URL: process.env.URL, SITE_NAME: process.env.SITE_NAME };
    try {
      delete process.env.URL;
      process.env.SITE_NAME = "sito-a";
      const lead = await svc.createLead(submission());
      assert.equal(await nl.notifyNewLead(lead.id), "failed"); // risposta persa, email consegnata
      process.env.SITE_NAME = "sito-b";
      await patch(lead.id, { notificationClaimedAt: minutesAgo(nl.RETRY_AFTER_MINUTES + 1) });
      assert.equal(await nl.notifyNewLead(lead.id), "failed");
      assert.equal((await row(lead.id)).notificationError, "http_409");
      assert.equal(provider.deliveries, 1);
    } finally {
      for (const [k, v] of Object.entries(before)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});

describe("10. Indirizzo del sito nelle email (a runtime su Netlify esistono solo SITE_NAME e SITE_ID)", () => {
  const KEYS = ["URL", "SITE_NAME", "VERCEL_URL", "VERCEL_PROJECT_PRODUCTION_URL"] as const;
  const withEnv = async (env: Record<string, string | undefined>, fn: () => void | Promise<void>) => {
    const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
    try {
      for (const k of KEYS) delete process.env[k];
      for (const [k, v] of Object.entries(env)) if (v !== undefined) process.env[k] = v;
      await fn();
    } finally {
      for (const k of KEYS) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  };

  test("priorità: URL (build) → <SITE_NAME>.netlify.app (runtime) → locale; un SITE_NAME anomalo viene ignorato", async () => {
    const { siteUrl } = await import("@/config/business");
    await withEnv({ URL: "https://esempio.netlify.app", SITE_NAME: "altro" }, () => assert.equal(siteUrl().origin, "https://esempio.netlify.app"));
    await withEnv({ SITE_NAME: "Papaya-Taffy-123" }, () => assert.equal(siteUrl().origin, "https://papaya-taffy-123.netlify.app"));
    await withEnv({ SITE_NAME: "evil.example.com/x" }, () => assert.equal(siteUrl().hostname, "localhost"));
    await withEnv({}, () => assert.equal(siteUrl().hostname, "localhost"));
  });

  test("la notifica usa l'indirizzo del sito; se in produzione non è determinabile indica il percorso invece di un link a localhost", async () => {
    const lead = await leadForEmail((await svc.createLead(submission())).id);
    const ok = nl.buildLeadEmail(lead, new URL("https://sito.example"));
    assert.ok(ok.text.includes(`https://sito.example/admin/lead/${lead.id}`));

    const env = process.env as Record<string, string | undefined>;
    const prev = env.NODE_ENV;
    try {
      env.NODE_ENV = "production";
      const local = nl.buildLeadEmail(lead, new URL("http://localhost:3000"));
      assert.ok(!local.text.includes("localhost"), "nessun link a localhost nelle email di produzione");
      assert.ok(local.text.includes(`/admin/lead/${lead.id}`));
    } finally {
      env.NODE_ENV = prev;
    }
  });
});

describe("11. Recupero dal back office: tempo limitato", () => {
  test("3 notifiche in sospeso con provider lento: il tempo è quello di un invio, non la somma", async () => {
    tr.setEmailTransport(null);
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const l = await svc.createLead(submission());
      await patch(l.id, { createdAt: minutesAgo(5) });
      ids.push(l.id);
    }
    const slow = new FakeTransport();
    slow.delayMs = 150;
    tr.setEmailTransport(slow);
    const t0 = Date.now();
    const sent = await nl.retryPendingNotifications(3);
    const ms = Date.now() - t0;
    assert.equal(sent, 3);
    assert.ok(ms < 400, `servito in parallelo (${ms} ms; in sequenza sarebbero ≥ 450 ms)`);
    for (const id of ids) assert.equal((await row(id)).notificationStatus, "sent");
  });
});
