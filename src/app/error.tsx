"use client";
import Link from "next/link";

/**
 * Errore imprevisto in una pagina. Messaggio comprensibile, nessun dettaglio tecnico:
 * in produzione Next.js non invia al browser il testo dell'errore, solo un codice (digest)
 * che permette di ritrovarlo nei log del server.
 */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-5 py-16">
      <h1 className="display text-6xl">Qualcosa non ha funzionato</h1>
      <p className="mt-4 text-lg text-asphalt-soft">
        Non è colpa tua: riprova tra un momento. Se stavi compilando la valutazione, i dati inseriti sono ancora salvati in
        questa scheda.
      </p>
      {error.digest && <p className="mt-3 text-sm text-concrete">Codice errore: {error.digest}</p>}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => retry()}
          className="inline-flex h-14 items-center justify-center rounded-xl bg-plate px-8 text-lg font-bold text-paper"
        >
          Riprova
        </button>
        <Link href="/" className="inline-flex h-14 items-center justify-center rounded-xl border-2 border-asphalt px-8 text-lg font-bold">
          Torna alla home
        </Link>
      </div>
    </main>
  );
}
