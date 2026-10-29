/**
 * Render (Direct a Shot step 3, 2026-10-24): what the sheet needs before anything runs. Read-only; nothing is queued or downloaded.
 *  GET /api/make-it-real/prep?planJob=<plan-a-shot job>&frames=&size=
 *   → { plan job, recording, plan (size, stage 1, frames, seconds), lengths and sizes this recording allows, the starting prompt,
 *       files [{file, role, folder, bytes, haveBytes, state ready | downloading | missing}] (hardware/requirements.ts: a file smaller than its
 *       known size is still downloading, never ready), ready, fit (verdict + reason for this computer), eta {low, high, text, source}, route }
 *  GET /api/make-it-real/frame0?planJob=<id> → the plan's first frame as a PNG at the recording size (what the first-frame painter starts from).
 *  madeRealOf(job): on a plan-a-shot job, the Render runs made from it (newest first), for the feed and the viewer.
 */
import type { FastifyInstance } from 'fastify';
import path from 'node:path';
import { readFile, unlink } from 'node:fs/promises';
import { DATA_DIR } from './config.js';
import { runFfmpeg } from './ffmpeg.js';
import { jobs, type Job } from './jobs.js';
import { config } from './config.js';
import { getTool } from './tools/registry.js';
import { requirementsFor, fitFor, modelsDir, modelFileBytes } from './hardware/requirements.js';
import { planJobOf, recordingOf } from './tools/makeItReal.js';
import { MAKE_REAL_TOOL, MAKE_REAL_PROVIDER, MAKE_REAL_FILES, MAKE_REAL_SIZES, MAKE_REAL_CLOUD_PLACE, MAKE_REAL_CLOUD_SIZES, MAKE_REAL_CLOUD_DEFAULT_SIZE, makeRealPlan, makeRealCloudPlan, cloudLengthsFor, makeRealPrompt, lengthsFor, makeRealEtaSeconds, makeRealCloudEtaSeconds, minutesText, secondsOf, aspectOf, LAYOUT_LORA_FILE, LAYOUT_LORA_IMPORTED, LAYOUT_LORA_URL, LAYOUT_LORA_REPO, LAYOUT_LORA_STEPS } from './shared/makeItReal.js';
import { PREVIZ_TOOL } from './shared/previzTemplates.js';
import { RENDER_MODELS, renderNeeds, renderLengths, renderDefaultLength, pickStyleOutput } from './shared/renderModels.js';
import { publicBase } from './tools/h3/cloud.js';
import { hasClipUpload } from './routing/renderUpload.js';
import { FIRST_FRAME_PAINTERS, firstFramePainter } from './shared/makeItReal.js';
import { routesFor } from './routing/routes.js';
import { option } from './routing/select.js';

export type FileState = 'ready' | 'downloading' | 'missing' | 'unknown';
/** Per-file state for the sheet. With no models folder known the files can't be checked ('unknown'). */
export function makeRealFiles(dir: string | null = modelsDir(), missing: { file: string; partial?: boolean; haveBytes?: number }[] | null = null) {
  return MAKE_REAL_FILES.map((f) => {
    const have = dir ? modelFileBytes(dir, f.folder, f.file) : null; const miss = missing?.find((m) => m.file === f.file);
    const state: FileState = !dir && !missing ? 'unknown' : miss ? (miss.partial || (have != null && have > 0) ? 'downloading' : 'missing') : have != null && have < f.bytes ? 'downloading' : 'ready';
    return { file: f.file, role: f.role, folder: f.folder, bytes: f.bytes, haveBytes: miss?.haveBytes ?? have, state };
  });
}
/** 2026-10-27: can FLUX 3 Klein paint the first frame here? Its local edit route is reachable and fits this computer, and every file it loads is on
 *  disk (checked in the models folder or the connected ComfyUI's lists; unknown = no). Read-only; nothing is queued or downloaded. */
export function flux3PainterReady(): boolean {
  const P = FIRST_FRAME_PAINTERS['comfy-flux3-klein']; const t = getTool(P.tool); const loc = t ? routesFor(P.provider, t).find((r) => r.kind === 'local') : null; if (!t || !loc) return false;
  const input = { mode: 'edit', types: ['edit'] }; if (!option(t, loc, input).available) return false; // ComfyUI unreachable, or too heavy here
  const req = requirementsFor(t, P.provider, input); return !!req && req.missingBytesSource === 'checked' && !(req.missingFiles ?? []).some((f) => !f.autoDownloaded);
}
export function madeRealOf(j: Job) {
  if (j.toolId !== PREVIZ_TOOL) return null;
  const out = [...jobs.values()].filter((r) => r.toolId === MAKE_REAL_TOOL && (r.input as any)?.makeReal?.planJobId === j.id).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  return out.map((r) => ({ id: r.id, status: r.status, progress: r.progress ?? 0, resultUrl: r.resultUrl ?? null, createdAt: r.createdAt ?? null, simulated: !!(r as any).simulated }));
}

