# Immagini definitive da fornire

Finché non ci sono, il sito mostra **illustrazioni vettoriali segnaposto** (scooter generico e strada di città): non sono
fotografie e non rappresentano modelli reali. Per usare una foto: copia il file in `public/photos/` e scrivi il percorso in
`src/config/images.ts` (campo `src`, per esempio `"/photos/hero-scooter-milano.jpg"`). Non servono altre modifiche.

## Requisiti comuni
- Fotografie **reali** e con **diritti d'uso chiari** (scatti propri o licenza verificata, anche per uso commerciale).
- Scooter urbani comuni, ripresi in modo pulito e naturale. Niente moto da pista o supersportive, niente motociclisti
  in tuta da gara, niente ambientazioni di lusso, niente foto stock artificiali.
- Nessun logo di produttori in evidenza (nemmeno sul serbatoio/scudo se riconoscibile in primo piano).
- JPG o WebP, peso consigliato sotto i 250 KB (il sito ridimensiona comunque le immagini).

## Elenco
| Chiave in `images.ts` | Soggetto | Formato consigliato |
|---|---|---|
| `hero` | Scooter in una strada di città, luce naturale (contesto milanese credibile, senza monumenti o insegne riconoscibili di terzi) | 1600 x 1200 px, 4:3 |
| `honda_sh` | Scooter della categoria Honda SH, di lato, sfondo urbano semplice | 1200 x 900 px, 4:3 |
| `piaggio_liberty` | Scooter della categoria Piaggio Liberty, di lato | 1200 x 900 px, 4:3 |
| `kymco_agility` | Scooter della categoria Kymco Agility, di lato | 1200 x 900 px, 4:3 |

Le persone eventualmente riprese devono aver dato il consenso alla pubblicazione.
