/**
 * LTX-2.5 DFR (Diffusion Fidelity Rendering, 2026-10-29): the "DFR" quality of the LTX-2.5 22B card on Create Video, image to video only.
 * One source of truth for its words, sizes, lengths, the 48 fps switch and the price keys (server: comfy/ltx25Dfr.ts plans it, routing/routes.ts
 * routes and prices it; web: the bar reads the copy from the model's videoLimits).
 * What it is (docs.comfy.org/tutorials/video/ltx/ltx-2-5-dfr, in our words): the official Comfy template video_ltx2_5_dfr_i2v. Three stages on the
 * distilled LTX-2.5 22B: 1) 8 steps at half the output size with one generated detailing keyframe per second and the sound; 2) a x2 latent upscale,
 * then 3 steps at full size with Lightricks' pixel-spatial detailing IC-LoRA (the half-size result as the reference); 3) optional: a x2 temporal
 * upscale to 48 fps over the same length, 4 steps with the stage-2 keyframes pinned as guides. The sound comes from stage 1 throughout.
 * Isomorphic: no server imports.
 */
/** The quality value (sent as resolution, like Draft / Sharper / 720p). */
export const LTX_DFR = 'dfr';
export const LTX_DFR_LABEL = 'DFR';
/** The picker's one line (user copy, 2026-10-29). */
export const LTX_DFR_HINT = 'Best quality: renders at half size, then sharpens to full size, optional 48 fps.';
/** The model name a DFR result shows (transparency: the real model and recipe). */
export const LTX_DFR_MODEL = 'LTX-2.5 22B · DFR';
/** The 48 fps switch: field smooth48, on unless sent off. */
export const LTX_DFR_SMOOTH_FIELD = 'smooth48';
export const LTX_DFR_SMOOTH_LABEL = 'Smooth motion (48 fps)';
export const LTX_DFR_SMOOTH_HINT = 'Doubles the frame rate over the same length (a third pass). Off: 24 fps, quicker and cheaper.';
/** The template's own output size (ResolutionSelector 16:9, 0.87 MP, multiple of 32 → 1280×704), with the same budget for tall and square.
 *  Stage 1 renders at half (the template's floor(x / 32) · 32 / 2). */
export const LTX_DFR_DIMS: Record<'16:9' | '9:16' | '1:1', [number, number]> = { '16:9': [1280, 704], '9:16': [704, 1280], '1:1': [960, 960] };
/** Whole seconds, as the card's other qualities (the template's 5 s default is the longest). Frames = 1 + floor(24 · s / 8) · 8 (the template's rule). */
export const LTX_DFR_SECONDS = [2, 3, 4, 5] as const;
export const LTX_DFR_FPS = 24;
export const ltxDfrFrames = (seconds: number) => 1 + Math.floor((LTX_DFR_FPS * (Number(seconds) || 0)) / 8) * 8;
/** Smooth motion on (default) unless the job sends smooth48 = 0 / false / off. */
export const ltxDfrSmooth = (i: Record<string, any> | null | undefined) => !/^(0|false|off|no)$/i.test(String(i?.[LTX_DFR_SMOOTH_FIELD] ?? '1'));
/** The job's mode, from mode or types (the quote sends types). */
const modeOf = (i: Record<string, any>): string => {
  if (typeof i?.mode === 'string' && i.mode) return i.mode;
  const t = i?.types; if (Array.isArray(t)) return String(t[0] ?? '');
  if (typeof t === 'string') { try { const x = JSON.parse(t); return String(Array.isArray(x) ? x[0] ?? '' : x); } catch { return t.split(',')[0]; } }
  return i?.imagePath ? 'i2v' : '';
};
export const isLoopJob = (i: Record<string, any>) => /^(1|true|on|yes)$/i.test(String(i?.loop ?? ''));
/** DFR asked (the quality picked). */
export const ltxDfrAsked = (i: Record<string, any> | null | undefined) => String(i?.resolution ?? '').toLowerCase() === LTX_DFR;
/** DFR runs: asked, image to video, no loop (the template is image to video; Loop runs the first + last frame graph). */
export const ltxDfrRuns = (i: Record<string, any> | null | undefined) => !!i && ltxDfrAsked(i) && modeOf(i) === 'i2v' && !isLoopJob(i);
/** DFR asked where it can't run: the job runs at 720p instead (the nearest quality), with this note. null = nothing adjusted. */
export function ltxDfrAdjustNote(i: Record<string, any> | null | undefined): string | null {
  if (!i || !ltxDfrAsked(i) || ltxDfrRuns(i)) return null;
  return isLoopJob(i) ? 'DFR doesn’t make loops: this loop runs at 720p instead.' : 'DFR makes image to video (a start frame): this clip runs at 720p instead.';
}
/** The quality a job really runs at (DFR → 720p where it can't run). */
export const ltxDfrResolution = (i: Record<string, any>) => (ltxDfrAsked(i) && !ltxDfrRuns(i) ? '720p' : i?.resolution);
/** Price keys (shared/hostedPrices.ts cloud-ltx25-video usdByQuality): DFR with or without the 48 fps pass. */
export const LTX_DFR_PRICE_KEYS = { smooth: 'dfr', plain: 'dfr-24' } as const;
/** The job as Comfy Cloud bills it: DFR → its price key; DFR that can't run → 720p. Quote and charge both use it. */
export function ltxDfrPriceInput(i: Record<string, any>): Record<string, any> {
  if (!ltxDfrAsked(i)) return i;
  if (!ltxDfrRuns(i)) return { ...i, resolution: '720p' };
  return { ...i, resolution: ltxDfrSmooth(i) ? LTX_DFR_PRICE_KEYS.smooth : LTX_DFR_PRICE_KEYS.plain };
}
/** The official template and its credit. */
export const LTX_DFR_TEMPLATE = 'video_ltx2_5_dfr_i2v';
export const LTX_DFR_TEMPLATE_URL = `https://github.com/Comfy-Org/workflow_templates/blob/main/templates/${LTX_DFR_TEMPLATE}.json`;
export const LTX_DFR_DOCS = 'https://docs.comfy.org/tutorials/video/ltx/ltx-2-5-dfr';
/** The model files a DFR run loads (the template's own; local runs need all of them). */
export const LTX_DFR_FILES = {
  unet: 'ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors',
  textEncoder: 'gemma4-12b-with-proj-ltx-2.5-bf16.safetensors',
  icLora: 'ltx-2.5-22b-ic-lora-pixel-spatial-upscaler-x2-1.0.safetensors',
  spatialUpscaler: 'ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors',
  temporalUpscaler: 'ltx-2.5-latent-temporal-upscaler-x2-bf16-1.0.safetensors',
  videoVae: 'ltx-2.5-video-vae-bf16.safetensors',
  audioVae: 'ltx-2.5-audio-vae-bf16.safetensors',
} as const;
export const LTX_DFR_LORA_HF = 'https://huggingface.co/Lightricks/LTX-2.5-22b-IC-LoRA-Pixel-Spatial-Upscaler/blob/main/ltx-2.5-22b-ic-lora-pixel-spatial-upscaler-x2-1.0.safetensors';
