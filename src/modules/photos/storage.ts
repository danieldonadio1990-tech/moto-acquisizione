import "server-only";
import path from "node:path";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { serverConfig, type StorageConfig } from "@/config/env";

/**
 * Storage delle foto (privato: le foto non sono mai servite pubblicamente,
 * solo via /api/admin/photos/[id] con login).
 *
 *   development → disco locale (./data/uploads)
 *   production  → storage persistente S3-compatibile (STORAGE_DRIVER=s3),
 *                 oppure disco locale SOLO se dichiarato persistente (vedi src/config/env.ts)
 */
export interface PhotoStorage {
  readonly driver: StorageConfig["driver"];
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  /** Idempotente: cancellare una chiave inesistente non è un errore. */
  delete(key: string): Promise<void>;
  /** Cancella tutto sotto un prefisso (es. "leads/<id>/"), compresi eventuali file orfani. Restituisce quanti. */
  deletePrefix(prefix: string): Promise<number>;
  /** Elenca le chiavi sotto un prefisso (verifiche e test). */
  list(prefix: string): Promise<string[]>;
}

/** Le chiavi sono generate dal server; la validazione è una difesa in più contro path traversal. */
export function assertSafeKey(key: string) {
  if (!/^[a-zA-Z0-9/_.-]+$/.test(key) || key.includes("..") || key.startsWith("/")) {
    throw new Error("Chiave storage non valida");
  }
}

class LocalDiskStorage implements PhotoStorage {
  readonly driver = "local" as const;
  constructor(private root: string) {}

  private resolve(key: string) {
    assertSafeKey(key);
    const file = path.resolve(this.root, key);
    if (!file.startsWith(path.resolve(this.root) + path.sep)) throw new Error("Chiave storage non valida");
    return file;
  }

  async put(key: string, data: Buffer) {
    const file = this.resolve(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
  }

  async get(key: string) {
    try {
      return await readFile(this.resolve(key));
    } catch {
      return null;
    }
  }

  async delete(key: string) {
    await rm(this.resolve(key), { force: true });
  }

  async list(prefix: string) {
    const dir = this.resolve(prefix.replace(/\/+$/, ""));
    try {
      const names = await readdir(dir);
      return names.map((n) => `${prefix.replace(/\/+$/, "")}/${n}`);
    } catch {
      return [];
    }
  }

  async deletePrefix(prefix: string) {
    const keys = await this.list(prefix);
    await rm(this.resolve(prefix.replace(/\/+$/, "")), { recursive: true, force: true });
    return keys.length;
  }
}

class S3Storage implements PhotoStorage {
  readonly driver = "s3" as const;
  private clientPromise: Promise<import("@aws-sdk/client-s3").S3Client>;

  constructor(private cfg: Extract<StorageConfig, { driver: "s3" }>) {
    this.clientPromise = import("@aws-sdk/client-s3").then(
      ({ S3Client }) =>
        new S3Client({
          region: cfg.region,
          endpoint: cfg.endpoint,
          forcePathStyle: cfg.forcePathStyle,
          credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
          // i checksum aggiuntivi inviati di default dall'SDK recente non sono accettati da tutti gli storage
          // S3-compatibili (Supabase incluso): li si invia solo quando il protocollo li richiede
          requestChecksumCalculation: "WHEN_REQUIRED",
          responseChecksumValidation: "WHEN_REQUIRED",
        }),
    );
  }

  private k(key: string) {
    assertSafeKey(key);
    return this.cfg.prefix ? `${this.cfg.prefix}/${key}` : key;
  }

  async put(key: string, data: Buffer, contentType: string) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    await (await this.clientPromise).send(
      new PutObjectCommand({ Bucket: this.cfg.bucket, Key: this.k(key), Body: data, ContentType: contentType }),
    );
  }

  async get(key: string) {
    const { GetObjectCommand, NoSuchKey } = await import("@aws-sdk/client-s3");
    try {
      const res = await (await this.clientPromise).send(new GetObjectCommand({ Bucket: this.cfg.bucket, Key: this.k(key) }));
      if (!res.Body) return null;
      return Buffer.from(await res.Body.transformToByteArray());
    } catch (err) {
      if (err instanceof NoSuchKey || (err as { name?: string }).name === "NoSuchKey") return null;
      throw err;
    }
  }

  async delete(key: string) {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    await (await this.clientPromise).send(new DeleteObjectCommand({ Bucket: this.cfg.bucket, Key: this.k(key) }));
  }

  async list(prefix: string) {
    const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
    const client = await this.clientPromise;
    const full = this.k(prefix.replace(/\/+$/, "")) + "/";
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const res = await client.send(
        new ListObjectsV2Command({ Bucket: this.cfg.bucket, Prefix: full, ContinuationToken: token }),
      );
      for (const o of res.Contents ?? []) if (o.Key) keys.push(o.Key);
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    const strip = this.cfg.prefix ? this.cfg.prefix.length + 1 : 0;
    return keys.map((k) => k.slice(strip));
  }

  async deletePrefix(prefix: string) {
    const keys = await this.list(prefix);
    for (const key of keys) await this.delete(key);
    return keys.length;
  }
}

const g = globalThis as unknown as { __photoStorage?: PhotoStorage };

export function getPhotoStorage(): PhotoStorage {
  if (!g.__photoStorage) {
    const cfg = serverConfig().storage;
    g.__photoStorage = cfg.driver === "s3" ? new S3Storage(cfg) : new LocalDiskStorage(cfg.dir);
  }
  return g.__photoStorage;
}
