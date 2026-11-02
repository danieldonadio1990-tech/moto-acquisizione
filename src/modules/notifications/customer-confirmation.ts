import "server-only";
import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { customers, leads, motorcycles } from "@/db/schema";
import { rateLimit, releaseRateLimit, type Rule } from "@/lib/rate-limit";
import { logError } from "@/lib/log";
import { BRAND, CONTACTS, isPlaceholder, siteUrl } from "@/config/business";
import { RESPONSE_TIME } from "@/config/home-content";
import { getEmailTransport } from "./transport";
import { buildCustomerEmail } from "./customer-email";

/**
 * Email di conferma al cliente dopo che la richiesta è stata salvata. RIUSA il sistema delle notifiche interne: stesso trasporto
 * Resend, stesse variabili (RESEND_API_KEY, NOTIFY_EMAIL_FROM, NOTIFY_EMAIL_REPLY_TO), stessa quota giornaliera (contatore proprio).
 * Nessuna dipendenza dal consenso marketing: è un messaggio di servizio che conferma la ricezione della richiesta.
 *
 * Invii duplicati: l'invio si «prenota» con un UPDATE condizionale sulla richiesta (stato `pending`/`failed` → `sending`), quindi due
 * chiamate parallele o un retry del browser non producono due email; in più Resend riceve la stessa chiave di idempotenza.
 * Non lancia mai eccezioni: se l'email non parte, la richiesta resta salvata.
 */
export const CUSTOMER_EMAIL_MAX_ATTEMPTS = 3;
const RETRY_AFTER_MINUTES = 5;

export type CustomerEmailOutcome = "sent" | "failed" | "not_claimed" | "disabled";

const budgetRule = (limit: number): Rule => ({ name: "customer-email-day", limit, windowMs: 26 * 60 * 60 * 1000, shared: true });
const utcDay = () => new Date().toISOString().slice(0, 10);
const staleClaim = sql`now() - make_interval(mins => ${RETRY_AFTER_MINUTES})`;

export async function sendCustomerConfirmation(leadId: string): Promise<CustomerEmailOutcome> {
  try {
    const target = getEmailTransport();
    if (!target) return "disabled";

    const db = await getDb();
    const claimed = await db
      .update(leads)
      .set({
        customerEmailStatus: "sending",
        customerEmailClaimedAt: sql`now()`,
        customerEmailAttempts: sql`${leads.customerEmailAttempts} + 1`,
      })
      .where(
        and(
          eq(leads.id, leadId),
          lt(leads.customerEmailAttempts, CUSTOMER_EMAIL_MAX_ATTEMPTS),
          or(
            eq(leads.customerEmailStatus, "pending"),
            and(inArray(leads.customerEmailStatus, ["failed", "sending"]), lt(leads.customerEmailClaimedAt, staleClaim)),
          ),
        ),
      )
      .returning({ ticket: leads.customerEmailAttempts });
    if (claimed.length === 0) return "not_claimed";
    // «ticket»: il numero di tentativo assegnato da QUESTA prenotazione; ogni scrittura finale lo richiede (come per le notifiche interne)
    const ticket = claimed[0].ticket;
    const mine = and(eq(leads.id, leadId), eq(leads.customerEmailStatus, "sending"), eq(leads.customerEmailAttempts, ticket));

    const rule = budgetRule(target.dailyLimit);
    const day = utcDay();
    let reserved = false;
    if (target.dailyLimit > 0) {
      const b = await rateLimit(rule, day);
      if (!b.ok) {
        await releaseRateLimit(rule, day);
        // quota del giorno esaurita: la conferma non parte, la richiesta resta salvata; il tentativo non conta
        await db
          .update(leads)
          .set({ customerEmailStatus: "failed", customerEmailError: "daily_limit", customerEmailAttempts: sql`${leads.customerEmailAttempts} - 1` })
          .where(mine);
        return "failed";
      }
      reserved = true;
    }

    let result: { ok: boolean; code?: string } = { ok: false, code: "internal" };
    try {
      const [row] = await db
        .select({
          code: leads.code,
          mileage: leads.mileage,
          firstName: customers.firstName,
          email: customers.email,
          brand: motorcycles.brand,
          model: motorcycles.model,
          version: motorcycles.version,
          year: motorcycles.year,
          displacement: motorcycles.displacement,
        })
        .from(leads)
        .innerJoin(customers, eq(leads.customerId, customers.id))
        .innerJoin(motorcycles, eq(leads.motorcycleId, motorcycles.id))
        .where(eq(leads.id, leadId));
      if (!row) throw new Error("richiesta non trovata");
      const mail = buildCustomerEmail(
        {
          firstName: row.firstName,
          code: row.code,
          mileage: row.mileage,
          moto: { brand: row.brand, model: row.model, version: row.version, year: row.year, displacement: row.displacement },
        },
        {
          siteOrigin: siteUrl().origin,
          brandName: BRAND.name,
          area: BRAND.area,
          responseTime: RESPONSE_TIME,
          contactEmail: isPlaceholder(CONTACTS.email) ? undefined : CONTACTS.email,
        },
      );
      result = await target.transport.send({
        from: target.from,
        to: [row.email],
        replyTo: target.replyTo,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        idempotencyKey: `lead-confirm-${leadId}`,
      });
    } catch (err) {
      logError("email di conferma al cliente", err);
      result = { ok: false, code: "internal" };
    }

    if (!result.ok && reserved) await releaseRateLimit(rule, day); // un invio fallito non consuma la quota
    if (result.ok) {
      const done = await db
        .update(leads)
        .set({ customerEmailStatus: "sent", customerEmailSentAt: sql`now()`, customerEmailError: null })
        .where(mine)
        .returning({ id: leads.id });
      return done.length > 0 ? "sent" : "not_claimed";
    }
    const done = await db
      .update(leads)
      .set({ customerEmailStatus: "failed", customerEmailError: (result.code ?? "unknown").slice(0, 40) })
      .where(mine)
      .returning({ id: leads.id });
    return done.length > 0 ? "failed" : "not_claimed";
  } catch (err) {
    logError("email di conferma al cliente", err);
    return "failed";
  }
}
