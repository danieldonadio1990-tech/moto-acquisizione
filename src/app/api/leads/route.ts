import { NextResponse } from "next/server";
import { leadSubmissionSchema } from "@/modules/leads/validation";
import { BusinessRuleError, createLead, findExistingLead } from "@/modules/leads/service";
import { readLimitedBody, BodyTimeout, BodyTooLarge } from "@/lib/body";
import { clientIp, rateLimit, RULES, tooManyRequests } from "@/lib/rate-limit";
import { logError } from "@/lib/log";
import { notifyNewLead } from "@/modules/notifications/new-lead";
import { checkFormToken, formTokenRequired } from "@/modules/leads/form-token";
import { evaluateLeadOnCreate } from "@/modules/valuation/service";

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
    // Notifica email DOPO il salvataggio. Non lancia eccezioni e non cambia la risposta: se l'email non parte
    // il lead è comunque salvato e la notifica viene ritentata (retry del browser o back office).
    // Un retry dello stesso invio (duplicate) riprova solo se la notifica non risulta già inviata.
    await notifyNewLead(lead.id).catch(() => {});
    // Prima valutazione, calcolata sul server da dati del database. Non lancia mai eccezioni: se il motore non ha dati
    // sufficienti (o non è abilitato) il cliente riceve «verifica manuale». Un retry restituisce la valutazione già salvata.
    const valuation = await evaluateLeadOnCreate(lead.id);
    return NextResponse.json(
      { id: lead.id, code: lead.code, uploadToken: lead.uploadToken, valuation },
      { status: lead.duplicate ? 200 : 201 },
    );
  } catch (err) {
    if (err instanceof BusinessRuleError) return NextResponse.json({ error: err.message }, { status: 422 });
    logError("api/leads", err);
    return NextResponse.json({ error: "Non siamo riusciti a salvare la richiesta. Riprova." }, { status: 500 });
  }
}

const TOKEN_MESSAGES: Record<string, string> = {
  missing: "Richiesta non valida. Ricarica la pagina e riprova.",
  invalid: "Richiesta non valida. Ricarica la pagina e riprova.",
  expired: "La pagina è rimasta aperta a lungo. Riprova: la richiesta viene rinnovata.",
  too_fast: "Un attimo di pazienza, riprova tra qualche secondo.",
};

/**
 * Controlli anti-abuso, in ordine dal più economico. Un retry dello stesso invio non viene mai bloccato.
 * I limiti stretti riguardano il CONTATTO (stesso telefono o stessa email), non la rete: dietro lo stesso IP
 * (ufficio, rete mobile condivisa) i clienti veri non si danneggiano a vicenda.
 * Tutti i contatori sono condivisi tra le istanze (database), con ripiego in memoria se il database non risponde.
 */
async function createLeadLimited(request: Request, data: Parameters<typeof createLead>[0]) {
  const existing = await findExistingLead(data.submissionId);
  if (existing) return existing; // retry: mai bloccato dal rate limit

  if (formTokenRequired()) {
    const check = checkFormToken(data.formToken);
    if (!check.ok) {
      return NextResponse.json({ error: TOKEN_MESSAGES[check.reason], reason: `form_token_${check.reason}` }, { status: 422 });
    }
    const byToken = await rateLimit(RULES.leadCreatePerFormToken, check.nonce);
    if (!byToken.ok) {
      return NextResponse.json(
        { error: "Richiesta non valida. Ricarica la pagina e riprova.", reason: "form_token_invalid" },
        { status: 422 },
      );
    }
  }

  const byIp = await rateLimit(RULES.leadCreatePerIp, clientIp(request.headers));
  if (!byIp.ok) return tooManyRequests(byIp.retryAfterSec, "Hai inviato troppe richieste. Riprova più tardi.");

  const byPhone = await rateLimit(RULES.leadCreatePerPhone, data.contact.phone);
  const byEmail = await rateLimit(RULES.leadCreatePerEmail, data.contact.email);
  if (!byPhone.ok || !byEmail.ok) {
    return tooManyRequests(
      Math.max(byPhone.ok ? 0 : byPhone.retryAfterSec, byEmail.ok ? 0 : byEmail.retryAfterSec),
      "Abbiamo già ricevuto alcune richieste con questi contatti. Ti ricontatteremo: se hai un'altra moto, riprova domani.",
    );
  }
  return createLead(data);
}
