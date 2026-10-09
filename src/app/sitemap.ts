import type { MetadataRoute } from "next";
import { siteUrl } from "@/config/business";

/** Solo le pagine pubbliche da indicizzare (il funnel /valuta e l'admin restano fuori). */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return [
    { url: new URL("/", base).toString(), changeFrequency: "monthly", priority: 1 },
    { url: new URL("/privacy", base).toString(), changeFrequency: "yearly", priority: 0.2 },
  ];
}
