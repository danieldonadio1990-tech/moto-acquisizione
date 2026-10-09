/**
 * Crea un utente admin o ne cambia la password (le sessioni aperte vengono revocate).
 *
 *   npm run admin:user -- nome@azienda.it
 *
 * La password viene chiesta nel terminale (non compare a schermo né nella cronologia).
 * In produzione eseguire con le stesse variabili del server (DATABASE_URL…).
 * Alternativa per il primo avvio: ADMIN_EMAIL + ADMIN_PASSWORD (da rimuovere subito dopo).
 */
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { createInterface } from "node:readline";
import { closeDb, getDb } from "@/db/client";
import { adminUsers } from "@/db/schema";

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    let muted = false;
    out._writeToOutput = (s: string) => {
      if (!muted) out.output.write(s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    muted = true;
  });
}

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error("Uso: npm run admin:user -- nome@azienda.it");
    process.exitCode = 2;
    return;
  }
  const password = process.env.ADMIN_USER_PASSWORD ?? (await askHidden("Nuova password (min 12 caratteri): "));
  if (password.length < 12) {
    console.error("✗ Password troppo corta (minimo 12 caratteri)");
    process.exitCode = 2;
    return;
  }
  const db = await getDb();
  const hash = await bcrypt.hash(password, 12);
  const [existing] = await db.select({ id: adminUsers.id }).from(adminUsers).where(eq(adminUsers.email, email));
  if (existing) {
    await db
      .update(adminUsers)
      .set({ passwordHash: hash, sessionVersion: sql`${adminUsers.sessionVersion} + 1` })
      .where(eq(adminUsers.id, existing.id));
    console.log(`✓ Password aggiornata per ${email} (sessioni aperte revocate)`);
  } else {
    await db.insert(adminUsers).values({ email, passwordHash: hash });
    console.log(`✓ Creato utente admin ${email}`);
  }
}

main()
  .catch((err) => {
    console.error("✗ Errore:", err instanceof Error ? err.message.split("\nparams")[0] : err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
