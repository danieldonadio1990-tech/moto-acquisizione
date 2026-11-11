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
  customType,
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

/**
 * Consenso marketing (facoltativo, mai preselezionato): REGISTRO a sola aggiunta, una riga per ogni scelta.
 * La scelta in vigore è l'ultima riga del cliente. Si documentano data, versione del testo mostrato e stato:
 * granted = consenso dato, declined = casella lasciata vuota nel modulo, revoked = consenso revocato in seguito.
 * Nessuna comunicazione promozionale se l'ultima riga non è «granted» (src/modules/marketing/consent.ts).
 */
export const MARKETING_CONSENT_STATUSES = ["granted", "declined", "revoked"] as const;
export type MarketingConsentStatus = (typeof MARKETING_CONSENT_STATUSES)[number];

export const marketingConsents = pgTable(
  "marketing_consents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id").notNull().references(() => customers.id),
    status: text("status", { enum: MARKETING_CONSENT_STATUSES }).notNull(),
    /** Versione del testo della casella (src/modules/marketing/consent.ts): serve a provare che cosa ha visto il cliente */
    textVersion: text("text_version").notNull(),
    /** Dove è stata espressa la scelta: «modulo» (invio della richiesta) o «email»/«back_office» per una revoca */
    source: text("source").notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("marketing_consents_customer_idx").on(t.customerId, t.decidedAt),
    check("marketing_consents_status_valid", sql`${t.status} in ('granted','declined','revoked')`),
  ],
);

/**
 * Prova MINIMA e pseudonimizzata del consenso marketing, conservata dopo la cancellazione di una richiesta (src/modules/marketing/evidence.ts).
 * Nessun nome, telefono, email in chiaro né collegamento alla richiesta (nessuna chiave esterna): solo il codice irreversibile
 * dell'email (HMAC-SHA256 con chiave segreta, quindi NON anonima: chi ha la chiave può verificare un indirizzo noto), lo stato, la versione del
 * testo, l'origine e la data della scelta. Serve a documentare un consenso o una revoca e a non reinserire in elenchi promozionali chi ha revocato.
 * Periodo di conservazione: DECISIONE APERTA (da definire con il consulente privacy): nessuna cancellazione automatica finché non è approvato.
 */
export const marketingConsentEvidence = pgTable(
  "marketing_consent_evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** HMAC-SHA256 (esadecimale) dell'email in minuscolo */
    subjectHash: text("subject_hash").notNull(),
    /** Quale chiave ha prodotto il codice (per poterla cambiare in futuro senza perdere la verificabilità) */
    hashKeyId: text("hash_key_id").notNull(),
    status: text("status", { enum: MARKETING_CONSENT_STATUSES }).notNull(),
    textVersion: text("text_version").notNull(),
    source: text("source").notNull(),
    /** Data della scelta originale */
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull(),
    /** Quando il registro completo è stato ridotto a questa prova (cancellazione della richiesta) o la revoca è stata registrata */
    archivedAt: timestamp("archived_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("marketing_consent_evidence_subject_idx").on(t.subjectHash, t.decidedAt),
    check("marketing_consent_evidence_status_valid", sql`${t.status} in ('granted','declined','revoked')`),
  ],
);

