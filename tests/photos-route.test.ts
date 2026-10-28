/**
 * Rotta di caricamento foto (POST /api/leads/[id]/photos): richieste multipart reali verso il gestore della rotta,
 * database PGlite e disco temporanei. Nessuna rete, nessun dato di produzione.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";

const TMP = mkdtempSync(path.join(tmpdir(), "moto-photoroute-test-"));
Object.assign(process.env, {
  NODE_ENV: "test",
  PGLITE_DIR: path.join(TMP, "db"),
  UPLOADS_DIR: path.join(TMP, "uploads"),
  SESSION_SECRET: "test-secret-test-secret-test-secret-123456",
  DATABASE_URL: "",
  STORAGE_DRIVER: "",
  ADMIN_PASSWORD: "",
});

let POST: typeof import("@/app/api/leads/[id]/photos/route").POST;
let svc: typeof import("@/modules/leads/service");
let dbmod: typeof import("@/db/client");
let JPG: Buffer;
let lead: { id: string; uploadToken: string };

const submission = () => ({
  submissionId: randomUUID(),
  motorcycle: { brand: "Honda", modelId: "honda-sh", year: 2019, displacement: 125 },
  mileage: 18000,
  condition: { isRunning: true, accident: "no" as const, mechanicalIssues: "no" as const, maintenance: "yes" as const },
  contact: {
    firstName: "Mario", lastName: "Verdi", phone: "+393331234567", email: `m.${randomUUID().slice(0, 8)}@example.com`,
    city: "Milano", preferredContact: "phone" as const, privacyConsent: true as const,
  },
});

function req(id: string, token: string | null, files: { data: Buffer | string; name?: string }[], opts: { length?: string; type?: string } = {}) {
  const fd = new FormData();
  for (const f of files) {
    fd.append("photos", new Blob([f.data as BlobPart], { type: "image/jpeg" }), f.name ?? "foto.jpg");
    fd.append("photoIds", randomUUID());
  }
  const headers: Record<string, string> = {};
  if (token) headers["x-upload-token"] = token;
  if (opts.length) headers["content-length"] = opts.length;
  const body = opts.type ? "x" : fd;
  if (opts.type) headers["content-type"] = opts.type;
  return new Request(`http://localhost/api/leads/${id}/photos`, { method: "POST", headers, body });
}
const call = (r: Request, id: string) => POST(r, { params: Promise.resolve({ id }) } as never);

before(async () => {
  ({ POST } = await import("@/app/api/leads/[id]/photos/route"));
  svc = await import("@/modules/leads/service");
  dbmod = await import("@/db/client");
  JPG = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#2255aa" } }).jpeg().toBuffer();
  lead = await svc.createLead(submission());
});
after(async () => {
  await dbmod.closeDb();
  rmSync(TMP, { recursive: true, force: true });
});

describe("caricamento foto: richiesta valida", () => {
  test("senza Content-Length (come dietro certi proxy) la foto viene salvata", async () => {
    const res = await call(req(lead.id, lead.uploadToken, [{ data: JPG }]), lead.id);
    assert.equal(res.status, 200);
    const j = await res.json();
    assert.equal(j.saved, 1);
    assert.equal(j.results[0].status, "saved");
  });

  test("la foto salvata è associata alla richiesta giusta e si può rileggere dallo storage", async () => {
    const { getDb } = await import("@/db/client");
    const { leadPhotos } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const { getPhotoStorage } = await import("@/modules/photos/storage");
    const rows = await (await getDb()).select().from(leadPhotos).where(eq(leadPhotos.leadId, lead.id));
    assert.ok(rows.length >= 1);
    for (const r of rows) {
      assert.ok(r.storageKey.startsWith(`leads/${lead.id}/`));
      const data = await getPhotoStorage().get(r.storageKey);
      assert.ok(data && data.byteLength > 0);
      assert.equal((await sharp(data!).metadata()).format, "jpeg");
    }
  });

  test("Content-Length corretto e più foto insieme: tutte salvate", async () => {
    const files = [{ data: JPG }, { data: JPG }];
    const probe = req(lead.id, lead.uploadToken, files);
    const len = String((await probe.arrayBuffer()).byteLength);
    const res = await call(req(lead.id, lead.uploadToken, files, { length: len }), lead.id);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).saved, 2);
  });
});

describe("caricamento foto: richieste da rifiutare", () => {
  test("file che non è un'immagine (anche se si chiama .jpg): rifiutato con messaggio chiaro", async () => {
    const res = await call(req(lead.id, lead.uploadToken, [{ data: "questo non è un'immagine", name: "falsa.jpg" }]), lead.id);
    const j = await res.json();
    assert.equal(res.status, 200);
    assert.equal(j.results[0].status, "invalid");
    assert.match(j.results[0].message, /immagine/i);
  });

  test("file troppo pesante: rifiutato senza salvare nulla", async () => {
    const big = Buffer.alloc(3 * 1024 * 1024 + 10, 1);
    const res = await call(req(lead.id, lead.uploadToken, [{ data: big }], { length: "100" }), lead.id);
    const j = await res.json();
    assert.equal(j.results[0].status, "invalid");
    assert.match(j.results[0].message, /pesante/i);
  });

  test("dimensione dichiarata oltre il tetto → 413; token sbagliato → 403; formato non multipart → 415", async () => {
    assert.equal((await call(req(lead.id, lead.uploadToken, [{ data: JPG }], { length: String(50 * 1024 * 1024) }), lead.id)).status, 413);
    assert.equal((await call(req(lead.id, "token-sbagliato", [{ data: JPG }]), lead.id)).status, 403);
    assert.equal((await call(req(lead.id, lead.uploadToken, [{ data: JPG }], { type: "application/json" }), lead.id)).status, 415);
    assert.equal((await call(req("non-un-uuid", lead.uploadToken, [{ data: JPG }]), "non-un-uuid")).status, 400);
  });

  test("Content-Length non numerico → 400", async () => {
    assert.equal((await call(req(lead.id, lead.uploadToken, [{ data: JPG }], { length: "abc" }), lead.id)).status, 400);
  });
});

describe("caricamento foto: storage non disponibile", () => {
  test("se lo storage fallisce, l'esito è «error» (da riprovare) e nel database non resta nulla", async () => {
    const g = globalThis as unknown as { __photoStorage?: unknown };
    const real = g.__photoStorage;
    g.__photoStorage = {
      driver: "s3",
      put: async () => { throw new Error("connessione rifiutata"); },
      get: async () => null, delete: async () => {}, deletePrefix: async () => 0, list: async () => [],
    };
    try {
      const other = await svc.createLead(submission());
      const res = await call(req(other.id, other.uploadToken, [{ data: JPG }]), other.id);
      const j = await res.json();
      assert.equal(res.status, 200);
      assert.equal(j.results[0].status, "error");
      assert.match(j.results[0].message, /riprova/i);
      const { getDb } = await import("@/db/client");
      const { leadPhotos } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");
      assert.equal((await (await getDb()).select().from(leadPhotos).where(eq(leadPhotos.leadId, other.id))).length, 0);
    } finally {
      g.__photoStorage = real;
    }
  });
});
