/**
 * LTX-2.5 DFR (Diffusion Fidelity Rendering) image to video (2026-10-29): the "DFR" quality of the LTX-2.5 22B card (shared/ltxDfr.ts).
 * Graph: workflows/ltx25-dfr-i2v-api.json (local) and workflows/cloud/ltx25-dfr-i2v-api.json (Comfy Cloud), the same file, built by
 * scripts/build-ltx25-dfr.py from the official Comfy template video_ltx2_5_dfr_i2v (Comfy-Org/workflow_templates, MIT; template node ids kept
 * as 5953:<id>). The template's own model files on both places: the distilled 22B int8 ConvRot transformer, the bf16 Gemma 4 12B text encoder,
 * Lightricks' pixel-spatial detailing IC-LoRA, the x2 spatial and x2 temporal latent upscalers, the bf16 video and audio VAEs.
 * Our plan sets: the start frame (2004), the prompt (5953:5771; the template's prompt enhancer is left out, as its default), the output size
 * (5953:5904, stage 1 is half of it in the graph), the seconds (5953:5918) at 24 fps (5953:5917), the seed on all three stages (the template's one
 * promoted seed) and the third stage (5953:5901). The two If/Else switches that follow the third-stage toggle are resolved here (on: the temporal x2
 * video at 2 × fps; off: the stage-2 video at 24 fps) and the tiled decode is kept (the template's default), so the unused branch is pruned.
 * Pure: the plan only patches the graph, so tests check it without ComfyUI.
 */
import { imageDimsOfFile } from '../imageDims.js';
import { aspectOf, type MakeRealAspect } from '../shared/makeItReal.js';
import { LTX_DFR_DIMS, LTX_DFR_FPS, LTX_DFR_SECONDS, ltxDfrFrames, ltxDfrSmooth, LTX_DFR_FILES } from '../shared/ltxDfr.js';
import { pruneUnreachable, type Plan } from './plans.js';

export const LTX25_DFR_WORKFLOW = 'ltx25-dfr-i2v-api.json';
export const LTX25_DFR_CLOUD_GRAPH = 'cloud/ltx25-dfr-i2v-api.json';
export const LTX25_DFR_OUTPUT = '4852';
const P = '5953:';
/** Template node ids the plan writes (tests check them against the graph). */
export const DFR_NODES = { image: '2004', prompt: `${P}5771`, size: `${P}5904`, seconds: `${P}5918`, fps: `${P}5917`, stage3: `${P}5901`, seeds: [`${P}5808`, `${P}5843`, `${P}5878`],
  lora: `${P}5903`, fpsSwitch: `${P}5885`, videoSwitch: `${P}5888`, decodeSwitch: `${P}5908`, video: `${P}5895`, save: LTX25_DFR_OUTPUT } as const;
