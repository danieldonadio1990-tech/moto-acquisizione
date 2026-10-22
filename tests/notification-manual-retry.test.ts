/**
 * Retry MANUALE delle notifiche email (azione esplicita di un admin, anche dopo i tentativi automatici esauriti).
 * Nessuna email reale: provider finto. Database: PGlite in una cartella temporanea. Esecuzione: npm test
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { EmailMessage, EmailTransport, SendResult } from "@/modules/notifications/transport";

const TMP = mkdtempSync(path.join(tmpdir(), "moto-manual-retry-test-"));
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
  NOTIFY_EMAIL_TO: "notifiche@example.invalid",
});

type Mode = "ok" | "fail" | "throw";
/** Si comporta come Resend con l'idempotenza: stessa chiave + stesso contenuto = nessuna seconda consegna. */
class Provider implements EmailTransport {
  mode: Mode = "ok";
  delayMs = 0;
  loseReplies = 0;
  attempts: EmailMessage[] = [];
  seen = new Map<string, string>();
  deliveries = 0;
  async send(msg: EmailMessage): Promise<SendResult> {
    this.attempts.push(msg);
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    if (this.mode === "throw") throw new Error("provider giù");
    if (this.mode === "fail") return { ok: false, code: "http_503" };
    const body = JSON.stringify({ f: msg.from, t: msg.to, s: msg.subject, x: msg.text });
    const prev = this.seen.get(msg.idempotencyKey);
    if (prev === undefined) {
      this.seen.set(msg.idempotencyKey, body);
      this.deliveries++;
    } else if (prev !== body) {
      return { ok: false, code: "http_409" };
    }
    if (this.loseReplies > 0) {
      this.loseReplies--;
      return { ok: false, code: "timeout" };
    }
    return { ok: true, id: "x" };
  }
}

let nl: typeof import("@/modules/notifications/new-lead");
let tr: typeof import("@/modules/notifications/transport");
let statusmod: typeof import("@/modules/notifications/status");
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
const ADMIN = "admin-prova@example.invalid";
/** Crea (una sola volta) un admin di prova nel database del test e ne restituisce l'id. */
async function adminId(email: string) {
  const db = await dbmod.getDb();
  const [found] = await db.select({ id: schema.adminUsers.id }).from(schema.adminUsers).where(orm.eq(schema.adminUsers.email, email));
  if (found) return found.id;
  const [row] = await db.insert(schema.adminUsers).values({ email, passwordHash: "x" }).returning({ id: schema.adminUsers.id });
  return row.id;
}

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
const arm = (mode: Mode = "ok") => {
  provider = new Provider();
  provider.mode = mode;
  tr.setEmailTransport(provider);
  return provider;
};
/** Lead con notifica già fallita (di default: tentativi automatici esauriti). */
async function exhaustedLead(set: Record<string, unknown> = {}) {
  tr.setEmailTransport(null);
  const l = await svc.createLead(submission());
  await patch(l.id, {
    createdAt: minutesAgo(60),
    notificationStatus: "failed",
    notificationAttempts: nl.MAX_ATTEMPTS,
    notificationError: "http_503",
    notificationClaimedAt: minutesAgo(30),
    ...set,
  });
  return l.id;
}
const pick = (r: { outcome: string; error: string | null }) => ({ outcome: r.outcome, error: r.error });
const eventsOf = async (id: string) => {
  const db = await dbmod.getDb();
  return db.select().from(schema.events).where(orm.and(orm.eq(schema.events.leadId, id), orm.eq(schema.events.name, "notification_manual_retry")));
};

