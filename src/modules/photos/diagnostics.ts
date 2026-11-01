import "server-only";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { serverConfig } from "@/config/env";
import { getPhotoStorage, type PhotoStorage } from "./storage";
import { processPhoto } from "./process";

/**
 * Informazioni NON sensibili su un errore: solo nome, codice e stato HTTP, e solo se hanno la forma di un identificatore
 * (es. «NoSuchBucket», «AccessDenied», «ENOTFOUND», «TimeoutError»). Il messaggio dell'errore non viene mai restituito:
 * potrebbe contenere indirizzi o dati. Serve a dire «che cosa è andato storto» a chi gestisce il sito senza esporre segreti.
 */
export type SafeErrorInfo = { name: string; code?: string; httpStatus?: number };

const IDENT = /^[A-Za-z0-9_.-]{1,60}$/;

export function safeErrorInfo(err: unknown): SafeErrorInfo {
  const e = (err ?? {}) as { name?: unknown; code?: unknown; $metadata?: { httpStatusCode?: unknown }; cause?: unknown };
  const pick = (v: unknown) => (typeof v === "string" && IDENT.test(v) ? v : undefined);
  let name = pick(e.name);
  let code = pick(e.code);
  // errori di rete: spesso il dettaglio utile sta in «cause» (es. ENOTFOUND, ECONNREFUSED, ETIMEDOUT)
  if (e.cause && typeof e.cause === "object") {
    const c = e.cause as { name?: unknown; code?: unknown };
    code ??= pick(c.code);
    if (!name || name === "Error" || name === "TypeError") name = pick(c.name) ?? name;
  }
  const status = e.$metadata?.httpStatusCode;
  return {
    name: name ?? "Error",
    ...(code ? { code } : {}),
    ...(typeof status === "number" && status >= 100 && status <= 599 ? { httpStatus: status } : {}),
  };
}

/** Testo breve («AccessDenied, HTTP 403») da mostrare nel messaggio di errore delle foto. */
export function describeSafeError(info: SafeErrorInfo): string {
  const parts = [info.code && info.code !== info.name ? `${info.name}/${info.code}` : info.name];
  if (info.httpStatus) parts.push(`HTTP ${info.httpStatus}`);
  return parts.join(", ");
}

export type CheckStep = { step: string; ok: boolean; ms: number; error?: SafeErrorInfo };

async function timed(step: string, fn: () => Promise<void>): Promise<CheckStep> {
  const t = Date.now();
  try {
    await fn();
    return { step, ok: true, ms: Date.now() - t };
  } catch (err) {
    return { step, ok: false, ms: Date.now() - t, error: safeErrorInfo(err) };
  }
}

/**
 * Controllo dello storage e delle dipendenze del caricamento foto, eseguito DENTRO il sito pubblicato (stesso client, stesse variabili
 * d'ambiente, stesso runtime di un vero upload). Scrive e cancella un solo oggetto di prova sotto «healthcheck/»; non tocca
 * foto né dati dei clienti. Restituisce solo configurazione non segreta (mai chiavi) e l'esito di ogni passo.
 */
export async function runUploadCheck(storage: PhotoStorage = getPhotoStorage()) {
  const cfg = serverConfig().storage;
  const config =
    cfg.driver === "s3"
      ? {
          driver: "s3" as const,
          bucket: cfg.bucket,
          region: cfg.region,
          forcePathStyle: cfg.forcePathStyle,
          endpointHost: (() => {
            try {
              return cfg.endpoint ? new URL(cfg.endpoint).host : null;
            } catch {
              return "indirizzo non valido";
            }
          })(),
          prefix: cfg.prefix || null,
        }
      : { driver: "local" as const };

  const key = `healthcheck/${randomUUID()}.txt`;
  const body = Buffer.from("controllo");
  const steps: CheckStep[] = [];

  steps.push(
    await timed("elaborazione immagini (sharp)", async () => {
      const jpg = await sharp({ create: { width: 16, height: 16, channels: 3, background: "#808080" } }).jpeg().toBuffer();
      const out = await processPhoto(jpg);
      if (out.data.byteLength === 0) throw new Error("vuoto");
    }),
    await timed("database: lettura della tabella delle foto", async () => {
      const db = await getDb();
      await db.execute(sql`select count(*)::int as n from lead_photos`);
    }),
    await timed("storage: scrittura", () => storage.put(key, body, "text/plain")),
  );
  const wrote = steps[steps.length - 1].ok;
  if (wrote) {
    steps.push(
      await timed("storage: lettura", async () => {
        const got = await storage.get(key);
        if (!got || !got.equals(body)) throw new Error("contenuto diverso");
      }),
      await timed("storage: elenco", async () => {
        const keys = await storage.list("healthcheck");
        if (!keys.includes(key)) throw new Error("oggetto non trovato nell'elenco");
      }),
      await timed("storage: cancellazione", () => storage.delete(key)),
    );
  }
  return { ok: steps.every((s) => s.ok), config, steps };
}
