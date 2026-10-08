"use client";
import Link from "next/link";
import { whatsappLink } from "@/config/brand";
import { track } from "@/modules/analytics/client";

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
  const message =
    photosSent > 0
      ? `Ciao! Ho appena inviato la richiesta ${code} per la mia ${motoLabel}.`
      : `Ciao! Ho appena inviato la richiesta ${code} per la mia ${motoLabel}. Vi mando qui le foto.`;

  return (
    <div className="step-in">
      <div aria-hidden className="mb-8 flex h-16 w-16 items-center justify-center rounded-full bg-ok text-paper">
        <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="3">
          <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h1 className="display text-[2.75rem] leading-[0.95] sm:text-6xl">Richiesta ricevuta</h1>
      <p className="mt-5 max-w-[38ch] text-lg leading-snug">Abbiamo ricevuto i dati della tua moto.</p>
      <p className="mt-2 max-w-[38ch] text-lg leading-snug text-asphalt-soft">
        Il nostro team verificherà le informazioni e ti ricontatterà per completare la valutazione.
      </p>

      <div className="mt-8 inline-flex items-center gap-3 rounded-xl bg-paper px-4 py-3 ring-1 ring-line">
        <span className="text-sm text-concrete">Codice richiesta</span>
        <span className="display tabular text-2xl tracking-widest">{code}</span>
      </div>

      <div className="mt-10 flex flex-col gap-3 sm:flex-row">
        <a
          href={whatsappLink(message)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track("whatsapp_click", { from: "done" })}
          className="inline-flex h-14 items-center justify-center rounded-xl bg-plate px-8 text-lg font-bold text-paper hover:bg-plate-deep"
        >
          Contattaci su WhatsApp
        </a>
        <Link
          href="/"
          onClick={onHome}
          className="inline-flex h-14 items-center justify-center rounded-xl border-2 border-asphalt px-8 text-lg font-bold"
        >
          Torna alla home
        </Link>
      </div>
    </div>
  );
}
