import { NextResponse } from "next/server";
import { leadSubmissionSchema } from "@/modules/leads/validation";
import { createLead } from "@/modules/leads/service";

/** Crea il lead (dati moto + contatti). Le foto arrivano su /api/leads/[id]/photos. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
  }

  const parsed = leadSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dati non validi", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 422 },
    );
  }

  try {
    const lead = await createLead(parsed.data);
    return NextResponse.json(lead, { status: 201 });
  } catch (err) {
    console.error("[api/leads] errore creazione lead", err);
    return NextResponse.json({ error: "Non siamo riusciti a salvare la richiesta. Riprova." }, { status: 500 });
  }
}
