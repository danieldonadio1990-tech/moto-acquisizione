import { NextResponse } from "next/server";
import { clientIp, rateLimit, RULES, tooManyRequests } from "@/lib/rate-limit";
import { issueFormToken } from "@/modules/leads/form-token";

/** Gettone anti-bot del modulo (vedi src/modules/leads/form-token.ts). Nessun dato personale, nessun cookie. */
export async function GET(request: Request) {
  const rl = await rateLimit(RULES.formTokenPerIp, clientIp(request.headers));
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec, "Troppe richieste. Riprova tra qualche minuto.");
  return NextResponse.json({ token: issueFormToken() }, { headers: { "cache-control": "private, no-store" } });
}
