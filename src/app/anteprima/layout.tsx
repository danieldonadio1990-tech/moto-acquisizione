import type { Metadata } from "next";
import localFont from "next/font/local";
import { notFound } from "next/navigation";
import "./anteprima.css";

const display = localFont({
  src: [
    { path: "../../fonts/big-shoulders-display-latin-800-normal.woff2", weight: "800", style: "normal" },
    { path: "../../fonts/big-shoulders-display-latin-900-normal.woff2", weight: "900", style: "normal" },
  ],
  variable: "--b2-font-display",
  display: "swap",
});
const body = localFont({
  src: "../../fonts/instrument-sans-latin-wght-normal.woff2",
  variable: "--b2-font-body",
  weight: "400 700",
  display: "swap",
});
const mono = localFont({
  src: "../../fonts/ibm-plex-mono-latin-400-normal.woff2",
  variable: "--b2-font-mono",
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Anteprima brand",
  robots: { index: false, follow: false },
};

/**
 * Anteprima di design del nuovo marchio: non è pubblicata. In produzione la rotta risponde 404 se non è attivata
 * con BRAND_PREVIEW=1, non è nella sitemap ed è esclusa dall'indicizzazione. Nessun database, nessun tracciamento.
 */
export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production" && process.env.BRAND_PREVIEW !== "1") notFound();
  return <div className={`b2 ${display.variable} ${body.variable} ${mono.variable}`}>{children}</div>;
}
