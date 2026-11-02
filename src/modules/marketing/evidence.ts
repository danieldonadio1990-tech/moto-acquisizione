import "server-only";
import { createHmac } from "node:crypto";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { customers, marketingConsentEvidence, marketingConsents, type MarketingConsentStatus } from "@/db/schema";
import { serverConfig } from "@/config/env";

/**
 * Prova MINIMA e PSEUDONIMIZZATA del consenso marketing.
 *
 * Quando una richiesta viene cancellata, il registro completo del cliente (marketing_consents, collegato alla richiesta) non si butta:
 * si riduce a righe in marketing_consent_evidence con solo stato, versione del testo, origine, data della scelta e un codice
 * irreversibile dell'email. Nessun nome, telefono, email in chiaro né collegamento alla richiesta cancellata.
 *
 * Il codice è un HMAC-SHA256 con chiave segreta: NON è un dato anonimo (chi ha la chiave può verificare un indirizzo noto: serve proprio a
 * dimostrare un consenso a un reclamo e a impedire il reinserimento di chi ha revocato). La chiave è CONSENT_EVIDENCE_KEY (consigliata,
 * stabile, ≥ 32 caratteri); se manca si deriva da SESSION_SECRET, ma cambiarla renderebbe le prove non più verificabili.
 *
 * DECISIONE APERTA: il periodo di conservazione di queste righe va definito con il consulente privacy. Finché non è approvato NON esiste
 * nessuna cancellazione automatica (nessuna scadenza, nessun job).
 */

export type KeyedHash = { hash: string; keyId: string };

function key(): { secret: string; keyId: string } {
  const dedicated = process.env.CONSENT_EVIDENCE_KEY?.trim();
  if (dedicated && dedicated.length >= 32) return { secret: dedicated, keyId: "env-1" };
  // derivazione con un'etichetta propria: la chiave delle sessioni non viene mai usata direttamente per questo scopo
  const secret = createHmac("sha256", serverConfig().sessionSecret).update("marketing-consent-evidence/v1").digest("hex");
  return { secret, keyId: "session-1" };
}

/** Codice irreversibile dell'email (minuscolo, senza spazi): stesso indirizzo → stesso codice con la stessa chiave. */
export function hashSubject(email: string): KeyedHash {
  const { secret, keyId } = key();
  return { hash: createHmac("sha256", secret).update(email.trim().toLowerCase()).digest("hex"), keyId };
}

type Tx = Pick<Awaited<ReturnType<typeof getDb>>, "insert" | "select" | "delete">;

/**
 * Da chiamare DENTRO la transazione di cancellazione, prima di eliminare il cliente: riduce il registro del cliente alla prova minima
 * e poi lo elimina. Restituisce quante righe sono state conservate.
 */
export async function reduceConsentsToEvidence(tx: Tx, customerId: string): Promise<number> {
  const [c] = await tx.select({ email: customers.email }).from(customers).where(eq(customers.id, customerId));
  const rows = await tx.select().from(marketingConsents).where(eq(marketingConsents.customerId, customerId));
  if (c && rows.length > 0) {
    const { hash, keyId } = hashSubject(c.email);
    await tx.insert(marketingConsentEvidence).values(
      rows.map((r) => ({ subjectHash: hash, hashKeyId: keyId, status: r.status, textVersion: r.textVersion, source: r.source, decidedAt: r.decidedAt })),
    );
  }
  await tx.delete(marketingConsents).where(eq(marketingConsents.customerId, customerId));
  return rows.length;
}

/** Revoca registrata per un indirizzo senza richieste attive (già cancellate): solo la prova minima, così la soppressione resta valida. */
export async function recordEvidenceOnly(email: string, status: MarketingConsentStatus, textVersion: string, source: string) {
  const db = await getDb();
  const { hash, keyId } = hashSubject(email);
  await db.insert(marketingConsentEvidence).values({ subjectHash: hash, hashKeyId: keyId, status, textVersion, source, decidedAt: new Date() });
}

/** Ultima scelta conservata come prova per questo indirizzo (stessa chiave); null se non c'è. */
export async function latestEvidence(email: string): Promise<{ status: MarketingConsentStatus; decidedAt: Date; textVersion: string; source: string } | null> {
  const db = await getDb();
  const { hash, keyId } = hashSubject(email);
  const [r] = await db
    .select({ status: marketingConsentEvidence.status, decidedAt: marketingConsentEvidence.decidedAt, textVersion: marketingConsentEvidence.textVersion, source: marketingConsentEvidence.source })
    .from(marketingConsentEvidence)
    .where(sql`${marketingConsentEvidence.subjectHash} = ${hash} and ${marketingConsentEvidence.hashKeyId} = ${keyId}`)
    .orderBy(desc(marketingConsentEvidence.decidedAt), desc(marketingConsentEvidence.id))
    .limit(1);
  return r ?? null;
}

/**
 * Lista di soppressione: dato un elenco di indirizzi (da qualunque fonte, per esempio un'importazione), restituisce solo quelli che NON risultano
 * revocati nella prova conservata (l'ultima scelta conservata non è «revoked»). Un nuovo consenso espresso dopo la revoca (riga più recente) rimette in elenco.
 */
export async function withoutRevoked(emails: string[]): Promise<string[]> {
  if (emails.length === 0) return [];
  const db = await getDb();
  const keyed = emails.map((e) => ({ e, ...hashSubject(e) }));
  const rows = await db
    .select({ hash: marketingConsentEvidence.subjectHash, status: marketingConsentEvidence.status, decidedAt: marketingConsentEvidence.decidedAt })
    .from(marketingConsentEvidence)
    .where(inArray(marketingConsentEvidence.subjectHash, [...new Set(keyed.map((k) => k.hash))]))
    .orderBy(desc(marketingConsentEvidence.decidedAt), desc(marketingConsentEvidence.id));
  const latest = new Map<string, string>();
  for (const r of rows) if (!latest.has(r.hash)) latest.set(r.hash, r.status);
  return keyed.filter((k) => latest.get(k.hash) !== "revoked").map((k) => k.e);
}
