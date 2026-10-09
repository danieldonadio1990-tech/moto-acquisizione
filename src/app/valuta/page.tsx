import type { Metadata } from "next";
import { Funnel } from "@/modules/funnel/Funnel";

export const metadata: Metadata = {
  title: "Valuta la tua moto",
  alternates: { canonical: "/valuta" },
  robots: { index: false, follow: false },
};

export default function ValutaPage() {
  return <Funnel />;
}
