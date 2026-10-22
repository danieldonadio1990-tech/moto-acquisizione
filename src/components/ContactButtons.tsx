"use client";
import { IconCall, IconChat } from "./Icons";
import { contactLinks } from "@/config/business";
import { track } from "@/modules/analytics/client";

type Tone = "light" | "dark";
type Size = "md" | "sm" | "icon";

const sizes: Record<Size, string> = {
  md: "h-14 px-6 text-base",
  sm: "h-11 px-4 text-sm",
  icon: "h-14 w-14",
};

/**
 * Pulsante WhatsApp: compare solo se il numero WhatsApp aziendale è configurato (mai verso numeri di esempio).
 * Apre la conversazione con un primo messaggio precompilato.
 */
export function WhatsAppButton({ from, size = "md", className = "" }: { from: string; size?: Size; className?: string }) {
  const href = contactLinks().whatsapp;
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={size === "icon" ? "Scrivici su WhatsApp" : undefined}
      onClick={() => track("whatsapp_click", { from })}
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-ok font-extrabold uppercase tracking-wide text-paper transition-colors hover:bg-[#186646] active:translate-y-px ${sizes[size]} ${className}`}
    >
      <IconChat className="h-6 w-6 shrink-0" />
      {size !== "icon" && <span>WhatsApp</span>}
    </a>
  );
}

/**
 * Pulsante "Chiama": compare solo se il telefono aziendale è configurato. Su smartphone apre il dialer (link tel:);
 * da schermi larghi mostra anche il numero in modo leggibile (`showNumber`).
 */
export function PhoneButton({
  size = "md",
  tone = "light",
  showNumber = false,
  numberOnly = false,
  className = "",
}: {
  size?: Size;
  tone?: Tone;
  /** da schermi medi in su mostra anche il numero accanto a "Chiama" */
  showNumber?: boolean;
  /** da schermi larghi mostra solo il numero (con l'icona), al posto di "Chiama" */
  numberOnly?: boolean;
  className?: string;
}) {
  const phone = contactLinks().phone;
  if (!phone) return null;
  const palette =
    tone === "dark"
      ? "border-2 border-paper/70 text-paper hover:bg-paper hover:text-asphalt"
      : "border-2 border-asphalt text-asphalt hover:bg-asphalt hover:text-paper";
  return (
    <a
      href={phone.href}
      aria-label={size === "icon" ? `Chiama ${phone.label}` : undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-extrabold uppercase tracking-wide transition-colors active:translate-y-px ${palette} ${sizes[size]} ${className}`}
    >
      <IconCall className="h-5 w-5 shrink-0" />
      {size !== "icon" && (
        <span className="whitespace-nowrap">
          <span className={numberOnly ? "lg:hidden" : ""}>Chiama</span>
          {(showNumber || numberOnly) && (
            <span className={`normal-case tracking-normal ${numberOnly ? "hidden lg:inline" : "hidden md:inline"}`}>
              {!numberOnly && <>&nbsp;</>}
              {phone.label}
            </span>
          )}
        </span>
      )}
    </a>
  );
}

/** Quali contatti sono configurati (per decidere se mostrare titoli e contenitori). */
export function availableContacts() {
  const c = contactLinks();
  return { whatsapp: !!c.whatsapp, phone: !!c.phone, any: !!(c.whatsapp || c.phone) };
}
