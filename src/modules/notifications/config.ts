/**
 * Configurazione delle notifiche email (Resend). Nessun valore è nel codice: tutto arriva dalle variabili d'ambiente.
 *
 *   RESEND_API_KEY      chiave API (segreto: solo nel pannello Netlify o nel proprio .env.local, mai nel repository)
 *   NOTIFY_EMAIL_TO     destinatario/i, separati da virgola (previsto: compro.moto.support@gmail.com)
 *   NOTIFY_EMAIL_FROM   mittente; se manca si usa il mittente di prova di Resend (vedi docs/NOTIFICHE.md)
 *
 * Una configurazione incompleta o non valida DISATTIVA le notifiche e produce un avviso: non ferma mai il sito
 * (le richieste dei clienti devono continuare ad arrivare).
 */
export type NotificationConfig =
  | { enabled: false; reasons: string[] }
  | { enabled: true; apiKey: string; to: string[]; from: string };

/** Mittente di prova di Resend: consegna SOLO all'indirizzo dell'account Resend (vedi docs/NOTIFICHE.md). */
export const RESEND_TEST_SENDER = "Compro Moto <onboarding@resend.dev>";

const EMAIL_RE = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;
const FROM_RE = /^(?:[^<>@\r\n]{1,80}<[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+>|[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+)$/;
const MAX_RECIPIENTS = 3;

export function loadNotificationConfig(e: NodeJS.ProcessEnv = process.env): NotificationConfig {
  const reasons: string[] = [];
  const apiKey = e.RESEND_API_KEY?.trim();
  const toRaw = e.NOTIFY_EMAIL_TO?.trim();
  const fromRaw = e.NOTIFY_EMAIL_FROM?.trim();

  if (!apiKey) reasons.push("RESEND_API_KEY mancante");
  if (!toRaw) reasons.push("NOTIFY_EMAIL_TO mancante");

  const to = (toRaw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (toRaw && (to.length === 0 || to.length > MAX_RECIPIENTS || to.some((a) => !EMAIL_RE.test(a)))) {
    reasons.push(`NOTIFY_EMAIL_TO non valido (da 1 a ${MAX_RECIPIENTS} indirizzi email separati da virgola)`);
  }
  if (fromRaw && !FROM_RE.test(fromRaw)) reasons.push('NOTIFY_EMAIL_FROM non valido (es. "Compro Moto <notifiche@tuodominio.it>")');

  if (reasons.length) return { enabled: false, reasons };
  return { enabled: true, apiKey: apiKey!, to, from: fromRaw || RESEND_TEST_SENDER };
}

/** Avvisi leggibili per log di avvio e check:env (nessun valore, solo nomi di variabili). */
export function notificationWarnings(e: NodeJS.ProcessEnv = process.env): string[] {
  const cfg = loadNotificationConfig(e);
  if (cfg.enabled) return [];
  const nothingSet = !e.RESEND_API_KEY?.trim() && !e.NOTIFY_EMAIL_TO?.trim() && !e.NOTIFY_EMAIL_FROM?.trim();
  return [
    nothingSet
      ? "Notifiche email non configurate (RESEND_API_KEY, NOTIFY_EMAIL_TO): le nuove richieste si vedono solo nel back office."
      : `Notifiche email disattivate: ${cfg.reasons.join("; ")}.`,
  ];
}
