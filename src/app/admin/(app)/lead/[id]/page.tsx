import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/modules/admin/auth";
import { getLeadDetail } from "@/modules/leads/service";
import { STATUS_LABELS } from "@/modules/leads/statuses";
import { PRIORITY_LABELS } from "@/modules/buybox/match";
import { whatsappLink } from "@/config/brand";
import {
  CONTACT_LABELS,
  formatDate,
  formatDateTime,
  formatEur,
  formatKm,
  StatusBadge,
  TRI_LABELS,
} from "@/modules/admin/ui/format";
import {
  NotesForm,
  OfferForm,
  OfferOutcomeButtons,
  PurchaseForm,
  StatusForm,
  UndoPurchaseButton,
} from "@/modules/admin/ui/LeadForms";

export default function LeadPage({ params }: PageProps<"/admin/lead/[id]">) {
  return (
    <Suspense fallback={<p className="text-concrete">Carico la richiesta…</p>}>
      <LeadView params={params} />
    </Suspense>
  );
}

const OFFER_STATUS = {
  proposed: { label: "Proposta", className: "text-concrete" },
  accepted: { label: "Accettata", className: "text-ok" },
  rejected: { label: "Rifiutata", className: "text-danger" },
  superseded: { label: "Superata", className: "text-concrete line-through" },
} as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-paper p-5 ring-1 ring-line">
      <h2 className="mb-4 text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Facts({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-concrete">{k}</dt>
          <dd className="font-semibold">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

