# Spazi pubblicitari esterni (predisposti, spenti)

**Stato:** nessun banner, tracker o script pubblicitario è presente. `ADS.enabled` in `src/config/ads.ts` è `false`: gli spazi non producono markup né richieste.

## Architettura

- `src/config/ads.ts`: interruttore generale `ADS.enabled`, elenco degli spazi (`slots`, oggi solo `home-dopo-faq`) e, per ognuno, i tipi ammessi.
  Le campagne dei partner stanno in `PARTNER_CREATIVES` (vuoto).
- `src/components/AdSlot.tsx`: restituisce `null` se gli spazi sono spenti, lo spazio non esiste o non ha una campagna.
- Posizione: solo in pagine informative (oggi dopo le FAQ in homepage). Il test `tests/ads.test.ts` impedisce l'uso in `/valuta`, conferma, back office, email e API.

## Come aggiungere la campagna di un partner (senza piattaforme)

1. Accordo reale con il partner e immagine/testo approvati da te.
2. In `src/config/ads.ts` imposta `enabled: true` e compila `PARTNER_CREATIVES["home-dopo-faq"]` (link, titolo, testo, immagine con dimensioni).
3. Il contenuto è statico: etichetta «Sponsorizzato», link `rel="sponsored noopener noreferrer"`, nessuno script di terzi, quindi nessun consenso da chiedere.
4. Il click si può misurare con un evento first-party (nuovo nome in `src/modules/analytics/events.ts`, da fare come modifica separata).

## Se in futuro servirà una piattaforma pubblicitaria (es. rete di annunci)

Da fare in un cambiamento separato, con la tua approvazione: aggiungere `"platform"` ai tipi ammessi di uno spazio, caricare lo script solo dopo il consenso,
introdurre un banner delle preferenze, aggiornare l'informativa privacy e la politica di sicurezza dei contenuti (CSP) in `next.config.ts`, e non
usare mai la piattaforma in `/valuta`. Per le campagne a pagamento sui social: parametri `utm_*` già catturati dal sito; `utm_content` e gli
identificativi di click (`fbclid`, `ttclid`) non sono ancora salvati e richiederebbero di toccare l'attribuzione: non fatto in questa fase.
