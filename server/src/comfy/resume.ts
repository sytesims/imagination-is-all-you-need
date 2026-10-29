/**
 * Item 10: reconnect to a ComfyUI prompt after a server restart.
 * A job that was running on a local / remote ComfyUI (native API) stores its prompt id at submit (job.comfyPrompt, runNative.ts).
 * On boot, instead of failing it ("The server restarted while this was in progress"), we poll that ComfyUI:
 *   - /history/<id> has outputs → download them, store them (opaque for images) and finish the job;
 *   - /history says error → fail with ComfyUI's reason;
 *   - still in /queue (running or pending) → keep polling (until the prompt's hard cap on RUNNING time; then our prompt is cancelled);
 *   - neither → fail: ComfyUI no longer has it (it restarted too, or the queue was cleared).
 * ComfyUI unreachable: keep trying for UNREACHABLE_MS, then fail, but keep watching it for a late result (comfy/lateRescue.ts).
 * Only single-pass jobs whose outputs are stored as they come (Create Image and other image tools) can be resumed; multi-pass jobs
 * with an ffmpeg post step fail as before (their earlier passes' files are not tracked across restarts).
 */
import path from 'node:path';
import type { Job } from '../jobs.js';
import { DATA_DIR, config } from '../config.js';
import { ComfyNative, type NativeOutput } from './native.js';
import { flattenAlpha } from '../ffmpeg.js';
import { copyFile } from 'node:fs/promises';
import { isOpaqueImage, LATE_WATCH_MS } from './runNative.js';
import { env } from '../env.js';
import { nativeOutputItems } from './nativeImageOutputs.js';
import { featureIdOfJob } from '../shared/imageFeatures.js';

export const canResume = (j: Job) => j.status === 'running' && !!j.comfyPrompt?.id && j.comfyPrompt.resumable === true && !!j.comfyPrompt.base;
const imageJob = (j: Job) => j.input.outKind === 'image' || featureIdOfJob(j) != null;
const UNREACHABLE_MS = Number(env('RESUME_UNREACHABLE_MS')) || 2 * 60_000;
const POLL_MS = Number(env('RESUME_POLL_MS')) || 2000;

export const comfyFor = (base: string) => new ComfyNative(base, config.comfyApiKey ? { Authorization: `Bearer ${config.comfyApiKey}` } : {});
/** Outputs of one /history entry, per node (same shape ComfyNative.run returns). */
export function outputsOf(h: any): Record<string, NativeOutput[]> {
  const outputs: Record<string, NativeOutput[]> = {};
  for (const [node, v] of Object.entries<any>(h?.outputs ?? {})) for (const kind of Object.keys(v)) if (Array.isArray(v[kind])) for (const f of v[kind]) if (f?.filename) (outputs[node] ??= []).push({ ...f, kind });
  return outputs;
}
/** A /history entry that finished well (outputs or completed, not an error). */
export const finishedOk = (h: any) => !!h && h.status?.status_str !== 'error' && (h.status?.completed === true || Object.keys(h.outputs ?? {}).length > 0);
export async function inQueue(c: ComfyNative, id: string): Promise<'running' | 'pending' | null> {
  const r = await fetch(`${c.base}/queue`, { headers: c.headers }); if (!r.ok) throw new Error(`ComfyUI GET /queue → ${r.status}`);
  const q = await r.json() as { queue_running?: any[]; queue_pending?: any[] };
  const has = (xs?: any[]) => (xs ?? []).some((e) => Array.isArray(e) ? e[1] === id : e?.prompt_id === id);
  return has(q.queue_running) ? 'running' : has(q.queue_pending) ? 'pending' : null;
}
/**
 * Download a finished prompt's outputs and store them like a normal result (job.outputs, resultUrl; photos flattened opaque).
 * Returns an error sentence when an expected output is missing (the job is left as it was), else null. Does not change job.status.
 */
