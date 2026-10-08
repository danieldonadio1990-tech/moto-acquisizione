import { NextResponse, type NextRequest } from "next/server";
import { readSession, SESSION_COOKIE } from "@/modules/admin/session";

/**
 * Controllo ottimistico sulle rotte admin (redirect al login).
 * L'autorizzazione vera è ripetuta lato server in ogni pagina/azione (requireAdmin).
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/admin/login") return NextResponse.next();

  const session = await readSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/admin/login", request.url));
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
