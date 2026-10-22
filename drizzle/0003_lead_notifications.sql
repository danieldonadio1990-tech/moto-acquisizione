-- Notifiche email per le nuove richieste (additiva: solo colonne nuove, nessun dato esistente modificato tranne il flag sotto).
-- Le richieste GIÀ presenti non devono ricevere una notifica retroattiva: vengono marcate "skipped".
-- Le nuove richieste partono da "pending" (valore predefinito della colonna).
ALTER TABLE "leads" ADD COLUMN "notification_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "notification_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "notification_claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "notification_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "notification_error" text;--> statement-breakpoint
UPDATE "leads" SET "notification_status" = 'skipped';--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_notification_status_valid" CHECK ("leads"."notification_status" in ('pending','sending','sent','failed','skipped'));