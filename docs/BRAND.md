# Brand Compriamo Moto — identità visiva (versione approvata)

## Logo

Il simbolo è il concept fornito dal cliente: la **C** è la ruota posteriore, la **M** il corpo della moto, la **O** la ruota anteriore. I
tracciati sono stati ricavati dal concept (vettorializzati e puliti); il giallo compare solo sulla C e su un piccolo dettaglio.

| File (`public/brand/v2/`) | Uso |
|---|---|
| `lockup.svg` | versione principale (simbolo + «COMPRIAMO MOTO») su fondo chiaro; copia in `public/brand/compriamo-moto-logo.svg` |
| `lockup-dark.svg` | su fondo scuro |
| `lockup-mono.svg` | una sola tinta (timbri, stampe) |
| `symbol.svg`, `symbol-dark.svg` | solo simbolo |
| `avatar.svg`, `avatar-1024.png` | avatar tondo per Instagram, TikTok, Facebook (il ritaglio tondo non taglia il simbolo) |
| `app-icon.svg`, `app-icon-1024.png` | icona app / schermata Home |
| `favicon.svg` | favicon (copia in `src/app/icon.svg`) |
| `wordmark-alt.svg` | «compriamo moto.» minuscolo, per testi e firme |

Gli SVG sono interamente tracciati (nessun testo, nessun font da caricare). Nel sito il simbolo è il componente `src/components/brand/BrandSymbol.tsx`
(forme in `src/components/brand/symbol-paths.ts`, identiche ai file) e il logo con scritta è `src/components/BrandMark.tsx`.

Regole d'uso: spazio libero attorno pari all'altezza della ruota anteriore; dimensione minima 24 px di altezza per il simbolo, 120 px di
larghezza per il logo con scritta; non ruotare, non deformare, non ricolorare oltre le versioni fornite; il giallo non va usato per grandi superfici né
per il testo corrente.

## Colori (`src/app/globals.css`, unico punto)

| Token | Valore | Uso |
|---|---|---|
| `asphalt` / `ink` | `#15181B` grafite | testo, marchio, sezioni scure |
| `paper` | `#FBFBF8` bianco sporco | schede, intestazione |
| `chalk` | `#E9EBE7` pietra | sfondo |
| `plate` / `sky` | `#F1BF1A` giallo segnale | pulsante principale (testo grafite), C del marchio, dettagli su fondo scuro |
| `plate-deep` | `#DCAA0D` | giallo in hover (admin) |
| `gold` | `#7A5C00` | testo e link su fondo chiaro |
| `brass` | `#A37C00` | solo testo grande (nome del marchio) |
| `concrete`, `line`, `field` | `#565C60`, `#C3C8C1`, `#6B7176` | testo secondario, bordi, bordo dei campi (≥ 3:1) |

I nomi dei token sono quelli storici; i contrasti WCAG delle coppie usate sono verificati da `tests/frontend.test.ts`.

## Caratteri (self-hosted, licenza OFL in `src/fonts/OFL-brand-v2.txt`)

- **Big Shoulders Display** (800, 900): titoli e cifre in evidenza (classe `.display`, maiuscolo).
- **Instrument Sans** (400–700): testo del sito, moduli.
- **IBM Plex Mono** (400): etichette e dati (classe `.label`).

## Icone e anteprima social

`src/app/icon.svg`, `src/app/apple-icon.png`, `public/icons/icon-{192,512,maskable-512}.png` e `src/app/opengraph-image.png` (1200×630, con testo
alternativo in `opengraph-image.alt.txt`) sono file statici generati dal simbolo. Se il marchio cambia vanno rigenerati dai file in `public/brand/v2`.
L'anteprima social non è più generata a runtime: nessun font o libreria in più sul server.

## Cosa non è cambiato

Funnel di valutazione, campi, API, logica applicativa, database, notifiche, eventi di analisi first-party. Le email di notifica restano testuali.

## Da fornire / decidere

- Fotografie reali con diritti d'uso (vedi `docs/IMMAGINI-DA-FORNIRE.md`): finché mancano la homepage non mostra segnaposto.
- Dati dell'attività (ragione sociale, partita IVA, indirizzo) e profili social, da inserire in `src/config/business.ts`.
- Verifica legale del nome e del marchio «Compriamo Moto» e del dominio.
