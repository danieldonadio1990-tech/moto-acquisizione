import { BrandMark } from "./BrandMark";
import { TrackedLink } from "./Track";
import { btnPrimarySm } from "./buttons";
import { PhoneButton, WhatsAppButton } from "./ContactButtons";

/** Intestazione del sito: logo, link essenziali e CTA. Su telefono stretto la CTA resta nella barra in basso. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <BrandMark size="sm" />
        <nav aria-label="Principale" className="flex items-center gap-5">
          <a href="#come-funziona" className="hidden whitespace-nowrap text-sm font-bold underline-offset-4 hover:underline md:inline">
            Come funziona
          </a>
          <a href="#mezzi" className="hidden whitespace-nowrap text-sm font-bold underline-offset-4 hover:underline 2xl:inline">
            Quali moto
          </a>
          {/* contatti diretti: solo da schermi larghi e solo se i numeri sono configurati */}
          <div className="hidden items-center gap-2 lg:flex">
            <PhoneButton size="sm" numberOnly />
            <WhatsAppButton from="header" size="sm" />
          </div>
          <TrackedLink
            href="/valuta"
            event="cta_click"
            label="header"
            ariaLabel="Valuta la tua moto"
            className={`${btnPrimarySm} hidden whitespace-nowrap min-[380px]:inline-flex`}
          >
            <span className="sm:hidden">Valuta</span>
            <span className="hidden sm:inline">Valuta la tua moto</span>
          </TrackedLink>
        </nav>
      </div>
    </header>
  );
}
