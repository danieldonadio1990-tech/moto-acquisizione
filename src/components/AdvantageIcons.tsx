/** Cinque icone dei vantaggi (tratto in linea come le altre del sito, accento giallo segnale). Decorative: il significato è nel testo. */
const common = { viewBox: "0 0 32 32", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
const A = "var(--color-plate)";
type P = { className?: string };

/** un solo interlocutore */
export const AdvOne = ({ className }: P) => (
  <svg {...common} className={className}>
    <circle cx="17" cy="13" r="6" fill={A} stroke="none" />
    <circle cx="16" cy="12" r="6" />
    <path d="M5 28c0-6 5-9 11-9s11 3 11 9" />
  </svg>
);
/** nessun annuncio da pubblicare */
export const AdvNoAd = ({ className }: P) => (
  <svg {...common} className={className}>
    <rect x="5" y="7" width="22" height="16" rx="2.5" fill={A} stroke="none" transform="translate(1 1.5)" />
    <rect x="5" y="7" width="22" height="16" rx="2.5" />
    <path d="M10 13h12M10 17h7M4 27L28 4" />
  </svg>
);
/** nessuna ricerca di acquirenti */
export const AdvNoSearch = ({ className }: P) => (
  <svg {...common} className={className}>
    <circle cx="14.5" cy="14.5" r="8.5" fill={A} stroke="none" transform="translate(1 1)" />
    <circle cx="14" cy="14" r="8.5" />
    <path d="M20.5 20.5L28 28M4 27L27 5" />
  </svg>
);
/** valuti la proposta prima di decidere */
export const AdvDecide = ({ className }: P) => (
  <svg {...common} className={className}>
    <circle cx="17" cy="17" r="11" fill={A} stroke="none" />
    <circle cx="16" cy="16" r="11" />
    <path d="M10.5 16.5l4 4 7-8" />
  </svg>
);
/** trattativa diretta */
export const AdvDirect = ({ className }: P) => (
  <svg {...common} className={className}>
    <path d="M4 11h19M23 11l-5-5M28 21H9M9 21l5 5" />
    <circle cx="16" cy="16" r="3" fill={A} stroke="none" />
  </svg>
);
export const ADVANTAGE_ICONS = [AdvOne, AdvNoAd, AdvNoSearch, AdvDecide, AdvDirect];
