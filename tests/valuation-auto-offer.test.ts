/**
 * Offerta automatica: creazione, casi in cui NON deve crearsi, tracciabilità del motivo, salvataggio e recupero.
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
let dbmod: typeof import("@/db/client");
let schema: typeof import("@/db/schema");
let orm: typeof import("drizzle-orm");

before(async () => {
  vs = await import("@/modules/valuation/service");
  leadsRoute = await import("@/app/api/leads/route");
  svc = await import("@/modules/leads/service");
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


const MARKET_OK = { medianCents: 500_000, p25Cents: 470_000, p75Cents: 530_000 }; // con PARAMS: 5.000 − 700 (costi) − 800 (margine) = 3.500 €
const AUTO = { ...PARAMS, automation: { autoOffer: true } };

const offersOf = async (leadId: string) => {
  const db = await dbmod.getDb();
  return db.select().from(schema.offers).where(orm.eq(schema.offers.leadId, leadId));
};
const leadOf = async (leadId: string) => {
  const db = await dbmod.getDb();
  const [l] = await db.select().from(schema.leads).where(orm.eq(schema.leads.id, leadId));
  return l;
};
const historyOf = async (leadId: string) => {
  const db = await dbmod.getDb();
  return db.select().from(schema.leadStatusHistory).where(orm.eq(schema.leadStatusHistory.leadId, leadId));
};
async function ready(params: unknown = AUTO, market: Parameters<typeof addMarket>[0] = {}) {
  await clearAll();
  await approveParams(params as typeof PARAMS);
  await addMarket({ ...MARKET_OK, ...market });
}

describe("offerta automatica: dati sufficienti e parametri approvati", () => {
  test("l'offerta viene creata e salvata, in euro interi, con margine rispettato e autore «motore»", async () => {
    await ready();
    const r = await create();
    const offers = await offersOf(r.id);
    assert.equal(offers.length, 1);
    assert.equal(offers[0].amount, 3500);
    assert.equal(offers[0].status, "proposed");
    assert.equal(offers[0].createdBy, vs.AUTO_ACTOR);
    const cur = (await vs.getCurrentValuation(r.id))!;
    // margine: rivendita − costi − offerta ≥ margine obiettivo
    assert.ok(cur.resaleCents! - cur.costTotalCents! - offers[0].amount * 100 >= cur.marginCents!);
    assert.ok(offers[0].amount * 100 <= cur.maxOfferCents!);
  });

  test("tracciabilità: revisione 1 «preliminare generata», revisione 2 «offerta confermata» dal motore, stato «Offerta fatta» con storico", async () => {
    await ready();
    const r = await create();
    const revs = await vs.listValuationRevisions(r.id);
    assert.deepEqual(revs.map((x) => [x.revision, x.status, x.createdBy]), [
      [1, "preliminary_generated", null],
      [2, "offer_confirmed", vs.AUTO_ACTOR],
    ]);
    assert.equal(revs[1].kind, "automatic");
    assert.equal(revs[1].disclosedToCustomer, false);
    assert.equal(revs[1].manualOfferCents, 350_000);
    assert.match(revs[1].manualReason!, /non comunicata al cliente/);
    assert.equal((await leadOf(r.id)).status, "offer_made");
    const h = await historyOf(r.id);
    assert.ok(h.some((x) => x.toStatus === "offer_made" && x.changedBy === vs.AUTO_ACTOR));
  });

  test("recupero dopo il salvataggio: l'offerta e la valutazione si rileggono da database", async () => {
    await ready();
    const r = await create();
    const again = await vs.getCurrentValuation(r.id);
    assert.equal(again!.status, "offer_confirmed");
    assert.equal((await offersOf(r.id))[0].amount, again!.manualOfferCents! / 100);
  });

  test("NON è visibile al cliente: risposta «verifica manuale», nessun importo né nella risposta né nella revisione 1", async () => {
    await ready();
    const res = await post(submission());
    const text = await res.text();
    const j = JSON.parse(text);
    assert.deepEqual(j.valuation, { kind: "manual" });
    assert.ok(!text.includes("3500") && !text.includes("350000"));
    const revs = await vs.listValuationRevisions(j.id);
    assert.equal(revs[0].disclosedToCustomer, false);
  });

  test("un importo con i centesimi viene portato per difetto all'euro intero e il margine resta rispettato", async () => {
    await ready({ ...AUTO, offer: { ...AUTO.offer, roundingStepCents: 1 } }, { medianCents: 500_049, p25Cents: 470_000, p75Cents: 530_000 });
    const r = await create();
    const cur = (await vs.getCurrentValuation(r.id))!;
    assert.equal(cur.maxOfferCents, 350_049);
    const [o] = await offersOf(r.id);
    assert.equal(o.amount, 3500);
    assert.ok(cur.resaleCents! - cur.costTotalCents! - o.amount * 100 >= cur.marginCents!);
  });

  test("tetto massimo: l'offerta automatica non lo supera mai", async () => {
    await ready({ ...AUTO, offer: { ...AUTO.offer, maxCents: 200_000 } });
    const r = await create();
    const [o] = await offersOf(r.id);
    assert.equal(o.amount, 2000);
    const cur = (await vs.getCurrentValuation(r.id))!;
    assert.ok((cur.reasons as string[]).includes("offer_capped"));
  });

  test("il modello scritto in minuscolo nei dati di mercato («sh») viene riconosciuto", async () => {
    await ready(AUTO, { family: "sh" });
    const r = await create();
    assert.equal((await offersOf(r.id)).length, 1);
  });
});

describe("offerta automatica: quando NON deve crearsi (e il motivo è registrato)", () => {
  async function expectManual(r: { id: string }, status: string, reason: string) {
    assert.equal((await offersOf(r.id)).length, 0, "nessuna offerta");
    assert.equal((await leadOf(r.id)).status, "new");
    const cur = (await vs.getCurrentValuation(r.id))!;
    assert.equal(cur.status, status);
    assert.ok((cur.reasons as string[]).includes(reason), `${reason} in ${JSON.stringify(cur.reasons)}`);
    assert.equal(cur.maxOfferCents === null || cur.status !== "offer_confirmed", true);
  }

  test("parametro spento (predefinito): calcolo sì, offerta no", async () => {
    await ready(PARAMS);
    const r = await create();
    assert.equal((await offersOf(r.id)).length, 0);
    assert.equal((await vs.getCurrentValuation(r.id))!.status, "preliminary_generated");
  });

  test("versione approvata prima di questo campo (senza «automation»): resta valida e senza automatismo", async () => {
    await clearAll();
    const { automation: _a, ...legacy } = AUTO;
    void _a;
    const db = await dbmod.getDb();
    await db.insert(schema.valuationSettings).values({
      version: 9_000 + Math.floor(Math.random() * 900), status: "approved", params: legacy, createdBy: "a@example.invalid",
      approvedBy: "b@example.invalid", approvedAt: new Date(),
    });
    await addMarket(MARKET_OK);
    const r = await create();
    assert.equal((await vs.getCurrentValuation(r.id))!.status, "preliminary_generated");
    assert.equal((await offersOf(r.id)).length, 0);
  });

  test("nessun parametro approvato", async () => {
    await clearAll();
    await addMarket(MARKET_OK);
    await expectManual(await create(), "insufficient_data", "no_approved_settings");
  });

  test("nessun dato di mercato", async () => {
    await clearAll();
    await approveParams(AUTO);
    await expectManual(await create(), "insufficient_data", "no_market_data");
  });

  test("modello non riconosciuto («Altro»)", async () => {
    await ready();
    await expectManual(await create(submission({ modelId: "other", modelOther: "Modello raro", brand: "Honda" })), "insufficient_data", "vehicle_not_recognized");
  });

  test("dati di mercato scaduti", async () => {
    await ready(AUTO, { asOf: new Date(Date.now() - 200 * 86_400_000) });
    await expectManual(await create(), "manual_review", "market_data_stale");
  });

  test("valutazione incerta: pochi casi → solo fascia, nessuna offerta", async () => {
    await ready(AUTO, { sampleCount: 5 });
    const r = await create();
    assert.equal((await vs.getCurrentValuation(r.id))!.decision, "indicative_range");
    await expectManual(r, "preliminary_generated", "few_samples");
  });

  test("affidabilità molto bassa → verifica manuale", async () => {
    await ready(AUTO, { sampleCount: 2 });
    await expectManual(await create(), "manual_review", "low_confidence");
  });

  test("costi e margine superiori al ricavo stimato: nessuna offerta, mai negativa", async () => {
    await ready(AUTO, { medianCents: 100_000, p25Cents: 90_000, p75Cents: 110_000 });
    const r = await create();
    await expectManual(r, "manual_review", "margin_insufficient");
    assert.equal((await vs.getCurrentValuation(r.id))!.maxOfferCents, null);
  });

  test("offerta calcolata sotto il minimo configurato", async () => {
    await ready({ ...AUTO, offer: { ...AUTO.offer, minCents: 360_000 } });
    await expectManual(await create(), "manual_review", "offer_below_minimum");
  });

  test("incidente, moto non funzionante o problemi meccanici: verifica manuale", async () => {
    await ready();
    await expectManual(await create(submission({}, { accident: "yes" })), "manual_review", "condition_requires_review");
    await expectManual(await create(submission({}, { isRunning: false })), "manual_review", "condition_requires_review");
    await expectManual(await create(submission({}, { mechanicalIssues: "yes" })), "manual_review", "condition_requires_review");
  });

  test("dati incompleti o incoerenti (km impossibili per l'età): dati insufficienti", async () => {
    await ready();
    const body = submission({ year: new Date().getFullYear() });
    (body as { mileage: number }).mileage = 200_000;
    await expectManual(await create(body), "insufficient_data", "invalid_input");
  });
});

describe("offerta automatica: ripetizioni, concorrenza e guasti", () => {
  test("doppio invio della stessa richiesta: una sola offerta e una sola coppia di revisioni", async () => {
    await ready();
    const body = submission();
    const a = await create(body);
    const b = await create(body);
    assert.equal(a.id, b.id);
    assert.equal((await offersOf(a.id)).length, 1);
    assert.equal((await vs.listValuationRevisions(a.id)).length, 2);
  });

  test("valutazioni simultanee della stessa richiesta: una sola offerta", async () => {
    await ready();
    const lead = await svc.createLead(submission() as never);
    await Promise.all(Array.from({ length: 5 }, () => vs.evaluateLeadOnCreate(lead.id)));
    assert.equal((await offersOf(lead.id)).length, 1);
    assert.equal((await vs.listValuationRevisions(lead.id)).length, 2);
  });

  test("non retroattivo: una richiesta già valutata non genera offerte se poi si accende il parametro", async () => {
    await ready(PARAMS);
    const lead = await svc.createLead(submission() as never);
    await vs.evaluateLeadOnCreate(lead.id);
    await approveParams(AUTO);
    await vs.evaluateLeadOnCreate(lead.id);
    assert.equal((await offersOf(lead.id)).length, 0);
  });

  test("il ricalcolo dell'amministratore non crea mai un'offerta da solo", async () => {
    await ready(PARAMS);
    const r = await create();
    await approveParams(AUTO);
    await vs.recomputeValuation(r.id, "admin@example.invalid");
    assert.equal((await offersOf(r.id)).length, 0);
  });

  test("errore nel salvataggio dell'offerta (moto già acquistata): nessuna offerta, motivo registrato, verifica manuale", async () => {
    await ready();
    const lead = await svc.createLead(submission() as never);
    const db = await dbmod.getDb();
    await db.update(schema.leads).set({ status: "purchased", purchasePrice: 3000, purchasedAt: new Date() }).where(orm.eq(schema.leads.id, lead.id));
    const res = await vs.evaluateLeadOnCreate(lead.id);
    assert.deepEqual(res, { kind: "manual" });
    assert.equal((await offersOf(lead.id)).length, 0);
    const cur = (await vs.getCurrentValuation(lead.id))!;
    assert.equal(cur.status, "manual_review");
    assert.ok((cur.reasons as string[]).includes("auto_offer_failed"));
    assert.equal(cur.createdBy, vs.AUTO_ACTOR);
    assert.equal((await vs.listValuationRevisions(lead.id)).length, 2);
  });

  test("errore tecnico del motore: la richiesta è salvata, il cliente vede la conferma e l'esito «errore tecnico» è registrato", async () => {
    await ready();
    vs.setMarketProvider({ lookup: async () => { throw new Error("guasto simulato"); } });
    try {
      const r = await create();
      assert.deepEqual(r.valuation, { kind: "manual" });
      const cur = (await vs.getCurrentValuation(r.id))!;
      assert.equal(cur.status, "insufficient_data");
      assert.deepEqual(cur.reasons, ["engine_error"]);
      assert.equal((await offersOf(r.id)).length, 0);
    } finally {
      vs.setMarketProvider(null);
    }
  });

  test("ogni richiesta ha un esito tracciabile: offerta, verifica manuale motivata o errore tecnico", async () => {
    await ready();
    const outcomes = [
      await create(), // offerta
      await create(submission({}, { accident: "yes" })), // verifica manuale
      await create(submission({ modelId: "other", modelOther: "Raro", brand: "Honda" })), // non riconosciuta
    ];
    for (const o of outcomes) {
      const cur = (await vs.getCurrentValuation(o.id))!;
      assert.ok(["offer_confirmed", "manual_review", "insufficient_data"].includes(cur.status));
      if (cur.status !== "offer_confirmed") assert.ok((cur.reasons as unknown[]).length > 0, "motivo registrato");
    }
  });
});

describe("offerta automatica: modulo dei parametri", () => {
  test("il campo si legge e si scrive dal modulo e di default è spento", async () => {
    const { formValuesFromParams, paramsFromForm } = await import("@/modules/valuation/fields");
    const { valuationParamsSchema, HYPOTHETICAL_DRAFT_PARAMS } = await import("@/modules/valuation/params");
    assert.equal(HYPOTHETICAL_DRAFT_PARAMS.automation.autoOffer, false);
    const values = formValuesFromParams(AUTO as never);
    assert.equal(values["automation.autoOffer"], "true");
    const off = paramsFromForm((n) => (n === "automation.autoOffer" ? null : values[n] ?? null));
    assert.deepEqual(off.errors, []);
    assert.equal(valuationParamsSchema.parse(off.params).automation.autoOffer, false);
    const on = paramsFromForm((n) => (n === "automation.autoOffer" ? "on" : values[n] ?? null));
    assert.equal(valuationParamsSchema.parse(on.params).automation.autoOffer, true);
  });
});
