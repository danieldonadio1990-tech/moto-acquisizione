import { NextResponse } from "next/server";
import { addPhotosWithToken, UploadAuthError } from "@/modules/leads/service";
import { MAX_PHOTO_BYTES, MAX_PHOTOS_PER_LEAD } from "@/modules/photos/process";

const UUID_RE = /^[0-9a-f-]{36}$/i;

/** Upload foto (multipart, campo "photos") autorizzato dal token ricevuto alla creazione del lead. */
export async function POST(request: Request, ctx: RouteContext<"/api/leads/[id]/photos">) {
  const { id } = await ctx.params;
  const token = request.headers.get("x-upload-token");
  if (!UUID_RE.test(id) || !token) {
    return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
  }

  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_PHOTO_BYTES * MAX_PHOTOS_PER_LEAD) {
    return NextResponse.json({ error: "Upload troppo grande" }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Upload non valido" }, { status: 400 });
  }
  const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return NextResponse.json({ error: "Nessuna foto" }, { status: 400 });

  const buffers = await Promise.all(files.map(async (f) => Buffer.from(await f.arrayBuffer())));

  try {
    const result = await addPhotosWithToken(id, token, buffers);
    return NextResponse.json(result, { status: result.saved > 0 ? 201 : 422 });
  } catch (err) {
    if (err instanceof UploadAuthError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("[api/photos] errore upload", err);
    return NextResponse.json({ error: "Errore durante il caricamento" }, { status: 500 });
  }
}
