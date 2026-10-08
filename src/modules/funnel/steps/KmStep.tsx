"use client";
import { useId, useRef, useState } from "react";
import { FieldError, StepTitle } from "../ui";

const DIGITS = 6;

/** Chilometraggio come un contachilometri: le cifre si accendono mentre scrivi. */
export function KmStep({
  mileage,
  onChange,
  error,
}: {
  mileage: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const padded = mileage.padStart(DIGITS, "0");
  const firstReal = DIGITS - mileage.length;

  return (
    <>
      <StepTitle sub="Lo leggi sul cruscotto. Va bene anche un valore indicativo.">Quanti km ha percorso?</StepTitle>

      <label htmlFor={id} className="sr-only">
        Chilometri percorsi
      </label>
      <div
        className={`relative mx-auto flex w-full max-w-md cursor-text items-stretch gap-1.5 rounded-2xl bg-asphalt p-3 transition-shadow sm:gap-2 sm:p-4 ${
          focused ? "ring-4 ring-signal" : ""
        } ${error ? "ring-4 ring-danger" : ""}`}
        onClick={() => inputRef.current?.focus()}
      >
        {padded.split("").map((d, i) => {
          const real = i >= firstReal && mileage.length > 0;
          return (
            <span
              key={`${i}-${real ? d : "z"}-${mileage.length}`}
              aria-hidden
              className="tabular relative flex h-20 flex-1 items-center justify-center overflow-hidden rounded-lg bg-[#2b3138] sm:h-24"
            >
              <span
                className={`display text-[2.6rem] sm:text-6xl ${real ? "digit-roll text-paper" : "text-paper/15"}`}
              >
                {d}
              </span>
              <span className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-black/40" />
            </span>
          );
        })}
        <span aria-hidden className="display flex items-end pb-1 pl-1 text-xl text-signal">
          km
        </span>
        <input
          ref={inputRef}
          id={id}
          inputMode="numeric"
          autoComplete="off"
          enterKeyHint="next"
          value={mileage}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, DIGITS))}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : undefined}
          className="absolute inset-0 h-full w-full cursor-text bg-transparent text-transparent caret-transparent opacity-0"
          autoFocus
        />
      </div>
      <p className="mt-4 text-center text-lg font-semibold tabular" aria-live="polite">
        {mileage ? `${new Intl.NumberFormat("it-IT", { useGrouping: "always" }).format(Number(mileage))} km` : " "}
      </p>
      {error && (
        <div className="text-center">
          <FieldError id={`${id}-err`}>{error}</FieldError>
        </div>
      )}
    </>
  );
}
