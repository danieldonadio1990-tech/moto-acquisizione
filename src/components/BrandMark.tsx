import Link from "next/link";
import { BRAND } from "@/config/business";
import { BrandSymbol } from "./brand/BrandSymbol";

/**
 * Logo Compriamo Moto: simbolo CM + moto e scritta in Big Shoulders Display (testo vero: nitido a qualunque dimensione
 * e leggibile dagli screen reader). «COMPRIAMO» nel colore del testo, «MOTO» in giallo scuro (su fondo chiaro) o giallo segnale
 * (su fondo scuro). I file statici di riferimento sono in public/brand/v2; email e immagini di anteprima (src/modules/notifications,
 * src/app/opengraph-image.png, generata una tantum) ripetono la stessa composizione.
 *  - tone "light": per sfondi chiari   - tone "dark": per sfondi scuri
 */
export function BrandMark({
  href = "/",
  tone = "light",
  size = "md",
  className = "",
}: {
  href?: string | null;
  tone?: "light" | "dark";
  /** "sm": intestazioni compatte */
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sym = size === "sm" ? "w-12 sm:w-14" : size === "lg" ? "w-20 sm:w-24" : "w-14 sm:w-16";
  const text = size === "sm" ? "text-[1.25rem] sm:text-[1.4rem]" : size === "lg" ? "text-4xl sm:text-5xl" : "text-[1.5rem] sm:text-[1.7rem]";
  const first = tone === "dark" ? "text-paper" : "text-asphalt";
  const second = tone === "dark" ? "text-sky" : "text-brass";
  const mark = (
    <span className={`inline-flex items-center gap-2.5 whitespace-nowrap ${className}`}>
      <BrandSymbol tone={tone} className={`${sym} h-auto shrink-0`} />
      <span className={`display ${text} leading-none tracking-[0.02em]`}>
        <span className={first}>Compriamo</span> <span className={second}>Moto</span>
      </span>
    </span>
  );
  if (href === null) {
    return mark;
  }
  return (
    <Link href={href} aria-label={`${BRAND.name} — home`} className="inline-flex rounded-sm">
      {mark}
    </Link>
  );
}
