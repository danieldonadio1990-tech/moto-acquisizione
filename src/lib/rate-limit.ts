import { createHmac } from "node:crypto";
import { serverConfig, type ClientIpConfig } from "@/config/env";

/**
 * Rate limit a finestra fissa.
 *
 * DUE STORE:
 *  - memoria del processo (predefinito): veloce, ma su hosting serverless ogni istanza conta per conto suo;
 *  - DATABASE (regole con `shared: true`): contatori condivisi tra tutte le istanze, scritti con un unico UPSERT
 *    atomico sulla tabella `rate_limit_buckets` (nessun servizio esterno, nessun costo aggiuntivo: usa il PostgreSQL
 *    già presente). Le chiavi sono HASH (HMAC con il segreto del server): nel database non finiscono IP, numeri o email
 *    in chiaro. Se il database non risponde, il limite **fallisce aperto** sul contatore in memoria: un guasto non deve
 *    bloccare i clienti veri (il rischio opposto, perdere richieste, è peggiore di un controllo temporaneamente più debole).
 */
export type RateLimitResult = { ok: boolean; remaining: number; retryAfterSec: number };

export interface RateLimitStore {
  /** Incrementa il contatore della chiave e restituisce valore e scadenza della finestra. */
  hit(key: string, windowMs: number): Promise<{ count: number; resetAt: number }> | { count: number; resetAt: number };
  reset(key: string): Promise<void> | void;
  /** Restituisce un colpo già contato (es. prenotazione di quota poi non usata). Mai sotto zero. */
  release(key: string): Promise<void> | void;
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

  release(key: string) {
    const e = this.map.get(key);
    if (e && e.count > 0) e.count--;
  }
}

const g = globalThis as unknown as { __rlStore?: RateLimitStore };
const store = () => (g.__rlStore ??= new MemoryStore());

export function setRateLimitStore(s: RateLimitStore) {
  g.__rlStore = s;
}

export type Rule = { name: string; limit: number; windowMs: number; /** contatore condiviso su database */ shared?: boolean };

/**
 * Regole di partenza: generose per un utente reale, strette per un bot.
 * Le regole `shared` usano il database (valide su tutte le istanze); le altre la memoria dell'istanza.
 * Dietro lo stesso IP (ufficio, rete mobile condivisa) i clienti veri non si danneggiano a vicenda: il tetto per IP è
 * ampio e i tetti stretti sono per CONTATTO (stesso telefono o stessa email), non per rete.
 */
export const RULES = {
  leadCreatePerIp: { name: "lead-ip", limit: 12, windowMs: 60 * 60 * 1000, shared: true },
  /** stesso numero di telefono: poche richieste al giorno (una persona con 2–3 moto resta servita) */
  leadCreatePerPhone: { name: "lead-phone", limit: 3, windowMs: 24 * 60 * 60 * 1000, shared: true },
  leadCreatePerEmail: { name: "lead-email", limit: 3, windowMs: 24 * 60 * 60 * 1000, shared: true },
  /** stesso «gettone» del modulo: un gettone non può generare richieste in serie */
  leadCreatePerFormToken: { name: "lead-token", limit: 3, windowMs: 3 * 60 * 60 * 1000, shared: true },
  formTokenPerIp: { name: "form-token-ip", limit: 60, windowMs: 60 * 60 * 1000 },
  photoUploadPerIp: { name: "photo-ip", limit: 40, windowMs: 10 * 60 * 1000 },
  photoUploadPerLead: { name: "photo-lead", limit: 20, windowMs: 60 * 60 * 1000 },
  eventsPerIp: { name: "events-ip", limit: 120, windowMs: 60 * 1000 },
  loginPerIp: { name: "login-ip", limit: 30, windowMs: 15 * 60 * 1000, shared: true },
  /** rotta del recupero automatico delle notifiche: protegge dai tentativi a vuoto sul token */
  notifyRetryPerIp: { name: "notify-retry-ip", limit: 30, windowMs: 15 * 60 * 1000, shared: true },
  loginPerIpEmail: { name: "login-ip-email", limit: 8, windowMs: 15 * 60 * 1000, shared: true },
} satisfies Record<string, Rule>;

/** Chiave anonima per lo store condiviso: HMAC(segreto, regola + valore). Mai il valore in chiaro. */
export function bucketKey(rule: Rule, value: string): string {
  const secret = process.env.SESSION_SECRET || "rate-limit-dev-secret";
  return `${rule.name}:${createHmac("sha256", secret).update(`${rule.name}\0${value}`).digest("base64url").slice(0, 32)}`;
}

type Row = { count: number; reset_ms: string | number };

