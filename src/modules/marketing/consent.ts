import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { customers, marketingConsents, type MarketingConsentStatus } from "@/db/schema";
import { MARKETING_CONSENT_VERSION } from "./text";
import { latestEvidence, recordEvidenceOnly } from "./evidence";

/**
 * Registro del consenso marketing (tabella a sola aggiunta). La scelta in vigore è l'ULTIMA riga del cliente;
 * senza «granted» in vigore non si invia nessuna comunicazione promozionale.
 * Le email di servizio (conferma di ricezione della richiesta, notifiche interne) NON dipendono da questo consenso.
 */

type Executor = Pick<Awaited<ReturnType<typeof getDb>>, "insert">;

/** Registra la scelta fatta nel modulo (dentro la stessa transazione della richiesta): «granted» se la casella era spuntata, altrimenti «declined». */
export async function recordFormChoice(tx: Executor, customerId: string, granted: boolean) {
  await tx.insert(marketingConsents).values({
    customerId,
    status: granted ? "granted" : "declined",
    textVersion: MARKETING_CONSENT_VERSION,
    source: "modulo",
  });
}

/**
 * Revoca: aggiunge una riga «revoked» (la storia non si cancella). Vale per l'indirizzo email, quindi per tutte le sue richieste:
 * la scelta in vigore è l'ultima riga tra tutte quelle con la stessa email.
 */
export async function revokeMarketingConsent(email: string, source: "email" | "back_office") {
  const db = await getDb();
  const [latest] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(sql`lower(${customers.email}) = lower(${email})`)
    .orderBy(desc(customers.createdAt))
    .limit(1);
  if (!latest) {
    // nessuna richiesta attiva (per esempio già cancellata): resta la sola prova minima, così la soppressione vale comunque
    await recordEvidenceOnly(email, "revoked", MARKETING_CONSENT_VERSION, source);
    return { revoked: 1 };
  }
  await db.insert(marketingConsents).values({ customerId: latest.id, status: "revoked", textVersion: MARKETING_CONSENT_VERSION, source });
  return { revoked: 1 };
}

/**
 * Scelta in vigore per un indirizzo email: l'ULTIMA tra le righe attive (richieste con quell'email) e la prova minima conservata dopo una
 * cancellazione. null = nessuna scelta registrata.
 */
export async function currentMarketingStatus(email: string): Promise<MarketingConsentStatus | null> {
  const db = await getDb();
  const [live] = await db
    .select({ status: marketingConsents.status, decidedAt: marketingConsents.decidedAt })
    .from(marketingConsents)
    .innerJoin(customers, eq(customers.id, marketingConsents.customerId))
    .where(sql`lower(${customers.email}) = lower(${email})`)
    .orderBy(desc(marketingConsents.decidedAt), desc(marketingConsents.id))
    .limit(1);
  const kept = await latestEvidence(email);
  if (live && kept) return kept.decidedAt.getTime() > live.decidedAt.getTime() ? kept.status : live.status;
  return live?.status ?? kept?.status ?? null;
}

export async function hasMarketingConsent(email: string): Promise<boolean> {
  return (await currentMarketingStatus(email)) === "granted";
}

/**
 * UNICO punto da cui prendere i destinatari di comunicazioni promozionali: solo indirizzi la cui scelta in vigore è «granted».
 * Un invio promozionale che non passa da qui non è ammesso.
 */
export async function listMarketingRecipients(): Promise<{ email: string; firstName: string; consentedAt: Date; textVersion: string }[]> {
  const db = await getDb();
  const latest = await db
    .selectDistinctOn([sql`lower(${customers.email})`], {
      email: customers.email,
      firstName: customers.firstName,
      status: marketingConsents.status,
      decidedAt: marketingConsents.decidedAt,
      textVersion: marketingConsents.textVersion,
    })
    .from(marketingConsents)
    .innerJoin(customers, eq(customers.id, marketingConsents.customerId))
    .orderBy(sql`lower(${customers.email})`, desc(marketingConsents.decidedAt), desc(marketingConsents.id));
  const granted = latest.filter((r) => r.status === "granted");
  // lista di soppressione: chi ha revocato (anche dopo la cancellazione di una richiesta) non compare, salvo un nuovo consenso successivo alla revoca
  const allowed = new Set(await withoutRevokedAfter(granted.map((r) => ({ email: r.email, since: r.decidedAt }))));
  return granted.filter((r) => allowed.has(r.email)).map((r) => ({ email: r.email, firstName: r.firstName, consentedAt: r.decidedAt, textVersion: r.textVersion }));
}

/** Storico completo di una richiesta/cliente, per documentare il consenso (data, versione del testo, stato, origine). */
export async function consentHistory(customerId: string) {
  const db = await getDb();
  return db
    .select({ status: marketingConsents.status, textVersion: marketingConsents.textVersion, source: marketingConsents.source, decidedAt: marketingConsents.decidedAt })
    .from(marketingConsents)
    .where(and(eq(marketingConsents.customerId, customerId)))
    .orderBy(desc(marketingConsents.decidedAt));
}

/** Esclude gli indirizzi la cui prova conservata riporta una revoca PIÙ RECENTE della data indicata (il consenso attivo). */
async function withoutRevokedAfter(items: { email: string; since: Date }[]): Promise<string[]> {
  const out: string[] = [];
  for (const it of items) {
    const kept = await latestEvidence(it.email);
    const suppressed = kept?.status === "revoked" && kept.decidedAt.getTime() >= it.since.getTime();
    if (!suppressed) out.push(it.email);
  }
  return out;
}
