import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { SitePhoto, hasPhoto } from "@/components/SitePhoto";
import { PhoneButton, WhatsAppButton } from "@/components/ContactButtons";
import { StickyCta } from "@/components/StickyCta";
import { TrackedLink, TrackOnMount } from "@/components/Track";
import { IconArrowRight, IconCheck, IconClipboard, IconKey, IconPlus, IconSearch } from "@/components/Icons";
import { btnOutline, btnPrimary } from "@/components/buttons";
import { BRAND, contactLinks } from "@/config/business";
import { isGenerated, type ImageKey } from "@/config/images";

const STEPS = [
  {
    title: "Ci racconti che mezzo hai",
    body: "Marca, modello, anno e chilometri. Le foto sono facoltative.",
    Icon: IconClipboard,
  },
  {
    title: "Valutiamo la richiesta e ti ricontattiamo",
    body: "Guardiamo i dati e, se il mezzo è interessante per noi, ti facciamo un'offerta.",
    Icon: IconSearch,
  },
  {
    title: "Se troviamo un accordo, concludiamo l'acquisto",
    body: "Fissiamo un appuntamento a Milano o in provincia per vedere il mezzo.",
    Icon: IconKey,
  },
];

const MODELS: { id: ImageKey; brand: string; name: string; panel: string }[] = [
  { id: "honda_sh", brand: "Honda", name: "SH", panel: "bg-plate text-paper" },
  { id: "piaggio_liberty", brand: "Piaggio", name: "Liberty", panel: "bg-asphalt text-paper" },
  { id: "kymco_agility", brand: "Kymco", name: "Agility", panel: "bg-asphalt-soft text-paper" },
];

/** Cosa chiediamo nel modulo: composizione tipografica dell'hero finché non c'è la fotografia. */
const NEEDED = ["Marca e modello", "Anno e chilometri", "Le condizioni del mezzo", "I tuoi contatti", "Qualche foto (facoltativa)"];

const HERO_POINTS = ["Richiesta online in pochi minuti", "Foto facoltative", "Decidi tu se vendere"];

const BENEFITS = [
  { title: "Gratis", body: "Inviare la richiesta non costa nulla." },
  { title: "Senza impegno", body: "Nessun obbligo di vendere, anche dopo la nostra offerta." },
  { title: "Semplice", body: "Compili un modulo: ti ricontattiamo noi come preferisci." },
];

const EASY = [
  "Invii la richiesta online, dal telefono o dal computer.",
  "Ci dai solo le informazioni principali del mezzo.",
  "Le foto sono facoltative: puoi inviare la richiesta anche senza.",
  "Non serve WhatsApp per inviare la richiesta.",
];

const FAQ = [
  {
    q: "Quanto costa la valutazione?",
    a: "Niente. Ci mandi i dati, noi ti diciamo se il mezzo ci interessa. Non ti impegni a vendere.",
  },
  {
    q: "Mi date subito un prezzo?",
    a: "No: prima controlliamo dati e foto, poi ti contattiamo con un'offerta reale. Preferiamo non darti un numero che poi cambia.",
  },
  {
    q: "Comprate solo scooter?",
    a: "Soprattutto scooter da città, ma valutiamo anche altre moto. Se hai un modello diverso, mandacelo lo stesso.",
  },
  {
    q: "Le foto sono obbligatorie?",
    a: "No. Puoi inviare la richiesta anche senza foto: con le foto possiamo però darti una risposta più precisa.",
  },
  {
    q: "Devo usare WhatsApp?",
    a: "No. Per inviare la richiesta ti bastano i moduli del sito. Ci indichi tu come preferisci essere ricontattato.",
  },
  {
    q: "Dove operate?",
    a: `Per ora solo a ${BRAND.area}.`,
  },
];

