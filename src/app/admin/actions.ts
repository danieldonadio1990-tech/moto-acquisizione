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
import { logError } from "@/lib/log";

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
