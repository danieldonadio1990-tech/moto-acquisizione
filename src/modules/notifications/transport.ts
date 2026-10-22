import { loadNotificationConfig } from "./config";

/**
 * Invio email. Un'interfaccia sola (EmailTransport) così i test usano un trasporto finto e non toccano mai la rete.
 * Implementazione reale: Resend, una POST HTTP (nessuna dipendenza).
 */
export type EmailMessage = {
  from: string;
  to: string[];
  subject: string;
  text: string;
  /** Resend ricorda la chiave per 24 ore: lo stesso invio ripetuto in quella finestra non produce una seconda email */
  idempotencyKey: string;
};

/** Codici sintetici: mai il corpo della risposta del provider (potrebbe contenere indirizzi email). */
export type SendResult = { ok: true; id?: string } | { ok: false; code: string };

export interface EmailTransport {
  send(msg: EmailMessage): Promise<SendResult>;
}

export const RESEND_ENDPOINT = "https://api.resend.com/emails";
export const SEND_TIMEOUT_MS = 4000;

export class ResendTransport implements EmailTransport {
  constructor(
    private apiKey: string,
    private fetchImpl: typeof fetch = fetch,
    private timeoutMs = SEND_TIMEOUT_MS,
  ) {}

  async send(msg: EmailMessage): Promise<SendResult> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
          "user-agent": "compro-moto-notifications/1.0",
          "idempotency-key": msg.idempotencyKey,
        },
        body: JSON.stringify({ from: msg.from, to: msg.to, subject: msg.subject, text: msg.text }),
        signal: ctrl.signal,
      });
      if (!res.ok) return { ok: false, code: `http_${res.status}` };
      const data = (await res.json().catch(() => null)) as { id?: unknown } | null;
      return { ok: true, id: typeof data?.id === "string" ? data.id : undefined };
    } catch (err) {
      return { ok: false, code: (err as { name?: string })?.name === "AbortError" ? "timeout" : "network" };
    } finally {
      clearTimeout(timer);
    }
  }
}

const g = globalThis as unknown as { __emailTransport?: EmailTransport | null };

/** Solo per i test: sostituisce il trasporto (null = come se le notifiche non fossero configurate). */
export function setEmailTransport(t: EmailTransport | null | undefined) {
  g.__emailTransport = t;
}

/**
 * Trasporto in uso, o null se le notifiche non sono configurate.
 * In ambiente di test il trasporto reale NON viene mai creato, nemmeno se la chiave fosse presente nell'ambiente.
 */
export function getEmailTransport(): { transport: EmailTransport; to: string[]; from: string } | null {
  const cfg = loadNotificationConfig();
  const override = g.__emailTransport;
  if (override) {
    return { transport: override, to: cfg.enabled ? cfg.to : ["notifiche@example.invalid"], from: cfg.enabled ? cfg.from : "Test <test@example.invalid>" };
  }
  if (process.env.NODE_ENV === "test" || !cfg.enabled) return null;
  return { transport: new ResendTransport(cfg.apiKey), to: cfg.to, from: cfg.from };
}
