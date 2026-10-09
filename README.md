# [BRAND] — Acquisizione moto da privati

Funnel *"Hai una moto da vendere? Noi possiamo comprartela."* e backoffice per gestire le richieste
fino all'acquisto. Area: Milano e provincia.
North Star: **moto acquistate da privati / mese**. Metrica guida del soft launch: **costo per moto acquistata**.

Stack: Next.js 16 (App Router, TypeScript), PostgreSQL (Drizzle ORM), storage foto S3-compatibile, deploy su Vercel.

| Stato | |
|---|---|
| Fase | 1.6, pronta per il deploy. Soft launch dopo i dati in [Da completare](#da-completare-prima-del-soft-launch) |
| Informativa privacy | **BOZZA**: non pubblicizzare il sito finché non è approvata |
| Indicizzazione motori di ricerca | spenta automaticamente finché l'informativa è in bozza |

---

## Indice
[Development](#development) · [Test](#test) · [Build](#build) · [Production](#production) ·
[Database](#database) · [Storage](#storage) · [Admin](#admin) · [Privacy](#privacy) ·
[Deploy su Vercel](#deploy-su-vercel) · [Backup](#backup) · [Sicurezza](#sicurezza) · [SEO](#seo) ·
[Analytics](#analytics) · [Soft launch](#soft-launch) · [Dati aziendali](#dati-aziendali) · [Struttura](#struttura)

---

## Development

Requisiti: Node.js 20+.

```bash
npm install
cp .env.example .env.local
# in .env.local imposta almeno:
#   SESSION_SECRET=<openssl rand -base64 48>
#   ADMIN_EMAIL=tu@esempio.it
#   ADMIN_PASSWORD=<almeno 12 caratteri>
npm run dev
```

- Sito: http://localhost:3000 · Funnel: `/valuta` · Backoffice: `/admin`
- In sviluppo non serve nessun servizio esterno: database integrato (PGlite) in `./data/pglite`,
  foto in `./data/uploads` (cartella `data/` esclusa da git).
- Il primo admin viene creato al primo avvio da `ADMIN_EMAIL`/`ADMIN_PASSWORD` (oppure con `npm run admin:user`).
- Il database integrato può essere aperto da un solo processo: per usare gli script (`privacy:erase`,
  `admin:user`) in sviluppo fermare prima `npm run dev`.

## Test

```bash
npm test             # 36 test: regole, configurazione, database, foto, cancellazione dati, dataset
npm run typecheck
npm run lint
```

I test di integrazione usano un database e una cartella temporanei. Si possono eseguire anche su
PostgreSQL e storage S3 reali (es. un ambiente di staging, **mai** sul database di produzione):

```bash
TEST_DATABASE_URL=postgres://… TEST_STORAGE=s3 S3_BUCKET=… S3_ENDPOINT=… S3_ACCESS_KEY_ID=… \
  S3_SECRET_ACCESS_KEY=… S3_REGION=… npm test
```

**Smoke test end-to-end** (browser vero, percorso completo fino all'acquisto), contro locale o produzione:

```bash
E2E_BASE_URL=https://www.dominio.it E2E_ADMIN_EMAIL=… E2E_ADMIN_PASSWORD=… npm run test:e2e
```
Crea una richiesta di prova con email `smoke-test@example.invalid`: in produzione cancellarla subito dopo con
`npm run privacy:erase -- --email smoke-test@example.invalid --yes`.

## Build

```bash
npm run build:production   # controlla le variabili di produzione, poi next build
npm start                  # avvia la build (porta 3000)
```

`npm run check:env` da solo verifica la configurazione e segnala i dati aziendali ancora da completare.
Su Vercel il controllo parte da solo (`vercel.json` → `buildCommand`): **se manca una variabile
obbligatoria il deploy si ferma** e non va online.

## Production

Il server **non parte** (fail fast) se manca qualcosa di obbligatorio, e il log spiega cosa:

```
[config] Configurazione non valida — il server non può partire:
  • DATABASE_URL mancante. In produzione serve un database PostgreSQL persistente…
```

| Variabile | Obbligatoria | Note |
|---|---|---|
| `SESSION_SECRET` | sì | ≥ 32 caratteri casuali (`openssl rand -base64 48`) |
| `DATABASE_URL` | sì | PostgreSQL in UE. Nessun fallback sul database locale |
| `DATABASE_URL_DIRECT` | se `DATABASE_URL` è un pooler "transaction" | usata per le migrazioni |
| `STORAGE_DRIVER` | sì | `s3` (consigliato). `local` solo con disco persistente dichiarato |
| `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | con `s3` | + `S3_ENDPOINT`, `S3_REGION`, `S3_FORCE_PATH_STYLE`, `S3_PREFIX` |
| `CLIENT_IP_SOURCE` | fuori da Vercel | su Vercel automatico. Vedi [Sicurezza](#sicurezza) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | solo primo avvio | poi rimuovere `ADMIN_PASSWORD` (il log lo ricorda) |
| `SITE_INDEXING` | no | `false` spegne sempre l'indicizzazione |

Tutte le variabili, con esempi: [`.env.example`](.env.example).
Separazione ambienti:

| | Development | Production |
|---|---|---|
| Database | PGlite integrato (se `DATABASE_URL` vuota) | PostgreSQL obbligatorio |
| Foto | disco `./data/uploads` | storage S3 persistente obbligatorio |
| IP client | `x-forwarded-for` (solo test) | fonte affidabile obbligatoria |
| Configurazione incompleta | valori di default | **il server non parte** |

## Database

PostgreSQL 15+ in UE. Consigliati, entrambi con regione Francoforte:

- **Neon** (`aws-eu-central-1`): copia la *connection string* "pooled" in `DATABASE_URL` e quella diretta
  (senza `-pooler`) in `DATABASE_URL_DIRECT`.
- **Supabase** (`eu-central-1`): `DATABASE_URL` = *Transaction pooler* (porta 6543),
  `DATABASE_URL_DIRECT` = *Session pooler* o connessione diretta (porta 5432).

Lo schema sta in `src/db/schema.ts`, le migrazioni SQL in `drizzle/`. All'avvio il server le applica da solo,
con un lock PostgreSQL: se più istanze partono insieme ne applica una sola. In alternativa:

```bash
DATABASE_URL_DIRECT=postgres://… npm run db:migrate
```
e `MIGRATE_ON_START=false`. Per una nuova migrazione: modificare `schema.ts`, poi `npm run db:generate`.

Vincoli di coerenza garantiti dal database: prezzo pagato solo su moto "Acquistata", una sola offerta
accettata per richiesta, massimo 12 foto, importi positivi, un solo lead per invio (`submission_id`).

## Storage

Le foto sono dati personali: il bucket deve essere **privato** (nessun accesso pubblico). Il sito le mostra
solo agli admin autenticati, passando dal server (`/api/admin/photos/[id]`).

**Cloudflare R2, giurisdizione UE** (consigliato: 10 GB gratuiti, nessun costo di traffico in uscita)
1. R2 → *Create bucket* → *Specify jurisdiction* = **EU**, nome es. `foto-moto`.
2. *Manage API tokens* → token con permesso **Object Read & Write** limitato a quel bucket.
3. Variabili:
   ```
   STORAGE_DRIVER=s3
   S3_BUCKET=foto-moto
   S3_ENDPOINT=https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com
   S3_REGION=auto
   S3_ACCESS_KEY_ID=…  S3_SECRET_ACCESS_KEY=…
   ```

**Supabase Storage** (se il database è già su Supabase)
1. Storage → bucket **privato** `foto-moto`. Settings → Storage → *S3 access keys*.
2. Variabili:
   ```
   STORAGE_DRIVER=s3
   S3_BUCKET=foto-moto
   S3_ENDPOINT=https://<PROJECT_REF>.storage.supabase.co/storage/v1/s3
   S3_REGION=<regione del progetto, es. eu-central-1>
   S3_FORCE_PATH_STYLE=true
   S3_ACCESS_KEY_ID=…  S3_SECRET_ACCESS_KEY=…
   ```

Limiti foto: 12 per richiesta, 4 MB ciascuna dopo la compressione nel browser (max 1800 px, JPEG).
Gli invii restano sotto i 4,5 MB per richiesta accettati da Vercel. Il server verifica il contenuto reale,
ricodifica l'immagine ed elimina i metadati EXIF/GPS.

## Admin

**Primo account**, due modi:
- **Consigliato:** dal terminale, con le variabili di produzione:
  ```bash
  DATABASE_URL=postgres://… npm run admin:user -- nome@azienda.it
  ```
  La password viene chiesta senza mostrarla (min 12 caratteri). Lo stesso comando **cambia la password**
  di un admin esistente e chiude le sue sessioni aperte.
- **Al primo avvio:** `ADMIN_EMAIL` + `ADMIN_PASSWORD` nelle variabili d'ambiente. Funziona solo se non esiste
  nessun admin; poi **rimuovere `ADMIN_PASSWORD`** (il log lo ricorda a ogni avvio).

Accesso: `/admin`. Sessione di 7 giorni in un cookie protetto; "Esci" chiude tutte le sessioni dell'utente.
Dopo 8 tentativi sbagliati l'accesso da quell'IP per quell'email si blocca per 15 minuti.
Per togliere l'accesso a una persona: cancellarne la riga in `admin_users`.

## Privacy

Cancellazione completa dei dati di una persona (richiesta dell'interessato o scadenza della conservazione):

```bash
npm run privacy:erase -- --email mario@example.com           # ANTEPRIMA: mostra cosa verrebbe cancellato
npm run privacy:erase -- --email mario@example.com --yes     # cancella
```
Criteri combinabili: `--email`, `--phone`, `--code` (codice richiesta), `--lead`.
Cancella cliente, moto, richiesta, offerte, storico, dati di acquisto, foto (righe e file nello storage).
Gli eventi statistici vengono **anonimizzati**, non cancellati (restano solo i conteggi).
In produzione va eseguito con le stesse variabili del server. Annotare data e codice richiesta in un registro
delle richieste privacy (senza dati personali).

Altre garanzie:
- consenso obbligatorio, verificato dal server, salvato con data/ora e versione dell'informativa;
- log degli errori senza dati personali;
- statistiche senza cookie e senza terze parti, mai collegate alla persona;
- l'export CSV del backoffice non contiene nome, telefono né email.

L'informativa (`/privacy`) è una **bozza tecnica**, non una dichiarazione di conformità: va completata
(segnaposto evidenziati in giallo) e verificata da chi segue la privacy dell'azienda.
Una volta approvata, impostare `PRIVACY_POLICY_VERSION = "1.0"` in `src/config/business.ts`.

---

## Deploy su Vercel

1. Vercel → *Add New Project* → importa `danieldonadio1990-tech/moto-acquisizione`.
2. *Settings → Functions → Region*: già fissata a **Francoforte (`fra1`)** da `vercel.json`, vicino al database.
3. *Settings → Environment Variables* (ambiente **Production**): le variabili della tabella [Production](#production).
   I deploy di **Preview** sono anch'essi in modalità produzione: o hanno un loro database e bucket
   (mai quelli di produzione), oppure vanno disattivati.
4. Deploy. Il build si ferma con un messaggio chiaro se manca una variabile.
5. Crea l'admin (`npm run admin:user`) ed esegui lo smoke test (`npm run test:e2e` con `E2E_BASE_URL`).
6. Dominio: *Settings → Domains*. Poi imposta `SITE.domain` in `src/config/business.ts` (URL canonici,
   sitemap, anteprime social). **Non acquistare un dominio senza autorizzazione.**

## Backup

Il backup è quello del provider PostgreSQL: niente sistemi fatti in casa. I piani gratuiti **non** bastano:

| Provider | Piano | Copia | Conservazione | Ripristino |
|---|---|---|---|---|
| Neon | Free | storia continua | **6 ore** (insufficiente) | — |
| Neon | Launch (a consumo) | storia continua (point-in-time) | fino a **7 giorni** (impostare 7) | Console → *Restore* → data e ora |
| Supabase | Free | nessun backup automatico | — | — |
| Supabase | Pro | giornaliero | **7 giorni** | Dashboard → *Database → Backups* → scegliere il giorno |

**Configurazione minima per il soft launch:** Neon Launch con finestra di ripristino a 7 giorni,
oppure Supabase Pro.

**Procedura di ripristino:**
1. Mettere il sito in pausa (Vercel → *Deployments* → rimuovere il dominio, o portarlo su una pagina di
   manutenzione) per non perdere richieste durante il ripristino.
2. Ripristinare dal pannello del provider al momento precedente al problema. Con Neon conviene ripristinare
   su un nuovo *branch* e verificare i dati prima di promuoverlo.
3. Verificare con `npm run check:env` e lo smoke test, poi riattivare il sito.
4. Le foto stanno nello storage, che non è coperto dal backup del database. Le cancellazioni avvengono
   solo con `privacy:erase`. Su R2 si può abilitare in più la *Object versioning/lifecycle*.

Prova di ripristino consigliata subito dopo il primo deploy (5 minuti su un branch di test).

## Sicurezza

- **Fail fast:** configurazione validata all'avvio e prima del deploy (`src/config/env.ts`).
- **IP del client** per il rate limit, da fonte affidabile (`CLIENT_IP_SOURCE`):
  - **Vercel** (automatico): `x-vercel-forwarded-for`. Vercel imposta questo header e sovrascrive i valori
    mandati dal client, quindi non è falsificabile;
  - **Cloudflare**: `cf-connecting-ip` (solo se il server è raggiungibile esclusivamente via Cloudflare);
  - **proxy proprio**: `CLIENT_IP_SOURCE=header` + `CLIENT_IP_HEADER` (es. `x-real-ip` impostato da nginx);
  - `x-forwarded-for` è falsificabile: rifiutato in produzione.
- **Rate limit** (`src/lib/rate-limit.ts`): richieste 8/ora per IP, foto, eventi, login.
  **Limite noto:** i contatori sono in memoria, per singola istanza. Su Vercel ogni istanza conta per conto suo:
  la protezione contro lo spam leggero c'è, quella contro un attacco distribuito no.
  Per il soft launch è sufficiente. Per renderlo condiviso: implementare `RateLimitStore` (due metodi,
  `hit` e `reset`) su Redis/Upstash e registrarlo con `setRateLimitStore()`, senza toccare il resto.
- Invio richieste idempotente: doppio click, retry, timeout, refresh → un solo lead.
- Foto: token per richiesta verificato **prima** di leggere il corpo, dimensione massima, contenuto reale
  verificato, metadati rimossi, bucket privato.
- Admin: password bcrypt, cookie httpOnly/secure/sameSite, revoca sessioni al logout, controllo
  autorizzazione in ogni pagina e azione.
- Header: anti-iframe (`X-Frame-Options`, `frame-ancestors`), `nosniff`, `Referrer-Policy`,
  `no-store` sulle pagine admin.
- Errori mostrati all'utente senza dettagli tecnici; log senza dati personali.

## SEO

Solo base tecnica: title e description, Open Graph con immagine generata (`/opengraph-image`), favicon
(`src/app/icon.svg`), URL canonici, `robots.txt`, `sitemap.xml` (home e privacy).
Tutto prende nome, testi e dominio da `src/config/business.ts`.
**Indicizzazione spenta** (`robots.txt` → `Disallow: /`, meta `noindex`) finché l'informativa è in bozza,
sui deploy di anteprima e con `SITE_INDEXING=false`. Il funnel `/valuta` e l'admin non sono mai indicizzati.

## Analytics

Eventi interni (tabella `events`), senza cookie e senza terze parti:

| Evento | Quando |
|---|---|
| `landing_view` | apertura della home |
| `cta_click` | click su "Valuta la tua moto" (`label`: hero, sticky, footer) |
| `valuation_start` | apertura del funnel |
| `step_completed` | step Moto, Km, Condizioni completati (`step`) |
| `contact_submitted` | contatti inviati con successo |
| `photos_uploaded` / `photos_skipped` | foto inviate (`count`) o rimandate a WhatsApp |
| `whatsapp_click` | click su WhatsApp nella conferma |
| `lead_created` | richiesta salvata (registrato dal server) |

Ogni evento del browser porta `source`, `medium` e `campaign` (UTM della visita). La provenienza della
richiesta è salvata a parte, sulla richiesta stessa (`utm_source/medium/campaign`).
Gli eventi di navigazione non sono mai collegati alla persona.

## Soft launch

Obiettivo: **10–20 richieste reali** prima di qualsiasi campagna (niente Ads, SEO, influencer o retargeting).

1. Completare i [dati mancanti](#da-completare-prima-del-soft-launch), fare il deploy, eseguire lo smoke test
   e cancellare la richiesta di prova.
2. Distribuire il link **solo a persone scelte** (clienti, conoscenti, contatti in negozio), sempre con UTM
   per sapere da dove arrivano, ad esempio:
   - `https://www.dominio.it/?utm_source=whatsapp&utm_medium=passaparola&utm_campaign=softlaunch`
   - `https://www.dominio.it/?utm_source=negozio&utm_medium=qr&utm_campaign=softlaunch` (QR al banco)
3. Gestire ogni richiesta nel backoffice: Interessante / Non interessante → Appuntamento → Offerta →
   esito → **prezzo realmente pagato**.
4. Una volta a settimana: **Backoffice → Esporta dati (CSV)**. Una riga per richiesta con provenienza, moto,
   anno, km, comune, condizioni, qualificazione, appuntamento, offerte, prezzo pagato, esito.
   Nessun nome, telefono o email.

Indicatori in cima al backoffice: richieste, interessanti, appuntamenti, con offerta, acquistate,
conversione richiesta → acquisto, prezzo medio pagato.
Margine e costi si calcolano nel foglio di calcolo, partendo dall'export:
- **margine medio** = prezzo di rivendita − prezzo pagato. Il prezzo di vendita sta nel gestionale vendite,
  non in questo sistema;
- **costo per lead** = spesa marketing / richieste;
- **costo per moto acquistata** = spesa marketing / moto acquistate.

## Dati aziendali

Un solo file: **`src/config/business.ts`**. Contiene brand, ragione sociale, P.IVA, sede, email, telefono,
WhatsApp, dominio, fornitori e versione dell'informativa. Nessun altro file contiene questi valori.
I segnaposto `[DA COMPLETARE…]` sono evidenziati nell'informativa ed elencati nel log di avvio e in
`npm run check:env`. Il logo provvisorio è il componente `src/components/BrandMark.tsx`.

## Struttura

```
src/
  config/business.ts       DATI AZIENDALI (unico punto da modificare)
  config/env.ts            configurazione server e fail-fast
  config/seo.ts            regole di indicizzazione
  db/                      schema Drizzle, connessione, migrazioni all'avvio, dati iniziali
  modules/
    catalog/               database moto statico
    funnel/                form progressivo (client)
    leads/                 validazione, stati, servizio, dataset/export
    buybox/                regole e matching (dati nel DB)
    photos/                limiti, elaborazione, storage (locale / S3), upload
    analytics/             eventi first-party
    admin/                 sessione, login, componenti backoffice
    privacy/               cancellazione dati
  lib/                     log senza dati personali, rate limit, lettura corpo richieste
  app/                     pagine, API, SEO (robots, sitemap, icon, opengraph-image), errori
scripts/                   check-env, db-migrate, admin-user, privacy-erase
drizzle/                   migrazioni SQL
tests/                     test unitari e di integrazione (node:test)
e2e/                       smoke test end-to-end (Playwright)
```

La logica di **acquisizione** è separata: la futura gestione vendita/inventario userà tabelle proprie
collegate a `leads.id` quando lo stato è "Acquistata".

## Da completare prima del soft launch

- [ ] Dati aziendali in `src/config/business.ts`: ragione sociale, P.IVA, sede, email, PEC, telefono, WhatsApp
- [ ] Scelta fornitori (hosting, database, storage) e relativi account, poi `PROVIDERS` in `business.ts`
- [ ] Informativa completata e approvata → `PRIVACY_POLICY_VERSION = "1.0"`
- [ ] Database con backup reale (Neon Launch 7 giorni o Supabase Pro) e prova di ripristino
- [ ] Deploy su Vercel con variabili di produzione, admin creato, smoke test superato
- [ ] Dominio (solo dopo autorizzazione) → `SITE.domain`
