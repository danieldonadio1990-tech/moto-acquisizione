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

## Messa online

1. Database PostgreSQL in UE (es. Supabase o Neon, regione Francoforte) → `DATABASE_URL`.
2. Storage foto: su hosting serverless (es. Vercel) il disco non è persistente. Prima del lancio
   va collegato uno storage privato (Supabase Storage / S3 / R2) implementando
   `PhotoStorage` in `src/modules/photos/storage.ts`. Su un server/VPS tradizionale il disco locale va bene.
3. Variabili: `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `NEXT_PUBLIC_WHATSAPP_NUMBER`.
4. Compilare `LEGAL` in `src/config/brand.ts` e far verificare l'informativa in `/privacy`.

## Da fare prima del lancio

- [ ] Nome brand definitivo (dopo naming e verifica disponibilità) → `src/config/brand.ts`, `BrandMark`
- [ ] Numero WhatsApp aziendale
- [ ] Dati legali e revisione informativa privacy
- [ ] Storage foto in cloud (se hosting serverless)
- [ ] Cambiare la password admin di sviluppo
