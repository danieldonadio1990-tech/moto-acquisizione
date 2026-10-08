"use client";

/**
 * POST con timeout e retry automatico per errori transitori (rete, timeout, 5xx, 408).
 * Sicuro da ripetere perché le API sono idempotenti (submissionId / photoIds).
 * Non ripete mai 4xx diversi da 408 (dati non validi, 403, 429…).
 */
export type NetResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; data: { error?: string; retryAfterSec?: number } | null; network: boolean };

export async function postWithRetry<T>(
  url: string,
  init: { body: BodyInit | (() => BodyInit); headers?: Record<string, string> },
  { attempts = 3, timeoutMs = 25_000 } = {},
): Promise<NetResult<T>> {
  let last: NetResult<T> = { ok: false, status: 0, data: null, network: true };
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 800 * 2 ** (i - 1)));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: init.headers,
        body: typeof init.body === "function" ? init.body() : init.body,
        signal: ctrl.signal,
      });
      const data = await res.json().catch(() => null);
      if (res.ok) return { ok: true, status: res.status, data: data as T };
      last = { ok: false, status: res.status, data, network: false };
      if (res.status < 500 && res.status !== 408) return last;
    } catch {
      last = { ok: false, status: 0, data: null, network: true };
    } finally {
      clearTimeout(timer);
    }
  }
  return last;
}
