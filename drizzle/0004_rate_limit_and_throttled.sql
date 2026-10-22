-- Additiva e compatibile con il codice precedente: una tabella nuova per i contatori condivisi del rate limit
-- (chiavi hash, nessun dato personale in chiaro) e un vincolo CHECK allargato con lo stato «throttled»
-- (il codice precedente non lo scrive mai). Nessun dato esistente viene modificato.
CREATE TABLE "rate_limit_buckets" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"reset_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leads" DROP CONSTRAINT "leads_notification_status_valid";--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_notification_status_valid" CHECK ("leads"."notification_status" in ('pending','sending','sent','failed','skipped','throttled'));