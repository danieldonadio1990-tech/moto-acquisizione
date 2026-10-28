/** Indirizzo email ufficiale: un solo valore nella configurazione, nessun vecchio indirizzo nei file versionati. */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { CONTACTS, isPlaceholder } from "../src/config/business";

const NEW_EMAIL = "compriamo.moto.support@gmail.com";
// Il test non deve essere esso stesso un'occorrenza: la regex non contiene l'indirizzo per intero.
const OLD_EMAIL_RE = /compro\.moto\.support/i;

describe("indirizzo email ufficiale", () => {
  test("CONTACTS.email è il nuovo indirizzo e non è un segnaposto", () => {
    assert.equal(CONTACTS.email, NEW_EMAIL);
    assert.equal(isPlaceholder(CONTACTS.email), false);
  });
  test("il footer ricava il mailto da CONTACTS.email", () => {
    const footer = readFileSync("src/components/SiteFooter.tsx", "utf8");
    assert.match(footer, /mailto:\$\{email\}/);
    assert.doesNotMatch(footer, /@gmail\.com/);
  });
  test("nessun file versionato contiene il vecchio indirizzo", () => {
    const files = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean);
    const hits = files.filter((f) => {
      try {
        return OLD_EMAIL_RE.test(readFileSync(f, "utf8"));
      } catch {
        return false;
      }
    });
    assert.deepEqual(hits, []);
  });
});
