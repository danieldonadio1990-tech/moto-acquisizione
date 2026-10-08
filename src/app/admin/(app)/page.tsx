import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/modules/admin/auth";
import { countLeadsByStatus, listLeads } from "@/modules/leads/service";
import { CLOSED_STATUSES, isLeadStatus, LEAD_STATUSES, STATUS_LABELS, type LeadStatus } from "@/modules/leads/statuses";
import { PRIORITY_LABELS } from "@/modules/buybox/match";
import { formatDateTime, formatEur, formatKm, StatusBadge } from "@/modules/admin/ui/format";

export default function LeadsPage({ searchParams }: PageProps<"/admin">) {
  return (
    <Suspense fallback={<p className="text-concrete">Carico le richieste…</p>}>
      <LeadsView searchParams={searchParams} />
    </Suspense>
  );
}

async function LeadsView({ searchParams }: { searchParams: PageProps<"/admin">["searchParams"] }) {
  await requireAdmin();
  const sp = await searchParams;
  const raw = typeof sp.stato === "string" ? sp.stato : "open";
  const filter: LeadStatus | "open" | "all" = raw === "all" || isLeadStatus(raw) ? raw : "open";

  const [rows, counts] = await Promise.all([listLeads({ status: filter }), countLeadsByStatus()]);
  const countOf = (s: LeadStatus) => counts.find((c) => c.status === s)?.count ?? 0;
  const total = counts.reduce((a, c) => a + c.count, 0);
  const open = total - CLOSED_STATUSES.reduce((a, s) => a + countOf(s), 0);

  const tabs: { key: string; label: string; count: number }[] = [
    { key: "open", label: "Aperte", count: open },
    ...LEAD_STATUSES.map((s) => ({ key: s, label: STATUS_LABELS[s], count: countOf(s) })),
    { key: "all", label: "Tutte", count: total },
  ];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="display text-5xl">Richieste</h1>
        <dl className="flex gap-6 text-sm">
          <div>
            <dt className="text-concrete">Ricevute</dt>
            <dd className="display tabular text-3xl">{total}</dd>
          </div>
          <div>
            <dt className="text-concrete">Aperte</dt>
            <dd className="display tabular text-3xl">{open}</dd>
          </div>
          <div>
            <dt className="text-concrete">Acquistate</dt>
            <dd className="display tabular text-3xl text-ok">{countOf("purchased")}</dd>
          </div>
        </dl>
      </div>

      <nav aria-label="Filtra per stato" className="-mx-4 mt-6 overflow-x-auto px-4">
        <ul className="flex gap-2 pb-2">
          {tabs.map((t) => {
            const active = t.key === filter;
            return (
              <li key={t.key}>
                <Link
                  href={t.key === "open" ? "/admin" : `/admin?stato=${t.key}`}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-semibold ring-1 transition-colors ${
                    active ? "bg-asphalt text-paper ring-asphalt" : "bg-paper ring-line hover:ring-asphalt-soft"
                  }`}
                >
                  {t.label}
                  <span className={`tabular text-xs ${active ? "text-paper/70" : "text-concrete"}`}>{t.count}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {rows.length === 0 ? (
        <div className="mt-8 rounded-2xl bg-paper p-10 text-center ring-1 ring-line">
          <p className="text-lg font-bold">Nessuna richiesta in questo stato.</p>
          <p className="mt-1 text-concrete">Le nuove richieste dal sito compaiono qui appena inviate.</p>
        </div>
      ) : (
        <>
          {/* Desktop: tabella */}
          <div className="mt-4 hidden overflow-x-auto rounded-2xl bg-paper ring-1 ring-line lg:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-concrete">
                <tr>
                  {["Data", "Cliente", "Moto", "Anno", "Km", "Comune", "Stato", "Offerta", "Note"].map((h) => (
                    <th key={h} scope="col" className="px-4 py-3 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.id} className="relative hover:bg-chalk">
                    <td className="whitespace-nowrap px-4 py-3 tabular text-concrete">{formatDateTime(r.createdAt)}</td>
                    <td className="px-4 py-3 font-semibold">
                      <Link href={`/admin/lead/${r.id}`} className="after:absolute after:inset-0">
                        {r.firstName} {r.lastName}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold">
                        {r.brand} {r.model}
                      </span>
                      {r.displacement ? <span className="text-concrete"> {r.displacement}</span> : null}
                      {r.buyBox && (
                        <span className="ml-2 rounded bg-signal/60 px-1.5 py-0.5 text-[11px] font-bold">
                          Buy Box {PRIORITY_LABELS[r.buyBox.priority]}
                        </span>
                      )}
                      {r.photoCount > 0 && <span className="ml-2 whitespace-nowrap text-xs text-concrete">{r.photoCount} foto</span>}
                    </td>
                    <td className="px-4 py-3 tabular">{r.year}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular">{formatKm(r.mileage)}</td>
                    <td className="px-4 py-3">{r.city}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular">
                      {r.status === "purchased" ? (
                        <span className="font-bold text-ok">{formatEur(r.purchasePrice)}</span>
                      ) : (
                        formatEur(r.lastOffer)
                      )}
                    </td>
                    <td className="max-w-[16rem] truncate px-4 py-3 text-concrete">{r.notes ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: schede */}
          <ul className="mt-4 space-y-3 lg:hidden">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/admin/lead/${r.id}`} className="block rounded-2xl bg-paper p-4 ring-1 ring-line active:bg-chalk">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold">
                        {r.brand} {r.model} {r.displacement ?? ""}
                      </p>
                      <p className="text-sm text-concrete">
                        {r.year}, {formatKm(r.mileage)}
                      </p>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span>
                      {r.firstName} {r.lastName}, {r.city}
                    </span>
                    <span className="tabular text-concrete">{formatDateTime(r.createdAt)}</span>
                  </div>
                  {(r.buyBox || r.lastOffer) && (
                    <div className="mt-2 flex gap-2 text-xs font-bold">
                      {r.buyBox && <span className="rounded bg-signal/60 px-1.5 py-0.5">Buy Box {PRIORITY_LABELS[r.buyBox.priority]}</span>}
                      {r.lastOffer && <span className="rounded bg-chalk px-1.5 py-0.5">Offerta {formatEur(r.lastOffer)}</span>}
                    </div>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
