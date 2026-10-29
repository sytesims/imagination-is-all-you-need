/**
 * Comfy Router client (Comfy Developer Platform: "thousands of models in one API"). Spec: https://docs.comfy.org/router-openapi.yaml
 * (copy: readiness/contracts/spec/router-openapi.yaml), guides under https://docs.comfy.org/development/comfy-router/.
 *
 *  - base https://api.comfy.org (OPENHIGGSFIELD_COMFY_ROUTER_URL overrides it, tests point it at a stub); key in `X-API-Key: comfyui-…`.
 *  - price first: POST /v2/models/{provider}/{model}/estimate → RouterCostEstimate {source exact|estimated|unknown, amount, credits…}.
 *    While the estimate rolls out it answers 403 not_enabled: that is "no estimate", never a failure.
 *  - queued (default): POST /v2/models/{provider}/{model}/requests?fallback_provider=false (+ Idempotency-Key) → 201 {request_id, status_url, response_url, cancel_url};
 *    poll status_url (IN_QUEUE | IN_PROGRESS | COMPLETED, error_type on a failed COMPLETED) waiting the Retry-After it names; collect
 *    response_url once (200 = the model's native output, 202 = not ready). The three URLs are used as returned, never composed.
 *  - synchronous: POST /v2/models/{provider}/{model}?fallback_provider=false → 200 native output. Only for models the queue refuses (ElevenLabs: raw audio bytes).
 *    fallback_provider (query parameter; omitted = on) would retry a failed call once on another serving provider at that provider's rate,
 *    so the charge could differ from the quote: every generation call (sync and queued) turns it off. The queue has no fallback loop today
 *    (spec, submit estimate: "fallback_provider never changes the leg that runs"), so there it is inert; it is sent anyway so no route can
 *    ever re-run a job elsewhere. Estimate / status / result / cancel calls carry nothing.
 *  - actual cost: X-Comfy-Credits-Used on the result (Comfy credits, $1 = 211). Absent = not reported (never "free").
 *  - errors: X-Comfy-Error-Type bucket + status → our reason code and one plain sentence (routerErrorFor). No retry loops here:
 *    the run fails fast and routing/run.ts puts the credits back.
 * The key is never logged and never sent to a host other than the Router base.
 */
import { env } from './env.js';
import { retryAfterMs, withBusyRetry } from './busyRetry.js';
export const routerBase = () => (env('COMFY_ROUTER_URL') || 'https://api.comfy.org').replace(/\/+$/, '');
/** @deprecated kept for readiness/contracts (the base at import time). */
export const ROUTER_BASE = routerBase();
/** Query string on every Router generation call (sync and queued): no provider fallback, so a failure is returned (nothing charged) instead of re-run elsewhere. */
export const ROUTER_NO_FALLBACK = '?fallback_provider=false';
export interface RouterRequest { provider: string; model: string; body: Record<string, unknown>; long?: boolean }
export interface RouterPlan { estimate: { method: 'POST'; url: string }; submit: { method: 'POST'; url: string }; poll?: { method: 'GET'; url: string; honourRetryAfter: true }; headers: Record<string, string> }
/** The HTTP calls a run makes (header shows a redacted key). Used by the contract test; the client below sends the same calls. */
export function routerPlan(r: RouterRequest, useBearer = false): RouterPlan {
  const base = `${routerBase()}/v2/models/${encodeURIComponent(r.provider)}/${encodeURIComponent(r.model)}`;
  const headers: Record<string, string> = useBearer ? { Authorization: 'Bearer comfyui-…' } : { 'X-API-Key': 'comfyui-…' };
  return { estimate: { method: 'POST', url: `${base}/estimate` }, submit: { method: 'POST', url: `${base}${r.long ? '/requests' : ''}${ROUTER_NO_FALLBACK}` },
    ...(r.long ? { poll: { method: 'GET' as const, url: `${base}/requests/{request_id}/status`, honourRetryAfter: true as const } } : {}), headers };
}

