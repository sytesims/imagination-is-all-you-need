/**
 * Replicate predictions client, built only from https://replicate.com/docs/reference/http (read 2026-10-16):
 *   submit  POST https://api.replicate.com/v1/models/{owner}/{name}/predictions  body { input }   (official models; others need POST /v1/predictions { version, input })
 *           headers Authorization: Bearer $TOKEN, optional Prefer: wait=n (1-60), Cancel-After: <duration> (min 5s)
 *   poll    GET  https://api.replicate.com/v1/predictions/{id} → status starting|processing|succeeded|failed|canceled, output, error, metrics.predict_time
 *   cancel  POST https://api.replicate.com/v1/predictions/{id}/cancel
 * Output files are HTTPS URLs on replicate.delivery; data is removed after an hour, so we download right away.
 */
import { BusyError, retryAfterMs, withBusyRetry } from '../busyRetry.js';
import { PollTolerance, MISS, httpError, HOSTED_POLL_MS } from '../hostedPoll.js';
export const REPLICATE_API = 'https://api.replicate.com/v1';
export interface Prediction { id: string; model?: string; version?: string; status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled'; output: unknown; error: string | null; metrics?: { predict_time?: number; total_time?: number }; urls?: { get?: string; cancel?: string; web?: string } }
type Fetch = typeof fetch;
const headers = (key: string) => ({ Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' });
/** Text-to-image input per each model's API tab (prompt required everywhere). */
export function replicateImageInput(slug: string, i: { prompt: string; seed?: number; aspectRatio?: string; imageUrls?: string[]; imageSize?: { width: number; height: number }; imageRes?: string }) {
  const seed = Number.isInteger(i.seed) ? { seed: i.seed } : {};
  switch (slug) {
    // official model, schema read 2026-10-22: resolution 1K/2K/4K (priced $0.15 / $0.15 / $0.30), aspect enum, png; no seed; never the fallback model (another model, another price)
    case 'google/nano-banana-pro': return { prompt: i.prompt, resolution: ['1K', '2K', '4K'].includes(String(i.imageRes)) ? i.imageRes : '1K',
      aspect_ratio: i.aspectRatio && ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'].includes(i.aspectRatio) ? i.aspectRatio : '1:1', output_format: 'png', allow_fallback_model: false };
    case 'google/nano-banana-2': return { prompt: i.prompt, ...(i.aspectRatio ? { aspect_ratio: i.aspectRatio } : {}) }; // schema has no seed
    case 'black-forest-labs/flux-2-pro': return { prompt: i.prompt, ...(i.aspectRatio ? { aspect_ratio: i.aspectRatio } : {}), ...seed };
    case 'qwen/qwen-image': return { prompt: i.prompt, ...(i.aspectRatio ? { aspect_ratio: i.aspectRatio } : {}), ...seed };
    case 'prunaai/z-image-turbo': return { prompt: i.prompt, width: i.imageSize?.width ?? 1024, height: i.imageSize?.height ?? 1024, ...seed };
    case 'qwen/qwen-image-edit-2511': return { prompt: i.prompt, image: (i.imageUrls ?? []).slice(0, 3), ...(i.aspectRatio ? { aspect_ratio: i.aspectRatio } : {}), output_format: 'png', ...seed }; // official model, $0.03/output image
    default: return { prompt: i.prompt, ...seed };
  }
}
export async function replicateSubmit(slug: string, input: Record<string, unknown>, key: string, o: { cancelAfterSec?: number; f?: Fetch } = {}): Promise<Prediction> {
  const r = await (o.f ?? fetch)(`${REPLICATE_API}/models/${slug}/predictions`, { method: 'POST', headers: { ...headers(key), ...(o.cancelAfterSec ? { 'Cancel-After': `${Math.max(5, Math.ceil(o.cancelAfterSec))}s` } : {}) }, body: JSON.stringify({ input }) });
  if (r.status === 429) throw new BusyError(`replicate submit 429: ${(await r.text()).slice(0, 300)}`, 429, retryAfterMs(r.headers)); // busy: refused before it started (busyRetry.ts)
  if (!r.ok) throw new Error(`replicate submit ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json() as Promise<Prediction>;
}
export async function replicateGet(id: string, key: string, f: Fetch = fetch): Promise<Prediction> {
  const r = await f(`${REPLICATE_API}/predictions/${id}`, { headers: headers(key) }); if (!r.ok) throw httpError(`replicate get ${r.status}`, r.status); return r.json() as Promise<Prediction>;
}
/** Ask Replicate to cancel (best effort, never throws): true when it was accepted (or the prediction is already finished). */
export async function replicateCancel(id: string, key: string, f: Fetch = fetch) { try { const r = await f(`${REPLICATE_API}/predictions/${id}/cancel`, { method: 'POST', headers: headers(key) }); return r.ok; } catch { return false; } }
/** First output URL (string or string[] outputs). */
export const outputUrls = (p: Prediction): string[] => (typeof p.output === 'string' ? [p.output] : Array.isArray(p.output) ? p.output.filter((x): x is string => typeof x === 'string') : []);
/** A busy submit (429) is sent again later (busyRetry.ts): Replicate never created the prediction, so nothing runs twice.
 *  Polling keeps the SAME prediction through network blips (hostedPoll.ts); resume = a prediction id from before (restart / Retry download):
 *  no submit, only polling. isCanceled → Replicate is asked to cancel and the run throws 'canceled'. */
export async function replicateRun(slug: string, input: Record<string, unknown>, key: string, o: { timeoutMs: number; pollMs?: number; f?: Fetch; onSubmit?: (id: string) => void; onStatus?: (p: Prediction) => void; onBusy?: (ms: number) => void; resume?: string | null; isCanceled?: () => boolean; sleep?: (ms: number) => Promise<void> }) {
  const f = o.f ?? fetch; const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const tol = new PollTolerance('Replicate'); const pollMs = o.pollMs ?? HOSTED_POLL_MS();
  let p: Prediction | null = null; let id = o.resume ?? '';
  if (!id) { p = await withBusyRetry(() => replicateSubmit(slug, input, key, { cancelAfterSec: o.timeoutMs / 1000, f }), { busyOf: (e) => (e instanceof BusyError ? e : null), onWait: (ms) => o.onBusy?.(ms), deadline: Date.now() + o.timeoutMs });
    id = p.id; o.onSubmit?.(p.id); }
  const end = Date.now() + o.timeoutMs;
  for (;;) {
    if (o.isCanceled?.()) { await replicateCancel(id, key, f); throw new Error('canceled'); }
    if (p) { o.onStatus?.(p);
      if (p.status === 'succeeded') return { requestId: p.id, prediction: p, urls: outputUrls(p) };
      if (p.status === 'failed' || p.status === 'canceled') throw new Error(`replicate ${p.status}: ${p.error ?? ''}`.trim()); }
    if (Date.now() >= end) { await replicateCancel(id, key, f); const e = new Error('replicate timeout'); (e as any).timeout = true; throw e; }
    if (p) await sleep(tol.wait(pollMs));
    const g = await tol.read(() => replicateGet(id, key, f)); if (g === MISS) { p = null; await sleep(tol.wait(pollMs)); continue; } p = g;
  }
}
