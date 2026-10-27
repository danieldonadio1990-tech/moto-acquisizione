import Link from "next/link";
import { BrandSymbol } from "@/components/brand2/BrandSymbol";
import { StickyBar } from "@/components/brand2/StickyBar";
import { AREA, FAQ, NEEDED, STEPS } from "./content";

export default function PreviewHome() {
  return (
    <>
      <div className="b2-banner">
        <span>Anteprima di design, non pubblicata</span>
        <Link href="/anteprima/logo">Vedi il logo e le regole d&apos;uso →</Link>
      </div>

      <header className="b2-header">
        <Link href="/anteprima" className="b2-brand" aria-label="Compriamo Moto, home">
          <BrandSymbol className="b2-brand-sym" />
          <span className="b2-brand-name">
            Compriamo <em>Moto</em>
          </span>
        </Link>
        <nav className="b2-nav" aria-label="Sezioni">
          <a href="#come-funziona">Come funziona</a>
          <a href="#domande">Domande</a>
          <Link href="/valuta" className="b2-btn b2-btn-sm">
            Valuta la tua moto
          </Link>
        </nav>
      </header>

      <main>
        <section className="b2-hero">
          <div className="b2-hero-copy">
            <p className="b2-label">Acquisto moto usate da privati · {AREA}</p>
            <h1 className="b2-h1">Valuta la tua moto in pochi passaggi.</h1>
            <p className="b2-lead">
              Acquistiamo la tua moto direttamente da te. Compili la scheda, la guardiamo e ti ricontattiamo. Della rivendita non devi occuparti tu.
            </p>
          </div>

          <div className="b2-card" role="group" aria-label="Anteprima della scheda moto">
            <p className="b2-label">Scheda moto · si compila nei passaggi successivi</p>
            <dl className="b2-fields" aria-hidden="true">
              {["Marca", "Modello", "Anno", "Chilometri"].map((k) => (
                <div key={k} className="b2-field">
                  <dt>{k}</dt>
                  <dd>—</dd>
                </div>
              ))}
            </dl>
            <div className="b2-perf" aria-hidden="true" />
            <div id="b2-hero-cta">
              <Link href="/valuta" className="b2-btn">
                <span>Valuta la tua moto</span>
                <span aria-hidden="true">→</span>
              </Link>
            </div>
            <p className="b2-micro">Gratis · senza impegno · foto facoltative</p>
          </div>
        </section>

        <div className="b2-photo" role="img" aria-label="Spazio riservato a una fotografia reale">
          <span>Foto reale della tua attività · da fornire, con diritti d&apos;uso verificati</span>
        </div>

        <section id="come-funziona" className="b2-sec">
          <p className="b2-label">Come funziona</p>
          <h2 className="b2-h2">Tre passaggi, nessuna rivendita da gestire.</h2>
          <ol className="b2-steps">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <span className="b2-step-n">0{i + 1}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="b2-sec b2-sec-split">
          <div>
            <p className="b2-label">Cosa ci serve</p>
            <h2 className="b2-h2">Pochi dati sulla moto.</h2>
            <p className="b2-lead">Ti guidiamo passo dopo passo. Puoi inviare la richiesta anche senza foto.</p>
          </div>
          <ul className="b2-list">
            {NEEDED.map(([k, v]) => (
              <li key={k}>
                <span>{k}</span>
                <span className="b2-list-note">{v}</span>
              </li>
            ))}
          </ul>
        </section>

        <section id="domande" className="b2-sec">
          <p className="b2-label">Domande</p>
          <h2 className="b2-h2">Prima di scriverci.</h2>
          <div className="b2-faq">
            {FAQ.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="b2-final">
          <div>
            <h2 className="b2-h2">Hai una moto da vendere?</h2>
            <p className="b2-final-note">Gratis e senza impegno · {AREA}</p>
          </div>
          <div id="b2-final-cta">
            <Link href="/valuta" className="b2-btn">
              <span>Valuta la tua moto</span>
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </section>
      </main>

      <footer className="b2-footer">
        <div className="b2-brand b2-brand-foot">
          <BrandSymbol className="b2-brand-sym" />
          <span className="b2-brand-name">
            Compriamo <em>Moto</em>
          </span>
        </div>
        <p>Acquisto di moto usate da privati a {AREA}.</p>
        <p>
          <Link href="/privacy">Privacy</Link>
        </p>
      </footer>

      <StickyBar watchId="b2-hero-cta" hideId="b2-final-cta" />
    </>
  );
}
