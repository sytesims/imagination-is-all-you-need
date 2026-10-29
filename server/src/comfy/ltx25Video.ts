/**
 * LTX-2.5 22B on Generate Video (2026-10-25): the free local route `comfy-ltx25-video`, with LTX's own generated sound in every mode.
 * Graphs (Comfy-Org/workflow_templates, MIT; tutorial https://docs.comfy.org/tutorials/video/ltx/ltx-2-5):
 *  - workflows/ltx25-ti2v-api.json, flattened from the official template video_ltx2_5_i2v (same node ids). Text to video is that template's own
 *    "Switch to Text to Video" (the image nodes are bypassed): the plan drops the image nodes and wires the empty latent straight in.
 *    Two stages: stage 1 at half size with the 8 distilled sigmas, LTXVLatentUpsampler x2, stage 2 at full size (0.85, 0.725, 0.4219, 0);
 *    CFG 1, euler_ancestral, the start frame put in place on both stages (LTXVImgToVideoInplace 0.7, then 1.0), audio latent carried over.
 *  - workflows/ltx25-flf-api.json, from the official template video_ltx2_5_flf2v (same node ids for its nodes): first frame guide at frame 0 and
 *    last frame guide at frame -1 (LTXVAddGuide 0.7), SamplerEulerAncestral eta 0. The template is one stage at full size; ours runs the same
 *    two-stage ladder as the text / image template (guides cropped before the x2 upscale, added again at 1.0 on stage 2, cropped before decode).
 * Our changes for Apple Silicon, the same files as Direct a Shot’s Render step (comfy/makeItReal.ts): the GGUF Q4_K_M transformer (UnetLoaderGGUF, city96/ComfyUI-GGUF)
 * and the bf16 Gemma 4 text encoder instead of the int8 ConvRot files (CUDA kernels), the "conv" bf16 video VAE, ImageScale (lanczos, centre crop)
 * to the output size instead of the template's resize-by-long-side, no prompt enhancer (it needs another Gemma file), and small sizes:
 * Draft = 768 long side and Sharper = 1024×576 (shared/makeItReal.ts MAKE_REAL_SIZES; stage 1 is half of that, on LTX's 32 grid).
 * Seamless loop (2026-10-26): the FLF graph with the start frame as BOTH guides (frame 0 and frame -1; one Load Image), then the duplicate last frame
 * is dropped in the graph (core ImageFromBatch: frames 0 … N-2) and the sound trimmed to the same length (core TrimAudioDuration), so the clip
 * plays seamlessly on repeat: 2 s = 49 rendered frames → 48 kept = exactly 2.0 s at 24 fps. No dedicated LTX-2.x loop template exists.
 * Drift fix (2026-10-26, loopTail): the last 8 kept frames take back the colour drift (core ColorTransfer) and the last 3 crossfade into frame 0.
 * Morph (Transitions, 2026-10-26): the same FLF graph and patch, credited to the official template video_ltx2_5_flf2v (shared/appWorkflows.ts).
 * LoRA slot (2026-10-26): withLtxLoras() chains core LoraLoaderModelOnly nodes after the GGUF loader (registry: shared/ltxLoras.ts); the plan asks
 * ltxLorasForJob() which ones a job loads (none for plain Generate Video).
 * Every node class, input and option was checked against the user's ComfyUI /object_info (test/fixtures/object-info-ltx25-video.json).
 * Pure: the plan only patches the graph, so tests check it without ComfyUI.
 */
import { imageDimsOfFile } from '../imageDims.js';
import { MAKE_REAL_SIZES, aspectOf, type MakeRealAspect } from '../shared/makeItReal.js';
import { LTX_LORAS, type LtxLoraUse } from '../shared/ltxLoras.js';

export const LTX25_VIDEO = 'comfy-ltx25-video';
export const LTX25_TI2V_WORKFLOW = 'ltx25-ti2v-api.json';
export const LTX25_FLF_WORKFLOW = 'ltx25-flf-api.json';
export const LTX25_FPS = 24;
/** Resolution values the Video bar sends: Draft (the default) and Sharper, the two sizes of Direct a Shot’s Render step, plus 720p (2026-10-27,
 *  Comfy Cloud only: 1280×704 / 704×1280 / 960×960, so a 1280×720 source or result is matched without a downscale; too heavy for a Mac). */
