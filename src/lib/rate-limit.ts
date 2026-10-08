/**
 * Rate limit di prima linea (finestra fissa, in memoria).
 *
 * LIMITE NOTO: il conteggio vive nella memoria del singolo processo. Con più istanze
 * (es. funzioni serverless) ogni istanza conta per conto suo, quindi la protezione è parziale.
 * Per una protezione condivisa: implementare RateLimitStore su Redis/Upstash e passarlo a setRateLimitStore().
 */
export type RateLimitResult = { ok: boolean; remaining: number; retryAfterSec: number };

export interface RateLimitStore {
  /** Incrementa il contatore della chiave e restituisce valore e scadenza della finestra. */
  hit(key: string, windowMs: number): Promise<{ count: number; resetAt: number }> | { count: number; resetAt: number };
  reset(key: string): Promise<void> | void;
}

class MemoryStore implements RateLimitStore {
  private map = new Map<string, { count: number; resetAt: number }>();
  private lastSweep = Date.now();

  hit(key: string, windowMs: number) {
    const now = Date.now();
    if (now - this.lastSweep > 60_000) {
      for (const [k, v] of this.map) if (v.resetAt <= now) this.map.delete(k);
      this.lastSweep = now;
    }
    let e = this.map.get(key);
    if (!e || e.resetAt <= now) {
      e = { count: 0, resetAt: now + windowMs };
      this.map.set(key, e);
    }
    e.count++;
    return { count: e.count, resetAt: e.resetAt };
  }

  reset(key: string) {
    this.map.delete(key);
  }
}

const g = globalThis as unknown as { __rlStore?: RateLimitStore };
const store = () => (g.__rlStore ??= new MemoryStore());

export function setRateLimitStore(s: RateLimitStore) {
  g.__rlStore = s;
}

export type Rule = { name: string; limit: number; windowMs: number };

/** Regole di partenza: generose per un utente reale, strette per un bot. */
export const RULES = {
  leadCreatePerIp: { name: "lead-ip", limit: 8, windowMs: 60 * 60 * 1000 },
  photoUploadPerIp: { name: "photo-ip", limit: 40, windowMs: 10 * 60 * 1000 },
  photoUploadPerLead: { name: "photo-lead", limit: 20, windowMs: 60 * 60 * 1000 },
  eventsPerIp: { name: "events-ip", limit: 120, windowMs: 60 * 1000 },
  loginPerIp: { name: "login-ip", limit: 30, windowMs: 15 * 60 * 1000 },
  loginPerIpEmail: { name: "login-ip-email", limit: 8, windowMs: 15 * 60 * 1000 },
} satisfies Record<string, Rule>;

export async function rateLimit(rule: Rule, key: string): Promise<RateLimitResult> {
  if (process.env.RATE_LIMIT_DISABLED === "true" && process.env.NODE_ENV !== "production") {
    return { ok: true, remaining: rule.limit, retryAfterSec: 0 };
  }
  const { count, resetAt } = await store().hit(`${rule.name}:${key}`, rule.windowMs);
  return {
    ok: count <= rule.limit,
    remaining: Math.max(0, rule.limit - count),
    retryAfterSec: Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)),
  };
}

export async function resetRateLimit(rule: Rule, key: string) {
  await store().reset(`${rule.name}:${key}`);
}

/**
 * IP del client. Dietro un proxy affidabile (Vercel, Cloudflare, nginx configurato) il primo valore
 * di x-forwarded-for è l'IP reale; senza proxy l'header è falsificabile, ma il limite resta un freno.
 */
export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim().slice(0, 64) || "unknown";
  return headers.get("x-real-ip")?.trim().slice(0, 64) || "unknown";
}

export function tooManyRequests(retryAfterSec: number, message = "Troppe richieste. Riprova tra qualche minuto.") {
  return Response.json(
    { error: message, retryAfterSec },
    { status: 429, headers: { "retry-after": String(retryAfterSec) } },
  );
}
