# Valutazione e offerta preliminare — progettazione e stato

> **Stato: motore implementato, offerte reali DISABILITATE.** Finché non esistono parametri economici approvati e dati di
> mercato con provenienza, il sito non mostra nessun importo ai clienti: il cliente vede sempre «verifica manuale».
> Nessuna quotazione è precaricata e nessuna fonte esterna di mercato è integrata.

## 1. Flusso
1. Il cliente completa il modulo esistente (marca, modello, anno, chilometri, condizioni, contatti, foto facoltative).
2. `POST /api/leads` valida e salva la richiesta (come prima), invia la notifica (come prima) e **poi** chiama
   `evaluateLeadOnCreate`: il calcolo avviene sul server, da dati letti dal database. Il browser non invia prezzi, costi o margini
   (il corpo viene validato con uno schema che ignora i campi sconosciuti; un test lo verifica).
3. Il risultato è salvato come **revisione 1** in `valuations` (idempotente: un retry restituisce la stessa valutazione).
4. Al cliente arriva solo un `PublicValuation`: `offer` (importo), `range` (fascia) o `manual` (verifica manuale).
   Costi, margine, formula e affidabilità non lasciano mai il server.
5. Se il motore non può calcolare, **non lancia eccezioni**: la richiesta è salvata e il cliente vede la conferma standard.

## 2. Architettura (`src/modules/valuation/`)
| File | Ruolo |
|---|---|
| `money.ts` | denaro in **centesimi interi**, percentuali in **punti base**; arrotondamenti prudenti (costi per eccesso, valore e offerta per difetto) |
| `types.ts` | tipi; `MarketDataProvider` è l'interfaccia delle fonti di mercato |
| `params.ts` | schema (zod) dei parametri economici + **bozza ipotetica** (mai usata da sola dal motore) |
| `engine.ts` | funzione **pura e deterministica**: normalizzazione → riconoscimento → stima del valore → costi → margine → offerta massima → affidabilità → decisione |
| `service.ts` | persistenza (revisioni), parametri approvati, fornitore dei dati di mercato dal database, flusso amministrativo |
| `fields.ts`, `labels.ts`, `public.ts` | modulo dei parametri nel back office, etichette in italiano, tipo visibile al cliente |

Formula: `offerta massima = valore di rivendita prudente − costi totali − margine obiettivo`, poi arrotondata per difetto al passo
configurato e limitata dal tetto. Il valore di rivendita parte dalla **mediana, dal 25° percentile o dal minore dei due** (a scelta,
predefinito il più prudente) e può essere ridotto da uno sconto prudenziale e dalle condizioni dichiarate. I costi sono fissi
(trasporto, controlli, preparazione, pratiche, garanzia, altri) e proporzionali (vendita, imprevisti, imposte). Il margine è il
maggiore tra un importo e una percentuale. Esempio **SIMULATO** usato solo nei test: 5.000 − (150 + 350 + 200) − 800 = **3.500 €**.

### Decisione
| Esito | Quando | Cosa vede il cliente |
|---|---|---|
| `preliminary_offer` | affidabilità ≥ soglia offerta, tutti i controlli superati | importo preliminare |
| `indicative_range` | affidabilità tra soglia fascia e soglia offerta | fascia da (massimo − x%) al massimo |
| `manual_review` | **nessun parametro approvato**, nessun dato di mercato, dati simulati, dati scaduti (> età massima), modello non riconosciuto («Altro»), input incoerenti, incidente / non funzionante / problemi meccanici (se la regola è attiva), margine insufficiente, offerta sotto il minimo, affidabilità insufficiente | «verifica manuale», nessun importo |

L'**affidabilità** (0–100%) parte da 100% e si riduce per: pochi casi nella rilevazione, prezzi molto dispersi (25°–75° percentile),
prezzi *richiesti* invece che di vendita, riferimento di marca invece che di modello, risposte «non so». Ogni motivo è registrato con un
codice leggibile nel back office.

