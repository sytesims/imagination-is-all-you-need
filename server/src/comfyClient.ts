import path from 'node:path';
import { existsSync } from 'node:fs';
import { config, comfyNeedsKey, workflowLooksLikeStub } from './config.js';
import type { Job } from './jobs.js';
import { remuxAudio } from './ffmpeg.js';
import { localReachable } from './hardware.js';
import { prepareObjectSwap, prepareH3Swap } from './comfy/objectSwap.js';
import { fillPattern, captionSubject } from './shared/promptPatterns.js';

export type ComfyReady =
  | { ok: true }
  /** P2 3c: reason = plain words (no env-var names or host paths; shown on the Self-host page); code = stable id; detail = technical text for logs only. */
  | { ok: false; reason: string; code: 'backend_not_comfy' | 'comfy_key_missing' | 'local_unreachable' | 'workflow_missing' | 'workflow_stub'; detail: string };

/** `probeLocal`: for a local ComfyUI address also report whether it answers (Health, Self-host panel). It reads the cached reachability check
 *  (refreshed in the background at most every 5 s, 1.5 s timeout), so it never blocks the request; the very first call is optimistic. Job start leaves it off. */
export function checkComfyReady(opts: { probeLocal?: boolean } = {}): ComfyReady {
  if (config.backend !== 'comfy') {
    return { ok: false, code: 'backend_not_comfy', reason: 'The server runs in preview mode, not with ComfyUI.', detail: 'OPENHIGGSFIELD_BACKEND is not comfy' };
  }
  if (comfyNeedsKey() && !config.comfyApiKey) {
    return {
      ok: false, code: 'comfy_key_missing',
      reason: 'No Comfy API key is set. Comfy Cloud needs one; a ComfyUI on your own computer or a local proxy does not.',
      detail: 'COMFY_API_KEY missing (required for Comfy Cloud / *.run.comfy.app). Set COMFY_BASE_URL to a local comfy-api-proxy to run without a key.',
    };
  }
  if (opts.probeLocal && config.comfyBaseUrl && !localReachable(5000)) {
    return { ok: false, code: 'local_unreachable', reason: "ComfyUI isn’t running on your computer. Start it, or check the address in Settings → Your computer.", detail: 'COMFY_BASE_URL does not answer /system_stats' };
  }
  if (!existsSync(config.workflowPath)) {
    return { ok: false, code: 'workflow_missing', reason: 'A workflow file is missing from this install.', detail: `workflow not found: ${config.workflowPath}` };
  }
  if (workflowLooksLikeStub(config.workflowPath)) {
    return {
      ok: false, code: 'workflow_stub', reason: 'A workflow file in this install is still a placeholder.',
      detail: `workflow is still the stub at ${config.workflowPath} — export API JSON from the Wan2.2 Animate Hub template (see workflows/README.md) and overwrite it`,
    };
  }
  return { ok: true };
}

/** Prompt text for the Wan 2.2 Animate graph: a caption of the result (shared/promptPatterns.ts), never "replace X with the reference". The target picks
 *  who is masked; on motion transfer it is the user's extra words. */
export function buildPrompt(job: Job): string {
  const target = job.input.target?.trim();
  if (job.input.mode === 'motion_transfer') { const base = fillPattern('motion-transfer', 'wan-2.2-animate-14b'); return target ? `${base} ${target}` : base; }
  return fillPattern('video-swap', 'wan-2.2-animate-14b', { subject: captionSubject(target) }); // object_swap / Mix
}

/**
 * Run Object Swap on Comfy API v2 via @comfyorg/sdk.
 * Writes the remuxed result next to other job files and returns its public URL path.
 */
