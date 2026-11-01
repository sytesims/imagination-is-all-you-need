/**
 * Routed execution with per-attempt ledger entries.
 * Attempt 1 was charged at submit (enqueue → charge(jobId, price of order[0])). Attempt N>1 is charged as charge(`${jobId}#aN`).
 * Every failed attempt gets exactly one refundAttempt(jobId, N, price) (the last failed attempt of an auto run: attempt 1 is left to the
 * queue's normal settle() refund so the job's refund note stays accurate). Net charge = price of the route that succeeded.
 * A place fails (user decision 2026-10-28, D4): a job on the PRE-SELECTED place (Run on not picked: routing mode auto, allowFallback on by
 * default, select.ts planInner) moves on to the next ready place when it costs the same or less, and the result says where it ran (job
 * warnings + fallback notice). A dearer next place is never started on its own: the job waits (needs_decision) with the price difference.
 * It only moves when the failed attempt was NOT charged (failedAttemptNotCharged: the request never reached the provider, the provider says it
 * refused before running, the provider's documented rule is "failed runs are free", or team mode refunded it); otherwise it stops and
 * tells the user (status failed + Try on places), so a run is never paid twice. A place the user picked (pinned) never moves on its own.
 */
import { replicateAuthFor } from '../security/keyHosts.js';
import { routeRequest } from './routeRequest.js';
import { fallbackOffers } from '../env.js';
import { cloudLive, runCloudWorkflow } from './cloudRun.js';
import { routerLive, runRouter } from './routerRun.js';
import fs from 'node:fs/promises'; import path from 'node:path';
import type { Job } from '../jobs.js';
import type { ToolDef } from '../tools/types.js';
import { config, DATA_DIR } from '../config.js';
import { env } from '../env.js';
import { teamMode } from '../billingMode.js';
import { charge, refundAttempt, creditsBackNote } from '../ledger.js';
import { mockRun, imageCount, imageLabels } from '../tools/shared.js';
import { runWithProvider } from '../providers.js';
import { stillBusyMessage, busyReason } from '../busyRetry.js';
import { findRoute } from './routes.js';
import { keyValue } from './keys.js';
import { autoOrder, option, routeForRunOn, localOnlyModel, localSetupGate, demoKeyless, placeRank } from './select.js';
import { routesFor } from './routes.js';
import { getPrefs } from './prefs.js';
import { runOnOfRoute, RUN_ON_LABELS } from '../shared/modelIds.js';
import { directRun, afterSettle } from './state.js';
import { falRun } from '../providers/fal.js';
import { directRun as runDirect, DirectError, type DirectOutput } from '../providers/direct.js';
import { replicateRun } from '../providers/replicate.js';
import type { RouteAttempt, RouteDef, RouteOption } from './types.js';
import { ledgerUsd } from '../shared/priceText.js';
import { PRE_DISPATCH, failureRuleOf, billedToOf } from '../billing.js';

const TIMEOUT_MS = Number(env('ROUTING_TIMEOUT_MS')) || 15 * 60_000;
let testFail: Set<string> | null = null;
/** Tests: force these routeIds to fail (mock only). */
export const setFailRoutes = (ids: string[] | null) => { testFail = ids ? new Set(ids) : null; };
const forcedFail = (job: Job, id: string) => config.backend === 'mock' && (testFail?.has(id) || job.routing?.failRoutes?.includes(id) || job.routing?.failRoutes?.includes(`${id}@sent`) || (env('ROUTING_FAIL') ?? '').split(',').map((s) => s.trim()).includes(id));
/** Tests (mock only): `<routeId>@sent` in simulateRouteFail fails AFTER the request reached the provider (a request id exists), i.e. it may have been charged. */
const forcedSent = (job: Job, id: string) => config.backend === 'mock' && !!job.routing?.failRoutes?.includes(`${id}@sent`);
/** What shows the request reached the provider (a request / prompt / Cloud job id, or a reported cost). Compared before and after an attempt. */
const sentMark = (job: Job, a: RouteAttempt) => JSON.stringify([a.requestId ?? null, job.requestIds?.length ?? 0, job.cloudJobId ?? null, (job as any).routerRequestId ?? null, job.comfyPrompt?.id ?? null, job.actualCost?.usd ?? null]);
/** The place a route runs on, in the Run on words (Comfy Cloud, Google, fal…). */
const placeName = (r: Pick<RouteDef, 'kind' | 'envKey'>) => RUN_ON_LABELS[runOnOfRoute(r)] ?? 'that place';
/** D4: was this failed attempt surely NOT charged? Only then may the job move to another place on its own (never pay twice).
 *  free attempt · never reached the provider · refused before running (PRE_DISPATCH reason, or the runner's chargeNote 'not_charged') ·
 *  the provider's documented rule says failed runs are free (Replicate, BFL) · team mode (the attempt's credits go back to the balance). */
