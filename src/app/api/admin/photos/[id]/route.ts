import { NextResponse } from "next/server";
import { getAdminSession } from "@/modules/admin/auth";
import { getPhotoForAdmin } from "@/modules/leads/service";

/** Foto dei lead: visibili solo agli admin autenticati, mai in cache pubblica. */
export async function GET(_request: Request, ctx: RouteContext<"/api/admin/photos/[id]">) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse(null, { status: 404 });

  const photo = await getPhotoForAdmin(id);
  if (!photo) return new NextResponse(null, { status: 404 });

  return new NextResponse(new Uint8Array(photo.data), {
    headers: {
      "content-type": photo.mimeType,
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
}
