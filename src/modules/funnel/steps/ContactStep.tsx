"use client";
import Link from "next/link";
import { Choices, FieldError, StepTitle, TextField } from "../ui";
import type { FunnelState } from "../state";

type Contact = FunnelState["contact"];

/** Comuni principali della Città metropolitana di Milano (solo suggerimenti, il campo è libero). */
const COMUNI = [
  "Milano", "Sesto San Giovanni", "Cinisello Balsamo", "Legnano", "Rho", "Cologno Monzese",
  "Paderno Dugnano", "Rozzano", "San Giuliano Milanese", "Pioltello", "Bollate", "Segrate",
  "Corsico", "Abbiategrasso", "Cernusco sul Naviglio", "San Donato Milanese", "Bresso",
  "Garbagnate Milanese", "Magenta", "Parabiago", "Buccinasco", "Opera", "Peschiera Borromeo",
  "Trezzano sul Naviglio", "Senago", "Cormano", "Novate Milanese", "Assago", "Melzo", "Gorgonzola",
];

export function ContactStep({
  contact,
  onChange,
  errors,
  submitError,
}: {
  contact: Contact;
  onChange: (patch: Partial<Contact>) => void;
  errors: Record<string, string>;
  submitError?: string;
}) {
  return (
    <>
      <StepTitle sub="Li usiamo solo per ricontattarti su questa moto.">Come ti ricontattiamo?</StepTitle>
      <div className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            label="Nome"
            autoComplete="given-name"
            value={contact.firstName}
            onChange={(e) => onChange({ firstName: e.target.value })}
            error={errors.firstName}
          />
          <TextField
            label="Cognome"
            autoComplete="family-name"
            value={contact.lastName}
            onChange={(e) => onChange({ lastName: e.target.value })}
            error={errors.lastName}
          />
        </div>
        <TextField
          label="Telefono"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="333 123 4567"
          value={contact.phone}
          onChange={(e) => onChange({ phone: e.target.value })}
          error={errors.phone}
        />
        <TextField
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={contact.email}
          onChange={(e) => onChange({ email: e.target.value })}
          error={errors.email}
        />
        <TextField
          label="Comune"
          list="comuni"
          autoComplete="address-level2"
          value={contact.city}
          onChange={(e) => onChange({ city: e.target.value })}
          error={errors.city}
        />
        <datalist id="comuni">
          {COMUNI.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>

        <div className="pt-3">
          <Choices
            legend="Come preferisci essere contattato?"
            name="preferredContact"
            value={contact.preferredContact}
            options={[
              { value: "whatsapp", label: "WhatsApp" },
              { value: "phone", label: "Telefono" },
              { value: "email", label: "Email" },
            ]}
            onChange={(v) => onChange({ preferredContact: v })}
          />
        </div>

        <div className="pt-2">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={contact.privacyConsent}
              onChange={(e) => onChange({ privacyConsent: e.target.checked })}
              className="mt-0.5 h-6 w-6 shrink-0 accent-plate"
              aria-invalid={!!errors.privacyConsent}
            />
            <span className="leading-snug">
              Ho letto l&apos;
              <Link href="/privacy" target="_blank" className="font-semibold underline underline-offset-4">
                informativa privacy
              </Link>{" "}
              e accetto di essere ricontattato per la valutazione della moto.
            </span>
          </label>
          {errors.privacyConsent && <FieldError>{errors.privacyConsent}</FieldError>}
        </div>

        {submitError && (
          <div role="alert" className="rounded-xl border-2 border-danger bg-paper p-4 font-semibold text-danger">
            {submitError}
          </div>
        )}
      </div>
    </>
  );
}
