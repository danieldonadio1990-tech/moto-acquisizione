-- Restringe il numero massimo di foto per richiesta da 12 a 6 (decisione Blocco 3). ADDITIVA solo nel senso che non elimina
-- né rinomina nulla: modifica un vincolo CHECK esistente su "leads"."photo_count". Nessuna foto o riga viene toccata.
--
-- SICUREZZA: prima di restringere il vincolo, questo blocco verifica che nessuna richiesta esistente abbia già più di 6
-- foto. Se ne trova, la migrazione si interrompe con un errore che elenca le richieste coinvolte (id e conteggio) e NON
-- modifica nulla: va risolto il dato (es. decidendo quali foto eccedenti rimuovere manualmente) prima di riprovare.
--
-- ROLLBACK (manuale, reversibile senza perdita di dati): ripristina il vincolo precedente (0-12) e rimuove la riga del
-- journal:
--   ALTER TABLE "leads" DROP CONSTRAINT "leads_photo_count_range";
--   ALTER TABLE "leads" ADD CONSTRAINT "leads_photo_count_range" CHECK ("leads"."photo_count" between 0 and 12);
--   DELETE FROM drizzle.__drizzle_migrations WHERE created_at = 1794433241442;
-- Le foto già presenti non sono mai state toccate da questa migrazione: il rollback non le riguarda.
DO $$
DECLARE
  bad_list text;
BEGIN
  SELECT string_agg(format('%s (%s foto)', id, photo_count), ', ' ORDER BY photo_count DESC)
    INTO bad_list
    FROM "leads"
    WHERE "photo_count" > 6;
  IF bad_list IS NOT NULL THEN
    RAISE EXCEPTION 'Migrazione 0009 interrotta: richieste con più di 6 foto già presenti (nessun dato modificato): %', bad_list;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "leads" DROP CONSTRAINT "leads_photo_count_range";--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_photo_count_range" CHECK ("leads"."photo_count" between 0 and 6);
