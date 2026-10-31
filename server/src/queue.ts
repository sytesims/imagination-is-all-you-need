import { randomUUID } from 'node:crypto';
import { modelNameForRun } from './models.js';
import { jobs, Job, persistJob } from './jobs.js';
import { db } from './db.js';
import { getTool } from './tools/registry.js';
import { runWithProvider, getProvider } from './providers.js';
import { charge, refund, refundFreeGen, useFreeGen, creditsBackNote, runEndedWhat } from './ledger.js';
import { env } from './env.js';
import { settleSpend, jobSpendView, billingInfo, billedToOf, PRE_DISPATCH } from './billing.js';
import { teamMode } from './billingMode.js';
import { dropPreview } from './comfy/preview.js';
import { config } from './config.js';
import { progressSourceOf } from './progress.js';
import { nativeMode } from './comfy/runNative.js';
import { ComfyNative, type CancelOutcome } from './comfy/native.js';
import { policyRefusalCharge } from './shared/policyBilling.js';
import { afterSettle } from './routing/state.js';
import { runWithVideoFit } from './videoFit.js';

/**
 * Shared job queue for all tools, in two run lanes (2026-10-25):
 *  - local: this computer's ComfyUI and local tools. ComfyUI runs one prompt at a time per GPU, so LOCAL_CONCURRENCY (default 1) jobs run at once.
 *  - cloud: every hosted place (Comfy Router, Comfy Cloud, fal, Replicate, lab APIs, keyless samples). The provider does the work, so jobs start at
 *    once, up to a safety cap CLOUD_CONCURRENCY (default 10).
 * A local job never waits for a cloud job, and the other way round. Inside each lane the paid-before-free rule [R19/R20] holds, and free-gen
 * jobs keep one in-flight cap (MAX_PARALLEL_FREE) across both lanes. A job's lane follows the route it runs on (laneOf), so a queued job is taken
 * by the lane of its route at start, and an allowFallback move to a route on the other place moves its slot there (moveLane, routing/run.ts).
 */
export type RunLane = 'local' | 'cloud';
const envInt = (k: string) => { const n = Number(env(k)); return Number.isFinite(n) && n >= 1 ? Math.floor(n) : null; };
/** Local runs at once. OPENHIGGSFIELD_LOCAL_CONCURRENCY; else the old OPENHIGGSFIELD_CONCURRENCY (it meant "runs at once" when every run
 *  shared one line, and a local GPU is what it was protecting); else 1. */
export const LOCAL_CONCURRENCY = envInt('LOCAL_CONCURRENCY') ?? envInt('CONCURRENCY') ?? 1;
/** Cloud runs at once (a safety cap, not a speed limit). OPENHIGGSFIELD_CLOUD_CONCURRENCY, default 10. */
export const CLOUD_CONCURRENCY = envInt('CLOUD_CONCURRENCY') ?? 10;
/** Jobs that can run at the same time, both lanes together; shown as `concurrency` in /api/queue and /api/config (per lane under `lanes`). */
export const CONCURRENCY = LOCAL_CONCURRENCY + CLOUD_CONCURRENCY;
/** Max jobs queued+running at once (CLEANROOM "concurrency limit" error). Only the legacy admission uses it (OPENHIGGSFIELD_MAX_QUEUED=0; the
 *  default admission is the MAX_QUEUED waiting cap, edge.ts). Default: at least every slot of both lanes (was 6 when 2 ran at once). */
export const MAX_PARALLEL = Number(env('MAX_PARALLEL')) || Math.max(6, CONCURRENCY);
/** Priority vs free lane [R19/R20]: paid jobs are pumped first; free-gen jobs have their own in-flight cap. */
export const MAX_PARALLEL_FREE = Number(env('MAX_PARALLEL_FREE')) || 2;
const paid: string[] = [];
const free: string[] = [];
let activeFree = 0;
const LANE_LIMIT: Record<RunLane, number> = { local: LOCAL_CONCURRENCY, cloud: CLOUD_CONCURRENCY };
const laneActive: Record<RunLane, number> = { local: 0, cloud: 0 };
/** Running jobs and the lane slot each holds. */
const slots = new Map<string, { lane: RunLane; free: boolean }>();
/** Running jobs waiting for a slot in the lane they moved to (served before queued jobs: they already started). */
const movers: Record<RunLane, { id: string; go: () => void }[]> = { local: [], cloud: [] };
/** The lane of a job = where its route runs: a 'local:' route (or no route and an open-weights engine on the native ComfyUI) is local;
 *  every hosted route, and a keyless sample of one, is cloud. Route ids start with their kind (routing/routes.ts), so no route lookup here. */
