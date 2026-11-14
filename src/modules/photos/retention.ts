import "server-only";
import { eq, lt } from "drizzle-orm";
import { getDb } from "@/db/client";
import { leadPhotos } from "@/db/schema";
import { logError } from "@/lib/log";
import { getPhotoStorage } from "./storage";
import { PHOTO_RETENTION_DAYS } from "./limits";

export type PurgeResult = { checked: number; deleted: number; failed: number };

export const MIN_CLEANUP_TOKEN_LENGTH = 32;

/** Token del job di pulizia pianificato; null = pulizia automatica non attiva (nessuna rotta interna risponde). */
export function loadPhotoCleanupToken(e: NodeJS.ProcessEnv = process.env): string | null {
  const t = e.PHOTO_CLEANUP_TOKEN?.trim();
  return t && t.length >= MIN_CLEANUP_TOKEN_LENGTH && /^[\x21-\x7e]+$/.test(t) ? t : null;
}

/**
 * Cancellazione automatica delle foto più vecchie di PHOTO_RETENTION_DAYS (15 giorni dal caricamento).
 *
 * Ordine OBBLIGATO: prima il file nello storage, poi la riga nel database. Se la cancellazione dallo storage
 * fallisce (errore transitorio di rete/S3), la riga NON viene toccata: resta candidata e si riprova al giro
 * successivo. Non lancia mai eccezioni: un errore su una foto non deve bloccare le altre né il chiamante
 * (rotta interna pianificata).
 */
export async function purgeExpiredPhotos(days: number = PHOTO_RETENTION_DAYS): Promise<PurgeResult> {
  const db = await getDb();
  const storage = getPhotoStorage();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const candidates = await db
    .select({ id: leadPhotos.id, storageKey: leadPhotos.storageKey })
    .from(leadPhotos)
    .where(lt(leadPhotos.createdAt, cutoff));

  let deleted = 0;
  let failed = 0;
  for (const photo of candidates) {
    try {
      await storage.delete(photo.storageKey);
    } catch (err) {
      logError("foto:scadenza:storage", err);
      failed++;
      continue; // riga NON cancellata: si riprova al giro successivo
    }
    try {
      await db.delete(leadPhotos).where(eq(leadPhotos.id, photo.id));
      deleted++;
    } catch (err) {
      // file già cancellato dallo storage ma la riga resta: non è un file orfano (il file non c'è più),
      // solo un riferimento scaduto che il prossimo giro cancellerà di nuovo (delete dello storage è idempotente)
      logError("foto:scadenza:db", err);
      failed++;
    }
  }
  return { checked: candidates.length, deleted, failed };
}

/** Vero se la foto è scaduta (usata per nasconderla PRIMA ancora che il job di pulizia la cancelli fisicamente). */
export function isPhotoExpired(createdAt: Date, days: number = PHOTO_RETENTION_DAYS, now: Date = new Date()): boolean {
  return createdAt.getTime() < now.getTime() - days * 24 * 60 * 60 * 1000;
}
