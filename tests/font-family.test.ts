/** Caratteri del sito: nessun monospazio; etichette e dati in Instrument Sans (il font del testo). */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const read = (p: string) => readFileSync(p, "utf8");
const walk = (d: string): string[] =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

describe("caratteri del sito", () => {
  const css = read("src/app/globals.css");

  test("le etichette (.label) usano il font del testo, con le stesse dimensioni e spaziature di prima", () => {
    const block = css.match(/\.label\s*\{[^}]*\}/)?.[0] ?? "";
    assert.match(block, /font-family:\s*var\(--font-sans\)/);
    assert.match(block, /font-size:\s*0\.75rem/);
    assert.match(block, /letter-spacing:\s*0\.09em/);
    assert.match(block, /text-transform:\s*uppercase/);
  });

  test("il font monospazio non è più caricato né dichiarato", () => {
    assert.doesNotMatch(css, /--font-mono|monospace/);
    const layout = read("src/app/layout.tsx");
    assert.doesNotMatch(layout, /mono/i);
    assert.equal(existsSync("src/fonts/ibm-plex-mono-latin-400-normal.woff2"), false);
    assert.doesNotMatch(read("src/fonts/OFL-brand-v2.txt"), /ibm-plex-mono|IBM Corp/i);
  });

  test("nessun componente o pagina usa una classe font-mono", () => {
    for (const f of walk("src").filter((x) => /\.(tsx?|css)$/.test(x))) assert.doesNotMatch(read(f), /\bfont-mono\b/, f);
  });

  test("restano solo Instrument Sans e Big Shoulders Display", () => {
    const layout = read("src/app/layout.tsx");
    assert.match(layout, /instrument-sans/);
    assert.match(layout, /big-shoulders-display/);
    assert.equal((layout.match(/localFont\(/g) ?? []).length, 2);
  });
});
