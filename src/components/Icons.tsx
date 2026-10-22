/** Icone semplici in linea, ereditano il colore del testo. */
const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export const IconClipboard = ({ className }: { className?: string }) => (
  <svg {...base} className={className}>
    <rect x="6" y="4" width="12" height="17" rx="2" />
    <path d="M9 4.5h6M9.5 11l1.8 1.8L15 9.5M9.5 16.5H15" />
  </svg>
);
export const IconSearch = ({ className }: { className?: string }) => (
  <svg {...base} className={className}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M15.5 15.5 21 21" />
  </svg>
);
export const IconKey = ({ className }: { className?: string }) => (
  <svg {...base} className={className}>
    <circle cx="8" cy="15" r="4" />
    <path d="M11 12.5 20 4M16.5 7.5l2.5 2.5M14 10l2 2" />
  </svg>
);
export const IconCheck = ({ className }: { className?: string }) => (
  <svg {...base} strokeWidth={3} className={className}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
export const IconCamera = ({ className }: { className?: string }) => (
  <svg {...base} className={className}>
    <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
);
export const IconPhone = ({ className }: { className?: string }) => (
  <svg {...base} className={className}>
    <rect x="7" y="3" width="10" height="18" rx="2" />
    <path d="M11 18h2" />
  </svg>
);
export const IconPlus = ({ className }: { className?: string }) => (
  <svg {...base} strokeWidth={2.5} className={className}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const IconAlert = ({ className }: { className?: string }) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5M12 16.2v.1" />
  </svg>
);
export const IconArrowRight = ({ className }: { className?: string }) => (
  <svg {...base} strokeWidth={2.5} className={className}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
