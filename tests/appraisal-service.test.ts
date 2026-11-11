/**
 * Scheda di valutazione: comparabili, revisioni, regole economiche sul server, stati della richiesta, accesso solo admin,
 * cancellazione con la richiesta. Database PGlite temporaneo (o PostgreSQL con TEST_DATABASE_URL). Importi SIMULATI.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const TMP = mkdtempSync(path.join(tmpdir(), "moto-appraisal-test-"));
Object.assign(process.env, {
  NODE_ENV: "test",
  PGLITE_DIR: path.join(TMP, "db"),
  UPLOADS_DIR: path.join(TMP, "uploads"),
  SESSION_SECRET: "test-secret-test-secret-test-secret-123456",
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
  STORAGE_DRIVER: "",
  ADMIN_PASSWORD: "",
  RATE_LIMIT_DISABLED: "true",
});
delete process.env.VALUATION_ALLOW_SELF_APPROVAL;
delete process.env.RESEND_API_KEY;

let ap: typeof import("@/modules/appraisal/service");
let val: typeof import("@/modules/appraisal/validation");
let vs: typeof import("@/modules/valuation/service");
let params: typeof import("@/modules/valuation/params");
let svc: typeof import("@/modules/leads/service");
let erasure: typeof import("@/modules/privacy/erasure");
let dbmod: typeof import("@/db/client");
let schema: typeof import("@/db/schema");
let orm: typeof import("drizzle-orm");

const ADMIN = "admin@example.invalid";
const submission = () => ({
  submissionId: randomUUID(),
  motorcycle: { brand: "Honda", modelId: "honda-sh", year: 2019, displacement: 125 },
  mileage: 18000,
  condition: { isRunning: true, accident: "no" as const, mechanicalIssues: "no" as const, maintenance: "yes" as const },
  contact: {
    firstName: "Mario", lastName: "Verdi", phone: "+393331234567", email: `a.${randomUUID().slice(0, 8)}@example.com`,
    city: "Milano", preferredContact: "phone" as const, privacyConsent: true as const,
  },
});
/** campi del modulo (stringhe come dal browser); vuoto = non inserito */
const form = (over: Record<string, string> = {}) => ({
  comparablesValueCents: "", comparablesValueNote: "", resaleValueCents: "", resaleValueNote: "", discountCents: "",
  manualFirstOfferCents: "", firstOfferReason: "", targetPriceCents: "", targetPriceNote: "", declaredAskingPriceCents: "",
  accessories: "", cosmeticCondition: "", defects: "", maintenanceRecords: "", revisionNote: "", ...over,
});
const comparable = (over: Record<string, string> = {}) =>
  val.comparableInputSchema.parse({
    url: "https://annunci.example.invalid/sh-125-1", priceCents: "2400", brand: "Honda", model: "SH 125", year: "2019", mileage: "20000",
    location: "Milano", condition: "buone", description: "", sellerType: "private", ...over,
  });

/** approva una versione dei parametri con il blocco della scheda (due amministratori diversi, come in produzione) */
async function approveAppraisal(a: Partial<import("@/modules/valuation/params").AppraisalParams>) {
  const db = await dbmod.getDb();
  await db.update(schema.valuationSettings).set({ status: "retired" }).where(orm.eq(schema.valuationSettings.status, "approved"));
  const draft = await vs.createSettingsDraft({ ...params.HYPOTHETICAL_DRAFT_PARAMS, appraisal: { ...params.APPRAISAL_MODEL_DRAFT, ...a } }, "test", "preparatore@example.invalid");
  await vs.approveSettings(draft.id, "approvatore@example.invalid");
}

before(async () => {
  ap = await import("@/modules/appraisal/service");
  val = await import("@/modules/appraisal/validation");
  vs = await import("@/modules/valuation/service");
  params = await import("@/modules/valuation/params");
  svc = await import("@/modules/leads/service");
  erasure = await import("@/modules/privacy/erasure");
  dbmod = await import("@/db/client");
  schema = await import("@/db/schema");
  orm = await import("drizzle-orm");
});
after(async () => {
  await dbmod.closeDb();
  rmSync(TMP, { recursive: true, force: true });
});

