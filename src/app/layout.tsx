import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { BRAND } from "@/config/brand";
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
  title: `Vendi la tua moto a Milano | ${BRAND.name}`,
  description:
    "Hai una moto o uno scooter da vendere a Milano? Raccontaci che moto hai: la valutiamo e, se ci interessa, ti facciamo un'offerta.",
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
