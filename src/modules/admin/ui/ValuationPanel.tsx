import {
  AUTO_ACTOR,
  getApprovedSettings,
  getCurrentValuation,
  listValuationRevisions,
  publicOffersEnabled,
  whenValuationAvailable,
} from "@/modules/valuation/service";
import { MARKET_KIND_LABELS, REASON_LABELS, VALUATION_STATUS_LABELS } from "@/modules/valuation/labels";
import { formatEuro } from "@/modules/valuation/money";
import type { ReasonCode } from "@/modules/valuation/types";
import { formatDate, formatDateTime } from "./format";
import { CloseValuationForm, ConfirmOfferButton, ManualOfferForm, RecomputeButton } from "./ValuationForms";

type Cost = { code: string; label: string; cents: number };
type MarketView = { source: string; kind: keyof typeof MARKET_KIND_LABELS; asOf: string; sampleCount: number; medianCents: number; match: string };

const row = "flex justify-between gap-4 py-1 text-sm";

/** Avviso mostrato quando le tabelle del motore non sono disponibili. Nessuna azione: nulla da calcolare o confermare. */
export function ValuationUnavailable() {
  return (
    <div role="status" data-testid="valuation-unavailable" className="rounded-xl bg-notice px-4 py-3 text-sm">
      <p className="font-semibold">Il motore di valutazione non è disponibile.</p>
      <p className="mt-1">
        Le tabelle della valutazione non risultano nel database: verifica che la migrazione <code>0005_valuation_engine</code> sia stata
        applicata (<code>npm run db:migrate</code>, oppure l&apos;avvio del sito con le migrazioni automatiche). La richiesta e le sue
        offerte restano consultabili e modificabili come sempre; i clienti vedono «verifica manuale».
      </p>
    </div>
  );
}

