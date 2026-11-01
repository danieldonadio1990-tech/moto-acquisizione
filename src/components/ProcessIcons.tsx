/**
 * Tre icone SVG del processo (racconta · ricevi la proposta · concludi). Disegnate nel codice, nessun file esterno:
 * tratto grafite (currentColor) con un accento giallo segnale. Decorative: il significato è nel testo accanto.
 */
const common = { viewBox: "0 0 64 64", fill: "none", stroke: "currentColor", strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
const ACCENT = "var(--color-plate)";

/** 1 · scheda con i dati della moto */
export const ProcessTell = ({ className }: { className?: string }) => (
  <svg {...common} className={className}>
    <rect x="12" y="8" width="40" height="48" rx="4" fill={ACCENT} stroke="none" opacity="0.9" transform="translate(3 3)" />
    <rect x="12" y="8" width="40" height="48" rx="4" fill="var(--color-paper)" />
    <path d="M20 22h24M20 32h24M20 42h14" />
    <circle cx="42" cy="42" r="3" />
  </svg>
);

/** 2 · proposta: lente su una moto stilizzata */
export const ProcessProposal = ({ className }: { className?: string }) => (
  <svg {...common} className={className}>
    <circle cx="28" cy="28" r="18" fill={ACCENT} stroke="none" opacity="0.9" transform="translate(3 3)" />
    <circle cx="28" cy="28" r="18" fill="var(--color-paper)" />
    <circle cx="21" cy="33" r="4" />
    <circle cx="36" cy="33" r="4" />
    <path d="M21 33l5-9h6l4 9M26 24l-2-3h-3M32 24l1-3h4" />
    <path d="M41 41l15 15" />
  </svg>
);

/** 3 · accordo: stretta di mano semplificata con chiave */
export const ProcessDeal = ({ className }: { className?: string }) => (
  <svg {...common} className={className}>
    <circle cx="22" cy="32" r="12" fill={ACCENT} stroke="none" opacity="0.9" transform="translate(3 3)" />
    <circle cx="22" cy="32" r="12" fill="var(--color-paper)" />
    <circle cx="22" cy="32" r="3.5" />
    <path d="M34 32h22M46 32v8M54 32v6" />
  </svg>
);
