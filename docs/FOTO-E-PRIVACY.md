# Caricamento foto e informativa privacy: diagnosi e dati da fornire

## Come funziona il caricamento
1. Il browser ridimensiona ogni foto (max 1800 px, JPEG; legge l'immagine con `createImageBitmap` e, se non basta, con `<img>` + canvas) e le invia a gruppi di massimo 3 foto e 3 MB.
2. `POST /api/leads/<id>/photos` verifica il gettone della richiesta, conta i byte realmente ricevuti (tetto 3,4 MB), controlla dal **contenuto** che sia un'immagine (non dall'estensione né dal MIME), toglie i metadati (anche il GPS) e la salva nello storage S3 (mai su disco, che su Netlify non è persistente).
3. Ogni foto ha un identificativo: ripetere un invio non crea copie. Le foto sono associate alla richiesta nel database (`lead_photos`) e si rileggono solo dal back office.
4. Se un invio fallisce, i dati della richiesta sono già salvati e le anteprime restano nella pagina: basta premere di nuovo «Invia le foto».

## Come capire perché un caricamento fallisce (Netlify)
Nei log delle funzioni di Netlify (Logs → Functions) cerca queste righe, che non contengono dati personali né token:

| Riga | Significato |
|---|---|
| `[api/photos] rifiutata 403: token non valido` | link per le foto scaduto o richiesta diversa da quella creata |
| `[api/photos] rifiutata 413: …` | richiesta oltre il tetto di dimensione |
| `[api/photos] rifiutata 415: content-type inatteso (…)` | la richiesta non è multipart |
| `[api/photos] rifiutata 408: timeout lettura corpo` | connessione troppo lenta |
| `[foto:storage] {…}` | **lo storage S3 non risponde o rifiuta le chiavi** (bucket, chiavi, endpoint, progetto Supabase sospeso): è la causa più probabile di un «Salvataggio non riuscito» |
| `[foto:db] {…}` | errore del database durante il salvataggio |
| `[api/photos] {…}` (senza «rifiutata») | errore imprevisto nella rotta |

Per provare lo storage reale prima di tutto il resto: `npm run check:storage` (con le variabili `S3_*` solo nella tua shell, mai in chat).

**Nota:** una versione precedente della rotta rifiutava con 411 ogni richiesta senza intestazione `Content-Length`; ora il tetto è sui byte ricevuti. Se i log mostrano `[foto:storage]`, la correzione del codice non basta: va sistemato lo storage (nessun costo, ma serve un intervento nel pannello del fornitore).

## Diagnosi dell'upload in produzione (senza log)
Il messaggio «Alcune foto non sono state caricate…» compare solo se il server ha risposto **200** ma almeno una foto è finita in «error» (un errore HTTP mostra
invece il suo messaggio con il codice). Gli esiti per foto sono: `saved`/`duplicate` (ok), `invalid` (file non valido, foto in rosso), `limit` (12 foto), `error`
(**archivio foto o database**). Da questa versione il messaggio «error» dice dove e con quale codice tecnico (es. «Archivio delle foto non raggiungibile (NoSuchBucket,
HTTP 404)»); i codici sono solo nomi di errore, mai indirizzi o chiavi.

Controllo dentro il sito pubblicato, senza terminale: da amministratore (già connesso al back office) apri **`/api/admin/storage-check`**. Esegue nello stesso runtime di un
upload vero: elaborazione immagini (sharp), lettura della tabella delle foto, scrittura/lettura/elenco/cancellazione di un solo oggetto di prova sotto `healthcheck/`.
Risposta JSON con la configurazione non segreta (driver, bucket, regione, host dell'endpoint, path-style) e l'esito di ogni passo con nome dell'errore e stato HTTP. Non
tocca foto o dati dei clienti e non restituisce chiavi.

| Passo fallito | Causa tipica |
|---|---|
| `storage: scrittura` con `InvalidAccessKeyId` / `SignatureDoesNotMatch` / `AccessDenied` (403) | chiavi o permessi del bucket sbagliati; regione errata |
| `storage: scrittura` con `NoSuchBucket` (404) | nome del bucket sbagliato o bucket non creato |
| `storage: scrittura` con `ENOTFOUND` / `ETIMEDOUT` / `UnknownEndpoint` | endpoint sbagliato, `S3_FORCE_PATH_STYLE` non `true` per Supabase, progetto sospeso |
| `database: lettura della tabella delle foto` | tabella o permessi del database |
| `elaborazione immagini (sharp)` | libreria immagini non disponibile nell'hosting |

## Informativa privacy: cosa è cambiato
- La pagina `/privacy` non evidenzia più nulla in giallo e non mostra più il banner «Bozza in revisione» né il numero di versione `draft-…`. I dati ancora da fornire compaiono come frase normale («ragione sociale (da indicare)»). Finché l'informativa resta una bozza il sito non è indicizzato dai motori di ricerca (`src/config/seo.ts`) e il log di avvio lo segnala.
- La casella nel modulo è una **presa visione** dell'informativa («Ho letto l'informativa privacy»), non un consenso generico a essere ricontattati: la base giuridica indicata nel testo per valutare e ricontattare è la richiesta dell'interessato (misure precontrattuali, art. 6.1.b), non il consenso. Resta obbligatoria per documentare che l'informativa è stata mostrata; viene salvata con data e versione (colonna `privacy_consent_at`, nome storico, nessuna migrazione). **Da far verificare a chi segue la privacy dell'azienda**: questa non è una verifica legale né una dichiarazione di conformità.
- Nessun nuovo dato personale viene raccolto. L'email di notifica al titolare non contiene dati di contatto del cliente (solo codice richiesta, moto, anno).

## Dati e decisioni che deve fornire il titolare
Non li ho inventati: restano da completare in `src/config/business.ts` e nel testo di `src/app/privacy/page.tsx`.
- Ragione sociale, indirizzo della sede, partita IVA, email per la privacy e, se presente, PEC.
- Fornitore dell'archivio foto realmente usato in produzione (finora indicato solo come «da indicare»; Netlify e Neon sono già nominati).
- Periodi di conservazione (le bozze sono «12 mesi» per le richieste senza acquisto e «di norma 10 anni» per l'acquisto: da confermare).
- Eventuali trasferimenti fuori dall'UE dei fornitori e relative garanzie.
- Quando il testo è approvato: portare `PRIVACY_POLICY_VERSION` da `draft-…` a `1.0`.
