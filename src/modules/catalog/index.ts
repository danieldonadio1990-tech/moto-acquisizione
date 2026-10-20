import { CATALOG, OTHER_MODEL_ID, type CatalogModel } from "./data";

export { OTHER_MODEL_ID, type CatalogModel };

/**
 * Le 10 marche mostrate subito nel modulo, in quest'ordine (senza duplicati). Per tutte le altre c'è la voce "Altro"
 * (marca e modello scritti a mano). Un modello del catalogo di una marca non presente qui (es. Vespa) resta salvabile
 * come "Altro" digitando la marca.
 */
export const MAIN_BRANDS = [
  "Honda",
  "Piaggio",
  "Yamaha",
  "Kymco",
  "SYM",
  "BMW",
  "Suzuki",
  "Kawasaki",
  "Aprilia",
  "Ducati",
] as const;

export function listBrands(): string[] {
  return [...MAIN_BRANDS];
}

/** Se il testo scritto a mano coincide (maiuscole a parte) con una marca principale, usa il nome canonico. */
export function canonicalBrand(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  return MAIN_BRANDS.find((b) => b.toLowerCase() === t.toLowerCase()) ?? t;
}

export function listModels(brand: string): CatalogModel[] {
  return CATALOG.filter((m) => m.brand === brand);
}

export function getModel(id: string): CatalogModel | undefined {
  return CATALOG.find((m) => m.id === id);
}

export const MIN_YEAR = 1990;
export function maxYear() {
  return new Date().getFullYear() + 1;
}
