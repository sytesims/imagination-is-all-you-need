/**
 * fal queue client, built only from https://docs.fal.ai/model-apis/model-endpoints/queue (read 2026-10-16):
 *   submit  POST https://queue.fal.run/{model_id}                      body = model input JSON   → { request_id, status_url, response_url, cancel_url }
 *   status  GET  https://queue.fal.run/{model_id}/requests/{id}/status  → { status: IN_QUEUE|IN_PROGRESS|COMPLETED, queue_position?, error?, error_type?, metrics? }
 *   result  GET  https://queue.fal.run/{model_id}/requests/{id}          → model output (images[] for image models)
 *   cancel  PUT  https://queue.fal.run/{model_id}/requests/{id}/cancel
 *   auth    Authorization: Key $FAL_KEY. Optional X-Fal-Request-Start-Timeout (seconds).
 * We follow the status_url / response_url returned by submit (fal's own guidance) and only build URLs when they are missing.
 */
import { BusyError, retryAfterMs, withBusyRetry } from '../busyRetry.js';
export const FAL_QUEUE = 'https://queue.fal.run';
export interface FalSubmit { request_id: string; status_url?: string; response_url?: string; cancel_url?: string; queue_position?: number }
export interface FalStatus { status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED'; request_id?: string; queue_position?: number; response_url?: string; error?: string; error_type?: string; metrics?: { inference_time?: number } }
export interface FalImageResult { images: { url: string; width?: number; height?: number; content_type?: string }[]; seed?: number; prompt?: string }
type Fetch = typeof fetch;
const headers = (key: string) => ({ Authorization: `Key ${key}`, 'Content-Type': 'application/json' });
export const falUrls = (slug: string, id: string) => ({ status: `${FAL_QUEUE}/${slug}/requests/${id}/status`, result: `${FAL_QUEUE}/${slug}/requests/${id}`, cancel: `${FAL_QUEUE}/${slug}/requests/${id}/cancel` });
/** FLUX.3 Klein output size for our 1K/2K/4K tiers (equal-area: tier² pixels at the asked aspect), sides 256–4096 in steps of 16 (fal page: each side 256–4096). */
export function kleinImageSize(tier?: string, aspect?: string, explicit?: { width: number; height: number }) {
  const clamp = (n: number) => Math.min(4096, Math.max(256, Math.round(n / 16) * 16));
  if (explicit) return { width: clamp(explicit.width), height: clamp(explicit.height) };
  const edge = ({ '1K': 1024, '2K': 2048, '4K': 4096 } as Record<string, number>)[String(tier ?? '').toUpperCase()]; if (!edge) return null;
  const [a, b] = /^(\d+):(\d+)$/.test(aspect ?? '') ? aspect!.split(':').map(Number) : [1, 1]; const r = a / b;
  let w = edge * Math.sqrt(r), h = edge / Math.sqrt(r); const k = Math.min(1, 4096 / Math.max(w, h)); w *= k; h *= k;
  return { width: clamp(w), height: clamp(h) };
}
/** FLUX.2 [max] on fal: {width,height} with area at most 1 MP (1K) or 4 MP (2K) (10^6 px), sides multiples of 16 rounded down. */
export function flux2MaxSize(tier?: string, aspect?: string) {
  const area = String(tier ?? '').toUpperCase() === '2K' ? 4_000_000 : 1_000_000;
  const [a, b] = /^(\d+):(\d+)$/.test(aspect ?? '') ? aspect!.split(':').map(Number) : [1, 1]; const r = a / b;
  return { width: Math.floor(Math.sqrt(area * r) / 16) * 16, height: Math.floor(Math.sqrt(area / r) / 16) * 16 };
}
/** Text-to-image input per the model pages' API schema (prompt required; seed, num_images optional; image_size on Qwen/Z-Image/FLUX.2, resolution+aspect_ratio on Nano Banana 2). */
export function falImageInput(slug: string, i: { prompt: string; seed?: number; aspectRatio?: string; loras?: { path: string; scale: number }[]; imageUrls?: string[]; imageSize?: { width: number; height: number }; idWeight?: number; imageRes?: string; promptExpansion?: boolean }) {
  const body: Record<string, unknown> = { prompt: i.prompt, ...(Number.isInteger(i.seed) ? { seed: i.seed } : {}) };
  if (slug === 'fal-ai/z-image/turbo/lora' && i.loras?.length) body.loras = i.loras.slice(0, 3);
  // OpenSoul reference routes (schemas from the model pages' API tab, 2026-10-17)
  if (slug === 'fal-ai/qwen-image-edit-2511') return { ...body, image_urls: (i.imageUrls ?? []).slice(0, 3), ...(i.imageSize ? { image_size: i.imageSize } : {}), num_images: 1, output_format: 'png' };
  if (slug === 'fal-ai/flux-pulid') return { ...body, reference_image_url: i.imageUrls?.[0], image_size: i.imageSize ?? 'portrait_4_3', id_weight: i.idWeight ?? 1 };
  // FLUX 3 Klein t2i (fal page API tab, 2026-10-17): image_size = enum or {width,height} each 256–4096; num_images; output_format jpeg|png|webp; enable_prompt_expansion (default true); no refs.
  if (slug === 'blackforestlabs/flux-3/klein/text-to-image' || slug === 'blackforestlabs/flux-3/klein/edit-image') {
    const edit = slug.endsWith('/edit-image'); const size = kleinImageSize(i.imageRes, i.aspectRatio, i.imageSize);
    // The price is per output tier, so we always send an explicit {width,height} for the tier we quoted (edit: only when a tier is asked; else fal's ref-size default).
    return { ...body, ...(size && (!edit || i.imageRes) ? { image_size: size } : !edit ? { image_size: 'square_hd' } : {}), num_images: 1, output_format: 'png',
      ...(edit ? { image_urls: (i.imageUrls ?? []).slice(0, 10) } : {}), ...(i.promptExpansion === false ? { enable_prompt_expansion: false } : {}) };
  }
  if (slug === 'fal-ai/nano-banana-2/edit') return { ...body, image_urls: (i.imageUrls ?? []).slice(0, 4), num_images: 1, aspect_ratio: i.aspectRatio && i.aspectRatio !== 'auto' ? i.aspectRatio : 'auto', output_format: 'png' }; // Face Swap / Shots: target first, face second (fal page API tab, 2026-10-21)
  // FLUX.2 [max] text-to-image (fal page API tab, 2026-10-22): image_size enum or {width,height}; billed per processed megapixel ($0.07 first, $0.03 each more),
  // so the size we quote is sent explicitly: area ≤ 1,000,000 px (1K) or ≤ 4,000,000 px (2K) at the asked aspect, multiples of 16. No num_images field.
  if (slug === 'fal-ai/flux-2-max') return { ...body, image_size: flux2MaxSize(i.imageRes, i.aspectRatio), output_format: 'png', safety_tolerance: '2' };
  // FLUX.2 [pro] text-to-image: image_size {width,height} for the picked shape at ≤ 1 MP (the $0.03 first-megapixel price the route row quotes), same form as flux-2-max.
  if (slug === 'fal-ai/flux-2-pro') return { ...body, image_size: flux2MaxSize('1K', i.aspectRatio) };
  if (slug === 'fal-ai/nano-banana-2') { body.num_images = 1; if (i.aspectRatio) body.aspect_ratio = i.aspectRatio; }
  else { body.image_size = slug.startsWith('fal-ai/z-image') && i.imageSize ? i.imageSize : 'square_hd'; if (slug !== 'fal-ai/flux-2-pro') body.num_images = 1; }
  return body;
}
export async function falSubmit(slug: string, input: Record<string, unknown>, key: string, opts: { startTimeoutSec?: number; f?: Fetch } = {}): Promise<FalSubmit> {
  const r = await (opts.f ?? fetch)(`${FAL_QUEUE}/${slug}`, { method: 'POST', headers: { ...headers(key), ...(opts.startTimeoutSec ? { 'X-Fal-Request-Start-Timeout': String(opts.startTimeoutSec) } : {}) }, body: JSON.stringify(input) });
  if (r.status === 429) throw new BusyError(`fal submit 429: ${(await r.text()).slice(0, 300)}`, 429, retryAfterMs(r.headers)); // busy: refused before it started (busyRetry.ts)
  if (!r.ok) throw new Error(`fal submit ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json() as Promise<FalSubmit>;
}
export async function falStatus(statusUrl: string, key: string, f: Fetch = fetch): Promise<FalStatus> {
  const r = await f(statusUrl, { headers: headers(key) }); if (!r.ok) throw new Error(`fal status ${r.status}`); return r.json() as Promise<FalStatus>;
}
export async function falResult<T = FalImageResult>(responseUrl: string, key: string, f: Fetch = fetch): Promise<T> {
  const r = await f(responseUrl, { headers: headers(key) }); if (!r.ok) throw new Error(`fal result ${r.status}: ${(await r.text()).slice(0, 300)}`); return r.json() as Promise<T>;
}
export async function falCancel(cancelUrl: string, key: string, f: Fetch = fetch) { await f(cancelUrl, { method: 'PUT', headers: headers(key) }).catch(() => {}); }
/** submit → poll status until COMPLETED (error/error_type = failure) → fetch result. */
/** A busy submit (429) is sent again later (busyRetry.ts): fal never queued it, so nothing runs twice. onBusy(ms) = waiting that long. */
export async function falRun(slug: string, input: Record<string, unknown>, key: string, o: { timeoutMs: number; pollMs?: number; f?: Fetch; onStatus?: (s: FalStatus) => void; onSubmit?: (id: string) => void; onBusy?: (ms: number) => void }) {
  const f = o.f ?? fetch;
  const sub = await withBusyRetry(() => falSubmit(slug, input, key, { startTimeoutSec: Math.ceil(o.timeoutMs / 1000), f }), { busyOf: (e) => (e instanceof BusyError ? e : null), onWait: (ms) => o.onBusy?.(ms), deadline: Date.now() + o.timeoutMs });
  o.onSubmit?.(sub.request_id);
  const u = falUrls(slug, sub.request_id); const statusUrl = sub.status_url ?? u.status; const responseUrl = sub.response_url ?? u.result;
  const end = Date.now() + o.timeoutMs;
  for (;;) {
    const s = await falStatus(statusUrl, key, f); o.onStatus?.(s);
    if (s.status === 'COMPLETED') { if (s.error || s.error_type) throw new Error(`fal ${s.error_type ?? 'error'}: ${s.error ?? ''}`.trim()); return { requestId: sub.request_id, status: s, result: await falResult(s.response_url ?? responseUrl, key, f) }; }
    if (Date.now() >= end) { await falCancel(sub.cancel_url ?? u.cancel, key, f); const e = new Error('fal timeout'); (e as any).timeout = true; throw e; }
    await new Promise((r) => setTimeout(r, o.pollMs ?? 1500));
  }
}
