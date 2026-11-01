/**
 * Pika H3 Flex (2026-11-01): Pika's six-step FL2VA adapter for MiniMax H3 (Pika-Labs/Pika-H3-Flex, released 2026-10-29), run from the official Comfy
 * templates "Pika H3 Flex: Text to Video" (video_pika_h3_flex_t2v) and "Pika H3 Flex: FL2VA" (video_pika_h3_flex_fl2va), Comfy-Org/workflow_templates (MIT),
 * https://docs.comfy.org/tutorials/video/pika/pika-h3-flex. Text, a first frame, or a first + last frame into a 5–15 s clip with its own sound.
 * Weights: the MiniMax H3 base (fl2va int8 ConvRot, Qwen3-VL 32B text encoder, H3 VAEs) + pika_h3_flex_fl2va_v1_bf16 (Comfy-Org/MiniMax-H3 repack, 1.96 GB),
 * MiniMax H3 Community License. Pika's own code is Apache-2.0 and Pika asks for credit (shown on the model).
 * Graphs (scripts/build-pika-h3-flex.py, template node ids kept): every sampling setting is the template's own, never changed here: the LoRA at 1.0,
 * KSamplerSelect lcm, ManualSigmas = Pika's 6-step list, BasicGuider (CFG 1), CreateVideo 24 fps, H3's 17k + 5 frame grid. No turbo / Lightning LoRA
 * (the docs: a second acceleration LoRA breaks the output). One shared plan for both places:
 *  - Comfy Cloud (provider cloud-h3-pika, standalone entry in comfy/cloudWorkflows.ts): workflows/cloud/pika-h3-flex-*.json, the fp16 video VAE (the
 *    template's int8 ConvRot VAE was not in Comfy Cloud's library, as for cloud/h3-*-api.json). Comfy Cloud's object_info of 2026-10-26 predates the
 *    LoRA, so before anything is uploaded a free GET-only check looks for it (shared library or the user's import); missing → a plain refusal, nothing charged.
 *  - your own ComfyUI: workflows/pika-h3-flex-*.json, the template's own files (int8 VAE). NVIDIA only (nvfp4 / int8 ConvRot weights; the manifest says so).
 * Price on Comfy Cloud: an estimate from GPU time (hostedPrices.ts cloud-h3-pika, priceUnmeasured) until one measured run sets it.
 * Ref2VA (references) is not built yet (TODO in the research notes).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { WORKFLOWS_DIR } from '../config.js';
import { pruneUnreachable, type Plan } from './plans.js';
import { checkCloudModel, importSteps, importMissing } from './cloudImports.js';
import { resolutionSelectorAspect } from './resolutionSelector.js';
import { h3Frames } from '../tools/h3/rules.js';
import { H3_I2V_LINE } from '../shared/modePrompt.js';

export const PIKA_PROVIDER = 'cloud-h3-pika';
export const PIKA_ROUTE = `comfy-cloud:${PIKA_PROVIDER}`;
export const PIKA_NAME = 'Pika H3 Flex · Comfy Cloud';
export const PIKA_MODES = ['t2v', 'i2v', 'flf'] as const;
type Mode = (typeof PIKA_MODES)[number];
const GRAPH = { t2v: 'pika-h3-flex-t2v-api.json', fl2va: 'pika-h3-flex-fl2va-api.json' } as const;
/** Your own ComfyUI: the template's own files. */
export const PIKA_LOCAL_GRAPHS = { ...GRAPH };
/** Comfy Cloud: the same graphs with the fp16 video VAE. */
export const PIKA_GRAPHS = { t2v: `cloud/${GRAPH.t2v}`, fl2va: `cloud/${GRAPH.fl2va}` } as const;
export const PIKA_TEMPLATES = { t2v: 'video_pika_h3_flex_t2v', fl2va: 'video_pika_h3_flex_fl2va' } as const;
export const PIKA_LORA = 'pika_h3_flex_fl2va_v1_bf16.safetensors';
export const PIKA_LORA_BYTES = 1956172304;
export const PIKA_REPO = 'https://huggingface.co/Comfy-Org/MiniMax-H3';
export const PIKA_HF = `${PIKA_REPO}/blob/main/loras/${PIKA_LORA}`;
/** The name Comfy Cloud gives a Hugging Face import (<owner>__<repo>__<file>). */
export const PIKA_IMPORTED = `Comfy-Org__MiniMax-H3__${PIKA_LORA}`;
export const PIKA_LICENCE_URL = 'https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE';
export const PIKA_CODE_URL = 'https://github.com/Pika-Labs/Pika-H3-Flex';
export const PIKA_CARD = 'https://huggingface.co/Pika-Labs/Pika-H3-Flex';
export const PIKA_DOCS = 'https://docs.comfy.org/tutorials/video/pika/pika-h3-flex';
/** Pika's published six-step schedule (the templates' ManualSigmas): fixed, never edited. */
export const PIKA_SIGMAS = '1.0, 0.972973, 0.923077, 0.8, 0.571429, 0.333333, 0.0';
/** The adapter's trained range: 5–15 s on H3's 17k + 5 grid at 24 fps (the docs' 5–15 s; MiniMaxH3ImageToVideo's trained range ~124–362 frames). */
export const PIKA_SECONDS = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const;
export const PIKA_MEGAPIXELS = { '768p': 0.98 /* the t2v template's own */, '480p': 0.4 } as const;
export const PIKA_IMPORT_STEPS = importSteps({ hf: PIKA_HF, type: 'LoRA', importAs: PIKA_IMPORTED });
export const PIKA_MISSING = importMissing('Pika H3 Flex', `the Pika H3 Flex LoRA (${PIKA_LORA})`, PIKA_IMPORT_STEPS);

