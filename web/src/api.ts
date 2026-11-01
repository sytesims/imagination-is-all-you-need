import { videoWorkflowOfTool, videoWorkflowHref, videoRedirect } from '../../server/src/shared/videoWorkflows';
import { placeVideoPlugins } from '../../server/src/shared/pluginPlacement';
import { applyHandoff } from './shared/handoffFiles';
import { applyLibraryRefs } from './shared/libraryFiles';
import { feedProjectId } from './shared/feedProject';
import { downloadIntentOf, setDownloadIntent, hasWeightsPrompt } from './shared/hardware';
import { beginSubmit, submitErrorMessage, isServerErrorBody, serverErrorDetail, httpErrorText } from './shared/submitGuard';
import { clientId } from './shared/clientId';
import { notePoll, isNetworkFail, isOffline, OFFLINE_MESSAGE } from './shared/connectivity';
import { priceOf, Price } from './shared/price';
import { plainCopy } from './shared/plainCopy';
import { noteError } from './shared/errorMeta';
import { quotedRoute, forgetQuote, seedQuote, requestRequote, noteQuoteParams } from './shared/quote';
import { cleanEnumParams, learnAllowed, registerAllowTools } from './shared/allowlist';
import { applyRunOnParams, noteToolModels } from './shared/models';
import { probeFormFiles } from './shared/formFiles';
/** The canvas agent panel sets this while the user's Go submits a proposal: every quote and submit then carries the MCP session's
 *  agent budget (server/src/agentBudget.ts), so set_budget limits still apply to runs started from the app. */
let agentBudgetHeader: string | null = null;
export const setAgentBudgetHeader = (id: string | null) => { agentBudgetHeader = id; };
/** Audit 07-09 P2: the API restarts in watch mode. A network error / connection refused, 502, 503 (or a proxy 500 with a
 *  non-JSON body) is retried with backoff; if it never comes back the error has kind 'server_restarting'. */
export const SERVER_RESTARTING = 'Server restarting, retrying…';
const RETRY_DELAYS = [400, 800, 1600, 3200];
/** BH4 G3: only an *empty* non-JSON 500 (what the dev proxy sends while the API is down) means "restarting".
 *  A 500 with a body is the server answering with an error: show it inline, don't retry or raise the restart banner. */
const isRestarting = async (r: Response) => r.status === 502 || r.status === 503 || (r.status === 500 && !/json/i.test(r.headers.get('content-type') ?? '') && !(await r.clone().text().catch(() => '')).trim());
/** Connection listeners: (retrying, why). why 'restart' = the proxy answered with an empty 500 / 502 / 503 (the API is restarting);
 *  'network' = no answer at all (offline, or the server can't be reached). Only 'restart' gets the restarting copy. */
export type NetWhy = 'restart' | 'network';
export const restartListeners = new Set<(retrying: boolean, why?: NetWhy) => void>();
export const UNREACHABLE = 'Can’t reach the server. This retries when the connection is back.';
/* B20 (enum allowlist): one guard for every quote and submit (/api/tools/<id>/price and /jobs), whichever page builds them:
 * a field the tool doesn't take (its allowlist is empty) is left out, an empty types/mode is left out, width/height are whole pixels
 * clamped to 16..16384. A 400 invalid_<field> teaches us the server's list; a quote that sent an ignored field is asked again without it.
 * Values are never replaced by other values: an out-of-list pick still comes back as an inline field error. */
