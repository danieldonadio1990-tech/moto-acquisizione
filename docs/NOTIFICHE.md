# Notifiche email per le nuove richieste

Quando un cliente invia una richiesta, il titolare riceve un'email con il **codice**, i **dati essenziali della moto** e un
**link al back office** (che chiede il login). L'email **non contiene dati personali del cliente** (né nome, telefono,
email, comune): quelli si vedono solo nel back office.

Provider: **Resend** (una chiamata HTTP, nessuna dipendenza aggiuntiva). Destinatario previsto:
`compro.moto.support@gmail.com`, configurabile con `NOTIFY_EMAIL_TO`.

## Come funziona

1. `POST /api/leads` salva il lead (transazione). **Solo dopo** il salvataggio riuscito chiama `notifyNewLead(id)`
   (`src/modules/notifications/new-lead.ts`).
2. `notifyNewLead` **non lancia mai eccezioni**: un errore dell'email non cambia la risposta al cliente (201/200) e non
   tocca il lead. Se le notifiche non sono configurate non fa nulla.
3. **Prenotazione atomica:** un `UPDATE … WHERE` porta il lead da `pending`/`failed` a `sending`. Due richieste parallele
   (doppio clic, retry, apertura del back office) non possono prenotarlo entrambe: una sola invia.
4. L'invio ha un timeout di 4 secondi. Esito: `sent` (con data/ora) oppure `failed` (con un codice sintetico, per esempio
   `http_403`, `timeout`; mai il contenuto della risposta del provider).
5. **Idempotenza presso il provider:** ogni invio usa l'intestazione `Idempotency-Key: lead-notify-<id lead>`. Resend
   conserva la chiave per 24 ore e non invia una seconda email con la stessa chiave in quella finestra.

Stati (colonna `leads.notification_status`): `pending` (da inviare) → `sending` (prenotata) → `sent` | `failed`;
`skipped` = richieste già presenti quando le notifiche sono state introdotte (nessuna notifica retroattiva).
Il back office mostra lo stato nel dettaglio della richiesta e, nell'elenco, un avviso se le notifiche non sono
configurate o se alcune non sono andate a buon fine.

### Tentativi di recupero
1. Subito dopo il salvataggio.
2. Se il browser rimanda lo stesso modulo (retry/doppio invio) e la notifica non risulta inviata.
3. A ogni apertura dell'elenco nel back office: riprova fino a 3 notifiche in sospeso, ma solo di richieste degli ultimi
   **7 giorni**, con almeno **5 minuti** dall'ultimo tentativo e al massimo **5 tentativi** per richiesta.
Se le notifiche vengono configurate dopo, le richieste `pending` degli ultimi 7 giorni partono con il primo recupero.

### Rischio residuo (duplicazione)
Se il server si ferma **dopo** l'invio e **prima** di scrivere `sent`, la richiesta resta `sending`; dopo 5 minuti viene
riprovata. Entro 24 ore la chiave di idempotenza di Resend impedisce il doppio invio; oltre le 24 ore (o se il provider
non applicasse la chiave) potrebbe arrivare **una seconda email identica**. È un caso raro e a basso impatto; la scelta
opposta (non riprovare mai) rischierebbe di perdere una notifica. Se il provider dovesse restituire un errore *409* per
chiave già in uso, la richiesta resta `failed` e viene riprovata più tardi.

## Configurazione (variabili d'ambiente)

| Variabile | Obbligatoria | Valore |
|---|---|---|
| `RESEND_API_KEY` | sì, per attivare le notifiche | chiave API di Resend (**segreto**) |
| `NOTIFY_EMAIL_TO` | sì | `compro.moto.support@gmail.com` (fino a 3 indirizzi separati da virgola) |
| `NOTIFY_EMAIL_FROM` | no | mittente, per esempio `Compro Moto <notifiche@tuodominio.it>`. Se manca: `Compro Moto <onboarding@resend.dev>` |

- **Netlify:** pannello → Site configuration → Environment variables, valore **solo per il contesto Production**
  (come le altre variabili: vedi [PUBBLICAZIONE.md](PUBBLICAZIONE.md)). Per `RESEND_API_KEY` attivare «Contains secret
  values». Dopo averle inserite serve un nuovo deploy.
- Nessuna chiave è nel repository: un test automatico lo verifica.
- Se mancano o sono incomplete, le notifiche sono **disattivate** (il sito funziona e le richieste arrivano): il log di
  avvio, `npm run check:env` e il back office lo segnalano. Non è un errore bloccante, di proposito.

### Mittente di prova e dominio (verificato sulla documentazione di Resend)
- `onboarding@resend.dev` è un mittente **di prova**: consegna **solo all'indirizzo con cui è registrato l'account
  Resend**; verso qualsiasi altro destinatario l'API risponde **403**.
  → Registrare l'account Resend **con `compro.moto.support@gmail.com`**: così il mittente di prova consegna
  esattamente al destinatario previsto, senza dominio.