/** Store condiviso su PostgreSQL: un solo UPSERT atomico per colpo (finestra fissa). */
class DbStore implements RateLimitStore {
  async hit(key: string, windowMs: number) {
    const [{ getDb }, { sql }] = await Promise.all([import("@/db/client"), import("drizzle-orm")]);
    const db = await getDb();
    const rows = (await db.execute(sql`
      insert into rate_limit_buckets as b (key, count, reset_at)
      values (${key}, 1, now() + make_interval(secs => ${windowMs / 1000}))
      on conflict (key) do update set
        count = case when b.reset_at <= now() then 1 else b.count + 1 end,
        reset_at = case when b.reset_at <= now() then now() + make_interval(secs => ${windowMs / 1000}) else b.reset_at end
      returning count, extract(epoch from reset_at) * 1000 as reset_ms`)) as unknown as Row[] | { rows: Row[] };
    const r = (Array.isArray(rows) ? rows : rows.rows)[0];
    if (!r) throw new Error("rate limit: nessuna riga restituita");
    // pulizia opportunistica delle righe scadute (1 colpo su 100), con tetto per non pesare sulla richiesta
    if (Math.random() < 0.01) {
      await db
        .execute(sql`delete from rate_limit_buckets where key in (select key from rate_limit_buckets where reset_at < now() - interval '1 hour' limit 500)`)
        .catch(() => {});
    }
    return { count: Number(r.count), resetAt: Number(r.reset_ms) };
  }
  async reset(key: string) {
    const [{ getDb }, { sql }] = await Promise.all([import("@/db/client"), import("drizzle-orm")]);
    await (await getDb()).execute(sql`delete from rate_limit_buckets where key = ${key}`);
  }
  async release(key: string) {
    const [{ getDb }, { sql }] = await Promise.all([import("@/db/client"), import("drizzle-orm")]);
    await (await getDb()).execute(sql`update rate_limit_buckets set count = greatest(count - 1, 0) where key = ${key}`);
  }
}
const gdb = globalThis as unknown as { __rlDbStore?: RateLimitStore };
const dbStore = () => (gdb.__rlDbStore ??= new DbStore());

/** Solo per i test: sostituisce lo store condiviso (null = ripristina quello su database). */
export function setSharedRateLimitStore(s: RateLimitStore | null) {
  gdb.__rlDbStore = s ?? undefined;
}

/**
 * Conta un colpo. Le regole `shared` usano il database; se non risponde si ripiega sul contatore in memoria
 * (fail-open, con un avviso nel log: nessun dato personale).
 */
export async function rateLimit(rule: Rule, key: string): Promise<RateLimitResult> {
  if (process.env.RATE_LIMIT_DISABLED === "true" && process.env.NODE_ENV !== "production") {
    return { ok: true, remaining: rule.limit, retryAfterSec: 0 };
  }
  let hit: { count: number; resetAt: number };
  if (rule.shared) {
    try {
      hit = await dbStore().hit(bucketKey(rule, key), rule.windowMs);
    } catch (err) {
      console.warn(`[rate-limit] contatore condiviso non disponibile per «${rule.name}»: si usa la memoria dell'istanza`, (err as Error)?.name);
      hit = await store().hit(`${rule.name}:${key}`, rule.windowMs);
    }
  } else {
    hit = await store().hit(`${rule.name}:${key}`, rule.windowMs);
  }
  const { count, resetAt } = hit;
  return {
    ok: count <= rule.limit,
    remaining: Math.max(0, rule.limit - count),
    retryAfterSec: Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)),
  };
}

/** Restituisce un colpo contato con rateLimit() (stessa regola e stessa chiave). Non lancia eccezioni. */
export async function releaseRateLimit(rule: Rule, key: string) {
  try {
    if (rule.shared) await Promise.resolve(dbStore().release(bucketKey(rule, key)));
    else await Promise.resolve(store().release(`${rule.name}:${key}`));
  } catch {
    // al peggio la quota resta prenotata: errore per eccesso di prudenza
  }
}

export async function resetRateLimit(rule: Rule, key: string) {
  await store().reset(`${rule.name}:${key}`);
  if (rule.shared) await Promise.resolve(dbStore().reset(bucketKey(rule, key))).catch(() => {});
}

/**
 * IP del client, letto SOLO dalla fonte configurata (src/config/env.ts → CLIENT_IP_SOURCE).
 * Su Vercel: x-vercel-forwarded-for, che Vercel imposta e che il client non può falsificare.
 * Se l'header atteso manca, tutte queste richieste condividono il contatore "unknown" (più restrittivo, non più permissivo).
 */
export function clientIp(headers: Headers, cfg: ClientIpConfig = serverConfig().clientIp): string {
  let raw: string | null = null;
  switch (cfg.source) {
    case "vercel":
      raw = headers.get("x-vercel-forwarded-for");
      break;
    case "cloudflare":
      raw = headers.get("cf-connecting-ip");
      break;
    case "header":
      raw = headers.get(cfg.header);
      break;
    case "forwarded":
      raw = headers.get("x-forwarded-for");
      break;
  }
  const ip = raw?.split(",")[0].trim().slice(0, 64);
  if (!ip) {
    warnMissingIpOnce(cfg.source);
    return "unknown";
  }
  return ip;
}

let warned = false;
function warnMissingIpOnce(source: string) {
  if (warned) return;
  warned = true;
  console.warn(`[rate-limit] IP del client non trovato (fonte: ${source}): controllare CLIENT_IP_SOURCE`);
}

export function tooManyRequests(retryAfterSec: number, message = "Troppe richieste. Riprova tra qualche minuto.") {
  return Response.json(
    { error: message, retryAfterSec },
    { status: 429, headers: { "retry-after": String(retryAfterSec) } },
  );
}