describe("comparabili", () => {
  test("inserimento manuale con validazione: link http(s), prezzo obbligatorio, nessun valore inventato", async () => {
    const lead = await svc.createLead(submission());
    const row = await ap.addComparable(lead.id, comparable(), ADMIN);
    assert.equal(row.priceCents, 240000);
    assert.equal(row.sellerType, "private");
    assert.equal(row.included, true);
    assert.throws(() => comparable({ url: "javascript:alert(1)" }), /link completo/);
    assert.throws(() => comparable({ priceCents: "" }), /obbligatorio/);
    assert.equal(comparable({ year: "", mileage: "" }).year, null, "campi mancanti restano vuoti, non stimati");
  });

  test("esclusione con motivo obbligatorio (l'annuncio resta visibile); il database rifiuta un'esclusione senza motivo", async () => {
    const lead = await svc.createLead(submission());
    const c = await ap.addComparable(lead.id, comparable(), ADMIN);
    await assert.rejects(ap.setComparableIncluded(lead.id, c.id, false, "", ADMIN), /perché escludi/);
    await ap.setComparableIncluded(lead.id, c.id, false, "km molto più alti", ADMIN);
    const [x] = await ap.listComparables(lead.id);
    assert.equal(x.included, false);
    assert.equal(x.exclusionReason, "km molto più alti");
    assert.equal(x.updatedBy, ADMIN);
    const db = await dbmod.getDb();
    await assert.rejects(db.update(schema.leadComparables).set({ exclusionReason: null }).where(orm.eq(schema.leadComparables.id, c.id)));
    await assert.rejects(ap.setComparableIncluded(randomUUID(), c.id, true, null, ADMIN), /non trovato/);
  });
});

