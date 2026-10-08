import { z } from "zod";
import { MIN_YEAR, maxYear, OTHER_MODEL_ID } from "@/modules/catalog";

/** Validazione condivisa tra form (client) e API (server). */

const tri = z.enum(["yes", "no", "unknown"]);

const trimmed = (max: number) => z.string().trim().min(1, "Campo obbligatorio").max(max);

/** Accetta +39 / 0039 / spazi / trattini. Restituisce il formato +39XXXXXXXXX. */
export function normalizeItalianPhone(raw: string): string | null {
  let s = raw.replace(/[\s\-./()]/g, "");
  if (s.startsWith("0039")) s = "+39" + s.slice(4);
  if (!s.startsWith("+")) s = "+39" + s;
  if (!/^\+\d{8,15}$/.test(s)) return null;
  if (s.startsWith("+39")) {
    const national = s.slice(3);
    // cellulari (3xx) o fissi (0x), 6–11 cifre
    if (!/^(3\d{8,9}|0\d{5,10})$/.test(national)) return null;
  }
  return s;
}

export const motorcycleStepSchema = z
  .object({
    brand: trimmed(60),
    modelId: trimmed(60),
    modelOther: z.string().trim().max(80).optional(),
    version: z.string().trim().max(80).optional(),
    year: z.coerce
      .number({ error: "Indica l'anno" })
      .int()
      .min(MIN_YEAR, `Anno minimo ${MIN_YEAR}`)
      .max(maxYear(), "Anno non valido"),
    displacement: z.coerce.number().int().min(49).max(2000).optional(),
  })
  .refine((v) => v.modelId !== OTHER_MODEL_ID || (v.modelOther && v.modelOther.length > 0), {
    message: "Scrivi il modello",
    path: ["modelOther"],
  });

export const mileageStepSchema = z.object({
  mileage: z.coerce
    .number({ error: "Indica i km" })
    .int("Solo numeri interi")
    .min(0, "Valore non valido")
    .max(400000, "Valore troppo alto"),
});

export const conditionStepSchema = z.object({
  isRunning: z.boolean({ error: "Rispondi alla domanda" }),
  accident: tri,
  mechanicalIssues: tri,
  maintenance: tri,
});

export const contactStepSchema = z.object({
  firstName: trimmed(60),
  lastName: trimmed(60),
  phone: z
    .string()
    .trim()
    .transform((v, ctx) => {
      const n = normalizeItalianPhone(v);
      if (!n) {
        ctx.addIssue({ code: "custom", message: "Numero non valido" });
        return z.NEVER;
      }
      return n;
    }),
  email: z.string().trim().toLowerCase().email("Email non valida").max(120),
  city: trimmed(80),
  preferredContact: z.enum(["whatsapp", "phone", "email"]),
  privacyConsent: z.literal(true, { error: "Serve il consenso per ricontattarti" }),
});

export const leadSubmissionSchema = z.object({
  motorcycle: motorcycleStepSchema,
  mileage: mileageStepSchema.shape.mileage,
  condition: conditionStepSchema,
  contact: contactStepSchema,
  attribution: z
    .object({
      utmSource: z.string().max(100).optional(),
      utmMedium: z.string().max(100).optional(),
      utmCampaign: z.string().max(150).optional(),
    })
    .optional(),
  sessionId: z.string().max(64).optional(),
  /** honeypot anti-bot: deve restare vuoto */
  website: z.string().max(0).optional(),
});

export type LeadSubmission = z.infer<typeof leadSubmissionSchema>;
export type LeadSubmissionInput = z.input<typeof leadSubmissionSchema>;
