/** Testo dello stato della notifica email per il back office (nessun dato personale). */
export type NotificationView = {
  notificationStatus: "pending" | "sending" | "sent" | "failed" | "skipped";
  notificationAttempts: number;
  notificationSentAt: Date | null;
  notificationError: string | null;
};

export type NotificationDescription = { tone: "ok" | "wait" | "bad" | "muted"; label: string; detail?: string };

export function describeNotification(
  n: NotificationView,
  formatDateTime: (d: Date) => string,
  maxAttempts: number,
  configured: boolean,
): NotificationDescription {
  switch (n.notificationStatus) {
    case "sent":
      return {
        tone: "ok",
        label: n.notificationSentAt ? `Inviata il ${formatDateTime(n.notificationSentAt)}` : "Inviata",
      };
    case "sending":
      return {
        tone: "wait",
        label: "Invio in corso",
        detail:
          n.notificationAttempts >= maxAttempts
            ? "Se resta così per più di qualche minuto l'invio si è interrotto: i tentativi automatici sono esauriti, puoi riprovare a mano."
            : "Se resta così per più di qualche minuto il sistema riprova da solo.",
      };
    case "failed":
      return {
        tone: "bad",
        label: "Non inviata",
        detail:
          n.notificationAttempts >= maxAttempts
            ? `Tentativi automatici esauriti (${n.notificationAttempts} in tutto). Ultimo errore: ${n.notificationError ?? "sconosciuto"}. Non verrà ritentata in automatico: puoi riprovare a mano.`
            : `Tentativo ${n.notificationAttempts}/${maxAttempts} fallito (${n.notificationError ?? "errore sconosciuto"}): il sistema riprova da solo.`,
      };
    case "skipped":
      return { tone: "muted", label: "Non prevista", detail: "Richiesta ricevuta prima dell'attivazione delle notifiche." };
    default:
      return configured
        ? { tone: "wait", label: "In attesa di invio", detail: "Parte appena possibile; il sistema riprova da solo." }
        : { tone: "wait", label: "In attesa", detail: "Le notifiche email non sono configurate (RESEND_API_KEY, NOTIFY_EMAIL_TO)." };
  }
}

/** Messaggio mostrato all'admin dopo il clic su «Riprova invio ora» (esplicito su cosa succede se fallisce). */
export function manualRetryMessage(
  res: { outcome: "sent" | "failed" | "not_claimed" | "disabled"; error: string | null; attempts: number | null; notFound?: boolean },
  maxAttempts: number,
): { ok: true } | { error: string } {
  if (res.notFound) return { error: "Richiesta non trovata." };
  switch (res.outcome) {
    case "sent":
      return { ok: true };
    case "failed":
      return {
        error:
          res.attempts !== null && res.attempts >= maxAttempts
            ? `Invio non riuscito (${res.error ?? "errore"}). È stato un tentativo manuale: non verrà ritentato in automatico, puoi riprovare a mano quando vuoi.`
            : `Invio non riuscito (${res.error ?? "errore"}). Il sistema riprova da solo; puoi anche riprovare a mano.`,
      };
    case "disabled":
      return { error: "Le notifiche email non sono configurate (RESEND_API_KEY, NOTIFY_EMAIL_TO)." };
    default:
      return { error: "La notifica risulta già inviata o è in corso (oppure un altro invio è appena partito): ricarica la pagina." };
  }
}
