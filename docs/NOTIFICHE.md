# Notifiche email per le nuove richieste

Quando un cliente invia una richiesta, il titolare riceve un'email con il **codice**, i **dati essenziali della moto** e un
**link al back office** (che chiede il login). L'email **non contiene dati personali del cliente** (né nome, telefono,
email, comune): quelli si vedono solo nel back office.

Provider: **Resend** (una chiamata HTTP, nessuna dipendenza aggiuntiva). Il destinatario si imposta con `NOTIFY_EMAIL_TO` (nella documentazione e nei test si usa l'indirizzo fittizio
`notifiche@example.invalid`: l'indirizzo reale sta solo nella variabile d'ambiente, mai nel repository).

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
`skipped` = richieste già presenti quando le notifiche sono state introdotte (nessuna notifica retroattiva);
`throttled` = sospesa perché il **limite giornaliero** di notifiche è esaurito (vedi «Limiti anti-abuso»): la richiesta del cliente
è salvata, la notifica riparte da sola dal giorno dopo e non consuma tentativi.
Il back office mostra lo stato nel dettaglio della richiesta e, nell'elenco, un avviso se le notifiche non sono
configurate o se alcune non sono andate a buon fine.

### Tentativi di recupero
1. Subito dopo il salvataggio.
2. Se il browser rimanda lo stesso modulo (retry/doppio invio) e la notifica non risulta inviata.
3. Ogni ora dal **recupero automatico** (sotto), anche senza traffico e senza nessuno nel back office.
4. A ogni apertura dell'elenco nel back office: riprova fino a 3 notifiche in sospeso, ma solo di richieste degli ultimi
   **7 giorni**, con almeno **5 minuti** dall'ultimo tentativo e al massimo **5 tentativi** per richiesta.
Se le notifiche vengono configurate dopo, le richieste `pending` degli ultimi 7 giorni partono con il primo recupero.

#### Recupero automatico (GitHub Actions)
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

**Budget dei tentativi:** i tentativi **automatici** sono al massimo 5 per richiesta. Le «circa 4 ore» valgono **solo per
il recupero automatico**, con un giro all'ora: uno subito e uno a ogni giro successivo. Il budget però può esaurirsi
**prima**, perché ogni tentativo lo consuma, qualunque ne sia l'origine: retry del browser, aperture dell'elenco nel back
office, retry manuali, anche più giri ravvicinati. Esaurito, la richiesta resta «non inviata» nel back office (con
l'avviso) e **non viene più ritentata da sola**; per quei casi c'è il **retry manuale** descritto sotto.

#### Retry manuale (back office)
Nel dettaglio di una richiesta, nel riquadro «Notifica email», compare il pulsante **«Riprova invio ora»** quando la
notifica è `failed` (anche con i tentativi automatici esauriti) oppure è ferma da oltre 10 minuti (`pending`/`sending`), e
solo se le notifiche sono configurate.
- **Solo admin:** è un'azione del back office (`retryNotificationAction`) che chiama `requireAdmin()` prima di tutto,
  dietro il login come ogni altra pagina `/admin`. Non esiste nessuna rotta pubblica per il retry manuale.
- **Esplicito e tracciato:** ogni clic registra un evento `notification_manual_retry` (richiesta, **id** dell'admin, esito:
  `sent`, `failed`, `not_claimed`, `disabled`, `throttled`; nessun dato del cliente). Le ultime cinque volte sono elencate
  nel dettaglio («Riprovata a mano il … da …: non riuscita»): l'email dell'admin si ricava solo al momento della lettura.
- **Prenotazione atomica e idempotenza:** passa dalla stessa prenotazione degli invii automatici e usa la **stessa chiave**
  `lead-notify-<id>` e lo stesso contenuto. Non si può riprovare una richiesta già `sent`, precedente alle notifiche
  (`skipped`) o con un invio in corso da meno di 5 minuti; più clic insieme, o un clic insieme al recupero automatico,
  producono un solo invio. Il retry manuale ignora il tetto e l'attesa dei tentativi automatici, nient'altro.
- **Contatore:** ogni tentativo, anche manuale, incrementa `notification_attempts` (può quindi superare 5: «6 in tutto»).
  Il recupero automatico continua a ignorare le richieste che hanno raggiunto il tetto, anche dopo un retry manuale fallito.
- **Cosa vede l'admin:** con i tentativi automatici esauriti il riquadro dice «Non verrà ritentata in automatico» e il modulo
  avverte che il nuovo sarà un **tentativo manuale** e, se fallisce, non verrà ritentato da solo; dopo il clic il messaggio
  ripete se un eventuale fallimento verrà o non verrà ritentato in automatico. Con meno di 5 tentativi dice invece che il
  sistema riprova da solo. Se la richiesta non esiste, risulta già inviata o ha un invio appena partito (anche da un altro
  admin) il messaggio lo dice e non parte nulla.
- **Invio appeso rilevato da un altro processo:** ogni prenotazione assegna un «ticket» (il numero del tentativo) e ogni
  scrittura finale dell'esito richiede il proprio ticket. Se un invio resta appeso oltre 5 minuti e un altro processo (o un
  clic manuale) lo rileva, l'esito in ritardo del vecchio processo **non può più sovrascrivere** quello del nuovo. I test
  simulano i tre ordini di arrivo (verificato che senza il ticket due su tre fallivano).