export const LTX25_RESOLUTIONS = ['448p', '576p', '720p'] as const;
/** What the local route renders (the Mac sizes); 720p is the Comfy Cloud route's (comfy/ltx25Cloud.ts). */
export const LTX25_LOCAL_RESOLUTIONS = ['448p', '576p'] as const;
export const LTX25_RES_LABELS: Record<string, string> = { '448p': 'Draft', '576p': 'Sharper', '720p': '720p' };
const SIZE_OF: Record<string, keyof typeof MAKE_REAL_SIZES> = { '448p': 'quick', '576p': 'standard' };
/** 720p: stage 2 sizes on the 64 grid (stage 1 = half, on LTX's 32 grid). 720 is not on the grid, so 16:9 renders 1280×704 (the join / player scales it). */
export const LTX25_720P_DIMS: Record<MakeRealAspect, [number, number]> = { '16:9': [1280, 704], '9:16': [704, 1280], '1:1': [960, 960] };
/** Frames for a clip length: seconds × 24 + 1, the templates' own length rule (a * b + 1), on LTX's 8n + 1 grid: 2 s → 49, 5 s → 121. */
export const ltxVideoFrames = (seconds: number) => { const n = Math.max(1, Math.round((Number(seconds) || 0) * LTX25_FPS)); return Math.round(n / 8) * 8 + 1; };
/** Output size (stage 2) and stage 1 (half). 'auto' (or no aspect) follows the start frame's shape (nearest of 16:9 / 9:16 / 1:1); text to video: 16:9. */
export function ltx25Size(resolution: string | undefined, aspect: string | undefined, image?: { width: number; height: number } | null) {
  const hd = String(resolution) === '720p'; const size = hd ? '720p' as const : SIZE_OF[String(resolution)] ?? 'quick';
  const a: MakeRealAspect = aspect === '16:9' || aspect === '9:16' || aspect === '1:1' ? aspect : image && image.width > 0 && image.height > 0 ? aspectOf(image.width, image.height) : '16:9';
  const [width, height] = size === '720p' ? LTX25_720P_DIMS[a] : MAKE_REAL_SIZES[size].dims[a];
  return { width, height, stage1: { width: width / 2, height: height / 2 }, aspect: a, size };
}
type G = Record<string, any>;
/** Shared LTX LoRA slot (2026-10-26): chain one core LoraLoaderModelOnly per LoRA after the model loader and point every model input at the last one.
 *  Works on any LTX-2.5 graph with one UnetLoaderGGUF (local) or UNETLoader (the Comfy Cloud twins). Ids 950+ are ours. No LoRA = the graph is untouched. Files: shared/ltxLoras.ts. */
