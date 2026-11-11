import { getAppraisalSheet } from "@/modules/appraisal/service";
import { COST_LABELS, type Warning } from "@/modules/appraisal/calc";
import { isAppraisalSchemaUnavailable } from "@/db/errors";
import { formatEuro } from "@/modules/valuation/money";
import { formatDateTime, formatKm } from "./format";
import { AddComparableBox, AppraisalForm, ComparableInclusionForm, type AppraisalDefaults } from "./AppraisalForms";

/**
 * Scheda di valutazione interna nel dettaglio della richiesta. SOLO back office (la pagina è protetta da requireAdmin): contiene
 * valori economici, costi e note interne che il cliente non vede mai. I valori restano separati: comparabili, rivendita prevista,
 * massimo sostenibile, prima offerta, prezzo obiettivo.
 */
const SELLER_LABELS = { private: "Privato", dealer: "Commerciante", unknown: "Non identificabile" } as const;
const money = (c: number | null | undefined) => (c == null ? "—" : formatEuro(c));
const euros = (c: number | null | undefined) => (c == null ? "" : String(Math.trunc(c / 100)));
const delta = (v: number | null, ref: number | null, unit: (n: number) => string) =>
  v === null || ref === null ? "" : v === ref ? " (uguale)" : ` (${v > ref ? "+" : "−"}${unit(Math.abs(v - ref))})`;

function Box({ title, value, note, tone = "plain" }: { title: string; value: string; note?: React.ReactNode; tone?: "plain" | "strong" | "bad" }) {
  const ring = tone === "bad" ? "ring-2 ring-danger" : tone === "strong" ? "ring-2 ring-asphalt" : "ring-1 ring-line";
  return (
    <div className={`rounded-xl bg-paper p-3 ${ring}`}>
      <p className="text-xs font-bold uppercase tracking-wide text-concrete">{title}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
      {note && <div className="mt-1 text-xs text-concrete">{note}</div>}
    </div>
  );
}

function Warnings({ items }: { items: Warning[] }) {
  if (!items.length) return null;
  const strong = new Set(["criteria_incompatible", "target_above_max", "costs_not_configured", "settings_missing", "max_not_positive"]);
  return (
    <ul className="space-y-1.5" aria-label="Avvisi della scheda">
      {items.map((w) => (
        <li key={w.code} className={`rounded-lg px-3 py-2 text-sm ${strong.has(w.code) ? "bg-danger/10 font-semibold text-danger" : "bg-notice"}`}>
          {w.message}
        </li>
      ))}
    </ul>
  );
}

