/**
 * "Render" (Direct a Shot step 3; tool id make-it-real, 2026-10-24): a Direct a Shot mockup becomes real video, locally and free, on LTX-2.5 22B
 * (distilled, GGUF Q4_K_M) + Lightricks' Layout to Render IC-LoRA. Hidden tool `make-it-real`, opened from a recording (3D feed card, the
 * player's step bar, the result viewer). Rules and sizes: shared/makeItReal.ts. Graph and plan: comfy/makeItReal.ts.
 *
 *  - parseInput: finds the plan job (planJob = a finished plan-a-shot job), conforms its first video (outputs[0], Clay or Simple) with ffmpeg
 *    to 24 fps, the draft size (cover + centre crop) and exactly 8k + 1 frames, and fits the optional first-frame picture (an upload, or
 *    firstFrameJob + firstFrameOut = an image result) to the same size. The job keeps `makeReal` (the plan's id and video, the plan, the
 *    prompt) and parentId = the plan job, so the feed and the viewer can show Mockup vs Render (a Take).
 *  - run: the comfy backend runs the native plan (providers.ts runWithProvider → comfy/plans.ts). The mock backend makes a clearly labelled
 *    sample: the conformed plan clip with a colour grade, so the Mockup vs Render view can be tried without a model. Nothing reaches a provider.
 */
import path from 'node:path';
import { stat } from 'node:fs/promises';
import type { ToolDef } from './types.js';
import type { Job } from '../jobs.js';
import { jobs } from '../jobs.js';
import { DATA_DIR } from '../config.js';
import { runFfmpeg } from '../ffmpeg.js';
import { registerProvider } from '../providers.js';
import { registerLicense, registerWorkflowLicense, registerLicenseComponents } from '../licenses.js';
import { mockRun } from './shared.js';
import { threeDRoute } from '../shared/threeD.js';
import { PREVIZ_TOOL } from '../shared/previzTemplates.js';
import { MAKE_REAL_TOOL, MAKE_REAL_PROVIDER, MAKE_REAL_WORKFLOW, MAKE_REAL_SEED, MAKE_REAL_LENGTHS, MAKE_REAL_CLOUD_PLACE, MAKE_REAL_CLOUD_SIZES, makeRealPlan, makeRealCloudPlan, cloudLengthsFor, makeRealPrompt, PROMPT_AVOID, stripAvoidWords, aspectOf, type MakeRealPlan } from '../shared/makeItReal.js';
import { conformArgs, firstFrameArgs } from '../comfy/makeItReal.js';
import { RENDER_PROVIDERS, renderModelOf, renderLengths, renderDefaultLength, renderBillSeconds, renderQualityOf, renderPrompt, pickStyleOutput, isCloudRender, RENDER_STYLE_LABEL, type RenderModel } from '../shared/renderModels.js';

registerLicense({ id: 'ltx-2x-community', name: 'LTX-2.x Community License', osi: false, url: 'https://github.com/Lightricks/LTX-2/blob/main/LICENSE-2_x',
  terms: ['Covers LTX-2.5 and its LoRAs, including Layout to Render (the licence text is also inside the LoRA file).', 'Read the full terms before commercial use.'] } as any);
registerWorkflowLicense(MAKE_REAL_WORKFLOW, ['ltx-2x-community', 'apache-2.0']);
registerLicenseComponents(MAKE_REAL_TOOL, [
  { model: 'LTX-2.5 22B distilled (Lightricks; GGUF Q4_K_M repack by Unsloth, unsloth/LTX-2.5-GGUF)', license: 'LTX-2.x Community License', commercial: 'restricted', url: 'https://github.com/Lightricks/LTX-2/blob/main/LICENSE-2_x', licenseId: 'ltx-2x-community' },
  { model: 'Layout to Render IC-LoRA 1.0 (Lightricks/LTX-2.5-22b-IC-LoRA-Layout-To-Render)', license: 'LTX-2.x Community License', commercial: 'restricted', url: 'https://huggingface.co/Lightricks/LTX-2.5-22b-IC-LoRA-Layout-To-Render', licenseId: 'ltx-2x-community' },
  { model: 'Gemma 4 12B text encoder with LTX projection, VAEs, x2 latent upscaler (Lightricks/LTX-2.5)', license: 'LTX-2.x Community License', commercial: 'restricted', url: 'https://huggingface.co/Lightricks/LTX-2.5', licenseId: 'ltx-2x-community' },
  { model: 'ComfyUI-GGUF custom nodes (city96)', license: 'Apache-2.0', commercial: 'yes', url: 'https://github.com/city96/ComfyUI-GGUF', licenseId: 'apache-2.0' },
] as any);
registerProvider({ id: MAKE_REAL_PROVIDER, name: 'LTX-2.5 + Layout to Render', kind: 'open-weights', via: `local ComfyUI, workflows/${MAKE_REAL_WORKFLOW} (mock unless OPENHIGGSFIELD_BACKEND=comfy)`,
  workflows: [MAKE_REAL_WORKFLOW], docUrl: 'https://huggingface.co/Lightricks/LTX-2.5-22b-IC-LoRA-Layout-To-Render',
  nodes: ['UnetLoaderGGUF', 'LoraLoaderModelOnly', 'GetICLoRAParameters', 'LTXVAddGuide', 'LTXVCropGuides', 'LTXVLatentUpsampler', 'LTXVImgToVideoInplace', 'SamplerCustomAdvanced'], licenseParts: ['ltx-2x-community', 'apache-2.0'] });

