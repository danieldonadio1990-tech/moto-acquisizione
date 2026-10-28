import "server-only";
import { and, asc, desc, eq, gt, inArray, lt, or, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { adminUsers, events, leads, motorcycles } from "@/db/schema";
import { rateLimit, releaseRateLimit, type Rule } from "@/lib/rate-limit";
import { BRAND, siteUrl } from "@/config/business";
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
 * MECCANISMI DI INVIO E RECUPERO (dettagli in docs/NOTIFICHE.md)
 *  1. invio subito dopo il salvataggio;
 *  2. un nuovo invio dello stesso modulo (retry del browser);
 *  3. ogni apertura dell'elenco nel back office riprova alcune notifiche in sospeso (retryPendingNotifications);
 *  4. RECUPERO AUTOMATICO pianificato (GitHub Actions → rotta protetta da token → retryNotificationsBatch), anche senza
 *     traffico: solo notifiche recuperabili, al massimo 10 per giro;
 *  5. RETRY MANUALE di un admin dal back office (manualRetryNotification): ignora il tetto dei tentativi e l'attesa, ma
 *     NON la prenotazione atomica né il «ticket»; è tracciato con un evento che contiene l'id dell'admin, non la sua email.
 *
 * TICKET: ogni prenotazione assegna il numero del tentativo (notification_attempts) e ogni scrittura dell'esito richiede il
 * proprio ticket. Se un invio resta appeso e un altro processo lo rileva, l'esito in ritardo del vecchio processo non può
 * sovrascrivere quello del nuovo.
 *
 * TETTO DEI TENTATIVI: MAX_ATTEMPTS (5) vale solo per il recupero AUTOMATICO e per il back office. Con un giro all'ora
 * il tetto si esaurisce in circa 4 ore di guasto, ma può esaurirsi prima (retry del browser, aperture del back office,
 * retry manuali, altri giri). Il contatore può superare 5 con i retry manuali.
 */
export const MAX_ATTEMPTS = 5;
/** Una prenotazione "sending" o un errore si riprovano solo dopo questo tempo */
export const RETRY_AFTER_MINUTES = 5;
/** Oltre questa età le richieste non vengono più notificate in automatico (restano visibili nel back office) */
export const RETRY_WINDOW_DAYS = 7;

export type NotifyOutcome = "sent" | "failed" | "not_claimed" | "disabled" | "throttled";

/**
 * Limite giornaliero (giorno UTC, come la quota di Resend) delle email inviate da questo sito: contatore condiviso su
 * database, quota prenotata prima dell'invio e restituita se l'invio fallisce. Oltre il limite la notifica NON viene
 * persa né l'invio della richiesta bloccato: la richiesta resta salvata, la notifica passa a `throttled` (visibile nel
 * back office, tracciata con un evento) e riparte da sola dal giorno dopo. Il retry MANUALE di un admin non è bloccato
 * dal limite (conta comunque nel contatore). `NOTIFY_DAILY_LIMIT`: predefinito 50, 0 = nessun limite.
 */
const budgetRule = (limit: number): Rule => ({ name: "notify-day", limit, windowMs: 26 * 60 * 60 * 1000, shared: true });
const utcDay = () => new Date().toISOString().slice(0, 10);

/**
 * Inserisce un evento collegato alla richiesta SOLO se la richiesta esiste ancora, bloccandone la riga (FOR SHARE) fino
 * al commit: una cancellazione dei dati (`privacy:erase`, che blocca la stessa riga con FOR UPDATE) concorrente non
 * può lasciare un evento orfano con dati dell'admin. `once` evita doppioni dello stesso evento per la stessa richiesta.
 */
async function insertLeadEvent(name: string, leadId: string, props: Record<string, unknown>, once = false) {
  try {
    const db = await getDb();
    await db.execute(sql`
      insert into events (name, lead_id, props)
      select ${name}, l.id, ${JSON.stringify(props)}::jsonb
      from leads l
      where l.id = ${leadId}
        ${once ? sql`and not exists (select 1 from events e where e.lead_id = l.id and e.name = ${name})` : sql``}
      for share of l`);
  } catch (err) {
    logError("notifica email (evento)", err);
  }
}

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
    "COMPRIAMO MOTO",
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
    "",
    `— ${BRAND.name}`,
  ];
  return {
    subject: `${BRAND.name} · Nuova richiesta ${lead.code} — ${moto} (${lead.year})`,
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
export async function notifyNewLead(leadId: string, opts: { manual?: boolean } = {}): Promise<NotifyOutcome> {
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
          opts.manual
            ? // richiesta esplicita di un admin: ignora il tetto dei tentativi automatici e il tempo di attesa, ma passa
              // dalla stessa prenotazione atomica (mai su `sent`/`skipped` né su un invio già in corso)
              or(
                inArray(leads.notificationStatus, ["pending", "failed", "throttled"]),
                and(eq(leads.notificationStatus, "sending"), lt(leads.notificationClaimedAt, staleClaim)),
              )
            : and(
                lt(leads.notificationAttempts, MAX_ATTEMPTS),
                or(
                  eq(leads.notificationStatus, "pending"),
                  and(
                    inArray(leads.notificationStatus, ["failed", "sending", "throttled"]),
                    lt(leads.notificationClaimedAt, staleClaim),
                  ),
                ),
              ),
        ),
      )
      .returning({ id: leads.id, ticket: leads.notificationAttempts });
    if (claimed.length === 0) return "not_claimed";
    // «ticket»: il contatore dei tentativi assegnato da QUESTA prenotazione. Chi la rileva dopo (invio rimasto appeso oltre
    // 5 minuti) ottiene un numero più alto: l'esito del vecchio processo, se arrivasse in ritardo, non può più sovrascrivere
    // quello del nuovo (ogni scrittura finale richiede il proprio ticket).
    const ticket = claimed[0].ticket;
    const mine = and(eq(leads.id, leadId), eq(leads.notificationStatus, "sending"), eq(leads.notificationAttempts, ticket));

    // quota giornaliera: si prenota prima dell'invio (il retry manuale conta ma non viene bloccato)
    const rule = budgetRule(target.dailyLimit);
    const day = utcDay();
    let reserved = false;
    if (target.dailyLimit > 0) {
      const b = await rateLimit(rule, day);
      if (!b.ok && !opts.manual) {
        await releaseRateLimit(rule, day);
        const held = await db
          .update(leads)
          .set({
            notificationStatus: "throttled",
            notificationError: "daily_limit",
            // la sospensione non consuma un tentativo
            notificationAttempts: sql`${leads.notificationAttempts} - 1`,
          })
          .where(mine)
          .returning({ id: leads.id });
        if (held.length > 0) await insertLeadEvent("notification_throttled", leadId, { limit: target.dailyLimit }, true);
        return held.length > 0 ? "throttled" : "not_claimed";
      }
      reserved = true;
    }

    let result: { ok: boolean; code?: string } = { ok: false, code: "internal" };
    try {
      const lead = await loadLeadForEmail(leadId);
      if (!lead) throw new Error("lead non trovato");
      result = await target.transport.send({ from: target.from, to: target.to, replyTo: target.replyTo, ...buildLeadEmail(lead) });
    } catch (err) {
      logError("notifica email", err);
      result = { ok: false, code: "internal" };
    }

    if (!result.ok && reserved) await releaseRateLimit(rule, day); // un invio fallito non consuma la quota
    if (result.ok) {
      const done = await db
        .update(leads)
        .set({ notificationStatus: "sent", notificationSentAt: sql`now()`, notificationError: null })
        .where(mine)
        .returning({ id: leads.id });
      // 0 righe = un altro processo ha rilevato la prenotazione e scrive lui l'esito (la chiave di idempotenza evita il doppio invio)
      return done.length > 0 ? "sent" : "not_claimed";
    }
    const done = await db
      .update(leads)
      .set({ notificationStatus: "failed", notificationError: (result.code ?? "unknown").slice(0, 40) })
      .where(mine)
      .returning({ id: leads.id });
    return done.length > 0 ? "failed" : "not_claimed";
  } catch (err) {
    // anche un errore del database qui non deve mai arrivare a chi chiama
    logError("notifica email", err);
    return "failed";
  }
}

