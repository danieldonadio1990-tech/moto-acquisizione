/**
 * Immagini del sito pubblico.
 *
 * FINCHÉ `src` È null il sito mostra illustrazioni vettoriali segnaposto (non sono fotografie).
 * Per usare una fotografia vera: copia il file in `public/photos/` e scrivi il percorso in `src`
 * (es. "/photos/hero-scooter-milano.jpg"). Nessun'altra modifica al codice. Dimensioni consigliate indicate sotto;
 * formato JPG/WebP, peso consigliato sotto i 250 KB. Servono fotografie reali e con i diritti d'uso chiari
 * (scatti propri o licenza verificata), senza loghi di produttori in evidenza.
 */
export type SiteImage = {
  src: string | null;
  alt: string;
  /** dimensioni reali del file quando `src` è impostato */
  width: number;
  height: number;
};

export const IMAGES = {
  /** Hero: scooter urbano in una strada di città, luce naturale. Consigliato 1600 x 1200 px (formato 4:3). */
  hero: { src: null, alt: "Scooter in una strada di città", width: 1600, height: 1200 },
  /** Card dei mezzi: scooter pulito e ben visibile di lato, sfondo urbano semplice. Consigliato 1200 x 900 px. */
  honda_sh: { src: null, alt: "Scooter di categoria Honda SH", width: 1200, height: 900 },
  piaggio_liberty: { src: null, alt: "Scooter di categoria Piaggio Liberty", width: 1200, height: 900 },
  kymco_agility: { src: null, alt: "Scooter di categoria Kymco Agility", width: 1200, height: 900 },
} as const satisfies Record<string, SiteImage>;

export type ImageKey = keyof typeof IMAGES;
