/**
 * Picture shapes the hosted image models take, and the exact request value each shape becomes (2026-10-24, aspect pass).
 * Isomorphic, no imports: shared/imageCaps.ts (what the bar offers and checkImageCaps enforces), routing/routerModels.ts and the other route
 * bodies (what we send) and shared/pricing.ts (FLUX.2's per-megapixel price) all read these, so offered = sent = priced.
 * A shape is never snapped to a neighbour: each list here maps 1:1 to a value the model's schema lists.
 *
 * Sources (local copy of docs.comfy.org, read 2026-10-24; each model's Router page "Schema → Input"):
 * - Ideogram V4: development/comfy-router/models/ideogram/ideogram-v4 (resolution: the 21 "Supported 2K values"; omitted = the model picks).
 *   Ideogram 4.5: …/ideogram/ideogram-4-5 (size: auto (default), source (needs images) or WIDTHxHEIGHT): we send the same 21 presets.
 * - Luma UNI-1 / UNI-1 Max: …/luma_2/uni-1, …/luma_2/uni-1-max (aspect_ratio enum, 12 values).
 * - Kling Image O1: …/kling/kling-image-o1 (aspect_ratio enum, 8 + auto, default auto).
 * - Krea 3: …/krea/krea-3 (aspect_ratio: 10 values; omit for automatic framing).
 * - Runway Gen-4 Image: …/runway/gen4-image (ratio enum, 10 pixel ratios, required).
 * - Grok Imagine Image 2.0: …/xai/grok-imagine-image-2-0 (aspect_ratio enum, 13 + auto, default auto).
 * - FLUX 3 Image: …/black-forest-labs/flux-3-image (aspect_ratio: 15 + auto, default auto; auto follows the first reference image).
 * - FLUX.2 [pro] / [max]: …/black-forest-labs/flux-2-pro, …/flux-2-max (width, height: 256–2048 each, default 1024).
 * - Recraft V4 / V4.1 / V4.1 Pro: the Router page types size as a string ("1024x1024"); the size table is Recraft's own
 *   (recraft.ai/docs/api-reference/appendix, "Image sizes": 14 sizes per 1K / 2K model family).
 * - MiniMax image-01 (direct): platform.minimax.io image generation (aspect_ratio enum, 8 values).
 */

/** "16:9" / "9:19.5" / "1920:1080" → width / height (null when it isn't a ratio). */
export const ratioNum = (a: string | null | undefined): number | null => { const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(String(a ?? '')); if (!m) return null; const w = Number(m[1]), h = Number(m[2]); return w > 0 && h > 0 ? w / h : null; };

/** Ideogram V4 2K resolutions by shape (exact ratios). */
export const IDEOGRAM_SIZES: Record<string, string> = {
  '1:1': '2048x2048', '16:9': '2560x1440', '9:16': '1440x2560', '4:3': '2304x1728', '3:4': '1728x2304', '3:2': '2496x1664', '2:3': '1664x2496',
  '5:4': '2240x1792', '4:5': '1792x2240', '8:5': '2560x1600', '5:8': '1600x2560', '2:1': '2880x1440', '1:2': '1440x2880',
  '12:5': '3072x1280', '5:12': '1280x3072', '22:9': '3168x1296', '9:22': '1296x3168', '23:9': '2944x1152', '9:23': '1152x2944', '8:3': '3328x1248', '3:8': '1248x3328',
};
export const IDEOGRAM_ASPECTS = Object.keys(IDEOGRAM_SIZES);

/** Recraft sizes by shape: 1K models (V4, V4.1) and 2K models (V4.1 Pro). Recraft names 832x1344 "6:10" and 1280x896 "14:10"; we show them as 3:5 / 7:5. */
export const RECRAFT_SIZES: Record<'1K' | '2K', Record<string, string>> = {
  '1K': { '1:1': '1024x1024', '16:9': '1344x768', '9:16': '768x1344', '4:3': '1216x896', '3:4': '896x1216', '3:2': '1280x832', '2:3': '832x1280',
    '5:4': '1152x896', '4:5': '896x1152', '7:5': '1280x896', '5:7': '896x1280', '3:5': '832x1344', '2:1': '1536x768', '1:2': '768x1536' },
  '2K': { '1:1': '2048x2048', '16:9': '2688x1536', '9:16': '1536x2688', '4:3': '2432x1792', '3:4': '1792x2432', '3:2': '2560x1664', '2:3': '1664x2560',
    '5:4': '2304x1792', '4:5': '1792x2304', '7:5': '2560x1792', '5:7': '1792x2560', '3:5': '1664x2688', '2:1': '3072x1536', '1:2': '1536x3072' },
};
export const RECRAFT_ASPECTS = Object.keys(RECRAFT_SIZES['1K']);
/** The Recraft size for a shape on a 1K or 2K model, or null when the shape isn't one of Recraft's. */
export const recraftSize = (aspect: string | null | undefined, tier: '1K' | '2K'): string | null => RECRAFT_SIZES[tier][aspect ?? ''] ?? null;

