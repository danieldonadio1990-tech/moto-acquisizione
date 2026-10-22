"use client";
import { useEffect, useState } from "react";
import { TrackedLink } from "./Track";
import { btnPrimary } from "./buttons";
import { PhoneButton, WhatsAppButton } from "./ContactButtons";

/** Su mobile, quando la CTA principale esce dallo schermo, compare una barra in basso. */
export function StickyCta({ watchId }: { watchId: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = document.getElementById(watchId);
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(!entry.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [watchId]);

  return (
    <div
      inert={!visible}
      className={`fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 shadow-[0_-6px_20px_rgba(32,37,43,0.12)] backdrop-blur transition-transform duration-300 ease-out-soft md:hidden ${
        visible ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <div className="flex gap-2">
        <TrackedLink href="/valuta" event="cta_click" label="sticky" className={`${btnPrimary} min-w-0 flex-1 px-4`}>
          Valuta la tua moto
        </TrackedLink>
        <WhatsAppButton from="sticky" size="icon" />
        <PhoneButton size="icon" />
      </div>
    </div>
  );
}
