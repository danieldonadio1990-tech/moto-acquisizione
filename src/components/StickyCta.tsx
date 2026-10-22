"use client";
import { useEffect, useState } from "react";
import { TrackedLink } from "./Track";
import { btnPrimary } from "./buttons";
import { PhoneButton, WhatsAppButton } from "./ContactButtons";

/**
 * Su mobile, quando la CTA principale esce dallo schermo, compare una barra in basso.
 * Si nasconde da quando la CTA finale (`hideId`) entra nello schermo fino alla fine della pagina: così non la duplica
 * e non ricompare sopra il footer.
 */
export function StickyCta({ watchId, hideId }: { watchId: string; hideId: string }) {
  const [heroOut, setHeroOut] = useState(false);
  const [finalReached, setFinalReached] = useState(false);

  useEffect(() => {
    const hero = document.getElementById(watchId);
    const end = document.getElementById(hideId);
    if (!hero || !end) return;
    const ioHero = new IntersectionObserver(([e]) => setHeroOut(!e.isIntersecting), { threshold: 0 });
    // finale raggiunta = visibile adesso oppure già scorsa verso l'alto
    const ioEnd = new IntersectionObserver(([e]) => setFinalReached(e.isIntersecting || e.boundingClientRect.top < 0), {
      threshold: 0,
    });
    ioHero.observe(hero);
    ioEnd.observe(end);
    return () => {
      ioHero.disconnect();
      ioEnd.disconnect();
    };
  }, [watchId, hideId]);

  const visible = heroOut && !finalReached;

  return (
    <div
      inert={!visible}
      className={`fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 shadow-[0_-6px_20px_rgba(32,37,43,0.12)] backdrop-blur transition-transform duration-300 ease-out-soft md:hidden ${
        visible ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <div className="flex gap-2">
        <TrackedLink href="/valuta" event="cta_click" label="sticky" className={`${btnPrimary} min-w-0 flex-1 whitespace-nowrap px-4 max-[359px]:px-3 max-[359px]:text-sm`}>
          <span className="max-[359px]:hidden">Valuta la tua moto</span>
          <span aria-hidden className="hidden max-[359px]:inline">
            Valuta la moto
          </span>
        </TrackedLink>
        <WhatsAppButton from="sticky" size="icon" className="max-[359px]:w-12" />
        <PhoneButton size="icon" className="max-[359px]:w-12" />
      </div>
    </div>
  );
}
