/**
 * SMOKE TEST — percorso completo, da eseguire dopo ogni deploy (anche in produzione).
 * Crea UNA richiesta di prova con email smoke-test@example.invalid: dopo il test in produzione
 * cancellarla con  npm run privacy:erase -- --email smoke-test@example.invalid --yes
 */
import { expect, test } from "@playwright/test";
import path from "node:path";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "admin@example.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "";
const PHOTO = path.join(__dirname, "fixtures", "moto-gps.jpg");

test("landing → funnel → foto → admin → offerta → acquisto", async ({ page, context }) => {
  test.skip(!ADMIN_PASSWORD, "Imposta E2E_ADMIN_PASSWORD");
  const stamp = Date.now().toString().slice(-6);
  const name = `Smoke${stamp}`;

  // Landing
  await page.goto("/?utm_source=smoke&utm_medium=test&utm_campaign=e2e");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Vuoi vendere la tua moto?");
  await page.getByRole("link", { name: "Valuta la tua moto" }).first().click();
  await expect(page).toHaveURL(/\/valuta$/);

  // Step 1–3
  await page.getByText("Honda", { exact: true }).click();
  await page.getByText("SH", { exact: true }).click();
  await page.getByText("125 cc", { exact: true }).click();
  await page.getByLabel("Anno di immatricolazione").selectOption("2019");
  await page.getByRole("button", { name: "Continua" }).click();
  await page.keyboard.type("18500");
  await page.getByRole("button", { name: "Continua" }).click();
  for (const [q, a] of [["funzionante", "Sì"], ["incidenti", "No"], ["meccanici", "No"], ["manutenzione", "Sì"]]) {
    await page.locator("fieldset", { hasText: q }).getByText(a, { exact: true }).click();
  }
  await page.getByRole("button", { name: "Continua" }).click();

  // Contatti (consenso obbligatorio)
  await page.getByLabel("Nome", { exact: true }).fill(name);
  await page.getByLabel("Cognome").fill("Test");
  await page.getByRole("textbox", { name: "Telefono" }).fill("3330000000");
  await page.getByRole("textbox", { name: "Email" }).fill("smoke-test@example.invalid");
  await page.getByLabel("Comune").fill("Milano");
  await page.getByRole("button", { name: "Invia richiesta" }).click();
  await expect(page.getByText("Serve il consenso per ricontattarti")).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Invia richiesta" }).click();

  // Foto
  await expect(page.getByRole("heading", { name: "Aggiungi qualche foto" })).toBeVisible();
  await page.locator("input[type=file]").setInputFiles([PHOTO, PHOTO]);
  await expect(page.getByText("2/12 foto")).toBeVisible();
  await page.getByRole("button", { name: "Invia le foto" }).click();
  await expect(page.getByRole("heading", { name: "Richiesta ricevuta" })).toBeVisible({ timeout: 30_000 });
  const code = (await page.locator(".tracking-widest").innerText()).trim();

  // Admin
  const admin = await context.newPage();
  await admin.goto("/admin");
  await expect(admin).toHaveURL(/\/admin\/login/);
  await admin.getByLabel("Email").fill(ADMIN_EMAIL);
  await admin.getByLabel("Password").fill(ADMIN_PASSWORD);
  await admin.getByRole("button", { name: "Accedi" }).click();
  await expect(admin.getByRole("heading", { name: "Richieste" })).toBeVisible();
  await admin.getByRole("link", { name: `${name} Test` }).first().click();
  await expect(admin.getByText(`Richiesta ${code}`)).toBeVisible();
  await expect(admin.getByRole("heading", { name: "Foto (2)" })).toBeVisible();

  // le foto arrivano dallo storage e solo con login
  const src = await admin.locator("img[alt='Foto moto']").first().getAttribute("src");
  const withLogin = await admin.request.get(src!);
  expect(withLogin.status()).toBe(200);
  expect(withLogin.headers()["content-type"]).toBe("image/jpeg");
  const anon = await (await context.browser()!.newContext()).request.get(new URL(src!, admin.url()).toString());
  expect(anon.status()).toBe(401);

  // Stato → offerta accettata → acquisto (prezzo pagato diverso dall'offerta)
  await admin.getByLabel("Cambia stato").selectOption("appointment");
  await admin.getByRole("button", { name: "Aggiorna" }).click();
  await expect(admin.getByText("Stato aggiornato")).toBeVisible();
  await expect(admin.getByText("Nuova → Appuntamento")).toBeVisible();
  await admin.getByLabel("Nuova offerta (€)").fill("1700");
  await admin.getByRole("button", { name: "Registra", exact: true }).click();
  await expect(admin.getByText("Offerta registrata")).toBeVisible();
  await admin.getByRole("button", { name: "Accettata" }).click();
  await expect(admin.getByLabel("Prezzo pagato (€)")).toHaveValue("1700");
  await admin.getByLabel("Prezzo pagato (€)").fill("1650");
  await admin.getByRole("button", { name: "Registra acquisto" }).click();
  await expect(admin.getByText(/Acquistata il/)).toBeVisible();

  console.log(`\nRichiesta di prova ${code} creata. In produzione cancellala con:\n  npm run privacy:erase -- --email smoke-test@example.invalid --yes\n`);
});

test("pagine di servizio: 404, robots, sitemap, privacy", async ({ page, request }) => {
  const r = await page.goto("/pagina-che-non-esiste");
  expect(r?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Pagina non trovata" })).toBeVisible();
  expect((await request.get("/robots.txt")).status()).toBe(200);
  expect((await request.get("/sitemap.xml")).status()).toBe(200);
  await page.goto("/privacy");
  await expect(page.getByText(/Versione/)).toBeVisible();
});