const ENUM_URL = /\/api\/tools\/([^/?#]+)\/(price|jobs)(?:[?#]|$)/;
if (typeof globalThis.fetch === 'function' && !(globalThis as any).__ohfEnumGuard) {
  (globalThis as any).__ohfEnumGuard = true; const orig = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : null; const m = raw ? ENUM_URL.exec(raw) : null;
    if (!raw || !m) return orig(input, init);
    if (agentBudgetHeader) init = { ...(init ?? {}), headers: { ...((init?.headers as Record<string, string> | undefined) ?? {}), 'X-OHF-Agent-Budget': agentBudgetHeader } };
    const toolId = decodeURIComponent(m[1]); let url = raw;
    if (m[2] === 'price') { const u = new URL(raw, location.origin); cleanEnumParams(toolId, u.searchParams); applyRunOnParams(toolId, u.searchParams); if ((init?.method ?? 'GET').toUpperCase() === 'GET') noteQuoteParams(toolId, u.searchParams); /* picker rows price THIS run (task 7) */ url = /^https?:/.test(raw) ? u.href : u.pathname + u.search + u.hash; }
    else if (init?.body instanceof FormData) { cleanEnumParams(toolId, init.body); if ((init.method ?? 'GET').toUpperCase() === 'POST') applyRunOnParams(toolId, init.body); } /* Model vs Run-on: model + runOn on every quote and submit (shared/models.ts) */
    const r = await orig(url, init);
    if (r.status !== 400) return r;
    const b = await r.clone().json().catch(() => null); learnAllowed(toolId, b);
    const f = /^invalid_(resolution|aspect|quality|scale)$/.exec(String(b?.code ?? ''))?.[1];
    if (m[2] === 'price' && f && Array.isArray(b?.allowed) && b.allowed.length === 0) { const u = new URL(url, location.origin); u.searchParams.delete(f); if (f === 'aspect') u.searchParams.delete('aspectRatio'); return orig(/^https?:/.test(url) ? u.href : u.pathname + u.search + u.hash, init); }
    return r;
  };
}
async function fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  for (let n = 0; ; n++) { let why: NetWhy = 'restart';
    try { const r = await globalThis.fetch(input, init); const rs = await isRestarting(r); if (!rs || n >= RETRY_DELAYS.length) { if (n) restartListeners.forEach(f => f(false)); if (rs) throw Object.assign(new Error(SERVER_RESTARTING), { errorType: 'server_restarting', kind: 'server_restarting', status: r.status, issues: [] }); return r; } }
    catch (e: any) { if (e?.kind === 'server_restarting') throw e; if (e?.name === 'AbortError') throw e; why = 'network'; if (n >= RETRY_DELAYS.length) throw Object.assign(new Error(UNREACHABLE), { errorType: 'offline', kind: 'unreachable', status: 0, issues: [] }); }
    restartListeners.forEach(f => f(true, why));
    await new Promise(res => setTimeout(res, RETRY_DELAYS[n]));
  }
}
export type JobStatus = 'queued'|'running'|'done'|'failed'|'canceled'|'blocked';
export interface Output { label: string; url: string }
export interface JobState {
  /** Result actions, e.g. ["upscale"] → upscaleJob(id). */ actions?: string[]; upscaleOf?: string | null;
  /** Browser that submitted (X-Client-Id); compare with clientId() for "started on another device". */ originClientId?: string | null; requeued?: boolean; requeuedAt?: number | null;
  /** Server hint: elapsed > 2× ETA (GET /api/jobs?state=active, /api/jobs/:id). */ slow?: boolean;
  /** A failed local run whose prompt may still finish on ComfyUI (server late-result sweeper): keep polling it; it may turn done ("Finished late"). */ lateWatch?: boolean;
  /** When a late result was collected (the job turned done after it was marked failed). */ finishedLateAt?: number | null;
  id: string; toolId: string; provider?: string; status: JobStatus; stage: string; progress: number; queuePos: number; eta: number;
  /** 2026-10-25 server run lanes: the lane it waits / runs in, and why a waiting job waits ('Waiting for your Mac: one local run at a time'). */
  runLane?: 'local' | 'cloud' | null; queueReason?: string | null;
  resultUrl: string|null; outputs: Output[]; error: string|null;
  errorType?: string|null; state?: 'queued'|'processing'|'generating'|'done'|'failed'|'canceled'|'blocked'; cancellable?: boolean; cost?: number; refunded?: number; draft?: boolean; badge?: 'draft'|'final'|null; finalId?: string|null; free?: boolean; favourite?: boolean; /** Audio: the dance style heard from the sound and/or picked by the user (POST /api/jobs/:id/dance-style). */ danceStyle?: { heard?: any; picked?: string | null; at?: number } | null; projectId?: string|null; deletedAt?: number|null; warnings: string[]; parentId: string|null;
  input?: Record<string, any>; createdAt?: number; finishedAt?: number|null;
}
export interface LicenseInfo { id: string; name: string; osi: boolean; url: string | null; parts?: LicenseInfo[] }
export interface ProviderInfo { id: string; name: string; kind: 'open-weights' | 'hosted' | 'hosted-direct'; via: string; stages: [string, string][]; license?: LicenseInfo; workflows?: string[]; priceFactor?: number; docUrl?: string | null; nodes?: string[]; modes?: string[] | null }
export interface Preset { id: string; label: string; prompt: string; group?: string; previewUrl?: string | null; license?: LicenseInfo }
export interface ToolInfo {
  id: string; name: string; description?: string; category?: string; status?: string; previewUrl?: string | null; group?: string; route: string; ui: string;
  inputs: { name: string; kind: string; required?: boolean; max?: number; options?: string[]; default?: string; accept?: string }[];
  presets?: Preset[]; workflows: string[]; model?: string; gpuSecPerSec: Record<string, number>; stages: [string, string][]; backend: string;
  providers: ProviderInfo[]; defaultProvider: string | null;
  /** Model vs Run-on: one row per model (engines, where it runs, from-price). Older servers omit it. */ models?: import('./shared/models').ToolModel[];
  /** Price overrides from the registry (plugins): per-type factors. Provider factors are on providers[].priceFactor. */
  pricing?: { optionFactors?: Record<string, number> };
  /** Present for tools loaded from plugins/. */
  plugin?: { id: string; version: string | null; license: LicenseInfo; handler: boolean;
    /** where it shows up (server shared/pluginPlacement.ts) */ tab?: 'image' | 'video' | 'audio' | '3d' | null; category?: string | null; goal?: string | null; author?: string | null; input?: 'image' | 'video' | 'none'; output?: 'image' | 'video'; /** added in the app by you */ user?: boolean } | null;
  freeGens?: { left: number; maxRes: string } | null;
  /** DESIGN-NOTES 17–19 registry fields. */
  media?: 'image' | 'video' | 'audio'; badge?: 'new' | 'free' | 'top' | null; posterUrl?: string | null; freeGensCovered?: boolean; addedAt?: string | null;
  app?: { input: 'image' | 'video' | 'none' | 'image-optional'; kind?: 'image' | 'audio' | 'soundtrack' | 'av-video'; modes?: boolean; imageModes?: string[]; promptOptionalModes?: string[]; providerModes?: Record<string, string[]>; mix: number; durations: number[] | null; enhance: boolean; steps: number[] | null; prompt: boolean; resolutions: string[]; fields?: any[] } | null;
}
export interface SoonEntry { id: string; name: string; group: string; status: 'soon' }
export async function listRoadmap(): Promise<SoonEntry[]> { const r = await fetch('/api/roadmap'); return r.ok ? r.json() : []; }
/** One Video page (2026-10-25): a video tool's home is the Video page with its workflow picked, so every tile, menu row, search hit and
 *  Recreate link built from `route` opens it there directly (no redirect hop, no old page). The server's route is unchanged. */
