/**
 * Conservazione delle foto: scadenza a 15 giorni dal caricamento, occultamento immediato (prima ancora della
 * cancellazione fisica), cancellazione reale dallo storage con la riga rimossa solo dopo, gestione degli errori
 * transitori con riprova, isolamento tra richieste, compatibilità con la cancellazione privacy.
 * Database PGlite e disco temporanei. Nessuna rete, nessun dato di produzione.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";

const TMP = mkdtempSync(path.join(tmpdir(), "moto-photoretention-test-"));
Object.assign(process.env, {
  NODE_ENV: "test",
  PGLITE_DIR: path.join(TMP, "db"),
  UPLOADS_DIR: path.join(TMP, "uploads"),
  SESSION_SECRET: "test-secret-test-secret-test-secret-123456",
  DATABASE_URL: "",
  STORAGE_DRIVER: "",
  ADMIN_PASSWORD: "",
});

let svc: typeof import("@/modules/leads/service");
let erasure: typeof import("@/modules/privacy/erasure");
let retention: typeof import("@/modules/photos/retention");
let dbmod: typeof import("@/db/client");
let schema: typeof import("@/db/schema");
let orm: typeof import("drizzle-orm");
let storageMod: typeof import("@/modules/photos/storage");
let JPG: Buffer;

const DAY_MS = 24 * 60 * 60 * 1000;

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

/** Carica una foto vera per il lead e restituisce la riga appena inserita (via savePhotos, come la rotta reale). */
async function uploadOne(leadId: string) {
  const { savePhotos } = await import("@/modules/photos/upload");
  const [result] = await savePhotos(leadId, [{ clientPhotoId: randomUUID(), data: JPG }]);
  assert.equal(result.status, "saved");
  const db = await dbmod.getDb();
  const [row] = await db.select().from(schema.leadPhotos).where(orm.eq(schema.leadPhotos.leadId, leadId)).orderBy(orm.desc(schema.leadPhotos.createdAt));
  return row;
}

/** Retrodata il caricamento di una foto (solo per il test: simula il passaggio del tempo). */
async function backdate(photoId: string, daysAgo: number) {
  const db = await dbmod.getDb();
  await db.update(schema.leadPhotos).set({ createdAt: new Date(Date.now() - daysAgo * DAY_MS) }).where(orm.eq(schema.leadPhotos.id, photoId));
}

before(async () => {
  svc = await import("@/modules/leads/service");
  erasure = await import("@/modules/privacy/erasure");
  retention = await import("@/modules/photos/retention");
  dbmod = await import("@/db/client");
  schema = await import("@/db/schema");
  orm = await import("drizzle-orm");
  storageMod = await import("@/modules/photos/storage");
  JPG = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#2255aa" } }).jpeg().toBuffer();
  await dbmod.getDb();
});
after(async () => {
  await dbmod.closeDb();
  rmSync(TMP, { recursive: true, force: true });
});

describe("scadenza a 15 giorni", () => {
  test("una foto di 14 giorni non è scaduta, una di 16 giorni sì", () => {
    const now = new Date();
    assert.equal(retention.isPhotoExpired(new Date(now.getTime() - 14 * DAY_MS), 15, now), false);
    assert.equal(retention.isPhotoExpired(new Date(now.getTime() - 16 * DAY_MS), 15, now), true);
  });

  test("foto scaduta: nascosta immediatamente da getLeadDetail e getPhotoForAdmin, ma il file esiste ANCORA sullo storage (non è stata ancora cancellata fisicamente)", async () => {
    const lead = await svc.createLead(submission());
    const photo = await uploadOne(lead.id);
    await backdate(photo.id, 31);

    const detail = await svc.getLeadDetail(lead.id);
    assert.equal(detail!.photos.length, 0, "la foto scaduta non deve comparire nella scheda");

    const forAdmin = await svc.getPhotoForAdmin(photo.id);
    assert.equal(forAdmin, null, "la foto scaduta non deve essere scaricabile");

    const stillThere = await storageMod.getPhotoStorage().get(photo.storageKey);
    assert.ok(stillThere && stillThere.byteLength > 0, "il file deve esistere ancora: l'occultamento è logico, la pulizia fisica è un passo separato");
  });
});

