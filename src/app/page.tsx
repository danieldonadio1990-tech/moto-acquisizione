import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ResponsivePhoto, SitePhoto, hasPhoto } from "@/components/SitePhoto";
import { PhoneButton, WhatsAppButton } from "@/components/ContactButtons";
import { AdSlot } from "@/components/AdSlot";
import { StickyCta } from "@/components/StickyCta";
import { TrackedLink, TrackOnMount } from "@/components/Track";
import { ProcessDeal, ProcessProposal, ProcessTell } from "@/components/ProcessIcons";
import { ADVANTAGE_ICONS } from "@/components/AdvantageIcons";
import { btnPrimary } from "@/components/buttons";
import { LEGAL, contactLinks, isPlaceholder } from "@/config/business";
import { isGenerated } from "@/config/images";
import { ADVANTAGES, AREA, FAQ, HERO, RESPONSE_TIME, STEPS, TRANSPARENCY, WHO_BUYS } from "@/config/home-content";

const PROCESS_ICONS = [ProcessTell, ProcessProposal, ProcessDeal];

export default function Home() {
  const transparency = TRANSPARENCY.filter((t): t is { q: string; answer: string } => t.answer !== null);
  const holder = isPlaceholder(LEGAL.companyName) ? null : LEGAL.companyName;
  const motoPhotos = hasPhoto("moto_1") || hasPhoto("moto_2");
  const heroPhoto = hasPhoto("hero") || hasPhoto("hero_mobile");
  const rail = (["moto_1", "moto_2", "dettaglio"] as const).filter(hasPhoto);
  return (
    <>
      <TrackOnMount event="landing_view" />
      <SiteHeader />

      <main>
        {/* 1 · HERO. Smartphone: fotografia verticale a tutta larghezza in alto (moto protagonista), poi testo e CTA sotto, mai sopra
            la fotografia. Tablet/desktop: titolo e CTA, fotografia orizzontale sotto. Senza foto resta solo la parte di testo. */}
        <section className="flex flex-col bg-chalk">
          <div className="mx-auto grid w-full max-w-6xl items-end gap-6 px-4 pb-8 pt-6 sm:px-6 md:grid-cols-[1.25fr_0.75fr] md:gap-14 md:pb-14 md:pt-14 lg:px-8">
            <div className="min-w-0">
              <p className="label text-concrete">{HERO.label}</p>
              <h1 className="display mt-3 text-balance text-[clamp(3.2rem,14.5vw,6.6rem)] font-black leading-[0.92] md:mt-4">{HERO.title}</h1>
              <p className="mt-4 max-w-[46ch] text-lg leading-relaxed text-asphalt-soft md:mt-5">{HERO.subtitle}</p>
            </div>
            <div id="hero-cta" className="min-w-0 md:pb-2">
              <TrackedLink href="/valuta" event="cta_click" label="hero" className={`${btnPrimary} w-full justify-between`}>
                <span>{HERO.cta}</span>
                <span aria-hidden="true">→</span>
              </TrackedLink>
              {/* smartphone: due indicazioni ben leggibili; da tablet la riga unica */}
              <ul className="mt-3 flex flex-wrap gap-2 md:hidden">
                <li className="rounded-full bg-asphalt px-3.5 py-1.5 text-sm font-bold text-paper">Risposta entro {RESPONSE_TIME}</li>
                <li className="rounded-full bg-paper px-3.5 py-1.5 text-sm font-bold text-asphalt ring-1 ring-line">{AREA}</li>
              </ul>
              <p className="label mt-3 hidden text-[0.7rem] text-concrete md:block">{HERO.note}</p>
            </div>
          </div>

          {heroPhoto && (
            <figure className="order-first md:order-none md:mx-auto md:w-full md:max-w-6xl md:px-6 md:pb-16 lg:px-8">
              <div className="aspect-[4/5] max-h-[42svh] w-full overflow-hidden md:aspect-[21/8] md:max-h-none">
                <ResponsivePhoto mobile="hero_mobile" desktop="hero" priority />
              </div>
              {(isGenerated("hero") || isGenerated("hero_mobile")) && (
                <figcaption className="mt-2 px-4 text-xs font-semibold text-concrete md:px-0">Immagine illustrativa</figcaption>
              )}
            </figure>
          )}
        </section>

        {/* 2 · CHI ACQUISTA: fondo scuro per cambiare ritmo; due fotografie di moto se presenti */}
        <section className="on-dark bg-asphalt text-paper">
          <div className={`mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:gap-14 md:py-20 lg:px-8 ${motoPhotos ? "md:grid-cols-[1fr_1fr]" : ""}`}>
            <div>
              <p className="label text-paper/70">{WHO_BUYS.label}</p>
              <h2 className="display mt-2 text-4xl sm:text-5xl md:text-7xl">{WHO_BUYS.title}</h2>
              <p className={`mt-5 text-lg leading-relaxed text-paper/85 md:text-xl ${motoPhotos ? "max-w-[52ch]" : "max-w-[62ch]"}`}>{WHO_BUYS.body}</p>
              {holder && <p className="mt-4 text-sm text-paper/70">{holder}</p>}
            </div>
            {motoPhotos && (
              <div className="hidden grid-cols-2 gap-3 md:grid">
                {(["moto_1", "moto_2"] as const).map((id) =>
                  hasPhoto(id) ? (
                    <div key={id} className="aspect-[4/5] overflow-hidden">
                      <SitePhoto id={id} sizes="(min-width: 1024px) 280px, 40vw" />
                    </div>
                  ) : null,
                )}
              </div>
            )}
          </div>
          {/* smartphone: fotografie verticali a scorrimento orizzontale con aggancio, una e mezza per schermo */}
          {rail.length > 0 && (
            <div className="md:hidden">
              <ul
                tabIndex={0}
                aria-label="Fotografie"
                className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {rail.map((id) => (
                  <li key={id} className="aspect-[4/5] w-[78%] shrink-0 snap-center overflow-hidden">
                    <SitePhoto id={id} sizes="78vw" />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* 3 · VANTAGGI. Smartphone: schede a due colonne con icona (l'ultima a tutta larghezza); da tablet l'elenco numerato. */}
        <section id="vantaggi" className="scroll-mt-20 bg-chalk">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[0.8fr_1.2fr] md:gap-14 md:py-20 lg:px-8">
            <div>
              <p className="label text-concrete">Vendita diretta</p>
              <h2 className="display mt-2 text-4xl sm:text-5xl md:text-6xl">Vendere direttamente a chi acquista.</h2>
              {hasPhoto("dettaglio") && (
                <div className="mt-6 hidden aspect-[4/5] max-w-xs overflow-hidden md:block">
                  <SitePhoto id="dettaglio" sizes="320px" />
                </div>
              )}
            </div>

            <ul className="grid grid-cols-2 gap-3 md:hidden">
              {ADVANTAGES.map((a, i) => {
                const Icon = ADVANTAGE_ICONS[i];
                return (
                  <li
                    key={a.title}
                    className={`flex flex-col gap-3 rounded-2xl bg-paper p-4 ring-1 ring-line ${i === ADVANTAGES.length - 1 && ADVANTAGES.length % 2 === 1 ? "col-span-2" : ""}`}
                  >
                    <Icon className="h-9 w-9 text-asphalt" />
                    <h3 className="text-base font-bold leading-snug">{a.title}</h3>
                    <p className="text-[0.95rem] leading-snug text-asphalt-soft">{a.body}</p>
                  </li>
                );
              })}
            </ul>

            <ul className="hidden border-t-2 border-asphalt md:block">
              {ADVANTAGES.map((a, i) => (
                <li key={a.title} className="grid grid-cols-[auto_1fr] gap-x-4 border-b border-line py-4">
                  <span className="label pt-1 text-concrete">0{i + 1}</span>
                  <div>
                    <h3 className="text-lg font-bold">{a.title}</h3>
                    <p className="mt-0.5 leading-relaxed text-asphalt-soft">{a.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 4 · COME FUNZIONA */}
        <section id="come-funziona" className="scroll-mt-20 bg-paper">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-20 lg:px-8">
            <p className="label text-concrete">Come funziona</p>
            <h2 className="display mt-2 text-4xl sm:text-5xl md:text-6xl">Tre passaggi, un solo acquirente.</h2>
            <ol className="mt-8 grid gap-4 md:grid-cols-3 md:gap-8">
              {STEPS.map((s, i) => {
                const Icon = PROCESS_ICONS[i];
                return (
                  <li key={s.title} className="border-t-2 border-asphalt pt-4">
                    <div className="flex items-center justify-between">
                      <span className="label text-concrete">0{i + 1}</span>
                      <Icon className="h-14 w-14 text-asphalt" />
                    </div>
                    <h3 className="display mt-3 text-2xl sm:text-3xl">{s.title}</h3>
                    <p className="mt-2 max-w-[44ch] leading-relaxed text-asphalt-soft">{s.body}</p>
                  </li>
                );
              })}
            </ol>
            <div id="process-cta" className="mt-10 max-w-sm">
              <TrackedLink href="/valuta" event="cta_click" label="come-funziona" className={`${btnPrimary} w-full justify-between`}>
                <span>{HERO.cta}</span>
                <span aria-hidden="true">→</span>
              </TrackedLink>
            </div>
          </div>
        </section>

        {/* 5 · TRASPARENZA: solo informazioni confermate (src/config/home-content.ts → TRANSPARENCY) */}
        {transparency.length > 0 && (
          <section id="trasparenza" className="scroll-mt-20 bg-chalk">
            <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[0.9fr_1.1fr] md:gap-14 md:py-20 lg:px-8">
              <div>
                <p className="label text-concrete">Trasparenza</p>
                <h2 className="display mt-2 text-4xl sm:text-5xl md:text-6xl">Prima di accettare.</h2>
                {hasPhoto("consegna") && (
                  <div className="-mx-4 mt-6 aspect-[4/3] overflow-hidden sm:mx-0 sm:max-w-md">
                    <SitePhoto id="consegna" sizes="(min-width: 640px) 448px, 100vw" />
                  </div>
                )}
              </div>
              <dl className="border-t-2 border-asphalt">
                {transparency.map((t) => (
                  <div key={t.q} className="border-b border-line py-4">
                    <dt className="font-bold">{t.q}</dt>
                    <dd className="mt-1 max-w-[56ch] leading-relaxed text-asphalt-soft">{t.answer}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>
        )}

        {/* 6 · FAQ */}
        <section id="domande" className="scroll-mt-20 bg-paper">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-20 lg:px-8">
            <p className="label text-concrete">Domande</p>
            <h2 className="display mt-2 text-4xl sm:text-5xl md:text-6xl">Prima di scriverci.</h2>
            <div className="mt-8 max-w-3xl border-t-2 border-asphalt">
              {FAQ.map((f) => (
                <details key={f.q} className="group border-b border-line">
                  <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-3 text-lg font-semibold [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <span aria-hidden className="shrink-0 font-sans text-2xl leading-none transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none">
                      +
                    </span>
                  </summary>
                  <p className="max-w-[62ch] pb-5 leading-relaxed text-asphalt-soft">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* spazio per partner: spento, non produce nulla (src/config/ads.ts) */}
        <AdSlot id="home-dopo-faq" />

        {/* 7 · CTA FINALE */}
        <section className="on-dark bg-asphalt text-paper">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-7 px-4 py-12 sm:px-6 md:flex-row md:items-center md:justify-between md:py-16 lg:px-8">
            <p className="display max-w-[14ch] text-5xl sm:text-6xl">Hai una moto da vendere?</p>
            <div id="final-cta" className="w-full md:w-auto md:min-w-[22rem]">
              <TrackedLink href="/valuta" event="cta_click" label="footer" className={`${btnPrimary} w-full justify-between`}>
                <span>{HERO.cta}</span>
                <span aria-hidden="true">→</span>
              </TrackedLink>
              <p className="label mt-3 text-[0.7rem] text-paper/80">{HERO.note}</p>
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
