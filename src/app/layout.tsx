import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { BRAND, siteUrl } from "@/config/business";
import { indexingEnabled } from "@/config/seo";
import "./globals.css";

// Archivo (SIL Open Font License), self-hosted: nessuna richiesta a server esterni
const archivo = localFont({
  src: "../fonts/archivo-latin-wdth-normal.woff2",
  variable: "--font-archivo",
  weight: "100 900",
  style: "normal",
  display: "swap",
  declarations: [{ prop: "font-stretch", value: "62% 125%" }],
});

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: { default: `${BRAND.tagline} | ${BRAND.name}`, template: `%s | ${BRAND.name}` },
  description: BRAND.description,
  applicationName: BRAND.name,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "it_IT",
    siteName: BRAND.name,
    title: `${BRAND.tagline} | ${BRAND.name}`,
    description: BRAND.description,
    url: "/",
  },
  twitter: { card: "summary_large_image" },
  robots: indexingEnabled() ? { index: true, follow: true } : { index: false, follow: false },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#1a3fa8",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="it" className={`${archivo.variable} antialiased`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
