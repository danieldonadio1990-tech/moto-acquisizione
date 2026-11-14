import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { clientIp, rateLimit, RULES, tooManyRequests } from "@/lib/rate-limit";
import { logError } from "@/lib/log";
import { loadPhotoCleanupToken, purgeExpiredPhotos } from "@/modules/photos/retention";

export const maxDuration = 30;

const noStore = { "cache-control": "private, no-store" };
const sha = (v: string) => createHash("sha256").update(v).digest();

/** Confronto a tempo costante (si confrontano gli hash, così la lunghezza non trapela). */
function sameToken(provided: string, expected: string) {
  return timingSafeEqual(sha(provided), sha(expected));
}

/**
 * Cancellazione automatica delle foto più vecchie di 15 giorni. Chiamata da un workflow pianificato di GitHub
 * Actions (.github/workflows/photo-cleanup.yml), mai dal browser. Idempotente: una foto già cancellata non
 * compare più tra le candidate al giro successivo; le foto non ancora cancellate (errore transitorio) vengono
 * semplicemente riprovate.
 *
 * Protezione: intestazione `Authorization: Bearer <PHOTO_CLEANUP_TOKEN>` (mai nell'URL, mai nei log).
 *  - PHOTO_CLEANUP_TOKEN assente o corto → 404, nessuna elaborazione (pulizia automatica non attiva);
 *  - token assente o errato → 401;
 *  - troppi tentativi dallo stesso IP → 429.
 * Il corpo della richiesta non viene letto. La risposta contiene solo conteggi (nessun id, codice o dato personale).
 */
export async function POST(request: Request) {
  const expected = loadPhotoCleanupToken();
  if (!expected) return new NextResponse(null, { status: 404 });

  const rl = await rateLimit(RULES.photoCleanupPerIp, clientIp(request.headers));
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  const match = /^Bearer ([\x21-\x7e]+)$/i.exec(request.headers.get("authorization") ?? "");
  if (!match || !sameToken(match[1], expected)) {
    return NextResponse.json(
      { error: "Non autorizzato" },
      { status: 401, headers: { ...noStore, "www-authenticate": "Bearer" } },
    );
  }

  try {
    const { checked, deleted, failed } = await purgeExpiredPhotos();
    return NextResponse.json({ checked, deleted, failed }, { headers: noStore });
  } catch (err) {
    logError("api/photos/cleanup", err);
    return NextResponse.json({ error: "Pulizia non riuscita" }, { status: 503, headers: noStore });
  }
}
