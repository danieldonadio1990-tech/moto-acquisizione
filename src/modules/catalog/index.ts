import { CATALOG, OTHER_MODEL_ID, type CatalogModel } from "./data";

export { OTHER_MODEL_ID, type CatalogModel };

/** Marche in ordine: prima quelle più trattate, poi alfabetico. */
const FEATURED_BRANDS = ["Honda", "Piaggio", "Kymco"];

export function listBrands(): string[] {
  const all = [...new Set(CATALOG.map((m) => m.brand))];
  const rest = all.filter((b) => !FEATURED_BRANDS.includes(b)).sort();
  return [...FEATURED_BRANDS.filter((b) => all.includes(b)), ...rest];
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
