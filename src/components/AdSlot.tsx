import { activeCreative, type AdSlotId } from "@/config/ads";

/**
 * Spazio per una campagna di un partner. Non produce nulla (nessun markup, script o richiesta) finché `ADS.enabled` è false
 * o lo spazio non ha una campagna. Contenuto statico, etichettato «Sponsorizzato», link rel="sponsored": nessun tracciamento di terzi.
 * Non va mai usato in /valuta, nella conferma, nel back office o nelle email.
 */
export function AdSlot({ id }: { id: AdSlotId }) {
  const c = activeCreative(id);
  if (!c) return null;
  return (
    <aside aria-label="Contenuto sponsorizzato" className="mx-auto max-w-6xl px-4 pb-12 sm:px-6 lg:px-8">
      <p className="label text-concrete">Sponsorizzato</p>
      <a href={c.href} rel="sponsored noopener noreferrer" target="_blank" className="mt-2 block border border-line bg-paper p-4 hover:border-asphalt">
        {c.image && (
          // eslint-disable-next-line @next/next/no-img-element -- immagine statica del partner, dimensioni dichiarate
          <img src={c.image.src} alt={c.image.alt} width={c.image.width} height={c.image.height} className="mb-3 h-auto w-full" />
        )}
        <span className="display block text-2xl">{c.title}</span>
        {c.body && <span className="mt-1 block text-asphalt-soft">{c.body}</span>}
      </a>
    </aside>
  );
}
