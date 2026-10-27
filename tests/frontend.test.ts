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
  assert.equal(BRAND.name, "Compriamo Moto");
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
  const home = readFileSync("src/app/page.tsx", "utf8") + readFileSync("src/config/home-content.ts", "utf8");
  assert.match(home, /Valuta la tua moto[\s\S]{0,80}in pochi passaggi\./);
  assert.match(home, /Della rivendita non devi occuparti tu/);
  assert.match(home, /gestione successiva è a nostro carico/);
  assert.match(home, /Acquistiamo la tua moto direttamente da te/);
  assert.match(home, /Valuta la tua moto/);
  for (const id of ["come-funziona", "domande"]) assert.match(home, new RegExp(`id="${id}"`));
  // niente promesse di tempi, garanzie, recensioni o volumi
  assert.doesNotMatch(home.replace(/\/\*[\s\S]*?\*\//g, ""), /garantit|in giornata|entro \d|24 ?ore|subito il pagamento|recension|testimonianz|clienti soddisfatti|\d+ moto acquistate/i);
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

test("immagini: una hero generata richiede file ad alta risoluzione, flag generated, nessun credito CC e alt non documentario", () => {
  const cfg = readFileSync("src/config/images.ts", "utf8");
  const hero = cfg.match(/hero:\s*\{([^}]*)\}/)![1];
  const src = hero.match(/src:\s*"([^"]+)"/);
  if (src) {
    assert.match(hero, /generated:\s*true/, "hero con src: se non è una foto vera deve essere generated: true");
    assert.ok(statSync(path.join("public", src[1])).size > 30_000, "file troppo piccolo: non usare anteprime");
    assert.ok(Number(hero.match(/width:\s*(\d+)/)![1]) >= 1600);
    assert.doesNotMatch(hero, /Milano/, "l'alt di un'immagine generata non deve citare un luogo reale");
  }
  // i modelli specifici non usano mai immagini generate
  for (const id of ["honda_sh", "piaggio_liberty", "kymco_agility"]) {
    const line = cfg.match(new RegExp(`${id}:\\s*\\{([^}]*)\\}`))![1];
    assert.doesNotMatch(line, /generated:\s*true/, id);
  }
});

test("footer: i dati aziendali segnaposto non vengono mostrati al pubblico", () => {
  const footer = readFileSync("src/components/SiteFooter.tsx", "utf8");
  assert.match(footer, /isPlaceholder\(/);
  assert.doesNotMatch(footer, /DA COMPLETARE/);
});

test("palette Compriamo Moto: grafite, bianco sporco, pietra, giallo segnale (e suo hover/testo), testi e bordi", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  for (const c of ["#15181b", "#fbfbf8", "#e9ebe7", "#f1bf1a", "#dcaa0d", "#7a5c00", "#565c60", "#c3c8c1"]) assert.ok(css.toLowerCase().includes(c), c);
  assert.doesNotMatch(css, /--color-signal|#f5c928|#1a3fa8|#2563eb|#1d4ed8|#0b1220|#7fb0ff/i, "residui della vecchia palette");
});

test("contrasto WCAG: coppie di colori del brand (testo 4.5:1, bordi dei controlli 3:1)", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  const tok = (n: string) => css.match(new RegExp(`--color-${n}:\\s*(#[0-9a-fA-F]{6})`))![1];
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  const text: [string, string][] = [
    ["asphalt", "plate"], ["asphalt", "plate-deep"], ["gold", "chalk"], ["gold", "paper"], ["sky", "asphalt"], ["sky", "asphalt-raised"],
    ["paper", "asphalt"], ["concrete", "paper"], ["concrete", "chalk"], ["asphalt-soft", "chalk"], ["asphalt-soft", "paper"],
    ["ink", "chalk"], ["ink", "paper"], ["asphalt", "chalk"], ["asphalt", "notice"], ["ok", "paper"], ["ok", "chalk"], ["danger", "paper"], ["danger", "chalk"],
  ];
  for (const [fg, bg] of text) assert.ok(ratio(tok(fg), tok(bg)) >= 4.5, `${fg} su ${bg}: ${ratio(tok(fg), tok(bg)).toFixed(2)}`);
  for (const bg of ["paper", "chalk"]) assert.ok(ratio(tok("field"), tok(bg)) >= 3, `bordo campi su ${bg}`);
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
  assert.equal(decodeURIComponent(both.whatsapp!.split("?text=")[1]), "Ciao, vorrei informazioni per vendere la mia moto");
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

// ---- Testi rivolti al cliente: terminologia e ambito del servizio ---------------------------------------------------------
test("testi per il cliente: «moto» (mai «mezzo») e nessuna limitazione a scooter o a una cilindrata", () => {
  const files = [
    "src/app/page.tsx",
    "src/config/home-content.ts",
    "src/app/valuta/page.tsx",
        "src/components/SiteHeader.tsx",
    "src/components/SiteFooter.tsx",
    "src/modules/funnel/steps/DoneStep.tsx",
    "src/modules/funnel/steps/MotoStep.tsx",
    "src/modules/funnel/Funnel.tsx",
    "src/app/api/leads/route.ts",
  ];
  for (const f of files) {
    // si ignorano commenti, identificatori tecnici (#mezzi, label analytics) e valori CSS
    const txt = readFileSync(f, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/#mezzi|id="mezzi"|label="altro-mezzo"/g, "");
    assert.doesNotMatch(txt, /\bmezz[oi]\b/i, `${f}: usare «moto», «motocicletta» o «la tua moto»`);
    assert.doesNotMatch(txt, /\bscooter\b|soprattutto scooter|solo scooter|\b125 ?cc\b(?!")/i, `${f}: il servizio riguarda tutte le moto`);
  }
  const home = readFileSync("src/app/page.tsx", "utf8") + readFileSync("src/config/home-content.ts", "utf8");
  assert.match(home, /gestione successiva/);
  assert.match(home, /non devi occuparti|Della rivendita non devi occuparti tu/i);
  const biz = readFileSync("src/config/business.ts", "utf8");
  assert.doesNotMatch(biz.replace(/\/\*[\s\S]*?\*\//g, ""), /scooter|\bmezz[oi]\b/i);
});
