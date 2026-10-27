"use client";
import { useActionState } from "react";
import {
  addMarketReferenceAction,
  approveSettingsAction,
  closeValuationAction,
  confirmOfferAction,
  createSettingsDraftAction,
  recomputeValuationAction,
  setManualOfferAction,
  type ActionState,
} from "@/app/admin/actions";
import { PARAM_GROUPS } from "@/modules/valuation/fields";

const input = "h-11 w-full rounded-lg border-2 border-line bg-paper px-3 outline-none focus:border-asphalt disabled:opacity-60";
const btn = "h-11 shrink-0 rounded-lg bg-plate px-4 font-bold text-asphalt hover:bg-plate-deep disabled:opacity-60";
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

export function RecomputeButton({ leadId }: { leadId: string }) {
  const [state, action, pending] = useActionState(recomputeValuationAction, null);
  return (
    <form action={action}>
      <input type="hidden" name="leadId" value={leadId} />
      <button className={btnGhost} disabled={pending}>
        {pending ? "Calcolo…" : "Ricalcola la valutazione"}
      </button>
      <Feedback state={state} okText="Nuova revisione creata" />
    </form>
  );
}

export function ManualOfferForm({ leadId, maxEuros }: { leadId: string; maxEuros: number | null }) {
  const [state, action, pending] = useActionState(setManualOfferAction, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="leadId" value={leadId} />
      <label htmlFor="manual-amount" className="block text-sm font-bold">
        Offerta manuale (euro interi)
      </label>
      <input id="manual-amount" name="amount" inputMode="numeric" pattern="\d{1,6}" required className={input} />
      <label htmlFor="manual-reason" className="block text-sm font-bold">
        Motivo (obbligatorio)
      </label>
      <input id="manual-reason" name="reason" minLength={5} maxLength={500} required className={input} />
      {maxEuros !== null && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="exceed" className="mt-1 h-4 w-4" />
          <span>Confermo di superare l&apos;offerta massima calcolata ({maxEuros.toLocaleString("it-IT")} €)</span>
        </label>
      )}
      <button className={btn} disabled={pending}>
        {pending ? "Salvo…" : "Imposta offerta da confermare"}
      </button>
      <Feedback state={state} okText="Offerta impostata: ora va confermata" />
    </form>
  );
}

