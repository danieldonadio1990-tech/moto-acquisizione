/** Spazi pubblicitari: spenti per impostazione predefinita, fuori dal flusso di valutazione, senza script né dipendenze. */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { ADS, PARTNER_CREATIVES, activeCreative } from "../src/config/ads";

const read = (p: string) => readFileSync(p, "utf8");

describe("spazi pubblicitari", () => {
  test("spenti per impostazione predefinita e senza campagne", () => {
    assert.equal(ADS.enabled, false);
    assert.deepEqual(PARTNER_CREATIVES, {});
    assert.equal(activeCreative("home-dopo-faq"), null);
  });

  test("lo spazio non produce nulla (null) quando è spento", async () => {
    const { AdSlot } = await import("../src/components/AdSlot");
    assert.equal(AdSlot({ id: "home-dopo-faq" }), null);
  });

  test("lo spazio ammette solo campagne partner statiche (nessuna piattaforma ancora)", () => {
    for (const s of Object.values(ADS.slots)) assert.deepEqual([...s.allowed], ["partner"]);
  });

  test("non compare nel flusso di valutazione, nel back office, nelle email né nelle API", () => {
    const dirs = ["src/modules/funnel", "src/modules/admin", "src/modules/notifications", "src/app/valuta", "src/app/admin", "src/app/api"];
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    for (const d of dirs) for (const f of walk(d)) assert.doesNotMatch(read(f), /AdSlot|config\/ads/, f);
  });

  test("nessuno script o dipendenza pubblicitaria nel progetto", () => {
    const pkg = read("package.json");
    assert.doesNotMatch(pkg, /adsense|googletag|gtag|fbq|facebook-pixel|tiktok-pixel|react-ga|@vercel\/analytics/i);
    for (const f of ["src/app/layout.tsx", "src/app/page.tsx", "src/components/AdSlot.tsx"]) {
      assert.doesNotMatch(read(f), /googlesyndication|doubleclick|connect\.facebook|analytics\.tiktok|googletagmanager|<script/i, f);
    }
  });
});
