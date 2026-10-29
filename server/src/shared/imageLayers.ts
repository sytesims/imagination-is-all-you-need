/**
 * Image to layers (2026-10-24): one photo in, a stack of transparent layers out (the background plate first, then each element in stacking order).
 * Isomorphic (web imports it): model ids, the sizes the bar offers, the local model's files, and how a finished job reads as layers.
 *
 *  Model                        Where                                   Request                                                     Price (Comfy credits, 211 = $1)
 *  Seedream 5.0 Flash (default)  Comfy Router byteplus/seedream-5-0-flash-260915   layer_decomposition: true, size 1K / 2K, one photo           5.4311 per run, every size
 *  Seedream 5.0 Pro              Comfy Router byteplus/seedream-5-0-pro-260628     same body                                                    6.7889 (1K, 1.5K) / 13.5778 (2K) per run
 *  Qwen-Image-Layered            Local, official template image_qwen_image_layered (not downloaded: listed with its size only)               free once downloaded
 *
 * Sources (read 2026-10-24): Router schemas docs.comfy.org/development/comfy-router/models/byteplus/<id>/code ("layer_decomposition … splits one input image
 * into a base image plus up to 16 layers"; layers are always PNG; data[] = base first, then layers by z_index with name / bounding_box); Router pricing
 * docs.comfy.org/development/comfy-router/pricing ("layer separation, Standard 6.7889 / Large 13.5778" on seedream-5-0-pro; flash 5.4311 per generation);
 * partner nodes ByteDanceSeedreamLayerSeparationNodeV2 (docs.comfy.org/built-in-nodes) and the partner pricing page (Pro 6.79 at 1K / 1.5K, 13.58 at 2K;
 * Flash 5.43). The node and the Router take no layer count: the model decides (up to 16) and an optional prompt can name the elements.
 */
export const LAYERS_FLASH = 'api-seedream-layers-flash';
export const LAYERS_PRO = 'api-seedream-layers-pro';
export const LAYERS_LOCAL = 'comfy-qwen-image-layered';
/** The workflow's models, default first (Flash), then Pro, then the local model (listed, needs a download). */
export const LAYER_MODELS = [LAYERS_FLASH, LAYERS_PRO, LAYERS_LOCAL];
/** Router model ids per hosted provider. */
export const LAYER_ROUTER_IDS: Record<string, string> = { [LAYERS_FLASH]: 'byteplus/seedream-5-0-flash-260915', [LAYERS_PRO]: 'byteplus/seedream-5-0-pro-260628' };
/** Sizes the bar offers (Router layer mode takes 1K / 1.5K / 2K / auto). 1.5K and auto are left out: auto follows the photo up to 2K, so its price
 *  isn't known before the run (quote = charge), and 1.5K costs the same as 1K on Pro. */
export const LAYER_SIZES = ['1K', '2K'] as const;
export const LAYER_SIZE_DEFAULT = '1K';
/** The job's prompt label when the user wrote none (the request then has no prompt: the model finds the elements itself). */
export const LAYERS_NO_PROMPT = 'Auto layers (no prompt)';
/** Most layers one run returns (base + 16). */
export const LAYERS_MAX = 17;
/** Router layer mode: the photo must be at least 512 × 512 and between 1:16 and 16:1. */
export const LAYERS_MIN_SIDE = 512;
export type LayerBlock = { code: string; message: string } | null;
export function layersPhotoBlock(src: { width: number; height: number } | null | undefined): LayerBlock {
  if (!src || !(src.width > 0 && src.height > 0)) return null;
  if (Math.min(src.width, src.height) < LAYERS_MIN_SIDE) return { code: 'photo_too_small', message: `This photo is ${src.width}×${src.height}; layers need at least ${LAYERS_MIN_SIDE} px on each side.` };
  const r = src.width / src.height; if (r > 16 || r < 1 / 16) return { code: 'photo_shape', message: 'Layers need a photo between 1:16 and 16:1.' };
  return null;
}

/** Qwen-Image-Layered on Local: the smallest working set of the official template (FP8 model). Sizes from the Comfy-Org repack (not downloaded here). */
const HF = (repo: string, p: string) => `https://huggingface.co/${repo}/blob/main/split_files/${p}`;
export const QWEN_LAYERED_FILES = [
  { file: 'qwen_image_layered_fp8mixed.safetensors', folder: 'diffusion_models', bytes: 20_500_000_000, url: HF('Comfy-Org/Qwen-Image-Layered_ComfyUI', 'diffusion_models/qwen_image_layered_fp8mixed.safetensors') },
  { file: 'qwen_2.5_vl_7b_fp8_scaled.safetensors', folder: 'text_encoders', bytes: 9_380_000_000, url: HF('Comfy-Org/HunyuanVideo_1.5_repackaged', 'text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors') },
  { file: 'qwen_image_layered_vae.safetensors', folder: 'vae', bytes: 254_000_000, url: HF('Comfy-Org/Qwen-Image-Layered_ComfyUI', 'vae/qwen_image_layered_vae.safetensors') },
];
export const QWEN_LAYERED_TEMPLATE = 'https://github.com/Comfy-Org/workflow_templates/blob/main/templates/image_qwen_image_layered.json';
export const QWEN_LAYERED_GB = `${(QWEN_LAYERED_FILES.reduce((a, f) => a + f.bytes, 0) / 1e9).toFixed(1)} GB`;
export const QWEN_LAYERED_NEEDS = `Needs download (${QWEN_LAYERED_GB}, ${QWEN_LAYERED_FILES.length} files)`;

/** A finished job's layers in stacking order (bottom first): its image outputs. A layered job carries input.layers = true. */
export type LayerOut = { url: string; label?: string };
export const isLayerJob = (job: { input?: any } | null | undefined) => !!job?.input?.layers;
export const layerCountText = (n: number) => `${n} layer${n === 1 ? '' : 's'}`;
/** Layer names: "Background" for the plate, then the model's own name for each layer, or "Layer k". */
export function layerLabel(k: number, name?: string | null): string {
  const s = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 80); return k === 0 ? 'Background' : s ? s.charAt(0).toUpperCase() + s.slice(1) : `Layer ${k}`;
}
