/**
 * Test di integrazione: database reale (PGlite in una cartella temporanea) e storage su disco temporaneo.
 * Esecuzione: npm test
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";

const TMP = mkdtempSync(path.join(tmpdir(), "moto-test-"));
Object.assign(process.env, {
  NODE_ENV: "test",
  PGLITE_DIR: path.join(TMP, "db"),
  UPLOADS_DIR: path.join(TMP, "uploads"),
  SESSION_SECRET: "test-secret-test-secret-test-secret-123456",
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
  STORAGE_DRIVER: process.env.TEST_STORAGE === "s3" ? "s3" : "",
  ADMIN_PASSWORD: "",
});
// TEST_DATABASE_URL=postgres://… → stessi test su PostgreSQL reale
// TEST_STORAGE=s3 (+ variabili S3_*) → stessi test su storage S3-compatibile

type Svc = typeof import("@/modules/leads/service");
let svc: Svc;
let photos: typeof import("@/modules/photos/upload");
let erasure: typeof import("@/modules/privacy/erasure");
let dbmod: typeof import("@/db/client");
let schema: typeof import("@/db/schema");
let drizzle: typeof import("drizzle-orm");
let JPG: Buffer;

const submission = (over: Record<string, unknown> = {}) => ({
  submissionId: randomUUID(),
  motorcycle: { brand: "Honda", modelId: "honda-sh", year: 2019, displacement: 125 },
  mileage: 18000,
  condition: { isRunning: true, accident: "no" as const, mechanicalIssues: "no" as const, maintenance: "yes" as const },
  contact: {
    firstName: "Mario",
    lastName: "Verdi",
    phone: "+393331234567",
    email: `mario.${randomUUID().slice(0, 8)}@example.com`,
    city: "Milano",
    preferredContact: "whatsapp" as const,
    privacyConsent: true as const,
  },
  ...over,
});

before(async () => {
  svc = await import("@/modules/leads/service");
  photos = await import("@/modules/photos/upload");
  erasure = await import("@/modules/privacy/erasure");
  dbmod = await import("@/db/client");
  schema = await import("@/db/schema");
  drizzle = await import("drizzle-orm");
  JPG = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#2255aa" } }).jpeg().toBuffer();
});

after(async () => {
  await dbmod.closeDb();
  rmSync(TMP, { recursive: true, force: true });
});

let storage: import("@/modules/photos/storage").PhotoStorage;
/** File realmente presenti nello storage per un lead (disco o S3) */
const uploadsOf = async (leadId: string) => {
  storage ??= (await import("@/modules/photos/storage")).getPhotoStorage();
  const keys = await storage.list(`leads/${leadId}`);
  if (storage.driver === "local") {
    const dir = path.join(TMP, "uploads", "leads", leadId);
    assert.equal(keys.length, existsSync(dir) ? readdirSync(dir).length : 0);
  }
  return keys;
};

describe("1. Idempotenza lead", () => {
  test("stesso submissionId due volte → stesso lead e stesso token", async () => {
    const s = submission();
    const a = await svc.createLead(s);
    const b = await svc.createLead(s);
    assert.equal(a.id, b.id);
    assert.equal(a.uploadToken, b.uploadToken);
    assert.equal(a.duplicate, false);
    assert.equal(b.duplicate, true);
  });

  test("10 richieste simultanee con lo stesso submissionId → un solo lead", async () => {
    const s = submission();
    const res = await Promise.all(Array.from({ length: 10 }, () => svc.createLead(s)));
    assert.equal(new Set(res.map((r) => r.id)).size, 1);
    const db = await dbmod.getDb();
    const rows = await db.select().from(schema.leads).where(drizzle.eq(schema.leads.submissionId, s.submissionId));
    assert.equal(rows.length, 1);
    const customers = await db
      .select()
      .from(schema.customers)
      .where(drizzle.eq(schema.customers.email, s.contact.email));
    assert.equal(customers.length, 1, "nessun cliente orfano dalle transazioni annullate");
  });

  test("submissionId diversi → lead diversi", async () => {
    const a = await svc.createLead(submission());
    const b = await svc.createLead(submission());
    assert.notEqual(a.id, b.id);
  });

  test("token foto: valido, sbagliato, scaduto", async () => {
    const a = await svc.createLead(submission());
    assert.equal(await svc.verifyUploadToken(a.id, a.uploadToken), true);
    assert.equal(await svc.verifyUploadToken(a.id, "x".repeat(43)), false);
    const db = await dbmod.getDb();
    await db
      .update(schema.leads)
      .set({ photoUploadTokenExpiresAt: new Date(Date.now() - 1000) })
      .where(drizzle.eq(schema.leads.id, a.id));
    assert.equal(await svc.verifyUploadToken(a.id, a.uploadToken), false);
  });
});

