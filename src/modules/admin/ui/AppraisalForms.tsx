"use client";
import { useActionState, useState } from "react";
import { addComparableAction, saveAppraisalAction, setComparableIncludedAction, type ActionState } from "@/app/admin/actions";

/** Moduli della scheda di valutazione (solo back office). Importi in euro interi: il calcolo avviene sul server. */
const input = "h-11 w-full rounded-lg border-2 border-line bg-paper px-3 outline-none focus:border-asphalt disabled:opacity-60";
const area = "w-full rounded-lg border-2 border-line bg-paper px-3 py-2 outline-none focus:border-asphalt";
const btn = "h-11 shrink-0 rounded-lg bg-plate px-4 font-bold text-asphalt hover:bg-plate-deep disabled:opacity-60";
const btnGhost = "h-9 rounded-lg px-3 text-sm font-bold ring-1 ring-line hover:ring-asphalt-soft disabled:opacity-60";
const label = "mb-1 block text-sm font-bold";

function Feedback({ state, okText }: { state: ActionState; okText: string }) {
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

function Field({ id, text, hint, children }: { id: string; text: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={label}>
        {text}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-concrete">{hint}</p>}
    </div>
  );
}

export function ComparableForm({ leadId, defaults }: { leadId: string; defaults: { brand: string; model: string } }) {
  const [state, action, pending] = useActionState(addComparableAction, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="leadId" value={leadId} />
      <Field id="cmp-url" text="Link dell'annuncio">
        <input id="cmp-url" name="url" type="url" required maxLength={500} placeholder="https://…" className={input} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id="cmp-price" text="Prezzo richiesto (€)">
          <input id="cmp-price" name="price" inputMode="numeric" pattern="\d{1,6}" required className={input} />
        </Field>
        <Field id="cmp-brand" text="Marca">
          <input id="cmp-brand" name="brand" required maxLength={80} defaultValue={defaults.brand} className={input} />
        </Field>
        <Field id="cmp-model" text="Modello">
          <input id="cmp-model" name="model" required maxLength={80} defaultValue={defaults.model} className={input} />
        </Field>
        <Field id="cmp-year" text="Anno">
          <input id="cmp-year" name="year" inputMode="numeric" pattern="\d{4}" className={input} />
        </Field>
        <Field id="cmp-km" text="Chilometri">
          <input id="cmp-km" name="mileage" inputMode="numeric" pattern="\d{1,7}" className={input} />
        </Field>
        <Field id="cmp-loc" text="Località">
          <input id="cmp-loc" name="location" maxLength={80} className={input} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id="cmp-cond" text="Condizioni">
          <input id="cmp-cond" name="condition" maxLength={200} className={input} />
        </Field>
        <Field id="cmp-seller" text="Venditore">
          <select id="cmp-seller" name="sellerType" defaultValue="unknown" className={input}>
            <option value="unknown">Non identificabile</option>
            <option value="private">Privato</option>
            <option value="dealer">Concessionario / commerciante</option>
          </select>
        </Field>
      </div>
      <Field id="cmp-desc" text="Descrizione (sintesi)" hint="Solo i dati utili al confronto: niente nomi o contatti del venditore.">
        <textarea id="cmp-desc" name="description" maxLength={1000} rows={2} className={area} />
      </Field>
      <button className={btn} disabled={pending}>
        {pending ? "Salvo…" : "Aggiungi comparabile"}
      </button>
      <Feedback state={state} okText="Comparabile aggiunto" />
    </form>
  );
}

/**
 * Riquadro «Aggiungi un annuncio comparabile». Aperto/chiuso è stato del client: dopo il salvataggio la pagina si aggiorna
 * dal server e un <details> tornerebbe chiuso nascondendo la conferma; così resta aperto per inserire il successivo.
 */
export function AddComparableBox({ leadId, defaults }: { leadId: string; defaults: { brand: string; model: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl ring-1 ring-line">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="w-full px-4 py-3 text-left text-sm font-bold">
        {open ? "▾" : "▸"} Aggiungi un annuncio comparabile
      </button>
      {open && (
        <div className="px-4 pb-4">
          <p className="mb-3 text-xs text-concrete">
            Inserimento manuale: il sito non cerca annunci da solo. Riporta solo dati dell&apos;annuncio, senza inventare valori mancanti.
          </p>
          <ComparableForm leadId={leadId} defaults={defaults} />
        </div>
      )}
    </div>
  );
}

export function ComparableInclusionForm({ leadId, comparableId, included }: { leadId: string; comparableId: string; included: boolean }) {
  const [state, action, pending] = useActionState(setComparableIncludedAction, null);
  const [open, setOpen] = useState(false);
  if (!included) {
    return (
      <form action={action}>
        <input type="hidden" name="leadId" value={leadId} />
        <input type="hidden" name="comparableId" value={comparableId} />
        <input type="hidden" name="include" value="true" />
        <button className={btnGhost} disabled={pending}>
          Includi di nuovo
        </button>
        <Feedback state={state} okText="Incluso" />
      </form>
    );
  }
  return open ? (
    <form action={action} className="flex flex-wrap items-start gap-2">
      <input type="hidden" name="leadId" value={leadId} />
      <input type="hidden" name="comparableId" value={comparableId} />
      <input type="hidden" name="include" value="false" />
      <input name="reason" required minLength={5} maxLength={300} placeholder="Motivo dell'esclusione" aria-label="Motivo dell'esclusione" className="h-9 min-w-0 flex-1 rounded-lg border-2 border-line px-2 text-sm" />
      <button className={btnGhost} disabled={pending}>
        Escludi
      </button>
      <Feedback state={state} okText="Escluso" />
    </form>
  ) : (
    <button type="button" className={btnGhost} onClick={() => setOpen(true)}>
      Escludi dal calcolo
    </button>
  );
}

export type AppraisalDefaults = {
  comparablesValue: string;
  comparablesValueNote: string;
  resaleValue: string;
  resaleValueNote: string;
  discount: string;
  manualFirstOffer: string;
  firstOfferReason: string;
  targetPrice: string;
  targetPriceNote: string;
  declaredAskingPrice: string;
  accessories: string;
  cosmeticCondition: string;
  defects: string;
  maintenanceRecords: string;
};

export function AppraisalForm({
  leadId,
  defaults,
  medianEuros,
  discountRange,
}: {
  leadId: string;
  defaults: AppraisalDefaults;
  medianEuros: number | null;
  discountRange: { min: number; max: number } | null;
}) {
  const [state, action, pending] = useActionState(saveAppraisalAction, null);
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="leadId" value={leadId} />

      <fieldset className="rounded-xl border border-line p-4">
        <legend className="px-2 text-sm font-bold">Dati dichiarati dal cliente al contatto (non raccolti dal modulo del sito)</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="ap-asking" text="Prezzo richiesto dal cliente (€)">
            <input id="ap-asking" name="declaredAskingPriceCents" inputMode="numeric" pattern="\d{1,6}" defaultValue={defaults.declaredAskingPrice} className={input} />
          </Field>
          <Field id="ap-acc" text="Accessori">
            <input id="ap-acc" name="accessories" maxLength={500} defaultValue={defaults.accessories} className={input} />
          </Field>
          <Field id="ap-cos" text="Condizioni estetiche">
            <textarea id="ap-cos" name="cosmeticCondition" maxLength={500} rows={2} defaultValue={defaults.cosmeticCondition} className={area} />
          </Field>
          <Field id="ap-def" text="Danni o difetti dichiarati">
            <textarea id="ap-def" name="defects" maxLength={1000} rows={2} defaultValue={defaults.defects} className={area} />
          </Field>
          <Field id="ap-mnt" text="Manutenzione e tagliandi">
            <textarea id="ap-mnt" name="maintenanceRecords" maxLength={1000} rows={2} defaultValue={defaults.maintenanceRecords} className={area} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="rounded-xl border border-line p-4">
        <legend className="px-2 text-sm font-bold">Valori (separati)</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            id="ap-cmp"
            text="Valore dei comparabili (€)"
            hint={medianEuros !== null ? `Mediana degli annunci inclusi: ${medianEuros.toLocaleString("it-IT")} €. Se scrivi un valore diverso, motivalo.` : "Nessun comparabile incluso: se inserisci un valore, motivalo."}
          >
            <input id="ap-cmp" name="comparablesValueCents" inputMode="numeric" pattern="\d{1,6}" defaultValue={defaults.comparablesValue} className={input} />
          </Field>
          <Field id="ap-cmp-note" text="Motivo (se diverso dalla mediana)">
            <input id="ap-cmp-note" name="comparablesValueNote" maxLength={500} defaultValue={defaults.comparablesValueNote} className={input} />
          </Field>
          <Field id="ap-res" text="Valore di rivendita previsto (€)" hint="Stima interna: serve solo a verificare la sostenibilità.">
            <input id="ap-res" name="resaleValueCents" inputMode="numeric" pattern="\d{1,6}" defaultValue={defaults.resaleValue} className={input} />
          </Field>
          <Field id="ap-res-note" text="Motivo del valore di rivendita (obbligatorio se presente)">
            <input id="ap-res-note" name="resaleValueNote" maxLength={500} defaultValue={defaults.resaleValueNote} className={input} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="rounded-xl border border-line p-4">
        <legend className="px-2 text-sm font-bold">Offerte</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            id="ap-disc"
            text="Sconto della prima offerta (€)"
            hint={discountRange ? `Intervallo approvato: ${discountRange.min.toLocaleString("it-IT")}–${discountRange.max.toLocaleString("it-IT")} € sotto il valore dei comparabili.` : "Intervallo dello sconto non configurato nei parametri approvati."}
          >
            <input id="ap-disc" name="discountCents" inputMode="numeric" pattern="\d{1,6}" defaultValue={defaults.discount} className={input} />
          </Field>
          <div />
          <Field id="ap-man" text="Prima offerta manuale (€, facoltativa)" hint="Solo entro il massimo sostenibile, con motivo. Sostituisce quella calcolata.">
            <input id="ap-man" name="manualFirstOfferCents" inputMode="numeric" pattern="\d{1,6}" defaultValue={defaults.manualFirstOffer} className={input} />
          </Field>
          <Field id="ap-man-reason" text="Motivo della prima offerta manuale">
            <input id="ap-man-reason" name="firstOfferReason" maxLength={500} defaultValue={defaults.firstOfferReason} className={input} />
          </Field>
          <Field id="ap-target" text="Prezzo obiettivo di acquisto (€)" hint="Manuale: deciso durante la trattativa.">
            <input id="ap-target" name="targetPriceCents" inputMode="numeric" pattern="\d{1,6}" defaultValue={defaults.targetPrice} className={input} />
          </Field>
          <Field id="ap-target-note" text="Motivo del prezzo obiettivo (obbligatorio se presente)">
            <input id="ap-target-note" name="targetPriceNote" maxLength={500} defaultValue={defaults.targetPriceNote} className={input} />
          </Field>
        </div>
      </fieldset>

      <Field id="ap-rev" text="Nota della revisione (facoltativa)">
        <input id="ap-rev" name="revisionNote" maxLength={300} className={input} />
      </Field>
      <button className={btn} disabled={pending}>
        {pending ? "Calcolo e salvo…" : "Calcola e salva la revisione"}
      </button>
      <Feedback state={state} okText="Revisione salvata" />
    </form>
  );
}
