# Fotografie da procurare

**Stato:** il sito non usa nessuna fotografia, illustrazione o immagine sintetica. Dove andrebbero le foto c'è una
composizione pulita di colori e tipografia. Le fotografie reali con licenza verificata **non erano scaricabili** durante
il lavoro (gli archivi di immagini non sono raggiungibili dall'ambiente di sviluppo) e non ne sono state inventate.

## Quali foto servono (5)
| Chiave in `src/config/images.ts` | Dove compare | Soggetto | Formato |
|---|---|---|---|
| `hero` | sotto il titolo della home | Fotografia editoriale di una moto in contesto urbano, luce naturale, taglio da brand automotive (non concessionaria) | 1600 x 1000 px (16:10) |
| `moto_1`, `moto_2` | sezione «L'acquirente siamo noi» | Due fotografie di motociclette, intere o di tre quarti, luce coerente | 1200 x 900 px (4:3) |
| `consegna` | sezione «Prima di accettare» | Consegna di una moto tra due persone (volti non riconoscibili o con liberatoria) | 1200 x 900 px (4:3) |
| `dettaglio` | sezione dei vantaggi (da tablet in su) | Dettaglio meccanico: motore, cerchio o manubrio | 1200 x 1200 px (1:1) |

Finché `src` è `null` lo slot non compare e la pagina non ha vuoti. Le tre icone del processo sono SVG nel codice
(`src/components/ProcessIcons.tsx`): non servono file.

## Requisiti
- Fotografie **reali**: niente immagini generate con AI, illustrazioni, mockup, rendering o foto stock palesemente
  artificiali. Niente moto da pista, supersportive o motociclisti in tuta da gara.
- **Provenienza e licenza verificabili**, anche per uso commerciale. Va bene: scatti propri (o di un fotografo con
  liberatoria scritta), foto con licenza libera verificata nella pagina di origine (es. CC0, CC BY, CC BY-SA con il credito
  mostrato), foto acquistate/concesse da un fotografo. Non servono acquisti da parte mia: la scelta è tua.
- Il modello deve essere quello indicato (controllare la targhetta/design); nessun logo di produttori ritoccato.
- Consenso alla pubblicazione per eventuali persone riprese; nessuna targa leggibile.
- JPG o WebP, sotto i 250 KB (il sito ridimensiona comunque le immagini con `next/image`).

## Dove trovare foto con licenza verificabile (senza spese)
- **Scatti propri**: la soluzione migliore per lo stile coerente (un pomeriggio a Milano con uno scooter per ogni modello).
- **Wikimedia Commons** (commons.wikimedia.org): ci sono le categorie *Honda SH*, *Piaggio Liberty* e *Kymco Agility*.
  Ogni file ha la sua pagina con **autore e licenza**: usa solo file CC0 / CC BY / CC BY-SA, controlla la sezione
  «Licenza» della pagina e **non** i file con la dicitura «non commerciale» o «non derivate». CC BY e CC BY-SA richiedono di
  mostrare il credito (il sito lo fa nel footer). Non ho potuto aprire queste pagine né verificare nessun file specifico.

## Come inserirle (nessuna modifica al codice oltre alla configurazione)
1. Copia il file in `public/photos/` (es. `public/photos/hero-scooter-milano.jpg`).
2. In `src/config/images.ts` imposta `src`, le dimensioni reali e `credit` (autore, licenza, link alla pagina).
3. Aggiungi la riga a `docs/CREDITI-FOTO.md`. I crediti compaiono da soli nel footer.

## Hero sostitutiva generata (opzionale, finché non c'è una foto vera)
L'originale generato con Canva (media `MAHYutABNEE`) **non è scaricabile dall'ambiente di sviluppo** (canva.com non raggiungibile; il connettore restituisce solo un'anteprima di 199 x 149 px, che non viene usata). Per usarlo serve un file ad alta risoluzione (almeno 1600 x 1200 px, JPG/WebP sotto i 250 KB) in `public/photos/`, poi in `src/config/images.ts`: `hero.src`, dimensioni reali, `generated: true`, alt generico (non cita luoghi reali), nessun `credit`. Il sito mostra «Immagine illustrativa» sotto la hero e una nota nel footer; un test controlla queste condizioni. Le card dei modelli restano tipografiche e non possono usare immagini generate.
