import { z } from "zod";
import { SELLER_TYPES } from "@/db/schema";

/**
 * Validazione dei moduli della scheda di valutazione (back office). Importi in EURO INTERI (come il resto del back office),
 * convertiti in centesimi dal servizio. Campi vuoti = «non inserito» (null), mai zero.
 */
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Massimo ${max} caratteri`)
    .transform((v) => (v === "" ? null : v));

/** Euro interi facoltativi: "" → null. */
const optEuros = (label: string) =>
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === "") return null;
      if (!/^\d{1,6}$/.test(v)) {
        ctx.addIssue({ code: "custom", message: `${label}: usa un importo intero in euro, senza decimali` });
        return z.NEVER;
      }
      const n = Number(v);
      if (n < 1 || n > 100_000) {
        ctx.addIssue({ code: "custom", message: `${label}: importo fuori dai limiti (1–100.000 €)` });
        return z.NEVER;
      }
      return n * 100;
    });

const optInt = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === "") return null;
      if (!/^\d{1,7}$/.test(v) || Number(v) < min || Number(v) > max) {
        ctx.addIssue({ code: "custom", message: `${label}: valore non valido (${min}–${max})` });
        return z.NEVER;
      }
      return Number(v);
    });

export const comparableInputSchema = z.object({
  url: z
    .string()
    .trim()
    .max(500, "Link troppo lungo")
    .refine((u) => {
      try {
        const x = new URL(u);
        return x.protocol === "https:" || x.protocol === "http:";
      } catch {
        return false;
      }
    }, "Inserisci il link completo dell'annuncio (http:// o https://)"),
  priceCents: optEuros("Prezzo").refine((v) => v !== null, "Il prezzo dell'annuncio è obbligatorio"),
  brand: z.string().trim().min(1, "Marca obbligatoria").max(80),
  model: z.string().trim().min(1, "Modello obbligatorio").max(80),
  year: optInt("Anno", 1950, new Date().getFullYear() + 1),
  mileage: optInt("Chilometri", 0, 500_000),
  location: text(80),
  condition: text(200),
  description: text(1000),
  sellerType: z.enum(SELLER_TYPES, { error: "Tipo di venditore non valido" }),
});
export type ComparableInput = z.output<typeof comparableInputSchema>;

/** Una nota di motivazione: almeno 5 caratteri se il valore a cui si riferisce è presente. */
const note = text(500);

export const appraisalInputSchema = z
  .object({
    comparablesValueCents: optEuros("Valore dei comparabili"),
    comparablesValueNote: note,
    resaleValueCents: optEuros("Valore di rivendita previsto"),
    resaleValueNote: note,
    discountCents: optEuros("Sconto della prima offerta"),
    manualFirstOfferCents: optEuros("Prima offerta manuale"),
    firstOfferReason: note,
    targetPriceCents: optEuros("Prezzo obiettivo"),
    targetPriceNote: note,
    declaredAskingPriceCents: optEuros("Prezzo richiesto dal cliente"),
    accessories: text(500),
    cosmeticCondition: text(500),
    defects: text(1000),
    maintenanceRecords: text(1000),
    revisionNote: text(300),
  })
  .superRefine((v, ctx) => {
    const need = (ok: boolean, path: string, message: string) => {
      if (!ok) ctx.addIssue({ code: "custom", path: [path], message });
    };
    const has = (s: string | null) => s !== null && s.length >= 5;
    need(v.resaleValueCents === null || has(v.resaleValueNote), "resaleValueNote", "Motiva il valore di rivendita previsto (almeno 5 caratteri)");
    need(v.manualFirstOfferCents === null || has(v.firstOfferReason), "firstOfferReason", "La prima offerta manuale richiede un motivo (almeno 5 caratteri)");
    need(v.targetPriceCents === null || has(v.targetPriceNote), "targetPriceNote", "Motiva il prezzo obiettivo (almeno 5 caratteri)");
  });
export type AppraisalInput = z.output<typeof appraisalInputSchema>;

export const exclusionReasonSchema = z.string().trim().min(5, "Indica perché escludi l'annuncio (almeno 5 caratteri)").max(300);
