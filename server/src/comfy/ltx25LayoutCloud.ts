/**
 * Render · LTX-2.5 + Layout to Render · Comfy Cloud (2026-10-27): Direct a Shot's Render step on shared Comfy Cloud, the Comfy Cloud place of the local
 * route comfy-ltx25-layout (routing/routes.ts TWINS; standalone entry in comfy/cloudWorkflows.ts on route comfy-cloud:cloud-ltx25-layout).
 * Graph: workflows/cloud/ltx25-layout-to-render-api.json = our local graph (comfy/makeItReal.ts, same node ids and wiring) with the official template
 * files that LTX-2.5 22B · Comfy Cloud uses (comfy/ltx25Cloud.ts LTX25_CLOUD_FILES: UNETLoader int8 ConvRot transformer, Gemma 4 12B int8 ConvRot,
 * video VAE bf16, audio VAE bf16, x2 latent upscaler) and Lightricks' Layout to Render IC-LoRA as the user's IMPORT (not in Cloud's shared library,
 * object_info 2026-10-26). Every class and file checked against Comfy Cloud's object_info of 2026-10-26.
 * The plan is the local one (patchMakeReal: two stages, 8 + 3 distilled sigmas, CFG 1, euler_ancestral, the layout as an IC-LoRA guide and the
 * first frame as a latent guide before the clip) with the Cloud plan's sizes (shared/makeItReal.ts makeRealCloudPlan: Draft, Sharper or 720p, whole
 * seconds 2–10 s = 24·s + 1 frames). 720p renders 1280×704 and an ImageScale node hands back the recording's 1280×720 (no crop either way).
 * Not applied: anything like ltx25Extend.ts extendSoundOnStage1 (it broke the Cloud sampler, 2026-10-27).
 * Before anything is uploaded, a free check (GET only) confirms the LoRA is in the user's model library; otherwise a clear refusal with the steps.
 * Credits: Layout to Render IC-LoRA by Lightricks (huggingface.co/Lightricks/LTX-2.5-22b-IC-LoRA-Layout-To-Render, LTX-2.x Community License).
 * Price: an estimate from GPU time (hostedPrices.ts cloud-ltx25-layout, priceUnmeasured) until one measured run sets it.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { WORKFLOWS_DIR } from '../config.js';
import { env } from '../env.js';
import { pruneUnreachable, type Plan } from './plans.js';
import { patchMakeReal } from './makeItReal.js';
import { LTX25_CLOUD_FILES } from './ltx25Cloud.js';
import { checkImportedLora, importTodo, importSteps, importMissing } from './cloudImports.js';
import { MAKE_REAL_CLOUD_PLACE, MAKE_REAL_CLOUD_SECONDS, MAKE_REAL_CLOUD_SIZES, LAYOUT_LORA_FILE, LAYOUT_LORA_IMPORTED, LAYOUT_LORA_URL, LAYOUT_LORA_REPO, LAYOUT_LORA_STEPS, type MakeRealCloudPlan, type MakeRealPlan } from '../shared/makeItReal.js';

export const LAYOUT_CLOUD_PROVIDER = 'cloud-ltx25-layout';
export const LAYOUT_CLOUD_ROUTE = MAKE_REAL_CLOUD_PLACE;
export const LAYOUT_CLOUD_GRAPH = 'cloud/ltx25-layout-to-render-api.json';
export const LAYOUT_CLOUD_NAME = 'LTX-2.5 + Layout to Render · Comfy Cloud';
/** The loader name of the user's import. Env COMFY_CLOUD_LAYOUT_LORA when the import has another name (a rename, a Civitai copy). */
export const layoutLoraName = () => env('COMFY_CLOUD_LAYOUT_LORA')?.trim() || process.env.COMFY_CLOUD_LAYOUT_LORA?.trim() || LAYOUT_LORA_IMPORTED;
export const LAYOUT_LORA_IMPORT_STEPS = importSteps({ hf: LAYOUT_LORA_URL, type: 'LoRA', importAs: LAYOUT_LORA_IMPORTED, gated: { repo: LAYOUT_LORA_REPO } });
export const LAYOUT_LORA_MISSING = importMissing('Layout to Render', `Lightricks’ Layout to Render LoRA (${LAYOUT_LORA_FILE})`, LAYOUT_LORA_IMPORT_STEPS);
/** The free check's report (the same shape as H3 Character Swap's). */
export const LAYOUT_RECOMMENDED = [{ id: 'layout-lora', required: true, file: LAYOUT_LORA_FILE, importAs: LAYOUT_LORA_IMPORTED, hf: LAYOUT_LORA_URL, repo: LAYOUT_LORA_REPO, type: 'LoRA', size: '1.31 GB', gated: true,
  why: 'Lightricks’ Layout to Render IC-LoRA itself. Without it this place refuses to run (nothing is sent or charged).', steps: LAYOUT_LORA_STEPS }] as const;
export const layoutRecommendedReport = (c: { state: string; loaderPath: string | null }) => LAYOUT_RECOMMENDED.map((m) => ({ ...m, state: c.state, loaderPath: c.loaderPath, ...(c.state === 'missing' ? { todo: importTodo(m) } : {}) }));

