/**
 * Testi della homepage. Nessun dato di mercato, recensione, prezzo o promessa non confermata dal titolare.
 * Confermato dal titolare: area (Milano e provincia), ricontatto entro 24-48 ore, consegna/ritiro da concordare,
 * richiesta gestita direttamente da Compriamo Moto. NON confermati (non pubblicare): modalità di pagamento, costi di ritiro,
 * dettagli del passaggio di proprietà, gratuità della valutazione.
 */
export const AREA = "Milano e provincia";

/** Tempo di ricontatto confermato dal titolare. */
export const RESPONSE_TIME = "24-48 ore";

export const HERO = {
  label: `Acquisto diretto di moto usate · ${AREA}`,
  title: "La tua moto, la acquistiamo noi.",
  subtitle: "Niente annunci, niente ricerca di acquirenti. Raccontaci della tua moto e ricevi una nostra proposta d'acquisto.",
  cta: "Vendi la tua moto",
  note: `Risposta entro ${RESPONSE_TIME} · ${AREA}`,
};

export const WHO_BUYS = {
  label: "Chi acquista",
  title: "L'acquirente siamo noi.",
  body: "Compriamo Moto acquista direttamente le motociclette dai proprietari. Non siamo un portale di annunci, un intermediario o un comparatore, e la tua richiesta viene gestita direttamente da noi: non viene inoltrata a intermediari.",
};

export const ADVANTAGES = [
  { title: "Un solo interlocutore", body: "Parli con Compriamo Moto dall'inizio alla fine." },
  { title: "Nessun annuncio da pubblicare", body: "Non devi pubblicare nulla né rispondere a sconosciuti." },
  { title: "Nessuna ricerca di acquirenti", body: "L'acquirente siamo noi." },
  { title: "Valuti la proposta prima di decidere", body: "Ricevi la nostra proposta e decidi tu se accettarla." },
  { title: "Trattativa diretta", body: "Tratti direttamente con chi acquista, senza passaggi intermedi." },
];

export const STEPS = [
  { title: "Raccontaci la tua moto", body: "Inserisci marca, modello, anno, chilometri, condizioni e, se vuoi, le fotografie." },
  { title: "Ricevi la nostra proposta", body: `Analizziamo le informazioni e ti ricontattiamo entro ${RESPONSE_TIME}.` },
  { title: "Concludiamo l'acquisto", body: "Se raggiungiamo un accordo, definiamo pagamento, documentazione e modalità di consegna o ritiro." },
];

/**
 * Trasparenza: una voce compare in pagina SOLO se `answer` è valorizzata con un'informazione confermata dal titolare.
 * `answer: null` = da confermare, non pubblicata (vedi docs/CONTENUTI-DA-CONFERMARE.md).
 */
export const TRANSPARENCY: { q: string; answer: string | null }[] = [
  { q: "Chi acquista la moto", answer: "Compriamo Moto, direttamente da te. Non c'è nessun intermediario tra te e chi acquista." },
  { q: "Come ti ricontattiamo", answer: `Dopo aver ricevuto la richiesta ti ricontattiamo ai recapiti che indichi, entro ${RESPONSE_TIME}.` },
  { q: "Consegna e ritiro", answer: "Se raggiungiamo un accordo, definiamo insieme dove e come effettuare la consegna della moto." },
  { q: "Come formuliamo la proposta", answer: null },
  { q: "Pagamento", answer: null },
  { q: "Passaggio di proprietà", answer: null },
];

export const FAQ = [
  {
    q: "Come vendere la propria moto a Milano?",
    a: `Compili la scheda in pochi passaggi con i dati della moto e, se vuoi, le foto. Noi analizziamo le informazioni e ti ricontattiamo entro ${RESPONSE_TIME} con una proposta d'acquisto. Operiamo a ${AREA}.`,
  },
  { q: "Chi acquista la moto?", a: "Compriamo Moto, direttamente da te. Non siamo un portale di annunci, un intermediario o un comparatore: la richiesta viene gestita da noi e non viene inoltrata a intermediari." },
  {
    q: "Quali moto usate acquistate?",
    a: "Valutiamo moto di ogni marca e modello. Se la tua non compare nell'elenco del modulo, puoi indicarla a mano. Non possiamo garantire una proposta per ogni moto: dipende dai dati e dalle condizioni.",
  },
  { q: "Sono obbligato a vendere?", a: "No. Inviare la richiesta e ricevere una proposta non ti impegna: decidi tu se accettarla." },
  {
    q: "Come funziona la proposta d'acquisto?",
    a: "Analizziamo i dati e le foto che ci invii. Se possiamo formulare una proposta, ti ricontattiamo e la valuti con noi. La valutazione iniziale è preliminare: la proposta dipende dalla verifica delle condizioni e dei dati della moto.",
  },
  { q: "Ricevo subito un importo?", a: "Dipende dai dati disponibili per la tua moto. Se bastano, alla fine del modulo vedi una prima valutazione; altrimenti ti ricontattiamo noi dopo aver controllato i dati. Preferiamo non darti un numero che poi cambia." },
  { q: "Dove e come si consegna la moto?", a: "Se raggiungiamo un accordo, definiamo insieme dove e come effettuare la consegna della moto." },
  { q: "Devo usare WhatsApp?", a: "No. Per inviare la richiesta ti basta il modulo del sito. Ci indichi tu come preferisci essere ricontattato." },
  { q: "Dove operate?", a: `Per ora solo a ${AREA}.` },
];
