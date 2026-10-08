# [BRAND] — Acquisizione moto da privati (Phase 1)

Funnel "Hai una moto da vendere? Noi possiamo comprartela." + backoffice minimo.
Area: Milano e provincia. North Star: **moto acquistate da privati / mese**.

## Avvio in locale

Requisiti: Node.js 20+.

```bash
npm install
cp .env.example .env.local      # poi compila SESSION_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npm run dev
```

- Sito: http://localhost:3000
- Funnel: http://localhost:3000/valuta
- Backoffice: http://localhost:3000/admin (credenziali di ADMIN_EMAIL / ADMIN_PASSWORD)

Senza `DATABASE_URL` il progetto usa un PostgreSQL embedded (PGlite) in `./data/pglite`
e salva le foto in `./data/uploads`. Nessun account esterno necessario per provarlo.
Il primo admin viene creato automaticamente al primo avvio, se non ne esiste nessuno.

Test: `npm test` (regole Buy Box, validazione richieste, telefoni). Controlli: `npm run typecheck`, `npm run lint`.

## Cosa fa (Phase 1)

1. Landing → "Valuta la tua moto"
2. Funnel progressivo: Moto → Km → Condizioni → Contatti → Foto → Conferma
3. **Il lead viene salvato quando il cliente invia i contatti**; le foto arrivano dopo con un
   token monouso (48 h). Chi abbandona allo step foto non è un contatto perso.
4. Backoffice: elenco richieste con filtri per stato, dettaglio con foto, contatti (WhatsApp/telefono/email
   in un tocco), cambio stato, offerte (accettata/rifiutata), registrazione acquisto con prezzo reale,
   note interne, storico stati con autore e data.
5. Badge **Buy Box** su ogni lead (regole nel DB, iniziali: Honda SH, Piaggio Liberty, Kymco Agility a Milano).
6. Eventi di funnel registrati da subito (vedi Analytics).

## Struttura

```
src/
  config/brand.ts          ← NOME BRAND, WhatsApp, dati legali (unico punto da cambiare)
  db/                      schema Drizzle, connessione, dati iniziali
  modules/
    catalog/               database moto statico (marche, modelli, cilindrate)
    funnel/                form progressivo (stato, step, UI)
    leads/                 validazione, stati, servizio (creazione, offerte, acquisto)
    buybox/                regole e matching (funzione pura)
    photos/                elaborazione (EXIF/GPS rimossi) e storage sostituibile
    analytics/             eventi first-party
    admin/                 sessione, login, componenti backoffice
  app/                     pagine e API (Next.js App Router)
drizzle/                   migrazioni SQL (applicate all'avvio)
```

La logica di **acquisizione** è isolata: la futura vendita/inventario dovrà vivere in tabelle proprie
collegate a `leads.id` quando lo stato è "Acquistata".

## Analytics (dati già raccolti, dashboard in Phase 4)

| Metrica | Fonte |
|---|---|
| Visite landing, click CTA, inizio funnel, step completati, foto caricate/saltate, click WhatsApp | tabella `events` |
| Lead generato | `events` (`lead_created`) + `leads` |
| Contattato / appuntamento / offerta / acquisto | `lead_status_history`, `offers`, `leads.purchase_price` |
| Canale di provenienza | `leads.utm_source/medium/campaign` (dai link delle campagne) |

Niente cookie di terze parti: non serve il banner finché non si aggiungono pixel pubblicitari.

## Sviluppo e produzione

| | Sviluppo (`npm run dev`) | Produzione (`npm run build && npm start`) |
|---|---|---|
| Database | integrato (PGlite) se `DATABASE_URL` è vuota | **`DATABASE_URL` obbligatoria** (PostgreSQL) |
| Foto | disco locale `./data/uploads` | **`STORAGE_DRIVER=s3`** (S3, R2, Supabase Storage…) oppure `local` solo con `STORAGE_LOCAL_PERSISTENT=true` + `UPLOADS_DIR` assoluto |
| Avvio con configurazione incompleta | — | **il server si rifiuta di partire** e il log spiega cosa manca |

Variabili S3: `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, opzionali `S3_ENDPOINT`, `S3_REGION`, `S3_FORCE_PATH_STYLE`, `S3_PREFIX`.
Dopo il primo avvio **rimuovere `ADMIN_PASSWORD`** dalle variabili (il log lo ricorda).

## Protezioni (Phase 1.5)

- Invio lead idempotente (`submissionId` dal browser): doppio click, retry, timeout, refresh → un solo lead. Retry automatico lato client.
- Foto: id per foto (nessun duplicato nei retry), massimo 12 garantito dal database anche con richieste parallele,
  token verificato prima di leggere il corpo, max 4 file e 25 MB per richiesta, 10 MB per foto, timeout 60 s.
- Rate limit (in memoria, per istanza): 8 lead/ora per IP, upload, eventi, login (8 tentativi per IP+email, 30 per IP ogni 15 min).
  Con più istanze serverless la protezione è parziale: per renderla condivisa implementare `RateLimitStore` su Redis/Upstash.
  L'IP viene da `x-forwarded-for`: verificare che il proprio hosting lo imposti in modo affidabile.
- Logout revoca tutte le sessioni dell'utente. Vincoli di coerenza nel database (prezzo pagato solo se "Acquistata",
  una sola offerta accettata, max 12 foto). Log degli errori senza dati personali. Header anti-iframe.

## Cancellazione dati (privacy)

```bash
npm run privacy:erase -- --email mario@example.com          # anteprima
npm run privacy:erase -- --email mario@example.com --yes    # cancella
```
Criteri: `--email`, `--phone`, `--code` (codice richiesta), `--lead`. Cancella lead, cliente, moto, foto (database e file),
offerte, storico e acquisto; anonimizza gli eventi statistici. In sviluppo fermare prima `npm run dev`.
In produzione eseguire con le stesse variabili del server.

## Test

`npm test` (32 test). Gli stessi test di integrazione girano anche su PostgreSQL e S3 reali:
`TEST_DATABASE_URL=postgres://… TEST_STORAGE=s3 S3_…=… npm test`.

## Messa online

1. Database PostgreSQL in UE (es. Supabase o Neon, regione Francoforte) → `DATABASE_URL`.
2. Bucket privato S3-compatibile per le foto → `STORAGE_DRIVER=s3` + variabili `S3_*`.
3. Variabili: `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (solo primo avvio), `NEXT_PUBLIC_WHATSAPP_NUMBER`.
4. Compilare `LEGAL` in `src/config/brand.ts` e far verificare l'informativa in `/privacy`.

## Da fare prima del lancio

- [ ] Nome brand definitivo (dopo naming e verifica disponibilità) → `src/config/brand.ts`, `BrandMark`
- [ ] Numero WhatsApp aziendale
- [ ] Dati legali e revisione informativa privacy
- [ ] Scegliere fornitori (hosting, database, storage) e indicarli in `PROVIDERS` (`src/config/brand.ts`)
- [ ] Informativa approvata → `PRIVACY_POLICY_VERSION = "1.0"`
- [ ] Cambiare la password admin di sviluppo
