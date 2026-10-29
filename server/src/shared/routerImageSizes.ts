/**
 * Exact pixel sizes for the Comfy Router image models that take a free WIDTH×HEIGHT inside a pixel range (2026-10-24, model check batch A):
 * Seedream 5.0 Pro / Flash, Qwen Image 3.0 / 3.0 Pro and Wan 2.5. Isomorphic, no imports: shared/imageCaps.ts (the bar's shapes and sizes),
 * routing/routerModels.ts (the request body) and the web bar (the size shown in the resolution menu) all read it, so what the bar offers,
 * what we price and what we send are the same size. GPT Image has its own table (shared/gptImageSizes.ts).
 *
 * Limits, from each model's Comfy Router page (Schema → Input → size), read 2026-10-24:
 * - Seedream 5.0 Pro (docs.comfy.org/development/comfy-router/models/byteplus/seedream-5-0-pro-260628/code): "WxH", total pixels
 *   1,048,576 (1024²) … 4,194,304 (2048²), aspect ratio 1/16 … 16. Billing: 1K up to 2.61 MP, 2K above (tutorials/partner-nodes/pricing).
 * - Seedream 5.0 Flash (…/byteplus/seedream-5-0-flash-260915/code): "WxH", total pixels 921,600 (1280×720) … 4,624,220, ratio 1/16 … 16. Flat price.
 * - Qwen Image 3.0 / 3.0 Pro (…/qwen/qwen-image-3-0/code, …/qwen-image-3-0-pro/code): "W*H", area 262,144 (512²) … 6,553,600 (2560²),
 *   ratio 1:8 … 8:1. Billing tier by output area: 1K up to 2.25 MP, 2K above (tutorials/partner-nodes/pricing, Qwen section).
 * - Wan 2.5 text to image (…/wan/wan2-5-t2i-preview/code): "W*H", area 1,638,400 (1280²) … 2,073,600 (1440²), ratio 1:4 … 4:1. One price.
 * - Seedream 4.5 (…/byteplus/seedream-4-5-251128/code, read 2026-10-25): "WxH", total pixels 3,686,400 (2560×1440) … 16,777,216 (4096²), ratio
 *   1/16 … 16; its resolution method offers only 2K and 4K, so we offer 2K (the largest of at most 2048²) and 4K (the largest of at most 4096²). Flat price.
 *
 * Our sizes: every shape at its exact ratio, both edges multiples of 16. 1K = the smallest such size of at least 1024² pixels (Wan: of at least
 * 1280², its floor); 2K = the largest of at most 2048²; 4K (Seedream 4.5 only) = the largest of at most 4096². Each lands inside the model's range (checked below at load and in the test).
 * "Match photo" on an edit: the photo's own shape at the same 1K / 2K area, edges multiples of 16 (within 1% of the photo's ratio), inside the range.
 * A shape not in the list is refused (never snapped to a neighbour).
 */
export type RouterSizeRes = '1K' | '2K' | '4K';
export const ROUTER_SIZE_ASPECTS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'] as const;
export interface RouterSizeRule {
  /** Router model id (for messages and the test). */ model: string;
  minPx: number; maxPx: number; maxRatio: number; step: number; sep: 'x' | '*';
  /** Per resolution: 'atLeast' = the smallest exact-shape size with ≥ px; 'atMost' = the largest with ≤ px. */
  res: Partial<Record<RouterSizeRes, { mode: 'atLeast' | 'atMost'; px: number }>>;
  /** Where the price changes (pixels): sizes up to this bill as 1K, above as 2K (Seedream Pro 2.61 MP, Qwen Pro 2.25 MP). */
  tierPx?: number;
  source: string;
}
const K1 = 1024 * 1024; const K2 = 2048 * 2048; const K4 = 4096 * 4096;
const DOC = (p: string) => `https://docs.comfy.org/development/comfy-router/models/${p}/code`;
const seedream = (model: string, minPx: number, maxPx: number, tierPx?: number): RouterSizeRule => ({ model, minPx, maxPx, maxRatio: 16, step: 16, sep: 'x',
  res: { '1K': { mode: 'atLeast', px: Math.max(K1, minPx) }, '2K': { mode: 'atMost', px: Math.min(K2, maxPx) } }, ...(tierPx ? { tierPx } : {}), source: DOC(`byteplus/${model.split('/')[1]}`) });
const qwen = (model: string, doc: string): RouterSizeRule => ({ model, minPx: 262_144, maxPx: 6_553_600, maxRatio: 8, step: 16, sep: '*',
  res: { '1K': { mode: 'atLeast', px: K1 }, '2K': { mode: 'atMost', px: K2 } }, tierPx: 2_250_000, source: DOC(doc) });
