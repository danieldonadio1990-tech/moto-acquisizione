import type { MetadataRoute } from "next";
import { siteUrl } from "@/config/business";
import { indexingEnabled } from "@/config/seo";

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  if (!indexingEnabled()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api", "/valuta"] },
    sitemap: new URL("/sitemap.xml", base).toString(),
    host: base.origin,
  };
}