describe("6–7. Foto: niente duplicati, limite atomico", () => {
  test("retry con lo stesso id foto → nessuna copia", async () => {
    const lead = await svc.createLead(submission());
    const id = randomUUID();
    const r1 = await photos.savePhotos(lead.id, [{ clientPhotoId: id, data: JPG }]);
    const r2 = await photos.savePhotos(lead.id, [{ clientPhotoId: id, data: JPG }]);
    assert.equal(r1[0].status, "saved");
    assert.equal(r2[0].status, "duplicate");
    assert.equal((await uploadsOf(lead.id)).length, 1);
  });

  test("retry simultaneo della stessa foto → una sola copia", async () => {
    const lead = await svc.createLead(submission());
    const id = randomUUID();
    await Promise.all(Array.from({ length: 5 }, () => photos.savePhotos(lead.id, [{ clientPhotoId: id, data: JPG }])));
    assert.equal((await uploadsOf(lead.id)).length, 1);
  });

  test("10 richieste simultanee da 2 foto → al massimo 12, contatore e file coerenti", async () => {
    const lead = await svc.createLead(submission());
    await Promise.all(
      Array.from({ length: 10 }, () =>
        photos.savePhotos(lead.id, [
          { clientPhotoId: randomUUID(), data: JPG },
          { clientPhotoId: randomUUID(), data: JPG },
        ]),
      ),
    );
    const db = await dbmod.getDb();
    const rows = await db.select().from(schema.leadPhotos).where(drizzle.eq(schema.leadPhotos.leadId, lead.id));
    const [l] = await db.select().from(schema.leads).where(drizzle.eq(schema.leads.id, lead.id));
    assert.equal(rows.length, 12);
    assert.equal(l.photoCount, 12);
    assert.equal((await uploadsOf(lead.id)).length, 12, "nessun file orfano oltre il limite");
  });

  test("file non immagine → rifiutato, nessun file salvato", async () => {
    const lead = await svc.createLead(submission());
    const r = await photos.savePhotos(lead.id, [{ clientPhotoId: randomUUID(), data: Buffer.from("<html>no</html>") }]);
    assert.equal(r[0].status, "invalid");
    assert.equal((await uploadsOf(lead.id)).length, 0);
  });

  test("il database impedisce di superare 12 anche aggirando il codice", async () => {
    const lead = await svc.createLead(submission());
    const db = await dbmod.getDb();
    await assert.rejects(
      db.update(schema.leads).set({ photoCount: 13 }).where(drizzle.eq(schema.leads.id, lead.id)),
    );
  });
});