export default function Home() {
  return (
    <>
      <TrackOnMount event="landing_view" />
      <SiteHeader />

      <main>
        {/* HERO */}
        <section className="on-dark bg-asphalt text-paper">
          <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 pb-12 pt-10 sm:px-6 md:grid-cols-[1.1fr_0.9fr] md:gap-12 md:pb-20 md:pt-16 lg:px-8">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full bg-asphalt-raised px-3.5 py-1.5 text-sm font-bold text-paper/90 ring-1 ring-paper/15">
                <span aria-hidden className="h-2 w-2 rounded-full bg-signal" />
                Scooter e moto usate da privati · {BRAND.area}
              </p>
              <h1 className="display mt-5 text-[clamp(2.7rem,9.5vw,5.4rem)]">
                Vuoi vendere il tuo scooter{" "}
                <span className="text-signal">senza perdere tempo?</span>
              </h1>
              <p className="mt-5 max-w-[40ch] text-lg leading-snug text-paper/80 md:text-xl">
                Raccontaci che mezzo hai. Se è interessante per noi, ti faremo un&apos;offerta.
              </p>
              <div id="hero-cta" className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
                <TrackedLink href="/valuta" event="cta_click" label="hero" className={`${btnPrimary} w-full sm:w-auto`}>
                  Valuta la tua moto
                  <IconArrowRight className="h-5 w-5" />
                </TrackedLink>
                <p className="text-base font-bold text-paper">Gratis e senza impegno</p>
              </div>
              <ul className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-paper/85">
                {HERO_POINTS.map((t) => (
                  <li key={t} className="flex items-center gap-2">
                    <IconCheck className="h-4 w-4 shrink-0 text-signal" />
                    {t}
                  </li>
                ))}
              </ul>
              <p className="mt-5 max-w-[48ch] text-sm leading-relaxed text-paper/70">
                Ci occupiamo soprattutto di scooter da città, ma puoi inviare anche la richiesta per un&apos;altra moto.
              </p>
            </div>
            <div className="md:order-last">
              {hasPhoto("hero") ? (
                <figure className="overflow-hidden rounded-3xl ring-1 ring-paper/10">
                  <div className="aspect-[4/3] w-full">
                    <SitePhoto id="hero" priority />
                  </div>
                  {isGenerated("hero") && (
                    <figcaption className="bg-asphalt-raised px-4 py-2 text-xs font-semibold text-paper/75">
                      Immagine illustrativa
                    </figcaption>
                  )}
                </figure>
              ) : (
                <div className="overflow-hidden rounded-3xl bg-asphalt-raised ring-1 ring-paper/10">
                  <span aria-hidden className="block h-2 w-full bg-signal" />
                  <div className="p-6 sm:p-8">
                  <p className="text-sm font-bold uppercase tracking-wider text-signal">Cosa ci serve</p>
                  <p className="display mt-2 text-3xl sm:text-4xl">Pochi dati sul tuo mezzo.</p>
                  <ul className="mt-6 space-y-3">
                    {NEEDED.map((t) => (
                      <li key={t} className="flex items-center gap-3 text-lg">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-signal text-asphalt">
                          <IconCheck className="h-3.5 w-3.5" />
                        </span>
                        {t}
                      </li>
                    ))}
                  </ul>
                  <span aria-hidden className="lane-h mt-8 block h-1 w-full" />
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* VANTAGGI */}
        <section aria-label="Vantaggi" className="bg-signal text-asphalt">
          <ul className="mx-auto grid max-w-6xl gap-4 px-4 py-6 sm:px-6 md:grid-cols-3 md:gap-8 md:py-7 lg:px-8">
            {BENEFITS.map((b) => (
              <li key={b.title} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-asphalt text-signal">
                  <IconCheck className="h-3.5 w-3.5" />
                </span>
                <p className="leading-snug">
                  <span className="display block text-2xl">{b.title}</span>
                  <span className="font-semibold">{b.body}</span>
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* COME FUNZIONA */}
        <section id="come-funziona" className="scroll-mt-20 bg-chalk">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 md:py-20 lg:px-8">
            <p className="text-sm font-bold uppercase tracking-widest text-plate">Tre passaggi</p>
            <h2 className="display mt-2 text-4xl sm:text-5xl md:text-6xl">Come funziona</h2>
            <ol className="mt-12 grid gap-8 md:grid-cols-3 md:gap-6">
              {STEPS.map(({ title, body, Icon }, i) => (
                <li key={title} className="relative rounded-2xl border-t-4 border-signal bg-paper p-6 pt-8 shadow-sm ring-1 ring-line">
                  <span className="display absolute -top-5 left-6 flex h-11 min-w-11 items-center justify-center rounded-full bg-signal px-3 text-2xl text-asphalt">
                    {i + 1}
                  </span>
                  <Icon className="mt-3 h-9 w-9 text-plate" />
                  <h3 className="mt-4 text-xl font-bold leading-snug">{title}</h3>
                  <p className="mt-2 leading-relaxed text-asphalt-soft">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* QUALE MEZZO */}
        <section id="mezzi" className="scroll-mt-20 bg-paper">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 md:py-20 lg:px-8">
            <p className="text-sm font-bold uppercase tracking-widest text-plate">Modelli</p>
            <h2 className="display mt-2 text-4xl sm:text-5xl md:text-6xl">Quale mezzo vuoi vendere?</h2>
            <p className="mt-4 max-w-[54ch] text-lg leading-snug text-asphalt-soft">
              Qualche esempio di scooter da città. Se il tuo è diverso, mandacelo lo stesso.
            </p>
            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {MODELS.map((m) => (
                <li key={m.id} className="overflow-hidden rounded-2xl bg-chalk ring-1 ring-line">
                  <div className="aspect-[4/3] w-full">
                    {hasPhoto(m.id) ? (
                      <SitePhoto id={m.id} />
                    ) : (
                      <div className={`flex h-full w-full flex-col justify-between border-b-4 border-signal p-5 ${m.panel}`}>
                        <span className="text-sm font-bold uppercase tracking-widest text-signal">{m.brand}</span>
                        <span className="display text-[clamp(3.5rem,9vw,5rem)] leading-none">{m.name}</span>
                      </div>
                    )}
                  </div>
                  <div className="p-5">
                    {hasPhoto(m.id) ? (
                      <>
                        <p className="text-sm font-bold uppercase tracking-wider text-concrete">{m.brand}</p>
                        <p className="display text-3xl">{m.name}</p>
                      </>
                    ) : (
                      <p className="font-semibold text-asphalt-soft">Scooter da città</p>
                    )}
                    <TrackedLink
                      href="/valuta"
                      event="cta_click"
                      label={`modello-${m.id}`}
                      className="mt-3 inline-flex min-h-11 items-center gap-2 font-extrabold text-plate underline-offset-4 hover:underline"
                    >
                      Valuta il tuo {m.name}
                      <IconArrowRight className="h-4 w-4" />
                    </TrackedLink>
                  </div>
                </li>
              ))}
              <li className="flex flex-col justify-between rounded-2xl border-2 border-dashed border-asphalt-soft/70 bg-paper p-5">
                <div>
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-asphalt text-signal">
                    <IconPlus className="h-6 w-6" />
                  </span>
                  <p className="display mt-4 text-3xl">Un altro mezzo?</p>
                  <p className="mt-2 leading-relaxed text-asphalt-soft">
                    Altre marche e altri modelli: scrivili a mano nel modulo.
                  </p>
                </div>
                <TrackedLink href="/valuta" event="cta_click" label="altro-mezzo" className={`${btnOutline} mt-6 w-full px-4 text-center`}>
                  Valuta il mezzo
                </TrackedLink>
              </li>
            </ul>
          </div>
        </section>

        {/* SEMPLICITÀ */}
        <section className="on-dark bg-asphalt text-paper">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 md:py-20 lg:px-8">
            <div>
              <p className="text-sm font-bold uppercase tracking-widest text-signal">Per chi vende</p>
              <h2 className="display mt-2 text-4xl sm:text-5xl md:text-6xl">Niente annunci, niente giri a vuoto.</h2>
              <p className="mt-5 max-w-[42ch] text-lg leading-snug text-paper/75">
                Una richiesta semplice, fatta con calma quando vuoi tu.
              </p>
            </div>
            <ul className="space-y-4">
              {EASY.map((t) => (
                <li key={t} className="flex items-start gap-4 rounded-2xl bg-asphalt-raised p-5 ring-1 ring-paper/10">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-signal text-asphalt">
                    <IconCheck className="h-4 w-4" />
                  </span>
                  <span className="text-lg leading-snug">{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* FAQ */}
        <section id="domande" className="scroll-mt-20 bg-chalk">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 md:py-20 lg:px-8">
            <p className="text-sm font-bold uppercase tracking-widest text-plate">FAQ</p>
            <h2 className="display mt-2 text-4xl sm:text-5xl md:text-6xl">Domande</h2>
            <div className="mt-10 max-w-3xl space-y-3">
              {FAQ.map((f) => (
                <details key={f.q} className="group rounded-2xl bg-paper ring-1 ring-line open:shadow-sm">
                  <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-lg font-bold">
                    {f.q}
                    <span
                      aria-hidden
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-chalk text-2xl leading-none text-plate transition-transform duration-200 group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="px-5 pb-5 leading-relaxed text-asphalt-soft">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA FINALE */}
        <section className="on-dark bg-plate text-paper">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-7 px-4 py-14 sm:px-6 md:flex-row md:items-center md:justify-between md:py-16 lg:px-8">
            <p className="display max-w-[20ch] text-4xl sm:text-5xl md:text-6xl">Hai uno scooter da vendere?</p>
            <div id="final-cta" className="w-full md:w-auto">
              <TrackedLink href="/valuta" event="cta_click" label="footer" className={`${btnPrimary} w-full md:w-auto`}>
                Valuta la tua moto
                <IconArrowRight className="h-5 w-5" />
              </TrackedLink>
              <p className="mt-3 text-sm font-semibold text-paper/80">Gratis e senza impegno · {BRAND.area}</p>
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
