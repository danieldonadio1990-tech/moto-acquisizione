import Link from "next/link";
import { BRAND } from "@/config/brand";

/**
 * Segnaposto del logo: il nome del brand dentro una "targa".
 * Quando ci sarà il logo definitivo si sostituisce solo questo componente.
 */
export function BrandMark({ href = "/", tone = "light" }: { href?: string; tone?: "light" | "dark" }) {
  return (
    <Link
      href={href}
      aria-label={`${BRAND.name} — home`}
      className={`inline-flex h-9 items-stretch overflow-hidden rounded-[6px] border-2 ${
        tone === "light" ? "border-asphalt bg-paper" : "border-paper bg-paper"
      }`}
    >
      <span className="flex w-5 items-end justify-center bg-plate pb-1 text-[10px] font-bold text-paper">I</span>
      <span className="display flex items-center px-3 text-lg tracking-wide text-asphalt">{BRAND.name}</span>
    </Link>
  );
}
