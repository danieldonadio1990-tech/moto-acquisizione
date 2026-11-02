/**
 * Email di conferma AL CLIENTE (HTML + testo semplice). Funzioni pure: nessun accesso a database o rete, così si provano e si
 * visualizzano in anteprima (scripts/email-preview.ts). I colori sono quelli del marchio (grafite, bianco sporco, giallo segnale);
 * i font web non sono affidabili nelle email, quindi si usa Arial in grassetto al posto di Big Shoulders / Instrument Sans.
 * Tutto il testo che arriva dal cliente viene «escapato»: nessun HTML o script può entrare nell'email.
 */
export const CUSTOMER_EMAIL_TITLE = "Abbiamo ricevuto la tua richiesta!";

export type CustomerEmailInput = {
  firstName: string;
  /** Codice richiesta (es. «M7K2QX») */
  code: string;
  moto?: { brand?: string; model?: string; version?: string | null; year?: number; displacement?: number | null };
  mileage?: number;
};

export type CustomerEmailContext = {
  /** Origine del sito (es. https://compriamo-moto.it): per logo e link, sempre assoluti */
  siteOrigin: string;
  brandName: string;
  area: string;
  /** Tempo di ricontatto confermato, es. «24-48 ore» */
  responseTime: string;
  /** Email di contatto pubblica, se disponibile */
  contactEmail?: string;
};

const C = { asphalt: "#15181b", asphaltSoft: "#363c41", paper: "#fbfbf8", chalk: "#e9ebe7", plate: "#f1bf1a", concrete: "#565c60", line: "#c3c8c1" };
const FONT = "Arial, Helvetica, sans-serif";