export async function storeOutputs(job: Job, c: ComfyNative, h: any): Promise<string | null> {
  const cp = job.comfyPrompt!; const outs = outputsOf(h); const stored: Job['outputs'] = [];
  const imageBatches = imageJob(job);
  for (const [i, node] of cp.outputs.entries()) {
    const f = outs[node]?.[0]; if (!f) return `ComfyUI finished, but returned no output on node ${node}.`;
    for (const item of nativeOutputItems(outs[node], imageBatches, cp.labels[i] ?? 'Result')) {
      if (imageBatches && (job.status as string) === 'canceled') return null;
      const raw = path.join(DATA_DIR, `${job.id}-p${cp.pass}-${node}${item.suffix}${path.extname(item.output.filename) || '.png'}`); await c.download(item.output, raw);
      const dest = path.join(DATA_DIR, `${job.id}-out${stored.length}${path.extname(item.output.filename) || '.png'}`);
      if (isOpaqueImage(job, dest)) await flattenAlpha(raw, dest); else await copyFile(raw, dest);
      stored.push({ label: job.input.draft ? `${item.label} (draft 480p)` : item.label, url: `/files/${path.basename(dest)}` });
    }
  }
  if (imageBatches && (job.status as string) === 'canceled') return null;
  job.outputs = stored; job.resultUrl = stored[0]?.url ?? null; return null;
}

/** Poll until the prompt finishes (or is gone). Resolves with the job finished (done or failed); never throws. */
export async function resumeNative(job: Job, o: { sleep?: (ms: number) => Promise<void> } = {}): Promise<void> {
  const cp = job.comfyPrompt!; const sleep = o.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const c = comfyFor(cp.base);
  job.stage = 'reconnecting'; job.progressKind = 'indeterminate'; job.steps = null; job.updatedAt = Date.now();
  let runningSince: number | null = null; let unreachableSince: number | null = null;
  const capMs = config.comfyHardCapOverrideMs ?? cp.capMs ?? config.comfyHardCapFloorMs;
  const fail = (msg: string, type = 'temporary', keepWatching = false) => { job.status = 'failed'; job.stage = 'failed'; job.errorType = type; job.error = msg; job.eta = 0;
    if (keepWatching) job.lateWatch = { since: Date.now(), until: Date.now() + LATE_WATCH_MS(), why: 'restart' }; else job.comfyPrompt = null; };
  for (;;) {
    if ((job.status as string) === 'canceled') { await c.cancelPrompt(cp.id); return; }
    try {
      const h = await c.history(cp.id); unreachableSince = null;
      if (h?.status?.status_str === 'error') return fail(`ComfyUI run failed: ${JSON.stringify(h.status.messages ?? '').slice(0, 400)}`);
      if (finishedOk(h)) {
        job.stage = 'downloading'; const err = await storeOutputs(job, c, h); if (imageJob(job) && (job.status as string) === 'canceled') return; if (err) return fail(err);
        job.status = 'done'; job.stage = 'done'; job.progress = 100; job.eta = 0; job.comfyPrompt = null;
        job.warnings = [...(job.warnings ?? []), 'The server restarted during this run; the result was collected from ComfyUI afterwards.']; return;
      }
      const q = await inQueue(c, cp.id);
      if (!q && !h) return fail('The server restarted while this was in progress, and ComfyUI no longer has this job (it may have restarted too); try again.');
      job.stage = q === 'pending' ? 'queued on ComfyUI' : 'reconnecting'; if (q === 'running') { runningSince ??= Date.now(); job.renderStartedAt ??= runningSince; } // the cap counts running time only, never ComfyUI's queue
    } catch (e) {
      unreachableSince ??= Date.now();
      if (Date.now() - unreachableSince > UNREACHABLE_MS) return fail(`The server restarted while this was in progress, and ComfyUI (${cp.base}) can't be reached to collect the result; try again.`, 'provider_outage', true);
    }
    if (runningSince != null && Date.now() - runningSince > capMs) { // past the hard cap: stop OUR prompt (never anyone else's); if it wasn't stopped, keep watching
      const out = await c.cancelPrompt(cp.id); const mins = Math.max(1, Math.round(capMs / 60_000));
      console.warn(`[openhiggsfield] reconnected ComfyUI prompt ${cp.id} ran longer than ${mins} min: ${out}`);
      job.reasonCode = 'local_too_long'; return fail(`Took longer than ${mins} min.`, 'timeout', out === 'not_in_queue' || out === 'unreachable');
    }
    await sleep(POLL_MS);
  }
}