export type RouterReason = 'key_invalid' | 'cloud_credits' | 'cloud_plan' | 'route_not_enabled' | 'content_blocked' | 'input_invalid' | 'model_unavailable' | 'queue_full'
  | 'provider_error' | 'cloud_timeout' | 'cloud_unreachable' | 'submit_uncertain' | 'price_changed' | 'canceled'
  /** comfy/storage.ts: the file could not be uploaded to Comfy storage (before any model call). */ | 'upload_failed';
/** Plain sentences (they follow "<route> failed: "). */
export const ROUTER_MESSAGES: Record<RouterReason, string> = {
  key_invalid: 'the Comfy key was not accepted (it is missing, wrong or revoked). Check the key in Settings.',
  cloud_credits: 'your Comfy account is out of credits. Add credits on comfy.org, then try again.',
  cloud_plan: "your Comfy plan doesn't include API access; Standard or higher is needed.",
  route_not_enabled: "Comfy Router doesn't run this model yet.",
  content_blocked: 'the provider refused this prompt or image (content policy).',
  input_invalid: 'the model did not accept these settings.',
  model_unavailable: "this model isn't available on Comfy Cloud for this account.",
  queue_full: 'Comfy Cloud is busy right now. Try again in a minute.',
  provider_error: 'the model provider had a problem with this request.',
  cloud_timeout: 'it took too long; the request was cancelled.',
  cloud_unreachable: 'Comfy Cloud could not be reached.',
  submit_uncertain: 'the request was not confirmed, so it was not sent again.',
  price_changed: 'Comfy now prices this run above the quote you accepted, so it was not started.',
  canceled: 'the request was cancelled.',
  upload_failed: 'your file could not be uploaded to Comfy storage, so nothing was sent to the model.',
};
/** What Comfy / the model provider said about a failure, kept on the job and in the log so a failure explains itself (2026-10-26, H3 Extend
 *  provider_error with no reason kept). From the RouterErrorResponse body (detail, upstream_detail, refusal_subject) and the X-Comfy-Upstream-*
 *  headers (docs.comfy.org/development/comfy-router/reference#routererrorresponse). Every text is sanitised (sanitizeProviderText). */
