import { SignJWT, jwtVerify } from "jose";

/** Sessione admin firmata (JWT HS256) in cookie httpOnly. Usabile sia nel proxy che nel server. */
export const SESSION_COOKIE = "admin_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error("SESSION_SECRET mancante o troppo corta (min 32 caratteri)");
  }
  return new TextEncoder().encode(s);
}

export type AdminSession = { email: string };

export async function signSession(session: AdminSession) {
  return new SignJWT({ email: session.email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret());
}

export async function readSession(token: string | undefined): Promise<AdminSession | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return typeof payload.email === "string" ? { email: payload.email } : null;
  } catch {
    return null;
  }
}
