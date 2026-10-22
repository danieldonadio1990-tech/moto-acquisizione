"use client";
import { useEffect, useState } from "react";
import { TrackedLink } from "./Track";
import { btnPrimary } from "./buttons";

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
      <TrackedLink
        href="/valuta"
        event="cta_click"
        label="sticky"
        className={`${btnPrimary} w-full`}
      >
        Valuta la tua moto
      </TrackedLink>
    </div>
  );
}
