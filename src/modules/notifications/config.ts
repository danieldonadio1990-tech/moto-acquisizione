/**
 * Configurazione delle notifiche email (Resend). Nessun valore è nel codice: tutto arriva dalle variabili d'ambiente.
 *
 *   RESEND_API_KEY      chiave API (segreto: solo nel pannello Netlify o nel proprio .env.local, mai nel repository)
 *   NOTIFY_EMAIL_TO     destinatario/i, separati da virgola (indirizzo reale solo nella variabile, mai nel codice)
 *   NOTIFY_EMAIL_FROM   mittente; se manca si usa il mittente di prova di Resend (vedi docs/NOTIFICHE.md)
 *   NOTIFY_EMAIL_REPLY_TO  facoltativo: indirizzo Reply-To delle notifiche; se manca l'email non ha Reply-To
 *
 * Una configurazione incompleta o non valida DISATTIVA le notifiche e produce un avviso: non ferma mai il sito
 * (le richieste dei clienti devono continuare ad arrivare).
 */
export type NotificationConfig =
  | { enabled: false; reasons: string[] }
  | { enabled: true; apiKey: string; to: string[]; from: string; replyTo?: string; dailyLimit: number };

/** Mittente di prova di Resend: consegna SOLO all'indirizzo dell'account Resend (vedi docs/NOTIFICHE.md). */
export const RESEND_TEST_SENDER = "Compriamo Moto <onboarding@resend.dev>";

const EMAIL_RE = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;
const FROM_RE = /^(?:[^<>@\r\n]{1,80}<[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+>|[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+)$/;
const MAX_RECIPIENTS = 3;

/**
 * Limite giornaliero (giorno UTC, come la quota di Resend) di email di notifica inviate da questo sito.
 * Il piano gratuito di Resend consente 100 email al giorno: il valore predefinito lascia margine per
 * retry manuali, prove e un eventuale abuso. 0 = nessun limite.
 */
export const DEFAULT_DAILY_LIMIT = 50;

export function parseDailyLimit(e: NodeJS.ProcessEnv = process.env): { value: number; invalid: boolean } {
  const raw = e.NOTIFY_DAILY_LIMIT?.trim();
  if (!raw) return { value: DEFAULT_DAILY_LIMIT, invalid: false };
  if (!/^\d{1,4}$/.test(raw)) return { value: DEFAULT_DAILY_LIMIT, invalid: true };
  return { value: Number(raw), invalid: false };
}

export function loadNotificationConfig(e: NodeJS.ProcessEnv = process.env): NotificationConfig {
  const reasons: string[] = [];
  const apiKey = e.RESEND_API_KEY?.trim();
  const toRaw = e.NOTIFY_EMAIL_TO?.trim();
  const fromRaw = e.NOTIFY_EMAIL_FROM?.trim();
  const replyToRaw = e.NOTIFY_EMAIL_REPLY_TO?.trim();

  if (!apiKey) reasons.push("RESEND_API_KEY mancante");
  if (!toRaw) reasons.push("NOTIFY_EMAIL_TO mancante");

  const to = (toRaw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (toRaw && (to.length === 0 || to.length > MAX_RECIPIENTS || to.some((a) => !EMAIL_RE.test(a)))) {
    reasons.push(`NOTIFY_EMAIL_TO non valido (da 1 a ${MAX_RECIPIENTS} indirizzi email separati da virgola)`);
  }
  if (fromRaw && !FROM_RE.test(fromRaw)) reasons.push('NOTIFY_EMAIL_FROM non valido (es. "Compriamo Moto <notifiche@tuodominio.it>")');
  // Il Reply-To è facoltativo: se non è valido si ignora (con un avviso in notificationWarnings), non si spengono le notifiche
  const replyTo = replyToRaw && EMAIL_RE.test(replyToRaw) ? replyToRaw : undefined;

  if (reasons.length) return { enabled: false, reasons };
  return { enabled: true, apiKey: apiKey!, to, from: fromRaw || RESEND_TEST_SENDER, ...(replyTo ? { replyTo } : {}), dailyLimit: parseDailyLimit(e).value };
}

/** Lunghezza minima del token del recupero automatico (generarlo con `openssl rand -hex 32`: 64 caratteri). */
export const MIN_RETRY_TOKEN_LENGTH = 32;

/**
 * Token che protegge la rotta del recupero automatico (NOTIFY_RETRY_TOKEN). null = recupero automatico non attivo:
 * la rotta risponde 404 e non fa nulla. Un token corto o con spazi/caratteri strani è trattato come assente.
 */
export function loadRetryToken(e: NodeJS.ProcessEnv = process.env): string | null {
  const t = e.NOTIFY_RETRY_TOKEN?.trim();
  return t && t.length >= MIN_RETRY_TOKEN_LENGTH && /^[\x21-\x7e]+$/.test(t) ? t : null;
}

/** Avvisi leggibili per log di avvio e check:env (nessun valore, solo nomi di variabili). */
export function notificationWarnings(e: NodeJS.ProcessEnv = process.env): string[] {
  const cfg = loadNotificationConfig(e);
  if (cfg.enabled) {
    const warnings: string[] = [];
    const replyTo = e.NOTIFY_EMAIL_REPLY_TO?.trim();
    if (replyTo && !EMAIL_RE.test(replyTo)) {
      warnings.push("NOTIFY_EMAIL_REPLY_TO non valido (un solo indirizzo email, senza nome né virgolette): ignorato, le notifiche partono senza Reply-To.");
    }
    if (parseDailyLimit(e).invalid) {
      warnings.push(`NOTIFY_DAILY_LIMIT non valido (numero intero da 0 a 9999): si usa il valore predefinito ${DEFAULT_DAILY_LIMIT}.`);
    }
    return loadRetryToken(e)
      ? warnings
      : [
          ...warnings,
          `Recupero automatico delle notifiche non attivo: NOTIFY_RETRY_TOKEN mancante o più corto di ${MIN_RETRY_TOKEN_LENGTH} caratteri (le notifiche fallite si recuperano solo aprendo il back office).`,
        ];
  }
  const nothingSet = !e.RESEND_API_KEY?.trim() && !e.NOTIFY_EMAIL_TO?.trim() && !e.NOTIFY_EMAIL_FROM?.trim() && !e.NOTIFY_EMAIL_REPLY_TO?.trim();
  return [
    nothingSet
      ? "Notifiche email non configurate (RESEND_API_KEY, NOTIFY_EMAIL_TO): le nuove richieste si vedono solo nel back office."
      : `Notifiche email disattivate: ${cfg.reasons.join("; ")}.`,
  ];
}
