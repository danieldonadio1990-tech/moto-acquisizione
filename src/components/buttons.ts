/** Stili dei pulsanti condivisi tra home, modulo e conferma (giallo segnale con testo grafite = azione principale). */
const base =
  "inline-flex items-center justify-center gap-2 rounded-sm font-display text-[1.35em] font-extrabold uppercase tracking-wide transition duration-150 hover:-translate-y-0.5 hover:shadow-[0_3px_0_var(--color-asphalt)] active:translate-y-0 active:shadow-none motion-reduce:transition-none motion-reduce:hover:translate-y-0";

export const btnPrimary = `${base} h-14 bg-plate px-7 text-asphalt`;
/** Senza classe di display: chi lo usa decide quando mostrarlo (es. solo da certe larghezze). */
export const btnPrimarySm = `${base.replace("inline-flex ", "")} h-11 bg-plate px-5 text-asphalt`;
export const btnOutline = `${base} h-14 border-2 border-asphalt bg-transparent px-6 text-asphalt hover:bg-asphalt hover:text-paper`;
export const btnOutlineOnDark = `${base} h-14 border-2 border-paper/70 bg-transparent px-6 text-paper hover:bg-paper hover:text-asphalt`;