export function escapeHtml(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Solo caratteri stampabili e senza a capo: il nome finisce nell'apertura dell'email e il modello nel riepilogo. */
const clean = (v: string | null | undefined, max = 80) => (v ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

export function motoLabel(m: CustomerEmailInput["moto"]): string {
  if (!m) return "";
  const parts = [clean(m.brand, 40), clean(m.model, 60), m.version ? clean(m.version, 40) : "", m.displacement ? `${m.displacement} cc` : ""].filter(Boolean);
  return parts.join(" ");
}

type Row = [label: string, value: string];
function summaryRows(i: CustomerEmailInput): Row[] {
  const rows: Row[] = [];
  const label = motoLabel(i.moto);
  if (label) rows.push(["Moto", label]);
  if (i.moto?.year) rows.push(["Anno", String(i.moto.year)]);
  if (typeof i.mileage === "number") rows.push(["Chilometri", i.mileage.toLocaleString("it-IT")]);
  return rows;
}

export function buildCustomerEmail(input: CustomerEmailInput, ctx: CustomerEmailContext): { subject: string; html: string; text: string } {
  const name = clean(input.firstName, 40);
  const code = clean(input.code, 12);
  const rows = summaryRows(input);
  const origin = ctx.siteOrigin.replace(/\/$/, "");
  const logo = `${origin}/brand/v2/email-logo.png`;
  const privacy = `${origin}/privacy`;
  const mail = ctx.contactEmail ? clean(ctx.contactEmail, 120) : "";
  const greet = name ? `Ciao ${name},` : "Ciao,";
  const intro = `grazie per aver scelto ${ctx.brandName}: abbiamo ricevuto la tua richiesta.`;
  const confirm = "Questa email conferma la ricezione della richiesta. Non è ancora un acquisto concluso.";
  const next = `Analizzeremo le informazioni sulla tua moto e ti ricontatteremo entro ${ctx.responseTime} ai recapiti che ci hai lasciato.`;
  const service = "È un messaggio di servizio legato alla tua richiesta, non una comunicazione promozionale.";

  const summaryHtml = rows.length
    ? `<tr><td style="padding:0 32px 8px 32px;font-family:${FONT};">
        <p style="margin:0 0 8px 0;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;font-weight:bold;color:${C.concrete};">Riepilogo della tua moto</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:2px solid ${C.asphalt};">
          ${rows
            .map(
              ([k, v]) =>
                `<tr><td style="padding:10px 0;border-bottom:1px solid ${C.line};font-size:14px;color:${C.concrete};width:34%;">${escapeHtml(k)}</td><td style="padding:10px 0;border-bottom:1px solid ${C.line};font-size:16px;font-weight:bold;color:${C.asphalt};">${escapeHtml(v)}</td></tr>`,
            )
            .join("")}
        </table>
      </td></tr>`
    : "";

  const html = `<!doctype html>
<html lang="it">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(CUSTOMER_EMAIL_TITLE)}</title></head>
<body style="margin:0;padding:0;background:${C.chalk};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.chalk};">Conferma di ricezione: ti ricontattiamo entro ${escapeHtml(ctx.responseTime)}.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.chalk};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:${C.paper};">
  <tr><td align="left" style="background:${C.asphalt};padding:22px 32px;"><img src="${escapeHtml(logo)}" width="200" alt="${escapeHtml(ctx.brandName)}" style="display:block;border:0;width:200px;max-width:100%;height:auto;"></td></tr>
  <tr><td style="background:${C.plate};height:6px;line-height:6px;font-size:0;">&nbsp;</td></tr>
  <tr><td style="padding:32px 32px 8px 32px;font-family:${FONT};">
    <h1 style="margin:0 0 16px 0;font-size:30px;line-height:1.1;font-weight:bold;color:${C.asphalt};">${escapeHtml(CUSTOMER_EMAIL_TITLE)}</h1>
    <p style="margin:0 0 8px 0;font-size:17px;line-height:1.5;color:${C.asphaltSoft};"><strong style="color:${C.asphalt};">${escapeHtml(greet)}</strong> ${escapeHtml(intro)}</p>
  </td></tr>
  <tr><td style="padding:8px 32px 20px 32px;font-family:${FONT};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-left:6px solid ${C.plate};background:${C.chalk};"><tr><td style="padding:16px 18px;">
      <p style="margin:0 0 6px 0;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;font-weight:bold;color:${C.concrete};">Codice richiesta</p>
      <p style="margin:0 0 10px 0;font-size:28px;letter-spacing:4px;font-weight:bold;color:${C.asphalt};">${escapeHtml(code)}</p>
      <p style="margin:0;font-size:15px;line-height:1.5;color:${C.asphaltSoft};">${escapeHtml(confirm)}</p>
    </td></tr></table>
  </td></tr>
  ${summaryHtml}
  <tr><td style="padding:16px 32px 8px 32px;font-family:${FONT};">
    <p style="margin:0 0 6px 0;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;font-weight:bold;color:${C.concrete};">Cosa succede ora</p>
    <p style="margin:0;font-size:16px;line-height:1.55;color:${C.asphaltSoft};">${escapeHtml(next)}</p>
  </td></tr>
  ${
    mail
      ? `<tr><td style="padding:20px 32px 8px 32px;font-family:${FONT};"><a href="mailto:${escapeHtml(mail)}" style="display:inline-block;background:${C.plate};color:${C.asphalt};font-weight:bold;font-size:16px;text-decoration:none;padding:14px 22px;">Hai domande? Scrivici</a></td></tr>`
      : ""
  }
  <tr><td style="padding:28px 32px 28px 32px;font-family:${FONT};">
    <p style="margin:0;font-size:16px;line-height:1.5;color:${C.asphalt};">A presto,<br><strong>${escapeHtml(ctx.brandName)}</strong></p>
    <p style="margin:4px 0 0 0;font-size:13px;color:${C.concrete};">Acquisto diretto di moto usate · ${escapeHtml(ctx.area)}</p>
  </td></tr>
  <tr><td style="background:${C.asphalt};padding:18px 32px;font-family:${FONT};">
    <p style="margin:0 0 6px 0;font-size:12px;line-height:1.5;color:#d9dcd7;">${escapeHtml(service)}</p>
    <p style="margin:0;font-size:12px;line-height:1.5;color:#d9dcd7;">Hai ricevuto questa email perché hai inviato una richiesta su ${escapeHtml(origin.replace(/^https?:\/\//, ""))}. <a href="${escapeHtml(privacy)}" style="color:${C.plate};">Informativa privacy</a></p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

  const text = [
    CUSTOMER_EMAIL_TITLE,
    "",
    `${greet} ${intro}`,
    "",
    `Codice richiesta: ${code}`,
    confirm,
    "",
    ...(rows.length ? ["Riepilogo della tua moto", ...rows.map(([k, v]) => `${k}: ${v}`), ""] : []),
    "Cosa succede ora",
    next,
    "",
    ...(mail ? [`Hai domande? Scrivici: ${mail}`, ""] : []),
    "A presto,",
    ctx.brandName,
    `Acquisto diretto di moto usate · ${ctx.area}`,
    "",
    service,
    `Informativa privacy: ${privacy}`,
  ].join("\n");

  return { subject: CUSTOMER_EMAIL_TITLE, html, text };
}
