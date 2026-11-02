/**
 * Email di conferma al cliente + consenso marketing + migrazione 0006.
 * Nessuna email reale: il trasporto è finto. Database: PGlite in una cartella temporanea. Esecuzione: npm test
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { EmailMessage, EmailTransport, SendResult } from "@/modules/notifications/transport";

const TMP = mkdtempSync(path.join(tmpdir(), "moto-custmail-test-"));
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
  RESEND_API_KEY: "dummy-key-not-real",
  NOTIFY_EMAIL_TO: TO,
});

class Fake implements EmailTransport {
  sent: EmailMessage[] = [];
  mode: "ok" | "fail" = "ok";
  delayMs = 0;
  async send(msg: EmailMessage): Promise<SendResult> {
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    if (this.mode === "fail") return { ok: false, code: "http_503" };
    this.sent.push(msg);
    return { ok: true, id: `fake-${this.sent.length}` };
  }
  get toCustomers() {
    return this.sent.filter((m) => m.idempotencyKey.startsWith("lead-confirm-"));
  }
  get internal() {
    return this.sent.filter((m) => m.idempotencyKey.startsWith("lead-notify-"));
  }
}

let ce: typeof import("@/modules/notifications/customer-email");
let cc: typeof import("@/modules/notifications/customer-confirmation");
let mk: typeof import("@/modules/marketing/consent");
let txt: typeof import("@/modules/marketing/text");
let tr: typeof import("@/modules/notifications/transport");
let svc: typeof import("@/modules/leads/service");
let route: typeof import("@/app/api/leads/route");
let dbmod: typeof import("@/db/client");
let schema: typeof import("@/db/schema");
let orm: typeof import("drizzle-orm");
let validation: typeof import("@/modules/leads/validation");
let erasure: typeof import("@/modules/privacy/erasure");
let fake: Fake;

const email = () => `cliente.${randomUUID().slice(0, 8)}@example.com`;
const submission = (contact: Record<string, unknown> = {}, over: Record<string, unknown> = {}) => ({
  submissionId: randomUUID(),
  motorcycle: { brand: "Honda", modelId: "honda-sh", year: 2019, displacement: 125 },
  mileage: 18000,
  condition: { isRunning: true, accident: "no" as const, mechanicalIssues: "no" as const, maintenance: "yes" as const },
  contact: {
    firstName: "Mario",
    lastName: "Verdi",
    phone: "+393331234567",
    email: email(),
    city: "Milano",
    preferredContact: "whatsapp" as const,
    privacyConsent: true as const,
    ...contact,
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
const fresh = () => {
  fake = new Fake();
  tr.setEmailTransport(fake);
  return fake;
};

before(async () => {
  ce = await import("@/modules/notifications/customer-email");
  cc = await import("@/modules/notifications/customer-confirmation");
  mk = await import("@/modules/marketing/consent");
  txt = await import("@/modules/marketing/text");
  tr = await import("@/modules/notifications/transport");
  svc = await import("@/modules/leads/service");
  route = await import("@/app/api/leads/route");
  dbmod = await import("@/db/client");
  schema = await import("@/db/schema");
  orm = await import("drizzle-orm");
  validation = await import("@/modules/leads/validation");
  erasure = await import("@/modules/privacy/erasure");
});
after(async () => {
  tr.setEmailTransport(undefined);
  await dbmod.closeDb();
  rmSync(TMP, { recursive: true, force: true });
});

const CTX = { siteOrigin: "https://compriamo-moto.it", brandName: "Compriamo Moto", area: "Milano e provincia", responseTime: "24-48 ore", contactEmail: "compriamo.moto.support@gmail.com" };

describe("1. Contenuto dell'email al cliente", () => {
  const input = { firstName: "Mario", code: "M7K2QX", mileage: 18000, moto: { brand: "Honda", model: "SH", version: null, year: 2019, displacement: 125 } };

  test("titolo, ringraziamento, conferma di RICEZIONE (non di acquisto), 24-48 ore, firma, riepilogo", () => {
    const m = ce.buildCustomerEmail(input, CTX);
    assert.equal(m.subject, "Abbiamo ricevuto la tua richiesta!");
    assert.match(m.html, /<h1[^>]*>Abbiamo ricevuto la tua richiesta!<\/h1>/);
    assert.match(m.html, /Ciao Mario,/);
    assert.match(m.html, /grazie per aver scelto Compriamo Moto/);
    assert.match(m.html, /conferma la ricezione della richiesta\. Non è ancora un acquisto concluso/);
    assert.match(m.html, /entro 24-48 ore/);
    assert.match(m.html, /M7K2QX/);
    assert.match(m.html, /Honda SH 125 cc/);
    assert.match(m.html, /2019/);
    assert.match(m.html, /18\.000/);
    assert.match(m.html, /A presto,<br><strong>Compriamo Moto<\/strong>/);
    assert.match(m.html, /Acquisto diretto di moto usate · Milano e provincia/);
    for (const re of [/hai venduto/i, /moto (è stata )?acquistata/i, /abbiamo acquistato/i, /offerta di \d/i, /gratis/i]) assert.doesNotMatch(m.html + m.text, re);
  });

  test("logo ufficiale con URL assoluto https, palette originale con giallo segnale, nessun colore estraneo", () => {
    const m = ce.buildCustomerEmail(input, CTX);
    assert.match(m.html, /<img src="https:\/\/compriamo-moto\.it\/brand\/v2\/email-logo\.png"[^>]*alt="Compriamo Moto"/);
    const colors = new Set([...m.html.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((x) => x[0].toLowerCase()));
    for (const c of ["#f1bf1a", "#15181b", "#fbfbf8", "#e9ebe7"]) assert.ok(colors.has(c), `manca ${c}`);
    const allowed = new Set(["#f1bf1a", "#15181b", "#363c41", "#fbfbf8", "#e9ebe7", "#565c60", "#c3c8c1", "#d9dcd7"]);
    for (const c of colors) assert.ok(allowed.has(c), `colore fuori palette: ${c}`);
    assert.doesNotMatch(m.html, /coral|#ff7|#f87/i);
  });

  test("il file del logo esiste, è un PNG con trasparenza, e riprende i colori del marchio", () => {
    const png = readFileSync("public/brand/v2/email-logo.png");
    assert.equal(png.subarray(1, 4).toString(), "PNG");
    assert.ok(png.length > 5_000 && png.length < 150_000);
  });

  test("riepilogo opzionale: senza dati della moto l'email resta valida e senza tabella", () => {
    const m = ce.buildCustomerEmail({ firstName: "Mario", code: "ABC123" }, CTX);
    assert.doesNotMatch(m.html, /Riepilogo della tua moto/);
    assert.match(m.html, /ABC123/);
    assert.match(m.text, /Cosa succede ora/);
  });

  test("testo semplice allegato con le stesse informazioni; link privacy assoluto", () => {
    const m = ce.buildCustomerEmail(input, CTX);
    assert.match(m.text, /Abbiamo ricevuto la tua richiesta!/);
    assert.match(m.text, /Codice richiesta: M7K2QX/);
    assert.match(m.text, /Honda SH 125 cc/);
    assert.match(m.text, /entro 24-48 ore/);
    assert.match(m.text, /https:\/\/compriamo-moto\.it\/privacy/);
  });

  test("i dati del cliente sono «escapati»: nessun HTML o script nell'email", () => {
    const m = ce.buildCustomerEmail(
      { firstName: '<script>alert(1)</script>', code: "X", moto: { brand: "Honda", model: '"><img src=x onerror=alert(1)>', year: 2019 } },
      CTX,
    );
    assert.doesNotMatch(m.html, /<script>alert/);
    assert.doesNotMatch(m.html, /<img src=x/);
    assert.match(m.html, /&lt;script&gt;/);
    assert.match(m.html, /&quot;&gt;&lt;img/);
  });

  test("a capo e caratteri di controllo nel nome non entrano nell'oggetto né nelle intestazioni", () => {
    const m = ce.buildCustomerEmail({ firstName: "Mario\r\nBcc: x@y.z", code: "X" }, CTX);
    assert.equal(m.subject, "Abbiamo ricevuto la tua richiesta!");
    assert.doesNotMatch(m.html, /Mario\r|\r\nBcc/);
  });
});

describe("2. Invio e duplicati (riuso del sistema email esistente)", () => {
  test("POST /api/leads: dopo il salvataggio parte l'email al cliente (HTML + testo) e la notifica interna resta una sola", async () => {
    fresh();
    const sub = submission();
    const res = await post(sub);
    assert.equal(res.status, 201);
    const { id } = (await res.json()) as { id: string };
    assert.equal(fake.toCustomers.length, 1);
    assert.equal(fake.internal.length, 1);
    const m = fake.toCustomers[0];
    assert.deepEqual(m.to, [sub.contact.email]);
    assert.equal(m.subject, "Abbiamo ricevuto la tua richiesta!");
    assert.ok(m.html && m.html.includes("<h1"));
    assert.ok(m.text.length > 100);
    assert.equal(m.idempotencyKey, `lead-confirm-${id}`);
    assert.notDeepEqual(fake.internal[0].to, [sub.contact.email], "la notifica interna non va mai al cliente");
    const r = await row(id);
    assert.equal(r.customerEmailStatus, "sent");
    assert.equal(r.customerEmailAttempts, 1);
    assert.ok(r.customerEmailSentAt);
    assert.equal(r.customerEmailError, null);
  });

  test("lo stesso invio ripetuto (stesso submissionId) e 6 richieste parallele: una sola email al cliente", async () => {
    fresh();
    fake.delayMs = 20;
    const sub = submission();
    const res = await Promise.all(Array.from({ length: 6 }, () => post(sub)));
    for (const r of res) assert.ok(r.status === 201 || r.status === 200);
    assert.equal(fake.toCustomers.length, 1);
    const again = await post(sub);
    assert.equal(again.status, 200);
    assert.equal(fake.toCustomers.length, 1);
  });

  test("8 chiamate concorrenti sulla stessa richiesta: una sola prenotazione vincente", async () => {
    fresh();
    fake.delayMs = 20;
    const lead = await svc.createLead(submission() as never);
    const out = await Promise.all(Array.from({ length: 8 }, () => cc.sendCustomerConfirmation(lead.id)));
    assert.equal(out.filter((o) => o === "sent").length, 1);
    assert.equal(out.filter((o) => o === "not_claimed").length, 7);
    assert.equal(fake.toCustomers.length, 1);
  });

  test("invio fallito: la richiesta resta salvata (201), stato «failed» con codice sintetico, nessun errore al cliente", async () => {
    fresh();
    fake.mode = "fail";
    const res = await post(submission());
    assert.equal(res.status, 201);
    const { id } = (await res.json()) as { id: string };
    const r = await row(id);
    assert.equal(r.customerEmailStatus, "failed");
    assert.equal(r.customerEmailError, "http_503");
  });

  test("dopo un errore si può riprovare solo dopo l'attesa e al massimo 3 volte", async () => {
    fresh();
    fake.mode = "fail";
    const lead = await svc.createLead(submission() as never);
    assert.equal(await cc.sendCustomerConfirmation(lead.id), "failed");
    assert.equal(await cc.sendCustomerConfirmation(lead.id), "not_claimed", "prima dell'attesa non si riprova");
    const db = await dbmod.getDb();
    const old = orm.sql`now() - make_interval(mins => 30)`;
    await db.update(schema.leads).set({ customerEmailClaimedAt: old }).where(orm.eq(schema.leads.id, lead.id));
    fake.mode = "ok";
    assert.equal(await cc.sendCustomerConfirmation(lead.id), "sent");
    assert.equal(await cc.sendCustomerConfirmation(lead.id), "not_claimed", "già inviata: mai due volte");
    assert.equal(fake.toCustomers.length, 1);
    // tetto dei tentativi
    const l2 = await svc.createLead(submission() as never);
    fake.mode = "fail";
    for (let i = 0; i < 5; i++) {
      await db.update(schema.leads).set({ customerEmailClaimedAt: old }).where(orm.eq(schema.leads.id, l2.id));
      await cc.sendCustomerConfirmation(l2.id);
    }
    assert.equal((await row(l2.id)).customerEmailAttempts, cc.CUSTOMER_EMAIL_MAX_ATTEMPTS);
  });

  test("notifiche non configurate: nessuna email e la richiesta funziona; le richieste precedenti (skipped) non ricevono nulla", async () => {
    tr.setEmailTransport(null);
    const prevKey = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    try {
      const lead = await svc.createLead(submission() as never);
      assert.equal(await cc.sendCustomerConfirmation(lead.id), "disabled");
      assert.equal((await row(lead.id)).customerEmailStatus, "pending");
    } finally {
      process.env.RESEND_API_KEY = prevKey;
    }
    fresh();
    const old = await svc.createLead(submission() as never);
    const db = await dbmod.getDb();
    await db.update(schema.leads).set({ customerEmailStatus: "skipped" }).where(orm.eq(schema.leads.id, old.id));
    assert.equal(await cc.sendCustomerConfirmation(old.id), "not_claimed");
    assert.equal(fake.toCustomers.length, 0);
  });

  test("il Reply-To configurato viene usato anche per l'email al cliente", async () => {
    fresh();
    process.env.NOTIFY_EMAIL_REPLY_TO = "compriamo.moto.support@gmail.com";
    try {
      const lead = await svc.createLead(submission() as never);
      await cc.sendCustomerConfirmation(lead.id);
      assert.equal(fake.toCustomers[0].replyTo, "compriamo.moto.support@gmail.com");
    } finally {
      delete process.env.NOTIFY_EMAIL_REPLY_TO;
    }
  });

  test("il trasporto reale invia anche `html` a Resend", async () => {
    let body: Record<string, unknown> = {};
    const stub = (async (_u: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return new Response('{"id":"x"}', { status: 200 });
    }) as unknown as typeof fetch;
    await new tr.ResendTransport("dummy-key-not-real", stub).send({ from: "A <a@example.com>", to: ["b@example.com"], subject: "s", text: "t", html: "<p>h</p>", idempotencyKey: "k" });
    assert.equal(body.html, "<p>h</p>");
    await new tr.ResendTransport("dummy-key-not-real", stub).send({ from: "A <a@example.com>", to: ["b@example.com"], subject: "s", text: "t", idempotencyKey: "k" });
    assert.equal("html" in body, false);
  });
});

describe("3. Consenso marketing: registrazione", () => {
  test("testo esatto e versione", () => {
    assert.equal(
      txt.MARKETING_CONSENT_TEXT,
      "Acconsento a ricevere via email novità, offerte e comunicazioni promozionali di Compriamo Moto. Posso revocare il consenso in qualsiasi momento.",
    );
    assert.match(txt.MARKETING_CONSENT_VERSION, /^mkt-\d+$/);
  });

  test("la richiesta si può inviare SENZA consenso: validazione ok con campo assente, false o true", () => {
    for (const v of [undefined, false, true]) {
      const r = validation.leadSubmissionSchema.safeParse(submission(v === undefined ? {} : { marketingConsent: v }));
      assert.equal(r.success, true, String(v));
    }
    assert.equal(validation.leadSubmissionSchema.safeParse(submission({ marketingConsent: "yes" })).success, false);
  });

  test("casella spuntata: riga «granted» con data, versione del testo e origine", async () => {
    fresh();
    const res = await post(submission({ marketingConsent: true }));
    assert.equal(res.status, 201);
    const { id } = (await res.json()) as { id: string };
    const hist = await mk.consentHistory((await row(id)).customerId);
    assert.equal(hist.length, 1);
    assert.equal(hist[0].status, "granted");
    assert.equal(hist[0].textVersion, txt.MARKETING_CONSENT_VERSION);
    assert.equal(hist[0].source, "modulo");
    assert.ok(Math.abs(Date.now() - hist[0].decidedAt.getTime()) < 60_000);
  });

  test("casella vuota o campo assente: riga «declined» e la richiesta viene salvata e notificata comunque", async () => {
    fresh();
    for (const contact of [{}, { marketingConsent: false }]) {
      const sub = submission(contact);
      const res = await post(sub);
      assert.equal(res.status, 201);
      const { id } = (await res.json()) as { id: string };
      const hist = await mk.consentHistory((await row(id)).customerId);
      assert.deepEqual(hist.map((h) => h.status), ["declined"]);
      assert.equal(await mk.hasMarketingConsent(sub.contact.email), false);
    }
    assert.equal(fake.internal.length, 2);
    assert.equal(fake.toCustomers.length, 2);
  });

  test("la scelta è salvata nella stessa transazione della richiesta: senza il registro la richiesta non viene creata", async () => {
    fresh();
    const db = await dbmod.getDb();
    await db.execute(orm.sql`alter table marketing_consents rename to marketing_consents_x`);
    try {
      const sub = submission({ marketingConsent: true });
      await assert.rejects(() => svc.createLead(sub as never));
      const found = await svc.findExistingLead(sub.submissionId);
      assert.equal(found, null, "nessuna richiesta a metà");
    } finally {
      await db.execute(orm.sql`alter table marketing_consents_x rename to marketing_consents`);
    }
  });
});

describe("4. Consenso marketing: nessuna comunicazione senza consenso", () => {
  test("solo chi ha «granted» in vigore compare tra i destinatari; revoca e nuova scelta cambiano lo stato", async () => {
    fresh();
    const yes = submission({ marketingConsent: true });
    const no = submission({ marketingConsent: false });
    await svc.createLead(yes as never);
    await svc.createLead(no as never);
    let rec = (await mk.listMarketingRecipients()).map((r) => r.email);
    assert.ok(rec.includes(yes.contact.email));
    assert.ok(!rec.includes(no.contact.email));

    assert.equal(await mk.hasMarketingConsent(yes.contact.email), true);
    await mk.revokeMarketingConsent(yes.contact.email, "email");
    assert.equal(await mk.currentMarketingStatus(yes.contact.email), "revoked");
    rec = (await mk.listMarketingRecipients()).map((r) => r.email);
    assert.ok(!rec.includes(yes.contact.email), "revocato: fuori dall'elenco");

    // nuova richiesta con consenso dato di nuovo → di nuovo in elenco; poi una successiva SENZA consenso lo toglie (vale l'ultima scelta)
    await new Promise((r) => setTimeout(r, 5));
    await svc.createLead(submission({ email: yes.contact.email, marketingConsent: true }) as never);
    assert.ok((await mk.listMarketingRecipients()).some((r) => r.email === yes.contact.email));
    await new Promise((r) => setTimeout(r, 5));
    await svc.createLead(submission({ email: yes.contact.email, marketingConsent: false }) as never);
    assert.ok(!(await mk.listMarketingRecipients()).some((r) => r.email === yes.contact.email));
  });

  test("il registro è a sola aggiunta: la revoca aggiunge una riga e non cancella la storia", async () => {
    fresh();
    const sub = submission({ marketingConsent: true });
    const lead = await svc.createLead(sub as never);
    await mk.revokeMarketingConsent(sub.contact.email, "back_office");
    const hist = await mk.consentHistory((await row(lead.id)).customerId);
    assert.deepEqual(hist.map((h) => h.status).sort(), ["granted", "revoked"]);
    assert.deepEqual(hist.map((h) => h.source).sort(), ["back_office", "modulo"]);
  });

  test("l'email di conferma è un messaggio di servizio: dichiarato come tale e senza contenuti promozionali", () => {
    const m = ce.buildCustomerEmail({ firstName: "Mario", code: "X" }, CTX);
    assert.match(m.html, /non una comunicazione promozionale/);
    assert.doesNotMatch(m.html + m.text, /\bsconto\b|iscriviti|newsletter|offerte speciali/i);
  });

  test("la cancellazione di una richiesta elimina anche il registro dei consensi del cliente", async () => {
    fresh();
    const sub = submission({ marketingConsent: true });
    const lead = await svc.createLead(sub as never);
    const customerId = (await row(lead.id)).customerId;
    assert.equal((await mk.consentHistory(customerId)).length, 1);
    await erasure.eraseLead(lead.id);
    assert.equal((await mk.consentHistory(customerId)).length, 0);
  });
});

describe("5. Migrazione 0006 (additiva) e schema", () => {
  const SQL = readFileSync("drizzle/0006_email_cliente_consenso_marketing.sql", "utf8");
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as { entries: { idx: number; tag: string }[] };

  test("solo CREATE/ADD/UPDATE: nessun DROP, nessuna colonna rinominata, nessun DELETE/TRUNCATE", () => {
    const code = SQL.replace(/--.*$/gm, "").replace(/ON DELETE no action ON UPDATE no action/g, "");
    assert.doesNotMatch(code, /\bDROP\b|\bDELETE\b|\bTRUNCATE\b|RENAME/i);
    assert.match(code, /CREATE TABLE "marketing_consents"/);
    assert.equal((code.match(/ADD COLUMN/g) ?? []).length, 5);
  });

  test("le richieste già presenti sono marcate «skipped»: nessuna email retroattiva", () => {
    assert.match(SQL, /UPDATE "leads" SET "customer_email_status" = 'skipped'/);
    assert.ok(SQL.indexOf("UPDATE") > SQL.indexOf("customer_email_error"));
    assert.ok(SQL.indexOf("UPDATE") < SQL.indexOf("leads_customer_email_status_valid"));
  });

  test("il registro delle migrazioni la elenca per ultima, dopo la 0005", () => {
    const last = journal.entries.at(-1)!;
    assert.equal(last.tag, "0006_email_cliente_consenso_marketing");
    assert.equal(journal.entries[last.idx - 1].tag, "0005_valuation_engine");
  });

  test("le nuove richieste partono da «pending» e il database accetta solo stati validi", async () => {
    fresh();
    const lead = await svc.createLead(submission() as never);
    const r = await row(lead.id);
    assert.equal(r.customerEmailStatus === "pending" || r.customerEmailStatus === "sent", true);
    const db = await dbmod.getDb();
    await assert.rejects(() => db.execute(orm.sql`update leads set customer_email_status = 'boh' where id = ${lead.id}`));
    await assert.rejects(() => db.execute(orm.sql`insert into marketing_consents (customer_id, status, text_version, source) values (${r.customerId}, 'forse', 'x', 'y')`));
  });
});

describe("6. Modulo, homepage e informativa", () => {
  const read = (p: string) => readFileSync(p, "utf8");

  test("modulo: casella facoltativa, NON preselezionata, con il testo esatto e senza `required`", () => {
    const step = read("src/modules/funnel/steps/ContactStep.tsx");
    assert.match(step, /MARKETING_CONSENT_TEXT/);
    assert.match(step, /name="marketingConsent"/);
    assert.match(step, /checked=\{contact\.marketingConsent === true\}/);
    const block = step.slice(step.indexOf('name="marketingConsent"') - 200, step.indexOf('name="marketingConsent"') + 600);
    assert.doesNotMatch(block, /required|aria-required|defaultChecked/);
    const state = read("src/modules/funnel/state.ts");
    assert.match(state, /marketingConsent: false/);
    assert.match(state, /marketingConsent\?: boolean/);
  });

  test("modulo: la validazione del passo contatti non richiede il consenso marketing", () => {
    const base = { firstName: "Mario", lastName: "Verdi", phone: "3331234567", email: "a@example.com", city: "Milano", preferredContact: "phone", privacyConsent: true };
    assert.equal(validation.contactStepSchema.safeParse(base).success, true);
    assert.equal(validation.contactStepSchema.safeParse({ ...base, marketingConsent: false }).success, true);
  });

  test("homepage: «Donadio Luca (impresa individuale)» non c'è più in «L'acquirente siamo noi»; i dati identificativi restano in footer e informativa", () => {
    const home = read("src/app/page.tsx");
    assert.doesNotMatch(home, /LEGAL|companyName|impresa individuale|Donadio/);
    assert.match(read("src/components/SiteFooter.tsx"), /LEGAL\.companyName/);
    assert.match(read("src/app/privacy/page.tsx"), /LEGAL\.holderName/);
  });

  test("informativa: conferma di ricezione, consenso marketing facoltativo e revoca, versione aggiornata (ancora bozza = indicizzazione spenta)", async () => {
    const page = read("src/app/privacy/page.tsx");
    assert.match(page, /email di conferma/i);
    assert.match(page, /consenso/i);
    assert.match(page, /promozional/i);
    assert.match(page, /revoc/i);
    assert.match(page, /facoltativ/i);
    const biz = await import("@/config/business");
    assert.equal(biz.PRIVACY_POLICY_VERSION, "draft-5");
    assert.equal(biz.PRIVACY_POLICY_IS_DRAFT, true);
    const seo = await import("@/config/seo");
    assert.equal(seo.indexingEnabled(), false);
  });
});
