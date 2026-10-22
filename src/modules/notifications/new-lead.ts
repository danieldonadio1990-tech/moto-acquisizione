import "server-only";
import { and, asc, eq, gt, inArray, lt, or, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { leads, motorcycles } from "@/db/schema";
import { siteUrl } from "@/config/business";
import { logError } from "@/lib/log";
import { getEmailTransport, type EmailMessage } from "./transport";

/**
 * Notifica email al titolare per ogni nuova richiesta.
 *
 * GARANZIE
 *  - Il lead è già salvato (transazione conclusa) quando si arriva qui; nessuna funzione di questo file lancia
 *    eccezioni verso chi chiama: un problema dell'email non può mai annullare o compromettere il salvataggio.
 *  - Prenotazione ATOMICA: un UPDATE condizionale porta il lead da pending/failed a "sending". Due richieste parallele
 *    (doppio click, retry, backoffice) non possono prenotarlo entrambe, quindi non inviano due email.
 *  - Idempotenza anche presso il provider: stessa Idempotency-Key per lo stesso lead (Resend la ricorda 24 ore).
 *  - Nessun dato personale del cliente nel messaggio: solo codice, dati della moto e link al back office.
 *
 * RISCHIO RESIDUO (documentato in docs/NOTIFICHE.md): se il server si ferma dopo l'invio e prima di scrivere "sent",
 * dopo il tempo di attesa il lead viene riprovato. Entro 24 ore la chiave di idempotenza lo impedisce; oltre,
 * potrebbe arrivare una seconda email identica. La scelta opposta (non riprovare) rischierebbe di perdere la notifica.
 *
 * RECUPERO: (1) invio subito dopo il salvataggio; (2) un nuovo invio dello stesso modulo (retry del browser);
 * (3) ogni apertura dell'elenco nel back office riprova le notifiche in sospeso (retryPendingNotifications).
 */
export const MAX_ATTEMPTS = 5;
/** Una prenotazione "sending" o un errore si riprovano solo dopo questo tempo */
export const RETRY_AFTER_MINUTES = 5;
/** Oltre questa età le richieste non vengono più notificate in automatico (restano visibili nel back office) */
export const RETRY_WINDOW_DAYS = 7;

export type NotifyOutcome = "sent" | "failed" | "not_claimed" | "disabled";

/** Testo "sicuro" per l'email: senza caratteri di controllo, di markup, di indirizzo (< > : @) e con lunghezza limitata. */
export function safeText(v: string | null | undefined, max = 60): string {
  return (v ?? "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f<>:@\\"]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

const TRI = { yes: "sì", no: "no", unknown: "non sa" } as const;
const when = (d: Date) => d.toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" });

export type LeadForEmail = {
  id: string;
  code: string;
  createdAt: Date;
  brand: string;
  model: string;
  version: string | null;
  year: number;
  displacement: number | null;
  mileage: number;
  isRunning: boolean;
  accident: keyof typeof TRI;
  mechanicalIssues: keyof typeof TRI;
  maintenance: keyof typeof TRI;
};

/** Costruisce il messaggio. Deterministico (stesso lead → stesso testo): serve all'idempotenza presso il provider. */
export function buildLeadEmail(lead: LeadForEmail, base: URL = siteUrl()): Omit<EmailMessage, "from" | "to"> {
  const moto = [safeText(lead.brand, 40), safeText(lead.model, 60)].filter(Boolean).join(" ");
  // Se l'indirizzo del sito non è noto (solo "localhost") in produzione, un link assoluto sarebbe inutile: si indica il percorso
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
  const path = `/admin/lead/${lead.id}`;
  const openLine =
    local && process.env.NODE_ENV === "production"
      ? `Apri la richiesta dal back office del sito (serve il login), percorso: ${path}`
      : `Apri la richiesta (serve il login): ${new URL(path, base).toString()}`;
  const lines = [
    `Nuova richiesta di valutazione ${lead.code}`,
    "",
    `Moto: ${moto}${lead.version ? ` ${safeText(lead.version, 40)}` : ""}`,
    `Anno: ${lead.year}${lead.displacement ? ` · ${lead.displacement} cc` : ""}`,
    `Chilometri: ${lead.mileage.toLocaleString("it-IT")}`,
    `Funzionante: ${lead.isRunning ? "sì" : "no"}`,
    `Incidenti: ${TRI[lead.accident]} · Problemi meccanici: ${TRI[lead.mechanicalIssues]} · Manutenzione regolare: ${TRI[lead.maintenance]}`,
    `Ricevuta il ${when(lead.createdAt)}`,
    "",
    "Le foto, se il cliente le aggiunge, arrivano dopo e si vedono nel back office.",
    "",
    openLine,
    "",
    "I dati di contatto del cliente non sono inclusi in questa email: si vedono solo nel back office.",
  ];
  return {
    subject: `Nuova richiesta ${lead.code} — ${moto} (${lead.year})`,
    text: lines.join("\n"),
    idempotencyKey: `lead-notify-${lead.id}`,
  };
}

async function loadLeadForEmail(leadId: string): Promise<LeadForEmail | null> {
  const db = await getDb();
  const [row] = await db
    .select({
      id: leads.id,
      code: leads.code,
      createdAt: leads.createdAt,
      brand: motorcycles.brand,
      model: motorcycles.model,
      version: motorcycles.version,
      year: motorcycles.year,
      displacement: motorcycles.displacement,
      mileage: leads.mileage,
      isRunning: leads.isRunning,
      accident: leads.accident,
      mechanicalIssues: leads.mechanicalIssues,
      maintenance: leads.maintenance,
    })
    .from(leads)
    .innerJoin(motorcycles, eq(leads.motorcycleId, motorcycles.id))
    .where(eq(leads.id, leadId));
  return row ?? null;
}

const staleClaim = sql`now() - make_interval(mins => ${RETRY_AFTER_MINUTES})`;

/**
 * Invia (una sola volta) la notifica del lead. Non lancia mai eccezioni.
 *  - "sent"        inviata adesso
 *  - "failed"      tentativo fallito (lead intatto; si riprova più tardi)
 *  - "not_claimed" già inviata, in corso, in attesa del tempo di retry o tentativi esauriti: nessuna email
 *  - "disabled"    notifiche non configurate: il lead resta "pending" e verrà notificato quando si configurano
 */
export async function notifyNewLead(leadId: string): Promise<NotifyOutcome> {
  try {
    const target = getEmailTransport();
    if (!target) return "disabled";

    const db = await getDb();
    const claimed = await db
      .update(leads)
      .set({
        notificationStatus: "sending",
        notificationClaimedAt: sql`now()`,
        notificationAttempts: sql`${leads.notificationAttempts} + 1`,
      })
      .where(
        and(
          eq(leads.id, leadId),
          lt(leads.notificationAttempts, MAX_ATTEMPTS),
          or(
            eq(leads.notificationStatus, "pending"),
            and(inArray(leads.notificationStatus, ["failed", "sending"]), lt(leads.notificationClaimedAt, staleClaim)),
          ),
        ),
      )
      .returning({ id: leads.id });
    if (claimed.length === 0) return "not_claimed";

    let result: { ok: boolean; code?: string } = { ok: false, code: "internal" };
    try {
      const lead = await loadLeadForEmail(leadId);
      if (!lead) throw new Error("lead non trovato");
      result = await target.transport.send({ from: target.from, to: target.to, ...buildLeadEmail(lead) });
    } catch (err) {
      logError("notifica email", err);
      result = { ok: false, code: "internal" };
    }

    if (result.ok) {
      await db
        .update(leads)
        .set({ notificationStatus: "sent", notificationSentAt: sql`now()`, notificationError: null })
        .where(and(eq(leads.id, leadId), eq(leads.notificationStatus, "sending")));
      return "sent";
    }
    await db
      .update(leads)
      .set({ notificationStatus: "failed", notificationError: (result.code ?? "unknown").slice(0, 40) })
      .where(and(eq(leads.id, leadId), eq(leads.notificationStatus, "sending")));
    return "failed";
  } catch (err) {
    // anche un errore del database qui non deve mai arrivare a chi chiama
    logError("notifica email", err);
    return "failed";
  }
}

/**
 * Recupero: riprova le notifiche in sospeso (richieste recenti, non ancora inviate, con tentativi residui).
 * Chiamata all'apertura dell'elenco nel back office. Non lancia eccezioni.
 */
export async function retryPendingNotifications(limit = 3): Promise<number> {
  try {
    if (!getEmailTransport()) return 0;
    const db = await getDb();
    const rows = await db
      .select({ id: leads.id })
      .from(leads)
      .where(
        and(
          inArray(leads.notificationStatus, ["pending", "failed", "sending"]),
          lt(leads.notificationAttempts, MAX_ATTEMPTS),
          gt(leads.createdAt, sql`now() - make_interval(days => ${RETRY_WINDOW_DAYS})`),
          or(
            and(eq(leads.notificationStatus, "pending"), lt(leads.createdAt, sql`now() - interval '1 minute'`)),
            lt(leads.notificationClaimedAt, staleClaim),
          ),
        ),
      )
      .orderBy(asc(leads.createdAt))
      .limit(limit);
    // in parallelo: il tempo massimo resta quello di un solo invio (4 s), non la somma (la pagina del back office non deve
    // superare il limite di tempo delle funzioni). Ogni prenotazione è atomica, quindi nessun rischio di doppio invio.
    const outcomes = await Promise.all(rows.map((r) => notifyNewLead(r.id)));
    return outcomes.filter((o) => o === "sent").length;
  } catch (err) {
    logError("notifica email (recupero)", err);
    return 0;
  }
}

/** Vero se le notifiche sono configurate (per il back office). */
export const emailNotificationsConfigured = () => getEmailTransport() !== null;

/** Per l'avviso nel back office: notifiche non ancora andate a buon fine (esclusa la finestra di retry normale). */
export async function countUnsentNotifications(): Promise<number> {
  try {
    const db = await getDb();
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(leads)
      .where(
        or(
          eq(leads.notificationStatus, "failed"),
          and(
            inArray(leads.notificationStatus, ["pending", "sending"]),
            lt(leads.createdAt, sql`now() - interval '10 minutes'`),
            gt(leads.createdAt, sql`now() - make_interval(days => ${RETRY_WINDOW_DAYS})`),
          ),
        ),
      );
    return row?.n ?? 0;
  } catch (err) {
    logError("notifica email (conteggio)", err);
    return 0;
  }
}
