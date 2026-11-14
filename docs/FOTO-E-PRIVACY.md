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

## Conservazione e cancellazione automatica delle foto (15 giorni)

**Comportamento previsto dal codice** (`src/modules/photos/limits.ts`, `src/modules/photos/retention.ts`):
- Ogni foto ha la propria data di caricamento (`lead_photos.created_at`): la conservazione si calcola foto per foto, non per richiesta — due foto della stessa richiesta caricate in momenti diversi scadono in momenti diversi.
- `PHOTO_RETENTION_DAYS = 15`. Dopo 15 giorni dal caricamento la foto viene **occultata immediatamente**: non compare più nella scheda della richiesta (`getLeadDetail`) né è più scaricabile dalla rotta admin (`getPhotoForAdmin`). Questo occultamento è solo logico, avviene sempre e non richiede nessuna configurazione esterna.
- La **cancellazione fisica** (file nello storage S3/Supabase + riga nel database) è un passo separato, successivo e non automatico di per sé: la esegue `purgeExpiredPhotos()`, chiamata solo dalla rotta interna `POST /api/internal/photos/cleanup`, a sua volta chiamata solo dal workflow GitHub `.github/workflows/photo-cleanup.yml`. Finché quel workflow non chiama la rotta, le foto scadute restano nascoste ma i file restano presenti sullo storage.

**Configurazione necessaria perché la cancellazione fisica avvenga davvero** (nessuna di queste è nel repository):
- Variabile di repository GitHub `PHOTO_CLEANUP_ENABLED=true` — **obbligatoria sia per l'esecuzione pianificata (cron giornaliero) sia per il lancio manuale** (`workflow_dispatch`): la condizione del job (`.github/workflows/photo-cleanup.yml`) richiede questa variabile in entrambi i casi, senza eccezioni; se è assente, vuota o diversa da `true`, nessuna esecuzione, pianificata o manuale, chiama la rotta.
- Variabile di repository GitHub `PHOTO_CLEANUP_URL=https://<sito>` (solo origine, deve coincidere con una riga di `scripts/photo-cleanup/allowed-origins.txt`).
- Secret di repository GitHub `PHOTO_CLEANUP_TOKEN`, **identico** al valore della variabile `PHOTO_CLEANUP_TOKEN` su Netlify (contesto Production, «Contains secret values»). Se il token non è configurato (o è troppo corto) su Netlify, la rotta risponde sempre `404` indipendentemente da cosa sia impostato su GitHub.

**Stato attuale**: queste tre condizioni vanno verificate di volta in volta (possono cambiare indipendentemente da questo documento) prima di assumere che la cancellazione fisica sia davvero operativa. La sola presenza del workflow nel repository, o di alcune delle variabili/secret, **non implica che la pulizia sia attiva**: lo è solo se tutte e tre le condizioni sopra sono soddisfatte contemporaneamente. Finché `PHOTO_CLEANUP_ENABLED` non è `true`, la cancellazione fisica non può avvenire in nessun modo, nemmeno per errore o lancio manuale accidentale.

**Irreversibilità**: il backup notturno del database (`.github/workflows/backup.yml`) **non include i file delle foto** (restano solo nel bucket storage, nessuna copia altrove). Una foto cancellata fisicamente — file più riga — **non è recuperabile**. Per questo la condizione di attivazione del workflow è un requisito di sicurezza dei dati dei clienti, non solo un interruttore operativo: un'attivazione involontaria produce una perdita permanente.

## Informativa privacy: cosa è cambiato
- La pagina `/privacy` non evidenzia più nulla in giallo, non mostra il banner «Bozza in revisione» né il numero di versione `draft-…` e ora riporta i dati confermati del titolare (vedi sotto). Finché l'informativa resta una bozza il sito non è indicizzato dai motori di ricerca (`src/config/seo.ts`) e il log di avvio lo segnala.
- La casella nel modulo è una **presa visione** dell'informativa («Ho letto l'informativa privacy»), non un consenso generico a essere ricontattati: la base giuridica indicata nel testo per valutare e ricontattare è la richiesta dell'interessato (misure precontrattuali, art. 6.1.b), non il consenso. Resta obbligatoria per documentare che l'informativa è stata mostrata; viene salvata con data e versione (colonna `privacy_consent_at`, nome storico, nessuna migrazione). **Da far verificare a chi segue la privacy dell'azienda**: questa non è una verifica legale né una dichiarazione di conformità.
- Nessun nuovo dato personale viene raccolto. L'email di notifica al titolare non contiene dati di contatto del cliente (solo codice richiesta, moto, anno).

## Informativa: dati del titolare e punti ancora da verificare
Dati forniti e confermati dal titolare (in `src/config/business.ts`): Donadio Luca, impresa individuale (nessuna ragione sociale o denominazione commerciale diversa), sede legale
Via F.lli Bronzetti 8, 20129 Milano (MI), partita IVA 13723400969, PEC lucadonadio4@pec.it, email per la privacy compriamo.moto.support@gmail.com; attività: commercio al dettaglio
online di motocicli e ciclomotori per corrispondenza; sito gestito direttamente.

L'informativa **resta una bozza** (`PRIVACY_POLICY_VERSION = "draft-4"`: il sito resta non indicizzabile dai motori di ricerca finché è una bozza) perché mancano questi punti, che
il testo pubblico non dichiara:
1. **Conservazione**: per le **fotografie** il codice applica ora un termine fisso di 15 giorni dal caricamento (occultamento automatico sempre attivo; cancellazione fisica solo se il workflow di pulizia è configurato e abilitato — vedi sezione «Conservazione e cancellazione automatica delle foto» sopra). Per il resto dei dati della richiesta (contatti, dati della moto, trattativa) **nessun periodo è stato deliberato dal titolare**: la cancellazione resta solo manuale, con `npm run privacy:erase`. Il testo pubblico va aggiornato per distinguere le due situazioni, non trattandole come un'unica assenza di termine.
2. **Trasferimenti fuori dallo Spazio economico europeo e garanzie** per Netlify, Neon, Supabase, Resend e Gmail: non verificati.
3. **Dove sono davvero richieste e foto**: il titolare indica Supabase per richieste e foto; il codice e il database di produzione (host `…eu-central-1.aws.neon.tech`) indicano che le **richieste** stanno su Neon e solo le **foto** sul bucket S3 (Supabase). Confermare.
4. **Località dei dati** di Supabase, Netlify, Resend e Gmail (non dedotte dal nome del fornitore).
5. **Accordi con i fornitori** (nomina a responsabili del trattamento / contratti): non dichiarati nel testo.
6. **Basi giuridiche** (art. 6.1.b, c, f) e legittimo interesse per statistiche/sicurezza: testo ereditato dalla bozza, da far confermare da un consulente.
7. **Offerte automatiche**: il testo dice che nessuna offerta è comunicata in modo automatico. Va riscritto prima di attivare `VALUATION_PUBLIC_OFFERS` (e la PR sull'offerta automatica).
8. Se in produzione `NOTIFY_EMAIL_TO` o altri servizi (es. backup su Supabase) coinvolgono altri fornitori, l'elenco va aggiornato.
9. Contatto di assistenza generale (`CONTACTS.email`, telefono, WhatsApp): non forniti, quindi non mostrati nel sito.
Quando tutto è verificato: portare la versione a `1.0` (attiva anche l'indicizzazione).
