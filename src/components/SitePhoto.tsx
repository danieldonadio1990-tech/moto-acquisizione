import Image from "next/image";
import { IMAGES, type ImageKey } from "@/config/images";

/** Vero se per questa immagine è stata indicata una fotografia vera (src/config/images.ts). */
export const hasPhoto = (id: ImageKey) => IMAGES[id].src !== null;

/**
 * Fotografia del sito (solo foto vere, con licenza verificata: vedi docs/IMMAGINI-DA-FORNIRE.md e docs/CREDITI-FOTO.md).
 * Se la foto non c'è non mostra nulla: chi la usa prepara una composizione di colori e tipografia.
 */
export function SitePhoto({ id, className = "", priority = false }: { id: ImageKey; className?: string; priority?: boolean }) {
  const img = IMAGES[id];
  if (!img.src) return null;
  return (
    <Image
      src={img.src}
      alt={img.alt}
      width={img.width}
      height={img.height}
      priority={priority}
      sizes="(min-width: 1024px) 560px, 100vw"
      className={`h-full w-full object-cover ${className}`}
    />
  );
}
