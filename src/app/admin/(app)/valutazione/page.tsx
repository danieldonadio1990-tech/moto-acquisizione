import { Suspense } from "react";
import { requireAdmin } from "@/modules/admin/auth";
import { getApprovedSettings, listMarketReferences, listSettings, publicOffersEnabled } from "@/modules/valuation/service";
import { HYPOTHETICAL_DRAFT_PARAMS } from "@/modules/valuation/params";
import { formValuesFromParams } from "@/modules/valuation/fields";
import { MARKET_KIND_LABELS } from "@/modules/valuation/labels";
import { formatEuro } from "@/modules/valuation/money";
import { ApproveSettingsButton, MarketReferenceForm, SettingsDraftForm } from "@/modules/admin/ui/ValuationForms";
import { formatDate, formatDateTime } from "@/modules/admin/ui/format";

export default function ValuationSettingsPage() {
  return (
    <Suspense fallback={<p className="text-concrete">Carico…</p>}>
      <Content />
    </Suspense>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-paper p-5 ring-1 ring-line">
      <h2 className="mb-4 text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

async function Content() {
  await requireAdmin();
  const [approved, versions, refs] = await Promise.all([getApprovedSettings(), listSettings(), listMarketReferences()]);
  const latest = versions[0];
  const base = approved?.params ?? HYPOTHETICAL_DRAFT_PARAMS;
  const values = formValuesFromParams(base);
  const drafts = versions.filter((v) => v.status === "draft");

  return (
    <>
      <h1 className="display text-4xl md:text-5xl">Valutazione</h1>
      <p className="mt-2 max-w-[70ch] text-sm text-concrete">
        Il motore calcola l&apos;offerta massima come <strong>valore di rivendita prudente − costi − margine</strong>. Senza parametri
        approvati e senza dati di mercato con la loro fonte non produce nessuna offerta. Gli importi calcolati sono mostrati ai clienti
        solo se è attivo l&apos;interruttore <code>VALUATION_PUBLIC_OFFERS</code>:{" "}
        <strong>{publicOffersEnabled() ? "attivo" : "spento"}</strong>.
      </p>

      <div className="mt-6 space-y-5">
        <Card title="Parametri economici">
          <p className="mb-3 text-sm">
            Versione in uso:{" "}
            <strong>{approved ? `v${approved.version} (approvata)` : "nessuna — il motore non calcola offerte"}</strong>
            {latest && latest.status === "approved" && latest.approvedAt ? ` · approvata da ${latest.approvedBy} il ${formatDateTime(latest.approvedAt)}` : ""}
          </p>
          {!approved && (
            <p role="note" className="mb-4 rounded-xl bg-notice px-4 py-3 text-sm font-semibold">
              I valori proposti sotto sono una BOZZA IPOTETICA: non sono dati di mercato né costi reali. Sostituiscili con i tuoi costi e il
              tuo margine prima di approvare.
            </p>
          )}
          {drafts.length > 0 && (
            <div className="mb-5 space-y-2">
              <h3 className="text-sm font-bold">Bozze da approvare</h3>
              {drafts.map((d) => (
                <div key={d.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl ring-1 ring-line px-4 py-2 text-sm">
                  <span>
                    v{d.version} · creata da {d.createdBy} il {formatDateTime(d.createdAt)}
                    {d.note ? ` · ${d.note}` : ""}
                  </span>
                  <ApproveSettingsButton settingsId={d.id} version={d.version} />
                </div>
              ))}
              <p className="text-xs text-concrete">Chi prepara una versione non può approvarla: serve un altro amministratore.</p>
            </div>
          )}
          <h3 className="mb-2 text-sm font-bold">Nuova versione (parte dai valori {approved ? "in uso" : "ipotetici"})</h3>
          <SettingsDraftForm values={values} />
        </Card>

        <Card title="Dati di mercato (con provenienza)">
          <p className="mb-4 text-sm text-concrete">
            Nessun valore è precaricato. Inserisci solo rilevazioni di cui conosci la fonte. Un prezzo richiesto (annuncio) non è un prezzo di
            vendita: scegli il tipo corretto, il motore ne tiene conto nell&apos;affidabilità.
          </p>
          {refs.length === 0 ? (
            <p className="mb-4 text-sm font-semibold">Nessun riferimento inserito: il motore non può stimare nessun valore.</p>
          ) : (
            <div className="mb-5 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-concrete">
                  <tr>
                    <th className="py-1 pr-3">Moto</th>
                    <th className="pr-3">Anni</th>
                    <th className="pr-3">Mediana</th>
                    <th className="pr-3">Casi</th>
                    <th className="pr-3">Tipo</th>
                    <th className="pr-3">Fonte</th>
                    <th>Aggiornato</th>
                  </tr>
                </thead>
                <tbody>
                  {refs.map((r) => (
                    <tr key={r.id} className="border-t border-line">
                      <td className="py-1.5 pr-3">{r.brand} {r.family ?? "(tutta la marca)"}</td>
                      <td className="pr-3">{r.yearFrom}–{r.yearTo}</td>
                      <td className="pr-3">{formatEuro(r.medianCents)}</td>
                      <td className="pr-3">{r.sampleCount}</td>
                      <td className="pr-3">{MARKET_KIND_LABELS[r.kind]}</td>
                      <td className="pr-3">{r.source}</td>
                      <td>{formatDate(r.asOf)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <MarketReferenceForm />
        </Card>
      </div>
    </>
  );
}
