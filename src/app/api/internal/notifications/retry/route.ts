import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { clientIp, rateLimit, RULES, tooManyRequests } from "@/lib/rate-limit";
import { logError } from "@/lib/log";
import { loadRetryToken } from "@/modules/notifications/config";
import { countUnsentNotifications, retryNotificationsBatch } from "@/modules/notifications/new-lead";

/** Quante notifiche recuperabili si riprovano a ogni chiamata (le altre al giro successivo) */
const BATCH_LIMIT = 10;

export const maxDuration = 30;

const noStore = { "cache-control": "private, no-store" };
const sha = (v: string) => createHash("sha256").update(v).digest();

/** Confronto a tempo costante (si confrontano gli hash, così la lunghezza non trapela). */
function sameToken(provided: string, expected: string) {
  return timingSafeEqual(sha(provided), sha(expected));
}

/**
 * Recupero automatico delle notifiche email in sospeso. Chiamata da un workflow pianificato di GitHub Actions
 * (.github/workflows/notify-retry.yml), mai dal browser.
 *
 * Protezione: intestazione `Authorization: Bearer <NOTIFY_RETRY_TOKEN>` (mai nell'URL, mai nei log).
 *  - NOTIFY_RETRY_TOKEN assente o corto → 404, nessuna elaborazione (recupero automatico non attivo);
 *  - token assente o errato → 401;
 *  - troppi tentativi dallo stesso IP → 429.
 * Il corpo della richiesta non viene letto. La risposta contiene solo conteggi (nessun id, codice o dato personale).
 * Le esecuzioni sovrapposte sono sicure: ogni richiesta passa dalla prenotazione atomica (vedi new-lead.ts).
 */
export async function POST(request: Request) {
  const expected = loadRetryToken();
  if (!expected) return new NextResponse(null, { status: 404 });

  const rl = await rateLimit(RULES.notifyRetryPerIp, clientIp(request.headers));
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  const match = /^Bearer ([\x21-\x7e]+)$/i.exec(request.headers.get("authorization") ?? "");
  if (!match || !sameToken(match[1], expected)) {
    return NextResponse.json(
      { error: "Non autorizzato" },
      { status: 401, headers: { ...noStore, "www-authenticate": "Bearer" } },
    );
  }

  try {
    const batch = await retryNotificationsBatch(BATCH_LIMIT);
    if (batch.error) return NextResponse.json({ error: "Recupero non riuscito" }, { status: 503, headers: noStore });
    const unsent = await countUnsentNotifications();
    const { configured, candidates, sent, failed, throttled, notClaimed } = batch;
    return NextResponse.json({ configured, candidates, sent, failed, throttled, notClaimed, unsent }, { headers: noStore });
  } catch (err) {
    logError("api/notifications/retry", err);
    return NextResponse.json({ error: "Recupero non riuscito" }, { status: 503, headers: noStore });
  }
}