const bad = (field: string, message: string, code = 'invalid') => ({ error: message, code, issues: [{ code, field, message }] }) as any;
const fileOf = (url: unknown) => (typeof url === 'string' && url.startsWith('/files/') ? path.join(DATA_DIR, url.slice('/files/'.length).split('?')[0]) : null);
const exists = async (p: string | null) => !!p && !!(await stat(p).catch(() => null))?.isFile();

/** The plan job a request points at, with its first video, or why it can't be used. */
export function planJobOf(id: string | undefined): { job: Job; videoUrl: string } | { error: string } {
  const j = id ? jobs.get(id) : undefined;
  if (!j || j.toolId !== PREVIZ_TOOL) return { error: 'Pick a Direct a Shot mockup to render.' };
  if (j.status !== 'done') return { error: 'That mockup isn’t finished yet.' };
  const videoUrl = j.outputs?.[0]?.url ?? j.resultUrl; if (!videoUrl || !/\.mp4(\?|$)/i.test(videoUrl)) return { error: 'That mockup has no video.' };
  return { job: j, videoUrl };
}
/** The plan's recording size and length (from input.previz, which the plan-a-shot tool always writes). */
export const recordingOf = (j: Job) => { const pv = (j.input as any)?.previz ?? {}; return { width: Number(pv.width) || 1280, height: Number(pv.height) || 720, seconds: Number(pv.shot?.seconds) || (Number(pv.frames) / Number(pv.fps)) || 3 }; };