export function laneOf(j: Pick<Job, 'route' | 'provider' | 'routing'>): RunLane {
  if (j.routing?.demo) return 'cloud';
  const kind = j.route ? String(j.route).split(':')[0] : '';
  if (kind) return kind === 'local' ? 'local' : 'cloud';
  const p = getProvider(j.provider);
  return !p || p.kind === 'open-weights' ? (config.backend === 'comfy' && !nativeMode() ? 'cloud' : 'local') : 'cloud';
}
const laneWait = (lane: RunLane) => (lane === 'local' ? `Waiting for your computer: ${LOCAL_CONCURRENCY === 1 ? 'one run' : `${LOCAL_CONCURRENCY} runs`} at a time` : 'Waiting for a free cloud slot');
/** Why a queued job waits, in plain words. */
function waitReason(j: Job, lane: RunLane, ahead: boolean): string {
  if (j.lane === 'free' && activeFree >= MAX_PARALLEL_FREE) return `Waiting for a free-gen slot: ${MAX_PARALLEL_FREE === 1 ? 'one free run' : `${MAX_PARALLEL_FREE} free runs`} at a time`;
  if (!ahead && laneActive[lane] + movers[lane].length < LANE_LIMIT[lane]) return 'Starting now';
  return laneWait(lane);
}
/** Position = place in the line of the job's own lane (paid ahead of free), 1 = next to start there; plus its lane and plain reason. */
function refreshPositions() {
  const n: Record<RunLane, number> = { local: 0, cloud: 0 };
  for (const id of [...paid, ...free]) { const j = jobs.get(id); if (!j || j.status !== 'queued') continue; const lane = laneOf(j); j.runLane = lane; j.queuePos = ++n[lane]; j.queueReason = waitReason(j, lane, n[lane] > 1); }
}
const laneView = (lane: RunLane) => { const waiting = [...paid, ...free].filter((id) => { const j = jobs.get(id); return !!j && j.status === 'queued' && laneOf(j) === lane; }).length;
  return { running: laneActive[lane], waiting, limit: LANE_LIMIT[lane] }; };
/** Lane sizes for /api/queue, /api/health: the paid / free lines (old keys) and the local / cloud lanes {running, waiting, limit}. */
export const laneSizes = () => ({ paid: paid.length, free: free.length, active: laneActive.local + laneActive.cloud, activeFree, maxParallelFree: MAX_PARALLEL_FREE, local: laneView('local'), cloud: laneView('cloud') });
/** [R16] Cancel only while Queued. OPENHIGGSFIELD_CANCEL_IN_PROCESSING=1 also allows it during Processing (prep/upload). */
export const CANCEL_IN_PROCESSING = /^(1|true|on)$/i.test(env('CANCEL_IN_PROCESSING') || '');

/** UI state per CLEANROOM: Queued (cancellable) → Processing (prep/upload) → Generating (no cancel). */
export type JobState = 'queued' | 'processing' | 'generating' | 'done' | 'failed' | 'canceled' | 'blocked';
export function stateOf(j: Job): JobState {
  if (j.status !== 'running') return j.status as JobState;
  return j.progress < 15 && !j.comfyPrompt?.id && j.progressKind !== 'steps' ? 'processing' : 'generating'; // a prompt submitted to ComfyUI is generating even before its first step
}
/** A single-group run on your own ComfyUI (native API) can be stopped at every stage, and nothing is billed: before submit (upload, prep) the runner
 *  stops at its next check; submitted and still pending in ComfyUI's own queue → removed from that queue; running → interrupted (only when ComfyUI
 *  says the running prompt is this job's). Hosted runs (and sample runs) stay cancellable only before dispatch. */
