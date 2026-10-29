/**
 * Footage Effects (tool id footage-fx, 2026-10-26): official Lightricks LTX-2.5 IC-LoRA effects on your own clip, free on your computer.
 * Rules and copy: shared/footageFx.ts. Shared graph + patcher: workflows/ltx25-iclora-v2v-api.json, comfy/ltx25IcLora.ts. LoRAs: shared/ltxLoras.ts.
 * Opened on the Video page (?workflow=footage-fx; recipe in shared/videoBar.ts); the clip comes from an upload, the media picker or a result.
 *
 *  - parseInput: reads the clip, plans the size and length (≤ 5 s on this Mac; a longer clip uses its first seconds), conforms it with ffmpeg to
 *    24 fps, the Draft / Sharper size (cover + centre crop) and exactly 8k + 1 frames with its sound, and keeps that copy as the job's source
 *    (videoPath, the before / after compare's "before": compareUrl).
 *  - run: the comfy backend runs the native plan (comfy/plans.ts footageFx). The mock backend makes a clearly labelled sample (a colour grade of
 *    the conformed clip, its sound kept) so the page can be tried without a model. Nothing reaches a provider.
 */
import path from 'node:path';
import type { ToolDef } from './types.js';
import { DATA_DIR } from '../config.js';
import { renameSync, rmSync } from 'node:fs';
import { runFfmpeg } from '../ffmpeg.js';
import { probe } from '../media.js';
import { registerProvider } from '../providers.js';
import { registerWorkflowLicense, registerLicenseComponents } from '../licenses.js';
import { mockRun } from './shared.js';
import { LTX_LORAS } from '../shared/ltxLoras.js';
import { FOOTAGE_FX_TOOL, FOOTAGE_FX_PROVIDER, FOOTAGE_FX_WORKFLOW, FOOTAGE_FX_SEED, FOOTAGE_FX_SECONDS, FOOTAGE_FX_DEFAULT_SECONDS, FOOTAGE_FX_RESOLUTIONS, FOOTAGE_FX_RES_LABELS,
  FOOTAGE_EFFECTS, FOOTAGE_CLOUD_EFFECTS, FOOTAGE_FX_TEMPLATE_URL, OUTPAINT_SHAPES, OUTPAINT_GROW, footageEffect, footageFxPlan, footageFxPrompt, footageFxModelName, footageCloudModelName, outpaintPlan,
  type OutpaintShape, type OutpaintGrow } from '../shared/footageFx.js';
import { MAKE_REAL_SIZES } from '../shared/makeItReal.js';
import { VFX_CLOUD_GRAPHS } from '../comfy/ltx23VfxCloud.js';
import { conformSourceArgs } from '../comfy/ltx25IcLora.js';
import './makeItReal.js'; // registers the LTX-2.x Community licence entry this tool's parts point at

