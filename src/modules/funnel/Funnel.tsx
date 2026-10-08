"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ZodError } from "zod";
import { BrandMark } from "@/components/BrandMark";
import { getModel, OTHER_MODEL_ID } from "@/modules/catalog";
import { captureAttribution, getAttribution, track } from "@/modules/analytics/client";
import { postWithRetry } from "./net";
import {
  conditionStepSchema,
  contactStepSchema,
  mileageStepSchema,
  motorcycleStepSchema,
} from "@/modules/leads/validation";
import { DONE_STEP, OTHER_BRAND, STEPS, useFunnelState, type FunnelState } from "./state";
import { MotoStep, motoPayload } from "./steps/MotoStep";
import { KmStep } from "./steps/KmStep";
import { ConditionStep } from "./steps/ConditionStep";
import { ContactStep } from "./steps/ContactStep";
import { PhotoStep, type PickedPhoto } from "./steps/PhotoStep";
import { DoneStep } from "./steps/DoneStep";

type Errors = Record<string, string>;

function zodErrors(err: ZodError): Errors {
  const out: Errors = {};
  for (const i of err.issues) {
    const k = String(i.path[i.path.length - 1] ?? "_");
    out[k] ??= i.message;
  }
  return out;
}

/** Validazione dello step corrente. Restituisce gli errori (vuoto = ok). */
function validate(step: number, s: FunnelState): Errors {
  switch (step) {
    case 0: {
      const m = s.moto;
      const errs: Errors = {};
      if (!m.brand) errs.brand = "Scegli la marca";
      if (m.brand === OTHER_BRAND && !m.brandOther.trim()) errs.brandOther = "Scrivi la marca";
      if (m.brand && m.brand !== OTHER_BRAND && !m.modelId) errs.modelId = "Scegli il modello";
      const model = getModel(m.modelId);
      if (model && model.displacements.length > 1 && !m.displacement) errs.displacement = "Scegli la cilindrata";
      if (m.modelId && !m.year) errs.year = "Scegli l'anno";
      if (Object.keys(errs).length) return errs;
      const r = motorcycleStepSchema.safeParse(motoPayload(m));
      return r.success ? {} : zodErrors(r.error);
    }
    case 1: {
      if (!s.mileage) return { mileage: "Scrivi i km, anche indicativi" };
      const r = mileageStepSchema.safeParse({ mileage: s.mileage });
      return r.success ? {} : { mileage: r.error.issues[0].message };
    }
    case 2: {
      const c = s.condition;
      const errs: Errors = {};
      if (c.isRunning === undefined) errs.isRunning = "Rispondi a questa domanda";
      if (!c.accident) errs.accident = "Rispondi a questa domanda";
      if (!c.mechanicalIssues) errs.mechanicalIssues = "Rispondi a questa domanda";
      if (!c.maintenance) errs.maintenance = "Rispondi a questa domanda";
      if (Object.keys(errs).length) return errs;
      return conditionStepSchema.safeParse(c).success ? {} : { _: "Controlla le risposte" };
    }
    case 3: {
      const r = contactStepSchema.safeParse(s.contact);
      return r.success ? {} : zodErrors(r.error);
    }
    default:
      return {};
  }
}