export const localNativeRunning = (j: Job) => j.status === 'running' && (j.input?.refBatches?.length ?? 0) <= 1
  && (!!j.comfyPrompt?.id || (config.backend === 'comfy' && !j.simulated && !j.routing?.demo && nativeMode() && progressSourceOf(j) === 'local-comfy'));
export const canCancel = (j: Job) => { if (j.toolId === 'app-photos-to-reel') return j.status === 'queued' || j.status === 'running'; const s = stateOf(j); return s === 'queued' || (CANCEL_IN_PROCESSING && s === 'processing') || localNativeRunning(j); };

const PLAIN_ERR: Record<string, string> = { temporary: 'temporary problem', provider_outage: 'provider problem', validation: 'invalid input', content_filter: 'blocked by the provider', no_provider: 'no route available', timeout: 'took too long', ip_blocked: 'blocked by the provider' };
function settle(job: Job) {
  job.finishedAt = Date.now(); job.updatedAt = job.finishedAt; dropPreview(job.id); // live preview frames live only while the job runs
  try { settleSpend(job); } catch { /* spend log only */ }
  if (job.status === 'done') void import('./etaLearn.js').then((L) => L.recordJob(job)).catch(() => {}); // HW-SHAPES B5: learned timings (real runs, or OPENHIGGSFIELD_ETA_LEARN_MOCK=1)
  if (job.status === 'failed' || job.status === 'blocked' || job.status === 'canceled') {
    // DP ask #4: "Run failed (temporary problem): credits back to your balance" (free gens: "Run failed (…): free gen returned (N left)")
    const what = runEndedWhat(job.status, job.errorType && job.status !== 'canceled' ? PLAIN_ERR[job.errorType] ?? job.errorType.replace(/_/g, ' ') : null);
    job.refunded = refund(job.id, creditsBackNote(what)); const freeBack = refundFreeGen(job.id, what);
    const total = (job.cost ?? 0) > 0 ? (job.refunded ?? 0) : 0;
    job.refund = { refunded: total > 0 || freeBack, amount: total, freeGenReturned: freeBack };
    // [b] Plain wording on every failure: replace any generic credits phrase with the accurate outcome (credits go back to your balance; providers bill under their own terms).
    // Credits back live in structured fields (refund.amount, creditsBack {credits, attempts}); the client chip shows them, so no credits sentence in the message.
    if (total > 0) job.creditsBack = { credits: total, attempts: Math.max(1, job.routeAttempts?.length ?? 0) };
    // Own-accounts mode: nothing was held in the app, so no "credits back" promise; the provider's own rule for failed runs instead (billing.ts).
    const charged = (job.cost ?? 0) > 0 && !job.routing?.demo; const ownNote = !teamMode() && charged && total === 0 ? ownAccountsNote(job) : null;
    const note = total > 0 ? '' : freeBack ? 'Free gen returned.' : ownNote != null ? ownNote : (job.cost ?? 0) > 0 ? 'Credits were not returned to your balance.' : 'Nothing was charged.';
    if (job.status !== 'canceled' || job.error) job.error = `${(job.error ?? 'Something went wrong.').replace(/\s*(Your )?[Cc]redits (were )?refunded[^.]*\.?(;\s*)?/g, ' ').replace(/\s*[Cc]redits (went |are )?back (to|in) your (app )?balance[^.]*\.?(;\s*)?/g, ' ').replace(/\s*[Cc]redits were not returned to your balance\.?/g, ' ').replace(/\s+/g, ' ').trim()} ${note}`.trim();
  }
  const fix = afterSettle.get(job); if (fix) { afterSettle.delete(job); fix(); } // routing/run.ts: a routed failure's own refund + message win over the plain-failure rewrite above
  const parent = jobs.get(job.input.reelParentId);
  if (parent?.toolId === 'app-photos-to-reel') {
    const children = [...jobs.values()].filter(j=>j.input.reelParentId === parent.id);
    parent.input.childCost = children.reduce((sum,j)=>sum+Math.max(0,Number(j.cost??0)-Number(j.refunded??0)),0);
    parent.input.childCostUsd = children.reduce((sum,j)=>sum+Number(jobSpendView(j.id)?.countedUsd ?? 0),0); parent.updatedAt=Date.now(); persistJob(parent);
  }

}