registerWorkflowLicense(FOOTAGE_FX_WORKFLOW, ['ltx-2x-community', 'apache-2.0']);
// Comfy Cloud effects (2026-10-27): the official Comfy LTX-2.3 templates (MIT graphs) with LTX-2.3 weights and IC-LoRAs (LTX-2.x Community License)
for (const g of new Set(Object.values(VFX_CLOUD_GRAPHS).map((x) => x.graph))) registerWorkflowLicense(g, ['ltx-2x-community', 'mit']);
registerLicenseComponents(FOOTAGE_FX_TOOL, [
  { model: 'LTX-2.5 22B distilled (Lightricks; GGUF Q4_K_M repack by Unsloth, unsloth/LTX-2.5-GGUF)', license: 'LTX-2.x Community License', commercial: 'restricted', url: 'https://github.com/Lightricks/LTX-2/blob/main/LICENSE-2_x', licenseId: 'ltx-2x-community' },
  ...['clean-plate', 'day-to-night', 'water-simulation', 'alpha-gen'].map((id) => ({ model: `${LTX_LORAS[id].label} (${LTX_LORAS[id].sourceUrl.replace('https://huggingface.co/', '')})`, license: 'LTX-2.x Community License', commercial: 'restricted', url: LTX_LORAS[id].sourceUrl, licenseId: 'ltx-2x-community' })),
  { model: 'Gemma 4 12B text encoder with LTX projection, VAEs, x2 latent upscaler (Lightricks/LTX-2.5)', license: 'LTX-2.x Community License', commercial: 'restricted', url: 'https://huggingface.co/Lightricks/LTX-2.5', licenseId: 'ltx-2x-community' },
  { model: 'ComfyUI-GGUF custom nodes (city96)', license: 'Apache-2.0', commercial: 'yes', url: 'https://github.com/city96/ComfyUI-GGUF', licenseId: 'apache-2.0' },
  { model: 'LTX-2.3 22B dev, Gemma 3 12B text encoder, x2 latent upscaler (Lightricks/LTX-2.3; Comfy Cloud effects)', license: 'LTX-2.x Community License', commercial: 'restricted', url: 'https://huggingface.co/Lightricks/LTX-2.3', licenseId: 'ltx-2x-community' },
  ...FOOTAGE_CLOUD_EFFECTS.map((e) => ({ model: `${e.cloud!.loraLabel} (${e.label}; ${e.cloud!.loraSource ? e.cloud!.loraSource.replace(/^https:\/\/(huggingface\.co|civitai\.com)\//, '$1/') : 'as shipped in Comfy Cloud’s library'})`, license: 'LTX-2.x Community License', commercial: 'restricted', url: e.cloud!.loraSource ?? FOOTAGE_FX_TEMPLATE_URL(e.cloud!.template), licenseId: 'ltx-2x-community' })),
  ...FOOTAGE_CLOUD_EFFECTS.map((e) => ({ model: `Official Comfy template · LTX-2.3 · Lightricks: ${e.cloud!.template} (Comfy-Org/workflow_templates)`, license: 'MIT', commercial: 'yes', url: FOOTAGE_FX_TEMPLATE_URL(e.cloud!.template), licenseId: 'mit' })),
] as any);
registerProvider({ id: FOOTAGE_FX_PROVIDER, name: 'LTX-2.5 22B + Lightricks IC-LoRA', kind: 'open-weights', via: `local ComfyUI, workflows/${FOOTAGE_FX_WORKFLOW} (mock unless OPENHIGGSFIELD_BACKEND=comfy)`,
  workflows: [FOOTAGE_FX_WORKFLOW], docUrl: 'https://huggingface.co/Lightricks/LTX-2.5',
  nodes: ['UnetLoaderGGUF', 'LoraLoaderModelOnly', 'GetICLoRAParameters', 'LoadVideo', 'GetVideoComponents', 'LTXVAddGuide', 'LTXVCropGuides', 'LTXVLatentUpsampler', 'LTXVImgToVideoInplace', 'SamplerCustomAdvanced'], licenseParts: ['ltx-2x-community', 'apache-2.0'] } as any);

