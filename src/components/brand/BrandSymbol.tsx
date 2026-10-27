import { SYMBOL_ACCENT, SYMBOL_BODY, SYMBOL_VIEWBOX, SYMBOL_WHEEL } from "./symbol-paths";

/**
 * Simbolo CM + moto di Compriamo Moto. Decorativo (aria-hidden): il nome è sempre scritto accanto o nel testo alternativo.
 *  - tone "light": per sfondi chiari (corpo grafite)   - tone "dark": per sfondi scuri (corpo bianco sporco)
 * I file di riferimento sono in public/brand/v2 (stesse forme); vedi docs/BRAND.md.
 */
export function BrandSymbol({ tone = "light", className = "" }: { tone?: "light" | "dark"; className?: string }) {
  const body = tone === "dark" ? "var(--color-paper)" : "var(--color-asphalt)";
  return (
    <svg viewBox={SYMBOL_VIEWBOX} aria-hidden="true" focusable="false" className={className}>
      <path fill={body} fillRule="evenodd" d={SYMBOL_BODY} />
      <path fill="var(--color-plate)" d={SYMBOL_WHEEL} />
      <path fill="var(--color-plate)" stroke="var(--color-plate)" strokeWidth="1.4" d={SYMBOL_ACCENT} />
    </svg>
  );
}
