import Link from "next/link";
import { BRAND } from "@/config/business";

/**
 * Logo Compriamo Moto: tipografico, nessun simbolo. «COMPRIAMO» nel colore del testo, «MOTO» in blu elettrico.
 * Usa il font del sito (Archivo, già caricato): è testo vero, quindi nitido a qualunque dimensione e leggibile dagli
 * screen reader. Le versioni per email e immagini di anteprima ripetono la stessa composizione (src/modules/notifications,
 * src/app/opengraph-image.tsx); il file statico di riferimento è public/brand/compriamo-moto-logo.svg.
 *  - tone "light": per sfondi chiari   - tone "dark": per sfondi blu notte
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
  const text = size === "sm" ? "text-[15px] sm:text-base" : size === "lg" ? "text-2xl sm:text-3xl" : "text-lg sm:text-xl";
  const first = tone === "dark" ? "text-paper" : "text-asphalt";
  const second = tone === "dark" ? "text-sky" : "text-plate";
  const mark = (
    <span className={`inline-flex items-baseline gap-[0.45em] whitespace-nowrap font-extrabold uppercase leading-none tracking-[0.12em] ${text} ${className}`}>
      <span className={first}>Compriamo</span>
      <span className={second}>Moto</span>
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
