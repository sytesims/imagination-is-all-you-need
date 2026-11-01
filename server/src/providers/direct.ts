/**
 * Official lab APIs as direct providers (batch 1, 2026-10-23): one registry of providers and two generic runners.
 *
 *   DIRECT_PROVIDERS[id]  how to talk to one lab: auth header, base URL (+ env override), concurrency, poll pace, error mapping.
 *   DirectSpec            what one route sends: build(job) → HttpRequest, mode 'poll' (submit, then poll) or 'sync' (one call),
 *                         and the parsers that read the lab's own response shape.
 *   directRun(spec, req, key, hooks)  runs either mode with the same onSubmit / onStatus / onCost hooks and timeout; returns the
 *                         outputs (URL, base64 or hex) for routing/run.ts to save right away (lab URLs expire in 10 min–24 h).
 *
 * Adding a provider = one DIRECT_PROVIDERS entry + a DirectSpec per route (see providers/directSpecs.ts). Errors are DirectError with a
 * reasonCode the failure map already knows (web/src/shared/failureReasons.ts): key_invalid, provider_credits, content_blocked,
 * input_invalid, queue_full, provider_error.
 * Docs read 2026-10-23: BFL docs.bfl.ai (x-key, polling_url), MiniMax platform.minimax.io/docs (Bearer; v1 errors inside a 200 as
 * base_resp.status_code, v2 HTTP codes), LTX docs.ltx.io (Bearer, async v2, poll ≥ 5 s, 2 concurrent jobs by default, 429 over the queue cap).
 */
import type { HttpRequest } from '../hostedRequests.js';
import { env } from '../env.js';
import { BUSY_RETRIES, busyWaitMs } from '../busyRetry.js';
import { PollTolerance, MISS } from '../hostedPoll.js';

type Fetch = typeof fetch;
export type DirectReason = 'key_invalid' | 'provider_credits' | 'content_blocked' | 'input_invalid' | 'queue_full' | 'provider_error';
export class DirectError extends Error {
  constructor(message: string, public reasonCode: DirectReason, public httpStatus?: number, public retryAfterMs?: number) { super(message); }
  /** Temporary: worth trying again on the same place (busy queue, server error). */
  get temporary() { return this.reasonCode === 'queue_full' || (this.reasonCode === 'provider_error' && (this.httpStatus ?? 500) >= 500); }
}
export interface DirectOutput { url?: string; b64?: string; hex?: string; mime?: string }
export interface DirectCost { usd: number; units?: number; unitLabel?: string; settled: boolean; source: string }
export interface DirectProviderDef {
  id: string; name: string;
  /** Prefix for error messages (BFL keeps its old 'bfl submit 400: …' wording). */
  tag: string;
  auth: (key: string) => Record<string, string>;
  /** Official host; `baseEnv` (OPENHIGGSFIELD_<baseEnv>) swaps it for a regional host (MiniMax China, BFL EU/US). */
  defaultBase: string; baseEnv?: string;
  /** Jobs in flight at once on this account (LTX: 2 by default); extra jobs wait in the app. */
  maxConcurrent?: number;
  pollMs: number;
  /** Submit statuses answered by waiting and submitting again (Retry-After or backoff), until the job's timeout. */
  retryOn?: number[];
  /** HTTP error → DirectError. */
  httpError: (status: number, json: any, text: string) => DirectError;
  /** Errors a lab returns inside a 200 (MiniMax v1 base_resp.status_code). */
  bodyError?: (json: any) => DirectError | null;
}
export interface PollState { done: boolean; status?: string; outputs?: DirectOutput[]; error?: DirectError; cost?: DirectCost | null }
export interface DirectSpec {
  provider: string;
  mode: 'poll' | 'sync';
  build: (job: { id: string; input: Record<string, any> }) => Promise<HttpRequest>;
  /** poll mode: submit response → id + where to poll. */
  submit?: (json: any, req: HttpRequest, base: string) => { id: string; pollUrl: string; cost?: DirectCost | null };
  poll?: (json: any) => PollState;
  /** sync mode: the one response → outputs. */
  sync?: (json: any) => { outputs: DirectOutput[]; cost?: DirectCost | null; id?: string | null };
  /** Create Image n / Shots: one request per output image (default for image routes); video and audio routes send one request. */
  perOutput?: boolean;
  /** Real cost from the finished job (e.g. MiniMax usage.output_seconds × the rate); called with the final poll / sync JSON. */
  cost?: (json: any, job: { input: Record<string, any> }) => DirectCost | null;
}
/** resume: a poll-mode request from before (restart / Retry download): no submit, only polling its pollUrl. isCanceled: stop polling (the labs
 *  publish no cancel call, so the provider may still finish and bill it). */
export interface DirectHooks { timeoutMs?: number; pollMs?: number; resume?: { id: string; pollUrl: string } | null; isCanceled?: () => boolean; onSubmit?: (id: string, pollUrl?: string) => void; onStatus?: (status: string) => void; onCost?: (c: DirectCost) => void; f?: Fetch; sleep?: (ms: number) => Promise<void>; job?: { input: Record<string, any> } }

