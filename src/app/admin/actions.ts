"use server";
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { login, logout, requireAdmin } from "@/modules/admin/auth";
import {
  addOffer,
  BusinessRuleError,
  changeStatus,
  recordPurchase,
  setOfferStatus,
  undoPurchase,
  updateNotes,
} from "@/modules/leads/service";
import { LEAD_STATUSES } from "@/modules/leads/statuses";
import { clientIp } from "@/lib/rate-limit";
import { isValuationSchemaUnavailable } from "@/db/errors";
import { MAX_ATTEMPTS, manualRetryNotification } from "@/modules/notifications/new-lead";
import { manualRetryMessage } from "@/modules/notifications/status";
import { logError } from "@/lib/log";
import {
  addMarketReference,
  approveSettings,
  closeValuation,
  confirmOffer,
  createSettingsDraft,
  recomputeValuation,
  setManualOffer,
} from "@/modules/valuation/service";
import { decimalToHundredths, paramsFromForm } from "@/modules/valuation/fields";

export type ActionState = { ok?: boolean; error?: string; email?: string } | null;

const uuid = z.string().uuid("Richiesta non valida");
const euros = z
  .string()
  .trim()
  .regex(/^\d{1,6}$/, "Usa un importo intero in euro, senza decimali")
  .transform(Number)
  .pipe(z.number().int().min(1, "Importo non valido").max(100000, "Importo troppo alto"));

/** Messaggi chiari per errori previsti; per gli imprevisti un messaggio generico (dettagli solo nei log, senza dati personali). */
function fail(err: unknown): ActionState {
  if (err && typeof err === "object" && "digest" in err) throw err; // redirect()/notFound(): controllo di flusso
  if (err instanceof z.ZodError) return { error: err.issues[0]?.message ?? "Dati non validi" };
  if (err instanceof BusinessRuleError) return { error: err.message };
  if (isValuationSchemaUnavailable(err)) {
    logError("admin action: tabelle della valutazione non disponibili", err);
    return { error: "Il motore di valutazione non è disponibile: verifica che la migrazione 0005 sia stata applicata." };
  }
  logError("admin action", err);
  return { error: "Operazione non riuscita. Riprova; se il problema continua, avvisa chi gestisce il sito." };
}

export async function loginAction(_: ActionState, form: FormData): Promise<ActionState> {
  const email = String(form.get("email") ?? "").slice(0, 200);
  const password = String(form.get("password") ?? "").slice(0, 200);
  if (!email || !password) return { error: "Inserisci email e password", email };
  const res = await login(email, password, clientIp(await headers()));
  if (!res.ok) {
    if (res.reason === "locked") {
      const min = Math.ceil(res.retryAfterSec / 60);
      return { error: `Troppi tentativi di accesso. Riprova tra ${min} minut${min === 1 ? "o" : "i"}.`, email };
    }
    return { error: "Email o password non corrette", email };
  }
  redirect("/admin");
}

export async function logoutAction() {
  await logout();
  redirect("/admin/login");
}

export async function changeStatusAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const leadId = uuid.parse(form.get("leadId"));
    const status = z.enum(LEAD_STATUSES).parse(form.get("status"));
    await changeStatus(leadId, status, admin.email);
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function saveNotesAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const leadId = uuid.parse(form.get("leadId"));
    const notes = z.string().max(5000, "Note troppo lunghe").parse(form.get("notes") ?? "");
    await updateNotes(leadId, notes);
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function addOfferAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const leadId = uuid.parse(form.get("leadId"));
    const amount = euros.parse(String(form.get("amount") ?? ""));
    await addOffer(leadId, amount, admin.email);
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function setOfferStatusAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const offerId = uuid.parse(form.get("offerId"));
    const status = z.enum(["accepted", "rejected"]).parse(form.get("status"));
    await setOfferStatus(offerId, status, admin.email);
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function recordPurchaseAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const leadId = uuid.parse(form.get("leadId"));
    const price = euros.parse(String(form.get("price") ?? ""));
    const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida").parse(form.get("date"));
    await recordPurchase(leadId, price, day, admin.email);
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function undoPurchaseAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const leadId = uuid.parse(form.get("leadId"));
    await undoPurchase(leadId, admin.email);
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Riprova a mano la notifica email di una richiesta (anche dopo i tentativi automatici esauriti).
 * Solo admin (requireAdmin come per ogni azione); prenotazione atomica e idempotenza gestite in manualRetryNotification.
 */
export async function retryNotificationAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const leadId = uuid.parse(form.get("leadId"));
    const res = await manualRetryNotification(leadId, admin.email);
    refresh();
    return manualRetryMessage(res, MAX_ATTEMPTS);
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Valutazione e offerta. Ogni azione parte da requireAdmin(); gli importi arrivano in euro e sono riconvertiti e
// riverificati sul server. Il browser non imposta mai margini o costi di una singola richiesta.
// ---------------------------------------------------------------------------------------------------------------------

export async function recomputeValuationAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    await recomputeValuation(uuid.parse(form.get("leadId")), admin.email);
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function setManualOfferAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const leadId = uuid.parse(form.get("leadId"));
    const euros_ = euros.parse(String(form.get("amount") ?? ""));
    const reason = String(form.get("reason") ?? "").slice(0, 500);
    await setManualOffer(leadId, euros_ * 100, reason, admin.email, form.get("exceed") === "on");
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function confirmOfferAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    await confirmOffer(uuid.parse(form.get("leadId")), admin.email);
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function closeValuationAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const status = z.enum(["rejected", "expired"]).parse(form.get("status"));
    await closeValuation(uuid.parse(form.get("leadId")), status, String(form.get("reason") ?? "").slice(0, 500), admin.email);
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function createSettingsDraftAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const { params, errors } = paramsFromForm((n) => (form.get(n) === null ? null : String(form.get(n))));
    if (errors.length) return { error: errors[0] };
    await createSettingsDraft(params, String(form.get("note") ?? "").slice(0, 300), admin.email);
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function approveSettingsAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    await approveSettings(uuid.parse(form.get("settingsId")), admin.email);
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function addMarketReferenceAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const admin = await requireAdmin();
    const get = (n: string) => String(form.get(n) ?? "").trim();
    const money = (n: string, required: boolean) => {
      const raw = get(n);
      if (!raw && !required) return null;
      const h = decimalToHundredths(raw);
      if (h === null) throw new BusinessRuleError("Importo non valido");
      return h;
    };
    const int = z.string().regex(/^\d{1,6}$/, "Numero non valido").transform(Number);
    const asOf = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida").parse(get("asOf"));
    await addMarketReference(
      {
        brand: get("brand").slice(0, 60),
        family: get("family").slice(0, 60) || null,
        yearFrom: int.parse(get("yearFrom")),
        yearTo: int.parse(get("yearTo")),
        medianCents: money("median", true)!,
        p25Cents: money("p25", false),
        p75Cents: money("p75", false),
        sampleCount: int.parse(get("sampleCount")),
        kind: z.enum(["sold", "asking", "internal", "manual"]).parse(get("kind")),
        source: get("source"),
        asOf: new Date(`${asOf}T00:00:00Z`),
      },
      admin.email,
    );
    refresh();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