before(async () => {
  nl = await import("@/modules/notifications/new-lead");
  tr = await import("@/modules/notifications/transport");
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

describe("1. Retry manuale di una notifica con tentativi automatici esauriti", () => {
  test("il tetto automatico resta 5; un retry manuale riuscito porta la richiesta a «sent» e viene tracciato", async () => {
    assert.equal(nl.MAX_ATTEMPTS, 5, "il tetto dei tentativi automatici non cambia");
    const id = await exhaustedLead();
    const p = arm();
    const adm = await adminId(ADMIN);
    const res = await nl.manualRetryNotification(id, ADMIN);
    assert.deepEqual(pick(res), { outcome: "sent", error: null });
    assert.equal(p.attempts.length, 1);
    const r = await row(id);
    assert.equal(r.notificationStatus, "sent");
    assert.equal(r.notificationAttempts, nl.MAX_ATTEMPTS + 1);
    assert.ok(r.notificationSentAt);
    assert.equal(r.notificationError, null);

    const ev = await eventsOf(id);
    assert.equal(ev.length, 1);
    assert.deepEqual(ev[0].props, { adminId: adm, outcome: "sent" });
    assert.ok(!JSON.stringify(ev[0].props).includes("@"), "nell'evento non c'è l'email dell'admin");
    assert.equal(ev[0].sessionId, null);
  });

  test("senza clic manuale il recupero automatico NON riprova (tetto rispettato); dopo un retry manuale fallito resta escluso", async () => {
    const id = await exhaustedLead();
    const p = arm("fail");
    assert.equal((await nl.retryNotificationsBatch(10)).candidates, 0);
    assert.equal(p.attempts.length, 0);

    const manual = await nl.manualRetryNotification(id, ADMIN);
    assert.deepEqual(pick(manual), { outcome: "failed", error: "http_503" });
    const r = await row(id);
    assert.deepEqual([r.notificationStatus, r.notificationAttempts], ["failed", nl.MAX_ATTEMPTS + 1]);

    await patch(id, { notificationClaimedAt: minutesAgo(600) });
    assert.equal((await nl.retryNotificationsBatch(10)).candidates, 0, "il recupero automatico continua a ignorarla");
    assert.equal(p.attempts.length, 1);
    // e un nuovo clic manuale è sempre possibile
    p.mode = "ok";
    assert.equal((await nl.manualRetryNotification(id, ADMIN)).outcome, "sent");
  });

  test("un errore o un'eccezione del provider non lancia verso l'admin e non tocca il lead", async () => {
    const id = await exhaustedLead();
    arm("throw");
    const res = await nl.manualRetryNotification(id, ADMIN);
    assert.deepEqual(pick(res), { outcome: "failed", error: "internal" });
    assert.ok(await svc.getLeadDetail(id));
    assert.equal((await row(id)).notificationStatus, "failed");
  });
});

describe("2. Idempotenza: stessa chiave e stesso contenuto", () => {
  test("email accettata dal provider ma risposta persa (timeout): il retry manuale non produce una seconda consegna", async () => {
    tr.setEmailTransport(null);
    const l = await svc.createLead(submission());
    const p = arm();
    p.loseReplies = 1;
    await patch(l.id, { createdAt: minutesAgo(60) });
    assert.equal(await nl.notifyNewLead(l.id), "failed"); // consegnata ma risposta persa
    assert.equal((await row(l.id)).notificationError, "timeout");
    await patch(l.id, { notificationAttempts: nl.MAX_ATTEMPTS, notificationClaimedAt: minutesAgo(30) });

    assert.equal((await nl.manualRetryNotification(l.id, ADMIN)).outcome, "sent");
    assert.equal(p.attempts.length, 2);
    assert.equal(p.deliveries, 1, "una sola consegna reale");
    assert.deepEqual(p.attempts[1], p.attempts[0], "stessa chiave, stesso mittente, destinatari, oggetto e testo");
    assert.equal(p.attempts[0].idempotencyKey, `lead-notify-${l.id}`);
  });
});

describe("3. Prenotazione atomica e casi non consentiti", () => {
  test("già inviata, richiesta precedente alle notifiche, invio in corso: nessun invio (ma il tentativo resta tracciato)", async () => {
    const sent = await exhaustedLead({ notificationStatus: "sent", notificationSentAt: minutesAgo(5), notificationAttempts: 1 });
    const legacy = await exhaustedLead({ notificationStatus: "skipped", notificationAttempts: 0 });
    const inFlight = await exhaustedLead({ notificationStatus: "sending", notificationAttempts: 1, notificationClaimedAt: minutesAgo(1) });
    const p = arm();
    for (const id of [sent, legacy, inFlight]) {
      assert.equal((await nl.manualRetryNotification(id, ADMIN)).outcome, "not_claimed");
      assert.equal((await eventsOf(id)).length, 1, "ogni clic manuale è tracciato, anche se non parte nessun invio");
    }
    assert.equal(p.attempts.length, 0);
    assert.equal((await row(sent)).notificationAttempts, 1);
    assert.equal((await row(inFlight)).notificationStatus, "sending");
    assert.deepEqual((await eventsOf(sent))[0].props, { adminId: await adminId(ADMIN), outcome: "not_claimed" });
  });

  test("invio rimasto appeso da oltre 5 minuti o richiesta ancora «pending»: si può riprovare", async () => {
    const stale = await exhaustedLead({ notificationStatus: "sending", notificationAttempts: 1, notificationClaimedAt: minutesAgo(10) });
    const pending = await exhaustedLead({ notificationStatus: "pending", notificationAttempts: 0, notificationClaimedAt: null });
    const p = arm();
    assert.equal((await nl.manualRetryNotification(stale, ADMIN)).outcome, "sent");
    assert.equal((await nl.manualRetryNotification(pending, ADMIN)).outcome, "sent");
    assert.equal(p.attempts.length, 2);
  });

  test("notifiche non configurate: esito «disabled», nessuna prenotazione", async () => {
    const id = await exhaustedLead();
    tr.setEmailTransport(null);
    assert.equal((await nl.manualRetryNotification(id, ADMIN)).outcome, "disabled");
    const r = await row(id);
    assert.deepEqual([r.notificationStatus, r.notificationAttempts], ["failed", nl.MAX_ATTEMPTS]);
  });

  test("5 clic simultanei: un solo invio; clic manuale + recupero automatico insieme: un solo invio", async () => {
    const a = await exhaustedLead();
    const p = arm();
    p.delayMs = 40;
    const outcomes = await Promise.all(Array.from({ length: 5 }, () => nl.manualRetryNotification(a, ADMIN)));
    assert.equal(outcomes.filter((o) => o.outcome === "sent").length, 1);
    assert.equal(outcomes.filter((o) => o.outcome === "not_claimed").length, 4);
    assert.equal(p.attempts.length, 1);

    // recuperabile anche in automatico (2 tentativi): manuale e automatico in gara
    tr.setEmailTransport(null);
    const l = await svc.createLead(submission());
    await patch(l.id, { createdAt: minutesAgo(60), notificationStatus: "failed", notificationAttempts: 2, notificationClaimedAt: minutesAgo(30) });
    const q = arm();
    q.delayMs = 40;
    const [m, batch] = await Promise.all([nl.manualRetryNotification(l.id, ADMIN), nl.retryNotificationsBatch(10)]);
    assert.equal(q.attempts.length, 1, "una sola consegna");
    assert.equal(q.deliveries, 1);
    assert.equal([m.outcome === "sent" ? 1 : 0, batch.sent].reduce((x, y) => x + y, 0), 1);
  });
});

describe("4. Traccia e visibilità nel back office", () => {
  test("la cronologia mostra data, admin ed esito, senza dati del cliente", async () => {
    const id = await exhaustedLead();
    const first = `uno-${randomUUID().slice(0, 6)}@example.invalid`;
    const second = `due-${randomUUID().slice(0, 6)}@example.invalid`;
    arm("fail");
    await nl.manualRetryNotification(id, first);
    provider.mode = "ok";
    await nl.manualRetryNotification(id, second);
    const hist = await nl.recentManualRetries(id);
    assert.deepEqual(hist.map((h) => [h.by, h.outcome]), [["admin rimosso", "sent"], ["admin rimosso", "failed"]], "senza utente admin si legge «admin rimosso»");
    // con l'utente admin presente, l'email si legge solo in lettura, risolta dall'id: l'evento non la contiene
    await adminId(second);
    await nl.manualRetryNotification(id, second);
    const hist2 = await nl.recentManualRetries(id);
    assert.equal(hist2[0].by, second);
    assert.ok(!JSON.stringify(await eventsOf(id)).includes("@"), "nessuna email negli eventi");
    const raw = JSON.stringify(await eventsOf(id));
    for (const pii of ["Mario", "Verdi", "3331234567", "mario.", "Pavia"]) assert.ok(!raw.includes(pii), pii);
  });

  test("messaggio per tentativi esauriti e offerta del retry solo dove serve (admin, azione esplicita)", () => {
    const d = statusmod.describeNotification(
      { notificationStatus: "failed", notificationAttempts: 6, notificationSentAt: null, notificationError: "http_503" },
      () => "x",
      5,
      true,
    );
    assert.match(d.detail ?? "", /automatici esauriti \(6 in tutto\).*http_503.*riprovare a mano/);

    const actions = readFileSync("src/app/admin/actions.ts", "utf8");
    const body = actions.slice(actions.indexOf("export async function retryNotificationAction"));
    assert.ok(body.indexOf("await requireAdmin()") !== -1 && body.indexOf("await requireAdmin()") < body.indexOf("manualRetryNotification("));
    // l'unico punto che richiama il retry manuale è l'azione protetta del back office
    const walk = (dir: string, out: string[] = []) => {
      for (const n of readdirSync(dir)) {
        const p = path.join(dir, n);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (/\.(ts|tsx)$/.test(n)) out.push(p);
      }
      return out;
    };
    const callers = walk("src").filter((f) => readFileSync(f, "utf8").includes("manualRetryNotification(") && !f.endsWith("new-lead.ts"));
    assert.deepEqual(callers, ["src/app/admin/actions.ts"]);

    const page = readFileSync("src/app/admin/(app)/lead/[id]/page.tsx", "utf8");
    assert.match(page, /canRetryNotification &&/);
    assert.match(page, /canOfferManualRetry\(lead\)/);
    // regola dell'offerta: solo se serve (fallita, o ferma da oltre 10 minuti) e solo con le notifiche configurate
    const old = new Date(Date.now() - 20 * 60 * 1000);
    tr.setEmailTransport(null);
    assert.equal(nl.canOfferManualRetry({ notificationStatus: "failed", createdAt: old }), false, "non configurate");
    arm();
    assert.equal(nl.canOfferManualRetry({ notificationStatus: "failed", createdAt: new Date() }), true);
    assert.equal(nl.canOfferManualRetry({ notificationStatus: "pending", createdAt: old }), true);
    assert.equal(nl.canOfferManualRetry({ notificationStatus: "pending", createdAt: new Date() }), false);
    assert.equal(nl.canOfferManualRetry({ notificationStatus: "sent", createdAt: old }), false);
    assert.equal(nl.canOfferManualRetry({ notificationStatus: "skipped", createdAt: old }), false);
  });
});

/** Provider con un comportamento deciso chiamata per chiamata (ritardo ed esito), per simulare invii che si accavallano. */
class Scripted implements EmailTransport {
  calls = 0;
  deliveries = 0;
  seen = new Set<string>();
  constructor(private plan: { delay: number; ok: boolean }[]) {}
  async send(msg: EmailMessage): Promise<SendResult> {
    const step = this.plan[this.calls++] ?? { delay: 0, ok: true };
    await new Promise((r) => setTimeout(r, step.delay));
    if (!step.ok) return { ok: false, code: "http_503" };
    if (!this.seen.has(msg.idempotencyKey)) {
      this.seen.add(msg.idempotencyKey);
      this.deliveries++;
    }
    return { ok: true };
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("5. Invio appeso rilevato da un altro processo: l'esito vecchio non sovrascrive quello nuovo", () => {
  for (const [name, plan] of [
    ["il vecchio fallisce DOPO che il nuovo ha finito", [{ delay: 200, ok: false }, { delay: 0, ok: true }]],
    ["il vecchio fallisce MENTRE il nuovo è ancora in corso", [{ delay: 60, ok: false }, { delay: 250, ok: true }]],
    ["il vecchio riesce mentre il nuovo fallisce", [{ delay: 60, ok: true }, { delay: 150, ok: false }]],
  ] as const) {
    test(name, async () => {
      const id = await exhaustedLead();
      const p = new Scripted([...plan]);
      tr.setEmailTransport(p);
      const first = nl.manualRetryNotification(id, ADMIN); // A: prenota (ticket 6) e resta in volo
      await sleep(20);
      await patch(id, { notificationClaimedAt: minutesAgo(nl.RETRY_AFTER_MINUTES + 1) }); // A risulta appeso da oltre 5 minuti
      const second = nl.manualRetryNotification(id, ADMIN); // B: rileva la prenotazione (ticket 7)
      const [a, b] = await Promise.all([first, second]);

      const r = await row(id);
      assert.equal(r.notificationAttempts, nl.MAX_ATTEMPTS + 2);
      if (plan[1].ok) {
        assert.equal(r.notificationStatus, "sent", "l'esito del nuovo processo (riuscito) non va perso");
        assert.equal(r.notificationError, null);
        assert.equal(b.outcome, "sent");
        assert.equal(a.outcome, "not_claimed", "il vecchio non scrive più nulla");
      } else {
        // il nuovo fallisce: lo stato è il suo, e il vecchio (riuscito, ma fuori ticket) non lo trasforma in «sent»
        assert.equal(r.notificationStatus, "failed");
        assert.equal(b.outcome, "failed");
        assert.equal(a.outcome, "not_claimed");
      }
      assert.ok(p.deliveries <= 1, "mai più di una consegna per la stessa chiave");
    });
  }
});

describe("6. Casi limite del pulsante", () => {
  test("richiesta inesistente: nessun invio e nessun evento orfano", async () => {
    const p = arm();
    const ghost = randomUUID();
    const res = await nl.manualRetryNotification(ghost, ADMIN);
    assert.deepEqual(res, { outcome: "not_claimed", error: null, attempts: null, notFound: true });
    assert.equal(p.attempts.length, 0);
    assert.equal((await eventsOf(ghost)).length, 0);
  });

  test("messaggi: dicono chiaramente se un eventuale fallimento verrà o non verrà ritentato in automatico", () => {
    const m = statusmod.manualRetryMessage;
    assert.deepEqual(m({ outcome: "sent", error: null, attempts: 6 }, 5), { ok: true });
    const exhausted = m({ outcome: "failed", error: "timeout", attempts: 6 }, 5) as { error: string };
    assert.match(exhausted.error, /timeout.*tentativo manuale.*non verrà ritentato in automatico/);
    const early = m({ outcome: "failed", error: "http_503", attempts: 2 }, 5) as { error: string };
    assert.match(early.error, /http_503.*riprova da solo/);
    assert.match((m({ outcome: "not_claimed", error: null, attempts: 3 }, 5) as { error: string }).error, /già inviata o è in corso/);
    assert.match((m({ outcome: "disabled", error: null, attempts: null }, 5) as { error: string }).error, /non sono configurate/);
    assert.deepEqual(m({ outcome: "not_claimed", error: null, attempts: null, notFound: true }, 5), { error: "Richiesta non trovata." });
  });

  test("stato mostrato con tentativi oltre il tetto: «non verrà ritentata in automatico»; invio appeso con tentativi esauriti", () => {
    const base = { notificationSentAt: null, notificationError: "timeout" };
    const failed = statusmod.describeNotification({ ...base, notificationStatus: "failed", notificationAttempts: 6 }, () => "x", 5, true);
    assert.match(failed.detail ?? "", /esauriti \(6 in tutto\).*Non verrà ritentata in automatico.*riprovare a mano/);
    const hung = statusmod.describeNotification({ ...base, notificationStatus: "sending", notificationAttempts: 5 }, () => "x", 5, true);
    assert.match(hung.detail ?? "", /esauriti.*riprovare a mano/);
    const early = statusmod.describeNotification({ ...base, notificationStatus: "sending", notificationAttempts: 1 }, () => "x", 5, true);
    assert.match(early.detail ?? "", /riprova da solo/);
  });

  test("il modulo avvisa che il tentativo è manuale quando i tentativi automatici sono esauriti", () => {
    const form = readFileSync("src/modules/admin/ui/LeadForms.tsx", "utf8");
    assert.match(form, /exhausted && \(/);
    assert.match(form, /questo sarà un tentativo manuale e, se fallisce, non verrà ritentato in automatico/);
    assert.match(readFileSync("src/app/admin/(app)/lead/[id]/page.tsx", "utf8"), /exhausted=\{lead\.notificationAttempts >= MAX_ATTEMPTS\}/);
  });
});

describe("7. Registro eventi e cancellazione dei dati", () => {
  test("le tracce dei retry manuali (email dell'admin) si cancellano con la richiesta; gli altri eventi restano anonimizzati", async () => {
    tr.setEmailTransport(null);
    const l = await svc.createLead(submission()); // crea l'evento lead_created
    arm("fail");
    await nl.manualRetryNotification(l.id, ADMIN);
    await nl.manualRetryNotification(l.id, ADMIN);
    assert.equal((await eventsOf(l.id)).length, 2);

    const erasure = await import("@/modules/privacy/erasure");
    const rep = await erasure.eraseLead(l.id);
    assert.equal(rep.eventsAnonymized, 1, "resta anonimizzato solo l'evento aggregato lead_created");
    assert.deepEqual(await erasure.remainingReferences([l.id]), { leads: 0, events: 0, photos: 0 });
    const db = await dbmod.getDb();
    const all = await db.select().from(schema.events);
    assert.ok(all.every((e) => !JSON.stringify(e.props ?? {}).includes(ADMIN) || e.leadId !== null || e.name !== "notification_manual_retry"));
    assert.equal(all.filter((e) => e.name === "notification_manual_retry" && JSON.stringify(e.props).includes(ADMIN) && e.leadId === null).length, 0);
  });
});
