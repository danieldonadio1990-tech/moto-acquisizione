/**
 * Diagnosi dell'upload foto: errori mostrati senza dati sensibili, controllo di storage/database/sharp dentro il sito.
 * Database PGlite e disco temporanei: nessuna rete, nessun dato di produzione.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";

const TMP = mkdtempSync(path.join(tmpdir(), "moto-diag-test-"));
Object.assign(process.env, {
  NODE_ENV: "test",
  PGLITE_DIR: path.join(TMP, "db"),
  UPLOADS_DIR: path.join(TMP, "uploads"),
  SESSION_SECRET: "test-secret-test-secret-test-secret-123456",
  DATABASE_URL: "",
  STORAGE_DRIVER: "",
  ADMIN_PASSWORD: "",
});

let diag: typeof import("@/modules/photos/diagnostics");
let upload: typeof import("@/modules/photos/upload");
let svc: typeof import("@/modules/leads/service");
let dbmod: typeof import("@/db/client");
let JPG: Buffer;

before(async () => {
  diag = await import("@/modules/photos/diagnostics");
  upload = await import("@/modules/photos/upload");
  svc = await import("@/modules/leads/service");
  dbmod = await import("@/db/client");
  JPG = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#2255aa" } }).jpeg().toBuffer();
});
after(async () => {
  await dbmod.closeDb();
  rmSync(TMP, { recursive: true, force: true });
});

const awsError = (name: string, status: number, message = "dettaglio con https://x.example/chiave?token=SEGRETO") =>
  Object.assign(new Error(message), { name, $metadata: { httpStatusCode: status } });

describe("informazioni non sensibili sugli errori", () => {
  test("nome e stato HTTP di un errore dello storage; il messaggio non viene mai restituito", () => {
    const info = diag.safeErrorInfo(awsError("NoSuchBucket", 404));
    assert.deepEqual(info, { name: "NoSuchBucket", httpStatus: 404 });
    assert.ok(!JSON.stringify(info).includes("SEGRETO"));
    assert.equal(diag.describeSafeError(info), "NoSuchBucket, HTTP 404");
  });
  test("errori di rete: il codice sta nella causa (ENOTFOUND, ETIMEDOUT…)", () => {
    const e = Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error("getaddrinfo ENOTFOUND host.interno"), { code: "ENOTFOUND" }) });
    const info = diag.safeErrorInfo(e);
    assert.equal(info.code, "ENOTFOUND");
    assert.ok(!JSON.stringify(info).includes("host.interno"));
  });
  test("nomi strani o con dati dentro vengono scartati", () => {
    assert.deepEqual(diag.safeErrorInfo(Object.assign(new Error("x"), { name: "password=abc def" })), { name: "Error" });
    assert.deepEqual(diag.safeErrorInfo("stringa"), { name: "Error" });
    assert.deepEqual(diag.safeErrorInfo(null), { name: "Error" });
  });
});

describe("controllo dell'upload dentro il sito", () => {
  test("tutto funzionante: sharp, database, scrittura, lettura, elenco e cancellazione riescono e non resta nulla", async () => {
    const r = await diag.runUploadCheck();
    assert.equal(r.ok, true);
    assert.deepEqual(r.steps.map((s) => s.ok), [true, true, true, true, true, true]);
    assert.equal(r.config.driver, "local");
    const { getPhotoStorage } = await import("@/modules/photos/storage");
    assert.deepEqual(await getPhotoStorage().list("healthcheck"), []);
  });

  test("storage che rifiuta le chiavi: il passo fallisce con nome e stato HTTP, i passi successivi non partono", async () => {
    const stub = {
      driver: "s3" as const,
      put: async () => { throw awsError("InvalidAccessKeyId", 403); },
      get: async () => null, delete: async () => {}, deletePrefix: async () => 0, list: async () => [],
    };
    const r = await diag.runUploadCheck(stub);
    assert.equal(r.ok, false);
    const failed = r.steps.filter((s) => !s.ok);
    assert.equal(failed.length, 1);
    assert.equal(failed[0].step, "storage: scrittura");
    assert.deepEqual(failed[0].error, { name: "InvalidAccessKeyId", httpStatus: 403 });
    assert.ok(!r.steps.some((s) => s.step === "storage: lettura"));
    assert.ok(!JSON.stringify(r).includes("SEGRETO"));
  });

  test("la risposta non contiene chiavi né variabili segrete", async () => {
    const r = await diag.runUploadCheck();
    const text = JSON.stringify(r).toLowerCase();
    for (const k of ["secret", "accesskey", "password", "token"]) assert.ok(!text.includes(k), k);
  });

  test("la rotta è riservata agli amministratori e controlla la sessione prima di tutto", () => {
    const src = readFileSync("src/app/api/admin/storage-check/route.ts", "utf8");
    assert.ok(src.indexOf("getAdminSession()") < src.indexOf("runUploadCheck()"));
    assert.match(src, /status: 401/);
    assert.match(src, /no-store/);
  });
});

describe("errore di salvataggio di una foto: il motivo vero è visibile", () => {
  test("storage non raggiungibile: esito «error», motivo «storage», codice tecnico nel messaggio, nessun dettaglio sensibile", async () => {
    const g = globalThis as unknown as { __photoStorage?: unknown };
    const real = g.__photoStorage;
    g.__photoStorage = {
      driver: "s3",
      put: async () => { throw awsError("NoSuchBucket", 404); },
      get: async () => null, delete: async () => {}, deletePrefix: async () => 0, list: async () => [],
    };
    try {
      const lead = await svc.createLead({
        submissionId: randomUUID(),
        motorcycle: { brand: "Honda", modelId: "honda-sh", year: 2019, displacement: 125 },
        mileage: 1000,
        condition: { isRunning: true, accident: "no", mechanicalIssues: "no", maintenance: "yes" },
        contact: { firstName: "A", lastName: "B", phone: "+393331234567", email: `d.${randomUUID().slice(0, 6)}@example.invalid`, city: "Milano", preferredContact: "email", privacyConsent: true },
      } as never);
      const [res] = await upload.savePhotos(lead.id, [{ clientPhotoId: randomUUID(), data: JPG }]);
      assert.equal(res.status, "error");
      assert.equal(res.reason, "storage");
      assert.equal(res.detail, "NoSuchBucket, HTTP 404");
      assert.match(res.message!, /NoSuchBucket/);
      assert.ok(!res.message!.includes("SEGRETO"));
    } finally {
      g.__photoStorage = real;
    }
  });
});
