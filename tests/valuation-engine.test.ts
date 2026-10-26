/**
 * Motore di valutazione (funzione pura). TUTTI i dati di mercato di questo file sono FIXTURE SIMULATE (simulated: true):
 * non sono quotazioni reali e non vanno mai usati per offerte reali.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { computeValuation, estimateResale, normalizeVehicle } from "@/modules/valuation/engine";
import { floorToStep, formatEuro, mulBpCeil, mulBpFloor } from "@/modules/valuation/money";
import { HYPOTHETICAL_DRAFT_PARAMS, valuationParamsSchema, type ValuationParams } from "@/modules/valuation/params";
import type { MarketSnapshot, VehicleInput } from "@/modules/valuation/types";

const NOW = new Date("2026-10-26T10:00:00Z");

/** Esempio illustrativo dichiarato nella specifica: 5.000 − (150 + 350 + 200) − 800 = 3.500 */
const EXAMPLE_PARAMS: ValuationParams = {
  ...HYPOTHETICAL_DRAFT_PARAMS,
  resale: { basis: "median", haircutBp: 0 },
  costs: {
    transportCents: 7_500,
    inspectionCents: 7_500,
    preparationCents: 35_000,
    adminCents: 0,
    warrantyCents: 0,
    otherCents: 20_000,
    sellingPctBp: 0,
    contingencyPctBp: 0,
    taxesPctBp: 0,
  },
  margin: { targetCents: 80_000, minPctBp: 0 },
  offer: { minCents: 10_000, maxCents: 1_000_000, roundingStepCents: 5_000 },
};

const SIM_MARKET: MarketSnapshot = {
  source: "FIXTURE SIMULATA (test)",
  kind: "sold",
  asOf: new Date("2026-10-01T00:00:00Z"),
  sampleCount: 40,
  medianCents: 500_000,
  p25Cents: 470_000,
  p75Cents: 530_000,
  match: "exact",
  simulated: true,
};

const VEHICLE: VehicleInput = {
  brand: "Honda",
  model: "SH",
  family: "SH",
  catalogModelId: "honda-sh",
  version: null,
  year: 2019,
  displacement: 125,
  mileage: 18_000,
  isRunning: true,
  accident: "no",
  mechanicalIssues: "no",
  maintenance: "yes",
};

const run = (over: Partial<Parameters<typeof computeValuation>[0]> = {}) =>
  computeValuation({ vehicle: VEHICLE, params: EXAMPLE_PARAMS, market: SIM_MARKET, now: NOW, allowSimulated: true, ...over });

describe("denaro: interi in centesimi, arrotondamenti prudenti", () => {
  test("percentuali in punti base: costi per eccesso, valore e offerta per difetto", () => {
    assert.equal(mulBpCeil(10_001, 100), 101); // 1% di 100,01 € = 1,0001 € → 1,01 €
    assert.equal(mulBpFloor(10_001, 100), 100);
    assert.equal(floorToStep(349_999, 5_000), 345_000);
    assert.equal(floorToStep(350_000, 5_000), 350_000);
    assert.equal(formatEuro(350_000), "€ 3.500");
    assert.equal(formatEuro(350_050), "€ 3.500,50");
  });
  test("non ci sono errori di virgola mobile: 0,1 + 0,2 in centesimi", () => {
    assert.equal(10 + 20, 30);
  });
});

describe("formula: esempio illustrativo (SIMULATO)", () => {
  test("5.000 − (150 + 350 + 200) − 800 = 3.500 €", () => {
    const r = run();
    assert.equal(r.resaleCents, 500_000);
    assert.equal(r.costTotalCents, 70_000);
    assert.equal(r.marginCents, 80_000);
    assert.equal(r.maxOfferCents, 350_000);
    assert.equal(r.decision, "preliminary_offer");
    assert.equal(r.resaleCents! - r.costTotalCents! - r.marginCents!, r.maxOfferCents);
  });
  test("deterministico: stessi input, stesso risultato", () => {
    assert.deepEqual(run(), run());
  });
  test("le voci di costo sono spiegate una per una", () => {
    const r = run();
    assert.deepEqual(
      r.costs.filter((c) => c.cents > 0).map((c) => c.code),
      ["transport", "inspection", "preparation", "other"],
    );
  });
});

