# Migrazione `0005_valuation_engine` — piano eseguibile (NON ancora eseguita)

> Stato: **nessun passaggio di questo documento è stato eseguito su Neon**. Gli script di verifica sono stati provati solo su un
> PostgreSQL 16 locale e temporaneo (stato pre-migrazione, migrazione, rilancio, tabelle assenti, ruolo `backup_reader` senza permessi).
> L'esistenza di uno **snapshot Neon non è stata verificata**: va controllata nella console del progetto (punto 2).

> ### Uno snapshot Neon NON è un backup indipendente
> Uno snapshot o un branch Neon vive **nello stesso progetto e presso lo stesso fornitore** del database: non protegge dalla cancellazione del progetto, da un
> errore di account o da una sospensione, e la finestra di storia (sul piano Free, 6 ore secondo la documentazione) non è conservazione a lungo termine.
> Serve come **protezione temporanea** per il momento della migrazione. Il **backup cifrato fuori da Neon** (workflow «Backup database», README «Backup»)
> resta il requisito per il lancio con clienti veri e **non è stato ancora eseguito**: è un passaggio diverso, non sostituito da questo.

## Procedura breve (5 fasi)
Nessuna fase richiede di incollare credenziali in chat: gli URL di connessione restano nel tuo terminale o nella console Neon. A me serve solo il **risultato testuale**
degli script (nomi di controlli e `true`/`false`, nessun dato personale).

| Fase | Che cosa | Chi | Criterio di successo | Se fallisce / come tornare indietro |
|---|---|---|---|---|
| **1. Protezione** | Console Neon → progetto di produzione → crea lo **snapshot manuale** `pre-0005` (o, se non disponibile, un **branch** dallo stato attuale). Riportami: piano, nome, data e ora | **tu** (console Neon) | lo snapshot compare nell'elenco, creato **da meno di un'ora** prima della migrazione | niente da annullare. Se non riesci: non migrare finché non decidi di accettare il rischio (la `0005` è additiva) |
| **2. Pre-controllo** | SQL Editor di Neon: scegli il branch/database **di produzione**, incolla `scripts/migration-0005/pre-check.sql`, esegui, **incollami la tabella dei risultati** | **tu** esegui, **io** interpreto | riga 2 = database e ruolo attesi; `ESITO = true` | `false`: **non migrare** (vedi «Come leggere i risultati») |
| **3. Migrazione** | **Percorso A (consigliato, esito visibile):** sul tuo PC, nella copia del ramo della PR: `npm ci`, poi i comandi qui sotto. **Percorso B (nessun comando locale):** la applica il sito da solo al primo avvio dopo il deploy | **tu** (A) · **io** merge, **tu** pubblichi (B) | A: `✓ Migrazioni applicate` · B: il sito si apre e il post-controllo è `true` | transazione unica: se fallisce non resta nulla a metà. In B un errore di avvio impedisce l'avvio del nuovo deploy: **ripubblica il deploy precedente** |
| **4. Post-controllo** | Stessa procedura della fase 2 con `scripts/migration-0005/post-check.sql` | **tu** esegui, **io** interpreto | `ESITO MIGRAZIONE = true`; colonne di `leads` identiche; tabelle in `public` = pre + 3; richieste e offerte uguali o maggiori | `false`: **non fare il merge** → rollback |
| **5. Rollback** | prima il codice (ripubblica il deploy precedente), poi, solo se serve, `DROP` delle tre tabelle (sezione «Rollback») | **tu** (Netlify e SQL Editor) con la mia guida | pre-controllo di nuovo `true` | **non** ripristinare lo snapshot per annullare la `0005` |

**Chi esegue cosa**
- **Io:** controllare CI e stato della PR, interpretare i risultati che incolli, fare il **merge** (solo dopo il tuo «autorizzo» e post-controllo `true`), preparare correzioni. **Non** posso accedere a Neon, creare snapshot, eseguire query o migrazioni né pubblicare su Netlify: non ho credenziali né connettori.
- **Tu:** creare lo snapshot, eseguire i due script nell'SQL Editor, eseguire la migrazione (percorso A) o pubblicare il deploy (percorso B), pubblicare su Netlify.
- Finché non mi dai una **conferma** (nome e ora dello snapshot, risultati del pre-controllo) il database **non** va considerato protetto: la conferma è una tua dichiarazione, non qualcosa che io possa verificare.

**Comandi del percorso A (PowerShell, nella cartella del ramo della PR)**
```powershell
# una sola volta: scarica il ramo "claude/compriamo-moto-rebrand-valutazione" da GitHub (Code → Download ZIP), estrailo, poi:
npm ci
$env:DATABASE_URL_DIRECT = Read-Host "URL diretta Neon (ruolo proprietario, senza -pooler)"   # solo nel terminale
npm run db:migrate                       # atteso: ✓ Migrazioni applicate
Remove-Item Env:DATABASE_URL_DIRECT
```
Se il tuo `.env.local` contiene un `DATABASE_URL`, svuotalo o rimuovilo per questa operazione: lo script lo userebbe in mancanza dell'URL diretto.

