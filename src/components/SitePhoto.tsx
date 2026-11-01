import Image, { getImageProps } from "next/image";
import { IMAGES as RAW_IMAGES, type ImageKey, type SiteImage } from "@/config/images";

const IMAGES: Record<ImageKey, SiteImage> = RAW_IMAGES;

/** Vero se per questa immagine è stata indicata una fotografia vera (src/config/images.ts). */
export const hasPhoto = (id: ImageKey) => IMAGES[id].src !== null;

/** Punto focale del ritaglio: variabili CSS lette dalle classi di `focalClass` (smartphone / da tablet in su). */
const focalVars = (id: ImageKey) =>
  ({
    "--fp-d": IMAGES[id].focal ?? "50% 50%",
    "--fp-m": IMAGES[id].focalMobile ?? IMAGES[id].focal ?? "50% 50%",
  }) as React.CSSProperties;
const focalClass = "[object-position:var(--fp-m)] md:[object-position:var(--fp-d)]";

/**
 * Fotografia del sito (solo foto vere, con licenza verificata: vedi docs/IMMAGINI-DA-FORNIRE.md e docs/CREDITI-FOTO.md).
 * Se la foto non c'è non mostra nulla: chi la usa prepara una composizione di colori e tipografia.
 */
export function SitePhoto({
  id,
  className = "",
  priority = false,
  sizes = "(min-width: 1024px) 560px, 100vw",
}: {
  id: ImageKey;
  className?: string;
  priority?: boolean;
  sizes?: string;
}) {
  const img = IMAGES[id];
  if (!img.src) return null;
  return (
    <Image
      src={img.src}
      alt={img.alt}
      width={img.width}
      height={img.height}
      priority={priority}
      sizes={sizes}
      style={focalVars(id)}
      className={`h-full w-full object-cover ${focalClass} ${className}`}
    />
  );
}

/**
 * Direzione artistica: un'immagine per smartphone (verticale) e una per tablet/desktop (orizzontale) nello stesso <picture>,
 * così il browser scarica solo quella che serve. Se manca una delle due si usa l'altra, ritagliata dal punto focale.
 */
export function ResponsivePhoto({ mobile, desktop, priority = false }: { mobile: ImageKey; desktop: ImageKey; priority?: boolean }) {
  const m = IMAGES[mobile].src ? mobile : desktop;
  const d = IMAGES[desktop].src ? desktop : mobile;
  if (!IMAGES[m].src || !IMAGES[d].src) return null;
  const build = (id: ImageKey, sizes: string) =>
    getImageProps({ src: IMAGES[id].src!, alt: IMAGES[id].alt, width: IMAGES[id].width, height: IMAGES[id].height, sizes, priority }).props;
  const dp = build(d, "(min-width: 1152px) 600px, (min-width: 768px) 50vw, 100vw");
  const mp = build(m, "100vw");
  return (
    <picture>
      <source media="(min-width: 768px)" srcSet={dp.srcSet} sizes={dp.sizes} />
      <img {...mp} alt={mp.alt} style={{ ...mp.style, "--fp-m": IMAGES[m].focalMobile ?? IMAGES[m].focal ?? "50% 50%", "--fp-d": IMAGES[d].focal ?? "50% 50%" } as React.CSSProperties} className={`h-full w-full object-cover ${focalClass}`} />
    </picture>
  );
}
