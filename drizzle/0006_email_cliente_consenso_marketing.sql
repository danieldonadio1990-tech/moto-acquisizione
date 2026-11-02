-- Email di conferma al cliente e registro del consenso marketing. ADDITIVA: nuova tabella e nuove colonne, nessun dato esistente
-- modificato tranne il flag «skipped» sotto. Nessuna colonna o tabella esistente viene eliminata o rinominata.
CREATE TABLE "marketing_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"status" text NOT NULL,
	"text_version" text NOT NULL,
	"source" text NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_consents_status_valid" CHECK ("marketing_consents"."status" in ('granted','declined','revoked'))
);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "customer_email_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "customer_email_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "customer_email_claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "customer_email_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "customer_email_error" text;--> statement-breakpoint
-- Le richieste GIÀ presenti non ricevono nessuna email di conferma retroattiva: vengono marcate "skipped". Le nuove partono da "pending".
UPDATE "leads" SET "customer_email_status" = 'skipped';--> statement-breakpoint
ALTER TABLE "marketing_consents" ADD CONSTRAINT "marketing_consents_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "marketing_consents_customer_idx" ON "marketing_consents" USING btree ("customer_id","decided_at");--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_customer_email_status_valid" CHECK ("leads"."customer_email_status" in ('pending','sending','sent','failed','skipped'));