describe("11. Coerenza offerte / acquisto", () => {
  test("offerta e prezzo pagato restano distinti", async () => {
    const lead = await svc.createLead(submission());
    await svc.addOffer(lead.id, 1700, "admin@test");
    await svc.recordPurchase(lead.id, 1650, todayRome(), "admin@test");
    const d = await svc.getLeadDetail(lead.id);
    assert.equal(d!.offers[0].amount, 1700);
    assert.equal(d!.lead.purchasePrice, 1650);
    assert.equal(d!.lead.status, "purchased");
  });

  test("lead acquistato: cambio stato rifiutato (serve 'Annulla acquisto')", async () => {
    const lead = await svc.createLead(submission());
    await svc.recordPurchase(lead.id, 1500, todayRome(), "admin@test");
    await assert.rejects(svc.changeStatus(lead.id, "new", "admin@test"), svc.BusinessRuleError);
    await assert.rejects(svc.addOffer(lead.id, 1000, "admin@test"), svc.BusinessRuleError);
  });

  test("il database rifiuta prezzo pagato su un lead non acquistato (e viceversa)", async () => {
    const lead = await svc.createLead(submission());
    const db = await dbmod.getDb();
    await assert.rejects(
      db.update(schema.leads).set({ purchasePrice: 1000, purchasedAt: new Date() }).where(drizzle.eq(schema.leads.id, lead.id)),
    );
    await assert.rejects(db.update(schema.leads).set({ status: "purchased" }).where(drizzle.eq(schema.leads.id, lead.id)));
  });

  test("annulla acquisto → stato precedente e prezzo azzerato", async () => {
    const lead = await svc.createLead(submission());
    await svc.changeStatus(lead.id, "appointment", "admin@test");
    await svc.recordPurchase(lead.id, 1500, todayRome(), "admin@test");
    await svc.undoPurchase(lead.id, "admin@test");
    const d = await svc.getLeadDetail(lead.id);
    assert.equal(d!.lead.status, "appointment");
    assert.equal(d!.lead.purchasePrice, null);
    assert.equal(d!.lead.purchasedAt, null);
  });

  test("una sola offerta accettata: la precedente diventa 'superata'", async () => {
    const lead = await svc.createLead(submission());
    await svc.addOffer(lead.id, 1500, "a");
    await svc.addOffer(lead.id, 1600, "a");
    const d0 = await svc.getLeadDetail(lead.id);
    const [o1600, o1500] = d0!.offers;
    await svc.setOfferStatus(o1500.id, "accepted", "a");
    await svc.setOfferStatus(o1600.id, "accepted", "a");
    const d = await svc.getLeadDetail(lead.id);
    const byAmount = Object.fromEntries(d!.offers.map((o) => [o.amount, o.status]));
    assert.deepEqual(byAmount, { 1500: "superseded", 1600: "accepted" });
    await assert.rejects(svc.setOfferStatus(o1500.id, "accepted", "a"), svc.BusinessRuleError);
  });

  test("rifiutare una proposta non chiude il lead se c'è già un'offerta accettata", async () => {
    const lead = await svc.createLead(submission());
    await svc.addOffer(lead.id, 1500, "a");
    const [o1] = (await svc.getLeadDetail(lead.id))!.offers;
    await svc.setOfferStatus(o1.id, "accepted", "a");
    await svc.addOffer(lead.id, 1400, "a");
    const o2 = (await svc.getLeadDetail(lead.id))!.offers.find((o) => o.amount === 1400)!;
    await svc.setOfferStatus(o2.id, "rejected", "a");
    assert.equal((await svc.getLeadDetail(lead.id))!.lead.status, "accepted");
  });

  test("date di acquisto non valide", async () => {
    const lead = await svc.createLead(submission());
    for (const bad of ["2026-02-30", "2026-13-01", "2099-01-01", "2020-01-01", "08/10/2026"]) {
      await assert.rejects(svc.recordPurchase(lead.id, 1000, bad, "a"), svc.BusinessRuleError, bad);
    }
    assert.equal(svc.parseCalendarDate("2024-02-29")?.getUTCDate(), 29);
  });
});

describe("4. Cancellazione dati", () => {
  test("cancella tutto e non lascia dati personali in nessuna tabella né file", async () => {
    const s = submission({
      contact: { ...submission().contact, firstName: "Ugolina", lastName: "Zappacosta", phone: "+393479998877", email: "ugolina.z@example.org" },
    });
    const lead = await svc.createLead(s);
    await photos.savePhotos(lead.id, [
      { clientPhotoId: randomUUID(), data: JPG },
      { clientPhotoId: randomUUID(), data: JPG },
    ]);
    await svc.addOffer(lead.id, 1800, "admin@test");
    await svc.updateNotes(lead.id, "Ugolina chiede ritiro a domicilio");
    await svc.recordPurchase(lead.id, 1750, todayRome(), "admin@test");
    assert.equal((await uploadsOf(lead.id)).length, 2);

    const db = await dbmod.getDb();
    const eventsBefore = await db.select().from(schema.events);

    const found = await erasure.findSubjects({ email: "UGOLINA.Z@example.org" });
    assert.equal(found.length, 1);
    const [report] = await erasure.eraseSubjects(found.map((f) => f.leadId));
    assert.equal(report.storageObjectsDeleted, 2);

    // nessun file
    assert.equal((await uploadsOf(lead.id)).length, 0);
    // nessuna traccia in NESSUNA tabella: scansione testuale di tutto il database
    const needles = ["Ugolina", "Zappacosta", "479998877", "ugolina.z@example.org", lead.code, lead.id];
    const tables = await db.execute<{ table_name: string }>(
      drizzle.sql`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`,
    );
    const tableRows = "rows" in tables ? (tables.rows as { table_name: string }[]) : (tables as unknown as { table_name: string }[]);
    for (const { table_name } of tableRows) {
      const dump = await db.execute(drizzle.sql.raw(`select t::text as r from "${table_name}" t`));
      const text = JSON.stringify(dump);
      for (const n of needles) assert.ok(!text.includes(n), `"${n}" ancora presente in ${table_name}`);
    }
    // eventi anonimizzati, non cancellati: i conteggi aggregati restano
    const eventsAfter = await db.select().from(schema.events);
    assert.equal(eventsAfter.length, eventsBefore.length);
    assert.deepEqual(await erasure.remainingReferences([lead.id]), { leads: 0, events: 0, photos: 0 });
  });

  test("ripetere la cancellazione non fa danni", async () => {
    const lead = await svc.createLead(submission());
    await erasure.eraseLead(lead.id);
    await assert.rejects(erasure.eraseLead(lead.id), /non trovato/);
  });
});

function todayRome() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
}
