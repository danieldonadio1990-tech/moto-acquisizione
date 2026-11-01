import { BRAND, CONTACTS, isPlaceholder, siteUrl } from "@/config/business";

/** Dati strutturati: solo ciò che il sito già pubblica (nome, sito, logo, email, area). Nessun indirizzo come punto vendita. */
function organizationJsonLd() {
  const base = siteUrl();
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Organization",
    name: BRAND.name,
    url: base.origin,
    logo: new URL("/icons/icon-512.png", base).toString(),
    description: BRAND.description,
    areaServed: BRAND.area,
    ...(isPlaceholder(CONTACTS.email) ? {} : { email: CONTACTS.email }),
  }).replace(/</g, "\\u003c");
}

export function OrganizationJsonLd() {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: organizationJsonLd() }} />;
}
