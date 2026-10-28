-- Additiva: crea soltanto tabelle nuove (valuation_settings, market_references, valuations). Nessuna tabella esistente viene modificata
-- e nessun dato esistente viene toccato. Le tabelle nascono VUOTE: senza parametri approvati e senza riferimenti di mercato il motore
-- non produce alcuna offerta. Rollback manuale: DROP TABLE valuations; DROP TABLE market_references; DROP TABLE valuation_settings;
-- (in questo ordine) e rimozione della riga di questa migrazione da drizzle.__drizzle_migrations.
CREATE TABLE "market_references" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand" text NOT NULL,
	"family" text,
	"year_from" integer NOT NULL,
	"year_to" integer NOT NULL,
	"median_cents" integer NOT NULL,
	"p25_cents" integer,
	"p75_cents" integer,
	"sample_count" integer NOT NULL,
	"kind" text NOT NULL,
	"source" text NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "market_references_median_positive" CHECK ("market_references"."median_cents" > 0),
	CONSTRAINT "market_references_years_valid" CHECK ("market_references"."year_from" <= "market_references"."year_to" and "market_references"."year_from" >= 1950),
	CONSTRAINT "market_references_samples_positive" CHECK ("market_references"."sample_count" >= 1),
	CONSTRAINT "market_references_kind_valid" CHECK ("market_references"."kind" in ('sold','asking','internal','manual'))
);
--> statement-breakpoint
CREATE TABLE "valuation_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"params" jsonb NOT NULL,
	"note" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	CONSTRAINT "valuation_settings_version_unique" UNIQUE("version"),
	CONSTRAINT "valuation_settings_status_valid" CHECK ("valuation_settings"."status" in ('draft','approved','retired')),
	CONSTRAINT "valuation_settings_approval_coherent" CHECK (("valuation_settings"."status" in ('approved','retired')) = ("valuation_settings"."approved_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "valuations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"decision" text NOT NULL,
	"reasons" jsonb NOT NULL,
	"confidence_bp" integer DEFAULT 0 NOT NULL,
	"inputs" jsonb,
	"market" jsonb,
	"resale_cents" integer,
	"costs" jsonb,
	"cost_total_cents" integer,
	"margin_cents" integer,
	"max_offer_cents" integer,
	"range_low_cents" integer,
	"range_high_cents" integer,
	"manual_offer_cents" integer,
	"manual_reason" text,
	"formula_version" text NOT NULL,
	"settings_id" uuid,
	"disclosed_to_customer" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	CONSTRAINT "valuations_status_valid" CHECK ("valuations"."status" in ('to_evaluate','insufficient_data','preliminary_generated','manual_review','offer_to_confirm','offer_confirmed','rejected','expired')),
	CONSTRAINT "valuations_amounts_non_negative" CHECK (coalesce("valuations"."max_offer_cents", 0) >= 0 and coalesce("valuations"."manual_offer_cents", 1) > 0),
	CONSTRAINT "valuations_manual_has_reason" CHECK ("valuations"."manual_offer_cents" is null or ("valuations"."manual_reason" is not null and length("valuations"."manual_reason") >= 5))
);
--> statement-breakpoint
ALTER TABLE "valuations" ADD CONSTRAINT "valuations_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "valuations" ADD CONSTRAINT "valuations_settings_id_valuation_settings_id_fk" FOREIGN KEY ("settings_id") REFERENCES "public"."valuation_settings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "market_references_lookup_idx" ON "market_references" USING btree ("brand","family");--> statement-breakpoint
CREATE UNIQUE INDEX "valuation_settings_one_approved" ON "valuation_settings" USING btree ("status") WHERE "valuation_settings"."status" = 'approved';--> statement-breakpoint
CREATE UNIQUE INDEX "valuations_lead_revision_uq" ON "valuations" USING btree ("lead_id","revision");--> statement-breakpoint
CREATE INDEX "valuations_lead_idx" ON "valuations" USING btree ("lead_id");