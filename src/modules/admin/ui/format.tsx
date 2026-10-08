import { STATUS_LABELS, type LeadStatus } from "@/modules/leads/statuses";

const STATUS_STYLE: Record<LeadStatus, string> = {
  new: "bg-signal text-asphalt",
  to_contact: "bg-[#ffe9a8] text-asphalt",
  contacted: "bg-[#dfe6f7] text-plate-deep",
  interesting: "bg-[#c9d6f5] text-plate-deep",
  appointment: "bg-plate text-paper",
  offer_made: "bg-plate-deep text-paper",
  accepted: "bg-[#cfe9dc] text-ok",
  purchased: "bg-ok text-paper",
  rejected: "bg-line text-asphalt-soft",
  not_interesting: "bg-line text-asphalt-soft",
};

export function StatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_STYLE[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

const eur = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" });
export const formatEur = (n: number | null | undefined) => (n == null ? "—" : eur.format(n));
const num = new Intl.NumberFormat("it-IT", { useGrouping: "always" });
export const formatKm = (n: number) => `${num.format(n)} km`;

const dt = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Rome",
});
const d = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Rome" });
export const formatDateTime = (v: Date) => dt.format(v);
export const formatDate = (v: Date) => d.format(v);

export const TRI_LABELS = { yes: "Sì", no: "No", unknown: "Non lo sa" } as const;
export const CONTACT_LABELS = { whatsapp: "WhatsApp", phone: "Telefono", email: "Email" } as const;