export function Funnel() {
  const { state, update, reset, ready } = useFunnelState();
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [photoError, setPhotoError] = useState<string>();
  const honeypot = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const topRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  const step = state.step;
  const leadCreated = !!state.lead;

  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;
    captureAttribution();
    if (state.step === 0 && !state.lead) track("funnel_start");
  }, [ready, state.step, state.lead]);

  useEffect(() => {
    topRef.current?.scrollIntoView({ block: "start" });
    window.scrollTo({ top: 0 });
  }, [step]);

  function goTo(next: number) {
    setErrors({});
    update({ step: next });
  }

  async function next() {
    const errs = validate(step, state);
    setErrors(errs);
    if (Object.keys(errs).length) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid=true], [role=alert]")?.focus?.());
      return;
    }
    if (step === 3) return submitLead();
    if (step === 4) return uploadPhotos();
    track("funnel_step_completed", { step: STEPS[step] });
    goTo(step + 1);
  }

  async function submitLead() {
    if (inFlight.current) return; // blocca il doppio click prima ancora del re-render
    inFlight.current = true;
    setSubmitting(true);
    setSubmitError(undefined);
    // stessa chiave per tutti i tentativi di QUESTO invio (anche dopo refresh): il server crea un solo lead
    const submissionId = state.submissionId ?? crypto.randomUUID();
    if (!state.submissionId) update({ submissionId });
    try {
      const res = await postWithRetry<{ id: string; code: string; uploadToken: string }>("/api/leads", {
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          submissionId,
          motorcycle: motoPayload(state.moto),
          mileage: state.mileage,
          condition: state.condition,
          contact: state.contact,
          attribution: getAttribution(),
          website: honeypot.current?.value || undefined,
        }),
      });
      if (!res.ok) {
        setSubmitError(
          res.network
            ? "Invio non riuscito: controlla la connessione e riprova. I dati inseriti restano qui."
            : res.status === 422
              ? "Alcuni dati non sono validi. Controlla i campi e riprova."
              : (res.data?.error ?? "Invio non riuscito. Riprova tra poco."),
        );
        return;
      }
      track("funnel_step_completed", { step: STEPS[3] });
      update({ lead: { id: res.data.id, code: res.data.code, uploadToken: res.data.uploadToken }, step: 4 });
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  async function uploadPhotos() {
    if (!state.lead || inFlight.current) return;
    if (photos.length === 0) {
      setPhotoError("Aggiungi almeno una foto, oppure mandale dopo su WhatsApp.");
      return;
    }
    const toSend = photos.filter((p) => p.state === "pending");
    if (toSend.length === 0 && photos.some((p) => p.state === "invalid")) {
      setPhotoError("Rimuovi le foto segnate in rosso, oppure mandale su WhatsApp.");
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    setPhotoError(undefined);
    const lead = state.lead;
    const outcome = new Map<string, Pick<PickedPhoto, "state" | "message">>();
    let fatal: string | undefined;
    let retryable = false;
    try {
      // a gruppi di 3; ogni foto ha un id: un retry non crea copie sul server
      for (let i = 0; i < toSend.length && !fatal; i += 3) {
        const batch = toSend.slice(i, i + 3);
        const res = await postWithRetry<{ results: { clientPhotoId: string; status: string; message?: string }[] }>(
          `/api/leads/${lead.id}/photos`,
          {
            headers: { "x-upload-token": lead.uploadToken },
            body: () => {
              const fd = new FormData();
              batch.forEach((p, j) => {
                fd.append("photos", p.file, `foto-${i + j + 1}.jpg`);
                fd.append("photoIds", p.id);
              });
              return fd;
            },
          },
        );
        if (!res.ok) {
          if (res.status === 403 || res.status === 429) fatal = res.data?.error ?? "Caricamento non consentito";
          else retryable = true;
          continue;
        }
        for (const r of res.data.results) {
          if (r.status === "saved" || r.status === "duplicate") outcome.set(r.clientPhotoId, { state: "saved" });
          else if (r.status === "error") {
            retryable = true;
            outcome.set(r.clientPhotoId, { state: "pending", message: r.message });
          } else outcome.set(r.clientPhotoId, { state: "invalid", message: r.message });
        }
      }
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }

    const next = photos.map((p) => (outcome.has(p.id) ? { ...p, ...outcome.get(p.id)! } : p));
    setPhotos(() => next);
    const saved = next.filter((p) => p.state === "saved").length;
    const invalid = next.filter((p) => p.state === "invalid").length;
    const pendingLeft = next.filter((p) => p.state === "pending").length;

    if (fatal) setPhotoError(fatal);
    else if (retryable || pendingLeft > 0) {
      setPhotoError('Alcune foto non sono state caricate. Premi di nuovo "Invia le foto": quelle già inviate non vengono ripetute.');
    } else if (invalid > 0) {
      setPhotoError(
        invalid === 1
          ? "1 foto non accettata (segnata in rosso): rimuovila o mandala su WhatsApp."
          : `${invalid} foto non accettate (segnate in rosso): rimuovile o mandale su WhatsApp.`,
      );
    } else if (saved > 0) {
      track("photos_uploaded", { count: saved });
      update({ photosSent: saved, step: DONE_STEP });
    }
  }

  function skipPhotos() {
    track("photos_skipped");
    goTo(DONE_STEP);
  }

  if (!ready) return <div className="min-h-dvh" />;

  const isDone = step >= DONE_STEP;
  const canGoBack = step > 0 && !isDone && !(leadCreated && step >= 4);
  const motoLabel = (() => {
    const p = motoPayload(state.moto);
    const model = p.modelId === OTHER_MODEL_ID ? p.modelOther : getModel(p.modelId)?.name;
    return [p.brand, model, p.displacement].filter(Boolean).join(" ");
  })();

  const primaryLabel =
    step === 3 ? (submitting ? "Invio…" : "Invia richiesta") : step === 4 ? (submitting ? "Carico le foto…" : "Invia le foto") : "Continua";

  return (
    <div ref={topRef} className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 bg-chalk/95 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-4 px-5 pt-4">
          {canGoBack ? (
            <button
              type="button"
              onClick={() => goTo(step - 1)}
              className="-ml-2 flex h-10 items-center gap-1 rounded-lg px-2 font-semibold"
              aria-label="Indietro"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Indietro
            </button>
          ) : (
            <BrandMark />
          )}
          {!isDone && (
            <Link
              href="/"
              onClick={() => leadCreated && reset()}
              className="text-sm font-semibold text-concrete underline-offset-4 hover:underline"
            >
              Esci
            </Link>
          )}
        </div>
        {!isDone && (
          <div className="mx-auto max-w-xl px-5 pb-3 pt-4">
            <ol className="flex gap-1.5" aria-label={`Passo ${step + 1} di ${STEPS.length}: ${STEPS[step]}`}>
              {STEPS.map((s, i) => (
                <li key={s} className="flex-1">
                  <span
                    className={`block h-1.5 rounded-full transition-colors duration-300 ${
                      i < step ? "bg-plate" : i === step ? "bg-signal" : "bg-line"
                    }`}
                  />
                  <span className={`mt-1.5 hidden text-xs font-semibold sm:block ${i === step ? "text-asphalt" : "text-concrete"}`}>
                    {s}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </header>

      <form
        className="mx-auto w-full max-w-xl flex-1 px-5 pb-40 pt-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (!submitting) next();
        }}
        noValidate
      >
        {/* honeypot anti-bot: invisibile agli utenti */}
        <input ref={honeypot} name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />

        <div key={step} className="step-in">
          {step === 0 && (
            <MotoStep moto={state.moto} errors={errors} onChange={(p) => update((s) => ({ moto: { ...s.moto, ...p } }))} />
          )}
          {step === 1 && <KmStep mileage={state.mileage} error={errors.mileage} onChange={(v) => update({ mileage: v })} />}
          {step === 2 && (
            <ConditionStep
              condition={state.condition}
              errors={errors}
              onChange={(p) => update((s) => ({ condition: { ...s.condition, ...p } }))}
            />
          )}
          {step === 3 && (
            <ContactStep
              contact={state.contact}
              errors={errors}
              submitError={submitError}
              onChange={(p) => update((s) => ({ contact: { ...s.contact, ...p } }))}
            />
          )}
          {step === 4 && <PhotoStep photos={photos} setPhotos={setPhotos} error={photoError} />}
          {isDone && state.lead && (
            <DoneStep code={state.lead.code} motoLabel={motoLabel} photosSent={state.photosSent} onHome={reset} />
          )}
        </div>

        {!isDone && (
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-chalk/95 backdrop-blur">
            <div className="mx-auto max-w-xl px-5 pb-[max(14px,env(safe-area-inset-bottom))] pt-3.5">
              <button
                type="submit"
                disabled={submitting}
                className="flex h-14 w-full items-center justify-center rounded-xl bg-plate text-lg font-bold text-paper transition-colors hover:bg-plate-deep active:bg-plate-deep disabled:opacity-70"
              >
                {primaryLabel}
              </button>
              {step === 4 && (
                <button
                  type="button"
                  onClick={skipPhotos}
                  disabled={submitting}
                  className="mt-2 h-11 w-full font-semibold text-plate underline-offset-4 hover:underline"
                >
                  Le mando dopo su WhatsApp
                </button>
              )}
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
