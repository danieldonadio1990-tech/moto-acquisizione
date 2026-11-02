# Email di conferma al cliente e consenso marketing

## Email di conferma (messaggio di servizio)
- Parte quando la richiesta è salvata (`POST /api/leads`), **insieme** alla notifica interna e senza ritardarla (in parallelo, stesso limite di 4 secondi).
- **Riusa il sistema esistente**: stesso trasporto Resend (`src/modules/notifications/transport.ts`, che ora accetta anche `html`), stesse variabili
  (`RESEND_API_KEY`, `NOTIFY_EMAIL_FROM`, `NOTIFY_EMAIL_REPLY_TO`), stessa quota giornaliera (contatore proprio `customer-email-day`, limite `NOTIFY_DAILY_LIMIT`).
  Nessuna variabile nuova. Se le notifiche non sono configurate, non parte nulla e la richiesta funziona.
- **Contenuto** (`src/modules/notifications/customer-email.ts`): titolo «Abbiamo ricevuto la tua richiesta!», logo `public/brand/v2/email-logo.png`
  (URL assoluto sul dominio del sito), palette del marchio, ringraziamento, riepilogo della moto se disponibile, conferma di ricezione (non di acquisto),
  risposta entro 24-48 ore, firma. Anteprima: `npm run email:preview` (scrive i file HTML in `./email-preview`, non invia nulla).
