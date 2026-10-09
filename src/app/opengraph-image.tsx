import { ImageResponse } from "next/og";
import { BRAND } from "@/config/business";

/** Anteprima per la condivisione (WhatsApp, social): generata dai dati di src/config/business.ts. */
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
          background: "#f5f6f3",
          padding: "72px 80px",
          color: "#1e2328",
        }}
      >
        <div style={{ display: "flex", alignItems: "stretch", border: "5px solid #1e2328", borderRadius: 12, alignSelf: "flex-start" }}>
          <div style={{ width: 34, background: "#1a3fa8", display: "flex" }} />
          <div style={{ padding: "10px 24px", fontSize: 40, fontWeight: 800, background: "#fff", display: "flex" }}>{BRAND.name}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 108, fontWeight: 800, lineHeight: 1, letterSpacing: -2 }}>Vuoi vendere la tua moto?</div>
          <div style={{ marginTop: 28, fontSize: 38, color: "#3a4048" }}>Raccontaci che moto hai: la valutiamo e ti facciamo un&apos;offerta.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ height: 14, width: 120, background: "#ffd23f", borderRadius: 7, display: "flex" }} />
          <div style={{ fontSize: 30, fontWeight: 700 }}>{BRAND.area}</div>
        </div>
      </div>
    ),
    size,
  );
}