export function withLtxLoras(g: G, loras: { file: string; strength: number }[]): G {
  if (!loras.length) return g;
  const unet = Object.keys(g).find((id) => g[id].class_type === 'UnetLoaderGGUF' || g[id].class_type === 'UNETLoader'); if (!unet) throw new Error('ltx25 LoRA: no UnetLoaderGGUF / UNETLoader in the graph');
  let prev: [string, number] = [unet, 0];
  loras.forEach((l, k) => { const id = String(950 + k); g[id] = { class_type: 'LoraLoaderModelOnly', inputs: { model: prev, lora_name: l.file, strength_model: l.strength }, _meta: { title: `LoRA: ${l.file}` } }; prev = [id, 0]; });
  const own = new Set(loras.map((_, k) => String(950 + k)));
  for (const [id, n] of Object.entries<any>(g)) { if (own.has(id)) continue; for (const [k, v] of Object.entries<any>(n.inputs)) if (Array.isArray(v) && v[0] === unet && v[1] === 0) n.inputs[k] = prev; }
  return g;
}
const isLink = (v: any) => Array.isArray(v) && v.length === 2 && typeof v[0] === 'string';
/** A loop job: a start frame (image to video) with loop on. It runs the FLF graph with that frame at both ends. */
export const isLtx25Loop = (i: Record<string, any> | undefined) => !!i?.loop && i.mode === 'i2v';
/** The words a loop adds to the prompt: motion that comes back to the start (the model may otherwise drift away or hold still). */
export const LTX25_LOOP_WORDS = 'Seamless loop: the motion flows out and returns to exactly where it began, ending on the opening frame.';
/** Which graph a job runs: first + last frame (and a loop) → the FLF graph; text and image to video share one graph. */
export const ltx25WorkflowFor = (mode: string | undefined, loop = false) => (mode === 'flf' || (loop && mode === 'i2v') ? LTX25_FLF_WORKFLOW : LTX25_TI2V_WORKFLOW);
/** Patch the graph for one job (the graph of ltx25WorkflowFor(i.mode)). Returns the patched graph, its output node and what was asked. */
export function patchLtx25Video(g: G, i: Record<string, any>, seed: number, loras: LtxLoraUse[] = []): { graph: G; output: string; expect: Record<string, any> } {
  const loop = isLtx25Loop(i);
  const mode = i.mode === 'flf' || loop ? 'flf' : i.mode === 'i2v' ? 'i2v' : 't2v';
  const prompt = String(i.enhancedPrompt ?? i.finalPrompt ?? i.prompt ?? '');
  const first: string | undefined = mode === 't2v' ? undefined : (i.imagePath ?? i.refPaths?.[0]);
  const last: string | undefined = loop ? first : mode === 'flf' ? i.lastFramePath : undefined;
  if (mode === 'flf' && (!first || !last)) throw new Error(loop ? 'ltx25-video: a loop needs a start frame' : 'ltx25-video: first + last frame needs both pictures');
  const dims = first ? (i.imageSize ?? imageDimsOfFile(first)) : null;
  const size = ltx25Size(i.resolution, i.aspect, dims);
  const seconds = Number(i.duration) || 3; const frames = ltxVideoFrames(seconds);
  const s1 = { width: size.stage1.width, height: size.stage1.height, length: frames, batch_size: 1 };
  let output: string;
  if (mode === 'flf') {
    g['222'].inputs.text = prompt; g['202'].inputs.frame_rate = LTX25_FPS;
    Object.assign(g['201'].inputs, s1); Object.assign(g['197'].inputs, { frames_number: frames, frame_rate: LTX25_FPS });
    for (const id of ['213', '214']) Object.assign(g[id].inputs, { width: size.width, height: size.height });
    g['31'].inputs.image = { __file: first }; g['39'].inputs.image = { __file: last };
    g['196'].inputs.noise_seed = seed; g['218'].inputs.fps = LTX25_FPS; output = '68';
    if (loop) loopTail(g, frames);
  } else {
    g['364'].inputs.text = prompt; g['365'].inputs.frame_rate = LTX25_FPS;
    Object.assign(g['356'].inputs, s1); Object.assign(g['366'].inputs, { frames_number: frames, frame_rate: LTX25_FPS });
    g['339'].inputs.noise_seed = seed; g['370'].inputs.fps = LTX25_FPS; output = '75';
    if (first) { g['395'].inputs.image = { __file: first }; Object.assign(g['351'].inputs, { width: size.width, height: size.height }); }
    else { // text to video: the template's "Switch to Text to Video" (image nodes bypassed) → drop them and wire the latents straight in
      g['377'].inputs.video_latent = ['356', 0]; g['340'].inputs.video_latent = ['348', 0];
      for (const id of ['395', '351', '350', '357', '349']) delete g[id];
    }
  }
  withLtxLoras(g, loras);
  if (mode !== 'flf' && loras.some((l) => LTX_LORAS[l.id]?.stage2Sampler === 'euler')) g['341'].inputs.sampler_name = 'euler'; // the LoRA author's stage 2 (flf: one shared sampler at eta 0 already)
  for (const [id, n] of Object.entries<any>(g)) for (const [k, v] of Object.entries<any>(n.inputs)) if (isLink(v) && !g[v[0]]) throw new Error(`ltx25-video graph: ${id}.${k} links to missing node ${v[0]}`);
  return { graph: g, output, expect: { mode, seed, prompt, seconds, frames, fps: LTX25_FPS, width: size.width, height: size.height, stage1: size.stage1, aspect: size.aspect, size: size.size, audio: true, firstFrame: !!first, lastFrame: !!last,
    ...(loop ? { loop: true, framesKept: frames - 1, loopFix: { tail: LOOP_TAIL, crossfade: LOOP_XFADE } } : {}), ...(loras.length ? { loras: loras.map((l) => ({ id: l.id, file: l.file, strength: l.strength })) } : {}) } };
}
/** Loop drift fix (2026-10-26): the last LOOP_TAIL kept frames are pulled back to frame 0 so the wrap-around doesn't jump.
 *  1 colour: core ColorTransfer (reinhard_lab, source_stats target_frame = the tail's last frame, reference = frame 0) works out the
 *    colour shift the clip drifted by, and each tail frame takes a growing share of it (ImageBlend, 1/8 … 8/8).
 *  2 crossfade: the last LOOP_XFADE frames blend toward frame 0 (1/4, 2/4, 3/4), the mix_first_last idea of amagicai/comfyui-seamless-loop
 *    (README maths; the node itself needs opencv, so it is rebuilt from core nodes). Kept to 3 frames so fast motion doesn't ghost. */
