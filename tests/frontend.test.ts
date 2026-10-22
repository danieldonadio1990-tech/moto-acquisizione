/** Frontend pubblico: marche del modulo, percorso "Altro", e nessun link WhatsApp verso numeri di esempio. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { canonicalBrand, listBrands, listModels, MAIN_BRANDS, OTHER_MODEL_ID } from "@/modules/catalog";
import { CATALOG } from "@/modules/catalog/data";
import {
  BRAND,
  buildContactLinks,
  CONTACTS,
  contactLinks,
  hasPhone,
  hasWhatsapp,
  isPlaceholder,
  missingBusinessData,
  phoneTelHref,
  whatsappLink,
  WHATSAPP_MESSAGE,
} from "@/config/business";
import { contactStepSchema, leadSubmissionSchema, motorcycleStepSchema } from "@/modules/leads/validation";

const EXPECTED = ["Honda", "Piaggio", "Yamaha", "Kymco", "SYM", "BMW", "Suzuki", "Kawasaki", "Aprilia", "Ducati"];

test("marche: le 10 principali, nell'ordine richiesto e senza duplicati", () => {
  assert.deepEqual([...MAIN_BRANDS], EXPECTED);
  assert.deepEqual(listBrands(), EXPECTED);
  assert.equal(new Set(listBrands().map((b) => b.toLowerCase())).size, 10);
  assert.ok(!listBrands().some((b) => /^altro$/i.test(b)), '"Altro" è una voce a parte, non una marca');
});

test("marche: unica marca del catalogo fuori dalle 10 principali è Vespa (raggiungibile come \"Altro\")", () => {
  for (const b of MAIN_BRANDS) assert.ok(Array.isArray(listModels(b)));
  const outside = [...new Set(CATALOG.map((m) => m.brand))].filter((b) => !(MAIN_BRANDS as readonly string[]).includes(b));
  assert.deepEqual(outside, ["Vespa"]);
});

test('marca scritta a mano: se coincide con una principale, si usa il nome canonico', () => {
  assert.equal(canonicalBrand("  ducati "), "Ducati");
  assert.equal(canonicalBrand("bmw"), "BMW");
  assert.equal(canonicalBrand("Triumph"), "Triumph");
  assert.equal(canonicalBrand("Royal   Enfield"), "Royal Enfield");
});

const moto = (over: Record<string, unknown>) => ({ brand: "Triumph", modelId: OTHER_MODEL_ID, year: "2018", ...over });

test('"Altro": marca e modello liberi sono accettati, senza modello a catalogo', () => {
  const r = motorcycleStepSchema.safeParse(moto({ modelOther: "Street Triple", displacement: "765" }));
  assert.ok(r.success);
});

test('"Altro": modello libero vuoto → errore chiaro; cilindrata facoltativa', () => {
  const r = motorcycleStepSchema.safeParse(moto({ modelOther: "" }));
  assert.ok(!r.success);
  assert.match(JSON.stringify(r.error.issues), /Scrivi il modello/);
  assert.ok(motorcycleStepSchema.safeParse(moto({ modelOther: "Monster" })).success);
});

test('"Altro": marca vuota → rifiutata', () => {
  assert.ok(!motorcycleStepSchema.safeParse(moto({ brand: "", modelOther: "X" })).success);
});

test('richiesta completa con "Altro" valida e consenso privacy ancora obbligatorio', () => {
  const base = {
    submissionId: "3f2b8c1e-5d6a-4f7b-9c1d-2e3f4a5b6c7d",
    motorcycle: { brand: "Triumph", modelId: OTHER_MODEL_ID, modelOther: "Street Triple", year: 2018 },
    mileage: 12000,
    condition: { isRunning: true, accident: "no", mechanicalIssues: "no", maintenance: "yes" },
    contact: {
      firstName: "Mario", lastName: "Verdi", phone: "333 123 4567", email: "m@example.com", city: "Milano",
      preferredContact: "phone", privacyConsent: true,
    },
  };
  assert.ok(leadSubmissionSchema.safeParse(base).success);
  assert.ok(!leadSubmissionSchema.safeParse({ ...base, contact: { ...base.contact, privacyConsent: false } }).success);
  assert.ok(!contactStepSchema.safeParse({ ...base.contact, privacyConsent: false }).success);
});

// ---- WhatsApp -------------------------------------------------------------------------------------------------------
test("WhatsApp: con il segnaposto non esiste alcun numero né link aziendale", () => {
  assert.ok(isPlaceholder(CONTACTS.whatsapp));
  assert.equal(hasWhatsapp(), false);
  assert.equal(whatsappLink(), null);
  assert.equal(whatsappLink("Ciao"), null);
  assert.equal(whatsappLink("Ciao", CONTACTS.whatsapp), null);
  assert.ok(missingBusinessData().some((m) => m.startsWith("CONTACTS.whatsapp")));
});

test("WhatsApp: mai un link dalle cifre di un segnaposto o da numeri non validi", () => {
  assert.equal(whatsappLink("x", "[DA COMPLETARE: numero WhatsApp, es. 393331234567]"), null);
  assert.equal(whatsappLink("x", "abc"), null);
  assert.equal(whatsappLink("x", "123"), null);
});

test("WhatsApp: verso il numero di un cliente (backoffice) il link è corretto", () => {
  const url = whatsappLink("Ciao Mario", "+393381112233");
  assert.equal(url, "https://wa.me/393381112233?text=Ciao%20Mario");
});

/** Percorsi dei sorgenti dell'interfaccia (esclusi test). */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const f = path.join(dir, n);
    return statSync(f).isDirectory() ? sources(f) : /\.(tsx?|css)$/.test(n) ? [f] : [];
  });
}

