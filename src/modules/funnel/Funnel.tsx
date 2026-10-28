"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ZodError } from "zod";
import { BrandMark } from "@/components/BrandMark";
import { btnOutline, btnPrimary } from "@/components/buttons";
import { hasWhatsapp } from "@/config/business";
import { getModel, OTHER_MODEL_ID } from "@/modules/catalog";
import { captureAttribution, getAttribution, track } from "@/modules/analytics/client";
import { postWithRetry } from "./net";
import { MAX_FILES_PER_REQUEST, UPLOAD_BATCH_BYTES } from "@/modules/photos/limits";
import { describeUploadFailure } from "./photo-feedback";
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
import type { PublicValuation } from "@/modules/valuation/public";

/** Attesa prima di riprovare con un gettone nuovo: poco più dell'età minima richiesta dal server (3 s) */
const FORM_TOKEN_WAIT_MS = 3_500;

async function refreshFormToken(ref: { current: string | null }) {
  try {
    const res = await fetch("/api/leads/form-token", { cache: "no-store" });
    if (res.ok) ref.current = ((await res.json()) as { token?: string }).token ?? null;
  } catch {
    // senza rete si riprova all'invio: l'invio stesso ha già la gestione degli errori di rete
  }
}

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

/** Raggruppa le foto in invii che rispettano i limiti dell'hosting. */
function batchPhotos(list: PickedPhoto[]): PickedPhoto[][] {
  const out: PickedPhoto[][] = [];
  let cur: PickedPhoto[] = [];
  let bytes = 0;
  for (const p of list) {
    if (cur.length && (cur.length >= MAX_FILES_PER_REQUEST || bytes + p.file.size > UPLOAD_BATCH_BYTES)) {
      out.push(cur);
      cur = [];
      bytes = 0;
    }
    cur.push(p);
    bytes += p.file.size;
  }
  if (cur.length) out.push(cur);
  return out;
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
  const formToken = useRef<string | null>(null);

  const step = state.step;
  const leadCreated = !!state.lead;

  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;
    captureAttribution();
    if (state.step === 0 && !state.lead) track("valuation_start");
  }, [ready, state.step, state.lead]);

  // gettone anti-bot del modulo: richiesto all'apertura e rinnovato ogni 45 minuti (scade dopo 2 ore)
  useEffect(() => {
    if (!ready) return;
    void refreshFormToken(formToken);
    const t = window.setInterval(() => void refreshFormToken(formToken), 45 * 60 * 1000);
    return () => window.clearInterval(t);
  }, [ready]);

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
    track("step_completed", { step: STEPS[step] });
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
      const post = async () => {
        if (!formToken.current) await refreshFormToken(formToken);
        return postWithRetry<{ id: string; code: string; uploadToken: string; valuation?: PublicValuation }>("/api/leads", {
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            submissionId,
            motorcycle: motoPayload(state.moto),
            mileage: state.mileage,
            condition: state.condition,
            contact: state.contact,
            attribution: getAttribution(),
            formToken: formToken.current ?? undefined,
            website: honeypot.current?.value || undefined,
          }),
        });
      };
      let res = await post();
      // gettone scaduto, non valido o troppo recente: se ne chiede uno nuovo e si riprova UNA volta dopo l'attesa minima
      if (!res.ok && res.status === 422 && res.data?.reason?.startsWith("form_token")) {
        if (res.data.reason !== "form_token_too_fast") formToken.current = null;
        if (!formToken.current) await refreshFormToken(formToken);
        await new Promise((r) => setTimeout(r, FORM_TOKEN_WAIT_MS));
        res = await post();
      }
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
      track("contact_submitted");
      update({ lead: { id: res.data.id, code: res.data.code, uploadToken: res.data.uploadToken, valuation: res.data.valuation }, step: 4 });
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
    /** primo messaggio specifico di un invio fallito (rete, server, limiti): è quello che serve a capire cosa fare */
    let failure: string | undefined;
    try {
      // a gruppi (max 3 foto e 3 MB per invio); ogni foto ha un id: un retry non crea copie sul server
      for (const [bi, batch] of batchPhotos(toSend).entries()) {
        if (fatal) break;
        const i = bi * MAX_FILES_PER_REQUEST;
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
          const why = describeUploadFailure(res.status, res.data?.error, res.network);
          failure ??= why.message;
          if (why.fatal) fatal = why.message;
          else if (why.retryable) retryable = true;
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
    else if (failure) setPhotoError(failure);
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
    <div ref={topRef} className="flex min-h-dvh flex-col bg-chalk">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-xl items-center justify-between gap-4 px-4">
          <BrandMark size="sm" />
          {!isDone && (
            <Link
              href="/"
              onClick={() => leadCreated && reset()}
              className="rounded-lg px-2 py-2 text-sm font-bold text-concrete underline-offset-4 hover:text-asphalt hover:underline"
            >
              Esci
            </Link>
          )}
        </div>
        {!isDone && (
          <div className="mx-auto max-w-xl px-4 pb-3">
            <p className="mb-2 flex items-baseline justify-between text-sm font-bold">
              <span>
                Passo {step + 1} di {STEPS.length}
              </span>
              <span className="text-concrete">{STEPS[step]}</span>
            </p>
            <ol className="flex gap-1.5" aria-label={`Passo ${step + 1} di ${STEPS.length}: ${STEPS[step]}`}>
              {STEPS.map((s, i) => (
                <li key={s} className="flex-1">
                  <span
                    className={`block h-2 rounded-full transition-colors duration-300 ${
                      i < step ? "bg-asphalt" : i === step ? "bg-plate" : "bg-line"
                    }`}
                  />
                  <span className="sr-only">{s}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </header>

      <form
        className={`mx-auto w-full max-w-xl flex-1 px-4 pt-6 ${isDone ? "pb-12" : step === 4 ? "pb-56" : "pb-40"}`}
        onSubmit={(e) => {
          e.preventDefault();
          if (!submitting) next();
        }}
        noValidate
      >
        {/* honeypot anti-bot: invisibile agli utenti */}
        <input ref={honeypot} name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />

        <div key={step} className="step-in rounded-3xl bg-paper p-5 shadow-sm ring-1 ring-line sm:p-8">
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
            <DoneStep
              code={state.lead.code}
              motoLabel={motoLabel}
              summary={{ label: motoLabel, year: Number(state.moto.year) || undefined, mileage: state.mileage ? Number(state.mileage) : undefined }}
              valuation={state.lead.valuation ?? { kind: "manual" }}
              photosSent={state.photosSent}
              onHome={reset}
            />
          )}
        </div>

        {!isDone && (
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper/95 shadow-[0_-6px_20px_rgba(32,37,43,0.10)] backdrop-blur">
            <div className="mx-auto max-w-xl px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-3">
              <div className="flex gap-3">
                {canGoBack && (
                  <button
                    type="button"
                    onClick={() => goTo(step - 1)}
                    disabled={submitting}
                    className={btnOutline.replace("px-6", "px-5")}
                  >
                    Indietro
                  </button>
                )}
                <button type="submit" disabled={submitting} className={`${btnPrimary} flex-1 disabled:opacity-60`}>
                  {primaryLabel}
                </button>
              </div>
              {step === 4 && (
                <button
                  type="button"
                  onClick={skipPhotos}
                  disabled={submitting}
                  className="mt-2 h-11 w-full text-sm font-bold text-gold underline underline-offset-4"
                >
                  {hasWhatsapp() ? "Le mando dopo su WhatsApp" : "Invia senza foto"}
                </button>
              )}
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
