/**
 * "Render" (Direct a Shot step 3, 2026-10-24): the native plan for workflows/ltx25-layout-to-render-api.json. Pure, so tests check it without ComfyUI.
 *
 * Graph source: no official ComfyUI template ships for the Layout to Render LoRA, and Lightricks' own JSON
 * (LTX-2.5_ICLoRA_Layout_To_Render_Two_Stage_Distilled.json) sits in a gated repo. Ours is built from ComfyUI's official templates:
 *   - video_ltx2_5_t2v / video_ltx2_5_i2v (Comfy-Org/workflow_templates, MIT): the LTX-2.5 two-stage distilled ladder (stage 1 at half size with
 *     the 8-sigma distilled schedule, LTXVLatentUpsampler x2, stage 2, LTXVDualCFGGuider at CFG 1, euler_ancestral, audio latent carried over,
 *     VAEDecodeTiled, CreateVideo)
 *   - video_ltx2_3_ic_lora (same repo): the IC-LoRA guide pattern (LoraLoaderModelOnly → GetICLoRAParameters → LTXVAddGuide → LTXVCropGuides)
 *   - the LoRA's model card and https://docs.ltx.io/open-source-model/vfx-post-production/layout-to-render: stage 2 keeps the IC-LoRA and the layout
 *     guide (--stage-2-ic-lora) and enters at sigma 0.909375 (3 steps), seed 42; the art-directed first frame is REQUIRED and is encoded separately
 *     as a guide at temporal position -1 (before the clip), on both stages. Ours: VAEEncode + LTXVAddLatentGuide latent_idx -1 (core ComfyUI: a
 *     negative latent_idx places the guide before the start of the latent). Lightricks' own JSON may wire this differently; it is gated.
 * Our changes for Apple Silicon: the GGUF Q4_K_M transformer (UnetLoaderGGUF, city96/ComfyUI-GGUF) and the bf16 Gemma text encoder instead of
 * the int8 ConvRot files (CUDA kernels), the "conv" bf16 video VAE, and small draft sizes (shared/makeItReal.ts).
 * Every node class, input and option was checked against the user's ComfyUI /object_info (0.42.5); test/fixtures/object-info-ltx25-layout.json.
 */
import { MAKE_REAL_FPS, MAKE_REAL_SEED, type MakeRealPlan } from '../shared/makeItReal.js';

type G = Record<string, any>;
const isLink = (v: any) => Array.isArray(v) && v.length === 2 && typeof v[0] === 'string';
/** ffmpeg arguments that conform a recording to the plan: 24 fps, scaled to cover and centre-cropped to width×height, exactly `frames` frames, no audio. */
const cover = (w: number, h: number) => `scale=${w}:${h}:force_original_aspect_ratio=increase:flags=lanczos,crop=${w}:${h}`;
/** Comfy Cloud place (2026-10-27): `out` = the size the render is scaled back to (720p: cover to 1280×720, then squeezed to 1280×704 with no crop, so the
 *  result lines up with the mockup frame for frame), and `pad` holds the last frame a few frames, so a recording of exactly N s gives 24·N + 1 frames.
 *  The local route keeps cover + crop to its own size and never pads. */
const fitVf = (p: { width: number; height: number; out?: { width: number; height: number } }) => (p.out && (p.out.width !== p.width || p.out.height !== p.height) ? `${cover(p.out.width, p.out.height)},scale=${p.width}:${p.height}:flags=lanczos` : cover(p.width, p.height));
export function conformArgs(src: string, out: string, p: Pick<MakeRealPlan, 'width' | 'height' | 'frames' | 'fps'> & { out?: { width: number; height: number }; pad?: boolean }): string[] {
  return ['-y', '-v', 'error', '-i', src, '-vf', `fps=${p.fps},${p.pad ? 'tpad=stop_mode=clone:stop=12,' : ''}${fitVf(p)},setsar=1`,
    '-frames:v', String(p.frames), '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-pix_fmt', 'yuv420p', '-r', String(p.fps), out];
}
/** ffmpeg arguments that fit the first-frame picture to the plan's size the same way (cover + centre crop), so it lines up with the layout. */
export function firstFrameArgs(src: string, out: string, p: Pick<MakeRealPlan, 'width' | 'height'> & { out?: { width: number; height: number } }): string[] {
  return ['-y', '-v', 'error', '-i', src, '-frames:v', '1', '-vf', `${fitVf(p)},setsar=1`, '-update', '1', out];
}
/** Patch the graph for one job. `layout` and `firstFrame` are what the runner uploads ({__file} placeholders). Both are required (Lightricks' docs). */
export function patchMakeReal(g: G, a: { plan: MakeRealPlan; prompt: string; seed?: number; layout: unknown; firstFrame: unknown }): { graph: G; expect: Record<string, any> } {
  if (!a.firstFrame) throw new Error('make-it-real: the art-directed first frame is required');
  const { plan } = a; const seed = Number.isInteger(a.seed) ? Number(a.seed) : MAKE_REAL_SEED;
  g['10'].inputs.text = a.prompt;
  g['20'].inputs.file = a.layout;
  Object.assign(g['30'].inputs, { width: plan.stage1.width, height: plan.stage1.height, length: plan.frames, batch_size: 1 });
  Object.assign(g['23'].inputs, { width: plan.stage1.width, height: plan.stage1.height });
  g['33'].inputs.frames_number = plan.frames;
  for (const id of ['12', '33']) g[id].inputs.frame_rate = MAKE_REAL_FPS; g['62'].inputs.fps = MAKE_REAL_FPS;
  g['35'].inputs.noise_seed = seed; g['54'].inputs.noise_seed = seed + 1;
  g['22'].inputs.image = a.firstFrame; // fitted to the full (stage 2) size in parseInput; node 23 scales it to stage 1
  for (const [id, n] of Object.entries<any>(g)) for (const [k, v] of Object.entries<any>(n.inputs)) if (isLink(v) && !g[v[0]]) throw new Error(`make-it-real graph: ${id}.${k} links to missing node ${v[0]}`);
  return { graph: g, expect: { prompt: a.prompt, seed, width: plan.width, height: plan.height, stage1: plan.stage1, frames: plan.frames, seconds: plan.seconds, fps: MAKE_REAL_FPS, firstFrame: true } };
}
