/**
 * One shared progress shape for every runner (premium generating tile + queue activity pill, TRANSPARENCY-PLAN 4i).
 * Served as `progressInfo` on every job (GET /api/jobs/:id, GET /api/jobs incl. ?state=active, GET /api/queue/activity). The older
 * fields (progress number, percent, stage string, steps, queuePos, eta) stay as they were for compatibility; `progress` is still the number.
 *
 * One label source: stage + step/steps. Honest per source:
 *   local-comfy   ComfyUI websocket: queued (in ComfyUI's own queue, queuePosition among its pending prompts) → loading (started, no sampler step yet:
 *                 model load, text encode; also first-use downloads) → generating (step/steps of the current sampler, percent from steps,
 *                 etaSeconds from the step-ETA) → finishing (samplers done: decode, save, download, ffmpeg). previewUrl when a frame arrived.
 *   comfy-cloud   Comfy Cloud job status: queued → generating (percent only when Comfy Cloud reports a progress value) → finishing. No steps, no ETA.
 *   comfy-router, fal, replicate, bfl
 *                 status only: queued (submitted; queuePosition when the provider reports one: fal, Comfy Router) → generating → finishing (download).
 *   mock          sample runs (mock backend, keyless sample routes): plausible simulated values. A run imitating a local run gets loading/generating
 *                 with step/steps; a run imitating a hosted place gets queued/generating/finishing. Always source 'mock'.
 * Before a job starts (app queue): stage queued + queuePosition (1 = next to start). done | failed | canceled at the end (blocked → failed).
 */
import type { Job } from './jobs.js';
import { config } from './config.js';
import { simulatedAtSubmit } from './billing.js';
import { getPreview } from './comfy/preview.js';
import { nativeMode } from './comfy/runNative.js';

export type ProgressStage = 'queued' | 'loading' | 'generating' | 'finishing' | 'done' | 'failed' | 'canceled';
export type ProgressSource = 'local-comfy' | 'comfy-cloud' | 'comfy-router' | 'fal' | 'replicate' | 'bfl' | 'mock';
export interface ProgressInfo { stage: ProgressStage; step?: number; steps?: number; percent?: number; etaSeconds?: number; queuePosition?: number; /** why it waits (queue.ts lanes, a busy provider) */ queueReason?: string; previewUrl?: string; previewAt?: number; source: ProgressSource }

/** Which runner reports this job's progress (the route that runs it; a sample run is always 'mock'). */
export function progressSourceOf(j: Job): ProgressSource {
  if (j.simulated || j.routing?.demo) return 'mock';
  const r = String(j.route ?? ''); const kind = r.split(':')[0];
  // mock backend: only keyed Comfy Router / Comfy Cloud routes run for real (routerRun.ts routerLive, cloudRun.ts cloudLive); they set no `simulated`
  if (config.backend === 'mock' && kind !== 'comfy-router' && kind !== 'comfy-cloud') return 'mock';
  if (kind === 'local') return 'local-comfy';
  if (kind === 'comfy-router' || kind === 'comfy-cloud' || kind === 'fal' || kind === 'replicate') return kind;
  if (kind === 'direct') return /bfl|flux-?3/i.test(r) ? 'bfl' : 'mock'; // other direct vendors are sample-only today
  if (!r && config.backend === 'comfy') return nativeMode() ? 'local-comfy' : 'comfy-cloud'; // pre-routing / free lane jobs on the comfy backend
  return simulatedAtSubmit() ? 'mock' : 'local-comfy';
}

const MOCK_LOAD = 15; const MOCK_FINISH = 90; // simulated percent where loading ends / finishing starts
const pos = (n: unknown) => (Number(n) > 0 ? { queuePosition: Number(n) } : {});
const SIM_LOCAL = (j: Job) => { const r = String(j.route ?? ''); return !r || r.startsWith('local:'); };

