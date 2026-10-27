import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { SitePhoto, hasPhoto } from "@/components/SitePhoto";
import { PhoneButton, WhatsAppButton } from "@/components/ContactButtons";
import { StickyCta } from "@/components/StickyCta";
import { TrackedLink, TrackOnMount } from "@/components/Track";
import { btnPrimary } from "@/components/buttons";
import { BRAND, contactLinks } from "@/config/business";
import { isGenerated } from "@/config/images";
import { FAQ, NEEDED, STEPS } from "@/config/home-content";

export default function Home() {
  return (
    <>
      <TrackOnMount event="landing_view" />
      <SiteHeader />

      <main>
        {/* HERO: titolo, cartellino (anteprima del modulo) e un solo pulsante */}
        <section className="bg-chalk">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-10 pt-8 sm:px-6 md:grid-cols-[1.2fr_0.8fr] md:gap-14 md:pb-16 md:pt-14 lg:px-8">
            <div className="min-w-0">
              <p className="label text-concrete">Acquisto moto usate da privati · {BRAND.area}</p>
              <h1 className="display mt-4 text-[clamp(3.4rem,15vw,6.4rem)] font-black leading-[0.9]">Valuta la tua moto in pochi passaggi.</h1>
              <p className="mt-5 max-w-[46ch] text-lg leading-relaxed text-asphalt-soft">
                Acquistiamo la tua moto direttamente da te. Compili la scheda, la guardiamo e ti ricontattiamo. Della rivendita non devi occuparti tu.
              </p>
            </div>

            <div className="ticket min-w-0 px-5 pb-5 pt-4" role="group" aria-label="Anteprima della scheda moto">
              <p className="label text-concrete">Scheda moto · si compila nei passaggi successivi</p>
              <dl className="mt-2" aria-hidden="true">
                {["Marca", "Modello", "Anno", "Chilometri"].map((k) => (
                  <div key={k} className="flex items-baseline justify-between gap-3 border-b border-line/70 py-2.5">
                    <dt className="label text-[0.7rem] text-concrete">{k}</dt>
                    <dd className="font-semibold text-concrete/70">—</dd>
                  </div>
                ))}
              </dl>
              <div className="perf -mx-5 my-4" aria-hidden="true" />
              <div id="hero-cta">
                <TrackedLink href="/valuta" event="cta_click" label="hero" className={`${btnPrimary} w-full justify-between`}>
                  <span>Valuta la tua moto</span>
                  <span aria-hidden="true">→</span>
                </TrackedLink>
              </div>
              <p className="label mt-3 text-[0.68rem] text-concrete">Gratis · senza impegno · foto facoltative</p>
            </div>
          </div>

          {/* fotografia reale (solo se presente in src/config/images.ts): nessun segnaposto in pagina */}
          {hasPhoto("hero") && (
            <figure className="mx-auto max-w-6xl px-4 pb-10 sm:px-6 md:pb-16 lg:px-8">
              <div className="aspect-[16/10] w-full overflow-hidden md:aspect-[21/8]">
                <SitePhoto id="hero" priority />
              </div>
              {isGenerated("hero") && <figcaption className="mt-2 text-xs font-semibold text-concrete">Immagine illustrativa</figcaption>}
            </figure>
          )}
        </section>

        {/* COME FUNZIONA */}
        <section id="come-funziona" className="scroll-mt-20 bg-chalk">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-20 lg:px-8">
            <p className="label text-concrete">Come funziona</p>
            <h2 className="display mt-2 text-4xl sm:text-5xl md:text-6xl">Tre passaggi, nessuna rivendita da gestire.</h2>
            <ol className="mt-8 border-t-2 border-asphalt md:grid md:grid-cols-3 md:gap-8 md:border-t-0">
              {STEPS.map((s, i) => (
                <li key={s.title} className="grid grid-cols-[auto_1fr] gap-x-4 border-b border-line py-5 md:block md:border-b-0 md:border-t-2 md:border-asphalt md:pt-4">
                  <span className="label row-span-2 pt-1 text-concrete md:mb-2 md:block">0{i + 1}</span>
                  <h3 className="display text-2xl md:mb-2">{s.title}</h3>
                  <p className="max-w-[56ch] leading-relaxed text-asphalt-soft">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* COSA CI SERVE */}
        <section className="bg-chalk">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 pb-12 sm:px-6 md:grid-cols-[0.9fr_1.1fr] md:gap-14 md:pb-20 lg:px-8">
            <div>
              <p className="label text-concrete">Cosa ci serve</p>
              <h2 className="display mt-2 text-4xl sm:text-5xl md:text-6xl">Pochi dati sulla moto.</h2>
              <p className="mt-4 max-w-[46ch] text-lg leading-relaxed text-asphalt-soft">
                Ti guidiamo passo dopo passo. Puoi inviare la richiesta anche senza foto.
              </p>
            </div>
            <ul className="border-t-2 border-asphalt">
              {NEEDED.map(([k, v]) => (
                <li key={k} className="flex items-baseline justify-between gap-4 border-b border-line py-3.5 font-semibold">
                  <span>{k}</span>
                  <span className="label text-right text-[0.7rem] text-concrete">{v}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* FAQ */}
        <section id="domande" className="scroll-mt-20 bg-chalk">
          <div className="mx-auto max-w-6xl px-4 pb-12 sm:px-6 md:pb-20 lg:px-8">
            <p className="label text-concrete">Domande</p>
            <h2 className="display mt-2 text-4xl sm:text-5xl md:text-6xl">Prima di scriverci.</h2>
            <div className="mt-8 max-w-3xl border-t-2 border-asphalt">
              {FAQ.map((f) => (
                <details key={f.q} className="group border-b border-line">
                  <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-3 text-lg font-semibold [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <span aria-hidden className="shrink-0 font-mono text-2xl leading-none transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none">
                      +
                    </span>
                  </summary>
                  <p className="max-w-[62ch] pb-5 leading-relaxed text-asphalt-soft">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA FINALE */}
        <section className="on-dark bg-asphalt text-paper">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-7 px-4 py-12 sm:px-6 md:flex-row md:items-center md:justify-between md:py-16 lg:px-8">
            <p className="display max-w-[14ch] text-5xl sm:text-6xl">Hai una moto da vendere?</p>
            <div id="final-cta" className="w-full md:w-auto md:min-w-[22rem]">
              <TrackedLink href="/valuta" event="cta_click" label="footer" className={`${btnPrimary} w-full justify-between`}>
                <span>Valuta la tua moto</span>
                <span aria-hidden="true">→</span>
              </TrackedLink>
              <p className="label mt-3 text-[0.7rem] text-paper/80">Gratis e senza impegno · {BRAND.area}</p>
              {(contactLinks().whatsapp || contactLinks().phone) && (
                <div className="mt-6 border-t border-paper/20 pt-5">
                  <p className="mb-3 text-sm font-bold text-paper/85">Preferisci parlare con noi?</p>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <WhatsAppButton from="home-finale" />
                    <PhoneButton tone="dark" showNumber />
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
      <StickyCta watchId="hero-cta" hideId="final-cta" />
    </>
  );
}