describe("revisioni della scheda", () => {
  test("costi non configurati: si salva, ma massimo e prima offerta restano vuoti (mai zero)", async () => {
    await approveAppraisal({}); // bozza del titolare: passaggio/altri costi NON configurati
    const lead = await svc.createLead(submission());
    await ap.addComparable(lead.id, comparable(), ADMIN);
    const { result } = await ap.saveAppraisal(
      lead.id,
      val.appraisalInputSchema.parse(form({ comparablesValueCents: "2400", resaleValueCents: "3800", resaleValueNote: "stima su vendite simili", discountCents: "350" })),
      ADMIN,
    );
    assert.equal(result.maxSustainableCents, null);
    assert.equal(result.firstOfferCents, null);
    assert.deepEqual(result.costsMissing, ["transferAndOtherCents"]);
    const [rev] = await ap.listAppraisalRevisions(lead.id);
    assert.equal(rev.maxSustainableCents, null);
    assert.equal(rev.costs, null);
    assert.ok((rev.warnings as { code: string }[]).some((w) => w.code === "costs_not_configured"));
  });

  test("costi configurati: valori separati salvati con la versione dei parametri; revisioni numerate", async () => {
    await approveAppraisal({ transferAndOtherCents: 15_000 }); // 150 € simulati
    const settings = await ap.getAppraisalParams();
    const lead = await svc.createLead(submission());
    for (const p of ["2300", "2400", "2500"]) await ap.addComparable(lead.id, comparable({ priceCents: p }), ADMIN);
    const input = val.appraisalInputSchema.parse(
      form({ comparablesValueCents: "2400", resaleValueCents: "3800", resaleValueNote: "stima su vendite simili", discountCents: "350", targetPriceCents: "2200", targetPriceNote: "proposta in trattativa", declaredAskingPriceCents: "2600", accessories: "bauletto", defects: "graffio sul fianco" }),
    );
    const a = await ap.saveAppraisal(lead.id, input, ADMIN);
    const b = await ap.saveAppraisal(lead.id, input, ADMIN);
    assert.deepEqual([a.revision, b.revision], [1, 2]);
    const [rev] = await ap.listAppraisalRevisions(lead.id);
    assert.equal(rev.settingsVersion, settings!.version);
    assert.equal(rev.comparablesValueCents, 240000);
    assert.equal(rev.comparablesMedianCents, 240000);
    assert.equal(rev.resaleValueCents, 380000);
    assert.equal(rev.maxSustainableCents, 270000);
    assert.equal(rev.firstOfferCents, 205000);
    assert.equal(rev.firstOfferKind, "calculated");
    assert.equal(rev.targetPriceCents, 220000);
    assert.equal(rev.declaredAskingPriceCents, 260000);
    assert.equal(rev.accessories, "bauletto");
    assert.equal(rev.createdBy, ADMIN);
  });

  test("criteri incompatibili: revisione salvata SENZA prima offerta; manuale entro il massimo con motivo sì, oltre no", async () => {
    await approveAppraisal({ transferAndOtherCents: 15_000 });
    const lead = await svc.createLead(submission());
    await ap.addComparable(lead.id, comparable(), ADMIN);
    const common = { comparablesValueCents: "2400", resaleValueCents: "2900", resaleValueNote: "mercato debole", discountCents: "350" };
    const { result } = await ap.saveAppraisal(lead.id, val.appraisalInputSchema.parse(form(common)), ADMIN);
    assert.equal(result.firstOfferCents, null);
    assert.equal(result.incompatibilityGapCents, 25_000);
    // manuale oltre il massimo: rifiutata, nessuna revisione in più
    await assert.rejects(ap.saveAppraisal(lead.id, val.appraisalInputSchema.parse(form({ ...common, manualFirstOfferCents: "1900", firstOfferReason: "tentativo" })), ADMIN), /supera il massimo/);
    assert.equal((await ap.listAppraisalRevisions(lead.id)).length, 1);
    // manuale senza motivo: rifiutata dalla validazione
    assert.throws(() => val.appraisalInputSchema.parse(form({ ...common, manualFirstOfferCents: "1700" })), /motivo/);
    // manuale entro il massimo con motivo: valida
    await ap.saveAppraisal(lead.id, val.appraisalInputSchema.parse(form({ ...common, manualFirstOfferCents: "1700", firstOfferReason: "allineata al massimo sostenibile" })), ADMIN);
    const [rev] = await ap.listAppraisalRevisions(lead.id);
    assert.equal(rev.firstOfferCents, 170000);
    assert.equal(rev.firstOfferKind, "manual");
    assert.equal(rev.firstOfferReason, "allineata al massimo sostenibile");
  });

  test("anche il database impedisce una prima offerta oltre il massimo o senza massimo", async () => {
    const lead = await svc.createLead(submission());
    const db = await dbmod.getDb();
    const row = { leadId: lead.id, createdBy: ADMIN, firstOfferKind: "calculated" as const };
    await assert.rejects(db.insert(schema.leadAppraisals).values({ ...row, revision: 1, firstOfferCents: 200000, maxSustainableCents: 150000 }));
    await assert.rejects(db.insert(schema.leadAppraisals).values({ ...row, revision: 2, firstOfferCents: 100000, maxSustainableCents: null }));
    await assert.rejects(db.insert(schema.leadAppraisals).values({ ...row, revision: 3, firstOfferCents: 100000, maxSustainableCents: 150000, firstOfferKind: "manual" }), "manuale senza motivo");
  });

  test("ogni valore manuale va motivato: rivendita, obiettivo, comparabili diversi dalla mediana", async () => {
    await approveAppraisal({ transferAndOtherCents: 15_000 });
    const lead = await svc.createLead(submission());
    await ap.addComparable(lead.id, comparable(), ADMIN);
    assert.throws(() => val.appraisalInputSchema.parse(form({ resaleValueCents: "3000" })), /rivendita/);
    assert.throws(() => val.appraisalInputSchema.parse(form({ targetPriceCents: "2000" })), /obiettivo/);
    await assert.rejects(ap.saveAppraisal(lead.id, val.appraisalInputSchema.parse(form({ comparablesValueCents: "2600" })), ADMIN), /diverso dalla mediana/);
    await ap.saveAppraisal(lead.id, val.appraisalInputSchema.parse(form({ comparablesValueCents: "2600", comparablesValueNote: "due annunci con scarico nuovo" })), ADMIN);
    const [rev] = await ap.listAppraisalRevisions(lead.id);
    assert.equal(rev.comparablesValueNote, "due annunci con scarico nuovo");
  });

  test("sconto fuori dall'intervallo approvato: nessuna revisione", async () => {
    await approveAppraisal({ transferAndOtherCents: 15_000 });
    const lead = await svc.createLead(submission());
    await ap.addComparable(lead.id, comparable(), ADMIN);
    await assert.rejects(ap.saveAppraisal(lead.id, val.appraisalInputSchema.parse(form({ comparablesValueCents: "2400", discountCents: "200" })), ADMIN), /tra 300 € e 400 €/);
    assert.equal((await ap.listAppraisalRevisions(lead.id)).length, 0);
  });

  test("salvataggi simultanei: numeri di revisione distinti", async () => {
    const lead = await svc.createLead(submission());
    const input = val.appraisalInputSchema.parse(form({ revisionNote: "parallelo" }));
    const out = await Promise.all(Array.from({ length: 5 }, () => ap.saveAppraisal(lead.id, input, ADMIN)));
    assert.deepEqual(out.map((o) => o.revision).sort(), [1, 2, 3, 4, 5]);
  });

  test("la scheda segnala i comparabili cambiati dopo l'ultima revisione", async () => {
    const lead = await svc.createLead(submission());
    await ap.addComparable(lead.id, comparable(), ADMIN);
    await ap.saveAppraisal(lead.id, val.appraisalInputSchema.parse(form()), ADMIN);
    assert.equal((await ap.getAppraisalSheet(lead.id)).comparablesChanged, false);
    await ap.addComparable(lead.id, comparable({ priceCents: "2800" }), ADMIN);
    assert.equal((await ap.getAppraisalSheet(lead.id)).comparablesChanged, true);
  });
});

