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
3. Ogni ora dal **recupero automatico** (sotto), anche senza traffico e senza nessuno nel back office.
4. A ogni apertura dell'elenco nel back office: riprova fino a 3 notifiche in sospeso, ma solo di richieste degli ultimi
   **7 giorni**, con almeno **5 minuti** dall'ultimo tentativo e al massimo **5 tentativi** per richiesta.
Se le notifiche vengono configurate dopo, le richieste `pending` degli ultimi 7 giorni partono con il primo recupero.

#### Recupero automatico (GitHub Actions) — commit separato
Senza altro, il recupero parte solo dal retry del browser e dall'apertura del back office: se una notifica fallisce e nessuno
apre il back office, non viene ritentata. Per questo c'è un **recupero pianificato e gratuito**:

- **Workflow** `.github/workflows/notify-retry.yml`: ogni ora (minuto 23) esegue `scripts/notify-retry/call.sh`, che fa una
  `POST` a `https://<sito>/api/internal/notifications/retry`.
- **Rotta protetta** `src/app/api/internal/notifications/retry/route.ts`: richiede `Authorization: Bearer <NOTIFY_RETRY_TOKEN>`
  (mai nell'URL; confronto a tempo costante). Risposte: **404** se `NOTIFY_RETRY_TOKEN` non è configurato o è più corto di
  32 caratteri (recupero automatico spento, nulla viene elaborato), **401** se il token manca o è errato, **429** dopo 30
  tentativi dallo stesso IP in 15 minuti, **200** con soli conteggi (`configured, candidates, sent, failed, notClaimed,
  unsent`: nessun id, codice, indirizzo o dato personale), **503** per un errore imprevisto del database. Sono accettate
  solo richieste `POST`; il corpo non viene letto; il token non finisce nei log.
- **Cosa viene riprovato:** solo notifiche recuperabili, con le stesse regole del back office: non `sent`, non `skipped`
  (richieste precedenti alle notifiche), create negli ultimi **7 giorni**, con meno di **5 tentativi** e ultimo tentativo
  più vecchio di **5 minuti** (le `pending` dopo almeno 1 minuto). Al massimo **10 richieste** per giro, le più vecchie per
  prime; il resto al giro successivo.
- **Esecuzioni sovrapposte:** il workflow usa `concurrency` (due giri non si sovrappongono) e, in ogni caso, il sito è
  protetto dalla prenotazione atomica: anche rotta, back office e retry del browser insieme non duplicano gli invii
  (provato con 4 chiamate simultanee + il recupero del back office).
- **Errori del provider:** la rotta risponde comunque 200 (conteggio `failed`), la richiesta resta recuperabile e viene
  riprovata ai giri successivi, ognuno con la **stessa chiave di idempotenza**. Lo script esce con errore (workflow rosso,
  quindi un'email di GitHub) solo se il sito non risponde, il token è rifiutato (401), il recupero è spento (404), c'è un
  limite (429) o un errore del database; se ci sono invii falliti o richieste ancora senza notifica, esce 0 ma aggiunge
  un avviso (`::warning::`) nel riepilogo del giro.

**Budget dei tentativi:** i tentativi sono al massimo 5 per richiesta (uno subito, gli altri nei giri successivi). Con un
giro all'ora, un guasto del provider che duri **più di circa 4 ore** esaurisce i tentativi: la richiesta resta «non
inviata» nel back office (con l'avviso) e non viene più ritentata da sola. Se capita, dopo aver risolto la causa
(`npm run notify:test` per verificare) la notifica si può ripristinare a mano riportando `notification_attempts` a 0 sul
database; un pulsante «Riprova» nel back office sarebbe la modifica successiva, non inclusa qui.

**Costo e limiti di GitHub Actions:** circa 720 chiamate al mese a Netlify (una funzione per giro), nessun servizio a
pagamento. Le esecuzioni pianificate possono ritardare di qualche minuto, e per i repository pubblici GitHub **disattiva i
workflow pianificati dopo 60 giorni senza attività** nel repository: se succede, si riattivano dalla scheda Actions.
Il recupero automatico non sostituisce l'avviso del back office, che resta la fonte di verità.

##### Configurazione (da fare una volta; nulla di questo è nel repository)
1. **Genera il token** (64 caratteri casuali, per esempio in Git Bash): `openssl rand -hex 32`. Non incollarlo in chat,
   nei commit o nei messaggi.
2. **Netlify** (Site configuration → Environment variables, solo contesto **Production**, «Contains secret values»):
   `NOTIFY_RETRY_TOKEN` = il token. Poi un nuovo deploy.
3. **GitHub** (Settings → Secrets and variables → Actions):
   - scheda **Secrets** → *New repository secret* → `NOTIFY_RETRY_TOKEN` = lo **stesso** token;
   - scheda **Variables** → `NOTIFY_RETRY_URL` = `https://<indirizzo-del-sito>` (solo l'origine, senza «/» né percorso);
   - scheda **Variables** → `NOTIFY_RETRY_ENABLED` = `true` (accende la pianificazione oraria).
4. **Prova:** Actions → «Recupero notifiche email» → *Run workflow*. Il lancio manuale funziona anche prima di
   `NOTIFY_RETRY_ENABLED`. Esito atteso: riga `Notifiche: recuperabili=… inviate=…` e nessun errore. Un errore 401 indica
   che i due token non coincidono; 404 che su Netlify manca il token o è corto (o non c'è stato il nuovo deploy).
5. Per **spegnerlo**: `NOTIFY_RETRY_ENABLED` diverso da `true` (o rimuovere il token da Netlify: la rotta risponde 404).
   Per **cambiare il token**: aggiornare Netlify e il secret GitHub e rifare il deploy.

Non eseguire mai il recupero a mano con `curl` su una riga di comando che contenga il token (resta nella cronologia della
shell): usare il workflow manuale.

### Idempotenza e duplicati: cosa è garantito e cosa no
- **Garantito (nel nostro codice, provato dai test):** la prenotazione atomica impedisce due invii simultanei dello stesso
  lead; un lead `sent` non viene più prenotato; ogni tentativo usa **la stessa chiave** (`lead-notify-<id>`) e **lo stesso
  identico contenuto** (mittente, destinatari, oggetto, testo: costruiti dai dati salvati, senza orari «adesso»).
- **Caso «Resend accetta l'email ma il processo si ferma (o la risposta va persa/in timeout) prima di scrivere `sent`»:**
  il lead resta `sending` (o `failed` con `timeout`); dopo 5 minuti viene riprovato con la stessa chiave e lo stesso
  contenuto. **Entro 24 ore** Resend riconosce la chiave e non invia una seconda email. **Oltre le 24 ore** la chiave
  scade: un recupero tardivo (per esempio nessuno apre il back office per più di un giorno) **può inviare una seconda
  email identica**. L'assenza di duplicati oltre quella finestra **non è garantita**. È un caso raro e di basso impatto
  (una notifica doppia a una casella interna); la scelta opposta, non riprovare mai, rischierebbe di perdere una notifica.
- **Contenuto cambiato tra due tentativi** (per esempio cambia l'indirizzo del sito o `NOTIFY_EMAIL_TO/FROM`): con la
  stessa chiave Resend risponde 409 `invalid_idempotent_request`. La notifica resta `failed` (`http_409`), **senza
  duplicati**, ma non viene consegnata se la prima email non era partita: va gestita a mano (vedi il back office).
  Un 409 `concurrent_idempotent_requests` (richiesta ancora in corso) è un «riprova più tardi».
- Un lead creato dopo l'eventuale cambio di configurazione usa il contenuto nuovo: il problema riguarda solo i tentativi
  ripetuti sullo stesso lead a cavallo di un cambio.

### Indirizzo del sito nel link
Su Netlify la variabile `URL` esiste durante il build ma **non è tra quelle disponibili alle funzioni a runtime**
(secondo la documentazione di Netlify lì ci sono solo `SITE_NAME` e `SITE_ID`). Il link al back office si ricava quindi,
in ordine: `SITE.domain` (dominio proprio, in `business.ts`) → `URL` → `https://<SITE_NAME>.netlify.app` → locale. Se in
produzione l'indirizzo non è determinabile, l'email non contiene un link a `localhost` ma il percorso
`/admin/lead/<id>`, e il log di avvio lo segnala. **Da controllare nella prima email reale** che il link sia quello giusto.

## Configurazione (variabili d'ambiente)

| Variabile | Obbligatoria | Valore |
|---|---|---|
| `RESEND_API_KEY` | sì, per attivare le notifiche | chiave API di Resend (**segreto**) |
| `NOTIFY_EMAIL_TO` | sì | `compro.moto.support@gmail.com` (fino a 3 indirizzi separati da virgola) |
| `NOTIFY_RETRY_TOKEN` | no (senza: nessun recupero automatico) | token della rotta di recupero (**segreto**, ≥ 32 caratteri; `openssl rand -hex 32`). Vedi «Recupero automatico» |
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
- **Cosa è VERIFICATO sulla documentazione ufficiale** (pagine consultate via ricerca, 22/10/2026) e cosa **resta da
  confermare**:

  | Punto | Stato |
  |---|---|
  | `onboarding@resend.dev` è un mittente di prova e consegna solo all'indirizzo dell'account Resend; altrimenti 403 | verificato |
  | Per scrivere ad altri destinatari serve un dominio verificato | verificato |
  | Verifica del dominio: record DNS (SPF e DKIM, di norma su un sottodominio `send`), tempi tipici ~15 minuti, fino a 72 ore | verificato (dettagli dei record da copiare dal pannello Resend) |
  | Quali indirizzi mittente sono ammessi su un dominio verificato (radice o sottodominio) | **da confermare** al momento della verifica |
  | Piano gratuito 100/giorno e 3.000/mese, 10 richieste/secondo; 429 con `daily_quota_exceeded`, `monthly_quota_exceeded`, `rate_limit_exceeded` | verificato (da rileggere prima del lancio: prezzi e limiti possono cambiare) |
  | `Idempotency-Key` 1–256 caratteri, conservata 24 ore; stessa chiave con contenuto diverso → 409 `invalid_idempotent_request`; richiesta ancora in corso → 409 `concurrent_idempotent_requests` | verificato |
  | Se una chiave già usata con **errore** del provider (non successo) restituisce l'errore memorizzato o permette un nuovo tentativo | **da confermare** |
  | Sede dei server, DPA e trasferimenti extra-UE di Resend | **da verificare** (revisione privacy) |

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

## Migrazione del database: sicurezza all'avvio (verificata su un database temporaneo)
Le migrazioni partono all'avvio (`MIGRATE_ON_START`, predefinito attivo) con questo comportamento, **provato** con PostgreSQL
reale (non con Neon):
- **Due o più istanze insieme:** prendono un *advisory lock* di sessione; una applica, le altre attendono e poi trovano
  tutto già applicato. Prova con 4 processi simultanei: tutti riusciti, 4 migrazioni registrate (nessun doppione),
  5 colonne create una sola volta. Prova con il lock tenuto da un'altra sessione per 6 s: la migrazione ha atteso 6 s.
- **Errore a metà migrazione:** le migrazioni pendenti girano in **una transazione** (DDL transazionale di PostgreSQL):
  con uno statement finale che falliva, nessuna colonna è rimasta, nessuna migrazione risulta registrata, il lead
  preesistente è intatto; il rilancio con la versione corretta ha applicato tutto.
- **Processo ucciso (`kill -9`) durante la migrazione:** transazione annullata alla chiusura della connessione, lock
  rilasciato, nessuna sessione residua; il rilancio ha applicato la migrazione normalmente.
- **Database non raggiungibile:** errore chiaro (exit 1); all'avvio del server il processo si ferma (fail fast) invece di
  servire richieste con uno schema incerto.
- **Su Netlify** (dedotto dal codice e dalla documentazione, non provato lì): serve `DATABASE_URL_DIRECT` (connessione
  diretta, non il pooler) perché il lock è di sessione: il controllo di configurazione la richiede. La migrazione parte
  al primo avvio di una funzione dopo il deploy. È rapida: `ADD COLUMN` con valore predefinito non riscrive la tabella,
  l'`UPDATE` iniziale riguarda poche righe. Le istanze del deploy precedente ancora attive non sono toccate (le colonne
  sono nuove e opzionali per il codice vecchio).
- **Limiti noti:** l'attesa del lock non ha un timeout (un'istanza resta in attesa finché il lock non viene rilasciato; su
  Netlify la funzione scade comunque al limite di tempo e riprova al richiamo successivo); `ALTER TABLE` prende per un
  istante un blocco esclusivo su `leads`: va applicata in un momento di poco traffico, cosa che con 10–20 persone è
  irrilevante.
- Consigliato per il primo deploy: applicare la migrazione **prima** con `npm run db:migrate` (con `DATABASE_URL_DIRECT`),
  per vederne l'esito, poi fare il deploy.

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
