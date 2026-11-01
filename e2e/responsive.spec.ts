import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

/**
 * Mobile first: 375 / 390 / 430 (smartphone), 820 (tablet), 1440 (desktop).
 * Per ogni formato: nessuno scroll orizzontale, titolo in al massimo 4 righe, CTA nell'intestazione, aree toccabili di almeno 44 px,
 * menu su smartphone, modulo (primo passo e contatti) senza campi coperti dalla barra fissa. Salva gli screenshot in test-results/responsive.
 * Non invia richieste: il modulo si ferma prima dell'invio.
 */
const WIDTHS = [
  { w: 375, h: 812, phone: true },
  { w: 390, h: 844, phone: true },
  { w: 430, h: 932, phone: true },
  { w: 820, h: 1180, phone: false },
  { w: 1440, h: 900, phone: false },
];
const OUT = "test-results/responsive";

async function noOverflow(page: Page) {
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(o.sw, `scroll orizzontale: ${o.sw} > ${o.iw}`).toBeLessThanOrEqual(o.iw);
}

async function smallTargets(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("a[href],button,summary,input:not([type=hidden]):not([type=file]),select")]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        const cs = getComputedStyle(e);
        const t = (e as HTMLInputElement).type;
        return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && !e.closest(".sr-only,[aria-hidden=true]") && t !== "radio" && t !== "checkbox" && r.height < 40;
      })
      .map((e) => `${(e as HTMLElement).innerText?.slice(0, 24) || e.getAttribute("aria-label") || e.tagName}:${Math.round(e.getBoundingClientRect().height)}`),
  );
}

for (const { w, h, phone } of WIDTHS) {
  test.describe(`${w}px`, () => {
    test.use({ viewport: { width: w, height: h }, isMobile: phone, hasTouch: w < 1000, deviceScaleFactor: 1 });

    test("home: nessun overflow, titolo corto, CTA e aree toccabili", async ({ page }) => {
      mkdirSync(OUT, { recursive: true });
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      await noOverflow(page);
      const lines = await page.evaluate(() => {
        const el = document.querySelector("h1")!;
        return Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight));
      });
      expect(lines).toBeLessThanOrEqual(4);
      await expect(page.getByRole("banner").getByRole("link", { name: "Vendi la tua moto" })).toBeVisible();
      await expect(page.getByText("Milano e provincia").first()).toBeVisible();
      expect(await smallTargets(page)).toEqual([]);
      await page.screenshot({ path: `${OUT}/home-${w}.png`, fullPage: true });
    });

    test("menu: su smartphone si apre, naviga e si chiude; da tablet i link sono in barra", async ({ page }) => {
      await page.goto("/");
      const toggle = page.getByRole("button", { name: /menu/i });
      if (!phone) {
        await expect(toggle).toBeHidden();
        await expect(page.getByRole("banner").getByRole("link", { name: "Come funziona" })).toBeVisible();
        return;
      }
      await expect(toggle).toBeVisible();
      const box = (await toggle.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await page.screenshot({ path: `${OUT}/menu-${w}.png` });
      await page.keyboard.press("Escape");
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await toggle.click();
      await page.getByRole("link", { name: "Domande" }).click();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(page).toHaveURL(/#domande$/);
    });

    test("modulo: primo passo e contatti senza overflow e senza campi coperti dalla barra fissa", async ({ page }) => {
      await page.goto("/valuta");
      await page.waitForLoadState("networkidle");
      await noOverflow(page);
      await page.screenshot({ path: `${OUT}/modulo-1-${w}.png`, fullPage: true });
      await page.locator("fieldset", { hasText: "Marca" }).getByText("Honda", { exact: true }).click();
      await page.locator("fieldset", { hasText: "Modello" }).getByText("SH", { exact: true }).click();
      await page.getByText("125 cc", { exact: true }).click();
      await page.getByLabel("Anno di immatricolazione").selectOption("2019");
      await page.getByRole("button", { name: "Continua" }).click();
      await page.keyboard.type("18500");
      await page.getByRole("button", { name: "Continua" }).click();
      for (const [q, a] of [["funzionante", "Sì"], ["incidenti", "No"], ["meccanici", "No"], ["manutenzione", "Sì"]]) {
        await page.locator("fieldset", { hasText: q }).getByText(a, { exact: true }).click();
      }
      await page.getByRole("button", { name: "Continua" }).click();
      await expect(page.getByRole("heading", { name: "Come ti ricontattiamo?" })).toBeVisible();
      await noOverflow(page);
      const bar = (await page.getByRole("button", { name: "Invia richiesta" }).boundingBox())!;
      for (const label of ["Nome", "Telefono", "Email", "Comune"]) {
        // «Comune» ha un elenco di suggerimenti (datalist): per il browser è un combobox
        const field = page.getByRole(label === "Comune" ? "combobox" : "textbox", { name: label, exact: true });
        await field.focus(); // il modulo lo porta al centro dello schermo: non deve finire sotto la barra fissa
        await page.waitForTimeout(900);
        const fb = (await field.boundingBox())!;
        expect(fb.y + fb.height, `${label} coperto dalla barra`).toBeLessThanOrEqual(bar.y + 1);
        expect(fb.height, `${label} troppo basso`).toBeGreaterThanOrEqual(48);
      }
      expect(bar.height).toBeGreaterThanOrEqual(48);
      await page.screenshot({ path: `${OUT}/modulo-contatti-${w}.png` });
    });
  });
}