- **Registro eventi e dati personali:** l'evento `notification_manual_retry` contiene solo `{adminId, outcome}` e l'id della
  richiesta: nessun dato del cliente e **nessuna email** (verificato da test). Vedi «Privacy: cosa viene conservato».
- **Duplicati:** se l'email precedente era in realtà stata consegnata (risposta persa), entro 24 ore la chiave impedisce un
  secondo invio; **oltre le 24 ore potrebbe arrivarne una seconda identica**. Il pulsante lo ricorda.
- **Nessun intervento sul database** è più necessario per questo caso.

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

### Limiti anti-abuso e quota giornaliera
Obiettivo: un bot non deve esaurire la quota gratuita di Resend (100 email/giorno) **né** impedire a un cliente vero di
inviare la richiesta. Nessun servizio esterno, nessun costo, nessuna nuova dipendenza: solo una tabella nel database già in uso.

| Protezione | Valore | Dove | Cosa succede oltre il limite |
|---|---|---|---|
| Gettone del modulo (HMAC, firmato col `SESSION_SECRET`) | età minima 3 s, massima 2 ore; 3 invii per gettone in 3 ore | `src/modules/leads/form-token.ts`, `GET /api/leads/form-token` | **422** con un messaggio chiaro («ricarica la pagina»); il modulo rinnova il gettone da solo ogni 45 minuti e riprova una volta se l'invio è troppo rapido |
| Richieste per IP | 12 all'ora (tetto **ampio**: chi sta dietro lo stesso IP, per esempio un ufficio o una rete mobile, non viene penalizzato) | database | **429** con `Retry-After` |
| Richieste per telefono / per email | 3 al giorno ciascuno (una persona con più moto resta servita) | database | **429** con un messaggio chiaro; i contatori contengono solo hash |
| Un invio ripetuto (stesso `submissionId`) | mai limitato | — | restituisce la richiesta già salvata |
| **Notifiche email al giorno** | `NOTIFY_DAILY_LIMIT` (predefinito **50**, giorno UTC; `0` = nessun limite; valore non valido = 50 con avviso senza il valore) | contatore condiviso su database | vedi sotto |
| Login admin | 30 per IP e 8 per coppia IP+email ogni 15 minuti | database | blocco temporaneo |
| Rotta di recupero | 30 tentativi per IP ogni 15 minuti | database | **429** |

