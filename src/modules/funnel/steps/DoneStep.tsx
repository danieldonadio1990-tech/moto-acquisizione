"use client";
import Link from "next/link";
import { whatsappLink } from "@/config/business";
import { track } from "@/modules/analytics/client";
import { IconCheck } from "@/components/Icons";
import { btnOutline, btnPrimary } from "@/components/buttons";
import { PhoneButton } from "@/components/ContactButtons";
import { formatEuro } from "@/modules/valuation/money";
import type { PublicValuation } from "@/modules/valuation/public";

/** Sintesi dei dati usati per la valutazione (solo ciò che il cliente ha inserito). */
export type MotoSummary = { label: string; year?: number; mileage?: number };

export function DoneStep({
  code,
  motoLabel,
  summary,
  valuation,
  photosSent,
  onHome,
}: {
  code: string;
  motoLabel: string;
  summary: MotoSummary;
  valuation: PublicValuation;
  photosSent: number;
  onHome: () => void;
}) {
  // senza un numero WhatsApp aziendale configurato il pulsante non compare (mai un link verso un numero di esempio)
  const waHref = whatsappLink(
    photosSent > 0
      ? `Ciao! Ho appena inviato la richiesta ${code} per la mia ${motoLabel}.`
      : `Ciao! Ho appena inviato la richiesta ${code} per la mia ${motoLabel}. Vi mando qui le foto.`,
  );

  const hasAmount = valuation.kind !== "manual";
  const NEXT = hasAmount
    ? [
        "Verifichiamo i dati e le condizioni della tua moto.",
        "Ti ricontattiamo ai recapiti che ci hai lasciato per confermare o aggiornare la valutazione.",
        "Se troviamo un accordo, fissiamo un appuntamento per vedere la moto.",
      ]
    : [
        "Controlliamo i dati della tua moto.",
        "Ti ricontattiamo con una valutazione, oppure ti chiediamo qualche informazione in più.",
        "Se troviamo un accordo, fissiamo un appuntamento per vedere la moto.",
      ];

  return (
    <div>
      <div aria-hidden className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-ok text-paper">
        <IconCheck className="h-8 w-8" />
      </div>
      <h1 data-testid="done-title" className="display text-4xl sm:text-5xl">
        {hasAmount ? "La tua moto ha una prima valutazione." : "Richiesta ricevuta"}
      </h1>

      {valuation.kind === "offer" && (
        <section aria-label="Offerta preliminare" className="mt-6 rounded-2xl bg-asphalt p-6 text-paper shadow-[var(--shadow-card)]">
          <p className="text-sm font-bold uppercase tracking-wider text-paper/70">Offerta preliminare</p>
          <p data-testid="valuation-amount" className="display tabular mt-1 text-5xl text-sky sm:text-6xl">
            {formatEuro(valuation.amountCents)}
          </p>
        </section>
      )}
      {valuation.kind === "range" && (
        <section aria-label="Fascia indicativa" className="mt-6 rounded-2xl bg-asphalt p-6 text-paper shadow-[var(--shadow-card)]">
          <p className="text-sm font-bold uppercase tracking-wider text-paper/70">Fascia indicativa</p>
          <p data-testid="valuation-range" className="display tabular mt-1 text-4xl text-sky sm:text-5xl">
            {formatEuro(valuation.lowCents)} – {formatEuro(valuation.highCents)}
          </p>
        </section>
      )}

      {hasAmount ? (
        <p className="mt-4 max-w-[52ch] leading-relaxed text-asphalt-soft">
          Si tratta di una valutazione <strong>preliminare</strong>, non di un acquisto concluso né di un impegno: il prezzo finale
          dipende dalla verifica delle condizioni e dei dati della moto.
        </p>
      ) : (
        <p className="mt-4 max-w-[52ch] text-lg leading-snug text-asphalt-soft">
          Abbiamo ricevuto i dati della tua moto{motoLabel ? `: ${motoLabel}` : ""}. Per darti un importo affidabile ci serve una
          verifica dei dati: ti ricontatteremo noi.
        </p>
      )}

      <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-2xl bg-paper p-4 text-sm ring-1 ring-line">
        <dt className="font-bold text-concrete">Moto</dt>
        <dd>{summary.label || motoLabel}</dd>
        {summary.year ? (
          <>
            <dt className="font-bold text-concrete">Anno</dt>
            <dd>{summary.year}</dd>
          </>
        ) : null}
        {summary.mileage !== undefined ? (
          <>
            <dt className="font-bold text-concrete">Chilometri</dt>
            <dd>{summary.mileage.toLocaleString("it-IT")}</dd>
          </>
        ) : null}
      </dl>

      <div className="on-dark mt-6 rounded-2xl bg-asphalt p-5 text-paper">
        <p className="text-sm font-bold uppercase tracking-wider text-paper/70">Codice richiesta</p>
        <p data-testid="request-code" className="display tabular mt-1 text-5xl tracking-[0.18em] text-sky sm:text-6xl">
          {code}
        </p>
        <p className="mt-2 text-sm text-paper/70">Conservalo: ti serve se vuoi parlare di questa richiesta con noi.</p>
      </div>

      <h2 className="mt-8 text-lg font-bold">Cosa succede ora</h2>
      <ol className="mt-3 space-y-3">
        {NEXT.map((t, i) => (
          <li key={t} className="flex items-start gap-3">
            <span className="display flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-plate text-lg text-asphalt">
              {i + 1}
            </span>
            <span className="pt-1 leading-snug text-asphalt-soft">{t}</span>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-sm text-concrete">La tua richiesta di essere ricontattato è già registrata: non devi fare altro.</p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        {waHref && (
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track("whatsapp_click", { from: "done" })}
            className={btnPrimary}
          >
            Contattaci su WhatsApp
          </a>
        )}
        <PhoneButton showNumber />
        <Link href="/" onClick={onHome} className={btnOutline}>
          Torna alla home
        </Link>
      </div>
    </div>
  );
}
