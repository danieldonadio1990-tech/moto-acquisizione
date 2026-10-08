/**
 * Legge il corpo di una richiesta con un tetto in byte e un tempo massimo.
 * Il conteggio è sui byte realmente ricevuti: non si fida del content-length dichiarato.
 */
export class BodyTooLarge extends Error {}
export class BodyTimeout extends Error {}

export async function readLimitedBody(request: Request, maxBytes: number, timeoutMs: number): Promise<Uint8Array> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new BodyTimeout()), timeoutMs);
  });
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new BodyTooLarge();
      chunks.push(value);
    }
  } catch (err) {
    reader.cancel().catch(() => {});
    throw err;
  } finally {
    clearTimeout(timer);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}
