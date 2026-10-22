import Link from "next/link";
import { BrandMark } from "./BrandMark";
import { BRAND, LEGAL, isPlaceholder } from "@/config/business";

/** Footer: mostra solo i dati aziendali già compilati; i segnaposto non compaiono mai in pagina. */
export function SiteFooter() {
  const company = [LEGAL.companyName, LEGAL.address].filter((v) => !isPlaceholder(v)).join(", ");
  const vat = isPlaceholder(LEGAL.vatNumber) ? null : LEGAL.vatNumber;
  return (
    <footer className="border-t border-line bg-paper pb-28 md:pb-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-start md:justify-between lg:px-8">
        <div>
          <BrandMark size="sm" />
          <p className="mt-4 max-w-[40ch] text-sm leading-relaxed text-concrete">
            Acquisto di scooter e moto usate da privati. {BRAND.area}.
          </p>
          {(company || vat) && (
            <p className="mt-2 text-sm text-concrete">
              {company}
              {company && vat ? ". " : ""}
              {vat ? `P.IVA ${vat}` : ""}
            </p>
          )}
        </div>
        <nav aria-label="Informazioni" className="flex flex-col gap-3 text-sm font-bold">
          <a href="#come-funziona" className="underline-offset-4 hover:underline">
            Come funziona
          </a>
          <Link href="/valuta" className="underline-offset-4 hover:underline">
            Valuta la tua moto
          </Link>
          <Link href="/privacy" className="underline-offset-4 hover:underline">
            Informativa privacy
          </Link>
        </nav>
      </div>
    </footer>
  );
}
