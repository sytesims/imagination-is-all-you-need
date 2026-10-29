export type Stage = string;
export type Status = 'queued' | 'running' | 'done' | 'failed' | 'canceled' | 'blocked' | 'needs_decision';
/** box / description: Image to layers only (the layer's [left, top, right, bottom] on the picture, and the model's own words for it). */
export interface Output { label: string; url: string; box?: number[]; description?: string }
export interface Job {
  id: string;
  toolId: string;
  /** Provider that runs this job (see providers.ts). */
  provider: string;
  status: Status; stage: Stage; progress: number; queuePos: number; eta: number;
  /** Primary result (first output). */
  resultUrl: string | null;
  /** All outputs (e.g. one per angle for Re-shoot). */
  outputs: Output[];
  /** Auxiliary evidence from an executed pass; not generation outputs, Recreate inputs or main result media. Persisted with the existing JSON job. */
  diagnostics?: { jobId: string; requestId: string; route: string | null; pass: number; node: string; label: string; stage: string; note: string; url: string }[];
  error: string | null;
  /** Documented error types: validation | nsfw (provider) | ip (provider) | concurrency | credits | temporary | provider_outage */
  errorType?: string | null;
  /** BH9 (f): why a Comfy Cloud run failed (key_invalid, cloud_credits, …); cloudJobId = the Comfy Cloud v2 job id (stored at submit, never resubmitted). */
  reasonCode?: string | null; cloudJobId?: string | null;
  /** Mock GPU credits charged at submit / refunded on failure or cancel. */
  cost?: number; refunded?: number;
  /** Refund outcome on failed/blocked/canceled jobs: plain flag + credits returned. */
  refund?: { refunded: boolean; amount: number; freeGenReturned: boolean };
  /** Routing: every route attempt failed → credits that went back to your balance across attempts (the message carries no credits sentence). */
  creditsBack?: { credits: number; attempts: number };
  /** Some ref groups failed (their share refunded); `error` lists them. */
  partial?: boolean;
  /** Free-gen lane (slower, separate in-flight cap) [R19/R20]. */
  lane?: 'paid' | 'free';
  /** 2026-10-25 run lanes (queue.ts): 'local' (this computer's ComfyUI / local tools) or 'cloud' (every hosted place), set while the job waits or runs. */
  runLane?: 'local' | 'cloud';
  /** Why a waiting job waits, in plain words ("Waiting for your Mac: one local run at a time", "Comfy Router is busy: trying again in 20 s"); null otherwise. */
  queueReason?: string | null;
  /** Provider request ids for support details [R41]. */
  requestIds?: string[];
  /** Real cost the provider reported for this job (billing.ts), e.g. BFL's `cost` in credits → USD. Absent when the provider reports none. */
  actualCost?: { usd: number; units?: number; unitLabel?: string; source: string };
  warnings: string[];
  /** Tool-specific input, produced by the tool's parseInput(). */
  input: Record<string, any>;
  /** Job this one was spawned from ("generate more" / re-roll). */
  parentId?: string | null;
  /** S-04: set when this job re-runs its parent (POST /api/jobs/:id/retry): 'retry' (Try again), 'try-on' (Try on <place>), 'failed-groups'
   *  (?failedOnly=1). A re-run is not an enhancement (pages.ts isEnhanced). Absent on every other job. */
  rerun?: 'retry' | 'try-on' | 'failed-groups';
  createdAt: number;
  finishedAt?: number;
  /** Multi-provider routing (routing/run.ts): chosen plan, route that ran, every attempt, and alternatives when status = needs_decision. */
  routing?: import('./routing/types.js').JobRouting;
  route?: string | null;
  routeAttempts?: import('./routing/types.js').RouteAttempt[];
  alternatives?: import('./routing/types.js').RouteOption[];
  /** Run on (2026-10-22): a failed run's other ready places ("Try on <place>"), one per place with this job's price; POST /api/jobs/:id/retry {runOn} re-runs there. */
  tryOn?: import('./routing/run.js').TryOn[];
  /** B6: why an Auto job stopped for a choice (the next route costs more than the quote, or the route was busy): fresh price per option + plain note. */
  decision?: { reason: 'next_route_costs_more' | 'queue_busy' | 'pinned_route_failed'; quotedCredits: number; failedRoute: string; options: { routeId: string; label: string; credits: number; deltaCredits: number; tier: number | null; tierLabel: string | null }[]; note: string };
  /** B6: Comfy Cloud (or another route) was busy: whether the job moved on by itself (same or lower price) or waits for a choice. */
  busyNote?: { code: 'queue_busy'; route: string; nextRoute: string; nextCredits: number; willSwitch: boolean; message: string };
  /** Set when a queued job was put back in the queue after a server restart. */
  requeuedAt?: number;
  /** X-Client-Id of the browser that submitted ("started on another device" when it differs from yours). */
  originClientId?: string | null;
  /** Last time status/progress/queuePos changed (for client polling of GET /api/jobs?state=active). */
  updatedAt?: number;
  /** Elapsed > 2× ETA (slow-job hint). */
  slow?: boolean;
  /** When the dispatcher started it. */
  startedAt?: number;
  /** When ComfyUI (local or Comfy Cloud) actually began executing it, out of every queue (first non-queued phase; shared/jobTiming.ts).
   *  Render time = finishedAt - renderStartedAt; queue wait = renderStartedAt - createdAt. Absent on hosted APIs and older jobs. */
  renderStartedAt?: number;
  /** ETA (s) at submit, for the slow-job hint. */
  etaInitial?: number;
  /** Chunked jobs: cancel requested while running → groups not yet started are skipped + refunded. */
  cancelRemaining?: boolean; canceledGroups?: number;
  /** Chunked jobs: 1-based indexes of groups that failed (for retry?failedOnly=1). */
  failedGroups?: number[];
  /** Model registry (MODEL-ROUTE-SPEC step 2): the stable model key (shared/modelIds.ts) and the account it ran on. Written on new jobs;
   *  derived on read for older rows (routing/modelRegistry.ts jobModelFields). `model` in the API stays the display name. */
  modelKey?: string; runOn?: string | null;
  /** BH9 P1-4: display name of the model that actually ran, when it differs from the provider's card (Camera Moves LTX presets → 'LTX-2 19B'). */
  modelName?: string;
  /** HW-SHAPES: the local route's fit on this computer at submit (verdict, reason, tier, ETA; warning = Q2 'too heavy, runs because you picked it'). */
  fit?: { verdict: string; reasonCode: string; reason: string; tier: string; enforced: boolean; etaSeconds: number | null; eta: any; warning?: string; alternative?: any; alternativeReason?: string | null; missingBytes?: number | null; missingBytesSource?: string | null; downloadId?: string | null };
  /** HW-SHAPES B4: detail for the downloading_model / loading_model stages (stage stays a plain string). */
  stageDetail?: { stage: 'downloading_model' | 'loading_model'; bytesTotal: number | null; bytesDone: number | null; etaSeconds: number | null; rateBytesPerSec: number | null; rateSource: 'learned' | 'estimate';
    files: { file: string; bytesTotal: number | null; bytesDone: number | null }[]; firstUse: boolean; message: string; downloadId?: string | null; downloadedBytes?: number } | null;
  /** B4: when each stage started / ended (ms) for learned timings and the slow hint. */
  stageTimes?: Record<string, { start: number; end?: number; bytes?: number }>;
  /** Step-ETA learning (stepEta.ts): this computer's estimate range for a local run (set at submit, refreshed when the run starts), whether this
   *  run is the calibration run (no timed run of this workflow on this hardware yet), and what this run measured once done. */
  etaRange?: import('./stepEta.js').EtaRange | null; calibrating?: boolean;
  etaTimed?: { loadSec: number; loadKind: 'cold' | 'warm'; sampleSec: number; postSec: number; steps: number } | null;
  /** B4: where the ETA goes: first-use download, model load, render (seconds). */
  etaBreakdown?: { downloadSec: number; loadSec: number; renderSec: number } | null;
  /** Agent budgets (agentBudget.ts): the MCP agent session that made this job (X-OHF-Agent-Budget header). */
  agent?: { id: string; name: string } | null;
  /** The result came from a mock / sample run (tools/shared.ts mockRun): nothing reached a provider, so it never counts as spend. */
  simulated?: boolean;
  /** A free local run: the cheapest hosted route's estimate for the same model and settings at submit (billing.ts localSavingsOf), and that route. Absent when no hosted route exists. */
  savedUsd?: number | null; savedVs?: { routeId: string; runOn: string; label: string; credits: number } | null;
  /** A local run: the short name of the machine it ran on ('M3 Max', 'RTX 4090'), when the hardware is known. */
  machine?: string | null;
  /** How `progress` is known: 'steps' = real sampler steps from ComfyUI (step / max), 'indeterminate' = no step data yet (show elapsed time, never a made-up percent). */
  progressKind?: 'steps' | 'indeterminate' | null;
  /** Live sampler steps from ComfyUI's websocket (value / max on the current sampler, sampler index of samplers in the graph). */
  steps?: { value: number; max: number; sampler: number; samplers: number } | null;
  /** Shared progress (progress.ts): the phase a ComfyUI run reported (native websocket / Comfy Cloud status): queued in ComfyUI's own queue, loading
   *  (started, no sampler step yet), generating, finishing (samplers done: decode, save, download). null/absent = derive from stage. */
  liveStage?: 'queued' | 'loading' | 'generating' | 'finishing' | null;
  /** Native ComfyUI prompt this job is waiting on (local or remote ComfyUI), stored at submit so a server restart can reconnect and collect the result. */
  comfyPrompt?: { id: string; base: string; pass: number; passes: number; outputs: string[]; labels: string[]; resumable: boolean; submittedAt: number; /** hard cap on running time used for this prompt */ capMs?: number } | null;
  /** A local run marked failed (stall / hard cap / server restart) whose prompt ComfyUI may still finish: the late-result sweeper (comfy/lateRescue.ts)
   *  checks /history until `until` and turns the job done ("Finished late") when the result shows up. Cleared once settled either way. */
  lateWatch?: { since: number; until: number; why: 'stall' | 'cap' | 'restart' } | null;
  /** The result arrived after the job had been marked failed (late-result sweeper): when it was collected. */
  finishedLateAt?: number | null;
  /** Fit to model (videoFit.ts): what was done to the clip for this model (one line + the numbers), and whether the result was cropped back. */
  videoFit?: { note: string | null; mode: string; steps: string[]; from: string; sent: string; trimTo?: number; fps?: number; restore: boolean; restored: boolean | null } | null;
}
import { all, put, tx, getKv, setKv } from './db.js';
import { DATA_DIR } from './config.js';
import { toRelDeep, toAbsDeep, migrateRows, labelPrefixes } from './mediaPaths.js';

