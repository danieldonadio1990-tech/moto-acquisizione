import { NextResponse } from "next/server";
import { getAdminSession } from "@/modules/admin/auth";
import { buildDataset, toCsv } from "@/modules/leads/dataset";
import { logError } from "@/lib/log";

/** Esporta il dataset del soft launch in CSV (solo admin, nessun nome/telefono/email). */
export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Sessione scaduta: accedi di nuovo" }, { status: 401 });
  try {
    const csv = toCsv(await buildDataset());
    const date = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="richieste-${date}.csv"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (err) {
    logError("export", err);
    return NextResponse.json({ error: "Esportazione non riuscita, riprova" }, { status: 500 });
  }
}
