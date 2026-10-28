# Pubblicare il sito su Netlify (solo piani gratuiti)

Guida in italiano semplice. **Nessun passaggio richiede pagamenti, carte di credito o l'acquisto di un dominio.**
Il sito avrà un indirizzo gratuito tipo `nome-sito.netlify.app`.

> **Stato di questa guida.** Il codice è stato compilato e provato in locale in modalità produzione (vedi
> [«Cosa è stato provato»](#cosa-è-stato-provato)). **Non è mai stato pubblicato su Netlify**: finché non lo fai e non
> completi il [test dopo la pubblicazione](#test-dopo-la-pubblicazione) non si può dire che funzioni online.

## Prima di cominciare (in quest'ordine)

| # | Cosa | Dove | Costo |
|---|---|---|---|
| 1 | Account Netlify (già creato) | netlify.com, «Sign up with GitHub» | gratis, **non inserire carte** |
| 2 | Progetto Neon (database) | neon.com, regione **AWS Europe (Frankfurt)** | gratis |
| 3 | Progetto Supabase (foto) | supabase.com, regione **Central EU (Frankfurt)** | gratis |
| 4 | **Unire la PR #1 a `main`** | GitHub → Pull requests → #1 | gratis; **decisione tua** |

Il punto 4 serve perché Netlify pubblica la branch `main`, e `netlify.toml` (la configurazione per Netlify) è soltanto
nella PR #1. Prima di unirla controlla che tutti i controlli GitHub («Checks») siano verdi.

## Passo 1 — Supabase (cartella delle foto)

1. **Storage → New bucket**: nome `photos`, **«Public bucket» spento** (privato). Crea anche `backups`, privato (serve solo ai backup).
2. **Storage → S3 Connection**: copia l'**endpoint** (`https://<codice>.storage.supabase.co/storage/v1/s3`) e la **regione**.
3. Sempre lì, **New access key**: ti dà *Access key ID* e *Secret* (il secret si vede una volta sola).

## Passo 2 — Neon (database)

1. Apri il progetto, premi **Connect**.
2. Copia la stringa **con «Pooled connection» attivo** (contiene `-pooler`) → sarà `DATABASE_URL`.
3. Copia la stringa **con «Pooled connection» spento** → sarà `DATABASE_URL_DIRECT`.
4. Le tabelle dell'app si creano da sole al primo avvio del sito (migrazioni automatiche, solo aggiunte: non
   cancellano dati). Le tre migrazioni attuali in `drizzle/` non contengono istruzioni di cancellazione.

## Passo 3 — Netlify (collegare il sito)

1. **Add new site → Import an existing project → GitHub** → scegli `danieldonadio1990-tech/moto-acquisizione`.
2. **Branch to deploy: `main`.**
3. **Build command e Publish directory: lasciali come sono.** Vengono letti da `netlify.toml`
   (`npm run build:production`) e Netlify gestisce Next.js da solo (nessun plugin, nessuna cartella da indicare).
4. **Non premere ancora «Deploy»**: prima le variabili (passo 4). Se per errore parte, il build si ferma da solo con un
   messaggio chiaro perché mancano le variabili obbligatorie; non succede nulla di dannoso.
5. **Site configuration → Build & deploy → Branches and deploy contexts**: **Deploy Previews = None** e **Branch deploys = None**.

## Passo 4 — Variabili d'ambiente (Netlify → Site configuration → Environment variables)

Per ognuna: nome esatto e valore incollato **solo lì**. **Mai in chat, mai nel repository.**

**Due concetti diversi (non confonderli):**

| Concetto | Cosa decide | Cosa fare |
|---|---|---|
| **Contesto di deploy** (Production, Deploy Previews, Branch deploys, Local development) | **per quale tipo di pubblicazione** vale il valore | Il valore va impostato **solo per Production**. Gli altri contesti restano **vuoti**. |
| **Scope di disponibilità** (Builds, Functions, Runtime, Post processing) | **dove** la variabile è leggibile (durante il build, nelle funzioni del sito…) | **Lasciali tutti attivi (predefinito)**. Sul piano Free gli scope non si possono limitare, e comunque servono: il build legge le variabili per controllarle (`Builds`) e il sito le legge mentre funziona (`Functions`). **Non togliere nessuno scope.** |

Come si fa su Netlify Free, per ogni variabile (**Add a variable**):
1. Scrivi il nome esatto (colonna «Variabile» della tabella sotto).
2. Scegli di impostare un valore **diverso per ogni contesto di deploy** (la dicitura esatta può cambiare: l'idea è
   non usare «lo stesso valore per tutti i contesti»).
3. Compila **soltanto il campo del contesto Production** e lascia vuoti Deploy Previews, Branch deploys e
   Local development.
4. Per i valori sensibili (`SESSION_SECRET`, `DATABASE_URL`, `DATABASE_URL_DIRECT`, `S3_ACCESS_KEY_ID`,
   `S3_SECRET_ACCESS_KEY`, `ADMIN_PASSWORD`, `RESEND_API_KEY`, `NOTIFY_RETRY_TOKEN`) attiva, se compare, **«Contains secret values»**. Attenzione: una volta
   attivata non si può togliere e il valore non si rilegge più dal pannello (si può solo sostituire). Perciò tienine
   una copia in un luogo sicuro tuo.
5. Le modifiche valgono solo dalla **pubblicazione successiva**: dopo aver cambiato o rimosso una variabile (per esempio
   `ADMIN_PASSWORD`) serve un nuovo deploy.

Perché solo Production: il codice rifiuta di partire (`NETLIFY=true` con `CONTEXT` diverso da `production`) in un
deploy non di produzione, per non toccare per sbaglio il database e le foto reali. Per questo, con Deploy Previews e
Branch deploys già disattivati (passo 3.5), le variabili vuote negli altri contesti sono la configurazione voluta.

| Variabile | Cosa metterci | Dove la trovi |
|---|---|---|
| `SESSION_SECRET` | testo casuale lungo almeno 32 caratteri | Git Bash: `openssl rand -base64 48` |
| `DATABASE_URL` | stringa Neon **pooled** | Neon → Connect (passo 2) |
| `DATABASE_URL_DIRECT` | stringa Neon **diretta** (senza `-pooler`) | Neon → Connect (passo 2). Obbligatoria finché le migrazioni partono all'avvio |
| `STORAGE_DRIVER` | `s3` | valore fisso |
| `S3_BUCKET` | `photos` | valore fisso |
| `S3_ENDPOINT` | endpoint S3 | Supabase → Storage → S3 Connection |
| `S3_REGION` | `eu-central-1` (o quella mostrata) | Supabase → Storage → S3 Connection |
| `S3_FORCE_PATH_STYLE` | `true` | valore fisso |
| `S3_ACCESS_KEY_ID` | Access key ID | Supabase (passo 1.3) |
| `S3_SECRET_ACCESS_KEY` | Secret | Supabase (passo 1.3) |
| `CLIENT_IP_SOURCE` | `header` | valore fisso (obbligatoria in produzione) |
| `CLIENT_IP_HEADER` | `x-nf-client-connection-ip` | valore fisso (header di Netlify) |
| `ADMIN_EMAIL` | la tua email da amministratore | scegli tu |
| `ADMIN_PASSWORD` | password di almeno 12 caratteri | scegli tu; **rimuovila dopo il primo avvio** |
| `RESEND_API_KEY` | chiave API di Resend (**segreta**) | Resend → API Keys. Facoltativa: senza, nessuna notifica email (vedi [NOTIFICHE.md](NOTIFICHE.md)) |
| `NOTIFY_EMAIL_TO` | es. `notifiche@example.invalid` (indirizzo reale solo qui, su Netlify) | destinatario delle notifiche (fino a 3, separati da virgola) |
| `VALUATION_PUBLIC_OFFERS` | vuoto (spento) | (facoltativa) `true` mostra ai clienti gli importi calcolati dal motore di valutazione: **lasciare spento** finché parametri, dati di mercato e testi non sono approvati. Vedi [VALUTAZIONE.md](VALUTAZIONE.md) |
| `VALUATION_ALLOW_SELF_APPROVAL` | vuoto | (facoltativa) `true` solo con un unico amministratore: consente di approvare da soli i parametri economici |
| `NOTIFY_DAILY_LIMIT` | `50` | (facoltativa) massimo di email di notifica al giorno, per non esaurire la quota gratuita di Resend (100/giorno); `0` = nessun limite. Oltre il limite le richieste restano salvate. Vedi [NOTIFICHE.md](NOTIFICHE.md) |
| `NOTIFY_RETRY_TOKEN` | token casuale di 64 caratteri (**segreto**) | `openssl rand -hex 32`. Facoltativo: attiva il recupero automatico delle notifiche (workflow GitHub, vedi [NOTIFICHE.md](NOTIFICHE.md)); lo stesso valore va nel secret GitHub omonimo |
| `NOTIFY_EMAIL_REPLY_TO` | facoltativa, un indirizzo (es. quello ufficiale `compriamo.moto.support@gmail.com`) | se manca le notifiche non hanno Reply-To |
| `NOTIFY_EMAIL_FROM` | facoltativa, es. `Compriamo Moto <notifiche@tuodominio.it>` | se manca si usa il mittente di prova di Resend: l'account Resend va registrato con l'email del destinatario |

Il build **si ferma con un errore chiaro** (senza stampare valori segreti) se manca una variabile S3 (`S3_ENDPOINT`, `S3_REGION`,
`S3_BUCKET`, `S3_FORCE_PATH_STYLE`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`), se `S3_ENDPOINT` non è `https://`, o se `DATABASE_URL`
è la stringa Neon *pooled* (`-pooler`) senza `DATABASE_URL_DIRECT` (a meno di `MIGRATE_ON_START=false`).

Facoltative: `SITE_INDEXING` (lasciala vuota: i motori di ricerca restano esclusi finché l'informativa privacy è in
bozza), `MIGRATE_ON_START` (lascia vuota = migrazioni automatiche), `DB_POOL_MAX` (lascia vuota = 3).
**Non servono** nelle variabili del sito: tutte quelle `BACKUP_*` (riguardano GitHub, non Netlify), `UPLOADS_DIR`,
`STORAGE_LOCAL_PERSISTENT`, `PGLITE_DIR`.

## Passo 5 — Pubblicare

1. Netlify → **Deploys → Trigger deploy → Deploy site** (con le variabili già inserite).
2. Aspetta la fine del build. Se fallisce, leggi il log: il messaggio dice quale variabile manca o è sbagliata.
3. Quando è «Published», apri l'indirizzo `….netlify.app`.
4. **Subito dopo il primo avvio riuscito**: rimuovi `ADMIN_PASSWORD` dalle variabili e ripubblica (Trigger deploy).

## Test dopo la pubblicazione

Fai questi controlli nell'ordine, dal telefono e dal computer. Se uno fallisce, **fermati** e annota cosa vedi.

| # | Controllo | Esito atteso |
|---|---|---|
| 1 | Apri la home | pagina caricata, titolo «Vuoi vendere la tua moto?» |
| 2 | Apri `/valuta` e `/privacy` | si aprono, nessun errore |
| 3 | Apri `/robots.txt` | indicizzazione spenta finché la privacy è in bozza |
| 4 | Apri `/admin` senza accedere | ti manda al login (nessun dato visibile) |
| 5 | Login con una password sbagliata | rifiutato, nessun dettaglio sull'errore |
| 6 | Login corretto | entri nel backoffice; ricaricando la pagina resti dentro (sessione) |
| 7 | Esci dall'admin | ti riporta al login; il tasto «indietro» non mostra dati |
| 8 | Compila il funnel con email `smoke-test@example.invalid` | richiesta creata, compare nel backoffice |
| 9 | Carica 1 foto (JPEG sotto i 3 MB) | foto visibile dal backoffice |
| 10 | Prova un file non valido o troppo grande | messaggio d'errore chiaro, nessun blocco |
| 11 | Netlify → **Logs** (Functions) | riga `ip=header`; nessun «IP del client non trovato» |
| 12 | Invia più di 8 richieste in un'ora dallo stesso telefono | a un certo punto «troppe richieste» |
| 13 | Dal tuo computer: `E2E_BASE_URL=https://… E2E_ADMIN_EMAIL=… E2E_ADMIN_PASSWORD=… npm run test:e2e` | 2 test superati |
| 14 | Cancella i dati di prova | `npm run privacy:erase -- --email smoke-test@example.invalid --yes` |
| 15 | Controlla in Supabase che le foto stiano in `photos` e il bucket sia **privato** | nessun accesso pubblico via URL |

## Limiti dei piani gratuiti e rischi

I numeri vengono da siti di terze parti perché le pagine ufficiali non erano raggiungibili durante la verifica
(ottobre 2026): **controllali sulle pagine ufficiali prima di fidarti**.

| Servizio | Limite gratuito (indicativo) | Cosa succede se lo superi |
|---|---|---|
| Netlify Free | 300 crediti/mese, limite rigido | il sito va in pausa fino al mese dopo, senza addebiti |
| Neon Free | 0,5 GB di dati, 100 ore di calcolo/mese per progetto | il database si sospende; si ferma, non si paga |
| Supabase Free | 1 GB di file | non puoi aggiungere foto |

Rischi concreti da conoscere:

1. **Supabase mette in pausa il progetto dopo ~1 settimana senza attività.** Con la pausa le foto non si caricano e non
   si vedono finché non fai «Restore» dalla dashboard (è già successo). Il backup notturno, una volta attivato, scrive
   ogni notte su Supabase: probabilmente tiene il progetto attivo, ma **non è verificato**.
2. **Neon va in sospensione dopo pochi minuti di inattività**: il primo accesso dopo una pausa è più lento (qualche secondo).
3. **Le foto non sono coperte da nessun backup** (solo il database lo è).
4. **Privacy:** l'informativa è in **bozza** e i dati aziendali sono da completare (`src/config/business.ts`:
   ragione sociale, P.IVA, indirizzo, email privacy, contatti). Il sito raccoglie dati personali: **non promuoverlo
   né condividerlo pubblicamente finché non sono completati e verificati da un professionista.**
5. **Foto più grandi di 3 MB** sono rifiutate di proposito (limite delle funzioni Netlify).
6. Nessun dominio personalizzato: restare su `….netlify.app`. Un dominio proprio costa e richiede una tua autorizzazione.

## Cosa è stato provato

| Verifica | Esito | Tipo |
|---|---|---|
| `npm run typecheck`, `npm run lint`, `npm test` (39 test) | tutto superato | reale, locale |
| `npm run build:production` con le variabili impostate come su Netlify | compilato (15 pagine, rotte dinamiche incluse) | reale, locale |
| Avvio in modalità produzione su **PostgreSQL 16** locale vuoto: migrazioni automatiche, creazione del primo admin | ok | reale, DB di prova locale |
| Test completo `npm run test:e2e` (funnel, foto, login admin, offerta, acquisto, 404, robots, sitemap, privacy) | 2 su 2 | reale, DB di prova locale, **foto su disco** |
| Intestazioni di sicurezza, accesso negato a `/admin` e all'export senza login, errori su JSON non valido | ok | reale, locale |
| Migrazioni su **PostgreSQL 18** | ok in CI (GitHub) | reale, DB di prova |
| `npm audit` (dipendenze di produzione) | 0 vulnerabilità | reale |
| Nessun segreto nel repository | controllato | reale |
| Database **Neon** e storage **Supabase** | **non toccati** | non provato |
| Build e avvio **su Netlify** (adapter Next.js, header `x-nf-client-connection-ip`, limite foto) | **non provati** | non provato |
| Scrittura/lettura foto su Supabase dal sito | **non provata** (il controllo `npm run check:storage` esiste) | non provato |
