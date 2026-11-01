import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { SitePhoto, hasPhoto } from "@/components/SitePhoto";
import { PhoneButton, WhatsAppButton } from "@/components/ContactButtons";
import { AdSlot } from "@/components/AdSlot";
import { StickyCta } from "@/components/StickyCta";
import { TrackedLink, TrackOnMount } from "@/components/Track";
import { ProcessDeal, ProcessProposal, ProcessTell } from "@/components/ProcessIcons";
import { btnPrimary } from "@/components/buttons";
import { LEGAL, contactLinks, isPlaceholder } from "@/config/business";
import { isGenerated } from "@/config/images";
import { ADVANTAGES, FAQ, HERO, STEPS, TRANSPARENCY, WHO_BUYS } from "@/config/home-content";

const PROCESS_ICONS = [ProcessTell, ProcessProposal, ProcessDeal];

export default function Home() {
  const transparency = TRANSPARENCY.filter((t): t is { q: string; answer: string } => t.answer !== null);
  const holder = isPlaceholder(LEGAL.companyName) ? null : LEGAL.companyName;
  const motoPhotos = hasPhoto("moto_1") || hasPhoto("moto_2");
  return (
    <>
      <TrackOnMount event="landing_view" />
      <SiteHeader />

      <main>
        {/* 1 · HERO: titolo, sottotitolo, un solo pulsante; la fotografia compare solo se presente in src/config/images.ts */}
        <section className="bg-chalk">
          <div className="mx-auto grid max-w-6xl items-end gap-8 px-4 pb-10 pt-8 sm:px-6 md:grid-cols-[1.25fr_0.75fr] md:gap-14 md:pb-14 md:pt-14 lg:px-8">
            <div className="min-w-0">
              <p className="label text-concrete">{HERO.label}</p>
              <h1 className="display mt-4 text-[clamp(3.4rem,15vw,6.6rem)] font-black leading-[0.9]">{HERO.title}</h1>
              <p className="mt-5 max-w-[46ch] text-lg leading-relaxed text-asphalt-soft">{HERO.subtitle}</p>
            </div>
            <div id="hero-cta" className="min-w-0 md:pb-2">
              <TrackedLink href="/valuta" event="cta_click" label="hero" className={`${btnPrimary} w-full justify-between`}>
                <span>{HERO.cta}</span>
                <span aria-hidden="true">→</span>
              </TrackedLink>
              <p className="label mt-3 text-[0.7rem] text-concrete">{HERO.note}</p>
            </div>
          </div>

          {hasPhoto("hero") && (
            <figure className="mx-auto max-w-6xl px-4 pb-10 sm:px-6 md:pb-16 lg:px-8">
              <div className="aspect-[16/10] w-full overflow-hidden md:aspect-[21/8]">
                <SitePhoto id="hero" priority />
              </div>
              {isGenerated("hero") && <figcaption className="mt-2 text-xs font-semibold text-concrete">Immagine illustrativa</figcaption>}
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
              <div className="grid grid-cols-2 gap-3">
                {(["moto_1", "moto_2"] as const).map((id) =>
                  hasPhoto(id) ? (
                    <div key={id} className="aspect-[3/4] overflow-hidden">
                      <SitePhoto id={id} />
                    </div>
                  ) : null,
                )}
              </div>
            )}
          </div>
        </section>

        {/* 3 · VANTAGGI della vendita diretta */}
        <section className="bg-chalk">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[0.8fr_1.2fr] md:gap-14 md:py-20 lg:px-8">
            <div>
              <p className="label text-concrete">Vendita diretta</p>
              <h2 className="display mt-2 text-4xl sm:text-5xl md:text-6xl">Vendere direttamente a chi acquista.</h2>
              {hasPhoto("dettaglio") && (
                <div className="mt-6 hidden aspect-square max-w-xs overflow-hidden md:block">
                  <SitePhoto id="dettaglio" />
                </div>
              )}
            </div>
            <ul className="border-t-2 border-asphalt">
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
                  <div className="mt-6 aspect-[4/3] max-w-md overflow-hidden">
                    <SitePhoto id="consegna" />
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
