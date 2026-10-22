/** Parti grafiche del logo Compro Moto, senza dipendenze dall'interfaccia (usate anche dall'anteprima social). */
export const ASPHALT = "#20252B";
export const BLUE = "#1A3FA8";
export const YELLOW = "#F5C928";

/** Simbolo: moto stilizzata con le linee di velocità. Riquadro 128 x 64. */
export function MotoSymbol({ body = ASPHALT, lines = YELLOW }: { body?: string; lines?: string }) {
  return (
    <>
      <g fill={lines}>
        <path d="M3 20.5 26 18v5.2z" />
        <path d="M11 29.5 29 27.4v4.6z" />
        <path d="M1 38.5 25 36v5.4z" />
      </g>
      <g fill="none" stroke={body} strokeWidth="5">
        <circle cx="36" cy="46" r="11" />
        <circle cx="104" cy="46" r="11" />
      </g>
      <g fill={body} stroke={body} strokeLinejoin="round" strokeLinecap="round">
        <path strokeWidth="2" d="M22 31Q28 27 40 28L60 29 62 35 34 36Z" />
        <path strokeWidth="2" d="M56 29Q60 19 76 19L84 24 78 33 58 33Z" />
        <path strokeWidth="2" d="M50 36H74L72 47H54Z" />
        <path strokeWidth="2" d="M80 19H92L98 28 84 32Z" />
        <path strokeWidth="2" d="M86 19 90 11 96 19Z" />
      </g>
      <g fill="none" stroke={body} strokeLinecap="round">
        <path strokeWidth="4" d="M36 46 56 42" />
        <path strokeWidth="4.5" d="M93 26 104 46" />
        <path strokeWidth="3.5" d="M88 17 96 15" />
      </g>
      <g fill={body}>
        <circle cx="36" cy="46" r="2.8" />
        <circle cx="104" cy="46" r="2.8" />
      </g>
    </>
  );
}

