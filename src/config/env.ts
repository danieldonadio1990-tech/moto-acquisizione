/**
 * Configurazione server, validata all'avvio (src/instrumentation.ts).
 *
 * DEVELOPMENT (npm run dev):
 *   - DATABASE_URL facoltativa → senza, database integrato PGlite in ./data/pglite
 *   - foto su disco locale in ./data/uploads
 *
 * PRODUCTION (npm run build && npm start, o hosting):
 *   - DATABASE_URL OBBLIGATORIA (PostgreSQL). Mai fallback sul database locale.
 *   - STORAGE_DRIVER OBBLIGATORIO:
 *       "s3"    → storage persistente S3-compatibile (AWS S3, Cloudflare R2, Supabase Storage, Backblaze…)
 *       "local" → ammesso SOLO dichiarando un disco persistente (STORAGE_LOCAL_PERSISTENT=true + UPLOADS_DIR),
 *                 es. VPS. Mai su hosting serverless, dove il disco è effimero.
 *   - SESSION_SECRET di almeno 32 caratteri.
 *
 * Se qualcosa manca, il server NON parte e il log spiega cosa correggere.
 */
import path from "node:path";

export type AppEnv = "development" | "production" | "test";

export type DatabaseConfig = { kind: "postgres"; url: string; migrationUrl?: string } | { kind: "pglite"; dir: string };

export type StorageConfig =
  | { driver: "local"; dir: string }
  | {
      driver: "s3";
      bucket: string;
      region: string;
      endpoint?: string;
      accessKeyId: string;
      secretAccessKey: string;
      forcePathStyle: boolean;
      prefix: string;
    };

/**
 * Da dove leggere l'IP del client (serve al rate limit). Mai fidarsi di un header che il client può scrivere.
 *  - vercel     → x-vercel-forwarded-for: impostato da Vercel, che sovrascrive i valori inviati dal client
 *  - cloudflare → cf-connecting-ip: impostato da Cloudflare (solo se il server è raggiungibile SOLO via Cloudflare)
 *  - header     → header indicato in CLIENT_IP_HEADER, impostato da un proxy fidato (es. nginx: X-Real-IP)
 *  - forwarded  → primo valore di x-forwarded-for: FALSIFICABILE, ammesso solo in sviluppo/test
 */
export type ClientIpConfig =
  | { source: "vercel" }
  | { source: "cloudflare" }
  | { source: "header"; header: string }
  | { source: "forwarded" };

export type ServerConfig = {
  env: AppEnv;
  database: DatabaseConfig;
  storage: StorageConfig;
  sessionSecret: string;
  clientIp: ClientIpConfig;
  migrateOnStart: boolean;
  warnings: string[];
};

export class ConfigError extends Error {
  constructor(public problems: string[]) {
    super(
      "Configurazione non valida — il server non può partire:\n" + problems.map((p) => `  • ${p}`).join("\n"),
    );
    this.name = "ConfigError";
  }
}

export function appEnv(e: NodeJS.ProcessEnv = process.env): AppEnv {
  if (e.NODE_ENV === "production") return "production";
  if (e.NODE_ENV === "test") return "test";
  return "development";
}

const blank = (v: string | undefined) => !v || !v.trim();