const bearer = (key: string) => ({ Authorization: `Bearer ${key}` });
const retryAfter = (h: Headers | undefined) => { const v = Number(h?.get?.('retry-after')); return Number.isFinite(v) && v > 0 ? v * 1000 : undefined; };
const cut = (s: string) => s.slice(0, 300);
/** MiniMax v1 codes (base_resp.status_code) and their v2 HTTP twins: 1002 rate, 1004 auth, 1008 balance, 1026 sensitive, 2013 params, 2049 bad key. */
export const MINIMAX_CODES: Record<number, DirectReason> = { 1002: 'queue_full', 1004: 'key_invalid', 2049: 'key_invalid', 1008: 'provider_credits', 1026: 'content_blocked', 2013: 'input_invalid' };
const byHttp = (s: number): DirectReason => (s === 401 || s === 403 ? 'key_invalid' : s === 402 ? 'provider_credits' : s === 429 ? 'queue_full' : s === 400 || s === 404 || s === 413 || s === 422 ? 'input_invalid' : 'provider_error');
export const DIRECT_PROVIDERS: Record<string, DirectProviderDef> = {
  bfl: { id: 'bfl', name: 'Black Forest Labs', tag: 'bfl', auth: (key) => ({ 'x-key': key }), defaultBase: 'https://api.bfl.ai', baseEnv: 'BFL_BASE_URL', pollMs: 1500,
    httpError: (s, _j, t) => new DirectError(`bfl submit ${s}: ${cut(t)}`, byHttp(s), s) },
  minimax: { id: 'minimax', name: 'MiniMax', tag: 'MiniMax', auth: bearer, defaultBase: 'https://api.minimax.io', baseEnv: 'MINIMAX_BASE_URL', pollMs: 5000,
    httpError: (s, j, t) => { const code = Number(j?.base_resp?.status_code); const r = MINIMAX_CODES[code] ?? (s === 422 ? 'content_blocked' : byHttp(s));
      return new DirectError(`MiniMax ${s}: ${cut(String(j?.error?.message ?? j?.base_resp?.status_msg ?? t))}`, r, s); },
    bodyError: (j) => { const b = j?.base_resp; if (!b || b.status_code == null || Number(b.status_code) === 0) return null; const c = Number(b.status_code);
      return new DirectError(`MiniMax ${c}: ${cut(String(b.status_msg ?? 'error'))}`, MINIMAX_CODES[c] ?? 'provider_error', c === 1002 ? 429 : undefined); } },
  ltx: { id: 'ltx', name: 'LTX', tag: 'LTX', auth: bearer, defaultBase: 'https://api.ltx.io', baseEnv: 'LTX_BASE_URL', maxConcurrent: 2, pollMs: 5000, retryOn: [429],
    httpError: (s, j, t) => new DirectError(`LTX ${s}: ${cut(String(j?.error?.message ?? t))}`, s === 422 ? 'content_blocked' : byHttp(s), s) },
};
/** Register another lab (batch 2+). */
export const registerDirectProvider = (p: DirectProviderDef) => { DIRECT_PROVIDERS[p.id] = p; };
/** The host this server talks to for a provider (env override for a regional host). */
export const directBase = (id: string) => { const p = DIRECT_PROVIDERS[id]; const o = p?.baseEnv ? env(p.baseEnv)?.trim() : ''; return (o || p?.defaultBase || '').replace(/\/$/, ''); };
/** Builders write the official host; swap it for the configured one. */
export const rebase = (url: string, id: string) => { const p = DIRECT_PROVIDERS[id]; const b = directBase(id); return p && b && url.startsWith(p.defaultBase) ? b + url.slice(p.defaultBase.length) : url; };

// ---- in-app queue: at most maxConcurrent jobs in flight per provider (LTX: 2) ----
const slots = new Map<string, { busy: number; wait: (() => void)[] }>();
async function acquire(p: DirectProviderDef, onStatus?: (s: string) => void) {
  if (!p.maxConcurrent) return () => {};
  const s = slots.get(p.id) ?? { busy: 0, wait: [] }; slots.set(p.id, s);
  if (s.busy >= p.maxConcurrent) { onStatus?.('waiting'); await new Promise<void>((ok) => s.wait.push(ok)); } else s.busy++;
  let done = false; return () => { if (done) return; done = true; const next = s.wait.shift(); if (next) next(); else s.busy--; };
}
/** Tests: jobs in flight / waiting per provider. */
export const directQueue = (id: string) => ({ busy: slots.get(id)?.busy ?? 0, waiting: slots.get(id)?.wait.length ?? 0 });

/** ok → the JSON body; an error → its text too (for the message). */
async function readJson(r: Response): Promise<{ j: any; t: string }> {
  if (r.ok) { try { const j = await r.json(); return { j, t: '' }; } catch { return { j: null, t: '' }; } }
  const t = await r.text().catch(() => ''); try { return { j: JSON.parse(t), t }; } catch { return { j: null, t }; } }