export function ConfirmOfferButton({ leadId, label }: { leadId: string; label: string }) {
  const [state, action, pending] = useActionState(confirmOfferAction, null);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`${label}\n\nCrea l'offerta nella richiesta. Non viene inviato nulla al cliente.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="leadId" value={leadId} />
      <button className={btn} disabled={pending}>
        {pending ? "Confermo…" : "Conferma offerta"}
      </button>
      <Feedback state={state} okText="Offerta confermata e registrata" />
    </form>
  );
}

export function CloseValuationForm({ leadId }: { leadId: string }) {
  const [state, action, pending] = useActionState(closeValuationAction, null);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="leadId" value={leadId} />
      <div>
        <label htmlFor="close-status" className="mb-1 block text-sm font-bold">
          Chiudi la valutazione
        </label>
        <select id="close-status" name="status" className={input}>
          <option value="rejected">Rifiutata</option>
          <option value="expired">Scaduta</option>
        </select>
      </div>
      <div className="min-w-48 flex-1">
        <label htmlFor="close-reason" className="mb-1 block text-sm font-bold">
          Motivo
        </label>
        <input id="close-reason" name="reason" minLength={5} maxLength={500} required className={input} />
      </div>
      <button className={btnGhost} disabled={pending}>
        Chiudi valutazione
      </button>
      <Feedback state={state} okText="Valutazione chiusa" />
    </form>
  );
}

// ---- Parametri economici -------------------------------------------------------------------------------------------------
export function SettingsDraftForm({ values }: { values: Record<string, string> }) {
  const [state, action, pending] = useActionState(createSettingsDraftAction, null);
  return (
    <form action={action} className="space-y-6">
      {PARAM_GROUPS.map((g) => (
        <fieldset key={g.title} className="rounded-xl border border-line p-4">
          <legend className="px-2 text-sm font-bold">{g.title}</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {g.fields.map((f) => (
              <div key={f.path}>
                {f.kind === "bool" ? (
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" name={f.path} defaultChecked={values[f.path] === "true"} className="mt-1 h-4 w-4" />
                    <span>{f.label}</span>
                  </label>
                ) : f.kind === "basis" ? (
                  <>
                    <label htmlFor={f.path} className="mb-1 block text-sm font-bold">
                      {f.label}
                    </label>
                    <select id={f.path} name={f.path} defaultValue={values[f.path]} className={input}>
                      <option value="median">Mediana</option>
                      <option value="p25">25° percentile</option>
                      <option value="lower_of_median_p25">La più prudente tra mediana e 25° percentile</option>
                    </select>
                  </>
                ) : (
                  <>
                    <label htmlFor={f.path} className="mb-1 block text-sm font-bold">
                      {f.label} <span className="font-normal text-concrete">{f.kind === "eur" ? "(€)" : f.kind === "pct" ? "(%)" : ""}</span>
                    </label>
                    <input id={f.path} name={f.path} defaultValue={values[f.path]} inputMode="decimal" required className={input} />
                  </>
                )}
                {f.hint && <p className="mt-1 text-xs text-concrete">{f.hint}</p>}
              </div>
            ))}
          </div>
        </fieldset>
      ))}
      <div>
        <label htmlFor="note" className="mb-1 block text-sm font-bold">
          Nota sulla versione
        </label>
        <input id="note" name="note" maxLength={300} className={input} />
      </div>
      <button className={btn} disabled={pending}>
        {pending ? "Salvo…" : "Salva come bozza"}
      </button>
      <Feedback state={state} okText="Bozza salvata. Ora va approvata." />
    </form>
  );
}

export function ApproveSettingsButton({ settingsId, version }: { settingsId: string; version: number }) {
  const [state, action, pending] = useActionState(approveSettingsAction, null);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`Approvare la versione ${version}? Diventa quella usata per tutte le nuove valutazioni.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="settingsId" value={settingsId} />
      <button className={btnGhost} disabled={pending}>
        Approva versione {version}
      </button>
      <Feedback state={state} okText="Versione approvata" />
    </form>
  );
}

export function MarketReferenceForm() {
  const [state, action, pending] = useActionState(addMarketReferenceAction, null);
  const f = (id: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-bold">
        {label}
      </label>
      <input id={id} name={id} className={input} {...props} />
    </div>
  );
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      {f("brand", "Marca", { required: true, maxLength: 60 })}
      {f("family", "Famiglia del modello (vuoto = tutta la marca)", { maxLength: 60 })}
      {f("yearFrom", "Dall'anno", { required: true, inputMode: "numeric" })}
      {f("yearTo", "All'anno", { required: true, inputMode: "numeric" })}
      {f("median", "Mediana (€)", { required: true, inputMode: "decimal" })}
      {f("sampleCount", "Numero di casi", { required: true, inputMode: "numeric" })}
      {f("p25", "25° percentile (€, facoltativo)", { inputMode: "decimal" })}
      {f("p75", "75° percentile (€, facoltativo)", { inputMode: "decimal" })}
      <div>
        <label htmlFor="kind" className="mb-1 block text-sm font-bold">
          Tipo di prezzo
        </label>
        <select id="kind" name="kind" className={input} defaultValue="sold">
          <option value="sold">Prezzi effettivi di vendita</option>
          <option value="internal">Vendite interne</option>
          <option value="asking">Prezzi richiesti (annunci)</option>
          <option value="manual">Stima manuale</option>
        </select>
      </div>
      {f("asOf", "Data della rilevazione", { required: true, type: "date" })}
      <div className="sm:col-span-2">{f("source", "Fonte (obbligatoria: nome del listino, periodo, metodo)", { required: true, minLength: 3, maxLength: 200 })}</div>
      <div className="sm:col-span-2">
        <button className={btn} disabled={pending}>
          {pending ? "Salvo…" : "Aggiungi riferimento"}
        </button>
        <Feedback state={state} okText="Riferimento aggiunto" />
      </div>
    </form>
  );
}
