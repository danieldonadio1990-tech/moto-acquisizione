/**
 * Fallback del back office quando le tabelle del motore di valutazione (migrazione 0005) non esistono o non sono accessibili.
 * Si simula l'assenza con DROP TABLE su un database temporaneo (PGlite, o PostgreSQL con TEST_DATABASE_URL): nessun database reale.
 * Verifica due cose opposte: (1) il resto del sistema continua a funzionare; (2) gli errori INATTESI non vengono nascosti.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ReactElement, ReactNode } from "react";
import { isValuationSchemaUnavailable } from "@/db/errors";
import type { EmailMessage, EmailTransport, SendResult } from "@/modules/notifications/transport";

const TMP = mkdtempSync(path.join(tmpdir(), "moto-fallback-test-"));
Object.assign(process.env, {
  NODE_ENV: "test",
  PGLITE_DIR: path.join(TMP, "db"),
  UPLOADS_DIR: path.join(TMP, "uploads"),
  SESSION_SECRET: "test-secret-test-secret-test-secret-123456",
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
  DB_POOL_MAX: "10",
  STORAGE_DRIVER: "",
  ADMIN_PASSWORD: "",
  RATE_LIMIT_DISABLED: "true",
  FORM_TOKEN_REQUIRED: "false",
  RESEND_API_KEY: "dummy-key-not-real",
  NOTIFY_EMAIL_TO: "notifiche@example.invalid",
});
delete process.env.VALUATION_PUBLIC_OFFERS;

class Provider implements EmailTransport {
  sent: EmailMessage[] = [];
  async send(m: EmailMessage): Promise<SendResult> {
    this.sent.push(m);
    return { ok: true };
  }
}
const provider = new Provider();

let vs: typeof import("@/modules/valuation/service");
let panel: typeof import("@/modules/admin/ui/ValuationPanel");
let view: typeof import("@/modules/admin/ui/ValuationSettingsView");
let leadsRoute: typeof import("@/app/api/leads/route");
let svc: typeof import("@/modules/leads/service");
let tr: typeof import("@/modules/notifications/transport");
let dbmod: typeof import("@/db/client");
let orm: typeof import("drizzle-orm");

/**
 * I moduli «use client» dei moduli (ValuationForms) importano azioni e navigazione di Next, che non si caricano nei test con la
 * condizione react-server. Si sostituiscono con segnaposto NOMINATI: i componenti del back office veri (pannello, vista) restano
 * quelli di produzione e il test legge quali componenti scelgono di mostrare.
 */
function stubClientForms() {
  const names = ["RecomputeButton", "ManualOfferForm", "ConfirmOfferButton", "CloseValuationForm", "SettingsDraftForm", "ApproveSettingsButton", "MarketReferenceForm"];
  const exports: Record<string, unknown> = {};
  for (const n of names) exports[n] = { [n]: () => null }[n];
  const file = path.resolve("src/modules/admin/ui/ValuationForms.tsx");
  require.cache[file] = { id: file, filename: file, loaded: true, exports, children: [], paths: [], path: path.dirname(file), parent: null } as unknown as NodeJS.Module;
}

before(async () => {
  stubClientForms();
  tr = await import("@/modules/notifications/transport");
  tr.setEmailTransport(provider);
  vs = await import("@/modules/valuation/service");
  panel = await import("@/modules/admin/ui/ValuationPanel");
  view = await import("@/modules/admin/ui/ValuationSettingsView");
  leadsRoute = await import("@/app/api/leads/route");
  svc = await import("@/modules/leads/service");
  dbmod = await import("@/db/client");
  orm = await import("drizzle-orm");
});
after(async () => {
  tr.setEmailTransport(undefined);
  await dbmod.closeDb();
  rmSync(TMP, { recursive: true, force: true });
});

