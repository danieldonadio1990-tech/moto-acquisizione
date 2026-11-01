import Link from "next/link";
import { BrandMark } from "./BrandMark";
import { TrackedLink } from "./Track";
import { btnPrimarySm } from "./buttons";
import { PhoneButton, WhatsAppButton } from "./ContactButtons";
import { MobileMenu } from "./MobileMenu";

/** Intestazione del sito: logo, CTA sempre visibile e, su smartphone, menu a tendina; da tablet in su i link sono in barra. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-4 sm:gap-3 sm:px-6 lg:px-8">
        <BrandMark size="sm" />
        <nav aria-label="Principale" className="flex items-center gap-2 sm:gap-5">
          <Link href="/#come-funziona" className="hidden min-h-11 items-center whitespace-nowrap text-sm font-bold underline-offset-4 hover:underline md:inline-flex">
            Come funziona
          </Link>
          <Link href="/#domande" className="hidden min-h-11 items-center whitespace-nowrap text-sm font-bold underline-offset-4 hover:underline md:inline-flex">
            Domande
          </Link>
          {/* contatti diretti: solo da schermi larghi e solo se i numeri sono configurati */}
          <div className="hidden items-center gap-2 lg:flex">
            <PhoneButton size="sm" numberOnly />
            <WhatsAppButton from="header" size="sm" />
          </div>
          <TrackedLink
            href="/valuta"
            event="cta_click"
            label="header"
            ariaLabel="Vendi la tua moto"
            className={`${btnPrimarySm} inline-flex whitespace-nowrap`}
          >
            <span className="sm:hidden">Vendi</span>
            <span className="hidden sm:inline">Vendi la tua moto</span>
          </TrackedLink>
          <MobileMenu />
        </nav>
      </div>
    </header>
  );
}