/** Own-accounts mode, a failed / canceled paid run: what the provider does with it (its documented rule), never an app refund. */
function ownAccountsNote(job: Job): string {
  if (job.status === 'canceled' && !job.startedAt) return 'Nothing was sent to the provider.';
  // refused before any run (Router not switched on for this model, the plan, credits, a bad body): nothing to bill, never "may still bill"
  if ((job as any).chargeNote === 'not_charged' || PRE_DISPATCH.has(String((job as any).reasonCode ?? ''))) return 'Nothing was charged.';
  const kind = job.route ? job.route.split(':')[0] : null; const who = billingInfo(billedToOf(kind, job.route)); if (who.id === 'local') return 'Nothing was charged.';
  if (((job as any).reasonCode === 'content_blocked' || job.errorType === 'nsfw') && policyRefusalCharge(job as any) === 'no') return `${who.name} doesn’t charge when this model refuses a prompt or image.`;
  return who.failureRule === 'not-charged' ? `${who.name} doesn’t charge for failed runs.` : who.failureRule === 'may-charge' ? `${who.name} may still bill your account for this run. ${who.failureNote}` : `Check your ${who.name} account: it doesn’t publish whether failed runs are billed.`;
}
/** The next queued job for a lane: paid line first, then free (within the free-gen cap); ids no longer queued are dropped. */
function next(lane: RunLane): string | undefined {
  for (const q of [paid, free]) {
    if (q === free && activeFree >= MAX_PARALLEL_FREE) return undefined;
    for (let i = 0; i < q.length; i++) { const j = jobs.get(q[i]);
      if (!j || j.status !== 'queued') { q.splice(i--, 1); continue; }
      if (laneOf(j) === lane) return q.splice(i, 1)[0]; }
  }
  return undefined;
}
const release = (id: string) => { const s = slots.get(id); if (!s) return; slots.delete(id); laneActive[s.lane]--; if (s.free) activeFree--; };
function pump() {
  for (const lane of ['local', 'cloud'] as const) {
    while (laneActive[lane] < LANE_LIMIT[lane] && movers[lane].length) { const m = movers[lane].shift()!; const s = slots.get(m.id); if (s) { s.lane = lane; laneActive[lane]++; } m.go(); }
    while (laneActive[lane] < LANE_LIMIT[lane]) {
      const id = next(lane); if (!id) break;
      const job = jobs.get(id)!;
      const tool = getTool(job.toolId)!;
      const isFree = job.lane === 'free';
      laneActive[lane]++; if (isFree) activeFree++; slots.set(id, { lane, free: isFree });
      job.runLane = lane; job.queueReason = null; job.queuePos = 0; job.startedAt = Date.now(); job.updatedAt = job.startedAt;
      runWithVideoFit(job, () => runWithProvider(job, tool)) // Fit to model: the clip fitted before the run, a padded result cropped back after (videoFit.ts)
        .catch((e) => { job.status = 'failed'; job.errorType = job.errorType ?? 'temporary'; job.error = e instanceof Error ? e.message : String(e); })
        .finally(() => { if ((job as any).cancelRequested) { job.status = 'canceled'; job.stage = 'canceled'; job.outputs = []; job.resultUrl = null; job.progress = 0; job.error = null; } job.queueReason = null; settle(job); release(id); pump(); });
    }
  }
  refreshPositions();
}
/** A running job whose next route runs on the other place (allowFallback, routing/run.ts) moves its slot: the old lane's slot is freed at once;
 *  in the new lane it goes on when a slot is free (moved jobs go before queued ones). No-op for a job without a slot (POST /api/jobs/:id/fallback
 *  runs outside the queue) or one already in the right lane. */
export async function moveLane(job: Job): Promise<void> {
  const s = slots.get(job.id); const to = laneOf(job); if (!s || s.lane === to) return;
  laneActive[s.lane]--; job.runLane = to;
  if (laneActive[to] < LANE_LIMIT[to] && !movers[to].length) { s.lane = to; laneActive[to]++; pump(); return; }
  job.queueReason = laneWait(to); job.stage = 'queued'; job.updatedAt = Date.now();
  await new Promise<void>((go) => { movers[to].push({ id: job.id, go }); pump(); });
  job.queueReason = null; job.updatedAt = Date.now();
}

