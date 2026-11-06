/**
 * Sunra queue client (place-sunra). Built only from Sunra's docs (read 2026-11-03, local copy in the research notes; no key, no live call yet):
 *   submit  POST {base}/v1/queue/{owner}/{model}/{endpoint}   body = model input JSON → { request_id, status_url, response_url, cancel_url }
 *   status  GET  {base}/v1/queue/requests/{id}/status          → { status: IN_QUEUE|IN_PROGRESS|COMPLETED|CANCELED, queue_position?, success?, error?, billing? }
 *   result  GET  {base}/v1/queue/requests/{id}                 → model output ({ video: { url } } / { images: [{ url }] }); a failed one: 400 PREDICTION_FAILED
 *   cancel  PUT  {base}/v1/queue/requests/{id}/cancel          (only while queued; 409 QUEUE_ITEM_CANNOT_BE_CANCELED otherwise)
 *   upload  POST {base}/v1/storage/upload/initiate {file_name, content_type} → { upload_url, file_url }; then PUT the bytes to upload_url
 *   auth    Authorization: Key $SUNRA_KEY (only on {base}; the pre-signed PUT carries none)
 * Docs: https://docs.sunra.ai/multimodal/queue · https://docs.sunra.ai/platform/file-upload · https://docs.sunra.ai/platform/errors ·
 *       https://docs.sunra.ai/platform/authentication
 * The request URLs are always built from {base} + request_id (the documented paths), so the key never goes to a host the response names.
 * A failed prediction carries error { code, reason?, retryable, message }: "Failed predictions are not charged" (platform/errors). Polling is
 * the source of truth (the SSE stream at /status/stream is not used: a desktop app polls and resumes after a restart the same way).
 */
import fs from 'node:fs/promises'; import path from 'node:path';
import { BusyError, retryAfterMs, withBusyRetry } from '../busyRetry.js';
import { PollTolerance, MISS, httpError, HOSTED_POLL_MS } from '../hostedPoll.js';
import { PlaceError, type PlaceErrorClass, type PlaceCost } from '../services/places.js';
import { mimeOfFile } from '../mediaHandoff.js';

type Fetch = typeof fetch;
export const SUNRA_BASE = 'https://api.sunra.ai';
/** The route body may name the model endpoint (text-to-video, image-to-video…) under this key; the runner strips it before sending. */
export const SUNRA_ENDPOINT = '__sunraEndpoint';
export interface SunraHandle { requestId: string; statusUrl: string; responseUrl: string; cancelUrl: string }
export interface SunraError { code?: string; reason?: string; retryable?: boolean; message?: string }
export interface SunraStatus { status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED' | string; queue_position?: number; success?: boolean; error?: SunraError | null;
  billing?: { status?: string; usage?: string; unit_amount?: string; amount?: string; currency?: string } }
const H = (key: string) => ({ Authorization: `Key ${key}`, 'Content-Type': 'application/json' });
const trim = (b: string) => b.replace(/\/+$/, '');
export const sunraUrls = (base: string, id: string) => { const q = `${trim(base)}/v1/queue/requests/${encodeURIComponent(id)}`; return { status: `${q}/status`, result: q, cancel: `${q}/cancel` }; };