**Attenzione all'SQL Editor:** controlla sempre in alto quale branch e database sono selezionati. Se per la prova del ripristino hai un branch di test, gli script danno risultati
sul branch **selezionato**: la riga 2 del pre-controllo mostra database e ruolo, ma non il branch. Esegui i controlli ufficiali solo sul branch di **produzione**.

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
| 3 | `scripts/migration-0005/pre-check.sql` sul database di produzione | tu esegui, io interpreto | ultima riga `ESITO = true`; **annota** le righe `INFO` | `false`: **non migrare**, indica la riga fallita |
| 4 | `npm run db:migrate` con `DATABASE_URL_DIRECT` (percorso A) | tu, **solo dopo il tuo «autorizzo» esplicito** | `✓ Migrazioni applicate` | transazione annullata in automatico; rilancia `pre-check.sql` per capire lo stato |
| 5 | `scripts/migration-0005/post-check.sql` | tu esegui, io interpreto | **`ESITO MIGRAZIONE = true`**; colonne di `leads` identiche al pre-controllo, tabelle in `public` = pre + 3, richieste e offerte uguali **o maggiori** (nel frattempo possono essere arrivati clienti) | vedi «Come leggere i risultati» |
| 6 | Merge della PR #6 (io, con autorizzazione), deploy Netlify e **pubblicazione manuale** (tu: la pubblicazione automatica è bloccata) | io + tu | deploy «Published» al commit atteso | ripubblica il deploy precedente |
| 7 | Smoke test e notifiche | — | home, modulo, back office, pagina «Valutazione» senza errori; nessun importo mostrato ai clienti | rollback del deploy |

`VALUATION_PUBLIC_OFFERS`, `NOTIFY_RETRY_ENABLED` e `NOTIFY_RETRY_TOKEN` non si toccano.

## Come leggere i risultati
**Pre-controllo** (`ESITO` finale, controlli 1–9)
| Se è `false` il controllo… | Significa | Cosa fare |
|---|---|---|
| 3 o 4 con 6 migrazioni e ultima `0005` | la `0005` è **già applicata** (forse dal sito al primo avvio) | non rilanciare: esegui il post-controllo |
| 3 o 4 con valori diversi (non 5 / non `0004`) | il registro non corrisponde a quanto atteso | **fermati**: non migrare e non modificare il registro; chiedimi di analizzarlo |
| 5 (tabelle già presenti) senza 6 migrazioni | applicazione parziale o manuale | **fermati** |
| 8 (CREATE) | il ruolo non può creare tabelle | usa la stringa del ruolo proprietario (URL diretta) |
| 9 (transazioni aperte) | c'è una sessione ferma da più di 5 minuti | aspetta o chiudila dalla console; poi ripeti |

**Post-controllo** (due esiti separati)
- **ESITO MIGRAZIONE (controlli 1–8)** `false`: la migrazione non è andata come previsto → vedi «Rollback» e non procedere col merge.
- **ESITO BACKUP (controllo 10)** `false`: **non è un errore della migrazione, non fare rollback.** Il ruolo `backup_reader` non vede le tabelle nuove (i permessi predefiniti valgono solo per le
  tabelle create dal ruolo che ha configurato il backup). Rimedio: rilancia `scripts/backup/setup-backup-reader.sql` come proprietario (è idempotente e concede solo `SELECT`); se il ruolo ha
  un altro nome (`backup_reader_<data>`) il controllo lo salta: verificalo con `scripts/backup/check-permissions.sql`. Se il backup non è ancora configurato il controllo è `true` per assenza del ruolo.

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
   I conteggi (`leads`, `offers`, `customers`…) devono coincidere con quelli di produzione **al momento dello snapshot** (se nel frattempo sono arrivate richieste, quelle di produzione saranno maggiori). Poi elimina il branch di prova.
4. Attenzione: un ripristino **sul posto** farebbe sparire le richieste arrivate dopo lo snapshot. Per la `0005` il rollback corretto non è il ripristino (vedi sotto).

Limiti: la finestra di 6 ore non è un backup indipendente (stesso fornitore e stesso progetto). Il backup cifrato fuori da Neon (`docs`/README «Backup») resta il
requisito per il lancio con clienti veri.

## Rollback (senza perdita di richieste dei clienti)
Le richieste (`leads`) e tutte le tabelle esistenti **non vengono mai toccate** né dalla migrazione né dal suo rollback: le tre tabelle nuove puntano alle richieste, non il contrario. Eliminarle
non cancella nessuna richiesta, cliente, offerta o foto. Ciò che si perde sono solo i dati del motore creati dopo la migrazione (valutazioni calcolate, parametri, riferimenti di mercato).

1. **Prima il codice:** ripubblica su Netlify il deploy precedente (o ripristina `main` con una PR di revert). Il codice precedente non usa le tabelle nuove.
2. **Poi, solo se serve, il database** (perdi parametri, riferimenti di mercato e valutazioni creati dopo la migrazione, non le richieste):
   ```sql
   -- operazione di SCRITTURA su produzione: solo con autorizzazione esplicita e solo se serve davvero
   begin;
   drop table valuations;
   drop table market_references;
   drop table valuation_settings;
   delete from drizzle.__drizzle_migrations where created_at = 1793054993829;  -- riga della migrazione 0005
   commit;
   ```
   Se la riga della migrazione resta, un nuovo deploy non ricrea le tabelle. Dopo il rollback `pre-check.sql` deve tornare a `ESITO = true`.
3. **Non ripristinare lo snapshot per annullare la `0005`**: ripristinare sul posto riporta il database allo stato dello snapshot e **fa sparire le richieste arrivate dopo**. È l'ultima risorsa, solo per danni diversi dalla `0005`. Per questo il rollback sopra non passa dallo snapshot.