export function loadServerConfig(e: NodeJS.ProcessEnv = process.env): ServerConfig {
  const env = appEnv(e);
  const prod = env === "production";
  const problems: string[] = [];
  const warnings: string[] = [];

  // --- Database ---
  let database: DatabaseConfig;
  const url = e.DATABASE_URL?.trim();
  if (url) {
    if (!/^postgres(ql)?:\/\//.test(url)) problems.push("DATABASE_URL deve iniziare con postgres:// o postgresql://");
    const direct = e.DATABASE_URL_DIRECT?.trim() || undefined;
    if (direct && !/^postgres(ql)?:\/\//.test(direct)) problems.push("DATABASE_URL_DIRECT deve iniziare con postgres:// o postgresql://");
    database = { kind: "postgres", url, migrationUrl: direct };
  } else if (prod) {
    problems.push(
      "DATABASE_URL mancante. In produzione serve un database PostgreSQL persistente: il database locale non viene mai usato in produzione.",
    );
    database = { kind: "pglite", dir: "" };
  } else {
    database = { kind: "pglite", dir: e.PGLITE_DIR?.trim() || path.join(process.cwd(), "data", "pglite") };
  }

  // --- Storage foto ---
  let storage: StorageConfig;
  const driver = e.STORAGE_DRIVER?.trim().toLowerCase();
  if (driver === "s3") {
    const need = ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const;
    for (const k of need) if (blank(e[k])) problems.push(`${k} mancante (richiesta da STORAGE_DRIVER=s3)`);
    storage = {
      driver: "s3",
      bucket: e.S3_BUCKET?.trim() ?? "",
      region: e.S3_REGION?.trim() || "auto",
      endpoint: e.S3_ENDPOINT?.trim() || undefined,
      accessKeyId: e.S3_ACCESS_KEY_ID?.trim() ?? "",
      secretAccessKey: e.S3_SECRET_ACCESS_KEY?.trim() ?? "",
      forcePathStyle: e.S3_FORCE_PATH_STYLE === "true",
      prefix: (e.S3_PREFIX?.trim() || "").replace(/^\/+|\/+$/g, ""),
    };
  } else if (driver === "local" || (!driver && !prod)) {
    const dir = e.UPLOADS_DIR?.trim();
    if (prod) {
      if (e.STORAGE_LOCAL_PERSISTENT !== "true" || !dir) {
        problems.push(
          "STORAGE_DRIVER=local in produzione è ammesso solo su un disco persistente: imposta UPLOADS_DIR (percorso assoluto) e STORAGE_LOCAL_PERSISTENT=true. Su hosting serverless usa STORAGE_DRIVER=s3.",
        );
      } else if (!path.isAbsolute(dir)) {
        problems.push("UPLOADS_DIR deve essere un percorso assoluto in produzione");
      }
    }
    storage = { driver: "local", dir: dir || path.join(process.cwd(), "data", "uploads") };
  } else if (!driver && prod) {
    problems.push(
      "STORAGE_DRIVER mancante. In produzione le foto devono andare su uno storage persistente: STORAGE_DRIVER=s3 (consigliato) oppure STORAGE_DRIVER=local con disco persistente dichiarato.",
    );
    storage = { driver: "local", dir: "" };
  } else {
    problems.push(`STORAGE_DRIVER non valido: "${driver}" (valori ammessi: s3, local)`);
    storage = { driver: "local", dir: "" };
  }

  // --- Sessione admin ---
  const sessionSecret = e.SESSION_SECRET ?? "";
  if (sessionSecret.length < 32) problems.push("SESSION_SECRET mancante o troppo corta (almeno 32 caratteri casuali)");

  // --- IP del client ---
  let clientIp: ClientIpConfig;
  const ipSource = e.CLIENT_IP_SOURCE?.trim().toLowerCase();
  if (ipSource === "vercel" || (!ipSource && e.VERCEL === "1")) clientIp = { source: "vercel" };
  else if (ipSource === "cloudflare") clientIp = { source: "cloudflare" };
  else if (ipSource === "header") {
    const header = e.CLIENT_IP_HEADER?.trim().toLowerCase();
    if (!header || !/^[a-z0-9-]+$/.test(header)) problems.push("CLIENT_IP_HEADER mancante o non valido (richiesto da CLIENT_IP_SOURCE=header)");
    else if (header === "x-forwarded-for") problems.push("CLIENT_IP_HEADER=x-forwarded-for non è affidabile: usa l'header impostato dal tuo proxy (es. x-real-ip)");
    clientIp = { source: "header", header: header ?? "" };
  } else if (ipSource === "forwarded" || (!ipSource && !prod)) {
    if (prod) problems.push("CLIENT_IP_SOURCE=forwarded non è ammesso in produzione: l'header x-forwarded-for può essere falsificato");
    clientIp = { source: "forwarded" };
  } else if (!ipSource && prod) {
    problems.push(
      "CLIENT_IP_SOURCE mancante. Su Vercel è automatico; altrove indica come leggere l'IP reale del client (cloudflare, oppure header + CLIENT_IP_HEADER) per un rate limit non aggirabile.",
    );
    clientIp = { source: "forwarded" };
  } else {
    problems.push(`CLIENT_IP_SOURCE non valido: "${ipSource}" (valori ammessi: vercel, cloudflare, header)`);
    clientIp = { source: "forwarded" };
  }

  // --- Avvisi non bloccanti ---

  if (problems.length) throw new ConfigError(problems);
  return { env, database, storage, sessionSecret, clientIp, migrateOnStart: e.MIGRATE_ON_START !== "false", warnings };
}

let cached: ServerConfig | undefined;
/** Configurazione validata (lancia ConfigError se non valida). */
export function serverConfig(): ServerConfig {
  if (!cached) cached = loadServerConfig();
  return cached;
}
