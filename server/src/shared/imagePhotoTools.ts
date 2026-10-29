/**
 * Photo tools in Create Image's bar (2026-10-23): Remove Background, Expand, Erase Object and Virtual Try-On, all on fal.
 * Isomorphic (web imports it): the rules the bar shows before a run are the ones the server applies on submit.
 *  - Expand: the canvas a target shape needs around the photo (centred), Bria's limit (canvas area under 5000 × 5000) and its advice
 *    (the photo should cover at least 15% of the canvas), and the plain reasons a shape can't run (already that shape, too far).
 *  - Every photo tool: the largest photo it takes (8192 px on the long side, the same cap as Upscale).
 */
/** The shapes Expand offers: Bria Expand's aspect_ratio enum (fal OpenAPI, 2026-10-23); Ideogram 3.0 Reframe gets a size from its own list. */
export const EXPAND_ASPECTS = ['1:1', '4:5', '5:4', '3:4', '4:3', '2:3', '3:2', '9:16', '16:9'] as const;
export const EXPAND_ASPECT_LABELS: Record<string, string> = { '1:1': 'Square 1:1', '4:5': 'Portrait 4:5', '5:4': 'Landscape 5:4', '3:4': 'Portrait 3:4', '4:3': 'Landscape 4:3',
  '2:3': 'Portrait 2:3', '3:2': 'Landscape 3:2', '9:16': 'Tall 9:16', '16:9': 'Wide 16:9' };
/** Ideogram 3.0 Reframe output size per shape (from Ideogram's resolution list, about 1 MP). */
export const IDEOGRAM_REFRAME_SIZES: Record<string, { width: number; height: number }> = {
  '1:1': { width: 1024, height: 1024 }, '4:5': { width: 896, height: 1120 }, '5:4': { width: 1120, height: 896 }, '3:4': { width: 864, height: 1152 }, '4:3': { width: 1152, height: 864 },
  '2:3': { width: 832, height: 1248 }, '3:2': { width: 1248, height: 832 }, '9:16': { width: 736, height: 1312 }, '16:9': { width: 1312, height: 736 },
};
/** Bria Expand: "canvas … should have an area of less than 5000x5000 pixels"; "the ratio of the main subject to the canvas area greater than 15%". */
export const EXPAND_MAX_AREA = 5000 * 5000 - 1;
export const EXPAND_MIN_COVER = 0.15;
/** The largest photo the photo tools take (long side), like Upscale's output cap. */
export const PHOTO_TOOL_MAX_SIDE = 8192;

export type Size = { width: number; height: number };
export type Block = { code: string; message: string } | null;
const ratioOf = (a: string): number | null => { const m = /^(\d+):(\d+)$/.exec(a); return m && Number(m[2]) > 0 ? Number(m[1]) / Number(m[2]) : null; };

/** A photo the tools can't take (too large, or not readable). */
export function photoBlock(src: Size | null | undefined): Block {
  if (!src || !(src.width > 0 && src.height > 0)) return null;
  const long = Math.max(src.width, src.height);
  return long > PHOTO_TOOL_MAX_SIDE ? { code: 'photo_too_large', message: `This photo is ${src.width}×${src.height}; the most is ${PHOTO_TOOL_MAX_SIDE} px on the long side. Use a smaller copy.` } : null;
}
/** Why Expand can't make this shape from this photo (null = it can). */
export function expandBlock(src: Size | null | undefined, aspect: string): Block {
  const r = ratioOf(aspect); if (r == null || !(EXPAND_ASPECTS as readonly string[]).includes(aspect)) return { code: 'invalid_aspect', message: `Pick one of ${EXPAND_ASPECTS.join(', ')}.` };
  if (!src || !(src.width > 0 && src.height > 0)) return null;
  const sr = src.width / src.height;
  if (Math.abs(sr - r) / r < 0.01) return { code: 'same_aspect', message: `Your photo is already ${aspect}. Pick another shape to add room around it.` };
  const cover = Math.min(sr / r, r / sr);
  if (cover < EXPAND_MIN_COVER) return { code: 'too_far', message: `At ${aspect} your photo would fill only ${Math.round(cover * 100)}% of the picture (15% at least). Pick a shape closer to the photo.` };
  return photoBlock(src);
}
/** The Bria Expand canvas: the photo centred on the smallest canvas of the target shape that holds it, scaled down to stay under 25 MP. */
export function expandCanvas(src: Size, aspect: string): { canvas: [number, number]; original: [number, number]; location: [number, number]; scale: number } {
  const r = ratioOf(aspect) ?? 1; const sr = src.width / src.height;
  let W = src.width, H = src.height; if (r > sr) W = Math.round(src.height * r); else H = Math.round(src.width / r);
  const s = Math.min(1, Math.sqrt(EXPAND_MAX_AREA / (W * H)) * 0.999);
  const cw = Math.max(1, Math.floor(W * s)), ch = Math.max(1, Math.floor(H * s)); const ow = Math.min(cw, Math.round(src.width * s)), oh = Math.min(ch, Math.round(src.height * s));
  return { canvas: [cw, ch], original: [ow, oh], location: [Math.floor((cw - ow) / 2), Math.floor((ch - oh) / 2)], scale: s };
}

/** Virtual Try-On (FASHN v1.6 on fal): the garment categories and garment photo kinds its schema takes. */
export const TRYON_CATEGORIES = [{ value: 'auto', label: 'Any type' }, { value: 'tops', label: 'Top' }, { value: 'bottoms', label: 'Bottom' }, { value: 'one-pieces', label: 'One-piece' }] as const;
export const TRYON_PHOTO_TYPES = [{ value: 'auto', label: 'Any photo' }, { value: 'model', label: 'Worn by someone' }, { value: 'flat-lay', label: 'Flat-lay' }] as const;
/** Erase Object: a mask over (nearly) the whole photo leaves nothing to rebuild from. */
export const ERASE_MAX_COVER = 0.95;
export const eraseMaskBlock = (cover: number | null | undefined): Block =>
  cover != null && cover > ERASE_MAX_COVER ? { code: 'mask_too_large', message: 'The mask covers the whole photo: paint just the object to erase.' } : null;