/**
 * Retry MANUALE di una notifica (azione esplicita di un admin dal back office, anche dopo i tentativi automatici esauriti).
 *  - Stessa prenotazione atomica e stessa chiave di idempotenza degli invii automatici: due clic (o un clic + il recupero
 *    automatico) non producono due email; entro 24 ore Resend non ne invia una seconda per la stessa chiave.
 *  - Non cambia il tetto dei tentativi automatici: il contatore cresce (anche oltre il tetto) ma il recupero automatico
 *    continua a ignorare le richieste che lo hanno raggiunto. Un invio manuale riuscito porta lo stato a `sent`.
 *  - Traccia: un evento `notification_manual_retry` con la richiesta, l'admin e l'esito (nessun dato del cliente).
 * Non lancia eccezioni.
 */
export async function manualRetryNotification(
  leadId: string,
  adminEmail: string,
): Promise<{ outcome: NotifyOutcome; error: string | null; attempts: number | null; notFound?: boolean }> {
  try {
    const db = await getDb();
    const [exists] = await db.select({ id: leads.id }).from(leads).where(eq(leads.id, leadId));
    // un identificativo inesistente non lascia nessuna traccia (e non si crea un evento orfano)
    if (!exists) return { outcome: "not_claimed", error: null, attempts: null, notFound: true };
  } catch (err) {
    logError("notifica email (retry manuale)", err);
    return { outcome: "failed", error: null, attempts: null };
  }
  // Minimizzazione: nell'evento si salva l'identificativo interno dell'admin, NON la sua email (si risale all'email solo
  // finché l'utente esiste; se viene rimosso resta «admin rimosso»).
  let adminId = "unknown";
  try {
    const db = await getDb();
    const [a] = await db.select({ id: adminUsers.id }).from(adminUsers).where(eq(adminUsers.email, adminEmail));
    if (a) adminId = a.id;
  } catch {
    // l'esito dell'invio non dipende dalla traccia
  }
  const outcome = await notifyNewLead(leadId, { manual: true });
  await insertLeadEvent("notification_manual_retry", leadId, { adminId, outcome });
  let error: string | null = null;
  let attempts: number | null = null;
  try {
    const db = await getDb();
    const [r] = await db
      .select({ e: leads.notificationError, a: leads.notificationAttempts })
      .from(leads)
      .where(eq(leads.id, leadId));
    attempts = r?.a ?? null;
    if (outcome === "failed") error = r?.e ?? null;
  } catch {
    // lo stato mostrato dopo il ricaricamento della pagina resta comunque quello del database
  }
  return { outcome, error, attempts };
}

