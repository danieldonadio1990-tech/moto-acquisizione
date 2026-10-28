/** Interfaccia privacy: nessuna evidenziazione di sviluppo, presa visione distinta dal consenso, nessun dato legale inventato. */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { leadSubmissionSchema } from "../src/modules/leads/validation";
import { LEGAL } from "../src/config/business";

const read = (p: string) => readFileSync(p, "utf8");

describe("pagina privacy", () => {
  const page = read("src/app/privacy/page.tsx");
  test("nessuna evidenziazione gialla né banner di sviluppo", () => {
    assert.doesNotMatch(page, /<mark|bg-notice|evidenziat/i);
    assert.doesNotMatch(page, /Bozza in revisione/);
  });
  test("i dati ancora da fornire non compaiono tra parentesi quadre né come istruzioni", () => {
    // il segnaposto del codice viene reso come «testo (da indicare)»: parentesi quadre e prefisso «DA …:» non arrivano all'utente
    assert.match(page, /\(\$\{label\}\)/);
    assert.match(page, /"da indicare"/);
    assert.doesNotMatch(page, /<mark/);
  });
  test("i contenuti dell'informativa ci sono ancora: titolare, finalità, conservazione, diritti, cancellazione", () => {
    for (const h of ["Chi tratta i tuoi dati", "Perché li usiamo", "Per quanto tempo li conserviamo", "I tuoi diritti", "Come chiedere la cancellazione"]) {
      assert.ok(page.includes(h), h);
    }
  });
  test("nessun dato del titolare inventato: restano segnaposto finché non sono forniti", () => {
    for (const v of [LEGAL.companyName, LEGAL.vatNumber, LEGAL.address, LEGAL.privacyEmail]) assert.match(v, /^\[DA COMPLETARE/);
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
