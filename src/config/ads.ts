/**
 * Spazi pubblicitari esterni (futuri). SPENTI per impostazione predefinita: finché `enabled` è false nessuno spazio produce
 * markup, nessuno script e nessuna richiesta di rete. Gli spazi stanno solo in pagine informative e non possono comparire nel flusso
 * di valutazione (/valuta, conferma), nel back office né nelle email. Vedi docs/PUBBLICITA.md.
 */
export type AdKind = "partner" | "platform";

export type AdSlotConfig = {
  /** tipi ammessi: "partner" = immagine/testo statici con link sponsorizzato; "platform" = script di una piattaforma (richiede consenso) */
  allowed: readonly AdKind[];
};

export const ADS = {
  /** interruttore generale: tutto spento finché non è approvato e configurato */
  enabled: false,
  slots: {
    "home-dopo-faq": { allowed: ["partner"] },
  } satisfies Record<string, AdSlotConfig>,
} as const;

export type AdSlotId = keyof typeof ADS.slots;

/** Contenuto di una campagna partner, statico e senza script (da compilare solo quando esiste un accordo reale). */
export type PartnerCreative = {
  href: string;
  title: string;
  body?: string;
  image?: { src: string; alt: string; width: number; height: number };
};

/** Campagne attive per spazio. Vuoto: nessun accordo, nessuna campagna. */
export const PARTNER_CREATIVES: Partial<Record<AdSlotId, PartnerCreative>> = {};

/** true solo se gli spazi sono accesi E lo spazio esiste E ha una campagna di un tipo ammesso. */
export function activeCreative(id: AdSlotId): PartnerCreative | null {
  if (!ADS.enabled) return null;
  const slot: AdSlotConfig | undefined = ADS.slots[id];
  if (!slot || !slot.allowed.includes("partner")) return null;
  return PARTNER_CREATIVES[id] ?? null;
}