describe("pulizia reale dello storage", () => {
  test("cancellazione effettiva: dopo la pulizia il file NON esiste più sullo storage e la riga è rimossa", async () => {
    const lead = await svc.createLead(submission());
    const photo = await uploadOne(lead.id);
    await backdate(photo.id, 31);

    const result = await retention.purgeExpiredPhotos();
    assert.ok(result.checked >= 1);
    assert.ok(result.deleted >= 1);
    assert.equal(result.failed, 0);

    const gone = await storageMod.getPhotoStorage().get(photo.storageKey);
    assert.equal(gone, null, "il file deve essere realmente assente dallo storage, non solo la riga dal database");

    const db = await dbmod.getDb();
    const rows = await db.select().from(schema.leadPhotos).where(orm.eq(schema.leadPhotos.id, photo.id));
    assert.equal(rows.length, 0);
  });

  test("foto non scadute: la pulizia non le tocca (né il file né la riga)", async () => {
    const lead = await svc.createLead(submission());
    const fresh = await uploadOne(lead.id);

    await retention.purgeExpiredPhotos();

    const stillThere = await storageMod.getPhotoStorage().get(fresh.storageKey);
    assert.ok(stillThere && stillThere.byteLength > 0);
    const db = await dbmod.getDb();
    assert.equal((await db.select().from(schema.leadPhotos).where(orm.eq(schema.leadPhotos.id, fresh.id))).length, 1);
  });

  test("isolamento tra richieste: scadenza di una NON tocca le foto, scadute o no, di un'altra", async () => {
    const leadA = await svc.createLead(submission());
    const leadB = await svc.createLead(submission());
    const photoA = await uploadOne(leadA.id);
    const photoB = await uploadOne(leadB.id);
    await backdate(photoA.id, 31); // solo A è scaduta

    await retention.purgeExpiredPhotos();

    const db = await dbmod.getDb();
    assert.equal((await db.select().from(schema.leadPhotos).where(orm.eq(schema.leadPhotos.id, photoA.id))).length, 0, "A cancellata");
    assert.equal((await db.select().from(schema.leadPhotos).where(orm.eq(schema.leadPhotos.id, photoB.id))).length, 1, "B intatta");
    const bStillThere = await storageMod.getPhotoStorage().get(photoB.storageKey);
    assert.ok(bStillThere && bStillThere.byteLength > 0, "il file di B non è stato toccato");
  });
});

describe("errori transitori e riprova", () => {
  test("se la cancellazione dallo storage fallisce, la riga NON viene cancellata; al giro successivo (storage di nuovo funzionante) la pulizia riesce", async () => {
    const lead = await svc.createLead(submission());
    const photo = await uploadOne(lead.id);
    await backdate(photo.id, 31);

    const g = globalThis as unknown as { __photoStorage?: unknown };
    const real = g.__photoStorage;
    g.__photoStorage = {
      driver: "local",
      put: async () => {},
      get: async () => null,
      delete: async () => { throw new Error("storage temporaneamente non raggiungibile"); },
      deletePrefix: async () => 0,
      list: async () => [],
    };
    try {
      const attempt1 = await retention.purgeExpiredPhotos();
      assert.equal(attempt1.failed, 1, "il fallimento dello storage deve essere contato, non ignorato né lanciato come eccezione");
      const db = await dbmod.getDb();
      assert.equal((await db.select().from(schema.leadPhotos).where(orm.eq(schema.leadPhotos.id, photo.id))).length, 1, "la riga resta: si riprova al giro dopo");
    } finally {
      g.__photoStorage = real;
    }

    // ripristinato lo storage reale: il giro successivo deve riuscire sulla stessa foto, ancora scaduta
    const attempt2 = await retention.purgeExpiredPhotos();
    assert.ok(attempt2.deleted >= 1);
    const db = await dbmod.getDb();
    assert.equal((await db.select().from(schema.leadPhotos).where(orm.eq(schema.leadPhotos.id, photo.id))).length, 0, "ora cancellata");
  });

  test("la pulizia è idempotente: un secondo giro senza nulla da cancellare non trova candidate e non fallisce", async () => {
    const before = await retention.purgeExpiredPhotos();
    assert.equal(before.failed, 0);
    const again = await retention.purgeExpiredPhotos();
    assert.equal(again.failed, 0);
  });
});

describe("compatibilità con la cancellazione privacy", () => {
  test("cancellare la richiesta rimuove anche foto NON ancora scadute (e il relativo file)", async () => {
    const lead = await svc.createLead(submission());
    const photo = await uploadOne(lead.id);

    await erasure.eraseLead(lead.id);

    const gone = await storageMod.getPhotoStorage().get(photo.storageKey);
    assert.equal(gone, null);
    const rep = await erasure.remainingReferences([lead.id]);
    assert.equal(rep.photos, 0);
  });
});

describe("accesso riservato agli amministratori", () => {
  test("la rotta di consultazione foto controlla la sessione admin prima di leggere qualunque dato", () => {
    const src = readFileSync("src/app/api/admin/photos/[id]/route.ts", "utf8");
    const body = src.slice(src.indexOf("export async function GET"));
    assert.match(body, /getAdminSession\(\)/);
    assert.match(body, /status:\s*401/);
    const authLine = body.indexOf("getAdminSession()");
    const return404 = body.indexOf("404");
    assert.ok(authLine < return404, "il controllo di sessione deve avvenire prima di qualunque lettura della foto");
  });
});
