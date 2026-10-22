/**
 * Fotografie del sito pubblico.
 *
 * FINCHÉ `src` È null il sito NON mostra nessuna immagine e usa una composizione pulita di colori e tipografia
 * (nessuna illustrazione, nessuna immagine sintetica). Per usare una fotografia vera:
 *   1. copia il file in `public/photos/` (JPG o WebP, sotto i 250 KB);
 *   2. scrivi il percorso in `src` (es. "/photos/hero-scooter-milano.jpg") e le dimensioni reali;
 *   3. compila `credit` (autore, licenza, link alla pagina della licenza) e aggiungi la riga a docs/CREDITI-FOTO.md.
 * Il crediti compaiono nel footer ("Crediti fotografici"). Servono solo foto reali con diritti d'uso verificati.
 */
export type PhotoCredit = {
  author: string;
  /** es. "CC BY-SA 4.0", "CC0", "Foto propria" */
  license: string;
  /** pagina di origine / licenza, per la verifica */
  url?: string;
};

export type SiteImage = {
  src: string | null;
  alt: string;
  /** dimensioni reali del file quando `src` è impostato */
  width: number;
  height: number;
  credit?: PhotoCredit;
};

export const IMAGES = {
  /** Hero: scooter in una strada di Milano, luce naturale. Consigliato 1600 x 1200 px (4:3). */
  hero: { src: null, alt: "Scooter parcheggiato in una strada di Milano", width: 1600, height: 1200 },
  /** Card dei mezzi: scooter ben visibile di lato. Consigliato 1200 x 900 px (4:3). */
  honda_sh: { src: null, alt: "Honda SH", width: 1200, height: 900 },
  piaggio_liberty: { src: null, alt: "Piaggio Liberty", width: 1200, height: 900 },
  kymco_agility: { src: null, alt: "Kymco Agility", width: 1200, height: 900 },
} as const satisfies Record<string, SiteImage>;

export type ImageKey = keyof typeof IMAGES;

/** Crediti delle foto effettivamente in uso (per il footer). */
export function photoCredits(): { id: ImageKey; credit: PhotoCredit }[] {
  const out: { id: ImageKey; credit: PhotoCredit }[] = [];
  for (const [id, img] of Object.entries(IMAGES) as [ImageKey, SiteImage][]) {
    if (img.src && img.credit) out.push({ id, credit: img.credit });
  }
  return out;
}
