/** Interfaccia privacy: nessuna evidenziazione di sviluppo, presa visione distinta dal consenso, nessun dato legale inventato. */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { leadSubmissionSchema } from "../src/modules/leads/validation";
import { LEGAL, PROVIDERS, missingBusinessData } from "../src/config/business";

const read = (p: string) => readFileSync(p, "utf8");

describe("pagina privacy", () => {
  const page = read("src/app/privacy/page.tsx");
  test("nessuna evidenziazione gialla né banner di sviluppo", () => {
    assert.doesNotMatch(page, /<mark|bg-notice|evidenziat/i);
    assert.doesNotMatch(page, /Bozza in revisione/);
  });
  test("i dati del titolare sono quelli confermati, senza ragione sociale o denominazione inventata", () => {
    assert.equal(LEGAL.holderName, "Donadio Luca");
    assert.equal(LEGAL.legalForm, "impresa individuale");
    assert.equal(LEGAL.vatNumber, "13723400969");
    assert.equal(LEGAL.address, "Via F.lli Bronzetti 8, 20129 Milano (MI)");
    assert.equal(LEGAL.privacyEmail, "compriamo.moto.support@gmail.com");
    assert.equal(LEGAL.pec, "lucadonadio4@pec.it");
    assert.equal(LEGAL.companyName, "Donadio Luca (impresa individuale)");
    assert.doesNotMatch(JSON.stringify(LEGAL), /s\.?r\.?l|s\.?p\.?a|s\.?n\.?c|s\.?a\.?s|ragione sociale/i);
    for (const t of ["{LEGAL.holderName}", "{LEGAL.legalForm}", "{LEGAL.activity}", "{LEGAL.address}", "{LEGAL.vatNumber}", "LEGAL.privacyEmail", "LEGAL.pec"]) {
      assert.ok(page.includes(t), t);
    }
  });
  test("i contenuti dell'informativa ci sono ancora: titolare, finalità, conservazione, diritti, cancellazione", () => {
    for (const h of ["Chi tratta i tuoi dati", "Perché li usiamo", "Per quanto tempo li conserviamo", "I tuoi diritti", "Come chiedere la cancellazione"]) {
      assert.ok(page.includes(h), h);
    }
  });
  test("nessuna affermazione non verificata: niente tempi di conservazione, garanzie sui trasferimenti, località dei fornitori o ruoli contrattuali", () => {
    const text = page.replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(text, /\b\d+\s*(mesi|anni)\b/i, "tempi di conservazione non deliberati");
    assert.doesNotMatch(text, /clausole contrattuali|standard contractual|data privacy framework|decisione di adeguatezza|adeguate garanzie/i);
    assert.doesNotMatch(text, /responsabili del trattamento|responsabile del trattamento/i);
    assert.doesNotMatch(text, /supabase[^.]*(francoforte|unione europea|ue\b)/i);
  });
  test("descrive ciò che il codice fa davvero: dati nel browser (sessionStorage), nessun cookie, codici anti-abuso, fornitori in uso", () => {
    assert.match(page, /sessionStorage/);
    assert.match(page, /non usa cookie/);
    assert.match(page, /codici derivati/);
    assert.doesNotMatch(page, /conserva solo un identificativo casuale/);
    for (const p of [PROVIDERS.hosting, PROVIDERS.database, PROVIDERS.storage, PROVIDERS.notifications, PROVIDERS.mail]) assert.ok(p.length > 2);
    for (const k of ["{PROVIDERS.hosting}", "{PROVIDERS.database}", "{PROVIDERS.storage}", "{PROVIDERS.notifications}", "{PROVIDERS.mail}"]) assert.ok(page.includes(k), k);
  });
});

describe("nessun segnaposto legale nelle pagine pubbliche", () => {
  const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const files = [
    "src/app/privacy/page.tsx", "src/app/page.tsx", "src/app/valuta/page.tsx", "src/app/not-found.tsx", "src/app/error.tsx", "src/app/global-error.tsx",
    "src/components/SiteFooter.tsx", "src/components/SiteHeader.tsx", "src/config/home-content.ts", "src/modules/funnel/steps/ContactStep.tsx",
    "src/modules/funnel/steps/DoneStep.tsx",
  ];
  test("nei file delle pagine non compaiono segnaposto o diciture «da indicare/confermare/verificare»", () => {
    for (const f of files) {
      assert.doesNotMatch(strip(read(f)), /\[DA (COMPLETARE|CONFERMARE|VERIFICARE)|\((da indicare|da confermare|da verificare)\)|ragione sociale \(/i, f);
    }
  });
  test("i dati legali e dei fornitori non sono segnaposto e il controllo di avvio non ne segnala", () => {
    for (const v of [...Object.values(LEGAL), ...Object.values(PROVIDERS)]) assert.doesNotMatch(v, /^\[DA /, v);
    assert.deepEqual(missingBusinessData().filter((m) => m.startsWith("LEGAL.") || m.startsWith("PROVIDERS.")), []);
  });
});

describe("casella privacy nel modulo", () => {
  const step = read("src/modules/funnel/steps/ContactStep.tsx");
  test("è una presa visione dell'informativa, non un consenso generico", () => {
    assert.match(step, /Ho letto l&apos;/);
    assert.doesNotMatch(step, /accetto/i);
    assert.match(step, /href="\/privacy"/);
  });
  test("resta obbligatoria, con un messaggio che dice cosa fare", () => {
    const base = {
      submissionId: "11111111-1111-4111-8111-111111111111",
      motorcycle: { brand: "Honda", modelId: "honda-sh", year: 2019, displacement: 125 },
      mileage: 1000,
      condition: { isRunning: true, accident: "no", mechanicalIssues: "no", maintenance: "yes" },
      contact: { firstName: "A", lastName: "B", phone: "+393331234567", email: "a@example.com", city: "Milano", preferredContact: "phone", privacyConsent: false },
    };
    const r = leadSubmissionSchema.safeParse(base);
    assert.equal(r.success, false);
    assert.match(JSON.stringify(r.error?.issues), /letto l'informativa privacy/);
    assert.equal(leadSubmissionSchema.safeParse({ ...base, contact: { ...base.contact, privacyConsent: true } }).success, true);
  });
});
