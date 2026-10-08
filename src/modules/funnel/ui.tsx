"use client";
import { useId } from "react";

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
      <div className={`grid gap-2 ${cols}`}>
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
              className={`flex items-center justify-center rounded-xl border-2 border-line bg-paper px-3 text-center font-semibold transition-colors duration-150 peer-checked:border-plate peer-checked:bg-plate peer-checked:text-paper peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-signal hover:border-asphalt-soft ${
                size === "lg" ? "h-16 text-lg" : "h-13 text-base"
              }`}
            >
              {o.label}
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
    <p id={id} role="alert" className="mt-2 text-sm font-semibold text-danger">
      {children}
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
      <label htmlFor={id} className="mb-1.5 block font-bold">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        className={`h-14 w-full rounded-xl border-2 bg-paper px-4 text-lg outline-none transition-colors placeholder:text-concrete/70 focus:border-plate ${
          error ? "border-danger" : "border-line"
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
      <label htmlFor={id} className="mb-1.5 block font-bold">
        {label}
      </label>
      <select
        id={id}
        aria-invalid={!!error}
        className={`h-14 w-full appearance-none rounded-xl border-2 bg-paper bg-[length:14px] bg-[right_1rem_center] bg-no-repeat px-4 pr-10 text-lg outline-none focus:border-plate ${
          error ? "border-danger" : "border-line"
        }`}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 14 9'%3E%3Cpath d='M1 1l6 6 6-6' stroke='%231e2328' stroke-width='2' fill='none'/%3E%3C/svg%3E\")",
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
    <div className="mb-8">
      <h1 className="display text-[2.75rem] leading-[0.95] sm:text-6xl">{children}</h1>
      {sub && <p className="mt-3 text-asphalt-soft">{sub}</p>}
    </div>
  );
}