export const LUMA_ASPECTS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9', '2:1', '1:2', '3:1', '1:3'];
export const KLING_IMAGE_ASPECTS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9'];
export const KREA_ASPECTS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '21:9'];
/** Runway's own ratio values (pixel sizes, sent as they are). Two squares: 1024:1024 and 1080:1080. */
export const RUNWAY_RATIOS = ['1920:1080', '1080:1920', '1024:1024', '1080:1080', '1440:1080', '1080:1440', '1168:880', '1360:768', '1808:768', '2112:912'];
export const GROK_IMAGE_ASPECTS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '2:1', '1:2', '19.5:9', '9:19.5', '20:9', '9:20'];
/** Grok edits run on fal (xai/grok-imagine-image/v2.0/edit, fal.ai/models/xai/grok-imagine-image/v2.0/edit/api): 9 + auto (the photo's shape). */
export const GROK_EDIT_ASPECTS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '2:1', '1:2'];
/** Bria FIBO 2.0 text to image on Comfy Router (bria/image aspect_ratio, models/bria/image/code; the same 21 values as the partner node
 *  BriaImageGenerate, comfy_api_nodes/nodes_bria.py). The 12 from 16:10 on are FIBO 2.0 only and Bria refuses them at 4MP. */
export const FIBO_ASPECTS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '16:10', '10:16', '2:1', '1:2', '21:9', '9:21', '3:1', '1:3', '4:1', '1:4', '5:1', '1:5'];
export const FIBO_WIDE_ASPECTS = FIBO_ASPECTS.slice(9);
export const FLUX3_ASPECTS = ['21:9', '2:1', '16:9', '3:2', '7:5', '4:3', '5:4', '1:1', '4:5', '3:4', '5:7', '2:3', '9:16', '1:2', '9:21'];
/** FLUX.2 [pro] / [max] take any width × height (256–2048): the shapes we offer, each sent as an exact size (flux2Size). */
export const FLUX2_ASPECTS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '21:9', '9:21', '2:1', '1:2', '3:1', '1:3', '4:1', '1:4'];
/** Replicate's FLUX.2 [pro] body passes the shape as aspect_ratio unchanged; its list isn't in our sources, so that route keeps the five it always sent. */
export const REPLICATE_FLUX2_ASPECTS = ['1:1', '16:9', '9:16', '4:3', '3:4'];
export const MINIMAX_IMAGE_ASPECTS = ['1:1', '16:9', '4:3', '3:2', '2:3', '3:4', '9:16', '21:9'];

/** FLUX.2 on Comfy Router: width × height for a shape at 1K / 2K. Same pixel count for every shape (1K ≈ 1024², 2K ≈ 2048²), edges multiples of
 *  16 inside 256–2048; a shape whose 2K size would pass 2048 on its long side is capped there (the short side follows). 4K = 2K (the API's max). */
export function flux2Size(aspect: string | null | undefined, res: string | null | undefined): { width: number; height: number } {
  const r = ratioNum(aspect) ?? 1; const area = String(res ?? '1K').toUpperCase() === '1K' ? 1024 * 1024 : 2048 * 2048;
  const r16 = (v: number) => Math.min(2048, Math.max(256, Math.round(v / 16) * 16));
  let w = Math.sqrt(area * r), h = Math.sqrt(area / r); const k = Math.min(1, 2048 / Math.max(w, h)); w *= k; h *= k;
  return { width: r16(w), height: r16(h) };
}
/** FLUX.2 bills started megapixels of the output (1 MP = 10^6 px, the rounding the price rows already use). */
export const flux2StartedMp = (s: { width: number; height: number }) => Math.max(1, Math.ceil((s.width * s.height) / 1e6 - 1e-9));