const homeRoute = (t: ToolInfo): ToolInfo => { const w = videoWorkflowOfTool(t.id); return w && w.id !== 'create' && t.route !== videoWorkflowHref(w.id) ? { ...t, route: videoWorkflowHref(w.id) } : t; };
/** GET /api/tools. On failure throws ToolsLoadError with the server's JSON `error` (503 {error, errorType, retryable, retryAfterMs}). */
export class ToolsLoadError extends Error { constructor(message: string, public status: number, public retryable = true, public retryAfterMs = 3000) { super(message); } }
export async function listTools(): Promise<ToolInfo[]> {
  let r: Response;
  try { r = await fetch('/api/tools'); } catch (e: any) { throw new ToolsLoadError(e?.kind === 'server_restarting' || e?.errorType === 'server_restarting' ? SERVER_RESTARTING : 'Can’t reach the server. Retrying in 3 s.', 0); }
  if (!r.ok) { const b = await r.json().catch(() => ({} as any)); throw new ToolsLoadError(httpErrorText(b, r.status, `Failed to load tools (HTTP ${r.status}).`), r.status, b.retryable ?? r.status >= 500, b.retryAfterMs ?? 3000); }
  const raw = await r.json() as ToolInfo[]; placeVideoPlugins(raw as any); /* plugins with tab "video" join the Video workflows before routes are set (shared/pluginPlacement.ts) */
  /* a link to a video plugin's own page (/tools/cutout) that loaded before the list did: open its workflow now, like the built-ins' old links */
  if (typeof location !== 'undefined' && location.pathname.startsWith('/tools/')) { const to = videoRedirect(location.pathname, location.search, location.hash);
    if (to) { history.replaceState(history.state, '', to); dispatchEvent(new PopStateEvent('popstate')); } }
  const tools: ToolInfo[] = raw.map(homeRoute); registerAllowTools(tools as any); noteToolModels(tools as any); return tools;
}
/** One submit problem from the server (400 `issues`, R39). */
export interface SubmitIssue { code: string; field?: string; message: string; /** B27: unsupported_aspect: the values this model takes */ allowed?: string[] }
/** Issues attached to an error thrown by createJob (empty if none). */
/** `refs[3]` → `refs` so per-field helpers match by input name. */
/** B28a (6): a quote 400 with code unsupported_aspect {field:'aspect', allowed, provider} becomes the same inline issue (with its
 *  'Use {v}' offers) as the submit error. Malformed input (invalid_aspect) is left to the existing handling. Submit issues win per field. */
export const withQuoteIssues = (sub: SubmitIssue[], q: any): SubmitIssue[] => {
  if (!q || q.code !== 'unsupported_aspect') return sub; const field = String(q.field ?? 'aspect');
  if (sub.some(i => (i.field ?? '') === field)) return sub;
  const msg = String((q.issues ?? []).find((i: any) => i?.code === 'unsupported_aspect')?.message ?? q.error ?? '').trim();
  return msg ? [...sub, { code: 'unsupported_aspect', field, message: msg, allowed: Array.isArray(q.allowed) ? q.allowed : undefined } as SubmitIssue] : sub;
};
export const issuesOf = (e: unknown): SubmitIssue[] => (((e as any)?.issues as SubmitIssue[] | undefined) ?? []).map(i => ({ ...i, field: (i.field ?? '').replace(/\[\d+\]$/, '') }));
/** B17 (P1, before real keys): one Idempotency-Key per user click (crypto.randomUUID). Every automatic retry of that click (the module
 *  fetch's network / restart backoff) re-sends the same init, so the same key; a 4xx is never retried. A new click mints a new key.
 *  Row 15: a duplicate fired while the same submit (same tool + fields) is still in flight is the same click, so it shares that key. */
