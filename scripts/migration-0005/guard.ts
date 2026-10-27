/**
 * Migrazione 0005 con verifica del BERSAGLIO, da lanciare dal proprio PC:
 *
 *   npm run migrate:0005 -- check                      sola lettura: mostra su quale database sta per operare e il pre-controllo
 *   npm run migrate:0005 -- apply --confirm=<codice>   applica la migrazione, solo se il pre-controllo è verde e il codice coincide
 *
 * Legge SOLO DATABASE_URL_DIRECT (mai DATABASE_URL, mai .env.local: un URL dimenticato lì non può essere usato per errore).
 * Non stampa mai l'URL né la password: mostra database, ruolo, indirizzo parzialmente oculto e un'«impronta» di 8 caratteri.
 * `check` e `apply` mostrano la stessa impronta: il codice per `--confirm` si copia dall'output di `check`, così non si può
 * confermare un bersaglio che non si è prima guardato. Rifiuta gli indirizzi del pooler (il lock delle migrazioni non vi funziona).
 * Il pre-controllo è lo stesso `pre-check.sql` (sola lettura) usato nell'SQL Editor, eseguito con lo STESSO indirizzo della migrazione
 * (connessioni separate: il pre-controllo, poi la migrazione sotto lock e transazione unica, poi il post-controllo).
 *
 * LIMITE: l'impronta nasce dall'indirizzo che fornisci (host, porta, database, ruolo): protegge da errori di battitura e da sessioni
 * dimenticate, NON dimostra che l'indirizzo sia quello di produzione. Quel controllo è tuo: confronta host oculto e database con la console Neon.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { redact } from "@/lib/log";
import { runPostgresMigrations } from "@/db/client";

type Row = { n: number | string; controllo: string; ok: boolean; dettaglio: string };

let knownHost = "";
const hideHost = (text: string) => (knownHost ? text.split(knownHost).join(maskHost(knownHost)) : text);

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

export function maskHost(host: string): string {
  const [first, ...rest] = host.split(".");
  const label = first.length > 10 ? `${first.slice(0, 6)}…${first.slice(-4)}` : `${first.slice(0, 2)}…`;
  return rest.length ? `${label}.${rest.join(".")}` : label;
}

export function fingerprint(host: string, port: string, db: string, user: string): string {
  return createHash("sha256").update(`${host}\n${port}\n${db}\n${user}`).digest("hex").slice(0, 8);
}

/**
 * I controlli girano SEMPRE in una transazione di sola lettura imposta dal database: anche se un file SQL venisse modificato
 * per errore, una scrittura verrebbe rifiutata da PostgreSQL ("read-only transaction").
 */
async function readOnly(sql: postgres.Sql, file: string): Promise<Row[]> {
  // MIGRATION_SQL_DIR serve solo ai test (dimostrano che anche un file SQL modificato non può scrivere); di norma è la cartella del repository
  const dir = process.env.MIGRATION_SQL_DIR?.trim() || "scripts/migration-0005";
  const text = readFileSync(path.resolve(process.cwd(), dir, file), "utf8");
  const rows = await sql.begin("read only", async (tx) => {
    // un blocco esclusivo tenuto da un'altra sessione non deve far restare il controllo appeso
    await tx`set local lock_timeout = '5s'`;
    await tx`set local statement_timeout = '30s'`;
    return tx.unsafe(text);
  });
  return rows as unknown as Row[];
}

function table(rows: Row[]) {
  const w = Math.max(...rows.map((r) => r.controllo.length));
  for (const r of rows) console.log(`${String(r.n).padStart(2)}  ${r.ok ? "OK  " : "NO  "} ${r.controllo.padEnd(w)}  ${r.dettaglio ?? ""}`);
}

async function main() {
  const mode = process.argv[2];
  if (mode !== "check" && mode !== "apply") fail("uso: npm run migrate:0005 -- check | apply --confirm=<codice>");
  const raw = process.env.DATABASE_URL_DIRECT?.trim();
  if (!raw) fail("DATABASE_URL_DIRECT mancante. Impostala solo nella sessione del terminale (questo script non usa DATABASE_URL né .env.local).");
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    fail("DATABASE_URL_DIRECT non è un indirizzo valido.");
  }
  if (!/^postgres(ql)?:$/.test(u.protocol)) fail("DATABASE_URL_DIRECT deve iniziare con postgres:// o postgresql://");
  const host = u.hostname;
  knownHost = host;
  const db = decodeURIComponent(u.pathname.replace(/^\//, ""));
  const user = decodeURIComponent(u.username);
  if (!db) fail("DATABASE_URL_DIRECT non indica il nome del database.");
  if (/pooler/i.test(host) || u.port === "6543") fail("L'indirizzo è quello di un pooler (nome con «pooler» o porta 6543): serve la stringa DIRETTA.");
  const fp = fingerprint(host, u.port || "5432", db, user);
  const code = `${db}:${fp}`;

  if (mode === "apply") {
    const given = process.argv.find((a) => a.startsWith("--confirm="))?.slice("--confirm=".length);
    if (!given) fail(`apply richiede --confirm=<codice>: esegui prima «check» e copia il codice dal suo output.`);
    if (given !== code) fail("Il codice di conferma non corrisponde a questo bersaglio: non viene applicato nulla.");
  }

  console.log(`Bersaglio: host ${maskHost(host)} · database «${db}» · ruolo «${user}»`);
  console.log(`Impronta del bersaglio: ${fp}`);

  const sql = postgres(raw, { max: 1, prepare: false, connect_timeout: 15, onnotice: () => {} });
  try {
    const [who] = await sql<{ db: string; usr: string; v: string }[]>`select current_database() as db, current_user as usr, current_setting('server_version') as v`;
    if (who.db !== db) fail("Il database raggiunto non corrisponde a quello indicato nell'indirizzo.");
    console.log(`Connesso: PostgreSQL ${who.v}`);
    const preRows = await readOnly(sql, "pre-check.sql");
    console.log("\nPre-controllo (sola lettura):");
    table(preRows);
    const preOk = preRows.find((r) => Number(r.n) === 99)?.ok === true;
    if (mode === "check") {
      console.log(preOk ? `\n✓ Pre-controllo superato. Per applicare: npm run migrate:0005 -- apply --confirm=${code}` : "\n✗ Pre-controllo NON superato: non migrare (vedi docs/MIGRAZIONE-0005.md).");
      process.exitCode = preOk ? 0 : 1;
      return;
    }
    if (!preOk) fail("Pre-controllo NON superato: nessuna migrazione applicata.");
  } finally {
    await sql.end({ timeout: 5 });
  }

  await runPostgresMigrations(raw);
  console.log("\n✓ Migrazioni applicate");
  const sql2 = postgres(raw, { max: 1, prepare: false, connect_timeout: 15, onnotice: () => {} });
  try {
    const post = await readOnly(sql2, "post-check.sql");
    console.log("\nPost-controllo (sola lettura):");
    table(post);
    const ok = post.find((r) => Number(r.n) === 98)?.ok === true;
    console.log(ok ? "\n✓ ESITO MIGRAZIONE positivo" : "\n✗ ESITO MIGRAZIONE negativo: non fare il merge, vedi «Rollback» nel manuale.");
    process.exitCode = ok ? 0 : 1;
  } finally {
    await sql2.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(`✗ ${hideHost(redact(err instanceof Error ? err.message.split("\nparams")[0] : String(err))).slice(0, 300)}`);
  process.exit(1);
});