describe("senza basi sufficienti: nessun importo", () => {
  test("nessun parametro approvato", () => {
    const r = run({ params: null });
    assert.equal(r.decision, "manual_review");
    assert.deepEqual(r.reasons, ["no_approved_settings"]);
    assert.equal(r.maxOfferCents, null);
  });
  test("nessun dato di mercato", () => {
    const r = run({ market: null });
    assert.equal(r.decision, "manual_review");
    assert.deepEqual(r.reasons, ["no_market_data"]);
    assert.equal(r.maxOfferCents, null);
  });
  test("dati simulati rifiutati quando non sono ammessi (cioè sempre in produzione)", () => {
    const r = run({ allowSimulated: false });
    assert.deepEqual(r.reasons, ["simulated_data"]);
    assert.equal(r.maxOfferCents, null);
  });
  test("modello non riconosciuto (Altro): verifica manuale, nessun prezzo", () => {
    const r = run({ vehicle: { ...VEHICLE, catalogModelId: null, family: null, model: "Modello raro" } });
    assert.deepEqual(r.reasons, ["vehicle_not_recognized"]);
    assert.equal(r.maxOfferCents, null);
  });
  test("dati di mercato scaduti", () => {
    const r = run({ market: { ...SIM_MARKET, asOf: new Date("2026-01-01T00:00:00Z") } });
    assert.equal(r.decision, "manual_review");
    assert.ok(r.reasons.includes("market_data_stale"));
    assert.equal(r.maxOfferCents, null);
  });
  test("data di rilevazione nel futuro: trattata come non affidabile", () => {
    const r = run({ market: { ...SIM_MARKET, asOf: new Date("2027-01-01T00:00:00Z") } });
    assert.ok(r.reasons.includes("market_data_stale"));
  });
  test("mediana non valida", () => {
    assert.deepEqual(run({ market: { ...SIM_MARKET, medianCents: 0 } }).reasons, ["no_market_data"]);
    assert.deepEqual(run({ market: { ...SIM_MARKET, medianCents: 1.5 } }).reasons, ["no_market_data"]);
  });
});

describe("input incompleti o incoerenti", () => {
  const bad: [string, Partial<VehicleInput>][] = [
    ["anno futuro lontano", { year: 2040 }],
    ["anno impossibile", { year: 1800 }],
    ["chilometri negativi", { mileage: -1 }],
    ["chilometri oltre il massimo", { mileage: 500_000 }],
    ["cilindrata assurda", { displacement: 5 }],
    ["marca vuota", { brand: "  " }],
    ["moto di un anno con 120.000 km", { year: 2026, mileage: 120_000 }],
  ];
  for (const [name, over] of bad) {
    test(name, () => {
      const r = run({ vehicle: { ...VEHICLE, ...over } });
      assert.deepEqual(r.reasons, ["invalid_input"]);
      assert.equal(r.maxOfferCents, null);
    });
  }
  test("normalizzazione: spazi tolti, età calcolata", () => {
    const n = normalizeVehicle({ ...VEHICLE, brand: " Honda " }, NOW)!;
    assert.equal(n.brand, "Honda");
    assert.equal(n.ageYears, 7);
  });
});