export interface ProviderFailure { errorType: string | null; httpStatus: number | null; upstreamStatus: number | null; detail: string | null; upstreamDetail: string | null; refusalSubject: string | null; requestId: string | null }
/** Provider / Router text made safe to keep and show: no data URIs, no signed-link query strings, no local paths, no key- or token-like strings; one line, capped. */
export function sanitizeProviderText(s: unknown, max = 500): string | null {
  if (s == null) return null; let t = typeof s === 'string' ? s : (() => { try { return JSON.stringify(s); } catch { return String(s); } })();
  t = t.replace(/data:[\w.+-]+\/[\w.+-]+;base64,[A-Za-z0-9+/=]+/g, 'data:…')
    .replace(/(https?:\/\/[^\s"'?#]+)\?[^\s"']*/g, '$1?…')
    .replace(/(?:\/(?:Users|home|private|var|tmp|opt|root|Volumes|mnt)|[A-Za-z]:\\)[^\s"',;)]*/g, '…')
    .replace(/\b(?:sk|pk|rk|key|api[_-]?key|token|bearer|comfyui|cmf)[-_:= ]+[A-Za-z0-9_\-.]{12,}/gi, '[redacted]')
    .replace(/\b(?=[A-Za-z0-9_\-]*\d)(?=[A-Za-z0-9_\-]*[A-Za-z])[A-Za-z0-9_\-]{40,}\b/g, '[redacted]')
    .replace(/\s+/g, ' ').trim();
  return t ? (t.length > max ? `${t.slice(0, max - 1)}…` : t) : null;
}
export class RouterError extends Error {
  /** What Comfy / the provider said (sanitised); null when nothing was said. */
  provider: ProviderFailure | null = null;
  constructor(readonly reasonCode: RouterReason, message: string, readonly httpStatus: number | null = null, readonly errorType: string | null = null,
    readonly temporary = false, readonly detail: string | null = null, readonly requestId: string | null = null) { super(message); }
}
/** The provider's own words for a failure, for the job card: "<detail> (provider: <upstream detail>)", or null. */
export const providerSaid = (p: ProviderFailure | null | undefined): string | null => {
  if (!p) return null; const a = p.detail, b = p.upstreamDetail && p.upstreamDetail !== p.detail ? p.upstreamDetail : null;
  return a && b ? `${a} (provider: ${b})` : a ?? b ?? null;
};
/** Status + X-Comfy-Error-Type (+ body) → our reason. Buckets per router-openapi.yaml RouterErrorType; unknown buckets read as internal_error. */
export function routerErrorFor(status: number, errorType: string | null, body = '', what = 'router', requestId: string | null = null, headers: Headers | null = null): RouterError {
  let j: any = null; try { j = JSON.parse(body); } catch { /* HTML / truncated: keep the status */ }
  const et = (errorType || j?.error_type || '').trim();
  const rawDetail = typeof j?.detail === 'string' ? j.detail : Array.isArray(j?.detail) ? j.detail.map((d: any) => `${(d?.loc ?? []).filter((x: any) => x !== 'body').join('.')}: ${d?.msg ?? ''}`).join('; ') : '';
  const detail = sanitizeProviderText(rawDetail) ?? (j == null && body.trim() && !/^\s*</.test(body) ? sanitizeProviderText(body, 300) : null) ?? ''; // a non-JSON, non-HTML body is kept as text
  const up = num(headers?.get('x-comfy-upstream-status'));
  const upstreamDetail = sanitizeProviderText(j?.upstream_detail ?? headers?.get('x-comfy-upstream-detail'));
  const refusalSubject = sanitizeProviderText(j?.refusal_subject ?? headers?.get('x-comfy-refusal-subject'), 40);
  const provider: ProviderFailure | null = detail || upstreamDetail || refusalSubject || up != null
    ? { errorType: et || null, httpStatus: status || null, upstreamStatus: up, detail: detail || null, upstreamDetail, refusalSubject, requestId } : null;
  const mk = (r: RouterReason, temp = false, msg = ROUTER_MESSAGES[r]) => { const e = new RouterError(r, msg, status, et || null, temp,
    `${what} → ${status} ${et}${up != null ? ` upstream ${up}` : ''} ${detail}${upstreamDetail ? ` | provider: ${upstreamDetail}` : ''}${refusalSubject ? ` | subject: ${refusalSubject}` : ''}`.replace(/\s+/g, ' ').trim().slice(0, 900), requestId); e.provider = provider; return e; };
  if (status === 401 || et === 'unauthorized') return mk('key_invalid');
  if (status === 402 || et === 'insufficient_credits') return mk('cloud_credits');
  // by errorType, not status (2026-10-27, job f609cfc5): not_enabled = Router isn't switched on for this model / caller yet (refused before any
  // run); only forbidden (not entitled) or a bare 403 is the plan
  if (et === 'not_enabled') return mk('route_not_enabled');
  if (et === 'forbidden' || (status === 403 && !et)) return mk('cloud_plan');
  if (et === 'content_policy_violation') return mk('content_blocked');
  if (et === 'model_not_found' || (status === 404 && et !== 'request_not_found')) return mk('model_unavailable');
  if (et === 'invalid_input' || status === 400 || status === 413 || status === 422) return mk('input_invalid', false, detail ? `the model did not accept these settings (${detail.slice(0, 200)}).` : ROUTER_MESSAGES.input_invalid);
  if (status === 429 || et === 'concurrency_limit_exceeded' || et === 'rate_limited' || et === 'queue_backlog_full') return mk('queue_full', true);
  if (et === 'provider_timeout' || et === 'deadline_exceeded' || et === 'queue_timeout' || status === 504) return mk('cloud_timeout', true);
  if (et === 'cancelled') return mk('canceled');
  if (et === 'provider_error' || status === 502) return mk('provider_error', true);
  return mk('cloud_unreachable', true);
}

export interface RouterEstimate { source: 'exact' | 'estimated' | 'unknown'; usd: number | null; minUsd: number | null; maxUsd: number | null; credits: number | null; reason?: string; pricingAsOf?: string }
export interface RouterHandle { requestId: string; statusUrl: string; responseUrl: string; cancelUrl: string; estimate: RouterEstimate | null }
export interface RouterResult { contentType: string; json: any | null; bytes: Buffer | null; creditsUsed: number | null; requestId: string | null; replayed: boolean }
const num = (s: unknown) => { const n = typeof s === 'number' ? s : Number(s); return s != null && s !== '' && Number.isFinite(n) ? n : null; };
export function parseEstimate(j: any): RouterEstimate {
  const src = j?.source === 'exact' || j?.source === 'estimated' ? j.source : 'unknown';
  return { source: src, usd: src === 'exact' ? num(j.amount) : null, minUsd: src === 'estimated' ? num(j.min_amount) : null, maxUsd: src === 'estimated' ? num(j.max_amount) : null,
    credits: num(j?.credits), ...(src === 'unknown' ? { reason: String(j?.reason ?? 'not_quotable') } : {}), ...(j?.pricing_as_of ? { pricingAsOf: String(j.pricing_as_of) } : {}) };
}
/** X-Comfy-Credits-Used → credits (a number), or null when absent / unreadable (absent = not reported, never free). */
export const creditsUsed = (h: Headers) => num(h.get('x-comfy-credits-used'));
const sleepDefault = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class ComfyRouter {
  readonly base: string;
  constructor(private readonly key: string, private readonly f: typeof fetch = (...a) => fetch(...a), base = routerBase(),
    private readonly sleep: (ms: number) => Promise<void> = sleepDefault, private readonly retryScale = Number(env('ROUTER_RETRY_SCALE')) || 1) { this.base = base.replace(/\/+$/, ''); }
  private url(model: string, suffix = '') { const [p, m] = model.split('/'); return `${this.base}/v2/models/${encodeURIComponent(p)}/${encodeURIComponent(m)}${suffix}`; }
  /** The key goes only to the Router base (a returned status/response URL on another host is refused, never followed with the key). */
  private assertOurs(u: string) { if (new URL(u).origin !== new URL(this.base).origin) throw new RouterError('cloud_unreachable', ROUTER_MESSAGES.cloud_unreachable, null, null, false, `refused to send the key to ${new URL(u).origin}`); }
  private async call(u: string, init: RequestInit, what: string): Promise<Response> {
    this.assertOurs(u);
    try { return await this.f(u, { ...init, headers: { ...(init.headers as any), 'X-API-Key': this.key } }); }
    catch (e) { throw new RouterError('cloud_unreachable', ROUTER_MESSAGES.cloud_unreachable, null, null, true, `${what}: ${e instanceof Error ? e.message : e}`); }
  }
  private async fail(r: Response, what: string): Promise<never> { const e = routerErrorFor(r.status, r.headers.get('x-comfy-error-type'), await r.text().catch(() => ''), what, r.headers.get('x-comfy-request-id'), r.headers); (e as any).retryAfterMs = retryAfterMs(r.headers); throw e; }
  /** A queued request that ended COMPLETED with an error_type: the status body carries only the bucket, so read the result URL once (free, GET) for
   *  the error response, whose detail / upstream_detail say why (docs.comfy.org/development/comfy-router/queue: "A request that failed comes back as
   *  an error response with X-Comfy-Error-Type set"). The bucket from the status stays authoritative; a failed read falls back to the bucket alone. */
  private async failedRequest(h: RouterHandle, errorType: string): Promise<RouterError> {
    const what = `request ${h.requestId}`; const base = routerErrorFor(0, errorType, '', what, h.requestId);
    try {
      const r = await this.call(h.responseUrl, { method: 'GET' }, 'collect'); const text = await r.text().catch(() => '');
      if (r.ok) return base; // a result or 202 instead of an error body: keep the status bucket
      const read = routerErrorFor(r.status, r.headers.get('x-comfy-error-type'), text, what, r.headers.get('x-comfy-request-id') ?? h.requestId, r.headers);
      if (!read.provider) return base;
      const e = new RouterError(base.reasonCode, base.message, read.httpStatus, base.errorType, base.temporary, `${what} → ${errorType} | ${read.detail ?? ''}`.slice(0, 900), h.requestId);
      e.provider = { ...read.provider, errorType: base.errorType ?? read.provider.errorType }; return e;
    } catch { return base; }
  }
  /** Provider busy (2026-10-25, busyRetry.ts): Router refused the call as busy (429 / queue_full) before taking it → the SAME call (same body, same
   *  Idempotency-Key) again after Retry-After or a backoff, at most BUSY_RETRIES more times; then the queue_full error, marked .busy. onBusy(ms) = waiting. */
  onBusy: ((ms: number, n: number) => void) | null = null;
  private busy<T>(fn: () => Promise<T>, mark = true): Promise<T> {
    return withBusyRetry(fn, { mark, busyOf: (e) => (e instanceof RouterError && e.reasonCode === 'queue_full' ? { retryAfterMs: (e as any).retryAfterMs ?? null } : null), onWait: (ms, n) => this.onBusy?.(ms, n), sleep: this.sleep, scale: this.retryScale });
  }
  private async result(r: Response): Promise<RouterResult> {
    const ct = (r.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase(); const buf = Buffer.from(await r.arrayBuffer());
    let json: any = null; if (ct === 'application/json' || ct.endsWith('+json')) { try { json = JSON.parse(buf.toString('utf8')); } catch { json = null; } }
    return { contentType: ct, json, bytes: json == null ? buf : null, creditsUsed: creditsUsed(r.headers), requestId: r.headers.get('x-comfy-request-id'), replayed: r.headers.get('idempotent-replayed') === 'true' };
  }
  /** Price before running. null = no estimate available (the route is still rolling out: 403 not_enabled). Other failures throw (key, credits, body). */
  async estimate(model: string, body: Record<string, unknown>): Promise<RouterEstimate | null> { return this.busy(() => this.estimateOnce(model, body)); }
  private async estimateOnce(model: string, body: Record<string, unknown>): Promise<RouterEstimate | null> {
    const r = await this.call(this.url(model, '/estimate'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, 'estimate');
    if (r.ok) return parseEstimate(await r.json());
    if (r.status === 403 && r.headers.get('x-comfy-error-type') === 'not_enabled') return null;
    if (r.status === 503) return null; // estimate service unavailable: our own price table stands
    return this.fail(r, 'estimate');
  }
  /** Synchronous run (models the queue refuses). A network error after sending is ambiguous: never resent. */
  async run(model: string, body: Record<string, unknown>, idem: string, timeoutMs = 11 * 60_000): Promise<RouterResult> { return this.busy(() => this.runOnce(model, body, idem, timeoutMs)); }
  private async runOnce(model: string, body: Record<string, unknown>, idem: string, timeoutMs: number): Promise<RouterResult> {
    let r: Response;
    try { r = await this.call(this.url(model, ROUTER_NO_FALLBACK), { method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': idem.slice(0, 255) }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) }, 'run'); }
    catch (e) { if (e instanceof RouterError && e.reasonCode === 'cloud_unreachable' && e.temporary) throw new RouterError('submit_uncertain', ROUTER_MESSAGES.submit_uncertain, null, null, false, e.detail); throw e; }
    if (!r.ok) return this.fail(r, 'run');
    return this.result(r);
  }
  /** Queue a run: 201 handle (URLs as returned). */
  async submit(model: string, body: Record<string, unknown>, idem: string): Promise<RouterHandle> { return this.busy(() => this.submitOnce(model, body, idem)); }
  private async submitOnce(model: string, body: Record<string, unknown>, idem: string): Promise<RouterHandle> {
    let r: Response;
    try { r = await this.call(this.url(model, `/requests${ROUTER_NO_FALLBACK}`), { method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': idem.slice(0, 255) }, body: JSON.stringify(body) }, 'submit'); }
    catch (e) { if (e instanceof RouterError && e.reasonCode === 'cloud_unreachable') throw new RouterError('submit_uncertain', ROUTER_MESSAGES.submit_uncertain, null, null, false, e.detail); throw e; }
    if (!r.ok) return this.fail(r, 'submit');
    const j: any = await r.json().catch(() => null);
    for (const k of ['request_id', 'status_url', 'response_url', 'cancel_url']) if (!j?.[k]) throw new RouterError('submit_uncertain', ROUTER_MESSAGES.submit_uncertain, r.status, null, false, `submit: missing ${k}`);
    return { requestId: String(j.request_id), statusUrl: String(j.status_url), responseUrl: String(j.response_url), cancelUrl: String(j.cancel_url), estimate: j.estimate ? parseEstimate(j.estimate) : null };
  }
  /** One status read: { status, errorType?, queuePosition?, retryAfterMs }. */
  async status(h: RouterHandle) {
    const r = await this.call(h.statusUrl, { method: 'GET' }, 'status'); if (!r.ok) return this.fail(r, 'status');
    const j: any = await r.json(); const ra = num(r.headers.get('retry-after'));
    if (!['IN_QUEUE', 'IN_PROGRESS', 'COMPLETED'].includes(j?.status)) throw new RouterError('provider_error', ROUTER_MESSAGES.provider_error, r.status, null, true, `status: unknown ${j?.status}`);
    return { status: j.status as 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED', errorType: (j.error_type as string | undefined) ?? null, queuePosition: num(j.queue_position), retryAfterMs: ra != null ? ra * 1000 : null };
  }
  /** Ask to cancel (best effort, never throws). */
  async cancel(h: RouterHandle): Promise<boolean> { try { const r = await this.call(h.cancelUrl, { method: 'PUT' }, 'cancel'); return r.status === 202 || r.status === 409; } catch { return false; } }
  /** Collect once COMPLETED: 200 result; 202 = not ready (null); an error status = the failure. */
  async collect(h: RouterHandle): Promise<RouterResult | null> {
    const r = await this.call(h.responseUrl, { method: 'GET' }, 'collect'); if (r.status === 202) { await r.arrayBuffer().catch(() => null); return null; }
    if (!r.ok) return this.fail(r, 'collect');
    return this.result(r);
  }
  /** Submit → poll (Retry-After) → collect. onSubmitted gets the request id at once; a timeout or our own cancel asks Router to cancel. */
  async runQueued(model: string, body: Record<string, unknown>, idem: string, o: { onSubmitted?: (h: RouterHandle) => void; onStatus?: (s: string, queuePosition: number | null) => void; isCanceled?: () => boolean; timeoutMs?: number; defaultPollMs?: number } = {}): Promise<RouterResult & { handle: RouterHandle }> {
    const h = await this.submit(model, body, idem); o.onSubmitted?.(h);
    const t0 = Date.now(); const limit = o.timeoutMs ?? 15 * 60_000;
    for (;;) {
      if (o.isCanceled?.()) { await this.cancel(h); throw new RouterError('canceled', ROUTER_MESSAGES.canceled, null, 'cancelled', false, `request ${h.requestId} cancelled by the user`); }
      if (Date.now() - t0 > limit) { await this.cancel(h); const e = new RouterError('cloud_timeout', ROUTER_MESSAGES.cloud_timeout, null, null, true, `request ${h.requestId}: no result after ${Math.round(limit / 1000)} s`); (e as any).timeout = true; throw e; }
      const s = await this.busy(() => this.status(h), false); o.onStatus?.(s.status, s.queuePosition); // a busy status read (429) waits and reads again: the request keeps running
      if (s.status === 'COMPLETED') {
        if (s.errorType) throw await this.failedRequest(h, s.errorType);
        const res = await this.busy(() => this.collect(h), false); if (res) return { ...res, handle: h };
      }
      await this.sleep(Math.max(50, (s.retryAfterMs ?? o.defaultPollMs ?? 3000) * this.retryScale));
    }
  }
}