const load = (f: string) => JSON.parse(readFileSync(path.join(WORKFLOWS_DIR, f), 'utf8')) as Record<string, any>;
/** What Comfy Cloud must have: the classes of both graphs and every model file a loader names (the LoRA is checked per run, see above). */
export const PIKA_REQUIRES = (() => {
  const nodes = new Set<string>(); const models = new Map<string, { loader: string; field: string; file: string }>();
  for (const f of Object.values(PIKA_GRAPHS)) for (const n of Object.values<any>(load(f))) { nodes.add(String(n.class_type));
    for (const [k, v] of Object.entries<any>(n.inputs ?? {})) if (typeof v === 'string' && /\.safetensors$/.test(v)) models.set(`${n.class_type}.${k}=${v}`, { loader: String(n.class_type), field: k, file: v }); }
  return { nodes: [...nodes].sort(), models: [...models.values()] };
})();
/** Free check (GET only, before any upload or submit): is the Pika LoRA in this account's Comfy Cloud (shared library or an import)? */
export const checkPikaLora = (get: (p: string) => Promise<Response>) =>
  checkCloudModel(get, { loader: 'LoraLoaderModelOnly', field: 'lora_name', tag: 'loras', file: PIKA_LORA, aliases: [PIKA_IMPORTED], stem: 'pika_h3_flex' });
/** Comfy Cloud preflight: refuse (nothing sent or charged) when a check answered without the LoRA; else the loader name it found, for the plan. */
export async function pikaPreflight(get: (p: string) => Promise<Response>): Promise<Record<string, any>> {
  const c = await checkPikaLora(get);
  if (c.state === 'missing') throw Object.assign(new Error(PIKA_MISSING), { reasonCode: 'cloud_import_missing', errorType: 'validation' });
  return c.loaderPath ? { pikaLora: c.loaderPath } : {};
}

