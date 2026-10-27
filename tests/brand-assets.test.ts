/**
 * Risorse del marchio (public/brand/v2, icone, anteprima social) e loro uso nel sito. Controlli statici: nessun database, nessuna rete.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const PALETTE = ["#15181b", "#fbfbf8", "#f1bf1a", "#e9ebe7", "#ecece6"];
const OLD = /#0b1220|#2563eb|#1d4ed8|#7fb0ff|#f8fafc|#0f172a/i;

function pngSize(p: string) {
  const b = readFileSync(path.join(ROOT, p));
  assert.equal(b.subarray(1, 4).toString(), "PNG", p);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

describe("risorse del logo v2", () => {
  const dir = path.join(ROOT, "public/brand/v2");
  const svgs = readdirSync(dir).filter((f) => f.endsWith(".svg"));

  test("ci sono simbolo, lockup (chiaro, scuro, mono), avatar, icona app, favicon e wordmark", () => {
    for (const f of ["symbol", "symbol-dark", "lockup", "lockup-dark", "lockup-mono", "avatar", "app-icon", "favicon", "wordmark-alt"]) {
      assert.ok(svgs.includes(`${f}.svg`), `manca ${f}.svg`);
    }
    assert.deepEqual(pngSize("public/brand/v2/avatar-1024.png"), [1024, 1024]);
  });

  test("gli SVG sono autosufficienti: tracciati, nessun testo, script, immagine o riferimento esterno, con titolo accessibile", () => {
    for (const f of svgs) {
      const s = readFileSync(path.join(dir, f), "utf8");
      assert.doesNotMatch(s, /<text|<script|<image|<foreignObject|href=|@import|url\(/i, f);
      assert.match(s, /<title>/, f);
    }
  });

  test("usano solo i colori della palette", () => {
    for (const f of svgs) {
      const s = readFileSync(path.join(dir, f), "utf8");
      for (const c of s.match(/#[0-9a-f]{6}\b/gi) ?? []) assert.ok(PALETTE.includes(c.toLowerCase()), `${f}: colore fuori palette ${c}`);
    }
  });
});

describe("uso nel sito", () => {
  test("icone, manifest e anteprima social ci sono, con le dimensioni giuste", () => {
    assert.deepEqual(pngSize("public/icons/icon-192.png"), [192, 192]);
    assert.deepEqual(pngSize("public/icons/icon-512.png"), [512, 512]);
    assert.deepEqual(pngSize("public/icons/icon-maskable-512.png"), [512, 512]);
    assert.deepEqual(pngSize("src/app/apple-icon.png"), [180, 180]);
    assert.deepEqual(pngSize("src/app/opengraph-image.png"), [1200, 630]);
    assert.ok(statSync(path.join(ROOT, "src/app/opengraph-image.png")).size < 300_000, "anteprima social troppo pesante");
    assert.match(read("src/app/opengraph-image.alt.txt"), /Compriamo Moto/);
    assert.equal(read("src/app/icon.svg"), read("public/brand/v2/favicon.svg"));
    assert.equal(read("public/brand/compriamo-moto-logo.svg"), read("public/brand/v2/lockup.svg"));
    assert.match(read("src/app/manifest.ts"), /theme_color: "#15181b"/);
    assert.match(read("src/app/layout.tsx"), /themeColor: "#15181b"/);
  });

  test("intestazione e piè di pagina usano il marchio; il simbolo del sito ha le stesse forme dei file SVG", () => {
    assert.match(read("src/components/SiteHeader.tsx"), /<BrandMark/);
    assert.match(read("src/components/SiteFooter.tsx"), /<BrandMark/);
    const paths = read("src/components/brand/symbol-paths.ts");
    const svg = read("public/brand/v2/symbol.svg");
    for (const d of paths.match(/"M[^"]+"/g) ?? []) assert.ok(svg.includes(d.slice(1, -1)), "forma del simbolo diversa dal file SVG");
  });

  test("nessun residuo della vecchia palette nel codice del sito, nelle pagine di errore e nel manifest", () => {
    for (const f of ["src/app/globals.css", "src/app/global-error.tsx", "src/app/manifest.ts", "src/app/layout.tsx"]) assert.doesNotMatch(read(f), OLD, f);
  });

  test("la rotta provvisoria di anteprima non esiste più", () => {
    assert.equal(existsSync(path.join(ROOT, "src/app/anteprima")), false);
  });

  test("la homepage non ha moduli propri, porta a /valuta e non contiene recensioni, numeri di vendita, prezzi o partner inventati", () => {
    const p = read("src/app/page.tsx");
    assert.match(p, /href="\/valuta"/);
    assert.doesNotMatch(p, /<form|<input|<select|<textarea/);
    const t = (read("src/config/home-content.ts") + p).replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(t, /€|recension|stelle|★|\d+\s*(moto|clienti)|partner|garantit|in 24|in 48|immediat/i);
  });
});
