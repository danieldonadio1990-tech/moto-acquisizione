import { NextResponse } from "next/server";
import { getAdminSession } from "@/modules/admin/auth";
import { runUploadCheck } from "@/modules/photos/diagnostics";
import { logError } from "@/lib/log";

/** Tempo massimo della funzione (secondi) sugli hosting serverless */
export const maxDuration = 60;

/**
 * Controllo dell'upload foto dentro il sito pubblicato. SOLO amministratori. Si apre da browser, già connessi al back office:
 *   /api/admin/storage-check
 * Scrive e cancella un solo oggetto di prova («healthcheck/…»); non tocca foto né dati dei clienti; non restituisce chiavi.
 */
export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  try {
    const result = await runUploadCheck();
    return NextResponse.json(result, { status: result.ok ? 200 : 502, headers: { "cache-control": "no-store" } });
  } catch (err) {
    logError("api/admin/storage-check", err);
    return NextResponse.json({ ok: false, error: "Controllo non eseguibile (vedi i log)" }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
