import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { isCheckViolation, isUniqueViolation } from "@/db/errors";
import { leadPhotos, leads } from "@/db/schema";
import { logError } from "@/lib/log";
import { getPhotoStorage } from "./storage";
import { MAX_PHOTOS_PER_LEAD, PhotoError, processPhoto } from "./process";

export type PhotoItem = { clientPhotoId: string; data: Buffer };
export type PhotoResult = {
  clientPhotoId: string;
  status: "saved" | "duplicate" | "invalid" | "limit" | "error";
  message?: string;
};

class LimitReached extends Error {}

/**
 * Salva le foto di un lead. Il token va verificato PRIMA (verifyUploadToken).
 *
 * - Idempotente per foto: lo stesso clientPhotoId non viene mai salvato due volte
 *   (retry dopo risposta persa → "duplicate", nessuna copia).
 * - Limite di 12 foto atomico: il posto viene "prenotato" con un UPDATE condizionale
 *   (photo_count < 12) nella stessa transazione dell'inserimento, più un CHECK sul database.
 *   Richieste parallele non possono superarlo.
 * - Se lo storage o il database falliscono, il file eventualmente scritto viene rimosso.
 */
export async function savePhotos(leadId: string, items: PhotoItem[]): Promise<PhotoResult[]> {
  const db = await getDb();
  const storage = getPhotoStorage();
  const results: PhotoResult[] = [];

  for (const item of items) {
    const id = item.clientPhotoId;
    // già salvata in un tentativo precedente?
    const [dup] = await db
      .select({ id: leadPhotos.id })
      .from(leadPhotos)
      .where(and(eq(leadPhotos.leadId, leadId), eq(leadPhotos.clientPhotoId, id)));
    if (dup) {
      results.push({ clientPhotoId: id, status: "duplicate" });
      continue;
    }
    // controllo rapido prima del lavoro pesante (quello vincolante è nella transazione)
    const [lead] = await db.select({ n: leads.photoCount }).from(leads).where(eq(leads.id, leadId));
    if (!lead || lead.n >= MAX_PHOTOS_PER_LEAD) {
      results.push({ clientPhotoId: id, status: "limit", message: "Numero massimo di foto raggiunto" });
      continue;
    }

    let processed;
    try {
      processed = await processPhoto(item.data);
    } catch (err) {
      const message = err instanceof PhotoError ? err.message : "Immagine non valida";
      results.push({ clientPhotoId: id, status: "invalid", message });
      continue;
    }

    const key = `leads/${leadId}/${randomUUID()}.jpg`;
    try {
      await storage.put(key, processed.data, processed.contentType);
    } catch (err) {
      logError("foto:storage", err);
      results.push({ clientPhotoId: id, status: "error", message: "Salvataggio non riuscito, riprova" });
      continue;
    }

    try {
      await db.transaction(async (tx) => {
        const reserved = await tx
          .update(leads)
          .set({ photoCount: sql`${leads.photoCount} + 1` })
          .where(and(eq(leads.id, leadId), lt(leads.photoCount, MAX_PHOTOS_PER_LEAD)))
          .returning({ n: leads.photoCount });
        if (reserved.length === 0) throw new LimitReached();
        await tx.insert(leadPhotos).values({
          leadId,
          clientPhotoId: id,
          storageKey: key,
          mimeType: processed.contentType,
          sizeBytes: processed.data.byteLength,
          width: processed.width,
          height: processed.height,
        });
      });
      results.push({ clientPhotoId: id, status: "saved" });
    } catch (err) {
      await storage.delete(key).catch((e) => logError("foto:pulizia", e));
      if (err instanceof LimitReached || isCheckViolation(err)) {
        results.push({ clientPhotoId: id, status: "limit", message: "Numero massimo di foto raggiunto" });
      } else if (isUniqueViolation(err)) {
        results.push({ clientPhotoId: id, status: "duplicate" });
      } else {
        logError("foto:db", err);
        results.push({ clientPhotoId: id, status: "error", message: "Salvataggio non riuscito, riprova" });
      }
    }
  }
  return results;
}