/**
 * Restart policy: RUNNING jobs come back failed (temporary) + auto-refund — the in-flight render is gone.
 * QUEUED jobs are requeued in original createdAt order, keeping their original hold (no second charge), and get `requeuedAt`.
 * OPENHIGGSFIELD_REQUEUE_ON_RESTART=0 restores the old "fail everything" behaviour. Default on (ours).
 */
export const REQUEUE_ON_RESTART = !/^(0|false|off|no)$/i.test(env('REQUEUE_ON_RESTART') ?? '1');
const requeue: Job[] = []; const orphans: Job[] = []; const reconnect: Job[] = [];
/** Item 10: a job running on a local / remote ComfyUI with a stored prompt id is not lost on restart: it reconnects (comfy/resume.ts).
 *  OPENHIGGSFIELD_RESUME_COMFY=0 restores the old "fail it" behaviour. */
export const RESUME_COMFY = !/^(0|false|off|no)$/i.test(env('RESUME_COMFY') ?? '1');
const resumable = (j: Job) => RESUME_COMFY && j.status === 'running' && !!j.comfyPrompt?.id && j.comfyPrompt.resumable === true && !!j.comfyPrompt.base;
// Older reel runs recorded their step IDs before the hiding marker existed. Backfill only that explicit ownership list.
for (const parent of jobs.values()) if (parent.toolId === 'app-photos-to-reel') {
  const ids=new Set([...(parent.input.childIds??[]),...Object.values(parent.input.photoJobs??{}),parent.input.musicJobId,parent.input.composeJobId]);
  for (const id of ids) { const child=typeof id==='string'?jobs.get(id):undefined; if (child && child.toolId!=='app-photos-to-reel' && !child.input.reelParentId && ((parent.input.childIds??[]).includes(id) || child.parentId===parent.id || (id===parent.input.musicJobId && child.parentId===parent.input.composeJobId && jobs.get(parent.input.composeJobId)?.parentId===parent.id))) { child.input.reelParentId=parent.id;child.parentId=parent.id;persistJob(child); } }
}
// Mark interrupted reel parents first, regardless of saved row order, then stop their undispatched children.
const interruptedReels = new Set([...jobs.values()].filter(j=>j.toolId === 'app-photos-to-reel' && ['queued','running','failed'].includes(j.status)).map(j=>j.id));
for (const j of jobs.values()) {
  if (j.status !== 'queued' && j.status !== 'running') continue;
  if (j.status === 'queued' && j.toolId !== 'app-photos-to-reel' && j.input.reelParentId && interruptedReels.has(j.input.reelParentId)) { j.status='canceled';j.stage='canceled';j.error='The reel was interrupted before this step started. Retry the reel to continue.';settle(j);persistJob(j);continue; }
  if (j.toolId === 'app-photos-to-reel') { j.status = 'failed'; j.stage = 'failed'; j.errorType = 'temporary'; j.error = 'The server restarted. Retry the reel to continue from finished photos. See individual step jobs for any costs.'; j.finishedAt = Date.now(); persistJob(j); continue; }
  if (j.status === 'queued' && REQUEUE_ON_RESTART) { requeue.push(j); continue; }
  if (resumable(j)) { reconnect.push(j); j.stage = 'reconnecting'; j.progressKind = 'indeterminate'; j.updatedAt = Date.now(); continue; }
  j.status = 'failed'; j.errorType = 'temporary'; j.stage = 'failed'; j.queuePos = 0; j.eta = 0;
  // B7: settle() adds the accurate outcome (credits back only when something was charged; else "Nothing was charged.")
  j.error = 'The server restarted while this was in progress; try again.';
  if (j.routeAttempts?.length || j.cloudJobId) orphans.push(j);
  settle(j);
}
for (const id of interruptedReels) { const parent=jobs.get(id)!; const children=[...jobs.values()].filter(j=>j.input.reelParentId===id); parent.input.childCost=children.reduce((sum,j)=>sum+Math.max(0,Number(j.cost??0)-Number(j.refunded??0)),0); parent.input.childCostUsd=children.reduce((sum,j)=>sum+Number(jobSpendView(j.id)?.countedUsd??0),0);persistJob(parent); }
// B7: interrupted Comfy Cloud runs are cancelled on Cloud too (best effort, after boot; lazy import keeps queue.ts free of routing cycles).
if (orphans.length) setTimeout(() => { import('./routing/orphans.js').then(({ cancelOrphan }) => Promise.all(orphans.map((j) => cancelOrphan(j)))).catch((e) => console.error('[openhiggsfield] orphan cancel:', e)); }, 0);
if (reconnect.length) setTimeout(() => { import('./comfy/resume.js').then(({ resumeNative }) => Promise.all(reconnect.map((j) => resumeNative(j).then(() => settle(j)))))
  .catch((e) => { console.error('[openhiggsfield] comfy reconnect:', e); for (const j of reconnect) if (j.status === 'running') { j.status = 'failed'; j.stage = 'failed'; j.errorType = 'temporary'; j.error = 'The server restarted while this was in progress; try again.'; settle(j); } }); }, 0);
