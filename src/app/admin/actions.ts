"use server";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { login, logout, requireAdmin } from "@/modules/admin/auth";
import {
  addOffer,
  changeStatus,
  recordPurchase,
  setOfferStatus,
  undoPurchase,
  updateNotes,
} from "@/modules/leads/service";
import { LEAD_STATUSES } from "@/modules/leads/statuses";

export type ActionState = { ok?: boolean; error?: string; email?: string } | null;

const uuid = z.string().uuid();
const euros = z.coerce
  .number({ error: "Importo non valido" })
  .int("Usa un importo intero in euro")
  .min(1, "Importo non valido")
  .max(100000, "Importo troppo alto");

function fail(err: unknown): ActionState {
  if (err instanceof z.ZodError) return { error: err.issues[0]?.message ?? "Dati non validi" };
  // redirect() lancia un'eccezione di controllo: va rilanciata
  if (err && typeof err === "object" && "digest" in err) throw err;
  console.error("[admin action]", err);
  return { error: err instanceof Error ? err.message : "Operazione non riuscita" };
}

export async function loginAction(_: ActionState, form: FormData): Promise<ActionState> {
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Inserisci email e password" };
  const ok = await login(email, password);
  if (!ok) return { error: "Email o password non corrette", email };
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
    const amount = euros.parse(form.get("amount"));
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
    const price = euros.parse(form.get("price"));
    const dateRaw = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida").parse(form.get("date"));
    const date = new Date(`${dateRaw}T12:00:00`);
    if (date.getTime() > Date.now() + 86400000) return { error: "La data non può essere nel futuro" };
    await recordPurchase(leadId, price, date, admin.email);
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