/** Run one request on a direct provider: submit + poll, or one sync call. Throws DirectError (timeout errors carry .timeout = true). */
export async function directRun(spec: DirectSpec, req0: HttpRequest, key: string, o: DirectHooks = {}): Promise<{ id: string | null; outputs: DirectOutput[] }> {
  const p = DIRECT_PROVIDERS[spec.provider]; if (!p) throw new Error(`unknown direct provider ${spec.provider}`);
  const f = o.f ?? fetch; const sleep = o.sleep ?? ((ms: number) => new Promise<void>((ok) => setTimeout(ok, ms)));
  const req: HttpRequest = { ...req0, url: rebase(req0.url, p.id) }; const headers: Record<string, string> = { ...(req.form ? {} : { 'Content-Type': 'application/json' }), accept: 'application/json', ...req.headers, ...p.auth(key) };
  const deadline = Date.now() + (o.timeoutMs ?? 15 * 60_000);
  const timeout = () => Object.assign(new DirectError(`${p.tag}: timed out waiting for the result`, 'provider_error'), { timeout: true });
  const release = await acquire(p, o.onStatus);
  try {
    if (o.resume && spec.mode === 'poll') return await pollDirect(spec, p, o.resume, key, o, deadline, sleep, f, timeout);
    // submit, retrying busy answers (2026-10-25, busyRetry.ts): every provider's queue_full (HTTP 429, MiniMax 1002 in a 200) and the
    // provider's own retryOn statuses. A refused submit never started, so sending it again can't run (or bill) it twice. At most
    // BUSY_RETRIES more tries, then the error is thrown with .busy = true.
    let sub: { j: any; t: string }; let tries = 0; let backoffs = 0; // backoffs: waits without a Retry-After (5 s, 10 s, 20 s…)
    for (;;) {
      const r = await f(req.url, { method: req.method, headers, ...(req.method === 'POST' ? { body: req.form ?? JSON.stringify(req.body ?? {}) } : {}) });
      sub = await readJson(r);
      const e = r.ok ? p.bodyError?.(sub.j) ?? null : p.httpError(r.status, sub.j, sub.t);
      if (!e) break;
      if (!r.ok) e.retryAfterMs = retryAfter(r.headers);
      if (!(e.reasonCode === 'queue_full' || (!r.ok && p.retryOn?.includes(r.status)))) throw e;
      const wait = busyWaitMs(backoffs, e.retryAfterMs); if (tries >= BUSY_RETRIES || Date.now() + wait > deadline) throw Object.assign(e, { busy: true, busyTries: tries + 1 });
      tries++; if (e.retryAfterMs == null) backoffs++; o.onStatus?.('waiting'); await sleep(wait);
    }
    if (spec.mode === 'sync') {
      const s = spec.sync!(sub.j); if (s.id) o.onSubmit?.(s.id); const c = spec.cost?.(sub.j, o.job ?? { input: {} }) ?? s.cost; if (c) o.onCost?.(c);
      if (!s.outputs.length) throw new DirectError(`${p.tag}: returned no output`, 'provider_error');
      return { id: s.id ?? null, outputs: s.outputs };
    }
    const h = spec.submit!(sub.j, req, directBase(p.id)); o.onSubmit?.(h.id, h.pollUrl); if (h.cost) o.onCost?.(h.cost);
    return await pollDirect(spec, p, h, key, o, deadline, sleep, f, timeout);
  } finally { release(); }
}
/** Poll one submitted request until it is done. A blip (network error, 5xx, 408, 429, a temporary lab error) polls the SAME id again with
 *  back-off (hostedPoll.ts); a definite lab answer (bad key, refused, input invalid, gone) ends it at once. */
async function pollDirect(spec: DirectSpec, p: DirectProviderDef, h: { id: string; pollUrl: string }, key: string, o: DirectHooks, deadline: number, sleep: (ms: number) => Promise<void>, f: Fetch, timeout: () => Error): Promise<{ id: string | null; outputs: DirectOutput[] }> {
  const tol = new PollTolerance(p.name); const pace = o.pollMs ?? p.pollMs;
  while (Date.now() < deadline) {
    await sleep(tol.wait(pace));
    if (o.isCanceled?.()) throw new Error('canceled');
    const got = await tol.read(async () => {
      const r = await f(h.pollUrl, { headers: { ...p.auth(key), accept: 'application/json' } }); const { j, t } = await readJson(r);
      if (!r.ok) { const e = p.httpError(r.status, j, t); e.message = e.message.replace(' submit ', ' poll '); throw e; }
      const be2 = p.bodyError?.(j); if (be2) throw be2;
      return j;
    });
    if (got === MISS) continue;
    const j = got; const s = spec.poll!(j); if (s.status) o.onStatus?.(s.status);
    if (!s.done) continue;
    if (s.error) throw s.error;
    const c = spec.cost?.(j, o.job ?? { input: {} }) ?? s.cost; if (c) o.onCost?.(c);
    if (!s.outputs?.length) throw new DirectError(`${p.tag}: finished without an output`, 'provider_error');
    return { id: h.id, outputs: s.outputs };
  }
  throw timeout();
}
