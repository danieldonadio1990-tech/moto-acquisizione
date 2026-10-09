import { NextResponse, type NextRequest } from "next/server";
import { readSession, SESSION_COOKIE } from "@/modules/admin/session";

/**
 * Controllo ottimistico sulle rotte admin (redirect al login).
 * L'autorizzazione vera è ripetuta lato server in ogni pagina/azione (requireAdmin).
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/admin/login") return NextResponse.next();

  const cookie = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await readSession(cookie);
  if (session) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sessione scaduta: accedi di nuovo" }, { status: 401 });
  }
  const url = new URL("/admin/login", request.url);
  if (cookie) url.searchParams.set("scaduta", "1");
  const res = NextResponse.redirect(url);
  if (cookie) res.cookies.delete(SESSION_COOKIE);
  return res;
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
