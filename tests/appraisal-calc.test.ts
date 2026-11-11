/**
 * Calcolo della scheda di valutazione (funzione pura). Importi SIMULATI per provare le regole: non sono dati di mercato.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { comparableStats, computeAppraisal, type AppraisalInput } from "@/modules/appraisal/calc";
import { appraisalParamsSchema, valuationParamsSchema, HYPOTHETICAL_DRAFT_PARAMS, APPRAISAL_MODEL_DRAFT, type AppraisalParams } from "@/modules/valuation/params";

const E = (euros: number) => euros * 100;
/** parametri completi simulati (passaggio e altri costi = 150 € INVENTATO per il test) */
const PARAMS: AppraisalParams = {
  marginCents: E(800),
  preparationContingencyCents: E(100),
  transportCents: E(50),
  transferAndOtherCents: E(150),
  firstOfferDiscountMinCents: E(300),
  firstOfferDiscountMaxCents: E(400),
  firstOfferDiscountDefaultCents: E(350),
};
const base = (over: Partial<AppraisalInput> = {}): AppraisalInput => ({
  params: PARAMS,
  includedPricesCents: [E(2300), E(2400), E(2500)],
  comparablesValueCents: E(2400),
  resaleValueCents: E(3800),
  discountCents: E(350),
  manualFirstOfferCents: null,
  targetPriceCents: null,
  ...over,
});
const codes = (r: ReturnType<typeof computeAppraisal>) => r.warnings.map((w) => w.code);

describe("statistiche dei comparabili", () => {
  test("mediana, minimo, massimo; percentili solo con almeno 4 annunci", () => {
    assert.deepEqual(comparableStats([E(2500), E(2300), E(2400)]), { count: 3, minCents: E(2300), maxCents: E(2500), medianCents: E(2400), p25Cents: null, p75Cents: null });
    const four = comparableStats([E(2000), E(2200), E(2400), E(2600)])!;
    assert.equal(four.medianCents, E(2300));
    assert.equal(four.p25Cents, E(2150));
    assert.equal(four.p75Cents, E(2450));
    assert.equal(comparableStats([]), null);
  });
});

describe("valori separati e massimo sostenibile", () => {
  test("massimo = rivendita − margine − preparazione − trasporto − passaggio/altri", () => {
    const r = computeAppraisal(base());
    assert.equal(r.maxSustainableCents, E(3800 - 800 - 100 - 50 - 150)); // 2.700
    assert.deepEqual(r.costs, { marginCents: E(800), preparationContingencyCents: E(100), transportCents: E(50), transferAndOtherCents: E(150) });
  });

  test("un costo NON configurato non vale zero: massimo non calcolabile, nessuna prima offerta valida", () => {
    const r = computeAppraisal(base({ params: { ...PARAMS, transferAndOtherCents: null } }));
    assert.equal(r.maxSustainableCents, null);
    assert.equal(r.firstOfferCents, null);
    assert.deepEqual(r.costsMissing, ["transferAndOtherCents"]);
    assert.ok(codes(r).includes("costs_not_configured"));
    assert.ok(codes(r).includes("max_not_available"));
  });

  test("senza parametri approvati o senza valore di rivendita: massimo non calcolabile", () => {
    assert.equal(computeAppraisal(base({ params: null })).maxSustainableCents, null);
    assert.ok(codes(computeAppraisal(base({ params: null }))).includes("settings_missing"));
    const r = computeAppraisal(base({ resaleValueCents: null }));
    assert.equal(r.maxSustainableCents, null);
    assert.ok(codes(r).includes("resale_value_missing"));
  });

  test("il valore di rivendita non viene mai dedotto dai comparabili e viceversa", () => {
    const r = computeAppraisal(base({ resaleValueCents: null, comparablesValueCents: null }));
    assert.equal(r.proposedFirstOfferCents, null);
    assert.equal(r.maxSustainableCents, null);
    assert.ok(codes(r).includes("comparables_value_missing"));
  });
});

