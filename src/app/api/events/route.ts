import { NextResponse } from "next/server";
import { z } from "zod";
import { CLIENT_EVENTS } from "@/modules/analytics/events";
import { recordEvent } from "@/modules/analytics/server";
import { readLimitedBody } from "@/lib/body";
import { clientIp, rateLimit, RULES } from "@/lib/rate-limit";

/** Solo proprietà note e brevi: niente testo libero, quindi niente dati personali negli eventi. */
const eventSchema = z.object({
  name: z.enum(CLIENT_EVENTS),
  sessionId: z.string().uuid().optional(),
  props: z
    .object({
      label: z.enum(["hero", "sticky", "footer"]).optional(),
      step: z.enum(["Moto", "Km", "Condizioni", "Contatti", "Foto"]).optional(),
      count: z.number().int().min(0).max(12).optional(),
      from: z.enum(["done"]).optional(),
    })
    .strict()
    .optional(),
});

export async function POST(request: Request) {
  const rl = await rateLimit(RULES.eventsPerIp, clientIp(request.headers));
  if (!rl.ok) return new NextResponse(null, { status: 429 });
  try {
    const raw = await readLimitedBody(request, 2048, 5000);
    const parsed = eventSchema.safeParse(JSON.parse(new TextDecoder().decode(raw)));
    if (!parsed.success) return new NextResponse(null, { status: 400 });
    await recordEvent(parsed.data.name, { sessionId: parsed.data.sessionId, props: parsed.data.props });
    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 400 });
  }
}
