/**
 * Cancellazione dei dati personali di una persona.
 *
 *   npm run privacy:erase -- --email mario@example.com          (anteprima, non cancella nulla)
 *   npm run privacy:erase -- --email mario@example.com --yes    (cancella)
 *
 * Criteri (combinabili, in OR): --email  --phone  --code  --lead
 *
 * In SVILUPPO con il database integrato: fermare prima `npm run dev`
 * (il database locale può essere aperto da un solo processo alla volta).
 * In PRODUZIONE: eseguire con le stesse variabili d'ambiente del server (DATABASE_URL, storage…).
 */
import { closeDb } from "@/db/client";
import { eraseSubjects, findSubjects, type ErasureQuery } from "@/modules/privacy/erasure";

function parseArgs(argv: string[]) {
  const q: ErasureQuery = {};
  let yes = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = argv[i + 1];
    if (a === "--yes") yes = true;
    else if (["--email", "--phone", "--code", "--lead"].includes(a)) {
      if (!v || v.startsWith("--")) throw new Error(`Manca il valore dopo ${a}`);
      const key = ({ "--email": "email", "--phone": "phone", "--code": "code", "--lead": "leadId" } as const)[
        a as "--email" | "--phone" | "--code" | "--lead"
      ];
      q[key] = v;
      i++;
    } else throw new Error(`Argomento sconosciuto: ${a}`);
  }
  return { q, yes };
}

async function main() {
  const { q, yes } = parseArgs(process.argv.slice(2));
  if (!q.email && !q.phone && !q.code && !q.leadId) {
    console.error("Indica almeno un criterio: --email, --phone, --code o --lead");
    process.exitCode = 2;
    return;
  }
  const found = await findSubjects(q);
  if (found.length === 0) {
    console.log("Nessun dato trovato con questi criteri.");
    return;
  }
  console.log(`Trovate ${found.length} richieste:`);
  for (const s of found) {
    console.log(
      `  - ${s.code}  ${s.createdAt.toISOString().slice(0, 10)}  ${s.name}  ${s.email}  ${s.phone}  ${s.motorcycle}  stato=${s.status}  foto=${s.photos}`,
    );
  }
  if (!yes) {
    console.log("\nAnteprima: nulla è stato cancellato. Ripeti con --yes per cancellare definitivamente.");
    return;
  }
  const reports = await eraseSubjects(found.map((s) => s.leadId));
  for (const r of reports) {
    console.log(`Cancellata ${r.code}: ${r.storageObjectsDeleted} file foto rimossi, ${r.eventsAnonymized} eventi anonimizzati`);
  }
  console.log(`\nFatto. ${reports.length} richieste cancellate (dati cliente, moto, foto, offerte, storico, acquisto).`);
  console.log("Annota data e codice richiesta nel registro delle richieste privacy (senza dati personali).");
}

main()
  .catch((err) => {
    console.error("Errore:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