test("WhatsApp: nessun sorgente contiene un link wa.me con numero scritto a mano", () => {
  const offenders = sources("src").filter((f) => /wa\.me\/\d{6,}/.test(readFileSync(f, "utf8")));
  assert.deepEqual(offenders, []);
});

test("WhatsApp: nell'interfaccia il link è sempre generato con whatsappLink() e il pulsante pubblico dipende dal numero", () => {
  const done = readFileSync("src/modules/funnel/steps/DoneStep.tsx", "utf8");
  assert.match(done, /whatsappLink\(/);
  assert.match(done, /\{waHref\s*&&\s*\(/);
  const funnel = readFileSync("src/modules/funnel/Funnel.tsx", "utf8");
  assert.match(funnel, /hasWhatsapp\(\)\s*\?/);
  assert.match(readFileSync("src/modules/funnel/steps/PhotoStep.tsx", "utf8"), /facoltative/);
});

test("brand: nome commerciale impostato, nessun segnaposto [BRAND] nei sorgenti pubblici", () => {
  assert.equal(BRAND.name, "Compro Moto");
  const offenders = sources("src").filter((f) => readFileSync(f, "utf8").includes("[BRAND]"));
  assert.deepEqual(offenders, []);
});

test("Vespa non è una marca separata: nel modulo resta sotto Piaggio con suggerimento per il modello scritto a mano", () => {
  assert.ok(!(MAIN_BRANDS as readonly string[]).includes("Vespa"));
  const step = readFileSync("src/modules/funnel/steps/MotoStep.tsx", "utf8");
  assert.match(step, /moto\.brand === "Piaggio"[^\n]*Vespa/);
});

// ---- Redesign: home, immagini segnaposto, footer ------------------------------------------------------------------------
test("home: messaggio principale, CTA e sezioni previste, senza promesse non verificate", () => {
  const home = readFileSync("src/app/page.tsx", "utf8");
  assert.match(home, /Vuoi vendere il tuo scooter senza perdere tempo\?/);
  assert.match(home, /Raccontaci che mezzo hai\. Se è interessante per noi, ti faremo un&apos;offerta\./);
  assert.match(home, /Valuta la tua moto/);
  for (const id of ["come-funziona", "mezzi", "domande"]) assert.match(home, new RegExp(`id="${id}"`));
  for (const m of ["Honda", "Piaggio", "Liberty", "Agility"]) assert.match(home, new RegExp(m));
  // niente promesse di tempi, garanzie, recensioni o volumi
  assert.doesNotMatch(home, /garantit|in giornata|entro \d|24 ?ore|subito il pagamento|recension|testimonianz|clienti soddisfatti|\d+ moto acquistate/i);
});

test("immagini: nessuna illustrazione o immagine sintetica; foto solo se vere, esistenti e con credito", () => {
  const cfg = readFileSync("src/config/images.ts", "utf8");
  assert.match(cfg, /src: null/);
  for (const m of cfg.matchAll(/src:\s*"([^"]+)"/g)) assert.ok(statSync(path.join("public", m[1])).isFile(), `manca ${m[1]}`);
  assert.throws(() => statSync("src/components/illustrations.tsx"), "le illustrazioni degli scooter non devono più esistere");
  const offenders = sources("src").filter((f) => /UrbanScene|<Scooter|illustrations/.test(readFileSync(f, "utf8")));
  assert.deepEqual(offenders, []);
  // nessun file immagine di scooter stilizzati in public/ (solo logo, icone e foto)
  const pub = readdirSync("public", { recursive: true }).map(String);
  assert.deepEqual(pub.filter((f) => /scooter|segnaposto|illustraz/i.test(f)), []);
});

test("footer: i dati aziendali segnaposto non vengono mostrati al pubblico", () => {
  const footer = readFileSync("src/components/SiteFooter.tsx", "utf8");
  assert.match(footer, /isPlaceholder\(/);
  assert.doesNotMatch(footer, /DA COMPLETARE/);
});

test("palette: antracite, giallo segnale, blu targa, grigio chiaro", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  for (const c of ["#20252b", "#f5c928", "#1a3fa8", "#f0f1f2"]) assert.ok(css.toLowerCase().includes(c), c);
});

// ---- Contatti: WhatsApp e telefono separati ----------------------------------------------------------------------------
test("contatti: con i segnaposto non c'è nessun pulsante né link (WhatsApp e telefono)", () => {
  assert.equal(hasPhone(), false);
  assert.deepEqual(contactLinks(), { whatsapp: null, phone: null });
  assert.equal(phoneTelHref(CONTACTS.phone), null);
  assert.ok(missingBusinessData().some((m) => m.startsWith("CONTACTS.phone")));
});

test("telefono: link tel: corretto per numeri italiani e internazionali, null per segnaposto e numeri non validi", () => {
  assert.equal(phoneTelHref("02 1234 5678"), "tel:+390212345678");
  assert.equal(phoneTelHref("+39 333 123 4567"), "tel:+393331234567");
  assert.equal(phoneTelHref("0039 333 123 4567"), "tel:+393331234567");
  assert.equal(phoneTelHref("333-123-4567"), "tel:+393331234567");
  assert.equal(phoneTelHref("[DA COMPLETARE: telefono]"), null);
  for (const bad of ["", "abc", "12", "[DA COMPLETARE: 0212345678]", "+39 12", "<script>"]) assert.equal(phoneTelHref(bad), null, bad);
});

test("contatti configurati (numeri di prova): link corretti e indipendenti", () => {
  const both = buildContactLinks({ whatsapp: "393001234567", phone: "02 1234 5678" });
  assert.equal(both.whatsapp, `https://wa.me/393001234567?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`);
  assert.deepEqual(both.phone, { href: "tel:+390212345678", label: "02 1234 5678" });
  assert.equal(decodeURIComponent(both.whatsapp!.split("?text=")[1]), "Ciao, vorrei informazioni per vendere il mio scooter");
  // numeri diversi e configurabili separatamente
  assert.deepEqual(buildContactLinks({ whatsapp: "[DA COMPLETARE: numero WhatsApp, es. 393331234567]", phone: "02 1234 5678" }).whatsapp, null);
  assert.equal(buildContactLinks({ whatsapp: "393001234567", phone: "[DA COMPLETARE: telefono]" }).phone, null);
  assert.ok(buildContactLinks({ whatsapp: "393001234567", phone: "[DA COMPLETARE: telefono]" }).whatsapp);
  // WhatsApp con testo non valido o con il "+" non genera mai un link
  assert.equal(buildContactLinks({ whatsapp: "+39 300 123 4567", phone: "" }).whatsapp, null);
});

test("contatti: i pulsanti dell'interfaccia dipendono dai numeri e mantengono il modulo funzionante", () => {
  const btn = readFileSync("src/components/ContactButtons.tsx", "utf8");
  assert.match(btn, /if \(!href\) return null/);
  assert.match(btn, /if \(!phone\) return null/);
  assert.match(btn, /contactLinks\(\)/);
  assert.doesNotMatch(btn, /wa\.me\/\d/);
  assert.doesNotMatch(btn, /tel:\+?\d/);
  for (const f of ["src/components/SiteHeader.tsx", "src/components/StickyCta.tsx", "src/modules/funnel/steps/DoneStep.tsx"]) {
    assert.match(readFileSync(f, "utf8"), /PhoneButton|WhatsApp|whatsappLink/, f);
  }
  // il modulo non dipende da nessun contatto: i pulsanti di contatto non sono nella barra del modulo
  assert.doesNotMatch(readFileSync("src/modules/funnel/Funnel.tsx", "utf8"), /PhoneButton|WhatsAppButton/);
});