describe("stati della richiesta", () => {
  test("gli stati storici si leggono ma non si possono più impostare; i nuovi sì", async () => {
    const lead = await svc.createLead(submission());
    await svc.changeStatus(lead.id, "to_evaluate", ADMIN);
    await svc.changeStatus(lead.id, "offer_prepared", ADMIN);
    await svc.changeStatus(lead.id, "awaiting_response", ADMIN);
    await assert.rejects(svc.changeStatus(lead.id, "contacted", ADMIN), /flusso precedente/);
    const db = await dbmod.getDb();
    await db.update(schema.leads).set({ status: "interesting" }).where(orm.eq(schema.leads.id, lead.id)); // richiesta «storica»
    const detail = await svc.getLeadDetail(lead.id);
    assert.equal(detail!.lead.status, "interesting");
    const { STATUS_LABELS, isLegacyStatus } = await import("@/modules/leads/statuses");
    assert.match(STATUS_LABELS.interesting, /storico/);
    assert.ok(isLegacyStatus("interesting"));
  });

  test("registrare un'offerta (a mano) imposta «Offerta preparata», mai «Offerta inviata»; l'invio lo segna l'admin", async () => {
    const lead = await svc.createLead(submission());
    await svc.addOffer(lead.id, 1800, ADMIN);
    assert.equal((await svc.getLeadDetail(lead.id))!.lead.status, "offer_prepared");
    await svc.changeStatus(lead.id, "offer_made", ADMIN);
    await svc.changeStatus(lead.id, "awaiting_response", ADMIN);
    // controproposta registrata dopo l'invio: nuovo importo non ancora comunicato
    await svc.addOffer(lead.id, 1900, ADMIN);
    assert.equal((await svc.getLeadDetail(lead.id))!.lead.status, "offer_prepared");
    const db = await dbmod.getDb();
    const hist = await db.select().from(schema.leadStatusHistory).where(orm.eq(schema.leadStatusHistory.leadId, lead.id)).orderBy(schema.leadStatusHistory.createdAt);
    assert.deepEqual(hist.map((h) => h.toStatus), ["new", "offer_prepared", "offer_made", "awaiting_response", "offer_prepared"]);
    // con un'offerta già accettata, una nuova offerta non cambia lo stato
    const d = await svc.getLeadDetail(lead.id);
    await svc.setOfferStatus(d!.offers.find((o) => o.amount === 1900)!.id, "accepted", ADMIN);
    await svc.addOffer(lead.id, 2000, ADMIN);
    assert.equal((await svc.getLeadDetail(lead.id))!.lead.status, "accepted");
  });

  test("nessun punto del codice imposta automaticamente «Offerta inviata» o «In attesa di risposta»", () => {
    const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(path.join(d, f)).isDirectory() ? walk(path.join(d, f)) : [path.join(d, f)]));
    for (const f of walk("src").filter((x) => /\.tsx?$/.test(x) && !/statuses\.ts$|format\.tsx$|dataset\.ts$/.test(x))) {
      assert.ok(!/"offer_made"|"awaiting_response"/.test(readFileSync(f, "utf8")), f);
    }
  });

  test("offerta accettata → «Offerta accettata – valutazione da fissare», NON un appuntamento fissato", async () => {
    const lead = await svc.createLead(submission());
    await svc.addOffer(lead.id, 1800, ADMIN);
    const detail = await svc.getLeadDetail(lead.id);
    await svc.setOfferStatus(detail!.offers[0].id, "accepted", ADMIN);
    const after = await svc.getLeadDetail(lead.id);
    assert.equal(after!.lead.status, "accepted");
    const { STATUS_LABELS } = await import("@/modules/leads/statuses");
    assert.equal(STATUS_LABELS.accepted, "Offerta accettata – valutazione da fissare");
  });
});

