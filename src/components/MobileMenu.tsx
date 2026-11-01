"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const LINKS = [
  { href: "/#come-funziona", label: "Come funziona" },
  { href: "/#vantaggi", label: "Vantaggi" },
  { href: "/#trasparenza", label: "Prima di accettare" },
  { href: "/#domande", label: "Domande" },
  { href: "/privacy", label: "Informativa privacy" },
];

/**
 * Menu per smartphone: pulsante a 44 px e pannello sotto l'intestazione con voci alte almeno 56 px.
 * Si chiude con Esc, toccando fuori o scegliendo una voce. Da tablet in su non compare (i link sono nell'intestazione).
 */
export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <div ref={root} className="md:hidden">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls="menu-mobile"
        aria-label={open ? "Chiudi il menu" : "Apri il menu"}
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 w-11 items-center justify-center rounded-sm border-2 border-asphalt text-asphalt"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden>
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      {open && (
        <nav id="menu-mobile" aria-label="Menu" className="absolute inset-x-0 top-full border-b border-line bg-paper shadow-[0_12px_24px_rgba(21,24,27,0.14)]">
          <ul className="mx-auto max-w-6xl px-4 py-2 sm:px-6">
            {LINKS.map((l) => (
              <li key={l.href} className="border-b border-line last:border-b-0">
                <Link href={l.href} onClick={() => setOpen(false)} className="flex min-h-14 items-center justify-between text-lg font-bold">
                  {l.label}
                  <span aria-hidden className="text-concrete">→</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
