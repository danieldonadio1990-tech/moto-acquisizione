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

export type DatabaseConfig = { kind: "postgres"; url: string } | { kind: "pglite"; dir: string };

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

export type ServerConfig = {
  env: AppEnv;
  database: DatabaseConfig;
  storage: StorageConfig;
  sessionSecret: string;
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
    database = { kind: "postgres", url };
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

  // --- Avvisi non bloccanti ---
  if (prod && (blank(e.NEXT_PUBLIC_WHATSAPP_NUMBER) || e.NEXT_PUBLIC_WHATSAPP_NUMBER === "390000000000")) {
    warnings.push("NEXT_PUBLIC_WHATSAPP_NUMBER non impostato: il pulsante WhatsApp punta a un numero segnaposto");
  }

  if (problems.length) throw new ConfigError(problems);
  return { env, database, storage, sessionSecret, warnings };
}

let cached: ServerConfig | undefined;
/** Configurazione validata (lancia ConfigError se non valida). */
export function serverConfig(): ServerConfig {
  if (!cached) cached = loadServerConfig();
  return cached;
}
