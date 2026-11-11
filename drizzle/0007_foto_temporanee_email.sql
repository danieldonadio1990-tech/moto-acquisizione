-- Foto della richiesta come ALLEGATI della notifica interna (una sola email con dati e foto). ADDITIVA: una tabella nuova e due colonne
-- nuove (nullable) su leads; nessun dato esistente modificato, nessuna colonna o tabella eliminata o rinominata.
--  - lead_pending_photos: foto TEMPORANEE (max 6 per richiesta, max 1 MB ciascuna, solo JPEG ricodificato dal server) in attesa
--    dell'invio della notifica. Si cancellano appena la notifica parte e comunque dopo 7 giorni. Cancellazione a cascata con la richiesta.
--  - leads.notify_not_before / leads.photos_finalized_at: la notifica interna attende la conclusione del passo delle foto (max 10 minuti).
--    Richieste già presenti: entrambe NULL = nessuna attesa (comportamento invariato).
-- Applicata automaticamente all'avvio del sito (migrateOnStart) SOLO dopo il rilascio: non va eseguita a mano.
CREATE TABLE "lead_pending_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"slot" integer NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_pending_photos_slot_range" CHECK ("lead_pending_photos"."slot" between 1 and 6),
	CONSTRAINT "lead_pending_photos_size_range" CHECK ("lead_pending_photos"."size_bytes" > 0 and "lead_pending_photos"."size_bytes" <= 1048576 and octet_length("lead_pending_photos"."data") = "lead_pending_photos"."size_bytes"),
	CONSTRAINT "lead_pending_photos_mime" CHECK ("lead_pending_photos"."mime_type" = 'image/jpeg')
);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "notify_not_before" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "photos_finalized_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lead_pending_photos" ADD CONSTRAINT "lead_pending_photos_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lead_pending_photos_slot_uq" ON "lead_pending_photos" USING btree ("lead_id","slot");--> statement-breakpoint
CREATE INDEX "lead_pending_photos_created_idx" ON "lead_pending_photos" USING btree ("created_at");--> statement-breakpoint
-- I JPEG sono già compressi: niente tentativi di ricompressione (TOAST), solo archiviazione fuori riga
ALTER TABLE "lead_pending_photos" ALTER COLUMN "data" SET STORAGE EXTERNAL;
