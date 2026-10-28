import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { BRAND, siteUrl } from "@/config/business";
import { indexingEnabled } from "@/config/seo";
import "./globals.css";

// Instrument Sans (testo), Big Shoulders Display (titoli) e IBM Plex Mono (dati): SIL Open Font License, self-hosted,
// nessuna richiesta a server esterni (licenze in src/fonts/OFL-brand-v2.txt)
const body = localFont({
  src: "../fonts/instrument-sans-latin-wght-normal.woff2",
  variable: "--font-body",
  weight: "400 700",
  style: "normal",
  display: "swap",
});
const display = localFont({
  src: [
    { path: "../fonts/big-shoulders-display-latin-800-normal.woff2", weight: "800", style: "normal" },
    { path: "../fonts/big-shoulders-display-latin-900-normal.woff2", weight: "900", style: "normal" },
  ],
  variable: "--font-display-face",
  display: "swap",
});
const mono = localFont({
  src: "../fonts/ibm-plex-mono-latin-400-normal.woff2",
  variable: "--font-mono-face",
  weight: "400",
  style: "normal",
  display: "swap",
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
  twitter: { card: "summary_large_image", title: `${BRAND.tagline} | ${BRAND.name}`, description: BRAND.description },
  robots: indexingEnabled() ? { index: true, follow: true } : { index: false, follow: false },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#15181b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="it" className={`${body.variable} ${display.variable} ${mono.variable} antialiased`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
