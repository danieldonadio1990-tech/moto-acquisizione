import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * «Gettone del modulo»: protezione anti-bot senza servizi esterni, senza cookie e senza stato sul server.
 *
 * Il browser lo richiede quando si apre il modulo (GET /api/leads/form-token) e lo restituisce all'invio. Il gettone è
 * firmato (HMAC con il segreto del server) e contiene l'istante di emissione. Il server rifiuta l'invio se:
 *  - manca o non è valido (un bot che scrive direttamente a /api/leads non lo ha);
 *  - è troppo recente (meno di 3 secondi: nessuna persona compila il modulo così in fretta);
 *  - è scaduto (più di 2 ore).
 * Un gettone può generare al massimo 3 richieste (contatore condiviso su database, vedi RULES.leadCreatePerFormToken):
 * per inviarne molte un bot deve richiedere molti gettoni, e ognuno ha un'attesa minima e un limite per IP.
 *
 * LIMITI (dichiarati): non ferma un bot evoluto che esegue il modulo come un browser e aspetta 3 secondi. Alza il costo
 * degli invii automatici semplici; la protezione di quota è garantita dal limite giornaliero delle notifiche.
 * Un CAPTCHA (per esempio Cloudflare Turnstile) sarebbe il passo successivo: introduce uno script e un servizio di
 * terze parti da valutare nell'informativa privacy, per questo non è incluso (vedi docs/NOTIFICHE.md).
 */
export const FORM_TOKEN_MIN_AGE_MS = 3_000;
export const FORM_TOKEN_MAX_AGE_MS = 2 * 60 * 60 * 1000;

/** Obbligatorio in produzione. In sviluppo e nei test si attiva con FORM_TOKEN_REQUIRED=true; si spegne con FORM_TOKEN_REQUIRED=false. */
export function formTokenRequired(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.FORM_TOKEN_REQUIRED === "true") return true;
  if (env.FORM_TOKEN_REQUIRED === "false") return false;
  return env.NODE_ENV === "production";
}

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET mancante o troppo corta");
  return s;
}
const sign = (issuedAt: number, nonce: string) =>
  createHmac("sha256", secret()).update(`form-token\0${issuedAt}\0${nonce}`).digest("base64url").slice(0, 32);

export function issueFormToken(now = Date.now()): string {
  const nonce = randomBytes(12).toString("base64url");
  return `${now}.${nonce}.${sign(now, nonce)}`;
}

export type FormTokenCheck =
  | { ok: true; nonce: string }
  | { ok: false; reason: "missing" | "invalid" | "expired" | "too_fast" };

export function checkFormToken(token: string | undefined, now = Date.now()): FormTokenCheck {
  if (!token) return { ok: false, reason: "missing" };
  const m = /^(\d{10,16})\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{32})$/.exec(token);
  if (!m) return { ok: false, reason: "invalid" };
  const issuedAt = Number(m[1]);
  const expected = Buffer.from(sign(issuedAt, m[2]));
  const given = Buffer.from(m[3]);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: "invalid" };
  const age = now - issuedAt;
  if (age < 0 || age < FORM_TOKEN_MIN_AGE_MS) return { ok: false, reason: "too_fast" };
  if (age > FORM_TOKEN_MAX_AGE_MS) return { ok: false, reason: "expired" };
  return { ok: true, nonce: m[2] };
}
