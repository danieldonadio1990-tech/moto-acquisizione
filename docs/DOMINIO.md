# Dominio `compriamo-moto.it` — passaggi manuali (NON ancora eseguiti)

> **Stato: il dominio è stato acquistato ma NON risulta collegato, verificato o operativo.** Nel repository non è stato modificato nessun
> DNS, nessuna impostazione di Netlify e nessun record di Resend. Finché non si completa la procedura il sito resta all'indirizzo
> `https://papaya-taffy-ba2f1a.netlify.app`. Non dichiarare il dominio operativo prima delle verifiche del punto 5.

## Dove vive l'indirizzo del sito nel codice (un solo punto)
`SITE.domain` in `src/config/business.ts`. Da lì derivano `siteUrl()` e quindi: URL canonico e `metadataBase`, Open Graph, sitemap,
robots, link nelle email di notifica e link assoluti. Finché è un segnaposto si usa l'indirizzo del deploy (`SITE_NAME` su Netlify) o
localhost, quindi **sviluppo e anteprime continuano a funzionare**. Cambiare dominio = cambiare quell'unico valore (con `https://` e senza «/»
finale), più l'elenco `scripts/notify-retry/allowed-origins.txt` se si usa il recupero automatico delle notifiche.

## 1. Collegare il dominio a Netlify (pannello Netlify → Domain management)
1. *Add a domain* → `compriamo-moto.it` (e `www.compriamo-moto.it`). Scegliere il dominio **principale** (consigliato: la versione senza `www`, o
   viceversa, ma una sola; l'altra reindirizza).
2. Due strade per il DNS, a scelta del proprietario:
   - **Netlify DNS** (cambia i nameserver presso il registrar con quelli mostrati da Netlify), oppure
   - **DNS esterno** (restano i nameserver del registrar): creare i record indicati da Netlify (di norma un record `A`/`ALIAS` per il dominio
     principale e un `CNAME` per `www` verso l'indirizzo del sito). **Copiare i valori esatti dal pannello Netlify**: non sono riportati qui perché
     dipendono dal sito e possono cambiare.
3. Attendere la propagazione DNS (da pochi minuti a 48 ore).

## 2. HTTPS
Dopo la propagazione, in *Domain management → HTTPS* attivare il certificato gestito da Netlify (Let's Encrypt). Attivare il reindirizzamento
a HTTPS. Controllare che `https://compriamo-moto.it` e `https://www.compriamo-moto.it` si aprano senza avvisi del browser.

## 3. Indirizzo canonico e reindirizzamenti
1. Modificare `SITE.domain` in `src/config/business.ts` con l'indirizzo definitivo (`https://compriamo-moto.it`) e distribuire.
2. In Netlify impostare il dominio principale e lasciare che l'altra variante (e `*.netlify.app`) reindirizzi a quello principale.
3. Con il nuovo indirizzo, i link nelle email di notifica puntano al back office sul dominio proprio.
4. L'indicizzazione resta spenta finché l'informativa privacy è «bozza» (`src/config/seo.ts`): non cambia con il dominio.
5. Se si usa il recupero automatico: aggiungere `https://compriamo-moto.it` a `scripts/notify-retry/allowed-origins.txt` **prima** di cambiare la
   variabile GitHub `NOTIFY_RETRY_URL` (con una PR rivista).

## 4. Email: mittente proprio con Resend (risolve anche gran parte dello spam)
Con `onboarding@resend.dev` le email arrivano solo al titolare dell'account e spesso finiscono nello spam. Con un dominio verificato:
1. Resend → *Domains* → *Add domain* → `compriamo-moto.it` (Resend consiglia, in genere, un sottodominio dedicato all'invio, per esempio
   `send.compriamo-moto.it`: seguire ciò che mostra il pannello).
2. Resend mostra i **record DNS da creare** (SPF come `TXT`, DKIM come `TXT`/`CNAME`, e un `MX` per il sottodominio di invio): copiarli **identici** nel DNS
   del dominio. Tempi tipici: circa 15 minuti, fino a 72 ore. Resend consiglia anche un record `_dmarc` (`TXT`): decidere la policy con
   cautela (iniziare in modalità di sola osservazione).
3. A dominio *Verified*: su Netlify impostare `NOTIFY_EMAIL_FROM` = `Compriamo Moto <notifiche@compriamo-moto.it>` (o l'indirizzo sul sottodominio
   scelto) e rifare il deploy. Il destinatario resta `NOTIFY_EMAIL_TO`.
4. Le chiavi API con permesso «Sending access» possono essere limitate a questo dominio.
5. Dopo il cambio di mittente, un tentativo ripetuto di una notifica già inviata **nelle 24 ore precedenti** con la stessa chiave di idempotenza ma
   mittente diverso riceve da Resend un errore 409 (contenuto cambiato): è documentato in `NOTIFICHE.md`; accade solo alle notifiche in
   corso nel momento esatto del cambio.

Le registrazioni DNS sono operazioni manuali del proprietario: da qui non sono state eseguite né verificate.

## 5. Verifiche finali (da fare dopo la propagazione)
- [ ] `https://compriamo-moto.it` si apre con certificato valido; `www` e `*.netlify.app` reindirizzano al dominio principale.
- [ ] Nel codice sorgente della pagina: `<link rel="canonical">` e `og:url` col dominio nuovo; `/sitemap.xml` e `/robots.txt` coerenti.
- [ ] Il back office mostra l'origine dei link delle email (`https://compriamo-moto.it`).
- [ ] Resend: dominio *Verified*; email di prova (`npm run notify:test -- --yes`) ricevuta, controllando l'intestazione `From` e la cartella spam.
- [ ] `NOTIFY_RETRY_URL` e `allowed-origins.txt` coincidono.
