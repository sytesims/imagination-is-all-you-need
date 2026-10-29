/**
 * Wan 2.2 TI2V 5B on Generate Video (2026-10-24): the free local route `comfy-wan22-5b`, text to video and image to video in one graph.
 * Graph: workflows/wan22-ti2v-5b-api.json, flattened from the official Comfy template video_wan2_2_5B_ti2v
 * (https://github.com/Comfy-Org/workflow_templates/blob/main/templates/video_wan2_2_5B_ti2v.json, MIT; tutorial https://docs.comfy.org/tutorials/video/wan/wan2_2).
 * Our changes, for Apple Silicon (PyTorch MPS): the fp16 umt5 text encoder instead of fp8 (MPS has no float8), euler instead of uni_pc.
 * Pure: the plan only patches the graph (size, length, prompt, seed, steps, start frame) so tests can check it without ComfyUI.
 */
import { imageDimsOfFile } from '../imageDims.js';

export const WAN22_5B = 'comfy-wan22-5b';
export const WAN22_5B_WORKFLOW = 'wan22-ti2v-5b-api.json';
/** Quality = the template's 20 steps; Fast = a 12-step draft (our choice, about 40 % quicker on slow machines). */
export const WAN22_5B_STEPS: Record<'quality' | 'fast', number> = { quality: 20, fast: 12 };
export const WAN22_5B_FPS = 24;
/** Frames for a clip length on Wan's 4n+1 grid at 24 fps: 2 s → 49, 5 s → 121 (the template's length). */
export const wanFrames = (seconds: number) => { const n = Math.max(5, Math.round(seconds * WAN22_5B_FPS)); return Math.round(n / 4) * 4 + 1; };
/** Pixel budget per tier: 704p = the template's 1280×704, 480p = 832×480. */
const AREA: Record<string, number> = { '704p': 1280 * 704, '480p': 832 * 480 };
const FIXED: Record<string, Record<string, [number, number]>> = {
  '704p': { '16:9': [1280, 704], '9:16': [704, 1280], '1:1': [960, 960] },
  '480p': { '16:9': [832, 480], '9:16': [480, 832], '1:1': [640, 640] },
};
const r32 = (v: number) => Math.max(256, Math.round(v / 32) * 32); // Wan22ImageToVideoLatent width/height step 32
/** Output size for a tier and aspect. 'auto' follows the start frame's shape at the tier's pixel budget (text to video: 16:9). */
export function wan22Size(resolution: string | undefined, aspect: string | undefined, image?: { width: number; height: number } | null): { width: number; height: number } {
  const tier = resolution === '480p' ? '480p' : '704p'; const a = aspect && FIXED[tier][aspect] ? aspect : null;
  if (a) { const [width, height] = FIXED[tier][a]; return { width, height }; }
  if (image && image.width > 0 && image.height > 0) { const ratio = Math.min(2.4, Math.max(1 / 2.4, image.width / image.height)); const area = AREA[tier];
    return { width: r32(Math.sqrt(area * ratio)), height: r32(Math.sqrt(area / ratio)) }; }
  const [width, height] = FIXED[tier]['16:9']; return { width, height };
}
type G = Record<string, any>;
/** Patch the graph for one job. Returns the patched graph and what was asked (for graph assertions). */
export function patchWan22(g: G, i: Record<string, any>, seed: number): { graph: G; expect: Record<string, any> } {
  const prompt = String(i.enhancedPrompt ?? i.finalPrompt ?? i.prompt ?? '');
  const image: string | undefined = i.mode === 'i2v' ? (i.imagePath ?? i.refPaths?.[0]) : undefined;
  const dims = image ? (i.imageSize ?? imageDimsOfFile(image)) : null;
  const size = wan22Size(i.resolution, i.aspect, dims);
  const seconds = Number(i.duration) || 2; const length = wanFrames(seconds);
  const steps = Number(i.steps) || WAN22_5B_STEPS.quality;
  g['6'].inputs.text = prompt;
  Object.assign(g['55'].inputs, { width: size.width, height: size.height, length, batch_size: 1 });
  Object.assign(g['3'].inputs, { seed, steps });
  g['57'].inputs.fps = WAN22_5B_FPS;
  if (image) g['56'].inputs.image = { __file: image };
  else { delete g['55'].inputs.start_image; delete g['56']; } // text to video: the template's Load Image stays bypassed
  return { graph: g, expect: { seed, prompt, seconds, frames: length, fps: WAN22_5B_FPS, width: size.width, height: size.height, steps, image: !!image } };
}
