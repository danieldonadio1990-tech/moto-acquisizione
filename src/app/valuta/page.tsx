import type { Metadata } from "next";
import { BRAND } from "@/config/brand";
import { Funnel } from "@/modules/funnel/Funnel";

export const metadata: Metadata = {
  title: `Valuta la tua moto | ${BRAND.name}`,
  robots: { index: false },
};

export default function ValutaPage() {
  return <Funnel />;
}
