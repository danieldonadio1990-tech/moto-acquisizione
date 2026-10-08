import "server-only";
import { getDb } from "@/db/client";
import { events } from "@/db/schema";
import { logError } from "@/lib/log";
import type { EventName } from "./events";

/**
 * Registra un evento statistico. Non deve mai far fallire la richiesta principale.
 * Regola privacy: gli eventi di navigazione (sessionId anonimo) non vengono MAI collegati a un lead;
 * "lead_created" ha il leadId ma nessun sessionId. Così non si ricostruisce il percorso di una persona.
 */
export async function recordEvent(
  name: EventName,
  opts: { sessionId?: string | null; leadId?: string | null; props?: Record<string, unknown> } = {},
) {
  try {
    const db = await getDb();
    await db.insert(events).values({
      name,
      sessionId: opts.leadId ? null : (opts.sessionId ?? null),
      leadId: opts.leadId ?? null,
      props: opts.props ?? null,
    });
  } catch (err) {
    logError("analytics", err);
  }
}
