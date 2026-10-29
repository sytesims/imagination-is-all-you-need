/**
 * Object Swap → ComfyUI graph preparation (Wan 2.2 Animate, Mix mode). Only used when OPENHIGGSFIELD_BACKEND=comfy.
 * Workflows: workflows/object-swap-wan-animate/ext-{0..6}.json + mask-ext-{0..6}.json (scripts/build-object-swap-wan-animate.py), fallback
 * workflows/object-swap/ext-{0..6}.json (scripts/build-object-swap.py; forced with OPENHIGGSFIELD_SWAP_WORKFLOWS=legacy). Node ids per workflows/node-map.json:
 *   10 LoadImage (reference), 145 LoadVideo (source, 16 fps), 21 positive prompt, 159/160 width/height,
 *   229 PointsEditor (SAM2 point), 232:63 + extN:91 seeds, 277 SaveVideo.
 */
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { WORKFLOWS_DIR, DATA_DIR } from '../config.js';
import { runFfmpeg } from '../ffmpeg.js';
import { env } from '../env.js';
import { h3SwapPrompt } from '../shared/h3SwapPrompt.js';
export { h3SwapPrompt };

export const COMFY_FPS = 16;
/** Output seconds per variant at 16 fps: 77-frame base + N × 72-frame extends. */
export const LENGTH_VARIANTS = [4.8, 9.3, 13.8, 18.3, 22.8, 27.3, 31.8] as const;
const LONG_SIDE = 832; // Wan 480p class: 832×480 landscape / 480×832 portrait

const r16 = (n: number) => Math.max(16, Math.round(n / 16) * 16);
/** Processed resolution: long side 832, short side by aspect, both multiples of 16. */
/** Long side by quality: 480p → 832, 720p → 1280 (Wan 2.2 Animate supports 480P and 720P); 1080p renders at 720p (upscale pass for more). */
export const longSideFor = (res?: string) => (res === '480p' ? LONG_SIDE : res === '720p' || res === '1080p' ? 1280 : LONG_SIDE);
export function processedSize(srcW: number, srcH: number, res?: string) {
  const L = longSideFor(res);
  if (!(srcW > 0 && srcH > 0)) return { width: L, height: r16((L * 9) / 16) };
  return srcW >= srcH ? { width: L, height: r16((L * srcH) / srcW) } : { width: r16((L * srcW) / srcH), height: L };
}
/** Workflow sets: the hand-authored Wan Animate set (default, has mask-ext-N) and the template conversion (fallback). */
export const SWAP_SET_WAN = 'object-swap-wan-animate', SWAP_SET_LEGACY = 'object-swap';
export function swapSet(): string {
  if (env('SWAP_WORKFLOWS') === 'legacy') return SWAP_SET_LEGACY;
  return existsSync(path.join(WORKFLOWS_DIR, SWAP_SET_WAN, 'ext-0.json')) ? SWAP_SET_WAN : SWAP_SET_LEGACY;
}
/** Smallest ext-N whose output covers the clip; longer clips use ext-6 and are trimmed to it. mask → mask-ext-N (Wan set only; legacy has none). */
export function pickVariant(durationSec: number, opts: { mask?: boolean } = {}) {
  const n = LENGTH_VARIANTS.findIndex((s) => s >= durationSec - 0.05);
  const ext = n === -1 ? LENGTH_VARIANTS.length - 1 : n;
  const set = swapSet(); const maskFile = path.join(WORKFLOWS_DIR, set, `mask-ext-${ext}.json`);
  const mask = !!opts.mask && existsSync(maskFile);
  return { ext, set, mask, file: mask ? maskFile : path.join(WORKFLOWS_DIR, set, `ext-${ext}.json`), seconds: LENGTH_VARIANTS[ext], trimmed: n === -1 };
}
/** UI click point (normalized x,y in 0..1 from PointPicker) → SAM2 PointsEditor pixels in the processed frame. Default: centre. */
export function samPoint(point: { x: number; y: number } | null | undefined, size: { width: number; height: number }) {
  const x = Math.min(size.width - 1, Math.max(0, Math.round((point?.x ?? 0.5) * size.width)));
  const y = Math.min(size.height - 1, Math.max(0, Math.round((point?.y ?? 0.5) * size.height)));
  return { x, y };
}