/** BUG-HUNT-8 P1: rows store media paths relative to the data dir; the live map holds them absolute under the CURRENT data dir.
 *  Boot migration (idempotent, every start, so an imported old export is fixed too): absolute paths in stored rows → relative.
 *  kv 'migration:relativeMediaPaths' = { firstRunAt, lastRunAt, runs: [{at, rows, values, prefixes}] } (runs that changed something). */
const rawJobs = all<Job>('jobs');
{ const mg = migrateRows(rawJobs, DATA_DIR); const K = 'migration:relativeMediaPaths'; const prev = getKv<any>(K, null); const at = new Date().toISOString();
  if (mg.rows) tx(() => { for (const r of mg.changed) put('jobs', r.id, r); });
  // BH10 P2: prefixes are logged as labels ('<data dir>/', '<other checkout>/server/data/'), and older records with host prefixes are rewritten once
  const oldRuns = (prev?.runs ?? []) as any[]; const relabel = oldRuns.some((r) => Object.keys(r.prefixes ?? {}).some((k) => !k.startsWith('<')));
  const runs = oldRuns.map((r) => ({ ...r, prefixes: labelPrefixes(r.prefixes, DATA_DIR) }));
  if (mg.rows || !prev || relabel) setKv(K, { firstRunAt: prev?.firstRunAt ?? at, lastRunAt: mg.rows || !prev ? at : prev.lastRunAt, runs: [...runs, ...(mg.rows ? [{ at, rows: mg.rows, values: mg.values, prefixes: labelPrefixes(mg.prefixes, DATA_DIR) }] : [])].slice(-20) });
  if (mg.rows) console.info(`[openhiggsfield] media paths: ${mg.rows} job rows / ${mg.values} values rewritten relative to the data dir`); }
/** Live job map, loaded from SQLite at boot. Jobs are mutated in place by the pipeline, so changes are
 * flushed by diffing each job's JSON (every 400 ms, and on shutdown). */
export const jobs = new Map<string, Job>(rawJobs.map((j) => toAbsDeep(j, DATA_DIR)).map((j) => [j.id, j]));
const store = (j: Job) => put('jobs', j.id, toRelDeep(j, DATA_DIR));
const lastSaved = new Map<string, string>([...jobs.values()].map((j) => [j.id, JSON.stringify(j)]));
export function flushJobs() {
  tx(() => { for (const j of jobs.values()) { const s = JSON.stringify(j); if (lastSaved.get(j.id) !== s) { store(j); lastSaved.set(j.id, s); } } });
}
setInterval(flushJobs, 400).unref();
/** BH4 #7 (G14): write one job row now (used inside the charge transaction so a crash can't leave a charge without its job). */
export function persistJob(j: Job) { const s = JSON.stringify(j); store(j); lastSaved.set(j.id, s); }
