# Anteprime del redesign

Schermate generate dalla **build di produzione locale** (database e storage temporanei, nessun dato reale, sito non
pubblicato). Telefono simulato: Pixel 7 (412 px); desktop 1280 x 800.

| File | Cosa mostra |
|---|---|
| `01-home-desktop.png` / `01a-home-desktop-hero.png` | Home intera e solo hero su computer |
| `02-home-mobile.png` / `02a-home-mobile-hero.png` | Home intera e solo hero su telefono |
| `03-modulo-marche.png`, `03a-modulo-desktop.png` | Primo passo del modulo: 10 marche + «Altro» (telefono e computer) |
| `03b-modulo-modello.png` | Honda selezionata: scelta del modello |
| `04-percorso-altro.png` | «Altro»: marca e modello scritti a mano |
| `04b-km.png`, `04c-condizioni.png` | Chilometri e condizioni |
| `04d-contatti-errori.png`, `04e-contatti.png` | Contatti con errori contestuali e compilati |
| `05-foto.png`, `05b-foto-caricate.png` | Passaggio foto (facoltative, «Invia senza foto») |
| `06-conferma.png` | Richiesta ricevuta con codice (nessun WhatsApp) |

Le immagini dei mezzi e dell'hero sono **illustrazioni segnaposto**, non fotografie: vedi
[docs/IMMAGINI-DA-FORNIRE.md](../IMMAGINI-DA-FORNIRE.md).

## Anteprima navigabile in locale (senza pubblicare nulla)
Nella cartella del progetto:

```bash
npm install
cp .env.example .env.local      # imposta almeno SESSION_SECRET (openssl rand -base64 48)
npm run dev                     # apri http://localhost:3000
```

In sviluppo usa un database integrato nella cartella `data/` e le foto su disco: nessun servizio esterno, nessun dato
reale. Le richieste inviate restano solo sul tuo computer.