const SUBMIT_LOCK_TAIL_MS = 800; const inFlight = new Map<string, string>();
export const newIdemKey = (): string => (globalThis.crypto as Crypto | undefined)?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
const submitSig = (toolId: string, fd: FormData): string => { const parts: string[] = [toolId]; fd.forEach((v, k) => parts.push(`${k}=${typeof v === 'string' ? v : `${(v as File).name}:${v.size}:${(v as File).lastModified ?? ''}`}`)); return parts.join('\u0001'); };
/** Kept for callers: a deliberate Retry is a new click and always gets a new key now. */
export const forgetSubmitDedupe = () => { /* no-op: keys are per click */ };
/** B18: an Error for a failed job POST (upscale / retry / edit / fallback): the server's words, Technical details for a 5xx, inline for a conflict. */
export function jobPostError(b: any, status: number, fallback: string): Error {
  const msg = httpErrorText(b, status, fallback); const conflict = b?.code === 'idempotency_conflict' || b?.error === 'idempotency_conflict';
  const detail = isServerErrorBody(b, status) ? serverErrorDetail(b, status) : (b?.detail ?? undefined); noteError(msg, { calm: conflict, detail, inline: conflict });
  return Object.assign(new Error(msg), { status, code: b?.code ?? b?.error, errorType: b?.errorType, detail, calm: conflict, issues: conflict ? [{ code: 'idempotency_conflict', field: '', message: msg }] : [] });
}
export async function createJob(toolId: string, fd: FormData, opts: { idemKey?: string; showsIssues?: boolean; /** D3: the user already said yes to a higher price once */ priceAsked?: boolean } = {}): Promise<{ id: string; provider: string; warnings: string[]; cost: number; free?: boolean; freeGensLeft?: number; balance: number; seed: number; idempotentReplay?: boolean }> {
  if (isOffline()) throw Object.assign(new Error(OFFLINE_MESSAGE), { errorType: 'offline', status: 0, issues: [{ code: 'offline', field: '', message: OFFLINE_MESSAGE }] });
  // [R23] One Idempotency-Key per Generate click, reused on a network retry so a dropped response can't double-submit.
  { const pv = String(fd.get('provider') ?? ''); if (pv && !fd.has('route')) {
      // Quote = charge: the run-on choice (per tool + model, shared/models.ts) goes as model + runOn from the fetch guard, exactly as on the quote.
      // Send what the quote said too, so a divergence comes back as 409 route_changed instead of a different charge.
      // (The old per-engine browser pins, ohf:route:<engine>, are migrated into the per-tool choice once and no longer sent.)
      const qr = quotedRoute(toolId, pv); if (qr) { fd.append('quotedRouteId', qr.route); if (qr.credits != null) fd.append('quotedCredits', String(qr.credits)); } } }
  { const pv = String(fd.get('provider') ?? ''); const it = downloadIntentOf(pv); /* Batch 28: the user said yes to downloading this model's files first */ if (it && !fd.has('downloadWeights')) { fd.append('downloadWeights', '1'); if (it.variantId && !fd.has('variantId')) fd.append('variantId', it.variantId); } }
  if (!fd.has('projectId')) { const pid = feedProjectId(); if (pid) fd.set('projectId', pid); } // every tool: the new result lands in the current project (shared/feedProject; '' = none, e.g. a Canvas board with no project)
  applyHandoff(fd); // A16: an untouched hand-off slot goes as fromJob + output (no re-upload; the job gets parentId)
  applyLibraryRefs(fd); // media picker: a slot filled from the library goes as @file:<field> = its /files/ URL (no re-upload)
  await probeFormFiles(fd); // 2026-10-27: a file that can't be read any more is an inline 'add it again', not a network retry ending in 'Can’t reach the server' (shared/formFiles.ts)
  const sig = submitSig(toolId, fd); const dup = !opts.idemKey ? inFlight.get(sig) : undefined; const key = opts.idemKey ?? dup ?? newIdemKey(); if (!dup) inFlight.set(sig, key);
  const release = beginSubmit(toolId); const done = () => { if (!dup && inFlight.get(sig) === key) inFlight.delete(sig); setTimeout(release, SUBMIT_LOCK_TAIL_MS); }; try {
  const send = () => fetch(`/api/tools/${encodeURIComponent(toolId)}/jobs`, { method: 'POST', body: fd, headers: { 'Idempotency-Key': key, 'X-Client-Id': clientId() } });
  let r: Response;
  r = await send(); // retries/backoff live in the module fetch (same Idempotency-Key)
  if (r.status === 402) { const b = await r.clone().json().catch(() => ({})); if (b?.code === 'no_connection') { const CS = await import('./shared/ConnectSheet'); CS.openConnectSheet(); throw CS.noConnectionError(); } } // option a (2026-10-29): no Comfy key, no ComfyUI → the connect sheet, never a sample
  if (r.status === 409) { const b = await r.clone().json().catch(() => ({})); if (b?.error === 'route_changed' || b?.code === 'route_changed') {
    const pv = String(fd.get('provider') ?? ''); forgetQuote(toolId, pv); if (b.quote) seedQuote(toolId, pv, b.quote); requestRequote();
    /* D3 (user decision 2026-10-28): the server asks again only when the run got DEARER. Ask once, in the app's own confirm dialog, with both
       prices; yes = the same click goes again at the new price (a new key: the first one was refused, nothing was charged). */
    const nq = b.quote; const nc = typeof nq?.credits === 'number' ? nq.credits : typeof b.credits === 'number' ? b.credits : null; const route = String(nq?.routeId ?? nq?.route ?? '');
    if (!opts.priceAsked && nc != null && nq?.runnable !== false) {
      const { askConfirm } = await import('./shared/Dialog'); const { ledgerUsd } = await import('./shared/billing'); const was = typeof b.quotedCredits === 'number' ? b.quotedCredits : null;
      const yes = await askConfirm({ title: 'The price went up', body: [`This run now costs about ${ledgerUsd(nc)}${was != null ? `, up from ${ledgerUsd(was)}` : ''}.`, 'Nothing was charged yet.'], confirm: `Run it for ${ledgerUsd(nc)}`, cancel: 'Not now' });
      if (yes) { fd.delete('quotedRouteId'); fd.delete('quotedCredits'); // the fresh quote seeded above goes with the resubmit (the top of createJob adds it)
        if (fd.has('route')) { if (route) fd.set('quotedRouteId', route); fd.set('quotedCredits', String(nc)); }
        return createJob(toolId, fd, { ...opts, idemKey: newIdemKey(), priceAsked: true }); }
      throw Object.assign(new Error('Not run. Nothing was charged.'), { code: 'route_changed', errorType: 'route_changed', status: 409, quote: nq ?? null, calm: true, charged: false, idemKey: key, issues: [], declined: true }); }
    /* B18 (item 8): the server's sentence as is ("The price changed. Nothing was charged."); our own copy only when it sends none. */
    const m = String(b.message || b.error && b.error !== 'route_changed' && b.error || 'The price changed since you last saw it. Nothing was charged. Check the new price, then press Generate again.').trim();
    noteError(m, { calm: true, detail: b.detail ?? null });
    throw Object.assign(new Error(m), { code: 'route_changed', errorType: 'route_changed', status: 409, quote: b.quote ?? null, calm: true, charged: b.charged ?? false, idemKey: key, issues: [] }); }
    if (b?.code === 'route_not_runnable') { const pv = String(fd.get('provider') ?? ''); forgetQuote(toolId, pv); requestRequote(); }
  }
  if (!r.ok) { const b = await r.json().catch(() => ({})); const ra = Number(r.headers.get('Retry-After')) || Number(b.retryAfterSec) || 0;
    const ex = Object.assign(new Error(plainCopy(submitErrorMessage(b, r.status))), { code: b.code, limit: b.limit, queued: b.queued, retryAfterSec: b.retryAfterSec, affordableGroups: b.affordableGroups, totalGroups: b.totalGroups, partialCost: b.partialCost, needed: b.needed, balance: b.balance, idemKey: key, errorType: b.errorType || 'temporary', status: r.status, allowed: Array.isArray(b.allowed) ? b.allowed : undefined, issues: Array.isArray(b.issues) ? (b.issues as SubmitIssue[]).map(i => ({ ...i, message: plainCopy((i as any).message), /* B27: unsupported_aspect {field, allowed, provider}: the allowed values ride on the issue so the field can offer them */ allowed: Array.isArray((i as any).allowed) ? (i as any).allowed : (i as any).code === b.code && Array.isArray(b.allowed) ? b.allowed : undefined })) : (b.error ? [{ code: b.errorType || 'invalid', field: '', message: plainCopy(b.error) }] : []), mentionIssues: b.mentionIssues, hint: b.hint, textProviders: b.textProviders }); try { (globalThis as any).__ohfSubmitError?.(toolId, fd, ex); } catch { /* ignore */ } (ex as any).detail = b.detail ?? b.reasonDetail ?? (isServerErrorBody(b, r.status) ? serverErrorDetail(b, r.status) : undefined); if (b.code === 'route_not_runnable') { (ex as any).calm = true; (ex as any).charged = false; (ex as any).issues = [{ code: 'route_not_runnable', field: '', message: ex.message }]; } if (b.code === 'idempotency_conflict' || b.error === 'idempotency_conflict') { /* B17: same key, different body. Nothing ran; the next click mints a new key. */ (ex as any).code = 'idempotency_conflict'; (ex as any).calm = true; (ex as any).charged = false; (ex as any).issues = [{ code: 'idempotency_conflict', field: '', message: ex.message }]; }
    noteError(ex.message, { calm: (ex as any).calm, detail: (ex as any).detail, inline: b.code === 'route_not_runnable' || (ex as any).code === 'idempotency_conflict' || /^(weights_missing|not_enough_disk|no_models_dir|too_heavy)$/.test(String(b.code ?? '')) /* Batch 28: local-model problems show inline */ || b.code === 'unsupported_language' /* B18: shown by the language field */ || (opts.showsIssues === true && /^(invalid_|unsupported_aspect$|out_of_range$|required$)/.test(String(b.code ?? '')) && Array.isArray(b.issues) && b.issues.length > 0) /* B19: invalid_<field> shows at the field */ }); if (r.status === 409 && /^(weights_missing|not_enough_disk|no_models_dir)$/.test(String(b.code ?? ''))) { /* B31: the weights gate (server words, its alternative and downloadId) goes to that model's download prompt */ (ex as any).weightsGate = b; if (hasWeightsPrompt(String(b.providerId ?? fd.get('provider') ?? ''))) (ex as any).issues = []; /* shown once, in the prompt */ try { window.dispatchEvent(new CustomEvent('ohf:weights-gate', { detail: { providerId: String(b.providerId ?? fd.get('provider') ?? ''), body: b } })); } catch { /* ignore */ } } if (b.errorType === 'no_provider' || b.state === 'needs_provider') { (ex as any).noProvider = b; try { window.dispatchEvent(new CustomEvent('ohf:needs-key', { detail: { ...b, modelId: b.modelId ?? fd.get('provider') ?? fd.get('model') } })); } catch { /* ignore */ } } throw ex; }
  const out = await r.json(); { const pv = String(fd.get('provider') ?? ''); if (fd.get('downloadWeights') === '1' && pv) setDownloadIntent(pv, null); }
  if (Array.isArray(out?.warnings)) out.warnings = out.warnings.map((w: any) => typeof w === 'string' ? plainCopy(w) : w);
  /* B17: a repeat of the same click within 24h returns the original job (Idempotent-Replayed: true), no second charge. Normal success;
     its warnings were already shown the first time, so don't toast them again. */
  /* B18 (PB f6fd872): the body says idempotentReplay:true; the header is coming later. Either one. */
  if (out?.idempotentReplay === true || /^true$/i.test(r.headers.get('Idempotent-Replayed') ?? '')) { out.idempotentReplay = true; out.warnings = []; }
  return out;
  } finally { done(); }
}
export async function getJob(id: string): Promise<JobState> {
  let r: Response | null = null; try { r = await fetch(`/api/jobs/${id}`); } catch { r = null; }
  notePoll(!isNetworkFail(r)); // 3 network failures in a row → offline (shared/connectivity)
  if (!r) throw new Error("Can't reach the server"); if (!r.ok) throw new Error('Job not found'); return r.json();
}
/** Several jobs in one request (GET /api/jobs?ids=, 100 a request), each as getJob answers it; unknown ids and failed requests are left out (like getJob(id).catch(() => null)). */
export async function getJobs(ids: string[]): Promise<JobState[]> {
  const want = [...new Set(ids.filter(Boolean))]; const chunks: string[][] = []; for (let i = 0; i < want.length; i += 100) chunks.push(want.slice(i, i + 100));
  const got = await Promise.all(chunks.map(async (c) => {
    let r: Response | null = null; try { r = await fetch(`/api/jobs?ids=${c.map(encodeURIComponent).join(',')}`); } catch { r = null; }
    notePoll(!isNetworkFail(r)); if (!r?.ok) return [];
    const list = await r.json().catch(() => null); const asked = new Set(c); return Array.isArray(list) ? (list as JobState[]).filter((j) => j && asked.has(j.id)) : [];
  }));
  return got.flat();
}
export async function listJobs(toolId?: string): Promise<JobState[]> {
  const r = await fetch('/api/jobs' + (toolId ? `?toolId=${encodeURIComponent(toolId)}` : '')); if (!r.ok) throw new Error('Failed to load history'); return r.json();
}
/** Server-side filtered, cursor-paged job list (GET /api/jobs with `cursor`, even empty → {items, nextCursor}). */
export interface JobQuery { toolId?: string; /** Image features: '*' = every image feature (Create Image's feed), or a comma list of feature ids */ features?: string; media?: 'image' | 'video' | 'audio'; enhanced?: boolean; q?: string; from?: string; to?: string; status?: string; cursor?: string; limit?: number; /** 'asc' = oldest first */ order?: 'asc' | 'desc'; /** a project id (or 'none'): only that project's results */ project?: string }
export async function listJobsPage(qy: JobQuery): Promise<{ items: JobState[]; nextCursor: string | null }> {
  const u = new URLSearchParams({ cursor: qy.cursor ?? '', limit: String(qy.limit ?? 40) });
  for (const k of ['toolId', 'features', 'media', 'q', 'from', 'to', 'status', 'order', 'project'] as const) if (qy[k]) u.set(k, String(qy[k]));
  if (qy.enhanced) u.set('enhanced', '1');
  const r = await fetch('/api/jobs?' + u); if (!r.ok) throw new Error('Failed to load your library'); const j = await r.json(); return { items: j.items ?? [], nextCursor: j.nextCursor ?? null };
}
/** GET /api/jobs/:id/locate → which page of a section a job sits on. */
export type JobLocation = { section: string; pageSize: number; page: number; cursor: string | null; index: number; position: number; total: number; filters?: Record<string, unknown> };
/** Same filters as listJobsPage; 404 → 'not_found'. */
export async function locateJob(id: string, qy: JobQuery = {}, pageSize = 40): Promise<JobLocation | 'not_found' | null> {
  const u = new URLSearchParams({ pageSize: String(pageSize), limit: String(qy.limit ?? pageSize) }); // jobs section (default); never 'assets'
  for (const k of ['toolId', 'features', 'media', 'q', 'from', 'to', 'status', 'order'] as const) if (qy[k]) u.set(k, String(qy[k]));
  if (qy.enhanced) u.set('enhanced', '1');
  const r = await fetch(`/api/jobs/${encodeURIComponent(id)}/locate?${u}`); if (r.status === 404) return 'not_found'; return r.ok ? r.json() : null;
}
/** Cancel (Queued/Processing only). Throws with the server message if already Generating. */
export async function cancelJob(id: string) { const r = await fetch(`/api/jobs/${id}/cancel`, { method: 'POST' }); if (!r.ok) { const b = await r.json().catch(() => ({})); const e: any = new Error(b.error || (b.code === 'cannot_cancel_processing' ? 'Already processing, so it can’t be canceled now.' : 'Cannot cancel')); e.code = b.code; e.status = r.status; e.charged = typeof b.charged === 'boolean' ? b.charged : undefined; e.free = b.free; throw e; } }
/** section: all | favourites | trash | unfiled | project:<id> */
export async function listAssets(toolId?: string, section = 'all'): Promise<JobState[]> {
  const q = new URLSearchParams({ section, include: 'ended' }); if (toolId) q.set('toolId', toolId);
  const r = await fetch('/api/assets?' + q); if (!r.ok) throw new Error('Failed to load assets'); return r.json();
}
const post = async (url: string, body?: unknown, method = 'POST') => { const r = await fetch(url, { method, headers: body !== undefined ? { 'content-type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined }); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Request failed'); return r.json(); };
export const setFavourite = (id: string, on: boolean): Promise<JobState> => post(`/api/jobs/${id}/favourite`, { on });
/** Feature this (2026-10-26): star a finished result (Featured chip, empty tabs). */
export const setFeatured = (id: string, on: boolean): Promise<JobState> => post(`/api/jobs/${id}/feature`, { on });
/** The audio player's dance style for a result (job meta danceStyle): what the sound was heard as, and/or the user's pick (null clears it). */
export const saveDanceStyle = (id: string, body: { heard?: unknown; picked?: string | null }): Promise<{ danceStyle: unknown }> => post(`/api/jobs/${id}/dance-style`, body);
export const setJobProject = (id: string, projectId: string | null): Promise<JobState> => post(`/api/jobs/${id}/project`, { projectId });
export const trashJob = (id: string): Promise<JobState> => post(`/api/jobs/${id}`, undefined, 'DELETE');
/** Delete forever (Trash only): {ok, purged, removed: {files, bytes, keptShared}}. */
export const purgeJob = (id: string): Promise<{ ok: boolean; purged?: string; removed?: { files?: number; bytes?: number; keptShared?: number } }> => post(`/api/trash/${encodeURIComponent(id)}`, undefined, 'DELETE');
export const fmtBytes = (n: number): string => n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${Math.round(n / 1e6)} MB` : n >= 1e3 ? `${Math.round(n / 1e3)} KB` : `${n} B`;
/** PB-24: everything in Trash back to Assets → {ok, restored}. */
export const restoreAllTrash = (): Promise<{ ok: boolean; restored: number }> => post('/api/trash/restore-all', {});
/** PB-24: delete everything in Trash forever. Call only after the user confirmed in the page. → {ok, purged, removed:{files, bytes}} */
export const emptyTrash = (): Promise<{ ok: boolean; purged: number; removed?: { files?: number; bytes?: number } }> => post('/api/trash/empty', { confirm: true });
export const restoreJob =(id: string): Promise<JobState> => post(`/api/jobs/${id}/restore`, {});
export interface Project { id: string; name: string; createdAt: number; count?: number; parentId?: string | null }
export const listProjects = (): Promise<Project[]> => fetch('/api/projects').then(r => r.json());
export const createProject = (name: string): Promise<Project> => post('/api/projects', { name });
export const deleteProject = (id: string) => post(`/api/projects/${id}`, undefined, 'DELETE');
/** PATCH /api/projects/:id: rename ({name}) or move into another project ({parentId}, null = top level). */
export const patchProject = (id: string, body: { name?: string; parentId?: string | null }): Promise<Project> => post(`/api/projects/${id}`, body, 'PATCH');
export const setProjectVisibility = (id: string, visibility: 'private' | 'public') => post(`/api/projects/${id}/visibility`, { visibility });
export interface PublicProject { id: string; name: string; author?: string; posterUrl?: string | null; visibility: string; count?: number; updatedAt?: number }
export async function listPublicProjects(cursor = ''): Promise<{ items: PublicProject[]; total: number; nextCursor: string | null }> { const r = await fetch(`/api/projects/public?cursor=${encodeURIComponent(cursor)}&limit=24`); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }
/* Elements left the UI (2026-10-23); the server's /api/elements routes stay for old jobs and API users, so no client calls remain here. */
export interface Example { id: string; toolId: string; toolName: string; title: string; route: string; preset?: string; types?: string[]; prompt?: string; video?: string; image?: string; refs?: string[]; previewUrl?: string | null; quality?: string; provider?: string; toggles?: Record<string, boolean | number | string>; prefill?: ExamplePrefill | null; price?: Price | null }
/** Resolved Recreate prefill (GET /api/examples[...].prefill or /api/examples/:id/prefill). */
export interface ExamplePrefill { video: string | null; image: string | null; refs: string[]; prompt: string; promptEnabled: boolean; preset: string | null; types: string[] | null; quality: string; provider: string | null; toggles: Record<string, boolean | number | string>; durationSec: number; price: Price }
export const listExamples = (): Promise<Example[]> => fetch('/api/examples').then(r => (r.ok ? r.json() : []));
export interface LedgerEntry { id: number; ts: number; kind: 'grant'|'charge'|'refund'; amount: number; balance: number; jobId?: string; toolId?: string; provider?: string; note: string }
export async function getLedger(): Promise<{ balance: number; start: number; unit: string; entries: LedgerEntry[] }> { const r = await fetch('/api/ledger'); if (!r.ok) throw new Error('Failed to load ledger'); return r.json(); }
/** Human labels for documented error types. */
export const ERROR_LABELS: Record<string, string> = {
  validation: 'Invalid input', nsfw: 'Declined by the provider', ip: 'Declined by the provider',
  concurrency: 'Too many generations at once', credits: 'Not enough balance', temporary: 'Something went wrong', provider_outage: 'Provider unavailable', not_cancellable: 'Already generating',
};
export const STATE_LABELS: Record<string, string> = { queued: 'Queued', processing: 'Processing', generating: 'Generating', done: 'Done', failed: 'Failed', canceled: 'Canceled', blocked: 'Declined by the provider' /* PB-06: the one name for a blocked run (tiles, badges, viewer) */, needs_decision: 'Needs your choice' };
/** Registry-driven price inputs (same values the server charges with). */
export const priceOverrides = (tool: ToolInfo, provider?: string) => ({ optionFactors: tool.pricing?.optionFactors, providerFactor: tool.providers.find(p => p.id === provider)?.priceFactor });
/** Credit price via the shared priceOf (server/src/shared/pricing.ts). */
export const estimate = (tool: ToolInfo, durationSec: number, res: string, n = 1, o: { provider?: string; types?: string[]; count?: number } = {}) =>
  priceOf({ ...priceOverrides(tool, o.provider), toolId: tool.id, rates: tool.gpuSecPerSec, quality: res, durationSec, passes: n, provider: o.provider, types: o.types, count: o.count }).credits;
export const estimateDraft = (tool: ToolInfo, durationSec: number, n = 1, o: { provider?: string; types?: string[]; count?: number } = {}) =>
  priceOf({ ...priceOverrides(tool, o.provider), toolId: tool.id, rates: tool.gpuSecPerSec, quality: '480p', durationSec, passes: n, provider: o.provider, types: o.types, count: o.count }).draftCredits;
export const jobStages = (tool: ToolInfo, job: JobState) => tool.providers.find(p => p.id === job.provider)?.stages ?? tool.stages;
export const fmtSec = (s: number) => s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;

// ---- Pre-run checks, upscale, config, credit history (behaviour spec) ----
export interface PrecheckWarning { code: string; field: string; severity: 'info' | 'warn'; message: string }
export interface PrecheckResult { ok: boolean; blocking: false; warnings: PrecheckWarning[]; checks: Record<string, any> }
/** Advisory checks: static clip / prop fit (video + refs + bbox "x,y,w,h") or start frame (image + aspect). Never blocks. */
export async function precheck(fd: FormData): Promise<PrecheckResult | null> { try { const r = await fetch('/api/precheck', { method: 'POST', body: fd }); return r.ok ? r.json() : null; } catch { return null; } }
/** One-click upscale of a finished (draft) result: SeedVR2, same seed, parentId = jobId. */
export async function upscaleJob(jobId: string, opts: { output?: number; mode?: 'precise' | 'creative' | 'smooth60' } = {}, idemKey = newIdemKey()): Promise<{ id: string; parentId: string; seed: number; cost: number } & { error?: string }> {
  const r = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/upscale`, { method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': idemKey, 'X-Client-Id': clientId() }, body: JSON.stringify(opts) });
  const b = await r.json().catch(() => ({})); if (!r.ok) throw jobPostError(b, r.status, 'Upscale failed. Nothing was charged.'); return b;
}
export interface AppConfig { backend: 'mock' | 'comfy'; localFree: boolean; openWeightsOnly: boolean; draftQuality: '480p'; draftFactor: number; keepAudioDefault: boolean; upscaleTool: string | null; mcp?: McpConfig; repoUrl?: string | null; repoUrlSource?: 'env' | 'git' | null }
export interface McpConfig { dir: string; entry: string; built: boolean; node: string; apiUrl: string; httpUrl: string; stdio: { command: string; args: string[]; env: Record<string, string> }; npx: { command: string; args: string[]; env: Record<string, string> }; snippets: { stdio: string; npx: string; http: string }; commands: { build: string; stdio: string; http: string } }
export async function getConfig(): Promise<AppConfig | null> { const r = await fetch('/api/config'); return r.ok ? r.json() : null; }
export interface UsageEntry { id: number; ts: number; kind: 'grant' | 'charge' | 'refund' | 'expire'; amount: number; balance: number; jobId?: string; toolId?: string; provider?: string; note: string; toolName: string | null; model: string | null; jobStatus: string | null }
export interface UsagePage { localFree: boolean; hidden: boolean; balance: number | null; totals: { charged: number; refunded: number; granted: number; expired: number } | null; entries: UsageEntry[]; total: number; offset: number; limit: number; nextOffset: number | null; nextCursor: number | null; byTool: Record<string, { toolName: string | null; charged: number; refunded: number; runs: number }> }
export async function getUsage(q: { kind?: string; toolId?: string; limit?: number; offset?: number; cursor?: number } = {}): Promise<UsagePage> {
  const p = new URLSearchParams(Object.entries(q).filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)]));
  const r = await fetch(`/api/usage?${p}`); return r.json();
}
/** POST /api/jobs/:id/retry?failedOnly=1 → child job (parentId) re-running only the failed reference groups. */
export async function retryFailedGroups(id: string, idemKey = newIdemKey()): Promise<{ id: string; parentId?: string }> {
  const r = await fetch(`/api/jobs/${encodeURIComponent(id)}/retry?failedOnly=1`, { method: 'POST', headers: { 'Idempotency-Key': idemKey, 'X-Client-Id': clientId() } });
  const b = await r.json().catch(() => ({})); if (!r.ok) throw jobPostError(b, r.status, `Retry failed (HTTP ${r.status})`); return b.job ?? b;
}