export async function AppraisalPanel({
  leadId,
  vehicle,
}: {
  leadId: string;
  vehicle: { brand: string; model: string; year: number; mileage: number };
}) {
  let sheet: Awaited<ReturnType<typeof getAppraisalSheet>>;
  try {
    sheet = await getAppraisalSheet(leadId);
  } catch (err) {
    if (!isAppraisalSchemaUnavailable(err)) throw err;
    return (
      <p role="status" className="rounded-xl bg-notice px-4 py-3 text-sm">
        La scheda di valutazione non è disponibile: le sue tabelle non risultano nel database (migrazione <code>0008_scheda_valutazione</code>
        non applicata). Il resto della richiesta funziona come sempre.
      </p>
    );
  }
  const { comparables, revisions, latest, settings, live, comparablesChanged } = sheet;
  const p = settings?.params ?? null;
  const defaults: AppraisalDefaults = {
    comparablesValue: euros(latest?.comparablesValueCents ?? live.stats?.medianCents),
    comparablesValueNote: latest?.comparablesValueNote ?? "",
    resaleValue: euros(latest?.resaleValueCents),
    resaleValueNote: latest?.resaleValueNote ?? "",
    discount: euros(latest?.discountCents ?? p?.firstOfferDiscountDefaultCents),
    manualFirstOffer: latest?.firstOfferKind === "manual" ? euros(latest.firstOfferCents) : "",
    firstOfferReason: latest?.firstOfferKind === "manual" ? (latest.firstOfferReason ?? "") : "",
    targetPrice: euros(latest?.targetPriceCents),
    targetPriceNote: latest?.targetPriceNote ?? "",
    declaredAskingPrice: euros(latest?.declaredAskingPriceCents),
    accessories: latest?.accessories ?? "",
    cosmeticCondition: latest?.cosmeticCondition ?? "",
    defects: latest?.defects ?? "",
    maintenanceRecords: latest?.maintenanceRecords ?? "",
  };
  const r = live;
  const discountRange =
    p?.firstOfferDiscountMinCents != null && p.firstOfferDiscountMaxCents != null
      ? { min: p.firstOfferDiscountMinCents / 100, max: p.firstOfferDiscountMaxCents / 100 }
      : null;

  return (
    <div className="space-y-6" data-testid="appraisal-panel">
      {/* Prezzi: cinque valori separati */}
      <div>
        <p className="mb-2 text-sm text-concrete">
          {latest
            ? `Revisione ${latest.revision} di ${latest.createdBy}, ${formatDateTime(latest.createdAt)} · parametri v${latest.settingsVersion ?? "—"}`
            : "Nessuna revisione salvata: compila i valori e salva."}
          {settings ? ` · parametri approvati attuali: v${settings.version}` : ""}
        </p>
        {comparablesChanged && (
          <p role="status" className="mb-2 rounded-lg bg-notice px-3 py-2 text-sm font-semibold">
            I comparabili sono cambiati dopo l&apos;ultima revisione: i valori qui sotto sono ricalcolati, ma per registrarli salva una nuova revisione.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Valori della scheda">
          <Box
            title="Valore dei comparabili"
            value={money(latest?.comparablesValueCents)}
            note={r.stats ? `Mediana annunci inclusi ${money(r.stats.medianCents)} (${r.stats.count}) · prezzi richiesti` : "Nessun comparabile incluso"}
          />
          <Box title="Valore di rivendita previsto" value={money(latest?.resaleValueCents)} note={latest?.resaleValueNote ?? "Stima interna, inserita a mano"} />
          <Box
            title="Massimo sostenibile"
            tone={r.maxSustainableCents === null ? "bad" : "strong"}
            value={r.maxSustainableCents === null ? "Non calcolabile" : money(r.maxSustainableCents)}
            note={r.costs ? `Margine ${money(r.costs.marginCents)} incluso` : "Mancano dati o costi configurati"}
          />
          <Box
            title="Prima offerta"
            tone={r.incompatibilityGapCents !== null && r.firstOfferKind !== "manual" ? "bad" : "plain"}
            value={r.firstOfferCents === null ? (r.incompatibilityGapCents !== null ? "Non calcolata" : "—") : money(r.firstOfferCents)}
            note={
              r.firstOfferKind === "manual"
                ? `Manuale: ${latest?.firstOfferReason ?? ""}`
                : r.proposedFirstOfferCents !== null
                  ? `Comparabili − sconto: ${money(r.proposedFirstOfferCents)}`
                  : undefined
            }
          />
          <Box
            title="Prezzo obiettivo"
            tone={r.warnings.some((w) => w.code === "target_above_max") ? "bad" : "plain"}
            value={money(latest?.targetPriceCents)}
            note={latest?.targetPriceNote ?? "Manuale, deciso in trattativa"}
          />
          <Box
            title="Margine potenziale"
            value={money(r.marginAtFirstOfferCents)}
            note={`alla prima offerta · al prezzo obiettivo ${money(r.marginAtTargetCents)}`}
          />
        </div>
      </div>

      <Warnings items={r.warnings} />

      {/* Costi usati */}
      <details className="rounded-xl ring-1 ring-line">
        <summary className="cursor-pointer px-4 py-3 text-sm font-bold">Costi e margine dalla versione approvata</summary>
        <dl className="grid gap-x-6 gap-y-1 px-4 pb-4 text-sm sm:grid-cols-2">
          {(Object.keys(COST_LABELS) as (keyof typeof COST_LABELS)[]).map((k) => (
            <div key={k} className="flex justify-between gap-4">
              <dt className="text-concrete">{COST_LABELS[k]}</dt>
              <dd className="font-semibold">{p?.[k] == null ? "Non configurato" : money(p[k])}</dd>
            </div>
          ))}
        </dl>
      </details>

      {/* Comparabili */}
      <div>
        <h3 className="mb-2 font-bold">Annunci comparabili ({comparables.length})</h3>
        {r.stats && (
          <p className="mb-2 text-sm text-concrete">
            Inclusi {r.stats.count}: minimo {money(r.stats.minCents)}, mediana {money(r.stats.medianCents)}, massimo {money(r.stats.maxCents)}
            {r.stats.p25Cents !== null && ` · 25°–75° percentile ${money(r.stats.p25Cents)}–${money(r.stats.p75Cents)}`}. Prezzi richiesti, non di vendita.
          </p>
        )}
        {comparables.length > 0 && (
          <div className="mb-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase text-concrete">
                <tr>
                  <th className="py-2 pr-3">Prezzo</th>
                  <th className="pr-3">Modello</th>
                  <th className="pr-3">Anno</th>
                  <th className="pr-3">Km</th>
                  <th className="pr-3">Località</th>
                  <th className="pr-3">Condizioni</th>
                  <th className="pr-3">Venditore</th>
                  <th className="pr-3">Annuncio</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {comparables.map((c) => (
                  <tr key={c.id} className={`border-t border-line align-top ${c.included ? "" : "text-concrete line-through decoration-1"}`}>
                    <td className="py-2 pr-3 font-semibold">{money(c.priceCents)}</td>
                    <td className="pr-3">
                      {c.brand} {c.model}
                    </td>
                    <td className="pr-3">
                      {c.year ?? "—"}
                      {delta(c.year, vehicle.year, (n) => `${n} ${n === 1 ? "anno" : "anni"}`)}
                    </td>
                    <td className="pr-3">
                      {c.mileage === null ? "—" : formatKm(c.mileage)}
                      {delta(c.mileage, vehicle.mileage, (n) => formatKm(n))}
                    </td>
                    <td className="pr-3">{c.location ?? "—"}</td>
                    <td className="pr-3">
                      {c.condition ?? "—"}
                      {c.description && <span className="block text-xs text-concrete no-underline">{c.description}</span>}
                    </td>
                    <td className="pr-3">{SELLER_LABELS[c.sellerType]}</td>
                    <td className="pr-3">
                      <a href={c.url} target="_blank" rel="noopener noreferrer nofollow" className="font-semibold underline">
                        Apri
                      </a>
                    </td>
                    <td className="py-1 no-underline">
                      <ComparableInclusionForm leadId={leadId} comparableId={c.id} included={c.included} />
                      {!c.included && c.exclusionReason && <span className="mt-1 block text-xs">Escluso: {c.exclusionReason}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <AddComparableBox leadId={leadId} defaults={{ brand: vehicle.brand, model: vehicle.model }} />
      </div>

      {/* Valutazione */}
      <div>
        <h3 className="mb-2 font-bold">Valutazione</h3>
        <AppraisalForm leadId={leadId} defaults={defaults} medianEuros={r.stats ? Math.trunc(r.stats.medianCents / 100) : null} discountRange={discountRange} />
      </div>

      {revisions.length > 0 && (
        <details className="rounded-xl ring-1 ring-line">
          <summary className="cursor-pointer px-4 py-3 text-sm font-bold">Revisioni ({revisions.length})</summary>
          <ul className="divide-y divide-line px-4 pb-3 text-sm">
            {revisions.map((v) => (
              <li key={v.id} className="py-2">
                <p className="font-semibold">
                  Revisione {v.revision} · {v.createdBy} · {formatDateTime(v.createdAt)}
                </p>
                <p className="text-concrete">
                  Comparabili {money(v.comparablesValueCents)} · rivendita {money(v.resaleValueCents)} · massimo {money(v.maxSustainableCents)} · prima
                  offerta {money(v.firstOfferCents)}
                  {v.firstOfferKind === "manual" ? " (manuale)" : ""} · obiettivo {money(v.targetPriceCents)}
                </p>
                {v.revisionNote && <p className="text-concrete">Nota: {v.revisionNote}</p>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
