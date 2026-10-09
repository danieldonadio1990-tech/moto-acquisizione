# [BRAND] — Acquisizione moto da privati

Funnel *"Hai una moto da vendere? Noi possiamo comprartela."* e backoffice per gestire le richieste
fino all'acquisto. Area: Milano e provincia.
North Star: **moto acquistate da privati / mese**. Metrica guida del soft launch: **costo per moto acquistata**.

Stack: Next.js 16 (App Router, TypeScript), PostgreSQL (Drizzle ORM), storage foto S3-compatibile, deploy su Netlify (piano Free).

| Stato | |
|---|---|
| Fase | 1.6, pronta per il deploy. Soft launch dopo i dati in [Da completare](#da-completare-prima-del-soft-launch) |
| Informativa privacy | **BOZZA**: non pubblicizzare il sito finché non è approvata |
| Indicizzazione motori di ricerca | spenta automaticamente finché l'informativa è in bozza |

---

## Indice
[Development](#development) · [Test](#test) · [Build](#build) · [Production](#production) ·
[Database](#database) · [Storage](#storage) · [Admin](#admin) · [Privacy](#privacy) ·
[Deploy su Netlify](#deploy-su-netlify) · [Backup](#backup) · [Sicurezza](#sicurezza) · [SEO](#seo) ·
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
Su Netlify il controllo parte da solo (`netlify.toml` → `build.command` = `npm run build:production`):
**se manca una variabile obbligatoria il deploy si ferma** e non va online.

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
| `CLIENT_IP_SOURCE`, `CLIENT_IP_HEADER` | sì (su Netlify: `header` + `x-nf-client-connection-ip`) | Vedi [Sicurezza](#sicurezza) |
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

Limiti foto: 12 per richiesta di valutazione, 3 MB ciascuna dopo la compressione nel browser (max 1800 px, JPEG),
inviate a gruppi di max 3 foto / 3 MB (tetto server 3,4 MB per richiesta). Le Netlify Functions accettano 6 MB di
payload e codificano i binari in Base64 (+~33%): 3,4 MB diventano ~4,5 MB, con margine. Il server verifica il contenuto reale,
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

### Dove vengono trattati i dati (assetto del soft launch)

| Dato | Servizio | Dove |
|---|---|---|
| Database (lead, clienti, moto, offerte, acquisti) | Neon Free | **UE**, Francoforte (`aws-eu-central-1`) |
| Foto | Supabase Storage Free | **UE**, Francoforte (`eu-central-1`) |
| Backup cifrato del database | Supabase Storage (bucket `backups`) + artifact GitHub Actions | UE (Supabase); GitHub: **non verificato** dove siano conservati gli artifact |
| **Esecuzione del codice del sito (funzioni)** | Netlify Free | **Stati Uniti** (region di default `cmh`, Ohio). Il cambio di region è solo per i piani a pagamento |

**Non si può dichiarare che i dati restano esclusivamente nell'UE:** ogni richiesta, compresi nome, telefono,
email e foto, passa dalle funzioni Netlify negli USA prima di arrivare a database e storage in UE.
Questo è un compromesso accettato **solo per il soft launch** con 10–20 persone scelte; **non è l'assetto definitivo**.

Prima del lancio pubblico definitivo (checklist privacy):
- [ ] verificare e allegare il DPA di Netlify e le Clausole Contrattuali Standard (SCC) / adesione al Data Privacy Framework;
- [ ] verificare DPA e sede del trattamento di Neon, Supabase e GitHub;
- [ ] indicare nell'informativa (`/privacy`, `PROVIDERS` in `business.ts`) i fornitori, i trasferimenti verso gli USA e le garanzie;
- [ ] valutare di portare l'esecuzione del codice in UE (hosting con region UE) e rivedere questa sezione;
- [ ] **backup e cancellazione:** `privacy:erase` non modifica i backup già fatti. Un dato cancellato resta nelle ultime
      14 copie su Supabase e per 30 giorni negli artifact GitHub (cifrati): allineare il testo dell'informativa
      (tempi di cancellazione) e decidere la retention definitiva.

---

## Deploy su Netlify

Architettura del soft launch, **costo €0/mese**, nessun metodo di pagamento da inserire:

| Funzione | Servizio (piano Free) | Note |
|---|---|---|
| Hosting | Netlify Free | 300 crediti/mese, **limite rigido**: finiti, il sito va in pausa fino al ciclo successivo (nessun addebito). Alert al 50/75/100% |
| Database | Neon Free, `aws-eu-central-1` | 0,5 GB, scale-to-zero (il primo accesso dopo una pausa è più lento) |
| Foto | Supabase Storage Free, `eu-central-1` | 1 GB; il progetto Free va in **pausa dopo 1 settimana senza attività** |
| Backup | GitHub Actions + `age` | vedi [Backup](#backup) |

Il codice è identico a prima: cambiano solo configurazione e servizi. `netlify.toml` imposta il comando di
build (`npm run build:production`, che esegue `check:env`), Node 22, e **fa fallire di proposito** i build di
Deploy Preview e Branch deploy (usano la configurazione di produzione).

### Account da creare (nessun pagamento)
1. **Netlify**: registrazione con GitHub, piano Free. Non inserire carta.
2. **Neon**: progetto Free in `AWS Europe (Frankfurt) — aws-eu-central-1`.
3. **Supabase**: progetto Free in `Central EU (Frankfurt) — eu-central-1`.

### Configurazione manuale
1. **Neon**: *Connect* → copia la stringa **pooled** (`…-pooler…`) e quella **diretta**. In *Settings* annota la
   versione PostgreSQL (serve per il backup). Crea un ruolo **di sola lettura** per il backup (vedi [Backup](#backup)).
2. **Supabase** → *Storage*: crea due bucket **privati** (`Public bucket` disattivato): `photos` e `backups`.
   *Storage → S3 Connection*: copia l'endpoint (`https://<PROJECT_REF>.storage.supabase.co/storage/v1/s3`) e genera
   le chiavi di accesso S3 (meglio due coppie: una per l'app, una per il backup).
3. **Netlify** → *Add new site → Import from Git* → `danieldonadio1990-tech/moto-acquisizione`. Il comando di build
   arriva da `netlify.toml`: non cambiarlo.
4. **Netlify** → *Site configuration → Build & deploy → Branches and deploy contexts*: **Deploy Previews = None**,
   **Branch deploys = None** (produzione = solo `main`).
5. **Prova dello storage foto, dal tuo computer, prima del deploy** (`npm install` una volta). Imposta le variabili
   `S3_*` nella tua shell o in `.env.local` (file ignorato da git, mai in chat) e lancia:
   ```bash
   npm run check:storage
   ```
   Scrive, legge, elenca e cancella un oggetto di prova, carica un file da 3 MB e controlla che il bucket non
   sia pubblico. Esce con errore se qualcosa non va. Poi rimuovi le chiavi da `.env.local`.
6. **Netlify** → *Site configuration → Environment variables*: crea ogni variabile con scope **Production soltanto**
   (deseleziona Deploy Previews, Branch deploys, Local development):

| Variabile | Valore | Perché |
|---|---|---|
| `SESSION_SECRET` | `openssl rand -base64 48` | firma le sessioni admin |
| `DATABASE_URL` | stringa Neon **pooled** | connessione dell'app |
| `DATABASE_URL_DIRECT` | stringa Neon **diretta** | migrazioni (advisory lock) |
| `STORAGE_DRIVER` | `s3` | foto su storage persistente |
| `S3_BUCKET` | `photos` | bucket privato foto |
| `S3_ENDPOINT` | endpoint S3 Supabase | |
| `S3_REGION` | `eu-central-1` | |
| `S3_FORCE_PATH_STYLE` | `true` | richiesto da Supabase |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | chiavi S3 | accesso al bucket |
| `CLIENT_IP_SOURCE` | `header` | rate limit su IP affidabile |
| `CLIENT_IP_HEADER` | `x-nf-client-connection-ip` | header impostato da Netlify |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | solo al primo avvio | crea il primo admin; poi **rimuovi `ADMIN_PASSWORD`** |

   I valori si incollano **solo nel pannello Netlify**, mai in chat né nel repository.
7. Deploy. Se manca una variabile il build si ferma con un messaggio chiaro.
8. Crea l'admin ed esegui lo smoke test (`npm run test:e2e` con `E2E_BASE_URL`), poi cancella i dati di prova
   (`npm run privacy:erase`, vedi [Privacy](#privacy)).
9. Dominio: solo dopo autorizzazione. Poi imposta `SITE.domain` in `src/config/business.ts`.
   **Non acquistare un dominio senza autorizzazione.**

### Guardie contro l'uso della produzione da parte di build non di produzione
1. Le variabili esistono solo nello scope Production (punto 6).
2. Deploy Preview e Branch deploys sono disattivati (punto 4) e, se riattivati, `netlify.toml` li fa fallire.
3. `src/config/env.ts` rifiuta qualsiasi avvio/build con `NETLIFY=true` e `CONTEXT` diverso da `production`.

### IP del client su Netlify
`x-nf-client-connection-ip` è l'header che Netlify indica come affidabile per le Functions. **Da verificare dopo il
primo deploy:** nei log deve comparire `ip=header` e *non* il messaggio `IP del client non trovato`; dal vostro
telefono, ripetendo l'invio oltre il limite (8/ora), il blocco deve scattare per IP. Se l'header manca, tutte le
richieste condividono un solo contatore (più restrittivo, non più permissivo).

## Backup

Backup notturno del **database PostgreSQL** con GitHub Actions (`.github/workflows/backup.yml`, ore 02:17 UTC,
avviabile a mano da *Actions → Backup database → Run workflow*).

> **Cosa è coperto e cosa no**
> - Il backup copre **solo il database PostgreSQL** (lead, clienti, moto, offerte, acquisti, storico, eventi, admin).
> - Le **foto NON sono incluse nel dump**: stanno nel bucket separato `photos` di Supabase Storage.
> - Esiste quindi un **rischio separato di perdita dello storage foto** (cancellazione, progetto Supabase perso o
>   sospeso) **non coperto da nessun backup**. Da risolvere in una fase infrastrutturale successiva.

Flusso: `pg_dump -Fc` (client ≥ versione del server) → controllo che il dump sia leggibile e contenga `leads`
→ cifratura con `age` (**chiave pubblica**) → upload nel bucket privato `backups` di Supabase (`db/…`) con verifica
della dimensione → rotazione (ultime **14** copie) → copia come artifact GitHub (cifrato, **30 giorni**).
Il file si chiama `moto-acquisizione-<UTC>.dump.age`. Nessun segreto è nel repository.

> **Stato:** gli script `backup.sh` e `restore.sh` sono stati provati solo in locale, su un PostgreSQL 16 di prova con
> ruoli non-superuser (vedi [Prova di ripristino eseguita](#prova-di-ripristino-eseguita)). `upload.sh` (caricamento,
> verifica della dimensione, rotazione) è stato provato con la CLI AWS v1 su S3 simulato e su Supabase Storage reale, ma solo
> con un prefisso di prova e con le chiavi dell'app, mai con chiavi dedicate né sul runner GitHub (CLI AWS v2).
> **Non è garantito finché non viene eseguito davvero su GitHub** (avvio manuale + prima esecuzione notturna) contro Neon
> (PostgreSQL 18), e non ne è stato ripristinato un file su Neon.

### Checklist operativa (in ordine)

I comandi sono script del repository; **non stampano mai segreti**. Quelli con la chiave privata o con le credenziali vanno
lanciati **sul tuo computer**, mai in chat né in sessioni cloud.

- [ ] **1. Chiavi `age`** (computer tuo): `scripts/backup/setup-age-key.sh` (aggiungi `--set-secret` per impostare anche
      `BACKUP_AGE_PUBLIC_KEY` con `gh`). Crea la privata in `~/.config/moto-acquisizione/backup-age-key.txt` (permessi 600,
      mai stampata), prova cifratura+decifratura, stampa **solo la pubblica** `age1…`. Copia la privata **offline**: senza di
      essa i backup non si aprono; se qualcuno la ottiene li legge. Non va mai nel repository né su GitHub.
- [ ] **2. Neon, dopo la prima migrazione** (il sito è partito o hai lanciato `npm run db:migrate`): crea il ruolo
      `backup_reader` da Neon Console → *Roles* (password forte, solo lì), poi con la stringa **diretta** (senza `-pooler`)
      del proprietario del database: `psql "<URL diretta proprietario>" -v ON_ERROR_STOP=1 -f scripts/backup/setup-backup-reader.sql`.
      Concede solo `CONNECT`, `USAGE`, `SELECT` (tabelle e sequenze di `public` **e** `drizzle`, più i privilegi di default
      per le migrazioni future). Lo script si ferma con un messaggio chiaro se il ruolo o lo schema `drizzle` mancano.
- [ ] **3. Verifica dei permessi**: `psql "$BACKUP_DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/backup/check-permissions.sql`
      (connesso come `backup_reader`). Esce con errore se manca un `SELECT` o se il ruolo può scrivere.
- [ ] **4. Supabase**: crea una coppia di chiavi S3 **dedicata ai backup** (*Storage → S3 Connection*), senza toccare né
      revocare quelle dell'app. Attenzione: le chiavi S3 di Supabase **non sono limitate a un bucket** (accesso completo a
      tutti i bucket del progetto, secondo la documentazione pubblica): chi ruba la chiave del backup può leggere e
      cancellare anche `photos`. Una coppia separata serve a poterla revocare da sola; per un vero isolamento servirebbe un
      progetto/storage diverso (non fatto). Prova: `BACKUP_S3_ENDPOINT=… BACKUP_S3_ACCESS_KEY_ID=… BACKUP_S3_SECRET_ACCESS_KEY=… scripts/backup/check-bucket.sh`
      (rifiuta di partire se la chiave coincide con quella dell'app).
- [ ] **5. Secret GitHub** (*Settings → Secrets and variables → Actions*), poi `scripts/backup/check-config.sh` per controllare i nomi:

| Secret | Valore |
|---|---|
| `BACKUP_DATABASE_URL` | stringa Neon **diretta** con il ruolo `backup_reader` |
| `BACKUP_AGE_PUBLIC_KEY` | `age1…` (la chiave **pubblica**) |
| `BACKUP_S3_ENDPOINT` | endpoint S3 di Supabase |
| `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` | chiavi S3 **dedicate ai backup**, accesso al bucket `backups` |

- [ ] **6. Primo backup**: dopo il merge, *Actions → Backup database → Run workflow* (`PG_MAJOR` = 18 deve essere ≥ alla
      versione di Neon, ora 18.6). Controlla che sia verde e che il file compaia in `backups/db/`.
- [ ] **7. Ripristino di prova** su un branch Neon vuoto (sezione [Ripristino](#ripristino)) e `verify.sql`. Solo dopo il
      backup è da considerarsi funzionante.
- [ ] **8. Cron**: finché i punti 1–5 non sono fatti, il workflow schedulato (ogni notte) fallisce e GitHub manda email di errore.
      Controlla che la prima esecuzione programmata parta (sui repository privati con account Free non è garantito: non verificato).

Costi: nessun servizio a pagamento. Per GitHub Actions su repository privato con account Free la quota di minuti
inclusi e il comportamento al suo superamento (stop dei workflow o addebito) **non sono stati verificati**:
controllare *Settings → Billing and plans* e non aggiungere metodi di pagamento. Il backup usa ~1–2 minuti a notte.

### Ripristino
Il ripristino non tocca mai la produzione finché non decidi di cambiare `DATABASE_URL`.

1. **Scarica** il backup: Supabase → *Storage → backups → db →* file più recente; oppure GitHub → *Actions →* esecuzione
   → artifact `db-backup`.
2. **Crea un branch Neon nuovo e vuoto** (*Branches → New branch* da un punto vecchio, oppure un progetto/database
   nuovo) e copia la sua stringa di connessione diretta. Il database di destinazione deve essere **vuoto**.
3. **Decifra e ripristina** (serve la tua chiave privata; servono `age` e `psql`/`pg_restore` **versione 18 o superiore**, cioè ≥ del server Neon, altrimenti `restore.sh` si ferma):
   ```bash
   AGE_IDENTITY_FILE=chiave-backup.txt scripts/backup/restore.sh moto-acquisizione-<data>.dump.age "<URL del branch di test>"
   ```
   Lo script rifiuta database non vuoti.
4. **Verifica**: `psql "<URL del branch di test>" -f scripts/backup/verify.sql` mostra i conteggi (richieste, richieste
   acquistate con prezzo pagato, clienti, moto, offerte e offerte accettate, metadati foto, storico stati, eventi,
   admin, migrazioni). Confrontali con la produzione. Verifica anche l'app: avvio con `DATABASE_URL` del branch.
5. **Switch**: nel pannello Netlify cambia `DATABASE_URL` e `DATABASE_URL_DIRECT` col branch ripristinato,
   rilancia il deploy (*Deploys → Trigger deploy*), esegui lo smoke test. Tieni il vecchio database finché non
   sei sicuro.
6. Le foto non sono nel backup: dopo un ripristino i metadati delle foto puntano agli oggetti del bucket `photos`,
   che restano dove sono (se il bucket esiste ancora).

### Prova di ripristino eseguita
Prova locale, con dati finti, su un cluster PostgreSQL 16 usa e getta (**non** Neon, **non** PostgreSQL 18):
migrazioni dell'app (`npm run db:migrate`, ripetute due volte) → ruolo `backup_reader` con i permessi di questo README →
`backup.sh` (dump + cifratura `age`) → `restore.sh` in un database vuoto con un ruolo non-superuser → `verify.sql`:
conteggi identici all'origine. Verificato anche: il ripristino su un database non vuoto e con la chiave sbagliata viene
rifiutato, `backup_reader` non può scrivere, il file `.age` non contiene testo in chiaro, nessun file temporaneo
resta dopo un errore. La prova ha rivelato che mancavano i permessi sulle sequenze dello schema `drizzle` (il backup
falliva con "permission denied for sequence"): il SQL qui sopra è stato corretto.
**Non ancora provato:** Neon e PostgreSQL 18 (compresi eventuali errori di ripristino legati a estensioni o ruoli di
Neon), upload con chiavi dedicate e con la CLI AWS v2 del runner, il runner GitHub e l'installazione di `postgresql-client-18` da PGDG.
Ripetere la prova di ripristino su un branch Neon subito dopo il primo backup.

## Rischi e limiti del setup gratuito

- **Sito in pausa** quando i 300 crediti mensili Netlify finiscono (fino al ciclo successivo, nessun addebito).
- **Funzioni Netlify negli USA**, database e storage in UE: latenza maggiore e trasferimento extra-UE (vedi [Privacy](#privacy)).
- **Pausa del progetto Supabase** dopo 1 settimana senza attività: il backup notturno scrive nel suo Storage, ma se
  conti come "attività" non è verificato. Controllare il pannello e riattivare a mano se serve.
- **Foto senza backup** (vedi sopra).
- **Backup artigianale**: dipende da GitHub Actions, da un cron che può saltare e dalla tua chiave privata.
- **Neon Free**: 6 ore di storia, 0,5 GB, scale-to-zero.
- **Rate limit per istanza** (non condiviso).
- Nessun SLA su nessuno dei servizi.

## Sicurezza

- **Fail fast:** configurazione validata all'avvio e prima del deploy (`src/config/env.ts`).
- **IP del client** per il rate limit, da fonte affidabile (`CLIENT_IP_SOURCE`):
  - **Netlify** (assetto attuale): `CLIENT_IP_SOURCE=header` + `CLIENT_IP_HEADER=x-nf-client-connection-ip`.
    È l'header che Netlify indica per l'IP del client; che non sia falsificabile va verificato dopo il primo deploy
    (vedi [IP del client su Netlify](#ip-del-client-su-netlify));
  - **Vercel**: `x-vercel-forwarded-for` (automatico);
  - **Cloudflare**: `cf-connecting-ip` (solo se il server è raggiungibile esclusivamente via Cloudflare);
  - **proxy proprio**: `CLIENT_IP_SOURCE=header` + `CLIENT_IP_HEADER` (es. `x-real-ip` impostato da nginx);
  - `x-forwarded-for` è falsificabile: rifiutato in produzione.
- **Rate limit** (`src/lib/rate-limit.ts`): richieste 8/ora per IP, foto, eventi, login.
  **Limite noto:** i contatori sono in memoria, per singola istanza. Su hosting serverless ogni istanza conta per conto suo:
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
- [ ] Account Netlify, Neon, Supabase creati (piani Free, nessun pagamento) e configurati come in [Deploy su Netlify](#deploy-su-netlify); poi `PROVIDERS` in `business.ts`
- [ ] Verifica dei Terms/DPA: DPA e SCC di Netlify prima del lancio pubblico (funzioni negli USA, vedi [Privacy](#privacy))
- [ ] Informativa completata e approvata → `PRIVACY_POLICY_VERSION = "1.0"`
- [ ] Backup notturno attivo (secret GitHub, chiave `age` conservata offline) e prova di ripristino su un branch Neon
- [ ] Rischio foto senza backup accettato o risolto (fase infrastrutturale successiva)
- [ ] Deploy su Netlify con variabili di produzione, admin creato, smoke test superato e dati di prova cancellati
- [ ] Dominio (solo dopo autorizzazione) → `SITE.domain`
