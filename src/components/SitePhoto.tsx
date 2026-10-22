import Image from "next/image";
import { IMAGES, type ImageKey } from "@/config/images";
import { Scooter, UrbanScene } from "./illustrations";

const MODEL_STYLE: Record<string, { body: string; wheel: number }> = {
  honda_sh: { body: "#1A3FA8", wheel: 18 },
  piaggio_liberty: { body: "#3b434c", wheel: 17 },
  kymco_agility: { body: "#9aa3ac", wheel: 14 },
};

/**
 * Immagine del sito: la fotografia indicata in src/config/images.ts, oppure (finché manca) un'illustrazione segnaposto.
 * `priority` per l'immagine in cima alla pagina.
 */
export function SitePhoto({ id, className = "", priority = false }: { id: ImageKey; className?: string; priority?: boolean }) {
  const img = IMAGES[id];
  if (img.src) {
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
  if (id === "hero") return <UrbanScene className={`h-full w-full ${className}`} />;
  const st = MODEL_STYLE[id] ?? MODEL_STYLE.honda_sh;
  return (
    <div className={`flex h-full w-full items-end justify-center bg-chalk px-6 pb-4 pt-6 ${className}`}>
      <Scooter body={st.body} wheel={st.wheel} className="h-full max-h-44 w-full" />
    </div>
  );
}
