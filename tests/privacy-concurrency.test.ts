/**
 * Cancellazione privacy concorrente con il retry manuale delle notifiche.
 * Nessuna email reale (provider finto). Database: PGlite (le operazioni si serializzano) oppure PostgreSQL vero con
 * TEST_DATABASE_URL (connessioni parallele vere: è lì che la gara si verifica davvero). Esecuzione: npm test
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { EmailTransport, SendResult } from "@/modules/notifications/transport";

const TMP = mkdtempSync(path.join(tmpdir(), "moto-privacy-test-"));
Object.assign(process.env, {
  NODE_ENV: "test",
  PGLITE_DIR: path.join(TMP, "db"),
  UPLOADS_DIR: path.join(TMP, "uploads"),
  SESSION_SECRET: "test-secret-test-secret-test-secret-123456",
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
  DB_POOL_MAX: "10",
  STORAGE_DRIVER: "",
  ADMIN_PASSWORD: "",
  RESEND_API_KEY: "dummy-key-not-real",
  NOTIFY_EMAIL_TO: "notifiche@example.invalid",
  RATE_LIMIT_DISABLED: "true",
});

class SlowProvider implements EmailTransport {
  async send(): Promise<SendResult> {
    await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 15)));
    return { ok: true };
  }
}

let nl: typeof import("@/modules/notifications/new-lead");
let tr: typeof import("@/modules/notifications/transport");
let svc: typeof import("@/modules/leads/service");
let erasure: typeof import("@/modules/privacy/erasure");
let dbmod: typeof import("@/db/client");
let schema: typeof import("@/db/schema");
let orm: typeof import("drizzle-orm");

const ADMIN_EMAIL = "amministratore@example.invalid";
let adminId = "";

before(async () => {
  nl = await import("@/modules/notifications/new-lead");
  tr = await import("@/modules/notifications/transport");
  svc = await import("@/modules/leads/service");
  erasure = await import("@/modules/privacy/erasure");
  dbmod = await import("@/db/client");
  schema = await import("@/db/schema");
  orm = await import("drizzle-orm");
  tr.setEmailTransport(new SlowProvider());
  const db = await dbmod.getDb();
  const [a] = await db.insert(schema.adminUsers).values({ email: ADMIN_EMAIL, passwordHash: "x".repeat(60) } as never).returning({ id: schema.adminUsers.id });
  adminId = a.id;
});
after(async () => {
  tr.setEmailTransport(undefined);
  await dbmod.closeDb();
  rmSync(TMP, { recursive: true, force: true });
});

let seq = 3340000000 + Math.floor(Math.random() * 90_000_000);
const submission = () => ({
  submissionId: randomUUID(),
  motorcycle: { brand: "Honda", modelId: "honda-sh", year: 2019, displacement: 125 },
  mileage: 18000,
  condition: { isRunning: true, accident: "no" as const, mechanicalIssues: "no" as const, maintenance: "yes" as const },
  contact: {
    firstName: "Prova",
    lastName: "Test",
    phone: `+39${seq++}`,
    email: `prova.${randomUUID().slice(0, 8)}@example.invalid`,
    city: "Milano",
    preferredContact: "email" as const,
    privacyConsent: true as const,
  },
});

async function orphanEvents() {
  const db = await dbmod.getDb();
  return db.select().from(schema.events).where(orm.and(orm.isNull(schema.events.leadId), orm.like(schema.events.name, "notification_%")));
}

describe("privacy: cancellazione e retry manuale concorrenti", () => {
  test("retry manuale DOPO la cancellazione: nessun evento viene creato per la richiesta sparita", async () => {
    const lead = await svc.createLead(submission());
    await erasure.eraseLead(lead.id);
    await nl.manualRetryNotification(lead.id, ADMIN_EMAIL).catch(() => {});
    const db = await dbmod.getDb();
    const ev = await db.select().from(schema.events).where(orm.eq(schema.events.leadId, lead.id));
    assert.equal(ev.length, 0);
    assert.deepEqual(await orphanEvents(), []);
  });

  test("retry manuale PRIMA della cancellazione: la traccia con l'admin segue la richiesta e sparisce", async () => {
    const lead = await svc.createLead(submission());
    await nl.manualRetryNotification(lead.id, ADMIN_EMAIL);
    const db = await dbmod.getDb();
    const before = await db.select().from(schema.events).where(orm.and(orm.eq(schema.events.leadId, lead.id), orm.eq(schema.events.name, "notification_manual_retry")));
    assert.equal(before.length, 1);
    assert.deepEqual(Object.keys(before[0].props as object).sort(), ["adminId", "outcome"], "l'evento contiene l'id dell'admin, non l'email");
    assert.ok(!JSON.stringify(before[0].props).includes("@"));
    await erasure.eraseLead(lead.id);
    assert.deepEqual(await orphanEvents(), []);
    const left = await db.select().from(schema.events).where(orm.eq(schema.events.name, "notification_manual_retry"));
    assert.equal(left.filter((e) => (e.props as { adminId?: string }).adminId === adminId && e.leadId === null).length, 0);
  });

  test("40 prove con retry manuale e cancellazione lanciati insieme: mai un evento orfano con dati dell'admin", async () => {
    const db = await dbmod.getDb();
    for (let i = 0; i < 40; i++) {
      const lead = await svc.createLead(submission());
      await Promise.allSettled([nl.manualRetryNotification(lead.id, ADMIN_EMAIL), erasure.eraseLead(lead.id)]);
      const rest = await db.select().from(schema.events).where(orm.eq(schema.events.leadId, lead.id));
      assert.equal(rest.length, 0, `prova ${i}: eventi rimasti dopo la cancellazione`);
    }
    const orphans = await orphanEvents();
    assert.deepEqual(orphans.filter((e) => e.name === "notification_manual_retry"), []);
    assert.deepEqual(orphans.filter((e) => JSON.stringify(e.props).includes(adminId)), []);
  });
});