/** Mask grow (Object Swap maskGrow, same px as the free mask preview, measured on an 832 px long side): tight / normal / loose dilate the
 *  subject mask; box also coarsens it into 64 px blocks (≈ its bounding area). Shared with routesMaskPreview.ts. */
export const MASK_GROW_PX = { tight: 8, normal: 20, loose: 40, box: 20 } as const;
export type MaskGrow = keyof typeof MASK_GROW_PX;
export const MASK_PREVIEW_LONG = 832;
export interface SwapPlan { ext: number; set: string; mask: boolean; file: string; seconds: number; trimmed: boolean; width: number; height: number; point: { x: number; y: number }; grow?: { maskGrow: MaskGrow; expand: number; blockSize: number } | null }
export function planObjectSwap(input: { duration: number; width: number; height: number; resolution?: string; draft?: boolean; point?: { x: number; y: number; t?: number } | null; maskPath?: string; maskGrow?: string }): SwapPlan {
  const size = processedSize(input.width, input.height, input.draft ? '480p' : input.resolution);
  const mg = input.maskGrow && input.maskGrow in MASK_GROW_PX ? input.maskGrow as MaskGrow : null; // unset → the workflow default (GrowMask 10, Blockify 32)
  const grow = mg ? { maskGrow: mg, expand: Math.max(1, Math.round(MASK_GROW_PX[mg] * Math.max(size.width, size.height) / MASK_PREVIEW_LONG)), blockSize: mg === 'box' ? 64 : 32 } : null;
  return { ...pickVariant(input.duration, { mask: !!input.maskPath }), ...size, point: samPoint(input.point, size), grow };
}

/** Apply the plan + job inputs to a loaded ext-N graph (pure; returns a new object). */
/** Up to 4 references. Wan Animate's reference_image accepts an image batch (it is VAE-encoded as a short reference
 * sequence), so refs 2..4 are added as LoadImage nodes and batched; CLIP vision stays on ref 1.
 * Fallback to 1 ref with OPENHIGGSFIELD_SWAP_MULTI_REF=0 (the model was trained with a single reference). */
export const MAX_SWAP_REFS = 4;
export const multiRefEnabled = () => env('SWAP_MULTI_REF') !== '0';
export function patchGraph(graph: Record<string, any>, plan: SwapPlan, v: { image: unknown; video: unknown; prompt: string; seed: number; extraRefs?: unknown[]; mask?: unknown }) {
  const g = structuredClone(graph);
  g['10'].inputs.image = v.image;
  const extra = multiRefEnabled() ? (v.extraRefs ?? []).slice(0, MAX_SWAP_REFS - 1) : [];
  if (extra.length) {
    let batch: [string, number] = ['10', 0];
    extra.forEach((img, i) => {
      const load = `oj_ref${i + 2}`, b = `oj_refbatch${i + 2}`;
      g[load] = { inputs: { image: img }, class_type: 'LoadImage', _meta: { title: `OpenHiggsfield · reference ${i + 2}` } };
      g[b] = { inputs: { image1: batch, image2: [load, 0] }, class_type: 'ImageBatch', _meta: { title: `OpenHiggsfield · reference batch ${i + 2}` } };
      batch = [b, 0];
    });
    for (const n of Object.values(g) as any[]) if (n.class_type === 'WanAnimateToVideo' && n.inputs.reference_image) n.inputs.reference_image = batch;
  }
  g['145'].inputs.file = v.video;
  if (g['oj_mask_video']) { if (v.mask == null) throw new Error('mask-ext graph needs a mask video'); g['oj_mask_video'].inputs.file = v.mask; } // matte upload, 16 fps, same size
  g['21'].inputs.text = v.prompt;
  g['159'].inputs.value = plan.width; g['160'].inputs.value = plan.height;
  const pts = [{ x: plan.point.x, y: plan.point.y }];
  Object.assign(g['229'].inputs, {
    width: plan.width, height: plan.height, coordinates: JSON.stringify(pts),
    points_store: JSON.stringify({ positive: pts, negative: [{ x: 0, y: 0 }] }),
  });
  if (plan.grow) { for (const n of Object.values(g) as any[]) { if (n.class_type === 'GrowMask') n.inputs.expand = plan.grow.expand; if (n.class_type === 'BlockifyMask') n.inputs.block_size = plan.grow.blockSize; } }
  const seed = Math.max(0, Math.floor(v.seed)) || Math.floor(Math.random() * 2 ** 32);
  if (g['232:63']) g['232:63'].inputs.seed = seed;
  for (const [k, n] of Object.entries(g)) if (/^ext\d+:91$/.test(k)) (n as any).inputs.seed = seed + Number(k.slice(3, k.indexOf(':')));
  return g;
}

