# Anteprime

Schermate generate dalla **build di produzione locale** (database e storage temporanei, nessun dato reale, sito non
pubblicato). Telefono simulato: Pixel 7 (412 px); desktop 1280 x 800.

Il sito **non usa fotografie né illustrazioni**: dove andranno le foto c'è una composizione di colori e tipografia.
Foto da procurare: [docs/IMMAGINI-DA-FORNIRE.md](../IMMAGINI-DA-FORNIRE.md).

| File | Cosa mostra |
|---|---|
| `01-home-desktop.png`, `01a-home-desktop-hero.png` | Home intera e solo hero su computer |
| `02-home-mobile.png`, `02a-home-mobile-hero.png` | Home intera e solo hero su telefono |
| `09a-sezione-modelli-desktop.png`, `09b-sezione-modelli-mobile.png` | Sezione «Quale mezzo vuoi vendere?» (composizione tipografica, senza foto) |
| `03-modulo-marche.png`, `03a-modulo-desktop.png`, `03b-modulo-modello.png` | Modulo: 10 marche + «Altro», desktop, scelta del modello |
| `04-percorso-altro.png`, `04b-km.png`, `04c-condizioni.png`, `04d-contatti-errori.png`, `04e-contatti.png` | «Altro», chilometri, condizioni, contatti con errori e compilati |
| `05-foto.png`, `05b-foto-caricate.png` | Passaggio foto (facoltative, «Invia senza foto») |
| `06-conferma.png` | Richiesta ricevuta con codice |
| `07a`–`07f-contatti-configurati-*.png` | Pulsanti **WhatsApp** e **Chiama** quando i numeri sono configurati (header, finale, footer, barra mobile, 320 px). **Numeri di prova solo per questa schermata: non sono nel codice** |
| `08a`–`08c-contatti-non-configurati-*.png` | Gli stessi punti con i numeri **non configurati** (stato reale): nessun pulsante di contatto |

## Anteprima navigabile in locale (senza pubblicare nulla)
```bash
npm install
cp .env.example .env.local      # imposta almeno SESSION_SECRET (openssl rand -base64 48)
npm run dev                     # apri http://localhost:3000
```
In sviluppo usa un database integrato in `data/` e le foto su disco: nessun servizio esterno, nessun dato reale.
