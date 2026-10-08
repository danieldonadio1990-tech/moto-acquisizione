import { NextResponse } from "next/server";
import { z } from "zod";
import { CLIENT_EVENTS } from "@/modules/analytics/events";
import { recordEvent } from "@/modules/analytics/server";

const eventSchema = z.object({
  name: z.enum(CLIENT_EVENTS),
  sessionId: z.string().max(64).optional(),
  props: z
    .record(z.string().max(40), z.union([z.string().max(200), z.number(), z.boolean()]))
    .refine((o) => Object.keys(o).length <= 10)
    .optional(),
});

export async function POST(request: Request) {
  try {
    const parsed = eventSchema.safeParse(await request.json());
    if (!parsed.success) return new NextResponse(null, { status: 400 });
    await recordEvent(parsed.data.name, { sessionId: parsed.data.sessionId, props: parsed.data.props });
    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 400 });
  }
}
