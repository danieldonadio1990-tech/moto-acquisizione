import "server-only";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

/**
 * Storage delle foto. Interfaccia minima per poter sostituire il disco locale
 * con uno storage privato in cloud (Supabase Storage, S3, R2) senza toccare il resto.
 *
 * Le foto NON sono mai servite pubblicamente: solo via /api/admin/photos/[id] con login.
 */
export interface PhotoStorage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
}

class LocalDiskStorage implements PhotoStorage {
  constructor(private root: string) {}

  private resolve(key: string) {
    // key generata dal server; difesa comunque contro path traversal
    if (!/^[a-zA-Z0-9/_.-]+$/.test(key) || key.includes("..")) throw new Error("Chiave non valida");
    return path.join(this.root, key);
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
}

let storage: PhotoStorage | undefined;

export function getPhotoStorage(): PhotoStorage {
  if (!storage) {
    storage = new LocalDiskStorage(
      process.env.UPLOADS_DIR || path.join(process.cwd(), "data", "uploads"),
    );
  }
  return storage;
}
