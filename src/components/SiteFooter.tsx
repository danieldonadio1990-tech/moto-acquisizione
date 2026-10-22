import Link from "next/link";
import { BrandMark } from "./BrandMark";
import { BRAND, CONTACTS, LEGAL, contactLinks, isPlaceholder } from "@/config/business";
import { hasGeneratedImages, photoCredits } from "@/config/images";

/** Footer: mostra solo i dati aziendali già compilati; i segnaposto non compaiono mai in pagina. */
export function SiteFooter() {
  const company = [LEGAL.companyName, LEGAL.address].filter((v) => !isPlaceholder(v)).join(", ");
  const vat = isPlaceholder(LEGAL.vatNumber) ? null : LEGAL.vatNumber;
  const contacts = contactLinks();
  const email = isPlaceholder(CONTACTS.email) ? null : CONTACTS.email;
  const credits = photoCredits();
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
        {(contacts.whatsapp || contacts.phone || email) && (
          <div className="flex flex-col gap-3 text-sm font-bold">
            <p className="text-xs uppercase tracking-wider text-concrete">Contatti</p>
            {contacts.phone && (
              <a href={contacts.phone.href} className="underline-offset-4 hover:underline">
                Telefono {contacts.phone.label}
              </a>
            )}
            {contacts.whatsapp && (
              <a href={contacts.whatsapp} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">
                WhatsApp
              </a>
            )}
            {email && (
              <a href={`mailto:${email}`} className="underline-offset-4 hover:underline">
                {email}
              </a>
            )}
          </div>
        )}
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
      {(credits.length > 0 || hasGeneratedImages()) && (
        <div className="mx-auto max-w-6xl px-4 pb-6 text-xs text-concrete sm:px-6 lg:px-8">
          {credits.length > 0 && <p className="font-bold">Crediti fotografici</p>}
          {hasGeneratedImages() && <p>Immagini illustrative generate digitalmente: non sono fotografie di luoghi o modelli reali.</p>}
          <ul className="mt-1 space-y-0.5">
            {credits.map(({ id, credit }) => (
              <li key={id}>
                {credit.author} — {credit.license}
                {credit.url ? (
                  <>
                    {" "}
                    (<a href={credit.url} className="underline" target="_blank" rel="noopener noreferrer">fonte</a>)
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </footer>
  );
}
