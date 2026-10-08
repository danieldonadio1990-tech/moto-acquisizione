/**
 * Valuta se una moto rientra nella Buy Box. Funzione pura: le regole arrivano dal DB.
 * Restituisce la regola con priorità più alta che corrisponde, oppure null.
 */
export type BuyBoxRuleLike = {
  brand: string;
  model: string | null;
  minYear: number | null;
  maxYear: number | null;
  maxMileage: number | null;
  requireRunning: boolean;
  market: string;
  priority: "high" | "medium" | "low";
  active: boolean;
};

export type BuyBoxCandidate = {
  brand: string;
  family: string | null;
  year: number;
  mileage: number;
  isRunning: boolean;
  market: string;
};

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;

const norm = (s: string) => s.trim().toLowerCase();

export function matchBuyBox<R extends BuyBoxRuleLike>(c: BuyBoxCandidate, rules: R[]): R | null {
  const hits = rules.filter(
    (r) =>
      r.active &&
      norm(r.market) === norm(c.market) &&
      norm(r.brand) === norm(c.brand) &&
      (r.model === null || (c.family !== null && norm(r.model) === norm(c.family))) &&
      (r.minYear === null || c.year >= r.minYear) &&
      (r.maxYear === null || c.year <= r.maxYear) &&
      (r.maxMileage === null || c.mileage <= r.maxMileage) &&
      (!r.requireRunning || c.isRunning),
  );
  hits.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
  return hits[0] ?? null;
}

export const PRIORITY_LABELS = { high: "Alta", medium: "Media", low: "Bassa" } as const;
