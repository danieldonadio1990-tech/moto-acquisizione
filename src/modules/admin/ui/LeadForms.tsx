"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  addOfferAction,
  changeStatusAction,
  recordPurchaseAction,
  saveNotesAction,
  setOfferStatusAction,
  undoPurchaseAction,
  type ActionState,
} from "@/app/admin/actions";
import { LEAD_STATUSES, STATUS_LABELS, type LeadStatus } from "@/modules/leads/statuses";

const input =
  "h-11 w-full rounded-lg border-2 border-line bg-paper px-3 outline-none focus:border-plate disabled:opacity-60";
const btn =
  "h-11 shrink-0 rounded-lg bg-plate px-4 font-bold text-paper hover:bg-plate-deep disabled:opacity-60";
const btnGhost = "h-9 rounded-lg px-3 text-sm font-bold ring-1 ring-line hover:ring-asphalt-soft disabled:opacity-60";

function Feedback({ state, okText = "Salvato" }: { state: ActionState; okText?: string }) {
  if (!state) return null;
  return state.error ? (
    <p role="alert" className="mt-2 text-sm font-semibold text-danger">
      {state.error}
    </p>
  ) : (
    <p role="status" className="mt-2 text-sm font-semibold text-ok">
      {okText}
    </p>
  );
}

export function StatusForm({ leadId, status }: { leadId: string; status: LeadStatus }) {
  const [state, action, pending] = useActionState(changeStatusAction, null);
  const [value, setValue] = useState<LeadStatus>(status);
  return (
    <form action={action}>
      <input type="hidden" name="leadId" value={leadId} />
      <label htmlFor="status" className="mb-1.5 block text-sm font-bold">
        Cambia stato
      </label>
      <div className="flex gap-2">
        <select
          id="status"
          name="status"
          value={value}
          onChange={(e) => setValue(e.target.value as LeadStatus)}
          className={input}
          disabled={status === "purchased"}
        >
          {LEAD_STATUSES.filter((s) => s !== "purchased" || status === "purchased").map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <button className={btn} disabled={pending || value === status}>
          {pending ? "…" : "Aggiorna"}
        </button>
      </div>
      {status !== "purchased" && (
        <p className="mt-1.5 text-xs text-concrete">Per &quot;Acquistata&quot; usa Registra acquisto, con il prezzo.</p>
      )}
      <Feedback state={state} okText="Stato aggiornato" />
    </form>
  );
}

export function NotesForm({ leadId, notes }: { leadId: string; notes: string | null }) {
  const [state, action, pending] = useActionState(saveNotesAction, null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (state?.ok) setDirty(false); // eslint-disable-line react-hooks/set-state-in-effect
  }, [state]);
  return (
    <form action={action}>
      <input type="hidden" name="leadId" value={leadId} />
      <label htmlFor="notes" className="mb-1.5 block text-sm font-bold">
        Note interne
      </label>
      <textarea
        id="notes"
        name="notes"
        defaultValue={notes ?? ""}
        rows={4}
        maxLength={5000}
        onChange={() => setDirty(true)}
        placeholder="Visibili solo al team"
        className="w-full rounded-lg border-2 border-line bg-paper p-3 outline-none focus:border-plate"
      />
      <div className="mt-2 flex items-center gap-3">
        <button className={btn} disabled={pending || !dirty}>
          {pending ? "Salvo…" : "Salva note"}
        </button>
        {!dirty && <Feedback state={state} />}
      </div>
    </form>
  );
}

export function OfferForm({ leadId, disabled }: { leadId: string; disabled?: boolean }) {
  const [state, action, pending] = useActionState(addOfferAction, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action}>
      <input type="hidden" name="leadId" value={leadId} />
      <label htmlFor="amount" className="mb-1.5 block text-sm font-bold">
        Nuova offerta (€)
      </label>
      <div className="flex gap-2">
        <input id="amount" name="amount" inputMode="numeric" placeholder="es. 1800" className={input} disabled={disabled} required />
        <button className={btn} disabled={pending || disabled}>
          {pending ? "…" : "Registra"}
        </button>
      </div>
      <Feedback state={state} okText="Offerta registrata" />
    </form>
  );
}

export function OfferOutcomeButtons({ offerId }: { offerId: string }) {
  const [state, action, pending] = useActionState(setOfferStatusAction, null);
  return (
    <form action={action} className="flex gap-2">
      <input type="hidden" name="offerId" value={offerId} />
      <button name="status" value="accepted" className={`${btnGhost} text-ok`} disabled={pending}>
        Accettata
      </button>
      <button name="status" value="rejected" className={`${btnGhost} text-danger`} disabled={pending}>
        Rifiutata
      </button>
      {state?.error && <span className="text-sm text-danger">{state.error}</span>}
    </form>
  );
}

export function PurchaseForm({ leadId, suggestedPrice }: { leadId: string; suggestedPrice?: number }) {
  const [state, action, pending] = useActionState(recordPurchaseAction, null);
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" }); // AAAA-MM-GG, ora italiana
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="leadId" value={leadId} />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="price" className="mb-1.5 block text-sm font-bold">
            Prezzo pagato (€)
          </label>
          <input
            id="price"
            name="price"
            inputMode="numeric"
            defaultValue={suggestedPrice ?? ""}
            className={input}
            required
          />
        </div>
        <div>
          <label htmlFor="date" className="mb-1.5 block text-sm font-bold">
            Data
          </label>
          <input id="date" name="date" type="date" defaultValue={today} max={today} className={input} required />
        </div>
      </div>
      <button className={`${btn} w-full bg-ok hover:bg-[#17603f]`} disabled={pending}>
        {pending ? "Registro…" : "Registra acquisto"}
      </button>
      <Feedback state={state} okText="Acquisto registrato" />
    </form>
  );
}

export function UndoPurchaseButton({ leadId }: { leadId: string }) {
  const [state, action, pending] = useActionState(undoPurchaseAction, null);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("Annullare l'acquisto registrato? Lo stato torna ad 'Accettata'.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="leadId" value={leadId} />
      <button className={btnGhost} disabled={pending}>
        Annulla acquisto
      </button>
      {state?.error && <span className="ml-2 text-sm text-danger">{state.error}</span>}
    </form>
  );
}
