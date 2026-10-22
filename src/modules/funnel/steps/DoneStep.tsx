"use client";
import Link from "next/link";
import { whatsappLink } from "@/config/business";
import { track } from "@/modules/analytics/client";
import { IconCheck } from "@/components/Icons";
import { btnOutline, btnPrimary } from "@/components/buttons";
import { PhoneButton } from "@/components/ContactButtons";

export function DoneStep({
  code,
  motoLabel,
  photosSent,
  onHome,
}: {
  code: string;
  motoLabel: string;
  photosSent: number;
  onHome: () => void;
}) {
  // senza un numero WhatsApp aziendale configurato il pulsante non compare (mai un link verso un numero di esempio)
  const waHref = whatsappLink(
    photosSent > 0
      ? `Ciao! Ho appena inviato la richiesta ${code} per la mia ${motoLabel}.`
      : `Ciao! Ho appena inviato la richiesta ${code} per la mia ${motoLabel}. Vi mando qui le foto.`,
  );

  const NEXT = [
    "Controlliamo i dati della tua moto.",
    "Se è interessante per noi, ti ricontattiamo con un'offerta.",
    "Se troviamo un accordo, fissiamo un appuntamento per vedere la moto.",
  ];

  return (
    <div>
      <div aria-hidden className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-ok text-paper">
        <IconCheck className="h-8 w-8" />
      </div>
      <h1 className="display text-4xl leading-[0.98] sm:text-5xl">Richiesta ricevuta</h1>
      <p className="mt-4 max-w-[44ch] text-lg leading-snug">
        Abbiamo ricevuto i dati della tua moto{motoLabel ? `: ${motoLabel}` : ""}.
      </p>

      <div className="on-dark mt-7 rounded-2xl bg-asphalt p-5 text-paper">
        <p className="text-sm font-bold uppercase tracking-wider text-paper/70">Codice richiesta</p>
        <p data-testid="request-code" className="display tabular mt-1 text-5xl tracking-[0.18em] text-signal sm:text-6xl">
          {code}
        </p>
        <p className="mt-2 text-sm text-paper/70">Conservalo: ti serve se vuoi parlare di questa richiesta con noi.</p>
      </div>

      <h2 className="mt-8 text-lg font-bold">Cosa succede ora</h2>
      <ol className="mt-3 space-y-3">
        {NEXT.map((t, i) => (
          <li key={t} className="flex items-start gap-3">
            <span className="display flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-signal text-lg text-asphalt">
              {i + 1}
            </span>
            <span className="pt-1 leading-snug text-asphalt-soft">{t}</span>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-sm text-concrete">Ti contatteremo ai recapiti che ci hai lasciato.</p>

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
