"use client";
import { MAX_PHOTO_BYTES } from "@/modules/photos/limits";

/**
 * Ridimensiona una foto nel browser (max 1800 px, JPEG) per stare sotto i limiti dell'hosting.
 * Prova più modi di leggere l'immagine, perché non tutti i browser (soprattutto Safari datati) supportano le stesse opzioni:
 *   1. createImageBitmap con orientamento EXIF;  2. createImageBitmap semplice;  3. elemento <img> + canvas.
 * Restituisce { blob, resized }: resized=false significa che nessun modo ha funzionato e blob è il file originale.
 */
type Source = { width: number; height: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; close: () => void };

async function viaBitmap(file: File, withOptions: boolean): Promise<Source> {
  const bmp = withOptions ? await createImageBitmap(file, { imageOrientation: "from-image" }) : await createImageBitmap(file);
  return { width: bmp.width, height: bmp.height, draw: (c, w, h) => c.drawImage(bmp, 0, 0, w, h), close: () => bmp.close() };
}

function viaImageElement(file: File): Promise<Source> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () =>
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight,
        draw: (c, w, h) => c.drawImage(img, 0, 0, w, h),
        close: () => URL.revokeObjectURL(url),
      });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("immagine non leggibile"));
    };
    img.src = url;
  });
}

async function openSource(file: File): Promise<Source | null> {
  const attempts: (() => Promise<Source>)[] = [];
  if (typeof createImageBitmap === "function") {
    attempts.push(() => viaBitmap(file, true), () => viaBitmap(file, false));
  }
  attempts.push(() => viaImageElement(file));
  for (const attempt of attempts) {
    try {
      const s = await attempt();
      if (s.width > 0 && s.height > 0) return s;
    } catch {
      /* si prova il modo successivo */
    }
  }
  return null;
}

export async function compressImage(file: File): Promise<{ blob: Blob; resized: boolean }> {
  const src = await openSource(file);
  if (!src) return { blob: file, resized: false };
  try {
    let out: Blob | null = null;
    for (const [side, quality] of [
      [1800, 0.85],
      [1600, 0.75],
      [1280, 0.7],
      [1000, 0.65],
    ] as const) {
      const scale = Math.min(1, side / Math.max(src.width, src.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(src.width * scale));
      canvas.height = Math.max(1, Math.round(src.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) break;
      src.draw(ctx, canvas.width, canvas.height);
      out = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
      if (out && out.size <= MAX_PHOTO_BYTES) break;
    }
    return out ? { blob: out, resized: true } : { blob: file, resized: false };
  } finally {
    src.close();
  }
}
