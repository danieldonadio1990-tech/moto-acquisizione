import { SYMBOL_ACCENT, SYMBOL_BODY, SYMBOL_VIEWBOX, SYMBOL_WHEEL } from "./symbol-paths";

/**
 * Simbolo CM + moto (anteprima di brand). Colori da variabili CSS della pagina:
 * --b2-mark (corpo), --b2-wheel (la C e il dettaglio). Decorativo: il nome è sempre scritto accanto.
 */
export function BrandSymbol({ className = "" }: { className?: string }) {
  return (
    <svg viewBox={SYMBOL_VIEWBOX} aria-hidden="true" focusable="false" className={className}>
      <path fill="var(--b2-mark)" fillRule="evenodd" d={SYMBOL_BODY} />
      <path fill="var(--b2-wheel)" d={SYMBOL_WHEEL} />
      <path fill="var(--b2-wheel)" stroke="var(--b2-wheel)" strokeWidth="1.4" d={SYMBOL_ACCENT} />
    </svg>
  );
}
