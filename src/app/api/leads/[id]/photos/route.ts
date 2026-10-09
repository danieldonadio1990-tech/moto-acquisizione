import { NextResponse } from "next/server";
import { verifyUploadToken } from "@/modules/leads/service";
import { savePhotos, type PhotoItem } from "@/modules/photos/upload";
import {
  MAX_FILES_PER_REQUEST,
  MAX_PHOTO_BYTES,
  MAX_UPLOAD_REQUEST_BYTES,
  UPLOAD_BODY_TIMEOUT_MS,
} from "@/modules/photos/limits";
import { BodyTimeout, BodyTooLarge, readLimitedBody } from "@/lib/body";
import { clientIp, rateLimit, RULES, tooManyRequests } from "@/lib/rate-limit";
import { logError } from "@/lib/log";

/** Tempo massimo della funzione (secondi) sugli hosting serverless */
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const err = (status: number, error: string) => NextResponse.json({ error }, { status });

/**
 * Upload foto. Ordine dei controlli pensato per non leggere corpi inutili:
 * formato richiesta → rate limit → dimensione dichiarata → TOKEN → lettura corpo (con tetto e timeout).
 * Campi multipart: "photos" (file) e "photoIds" (uno per file, stesso ordine).
 */
export async function POST(request: Request, ctx: RouteContext<"/api/leads/[id]/photos">) {
  const { id } = await ctx.params;
  const token = request.headers.get("x-upload-token");
  if (!UUID_RE.test(id) || !token || token.length > 200) return err(400, "Richiesta non valida");

  const ip = clientIp(request.headers);
  const byIp = await rateLimit(RULES.photoUploadPerIp, ip);
  if (!byIp.ok) return tooManyRequests(byIp.retryAfterSec);

  const declared = request.headers.get("content-length");
  if (!declared) return err(411, "Dimensione della richiesta mancante");
  if (Number(declared) > MAX_UPLOAD_REQUEST_BYTES) return err(413, "Upload troppo grande");

  if (!(await verifyUploadToken(id, token))) return err(403, "Link per le foto non valido o scaduto");

  const byLead = await rateLimit(RULES.photoUploadPerLead, id);
  if (!byLead.ok) return tooManyRequests(byLead.retryAfterSec);

  const type = request.headers.get("content-type") ?? "";
  if (!type.startsWith("multipart/form-data")) return err(415, "Formato richiesta non valido");

  let form: FormData;
  try {
    const raw = await readLimitedBody(request, MAX_UPLOAD_REQUEST_BYTES, UPLOAD_BODY_TIMEOUT_MS);
    form = await new Response(raw as BodyInit, { headers: { "content-type": type } }).formData();
  } catch (e) {
    if (e instanceof BodyTooLarge) return err(413, "Upload troppo grande");
    if (e instanceof BodyTimeout) return err(408, "Upload troppo lento, riprova");
    return err(400, "Upload non valido");
  }

  const files = form.getAll("photos");
  const ids = form.getAll("photoIds").map(String);
  if (files.length === 0) return err(400, "Nessuna foto");
  if (files.length > MAX_FILES_PER_REQUEST) return err(400, `Massimo ${MAX_FILES_PER_REQUEST} foto per invio`);
  if (ids.length !== files.length || ids.some((x) => !UUID_RE.test(x)) || new Set(ids).size !== ids.length) {
    return err(400, "Identificativi foto non validi");
  }

  const items: PhotoItem[] = [];
  const early: { clientPhotoId: string; status: "invalid"; message: string }[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (!(f instanceof File) || f.size === 0) {
      early.push({ clientPhotoId: ids[i], status: "invalid", message: "File vuoto o non valido" });
    } else if (f.size > MAX_PHOTO_BYTES) {
      early.push({ clientPhotoId: ids[i], status: "invalid", message: "Foto troppo pesante (max 4 MB)" });
    } else {
      items.push({ clientPhotoId: ids[i], data: Buffer.from(await f.arrayBuffer()) });
    }
  }

  try {
    const results = [...early, ...(await savePhotos(id, items))];
    const saved = results.filter((r) => r.status === "saved" || r.status === "duplicate").length;
    return NextResponse.json({ results, saved, rejected: results.length - saved });
  } catch (e) {
    logError("api/photos", e);
    return err(500, "Errore durante il caricamento, riprova");
  }
}