/** A prediction's failure (status error / result error.details) → our class. https://docs.sunra.ai/platform/errors#prediction-failure-codes */
export function sunraFailureClass(e: SunraError | null | undefined): PlaceErrorClass {
  const code = String(e?.code ?? ''); const reason = String(e?.reason ?? '');
  if (code === 'invalid_input') return 'bad_input';
  if (code === 'unsafe_content') return 'moderation';
  if (reason === 'provider_rate_limited') return 'rate_limited';
  if (code === 'service_provider_error' || code === 'task_timeout' || code === 'internal_server_error') return 'provider_down';
  return 'unknown';
}
/** An API request error (HTTP status + error.code) → our class. https://docs.sunra.ai/platform/errors#api-request-errors */
export function sunraHttpClass(status: number, code = ''): PlaceErrorClass {
  if (status === 402 || status === 412 || /CREDIT/.test(code)) return 'out_of_credit'; // PREDICTION_CREDITS_ERROR 402, INSUFFICIENT_CREDIT 412
  if (status === 429) return 'rate_limited';
  if (status === 400 || status === 413 || status === 415 || status === 422) return 'bad_input';
  if (status >= 500) return 'provider_down';
  return 'unknown'; // 401 / 403: the key or the account
}
async function failHttp(where: string, r: Response): Promise<never> {
  const text = await r.text().catch(() => ''); let code = ''; let msg = text.slice(0, 300);
  try { const j = JSON.parse(text); code = String(j?.error?.code ?? ''); msg = String(j?.error?.message ?? msg); } catch { /* not JSON (an edge error) */ }
  if (r.status === 401 || r.status === 403) throw new PlaceError(`Sunra didn’t accept the key (${r.status}${code ? ` ${code}` : ''}): ${msg}`, 'unknown', { status: r.status });
  throw new PlaceError(`Sunra ${where} ${r.status}${code ? ` ${code}` : ''}: ${msg}`, sunraHttpClass(r.status, code), { status: r.status, temporary: r.status >= 500 });
}

export async function sunraSubmit(base: string, modelPath: string, endpoint: string, input: Record<string, unknown>, key: string, f: Fetch = fetch): Promise<SunraHandle> {
  const r = await f(`${trim(base)}/v1/queue/${modelPath}/${endpoint}`, { method: 'POST', headers: H(key), body: JSON.stringify(input) });
  if (r.status === 429) throw new BusyError(`Sunra submit 429: ${(await r.text()).slice(0, 200)}`, 429, retryAfterMs(r.headers)); // refused before it was queued (busyRetry.ts)
  if (!r.ok) await failHttp('submit', r);
  const j = (await r.json()) as { request_id?: string };
  if (!j.request_id) throw new PlaceError('Sunra answered the submit without a request_id', 'unknown');
  const u = sunraUrls(base, j.request_id); return { requestId: j.request_id, statusUrl: u.status, responseUrl: u.result, cancelUrl: u.cancel };
}
export async function sunraStatus(base: string, id: string, key: string, f: Fetch = fetch): Promise<SunraStatus> {
  const r = await f(sunraUrls(base, id).status, { headers: H(key) }); if (!r.ok) throw httpError(`Sunra status ${r.status}`, r.status); return r.json() as Promise<SunraStatus>;
}
export async function sunraResult(base: string, id: string, key: string, f: Fetch = fetch): Promise<any> {
  const r = await f(sunraUrls(base, id).result, { headers: H(key) });
  if (r.status === 400) { const j = await r.json().catch(() => null) as any; const d = j?.error?.details; // PREDICTION_FAILED: the prediction's own error
    if (d) throw new PlaceError(`Sunra: ${d.message ?? d.code}`, sunraFailureClass(d), { temporary: false }); throw httpError(`Sunra result 400: ${String(j?.error?.message ?? '')}`, 400); }
  if (!r.ok) throw httpError(`Sunra result ${r.status}`, r.status); return r.json();
}
/** Ask Sunra to cancel (never throws): true accepted; false not confirmed (already running: 409, or an error). */
export async function sunraCancel(base: string, id: string, key: string, f: Fetch = fetch): Promise<boolean> {
  try { const r = await f(sunraUrls(base, id).cancel, { method: 'PUT', headers: H(key) }); return r.ok || r.status === 404; } catch { return false; }
}
/** The output link of a result: { video: { url } } (video endpoints), { images: [{ url }] } (image endpoints). */
export const sunraOutputUrls = (o: any): string[] => [o?.video?.url, o?.audio?.url, o?.model?.url, ...(Array.isArray(o?.images) ? o.images.map((x: any) => (typeof x === 'string' ? x : x?.url)) : [])].filter((u): u is string => typeof u === 'string' && !!u);
/** What the run cost, when the status says (billing.amount in USD). Information only. */
export const sunraCost = (s: SunraStatus | null): PlaceCost | undefined => { const a = Number(s?.billing?.amount); return Number.isFinite(a) && a >= 0 && (s?.billing?.currency ?? 'USD') === 'USD' && s?.billing?.amount != null ? { usd: a, source: 'provider' } : undefined; };