export function failedAttemptNotCharged(job: Job, r: Pick<RouteDef, 'kind' | 'routeId'>, o: { price: number; reached: boolean }): boolean {
  if (!(o.price > 0)) return true;
  if (!o.reached) return true;
  if ((job as any).chargeNote === 'not_charged' || PRE_DISPATCH.has(String(job.reasonCode ?? ''))) return true;
  if (failureRuleOf(billedToOf(r.kind, r.routeId)) === 'not-charged') return true;
  return teamMode();
}
const live = (r: RouteDef) => (r.kind === 'fal' || r.kind === 'replicate' || !!r.direct) && !!keyValue(r) && (config.backend !== 'mock' || /^(1|true)$/i.test(env('ROUTING_LIVE') ?? ''));
const stages = (label: string): [string, string][] => [['submitted', `Submitted to ${label}`], ['rendering', `${label} rendering`], ['downloading', 'Downloading result']];

async function download(url: string, job: Job, i: number, auth?: string) {
  const r = await fetch(url, auth ? { headers: { Authorization: auth } } : {}); if (!r.ok) throw new Error(`download ${r.status}`);
  const ct = (r.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase(); // URL without an extension: trust the content type (Bria transparent → video/webm)
  const byType: Record<string, string> = { 'video/webm': 'webm', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mpeg': 'mp3', 'model/gltf-binary': 'glb' };
  const ext = (url.split('?')[0].match(/\.(png|jpe?g|webp|mp4|webm|mov|wav|mp3|glb)$/i)?.[1] ?? byType[ct] ?? (job.input.outKind === '3d' ? 'glb' : job.input.alpha ? 'webm' : 'png')).toLowerCase(); // 3D jobs: a GLB (fal model_glb)
  const name = `${job.id}-out${i}.${ext}`; await fs.writeFile(path.join(DATA_DIR, name), Buffer.from(await r.arrayBuffer())); return `/files/${name}`;
}
/** A direct lab output (URL, base64 or hex bytes) → a file in the data dir, right away (lab URLs expire in 10 min–24 h). */
async function saveOutput(o: DirectOutput, job: Job, i: number) {
  if (o.url) return download(o.url, job, i);
  const ext: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'video/mp4': 'mp4', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/flac': 'flac', 'audio/ogg': 'ogg' };
  const name = `${job.id}-out${i}.${ext[o.mime ?? ''] ?? 'bin'}`; await fs.writeFile(path.join(DATA_DIR, name), Buffer.from(o.b64 ?? o.hex ?? '', o.b64 ? 'base64' : 'hex')); return `/files/${name}`;
}
/** One attempt on one route. Resolves when the job is done; throws (or leaves status failed/blocked) on failure. */
async function execute(job: Job, tool: ToolDef, r: RouteDef, attempt: RouteAttempt) {
  job.status = 'running'; job.error = null; job.errorType = null; job.progress = 0; job.outputs = []; job.resultUrl = null;
  if (forcedFail(job, r.routeId)) { await new Promise((ok) => setTimeout(ok, 200)); if (forcedSent(job, r.routeId)) { attempt.requestId = `sim-${job.id}-${attempt.n}`; (job.requestIds ??= []).push(attempt.requestId); } throw new Error(`${plainRoute(r)}: provider error (simulated)`); }
  if (live(r)) {
    // prompt grammar: every body below is built by routing/routeRequest.ts (refInputFor first: each model's own reference syntax); the job keeps what was typed
    const key = keyValue(r)!; const count = imageCount(job.input);
    const shots: { label: string }[] | null = Array.isArray(job.input.shots) && job.input.shots.length ? job.input.shots : null; // Shots: one request per angle (labels)
    const labelAt = (k: number, n: number) => shots?.[k]?.label ?? (n > 1 ? `Image ${k + 1}` : String(job.input.outputLabel ?? 'Result'));
    const outs: { label: string; url: string }[] = [];
    if (r.direct) { // official lab APIs (providers/direct.ts): BFL, MiniMax, LTX. One request per output image, one per video / audio job; outputs saved right away (lab URLs expire)
      const d = r.direct; const n = (d.perOutput ?? r.output === 'image') ? count : 1;
      try {
        for (let k = 0; k < n; k++) {
          const { body: req, input: subIn } = await routeRequest(job, r, k); const sub = { ...job, input: subIn }; job.stage = 'submitted'; // routing/routeRequest.ts: the rewritten input, the lab's body
          const res = await runDirect(d, req, key, { timeoutMs: TIMEOUT_MS, job: sub, onSubmit: (id) => { attempt.requestId = id; (job.requestIds ??= []).push(id); },
            onStatus: (s) => { job.stage = /^(pending|queued|waiting)$/i.test(s) ? 'submitted' : 'rendering'; },
            onCost: (c) => { const prev = k > 0 && job.actualCost?.source === c.source ? job.actualCost : null; // several outputs: add them up
              job.actualCost = { usd: Math.round(((prev?.usd ?? 0) + c.usd) * 1e4) / 1e4, ...(c.units != null ? { units: (prev?.units ?? 0) + c.units } : {}), ...(c.unitLabel ? { unitLabel: c.unitLabel } : {}), source: c.source }; } });
          job.stage = 'downloading'; outs.push({ label: labelAt(k, n), url: await saveOutput(res.outputs[0], job, k) });
        }
      } catch (e) { if (e instanceof DirectError) { job.reasonCode = e.reasonCode as any; job.errorType = e.reasonCode === 'content_blocked' ? 'nsfw' : e.reasonCode === 'provider_credits' ? 'credits' : e.reasonCode === 'input_invalid' ? 'invalid_input' : e.temporary ? 'temporary' : 'provider_outage'; } throw e; }
      job.outputs = outs; job.resultUrl = outs[0].url; job.status = 'done'; job.stage = 'done'; job.progress = 100; job.eta = 0;
      if (tool.id === 'h3-video' && tool.routedPost) await tool.routedPost(job, { live: true }); // our final encode (bitrate / audio off) on direct video runs too
      return;
    }
    if (r.request) { // video routes (MiniMax H3): one request per job; output video.url (fal) or the prediction's output URL (Replicate)
      // eachImage routes (fal image edits, tools/imageFalModels.ts): one request per output image (Create Image n / Shots angles), each billed, so the run makes exactly what the quote priced
      const n = r.eachImage ? count : 1;
      for (let k = 0; k < n; k++) {
        const { body } = await routeRequest(job, r, k); job.stage = 'submitted'; // routing/routeRequest.ts
        const hooks = { timeoutMs: TIMEOUT_MS, onSubmit: (id: string) => { attempt.requestId = id; (job.requestIds ??= []).push(id); job.queueReason = null; }, onBusy: (ms: number) => { job.queueReason = busyReason(r.kind === 'fal' ? 'fal' : 'Replicate', ms); } };
        let url: string | undefined;
        if (r.kind === 'fal') { const res = await falRun(r.endpoint, body, key, { ...hooks, onStatus: (s) => { job.stage = s.status === 'IN_QUEUE' ? 'submitted' : 'rendering'; } }); const o: any = res.result; url = r.output === '3d' ? o.model_glb?.url ?? o.model_urls?.glb?.url : o.video?.url ?? o.image?.url ?? (typeof o.images?.[0] === 'string' ? o.images[0] : o.images?.[0]?.url); } // 3D routes (fal TRELLIS.2, Hunyuan 3D): model_glb.url // video routes: video.url; image upscale routes: image.url (Topaz, SeedVR2) or images[0] (Crystal: objects, or plain URLs in its example)
        else { const res = await replicateRun(r.endpoint, body, key, { ...hooks, onStatus: (p) => { job.stage = p.status === 'starting' ? 'submitted' : 'rendering'; } }); url = res.urls[0]; }
        if (!url) throw new Error(`${r.kind} returned no ${r.output === 'image' ? 'image' : r.output === '3d' ? '3D model' : 'video'}`);
        job.stage = 'downloading'; outs.push({ label: r.eachImage ? labelAt(k, n) : 'Result', url: await download(url, job, k, r.kind === 'replicate' ? replicateAuthFor(url, key) : undefined) });
      }
      job.outputs = outs; job.resultUrl = job.outputs[0].url; job.status = 'done'; job.stage = 'done'; job.progress = 100; job.eta = 0; return;
    }
    const ex = tool.routedExtras ? await tool.routedExtras(job) : {}; // OpenSoul: refs as data URIs, image size, aspect
    for (let i = 0; i < count; i++) { // price = per image × n (priceOf count): one request per image, so every route bills exactly n images
    job.stage = 'submitted';
    if (r.kind === 'fal') {
      const res = await falRun(r.endpoint, (await routeRequest(job, r, i, ex)).body, key, { timeoutMs: TIMEOUT_MS, onSubmit: (id) => { attempt.requestId = id; (job.requestIds ??= []).push(id); job.queueReason = null; }, onBusy: (ms) => { job.queueReason = busyReason(r.kind === 'fal' ? 'fal' : 'Replicate', ms); }, onStatus: (s) => { job.stage = s.status === 'IN_QUEUE' ? 'submitted' : 'rendering'; if (s.queue_position != null) job.queuePos = s.queue_position; } });
      job.stage = 'downloading'; const urls = (res.result as any).images?.map((x: any) => x.url) ?? [];
      if (!urls.length) throw new Error('fal returned no images');
      outs.push({ label: labelAt(i, count), url: await download(urls[0], job, i) });
    } else {
      const res = await replicateRun(r.endpoint, (await routeRequest(job, r, i, ex)).body, key, { timeoutMs: TIMEOUT_MS, onSubmit: (id) => { attempt.requestId = id; (job.requestIds ??= []).push(id); job.queueReason = null; }, onBusy: (ms) => { job.queueReason = busyReason(r.kind === 'fal' ? 'fal' : 'Replicate', ms); }, onStatus: (p) => { job.stage = p.status === 'starting' ? 'submitted' : 'rendering'; } });
      job.stage = 'downloading'; if (!res.urls.length) throw new Error('Replicate returned no output');
      outs.push({ label: labelAt(i, count), url: await download(res.urls[0], job, i, replicateAuthFor(res.urls[0], key)) });
    }
    }
    job.outputs = outs;
    if (tool.routedPost) await tool.routedPost(job, { live: true, falKey: keyValue({ envKey: 'OPENHIGGSFIELD_FAL_KEY', envAliases: ['FAL_KEY'] }) });
    job.resultUrl = job.outputs[0].url; job.status = 'done'; job.stage = 'done'; job.progress = 100; job.eta = 0; return;
  }
  if ((r.kind === 'fal' || r.kind === 'replicate') && tool.routedPost) { // mock cloud run, then the same post-process (colour match is real; upscale = labelled resize)
    const n = Math.min(4, Math.max(1, Number(job.input.n) || 1)); await mockRun(job, stages(r.kind === 'fal' ? 'fal' : 'Replicate'), n > 1 ? Array.from({ length: n }, (_, k) => `Image ${k + 1}`) : ['Result'], 3000);
    if ((job.status as string) === 'done') await tool.routedPost(job, { live: false }); return; }
  if (r.kind === 'fal' || r.kind === 'replicate') return mockRun(job, stages(r.kind === 'fal' ? 'fal' : 'Replicate'), Array.isArray(job.input.shots) && job.input.shots.length ? imageLabels(job.input) : [String(job.input.outputLabel ?? 'Result')], 3000); // Shots: one sample per angle
  if (r.cloudRun && keyValue(r)) return r.cloudRun(job, r, attempt); // 3D (2026-10-23): a Comfy partner-node graph on Comfy Cloud (Tripo), real whenever the Comfy key is set
  if (cloudLive(r)) return runCloudWorkflow(job, r, attempt); // BH9 (f): real Comfy Cloud v2 run (cloud-h3-wf only)
  if (routerLive(r)) return runRouter(job, r, attempt, TIMEOUT_MS); // Comfy Router (routing/routerRun.ts): hosted models on the Comfy Developer Platform
  directRun.add(job.id);
  try { await runWithProvider(job, tool); } finally { directRun.delete(job.id); }
  if (tool.id === 'h3-video' && tool.routedPost && (job.status as string) === 'done') await tool.routedPost(job, { live: false }); // our final encode (bitrate / audio off) on local + router runs too
}
const failedNow = (job: Job) => job.status === 'failed' || job.status === 'blocked';
export function alternativesFor(job: Job, tool: ToolDef): RouteOption[] {
  const tried = new Set((job.routeAttempts ?? []).map((a) => a.routeId));
  return autoOrder(tool, job.routing!.modelId, job.input, 1, job.routing!.allowRoutes ?? null).filter((o) => !tried.has(o.routeId)).map((o) => ({ ...o, credits: job.routing!.prices[o.routeId] ?? o.credits }));
}
/**
 * Run on: "Try on <place>" offers for a failed job: every OTHER place of the job's model that is ready now (Local only when it is on and
 * its files are here; a keyless sample on the mock backend), one per place, in the pre-selection order, with this job's price there.
 * The client re-runs with POST /api/jobs/:id/retry {runOn}; nothing is tried automatically.
 */
export function tryOnFor(job: Job, tool: ToolDef, failed: Pick<RouteDef, 'kind' | 'envKey'>): TryOn[] {
  const R = job.routing; if (!R) return []; const bad = runOnOfRoute(failed); const allow = R.allowRoutes ?? null;
  const places = [...new Set(routesFor(R.modelId, tool).filter((x) => !x.comingSoon && (!allow || allow.includes(x.routeId))).map((x) => runOnOfRoute(x)))].filter((ro) => ro !== bad);
  const useLocal = getPrefs().global.useLocal || localOnlyModel(R.modelId, tool, job.input, allow);
  const out: TryOn[] = [];
  for (const ro of places) { const o = routeForRunOn(tool, R.modelId, job.input, ro, 1, allow); if (!o) continue;
    const ready = o.available && !o.demo && (ro !== 'local' || (useLocal && !localSetupGate(tool, R.modelId, job.input)));
    const sample = !ready && demoKeyless(o);
    if (!ready && !sample) continue;
    out.push({ runOn: ro, runOnLabel: RUN_ON_LABELS[ro], routeId: o.routeId, credits: sample ? 0 : o.credits ?? 0, listCredits: sample ? o.credits ?? null : o.credits ?? null, demo: sample, rank: placeRank(o) }); }
  return out.sort((a, b) => Number(a.demo) - Number(b.demo) || a.rank - b.rank || (a.listCredits ?? 0) - (b.listCredits ?? 0)); // ready places before samples, then the pre-selection order, then price
}
export interface TryOn { runOn: string; runOnLabel: string; routeId: string; credits: number; listCredits: number | null; demo: boolean; rank: number }
/** BH10 P2 #18/#19: the route's plain name for failure text and ledger notes: no price label (' · free', ' · ✦40'), never the raw route id. */
export const plainRoute = (r: { label?: string | null; routeId: string }) => String(r.label || r.routeId).replace(/\s*·\s*(free|demo\b.*|list price.*|✦?\d+.*)$/i, '').trim();
/** BH P3 #8: drop a 'Credits went back to your balance' sentence from an attempt that charged nothing (keeps 'try again'). */
export const noCreditsBack = (m: string) => m.replace(/\s*Credits went back to your (?:app )?balance(;\s*try again)?\.?/gi, (_x, t) => (t ? ' Try again.' : '')).replace(/\s{2,}/g, ' ').trim();
/** Run from order index `from`; attempt 1's charge already exists when from === 0 and no attempts yet. */
/** opts.guarded: the caller already ran guardNextRoute for this route (POST /api/jobs/:id/fallback). */
export async function runRouted(job: Job, tool: ToolDef, opts: { only?: string; guarded?: boolean } = {}) {
  const R = job.routing!; job.routeAttempts ??= [];
  const order = opts.only ? [opts.only] : R.order.filter((id) => !job.routeAttempts!.some((a) => a.routeId === id));
  const auto = !opts.only && R.allowFallback; // Run on: only an explicit allowFallback=1 on the request moves on (the pre-selected place never does)
  for (let k = 0; k < order.length; k++) {
    const r = findRoute(order[k]); if (!r) continue;
    const n = job.routeAttempts.length + 1; const price = R.prices[r.routeId] ?? 0;
    if (n > 1 && !opts.guarded) { // S-01: an automatic move to the next route (allowFallback=1) goes through the submit's spend guard first
      const g = (await import('../spendGuard.js')).guardNextRoute(job, r.routeId);
      if ('blocked' in g) { stopOverLimit(job, tool, job.routeAttempts[n - 2], r, g.blocked); return; }
      g.commit(); } // the Spend row moves to this route with its estimate (the actual cost when the job ends)
    if (n > 1 && price > 0) charge(`${job.id}#a${n}`, job.toolId, r.routeId, price);
    const a: RouteAttempt = { n, routeId: r.routeId, status: 'running', startedAt: Date.now(), charged: price, refunded: 0 };
    job.routeAttempts.push(a); job.route = r.routeId; job.cost = price; delete job.renderStartedAt; // render time counts the route that made the result only
    try { job.modelName = (await import('../engineName.js')).engineNameOf(job); } catch { /* name only */ } // BH10 P1-4: stored with the route that runs
    let err: string | null = null; let timeout = false; delete (job as any).chargeNote; const mark0 = sentMark(job, a);
    { const Q = await import('../queue.js'); await Q.moveLane(job); } // 2026-10-25: a move to a route on another place (local ↔ cloud) changes the job's queue lane
    try { await execute(job, tool, r, a); } catch (e) { err = e instanceof Error ? e.message : String(e); timeout = !!(e as any)?.timeout;
      if ((e as any)?.busy) { job.reasonCode = 'queue_full'; job.errorType = 'temporary'; err = stillBusyMessage((e as any).busyTries ?? 1); } } // provider stayed busy after the capped retries (busyRetry.ts)
    job.queueReason = null;
    if (!err && !failedNow(job) && job.status === 'done') { a.status = 'done'; a.endedAt = Date.now(); return; }
    if (job.status === 'canceled') { a.status = 'failed'; a.error = 'canceled'; a.endedAt = Date.now(); return; }
    if (job.status === 'blocked') { a.status = 'failed'; a.error = job.error; a.endedAt = Date.now(); return; } // content filter: never retried elsewhere
    a.status = timeout ? 'timeout' : 'failed'; a.error = err ?? job.error ?? 'failed'; a.endedAt = Date.now();
    if (!(price > 0) || !teamMode()) { a.error = noCreditsBack(a.error); if (job.error) job.error = noCreditsBack(job.error); } // BH P3 #8: a 0-credit attempt never says credits went back (own-accounts mode: nothing goes back to an app balance either)
    // Auto (and allowFallback) continues only to a route that costs ≤ the quote the user accepted (the attempt-1
    // charge). A pricier next route never starts on its own: the job ends needs_decision with a fresh quote and a visible note (no silent fallback).
    const quoted = R.prices[job.routeAttempts[0].routeId] ?? price;
    // D4: move on only when this failed attempt surely cost nothing; otherwise stop and say so (Try on places below)
    const free = failedAttemptNotCharged(job, r, { price, reached: sentMark(job, a) !== mark0 }); if (free) a.notCharged = true;
    const safe = auto && free;
    if (auto && !safe && order.slice(k + 1).some((id) => !!findRoute(id))) job.warnings = [...(job.warnings ?? []), `${placeName(r)} may have charged for the failed try, so it didn’t move to another place on its own. Pick one below if you want to try again.`];
    const nextOk = safe ? order.findIndex((id, j) => j > k && !!findRoute(id) && (R.prices[id] ?? 0) <= quoted) : -1;
    const pricier = safe && nextOk < 0 ? order.slice(k + 1).filter((id) => !!findRoute(id) && (R.prices[id] ?? 0) > quoted) : [];
    const more = nextOk > k; const decide = !more && pricier.length > 0 && fallbackOffers(); // filming mode (fallbackOffers off): a plain failure, credits back, as before
    const lastAutoOnFirst = !more && !decide && n === 1 && !(R.mode === 'pinned' && !R.allowFallback);
    if (!lastAutoOnFirst) { a.refunded = refundAttempt(job.id, n, price, creditsBackNote(`${plainRoute(r)} failed${more ? ', trying the next route' : ''}`)); }
    if (more) { // where it ran is said once, on the result (routeAttempts → web RouteAttempts, and the job's fallback notice)
      if ((job.reasonCode as any) === 'queue_full') job.busyNote = { code: 'queue_busy', route: r.routeId, nextRoute: order[nextOk], nextCredits: R.prices[order[nextOk]] ?? 0, willSwitch: true, message: `${plainRoute(r)} was busy, so this moved to ${plainRoute(findRoute(order[nextOk]) ?? { routeId: order[nextOk] })} at the same or a lower price.` };
      k = nextOk - 1; continue; }
    if (decide) { // B6: the next route costs more than the quote → ask, with a fresh quote per option
      const opts = pricier.map((id) => { const rr = findRoute(id)!; const o = option(tool, rr, job.input); const c = R.prices[id] ?? o.credits ?? 0;
        return { ...o, credits: c, deltaCredits: c - quoted, tier: o.tier }; });
      const busy = (job.reasonCode as any) === 'queue_full';
      const note = `${plainRoute(r)} ${busy ? 'was busy' : 'failed'}. The next route, ${plainRoute(opts[0])}, costs ≈ ${ledgerUsd(opts[0].credits)} (${ledgerUsd(opts[0].deltaCredits)} more than your quote), so it didn't start on its own. Pick it or leave it.${a.refunded > 0 ? ` Your ${ledgerUsd(a.refunded)} is back in your balance.` : ''}`;
      job.status = 'needs_decision'; job.stage = 'needs_decision'; job.errorType = job.errorType && job.errorType !== 'temporary' ? job.errorType : 'provider_outage'; job.finishedAt = Date.now();
      job.alternatives = opts; job.decision = { reason: busy ? 'queue_busy' : 'next_route_costs_more', quotedCredits: quoted, failedRoute: r.routeId, options: opts.map((o) => ({ routeId: o.routeId, label: plainRoute(o), credits: o.credits, deltaCredits: o.deltaCredits, tier: o.tier ?? null, tierLabel: o.tierLabel ?? null })), note };
      if (busy) job.busyNote = { code: 'queue_busy', route: r.routeId, nextRoute: opts[0].routeId, nextCredits: opts[0].credits, willSwitch: false, message: `${plainRoute(r)} is busy. The next route costs more than your quote, so this job waits for your choice.` };
      job.error = note; job.refund = { refunded: a.refunded > 0, amount: a.refunded, freeGenReturned: false }; job.creditsBack = { credits: job.routeAttempts.reduce((x, y) => x + y.refunded, 0), attempts: n }; return;
    }
    const alts = fallbackOffers() ? alternativesFor(job, tool) : []; // fallbackOffers:false (OPENHIGGSFIELD_FALLBACK_OFFERS=0, or filming mode by default) → no 'Use …' alternatives, never needs_decision (plain failure, credits back)
    // A temporary failure (or timeout) stays 'failed' + errorType 'temporary' and is retryable on the same route; needs_decision only when the
    // provider itself failed and the next step is switching to another provider (alternatives listed on the job either way).
    const temporary = timeout || job.errorType === 'temporary';
    if (temporary && alts.length) job.alternatives = alts;
    // Run on: no automatic switch. The failed job lists the other places that are ready now (tryOn); nothing else happens until the user picks one.
    job.tryOn = fallbackOffers() && !['validation', 'invalid_input'].includes(String(job.errorType ?? '')) ? tryOnFor(job, tool, r) : [];
    job.status = 'failed'; job.stage = 'failed'; job.errorType = timeout ? 'temporary' : job.errorType ?? 'provider_outage';
    const total = job.routeAttempts.reduce((s, x) => s + x.refunded, 0);
    job.error = `${job.routeAttempts.length > 1 ? `All ${job.routeAttempts.length} routes failed` : `${plainRoute(r)} failed`}: ${String(a.error).replace(/[.\s]+$/, '')}.`;
    if (!lastAutoOnFirst) { job.cost = 0; // The amount lives in structured fields (job.refund.amount + job.creditsBack {credits, attempts}); the client chip shows it, so the message carries no credits sentence.
      const fix = () => { job.refund = { refunded: total > 0, amount: total, freeGenReturned: false }; job.creditsBack = { credits: total, attempts: job.routeAttempts!.length }; job.error = job.error!.replace(/\s*Each failed attempt('s credits went back to your balance| was refunded) \([^)]*\)\.?/g, '').replace(/\s*(Nothing was charged|Credits (were not )?refunded[^.]*|Credits (went |were not returned )?(back )?(to|in) your (app )?balance[^.]*)\.\s*$/, '').trim(); }; fix(); afterSettle.set(job, fix); setImmediate(fix); }
    return;
  }
}
/** The automatic next route would go over the agent budget: the job ends failed before any provider call (nothing charged
 *  for it; the failed attempts' credits already went back), with the reason and the Try on places. The Spend row stays on the failed route. */
function stopOverLimit(job: Job, tool: ToolDef, last: RouteAttempt, next: RouteDef, b: { message: string; code: string }) {
  const failed = findRoute(last.routeId) ?? { routeId: last.routeId, kind: 'fal' as const };
  const total = job.routeAttempts!.reduce((s, x) => s + x.refunded, 0); job.route = last.routeId; job.cost = 0;
  job.status = 'failed'; job.stage = 'failed'; job.errorType = 'limit'; job.reasonCode = b.code;
  job.warnings = [...(job.warnings ?? []), `${plainRoute(next)} didn't start: it would go over the agent budget.`];
  job.tryOn = fallbackOffers() ? tryOnFor(job, tool, failed as RouteDef) : [];
  const msg = `${plainRoute(failed as RouteDef)} failed, and the next route, ${plainRoute(next)}, didn't start because of your agent budget: ${b.message}`;
  const fix = () => { job.error = msg; job.refund = { refunded: total > 0, amount: total, freeGenReturned: false }; job.creditsBack = { credits: total, attempts: job.routeAttempts!.length }; };
  fix(); afterSettle.set(job, fix); setImmediate(fix); // after the queue's settle() (it rewrites the message and refund for a plain failure)
}
/** POST /api/jobs/:id/fallback: can this needs_decision job continue on routeId? (Checked before the spend guard, then again by continueOn.) */
export function continueCheck(job: Job, tool: ToolDef, routeId: string): { ok: true; credits: number } | { error: string; status: number } {
  if (job.status !== 'needs_decision' || !job.routing) return { error: 'Only jobs waiting for a decision (status needs_decision) can fall back.', status: 409 };
  const alt = (job.alternatives ?? []).find((o) => o.routeId === routeId);
  if (!alt) return { error: `route ${routeId} is not one of the alternatives: ${(job.alternatives ?? []).map((o) => o.routeId).join(', ')}`, status: 400 };
  const r = findRoute(routeId)!; const o = option(tool, r, job.input); if (r.comingSoon || o.reasonCode === 'not_wired' || (!o.available && !(config.backend === 'mock' && r.kind !== 'fal' && r.kind !== 'replicate'))) return { error: `route ${routeId} is not available: ${o.reason}`, status: 409 };
  return { ok: true, credits: job.routing.prices[routeId] ?? alt.credits ?? 0 };
}
/** POST /api/jobs/:id/fallback: continue a needs_decision job on the chosen route (charged as a new attempt). The caller ran guardNextRoute. */
export function continueOn(job: Job, tool: ToolDef, routeId: string): { ok: true; credits: number } | { error: string; status: number } {
  const c = continueCheck(job, tool, routeId); if ('error' in c) return c; const credits = c.credits;
  job.alternatives = []; job.status = 'running'; job.stage = 'queued'; job.finishedAt = undefined; job.error = null; job.refund = undefined;
  const settleRow = () => import('../billing.js').then((B) => B.settleSpend(job)).catch(() => {}); // the Spend row (moved here by guardNextRoute) gets this run's status and actual cost
  runRouted(job, tool, { only: routeId, guarded: true }).then(() => { job.finishedAt = Date.now(); void settleRow(); }, (e) => { job.status = 'failed'; job.error = String(e); job.finishedAt = Date.now(); void settleRow(); });
  return { ok: true, credits };
}
export function decline(job: Job) {
  if (job.status !== 'needs_decision') return false;
  job.status = 'failed'; job.stage = 'failed'; job.alternatives = []; job.error = `${job.error ?? ''} You chose not to try another route.`.trim(); return true;
}

/** Klein edit refs as data URIs (fal accepts Base64 data URIs for file inputs). */
