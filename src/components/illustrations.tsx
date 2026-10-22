/**
 * Illustrazioni vettoriali segnaposto (NON sono fotografie): scooter urbano generico, senza marchi né modelli reali,
 * e una scena di strada. Servono finché non ci sono le fotografie definitive: vedi src/config/images.ts
 * (basta indicare il file per sostituire l'illustrazione con la foto).
 */
const ASPHALT = "#20252B";
const SIGNAL = "#F5C928";

export function Scooter({
  body = "#E8EBEE",
  seat = ASPHALT,
  accent = SIGNAL,
  tire = ASPHALT,
  wheel = 16,
  className,
  ...rest
}: Omit<React.SVGProps<SVGSVGElement>, "body" | "seat" | "wheel"> & {
  body?: string;
  seat?: string;
  accent?: string;
  tire?: string;
  /** raggio delle ruote: scooter a ruota alta (SH) o piccola (Agility) */
  wheel?: number;
  className?: string;
}) {
  const g = 118; // linea del suolo
  const ry = g - wheel;
  const rx = 52;
  const fx = 158;
  return (
    <svg viewBox="0 -8 210 138" className={className} aria-hidden fill="none" {...rest}>
      {/* ruote */}
      <circle cx={rx} cy={ry} r={wheel} stroke={tire} strokeWidth="7" />
      <circle cx={rx} cy={ry} r={wheel - 8} fill={body} opacity="0.9" />
      <circle cx={rx} cy={ry} r="3.5" fill={tire} />
      <circle cx={fx} cy={ry} r={wheel} stroke={tire} strokeWidth="7" />
      <circle cx={fx} cy={ry} r={wheel - 8} fill={body} opacity="0.9" />
      <circle cx={fx} cy={ry} r="3.5" fill={tire} />
      {/* carrozzeria posteriore */}
      <path
        fill={body}
        d={`M${rx - 26} ${ry - 8} C${rx - 30} ${ry - 38} ${rx - 14} ${ry - 56} ${rx + 12} ${ry - 58} L108 ${ry - 56} L112 ${ry - 24} L98 ${ry - 8} L${rx + 18} ${ry - 4} Z`}
      />
      {/* sella */}
      <path fill={seat} d={`M${rx - 6} ${ry - 62} C${rx + 18} ${ry - 72} 96 ${ry - 70} 112 ${ry - 60} L110 ${ry - 52} L${rx - 4} ${ry - 54} Z`} />
      {/* pedana */}
      <path fill={body} d={`M100 ${ry - 12} L134 ${ry - 12} L136 ${ry - 4} L98 ${ry - 4} Z`} />
      <path fill={seat} opacity="0.25" d={`M104 ${ry - 8} H132 V${ry - 5} H104 Z`} />
      {/* scudo anteriore e piantone */}
      <path fill={body} d={`M130 ${ry - 8} L126 ${ry - 54} L136 ${ry - 80} L150 ${ry - 80} L154 ${ry - 52} L150 ${ry - 8} Z`} />
      {/* forcella e parafango */}
      <path d={`M150 ${ry - 44} L${fx} ${ry}`} stroke={tire} strokeWidth="6" strokeLinecap="round" />
      <path d={`M${fx - 20} ${ry - wheel - 2} Q${fx} ${ry - wheel - 12} ${fx + 20} ${ry - wheel - 2}`} stroke={body} strokeWidth="6" strokeLinecap="round" />
      {/* manubrio, specchietto, faro */}
      <path d={`M142 ${ry - 82} L128 ${ry - 92}`} stroke={tire} strokeWidth="5" strokeLinecap="round" />
      <path d={`M128 ${ry - 92} L124 ${ry - 102}`} stroke={tire} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="152" cy={ry - 66} r="5" fill={accent} />
      {/* dettaglio colore */}
      <path d={`M${rx - 18} ${ry - 28} H92`} stroke={accent} strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

/** Scena urbana stilizzata: palazzi, strada con mezzeria gialla e uno scooter. Generica, non una vera località. */
export function UrbanScene({ className }: { className?: string }) {
  const windows: [number, number, boolean][] = [];
  for (const bx of [12, 78, 170, 232]) {
    for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) windows.push([bx + 8 + c * 24, 30 + r * 30, (bx + r * 7 + c * 3) % 5 === 0]);
  }
  return (
    <svg viewBox="0 0 320 240" className={className} role="img" aria-label="Illustrazione: scooter in una strada di città" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#323a43" />
          <stop offset="1" stopColor="#2a3037" />
        </linearGradient>
      </defs>
      <rect width="320" height="240" fill="url(#sky)" />
      {/* palazzi */}
      <g fill="#262c33">
        <rect x="12" y="14" width="60" height="150" />
        <rect x="78" y="40" width="82" height="124" />
        <rect x="170" y="8" width="54" height="156" />
        <rect x="232" y="30" width="80" height="134" />
      </g>
      <g fill="#3a424b">
        {windows.map(([x, y, lit], i) => (
          <rect key={i} x={x} y={y} width="14" height="18" rx="2" fill={lit ? SIGNAL : "#3a424b"} opacity={lit ? 0.85 : 1} />
        ))}
      </g>
      {/* marciapiede e strada */}
      <rect y="164" width="320" height="10" fill="#4a535c" />
      <rect y="174" width="320" height="66" fill="#1b1f24" />
      <g fill={SIGNAL}>
        {[0, 1, 2, 3, 4].map((i) => (
          <rect key={i} x={10 + i * 66} y="214" width="38" height="5" rx="2.5" />
        ))}
      </g>
      <Scooter x={74} y={92} width={196} height={129} wheel={18} tire="#8a939c" />
    </svg>
  );
}
