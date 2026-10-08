/**
 * Schema del database (PostgreSQL).
 *
 * Modulo ACQUISIZIONE: tutto ciò che riguarda il percorso privato → noi.
 * La futura logica di vendita/inventario dovrà vivere in tabelle separate
 * e collegarsi qui solo tramite leads.id (quando lo stato è "purchased").
 */
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { LEAD_STATUSES } from "@/modules/leads/statuses";

export const leadStatusEnum = pgEnum("lead_status", LEAD_STATUSES);
export const triStateEnum = pgEnum("tri_state", ["yes", "no", "unknown"]);
export const contactChannelEnum = pgEnum("contact_channel", ["whatsapp", "phone", "email"]);
/** superseded = era accettata, poi sostituita da una nuova offerta accettata */
export const offerStatusEnum = pgEnum("offer_status", ["proposed", "accepted", "rejected", "superseded"]);
export const buyBoxPriorityEnum = pgEnum("buy_box_priority", ["high", "medium", "low"]);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/** La moto specifica dichiarata dal cliente (non il catalogo). */
export const motorcycles = pgTable("motorcycles", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** id del modello nel catalogo statico, null se "Altro" */
  catalogModelId: text("catalog_model_id"),
  brand: text("brand").notNull(),
  model: text("model").notNull(),
  version: text("version"),
  year: integer("year").notNull(),
  displacement: integer("displacement"),
  createdAt: createdAt(),
});

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phone: text("phone").notNull(),
  email: text("email").notNull(),
  city: text("city").notNull(),
  privacyConsentAt: timestamp("privacy_consent_at", { withTimezone: true }).notNull(),
  privacyPolicyVersion: text("privacy_policy_version").notNull(),
  createdAt: createdAt(),
});

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Codice breve leggibile da comunicare al cliente (es. "M7K2QX") */
    code: text("code").notNull().unique(),
    /** Chiave di idempotenza generata dal browser: un invio = un solo lead */
    submissionId: uuid("submission_id").unique(),
    motorcycleId: uuid("motorcycle_id").notNull().references(() => motorcycles.id),
    customerId: uuid("customer_id").notNull().references(() => customers.id),
    mileage: integer("mileage").notNull(),
    isRunning: boolean("is_running").notNull(),
    accident: triStateEnum("accident").notNull(),
    mechanicalIssues: triStateEnum("mechanical_issues").notNull(),
    maintenance: triStateEnum("maintenance").notNull(),
    preferredContact: contactChannelEnum("preferred_contact").notNull(),
    status: leadStatusEnum("status").notNull().default("new"),
    /** Mercato/città: oggi solo "milano", predisposto per altre città */
    market: text("market").notNull().default("milano"),
    notes: text("notes"),
    /** Prezzo reale di acquisto in euro (diverso dall'offerta) */
    purchasePrice: integer("purchase_price"),
    purchasedAt: timestamp("purchased_at", { withTimezone: true }),
    /** Foto salvate: aggiornato in modo atomico, il CHECK garantisce il massimo anche con richieste parallele */
    photoCount: integer("photo_count").notNull().default(0),
    /** Hash del token monouso per caricare le foto dopo la creazione */
    photoUploadTokenHash: text("photo_upload_token_hash"),
    photoUploadTokenExpiresAt: timestamp("photo_upload_token_expires_at", { withTimezone: true }),
    /** Attribuzione marketing (per costo per lead / CAC per canale) */
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("leads_status_idx").on(t.status),
    index("leads_created_idx").on(t.createdAt),
    check("leads_photo_count_range", sql`${t.photoCount} between 0 and 12`),
    check("leads_mileage_range", sql`${t.mileage} between 0 and 400000`),
    // prezzo e data di acquisto esistono se e solo se il lead è "Acquistata"
    check(
      "leads_purchase_coherent",
      sql`(${t.status} = 'purchased') = (${t.purchasePrice} is not null and ${t.purchasedAt} is not null)`,
    ),
    check("leads_purchase_price_positive", sql`${t.purchasePrice} is null or ${t.purchasePrice} > 0`),
  ],
);

export const leadPhotos = pgTable(
  "lead_photos",
  {
  id: uuid("id").primaryKey().defaultRandom(),
  leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  /** Id generato dal browser per ogni foto: un retry non crea copie */
  clientPhotoId: uuid("client_photo_id"),
  storageKey: text("storage_key").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  width: integer("width"),
  height: integer("height"),
  createdAt: createdAt(),
  },
  (t) => [uniqueIndex("lead_photos_client_id_uq").on(t.leadId, t.clientPhotoId)],
);

export const leadStatusHistory = pgTable("lead_status_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  fromStatus: leadStatusEnum("from_status"),
  toStatus: leadStatusEnum("to_status").notNull(),
  changedBy: text("changed_by"),
  createdAt: createdAt(),
});

export const offers = pgTable(
  "offers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    status: offerStatusEnum("status").notNull().default("proposed"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [
    check("offers_amount_positive", sql`${t.amount} > 0`),
    // al massimo UNA offerta accettata per lead
    uniqueIndex("offers_one_accepted_per_lead").on(t.leadId).where(sql`${t.status} = 'accepted'`),
  ],
);

/** Regole Buy Box: quali moto ci interessano. Configurabili da DB (Phase 3: UI). */
export const buyBoxRules = pgTable("buy_box_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  brand: text("brand").notNull(),
  /** null = tutti i modelli del brand */
  model: text("model"),
  minYear: integer("min_year"),
  maxYear: integer("max_year"),
  maxMileage: integer("max_mileage"),
  maxPurchasePrice: integer("max_purchase_price"),
  requireRunning: boolean("require_running").notNull().default(false),
  market: text("market").notNull().default("milano"),
  priority: buyBoxPriorityEnum("priority").notNull().default("medium"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

/** Eventi di funnel first-party (niente cookie di terze parti). */
export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    sessionId: text("session_id"),
    leadId: uuid("lead_id"),
    props: jsonb("props"),
    createdAt: createdAt(),
  },
  (t) => [index("events_name_created_idx").on(t.name, t.createdAt)],
);

export const adminUsers = pgTable("admin_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  /** Incrementato al logout: invalida tutte le sessioni già emesse */
  sessionVersion: integer("session_version").notNull().default(1),
  createdAt: createdAt(),
});
