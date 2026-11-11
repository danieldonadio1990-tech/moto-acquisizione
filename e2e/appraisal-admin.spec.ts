import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";

/**
 * Scheda di valutazione nel back office, nel sito vero in LOCALE (database di prova): parametri approvati, comparabili, revisioni,
 * criteri incompatibili, prima offerta manuale. SOLO su un ambiente di prova: crea una richiesta e una versione dei parametri.
 * Importi SIMULATI (passaggio e altri costi = 150 € inventato per la prova).
 *   E2E_BASE_URL=http://127.0.0.1:3123 E2E_ADMIN_EMAIL=… E2E_ADMIN_PASSWORD=… npx playwright test e2e/appraisal-admin.spec.ts
 * Il server di prova deve avere VALUATION_ALLOW_SELF_APPROVAL=true (un solo admin) e nessuna notifica configurata.
 */
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "";
const OUT = "test-results/appraisal-admin";

async function login(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Accedi" }).click();
  await expect(page.getByRole("heading", { name: "Richieste" })).toBeVisible({ timeout: 30_000 });
}

test("scheda di valutazione: costi non configurati, poi configurati; compatibile, incompatibile, manuale", async ({ page }) => {
  test.skip(!ADMIN_PASSWORD || !ADMIN_EMAIL, "Imposta E2E_ADMIN_EMAIL ed E2E_ADMIN_PASSWORD (solo ambiente di prova)");
  test.setTimeout(240_000);
  mkdirSync(OUT, { recursive: true });
  page.on("dialog", (d) => d.accept());

  // richiesta di prova dal modulo pubblico (API), come farebbe un cliente
  const res = await page.request.post("/api/leads", {
    data: {
      submissionId: randomUUID(),
      motorcycle: { brand: "Honda", modelId: "honda-sh", year: 2019, displacement: 125 },
      mileage: 18000,
      condition: { isRunning: true, accident: "no", mechanicalIssues: "no", maintenance: "yes" },
      contact: { firstName: "Prova", lastName: "Scheda", phone: "+393330000000", email: `scheda-${Date.now()}@example.invalid`, city: "Milano", preferredContact: "phone", privacyConsent: true },
    },
  });
  expect(res.status()).toBe(201);
  const { id } = (await res.json()) as { id: string };

  await login(page);
  await page.goto(`/admin/lead/${id}`);
  const panel = page.getByTestId("appraisal-panel");
  await expect(panel).toBeVisible({ timeout: 60_000 });
  await expect(panel.getByText(/Parametri della scheda non configurati/)).toBeVisible();

  // parametri: bozza del titolare + passaggio/altri costi SIMULATI, poi approvazione
  await page.goto("/admin/valutazione");
  await page.getByLabel(/Passaggio di proprietà e altri costi/).fill("150");
  await page.getByLabel(/Sconto prima offerta: proposto/).fill("350");
  await page.getByRole("button", { name: "Salva come bozza" }).click();
  await expect(page.getByText(/Bozza salvata/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /Approva versione/ }).first().click();
  await page.waitForTimeout(1500);

  // comparabili (prezzi richiesti simulati)
  await page.goto(`/admin/lead/${id}`);
  await panel.getByRole("button", { name: /Aggiungi un annuncio comparabile/ }).click();
  for (const price of ["2300", "2400", "2500"]) {
    await panel.getByLabel("Link dell'annuncio").fill(`https://annunci.example.invalid/sh-${price}`);
    await panel.getByLabel("Prezzo richiesto (€)").fill(price);
    await panel.getByLabel("Anno").fill("2019");
    await panel.getByLabel("Chilometri").fill("20000");
    await panel.getByRole("button", { name: "Aggiungi comparabile" }).click();
    await expect(panel.getByText("Comparabile aggiunto")).toBeVisible({ timeout: 30_000 });
    // il riquadro resta aperto e il modulo si svuota per l'annuncio successivo
    await expect(panel.getByLabel("Prezzo richiesto (€)")).toHaveValue("");
  }
  await page.reload();
  await expect(panel.getByText(/Annunci comparabili \(3\)/)).toBeVisible();

  // caso compatibile: rivendita 3.800 → massimo 2.700, prima offerta 2.400 − 350 = 2.050
  await panel.getByLabel("Valore dei comparabili (€)").fill("2400");
  await panel.getByLabel("Valore di rivendita previsto (€)").fill("3800");
  await panel.getByLabel(/Motivo del valore di rivendita/).fill("stima interna di prova");
  await panel.getByLabel("Sconto della prima offerta (€)").fill("350");
  await panel.getByRole("button", { name: "Calcola e salva la revisione" }).click();
  await expect(panel.getByText("Revisione salvata")).toBeVisible({ timeout: 30_000 });
  await page.reload();
  const values = panel.getByLabel("Valori della scheda");
  await expect(values).toContainText("€ 2.700");
  await expect(values).toContainText("€ 2.050");
  await page.screenshot({ path: `${OUT}/compatibile.png`, fullPage: true });

  // caso incompatibile: rivendita 2.900 → massimo 1.800 < 2.050: avviso, nessuna offerta calcolata
  await panel.getByLabel("Valore di rivendita previsto (€)").fill("2900");
  await panel.getByRole("button", { name: "Calcola e salva la revisione" }).click();
  await expect(panel.getByText("Revisione salvata")).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await expect(panel.getByText(/Criteri incompatibili/)).toBeVisible();
  await expect(values).toContainText("Non calcolata");

  // manuale oltre il massimo: rifiutata; entro il massimo con motivo: salvata
  await panel.getByLabel(/Prima offerta manuale/).fill("1900");
  await panel.getByLabel("Motivo della prima offerta manuale").fill("prova oltre il massimo");
  await panel.getByRole("button", { name: "Calcola e salva la revisione" }).click();
  await expect(panel.getByRole("alert").filter({ hasText: /supera il massimo sostenibile/ })).toBeVisible({ timeout: 30_000 });
  await panel.getByLabel(/Prima offerta manuale/).fill("1700");
  await panel.getByLabel("Motivo della prima offerta manuale").fill("allineata al massimo sostenibile");
  await panel.getByLabel("Prezzo obiettivo di acquisto (€)").fill("1900");
  await panel.getByLabel(/Motivo del prezzo obiettivo/).fill("richiesta del cliente");
  await panel.getByRole("button", { name: "Calcola e salva la revisione" }).click();
  await expect(panel.getByText("Revisione salvata")).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await expect(values).toContainText("€ 1.700");
  await expect(panel.getByText(/Il prezzo obiettivo .* supera il massimo sostenibile/)).toBeVisible();
  await expect(panel.getByText(/Revisioni \(4\)/)).toBeVisible();
  await page.screenshot({ path: `${OUT}/manuale-e-obiettivo.png`, fullPage: true });

  // il pannello non è raggiungibile senza login
  const anon = await (await page.context().browser()!.newContext()).request.get(`/admin/lead/${id}`, { maxRedirects: 0 });
  expect([302, 303, 307, 308]).toContain(anon.status());
});
