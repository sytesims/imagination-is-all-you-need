/**
 * MiniMax H3 Fast · Comfy Cloud (2026-10-27): the official Comfy templates "FastVideo FastH3: Text to Video" (video_fastvideo_fasth3_t2v) and
 * "FastVideo FastH3: Image to Video" (video_fastvideo_fasth3_i2v) from Comfy-Org/workflow_templates (MIT) on shared Comfy Cloud, as their own model
 * on Create Video (provider cloud-h3-fast, route comfy-cloud:cloud-h3-fast; standalone entry in comfy/cloudWorkflows.ts). No deployment needed.
 * Model: FastVideo FastH3 8-Step V2, a DMD2-distilled MiniMax H3 checkpoint by the FastVideo team (Hao AI Lab, with Nuva Lab and NVIDIA FastGen),
 * repacked by Comfy-Org (huggingface.co/FastVideo/FastVideo-FastH3-Comfy), MiniMax H3 Community License. Text and first-frame image to video, with sound.
 * Graphs (workflows/cloud/h3-fast-{t2v,i2v}-api.json, converted with scripts/ui2api.py, template node ids kept): 8 steps res_multistep / simple,
 * H3 sigma shift 10 / 3, VSA sparse attention (keep 10 % from 20 %), comfy kitchen attention, CreateVideo 24 fps. One change: the video VAE is
 * minimax_h3_video_vae_fp16 (the template's int8 ConvRot VAE is not in Comfy Cloud's library; fp16 is, as in cloud/h3-*-api.json).
 * Checked against Comfy Cloud's object_info of 2026-10-26: every class, the text encoder and both VAEs are there; the FastH3 checkpoint
 * (fastvideo_fasth3_8step_v2_pruned_int8_convrot) was NOT in that copy. So before anything is uploaded a free GET-only check looks for it (Comfy
 * Cloud's library or the user's import from Hugging Face); missing → a clear refusal with the import steps. Unverified until a first run.
 * Price: an estimate from GPU time (hostedPrices.ts cloud-h3-fast, priceUnmeasured) until one measured run sets it.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { WORKFLOWS_DIR } from '../config.js';
import { pruneUnreachable, type Plan } from './plans.js';
import { checkCloudModel, importSteps, importMissing } from './cloudImports.js';
import { resolutionSelectorAspect } from './resolutionSelector.js';

export const H3F_PROVIDER = 'cloud-h3-fast';
export const H3F_ROUTE = `comfy-cloud:${H3F_PROVIDER}`;
export const H3F_NAME = 'MiniMax H3 Fast · Comfy Cloud';
export const H3F_GRAPHS = { t2v: 'cloud/h3-fast-t2v-api.json', i2v: 'cloud/h3-fast-i2v-api.json' } as const;
export const H3F_TEMPLATES = { t2v: 'video_fastvideo_fasth3_t2v', i2v: 'video_fastvideo_fasth3_i2v' } as const;
export const H3F_TEMPLATE_URL = (id: string) => `https://github.com/Comfy-Org/workflow_templates/blob/main/templates/${id}.json`;
export const H3F_UNET = 'fastvideo_fasth3_8step_v2_pruned_int8_convrot.safetensors';
export const H3F_REPO = 'https://huggingface.co/FastVideo/FastVideo-FastH3-Comfy';
export const H3F_HF = `${H3F_REPO}/blob/main/diffusion_models/${H3F_UNET}`;
/** The name Comfy Cloud gives a Hugging Face import (<owner>__<repo>__<file>). */
export const H3F_IMPORTED = `FastVideo__FastVideo-FastH3-Comfy__${H3F_UNET}`;
export const H3F_LICENCE_URL = 'https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE';
export const H3F_DOCS = 'https://docs.comfy.org/tutorials/video/minimax/minimax-h3-fastvideo';
export const H3F_SECONDS = [2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export const H3F_IMPORT_STEPS = importSteps({ hf: H3F_HF, type: 'Diffusion model', importAs: H3F_IMPORTED });
export const H3F_MISSING = importMissing('MiniMax H3 Fast', `the FastH3 checkpoint (${H3F_UNET})`, H3F_IMPORT_STEPS);

const load = (f: string) => JSON.parse(readFileSync(path.join(WORKFLOWS_DIR, f), 'utf8')) as Record<string, any>;
/** What Comfy Cloud must have: the classes of both graphs and every model file a loader names (the checkpoint is checked per run, see above). */
export const H3F_REQUIRES = (() => {
  const nodes = new Set<string>(); const models = new Map<string, { loader: string; field: string; file: string }>();
  for (const f of Object.values(H3F_GRAPHS)) for (const n of Object.values<any>(load(f))) { nodes.add(String(n.class_type));
    for (const [k, v] of Object.entries<any>(n.inputs ?? {})) if (typeof v === 'string' && /\.safetensors$/.test(v)) models.set(`${n.class_type}.${k}=${v}`, { loader: String(n.class_type), field: k, file: v }); }
  return { nodes: [...nodes].sort(), models: [...models.values()] };
})();
/** Free check (GET only, before any upload or submit): is the FastH3 checkpoint in this account's Comfy Cloud (shared library or an import)? */
export const checkH3FastModel = (get: (p: string) => Promise<Response>) =>
  checkCloudModel(get, { loader: 'UNETLoader', field: 'unet_name', tag: 'diffusion_models', file: H3F_UNET, aliases: [H3F_IMPORTED], stem: 'fasth3' });

const modeOf = (i: Record<string, any>): 't2v' | 'i2v' => (i?.mode === 'i2v' || (!i?.mode && i?.imagePath) ? 'i2v' : 't2v');
/** What this route can't take (null = fine). Reads only what the quote also has (mode, duration, resolution), so quote and charge agree. */
export function h3FastIssue(i: Record<string, any>): string | null {
  if (i?.mode && !['t2v', 'i2v'].includes(String(i.mode))) return 'MiniMax H3 Fast makes text to video or image to video (a start frame) only';
  const s = Number(i?.duration); if (Number.isFinite(s) && s > 0 && !H3F_SECONDS.includes(s as any)) return `MiniMax H3 Fast makes ${H3F_SECONDS[0]}–${H3F_SECONDS[H3F_SECONDS.length - 1]} s clips`;
  if (i?.resolution && !['768p', '480p', '720p'].includes(String(i.resolution))) return 'MiniMax H3 Fast makes 768p or 480p';
  return null;
}
const bad = (m: string) => Object.assign(new Error(m), { reasonCode: 'input_invalid', errorType: 'validation' });
/** The plan: one pass of the template graph for the mode. input.h3FastUnet = the loader name the free check found. */
export function h3FastPlan(j: { id: string; toolId: string; provider: string; input: Record<string, any> }): Plan {
  const i = j.input; const why = h3FastIssue(i); if (why) throw bad(why);
  const mode = modeOf(i); if (mode === 'i2v' && !i.imagePath && !i.refPaths?.[0]) throw bad('MiniMax H3 Fast image to video needs a start frame');
  const file = H3F_GRAPHS[mode]; const g = load(file);
  const prompt = String(i.enhancedPrompt ?? i.finalPrompt ?? i.prompt ?? ''); const seconds = Number(i.duration) || 5; const seed = Math.max(0, Math.floor(Number(i.seed) || 0));
  const mp = i.resolution === '480p' ? 0.4 : 1.0; // 768p class ≈ 1.0 MP (the H3 canvas: 768 short edge), 480p = the template's 0.4 MP
  g['105:104'].inputs.prompt = prompt; g['105:111'].inputs.value = seconds; g['105:15'].inputs.noise_seed = seed;
  g['105:6'].inputs.unet_name = String(i.h3FastUnet || H3F_UNET);
  if (mode === 't2v') Object.assign(g['143'].inputs, { aspect_ratio: resolutionSelectorAspect(['16:9', '9:16', '1:1'].includes(i.aspect) ? i.aspect : '16:9'), megapixels: mp });
  else { g['136'].inputs.image = { __file: i.imagePath ?? i.refPaths[0] }; g['142'].inputs.megapixels = mp; }
  pruneUnreachable(g, ['92']);
  return { tool: j.toolId, outKind: 'video', post: { kind: 'each' }, muxSourceAudio: false,
    notes: [`MiniMax H3 Fast on Comfy Cloud (official template ${H3F_TEMPLATES[mode]}): ${seconds} s, ${mp} MP, 8 steps`],
    passes: [{ label: 'Result', workflow: file, graph: g, output: '92', expect: { seed, prompt, seconds, fps: 24, megapixels: mp } }] };
}