export const NOTIFICATION_STATUSES = ["pending", "sending", "sent", "failed", "skipped", "throttled"] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const CUSTOMER_EMAIL_STATUSES = ["pending", "sending", "sent", "failed", "skipped"] as const;
export type CustomerEmailStatus = (typeof CUSTOMER_EMAIL_STATUSES)[number];

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
    /**
     * Notifica interna con le foto (src/modules/photos/pending.ts): la notifica parte quando il cliente conclude il passo delle foto
     * (photosFinalizedAt) oppure, se lo abbandona, non prima di notifyNotBefore (creazione + 10 minuti), senza foto.
     * NULL in notifyNotBefore = nessuna attesa (richieste precedenti a questa funzione).
     */
    notifyNotBefore: timestamp("notify_not_before", { withTimezone: true }),
    photosFinalizedAt: timestamp("photos_finalized_at", { withTimezone: true }),
    /**
     * Notifica email al titolare per la nuova richiesta (src/modules/notifications).
     * pending → sending (prenotata) → sent | failed; "skipped" = richieste precedenti alle notifiche;
     * "throttled" = sospesa perché raggiunto il limite giornaliero di notifiche (riparte da sola il giorno dopo).
     * La prenotazione è un UPDATE condizionale: due richieste parallele non inviano due email.
     */
    notificationStatus: text("notification_status", { enum: NOTIFICATION_STATUSES }).notNull().default("pending"),
    notificationAttempts: integer("notification_attempts").notNull().default(0),
    notificationClaimedAt: timestamp("notification_claimed_at", { withTimezone: true }),
    notificationSentAt: timestamp("notification_sent_at", { withTimezone: true }),
    /** Solo un codice sintetico (timeout, http_403…): mai il contenuto della risposta del provider */
    notificationError: text("notification_error"),
    /**
     * Email di conferma AL CLIENTE (src/modules/notifications/customer-confirmation.ts): stesso schema della notifica interna.
     * pending → sending (prenotata) → sent | failed; «skipped» = richieste precedenti a questa funzione (nessun invio retroattivo).
     * La prenotazione è un UPDATE condizionale: un retry dell'invio non produce una seconda email.
     */
    customerEmailStatus: text("customer_email_status", { enum: CUSTOMER_EMAIL_STATUSES }).notNull().default("pending"),
    customerEmailAttempts: integer("customer_email_attempts").notNull().default(0),
    customerEmailClaimedAt: timestamp("customer_email_claimed_at", { withTimezone: true }),
    customerEmailSentAt: timestamp("customer_email_sent_at", { withTimezone: true }),
    /** Solo un codice sintetico (timeout, http_403…) */
    customerEmailError: text("customer_email_error"),
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
    check("leads_customer_email_status_valid", sql`${t.customerEmailStatus} in ('pending','sending','sent','failed','skipped')`),
    check(
      "leads_notification_status_valid",
      sql`${t.notificationStatus} in ('pending','sending','sent','failed','skipped','throttled')`,
    ),
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

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

/** Posizioni guidate delle foto (1–6), condivise con il browser: src/modules/photos/limits.ts (PHOTO_SLOTS) */
export const MAX_PENDING_PHOTO_SLOT = 6;
/** Dimensione massima di una foto già elaborata dal server (vincolo anche sul database) */
export const MAX_PENDING_PHOTO_BYTES = 1024 * 1024;

/**
 * Foto TEMPORANEE in attesa di essere inviate come allegati della notifica interna (src/modules/photos/pending.ts).
 * Non sono un archivio: si cancellano appena la notifica risulta inviata e comunque dopo 7 giorni (pulizia automatica).
 * Una riga per posizione (slot 1–6): il massimo di 6 foto per richiesta è garantito dal database (UNIQUE + CHECK).
 * Cancellazione della richiesta (privacy) → cancellazione a cascata.
 */
export const leadPendingPhotos = pgTable(
  "lead_pending_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    slot: integer("slot").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    data: bytea("data").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("lead_pending_photos_slot_uq").on(t.leadId, t.slot),
    index("lead_pending_photos_created_idx").on(t.createdAt),
    check("lead_pending_photos_slot_range", sql`${t.slot} between 1 and 6`),
    check("lead_pending_photos_size_range", sql`${t.sizeBytes} > 0 and ${t.sizeBytes} <= 1048576 and octet_length(${t.data}) = ${t.sizeBytes}`),
    check("lead_pending_photos_mime", sql`${t.mimeType} = 'image/jpeg'`),
  ],
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

/**
 * Contatori condivisi del rate limit e del limite giornaliero delle notifiche (src/lib/rate-limit.ts, store su database).
 * La chiave è un HASH (HMAC con il segreto del server) di ciò che si conta (IP, telefono, email…): nel database non
 * finiscono mai indirizzi IP, numeri o email in chiaro. Le righe scadute vengono ripulite periodicamente.
 */
export const rateLimitBuckets = pgTable("rate_limit_buckets", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});

// ---------------------------------------------------------------------------------------------------------------------
// Valutazione e offerta preliminare (src/modules/valuation). Strutture NUOVE e additive: le richieste esistenti non
// vengono toccate. Importi sempre in centesimi (interi), percentuali in punti base.
// ---------------------------------------------------------------------------------------------------------------------

export const VALUATION_STATUSES = [
  "to_evaluate", // Da valutare (nessun calcolo ancora, o da ricalcolare)
  "insufficient_data", // Dati insufficienti (mancano parametri approvati o dati di mercato)
  "preliminary_generated", // Valutazione preliminare generata (offerta o fascia calcolata dal motore)
  "manual_review", // Verifica manuale richiesta
  "offer_to_confirm", // Offerta da confermare (proposta manuale in attesa)
  "offer_confirmed", // Offerta confermata da un amministratore
  "rejected", // Rifiutata
  "expired", // Scaduta
] as const;
export type ValuationStatus = (typeof VALUATION_STATUSES)[number];

/**
 * Parametri economici versionati. Una versione APPROVATA è immutabile: per cambiare un parametro si crea una nuova
 * versione e la si approva (la precedente passa a «retired»). Chi crea e chi approva è registrato: audit trail.
 */
