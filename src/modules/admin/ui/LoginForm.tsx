"use client";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { loginAction } from "@/app/admin/actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, null);
  const expired = useSearchParams().get("scaduta") === "1";
  return (
    <form action={action} className="mt-8 space-y-4">
      {expired && !state && (
        <p role="status" className="rounded-xl bg-signal/40 p-3 font-semibold">
          La sessione è scaduta: accedi di nuovo per continuare.
        </p>
      )}
      <div>
        <label htmlFor="email" className="mb-1.5 block font-bold">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          defaultValue={state?.email}
          key={state?.email}
          required
          className="h-12 w-full rounded-xl border-2 border-line bg-paper px-4 outline-none focus:border-plate"
        />
      </div>
      <div>
        <label htmlFor="password" className="mb-1.5 block font-bold">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-12 w-full rounded-xl border-2 border-line bg-paper px-4 outline-none focus:border-plate"
        />
      </div>
      {state?.error && (
        <p role="alert" className="font-semibold text-danger">
          {state.error}
        </p>
      )}
      <button
        disabled={pending}
        className="h-12 w-full rounded-xl bg-plate font-bold text-paper hover:bg-plate-deep disabled:opacity-70"
      >
        {pending ? "Accesso…" : "Accedi"}
      </button>
    </form>
  );
}