export function registerMakeItReal(app: FastifyInstance) {
  app.get<{ Querystring: { planJob?: string } }>('/api/make-it-real/frame0', async (req, reply) => {
    const pj = planJobOf(req.query.planJob); if ('error' in pj) return reply.code(404).send({ error: pj.error, errorType: 'validation', code: 'plan_not_found' });
    const src = path.join(DATA_DIR, pj.videoUrl.slice('/files/'.length)); const out = path.join(DATA_DIR, `mir-f0-${pj.job.id}-${Date.now().toString(36)}.png`);
    if ((await runFfmpeg(['-y', '-v', 'error', '-i', src, '-frames:v', '1', '-update', '1', out])) !== 0) return reply.code(500).send({ error: 'The first frame could not be read.', errorType: 'temporary' });
    const buf = await readFile(out); await unlink(out).catch(() => undefined);
    return reply.header('content-type', 'image/png').header('cache-control', 'no-store').send(buf);
  });
  app.get<{ Querystring: { planJob?: string; frames?: string; size?: string } }>('/api/make-it-real/prep', async (req, reply) => {
    const pj = planJobOf(req.query.planJob); if ('error' in pj) return reply.code(404).send({ error: pj.error, errorType: 'validation', code: 'plan_not_found' });
    const tool = getTool(MAKE_REAL_TOOL)!; const rec = recordingOf(pj.job); const plan = makeRealPlan(rec, { frames: req.query.frames, size: req.query.size });
    const input = { types: ['make-it-real'], mode: 'make-it-real', duration: plan.seconds, resolution: `${Math.min(plan.width, plan.height)}p` };
    const reqs = requirementsFor(tool, MAKE_REAL_PROVIDER, input); const fit = fitFor(tool, MAKE_REAL_PROVIDER, input, undefined, reqs);
    const files = makeRealFiles(reqs?.modelsDirSet ? modelsDir() : null, reqs?.missingBytesSource === 'checked' ? reqs.missingFiles : null);
    const est = makeRealEtaSeconds(plan); const er = fit.etaRange; const learned = er?.source === "learned" && er.seconds ? { low: er.low ?? er.seconds, high: er.high ?? er.seconds } : null;
    const range = learned ?? est; const pv = (pj.job.input as any)?.previz ?? null;
    return {
      planJob: { id: pj.job.id, videoUrl: pj.videoUrl, label: pj.job.outputs?.[0]?.label ?? 'Preview', presetName: pv?.presetName ?? null, imported: pv?.scene === 'imported' },
      recording: rec, plan, prompt: makeRealPrompt(pv), /* the mockup has a person you played (Play the actor): the sheet offers a "Who is it?" picture */ person: !!pv?.action,
      lengths: lengthsFor(rec.seconds).map((f) => ({ frames: f, seconds: secondsOf(f) })),
      sizes: (Object.keys(MAKE_REAL_SIZES) as (keyof typeof MAKE_REAL_SIZES)[]).map((k) => ({ id: k, label: MAKE_REAL_SIZES[k].label, note: MAKE_REAL_SIZES[k].note, width: MAKE_REAL_SIZES[k].dims[plan.aspect][0], height: MAKE_REAL_SIZES[k].dims[plan.aspect][1] })),
      files, ready: files.every((f) => f.state === 'ready'), modelsDirSet: !!reqs?.modelsDirSet, missingBytes: reqs?.missingBytesSource === 'checked' ? reqs.missingBytes : null, downloadId: reqs?.downloadId ?? MAKE_REAL_PROVIDER,
      fit: { verdict: fit.verdict, reasonCode: fit.reasonCode, reason: fit.reason, recommendedVramGB: fit.recommendedVramGB },
      eta: { ...range, text: minutesText(range), source: learned ? 'learned' : 'estimate' },
      route: `local:${MAKE_REAL_PROVIDER}`, backend: config.backend, free: true,
      /* the first-frame painter with no "Who is it?" picture (shared/makeItReal.ts FIRST_FRAME_PAINTERS): FLUX 3 Klein when it can run here, else FLUX.2 [klein] 4B */
      painter: firstFramePainter({ flux3Ready: flux3PainterReady() }),
      /* the Comfy Cloud place of the same model (comfy/ltx25LayoutCloud.ts): whole-second lengths, Draft / Sharper / 720p, the LoRA to import */
      cloud: (() => { const cp = makeRealCloudPlan(rec); const aspect = aspectOf(rec.width, rec.height); return { route: MAKE_REAL_CLOUD_PLACE, lengths: cloudLengthsFor(rec.seconds), defaultLength: cp?.seconds ?? null, defaultSize: MAKE_REAL_CLOUD_DEFAULT_SIZE,
        sizes: (Object.keys(MAKE_REAL_CLOUD_SIZES) as (keyof typeof MAKE_REAL_CLOUD_SIZES)[]).map((k) => ({ id: k, label: MAKE_REAL_CLOUD_SIZES[k].label, note: MAKE_REAL_CLOUD_SIZES[k].note, tier: MAKE_REAL_CLOUD_SIZES[k].tier, width: MAKE_REAL_CLOUD_SIZES[k].dims[aspect][0], height: MAKE_REAL_CLOUD_SIZES[k].dims[aspect][1] })),
        eta: cp ? makeRealCloudEtaSeconds(cp) : null, lora: { file: LAYOUT_LORA_FILE, importAs: LAYOUT_LORA_IMPORTED, url: LAYOUT_LORA_URL, repo: LAYOUT_LORA_REPO, steps: LAYOUT_LORA_STEPS } }; })(),
      /* the Render picker (shared/renderModels.ts): per model, why it can't run yet, the whole-second lengths this mockup gives and the recording it sends */
      outputs: (pj.job.outputs ?? []).map((o) => ({ label: o.label ?? null, url: o.url })),
      models: RENDER_MODELS.map((m) => { const pick = pickStyleOutput((pj.job.outputs ?? []) as { label?: string; url: string }[], m.style);
        return { id: m.id, needs: renderNeeds(m.id, { publicBase: !!publicBase(), upload: hasClipUpload() }), lengths: renderLengths(m.id, rec.seconds), defaultLength: renderDefaultLength(m.id, rec.seconds),
          clip: pick.out ? { url: pick.out.url, label: pick.out.label ?? null, style: pick.style, matched: pick.matched, note: pick.note } : null }; }),
    };
  });
}
