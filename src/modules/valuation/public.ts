/** Ciò che il cliente può vedere di una valutazione: mai margini, costi o formula. Tipo condiviso con il browser. */
export type PublicValuation =
  | { kind: "offer"; amountCents: number }
  | { kind: "range"; lowCents: number; highCents: number }
  | { kind: "manual" };