async function LeadView({ params }: { params: PageProps<"/admin/lead/[id]">["params"] }) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await getLeadDetail(id);
  if (!data) notFound();
  const { lead, customer, motorcycle: moto, photos, history, offers, buyBox } = data;

  const purchased = lead.status === "purchased";
  const acceptedOffer = offers.find((o) => o.status === "accepted");
  const motoName = `${moto.brand} ${moto.model}${moto.displacement ? ` ${moto.displacement}` : ""}`;

  return (
    <>
      <Link href="/admin" className="text-sm font-semibold text-concrete hover:text-asphalt">
        ← Tutte le richieste
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="display text-4xl md:text-5xl">{motoName}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-concrete">
            <StatusBadge status={lead.status} />
            <span>Richiesta {lead.code}</span>
            <span>ricevuta il {formatDateTime(lead.createdAt)}</span>
            {buyBox ? (
              <span className="rounded bg-signal/60 px-1.5 py-0.5 text-xs font-bold text-asphalt">
                Buy Box: priorità {PRIORITY_LABELS[buyBox.priority].toLowerCase()}
              </span>
            ) : (
              <span className="rounded bg-line px-1.5 py-0.5 text-xs font-bold">Fuori Buy Box</span>
            )}
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_380px]">
        {/* Colonna dati */}
        <div className="space-y-5">
          <Section title="Moto">
            <Facts
              items={[
                ["Marca", moto.brand],
                ["Modello", moto.model],
                ["Versione", moto.version || "—"],
                ["Anno", moto.year],
                ["Cilindrata", moto.displacement ? `${moto.displacement} cc` : "—"],
                ["Km", formatKm(lead.mileage)],
                ["Funzionante", lead.isRunning ? "Sì" : "No"],
                ["Incidenti", TRI_LABELS[lead.accident]],
                ["Problemi meccanici", TRI_LABELS[lead.mechanicalIssues]],
                ["Manutenzione regolare", TRI_LABELS[lead.maintenance]],
              ]}
            />
          </Section>

          <Section title={`Foto (${photos.length})`}>
            {photos.length === 0 ? (
              <p className="text-sm text-concrete">
                Nessuna foto caricata. Il cliente potrebbe mandarle su WhatsApp.
              </p>
            ) : (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {photos.map((p) => (
                  <li key={p.id}>
                    <a
                      href={`/api/admin/photos/${p.id}`}
                      target="_blank"
                      rel="noopener"
                      className="block aspect-[4/3] overflow-hidden rounded-lg bg-line"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- immagini private, servite con controllo accesso */}
                      <img src={`/api/admin/photos/${p.id}`} alt="Foto moto" loading="lazy" className="h-full w-full object-cover" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Cliente">
            <Facts
              items={[
                ["Nome", `${customer.firstName} ${customer.lastName}`],
                ["Comune", customer.city],
                ["Preferisce", CONTACT_LABELS[lead.preferredContact]],
                ["Telefono", customer.phone],
                ["Email", customer.email],
                ["Consenso privacy", formatDate(customer.privacyConsentAt)],
              ]}
            />
            <div className="mt-5 flex flex-wrap gap-2">
              <a
                href={whatsappLink(
                  `Ciao ${customer.firstName}, ti scrivo per la tua richiesta ${lead.code} (${motoName}).`,
                  customer.phone,
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center rounded-lg bg-ok px-4 text-sm font-bold text-paper"
              >
                Scrivi su WhatsApp
              </a>
              <a href={`tel:${customer.phone}`} className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-bold ring-1 ring-line">
                Chiama
              </a>
              <a href={`mailto:${customer.email}`} className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-bold ring-1 ring-line">
                Email
              </a>
            </div>
            {(lead.utmSource || lead.utmCampaign) && (
              <p className="mt-4 text-xs text-concrete">
                Provenienza: {[lead.utmSource, lead.utmMedium, lead.utmCampaign].filter(Boolean).join(" / ")}
              </p>
            )}
          </Section>
        </div>

        {/* Colonna azioni */}
        <div className="space-y-5">
          <Section title="Stato">
            <StatusForm key={lead.status} leadId={lead.id} status={lead.status} />
          </Section>

          <Section title="Offerte">
            {offers.length > 0 && (
              <ul className="mb-5 divide-y divide-line">
                {offers.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div>
                      <p className="display tabular text-2xl">{formatEur(o.amount)}</p>
                      <p className="text-xs text-concrete">
                        {formatDateTime(o.createdAt)}
                        {o.createdBy ? `, ${o.createdBy}` : ""}
                      </p>
                    </div>
                    {o.status === "proposed" && !purchased ? (
                      <OfferOutcomeButtons offerId={o.id} />
                    ) : (
                      <span className={`text-sm font-bold ${OFFER_STATUS[o.status].className}`}>
                        {OFFER_STATUS[o.status].label}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <OfferForm leadId={lead.id} disabled={purchased} />
          </Section>

          <Section title="Acquisto">
            {purchased ? (
              <div>
                <p className="display tabular text-4xl text-ok">{formatEur(lead.purchasePrice)}</p>
                <p className="mt-1 text-sm text-concrete">
                  Acquistata il {lead.purchasedAt ? formatDate(lead.purchasedAt) : "—"}
                </p>
                <div className="mt-4">
                  <UndoPurchaseButton leadId={lead.id} />
                </div>
              </div>
            ) : (
              <PurchaseForm leadId={lead.id} suggestedPrice={acceptedOffer?.amount} />
            )}
          </Section>

          <Section title="Note">
            <NotesForm leadId={lead.id} notes={lead.notes} />
          </Section>

          <Section title="Storico stati">
            <ol className="space-y-3 text-sm">
              {history.map((h) => (
                <li key={h.id} className="flex gap-3">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-plate" aria-hidden />
                  <div>
                    <p className="font-semibold">
                      {h.fromStatus ? `${STATUS_LABELS[h.fromStatus]} → ` : ""}
                      {STATUS_LABELS[h.toStatus]}
                    </p>
                    <p className="text-xs text-concrete">
                      {formatDateTime(h.createdAt)}
                      {h.changedBy ? `, ${h.changedBy}` : ", dal sito"}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Section>
        </div>
      </div>
    </>
  );
}