export const valuationSettings = pgTable(
  "valuation_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    version: integer("version").notNull().unique(),
    status: text("status", { enum: ["draft", "approved", "retired"] }).notNull().default("draft"),
    params: jsonb("params").notNull(),
    note: text("note"),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
  },
  (t) => [
    // una sola versione approvata alla volta
    uniqueIndex("valuation_settings_one_approved").on(t.status).where(sql`${t.status} = 'approved'`),
    check("valuation_settings_status_valid", sql`${t.status} in ('draft','approved','retired')`),
    check("valuation_settings_approval_coherent", sql`(${t.status} in ('approved','retired')) = (${t.approvedAt} is not null)`),
  ],
);

/**
 * Riferimenti di mercato inseriti da un amministratore, CON la provenienza (fonte, tipo, data, numero di casi).
 * Nessun valore è precaricato: senza righe il motore non produce offerte.
 */
export const marketReferences = pgTable(
  "market_references",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brand: text("brand").notNull(),
    /** famiglia del catalogo (es. "SH"); null = tutti i modelli del marchio */
    family: text("family"),
    yearFrom: integer("year_from").notNull(),
    yearTo: integer("year_to").notNull(),
    medianCents: integer("median_cents").notNull(),
    p25Cents: integer("p25_cents"),
    p75Cents: integer("p75_cents"),
    sampleCount: integer("sample_count").notNull(),
    kind: text("kind", { enum: ["sold", "asking", "internal", "manual"] }).notNull(),
    source: text("source").notNull(),
    asOf: timestamp("as_of", { withTimezone: true }).notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("market_references_lookup_idx").on(t.brand, t.family),
    check("market_references_median_positive", sql`${t.medianCents} > 0`),
    check("market_references_years_valid", sql`${t.yearFrom} <= ${t.yearTo} and ${t.yearFrom} >= 1950`),
    check("market_references_samples_positive", sql`${t.sampleCount} >= 1`),
    check("market_references_kind_valid", sql`${t.kind} in ('sold','asking','internal','manual')`),
  ],
);

/**
 * Valutazioni di una richiesta: una riga per REVISIONE (1 = calcolo automatico alla creazione). Ogni modifica
 * amministrativa o ricalcolo aggiunge una revisione: lo storico non si riscrive mai. La revisione più alta è quella in vigore.
 */
export const valuations = pgTable(
  "valuations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    kind: text("kind", { enum: ["automatic", "manual"] }).notNull(),
    status: text("status", { enum: VALUATION_STATUSES }).notNull(),
    decision: text("decision", { enum: ["preliminary_offer", "indicative_range", "manual_review"] }).notNull(),
    reasons: jsonb("reasons").notNull(),
    confidenceBp: integer("confidence_bp").notNull().default(0),
    /** input normalizzati usati dal calcolo (dati della moto, nessun dato personale del cliente) */
    inputs: jsonb("inputs"),
    /** provenienza dei dati di mercato (fonte, tipo, data, casi, mediana…) */
    market: jsonb("market"),
    resaleCents: integer("resale_cents"),
    costs: jsonb("costs"),
    costTotalCents: integer("cost_total_cents"),
    marginCents: integer("margin_cents"),
    maxOfferCents: integer("max_offer_cents"),
    rangeLowCents: integer("range_low_cents"),
    rangeHighCents: integer("range_high_cents"),
    /** prezzo impostato a mano da un amministratore, con il motivo */
    manualOfferCents: integer("manual_offer_cents"),
    manualReason: text("manual_reason"),
    formulaVersion: text("formula_version").notNull(),
    settingsId: uuid("settings_id").references(() => valuationSettings.id),
    /** mostrato al cliente alla creazione? (dipende dall'interruttore VALUATION_PUBLIC_OFFERS) */
    disclosedToCustomer: boolean("disclosed_to_customer").notNull().default(false),
    createdBy: text("created_by"),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("valuations_lead_revision_uq").on(t.leadId, t.revision),
    index("valuations_lead_idx").on(t.leadId),
    check("valuations_status_valid", sql`${t.status} in ('to_evaluate','insufficient_data','preliminary_generated','manual_review','offer_to_confirm','offer_confirmed','rejected','expired')`),
    check("valuations_amounts_non_negative", sql`coalesce(${t.maxOfferCents}, 0) >= 0 and coalesce(${t.manualOfferCents}, 1) > 0`),
    check("valuations_manual_has_reason", sql`${t.manualOfferCents} is null or (${t.manualReason} is not null and length(${t.manualReason}) >= 5)`),
  ],
);

