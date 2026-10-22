import { ImageResponse } from "next/og";
import { BRAND } from "@/config/business";
import { ASPHALT, BLUE, MotoSymbol } from "@/components/BrandSvg";
import { WORD } from "@/components/brandPaths";

/** Anteprima per la condivisione (WhatsApp, social): logo Compro Moto + testi di src/config/business.ts. */
export const alt = `${BRAND.tagline} | ${BRAND.name}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f0f1f2",
          padding: "64px 80px",
          color: ASPHALT,
        }}
      >
        <svg width="620" height="77" viewBox="0 0 517 64">
          <MotoSymbol />
          <g transform="translate(140 47.5) skewX(-8)">
            <path fill={ASPHALT} d={WORD.compro} />
            <path fill={BLUE} d={WORD.moto} />
          </g>
        </svg>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 92, fontWeight: 800, lineHeight: 1, letterSpacing: -2 }}>Vuoi vendere il tuo scooter senza perdere tempo?</div>
          <div style={{ marginTop: 28, fontSize: 38, color: "#3a4048" }}>
            Raccontaci che mezzo hai. Se è interessante per noi, ti faremo un&apos;offerta.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ height: 14, width: 120, background: "#f5c928", borderRadius: 7, display: "flex" }} />
          <div style={{ fontSize: 30, fontWeight: 700 }}>{BRAND.area}</div>
        </div>
      </div>
    ),
    size,
  );
}
