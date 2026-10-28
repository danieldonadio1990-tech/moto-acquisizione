/**
 * Messaggi per chi carica le foto quando l'invio non riesce: dicono cosa è successo e cosa fare, senza gergo.
 * Puro (nessun accesso a browser o rete): provato dai test. Il codice HTTP resta visibile per l'assistenza.
 */
export type UploadFailure = {
  /** testo da mostrare */
  message: string;
  /** vero: ha senso premere di nuovo «Invia le foto» così com'è */
  retryable: boolean;
  /** vero: inutile continuare con gli altri gruppi di foto */
  fatal: boolean;
};

export function describeUploadFailure(status: number, serverMessage: string | undefined, network: boolean): UploadFailure {
  if (network || status === 0) {
    return {
      message:
        "Non riusciamo a collegarci: controlla la connessione e premi di nuovo «Invia le foto». I dati della richiesta sono già salvati e le foto già inviate non si ripetono.",
      retryable: true,
      fatal: false,
    };
  }
  if (status === 408) {
    return { message: "L'invio è stato troppo lento. Riprova con una connessione migliore: premi di nuovo «Invia le foto».", retryable: true, fatal: false };
  }
  if (status === 413) {
    return { message: "Le foto di questo invio sono troppo pesanti. Rimuovine qualcuna o scegline di più leggere e riprova.", retryable: false, fatal: false };
  }
  if (status === 403) {
    return {
      message: `${serverMessage ?? "Link per le foto non valido o scaduto"}. I dati della tua richiesta sono già arrivati: puoi mandarci le foto in un secondo momento.`,
      retryable: false,
      fatal: true,
    };
  }
  if (status === 429) {
    return { message: serverMessage ?? "Troppi tentativi ravvicinati: riprova tra qualche minuto.", retryable: false, fatal: true };
  }
  if (status >= 500) {
    return {
      message: `Il servizio delle foto non risponde (codice ${status}). I dati della richiesta sono già salvati: riprova tra poco con «Invia le foto».`,
      retryable: true,
      fatal: false,
    };
  }
  return {
    message: `Le foto non sono state accettate (codice ${status}${serverMessage ? `: ${serverMessage}` : ""}). Riprova; se il problema continua, mandacele su WhatsApp o scrivici.`,
    retryable: false,
    fatal: false,
  };
}
