-- Scheda di valutazione interna (back office). ADDITIVA: quattro valori nuovi nell'enum degli stati della richiesta (gli stati
-- esistenti restano validi e leggibili), due tabelle nuove (comparabili inseriti a mano e revisioni della scheda), cancellate a
-- cascata con la richiesta. Nessun dato esistente modificato. Applicata all'avvio del sito (migrateOnStart) solo dopo il rilascio.
-- Nota: i nuovi valori dell'enum non sono usati in questa migrazione (PostgreSQL non permette di usarli nella stessa transazione).
ALTER TYPE "public"."lead_status" ADD VALUE 'to_evaluate' BEFORE 'to_contact';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE 'evaluated' BEFORE 'to_contact';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE 'offer_prepared' BEFORE 'to_contact';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE 'awaiting_response' BEFORE 'accepted';--> statement-breakpoint
CREATE TABLE "lead_appraisals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"settings_version" integer,
	"comparables_count" integer DEFAULT 0 NOT NULL,
	"comparables_median_cents" integer,
	"comparables_value_cents" integer,
	"comparables_value_note" text,
	"resale_value_cents" integer,
	"resale_value_note" text,
	"discount_cents" integer,
	"max_sustainable_cents" integer,
	"first_offer_cents" integer,
	"first_offer_kind" text,
	"first_offer_reason" text,
	"target_price_cents" integer,
	"target_price_note" text,
	"costs" jsonb,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"declared_asking_price_cents" integer,
	"accessories" text,
	"cosmetic_condition" text,
	"defects" text,
	"maintenance_records" text,
	"revision_note" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_appraisals_first_offer_within_max" CHECK ("lead_appraisals"."first_offer_cents" is null or ("lead_appraisals"."max_sustainable_cents" is not null and "lead_appraisals"."first_offer_cents" <= "lead_appraisals"."max_sustainable_cents")),
	CONSTRAINT "lead_appraisals_manual_offer_reason" CHECK ("lead_appraisals"."first_offer_kind" is distinct from 'manual' or "lead_appraisals"."first_offer_reason" is not null),
	CONSTRAINT "lead_appraisals_offer_kind" CHECK (("lead_appraisals"."first_offer_cents" is null) = ("lead_appraisals"."first_offer_kind" is null))
);
--> statement-breakpoint
CREATE TABLE "lead_comparables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"url" text NOT NULL,
	"price_cents" integer NOT NULL,
	"brand" text NOT NULL,
	"model" text NOT NULL,
	"year" integer,
	"mileage" integer,
	"location" text,
	"condition" text,
	"description" text,
	"seller_type" text DEFAULT 'unknown' NOT NULL,
	"included" boolean DEFAULT true NOT NULL,
	"exclusion_reason" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone,
	CONSTRAINT "lead_comparables_url_http" CHECK ("lead_comparables"."url" ~ '^https?://'),
	CONSTRAINT "lead_comparables_price_positive" CHECK ("lead_comparables"."price_cents" > 0),
	CONSTRAINT "lead_comparables_seller_type" CHECK ("lead_comparables"."seller_type" in ('private','dealer','unknown')),
	CONSTRAINT "lead_comparables_exclusion_reason" CHECK ("lead_comparables"."included" or "lead_comparables"."exclusion_reason" is not null)
);
--> statement-breakpoint
ALTER TABLE "lead_appraisals" ADD CONSTRAINT "lead_appraisals_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_comparables" ADD CONSTRAINT "lead_comparables_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lead_appraisals_revision_uq" ON "lead_appraisals" USING btree ("lead_id","revision");--> statement-breakpoint
CREATE INDEX "lead_comparables_lead_idx" ON "lead_comparables" USING btree ("lead_id","created_at");