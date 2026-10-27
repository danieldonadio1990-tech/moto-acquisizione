/**
 * Anteprima di brand v2: risorse del logo e rotta /anteprima. Controlli statici, nessun database, nessuna rete.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const PALETTE = ["#15181b", "#fbfbf8", "#f1bf1a", "#e9ebe7", "#ecece6"];

describe("risorse del logo v2", () => {
  const dir = path.join(ROOT, "public/brand/v2");
  const svgs = readdirSync(dir).filter((f) => f.endsWith(".svg"));

  test("ci sono simbolo, lockup (chiaro, scuro, mono), avatar, icona app, favicon e wordmark", () => {
    for (const f of ["symbol", "symbol-dark", "lockup", "lockup-dark", "lockup-mono", "avatar", "app-icon", "favicon", "wordmark-alt"]) {
      assert.ok(svgs.includes(`${f}.svg`), `manca ${f}.svg`);
    }
    assert.ok(existsSync(path.join(dir, "avatar-1024.png")));
  });

  test("gli SVG sono autosufficienti: tracciati, nessun testo, script, immagine o riferimento esterno", () => {
    for (const f of svgs) {
      const s = readFileSync(path.join(dir, f), "utf8");
      assert.doesNotMatch(s, /<text|<script|<image|<foreignObject|href=|@import|url\(/i, f);
      assert.match(s, /<title>/, `${f} senza titolo accessibile`);
    }
  });

  test("usano solo i colori della palette", () => {
    for (const f of svgs) {
      const s = readFileSync(path.join(dir, f), "utf8");
      for (const c of s.match(/#[0-9a-f]{6}\b/gi) ?? []) assert.ok(PALETTE.includes(c.toLowerCase()), `${f}: colore fuori palette ${c}`);
    }
  });

  test("il logo attuale non è stato toccato", () => {
    assert.ok(existsSync(path.join(ROOT, "public/brand/compriamo-moto-logo.svg")));
    assert.match(read("public/brand/compriamo-moto-logo.svg"), /COMPRIAMO/);
    assert.doesNotMatch(read("src/components/BrandMark.tsx"), /brand2|BrandSymbol/);
  });
});

describe("rotta di anteprima", () => {
  const files = ["src/app/anteprima/page.tsx", "src/app/anteprima/layout.tsx", "src/app/anteprima/logo/page.tsx", "src/components/brand2/StickyBar.tsx"];

  test("in produzione risponde 404 senza BRAND_PREVIEW=1 e non è indicizzabile", () => {
    const l = read("src/app/anteprima/layout.tsx");
    assert.match(l, /BRAND_PREVIEW !== "1"/);
    assert.match(l, /notFound\(\)/);
    assert.match(l, /index: false/);
    assert.doesNotMatch(read("src/app/sitemap.ts"), /anteprima/);
  });

  test("non usa database, API, analisi né tracciamento", () => {
    for (const f of files) {
      const s = read(f);
      assert.doesNotMatch(s, /@\/db|@\/modules|TrackedLink|TrackOnMount|\/api\/|sendBeacon|fetch\(/, f);
    }
  });

  test("il pulsante porta a /valuta e il cartellino non è un modulo", () => {
    const p = read("src/app/anteprima/page.tsx");
    assert.match(p, /href="\/valuta"/);
    assert.doesNotMatch(p, /<form|<input|<select|<textarea/);
  });

  test("nessuna recensione, numero di vendite, prezzo o partner inventato", () => {
    const t = (read("src/app/anteprima/content.ts") + read("src/app/anteprima/page.tsx")).replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(t, /€|recension|stelle|★|\d+\s*(moto|clienti)|partner|garantit|in 24|in 48|immediat/i);
  });
});