type G = Record<string, any>;
const isLink = (v: any) => Array.isArray(v) && v.length === 2 && typeof v[0] === 'string';
/** Output size for a job: the start frame's shape (nearest of 16:9 / 9:16 / 1:1), or the asked aspect. Stage 1 = half. */
export function ltxDfrSize(aspect: string | undefined, image?: { width: number; height: number } | null) {
  const a: MakeRealAspect = aspect === '16:9' || aspect === '9:16' || aspect === '1:1' ? aspect : image && image.width > 0 && image.height > 0 ? aspectOf(image.width, image.height) : '16:9';
  const [width, height] = LTX_DFR_DIMS[a]; return { width, height, stage1: { width: Math.floor(width / 32) * 16, height: Math.floor(height / 32) * 16 }, aspect: a };
}
/** Seconds the template takes (whole 2–5 s); anything else is the nearest (the bar already offers only these). */
export const ltxDfrSeconds = (s: unknown) => { const n = Number(s) || 5; return LTX_DFR_SECONDS.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a), LTX_DFR_SECONDS[0] as number); };
/** Point every input that reads `from` at `to` (an If/Else switch resolved). */
const rewire = (g: G, from: string, to: [string, number]) => { for (const n of Object.values<any>(g)) for (const [k, v] of Object.entries<any>(n.inputs)) if (isLink(v) && v[0] === from) n.inputs[k] = to; };
/** Patch the DFR graph for one job. opts.lora = the IC-LoRA's loader path on Comfy Cloud when the free check found it under another name (an import). */
export function patchLtx25Dfr(g: G, i: Record<string, any>, seed: number, opts: { lora?: string | null } = {}): { graph: G; output: string; expect: Record<string, any> } {
  const first: string | undefined = i.imagePath ?? i.refPaths?.[0]; if (!first) throw Object.assign(new Error('DFR needs a start frame (image to video)'), { reasonCode: 'input_invalid', errorType: 'validation' });
  const prompt = String(i.enhancedPrompt ?? i.finalPrompt ?? i.prompt ?? '');
  const size = ltxDfrSize(i.aspect, i.imageSize ?? imageDimsOfFile(first));
  const seconds = ltxDfrSeconds(i.duration); const frames = ltxDfrFrames(seconds); const smooth = ltxDfrSmooth(i);
  const N = DFR_NODES;
  g[N.image].inputs.image = { __file: first };
  g[N.prompt].inputs.text = prompt;
  Object.assign(g[N.size].inputs, { 'resize_type.width': size.width, 'resize_type.height': size.height });
  g[N.seconds].inputs.value = seconds; g[N.fps].inputs.value = LTX_DFR_FPS; g[N.stage3].inputs.value = smooth;
  for (const s of N.seeds) g[s].inputs.noise_seed = seed;
  if (opts.lora) g[N.lora].inputs.lora_name = opts.lora;
  // the template's switches, resolved: video = temporal x2 (on) or stage 2 (off); fps = 2 × fps or fps; decode = tiled (the template's default)
  const sw = (id: string, on: boolean) => { const n = g[id]; const pick = on ? n.inputs.on_true : n.inputs.on_false; rewire(g, id, pick); delete g[id]; };
  sw(N.videoSwitch, smooth); sw(N.fpsSwitch, smooth); sw(N.decodeSwitch, g[`${P}5915`]?.inputs?.value !== false);
  pruneUnreachable(g, [LTX25_DFR_OUTPUT]);
  for (const [id, n] of Object.entries<any>(g)) for (const [k, v] of Object.entries<any>(n.inputs)) if (isLink(v) && !g[v[0]]) throw new Error(`ltx25-dfr graph: ${id}.${k} links to missing node ${v[0]}`);
  const fps = smooth ? LTX_DFR_FPS * 2 : LTX_DFR_FPS;
  return { graph: g, output: LTX25_DFR_OUTPUT, expect: { mode: 'i2v', dfr: true, seed, prompt, seconds, frames, outFrames: smooth ? (frames - 1) * 2 + 1 : frames, fps, smooth, width: size.width, height: size.height, stage1: size.stage1, aspect: size.aspect, audio: true,
    stages: smooth ? 3 : 2, steps: smooth ? [8, 3, 4] : [8, 3], files: Object.values(LTX_DFR_FILES) } };
}
/** One-pass plan (local and Comfy Cloud share it; the caller loads the graph of its place). */
export function ltxDfrPlan(toolId: string, workflow: string, g: G, i: Record<string, any>, seed: number, opts: { lora?: string | null } = {}): Plan {
  const { graph, output, expect } = patchLtx25Dfr(g, i, seed, opts);
  return { tool: toolId, outKind: 'video', post: { kind: 'each' }, muxSourceAudio: false,
    notes: [`LTX-2.5 22B · DFR (official template video_ltx2_5_dfr_i2v): ${expect.seconds} s, ${expect.width}×${expect.height} (stage 1 ${expect.stage1.width}×${expect.stage1.height}), ${expect.smooth ? '3 stages, 48 fps' : '2 stages, 24 fps'}`],
    passes: [{ label: 'Result', workflow, graph, output, expect }] };
}