const modeOf = (i: Record<string, any>): Mode => (PIKA_MODES.includes(i?.mode) ? i.mode : i?.lastFramePath ? 'flf' : i?.imagePath ? 'i2v' : 't2v');
/** What this model can't take (null = fine). Reads only what the quote also has (mode, duration, resolution), so quote and charge agree. */
export function pikaIssue(i: Record<string, any>): string | null {
  if (i?.mode && !(PIKA_MODES as readonly string[]).includes(String(i.mode))) return 'Pika H3 Flex makes text to video, a start frame, or start + end frames (references aren’t offered yet)';
  const s = Number(i?.duration); if (Number.isFinite(s) && s > 0 && !PIKA_SECONDS.includes(s as any)) return `Pika H3 Flex makes ${PIKA_SECONDS[0]}–${PIKA_SECONDS[PIKA_SECONDS.length - 1]} s clips`;
  if (i?.resolution && !['768p', '480p', '720p'].includes(String(i.resolution))) return 'Pika H3 Flex makes 768p or 480p';
  return null;
}
/** The line that pins each frame to its time, added when the prompt has none: start + end = the fl2va template's own (its example prompt opens with it). */
const anchored = (p: string) => /aligns with the [\d.]+-second mark|is fully referenced/i.test(p);
export function pikaAnchor(mode: Mode, frames: number): string {
  if (mode === 'flf') return `How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 1) aligns with the ${(frames / 24).toFixed(2)}-second mark of the target video.`;
  return H3_I2V_LINE; // a start frame only: MiniMax H3's own first-frame line, as on every H3 route (shared/modePrompt.ts)
}
const bad = (m: string) => Object.assign(new Error(m), { reasonCode: 'input_invalid', errorType: 'validation' });
/** The plan, the same for both places: one pass of the template graph for the mode. target 'cloud' = the fp16-VAE graphs; input.pikaLora = the loader
 *  name Comfy Cloud's free check found (an import). */
export function pikaPlan(j: { id: string; toolId: string; provider: string; input: Record<string, any> }, target: 'cloud' | 'local' = 'cloud'): Plan {
  const i = j.input; const why = pikaIssue(i); if (why) throw bad(why);
  const mode = modeOf(i); const first = i.imagePath ?? i.refPaths?.[0];
  if (mode !== 't2v' && !first) throw bad('Pika H3 Flex needs a start frame for this mode');
  if (mode === 'flf' && !i.lastFramePath) throw bad('Pika H3 Flex start + end frame needs an end frame');
  const kind = mode === 't2v' ? 't2v' : 'fl2va'; const file = (target === 'cloud' ? PIKA_GRAPHS : PIKA_LOCAL_GRAPHS)[kind]; const g = load(file);
  const seconds = Number(i.duration) || 5; const frames = h3Frames(seconds); const seed = Math.max(0, Math.floor(Number(i.seed) || 0));
  const mp = i.resolution === '480p' ? PIKA_MEGAPIXELS['480p'] : PIKA_MEGAPIXELS['768p']; // 720p asked = 768p (videoCaps resolutionMap)
  const typed = String(i.enhancedPrompt ?? i.finalPrompt ?? i.prompt ?? '').trim();
  const prompt = mode === 't2v' || anchored(typed) ? typed : `${pikaAnchor(mode, frames)}\n\n${typed}`.trim();
  g['140:131'].inputs.prompt = prompt; g['140:133'].inputs.value = seconds; g['140:129'].inputs.noise_seed = seed;
  if (i.pikaLora && target === 'cloud') g['140:134'].inputs.lora_name = String(i.pikaLora);
  if (mode === 't2v') Object.assign(g['115'].inputs, { aspect_ratio: resolutionSelectorAspect(['16:9', '9:16', '1:1'].includes(i.aspect) ? i.aspect : '16:9'), megapixels: mp });
  else {
    g['148'].inputs.image = { __file: first }; g['154'].inputs.megapixels = mp;
    if (mode === 'flf') g['147'].inputs.image = { __file: i.lastFramePath };
    else { delete g['147']; delete g['140:131'].inputs.last_frame; }
  }
  pruneUnreachable(g, ['92']);
  return { tool: j.toolId, outKind: 'video', post: { kind: 'each' }, muxSourceAudio: false,
    notes: [`Pika H3 Flex ${target === 'cloud' ? 'on Comfy Cloud' : 'on your ComfyUI'} (official template ${PIKA_TEMPLATES[kind]}): ${mode}, ${seconds} s, ${mp} MP, 6 steps lcm`],
    passes: [{ label: 'Result', workflow: file, graph: g, output: '92', expect: { seed, prompt, seconds, frames, fps: 24, megapixels: mp, steps: 6, mode } }] };
}
