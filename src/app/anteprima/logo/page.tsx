/* eslint-disable @next/next/no-img-element -- anteprima: mostra i file SVG così come verranno consegnati */
import Link from "next/link";

const SWATCHES = [
  ["Grafite", "#15181B", "Testo, marchio", "#ecece6"],
  ["Bianco sporco", "#FBFBF8", "Carta, cartellino", "#15181B"],
  ["Pietra", "#E9EBE7", "Sfondo", "#15181B"],
  ["Giallo segnale", "#F1BF1A", "Azione e C del marchio", "#15181B"],
] as const;

export default function LogoSheet() {
  return (
    <div className="b2-logo-page">
      <div className="b2-banner">
        <span>Anteprima di design, non pubblicata</span>
        <Link href="/anteprima">← Torna alla homepage</Link>
      </div>
      <main className="b2-sec b2-logo-main">
        <p className="b2-label">Identità visiva</p>
        <h1 className="b2-h1 b2-h1-sm">Logo Compriamo Moto</h1>
        <p className="b2-lead">Il simbolo riproduce il concept fornito: la C è la ruota posteriore, la M il corpo della moto, la O la ruota anteriore. Il giallo si usa solo per la C e per un dettaglio.</p>

        <div className="b2-tiles">
          <figure className="b2-tile b2-tile-light b2-tile-wide">
            <img src="/brand/v2/lockup.svg" alt="Logo Compriamo Moto, versione principale" />
            <figcaption>Principale · su sfondi chiari</figcaption>
          </figure>
          <figure className="b2-tile b2-tile-dark b2-tile-wide">
            <img src="/brand/v2/lockup-dark.svg" alt="Logo Compriamo Moto, versione per sfondi scuri" />
            <figcaption>Su sfondi scuri</figcaption>
          </figure>
          <figure className="b2-tile b2-tile-light">
            <img src="/brand/v2/lockup-mono.svg" alt="Logo Compriamo Moto, monocromatico" />
            <figcaption>Monocromatico</figcaption>
          </figure>
          <figure className="b2-tile b2-tile-light">
            <img src="/brand/v2/wordmark-alt.svg" alt="Wordmark alternativo, compriamo moto" />
            <figcaption>Wordmark alternativo (testi, firme)</figcaption>
          </figure>
        </div>

        <h2 className="b2-h2">Avatar e icone</h2>
        <div className="b2-icons">
          <figure>
            <img className="b2-round" width="96" height="96" src="/brand/v2/avatar.svg" alt="Avatar tondo, 96 pixel" />
            <figcaption>Avatar 96 px</figcaption>
          </figure>
          <figure>
            <img className="b2-round" width="48" height="48" src="/brand/v2/avatar.svg" alt="Avatar tondo, 48 pixel" />
            <figcaption>48 px</figcaption>
          </figure>
          <figure>
            <img className="b2-round" width="32" height="32" src="/brand/v2/avatar.svg" alt="Avatar tondo, 32 pixel" />
            <figcaption>32 px</figcaption>
          </figure>
          <figure>
            <img width="96" height="96" src="/brand/v2/app-icon.svg" alt="Icona app" />
            <figcaption>Icona app</figcaption>
          </figure>
          <figure>
            <img width="32" height="32" src="/brand/v2/favicon.svg" alt="Favicon, 32 pixel" />
            <figcaption>Favicon 32</figcaption>
          </figure>
          <figure>
            <img width="16" height="16" src="/brand/v2/favicon.svg" alt="Favicon, 16 pixel" />
            <figcaption>16</figcaption>
          </figure>
        </div>
        <p className="b2-note">PNG 1024 × 1024 per Instagram, TikTok e Facebook: <code>/brand/v2/avatar-1024.png</code>. Il ritaglio tondo non taglia il simbolo.</p>

        <h2 className="b2-h2">Colori</h2>
        <div className="b2-swatches">
          {SWATCHES.map(([n, hex, use, fg]) => (
            <div key={n} style={{ background: hex, color: fg }}>
              <b>{n}</b>
              <span>{hex}</span>
              <span>{use}</span>
            </div>
          ))}
        </div>

        <h2 className="b2-h2">Caratteri</h2>
        <div className="b2-type">
          <div>
            <p className="b2-label">Titoli e marchio · Big Shoulders Display</p>
            <p className="b2-type-d">Compriamo Moto</p>
          </div>
          <div>
            <p className="b2-label">Testo del sito · Instrument Sans</p>
            <p className="b2-type-b">Valutazione gratuita della tua moto.</p>
          </div>
          <div>
            <p className="b2-label">Dati e numeri · IBM Plex Mono</p>
            <p className="b2-type-m">MARCA · ANNO · KM — es. 2020 · 12.500 km</p>
          </div>
        </div>

        <h2 className="b2-h2">Regole d&apos;uso</h2>
        <ul className="b2-rules">
          <li>Spazio libero attorno al logo: almeno l&apos;altezza della ruota anteriore.</li>
          <li>Dimensione minima: simbolo da solo 24 px di altezza; logo con scritta 120 px di larghezza.</li>
          <li>Il giallo non diventa mai sfondo di grandi superfici e non si usa per il testo corrente.</li>
          <li>Il simbolo non si ruota, non si deforma e non si ricolora oltre le versioni fornite.</li>
        </ul>
      </main>
    </div>
  );
}
