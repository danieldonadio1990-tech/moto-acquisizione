/**
 * Test delle regole di business pure (nessun database).
 * Esecuzione: npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { matchBuyBox, type BuyBoxRuleLike } from "@/modules/buybox/match";
import { leadSubmissionSchema, normalizeItalianPhone } from "@/modules/leads/validation";

const rule = (r: Partial<BuyBoxRuleLike>): BuyBoxRuleLike => ({
  brand: "Honda", model: "SH", minYear: null, maxYear: null, maxMileage: null,
  requireRunning: false, market: "milano", priority: "high", active: true, ...r,
});
const sh = { brand: "Honda", family: "SH", year: 2019, mileage: 18000, isRunning: true, market: "milano" };

test("Buy Box: SH a Milano rientra", () => {
  assert.equal(matchBuyBox(sh, [rule({})])?.priority, "high");
});

test("Buy Box: limiti di km, anno, funzionamento, mercato e regole disattivate", () => {
  assert.equal(matchBuyBox(sh, [rule({ maxMileage: 10000 })]), null);
  assert.equal(matchBuyBox(sh, [rule({ minYear: 2020 })]), null);
  assert.equal(matchBuyBox({ ...sh, isRunning: false }, [rule({ requireRunning: true })]), null);
  assert.equal(matchBuyBox({ ...sh, market: "torino" }, [rule({})]), null);
  assert.equal(matchBuyBox(sh, [rule({ active: false })]), null);
});

test("Buy Box: vince la priorità più alta; model null copre tutto il brand", () => {
  const hit = matchBuyBox(sh, [rule({ model: null, priority: "low" }), rule({ priority: "medium" })]);
  assert.equal(hit?.priority, "medium");
  assert.equal(matchBuyBox({ ...sh, family: null }, [rule({ model: null })])?.brand, "Honda");
});

test("Telefono: normalizzazione numeri italiani", () => {
  assert.equal(normalizeItalianPhone("333 123 4567"), "+393331234567");
  assert.equal(normalizeItalianPhone("+39 347-555-1234"), "+393475551234");
  assert.equal(normalizeItalianPhone("0039 02 1234567"), "+39021234567");
  assert.equal(normalizeItalianPhone("12345"), null);
  assert.equal(normalizeItalianPhone("+41 79 123 45 67"), "+41791234567");
});

const valid = {
  submissionId: "3f1c2b8e-5d4a-4c7b-9e2f-1a2b3c4d5e6f",
  motorcycle: { brand: "Honda", modelId: "honda-sh", year: 2019, displacement: 125 },
  mileage: 18000,
  condition: { isRunning: true, accident: "no", mechanicalIssues: "no", maintenance: "yes" },
  contact: {
    firstName: "Mario", lastName: "Rossi", phone: "3331234567", email: "Mario@Example.com",
    city: "Milano", preferredContact: "whatsapp", privacyConsent: true,
  },
};

test("Richiesta: valida e normalizzata", () => {
  const r = leadSubmissionSchema.parse(valid);
  assert.equal(r.contact.email, "mario@example.com");
  assert.equal(r.contact.phone, "+393331234567");
});

test("Richiesta: rifiutata senza consenso privacy, con honeypot o modello 'Altro' vuoto", () => {
  assert.equal(leadSubmissionSchema.safeParse({ ...valid, contact: { ...valid.contact, privacyConsent: false } }).success, false);
  assert.equal(leadSubmissionSchema.safeParse({ ...valid, website: "spam" }).success, false);
  assert.equal(
    leadSubmissionSchema.safeParse({ ...valid, motorcycle: { ...valid.motorcycle, modelId: "other" } }).success,
    false,
  );
});