/** Put one file on Sunra storage: initiate (with the key), then PUT the bytes to the pre-signed URL (no key). Returns the public file_url. */
export async function sunraUpload(base: string, file: string, key: string, f: Fetch = fetch): Promise<string> {
  const ext = path.extname(file).toLowerCase() || '.bin'; const type = mimeOfFile(file); const name = `upload${ext}`;
  const r = await f(`${trim(base)}/v1/storage/upload/initiate`, { method: 'POST', headers: H(key), body: JSON.stringify({ file_name: name, content_type: type }) });
  if (!r.ok) await failHttp('upload', r);
  const j = (await r.json()) as { upload_url?: string; file_url?: string }; if (!j.upload_url || !j.file_url) throw new PlaceError('Sunra upload: no upload_url / file_url', 'unknown');
  const put = await f(j.upload_url, { method: 'PUT', headers: { 'Content-Type': type }, body: new Uint8Array(await fs.readFile(file)) });
  if (!put.ok) throw new PlaceError(`Sunra upload PUT ${put.status}`, put.status >= 500 ? 'provider_down' : 'unknown', { status: put.status });
  return j.file_url;
}

/** submit (or resume) → poll status until COMPLETED → fetch the result. A busy submit (429) is sent again later; polling keeps the same id
 *  through blips (hostedPoll.ts); isCanceled → Sunra is asked to cancel and the run throws 'canceled'. */
export async function sunraRun(base: string, modelPath: string, body: Record<string, unknown>, key: string, o: { timeoutMs: number; pollMs?: number; f?: Fetch; resume?: SunraHandle | null;
  onSubmit?: (h: SunraHandle) => void; onStatus?: (s: SunraStatus) => void; onBusy?: (ms: number) => void; isCanceled?: () => boolean; sleep?: (ms: number) => Promise<void> }) {
  const f = o.f ?? fetch; const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let h = o.resume ?? null;
  if (!h) {
    const { [SUNRA_ENDPOINT]: ep, ...input } = body; if (typeof ep !== 'string' || !ep) throw new Error('Sunra route body names no endpoint');
    h = await withBusyRetry(() => sunraSubmit(base, modelPath, ep, input, key, f), { busyOf: (e) => (e instanceof BusyError ? e : null), onWait: (ms) => o.onBusy?.(ms), deadline: Date.now() + o.timeoutMs });
    o.onSubmit?.(h);
  }
  const end = Date.now() + o.timeoutMs; const tol = new PollTolerance('Sunra'); const pollMs = o.pollMs ?? HOSTED_POLL_MS();
  for (;;) {
    if (o.isCanceled?.()) { await sunraCancel(base, h.requestId, key, f); throw new Error('canceled'); }
    const s = await tol.read(() => sunraStatus(base, h!.requestId, key, f));
    if (s !== MISS) { o.onStatus?.(s);
      if (s.status === 'CANCELED') throw new Error('canceled at Sunra');
      if (s.status === 'COMPLETED') {
        if (s.success === false || s.error) throw new PlaceError(`Sunra: ${s.error?.message ?? s.error?.code ?? 'the prediction failed'}`, sunraFailureClass(s.error), { temporary: !!s.error?.retryable });
        const res = await tol.read(() => sunraResult(base, h!.requestId, key, f));
        if (res !== MISS) return { handle: h, status: s, result: res, urls: sunraOutputUrls(res), cost: sunraCost(s) };
      } }
    if (Date.now() >= end) { await sunraCancel(base, h.requestId, key, f); const e = new Error('Sunra timeout'); (e as any).timeout = true; throw e; }
    await sleep(tol.wait(pollMs));
  }
}
