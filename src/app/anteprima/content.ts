/** Testi dell'anteprima. Nessun dato di mercato, recensione, prezzo o promessa: solo ciò che il sito già dichiara. */
export const AREA = "Milano e provincia";

export const STEPS = [
  { title: "Ci dici che moto hai", body: "Marca, modello, anno e chilometri. Le foto sono facoltative." },
  { title: "Guardiamo la richiesta", body: "Se la moto ci interessa, ti ricontattiamo con un'offerta." },
  { title: "Se c'è accordo, ci vediamo", body: "Appuntamento a Milano o in provincia per vedere la moto. Dopo l'acquisto, la gestione successiva è a nostro carico." },
];

export const NEEDED = [
  ["Marca e modello", "dalla lista o a mano"],
  ["Anno e chilometri", "anche approssimativi"],
  ["Condizioni", "come la descriveresti"],
  ["I tuoi contatti", "come preferisci essere ricontattato"],
  ["Foto", "facoltative"],
];

export const FAQ = [
  { q: "Quanto costa la valutazione?", a: "Niente. Ci mandi i dati e ti diciamo se la moto ci interessa. Non ti impegni a vendere." },
  { q: "Ricevo subito un importo?", a: "Dipende dai dati disponibili per la tua moto. Se bastano, alla fine del modulo vedi una prima valutazione; altrimenti ti ricontattiamo noi dopo aver controllato i dati. Preferiamo non darti un numero che poi cambia." },
  { q: "La valutazione è definitiva?", a: "No. È preliminare: non è un acquisto concluso né un impegno. Il prezzo finale dipende dalla verifica delle condizioni e dei dati della moto." },
  { q: "Quali moto acquistate?", a: "Valutiamo moto di ogni marca e modello. Se la tua non compare nell'elenco del modulo, puoi indicarla a mano." },
  { q: "Chi si occupa della rivendita?", a: "Noi. Acquistiamo la moto direttamente da te: dopo la vendita non devi occuparti di nulla." },
  { q: "Devo usare WhatsApp?", a: "No. Per inviare la richiesta ti basta il modulo del sito. Ci indichi tu come preferisci essere ricontattato." },
  { q: "Dove operate?", a: `Per ora solo a ${AREA}.` },
];
