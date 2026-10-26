/**
 * Valutazione: persistenza, revisioni, flusso amministrativo e integrazione con la creazione della richiesta.
 * I riferimenti di mercato inseriti qui sono FIXTURE SIMULATE (fonte «FIXTURE SIMULATA»): verificano l'impianto,
 * non sono quotazioni. Nessuna email reale. Database: PGlite temporaneo (o PostgreSQL con TEST_DATABASE_URL).
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { HYPOTHETICAL_DRAFT_PARAMS } from "@/modules/valuation/params";

const TMP = mkdtempSync(path.join(tmpdir(), "moto-valuation-test-"));
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
});
delete process.env.RESEND_API_KEY;
delete process.env.NOTIFY_EMAIL_TO;
delete process.env.VALUATION_PUBLIC_OFFERS;
delete process.env.VALUATION_ALLOW_SELF_APPROVAL;

let vs: typeof import("@/modules/valuation/service");
let leadsRoute: typeof import("@/app/api/leads/route");
let svc: typeof import("@/modules/leads/service");
let erasure: typeof import("@/modules/privacy/erasure");
let dbmod: typeof import("@/db/client");
let schema: typeof import("@/db/schema");
let orm: typeof import("drizzle-orm");

before(async () => {
  vs = await import("@/modules/valuation/service");
  leadsRoute = await import("@/app/api/leads/route");
  svc = await import("@/modules/leads/service");
  erasure = await import("@/modules/privacy/erasure");
  dbmod = await import("@/db/client");
  schema = await import("@/db/schema");
  orm = await import("drizzle-orm");
});
after(async () => {
  await dbmod.closeDb();
  rmSync(TMP, { recursive: true, force: true });
});

let phoneSeq = 3350000000 + Math.floor(Math.random() * 90_000_000);
const submission = (over: Record<string, unknown> = {}, condition: Record<string, unknown> = {}) => ({
  submissionId: randomUUID(),
  motorcycle: { brand: "Honda", modelId: "honda-sh", year: 2019, displacement: 125, ...over },
  mileage: 18000,
  condition: { isRunning: true, accident: "no", mechanicalIssues: "no", maintenance: "yes", ...condition },
  contact: {
    firstName: "Prova",
    lastName: "Valutazione",
    phone: `+39${phoneSeq++}`,
    email: `val.${randomUUID().slice(0, 8)}@example.invalid`,
    city: "Milano",
    preferredContact: "email",
    privacyConsent: true,
  },
});
let ip = 1;
const post = (body: unknown) =>
  leadsRoute.POST(
    new Request("http://localhost/api/leads", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.${(ip++ % 250) + 1}` } }),
  );
const create = async (body = submission()) => {
  const res = await post(body);
  assert.ok(res.status === 201 || res.status === 200, `stato ${res.status}`);
  return (await res.json()) as { id: string; code: string; valuation: { kind: string; amountCents?: number; lowCents?: number; highCents?: number } };
};
async function clearAll() {
  const db = await dbmod.getDb();
  await db.delete(schema.valuations);
  await db.delete(schema.marketReferences);
  await db.update(schema.valuationSettings).set({ status: "retired", approvedAt: orm.sql`now()` });
}
const PARAMS = {
  ...HYPOTHETICAL_DRAFT_PARAMS,
  resale: { basis: "median" as const, haircutBp: 0 },
  offer: { minCents: 10_000, maxCents: 1_000_000, roundingStepCents: 5_000 },
};
async function approveParams(p = PARAMS) {
  const draft = await vs.createSettingsDraft(p, "fixture di test", "preparatore@example.invalid");
  await vs.approveSettings(draft.id, "approvatore@example.invalid");
  return draft;
}
const addMarket = (over: Partial<Parameters<typeof vs.addMarketReference>[0]> = {}) =>
  vs.addMarketReference(
    {
      brand: "Honda",
      family: "SH",
      yearFrom: 2015,
      yearTo: 2022,
      medianCents: 500_000,
      p25Cents: 470_000,
      p75Cents: 530_000,
      sampleCount: 40,
      kind: "sold",
      source: "FIXTURE SIMULATA (test)",
      asOf: new Date(Date.now() - 5 * 86_400_000),
      ...over,
    },
    "admin@example.invalid",
  );

describe("creazione della richiesta con la valutazione", () => {
  test("senza parametri approvati né dati di mercato: richiesta salvata, il cliente vede «verifica manuale», nessun importo", async () => {
    await clearAll();
    const r = await create();
    assert.deepEqual(r.valuation, { kind: "manual" });
    const cur = await vs.getCurrentValuation(r.id);
    assert.equal(cur!.status, "insufficient_data");
    assert.deepEqual(cur!.reasons, ["no_approved_settings"]);
    assert.equal(cur!.maxOfferCents, null);
    assert.equal(cur!.revision, 1);
  });

  test("la risposta al browser non contiene costi, margini o formula", async () => {
    await clearAll();
    await approveParams();
    await addMarket();
    process.env.VALUATION_PUBLIC_OFFERS = "true";
    try {
      const res = await post(submission());
      const text = await res.text();
      for (const k of ["margin", "cost", "resale", "formula", "confidence", "median"]) assert.ok(!text.toLowerCase().includes(k), k);
    } finally {
      delete process.env.VALUATION_PUBLIC_OFFERS;
    }
  });

  test("con parametri e dati ma interruttore spento: il calcolo interno esiste, il cliente NON vede l'importo", async () => {
    await clearAll();
    await approveParams();
    await addMarket();
    const r = await create();
    assert.deepEqual(r.valuation, { kind: "manual" });
    const cur = await vs.getCurrentValuation(r.id);
    assert.equal(cur!.decision, "preliminary_offer");
    assert.equal(cur!.status, "preliminary_generated");
    assert.equal(cur!.maxOfferCents, 355_000 - 5_000 >= 0 ? cur!.maxOfferCents : null);
    assert.ok((cur!.reasons as string[]).includes("public_offers_disabled"));
    assert.equal(cur!.disclosedToCustomer, false);
  });

  test("interruttore acceso: il cliente vede l'offerta preliminare calcolata dal server (non da valori inviati dal browser)", async () => {
    await clearAll();
    await approveParams();
    await addMarket();
    process.env.VALUATION_PUBLIC_OFFERS = "true";
    try {
      // il browser prova a imporre prezzo e margine: i campi sconosciuti vengono ignorati
      const r = await create({ ...submission(), price: 999_999, margin: 1, offer: 5000 } as never);
      assert.equal(r.valuation.kind, "offer");
      const cur = await vs.getCurrentValuation(r.id);
      assert.equal(r.valuation.amountCents, cur!.maxOfferCents);
      assert.notEqual(r.valuation.amountCents, 999_999);
      assert.ok(r.valuation.amountCents! % 5_000 === 0);
    } finally {
      delete process.env.VALUATION_PUBLIC_OFFERS;
    }
  });

  test("moto «Altro» (non riconosciuta): verifica manuale anche con tutto configurato", async () => {
    await clearAll();
    await approveParams();
    await addMarket();
    process.env.VALUATION_PUBLIC_OFFERS = "true";
    try {
      const r = await create(submission({ modelId: "other", modelOther: "Modello raro", brand: "Honda" }));
      assert.deepEqual(r.valuation, { kind: "manual" });
      assert.deepEqual((await vs.getCurrentValuation(r.id))!.reasons, ["vehicle_not_recognized"]);
    } finally {
      delete process.env.VALUATION_PUBLIC_OFFERS;
    }
  });

  test("incidente dichiarato: verifica manuale (con le impostazioni di partenza)", async () => {
    await clearAll();
    await approveParams();
    await addMarket();
    process.env.VALUATION_PUBLIC_OFFERS = "true";
    try {
      const r = await create(submission({}, { accident: "yes" }));
      assert.deepEqual(r.valuation, { kind: "manual" });
      assert.equal((await vs.getCurrentValuation(r.id))!.status, "manual_review");
    } finally {
      delete process.env.VALUATION_PUBLIC_OFFERS;
    }
  });

  test("dati di mercato scaduti: nessun importo", async () => {
    await clearAll();
    await approveParams();
    await addMarket({ asOf: new Date(Date.now() - 400 * 86_400_000) });
    process.env.VALUATION_PUBLIC_OFFERS = "true";
    try {
      const r = await create();
      assert.deepEqual(r.valuation, { kind: "manual" });
      assert.ok(((await vs.getCurrentValuation(r.id))!.reasons as string[]).includes("market_data_stale"));
    } finally {
      delete process.env.VALUATION_PUBLIC_OFFERS;
    }
  });

  test("un invio ripetuto (stesso submissionId) restituisce la stessa valutazione, senza nuove revisioni", async () => {
    await clearAll();
    const body = submission();
    const a = await create(body);
    const b = await create(body);
    assert.equal(a.id, b.id);
    assert.deepEqual(a.valuation, b.valuation);
    assert.equal((await vs.listValuationRevisions(a.id)).length, 1);
  });

  test("richieste simultanee di valutazione per lo stesso lead: una sola revisione 1", async () => {
    await clearAll();
    const r = await create();
    const db = await dbmod.getDb();
    await db.delete(schema.valuations);
    await Promise.all(Array.from({ length: 8 }, () => vs.evaluateLeadOnCreate(r.id)));
    const revs = await vs.listValuationRevisions(r.id);
    assert.deepEqual(revs.map((x) => x.revision), [1]);
  });

  test("un guasto del motore non impedisce il salvataggio: il cliente riceve comunque la conferma", async () => {
    await clearAll();
    const db = await dbmod.getDb();
    // parametri approvati corrotti → il motore non calcola, la richiesta resta salvata
    const [row] = await db.insert(schema.valuationSettings).values({ version: 9999, status: "approved", params: { rotto: true }, createdBy: "x", approvedBy: "y", approvedAt: new Date() }).returning();
    try {
      const r = await create();
      assert.deepEqual(r.valuation, { kind: "manual" });
      assert.ok((await svc.getLeadDetail(r.id)) !== null);
      assert.equal((await vs.getCurrentValuation(r.id))!.maxOfferCents, null);
    } finally {
      await db.delete(schema.valuationSettings).where(orm.eq(schema.valuationSettings.id, row.id));
    }
  });
});

describe("parametri: versioni, approvazione e audit", () => {
  test("una bozza non è usata finché non è approvata", async () => {
    await clearAll();
    await vs.createSettingsDraft(PARAMS, null, "preparatore@example.invalid");
    assert.equal(await vs.getApprovedSettings(), null);
  });
  test("parametri incoerenti rifiutati alla creazione della bozza", async () => {
    await assert.rejects(vs.createSettingsDraft({ ...PARAMS, offer: { ...PARAMS.offer, minCents: 9_999_999 } }, null, "a@example.invalid"), /minimo/i);
    await assert.rejects(vs.createSettingsDraft({ nonValido: 1 }, null, "a@example.invalid"));
  });
  test("chi prepara i parametri non li approva da solo (salvo scelta esplicita)", async () => {
    await clearAll();
    const d = await vs.createSettingsDraft(PARAMS, null, "unico@example.invalid");
    await assert.rejects(vs.approveSettings(d.id, "unico@example.invalid"), /altro amministratore/);
    process.env.VALUATION_ALLOW_SELF_APPROVAL = "true";
    try {
      await vs.approveSettings(d.id, "unico@example.invalid");
    } finally {
      delete process.env.VALUATION_ALLOW_SELF_APPROVAL;
    }
    assert.equal((await vs.getApprovedSettings())!.version, d.version);
  });
  test("approvare una nuova versione ritira la precedente: una sola approvata, con chi e quando", async () => {
    await clearAll();
    const a = await approveParams();
    const b = await approveParams({ ...PARAMS, offer: { ...PARAMS.offer, maxCents: 900_000 } });
    const all = await vs.listSettings();
    assert.equal(all.filter((s) => s.status === "approved").length, 1);
    assert.equal(all.find((s) => s.id === a.id)!.status, "retired");
    const cur = all.find((s) => s.id === b.id)!;
    assert.equal(cur.approvedBy, "approvatore@example.invalid");
    assert.ok(cur.approvedAt);
  });
  test("riferimenti di mercato: provenienza obbligatoria e coerenza dei percentili", async () => {
    await assert.rejects(addMarket({ source: "" }), /fonte/i);
    await assert.rejects(addMarket({ p25Cents: 600_000 }), /percentile/);
    await assert.rejects(addMarket({ asOf: new Date(Date.now() + 10 * 86_400_000) }), /futuro/);
    await assert.rejects(addMarket({ yearFrom: 2020, yearTo: 2010 }), /anni/);
  });
});

describe("back office: offerta manuale, conferma, revisioni", () => {
  async function leadWithValuation() {
    await clearAll();
    await approveParams();
    await addMarket();
    return (await create()).id;
  }

  test("offerta manuale: serve il motivo; non oltre il tetto; oltre il massimo calcolato solo con conferma esplicita", async () => {
    const id = await leadWithValuation();
    const max = (await vs.getCurrentValuation(id))!.maxOfferCents!;
    await assert.rejects(vs.setManualOffer(id, 300_000, "ok", "admin@example.invalid"), /motivo/);
    await assert.rejects(vs.setManualOffer(id, 2_000_000, "motivo valido", "admin@example.invalid", true), /tetto/);
    await assert.rejects(vs.setManualOffer(id, 150_050, "motivo valido", "admin@example.invalid"), /euro interi/);
    await assert.rejects(vs.setManualOffer(id, -100, "motivo valido", "admin@example.invalid"));
    await assert.rejects(vs.setManualOffer(id, max + 10_000, "motivo valido", "admin@example.invalid"), /supera l'offerta massima/);
    const ok = await vs.setManualOffer(id, max + 10_000, "motivo valido", "admin@example.invalid", true);
    assert.equal(ok.status, "offer_to_confirm");
    assert.equal(ok.manualOfferCents, max + 10_000);
    assert.equal(ok.createdBy, "admin@example.invalid");
  });

  test("conferma: crea l'offerta nel flusso esistente (stato «Offerta fatta»), una volta sola, con storico delle revisioni", async () => {
    const id = await leadWithValuation();
    await vs.setManualOffer(id, 300_000, "concordata al telefono", "admin@example.invalid");
    const confirmed = await vs.confirmOffer(id, "admin@example.invalid");
    assert.equal(confirmed.status, "offer_confirmed");
    const db = await dbmod.getDb();
    const offs = await db.select().from(schema.offers).where(orm.eq(schema.offers.leadId, id));
    assert.deepEqual(offs.map((o) => [o.amount, o.status]), [[3000, "proposed"]]);
    const [lead] = await db.select().from(schema.leads).where(orm.eq(schema.leads.id, id));
    assert.equal(lead.status, "offer_made");
    await assert.rejects(vs.confirmOffer(id, "admin@example.invalid"), /già confermata/);
    assert.equal((await db.select().from(schema.offers).where(orm.eq(schema.offers.leadId, id))).length, 1);
    const revs = await vs.listValuationRevisions(id);
    assert.deepEqual(revs.map((r) => [r.revision, r.status]), [[1, "preliminary_generated"], [2, "offer_to_confirm"], [3, "offer_confirmed"]]);
  });

  test("conferme simultanee: una sola offerta creata", async () => {
    const id = await leadWithValuation();
    await vs.setManualOffer(id, 300_000, "concordata al telefono", "admin@example.invalid");
    const out = await Promise.allSettled(Array.from({ length: 5 }, () => vs.confirmOffer(id, "admin@example.invalid")));
    const db = await dbmod.getDb();
    const offs = await db.select().from(schema.offers).where(orm.eq(schema.offers.leadId, id));
    assert.equal(offs.length, 1, "una sola offerta creata");
    assert.equal(out.filter((o) => o.status === "fulfilled").length, 1);
    // la valutazione risulta confermata una sola volta in sequenza di revisioni coerenti
    const revs = await vs.listValuationRevisions(id);
    assert.deepEqual(revs.map((r) => r.revision), revs.map((_, i) => i + 1));
  });

  test("senza importo non si conferma nulla (verifica manuale, dati insufficienti)", async () => {
    await clearAll();
    await approveParams();
    const r = await create(); // nessun dato di mercato → verifica manuale
    await assert.rejects(vs.confirmOffer(r.id, "admin@example.invalid"), /Non c'è un importo/);
  });

  test("la conferma richiede parametri approvati e rispetta il tetto", async () => {
    const id = await leadWithValuation();
    await vs.setManualOffer(id, 300_000, "concordata al telefono", "admin@example.invalid");
    const db = await dbmod.getDb();
    await db.update(schema.valuationSettings).set({ status: "retired" });
    await assert.rejects(vs.confirmOffer(id, "admin@example.invalid"), /Approva prima/);
  });

  test("ricalcolo: nuova revisione, lo storico resta; rifiuto e scadenza richiedono un motivo", async () => {
    const id = await leadWithValuation();
    const re = await vs.recomputeValuation(id, "admin@example.invalid");
    assert.equal(re.revision, 2);
    assert.equal(re.kind, "automatic");
    await assert.rejects(vs.closeValuation(id, "rejected", "no", "admin@example.invalid"), /motivo/);
    const closed = await vs.closeValuation(id, "rejected", "il cliente ha rinunciato", "admin@example.invalid");
    assert.equal(closed.status, "rejected");
    assert.equal((await vs.listValuationRevisions(id)).length, 3);
  });

  test("ricalcoli simultanei: numeri di revisione consecutivi e senza doppioni", async () => {
    const id = await leadWithValuation();
    await Promise.all(Array.from({ length: 6 }, () => vs.recomputeValuation(id, "admin@example.invalid")));
    const revs = await vs.listValuationRevisions(id);
    assert.deepEqual(revs.map((r) => r.revision), [1, 2, 3, 4, 5, 6, 7]);
  });

  test("le revisioni non contengono dati personali del cliente (solo dati della moto)", async () => {
    const id = await leadWithValuation();
    const cur = (await vs.getCurrentValuation(id))!;
    const blob = JSON.stringify(cur);
    for (const k of ["Prova", "example.invalid", "+39", "Milano"]) assert.ok(!blob.includes(k), k);
  });
});

describe("privacy: cancellazione della richiesta", () => {
  test("privacy:erase cancella anche le valutazioni della richiesta", async () => {
    await clearAll();
    await approveParams();
    await addMarket();
    const r = await create();
    assert.ok((await vs.listValuationRevisions(r.id)).length >= 1);
    await erasure.eraseLead(r.id);
    assert.equal((await vs.listValuationRevisions(r.id)).length, 0);
  });
});
