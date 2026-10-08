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
  const [{ count: admins }] = await db.select({ count: sql<number>`count(*)::int` }).from(adminUsers);

  if (admins === 0 && email && password) {
    if (password.length < 12) {
      console.warn("[bootstrap] ADMIN_PASSWORD troppo corta (minimo 12 caratteri): admin non creato.");
    } else {
      await db.insert(adminUsers).values({ email, passwordHash: await bcrypt.hash(password, 12) });
      console.info("[bootstrap] Creato il primo utente admin. Ora RIMUOVI ADMIN_PASSWORD dalle variabili d'ambiente.");
    }
  } else if (admins > 0 && password) {
    // la password serve solo alla prima creazione: lasciarla nelle variabili è un rischio inutile
    console.warn(
      "[sicurezza] ADMIN_PASSWORD è ancora impostata ma l'admin esiste già: rimuovila dalle variabili d'ambiente (non viene più usata).",
    );
  } else if (admins === 0) {
    console.warn("[bootstrap] Nessun admin: imposta ADMIN_EMAIL e ADMIN_PASSWORD per crearne uno al prossimo avvio.");
  }
}
