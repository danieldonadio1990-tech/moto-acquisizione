/**
 * Regole Buy Box iniziali. Vengono inserite nel DB solo al primo avvio:
 * da lì in poi la fonte di verità è la tabella buy_box_rules (modificabile).
 *
 * `model` corrisponde alla "famiglia" del catalogo (es. "SH" copre SH 125, SH 150, SH 350…).
 */
export const DEFAULT_BUY_BOX_RULES = [
  { brand: "Honda", model: "SH", priority: "high" as const, maxPurchasePrice: 2500, market: "milano" },
  { brand: "Piaggio", model: "Liberty", priority: "high" as const, maxPurchasePrice: 2500, market: "milano" },
  { brand: "Kymco", model: "Agility", priority: "high" as const, maxPurchasePrice: 2500, market: "milano" },
];
