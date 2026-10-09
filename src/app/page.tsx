import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { StickyCta } from "@/components/StickyCta";
import { TrackedLink, TrackOnMount } from "@/components/Track";
import { BRAND, LEGAL } from "@/config/business";

const STEPS = [
  {
    title: "Ci racconti la moto",
    body: "Modello, anno, km e qualche foto. Dal telefono, in due minuti.",
  },
  {
    title: "Ti ricontattiamo",
    body: "Guardiamo i dati e, se la moto fa per noi, ti facciamo un'offerta.",
  },
  {
    title: "La vediamo e chiudiamo",
    body: "Fissiamo un appuntamento a Milano o in provincia. Se l'offerta ti va bene, la compriamo.",
  },
];

const FAQ = [
  {
    q: "Quanto costa la valutazione?",
    a: "Niente. Ci mandi i dati, noi ti diciamo se la moto ci interessa. Non ti impegni a vendere.",
  },
  {
    q: "Mi date subito un prezzo?",
    a: "No: prima controlliamo dati e foto, poi ti chiamiamo con un'offerta reale. Preferiamo non darti un numero che poi cambia.",
  },
  {
    q: "Comprate solo scooter?",
    a: "Soprattutto scooter da città, ma valutiamo anche altre moto. Se hai un modello diverso, mandacelo lo stesso.",
  },
  {
    q: "Dove operate?",
    a: `Per ora solo a ${BRAND.area}.`,
  },
];

const ctaPrimary =
  "inline-flex h-14 w-full items-center justify-center rounded-xl bg-plate px-8 text-lg font-bold text-paper transition-colors hover:bg-plate-deep active:bg-plate-deep sm:w-auto";

export default function Home() {
  return (
    <>
      <TrackOnMount event="landing_view" />

      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 pt-5 md:px-8">
        <BrandMark />
        <a href="#come-funziona" className="text-sm font-semibold underline-offset-4 hover:underline">
          Come funziona
        </a>
      </header>

      <main>
        {/* HERO */}
        <section className="mx-auto max-w-5xl px-5 pb-16 pt-14 md:px-8 md:pb-24 md:pt-24">
          <h1 className="display max-w-[11ch] text-[clamp(3.4rem,15vw,8.5rem)] text-asphalt">
            Vuoi vendere la tua moto?
          </h1>
          <p className="mt-6 max-w-[34ch] text-lg leading-snug text-asphalt-soft md:text-xl">
            Raccontaci che moto hai. La valutiamo e, se è interessante per noi, ti facciamo un&apos;offerta.
          </p>
          <div id="hero-cta" className="mt-9 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
            <TrackedLink href="/valuta" event="cta_click" label="hero" className={ctaPrimary}>
              Valuta la tua moto
            </TrackedLink>
            <a href="#come-funziona" className="text-center font-semibold underline underline-offset-4 sm:text-left">
              Come funziona?
            </a>
          </div>
          <p className="mt-6 text-sm text-concrete">Gratis e senza impegno. {BRAND.area}.</p>
        </section>

        {/* COME FUNZIONA — un percorso, quindi numerato */}
        <section id="come-funziona" className="scroll-mt-6 bg-asphalt text-paper">
          <div className="mx-auto max-w-5xl px-5 py-16 md:px-8 md:py-24">
            <h2 className="display text-5xl md:text-7xl">Come funziona</h2>
            <ol className="relative mt-12 max-w-xl">
              <span aria-hidden className="lane absolute bottom-6 left-[19px] top-6 w-1" />
              {STEPS.map((s, i) => (
                <li key={s.title} className="relative flex gap-6 pb-12 last:pb-0">
                  <span className="display z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-signal text-xl text-asphalt">
                    {i + 1}
                  </span>
                  <div className="pt-1">
                    <h3 className="text-xl font-bold">{s.title}</h3>
                    <p className="mt-2 max-w-[42ch] leading-relaxed text-paper/75">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* COSA COMPRIAMO */}
        <section className="mx-auto max-w-5xl px-5 py-16 md:px-8 md:py-24">
          <h2 className="display text-5xl md:text-7xl">Cosa compriamo</h2>
          <p className="mt-5 max-w-[46ch] text-lg leading-snug text-asphalt-soft">
            Scooter e moto in buone condizioni, in {BRAND.area}. Cerchiamo soprattutto:
          </p>
          <ul className="mt-8 flex flex-wrap gap-3">
            {["Honda SH", "Piaggio Liberty", "Kymco Agility"].map((m) => (
              <li key={m} className="rounded-full border-2 border-asphalt px-5 py-2.5 text-lg font-bold">
                {m}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-asphalt-soft">Hai un altro modello? Mandacelo lo stesso.</p>
        </section>

        {/* DOMANDE */}
        <section className="border-t border-line">
          <div className="mx-auto max-w-5xl px-5 py-16 md:px-8 md:py-24">
            <h2 className="display text-5xl md:text-7xl">Domande</h2>
            <div className="mt-10 max-w-2xl divide-y divide-line border-y border-line">
              {FAQ.map((f) => (
                <details key={f.q} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-bold">
                    {f.q}
                    <span
                      aria-hidden
                      className="text-2xl leading-none text-plate transition-transform duration-200 group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="mt-3 max-w-[60ch] leading-relaxed text-asphalt-soft">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA FINALE */}
        <section className="bg-plate text-paper">
          <div className="mx-auto max-w-5xl px-5 py-16 md:px-8 md:py-20">
            <p className="display max-w-[14ch] text-5xl md:text-7xl">Due minuti dal telefono.</p>
            <TrackedLink
              href="/valuta"
              event="cta_click"
              label="footer"
              className="mt-8 inline-flex h-14 w-full items-center justify-center rounded-xl bg-paper px-8 text-lg font-bold text-plate transition-colors hover:bg-signal hover:text-asphalt sm:w-auto"
            >
              Valuta la tua moto
            </TrackedLink>
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-5xl px-5 pb-28 pt-10 text-sm text-concrete md:px-8 md:pb-10">
        <BrandMark />
        <p className="mt-5">
          {LEGAL.companyName}, {LEGAL.address}. P.IVA {LEGAL.vatNumber}
        </p>
        <p className="mt-2">
          <Link href="/privacy" className="underline underline-offset-4">
            Informativa privacy
          </Link>
        </p>
      </footer>

      <StickyCta watchId="hero-cta" />
    </>
  );
}
