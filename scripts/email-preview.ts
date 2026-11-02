/**
 * Anteprima dell'email di conferma al cliente: scrive i file HTML e testo in una cartella, SENZA inviare nulla.
 *   npm run email:preview -- [cartella]      (predefinita: ./email-preview, ignorata da git)
 * Si aprono nel browser; i dati mostrati sono di esempio.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildCustomerEmail } from "../src/modules/notifications/customer-email";
import { BRAND, CONTACTS, isPlaceholder } from "../src/config/business";
import { RESPONSE_TIME } from "../src/config/home-content";

const out = path.resolve(process.argv[2] ?? "email-preview");
mkdirSync(out, { recursive: true });
const origin = process.env.PREVIEW_ORIGIN?.trim() || "https://compriamo-moto.it";
const ctx = {
  siteOrigin: origin,
  brandName: BRAND.name,
  area: BRAND.area,
  responseTime: RESPONSE_TIME,
  contactEmail: isPlaceholder(CONTACTS.email) ? undefined : CONTACTS.email,
};
const samples = {
  completa: { firstName: "Mario", code: "M7K2QX", mileage: 18500, moto: { brand: "Honda", model: "SH", version: null, year: 2019, displacement: 125 } },
  senza_dati_moto: { firstName: "Giulia", code: "A1B2C3" },
};
for (const [name, input] of Object.entries(samples)) {
  const m = buildCustomerEmail(input, ctx);
  writeFileSync(path.join(out, `${name}.html`), m.html);
  writeFileSync(path.join(out, `${name}.txt`), `Oggetto: ${m.subject}\n\n${m.text}\n`);
}
console.log(`Anteprime scritte in ${out} (nessuna email inviata). Il logo viene caricato da ${origin}.`);