export const LOOP_TAIL = 8; export const LOOP_XFADE = 3;
const r2 = (x: number) => Math.round(x * 100) / 100;
/** Loop: one start frame guides both ends (the last-frame image nodes go), then the repeated last frame and its sound are cut so the clip repeats seamlessly. */
function loopTail(g: G, frames: number) {
  for (const id of ['204', '303']) g[id].inputs.image = ['199', 0]; // both end guides read the start frame's prepared image
  for (const id of ['39', '214', '195']) delete g[id];
  const kept = frames - 1; const T = Math.min(LOOP_TAIL, kept - 1); const C = Math.min(LOOP_XFADE, T);
  g['900'] = { class_type: 'ImageFromBatch', inputs: { image: ['219', 0], batch_index: 0, length: kept }, _meta: { title: 'Loop: drop the repeated last frame' } };
  g['901'] = { class_type: 'TrimAudioDuration', inputs: { audio: ['220', 0], start_index: 0, duration: kept / LTX25_FPS }, _meta: { title: 'Loop: sound to the same length' } };
  const B = (image: [string, number], batch_index: number, length: number, title: string) => ({ class_type: 'ImageFromBatch', inputs: { image, batch_index, length }, _meta: { title } });
  g['902'] = B(['900', 0], 0, kept - T, 'Loop fix: frames before the tail'); g['903'] = B(['900', 0], 0, 1, 'Loop fix: frame 0'); g['904'] = B(['900', 0], kept - T, T, 'Loop fix: the tail');
  g['905'] = { class_type: 'ColorTransfer', inputs: { image_target: ['904', 0], image_ref: ['903', 0], method: 'reinhard_lab', source_stats: 'target_frame', 'source_stats.target_index': T - 1, strength: 1 }, _meta: { title: 'Loop fix: colour drift back to frame 0' } };
  let prev: [string, number] = ['902', 0];
  for (let j = 0; j < T; j++) {
    g[String(910 + j)] = B(['904', 0], j, 1, `Loop fix: tail frame ${j + 1}`); g[String(920 + j)] = B(['905', 0], j, 1, `Loop fix: tail frame ${j + 1}, colour fixed`);
    g[String(930 + j)] = { class_type: 'ImageBlend', inputs: { image1: [String(910 + j), 0], image2: [String(920 + j), 0], blend_factor: r2((j + 1) / T), blend_mode: 'normal' }, _meta: { title: `Loop fix: colour ${j + 1}/${T}` } };
    let out: [string, number] = [String(930 + j), 0]; const k = j - (T - C);
    if (k >= 0) { g[String(940 + j)] = { class_type: 'ImageBlend', inputs: { image1: out, image2: ['903', 0], blend_factor: r2((k + 1) / (C + 1)), blend_mode: 'normal' }, _meta: { title: `Loop fix: crossfade into frame 0, ${k + 1}/${C + 1}` } }; out = [String(940 + j), 0]; }
    g[String(970 + j)] = { class_type: 'ImageBatch', inputs: { image1: prev, image2: out }, _meta: { title: 'Loop fix: join' } }; prev = [String(970 + j), 0];
  }
  Object.assign(g['218'].inputs, { images: prev, audio: ['901', 0] });
}
