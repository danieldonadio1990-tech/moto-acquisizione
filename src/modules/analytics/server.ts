import "server-only";
import { getDb } from "@/db/client";
import { events } from "@/db/schema";
import type { EventName } from "./events";

/** Registra un evento. Non deve mai far fallire la richiesta principale. */
export async function recordEvent(
  name: EventName,
  opts: { sessionId?: string | null; leadId?: string | null; props?: Record<string, unknown> } = {},
) {
  try {
    const db = await getDb();
    await db.insert(events).values({
      name,
      sessionId: opts.sessionId ?? null,
      leadId: opts.leadId ?? null,
      props: opts.props ?? null,
    });
  } catch (err) {
    console.error("[analytics] evento non registrato", name, err);
  }
}
