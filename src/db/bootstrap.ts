import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import type { Db } from "./client";
import { adminUsers, buyBoxRules } from "./schema";
import { DEFAULT_BUY_BOX_RULES } from "@/modules/buybox/defaults";

/**
 * Dati iniziali, idempotenti:
 * - regole Buy Box di partenza (solo se la tabella è vuota)
 * - primo utente admin da ADMIN_EMAIL / ADMIN_PASSWORD (solo se non esiste nessun admin)
 */
export async function bootstrap(db: Db) {
  const [{ count: rules }] = await db.select({ count: sql<number>`count(*)::int` }).from(buyBoxRules);
  if (rules === 0) {
    await db.insert(buyBoxRules).values(DEFAULT_BUY_BOX_RULES);
  }

  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (email && password) {
    const [{ count: admins }] = await db.select({ count: sql<number>`count(*)::int` }).from(adminUsers);
    if (admins === 0) {
      if (password.length < 10) {
        console.warn("[bootstrap] ADMIN_PASSWORD troppo corta (min 10 caratteri): admin non creato.");
      } else {
        await db.insert(adminUsers).values({ email, passwordHash: await bcrypt.hash(password, 12) });
        console.info(`[bootstrap] Creato utente admin ${email}`);
      }
    }
  }
}
