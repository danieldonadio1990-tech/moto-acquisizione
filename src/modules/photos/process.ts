import "server-only";
import sharp, { type Metadata } from "sharp";

export const MAX_PHOTOS_PER_LEAD = 12;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp", "heif", "avif"]);

export type ProcessedPhoto = { data: Buffer; width: number; height: number; contentType: "image/jpeg" };

/**
 * Verifica che il file sia davvero un'immagine (dal contenuto, non dall'estensione),
 * lo raddrizza, lo ridimensiona e lo ricodifica in JPEG.
 * La ricodifica elimina TUTTI i metadati EXIF, inclusa la posizione GPS.
 */
export async function processPhoto(input: Buffer): Promise<ProcessedPhoto> {
  if (input.byteLength > MAX_PHOTO_BYTES) throw new PhotoError("Foto troppo grande (max 10 MB)");

  let meta: Metadata;
  try {
    meta = await sharp(input).metadata();
  } catch {
    throw new PhotoError("File non riconosciuto come immagine");
  }
  if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) {
    throw new PhotoError("Formato non supportato");
  }

  const { data, info } = await sharp(input, { limitInputPixels: 60_000_000 })
    .rotate()
    .resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });

  return { data, width: info.width, height: info.height, contentType: "image/jpeg" };
}

export class PhotoError extends Error {}
