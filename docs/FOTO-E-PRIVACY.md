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
1. **Conservazione**: nessun periodo è stato deliberato dal titolare (il codice non cancella nulla da solo: la cancellazione è manuale con `npm run privacy:erase`). Il testo usa solo criteri.
2. **Trasferimenti fuori dallo Spazio economico europeo e garanzie** per Netlify, Neon, Supabase, Resend e Gmail: non verificati.
3. **Dove sono davvero richieste e foto**: il titolare indica Supabase per richieste e foto; il codice e il database di produzione (host `…eu-central-1.aws.neon.tech`) indicano che le **richieste** stanno su Neon e solo le **foto** sul bucket S3 (Supabase). Confermare.
4. **Località dei dati** di Supabase, Netlify, Resend e Gmail (non dedotte dal nome del fornitore).
5. **Accordi con i fornitori** (nomina a responsabili del trattamento / contratti): non dichiarati nel testo.
6. **Basi giuridiche** (art. 6.1.b, c, f) e legittimo interesse per statistiche/sicurezza: testo ereditato dalla bozza, da far confermare da un consulente.
7. **Offerte automatiche**: il testo dice che nessuna offerta è comunicata in modo automatico. Va riscritto prima di attivare `VALUATION_PUBLIC_OFFERS` (e la PR sull'offerta automatica).
8. Se in produzione `NOTIFY_EMAIL_TO` o altri servizi (es. backup su Supabase) coinvolgono altri fornitori, l'elenco va aggiornato.
9. Contatto di assistenza generale (`CONTACTS.email`, telefono, WhatsApp): non forniti, quindi non mostrati nel sito.
Quando tutto è verificato: portare la versione a `1.0` (attiva anche l'indicizzazione).
