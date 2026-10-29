import { LOCAL_LABEL } from './modelIds.js';
/**
 * Image Upscale (tool image-upscale): the one place that says which factors each model can do, which workflow file really runs for a
 * factor, and the output size cap. Used by the tool (submit), the quote (/api/tools/image-upscale/price), the ComfyUI plan and /api/tools
 * (tool.app.imageUpscale), so the page, the price and the run never disagree.
 *  - Real-ESRGAN: ×2 = RealESRGAN_x2plus, ×4 = RealESRGAN_x4plus, ×8 = x4plus then x2plus (two passes, one graph).
 *  - 4x-UltraSharp: ×4 only.
 *  - 2026-10-22: SeedVR2 (Comfy Router via WaveSpeed, fal, and SeedVR2 3B fp16 locally), Clarity Crystal and
 *    Topaz Wonder 3.5 / Standard V2 (fal), Z-Image-Turbo 2K and 4x Nomos2 DAT2 locally. UPSCALE_MODELS says where each runs, its label
 *    (Best detail / Fast / Classic), its price text and the measured local times; UPSCALE_ORDER is the menu order (Comfy → other API → Local).
 *  - ×16: no model here does it yet (listed so the page can show it disabled with the reason).
 *  - Output is capped at 8192 px on the long side (every backend); some models cap lower (UPSCALE_MAX_SIDE_BY_PROVIDER). A factor that would go
 *    past the cap is refused (400 output_too_large).
 */
export const UPSCALE_MAX_SIDE = 8192;
/** Every factor the page shows (some disabled). */
export const UPSCALE_FACTORS = [2, 4, 8, 16] as const;
/** Factors each model really runs. */
export const UPSCALE_FACTORS_BY_PROVIDER: Record<string, number[]> = {
  'router-seedvr2-upscale': [2, 4, 8], 'api-crystal-upscale': [2, 4], 'fal-topaz-wonder': [2, 4], 'fal-topaz-precision': [2, 4], 'fal-seedvr2-upscale': [2, 4],
  'fal-topaz-bloom': [2, 4], 'fal-bria-upscale': [2, 4],
  'cloud-topaz-bloom2': [2, 4], // official Comfy template api_topaz_image_enhance_bloom2 on Comfy Cloud (2026-10-27; the node does 1x–6x, we offer the menu's ×2 / ×4)
  'comfy-seedvr2-image': [2, 4], 'comfy-zimage-upscale': [2, 4], 'comfy-nomos2': [2, 4],
  'comfy-realesrgan': [2, 4, 8], 'comfy-ultrasharp': [4],
};
/** Lower long-side caps than UPSCALE_MAX_SIDE: Z-Image-Turbo 2K is a 2K recipe (template: 1 MP → 4 MP); SeedVR2 3B locally: see LOCAL_TIMES. */
export const UPSCALE_MAX_SIDE_BY_PROVIDER: Record<string, number> = { 'comfy-zimage-upscale': 2048, 'comfy-seedvr2-image': 2048 }; // SeedVR2 3B on an M1 Max: 1024 → 2048 took 327 s (measured); 4K would run for tens of minutes
export const maxSideOf = (provider: string) => UPSCALE_MAX_SIDE_BY_PROVIDER[provider] ?? UPSCALE_MAX_SIDE;
/** The workflow file that runs for a model and factor (null = that model can't do that factor, or it runs hosted: no local graph). */
export const UPSCALE_WORKFLOWS: Record<string, Record<string, string>> = {
  'comfy-seedvr2-image': { 2: 'image-upscale-seedvr2-3b-api.json', 4: 'image-upscale-seedvr2-3b-api.json' },
  'comfy-zimage-upscale': { 2: 'image-upscale-zimage-2k-api.json', 4: 'image-upscale-zimage-2k-api.json' },
  'comfy-nomos2': { 2: 'image-upscale-nomos2-x2-api.json', 4: 'image-upscale-nomos2-x4-api.json' },
  'comfy-realesrgan': { 2: 'image-upscale-x2-api.json', 4: 'image-upscale-x4-api.json', 8: 'image-upscale-x8-api.json' },
  'comfy-ultrasharp': { 4: 'image-upscale-ultrasharp-x4-api.json' },
};
/** The model files each workflow loads (ComfyUI models/<folder>). */
export const UPSCALE_WORKFLOW_FILES: Record<string, string[]> = {
  'image-upscale-x2-api.json': ['RealESRGAN_x2plus.pth'], 'image-upscale-x4-api.json': ['RealESRGAN_x4plus.pth'],
  'image-upscale-x8-api.json': ['RealESRGAN_x4plus.pth', 'RealESRGAN_x2plus.pth'], 'image-upscale-ultrasharp-x4-api.json': ['4x-UltraSharp.pth'],
  'image-upscale-nomos2-x2-api.json': ['4xNomos2_hq_dat2.pth'], 'image-upscale-nomos2-x4-api.json': ['4xNomos2_hq_dat2.pth'],
  'image-upscale-seedvr2-3b-api.json': ['seedvr2_3b_fp16.safetensors', 'seedvr2_ema_vae_fp16.safetensors'],
  'image-upscale-zimage-2k-api.json': ['z_image_turbo_bf16.safetensors', 'qwen_3_4b.safetensors', 'ae.safetensors', 'RealESRGAN_x4plus.pth'],
};
/** Local providers (a ComfyUI graph locally). */
export const UPSCALE_LOCAL = Object.keys(UPSCALE_WORKFLOWS);
export function imageUpscaleWorkflow(provider: string, scale: number): string | null { return UPSCALE_WORKFLOWS[provider]?.[String(scale)] ?? null; }
/** Same file the plan always used for an unknown factor (x2), so old jobs keep running. */
export function imageUpscaleWorkflowOrDefault(provider: string, scale: number): string {
  const own = UPSCALE_WORKFLOWS[provider];
  if (own && provider !== 'comfy-realesrgan') return own[String(scale)] ?? Object.values(own)[Object.values(own).length - 1];
  return imageUpscaleWorkflow(provider, scale) ?? `image-upscale-x${scale === 8 ? 8 : scale === 4 ? 4 : 2}-api.json`;
}
export const upscaleOutSize = (w: number, h: number, scale: number) => ({ width: Math.round(w * scale), height: Math.round(h * scale) });
/** Output megapixels of an upscale job (per-megapixel prices: fal SeedVR2, Crystal, Topaz). Without a source size: a 1024 × 1024 source is assumed. */
export const upscaleOutMegapixels = (i: { outputSize?: { width: number; height: number } | null; scale?: number | string | null; types?: unknown; mode?: unknown }): number => {
  const o = i.outputSize; if (o && o.width > 0 && o.height > 0) return (o.width * o.height) / 1e6;
  const t = upscaleScaleOf({ types: Array.isArray(i.types) ? JSON.stringify(i.types) : i.types, mode: i.mode });
  const k = Number(i.scale) || (t && Number.isFinite(t) ? t : 2); return ((1024 * k) ** 2) / 1e6;
};
/** Z-Image-Turbo 2K graph (node 20 ImageScaleToTotalPixels): the template makes 4 × that many megapixels (×4 model, then ×0.5), so for a factor
 *  the working size is source MP × factor² / 4 (×2 = the source size itself). */