/** Late-result rescue (comfy/lateRescue.ts): a local run marked failed while ComfyUI kept its prompt (stall / hard cap / restart) turns done when
 *  ComfyUI finishes it. The spend row follows the job to done; nothing is charged (local runs are free, and no second charge is ever made). */
function settleLate(job: Job) {
  try { settleSpend(job); } catch { /* spend log only */ }
  void import('./etaLearn.js').then((L) => L.recordJob(job)).catch(() => {});
}
const LATE_SWEEP_MS = Number(env('LATE_SWEEP_MS')) || 30_000;
// Runs failed by the old fixed 30-min timeout ("timed out after N min of running") in the last 2 h kept their prompt on ComfyUI: watch them too.
for (const j of jobs.values()) if (j.status === 'failed' && !j.lateWatch && j.comfyPrompt?.resumable && j.comfyPrompt.base && (j.finishedAt ?? 0) > Date.now() - 2 * 3600_000
  && /timed out after \d+ min of running/.test(j.error ?? '')) j.lateWatch = { since: j.finishedAt!, until: j.finishedAt! + 2 * 3600_000, why: 'cap' };
const sweepLateNow = () => { if (![...jobs.values()].some((j) => j.lateWatch && j.status === 'failed')) return Promise.resolve(0);
  return import('./comfy/lateRescue.js').then((L) => L.sweepLate(settleLate)).catch((e) => { console.error('[openhiggsfield] late-result sweep:', e); return 0; }); };
setTimeout(sweepLateNow, Math.min(5000, LATE_SWEEP_MS)).unref?.(); setInterval(sweepLateNow, LATE_SWEEP_MS).unref?.();
requeue.sort((a, b) => a.createdAt - b.createdAt);
for (const j of requeue) { j.requeuedAt = Date.now(); j.updatedAt = j.requeuedAt; j.queueReason = null; (j.lane === 'free' ? free : paid).push(j.id); } // each comes back in the lane of its route (laneOf)
if (requeue.length) { refreshPositions(); setTimeout(pump, 300); }

export const inFlight = () => [...jobs.values()].filter((j) => j.status === 'queued' || j.status === 'running').length;

const self = { paid, free };
/** Free lane starts slower (mock "slower queue"): OPENHIGGSFIELD_FREE_LANE_DELAY_MS, default 1500. */
const FREE_LANE_DELAY_MS = Number(env('FREE_LANE_DELAY_MS') ?? 1500);
export function enqueue(toolId: string, input: Record<string, any>, eta: number, id = randomUUID().slice(0, 8), parentId: string | null = null, provider = 'comfy-open', cost = 0, free = false): Job {
  const job: Job = {
    id, toolId, provider, status: 'queued', stage: 'queued', progress: 0, queuePos: 0, eta,
    resultUrl: null, outputs: [], error: null, errorType: null, warnings: input.warnings ?? [], parentId, createdAt: Date.now(), input, cost, refunded: 0,
  };
  job.lane = free ? 'free' : 'paid'; job.etaInitial = eta; job.updatedAt = job.createdAt;
  { const mn = modelNameForRun(toolId, provider, input); if (mn) job.modelName = mn; } // BH9 P1-4: what actually runs (e.g. LTX-2 for an LTX camera preset)
  jobs.set(id, job);
  // BH4 #7 (G14): the job row and its charge (or free-gen use) commit in ONE SQLite transaction: a SIGKILL/OOM can no longer leave
  // a charge whose job row was still waiting for the 400 ms flush (boot recovery then refunds it as usual).
  try { db.transaction(() => { persistJob(job); if (free) useFreeGen(id, toolId, provider); else charge(id, toolId, provider, cost); }).immediate(); }
  catch (e) { jobs.delete(id); throw e; }
  (free ? self.free : self.paid).push(id);
  refreshPositions();
  setTimeout(pump, free ? FREE_LANE_DELAY_MS : 300);
  return job;
}

