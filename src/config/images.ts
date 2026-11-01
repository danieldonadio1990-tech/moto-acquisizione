/**
 * Fotografie del sito pubblico.
 *
 * FINCHÉ `src` È null il sito NON mostra nessuna immagine e usa una composizione pulita di colori e tipografia
 * (nessuna illustrazione, nessuna immagine sintetica). Per usare una fotografia vera:
 *   1. copia il file in `public/photos/` (JPG o WebP, sotto i 250 KB);
 *   2. scrivi il percorso in `src` (es. "/photos/hero-moto-milano.jpg") e le dimensioni reali;
 *      HERO sostitutiva generata: usa un file ad alta risoluzione (min. 1600 px di larghezza, mai l'anteprima di Canva),
 *      imposta `generated: true`, alt descrittivo e generico (non «una strada di Milano») e nessun `credit`.
 *   3. per le foto vere compila `credit` (autore, licenza, link alla pagina della licenza) e aggiungi la riga a docs/CREDITI-FOTO.md.
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
  /** punto focale (CSS object-position, es. "50% 70%") per il ritaglio su desktop e, se indicato, su smartphone */
  focal?: string;
  focalMobile?: string;
  /** dimensioni reali del file quando `src` è impostato */
  width: number;
  height: number;
  credit?: PhotoCredit;
  /**
   * true per un'immagine generata (non una fotografia): niente credito CC di terzi, ma il sito la dichiara
   * «Immagine illustrativa» e il footer indica che è generata. Mai per rappresentare un modello specifico.
   */
  generated?: boolean;
};

export const IMAGES = {
  /** Hero desktop/tablet: fotografia editoriale di una moto in contesto urbano, luce naturale. 1600 x 1000 px (16:10). */
  hero: { src: null, alt: "Moto in una strada di città, ripresa di lato con luce naturale", width: 1600, height: 1000, focal: "50% 60%" },
  /** Hero smartphone (verticale, 4:5): la moto al centro, spazio libero in basso. 1080 x 1350 px. Se manca si usa `hero` ritagliata. */
  hero_mobile: { src: null, alt: "Moto in una strada di città, ripresa di lato con luce naturale", width: 1080, height: 1350, focal: "50% 60%" },
  /** Fotografie editoriali di motociclette, verticali (4:5): moto intera o di tre quarti. 1200 x 1500 px. */
  moto_1: { src: null, alt: "Motocicletta ripresa di tre quarti", width: 1200, height: 1500, focal: "50% 55%" },
  moto_2: { src: null, alt: "Motocicletta ripresa di lato", width: 1200, height: 1500, focal: "50% 55%" },
  /** Consegna della moto: due persone vicino a una moto (volti non riconoscibili o con liberatoria). 1200 x 900 px (4:3). */
  consegna: { src: null, alt: "Consegna di una moto tra due persone", width: 1200, height: 900 },
  /** Dettaglio meccanico (motore, cerchio, manubrio), verticale (4:5). 1200 x 1500 px. */
  dettaglio: { src: null, alt: "Dettaglio meccanico di una motocicletta", width: 1200, height: 1500, focal: "50% 50%" },
} as const satisfies Record<string, SiteImage>;

export type ImageKey = keyof typeof IMAGES;

/** true se l'immagine è generata (da dichiarare come «Immagine illustrativa»). */
export const isGenerated = (id: ImageKey): boolean => Boolean((IMAGES[id] as SiteImage).generated);

/** true se almeno un'immagine in uso è generata (per la nota nel footer). */
export function hasGeneratedImages(): boolean {
  return (Object.values(IMAGES) as SiteImage[]).some((i) => i.src && i.generated);
}

/** Crediti delle foto effettivamente in uso (per il footer). */
export function photoCredits(): { id: ImageKey; credit: PhotoCredit }[] {
  const out: { id: ImageKey; credit: PhotoCredit }[] = [];
  for (const [id, img] of Object.entries(IMAGES) as [ImageKey, SiteImage][]) {
    if (img.src && img.credit) out.push({ id, credit: img.credit });
  }
  return out;
}