export async function runComfySwap(
  job: Job,
  onProgress: (p: { stage: Job['stage']; progress: number; eta?: number; /** Provider request/prompt id, logged for support details [R41]. */ requestId?: string }) => void,
): Promise<{ resultFile: string; resultUrl: string }> {
  const { Comfy } = await import('@comfyorg/sdk');

  const clientOpts: { apiKey?: string; clientInfo?: string } = {
    clientInfo: 'openhiggsfield/0.1',
  };
  if (config.comfyApiKey) clientOpts.apiKey = config.comfyApiKey;
  // COMFY_BASE_URL is read by the SDK from the environment.

  onProgress({ stage: 'uploading', progress: 5 });
  const client = new Comfy(clientOpts);
  let wf;
  if ((job.toolId === 'object-swap' || job.toolId === 'motion-transfer') && job.provider === 'comfy-h3-charswap') { // Motion Transfer reuses the swap graph with h3MotionPrompt()
    // Backup route: H3 Character Swap LoRA v1.5 graph (24 fps, source audio as conditioning)
    wf = client.workflows.fromJson(await prepareH3Swap(job, (p) => client.assets.fromFile(p)) as any);
  } else if (job.toolId === 'object-swap') {
    // 16 fps source, ext-N variant by length, click point → SAM2 node 229, size multiple of 16 (comfy/objectSwap.ts)
    const prep = await prepareObjectSwap(job, buildPrompt(job), (p) => client.assets.fromFile(p));
    job.input.comfyPlan = prep.plan;
    wf = client.workflows.fromJson(prep.graph as any);
  } else {
    wf = await client.workflows.fromFile(config.workflowPath);
    wf.setInput(config.nodes.video.node, config.nodes.video.field, client.assets.fromFile(job.input.videoPath));
    wf.setInput(config.nodes.image.node, config.nodes.image.field, client.assets.fromFile(job.input.imagePath));
    wf.setInput(config.nodes.prompt.node, config.nodes.prompt.field, buildPrompt(job));
  }

  onProgress({ stage: 'tracking', progress: 15 });

  // No job metadata: Comfy Cloud rejects labels / job list today.
  const comfyJob = await client.submit(wf);

  // Live progress when available; poll is authoritative.
  const ac = new AbortController();
  const eventsTask = (async () => {
    try {
      for await (const ev of comfyJob.events(ac.signal)) {
        if (job.status === 'canceled') {
          await comfyJob.cancel().catch(() => undefined);
          break;
        }
        if (ev.kind === 'progress') {
          const pct = Math.min(90, 20 + Math.round((ev.value ?? 0) * 70));
          const stage: Job['stage'] =
            pct < 40 ? 'tracking' : pct < 70 ? 'swapping' : 'rendering';
          onProgress({ stage, progress: pct });
        } else if (ev.kind === 'statusChange' && (ev.status === 'succeeded' || ev.status === 'failed' || ev.status === 'canceled')) {
          break;
        }
      }
    } catch {
      // events() may fail on some surfaces; wait() below still completes the job
    }
  })();

  try {
    await comfyJob.wait(config.jobTimeoutMs, ac.signal);
  } finally {
    ac.abort();
    await eventsTask.catch(() => undefined);
  }

  if (job.status === 'canceled') {
    throw new Error('canceled');
  }
  if (comfyJob.status !== 'succeeded') {
    const detail = comfyJob.error ? JSON.stringify(comfyJob.error) : comfyJob.status;
    throw new Error(`Comfy job ${comfyJob.id} ended as ${detail}`);
  }

  onProgress({ stage: 'rendering', progress: 92 });

  const outs = comfyJob.getOutputs(config.nodes.output);
  const videoOut =
    outs.find((o) => o.type === 'video' || /\.(mp4|webm|mov)$/i.test(o.name)) ?? outs[0];
  if (!videoOut) {
    throw new Error(`no output on node ${config.nodes.output}`);
  }

  const rawPath = path.join(path.dirname(job.input.videoPath), `${job.id}-comfy-raw${path.extname(videoOut.name) || '.mp4'}`);
  await videoOut.toFile(rawPath);

  onProgress({ stage: 'muxing', progress: 96 });
  const finalName = `${job.id}-result.mp4`;
  const finalPath = path.join(path.dirname(job.input.videoPath), finalName);
  if (job.input.keepAudio === false) await remuxAudio(rawPath, rawPath, finalPath, false); // keepAudio=0: video only
  else await remuxAudio(rawPath, job.input.videoPath, finalPath);

  return { resultFile: finalName, resultUrl: `/files/${finalName}` };
}
