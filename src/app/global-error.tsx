"use client";

/** Errore nel layout principale: pagina minima autonoma, nessun dettaglio tecnico. */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="it">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#e9ebe7", color: "#15181b", margin: 0 }}>
        <title>Errore temporaneo</title>
        <main style={{ maxWidth: 560, margin: "0 auto", padding: "80px 20px" }}>
          <h1 style={{ fontSize: 40, lineHeight: 1.05 }}>Il sito non risponde in questo momento</h1>
          <p style={{ fontSize: 18 }}>Riprova tra qualche minuto.</p>
          {error.digest && <p style={{ fontSize: 14, color: "#565c60" }}>Codice errore: {error.digest}</p>}
          <button
            type="button"
            onClick={() => retry()}
            style={{ marginTop: 16, height: 52, padding: "0 28px", borderRadius: 12, border: 0, background: "#f1bf1a", color: "#15181b", fontSize: 18, fontWeight: 700 }}
          >
            Riprova
          </button>
        </main>
      </body>
    </html>
  );
}