export function progressOf(j: Job): ProgressInfo {
  const p = baseProgress(j);
  if (p.stage === 'queued' && j.queueReason) p.queueReason = j.queueReason; // 2026-10-25: waiting for a lane slot, or a busy provider being retried
  if (j.status === 'running') { const f = getPreview(j.id); if (f) { p.previewUrl = `/api/jobs/${encodeURIComponent(j.id)}/preview?at=${f.at}`; p.previewAt = f.at; } } // frames come from a native ComfyUI (or the mock-only dev hook)
  return p;
}
function baseProgress(j: Job): ProgressInfo {
  const source = progressSourceOf(j);
  if (j.status === 'done') return { stage: 'done', percent: 100, source };
  if (j.status === 'failed' || j.status === 'blocked') return { stage: 'failed', source };
  if (j.status === 'canceled') return { stage: 'canceled', source };
  if (j.status === 'queued') return { stage: 'queued', ...pos(j.queuePos), source };
  if (j.status === 'needs_decision') return { stage: 'queued', source }; // paused for your choice of route (status says so); not in any line
  const st = String(j.stage ?? '');
  if (source === 'mock') {
    const p = Math.max(0, Math.min(99, Number(j.progress) || 0)); const eta = Number(j.eta) > 0 ? { etaSeconds: Math.round(j.eta) } : {};
    if (!SIM_LOCAL(j)) { // imitates a hosted place: status only, with the simulated percent
      const stage: ProgressStage = /^(uploading|submitted|queued)$/.test(st) ? 'queued' : /^(downloading|muxing)$/.test(st) ? 'finishing' : 'generating';
      return { stage, percent: p, ...eta, source }; }
    if (/downloading_model|loading_model/.test(st) || p < MOCK_LOAD) return { stage: 'loading', percent: p, ...eta, source };
    if (p >= MOCK_FINISH) return { stage: 'finishing', percent: p, ...eta, source };
    const steps = Math.max(1, Math.min(150, Number(j.input?.steps) || 20)); const step = Math.max(1, Math.min(steps, Math.ceil(((p - MOCK_LOAD) / (MOCK_FINISH - MOCK_LOAD)) * steps)));
    return { stage: 'generating', step, steps, percent: p, ...eta, source };
  }
  if (source === 'local-comfy' || source === 'comfy-cloud') {
    const stage: ProgressStage = /downloading_model|loading_model/.test(st) ? 'loading' : j.liveStage ? j.liveStage
      : st === 'queued on ComfyUI' || st === 'queued' ? 'queued' : /^(muxing|downloading)$/.test(st) ? 'finishing' : st === 'reconnecting' ? 'generating'
      : source === 'comfy-cloud' ? (st === 'uploading' ? 'queued' : 'generating') : j.progressKind === 'steps' ? 'generating' : 'loading';
    const out: ProgressInfo = { stage, source };
    if (stage === 'queued') Object.assign(out, pos(j.queuePos));
    if (source === 'local-comfy' && stage === 'generating' && j.steps && j.steps.max > 0) { out.step = Math.max(0, Math.min(j.steps.max, j.steps.value)); out.steps = j.steps.max; }
    if (j.progressKind === 'steps' && stage !== 'queued' && stage !== 'loading') out.percent = Math.max(0, Math.min(99, Number(j.progress) || 0)); // real steps (local) / Comfy Cloud's own value
    if (source === 'local-comfy' && stage !== 'queued' && Number(j.eta) > 0) {
      const stepEta = (j.etaRange?.seconds && j.etaRange.source !== 'reported') || (j.progressKind === 'steps' && (Number(j.progress) || 0) >= 5);
      if (stepEta) out.etaSeconds = Math.round(j.eta); }
    return out;
  }
  // hosted, status only (Comfy Router, fal, Replicate, BFL): submitted = in the provider's queue; rendering = generating; downloading = finishing
  const stage: ProgressStage = /^(uploading|submitted|queued)$/.test(st) ? 'queued' : /^(downloading|muxing)$/.test(st) ? 'finishing' : 'generating';
  return { stage, ...(stage === 'queued' ? pos(j.queuePos) : {}), source };
}

