/**
 * Back office della valutazione: accesso solo per amministratori e assenza di dati interni sulle superfici pubbliche.
 * Controlli sul codice sorgente (le azioni e le pagine dipendono dalla sessione del browser): complementano i test di servizio.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

test("ogni azione di valutazione chiama requireAdmin() PRIMA di qualunque operazione", () => {
  const src = readFileSync("src/app/admin/actions.ts", "utf8");
  const names = [
    "recomputeValuationAction",
    "setManualOfferAction",
    "confirmOfferAction",
    "closeValuationAction",
    "createSettingsDraftAction",
    "approveSettingsAction",
    "addMarketReferenceAction",
  ];
  for (const n of names) {
    const start = src.indexOf(`export async function ${n}`);
    assert.ok(start !== -1, n);
    const rest = src.slice(start);
    const end = rest.indexOf("\nexport async function ", 10);
    const body = end === -1 ? rest : rest.slice(0, end);
    const auth = body.indexOf("await requireAdmin()");
    assert.ok(auth !== -1, `${n}: manca requireAdmin`);
    for (const call of ["recomputeValuation(", "setManualOffer(", "confirmOffer(", "closeValuation(", "createSettingsDraft(", "approveSettings(", "addMarketReference("]) {
      const i = body.indexOf(call);
      if (i !== -1) assert.ok(auth < i, `${n}: ${call} prima di requireAdmin`);
    }
  }
});

test("le pagine del back office della valutazione richiedono l'amministratore", () => {
  for (const f of ["src/app/admin/(app)/valutazione/page.tsx", "src/app/admin/(app)/lead/[id]/page.tsx"]) {
    assert.match(readFileSync(f, "utf8"), /await requireAdmin\(\)/, f);
  }
  // e la rotta è coperta dal controllo ottimistico di sessione
  assert.match(readFileSync("src/proxy.ts", "utf8"), /"\/admin\/:path\*"/);
});

test("le funzioni di modifica della valutazione sono usate solo da azioni amministrative e dalla creazione della richiesta", () => {
  const sensitive = ["setManualOffer", "confirmOffer", "closeValuation", "approveSettings", "createSettingsDraft", "addMarketReference", "recomputeValuation"];
  const callers = new Set<string>();
  for (const f of walk("src").filter((x) => /\.(ts|tsx)$/.test(x))) {
    if (f.endsWith("valuation/service.ts")) continue;
    const t = readFileSync(f, "utf8");
    if (sensitive.some((n) => new RegExp(`\\b${n}\\(`).test(t))) callers.add(f.replace(/\\/g, "/"));
  }
  assert.deepEqual([...callers], ["src/app/admin/actions.ts"]);
});

test("il browser pubblico riceve solo il tipo PublicValuation: nessun costo, margine o formula", () => {
  const route = readFileSync("src/app/api/leads/route.ts", "utf8");
  assert.match(route, /evaluateLeadOnCreate/);
  const pub = readFileSync("src/modules/valuation/public.ts", "utf8");
  assert.doesNotMatch(pub.replace(/\/\*[\s\S]*?\*\//g, ""), /margin|cost|resale|formula|confidence/i);
  // nessun componente pubblico importa il motore o il servizio
  for (const f of walk("src/modules/funnel").concat(walk("src/components"))) {
    if (!/\.tsx?$/.test(f)) continue;
    const t = readFileSync(f, "utf8");
    assert.doesNotMatch(t, /valuation\/(service|engine|params)/, f);
  }
});

test("il corpo della creazione richiesta non accetta prezzi o margini dal browser", () => {
  const v = readFileSync("src/modules/leads/validation.ts", "utf8");
  assert.doesNotMatch(v, /\b(price|prezzo|margin|margine|offer|offerta|cost|costo)\b/i);
});

test("le etichette degli stati e dei motivi coprono tutti i casi", async () => {
  const { VALUATION_STATUSES } = await import("@/db/schema");
  const { VALUATION_STATUS_LABELS, REASON_LABELS } = await import("@/modules/valuation/labels");
  for (const s of VALUATION_STATUSES) assert.ok(VALUATION_STATUS_LABELS[s], s);
  const types = readFileSync("src/modules/valuation/types.ts", "utf8");
  const block = types.slice(types.indexOf("export type ReasonCode"), types.indexOf(";", types.indexOf("export type ReasonCode")));
  const reasons = block.match(/\| "([a-z_]+)"/g) ?? [];
  assert.ok(reasons.length >= 15);
  for (const r of reasons) assert.ok((REASON_LABELS as Record<string, string>)[r.slice(3, -1)], r);
});

test("conversioni dei campi del modulo parametri: euro e percentuali senza virgola mobile", async () => {
  const { decimalToHundredths, hundredthsToDecimal, paramsFromForm, formValuesFromParams } = await import("@/modules/valuation/fields");
  const { HYPOTHETICAL_DRAFT_PARAMS, valuationParamsSchema } = await import("@/modules/valuation/params");
  assert.equal(decimalToHundredths("12,5"), 1250);
  assert.equal(decimalToHundredths("0.07"), 7);
  assert.equal(decimalToHundredths("1.234"), null);
  assert.equal(decimalToHundredths("-3"), null);
  assert.equal(decimalToHundredths(""), null);
  assert.equal(hundredthsToDecimal(1250), "12,5");
  assert.equal(hundredthsToDecimal(7500), "75");
  // andata e ritorno: il modulo compilato con i valori della bozza riproduce esattamente i parametri
  const values = formValuesFromParams(HYPOTHETICAL_DRAFT_PARAMS);
  const { params, errors } = paramsFromForm((n) => (n in values ? values[n] : null));
  assert.deepEqual(errors, []);
  assert.deepEqual(valuationParamsSchema.parse(params), HYPOTHETICAL_DRAFT_PARAMS);
});
