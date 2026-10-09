import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { buyBoxRules, customers, leads, leadStatusHistory, motorcycles, offers } from "@/db/schema";
import { getModel } from "@/modules/catalog";
import { matchBuyBox, PRIORITY_LABELS } from "@/modules/buybox/match";
import { STATUS_LABELS, type LeadStatus } from "./statuses";

/**
 * Dataset del soft launch: una riga per richiesta, dalla provenienza all'esito.
 * Serve a misurare il funnel e a costruire in futuro la valutazione automatica.
 * NON contiene nome, telefono o email: solo dati della moto, comune, provenienza e trattativa.
 */

const QUALIFIED: LeadStatus[] = ["interesting", "appointment", "offer_made", "accepted", "purchased"];

export type DatasetRow = {
  codice: string;
  data_richiesta: string;
  source: string;
  medium: string;
  campaign: string;
  marca: string;
  modello: string;
  versione: string;
  cilindrata: number | "";
  anno: number;
  km: number;
  comune: string;
  funzionante: string;
  incidenti: string;
  problemi_meccanici: string;
  manutenzione: string;
  foto: number;
  buy_box: string;
  stato_attuale: string;
  qualificazione: "Interessante" | "Non interessante" | "Da valutare";
  appuntamento: "Sì" | "No";
  ultima_offerta: number | "";
  offerta_accettata: number | "";
  prezzo_pagato: number | "";
  data_acquisto: string;
  esito: "Acquistata" | "Non acquistata" | "In corso";
};

const TRI = { yes: "Sì", no: "No", unknown: "Non lo sa" } as const;
const day = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });

export async function buildDataset(): Promise<DatasetRow[]> {
  const db = await getDb();
  const [rows, history, allOffers, rules] = await Promise.all([
    db
      .select({ lead: leads, city: customers.city, moto: motorcycles })
      .from(leads)
      .innerJoin(customers, eq(leads.customerId, customers.id))
      .innerJoin(motorcycles, eq(leads.motorcycleId, motorcycles.id))
      .orderBy(desc(leads.createdAt)),
    db.select({ leadId: leadStatusHistory.leadId, to: leadStatusHistory.toStatus }).from(leadStatusHistory),
    db.select().from(offers).orderBy(desc(offers.createdAt)),
    db.select().from(buyBoxRules).where(eq(buyBoxRules.active, true)),
  ]);

  const reached = new Map<string, Set<LeadStatus>>();
  for (const h of history) {
    if (!reached.has(h.leadId)) reached.set(h.leadId, new Set());
    reached.get(h.leadId)!.add(h.to);
  }

  return rows.map(({ lead, city, moto }) => {
    const seen = reached.get(lead.id) ?? new Set<LeadStatus>();
    const leadOffers = allOffers.filter((o) => o.leadId === lead.id);
    const accepted = leadOffers.find((o) => o.status === "accepted");
    const bb = matchBuyBox(
      {
        brand: moto.brand,
        family: moto.catalogModelId ? (getModel(moto.catalogModelId)?.family ?? null) : null,
        year: moto.year,
        mileage: lead.mileage,
        isRunning: lead.isRunning,
        market: lead.market,
      },
      rules,
    );
    const qualified = QUALIFIED.some((s) => seen.has(s)) || leadOffers.length > 0;
    return {
      codice: lead.code,
      data_richiesta: day(lead.createdAt),
      source: lead.utmSource ?? "",
      medium: lead.utmMedium ?? "",
      campaign: lead.utmCampaign ?? "",
      marca: moto.brand,
      modello: moto.model,
      versione: moto.version ?? "",
      cilindrata: moto.displacement ?? "",
      anno: moto.year,
      km: lead.mileage,
      comune: city,
      funzionante: lead.isRunning ? "Sì" : "No",
      incidenti: TRI[lead.accident],
      problemi_meccanici: TRI[lead.mechanicalIssues],
      manutenzione: TRI[lead.maintenance],
      foto: lead.photoCount,
      buy_box: bb ? PRIORITY_LABELS[bb.priority] : "No",
      stato_attuale: STATUS_LABELS[lead.status],
      qualificazione: qualified ? "Interessante" : lead.status === "not_interesting" ? "Non interessante" : "Da valutare",
      appuntamento: seen.has("appointment") ? "Sì" : "No",
      ultima_offerta: leadOffers[0]?.amount ?? "",
      offerta_accettata: accepted?.amount ?? "",
      prezzo_pagato: lead.purchasePrice ?? "",
      data_acquisto: lead.purchasedAt ? day(lead.purchasedAt) : "",
      esito:
        lead.status === "purchased"
          ? "Acquistata"
          : lead.status === "rejected" || lead.status === "not_interesting"
            ? "Non acquistata"
            : "In corso",
    };
  });
}

/** Indicatori del soft launch calcolati dal dataset (nessuna dashboard: numeri essenziali). */
export function kpis(rows: DatasetRow[]) {
  const n = rows.length;
  const qualified = rows.filter((r) => r.qualificazione === "Interessante").length;
  const appointments = rows.filter((r) => r.appuntamento === "Sì").length;
  const withOffer = rows.filter((r) => r.ultima_offerta !== "").length;
  const purchased = rows.filter((r) => r.esito === "Acquistata");
  const paid = purchased.map((r) => Number(r.prezzo_pagato)).filter((x) => x > 0);
  return {
    leads: n,
    qualified,
    appointments,
    withOffer,
    purchased: purchased.length,
    leadToPurchase: n ? purchased.length / n : null,
    avgPurchasePrice: paid.length ? Math.round(paid.reduce((a, b) => a + b, 0) / paid.length) : null,
  };
}

/**
 * CSV per Excel (italiano): separatore ";", BOM UTF-8.
 * Le celle che iniziano con = + - @ (o tab/a capo) vengono neutralizzate: un testo scritto dal cliente
 * non può diventare una formula quando il file viene aperto in Excel.
 */
export function toCsv(rows: DatasetRow[]): string {
  const cols = Object.keys(rows[0] ?? emptyRow()) as (keyof DatasetRow)[];
  const cell = (v: unknown) => {
    let s = v == null ? "" : String(v);
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.join(";"), ...rows.map((r) => cols.map((c) => cell(r[c])).join(";"))];
  return "﻿" + lines.join("\r\n") + "\r\n";
}

function emptyRow(): DatasetRow {
  return {
    codice: "", data_richiesta: "", source: "", medium: "", campaign: "", marca: "", modello: "", versione: "",
    cilindrata: "", anno: 0, km: 0, comune: "", funzionante: "", incidenti: "", problemi_meccanici: "",
    manutenzione: "", foto: 0, buy_box: "", stato_attuale: "", qualificazione: "Da valutare", appuntamento: "No",
    ultima_offerta: "", offerta_accettata: "", prezzo_pagato: "", data_acquisto: "", esito: "In corso",
  };
}
