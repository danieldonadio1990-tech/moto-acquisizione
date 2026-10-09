"use client";
import { useEffect, useRef, useState } from "react";
import { StepTitle } from "../ui";
import { MAX_PHOTO_BYTES, MAX_PHOTOS_PER_LEAD } from "@/modules/photos/limits";

const SUGGESTED = ["Davanti", "Dietro", "Lato destro", "Lato sinistro", "Cruscotto con i km", "Eventuali danni"];
export const MAX_PHOTOS = MAX_PHOTOS_PER_LEAD;

/** id = identificativo stabile della foto, usato dal server per evitare duplicati nei retry */
export type PickedPhoto = { id: string; file: Blob; url: string; state: "pending" | "saved" | "invalid"; message?: string };

/**
 * Ridimensiona nel browser (max 1800 px, JPEG): upload più veloce anche in 4G e sotto i limiti
 * dell'hosting. Se la foto resta troppo pesante riprova con qualità e dimensione minori.
 */
async function compress(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    let out: Blob | null = null;
    for (const [side, quality] of [
      [1800, 0.85],
      [1600, 0.75],
      [1280, 0.7],
    ] as const) {
      const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      out = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
      if (out && out.size <= MAX_PHOTO_BYTES) break;
    }
    bitmap.close();
    return out ?? file;
  } catch {
    return file; // formato che il browser non sa leggere: decide il server
  }
}

export function PhotoStep({
  photos,
  setPhotos,
  error,
}: {
  photos: PickedPhoto[];
  setPhotos: (fn: (p: PickedPhoto[]) => PickedPhoto[]) => void;
  error?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  async function onPick(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    const room = MAX_PHOTOS - photos.length;
    const picked = Array.from(files)
      .filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name))
      .slice(0, room);
    const out: PickedPhoto[] = [];
    for (const f of picked) {
      const blob = await compress(f);
      const tooBig = blob.size > MAX_PHOTO_BYTES;
      out.push({
        id: crypto.randomUUID(),
        file: blob,
        url: URL.createObjectURL(blob),
        state: tooBig ? "invalid" : "pending",
        message: tooBig ? "Foto troppo pesante" : undefined,
      });
    }
    setPhotos((p) => [...p, ...out]);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <>
      <StepTitle sub="Con le foto possiamo darti una risposta più precisa. Non servono documenti.">
        Aggiungi qualche foto
      </StepTitle>

      <p className="mb-3 font-bold">Le più utili</p>
      <ul className="mb-7 flex flex-wrap gap-2">
        {SUGGESTED.map((s) => (
          <li key={s} className="rounded-full bg-paper px-3.5 py-1.5 text-sm font-semibold ring-1 ring-line">
            {s}
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-3 gap-2">
        {photos.map((p) => (
          <div
            key={p.id}
            className={`step-in relative aspect-square overflow-hidden rounded-xl bg-line ${p.state === "invalid" ? "ring-4 ring-danger" : ""}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- anteprima locale (blob:) */}
            <img src={p.url} alt="" className="h-full w-full object-cover" />
            {p.state === "saved" && (
              <span className="absolute bottom-1.5 left-1.5 rounded-full bg-ok px-2 py-0.5 text-xs font-bold text-paper">Inviata</span>
            )}
            {p.state === "invalid" && (
              <span className="absolute inset-x-1 bottom-1 rounded bg-danger px-1.5 py-0.5 text-[11px] font-bold leading-tight text-paper">
                {p.message ?? "Non accettata"}
              </span>
            )}
            {p.state !== "saved" && (
            <button
              type="button"
              onClick={() => {
                URL.revokeObjectURL(p.url);
                setPhotos((list) => list.filter((x) => x.id !== p.id));
              }}
              className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-asphalt/85 text-lg leading-none text-paper"
              aria-label="Rimuovi foto"
            >
              ×
            </button>
            )}
          </div>
        ))}
        {photos.length < MAX_PHOTOS && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-asphalt-soft/50 bg-paper font-semibold text-plate transition-colors hover:border-plate disabled:opacity-60"
          >
            <span aria-hidden className="text-3xl leading-none">
              +
            </span>
            <span className="text-sm">{busy ? "Preparo…" : "Aggiungi"}</span>
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => onPick(e.target.files)}
      />
      <p className="mt-3 text-sm text-concrete">
        {photos.length}/{MAX_PHOTOS} foto
      </p>
      {error && (
        <p role="alert" className="mt-3 font-semibold text-danger">
          {error}
        </p>
      )}
    </>
  );
}