// ---------------------------------------------------------------------------------------------------------------------------
// Scheda di valutazione interna (migrazione 0008): annunci comparabili inseriti a mano e revisioni della scheda.
// Solo back office. Nessun dato di venditori terzi oltre a ciò che serve al confronto (niente nomi o contatti).
// ---------------------------------------------------------------------------------------------------------------------------
export const SELLER_TYPES = ["private", "dealer", "unknown"] as const;
export type SellerType = (typeof SELLER_TYPES)[number];

export const leadComparables = pgTable(
  "lead_comparables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    /** prezzo RICHIESTO nell'annuncio, in centesimi */
    priceCents: integer("price_cents").notNull(),
    brand: text("brand").notNull(),
    model: text("model").notNull(),
    year: integer("year"),
    mileage: integer("mileage"),
    location: text("location"),
    condition: text("condition"),
    description: text("description"),
    sellerType: text("seller_type", { enum: SELLER_TYPES }).notNull().default("unknown"),
    /** escluso dal calcolo (resta visibile): serve un motivo */
    included: boolean("included").notNull().default(true),
    exclusionReason: text("exclusion_reason"),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
    updatedBy: text("updated_by"),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (t) => [
    index("lead_comparables_lead_idx").on(t.leadId, t.createdAt),
    check("lead_comparables_url_http", sql`${t.url} ~ '^https?://'`),
    check("lead_comparables_price_positive", sql`${t.priceCents} > 0`),
    check("lead_comparables_seller_type", sql`${t.sellerType} in ('private','dealer','unknown')`),
    check("lead_comparables_exclusion_reason", sql`${t.included} or ${t.exclusionReason} is not null`),
  ],
);

/**
 * Revisioni della scheda di valutazione (append-only: ogni salvataggio è una revisione con autore e data).
 * Valori economici SEPARATI e mai dedotti l'uno dall'altro senza regola approvata:
 *  - valore dei comparabili (riferimento commerciale; precompilato con la mediana degli annunci inclusi, modificabile con nota);
 *  - valore di rivendita previsto (stima interna inserita a mano, con nota);
 *  - massimo sostenibile (calcolato: rivendita − margine − costi; null se manca un dato o un costo non è configurato);
 *  - prima offerta (comparabili − sconto approvato, mai oltre il massimo; oppure manuale entro il massimo, con motivo);
 *  - prezzo obiettivo (manuale, con nota).
 * I costi usati sono copiati nella revisione (`costs`) insieme alla versione dei parametri.
 */
export const leadAppraisals = pgTable(
  "lead_appraisals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    settingsVersion: integer("settings_version"),
    comparablesCount: integer("comparables_count").notNull().default(0),
    comparablesMedianCents: integer("comparables_median_cents"),
    comparablesValueCents: integer("comparables_value_cents"),
    comparablesValueNote: text("comparables_value_note"),
    resaleValueCents: integer("resale_value_cents"),
    resaleValueNote: text("resale_value_note"),
    discountCents: integer("discount_cents"),
    maxSustainableCents: integer("max_sustainable_cents"),
    firstOfferCents: integer("first_offer_cents"),
    firstOfferKind: text("first_offer_kind", { enum: ["calculated", "manual"] }),
    firstOfferReason: text("first_offer_reason"),
    targetPriceCents: integer("target_price_cents"),
    targetPriceNote: text("target_price_note"),
    /** costi usati (copia dai parametri approvati) e avvisi del calcolo: solo per consultazione e audit */
    costs: jsonb("costs"),
    warnings: jsonb("warnings").notNull().default(sql`'[]'::jsonb`),
    /** dati dichiarati dal cliente al contatto, inseriti dall'admin (il modulo pubblico non li raccoglie) */
    declaredAskingPriceCents: integer("declared_asking_price_cents"),
    accessories: text("accessories"),
    cosmeticCondition: text("cosmetic_condition"),
    defects: text("defects"),
    maintenanceRecords: text("maintenance_records"),
    revisionNote: text("revision_note"),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("lead_appraisals_revision_uq").on(t.leadId, t.revision),
    // una prima offerta salvata non supera MAI il massimo sostenibile, e senza massimo non esiste una prima offerta valida
    check(
      "lead_appraisals_first_offer_within_max",
      sql`${t.firstOfferCents} is null or (${t.maxSustainableCents} is not null and ${t.firstOfferCents} <= ${t.maxSustainableCents})`,
    ),
    check("lead_appraisals_manual_offer_reason", sql`${t.firstOfferKind} is distinct from 'manual' or ${t.firstOfferReason} is not null`),
    check("lead_appraisals_offer_kind", sql`(${t.firstOfferCents} is null) = (${t.firstOfferKind} is null)`),
  ],
);