describe("privacy e accesso", () => {
  test("cancellazione della richiesta: spariscono anche comparabili e revisioni della scheda", async () => {
    const lead = await svc.createLead(submission());
    await ap.addComparable(lead.id, comparable(), ADMIN);
    await ap.saveAppraisal(lead.id, val.appraisalInputSchema.parse(form({ defects: "nessuno" })), ADMIN);
    await erasure.eraseLead(lead.id);
    assert.deepEqual(await erasure.remainingReferences([lead.id]), { leads: 0, events: 0, photos: 0, appraisal: 0 });
  });

  test("cancellare una richiesta non tocca comparabili e revisioni di un'altra richiesta", async () => {
    const leadA = await svc.createLead(submission());
    const leadB = await svc.createLead(submission());
    await ap.addComparable(leadA.id, comparable(), ADMIN);
    await ap.saveAppraisal(leadA.id, val.appraisalInputSchema.parse(form({ defects: "nessuno" })), ADMIN);
    await ap.addComparable(leadB.id, comparable(), ADMIN);
    await ap.saveAppraisal(leadB.id, val.appraisalInputSchema.parse(form({ defects: "nessuno" })), ADMIN);

    await erasure.eraseLead(leadA.id);

    assert.deepEqual(await erasure.remainingReferences([leadA.id]), { leads: 0, events: 0, photos: 0, appraisal: 0 });
    const remainingB = await erasure.remainingReferences([leadB.id]);
    assert.equal(remainingB.leads, 1);
    assert.equal(remainingB.appraisal, 2); // 1 comparabile + 1 revisione, intatti
    assert.equal((await ap.listComparables(leadB.id)).length, 1);
    assert.equal((await ap.listAppraisalRevisions(leadB.id)).length, 1);
  });

  test("azioni della scheda solo per admin: requireAdmin() è la prima istruzione", () => {
    const src = readFileSync("src/app/admin/actions.ts", "utf8");
    for (const name of ["addComparableAction", "setComparableIncludedAction", "saveAppraisalAction"]) {
      const body = src.slice(src.indexOf(`export async function ${name}`));
      const firstStatement = body.slice(body.indexOf("try {") + 5).trim().split("\n")[0];
      assert.match(firstStatement, /await requireAdmin\(\)/, name);
    }
  });

  test("nessuna superficie pubblica importa la scheda di valutazione o ne mostra i valori", () => {
    const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(path.join(d, f)).isDirectory() ? walk(path.join(d, f)) : [path.join(d, f)]));
    const publicFiles = [...walk("src/app")].filter((f) => !/[\\/]admin[\\/]/.test(f)).concat(walk("src/modules/funnel"), walk("src/modules/notifications"));
    for (const f of publicFiles) {
      const src = readFileSync(f, "utf8");
      assert.ok(!/modules\/appraisal|AppraisalPanel|lead_appraisals|leadAppraisals|leadComparables/.test(src), f);
    }
  });

  test("il modulo pubblico non raccoglie prezzi o dati della scheda", () => {
    const v = readFileSync("src/modules/leads/validation.ts", "utf8");
    assert.ok(!/askingPrice|accessor|resale|comparabl|discount/i.test(v));
  });
});

describe("migrazione 0008", () => {
  test("registrata dopo la 0007, additiva", () => {
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as { entries: { tag: string }[] };
    const tags = journal.entries.map((e) => e.tag);
    const idx = tags.indexOf("0008_scheda_valutazione");
    assert.ok(idx > 0, "la migrazione 0008 deve essere nel registro");
    assert.equal(tags[idx - 1], "0007_foto_temporanee_email");
    const sql = readFileSync("drizzle/0008_scheda_valutazione.sql", "utf8");
    // istruzioni distruttive (non le clausole «ON DELETE cascade / ON UPDATE no action» delle chiavi esterne)
    const statements = sql.replace(/^--.*$/gm, "").split("--> statement-breakpoint").map((s) => s.trim());
    for (const s of statements) assert.ok(!/^(DROP|DELETE\s+FROM|UPDATE\s|TRUNCATE)|\bRENAME\b|\bDROP\s+(COLUMN|TABLE|CONSTRAINT)\b/i.test(s), s.slice(0, 80));
  });
});
