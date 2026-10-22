# Registro delle fotografie (fonte e licenza)

Da compilare per **ogni** fotografia pubblicata. Una foto senza riga completa in questa tabella non va pubblicata.

| Chiave | File | Soggetto | Autore | Fonte (link alla pagina di origine) | Licenza | Credito mostrato nel sito | Verificata il / da |
|---|---|---|---|---|---|---|---|
| `hero` | — | — | — | — | — | — | — |
| `honda_sh` | — | — | — | — | — | — | — |
| `piaggio_liberty` | — | — | — | — | — | — | — |
| `kymco_agility` | — | — | — | — | — | — | — |

**Stato attuale: nessuna fotografia in uso.** Vedi `docs/IMMAGINI-DA-FORNIRE.md`.

## Candidate in verifica (NESSUNA ancora utilizzabile)
Fonti indicate dal committente. **La licenza non è stata verificata sulla pagina originale**: dall'ambiente di sviluppo
`commons.wikimedia.org` e `upload.wikimedia.org` non sono raggiungibili (rete limitata), quindi non è stato possibile
aprire le pagine né scaricare i file. Nessuna di queste immagini è nel sito.

| Chiave | Pagina candidata | Stato | Note emerse da una ricerca (da riverificare sulla pagina) |
|---|---|---|---|
| `honda_sh` | commons.wikimedia.org/wiki/File:Honda_SH_125_in_Fisciano.jpg | licenza e autore **non verificati** | il file risulta in *Category:Honda SH* (circa 1409 x 1347 px); la ricerca non mostra licenza né autore. Fisciano è in Campania: va bene per il modello, non è un contesto milanese |
| `piaggio_liberty` | commons.wikimedia.org/wiki/File:Piaggio_Liberty_02.jpg | **pagina non trovata** dalla ricerca | il nome potrebbe essere diverso o il file non esistere: va verificato il link |
| `kymco_agility` | commons.wikimedia.org/wiki/File:KYMCO_Agility_scooter.jpg | **sospetta** | una ricerca riporta CC BY-SA 2.0 (autore Daniel Ullrich, origine Flickr) ma anche che la pagina potrebbe descrivere un chiosco («Büdchen») e non uno scooter Kymco: **controllare che l'immagine mostri davvero una Kymco Agility** |
| `hero` | commons.wikimedia.org/wiki/File:Milan_Vespa_Scooters.jpg | **pagina non trovata** dalla ricerca | il nome potrebbe essere diverso o il file non esistere; inoltre è uno scatto di Vespa (non un Honda/Piaggio Liberty/Kymco) |

### Regole di accettazione (da applicare alla pagina originale di ogni file)
1. Licenza leggibile nella sezione «Licenza»: **CC0 / pubblico dominio / CC BY** (preferite) oppure **CC BY-SA** solo dopo
   decisione esplicita (la foto ridimensionata/ritagliata è un'opera derivata e andrebbe indicata come tale sotto la stessa
   licenza). **Mai** NC (non commerciale) o ND (non derivate).
2. Uso commerciale consentito, autore e link alla licenza registrati qui; modifiche (ritaglio, ridimensionamento,
   compressione) dichiarate nel credito.
3. L'immagine mostra davvero il modello indicato; qualità, luce e taglio coerenti con le altre tre.
4. Nessuna persona riconoscibile né targa leggibile senza liberatoria.


## Immagini generate (nessuna ancora nel sito)

| Chiave | Strumento | Data | Stato |
|---|---|---|---|
| `hero` | Canva «generate-image» (connettore), formato 4:3, prompt: scooter urbano generico grigio scuro, strada italiana con case ocra e acciottolato, luce naturale, nessun logo/testo/targa/persona | 2026-10-22 | **non integrata**: dall'ambiente è disponibile solo un'anteprima di 199 x 149 px, inutilizzabile per una hero da 1600 x 1200. Originale su Canva (media `MAHYutABNEE`): https://www.canva.com/M/MAHYutABNEE |

Regole per le immagini generate: sono **immagini illustrative**, non fotografie documentarie né ritratti di un modello reale
o di una via di Milano; non si attribuiscono licenze CC di terzi; didascalia sul sito «Immagine illustrativa»; da verificare
a cura del committente i termini d'uso commerciale di Canva prima della pubblicazione; controllare che non compaiano loghi,
testi o dettagli riconducibili a un marchio. Le tre card dei modelli restano **tipografiche** finché non si hanno foto
corrette (la fedeltà al modello Honda SH / Piaggio Liberty / Kymco Agility non è garantibile con un generatore).
