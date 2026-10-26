/** Stili dei pulsanti condivisi tra home, modulo e conferma (giallo segnale = azione principale). */
const base =
  "inline-flex items-center justify-center gap-2 rounded-xl font-extrabold uppercase tracking-wide transition-colors duration-150 active:translate-y-px";

export const btnPrimary = `${base} h-14 bg-plate px-7 text-base text-paper hover:bg-plate-deep`;
/** Senza classe di display: chi lo usa decide quando mostrarlo (es. solo da certe larghezze). */
export const btnPrimarySm = `${base.replace("inline-flex ", "")} h-11 bg-plate px-5 text-sm text-paper hover:bg-plate-deep`;
export const btnOutline = `${base} h-14 border-2 border-asphalt bg-transparent px-6 text-base text-asphalt hover:bg-asphalt hover:text-paper`;
export const btnOutlineOnDark = `${base} h-14 border-2 border-paper/70 bg-transparent px-6 text-base text-paper hover:bg-paper hover:text-asphalt`;