describe("prima offerta", () => {
  test("comparabili − sconto (nell'intervallo), entro il massimo: calcolata e valida", () => {
    const r = computeAppraisal(base());
    assert.equal(r.proposedFirstOfferCents, E(2050));
    assert.equal(r.firstOfferCents, E(2050));
    assert.equal(r.firstOfferKind, "calculated");
    assert.equal(r.marginAtFirstOfferCents, E(3800 - 2050 - 300)); // rivendita − prezzo − costi esclusa la quota di margine
  });

  test("criteri incompatibili: avviso con lo scarto, NESSUNA offerta (non forzata al massimo)", () => {
    const r = computeAppraisal(base({ resaleValueCents: E(2900) })); // massimo 1.800 < 2.050
    assert.equal(r.maxSustainableCents, E(1800));
    assert.equal(r.proposedFirstOfferCents, E(2050));
    assert.equal(r.firstOfferCents, null);
    assert.equal(r.incompatibilityGapCents, E(250));
    assert.ok(codes(r).includes("criteria_incompatible"));
    assert.deepEqual(r.errors, []);
  });

  test("sconto fuori intervallo → errore bloccante; sconto mancante → avviso; intervallo non configurato → avviso", () => {
    assert.match(computeAppraisal(base({ discountCents: E(250) })).errors.join(), /tra 300 € e 400 €/);
    assert.match(computeAppraisal(base({ discountCents: E(450) })).errors.join(), /tra 300 € e 400 €/);
    assert.ok(codes(computeAppraisal(base({ discountCents: null }))).includes("discount_missing"));
    const r = computeAppraisal(base({ params: { ...PARAMS, firstOfferDiscountMinCents: null } }));
    assert.ok(codes(r).includes("discount_range_not_configured"));
    assert.equal(r.proposedFirstOfferCents, null);
  });

  test("prima offerta manuale entro il massimo: valida; oltre il massimo o senza massimo: errore", () => {
    const ok = computeAppraisal(base({ resaleValueCents: E(2900), manualFirstOfferCents: E(1700) }));
    assert.equal(ok.firstOfferCents, E(1700));
    assert.equal(ok.firstOfferKind, "manual");
    assert.deepEqual(ok.errors, []);
    assert.match(computeAppraisal(base({ resaleValueCents: E(2900), manualFirstOfferCents: E(1900) })).errors.join(), /supera il massimo/);
    assert.match(computeAppraisal(base({ resaleValueCents: null, manualFirstOfferCents: E(1000) })).errors.join(), /non è calcolabile/);
  });

  test("arrotondamento prudente all'euro inferiore", () => {
    const r = computeAppraisal(base({ comparablesValueCents: E(2400) + 50 })); // 2.400,50 − 350 = 2.050,50 → 2.050
    assert.equal(r.proposedFirstOfferCents, E(2050));
  });
});

describe("prezzo obiettivo", () => {
  test("solo manuale; oltre il massimo: avviso NON bloccante con il margine previsto", () => {
    const r = computeAppraisal(base({ targetPriceCents: E(2900) }));
    assert.deepEqual(r.errors, []);
    const w = r.warnings.find((x) => x.code === "target_above_max")!;
    assert.match(w.message, /supera il massimo sostenibile/);
    assert.equal(r.marginAtTargetCents, E(3800 - 2900 - 300));
    assert.match(w.message, /600 €/);
    assert.equal(computeAppraisal(base({ targetPriceCents: null })).marginAtTargetCents, null);
  });
});

describe("avvisi sui comparabili e casi limite", () => {
  test("pochi comparabili e prezzi richiesti", () => {
    const r = computeAppraisal(base({ includedPricesCents: [E(2400)] }));
    assert.ok(codes(r).includes("few_comparables"));
    assert.ok(codes(r).includes("asking_prices"));
  });
  test("rivendita che non copre costi e margine: avviso esplicito", () => {
    const r = computeAppraisal(base({ resaleValueCents: E(1000) }));
    assert.ok(codes(r).includes("max_not_positive"));
    assert.equal(r.firstOfferCents, null);
  });
});

describe("parametri della scheda", () => {
  test("bozza del modello del titolare: passaggio e sconto proposto NON configurati", () => {
    assert.equal(APPRAISAL_MODEL_DRAFT.marginCents, E(800));
    assert.equal(APPRAISAL_MODEL_DRAFT.preparationContingencyCents, E(100));
    assert.equal(APPRAISAL_MODEL_DRAFT.transportCents, E(50));
    assert.equal(APPRAISAL_MODEL_DRAFT.transferAndOtherCents, null);
    assert.equal(APPRAISAL_MODEL_DRAFT.firstOfferDiscountDefaultCents, null);
    assert.ok(appraisalParamsSchema.safeParse(APPRAISAL_MODEL_DRAFT).success);
    assert.ok(valuationParamsSchema.safeParse(HYPOTHETICAL_DRAFT_PARAMS).success);
  });
  test("versioni precedenti senza il blocco della scheda restano valide", () => {
    const old: Record<string, unknown> = { ...HYPOTHETICAL_DRAFT_PARAMS };
    delete old.appraisal;
    assert.ok(valuationParamsSchema.safeParse(old).success);
  });
  test("sconto: minimo ≤ massimo e proposto nell'intervallo", () => {
    const bad = (a: Partial<AppraisalParams>) => !valuationParamsSchema.safeParse({ ...HYPOTHETICAL_DRAFT_PARAMS, appraisal: { ...PARAMS, ...a } }).success;
    assert.ok(bad({ firstOfferDiscountMinCents: E(500) }));
    assert.ok(bad({ firstOfferDiscountDefaultCents: E(450) }));
    assert.ok(bad({ firstOfferDiscountMinCents: null, firstOfferDiscountDefaultCents: E(350) }));
  });
});