/** Riquadro «Valutazione» nel dettaglio di una richiesta. Solo back office: contiene costi e margini. */
export async function ValuationPanel({ leadId }: { leadId: string }) {
  // Se le tabelle del motore non ci sono (migrazione 0005 non applicata) il resto della pagina continua a funzionare.
  // Qualsiasi altro errore NON viene nascosto: whenValuationAvailable lo rilancia.
  const loaded = await whenValuationAvailable(() =>
    Promise.all([getCurrentValuation(leadId), listValuationRevisions(leadId), getApprovedSettings()]),
  );
  if (!loaded.available) return <ValuationUnavailable />;
  const [cur, revisions, settings] = loaded.value;
  const costs = (cur?.costs ?? []) as Cost[];
  const market = (cur?.market ?? null) as MarketView | null;
  const reasons = ((cur?.reasons ?? []) as ReasonCode[]).filter(Boolean);
  const closed = cur ? ["offer_confirmed", "rejected", "expired"].includes(cur.status) : false;
  const automaticOffer = revisions.some((r) => r.createdBy === AUTO_ACTOR && r.status === "offer_confirmed");
  const maxEuros = cur?.maxOfferCents != null ? Math.floor(cur.maxOfferCents / 100) : null;
  const confirmable = cur ? cur.status === "offer_to_confirm" || (cur.status === "preliminary_generated" && cur.decision === "preliminary_offer") : false;
  const confirmAmount = cur ? (cur.status === "offer_to_confirm" ? cur.manualOfferCents : cur.maxOfferCents) : null;

  return (
    <div className="space-y-5">
      {!settings && (
        <p role="status" className="rounded-xl bg-notice px-4 py-3 text-sm font-semibold">
          Nessun parametro economico approvato: il motore non calcola offerte. Vai a «Valutazione» per configurarli.
        </p>
      )}
      {!publicOffersEnabled() && (
        <p className="text-xs text-concrete">Gli importi calcolati non vengono mostrati ai clienti (VALUATION_PUBLIC_OFFERS non attivo).</p>
      )}

      {!cur ? (
        <div>
          <p className="text-sm text-concrete">Stato: <strong>Da valutare</strong> — nessun calcolo ancora per questa richiesta.</p>
          <div className="mt-3">
            <RecomputeButton leadId={leadId} />
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm">
            Stato: <strong>{VALUATION_STATUS_LABELS[cur.status]}</strong> · revisione {cur.revision} · formula {cur.formulaVersion} ·{" "}
            affidabilità {(cur.confidenceBp / 100).toFixed(0)}%
          </p>

          {automaticOffer && (
            <p role="status" data-testid="automatic-offer-note" className="rounded-xl bg-paper px-4 py-3 text-sm font-semibold ring-1 ring-asphalt">
              Offerta generata automaticamente dal motore con i parametri approvati. Non è stata comunicata al cliente: verifica e contattalo tu.
            </p>
          )}

          {reasons.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-asphalt-soft">
              {reasons.map((r) => (
                <li key={r}>{REASON_LABELS[r] ?? r}</li>
              ))}
            </ul>
          )}

          <div className="divide-y divide-line rounded-xl ring-1 ring-line">
            <div className={`${row} px-4`}>
              <span>Valore di rivendita stimato (prudente)</span>
              <strong>{cur.resaleCents != null ? formatEuro(cur.resaleCents) : "—"}</strong>
            </div>
            {costs.filter((c) => c.cents > 0).map((c) => (
              <div key={c.code} className={`${row} px-4 text-concrete`}>
                <span>− {c.label}</span>
                <span>{formatEuro(c.cents)}</span>
              </div>
            ))}
            <div className={`${row} px-4`}>
              <span>Costi totali stimati</span>
              <strong>{cur.costTotalCents != null ? formatEuro(cur.costTotalCents) : "—"}</strong>
            </div>
            <div className={`${row} px-4`}>
              <span>Margine lordo obiettivo</span>
              <strong>{cur.marginCents != null ? formatEuro(cur.marginCents) : "—"}</strong>
            </div>
            <div className={`${row} px-4`}>
              <span>Offerta massima calcolata</span>
              <strong>{cur.maxOfferCents != null ? formatEuro(cur.maxOfferCents) : "—"}</strong>
            </div>
            {cur.rangeLowCents != null && cur.rangeHighCents != null && (
              <div className={`${row} px-4`}>
                <span>Fascia indicativa</span>
                <strong>
                  {formatEuro(cur.rangeLowCents)} – {formatEuro(cur.rangeHighCents)}
                </strong>
              </div>
            )}
            {cur.manualOfferCents != null && (
              <div className={`${row} px-4`}>
                <span>Prezzo impostato a mano</span>
                <strong>{formatEuro(cur.manualOfferCents)}</strong>
              </div>
            )}
          </div>
          {cur.manualReason && <p className="text-sm"><span className="text-concrete">Motivo della modifica:</span> {cur.manualReason}</p>}

          {market ? (
            <p className="text-sm text-asphalt-soft">
              Dati di mercato: <strong>{market.source}</strong> — {MARKET_KIND_LABELS[market.kind]}, {market.sampleCount} casi, mediana{" "}
              {formatEuro(market.medianCents)}, aggiornati al {formatDate(new Date(market.asOf))}
              {market.match === "family" ? " (riferimento di marca, non di modello)" : ""}.
            </p>
          ) : (
            <p className="text-sm text-concrete">Dati di mercato: nessuno utilizzato.</p>
          )}

          {!closed && (
            <div className="space-y-5 border-t border-line pt-4">
              {confirmable && confirmAmount != null && (
                <ConfirmOfferButton leadId={leadId} label={`Confermare l'offerta di ${formatEuro(confirmAmount)}?`} />
              )}
              <ManualOfferForm leadId={leadId} maxEuros={maxEuros} />
              <RecomputeButton leadId={leadId} />
              <CloseValuationForm leadId={leadId} />
            </div>
          )}
          {closed && cur.status !== "offer_confirmed" && <RecomputeButton leadId={leadId} />}
        </>
      )}

      {revisions.length > 1 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-bold">Cronologia delle revisioni ({revisions.length})</summary>
          <ol className="mt-2 space-y-1">
            {revisions.map((r) => (
              <li key={r.id} className="flex flex-wrap gap-x-3 text-concrete">
                <span>#{r.revision}</span>
                <span>{VALUATION_STATUS_LABELS[r.status]}</span>
                <span>{r.kind === "manual" ? "manuale" : "automatica"}</span>
                {r.manualOfferCents != null && <span>{formatEuro(r.manualOfferCents)}</span>}
                <span>{formatDateTime(r.createdAt)}</span>
                <span>{r.createdBy ?? "sistema"}</span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