- **Perché sul database:** su Netlify ogni funzione è un'istanza separata e la memoria non è condivisa né duratura: un
  limite in memoria si azzera a ogni avvio a freddo. I contatori condivisi sono un'unica istruzione `INSERT … ON CONFLICT DO
  UPDATE` atomica (tabella `rate_limit_buckets`, migrazione `0004`), quindi richieste simultanee non superano il limite
  (provato con connessioni parallele su PostgreSQL 16). Le chiavi sono HMAC con `SESSION_SECRET`: nel database non ci sono IP, telefoni
  o email in chiaro; le righe scadute si riutilizzano e vengono ripulite.
- **Se il database non risponde** il limite ripiega sulla memoria dell'istanza (avviso nel log): la richiesta del cliente non
  viene bloccata per un guasto del limitatore. Le regole ad alto volume (eventi statistici, foto) restano in memoria di proposito.
- **Quota giornaliera delle notifiche, comportamento oltre il limite:** la richiesta del cliente **è sempre salvata** (201).
  Solo la notifica email passa a `throttled`: nessun invio, **nessun tentativo consumato**, un evento `notification_throttled`
  (una volta per richiesta), un avviso nel back office (elenco e dettaglio) e nel riepilogo del recupero automatico
  (`sospese=`). Riparte da sola dal giorno UTC successivo, le più vecchie per prime. L'invio fallito **restituisce** la quota.
  Il **retry manuale** di un admin non è bloccato dal limite (conta comunque nel contatore). Il limite protegge la quota di
  Resend; non è una garanzia che nessuna notifica vada persa: le richieste restano comunque sempre visibili nel back office.
- **Quota di Resend (piano gratuito):** 100/giorno e 3.000/mese. Con `NOTIFY_DAILY_LIMIT=50` restano margini per le prove e per
  i retry manuali; per cambiare il tetto serve solo la variabile e un nuovo deploy. Il tetto **mensile** non ha un contatore
  proprio: 50 al giorno equivalgono a 1.500 al mese al massimo.
- `FORM_TOKEN_REQUIRED`: il gettone è **obbligatorio in produzione**; `false` lo spegne (solo emergenza), `true` lo accende
  in sviluppo.
- **Limiti noti:** un attaccante che ottenga un gettone valido e ruoti IP, telefoni ed email può comunque generare richieste
  (fino alla quota giornaliera delle notifiche, poi solo salvataggi). Non c'è un CAPTCHA: se compaiono abusi reali si valuta
  Cloudflare Turnstile (gratuito, ma richiede un account e va dichiarato nell'informativa).

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
- **Dopo un errore del provider, un timeout, un cambio di destinatario o di mittente:** la finestra di protezione è di
  **24 ore** dalla prima richiesta con quella chiave (documentazione Resend). Entro la finestra, stessa chiave e stesso
  contenuto → stessa risposta, nessun secondo invio; stessa chiave e contenuto diverso → 409. **Cosa risponde Resend quando
  la prima richiesta con quella chiave era fallita** (se ripete l'errore o permette un nuovo tentativo) e **il codice di stato
  della risposta ripetuta** non risultano dalle pagine consultate: **da confermare in staging**. Non si afferma l'assenza di
  duplicati oltre le 24 ore né nei casi non confermati.
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
Il back office mostra (in cima all'elenco) l'origine che verrebbe usata nei link: se non è quella attesa, impostare
`SITE.domain`. `SITE_NAME` non è mai scritto nel repository: lo imposta Netlify. In staging si controlla leggendo la riga
riga «indirizzo usato nei link delle email» in cima all'elenco del back office e, poi, il link della prima email.

### Protezione del token nel workflow (esfiltrazione)
`NOTIFY_RETRY_URL` è una variabile di repository: chi potesse modificarla potrebbe far inviare il token a un indirizzo
qualsiasi. Per questo `scripts/notify-retry/call.sh`, **prima di qualunque richiesta di rete**, confronta l'origine con
l'elenco `scripts/notify-retry/allowed-origins.txt` (confronto esatto, nel repository: cambiarlo richiede una PR rivista).
Se non c'è, esce con errore e il token non viene inviato. Inoltre: nessun redirect viene seguito (`--max-redirs 0`), il token
viaggia solo nell'intestazione `Authorization` passata a curl da standard input (non negli argomenti né nei log), e il
workflow gira solo dal ramo `main`. Dopo un cambio di indirizzo del sito (dominio proprio) **va aggiornato l'elenco**.
Limite: chi può modificare il ramo `main` o i secret del repository ha già accesso al token; la protezione riguarda gli
errori di configurazione e la modifica della sola variabile.

### Procedura di verifica in staging (NON eseguita: serve un account Resend e un ambiente di prova)
Da fare una volta, con credenziali **di prova** e mai con quelle di produzione:
1. Ambiente di prova (Netlify: un sito separato, o locale con `.env.local`) con `RESEND_API_KEY` di prova,
   `NOTIFY_EMAIL_TO` = l'indirizzo dell'account Resend, `NOTIFY_DAILY_LIMIT=3`, `NOTIFY_RETRY_TOKEN` di prova.
2. `npm run notify:test` (anteprima) e poi `npm run notify:test -- --yes`: arriva **una** email `[PROVA]`.
3. Inviare una richiesta di prova dal sito: arriva un'email con il link; controllare che il **link** sia quello giusto e che
   non contenga dati personali. Poi cancellarla con `npm run privacy:erase`.
4. Inviarne altre 3: dalla quarta la richiesta resta salvata, la notifica è `throttled` e il back office la segnala.
5. Idempotenza: con `NOTIFY_EMAIL_TO` temporaneamente sbagliato (stesso account, indirizzo diverso) provocare un `failed`, poi
   correggerlo e usare il retry manuale: annotare se Resend risponde 409, ripete l'errore o invia (punti «da confermare»).
6. GitHub: impostare `NOTIFY_RETRY_URL` (origine presente in `allowed-origins.txt`), il secret, e lanciare a mano il
   workflow «Recupero notifiche email»: esito atteso `Notifiche: recuperabili=… inviate=… sospese=…`. Provare anche con un
   `NOTIFY_RETRY_URL` **non** in elenco: deve fallire senza inviare il token.
7. Registrare gli esiti qui sotto («verificato il …») e solo dopo passare alle credenziali di produzione.

### Privacy: cosa viene conservato (decisioni tecniche, non una dichiarazione di conformità)
| Dato | Dove | Conservazione | Cancellazione (`npm run privacy:erase`) |
|---|---|---|---|
| Dati della richiesta (cliente, moto, foto, storico stati, offerte) | database e storage | secondo la politica di conservazione da definire | cancellati |
| Evento `notification_manual_retry` | `events` | solo **id** dell'admin e esito; l'email si ricava in lettura dal profilo admin | **cancellato** con la richiesta |
| Altri eventi (`lead_created`, `notification_throttled`…) | `events` | nessun dato personale: statistiche | **anonimizzati** (`lead_id` → nulla), non cancellati |
| Contatori anti-abuso | `rate_limit_buckets` | solo **hash** (HMAC) di IP, telefono, email; scadono dopo al massimo 26 ore | non necessaria: non permettono di risalire alla persona senza il `SESSION_SECRET` |
| Email dell'admin | `admin_users`, `changed_by`, `created_by` | finché l'account esiste | fuori ambito: dati degli amministratori |
| Copie di backup | archivio crittografato | non toccate da `privacy:erase`: la cancellazione si applica ai backup alla loro scadenza | — |

- **Gara fra retry manuale e cancellazione:** risolta. La cancellazione blocca la riga della richiesta (`SELECT … FOR UPDATE`)
  e il retry manuale inserisce l'evento con `INSERT … SELECT … FOR SHARE` sulla stessa riga: o l'evento è già scritto (e
  viene cancellato) oppure il retry attende, non trova più la richiesta e non scrive nulla. Provato con 40 coppie
  simultanee su PostgreSQL 16 (`tests/privacy-concurrency.test.ts`). Un invio di email già partito non può essere ritirato.
- **Email dell'admin nei log:** non più scritta negli eventi (solo l'id). Resta nei log del provider e dell'hosting solo ciò
  che questi registrano di loro. Gli eventi non scadono da soli.
- **Esempi:** nel repository ci sono solo indirizzi fittizi (`example.invalid`, `example.com`). Quelli reali sono nelle
  variabili d'ambiente e nella cronologia git già esistente (non riscritta).

## Configurazione (variabili d'ambiente)

| Variabile | Obbligatoria | Valore |
|---|---|---|
| `RESEND_API_KEY` | sì, per attivare le notifiche | chiave API di Resend (**segreto**) |
| `NOTIFY_EMAIL_TO` | sì | l'indirizzo di ricezione scelto, es. `notifiche@example.invalid` (fino a 3 separati da virgola) |
| `NOTIFY_DAILY_LIMIT` | no | massimo di notifiche al giorno (giorno UTC), predefinito **50**, `0` = nessun limite |
| `FORM_TOKEN_REQUIRED` | no | gettone anti-bot del modulo: obbligatorio in produzione; `false` lo spegne, `true` lo accende in sviluppo |
| `NOTIFY_RETRY_TOKEN` | no (senza: nessun recupero automatico) | token della rotta di recupero (**segreto**, ≥ 32 caratteri; `openssl rand -hex 32`). Vedi «Recupero automatico» |
| `NOTIFY_EMAIL_REPLY_TO` | no | Reply-To delle notifiche (un solo indirizzo). Se manca, nessun Reply-To |
| `NOTIFY_EMAIL_FROM` | no | mittente, per esempio `Compriamo Moto <notifiche@tuodominio.it>`. Se manca: `Compriamo Moto <onboarding@resend.dev>` |

- **Netlify:** pannello → Site configuration → Environment variables, valore **solo per il contesto Production**
  (come le altre variabili: vedi [PUBBLICAZIONE.md](PUBBLICAZIONE.md)). Per `RESEND_API_KEY` attivare «Contains secret
  values». Dopo averle inserite serve un nuovo deploy.
- Nessuna chiave è nel repository: un test automatico lo verifica.
- Se mancano o sono incomplete, le notifiche sono **disattivate** (il sito funziona e le richieste arrivano): il log di
  avvio, `npm run check:env` e il back office lo segnalano. Non è un errore bloccante, di proposito.

### Mittente di prova e dominio (verificato sulla documentazione di Resend)
- `onboarding@resend.dev` è un mittente **di prova**: consegna **solo all'indirizzo con cui è registrato l'account
  Resend**; verso qualsiasi altro destinatario l'API risponde **403**.
  → Registrare l'account Resend **con lo stesso indirizzo impostato in `NOTIFY_EMAIL_TO`**: così il mittente di prova consegna
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
  per questo ci sono i limiti descritti in «Limiti anti-abuso e quota giornaliera».
- **Idempotenza:** intestazione `Idempotency-Key`, da 1 a 256 caratteri, conservata 24 ore.
- Fonte: documentazione ufficiale di Resend (pagine *Send Email*, *Idempotency Keys*, *Usage Limits*, *Account quotas and
  limits*, *403 Error Using resend.dev Domain*), consultata il 22/10/2026 tramite ricerca: le pagine non erano aprendibili
  direttamente dall'ambiente di sviluppo. **Rileggere i limiti e i prezzi aggiornati prima del lancio.**

## Comando di prova: `npm run notify:test`
Invia **una** email di prova (`[PROVA] Notifiche Compriamo Moto`) al destinatario configurato. Non crea richieste, non apre
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
File: `drizzle/0004_rate_limit_and_throttled.sql` (additiva e compatibile col codice precedente): crea `rate_limit_buckets` e
allarga il vincolo CHECK di `leads.notification_status` aggiungendo `throttled`. **Non applicata a nessun database reale.**
Rollback manuale: `DROP TABLE rate_limit_buckets;` e ripristino del vincolo senza `throttled` (dopo aver portato a `pending` le righe `throttled`).

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

## Indirizzo email ufficiale e checklist di migrazione
Indirizzo ufficiale: `compriamo.moto.support@gmail.com`. Nel repository compare **una sola volta** come dato attivo,
`CONTACTS.email` in `src/config/business.ts` (da lì lo prendono footer e link `mailto:`). Il vecchio indirizzo non è più
in nessun file versionato (resta solo nella cronologia Git, che non si modifica); un test lo verifica.

**Da dove arrivano i campi di un'email di notifica** (verificato nel codice):
- `to`: solo dalla variabile `NOTIFY_EMAIL_TO` (`config.ts`); nessun indirizzo è nel codice. Se in produzione risulta
  ancora il vecchio indirizzo, è il valore della variabile su Netlify: va cambiato lì, poi serve un nuovo deploy.
- `from`: `NOTIFY_EMAIL_FROM`, altrimenti il mittente di prova `Compriamo Moto <onboarding@resend.dev>`.
- Reply-To: prima non esisteva. Ora è la variabile facoltativa `NOTIFY_EMAIL_REPLY_TO` (inviata a Resend come
  `reply_to`); se vuota non si invia nulla. Le notifiche vanno solo al titolare e non contengono i contatti del cliente:
  il Reply-To è utile perché una risposta dal mittente di prova (`onboarding@resend.dev`) non arriverebbe a nessuno.
  Consigliato: impostarla a `compriamo.moto.support@gmail.com`.

| Servizio | Cosa controllare | Nel repository? | Stato |
|---|---|---|---|
| **Netlify** | `NOTIFY_EMAIL_TO` (Production ed eventuali Deploy Preview/Branch deploy) = nuovo indirizzo; aggiungere `NOTIFY_EMAIL_REPLY_TO`; poi nuovo deploy | No: solo variabili d'ambiente | da aggiornare |
| **Netlify** | `NOTIFY_EMAIL_FROM` (se impostata) e `ADMIN_EMAIL`: funzioni diverse, vedi sotto | No | da confermare manualmente |
| **Resend** | Email dell'account: con il mittente di prova le notifiche arrivano **solo** a quell'indirizzo; se l'account è registrato con il vecchio, il nuovo destinatario riceve 403. Cambiare l'email dell'account o verificare un dominio | No | da confermare manualmente |
| **Resend** | Template: non esistono, il testo è generato da `new-lead.ts` e non contiene indirizzi email | Sì | verificato |
| **Supabase** | Nel codice è solo storage S3 delle foto: nessun template o mittente email. In dashboard controllare solo eventuali notifiche di progetto (auth non toccata) | No | da confermare manualmente |
| **Gmail** | La casella `compriamo.moto.support@gmail.com` esiste e riceve; le notifiche non finiscono in spam (filtro «mai in spam» per il mittente); eventuale inoltro dalla vecchia casella | No | da confermare manualmente |

Indirizzi con funzione diversa, **non** modificati: `ADMIN_EMAIL` (login del back office, `src/db/bootstrap.ts`,
`scripts/admin-user.ts`) e `NOTIFY_EMAIL_FROM` (mittente).

## Fornitori coinvolti (documentazione tecnica, NON l'informativa privacy)
| Fornitore | Ruolo | Dati trattati |
|---|---|---|
| **Resend** | invia l'email di notifica | indirizzo destinatario, mittente, oggetto e testo (codice richiesta, marca, modello, anno, km, condizioni della moto, link al back office). **Nessun dato di contatto del cliente** |
| **Google (Gmail)** | casella di ricezione (l'indirizzo in `NOTIFY_EMAIL_TO`) | le stesse notifiche |

Da verificare e completare nella revisione privacy **separata** (non fatta qui): sede e DPA di Resend e Google,
trasferimenti extra-UE e inserimento tra i fornitori dell'informativa (`PROVIDERS` in `business.ts`, pagina `/privacy`).
L'oggetto e il corpo contengono marca e modello scritti dal cliente nel campo «Altro»: vengono ripuliti da markup, a
capo e indirizzi, ma restano testo libero.

## Test
Nessuna email reale: trasporto finto, `fetch` simulato; in `NODE_ENV=test` il trasporto reale non viene mai creato. Database:
PGlite temporaneo, oppure PostgreSQL vero con `TEST_DATABASE_URL` (connessioni parallele vere).
- `tests/notifications.test.ts`: invio, contenuto senza dati personali, errori del provider, attese, tentativi esauriti,
  recupero dal back office, duplicati e concorrenza, trasporto Resend, configurazione, assenza di chiavi nel repository, `notify:test`.
- `tests/notification-retry.test.ts`: recupero automatico (rotta protetta, token, conteggi, 429), script `call.sh`
  (compresa l'origine non autorizzata, che non deve inviare il token) e workflow.
- `tests/notification-manual-retry.test.ts`: retry manuale, ticket, ordini di arrivo degli esiti, messaggi all'admin.
- `tests/anti-abuse.test.ts`: rate limit condiviso, limiti per IP/contatto, gettone del modulo, limite giornaliero (sospese,
  riavvio, quota restituita, retry manuale esente, richieste simultanee).
- `tests/privacy-concurrency.test.ts`: cancellazione privacy e retry manuale concorrenti.
- `tests/frontend.test.ts` e `e2e/smoke.spec.ts`: testi per il cliente (terminologia «moto», ambito del servizio).
