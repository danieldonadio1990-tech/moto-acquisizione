# Contenuti da confermare dal titolare

Il sito pubblica **solo** informazioni confermate. La sezione «Prima di accettare» della home (`TRANSPARENCY` in
`src/config/home-content.ts`) mostra una voce solo se `answer` contiene un testo: con `answer: null` la voce non compare.

## Confermato e già pubblicato
- Area: Milano e provincia.
- Ricontatto entro 24-48 ore dalla ricezione della richiesta.
- Consegna/ritiro: «Se raggiungiamo un accordo, definiamo insieme dove e come effettuare la consegna della moto.»
- La richiesta è gestita direttamente da Compriamo Moto e non viene inoltrata a intermediari.

## Da confermare (NON pubblicato)
| Voce in `TRANSPARENCY` | Che cosa serve |
|---|---|
| Come formuliamo la proposta | descrizione a parole del criterio, senza cifre |
| Pagamento | modalità e momento del pagamento |
| Passaggio di proprietà | chi lo gestisce e chi ne sostiene i costi |

Altri punti non pubblicati: costi di ritiro, gratuità della valutazione (la parola «gratis» è stata tolta dal sito),
telefono e WhatsApp (oggi mancano, `CONTACTS` in `src/config/business.ts`).

## Come pubblicare una voce
Sostituire `answer: null` con il testo confermato in `src/config/home-content.ts`. Nessun'altra modifica.
