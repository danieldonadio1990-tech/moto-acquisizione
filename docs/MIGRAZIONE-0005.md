# Migrazione `0005_valuation_engine` — piano eseguibile (NON ancora eseguita)

> Stato: **nessun passaggio di questo documento è stato eseguito su Neon**. Gli script di verifica sono stati provati solo su un
> PostgreSQL 16 locale e temporaneo (stato pre-migrazione, migrazione, rilancio, tabelle assenti, ruolo `backup_reader` senza permessi).
> L'esistenza di uno **snapshot Neon non è stata verificata**: va controllata nella console del progetto (punto 2).

## Cosa fa la migrazione
`drizzle/0005_valuation_engine.sql` crea **solo** tre tabelle nuove e vuote (`valuation_settings`, `market_references`, `valuations`), i loro
indici, vincoli e due chiavi esterne. Nessun `UPDATE`/`DELETE`/`DROP`, nessuna colonna aggiunta alle tabelle esistenti. Il sito attuale (`5d23ecc`)
la ignora. Il codice nuovo, se le tabelle mancano, mostra un avviso nel back office e al cliente la conferma standard (fallback, commit `597044c`).

- **Comando:** `npm run db:migrate` (`scripts/db-migrate.ts` → `runPostgresMigrations`): connessione **diretta** (`DATABASE_URL_DIRECT`, senza `-pooler`),
  lock di sessione, transazione unica. È lo stesso percorso che il sito userebbe da solo all'avvio (`MIGRATE_ON_START`).
- **Ruolo:** quello dell'URL diretto (di norma il proprietario del database). Registro: `drizzle.__drizzle_migrations` (da 5 a **6** righe).
- **Doppia applicazione:** Drizzle applica solo ciò che è più recente dell'ultima riga registrata: rilanciare non fa nulla (provato in locale).

## Sequenza (ogni passaggio con il suo criterio di successo)
| # | Passaggio | Chi | Successo | Se fallisce |
|---|---|---|---|---|
| 1 | Controlli CI della PR #6 verdi sul commit da distribuire | — | `check`, `shellcheck`, `script-tests`, `rehearsal` verdi | non procedere |
| 2 | **Verifica dello snapshot Neon** (vedi sotto) | tu | snapshot visibile con data e ora, oppure branch di prova creato | senza snapshot: decidi se procedere (migrazione additiva) o preparare prima il backup cifrato |
| 3 | `scripts/migration-0005/pre-check.sql` sul database di produzione | tu o io, con autorizzazione | ultima riga `ESITO = true`; **annota** le righe `INFO` | `false`: **non migrare**, indica la riga fallita |
| 4 | `npm run db:migrate` con `DATABASE_URL_DIRECT` | **solo con autorizzazione esplicita** | `✓ Migrazioni applicate` | transazione annullata in automatico; rilancia `pre-check.sql` per capire lo stato |
| 5 | `scripts/migration-0005/post-check.sql` | stesso | `ESITO = true` e le `INFO` **identiche** a quelle del pre-controllo (tranne «tabelle nello schema public» +3) | vedi Rollback |
| 6 | Merge della PR #6, deploy Netlify, **pubblicazione manuale** (la pubblicazione automatica è bloccata) | con autorizzazione | deploy «Published» al commit atteso | ripubblica il deploy precedente |
| 7 | Smoke test e notifiche | — | home, modulo, back office, pagina «Valutazione» senza errori; nessun importo mostrato ai clienti | rollback del deploy |

`VALUATION_PUBLIC_OFFERS`, `NOTIFY_RETRY_ENABLED` e `NOTIFY_RETRY_TOKEN` non si toccano.

## Come usare gli script di verifica (sola lettura)
Contengono solo `SELECT` su cataloghi e conteggi, nessun dato personale. Due modi:
- **SQL Editor di Neon** (nessuna installazione): apri il file, incolla il contenuto, esegui. Il risultato è una tabella di controlli.
- **psql 18 sul tuo PC**, con la stringa **diretta** in una variabile della sola sessione:
  ```powershell
  $env:PGURL = Read-Host "URL diretta Neon"          # incollata solo nel terminale, mai in chat
  psql $env:PGURL -v ON_ERROR_STOP=1 -f scripts/migration-0005/pre-check.sql
  Remove-Item Env:PGURL
  ```
Se `drizzle.__drizzle_migrations` non esistesse il pre-controllo va in errore: anche questo è un motivo per non migrare.
Il post-controllo prima della migrazione dà `ESITO = false` senza errori.

## Snapshot Neon — come verificarlo (da fare nella console, non l'ho potuto fare io)
Dalla documentazione Neon (consultata via ricerca; non verificata sul tuo progetto): sul piano Free c'è **1 snapshot manuale** (solo dal branch radice) e una
**finestra di storia di 6 ore**; i branch si possono creare da un punto passato dentro la finestra. Nella console del progetto di produzione (sezione
**Backup & Restore**, il nome può variare):
1. Controlla il **piano** e la **finestra di storia** impostata.
2. **Crea lo snapshot manuale** del branch di produzione (nome suggerito: `pre-0005`) e annota data e ora. Se l'unico snapshot disponibile è già occupato, non
   cancellarlo senza sapere cosa contiene: in alternativa crea un **branch** dallo stato attuale.
3. **Prova di ripristino su un branch isolato (mai sul branch di produzione):** ripristina lo snapshot **su un nuovo branch** (senza «finalizzare» né sostituire il
   branch originale). Prendi la stringa di connessione del branch di prova (è una credenziale: non incollarla in chat) ed esegui:
   ```powershell
   psql $env:PGURL_TEST -f scripts/backup/verify.sql
   ```
   I conteggi (`leads`, `offers`, `customers`…) devono coincidere con quelli di produzione al momento dello snapshot. Poi elimina il branch di prova.
4. Attenzione: un ripristino **sul posto** farebbe sparire le richieste arrivate dopo lo snapshot. Per la `0005` il rollback corretto non è il ripristino (vedi sotto).

Limiti: la finestra di 6 ore non è un backup indipendente (stesso fornitore e stesso progetto). Il backup cifrato fuori da Neon (`docs`/README «Backup») resta il
requisito per il lancio con clienti veri.

## Rollback
1. **Prima il codice:** ripubblica su Netlify il deploy precedente (o ripristina `main` con una PR di revert). Il codice precedente non usa le tabelle nuove.
2. **Poi, solo se serve, il database** (perdi parametri, riferimenti di mercato e valutazioni creati dopo la migrazione, non le richieste):
   ```sql
   begin;
   drop table valuations;
   drop table market_references;
   drop table valuation_settings;
   delete from drizzle.__drizzle_migrations where created_at = 1793054993829;  -- riga della migrazione 0005
   commit;
   ```
   Se la riga della migrazione resta, un nuovo deploy non ricrea le tabelle. Dopo il rollback `pre-check.sql` deve tornare a `ESITO = true`.
3. Ripristinare lo snapshot è l'ultima risorsa (danni oltre la `0005`): perde le richieste successive allo snapshot.