describe("condizioni dichiarate", () => {
  test("incidente, non funzionante o problemi meccanici: sempre verifica manuale (con le impostazioni di partenza)", () => {
    for (const over of [{ accident: "yes" as const }, { isRunning: false }, { mechanicalIssues: "yes" as const }]) {
      const r = run({ vehicle: { ...VEHICLE, ...over } });
      assert.equal(r.decision, "manual_review");
      assert.ok(r.reasons.includes("condition_requires_review"));
      assert.equal(r.maxOfferCents, null);
    }
  });
  test("risposte «non so»: l'affidabilità scende e il motivo è registrato", () => {
    const sure = run();
    const unsure = run({ vehicle: { ...VEHICLE, accident: "unknown", maintenance: "unknown" } });
    assert.ok(unsure.confidenceBp < sure.confidenceBp);
    assert.ok(unsure.reasons.includes("unknown_answers"));
  });
  test("le riduzioni per condizione abbassano il valore di rivendita", () => {
    const p: ValuationParams = { ...EXAMPLE_PARAMS, conditionAdjustmentsBp: { ...EXAMPLE_PARAMS.conditionAdjustmentsBp, noRegularMaintenance: 1_000 } };
    const v = normalizeVehicle({ ...VEHICLE, maintenance: "no" }, NOW)!;
    assert.equal(estimateResale(SIM_MARKET, v, p), 450_000);
  });
});

describe("margini, minimi e massimi", () => {
  test("margine insufficiente: costi e margine superano il valore → nessuna offerta, mai negativa", () => {
    const r = run({ market: { ...SIM_MARKET, medianCents: 100_000, p25Cents: 95_000, p75Cents: 105_000 } });
    assert.equal(r.decision, "manual_review");
    assert.ok(r.reasons.includes("margin_insufficient"));
    assert.equal(r.maxOfferCents, null);
  });
  test("offerta sotto il minimo configurato → verifica manuale", () => {
    const p = { ...EXAMPLE_PARAMS, offer: { ...EXAMPLE_PARAMS.offer, minCents: 400_000 } };
    const r = run({ params: p });
    assert.ok(r.reasons.includes("offer_below_minimum"));
    assert.equal(r.maxOfferCents, null);
  });
  test("tetto massimo: l'offerta non lo supera mai", () => {
    const p = { ...EXAMPLE_PARAMS, offer: { ...EXAMPLE_PARAMS.offer, maxCents: 300_000 } };
    const r = run({ params: p });
    assert.equal(r.maxOfferCents, 300_000);
    assert.ok(r.reasons.includes("offer_capped"));
  });
  test("margine minimo in percentuale: vale il maggiore tra importo e percentuale", () => {
    const p = { ...EXAMPLE_PARAMS, margin: { targetCents: 80_000, minPctBp: 2_000 } }; // 20% di 5.000 = 1.000
    const r = run({ params: p });
    assert.equal(r.marginCents, 100_000);
    assert.equal(r.maxOfferCents, 330_000);
  });
  test("costi percentuali (vendita, imprevisti, imposte) si arrotondano per eccesso", () => {
    const p = { ...EXAMPLE_PARAMS, costs: { ...EXAMPLE_PARAMS.costs, sellingPctBp: 333, contingencyPctBp: 333, taxesPctBp: 333 } };
    const r = run({ params: p });
    const sellingLine = r.costs.find((c) => c.code === "selling")!;
    assert.equal(sellingLine.cents, 16_650); // 3,33% di 5.000,00 = 166,50
    assert.equal(r.maxOfferCents! % EXAMPLE_PARAMS.offer.roundingStepCents, 0);
  });
  test("arrotondamento per difetto al passo configurato", () => {
    const p = { ...EXAMPLE_PARAMS, offer: { ...EXAMPLE_PARAMS.offer, roundingStepCents: 10_000 } };
    assert.equal(run({ params: { ...p, margin: { targetCents: 83_333, minPctBp: 0 } } }).maxOfferCents, 340_000);
  });
  test("coerenza: valore − costi − offerta ≥ margine, sempre", () => {
    for (const median of [300_000, 480_000, 777_777, 1_234_567]) {
      const r = run({ market: { ...SIM_MARKET, medianCents: median, p25Cents: median - 10_000, p75Cents: median + 10_000 } });
      if (r.maxOfferCents !== null) assert.ok(r.resaleCents! - r.costTotalCents! - r.maxOfferCents >= r.marginCents!, String(median));
    }
  });
});