## 3. Interruttori e configurazione
| Variabile | Significato |
|---|---|
| `VALUATION_PUBLIC_OFFERS` | `true` = gli importi calcolati sono mostrati ai clienti. **Predefinito spento.** Il calcolo interno esiste comunque (visibile solo al back office) |
| `VALUATION_ALLOW_SELF_APPROVAL` | `true` consente a chi ha preparato i parametri di approvarli lui stesso (solo se c'è un unico amministratore). Predefinito: serve un **secondo** amministratore |

I parametri economici **non sono variabili d'ambiente né costanti nel codice**: stanno nel database (`valuation_settings`), sono
**versionati**, e una versione approvata è immutabile (per cambiarla se ne crea una nuova). Si gestiscono da *Back office → Valutazione*.
Un solo set è «approvato» alla volta (vincolo del database); chi lo crea e chi lo approva sono registrati con data e ora.

## 4. Fonti dei dati di mercato — stato reale
**Nessuna fonte esterna è integrata e nessuna è stata verificata.** Il motore legge solo la tabella `market_references`, che oggi è
**vuota** e si compila dal back office indicando per ogni riga: marca, famiglia (o tutta la marca), intervallo di anni, mediana,
percentili facoltativi, numero di casi, **tipo** (prezzi di vendita, vendite interne, prezzi richiesti, stima manuale), **fonte** (testo
obbligatorio) e **data** della rilevazione.

| Possibile origine | Copertura/limiti da verificare prima di usarla | Nota |
|---|---|---|
| Vendite effettive dell'azienda (dopo le prime acquisizioni) | piccole all'inizio; migliorano nel tempo | la più affidabile e senza vincoli di licenza: da raccogliere fin dal primo giorno |
| Listini professionali del settore (a pagamento) | marche/modelli coperti, frequenza di aggiornamento, licenza d'uso dei dati | richiedono un contratto: **non valutati qui** |
| Annunci pubblici | sono prezzi *richiesti*, non di vendita; il prelievo automatico può violare i termini dei siti | **nessuno scraping**; se inseriti a mano vanno marcati «prezzi richiesti» (il motore ne riduce l'affidabilità) |
| Stima manuale di un esperto interno | soggettiva | tipo «stima manuale», con fonte e data |

Normalizzazione: una rilevazione vale per un marchio, una famiglia di modello e un intervallo di anni; a parità vince la più recente e
il modello esatto prevale sulla marca intera (che riduce l'affidabilità). Il **chilometraggio non è ancora una variabile della
rilevazione**: oggi influisce solo come controllo di coerenza. Se servono fasce di chilometri, vanno aggiunte con dati reali.

## 5. Configurazione iniziale proposta (IPOTETICA — da approvare)
La bozza che il back office propone la prima volta (`HYPOTHETICAL_DRAFT_PARAMS`) **non è un dato di mercato né un costo reale**. Ripete
l'esempio illustrativo e serve a vedere la formula funzionare:

| Voce | Valore ipotetico |
|---|---|
| Trasporto + controlli | 150 € (75 + 75) |
| Preparazione | 350 € |
| Altri costi e rischio | 200 € |
| Margine lordo obiettivo | 800 € |
| Costi/imposte proporzionali, sconto prudenziale, riduzioni per condizione | 0 % |
| Offerta minima / massima / arrotondamento | 200 € / 5.000 € / 50 € |
| Soglia offerta / fascia | 70 % / 45 % |
| Casi minimi / età massima dei dati | 10 / 90 giorni |
| Verifica manuale se incidente, non funzionante, problemi meccanici | sì |

**Prima di usarli per offerte reali, il proprietario deve sostituirli con i propri costi e il proprio margine e approvare la versione.**

## 6. Back office
Nel dettaglio di ogni richiesta, riquadro **Valutazione e offerta**: stato, revisione, versione della formula, affidabilità, motivi,
valore di rivendita, costi voce per voce, margine, offerta massima, fascia, dati di mercato con fonte e data, prezzo manuale con
motivo, cronologia delle revisioni (chi, quando). Azioni (solo amministratori): ricalcolare, impostare un'offerta manuale (motivo
obbligatorio, mai oltre il tetto; oltre il massimo calcolato solo con conferma esplicita), **confermare** l'offerta, chiudere come
rifiutata/scaduta.

*Confermare* crea l'offerta nel flusso già esistente (tabella `offers`, stato richiesta «Offerta fatta») **senza inviare nulla al
cliente**: la comunicazione resta un atto separato e consapevole.

Stati della valutazione (distinti dagli stati della richiesta e da quelli della notifica): Da valutare · Dati insufficienti ·
Valutazione preliminare generata · Verifica manuale richiesta · Offerta da confermare · Offerta confermata · Rifiutata · Scaduta.
Le richieste esistenti non hanno una valutazione finché un amministratore non preme «Ricalcola»: nessun dato esistente viene modificato.

## 7. Migrazione `0005_valuation_engine.sql` (PROPOSTA — NON applicata)
Additiva: crea soltanto `valuation_settings`, `market_references`, `valuations` (vuote). Non modifica tabelle o dati esistenti e il
codice precedente non le usa. Parte all'avvio come le altre (`MIGRATE_ON_START`) o con `npm run db:migrate` (`DATABASE_URL_DIRECT`).
**Da applicare solo dopo approvazione, in un ambiente di prova prima.** Rollback manuale, in quest'ordine:
`DROP TABLE valuations; DROP TABLE market_references; DROP TABLE valuation_settings;` e rimozione della riga della migrazione da
`drizzle.__drizzle_migrations`. Attenzione: il codice nuovo scrive in `valuations` a ogni richiesta; senza la tabella la valutazione
fallisce in modo innocuo (il cliente vede la conferma standard, l'errore va nel log) ma conviene applicare la migrazione **prima** del deploy.

## 8. Sicurezza e privacy
- Calcolo solo server; schema di validazione senza campi di prezzo; nessun import del motore nei componenti pubblici (test).
- Azioni e pagine solo per amministratori (`requireAdmin()` come prima istruzione, test sul codice); nessun ruolo nuovo.
- Tetto massimo e minimo applicati anche all'offerta manuale; importi in euro interi; doppia conferma esplicita.
- Conferma, ricalcolo e creazione di revisioni **serializzati** sulla riga della richiesta: nessuna offerta doppia.
- Le revisioni contengono dati della moto, non dati personali del cliente; sono cancellate insieme alla richiesta (`privacy:erase`).
- Audit: revisioni immutabili con autore e data; parametri versionati con autore e approvatore.

## 9. Da far rivedere a una persona (non è una conferma di conformità)
- **Formulazione dell'offerta** mostrata al cliente: oggi dice che è *preliminare*, non un acquisto concluso né un impegno. Va verificata
  sotto il profilo commerciale e legale (valore vincolante, validità nel tempo, obblighi informativi, regime fiscale della compravendita).
- **Informativa privacy**: descrive già i dati raccolti; verificare se la valutazione automatica (calcolo su dati della moto, non sulla
  persona) richieda indicazioni ulteriori. Nessuna decisione è presa solo in modo automatico con effetti sul cliente: l'importo è preliminare
  e confermato da una persona.
- Tono e promesse del testo: nessun tempo di pagamento, garanzia o recensione è stato inserito.

## 10. Test
`tests/valuation-engine.test.ts` (formula, arrotondamenti, limiti, input incoerenti, dati mancanti/scaduti, affidabilità; **fixture
simulate**), `tests/valuation-service.test.ts` (creazione richiesta, idempotenza, concorrenza, parametri, flusso amministrativo, privacy),
`tests/valuation-admin.test.ts` (accessi, assenza di dati interni sulle superfici pubbliche, conversioni del modulo).