- **Duplicati**: l'invio si prenota con un UPDATE condizionale su `leads.customer_email_status` (come per la notifica interna) e Resend riceve la
  chiave di idempotenza `lead-confirm-<id>`. Un retry del browser, 6 richieste parallele o 8 chiamate concorrenti producono **una sola** email.
  Dopo un errore si riprova solo dopo 5 minuti e al massimo 3 volte (al ripetersi dell'invio dello stesso modulo).
- Le richieste **già presenti** prima della migrazione sono marcate `skipped`: nessuna email retroattiva.
- Il logo nell'email compare solo dopo il deploy di questa modifica (il file è servito dal sito stesso).

## Consenso marketing
- Casella **facoltativa, mai preselezionata**, nel passo «Contatti». Testo e versione: `src/modules/marketing/text.ts`
  (`MARKETING_CONSENT_VERSION`, oggi `mkt-1`: **incrementarla se il testo cambia**).
- Registro a sola aggiunta `marketing_consents` (una riga per scelta): cliente, stato (`granted` / `declined` / `revoked`), versione del testo, origine
  (`modulo`, `email`, `back_office`) e data. Si scrive **nella stessa transazione** della richiesta.
- **Nessuna comunicazione promozionale senza consenso**: l'unico punto da cui prendere i destinatari è `listMarketingRecipients()`
  (`src/modules/marketing/consent.ts`): vale l'ultima scelta per indirizzo email; un indirizzo con ultima scelta `declined` o `revoked` non compare.
  Oggi il sito **non invia alcuna comunicazione promozionale**: esiste solo il registro e questa funzione di sola lettura.
- **Revoca**: `revokeMarketingConsent(email, origine)` aggiunge una riga `revoked`. Oggi si attiva su richiesta scritta all'indirizzo della privacy;
  un pulsante nel back office o un link di disiscrizione nelle email promozionali non esistono ancora e vanno aggiunti **prima** di inviare la prima comunicazione.

### Cancellazione di una richiesta: prova minima pseudonimizzata
Quando una richiesta viene cancellata (`privacy:erase`), il registro dei consensi del cliente **non viene eliminato per intero**: nella stessa transazione
viene ridotto alla **prova minima** in `marketing_consent_evidence`, con solo: stato, versione del testo, origine, data della scelta e **HMAC-SHA256 dell'email**
(minuscola, senza spazi). Il registro collegato (`marketing_consents`) e il cliente vengono poi eliminati.
- **Non restano** nome, telefono, email in chiaro, codice o identificativo della richiesta, né chiavi esterne verso la richiesta cancellata (la tabella non ne ha).
- **Non è anonima:** è un dato pseudonimizzato. Chi dispone della chiave può verificare se un indirizzo noto compare; l'informativa lo dichiara.
- **Chiave:** `CONSENT_EVIDENCE_KEY` (facoltativa, ≥ 32 caratteri, segreta, da impostare su Netlify **una volta** e non cambiare). Se manca si deriva da `SESSION_SECRET`
  con un'etichetta propria; ogni riga ricorda quale chiave l'ha prodotta (`hash_key_id`: `env-1` o `session-1`). **Se la chiave cambia o va persa le prove già
  salvate non sono più verificabili**: va quindi scelta e conservata prima di ricevere i primi consensi.
- **Lista di soppressione:** `listMarketingRecipients()` e `withoutRevoked(emails)` escludono chi ha una **revoca** nella prova minima; un consenso nuovo e più
  recente della revoca (un nuovo invio del modulo con la casella spuntata) rimette l'indirizzo in elenco. Una revoca chiesta dopo la cancellazione si registra
  direttamente come prova minima.
- **Atomicità:** se la riduzione fallisce, la cancellazione intera viene annullata (la richiesta non sparisce).
- **Richieste già esistenti** (prima della 0006) non hanno righe nel registro: la cancellazione funziona e non crea nessuna prova.

### ⚠️ DECISIONE APERTA: periodo di conservazione della prova minima
Il **periodo di conservazione non è stato fissato**: va definito con il consulente privacy (e indicato poi nell'informativa). Per questo motivo **non esiste nessuna
cancellazione automatica** (nessuna scadenza, nessun job): le righe di `marketing_consent_evidence` restano fino a quando non si decide. Quando il periodo sarà
approvato servirà: (1) fissarlo in codice/documentazione, (2) aggiungere uno script di cancellazione delle righe scadute (a mano o pianificato), (3) aggiornare l'informativa.

## Migrazione 0006 (additiva)
`drizzle/0006_email_cliente_consenso_marketing.sql`: **due nuove tabelle** (`marketing_consents`, `marketing_consent_evidence`) e **5 nuove colonne** su `leads` (`customer_email_*`), più
`UPDATE leads SET customer_email_status = 'skipped'`. Nessuna colonna o tabella esistente viene eliminata o rinominata.
- **Quando viene applicata:** come le precedenti, **all'avvio del sito** (`MIGRATE_ON_START`, predefinito attivo), non appena la nuova versione parte in produzione.
  Va quindi considerata applicata al **deploy** di questa modifica.
- **Prima del deploy:** snapshot manuale su Neon (come per la 0005). Verifica: tabella `marketing_consents` presente, `leads` con 5 colonne `customer_email_*`,
  tutte le richieste esistenti con `customer_email_status = 'skipped'`.
- **Rollback.** Nell'ordine:
  1. **Codice (subito, sempre sicuro):** Netlify → Deploys → pubblica il deploy precedente. Lo schema è solo additivo: il vecchio codice funziona sia prima sia dopo la 0006.
     Se la migrazione è fallita, è stata annullata per intero (transazione unica) e il database non è cambiato.
  2. **Di norma basta il punto 1:** la tabella e le colonne nuove possono restare.
  3. **Solo se vuoi eliminare anche lo schema** (dopo il punto 1, con uno snapshot Neon fresco, in una transazione unica). **Attenzione:** elimina anche i consensi e
     le prove minime raccolti nel frattempo; se esistono, esportali prima.
     ```sql
     BEGIN;
     DROP TABLE marketing_consent_evidence;
     DROP TABLE marketing_consents;
     ALTER TABLE leads DROP CONSTRAINT leads_customer_email_status_valid,
       DROP COLUMN customer_email_status, DROP COLUMN customer_email_attempts, DROP COLUMN customer_email_claimed_at,
       DROP COLUMN customer_email_sent_at, DROP COLUMN customer_email_error;
     -- obbligatorio: senza questa riga il registro di Drizzle considera la 0006 già applicata e un nuovo deploy non la riapplica
     DELETE FROM drizzle.__drizzle_migrations WHERE created_at = 1793620220880;
     COMMIT;
     ```
     Verifica: `select max(created_at) from drizzle.__drizzle_migrations;` deve tornare `1793054993829` (0005). Mai eseguirlo con il codice nuovo ancora pubblicato.
- Le procedure di verifica della 0005 (`scripts/migration-0005/*`) descrivono il passaggio 5 → 6 migrazioni: restano valide solo se la 0005 non è ancora applicata,
  e in quel caso `apply` applicherebbe anche la 0006 (che parte comunque all'avvio del sito).

## Informativa privacy
Aggiornata a `draft-5` (resta bozza: indicizzazione spenta): email di conferma, consenso marketing facoltativo e revoca, registrazione della scelta,
Resend come fornitore anche dell'email di conferma, conservazione del registro. **Da verificare con il consulente:** termine di conservazione dopo la revoca
e base giuridica della conferma di ricezione.