/**
 * Il retry manuale si offre solo dove serve: notifica fallita, oppure ferma (pending/sending) da oltre 10 minuti;
 * e solo se le notifiche sono configurate.
 */
export function canOfferManualRetry(lead: { notificationStatus: string; createdAt: Date }): boolean {
  if (!getEmailTransport()) return false;
  if (lead.notificationStatus === "failed" || lead.notificationStatus === "throttled") return true;
  return (
    (lead.notificationStatus === "pending" || lead.notificationStatus === "sending") &&
    Date.now() - lead.createdAt.getTime() > 10 * 60 * 1000
  );
}

/** Ultimi retry manuali di una richiesta (per il dettaglio nel back office). L'admin è risolto dall'id solo in lettura. */
export async function recentManualRetries(leadId: string, limit = 5) {
  try {
    const db = await getDb();
    const rows = await db
      .select({ at: events.createdAt, props: events.props })
      .from(events)
      .where(and(eq(events.leadId, leadId), eq(events.name, "notification_manual_retry")))
      .orderBy(desc(events.createdAt))
      .limit(limit);
    const ids = [...new Set(rows.map((r) => (r.props as { adminId?: unknown } | null)?.adminId).filter((v): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v)))];
    const admins = ids.length ? await db.select({ id: adminUsers.id, email: adminUsers.email }).from(adminUsers).where(inArray(adminUsers.id, ids)) : [];
    const emailOf = new Map(admins.map((x) => [x.id, x.email]));
    return rows.map((r) => {
      const p = (r.props ?? {}) as { adminId?: unknown; by?: unknown; outcome?: unknown };
      // `by` = formato precedente (email nell'evento); resta leggibile ma non viene più scritto
      const by = typeof p.adminId === "string" ? (emailOf.get(p.adminId) ?? "admin rimosso") : typeof p.by === "string" ? p.by : "—";
      return { at: r.at, by, outcome: typeof p.outcome === "string" ? p.outcome : "—" };
    });
  } catch (err) {
    logError("notifica email (cronologia)", err);
    return [];
  }
}

