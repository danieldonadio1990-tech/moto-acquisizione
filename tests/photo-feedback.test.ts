/** Messaggi mostrati a chi carica le foto: chiari e con il codice, mai generici. */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { describeUploadFailure } from "../src/modules/funnel/photo-feedback";

describe("describeUploadFailure", () => {
  test("rete assente o timeout: da riprovare, i dati non sono persi", () => {
    for (const f of [describeUploadFailure(0, undefined, true), describeUploadFailure(0, undefined, false)]) {
      assert.equal(f.retryable, true);
      assert.equal(f.fatal, false);
      assert.match(f.message, /connession/i);
      assert.match(f.message, /salvati/i);
    }
  });
  test("408: da riprovare", () => assert.equal(describeUploadFailure(408, undefined, false).retryable, true));
  test("413: non automatico, dice di togliere foto", () => {
    const f = describeUploadFailure(413, "Upload troppo grande", false);
    assert.equal(f.retryable, false);
    assert.match(f.message, /pesanti|leggere/i);
  });
  test("403 e 429: fermano gli altri invii e riportano il messaggio del server", () => {
    const a = describeUploadFailure(403, "Link per le foto non valido o scaduto", false);
    assert.equal(a.fatal, true);
    assert.match(a.message, /non valido o scaduto/);
    assert.match(a.message, /già arrivati/);
    const b = describeUploadFailure(429, undefined, false);
    assert.equal(b.fatal, true);
  });
  test("5xx: da riprovare e con il codice visibile", () => {
    const f = describeUploadFailure(502, undefined, false);
    assert.equal(f.retryable, true);
    assert.match(f.message, /502/);
  });
  test("altri 4xx (400, 411, 415): non si ripete in automatico, con codice e messaggio", () => {
    for (const code of [400, 411, 415]) {
      const f = describeUploadFailure(code, "Formato richiesta non valido", false);
      assert.equal(f.retryable, false);
      assert.match(f.message, new RegExp(String(code)));
      assert.match(f.message, /Formato richiesta non valido/);
    }
  });
});