/** Keyed by our provider id. */
export const ROUTER_SIZE_RULES: Record<string, RouterSizeRule> = {
  'api-seedream': seedream('byteplus/seedream-5-0-pro-260628', 1_048_576, 4_194_304, 2_610_000),
  'api-seedream-flash': seedream('byteplus/seedream-5-0-flash-260915', 921_600, 4_624_220),
  'api-seedream-45': { model: 'byteplus/seedream-4-5-251128', minPx: 3_686_400, maxPx: K4, maxRatio: 16, step: 16, sep: 'x', res: { '2K': { mode: 'atMost', px: K2 }, '4K': { mode: 'atMost', px: K4 } }, source: DOC('byteplus/seedream-4-5-251128') },
  'api-qwen-image': qwen('qwen/qwen-image-3.0', 'qwen/qwen-image-3-0'),
  'api-qwen-image-pro': qwen('qwen/qwen-image-3.0-pro', 'qwen/qwen-image-3-0-pro'),
  'api-wan-image': { model: 'wan/wan2.5-t2i-preview', minPx: 1_638_400, maxPx: 2_073_600, maxRatio: 4, step: 16, sep: '*', res: { '1K': { mode: 'atLeast', px: 1_638_400 } }, source: DOC('wan/wan2-5-t2i-preview') },
};
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
const lcm = (a: number, b: number) => (a / gcd(a, b)) * b;
/** The exact-shape size for one rule, aspect and resolution ({w, h}), or null when none fits the range. */
function exactSize(r: RouterSizeRule, aspect: string, res: RouterSizeRes): { w: number; h: number } | null {
  const want = r.res[res]; const m = /^(\d+):(\d+)$/.exec(aspect); if (!want || !m) return null;
  let a = Number(m[1]), b = Number(m[2]); const g = gcd(a, b); a /= g; b /= g; if (Math.max(a, b) / Math.min(a, b) > r.maxRatio) return null;
  const unit = lcm(r.step / gcd(r.step, a), r.step / gcd(r.step, b)); // w = a·k, h = b·k with k a multiple of `unit` → both edges multiples of step
  const per = a * b * unit * unit; let u = want.mode === 'atLeast' ? Math.ceil(Math.sqrt(want.px / per)) : Math.floor(Math.sqrt(want.px / per));
  while (want.mode === 'atLeast' && per * (u - 1) * (u - 1) >= want.px && u > 1) u--; while (want.mode === 'atLeast' && per * u * u < want.px) u++;
  while (want.mode === 'atMost' && per * u * u > want.px) u--;
  const w = a * unit * u, h = b * unit * u; return u > 0 && w * h >= r.minPx && w * h <= r.maxPx ? { w, h } : null;
}
/** Every size we send, built once: TABLE[provider][res][aspect] = "WxH" / "W*H". */
export const ROUTER_SIZE_TABLE: Record<string, Partial<Record<RouterSizeRes, Record<string, string>>>> = Object.fromEntries(Object.entries(ROUTER_SIZE_RULES).map(([id, r]) =>
  [id, Object.fromEntries((Object.keys(r.res) as RouterSizeRes[]).map((res) => [res, Object.fromEntries(ROUTER_SIZE_ASPECTS.map((a) => {
    const s = exactSize(r, a, res); if (!s) throw new Error(`routerImageSizes: no ${res} ${a} size fits ${r.model}`); return [a, `${s.w}${r.sep}${s.h}`]; }))]))]));
/** Resolutions a model offers here (in order). */
export const routerSizeResolutions = (provider: string): RouterSizeRes[] => Object.keys(ROUTER_SIZE_TABLE[provider] ?? {}) as RouterSizeRes[];
/** The exact size string for a shape and resolution, or null when the model doesn't offer it (also null for models not in this table). */
export const routerImageSize = (provider: string, aspect: string | null | undefined, res: string | null | undefined): string | null =>
  ROUTER_SIZE_TABLE[provider]?.[(res ?? '1K') as RouterSizeRes]?.[aspect ?? ''] ?? null;
/** "W×H" / "W*H" → { width, height }. */
export const routerWH = (size: string) => { const [w, h] = size.split(/[x*]/).map(Number); return { width: w, height: h }; };
/** Edit on Match photo: the photo's own shape at the resolution's area, edges multiples of 16, inside the range. null = the photo's shape is
 *  outside the model's ratio range (or the size is unknown), so the caller refuses instead of guessing. */
export function routerPhotoSize(provider: string, res: string | null | undefined, photo: { width: number; height: number } | null | undefined): string | null {
  const r = ROUTER_SIZE_RULES[provider]; const want = r?.res[(res ?? '1K') as RouterSizeRes]; if (!r || !want || !photo || !(photo.width > 0) || !(photo.height > 0)) return null;
  const ratio = photo.width / photo.height; if (Math.max(ratio, 1 / ratio) > r.maxRatio) return null;
  const st = r.step; let area = want.px;
  for (let i = 0; i < 200; i++) { const w = Math.max(st, Math.round(Math.sqrt(area * ratio) / st) * st); const h = Math.max(st, Math.round(w / ratio / st) * st); const px = w * h;
    const inRange = px >= r.minPx && px <= r.maxPx; const ok = want.mode === 'atLeast' ? px >= want.px : px <= want.px;
    if (inRange && ok && Math.max(w / h / ratio, ratio / (w / h)) <= 1.01) return `${w}${r.sep}${h}`;
    area *= want.mode === 'atLeast' ? 1.005 : 0.995; }
  return null;
}
/** The tier a size bills at (models whose price changes with the output area): '1K' up to tierPx, else '2K'. */
export const routerSizeTier = (provider: string, size: string): RouterSizeRes => { const r = ROUTER_SIZE_RULES[provider]; const { width, height } = routerWH(size);
  return r?.tierPx && width * height > r.tierPx ? '2K' : '1K'; };
/** The plain refusal for a shape the model can't do (the same words as shared/imageCaps.ts checkImageCaps). */
export const routerAspectMessage = (aspect: string) => `Aspect ${aspect} isn't supported by this model (${ROUTER_SIZE_ASPECTS.join(', ')}).`;