const bad = (field: string, message: string, code = 'invalid') => ({ error: message, code, issues: [{ code, field, message }] }) as any;
const typesOf = (raw: string | undefined): string[] => { try { const v = JSON.parse(raw || '[]'); return (Array.isArray(v) ? v : [v]).map(String); } catch { return String(raw ?? '').split(',').map((x) => x.trim()).filter(Boolean); } };
/** The sample grade per effect (mock backend only; a real run is the model). */
const MOCK_GRADE: Record<string, string> = {
  vanish: 'hue=s=0.55,boxblur=3:1', 'day-to-night': 'eq=brightness=-0.22:saturation=0.55:gamma=0.85,colorbalance=rs=-0.12:bs=0.28:bm=0.18',
  rain: 'eq=contrast=1.08:saturation=0.75,colorbalance=bs=0.12:bm=0.08,noise=alls=22:allf=t', flood: 'colorbalance=bs=0.25:gs=0.06:bm=0.12,eq=brightness=-0.04:saturation=0.85',
  'alpha-matte': 'format=gray,eq=contrast=6:brightness=0.08',
  restore: 'eq=contrast=1.12:saturation=1.35,unsharp=5:5:0.8', 'remove-object': 'hue=s=0.7,boxblur=2:1', 'remove-text': 'eq=contrast=1.04,boxblur=1:1', 'extend-frame': 'eq=saturation=1.1',
};
const labelOf = (e: (typeof FOOTAGE_EFFECTS)[number]) => (e.cloud ? footageCloudModelName(e) : footageFxModelName(LTX_LORAS[e.lora].label));
/** A Comfy Cloud effect's conform: as local, plus a silent track when the clip has none (the LTX-2.3 templates encode the clip's sound). */
const withSilence = (args: string[], hasAudio: boolean) => { if (hasAudio) return args; const a = [...args];
  a.splice(a.indexOf('-i') + 2, 0, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo'); a.splice(a.indexOf('0:a:0?'), 1, '1:a:0'); return a; };

export const footageFxTool: ToolDef = {
  id: FOOTAGE_FX_TOOL, name: 'Footage Effects', category: 'Edit Video', status: 'new', route: `/tools/${FOOTAGE_FX_TOOL}`, ui: 'app',
  description: 'Remove people, turn day into night, add rain or a flood, or pull a clean matte from your own clip. Free on your computer; takes a few minutes. On Comfy Cloud: restore old footage, remove an object or subtitles, or extend the frame. Your sound is kept.',
  inputs: [{ name: 'video', kind: 'file', required: true, accept: 'video/mp4,video/quicktime,video/webm', label: 'Your clip' },
    { name: 'types', kind: 'list', required: true, max: 1, options: FOOTAGE_EFFECTS.map((e) => e.id) },
    { name: 'prompt', kind: 'text', label: 'What is in the shot (optional, one line)' },
    { name: 'duration', kind: 'select', options: FOOTAGE_FX_SECONDS.map(String), default: String(FOOTAGE_FX_DEFAULT_SECONDS) },
    { name: 'resolution', kind: 'select', options: [...FOOTAGE_FX_RESOLUTIONS], default: '448p', choices: FOOTAGE_FX_RESOLUTIONS.map((r) => ({ value: r, label: FOOTAGE_FX_RES_LABELS[r] })) } as any,
    { name: 'shape', kind: 'select', options: [...OUTPAINT_SHAPES], default: '9:16', label: 'New shape (Extend the frame)' }, { name: 'grow', kind: 'select', options: [...OUTPAINT_GROW], default: 'around', label: 'Which way it grows (Extend the frame)' },
    { name: 'keepAudio', kind: 'select', options: ['1', '0'], default: '1' }, { name: 'seed', kind: 'number' }],
  presets: FOOTAGE_EFFECTS.map((e) => ({ id: e.id, label: e.label, prompt: e.prompt, description: e.tagline, group: 'Effect', addedAt: '2026-10-26', providers: [FOOTAGE_FX_PROVIDER], modelName: labelOf(e), category: e.cloud ? 'Comfy Cloud · LTX-2.3 template' : 'Lightricks IC-LoRA',
    ...(e.cloud ? { runOn: 'comfy-cloud', template: e.cloud.template, templateUrl: FOOTAGE_FX_TEMPLATE_URL(e.cloud.template),
      source: { source: 'official', name: `${e.cloud.title} (${e.cloud.template})`, url: FOOTAGE_FX_TEMPLATE_URL(e.cloud.template), author: 'Comfy Org · LTX-2.3 · Lightricks', licence: 'MIT (Comfy-Org/workflow_templates) · weights: LTX-2.x Community License' } } : {}) } as any)),
  app: { kind: 'video', input: 'video', durations: [...FOOTAGE_FX_SECONDS], resolutions: [...FOOTAGE_FX_RESOLUTIONS], maxSeconds: 5 },
  workflows: [FOOTAGE_FX_WORKFLOW], model: 'LTX-2.5 22B distilled (GGUF Q4_K_M) + a Lightricks IC-LoRA', gpuSecPerSec: { source: 0 }, providers: [FOOTAGE_FX_PROVIDER],
  stages: [['uploading', 'Sending your clip'], ['encoding', 'Reading the prompt'], ['rendering', 'Rendering (two stages)'], ['saving', 'Saving with your clip’s sound']],
  routeInput: (i) => { const t = Array.isArray(i.types) ? i.types.map(String) : i.types != null && i.types !== '' ? typesOf(String(i.types)) : []; return { types: t.length ? t : [FOOTAGE_EFFECTS[0].id] }; }, // a quote sends types as text ("restore" or '["restore"]')
  async parseInput(fields, files) {
    const vf = files.video?.[0]; if (!vf) return bad('video', 'Add a clip to put the effect on.', 'required');
    if (/\.(png|jpe?g|webp|gif)$/i.test(vf)) return bad('video', 'Footage Effects takes a video clip, not a photo.', 'format');
    const effect = footageEffect(typesOf(fields.types)[0] ?? fields.effect); if (!effect) return bad('types', 'Pick an effect from the list.', 'unknown_effect');
    const src = path.join(DATA_DIR, vf); const p = await probe(src);
    if (!p) return bad('video', 'That clip could not be read. Re-export it as MP4 (H.264) and try again.', 'unreadable');
    if (Math.min(p.width, p.height) < 256) return bad('video', `That clip is too small (${p.width}×${p.height}); use one at least 256 px on its short side.`, 'too_small');
    const secIn = fields.duration ?? fields.seconds; if (secIn != null && secIn !== '' && !FOOTAGE_FX_SECONDS.includes(Number(secIn) as any)) return bad('duration', `Length must be ${FOOTAGE_FX_SECONDS.join(', ')} s.`, 'invalid_duration');
    if (fields.resolution && !FOOTAGE_FX_RESOLUTIONS.includes(fields.resolution as any)) return bad('resolution', 'Pick Draft or Sharper.');
    const plan = footageFxPlan({ width: p.width, height: p.height, seconds: p.duration }, { seconds: secIn, resolution: fields.resolution });
    if (!plan) return bad('video', `That clip is ${p.duration.toFixed(1)} s; effects need at least 0.7 s.`, 'too_short');
    const scene = String(fields.prompt ?? '').trim().replace(/\s+/g, ' ').slice(0, 400);
    if (effect.needsLine && !scene) return bad('prompt', 'Say what to remove, like “the red car” or “the man in the hat”.', 'required');
    // Extend the frame: the new shape (its Draft / Sharper size) and where the clip sits in it; the clip is conformed to that inner size
    let outpaint: ReturnType<typeof outpaintPlan> | undefined;
    if (effect.id === 'extend-frame') {
      const shape = (OUTPAINT_SHAPES as readonly string[]).includes(String(fields.shape)) ? String(fields.shape) as OutpaintShape : fields.shape ? null : '9:16';
      if (!shape) return bad('shape', `Pick a shape: ${OUTPAINT_SHAPES.join(', ')}.`);
      const grow = (OUTPAINT_GROW as readonly string[]).includes(String(fields.grow)) ? String(fields.grow) as OutpaintGrow : fields.grow ? null : 'around';
      if (!grow) return bad('grow', 'Pick which way the frame grows: around, left, right, up or down.');
      const [cw, ch] = MAKE_REAL_SIZES[plan.size].dims[shape]; outpaint = outpaintPlan({ width: p.width, height: p.height }, { width: cw, height: ch }, shape, grow);
    }
    const keepAudio = !/^(0|false|off|no)$/i.test(fields.keepAudio ?? '');
    const seedIn = Number(fields.seed); const seed = fields.seed != null && fields.seed !== '' && Number.isInteger(seedIn) && seedIn >= 0 && seedIn < 2 ** 31 ? seedIn : FOOTAGE_FX_SEED;
    const id = `ffx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; const name = `${id}-source.mp4`;
    const conform = outpaint ? { ...plan, width: outpaint.inner.width, height: outpaint.inner.height } : plan;
    const args = conformSourceArgs(src, path.join(DATA_DIR, name), conform);
    if ((await runFfmpeg(effect.cloud ? withSilence(args, p.hasAudio) : args)) !== 0) return bad('video', 'That clip could not be prepared for the model. Try another clip.', 'format');
    const warnings: string[] = [];
    const asked = Number(secIn) || FOOTAGE_FX_DEFAULT_SECONDS;
    if (plan.seconds < asked) warnings.push(`Your clip is ${p.duration.toFixed(1)} s, so the effect covers ${plan.seconds} s.`);
    else if (plan.trimmed) warnings.push(`The effect covers the first ${plan.seconds} s of your clip (up to 5 s per run).`);
    if (outpaint && outpaint.grow !== fields.grow && fields.grow) warnings.push(`A ${outpaint.shape} frame has no room to grow ${fields.grow}, so it grows around your clip.`);
    if (scene && !effect.usesScene) warnings.push('Alpha matte takes no description; it mattes everything in the foreground.');
    const lora = effect.cloud ? { id: effect.id, file: effect.cloud.loraFile, label: effect.cloud.loraLabel } : LTX_LORAS[effect.lora];
    const out = outpaint ? outpaint.canvas : plan;
    return { types: [effect.id], mode: 'footage-fx', outKind: 'video', prompt: scene, finalPrompt: footageFxPrompt(effect, scene), negative: effect.negative, seed,
      duration: plan.seconds, resolution: plan.resolution, aspect: outpaint?.shape ?? plan.aspect, width: out.width, height: out.height, fps: plan.fps,
      videoPath: path.join(DATA_DIR, name), videoUrl: `/files/${name}`, ...(outpaint ? {} : { compareUrl: `/files/${name}` }) /* a new shape has no same-size before */, originalVideoUrl: `/files/${vf}`, hasAudio: p.hasAudio, keepAudio,
      outputLabel: effect.label, warnings,
      footageFx: { effect: effect.id, label: effect.label, lora: { id: lora.id, file: lora.file, label: lora.label, strength: effect.strength }, plan, modelName: labelOf(effect),
        ...(outpaint ? { outpaint } : {}), ...(effect.cloud ? { cloud: true, template: effect.cloud.template } : {}) } };
  },
  async run(job) {
    // Mock backend (or a comfy backend without a native plan): a labelled sample from the conformed clip. Never pretends a model ran.
    const fx = (job.input as any).footageFx ?? {};
    await mockRun(job, footageFxTool.stages, [`${fx.label ?? 'Effect'} (sample)`], 6000);
    if (job.status !== 'done' || !job.outputs?.[0]) return;
    const out = path.join(DATA_DIR, job.outputs[0].url.slice('/files/'.length)); const i: any = job.input;
    const audio = i.keepAudio !== false && i.hasAudio ? ['-map', '0:v:0', '-map', '0:a:0?', '-c:a', 'aac'] : ['-an'];
    const o = fx.outpaint; const pad = o ? `,pad=${o.canvas.width}:${o.canvas.height}:${o.pad.left}:${o.pad.top}:color=0x2a2c30` : ''; // Extend the frame: the sample shows the new shape
    const code = await runFfmpeg(['-y', '-v', 'error', '-i', i.videoPath, '-vf', `${MOCK_GRADE[fx.effect] ?? 'eq=saturation=1.3'}${pad},format=yuv420p`, ...audio, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-movflags', '+faststart', `${out}.grade.mp4`]);
    // written aside, then swapped in: the job already reads done, so a reader (a chained job, a download) never sees a half-written file
    if (code === 0) renameSync(`${out}.grade.mp4`, out); else rmSync(`${out}.grade.mp4`, { force: true });
    if (code !== 0) { job.status = 'failed'; job.errorType = 'temporary'; job.error = 'The sample could not be made. Nothing was charged.'; }
    job.outputs[0] = { ...job.outputs[0], width: i.width, height: i.height } as any;
  },
};
