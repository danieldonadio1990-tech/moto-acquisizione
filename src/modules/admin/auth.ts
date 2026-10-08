import "server-only";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { adminUsers } from "@/db/schema";
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
  // l'utente deve esistere ancora (revoca accesso = cancellare la riga)
  const db = await getDb();
  const [user] = await db.select({ id: adminUsers.id }).from(adminUsers).where(eq(adminUsers.email, session.email));
  return user ? session : null;
}

// Limite tentativi di login in memoria (sufficiente per un'istanza singola MVP)
const attempts = new Map<string, { count: number; first: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

export async function login(emailRaw: string, password: string): Promise<boolean> {
  const email = emailRaw.trim().toLowerCase();
  const now = Date.now();
  const a = attempts.get(email);
  if (a && now - a.first < WINDOW_MS && a.count >= MAX_ATTEMPTS) return false;

  const db = await getDb();
  const [user] = await db.select().from(adminUsers).where(eq(adminUsers.email, email));
  const ok = user ? await bcrypt.compare(password, user.passwordHash) : await bcrypt.compare(password, DUMMY_HASH);

  if (!ok || !user) {
    if (!a || now - a.first >= WINDOW_MS) attempts.set(email, { count: 1, first: now });
    else a.count++;
    return false;
  }
  attempts.delete(email);

  const token = await signSession({ email: user.email });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return true;
}

export async function logout() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

// hash fittizio per tempi di risposta uniformi quando l'utente non esiste
const DUMMY_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKcEeO5u7bJ4CC2Xk0wYIr/fq0pY5aK7c6bE.";
