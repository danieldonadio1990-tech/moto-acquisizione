/**
 * Denaro come INTERI in centesimi: nessun numero decimale nei calcoli, quindi nessun errore di virgola mobile.
 * Le percentuali sono in punti base (bp): 100 bp = 1%, 10000 bp = 100%.
 * Direzione degli arrotondamenti (sempre prudente per l'azienda): i costi si arrotondano per eccesso,
 * il valore di rivendita e l'offerta per difetto.
 */
export const BP = 10_000;

export class MoneyError extends Error {}

export function assertCents(v: unknown, label: string): asserts v is number {
  if (typeof v !== "number" || !Number.isSafeInteger(v)) throw new MoneyError(`${label}: importo non valido`);
}

/** cents × bp / 10000, arrotondato per difetto (floor). Solo per valori non negativi. */
export function mulBpFloor(cents: number, bp: number): number {
  assertCents(cents, "importo");
  return Math.floor((cents * bp) / BP);
}

/** cents × bp / 10000, arrotondato per eccesso (ceil). Solo per valori non negativi. */
export function mulBpCeil(cents: number, bp: number): number {
  assertCents(cents, "importo");
  return Math.ceil((cents * bp) / BP);
}

/** Arrotonda per difetto al multiplo di `step` (step in centesimi, > 0). */
export function floorToStep(cents: number, step: number): number {
  if (step <= 0) return cents;
  return Math.floor(cents / step) * step;
}

/** Euro interi → centesimi (ammessi solo euro interi o con due decimali). */
export function eurosToCents(euros: number): number {
  if (!Number.isFinite(euros)) throw new MoneyError("importo non valido");
  return Math.round(euros * 100);
}

export function formatEuro(cents: number): string {
  const euros = Math.trunc(cents / 100);
  const rest = Math.abs(cents % 100);
  // separatore delle migliaia scritto a mano: Intl in italiano non raggruppa i numeri a 4 cifre (3500)
  const base = String(Math.abs(euros)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const sign = cents < 0 ? "-" : "";
  return rest === 0 ? `${sign}€ ${base}` : `${sign}€ ${base},${String(rest).padStart(2, "0")}`;
}