export const makeItRealTool: ToolDef = {
  id: MAKE_REAL_TOOL, name: 'Render', category: '3D', status: 'new', route: threeDRoute('plan-a-shot'), ui: 'three-d', listed: false,
  description: 'Turn your mockup into real video. The camera move and where things stand stay as you staged them. Free on your computer, or in the cloud.',
  inputs: [{ name: 'planJob', kind: 'text', required: true }, { name: 'prompt', kind: 'text', required: true }, { name: 'frames', kind: 'select', options: MAKE_REAL_LENGTHS.map(String) }, { name: 'size', kind: 'select', options: ['standard', 'quick', 'hd'] },
    /* Comfy Cloud place: size quick | standard | hd (720p), length = whole seconds */
    { name: 'firstFrame', kind: 'file', accept: 'image/png,image/jpeg,image/webp', label: 'First frame (the art-directed look still)' }, { name: 'firstFrameJob', kind: 'text' }, { name: 'firstFrameOut', kind: 'number' }, { name: 'seed', kind: 'number' },
    /* cloud models (shared/renderModels.ts): whole seconds of the mockup, the model's quality */ { name: 'length', kind: 'number' }, { name: 'resolution', kind: 'select', options: ['360p', '448p' /* Comfy Cloud place: Draft */, '480p', '540p', '576p' /* Sharper */, '720p', '1080p', 'source'] }],
  presets: [{ id: 'make-it-real', label: 'Render', prompt: '', group: 'Mode' }],
  app: { kind: 'video', providerModes: Object.fromEntries(RENDER_PROVIDERS.map((p) => [p, ['make-it-real']])) },
  workflows: [MAKE_REAL_WORKFLOW], model: 'LTX-2.5 22B distilled (GGUF Q4_K_M) + Layout to Render IC-LoRA', gpuSecPerSec: { source: 0 }, providers: RENDER_PROVIDERS /* local LTX first (the default), then the cloud edit models */,
  stages: [['uploading', 'Getting your scene ready'], ['encoding', 'Reading the prompt'], ['rendering', 'Rendering (two stages)'], ['saving', 'Saving the video']],
  routeInput: () => ({ types: ['make-it-real'], mode: 'make-it-real' }),
  async parseInput(fields, files) {
    const pj = planJobOf(fields.planJob); if ('error' in pj) return bad('planJob', pj.error, 'required');
    const cloud = renderModelOf(fields.provider); if (cloud && isCloudRender(cloud.id)) return parseCloud(cloud, pj.job, fields, files);
    if (fields.route === MAKE_REAL_CLOUD_PLACE) return parseLayoutCloud(pj.job, pj.videoUrl, fields, files); // LTX-2.5 + Layout to Render on Comfy Cloud
    const src = fileOf(pj.videoUrl); if (!(await exists(src))) return bad('planJob', 'That recording’s video file is missing. Record the shot again.', 'missing');
    const prompt = String(fields.prompt ?? '').trim().replace(/\s+/g, ' ');
    if (!prompt) return bad('prompt', 'Describe the finished shot in a sentence or two.', 'required');
    if (prompt.length > 1500) return bad('prompt', 'Keep the prompt under 1,500 characters: one or two sentences work best.');
    const plan: MakeRealPlan = makeRealPlan(recordingOf(pj.job), { frames: fields.frames, size: fields.size });
    if (fields.frames && Number(fields.frames) !== plan.frames) return bad('frames', `This recording gives up to ${plan.frames} frames at 24 fps; pick a shorter draft.`);
    const seedIn = Number(fields.seed); const seed = Number.isInteger(seedIn) && seedIn >= 0 && seedIn < 2 ** 31 ? seedIn : MAKE_REAL_SEED;
    // first frame: an upload, or an image result (firstFrameJob + firstFrameOut)
    let ffSrc: string | null = files.firstFrame?.[0] ? path.join(DATA_DIR, files.firstFrame[0]) : null; let ffFrom: string | null = null;
    if (!ffSrc && fields.firstFrameJob) { const fj = jobs.get(fields.firstFrameJob); const o = fj?.outputs?.[Number(fields.firstFrameOut) || 0]; const p = fileOf(o?.url);
      if (!fj || fj.status !== 'done' || !p || !/\.(png|jpe?g|webp)$/i.test(p)) return bad('firstFrameJob', 'That first frame isn’t a finished image.'); ffSrc = p; ffFrom = fj.id; }
    if (!ffSrc) return bad('firstFrame', 'Add a first frame: the plan’s first frame painted into the finished look (Lightricks’ Layout to Render needs it).', 'required');
    const id = `mir-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const layoutPath = path.join(DATA_DIR, `${id}-layout.mp4`);
    if ((await runFfmpeg(conformArgs(src!, layoutPath, plan))) !== 0) return bad('planJob', 'That recording could not be prepared for the model. Record the shot again.', 'format');
    const firstFramePath = path.join(DATA_DIR, `${id}-first.png`);
    if ((await runFfmpeg(firstFrameArgs(ffSrc, firstFramePath, plan))) !== 0) return bad('firstFrame', 'That picture could not be read. Use a PNG, JPG or WebP.', 'format');
    const pv = (pj.job.input as any)?.previz ?? {};
    const warnings: string[] = [];
    const clean = stripAvoidWords(prompt); const hit = prompt.match(new RegExp(PROMPT_AVOID.source, "gi"));
    if (hit) warnings.push(`Left out of the prompt: ${[...new Set(hit.map((w) => `“${w}”`))].join(", ")}. Lightricks: words like clay or 3D make the model copy the rough shapes.`);
    if (!clean) return bad("prompt", "Describe the finished look (not the clay or 3D plan).");
    return { types: ['make-it-real'], mode: 'make-it-real', outKind: "video", prompt, finalPrompt: clean, seed, duration: plan.seconds, resolution: `${Math.min(plan.width, plan.height)}p`, aspect: plan.aspect, width: plan.width, height: plan.height, fps: plan.fps,
      outputLabel: 'Render', warnings, layoutPath, firstFramePath, /* no keepAudio:false: runNative reads it as "strip the audio", which dropped LTX's own soundtrack (2026-10-25) */
      makeReal: { planJobId: pj.job.id, planUrl: pj.videoUrl, planLabel: pj.job.outputs?.[0]?.label ?? 'Mockup', presetName: pv.presetName ?? null, plan, prompt: clean, firstFrame: true, firstFrameJob: ffFrom, layoutUrl: `/files/${path.basename(layoutPath)}`,
        firstFrameUrl: `/files/${path.basename(firstFramePath)}` } };
  },
  async run(job) {
    // Mock backend (or a comfy backend without a native plan): a labelled sample from the conformed plan clip. Never pretends a model ran.
    await mockRun(job, makeItRealTool.stages, ['Render (sample)'], 6000);
    if (job.status !== 'done' || !job.outputs?.[0]) return;
    const out = path.join(DATA_DIR, job.outputs[0].url.slice('/files/'.length)); const i = job.input;
    const grade = 'eq=contrast=1.12:saturation=1.9:brightness=0.02,colorbalance=rs=0.10:gs=0.03:bs=-0.10:rh=0.06:bh=-0.06,vignette=PI/5';
    const code = await runFfmpeg(['-y', '-v', 'error', '-i', i.layoutPath, '-vf', `${grade},format=yuv420p`, '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-movflags', '+faststart', out]);
    if (code !== 0) { job.status = 'failed'; job.errorType = 'temporary'; job.error = 'The sample could not be made. Nothing was charged.'; }
    job.outputs[0] = { ...job.outputs[0], width: i.width, height: i.height } as any;
  },
};
(makeItRealTool as any).media = '3d';

/** A first frame from the form: an upload, or an image result (firstFrameJob + firstFrameOut). */
function firstFrameSource(fields: Record<string, string>, files: Record<string, string[]>): { path: string | null; from: string | null } | { error: any } {
  if (files.firstFrame?.[0]) return { path: path.join(DATA_DIR, files.firstFrame[0]), from: null };
  if (!fields.firstFrameJob) return { path: null, from: null };
  const fj = jobs.get(fields.firstFrameJob); const o = fj?.outputs?.[Number(fields.firstFrameOut) || 0]; const p = fileOf(o?.url);
  if (!fj || fj.status !== 'done' || !p || !/\.(png|jpe?g|webp)$/i.test(p)) return { error: bad('firstFrameJob', 'That first frame isn’t a finished image.') };
  return { path: p, from: fj.id };
}
/** Clip size for a cloud model: the recording's size (even sides), scaled up so the short side reaches the model's minimum (Kling: 720 px) and down
 *  to its maximum. Direct a Shot records 1280×720 / 720×1280 / 960×960, which every row takes as is. */
export function cloudClipSize(m: Pick<RenderModel, 'clip'>, w: number, h: number): { width: number; height: number } {
  let k = 1; const lo = Math.min(w, h), hi = Math.max(w, h);
  if (m.clip.minSide && lo * k < m.clip.minSide) k = m.clip.minSide / lo; if (m.clip.maxSide && hi * k > m.clip.maxSide) k = m.clip.maxSide / hi;
  const ev = (n: number) => Math.max(2, Math.round((n * k) / 2) * 2); return { width: ev(w), height: ev(h) };
}
/** ffmpeg arguments: the first `seconds` of the recording at 24 fps, scaled (cover + centre crop) to width×height, no audio. */
export const cloudClipArgs = (src: string, out: string, o: { width: number; height: number; seconds: number }) => ['-y', '-v', 'error', '-i', src, '-t', String(o.seconds),
  '-vf', `fps=24,scale=${o.width}:${o.height}:force_original_aspect_ratio=increase:flags=lanczos,crop=${o.width}:${o.height},setsar=1`, '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', '24', '-movflags', '+faststart', out];
/** Render on a cloud edit model (shared/renderModels.ts): the mockup in the model's Preview style, cut to the picked whole seconds at 24 fps, the optional
 *  first frame fitted to the same size, the model's prompt template. duration = the seconds the provider bills (quote = charge); routerModels.ts renderBody. */
async function parseCloud(m: RenderModel, plan: Job, fields: Record<string, string>, files: Record<string, string[]>) {
  const rec = recordingOf(plan); const pick = pickStyleOutput((plan.outputs ?? []) as { label?: string; url: string }[], m.style);
  if (!pick.out) return bad('planJob', 'That mockup has no video.', 'missing');
  const src = fileOf(pick.out.url); if (!(await exists(src))) return bad('planJob', 'That recording’s video file is missing. Record the shot again.', 'missing');
  const prompt = String(fields.prompt ?? '').trim().replace(/\s+/g, ' ');
  if (!prompt) return bad('prompt', 'Describe the finished shot in a sentence or two.', 'required');
  if (!stripAvoidWords(prompt)) return bad('prompt', 'Describe the finished look (not the clay or 3D plan).');
  const lengths = renderLengths(m.id, rec.seconds); if (!lengths.length) return bad('length', `${m.name} needs at least ${m.clip.minSec} s; this mockup is ${rec.seconds} s.`);
  const want = fields.length != null && fields.length !== '' ? Number(fields.length) : renderDefaultLength(m.id, rec.seconds)!;
  if (!lengths.includes(want)) return bad('length', `${m.name} can render ${lengths[0]}–${lengths[lengths.length - 1]} s of this mockup (whole seconds).`);
  if (fields.resolution && m.qualities.length && !m.qualities.some((q) => q.id === fields.resolution)) return bad('resolution', `${m.name} renders ${m.qualities.map((q) => q.label).join(', ')}.`);
  const quality = renderQualityOf(m.id, fields.resolution);
  const ffs = firstFrameSource(fields, files); if ('error' in ffs) return ffs.error;
  const warnings: string[] = []; if (pick.note) warnings.push(pick.note);
  const hit = prompt.match(new RegExp(PROMPT_AVOID.source, 'gi')); if (hit) warnings.push(`Left out of the prompt: ${[...new Set(hit.map((w) => `“${w}”`))].join(', ')}. Words like clay or 3D make the model copy the rough shapes.`);
  let ffSrc = ffs.path; if (ffSrc && m.firstFrame === 'none') { warnings.push(`${m.name} takes no first frame, so your picture was left out; the prompt carries the look.`); ffSrc = null; }
  const size = cloudClipSize(m, rec.width, rec.height); const id = `mir-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const clipPath = path.join(DATA_DIR, `${id}-clip.mp4`);
  if ((await runFfmpeg(cloudClipArgs(src!, clipPath, { ...size, seconds: want }))) !== 0) return bad('planJob', 'That recording could not be prepared for the model. Record the shot again.', 'format');
  let firstFramePath: string | null = null;
  if (ffSrc) { firstFramePath = path.join(DATA_DIR, `${id}-first.png`); if ((await runFfmpeg(firstFrameArgs(ffSrc, firstFramePath, size))) !== 0) return bad('firstFrame', 'That picture could not be read. Use a PNG, JPG or WebP.', 'format'); }
  const seedIn = Number(fields.seed); const seed = Number.isInteger(seedIn) && seedIn >= 0 && seedIn < 2 ** 32 ? seedIn : MAKE_REAL_SEED;
  const finalPrompt = renderPrompt(m.id, prompt, !!firstFramePath); if (finalPrompt.length > m.promptMax) return bad('prompt', `${m.name} takes prompts up to ${m.promptMax} characters with our wording; shorten yours.`);
  const pv = (plan.input as any)?.previz ?? {}; const bill = renderBillSeconds(m.id, want);
  if (bill !== want) warnings.push(`${m.name} bills a ${want} s clip as ${bill} s.`);
  return { types: ['make-it-real'], mode: 'make-it-real', outKind: 'video', prompt, finalPrompt, seed, duration: bill, clipSeconds: want, resolution: quality || undefined, aspect: aspectOf(size.width, size.height), width: size.width, height: size.height, fps: 24,
    outputLabel: 'Render', warnings, renderModel: m.id, style: pick.style, clipPath, layoutPath: clipPath /* the mock sample grades this clip */, firstFramePath,
    makeReal: { planJobId: plan.id, planUrl: pick.out.url, planLabel: pick.out.label ?? (pick.style ? RENDER_STYLE_LABEL[pick.style] : 'Mockup'), presetName: pv.presetName ?? null, model: m.name, provider: m.id,
      plan: { width: size.width, height: size.height, seconds: want, fps: 24, frames: want * 24 }, prompt: stripAvoidWords(prompt), firstFrame: !!firstFramePath, firstFrameJob: ffSrc ? ffs.from : null,
      layoutUrl: `/files/${path.basename(clipPath)}`, firstFrameUrl: firstFramePath ? `/files/${path.basename(firstFramePath)}` : null } };
}

/** Render on LTX-2.5 + Layout to Render · Comfy Cloud (route comfy-cloud:cloud-ltx25-layout, comfy/ltx25LayoutCloud.ts): the same recipe and first frame
 *  as the local route, with the Cloud plan (shared/makeItReal.ts makeRealCloudPlan: Draft, Sharper or 720p; whole seconds 2–10 s = 24·s + 1 frames).
 *  duration = the seconds, resolution = the size's tier: what the quote reads (quote = charge). The Comfy Cloud runner uploads the two files. */
async function parseLayoutCloud(plan: Job, videoUrl: string, fields: Record<string, string>, files: Record<string, string[]>) {
  const src = fileOf(videoUrl); if (!(await exists(src))) return bad('planJob', 'That recording’s video file is missing. Record the shot again.', 'missing');
  const prompt = String(fields.prompt ?? '').trim().replace(/\s+/g, ' ');
  if (!prompt) return bad('prompt', 'Describe the finished shot in a sentence or two.', 'required');
  if (prompt.length > 1500) return bad('prompt', 'Keep the prompt under 1,500 characters: one or two sentences work best.');
  const rec = recordingOf(plan); const ok = cloudLengthsFor(rec.seconds);
  if (!ok.length) return bad('length', `Render on Comfy Cloud needs a mockup of at least 2 s; this one is ${rec.seconds} s.`);
  if (fields.size && !(fields.size in MAKE_REAL_CLOUD_SIZES)) return bad('size', 'Pick Draft, Sharper or 720p.');
  const asked = fields.length != null && fields.length !== '' ? Number(fields.length) : null;
  if (asked != null && !ok.includes(asked)) return bad('length', `Render on Comfy Cloud makes ${ok[0]}–${ok[ok.length - 1]} s of this mockup (whole seconds).`);
  const p = makeRealCloudPlan(rec, { seconds: asked ?? undefined, size: fields.size })!;
  const ffs = firstFrameSource(fields, files); if ('error' in ffs) return ffs.error;
  if (!ffs.path) return bad('firstFrame', 'Add a first frame: the plan’s first frame painted into the finished look (Lightricks’ Layout to Render needs it).', 'required');
  const seedIn = Number(fields.seed); const seed = Number.isInteger(seedIn) && seedIn >= 0 && seedIn < 2 ** 31 ? seedIn : MAKE_REAL_SEED;
  const clean = stripAvoidWords(prompt); if (!clean) return bad('prompt', 'Describe the finished look (not the clay or 3D plan).');
  const warnings: string[] = []; const hit = prompt.match(new RegExp(PROMPT_AVOID.source, 'gi'));
  if (hit) warnings.push(`Left out of the prompt: ${[...new Set(hit.map((w) => `“${w}”`))].join(', ')}. Lightricks: words like clay or 3D make the model copy the rough shapes.`);
  const id = `mir-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const layoutPath = path.join(DATA_DIR, `${id}-layout.mp4`); const firstFramePath = path.join(DATA_DIR, `${id}-first.png`);
  if ((await runFfmpeg(conformArgs(src!, layoutPath, { ...p, out: p.out, pad: true }))) !== 0) return bad('planJob', 'That recording could not be prepared for the model. Record the shot again.', 'format');
  if ((await runFfmpeg(firstFrameArgs(ffs.path, firstFramePath, { width: p.width, height: p.height, out: p.out }))) !== 0) return bad('firstFrame', 'That picture could not be read. Use a PNG, JPG or WebP.', 'format');
  const pv = (plan.input as any)?.previz ?? {};
  return { types: ['make-it-real'], mode: 'make-it-real', outKind: 'video', prompt, finalPrompt: clean, seed, duration: p.seconds, resolution: p.tier, aspect: p.aspect, width: p.out.width, height: p.out.height, fps: p.fps,
    outputLabel: 'Render', warnings, layoutPath, firstFramePath, place: 'cloud',
    makeReal: { planJobId: plan.id, planUrl: videoUrl, planLabel: plan.outputs?.[0]?.label ?? 'Mockup', presetName: pv.presetName ?? null, plan: p, prompt: clean, firstFrame: true, firstFrameJob: ffs.from, place: 'cloud',
      layoutUrl: `/files/${path.basename(layoutPath)}`, firstFrameUrl: `/files/${path.basename(firstFramePath)}` } };
}
