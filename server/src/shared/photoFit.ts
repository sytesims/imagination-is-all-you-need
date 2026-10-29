/**
 * Input prep geometry (2026-10-23): fit or crop a photo to an aspect before an edit model that follows the photo's shape runs it.
 * Pure numbers (isomorphic): the web draws with them (web/src/shared/photoPrep.ts) and test/photo-prep.test.ts checks them.
 * - Fit: the whole photo, centred on a canvas of the aspect; the bands around it are a blurred, enlarged copy of the photo (transparent
 *   for a PNG with transparency). Never upscales the photo; the canvas long side is capped at `maxSide`.
 * - Crop: the largest box of the aspect inside the photo, placed by its centre (0–1 each way), clamped to the photo.
 * Sizes are whole pixels chosen so width / height is within 0.5% of the aspect (the server's check allows 1%).
 */
import { ratioOf } from './imageCaps.js';

export const PREP_MAX_SIDE = 4096; // the largest edit size any listed model renders (4K); bigger photos are scaled down
export const PREP_MIN_SIDE = 128; // the server's low_res block (mediaCheck IMAGE_MIN_SIDE_BLOCK)
export interface Box { x: number; y: number; w: number; h: number }
export interface FitPlan { width: number; height: number; /** where the photo goes on the canvas */ photo: Box }
export interface CropPlan { width: number; height: number; /** the part of the photo that is kept (photo pixels) */ src: Box }

/** Whole-pixel width × height of `aspect` with long side ≤ maxLong, as close to the ratio as whole pixels allow. */
export function sizeFor(aspect: string, long: number): { width: number; height: number } {
  const r = ratioOf(aspect); if (!r) throw new Error(`bad aspect ${aspect}`); const L = Math.max(1, Math.floor(long));
  return r >= 1 ? { width: L, height: Math.max(1, Math.round(L / r)) } : { width: Math.max(1, Math.round(L * r)), height: L };
}
/** Fit: the canvas of `aspect` that holds the whole photo at its own size (then scaled to fit maxSide). */
export function fitPlan(w: number, h: number, aspect: string, maxSide = PREP_MAX_SIDE): FitPlan {
  const r = ratioOf(aspect)!; const cw = Math.max(w, h * r), ch = cw / r; // the smallest canvas of that shape that contains the photo
  const k = Math.min(1, maxSide / Math.max(cw, ch)); const sz = sizeFor(aspect, Math.max(cw, ch) * k);
  const s = Math.min(sz.width / w, sz.height / h); const pw = Math.min(sz.width, Math.round(w * s)), ph = Math.min(sz.height, Math.round(h * s));
  return { ...sz, photo: { x: Math.round((sz.width - pw) / 2), y: Math.round((sz.height - ph) / 2), w: pw, h: ph } };
}
/** The largest box of `aspect` inside the photo (photo pixels), centred at (cx, cy) in 0–1 and clamped inside. */
export function cropBox(w: number, h: number, aspect: string, cx = 0.5, cy = 0.5): Box {
  const r = ratioOf(aspect)!; let bw = w, bh = w / r; if (bh > h) { bh = h; bw = h * r; }
  bw = Math.min(w, Math.round(bw)); bh = Math.min(h, Math.round(bh));
  return clampBox({ x: Math.round(cx * w - bw / 2), y: Math.round(cy * h - bh / 2), w: bw, h: bh }, w, h);
}
export const clampBox = (b: Box, w: number, h: number): Box => ({ ...b, x: Math.max(0, Math.min(w - b.w, b.x)), y: Math.max(0, Math.min(h - b.h, b.y)) });
/** Keyboard nudges: arrows move 1% of the photo (Shift: 10%), clamped. */
export function nudgeBox(b: Box, w: number, h: number, dx: number, dy: number, big = false): Box {
  const step = big ? 0.1 : 0.01; return clampBox({ ...b, x: Math.round(b.x + dx * step * w), y: Math.round(b.y + dy * step * h) }, w, h);
}
/** Crop: the output size for a box (scaled down to maxSide; never up). */
export function cropPlan(w: number, h: number, aspect: string, box: Box, maxSide = PREP_MAX_SIDE): CropPlan {
  const k = Math.min(1, maxSide / Math.max(box.w, box.h)); return { ...sizeFor(aspect, Math.max(box.w, box.h) * k), src: box };
}
/** The prepared photo is too small to send (the server blocks under 128 px on the short side). */
export const tooSmall = (width: number, height: number) => Math.min(width, height) < PREP_MIN_SIDE;