const load = () => JSON.parse(readFileSync(path.join(WORKFLOWS_DIR, LAYOUT_CLOUD_GRAPH), 'utf8')) as Record<string, any>;
/** What Comfy Cloud must have: the graph's classes (+ ImageScale for 720p) and the model files (the LoRA is the user's import). */
export const LAYOUT_CLOUD_REQUIRES = {
  nodes: [...new Set([...Object.values<any>(load()).map((n) => String(n.class_type)), 'ImageScale'])].sort(),
  models: [
    { loader: 'UNETLoader', field: 'unet_name', file: LTX25_CLOUD_FILES.unet },
    { loader: 'CLIPLoader', field: 'clip_name', file: LTX25_CLOUD_FILES.textEncoder },
    { loader: 'VAELoader', field: 'vae_name', file: LTX25_CLOUD_FILES.videoVae },
    { loader: 'VAELoader', field: 'vae_name', file: LTX25_CLOUD_FILES.audioVae },
    { loader: 'LatentUpscaleModelLoader', field: 'model_name', file: LTX25_CLOUD_FILES.upscaler },
    { loader: 'LoraLoaderModelOnly', field: 'lora_name', file: LAYOUT_LORA_IMPORTED /* the user's import */ },
  ],
};
const TIERS = Object.values(MAKE_REAL_CLOUD_SIZES).map((s) => s.tier) as string[];
/** What this place can't take (null = fine). Reads only what the quote also has (duration, resolution), so quote and charge agree. */
export function layoutCloudIssue(i: Record<string, any>): string | null {
  const s = Number(i?.duration);
  if (Number.isFinite(s) && s > MAKE_REAL_CLOUD_SECONDS.max + 0.05) return `Render on Comfy Cloud takes up to ${MAKE_REAL_CLOUD_SECONDS.max} s of your mockup`;
  if (Number.isFinite(s) && s > 0 && s < MAKE_REAL_CLOUD_SECONDS.min) return `Render on Comfy Cloud needs at least ${MAKE_REAL_CLOUD_SECONDS.min} s of your mockup`;
  if (i?.resolution && !TIERS.includes(String(i.resolution))) return 'Render on Comfy Cloud makes Draft (448p), Sharper (576p) or 720p';
  return null;
}
/** Free check (GET only, before any upload or submit): is the Layout to Render LoRA in this account's Comfy Cloud model library? */
export function checkLayoutLora(get: (p: string) => Promise<Response>, file = layoutLoraName()) {
  return checkImportedLora(get, { file, aliases: file === LAYOUT_LORA_IMPORTED ? [LAYOUT_LORA_FILE] : [], stem: 'ic-lora-layout-to-render' });
}
const bad = (m: string) => Object.assign(new Error(m), { reasonCode: 'input_invalid', errorType: 'validation' });
/** The plan: one pass of the Cloud graph. input.makeReal.plan = makeRealCloudPlan (parseInput); input.layoutLora = the loader name the free check found. */
export function layoutCloudPlan(j: { id: string; toolId: string; provider: string; input: Record<string, any> }): Plan {
  const i = j.input; const p = i.makeReal?.plan as MakeRealCloudPlan | undefined;
  if (!p || p.place !== 'cloud' || !i.layoutPath || !i.firstFramePath) throw bad('Render on Comfy Cloud: the mockup was not prepared for this place. Pick Comfy Cloud and press Render again');
  const why = layoutCloudIssue(i); if (why) throw bad(why);
  const prompt = String(i.finalPrompt ?? i.prompt ?? '');
  const { graph, expect } = patchMakeReal(load(), { plan: p as unknown as MakeRealPlan, prompt, seed: i.seed, layout: { __file: i.layoutPath }, firstFrame: { __file: i.firstFramePath } });
  const lora = String(i.layoutLora || layoutLoraName()); graph['2'].inputs.lora_name = lora;
  const scaled = p.out.width !== p.width || p.out.height !== p.height;
  if (scaled) { graph['64'] = { class_type: 'ImageScale', inputs: { image: ['60', 0], upscale_method: 'lanczos', width: p.out.width, height: p.out.height, crop: 'disabled' }, _meta: { title: `Scale to ${p.out.width}×${p.out.height}` } }; graph['62'].inputs.images = ['64', 0]; }
  pruneUnreachable(graph, ['63']);
  return { tool: j.toolId, outKind: 'video', post: { kind: 'each' }, muxSourceAudio: false,
    notes: [`Layout to Render on Comfy Cloud: ${p.width}×${p.height}${scaled ? ` → ${p.out.width}×${p.out.height}` : ''}, ${p.frames} frames (${p.seconds} s), stage 1 ${p.stage1.width}×${p.stage1.height}, 8 + 3 steps, LoRA ${lora}`],
    passes: [{ label: 'Real', workflow: LAYOUT_CLOUD_GRAPH, graph, output: '63', expect: { ...expect, tier: p.tier, out: p.out, lora } }] };
}
