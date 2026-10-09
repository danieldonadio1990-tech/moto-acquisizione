import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke test end-to-end: percorso completo landing → funnel → foto → admin → offerta → acquisto.
 *   E2E_BASE_URL=https://… E2E_ADMIN_EMAIL=… E2E_ADMIN_PASSWORD=… npm run test:e2e
 * Senza E2E_BASE_URL usa http://localhost:3000 (avviare prima il server).
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    ...devices["Pixel 7"],
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : undefined,
  },
});
