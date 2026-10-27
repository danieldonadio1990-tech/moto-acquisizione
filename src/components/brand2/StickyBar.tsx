"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

/** Barra in basso su mobile: compare quando il pulsante della prima schermata esce, sparisce alla CTA finale. Nessun tracciamento. */
export function StickyBar({ watchId, hideId }: { watchId: string; hideId: string }) {
  const [heroOut, setHeroOut] = useState(false);
  const [ended, setEnded] = useState(false);
  useEffect(() => {
    const hero = document.getElementById(watchId);
    const end = document.getElementById(hideId);
    if (!hero || !end) return;
    const a = new IntersectionObserver(([e]) => setHeroOut(!e.isIntersecting), { threshold: 0 });
    const b = new IntersectionObserver(([e]) => setEnded(e.isIntersecting || e.boundingClientRect.top < 0), { threshold: 0 });
    a.observe(hero);
    b.observe(end);
    return () => {
      a.disconnect();
      b.disconnect();
    };
  }, [watchId, hideId]);
  const show = heroOut && !ended;
  return (
    <div className="b2-sticky" data-show={show} aria-hidden={!show}>
      <Link href="/valuta" className="b2-btn" tabIndex={show ? 0 : -1}>
        <span>Valuta la tua moto</span>
        <span aria-hidden="true">→</span>
      </Link>
    </div>
  );
}