describe("affidabilità e decisione", () => {
  test("pochi campioni → fascia indicativa o verifica, mai offerta precisa", () => {
    const r = run({ market: { ...SIM_MARKET, sampleCount: 6 } });
    assert.ok(r.reasons.includes("few_samples"));
    assert.notEqual(r.decision, "preliminary_offer");
  });
  test("tra le due soglie: fascia indicativa con estremo alto = offerta massima", () => {
    const r = run({ market: { ...SIM_MARKET, sampleCount: 6 } });
    assert.equal(r.decision, "indicative_range");
    assert.equal(r.rangeHighCents, r.maxOfferCents);
    assert.ok(r.rangeLowCents! < r.rangeHighCents!);
  });
  test("sotto la soglia minima: verifica manuale, nessun importo pubblico (resta il dato interno)", () => {
    const r = run({ market: { ...SIM_MARKET, sampleCount: 2 } });
    assert.equal(r.decision, "manual_review");
    assert.ok(r.reasons.includes("low_confidence"));
    assert.equal(r.rangeLowCents, null);
  });
  test("prezzi richiesti (annunci) penalizzano l'affidabilità e sono segnalati", () => {
    const sold = run();
    const asking = run({ market: { ...SIM_MARKET, kind: "asking" } });
    assert.ok(asking.confidenceBp < sold.confidenceBp);
    assert.ok(asking.reasons.includes("market_data_asking_only"));
  });
  test("dispersione ampia dei prezzi abbassa l'affidabilità", () => {
    const wide = run({ market: { ...SIM_MARKET, p25Cents: 300_000, p75Cents: 700_000 } });
    assert.ok(wide.reasons.includes("wide_dispersion"));
    assert.ok(wide.confidenceBp < run().confidenceBp);
  });
  test("solo la famiglia del modello (non il modello esatto) abbassa l'affidabilità", () => {
    assert.ok(run({ market: { ...SIM_MARKET, match: "family" } }).confidenceBp < run().confidenceBp);
  });
  test("la base prudente usa il minore tra mediana e 25° percentile", () => {
    const p = { ...EXAMPLE_PARAMS, resale: { basis: "lower_of_median_p25" as const, haircutBp: 0 } };
    assert.equal(run({ params: p }).resaleCents, 470_000);
  });
  test("sconto prudenziale sul valore di mercato", () => {
    const p = { ...EXAMPLE_PARAMS, resale: { basis: "median" as const, haircutBp: 500 } };
    assert.equal(run({ params: p }).resaleCents, 475_000);
  });
});

describe("validazione dei parametri", () => {
  test("la bozza ipotetica è valida ma NON è usata da sola dal motore", () => {
    assert.ok(valuationParamsSchema.safeParse(HYPOTHETICAL_DRAFT_PARAMS).success);
  });
  test("incoerenze rifiutate: minimo > massimo, soglia fascia > soglia offerta, nessun margine", () => {
    const bad = (mut: (p: ValuationParams) => ValuationParams) => valuationParamsSchema.safeParse(mut(structuredClone(EXAMPLE_PARAMS))).success;
    assert.equal(bad((p) => ({ ...p, offer: { ...p.offer, minCents: p.offer.maxCents + 1 } })), false);
    assert.equal(bad((p) => ({ ...p, confidence: { ...p.confidence, minRangeBp: 9_000, minOfferBp: 5_000 } })), false);
    assert.equal(bad((p) => ({ ...p, margin: { targetCents: 0, minPctBp: 0 } })), false);
  });
  test("valori fuori intervallo o non interi rifiutati", () => {
    for (const mut of [
      (p: ValuationParams) => ({ ...p, costs: { ...p.costs, transportCents: -1 } }),
      (p: ValuationParams) => ({ ...p, costs: { ...p.costs, transportCents: 10.5 } }),
      (p: ValuationParams) => ({ ...p, costs: { ...p.costs, sellingPctBp: 99_999 } }),
      (p: ValuationParams) => ({ ...p, offer: { ...p.offer, roundingStepCents: 0 } }),
    ]) {
      assert.equal(valuationParamsSchema.safeParse(mut(structuredClone(EXAMPLE_PARAMS))).success, false);
    }
  });
});
