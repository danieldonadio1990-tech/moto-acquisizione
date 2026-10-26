import { ImageResponse } from "next/og";
import { BRAND } from "@/config/business";

/** Anteprima per la condivisione (WhatsApp, social): logo tipografico Compriamo Moto + testi di src/config/business.ts. */
export const alt = `${BRAND.tagline} | ${BRAND.name}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#0B1220";
const BLUE = "#2563EB";

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
          background: INK,
          padding: "72px 84px",
          color: "#ffffff",
        }}
      >
        <div style={{ display: "flex", fontSize: 40, fontWeight: 800, letterSpacing: 6, textTransform: "uppercase" }}>
          <span>Compriamo</span>
          <span style={{ color: "#7FB0FF", marginLeft: 22 }}>Moto</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 84, fontWeight: 800, lineHeight: 1.04, letterSpacing: -2 }}>Valuta la tua moto in pochi passaggi.</div>
          <div style={{ marginTop: 28, fontSize: 36, color: "#CBD5E1" }}>
            Acquistiamo la tua moto direttamente da te, con una procedura chiara.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ height: 8, width: 120, background: BLUE, borderRadius: 4, display: "flex" }} />
          <div style={{ fontSize: 30, fontWeight: 700 }}>{BRAND.area}</div>
        </div>
      </div>
    ),
    size,
  );
}