/** ffmpeg: source → 16 fps at the processed size (and trimmed to the variant length). Audio is dropped here; the server remuxes the original after. */
export async function convertTo16fps(src: string, out: string, plan: SwapPlan) {
  const code = await runFfmpeg(['-y', '-i', src, '-t', String(plan.seconds), '-vf', `fps=${COMFY_FPS},scale=${plan.width}:${plan.height}:flags=lanczos,setsar=1`,
    '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p', out]);
  if (code !== 0) throw new Error(`ffmpeg 16 fps conversion failed (exit ${code})`);
  return out;
}

/** Full prep for one job: plan, convert, load + patch the variant. `bind` turns local paths into SDK assets. */
export async function prepareObjectSwap(job: { id: string; input: Record<string, any> }, prompt: string, bind: (p: string) => unknown) {
  const plan = planObjectSwap(job.input as any);
  const video16 = await convertTo16fps(job.input.videoPath, path.join(DATA_DIR, `${job.id}-16fps.mp4`), plan);
  const mask16 = plan.mask ? await convertTo16fps(job.input.maskPath, path.join(DATA_DIR, `${job.id}-matte-16fps.mp4`), plan) : null; // same fps/size/length as the source
  const graph = JSON.parse(await readFile(plan.file, 'utf8'));
  return { plan, video16, mask16, graph: patchGraph(graph, plan, { image: bind(job.input.imagePath), video: bind(video16), prompt, seed: Number(job.input.seed) || 0,
    extraRefs: ((job.input.refPaths as string[]) ?? []).slice(1, MAX_SWAP_REFS).map(bind), ...(mask16 ? { mask: bind(mask16) } : {}) }) };
}

/** Backup route `comfy-h3-charswap` (non-default): H3 Character Swap LoRA v1.5 on MiniMax H3 Ref2VA, workflows/object-swap-h3-charswap-api.json.
 * Node ids per workflows/node-maps/object-swap-h3-charswap.json: 10 LoadVideo (source, frames + audio as Ref2VA refs), 12 LoadImage (character),
 * 13 prompt, 15 seconds (→ 24 fps H3 frame grid), 21 seed. Recipe baked in: LoRA 1.0 + fl2v turbo 8-step 1.0, 8 steps, CFG 1, er_sde, normal. */
export const H3_SWAP_WORKFLOW = 'object-swap-h3-charswap-api.json';
export const H3_SWAP_MAX_SEC = 15;
/** Motion Transfer on the same graph (H3 addition 3, 2026-10-17): the driving clip's motion/camera/timing, cast rebuilt from the reference. */
export const h3MotionPrompt = () => 'Rebuild <Video 1> with the character in <Picture 1> performing exactly the same motion. Keep the character\'s face, hair, clothing and style from <Picture 1>. Follow the source pose, movement, camera and timing frame by frame.';
export function patchH3SwapGraph(graph: Record<string, any>, v: { image: unknown; video: unknown; prompt: string; seed: number; seconds: number }) {
  const g = structuredClone(graph);
  g['10'].inputs.file = v.video; g['12'].inputs.image = v.image; g['13'].inputs.value = v.prompt;
  g['15'].inputs.value = Math.min(H3_SWAP_MAX_SEC, Math.max(1, Number(v.seconds) || 5));
  g['21'].inputs.noise_seed = Math.max(0, Math.floor(v.seed)) || Math.floor(Math.random() * 2 ** 32);
  return g;
}
export async function prepareH3Swap(job: { id: string; input: Record<string, any> }, bind: (p: string) => unknown) {
  const graph = JSON.parse(await readFile(path.join(WORKFLOWS_DIR, H3_SWAP_WORKFLOW), 'utf8'));
  return patchH3SwapGraph(graph, { image: bind(job.input.imagePath), video: bind(job.input.videoPath), prompt: job.input.mode === 'motion_transfer' ? h3MotionPrompt() : h3SwapPrompt(job.input.target), seed: Number(job.input.seed) || 0, seconds: Number(job.input.duration) || 5 });
}