let phoneSeq = 3360000000 + Math.floor(Math.random() * 90_000_000);
const submission = () => ({
  submissionId: randomUUID(),
  motorcycle: { brand: "Honda", modelId: "honda-sh", year: 2019, displacement: 125 },
  mileage: 18000,
  condition: { isRunning: true, accident: "no", mechanicalIssues: "no", maintenance: "yes" },
  contact: {
    firstName: "Prova",
    lastName: "Fallback",
    phone: `+39${phoneSeq++}`,
    email: `fb.${randomUUID().slice(0, 8)}@example.invalid`,
    city: "Milano",
    preferredContact: "email",
    privacyConsent: true,
  },
});
let ip = 1;
const post = (body: unknown) =>
  leadsRoute.POST(new Request("http://localhost/api/leads", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", "x-forwarded-for": `198.51.101.${(ip++ % 250) + 1}` } }));
const exec = async (q: string) => (await dbmod.getDb()).execute(orm.sql.raw(q));
const MIGRATION_0005 = readFileSync("drizzle/0005_valuation_engine.sql", "utf8").split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
const dropTables = async () => {
  await exec("drop table if exists valuations");
  await exec("drop table if exists market_references");
  await exec("drop table if exists valuation_settings");
};
const restoreTables = async () => {
  await dropTables();
  for (const stmt of MIGRATION_0005) await exec(stmt);
};
/**
 * react-dom/server non è utilizzabile con la condizione react-server dei test: si percorre l'albero degli elementi.
 * Restituisce testo, valori di data-testid e nomi dei componenti incontrati (i moduli con hook non vengono eseguiti, ne basta il nome).
 */
function inspect(node: ReactNode, acc = { text: "", names: [] as string[], testids: [] as string[] }) {
  if (node === null || node === undefined || typeof node === "boolean") return acc;
  if (typeof node === "string" || typeof node === "number") {
    acc.text += ` ${node}`;
    return acc;
  }
  if (Array.isArray(node)) {
    node.forEach((n) => inspect(n, acc));
    return acc;
  }
  const el = node as ReactElement<{ children?: ReactNode; "data-testid"?: string }>;
  if (typeof el.type === "function") {
    const name = (el.type as { name?: string }).name ?? "?";
    acc.names.push(name);
    // l'avviso è un componente semplice (senza hook): si espande per leggerne il testo
    if (name === "ValuationUnavailable") inspect((el.type as (p: unknown) => ReactNode)(el.props), acc);
    else inspect(el.props?.children, acc); // i figli passati a un componente (es. Card) fanno parte dell'albero
  }
  if (typeof el.type === "string") {
    acc.names.push(el.type);
    if (el.props["data-testid"]) acc.testids.push(el.props["data-testid"]);
  }
  inspect(el.props?.children, acc);
  return acc;
}
const html = async (el: Promise<ReactElement> | ReactElement) => inspect(await el);

describe("riconoscimento dell'errore atteso (schema non migrato)", () => {
  const pg = (code: string, message: string, cause?: unknown) => Object.assign(new Error(message, { cause }), { code });
  test("tabella mancante o permesso negato su una tabella del motore: riconosciuto, anche avvolto da Drizzle", () => {
    for (const t of ["valuations", "market_references", "valuation_settings"]) {
      assert.equal(isValuationSchemaUnavailable(pg("42P01", `relation "${t}" does not exist`)), true, t);
      assert.equal(isValuationSchemaUnavailable(new Error(`Failed query: select * from "${t}"`, { cause: pg("42P01", `relation "${t}" does not exist`) })), true, t);
    }
    assert.equal(isValuationSchemaUnavailable(pg("42501", 'permission denied for table valuations')), true);
  });
  test("NON riconosciuto: altre tabelle, altri codici, errori di rete, bug, valori non-errore", () => {
    assert.equal(isValuationSchemaUnavailable(pg("42P01", 'relation "leads" does not exist')), false);
    // la query nomina «valuations» ma l'errore di PostgreSQL riguarda un'altra tabella
    assert.equal(
      isValuationSchemaUnavailable(new Error('Failed query: select * from "valuations" join "leads"', { cause: pg("42P01", 'relation "leads" does not exist') })),
      false,
    );
    assert.equal(isValuationSchemaUnavailable(pg("42703", 'column "revision" does not exist in valuations')), false);
    assert.equal(isValuationSchemaUnavailable(pg("23505", "duplicate key value violates unique constraint valuations_lead_revision_uq")), false);
    assert.equal(isValuationSchemaUnavailable(pg("ECONN", "connect ECONNREFUSED valuations")), false);
    assert.equal(isValuationSchemaUnavailable(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" })), false);
    assert.equal(isValuationSchemaUnavailable(new TypeError("Cannot read properties of undefined (reading 'valuations')")), false);
    assert.equal(isValuationSchemaUnavailable(null), false);
    assert.equal(isValuationSchemaUnavailable("42P01 valuations"), false);
  });
  test("whenValuationAvailable: l'errore atteso diventa {available:false}, ogni altro errore viene rilanciato", async () => {
    assert.deepEqual(await vs.whenValuationAvailable(async () => 7), { available: true, value: 7 });
    const expected = pg("42P01", 'relation "valuations" does not exist');
    assert.deepEqual(await vs.whenValuationAvailable(async () => Promise.reject(expected)), { available: false });
    const other = new Error("bug di programmazione");
    await assert.rejects(vs.whenValuationAvailable(async () => Promise.reject(other)), /bug di programmazione/);
    await assert.rejects(vs.whenValuationAvailable(async () => Promise.reject(pg("42P01", 'relation "leads" does not exist'))), /leads/);
  });
});

describe("tabelle del motore ASSENTI: il resto continua a funzionare", () => {
  let existingLeadId = "";

  before(async () => {
    // richiesta creata quando le tabelle c'erano, poi la migrazione «sparisce»
    const res = await post(submission());
    existingLeadId = ((await res.json()) as { id: string }).id;
    await dropTables();
  });

  test("le tabelle risultano davvero assenti (la simulazione funziona)", async () => {
    await assert.rejects(vs.getCurrentValuation(existingLeadId), (e) => isValuationSchemaUnavailable(e));
  });

  test("salvataggio di una nuova richiesta: 201, lead salvato, risposta «verifica manuale», nessun errore verso il cliente", async () => {
    const before = provider.sent.length;
    const res = await post(submission());
    assert.equal(res.status, 201);
    const body = (await res.json()) as { id: string; code: string; valuation: { kind: string } };
    assert.deepEqual(body.valuation, { kind: "manual" });
    assert.ok(body.code);
    const detail = await svc.getLeadDetail(body.id);
    assert.ok(detail, "la richiesta è nel database");
    assert.equal(provider.sent.length, before + 1, "la notifica email parte comunque");
    assert.equal(detail.lead.notificationStatus, "sent");
  });

  test("un invio ripetuto restituisce comunque la richiesta già salvata (200)", async () => {
    const body = submission();
    const a = await post(body);
    const b = await post(body);
    assert.equal(a.status, 201);
    assert.equal(b.status, 200);
  });

  test("dettaglio richiesta: i dati restano leggibili e il riquadro Valutazione mostra l'avviso, senza azioni", async () => {
    const detail = await svc.getLeadDetail(existingLeadId);
    assert.ok(detail && detail.motorcycle.brand === "Honda");
    const out = await html(panel.ValuationPanel({ leadId: existingLeadId }));
    assert.deepEqual(out.testids, ["valuation-unavailable"]);
    assert.match(out.text, /Il motore di valutazione non è disponibile/);
    assert.match(out.text, /0005_valuation_engine/);
    assert.ok(!out.names.some((n) => ["ConfirmOfferButton", "ManualOfferForm", "RecomputeButton", "CloseValuationForm"].includes(n)), "nessuna azione");
  });

  test("pagina «Valutazione»: stato informativo chiaro, nessun modulo, nessun errore", async () => {
    const out = await html(view.ValuationSettingsView());
    assert.ok(out.names.includes("h1"));
    assert.match(out.text, /Valutazione/);
    assert.match(out.text, /Il motore di valutazione non è disponibile/);
    assert.match(out.text, /migrazione/);
    assert.ok(!out.names.some((n) => ["SettingsDraftForm", "MarketReferenceForm", "ApproveSettingsButton"].includes(n)), "nessun modulo");
  });

  test("le funzioni che lavorano su offerte, stati e acquisti della richiesta restano invariate", async () => {
    const res = await post(submission());
    const { id } = (await res.json()) as { id: string };
    await svc.addOffer(id, 1800, "admin@example.invalid");
    const d = await svc.getLeadDetail(id);
    assert.equal(d!.lead.status, "offer_made");
    assert.equal(d!.offers.length, 1);
    await svc.changeStatus(id, "contacted", "admin@example.invalid");
    assert.equal((await svc.getLeadDetail(id))!.lead.status, "contacted");
  });

  test("nessun importo reale: l'interruttore è spento e i calcoli di creazione non scrivono nulla", async () => {
    assert.equal(vs.publicOffersEnabled(), false);
    assert.deepEqual(await vs.evaluateLeadOnCreate(existingLeadId), { kind: "manual" });
  });

  test("le azioni di modifica non crollano: l'errore atteso diventa un messaggio chiaro (verifica nel codice dell'azione)", () => {
    const actions = readFileSync("src/app/admin/actions.ts", "utf8");
    const fail = actions.slice(actions.indexOf("function fail("), actions.indexOf("export async function loginAction"));
    assert.match(fail, /isValuationSchemaUnavailable\(err\)/);
    assert.match(fail, /migrazione 0005/);
    // gli errori non attesi continuano a passare dal ramo generico (con log)
    assert.match(fail, /logError\("admin action", err\)/);
    // l'autenticazione non è cambiata: ogni azione di valutazione parte ancora da requireAdmin()
    assert.match(actions.slice(actions.indexOf("export async function confirmOfferAction")), /await requireAdmin\(\)/);
  });
});

describe("errori INATTESI: non vengono nascosti dal fallback", () => {
  let leadId = "";
  before(async () => {
    await restoreTables(); // tabelle presenti e sane
    const res = await post(submission());
    leadId = ((await res.json()) as { id: string }).id;
  });

  test("con le tabelle ripristinate il riquadro funziona normalmente (nessun avviso)", async () => {
    const out = await html(panel.ValuationPanel({ leadId }));
    assert.ok(!out.testids.includes("valuation-unavailable"));
    assert.match(out.text, /Stato/);
    const page = await html(view.ValuationSettingsView());
    assert.ok(!page.testids.includes("valuation-unavailable"));
    assert.ok(page.names.includes("SettingsDraftForm") && page.names.includes("MarketReferenceForm"));
  });

  test("colonna mancante (schema incoerente, non «tabella assente»): il riquadro lancia l'errore invece di nasconderlo", async () => {
    await exec("alter table valuations rename column revision to revision_x");
    try {
      await assert.rejects(panel.ValuationPanel({ leadId }), (e) => !isValuationSchemaUnavailable(e));
    } finally {
      await exec("alter table valuations rename column revision_x to revision");
    }
  });

  test("errore su un'altra tabella della pagina Valutazione: propagato", async () => {
    await exec("alter table market_references rename column brand to brand_x");
    try {
      await assert.rejects(view.ValuationSettingsView(), (e) => !isValuationSchemaUnavailable(e));
    } finally {
      await exec("alter table market_references rename column brand_x to brand");
    }
  });

  test("il fallback scatta per UNA SOLA tabella mancante, non per un guasto qualsiasi", async () => {
    await exec("drop table market_references");
    try {
      const out = await html(view.ValuationSettingsView());
      assert.match(out.text, /Il motore di valutazione non è disponibile/);
    } finally {
      await restoreTables();
    }
  });

  test("evaluateLeadOnCreate non lancia nemmeno per errori inattesi (la richiesta del cliente è già salvata), ma li registra", async () => {
    await exec("alter table valuations rename column revision to revision_x");
    const logs: string[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => void logs.push(a.map(String).join(" "));
    try {
      const res = await post(submission());
      assert.equal(res.status, 201);
      assert.deepEqual(((await res.json()) as { valuation: unknown }).valuation, { kind: "manual" });
    } finally {
      console.error = orig;
      await exec("alter table valuations rename column revision_x to revision");
    }
    assert.ok(logs.some((l) => l.includes("valutazione alla creazione")), "l'errore inatteso è nel log");
    assert.ok(!logs.some((l) => l.includes("tabelle non disponibili")), "non è classificato come schema mancante");
  });
});
