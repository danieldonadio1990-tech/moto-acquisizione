import { NextResponse } from "next/server";
import { leadSubmissionSchema } from "@/modules/leads/validation";
import { BusinessRuleError, createLead, findExistingLead } from "@/modules/leads/service";
import { readLimitedBody, BodyTimeout, BodyTooLarge } from "@/lib/body";
import { clientIp, rateLimit, RULES, tooManyRequests } from "@/lib/rate-limit";
import { logError } from "@/lib/log";

/**
 * Crea il lead (dati moto + contatti). Idempotente sul campo submissionId:
 * ripetere la stessa richiesta restituisce lo stesso lead (200) invece di crearne un altro (201).
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    const raw = await readLimitedBody(request, 32 * 1024, 15_000);
    body = JSON.parse(new TextDecoder().decode(raw));
  } catch (e) {
    if (e instanceof BodyTooLarge) return NextResponse.json({ error: "Richiesta troppo grande" }, { status: 413 });
    if (e instanceof BodyTimeout) return NextResponse.json({ error: "Richiesta troppo lenta" }, { status: 408 });
    return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
  }

  const parsed = leadSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dati non validi", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 422 },
    );
  }

  // il rate limit conta solo i tentativi validi: un retry dello stesso invio non penalizza il cliente
  try {
    const lead = await createLeadLimited(request, parsed.data);
    if (lead instanceof Response) return lead;
    return NextResponse.json(
      { id: lead.id, code: lead.code, uploadToken: lead.uploadToken },
      { status: lead.duplicate ? 200 : 201 },
    );
  } catch (err) {
    if (err instanceof BusinessRuleError) return NextResponse.json({ error: err.message }, { status: 422 });
    logError("api/leads", err);
    return NextResponse.json({ error: "Non siamo riusciti a salvare la richiesta. Riprova." }, { status: 500 });
  }
}

async function createLeadLimited(request: Request, data: Parameters<typeof createLead>[0]) {
  const existing = await findExistingLead(data.submissionId);
  if (existing) return existing; // retry: mai bloccato dal rate limit
  const rl = await rateLimit(RULES.leadCreatePerIp, clientIp(request.headers));
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec, "Hai inviato troppe richieste. Riprova più tardi o scrivici su WhatsApp.");
  return createLead(data);
}
