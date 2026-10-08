import "server-only";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { adminUsers } from "@/db/schema";
import { rateLimit, resetRateLimit, RULES } from "@/lib/rate-limit";
import { readSession, signSession, SESSION_COOKIE, SESSION_TTL_SECONDS, type AdminSession } from "./session";

/**
 * Controllo autorizzazione vero (il proxy fa solo un redirect ottimistico).
 * Va chiamato in OGNI pagina admin, server action e route handler admin.
 */
export async function requireAdmin(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  return session;
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const store = await cookies();
  const session = await readSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  // l'utente deve esistere ancora e la sessione non deve essere stata revocata (logout)
  const db = await getDb();
  const [user] = await db
    .select({ sv: adminUsers.sessionVersion })
    .from(adminUsers)
    .where(eq(adminUsers.email, session.email));
  return user && user.sv === session.sv ? session : null;
}

export type LoginResult = { ok: true } | { ok: false; reason: "invalid" } | { ok: false; reason: "locked"; retryAfterSec: number };

/**
 * Limiti: 8 tentativi falliti per coppia IP+email e 30 per IP ogni 15 minuti.
 * Il blocco per coppia evita che un estraneo possa bloccare l'admin vero da un altro IP.
 */
export async function login(emailRaw: string, password: string, ip: string): Promise<LoginResult> {
  const email = emailRaw.trim().toLowerCase().slice(0, 200);
  const pairKey = `${ip}|${email}`;

  const byIp = await rateLimit(RULES.loginPerIp, ip);
  const byPair = await rateLimit(RULES.loginPerIpEmail, pairKey);
  if (!byIp.ok || !byPair.ok) {
    return { ok: false, reason: "locked", retryAfterSec: Math.max(byIp.ok ? 0 : byIp.retryAfterSec, byPair.ok ? 0 : byPair.retryAfterSec) };
  }

  const db = await getDb();
  const [user] = await db.select().from(adminUsers).where(eq(adminUsers.email, email));
  // con utente inesistente si confronta comunque un hash: tempi di risposta uniformi
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!ok || !user) return { ok: false, reason: "invalid" };

  await resetRateLimit(RULES.loginPerIpEmail, pairKey);
  const token = await signSession({ email: user.email, sv: user.sessionVersion });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return { ok: true };
}

/** Logout: revoca TUTTE le sessioni di questo utente (anche cookie copiati o altri dispositivi). */
export async function logout() {
  const store = await cookies();
  const session = await readSession(store.get(SESSION_COOKIE)?.value);
  if (session) {
    const db = await getDb();
    await db
      .update(adminUsers)
      .set({ sessionVersion: sql`${adminUsers.sessionVersion} + 1` })
      .where(eq(adminUsers.email, session.email));
  }
  store.delete(SESSION_COOKIE);
}

// hash bcrypt valido di una stringa casuale, usato solo per uniformare i tempi
const DUMMY_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKcEeO5u7bJ4CC2Xk0wYIr/fq0pY5aK7c6bE.";
