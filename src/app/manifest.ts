import type { MetadataRoute } from "next";
import { BRAND } from "@/config/business";

/** Scheda "aggiungi alla schermata Home" sul telefono. Le icone sono in public/icons/. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.name,
    short_name: BRAND.name,
    description: BRAND.description,
    lang: "it",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f6f3",
    theme_color: "#1a3fa8",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