export const zimageWorkingMegapixels = (src: { width: number; height: number }, scale: number) => Math.round(((src.width * src.height * scale * scale) / 4 / 1e6) * 1e4) / 1e4;
/** The factor a request names: scale=4 | scale=x4 | types=["x4"] | types=x4 | mode=x4. null = none named; NaN = malformed. */
export function upscaleScaleOf(f: Record<string, any>): number | null {
  if (f.scale != null && String(f.scale).trim() !== '') return Number(String(f.scale).trim().replace(/^x/i, ''));
  let t: any = f.types ?? f.mode; if (t == null || String(t).trim() === '') return null;
  try { const j = JSON.parse(String(t)); t = Array.isArray(j) ? j[0] : j; } catch { t = String(t).split(',')[0]; }
  const m = /^x(\d+)$/i.exec(String(t ?? '').trim()); return m ? Number(m[1]) : NaN;
}
export const UPSCALE_MODEL_NAMES: Record<string, string> = {
  'router-seedvr2-upscale': 'SeedVR2', 'api-crystal-upscale': 'Crystal Upscaler', 'fal-topaz-wonder': 'Topaz Wonder 3.5', 'fal-topaz-precision': 'Topaz Standard V2', 'fal-seedvr2-upscale': 'SeedVR2',
  'fal-topaz-bloom': 'Topaz Bloom 2', 'fal-bria-upscale': 'Bria Increase Resolution', 'cloud-topaz-bloom2': 'Topaz Bloom 2',
  'comfy-seedvr2-image': 'SeedVR2 3B', 'comfy-zimage-upscale': 'Z-Image-Turbo 2K', 'comfy-nomos2': '4x Nomos2', 'comfy-realesrgan': 'Real-ESRGAN', 'comfy-ultrasharp': '4x-UltraSharp',
};
/** Plain reason a factor can't run for this model (or this source size), else null. */
export function upscaleBlock(provider: string, scale: number, src?: { width: number; height: number } | null, name = UPSCALE_MODEL_NAMES[provider] ?? 'This model'): { code: string; message: string } | null {
  const ok = UPSCALE_FACTORS_BY_PROVIDER[provider] ?? [];
  if (!ok.includes(scale)) return { code: 'unsupported_scale', message: `${name} upscales ${ok.map((x) => `×${x}`).join(', ')} only.` };
  if (src && src.width > 0 && src.height > 0) { const o = upscaleOutSize(src.width, src.height, scale); const cap = maxSideOf(provider);
    if (Math.max(o.width, o.height) > cap) return { code: 'output_too_large', message: `×${scale} would make ${o.width}×${o.height}; ${cap < UPSCALE_MAX_SIDE ? `${name} goes up to` : 'the most is'} ${cap} px on the long side. Pick a smaller factor${cap < UPSCALE_MAX_SIDE ? ' or another model' : ''}.` }; }
  return null;
}
/** What the menu says about each model: where it runs, its label, a one-line honest blurb, the price text and measured local times. */
export type UpscalePlace = 'comfy' | 'api' | 'gpu';
export interface UpscaleModelInfo {
  place: UpscalePlace; placeLabel: string; label: 'Best detail' | 'Fast' | 'Classic'; blurb: string; price: string;
  /** Seconds measured on the M1 Max 64 GB (ComfyUI 0.42.4, shared queue, models loaded cold) for a 384 px source (ice-straw, 2026-10-22), by factor;
   *  the page shows it until this computer's own ETA is learned. ComfyUI's footprint rose ~12 GB for SeedVR2 3B ×4 and ~33 GB for Z-Image-Turbo 2K ×4. */
  measuredSec?: Record<string, number>;
  /** Credit: where the graph or the request body comes from. */ source: { kind: 'official' | 'community' | 'ours'; name: string; url: string | null; author: string };
}
const TPL = 'https://github.com/Comfy-Org/workflow_templates/blob/main/templates/';
export const UPSCALE_MODELS: Record<string, UpscaleModelInfo> = {
  'router-seedvr2-upscale': { place: 'comfy', placeLabel: 'Comfy Cloud', label: 'Fast', price: '$0.01 per image',
    blurb: 'SeedVR2 hosted by WaveSpeed: real texture, keeps the content. Output snaps to 2K, 4K or 8K.',
    source: { kind: 'official', name: 'WaveSpeed: Image Upscale (api_wavespeed_image_upscale)', url: `${TPL}api_wavespeed_image_upscale.json`, author: 'Comfy Org' } },
  'api-crystal-upscale': { place: 'api', placeLabel: 'fal', label: 'Best detail', price: '$0.016 per output MP',
    blurb: 'Clarity Crystal: strong on faces and products, no plastic skin. Also on Comfy Cloud, where its price isn’t published yet.',
    source: { kind: 'official', name: 'Clarity AI: Crystal Upscale (api_clarity_ai_crystal_upscale)', url: `${TPL}api_clarity_ai_crystal_upscale.json`, author: 'Comfy Org' } },
  'fal-topaz-wonder': { place: 'api', placeLabel: 'fal', label: 'Best detail', price: '$0.08 per started 8 MP',
    blurb: 'Topaz Wonder 3.5: rebuilds lost detail, best on soft or noisy photos. Generative: small things can change.',
    source: { kind: 'official', name: 'Topaz: Wonder 3.5 (api_topaz_image_enhance_wonder3_5)', url: `${TPL}api_topaz_image_enhance_wonder3_5.json`, author: 'Comfy Org' } },
  'fal-topaz-precision': { place: 'api', placeLabel: 'fal', label: 'Fast', price: '$0.08 per started 24 MP',
    blurb: 'Topaz Standard V2 (Precision): sharp and faithful, adds nothing new.',
    source: { kind: 'ours', name: 'fal topaz/upscale/image/precision request', url: 'https://fal.ai/models/topaz/upscale/image/precision/api', author: 'Imagination Is All You Need' } },
  'fal-seedvr2-upscale': { place: 'api', placeLabel: 'fal', label: 'Fast', price: '$0.001 per output MP',
    blurb: 'SeedVR2 on fal: one-step diffusion, real texture, content kept. Cheapest hosted option.',
    source: { kind: 'ours', name: 'fal fal-ai/seedvr/upscale/image request', url: 'https://fal.ai/models/fal-ai/seedvr/upscale/image/api', author: 'Imagination Is All You Need' } },
  // fal image pass (2026-10-22): Topaz Bloom 2 (creative) and Bria Increase Resolution
  'fal-topaz-bloom': { place: 'api', placeLabel: 'fal', label: 'Best detail', price: '$0.08 per started 2 MP',
    blurb: 'Topaz Bloom 2: creative upscale that invents fine detail; best on AI images and soft art. Small things can change.',
    source: { kind: 'official', name: 'Topaz: Image Enhance Bloom 2 (api_topaz_image_enhance_bloom2)', url: `${TPL}api_topaz_image_enhance_bloom2.json`, author: 'Comfy Org' } },
  // Official Comfy template (2026-10-27): Topaz Bloom 2 through its partner node on Comfy Cloud (comfy/topazImageCloud.ts), the same model as the fal place.
  'cloud-topaz-bloom2': { place: 'comfy', placeLabel: 'Comfy Cloud', label: 'Best detail', price: '$0.46 per started 8 MP',
    blurb: 'Topaz Bloom 2: creative upscale that invents fine detail; best on AI images and soft art. Small things can change.',
    source: { kind: 'official', name: 'Topaz: Image Enhance Bloom 2 (api_topaz_image_enhance_bloom2)', url: `${TPL}api_topaz_image_enhance_bloom2.json`, author: 'Comfy Org' } },
  'fal-bria-upscale': { place: 'api', placeLabel: 'fal', label: 'Fast', price: '$0.04 per image',
    blurb: 'Bria Increase Resolution: ×2 or ×4 up to 8192 px, no regeneration, so the content stays as it was.',
    source: { kind: 'ours', name: 'fal bria/increase-resolution request', url: 'https://fal.ai/models/bria/increase-resolution/api', author: 'Imagination Is All You Need' } },
  'comfy-seedvr2-image': { place: 'gpu', placeLabel: LOCAL_LABEL, label: 'Best detail', price: 'Free', measuredSec: { 2: 50, 4: 192 },
    blurb: 'The most detail you can add for free, with true colours. Slower than the others.',
    source: { kind: 'official', name: 'Image Upscale: SeedVR2 3B Int8 (utility_seedvr2_3b_int8_upscale_image), adapted to fp16', url: `${TPL}utility_seedvr2_3b_int8_upscale_image.json`, author: 'Comfy Org' } },
  'comfy-zimage-upscale': { place: 'gpu', placeLabel: LOCAL_LABEL, label: 'Best detail', price: 'Free', measuredSec: { 2: 74, 4: 281 },
    blurb: 'Z-Image-Turbo 2K: Real-ESRGAN, then Z-Image-Turbo re-draws detail (denoise 0.33). Up to 2048 px; faces and small text can change.',
    source: { kind: 'official', name: 'Image Upscale: Z-Image-Turbo 2K (utility_z_image_turbo_2k_upscaler.app), adapted', url: `${TPL}utility_z_image_turbo_2k_upscaler.app.json`, author: '@hellorob' } },
  'comfy-nomos2': { place: 'gpu', placeLabel: LOCAL_LABEL, label: 'Fast', price: 'Free', measuredSec: { 2: 6, 4: 7 },
    blurb: '4x Nomos2 DAT2 by Phhofm (CC-BY 4.0): faithful and clean, less waxy than Real-ESRGAN.',
    source: { kind: 'ours', name: 'image-upscale-nomos2-x4-api.json (model: github.com/Phhofm/models)', url: 'https://github.com/Phhofm/models/releases/tag/4xNomos2_hq_dat2', author: 'Imagination Is All You Need' } },
  'comfy-realesrgan': { place: 'gpu', placeLabel: LOCAL_LABEL, label: 'Classic', price: 'Free', measuredSec: { 4: 2 }, blurb: 'Real-ESRGAN: quick, the only ×8 here; smooths fine texture.',
    source: { kind: 'ours', name: 'image-upscale-x4-api.json', url: null, author: 'Imagination Is All You Need' } },
  'comfy-ultrasharp': { place: 'gpu', placeLabel: LOCAL_LABEL, label: 'Classic', price: 'Free', blurb: '4x-UltraSharp: crisp edges, ×4 only (non-commercial weights).',
    source: { kind: 'ours', name: 'image-upscale-ultrasharp-x4-api.json', url: null, author: 'Imagination Is All You Need' } },
};
/** Menu order: best first per place, Comfy → other API → Local, classics last. */
export const UPSCALE_ORDER = ['router-seedvr2-upscale', 'cloud-topaz-bloom2' /* Comfy Cloud partner node (2026-10-27) */, 'api-crystal-upscale', 'fal-topaz-wonder', 'fal-topaz-bloom', 'fal-topaz-precision', 'fal-seedvr2-upscale', 'fal-bria-upscale',
  'comfy-seedvr2-image', 'comfy-zimage-upscale', 'comfy-nomos2', 'comfy-realesrgan', 'comfy-ultrasharp'];
/** /api/tools tool.app.imageUpscale: everything the page needs to draw the factor control honestly. */
export const imageUpscaleInfo = () => ({ maxSide: UPSCALE_MAX_SIDE, maxSideByProvider: UPSCALE_MAX_SIDE_BY_PROVIDER, factors: [...UPSCALE_FACTORS], factorsByProvider: UPSCALE_FACTORS_BY_PROVIDER, workflows: UPSCALE_WORKFLOWS, modelFiles: UPSCALE_WORKFLOW_FILES, models: UPSCALE_MODELS, order: UPSCALE_ORDER });