- Può finire nello spam e non è adatto a un uso definitivo. Per un mittente proprio: aggiungere e **verificare un dominio**
  nella pagina Domains di Resend, poi impostare `NOTIFY_EMAIL_FROM` con quel dominio. Da quel momento si può scrivere a
  qualunque destinatario.
- **Limiti** (piano gratuito): 100 email al giorno e 3.000 al mese (il giorno è UTC), 10 richieste al secondo per team.
  Oltre il limite l'API risponde 429 (`daily_quota_exceeded` / `monthly_quota_exceeded` / `rate_limit_exceeded`): la
  notifica risulta `failed` e viene riprovata. Un bot che invia molte richieste potrebbe esaurire la quota giornaliera:
  per questo resta in lista l'anti-bot (CAPTCHA o rate limit condiviso).
- **Idempotenza:** intestazione `Idempotency-Key`, da 1 a 256 caratteri, conservata 24 ore.
- Fonte: documentazione ufficiale di Resend (pagine *Send Email*, *Idempotency Keys*, *Usage Limits*, *Account quotas and
  limits*, *403 Error Using resend.dev Domain*), consultata il 22/10/2026 tramite ricerca: le pagine non erano aprendibili
  direttamente dall'ambiente di sviluppo. **Rileggere i limiti e i prezzi aggiornati prima del lancio.**

## Comando di prova: `npm run notify:test`
Invia **una** email di prova (`[PROVA] Notifiche Compro Moto`) al destinatario configurato. Non crea richieste, non apre
il database e non modifica dati dei clienti; il messaggio non contiene dati personali.

```bash
npm run notify:test            # anteprima: mostra mittente e destinatario, NON invia
npm run notify:test -- --yes   # invia davvero la prova
```
Protezioni: senza `--yes` non spedisce nulla; il destinatario è solo quello di `NOTIFY_EMAIL_TO` (nessuna opzione per
cambiarlo); con configurazione incompleta termina con errore. Le variabili si leggono dall'ambiente o da `.env.local`
(ignorato da git: **non committare mai la chiave**). Su Netlify le variabili non si leggono dal computer locale: per una
prova end-to-end sul sito reale si invia una richiesta di prova (poi si cancella con `npm run privacy:erase`).
Codici di errore: `http_403` = destinatario diverso dall'account con il mittente di prova (vedi sopra);
`http_401` = chiave non valida.

## Migrazione del database
File: `drizzle/0003_lead_notifications.sql` (additiva). Aggiunge a `leads`: `notification_status` (predefinito `pending`),
`notification_attempts`, `notification_claimed_at`, `notification_sent_at`, `notification_error`, più un vincolo CHECK sui
valori di stato; poi marca come `skipped` le richieste **già esistenti** (nessuna notifica retroattiva).
**Non è stata applicata a nessun database di produzione.** Le migrazioni partono all'avvio del server
(`MIGRATE_ON_START`, predefinito attivo): si applicherà al primo avvio del deploy che contiene questo codice.
Rollback manuale, se servisse (le colonne non sono usate dal codice precedente):
```sql
ALTER TABLE leads DROP CONSTRAINT leads_notification_status_valid;
ALTER TABLE leads DROP COLUMN notification_status, DROP COLUMN notification_attempts, DROP COLUMN notification_claimed_at,
  DROP COLUMN notification_sent_at, DROP COLUMN notification_error;
```

## Fornitori coinvolti (documentazione tecnica, NON l'informativa privacy)
| Fornitore | Ruolo | Dati trattati |
|---|---|---|
| **Resend** | invia l'email di notifica | indirizzo destinatario, mittente, oggetto e testo (codice richiesta, marca, modello, anno, km, condizioni della moto, link al back office). **Nessun dato di contatto del cliente** |
| **Google (Gmail)** | casella di ricezione `compro.moto.support@gmail.com` | le stesse notifiche |

Da verificare e completare nella revisione privacy **separata** (non fatta qui): sede e DPA di Resend e Google,
trasferimenti extra-UE e inserimento tra i fornitori dell'informativa (`PROVIDERS` in `business.ts`, pagina `/privacy`).
L'oggetto e il corpo contengono marca e modello scritti dal cliente nel campo «Altro»: vengono ripuliti da markup, a
capo e indirizzi, ma restano testo libero.

## Test
`tests/notifications.test.ts` (nessuna email reale: trasporto finto, `fetch` simulato; in `NODE_ENV=test` il trasporto
reale non viene mai creato): invio riuscito, contenuto senza dati personali, errore e eccezione del provider, retry con
attesa, tentativi esauriti, recupero dal back office, richieste duplicate e concorrenti, trasporto Resend, configurazione,
assenza di chiavi nel repository, stato nel back office e comando `notify:test`.