export type RetryBatchResult = {
  configured: boolean;
  /** richieste recuperabili trovate in questo giro (al massimo `limit`) */
  candidates: number;
  sent: number;
  failed: number;
  /** sospese per il limite giornaliero (restano salvate, ripartono da sole il giorno dopo) */
  throttled: number;
  /** già prese da un altro processo, già inviate nel frattempo o tentativi esauriti: nessuna email */
  notClaimed: number;
  /** errore imprevisto (database): il chiamante può segnalarlo */
  error: boolean;
};

/**
 * Recupero: riprova le notifiche recuperabili. Sono tali SOLO le richieste che
 *  - non sono già `sent` né `skipped` (precedenti alle notifiche);
 *  - hanno meno di MAX_ATTEMPTS tentativi;
 *  - sono state create negli ultimi RETRY_WINDOW_DAYS giorni;
 *  - sono `pending` da almeno 1 minuto, oppure `failed`/`sending`/`throttled` con ultimo tentativo più vecchio di
 *    RETRY_AFTER_MINUTES (le `throttled` ripartono quando il limite giornaliero lo consente: dal giorno UTC dopo).
 * Usato dal back office e dal recupero automatico (rotta protetta chiamata da GitHub Actions). Non lancia eccezioni.
 * Ogni richiesta passa dalla prenotazione atomica di notifyNewLead: esecuzioni sovrapposte non duplicano gli invii.
 */
export async function retryNotificationsBatch(limit = 3): Promise<RetryBatchResult> {
  const result: RetryBatchResult = { configured: false, candidates: 0, sent: 0, failed: 0, throttled: 0, notClaimed: 0, error: false };
  try {
    if (!getEmailTransport()) return result;
    result.configured = true;
    const db = await getDb();
    const rows = await db
      .select({ id: leads.id })
      .from(leads)
      .where(
        and(
          inArray(leads.notificationStatus, ["pending", "failed", "sending", "throttled"]),
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
    result.candidates = rows.length;
    // in parallelo: il tempo massimo resta quello di un solo invio (4 s), non la somma (le funzioni hanno un limite di tempo)
    const outcomes = await Promise.all(rows.map((r) => notifyNewLead(r.id)));
    result.sent = outcomes.filter((o) => o === "sent").length;
    result.failed = outcomes.filter((o) => o === "failed").length;
    result.throttled = outcomes.filter((o) => o === "throttled").length;
    result.notClaimed = outcomes.filter((o) => o === "not_claimed" || o === "disabled").length;
    return result;
  } catch (err) {
    logError("notifica email (recupero)", err);
    return { ...result, error: true };
  }
}

/** Recupero dal back office (a ogni apertura dell'elenco). Restituisce quante notifiche sono partite. */
export async function retryPendingNotifications(limit = 3): Promise<number> {
  return (await retryNotificationsBatch(limit)).sent;
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
          inArray(leads.notificationStatus, ["failed", "throttled"]),
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

/** Richieste con la notifica sospesa per il limite giornaliero (per l'avviso nel back office). */
export async function countThrottledNotifications(): Promise<number> {
  try {
    const db = await getDb();
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(leads)
      .where(eq(leads.notificationStatus, "throttled"));
    return row?.n ?? 0;
  } catch (err) {
    logError("notifica email (conteggio sospese)", err);
    return 0;
  }
}

/** Origine usata nei link delle email (solo per mostrarla all'admin e controllarla): nessun segreto. */
export const emailLinkOrigin = () => siteUrl().origin;

/** Limite giornaliero in vigore (0 = nessun limite), o null se le notifiche non sono configurate. */
export const notificationDailyLimit = () => getEmailTransport()?.dailyLimit ?? null;
