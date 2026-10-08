ALTER TYPE "public"."offer_status" ADD VALUE 'superseded';--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "session_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "lead_photos" ADD COLUMN "client_photo_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "submission_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "photo_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- backfill: contatore foto dai dati esistenti
UPDATE "leads" SET "photo_count" = LEAST(12, (SELECT count(*) FROM "lead_photos" p WHERE p."lead_id" = "leads"."id"));--> statement-breakpoint
-- backfill: dati di acquisto presenti su lead non acquistati (incoerenze create prima dei vincoli)
UPDATE "leads" SET "purchase_price" = NULL, "purchased_at" = NULL WHERE "status" <> 'purchased';--> statement-breakpoint
-- backfill: più offerte accettate sullo stesso lead → resta accettata solo la più recente
UPDATE "offers" o SET "status" = 'rejected' WHERE o."status" = 'accepted' AND EXISTS (
  SELECT 1 FROM "offers" n WHERE n."lead_id" = o."lead_id" AND n."status" = 'accepted' AND n."created_at" > o."created_at"
);--> statement-breakpoint
CREATE UNIQUE INDEX "lead_photos_client_id_uq" ON "lead_photos" USING btree ("lead_id","client_photo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "offers_one_accepted_per_lead" ON "offers" USING btree ("lead_id") WHERE "offers"."status" = 'accepted';--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_submission_id_unique" UNIQUE("submission_id");--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_photo_count_range" CHECK ("leads"."photo_count" between 0 and 12);--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_mileage_range" CHECK ("leads"."mileage" between 0 and 400000);--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_purchase_coherent" CHECK (("leads"."status" = 'purchased') = ("leads"."purchase_price" is not null and "leads"."purchased_at" is not null));--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_purchase_price_positive" CHECK ("leads"."purchase_price" is null or "leads"."purchase_price" > 0);--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_amount_positive" CHECK ("offers"."amount" > 0);
