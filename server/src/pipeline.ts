import type { Job, Stage } from './jobs.js';
import { config } from './config.js';
import { checkComfyReady, runComfySwap } from './comfyClient.js';

const STAGES: Stage[] = ['uploading', 'tracking', 'swapping', 'rendering', 'muxing'];
const TOTAL_MS = 8000;
const TICK = 250;

/** MOCK pipeline: advances stages over ~8s, returns the original video as the result. */
export function runMock(job: Job, reason?: string): Promise<void> {
  return new Promise((resolve) => {
  if (reason) {
    console.warn(`[openhiggsfield] using mock pipeline — ${reason}`);
  } else {
    console.info('[openhiggsfield] using mock pipeline');
  }
  const start = Date.now();
  job.status = 'running';
  job.queuePos = 0;
  const t = setInterval(() => {
    if (job.status !== 'running') { clearInterval(t); return resolve(); }
    const p = Math.min(1, (Date.now() - start) / TOTAL_MS);
    job.progress = Math.round(p * 100);
    job.stage = STAGES[Math.min(STAGES.length - 1, Math.floor(p * STAGES.length))];
    job.eta = Math.max(0, Math.ceil((TOTAL_MS - (Date.now() - start)) / 1000));
    if (p >= 1) {
      clearInterval(t);
      job.stage = 'done';
      job.status = 'done';
      job.resultUrl = job.input.videoUrl;
      resolve();
    }
  }, TICK);
  });
}

async function runComfy(job: Job) {
  job.status = 'running';
  job.queuePos = 0;
  job.stage = 'uploading';
  job.progress = 1;
  job.eta = 120;

  try {
    const { resultUrl } = await runComfySwap(job, ({ stage, progress, eta, requestId }) => {
      if (job.status === 'canceled') return;
      if (requestId && !(job.requestIds ??= []).includes(requestId)) { job.requestIds.push(requestId); console.info(`[openhiggsfield] job ${job.id} provider request ${requestId}`); }
      job.stage = stage;
      job.progress = progress;
      if (eta != null) job.eta = eta;
    });
    if ((job.status as string) === 'canceled') return;
    job.stage = 'done';
    job.status = 'done';
    job.progress = 100;
    job.eta = 0;
    job.resultUrl = resultUrl;
    console.info(`[openhiggsfield] comfy job ${job.id} done → ${resultUrl}`);
  } catch (err) {
    if ((job.status as string) === 'canceled') return;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[openhiggsfield] comfy pipeline failed for ${job.id}: ${msg}`);
    // setups-routing (2026-10-29): a real run never turns into a sample; it fails and says so
    failReal(job, 'The run stopped before it finished.');
  }
}
/** A real (comfy backend) job that can't run: failed, with a plain reason. Never a sample result in its place. */
function failReal(job: Job, error: string) {
  job.status = 'failed'; job.eta = 0; job.error = error; job.errorType = job.errorType ?? 'provider';
}

/**
 * Start the configured backend. Never throws out of this function. Mock backend (development and tests) → a sample run; comfy backend →
 * a real run, and a misconfig / missing key / unreachable host fails the job with the reason (no sample fallback since 2026-10-29).
 */
export async function startJob(job: Job): Promise<void> {
  if (config.backend !== 'comfy') {
    return runMock(job);
  }

  const { nativeMode, runNativeSafe } = await import('./comfy/runNative.js');
  if (nativeMode()) return runNativeSafe(job); // local / stub ComfyUI: native /prompt API, real progress, no mock fallback
  const ready = checkComfyReady();
  if (!ready.ok) {
    console.warn(`[openhiggsfield] comfy backend requested but not ready: ${ready.reason}`);
    return failReal(job, ready.reason);
  }

  console.info(
    `[openhiggsfield] comfy backend — workflow=${config.workflowPath}` +
      (config.comfyBaseUrl ? ` base=${config.comfyBaseUrl}` : ' base=cloud.comfy.org(default)'),
  );
  return runComfy(job);
}