/** Returns false if the job is past the cancellable point (Generating). */
export function cancel(job: Job): boolean {
  // a running chunked job stops after the current group; the rest are refunded.
  if (job.status === 'running' && (job.input.refBatches?.length ?? 0) > 1) { job.cancelRemaining = true; return true; }
  if (job.status === 'running' && (CANCEL_IN_PROCESSING || localNativeRunning(job))) { // in-flight cancel (local ComfyUI, or opt-in): the runner's result is discarded and the job is settled ($0 local) when the runner returns
    (job as any).cancelRequested = true; job.status = 'canceled'; job.stage = 'canceled'; job.error = null; job.queuePos = 0; job.eta = 0; job.updatedAt = Date.now(); dropPreview(job.id); return true; }
  if (!canCancel(job)) return job.status === 'canceled';
  job.status = 'canceled';
  for (const q of [paid, free]) { const i = q.indexOf(job.id); if (i >= 0) { q.splice(i, 1); refreshPositions(); settle(job); } } // queued: instant refund
  return true;
}

const comfyFor = (base: string) => new ComfyNative(base, config.comfyApiKey ? { Authorization: `Bearer ${config.comfyApiKey}` } : {});
/** The job's last ComfyUI prompt already finished on ComfyUI (the runner is only saving the result): a cancel now reports done. */
async function lastPromptFinished(job: Job): Promise<boolean> {
  const cp = job.comfyPrompt; if (!cp?.id || !cp.base || cp.pass < cp.passes - 1) return false;
  try { const h = await comfyFor(cp.base).history(cp.id); return !!h && h.status?.status_str !== 'error' && (h.status?.completed === true || Object.keys(h.outputs ?? {}).length > 0); } catch { return false; }
}
/**
 * POST /api/jobs/:id/cancel. canceled: the job is canceled (waiting in our queue: taken out; local ComfyUI: also removed from ComfyUI's queue or
 * interrupted, comfy = what ComfyUI did); done: it finished (or its last prompt finished on ComfyUI) before the cancel landed, so it is kept;
 * refused: past the point where a cancel works (a hosted run already sent to its provider).
 */
export async function cancelRun(job: Job): Promise<{ result: 'canceled' | 'done' | 'refused'; comfy?: CancelOutcome }> {
  if (job.status === 'canceled') return { result: 'canceled' };
  if (job.status === 'done') return { result: 'done' };
  const local = localNativeRunning(job);
  if (local && await lastPromptFinished(job)) return { result: 'done' };
  if ((job.status as string) === 'done') return { result: 'done' }; // finished while ComfyUI was asked
  if ((job.status as string) === 'canceled') return { result: 'canceled' };
  const cp = local ? job.comfyPrompt : null; const multi = (job.input.refBatches?.length ?? 0) > 1;
  if (job.status === 'running' && !multi && !local && !CANCEL_IN_PROCESSING) return { result: 'refused' };
  if (!cancel(job)) return { result: 'refused' };
  // Prompt known: stop it on ComfyUI now (the runner's poll loop shares this same call). Not yet submitted: the runner removes it right after submit.
  if (cp?.id && cp.base) return { result: 'canceled', comfy: await comfyFor(cp.base).cancelPrompt(cp.id) };
  return { result: 'canceled' };
}

/** Your jobs, newest first. Community seed jobs (someone else's, communitySeed.ts) are not part of your history. */
export const history = (toolId?: string) =>
  [...jobs.values()].filter((j) => !(j as any).seed && (!toolId || j.toolId === toolId)).sort((a, b) => b.createdAt - a.createdAt);
