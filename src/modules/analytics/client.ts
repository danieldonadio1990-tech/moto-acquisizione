"use client";
import type { ClientEventName } from "./events";

/**
 * ID di sessione anonimo, solo in sessionStorage (si cancella chiudendo la scheda):
 * nessun cookie, nessun dato personale.
 */
export function getSessionId(): string {
  try {
    let id = sessionStorage.getItem("sid");
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem("sid", id);
    }
    return id;
  } catch {
    return "nosession";
  }
}

/** Parametri UTM della prima pagina visitata (servono per costo per lead per canale). */
export function captureAttribution() {
  try {
    const p = new URLSearchParams(window.location.search);
    const utm = {
      utmSource: p.get("utm_source") ?? undefined,
      utmMedium: p.get("utm_medium") ?? undefined,
      utmCampaign: p.get("utm_campaign") ?? undefined,
    };
    if (utm.utmSource || utm.utmMedium || utm.utmCampaign) {
      sessionStorage.setItem("utm", JSON.stringify(utm));
    }
  } catch {}
}

export function getAttribution(): { utmSource?: string; utmMedium?: string; utmCampaign?: string } {
  try {
    return JSON.parse(sessionStorage.getItem("utm") || "{}");
  } catch {
    return {};
  }
}

export function track(name: ClientEventName, props?: Record<string, string | number | boolean>) {
  try {
    const body = JSON.stringify({ name, sessionId: getSessionId(), props });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/events", new Blob([body], { type: "application/json" }));
    } else {
      fetch("/api/events", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true });
    }
  } catch {}
}
