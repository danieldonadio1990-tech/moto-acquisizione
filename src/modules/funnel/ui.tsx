"use client";
import { useId } from "react";
import { IconAlert, IconCheck } from "@/components/Icons";

/** Gruppo di scelte a "pulsante" basato su radio native (accessibile da tastiera e screen reader). */
export function Choices<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
  error,
  columns = 3,
  size = "md",
}: {
  legend: string;
  name: string;
  value: T | undefined;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  error?: string;
  columns?: 2 | 3 | 4;
  size?: "md" | "lg";
}) {
  const errId = useId();
  const cols = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-2 sm:grid-cols-4" }[columns];
  return (
    <fieldset aria-describedby={error ? errId : undefined}>
      <legend className="mb-3 text-lg font-bold leading-snug">{legend}</legend>
      <div className={`grid gap-2.5 ${cols}`}>
        {options.map((o) => (
          <label key={o.value} className="relative cursor-pointer">
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="peer sr-only"
            />
            <span
              className={`flex items-center justify-center rounded-xl border-2 border-field bg-paper px-3 text-center font-bold transition-colors duration-150 hover:border-asphalt-soft peer-checked:border-plate peer-checked:bg-plate peer-checked:text-paper peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-plate ${
                size === "lg" ? "min-h-16 text-lg" : "min-h-14 text-base"
              }`}
            >
              {o.label}
            </span>
            <span
              aria-hidden
              className="pointer-events-none absolute -right-1.5 -top-1.5 hidden h-6 w-6 items-center justify-center rounded-full bg-signal text-asphalt ring-2 ring-paper peer-checked:flex"
            >
              <IconCheck className="h-3 w-3" />
            </span>
          </label>
        ))}
      </div>
      {error && <FieldError id={errId}>{error}</FieldError>}
    </fieldset>
  );
}

export function FieldError({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <p id={id} role="alert" className="mt-2 flex items-start gap-1.5 text-sm font-bold text-danger">
      <IconAlert className="mt-px h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export function TextField({
  label,
  error,
  hint,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-base font-bold">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        className={`h-14 w-full rounded-xl border-2 bg-paper px-4 text-lg outline-none transition-colors placeholder:text-concrete focus:border-plate focus:ring-4 focus:ring-plate/20 ${
          error ? "border-danger bg-danger/5" : "border-field"
        }`}
        {...props}
      />
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-concrete">
          {hint}
        </p>
      )}
      {error && <FieldError id={`${id}-err`}>{error}</FieldError>}
    </div>
  );
}

export function SelectField({
  label,
  error,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-base font-bold">
        {label}
      </label>
      <select
        id={id}
        aria-invalid={!!error}
        className={`h-14 w-full appearance-none rounded-xl border-2 bg-paper bg-[length:14px] bg-[right_1rem_center] bg-no-repeat px-4 pr-10 text-lg outline-none focus:border-plate focus:ring-4 focus:ring-plate/20 ${
          error ? "border-danger bg-danger/5" : "border-field"
        }`}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 14 9'%3E%3Cpath d='M1 1l6 6 6-6' stroke='%2320252b' stroke-width='2' fill='none'/%3E%3C/svg%3E\")",
        }}
        {...props}
      >
        {children}
      </select>
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}

export function StepTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-7">
      <h1 className="display text-4xl leading-[0.98] sm:text-5xl">{children}</h1>
      {sub && <p className="mt-3 leading-snug text-asphalt-soft">{sub}</p>}
    </div>
  );
}
