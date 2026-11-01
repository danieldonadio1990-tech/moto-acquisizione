import type { ValuationParams } from "./params";

/**
 * Campi del modulo «Parametri economici» (back office). Gli importi si scrivono in euro e le percentuali in %, il database
 * conserva centesimi e punti base. Conversioni con aritmetica su stringhe/interi: nessun errore di virgola mobile.
 */
export type FieldKind = "eur" | "pct" | "int" | "bool" | "basis";
export type Field = { path: string; label: string; kind: FieldKind; hint?: string };
export type FieldGroup = { title: string; fields: Field[] };

export const PARAM_GROUPS: FieldGroup[] = [
  {
    title: "Valore di rivendita",
    fields: [
      { path: "resale.basis", label: "Base di partenza", kind: "basis", hint: "Con «la più prudente» si usa il minore tra mediana e 25° percentile." },
      { path: "resale.haircutBp", label: "Sconto prudenziale", kind: "pct" },
      { path: "conditionAdjustmentsBp.notRunning", label: "Riduzione se non funzionante", kind: "pct" },
      { path: "conditionAdjustmentsBp.accident", label: "Riduzione se ha avuto incidenti", kind: "pct" },
      { path: "conditionAdjustmentsBp.mechanicalIssues", label: "Riduzione se ha problemi meccanici", kind: "pct" },
      { path: "conditionAdjustmentsBp.noRegularMaintenance", label: "Riduzione se manutenzione non regolare", kind: "pct" },
    ],
  },
  {
    title: "Costi per moto",
    fields: [
      { path: "costs.transportCents", label: "Trasporto", kind: "eur" },
      { path: "costs.inspectionCents", label: "Controlli e ispezioni", kind: "eur" },
      { path: "costs.preparationCents", label: "Preparazione e riparazioni", kind: "eur" },
      { path: "costs.adminCents", label: "Pratiche amministrative", kind: "eur" },
      { path: "costs.warrantyCents", label: "Garanzia", kind: "eur" },
      { path: "costs.otherCents", label: "Altri costi e rischio", kind: "eur" },
    ],
  },
  {
    title: "Costi proporzionali al valore",
    fields: [
      { path: "costs.sellingPctBp", label: "Costi commerciali di vendita", kind: "pct" },
      { path: "costs.contingencyPctBp", label: "Riserva per imprevisti", kind: "pct" },
      { path: "costs.taxesPctBp", label: "Imposte e oneri", kind: "pct" },
    ],
  },
  {
    title: "Margine lordo",
    fields: [
      { path: "margin.targetCents", label: "Margine obiettivo", kind: "eur" },
      { path: "margin.minPctBp", label: "Margine minimo in % del valore", kind: "pct", hint: "Vale il maggiore tra importo e percentuale." },
    ],
  },
  {
    title: "Limiti dell'offerta",
    fields: [
      { path: "offer.minCents", label: "Offerta minima", kind: "eur" },
      { path: "offer.maxCents", label: "Offerta massima (tetto)", kind: "eur" },
      { path: "offer.roundingStepCents", label: "Arrotondamento per difetto a", kind: "eur" },
      { path: "range.lowerBp", label: "Ampiezza della fascia indicativa", kind: "pct", hint: "La fascia va da (massimo − questa %) al massimo." },
    ],
  },
  {
    title: "Affidabilità",
    fields: [
      { path: "confidence.minOfferBp", label: "Soglia per mostrare un'offerta", kind: "pct" },
      { path: "confidence.minRangeBp", label: "Soglia per mostrare una fascia", kind: "pct" },
      { path: "confidence.minSamples", label: "Casi minimi nella rilevazione", kind: "int" },
      { path: "confidence.maxMarketAgeDays", label: "Età massima dei dati (giorni)", kind: "int" },
      { path: "confidence.maxDispersionBp", label: "Dispersione massima dei prezzi", kind: "pct" },
      { path: "confidence.penaltyUnknownAnswerBp", label: "Penalità per ogni risposta «non so»", kind: "pct" },
      { path: "confidence.penaltyFamilyMatchBp", label: "Penalità se manca il modello esatto", kind: "pct" },
      { path: "confidence.penaltyAskingPriceBp", label: "Penalità se sono prezzi richiesti", kind: "pct" },
    ],
  },
  {
    title: "Offerta automatica",
    fields: [
      {
        path: "automation.autoOffer",
        label: "Crea l'offerta in automatico quando i dati bastano",
        kind: "bool",
        hint: "Solo con risultato «offerta preliminare» che rispetta margine, tetti e affidabilità. Non viene comunicata al cliente.",
      },
    ],
  },
  {
    title: "Verifica manuale obbligatoria",
    fields: [
      { path: "review.manualIfAccident", label: "Se dichiara incidenti", kind: "bool" },
      { path: "review.manualIfNotRunning", label: "Se non è funzionante", kind: "bool" },
      { path: "review.manualIfMechanicalIssues", label: "Se dichiara problemi meccanici", kind: "bool" },
    ],
  },
];

export const ALL_FIELDS = PARAM_GROUPS.flatMap((g) => g.fields);

export function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
}
function setPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split(".");
  let o = obj;
  for (const k of keys.slice(0, -1)) o = (o[k] ??= {}) as Record<string, unknown>;
  o[keys[keys.length - 1]] = value;
}

/** «12,5» o «12.50» → 1250 (due decimali al massimo). null se non valido. */
export function decimalToHundredths(raw: string): number | null {
  const m = /^(\d{1,9})(?:[.,](\d{1,2}))?$/.exec(raw.trim());
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || 0);
}
export function hundredthsToDecimal(n: number): string {
  const whole = Math.trunc(n / 100);
  const rest = n % 100;
  return rest === 0 ? String(whole) : `${whole},${String(rest).padStart(2, "0").replace(/0$/, "")}`;
}

/** Valori del modulo → oggetto parametri (non ancora validato: lo fa lo schema). */
export function paramsFromForm(get: (name: string) => string | null): { params: Record<string, unknown>; errors: string[] } {
  const params: Record<string, unknown> = {};
  const errors: string[] = [];
  for (const f of ALL_FIELDS) {
    const raw = get(f.path);
    if (f.kind === "bool") {
      setPath(params, f.path, raw === "on" || raw === "true");
    } else if (f.kind === "basis") {
      setPath(params, f.path, raw);
    } else if (f.kind === "int") {
      if (raw === null || !/^\d{1,6}$/.test(raw.trim())) errors.push(`${f.label}: numero intero non valido`);
      else setPath(params, f.path, Number(raw.trim()));
    } else {
      const h = raw === null ? null : decimalToHundredths(raw);
      if (h === null) errors.push(`${f.label}: valore non valido`);
      else setPath(params, f.path, h); // eur → centesimi, pct → punti base (1% = 100 bp): in entrambi i casi ×100
    }
  }
  return { params, errors };
}

/** Parametri → valori da mostrare nel modulo. */
export function formValuesFromParams(p: ValuationParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of ALL_FIELDS) {
    const v = getPath(p, f.path);
    out[f.path] = f.kind === "eur" || f.kind === "pct" ? hundredthsToDecimal(Number(v)) : String(v);
  }
  return out;
}
