import Link from "next/link";
import { BRAND } from "@/config/business";
import { WORD } from "./brandPaths";
import { ASPHALT, BLUE, MotoSymbol } from "./BrandSvg";

/**
 * Logo Compro Moto.
 *  - "horizontal": simbolo + scritta su una riga (intestazione, footer)
 *  - "stacked":    simbolo sopra, scritta e payoff sotto (pagine di servizio)
 *  - "icon":       solo simbolo, versione compatta
 * La scritta è un tracciato (nessun font da caricare): COMPRO in nero, MOTO in blu.
 * Il file sorgente dei loghi è in public/brand/.
 */
export function BrandMark({
  href = "/",
  variant = "horizontal",
  tone = "light",
  className = "",
}: {
  href?: string | null;
  variant?: "horizontal" | "stacked" | "icon";
  tone?: "light" | "dark";
  className?: string;
}) {
  const word1 = tone === "dark" ? "#ffffff" : ASPHALT;
  const body = tone === "dark" ? "#ffffff" : ASPHALT;
  const skew = "skewX(-8)";
  let svg;
  if (variant === "icon") {
    svg = (
      <svg viewBox="0 0 128 64" className="h-8 w-auto" aria-hidden>
        <MotoSymbol body={body} />
      </svg>
    );
  } else if (variant === "stacked") {
    const vw = 430;
    svg = (
      <svg viewBox={`0 0 ${vw} 220`} className="h-28 w-auto md:h-36" aria-hidden>
        <g transform={`translate(${(vw - 256) / 2} 0) scale(2)`}>
          <MotoSymbol body={body} />
        </g>
        <g transform={`translate(${(vw - WORD.width) / 2} 180) ${skew}`}>
          <path fill={word1} d={WORD.compro} />
          <path fill={BLUE} d={WORD.moto} />
        </g>
        <g transform={`translate(${(vw - WORD.taglineWidth) / 2} 212)`}>
          <path fill={word1} d={WORD.tagline} />
        </g>
      </svg>
    );
  } else {
    svg = (
      <svg viewBox="0 0 517 64" className="h-9 w-auto md:h-10" aria-hidden>
        <MotoSymbol body={body} />
        <g transform={`translate(140 47.5) ${skew}`}>
          <path fill={word1} d={WORD.compro} />
          <path fill={BLUE} d={WORD.moto} />
        </g>
      </svg>
    );
  }
  if (href === null) return <span className={className}>{svg}<span className="sr-only">{BRAND.name}</span></span>;
  return (
    <Link href={href} aria-label={`${BRAND.name} — home`} className={`inline-flex ${className}`}>
      {svg}
    </Link>
  );
}