/** Plain retry of a failed job: POST /api/jobs/:id/retry (same inputs, new job, quoted again). Returns the new job id. */
/** Retry a failed job (same inputs). runOn = "Try on <place>": re-run it there, pinned to that place (Run on, 2026-10-22). */
/** Retry / Try on. runOn = run this once on that place (pinned for this job only); remember = also save it as the tool + model's choice (S-02). */
export async function retryJob(id: string, idemKey = newIdemKey(), runOn?: string, remember = false): Promise<string> { const r = await fetch(`/api/jobs/${encodeURIComponent(id)}/retry`, { method: 'POST', headers: { 'Idempotency-Key': idemKey, 'X-Client-Id': clientId(), ...(runOn ? { 'content-type': 'application/json' } : {}) }, ...(runOn ? { body: JSON.stringify({ runOn, ...(remember ? { remember: true } : {}) }) } : {}) }); const b = await r.json().catch(() => ({})); if (!r.ok) throw jobPostError(b, r.status, `Retry failed (${r.status})`); return b.id; }

/** One progress number for every surface (job card, canvas tile, Assets). */
export const jobPct = (j: { percent?: number; progress?: number } | any) => Math.round(Math.max(0, Math.min(100, Number(j?.percent ?? j?.progress ?? 0) || 0)));
