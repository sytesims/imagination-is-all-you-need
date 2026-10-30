/**
 * Ad layout card, hand edits (2026-10-30): what "Edit ad" saves and the geometry behind it, as plain functions (no React, no DOM), so
 * server/test/ad-layout.test.ts checks them. Each size keeps its own edits (the card's `edits` prop, keyed by shape); a size with none
 * keeps the automatic layout (adLayout.layoutAd). Everything is stored as fractions of the frame, so a size drawn bigger (1080 → 1200)
 * keeps the same arrangement.
 *
 *  - at: where the user put the logo / headline / offer / button (x, y of the frame; w = width / W; s = text size / W). A part with no
 *    place keeps its automatic spot.
 *  - hide: optional parts taken off this size (logo, offer, button).
 *  - pic: the picture's framing: zoom (1 = just covers the frame) and the focal point (fractions of the picture).
 *
 * Every part is kept inside the clear area: the frame minus the picked platforms' safe zones.
 */
import type { Box } from './adLayout';
import type { Edges } from './adPlatforms';

export type AdPart = 'logo' | 'headline' | 'offer' | 'button';
export const AD_PARTS: AdPart[] = ['logo', 'headline', 'offer', 'button'];
/** Parts that can be taken off an ad (the headline is the ad). */
export const HIDEABLE: AdPart[] = ['logo', 'offer', 'button'];
export const PART_NAME: Record<AdPart, string> = { logo: 'Logo', headline: 'Headline', offer: 'Price or offer', button: 'Button' };
export interface AdPlace { x: number; y: number; w?: number; s?: number }
export interface AdFrame { zoom: number; fx: number; fy: number }
export interface AdEdit { at?: Partial<Record<AdPart, AdPlace>>; hide?: AdPart[]; pic?: AdFrame }
export type AdEdits = Partial<Record<string, AdEdit>>;
export const PIC_ZOOM = { min: 1, max: 4 } as const;

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export const clampN = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Saved edits, cleaned: odd values are dropped, so an old or hand-made card always draws. Old cards have none. */
export function asEdits(v: unknown): AdEdits {
  if (!v || typeof v !== 'object') return {}; const out: AdEdits = {};
  for (const [k, e] of Object.entries(v as Record<string, any>)) {
    if (!e || typeof e !== 'object') continue; const one: AdEdit = {};
    const at: Partial<Record<AdPart, AdPlace>> = {};
    for (const p of AD_PARTS) { const a = e.at?.[p]; if (a && num(a.x) && num(a.y)) at[p] = { x: a.x, y: a.y, ...(num(a.w) && a.w > 0 ? { w: a.w } : {}), ...(num(a.s) && a.s > 0 ? { s: a.s } : {}) }; }
    if (Object.keys(at).length) one.at = at;
    const hide = Array.isArray(e.hide) ? HIDEABLE.filter((p) => e.hide.includes(p)) : []; if (hide.length) one.hide = hide;
    if (e.pic && num(e.pic.zoom) && num(e.pic.fx) && num(e.pic.fy)) one.pic = { zoom: clampN(e.pic.zoom, PIC_ZOOM.min, PIC_ZOOM.max), fx: clampN(e.pic.fx, 0, 1), fy: clampN(e.pic.fy, 0, 1) };
    if (Object.keys(one).length) out[k] = one;
  }
  return out;
}
/** Has this size been changed by hand? (Untouched sizes keep the automatic layout.) */
export const isEdited = (e: AdEdit | null | undefined) => !!e && (!!e.at && Object.keys(e.at).length > 0 || !!e.hide?.length || !!e.pic && (e.pic.zoom !== 1 || Math.abs(e.pic.fx - 0.5) > 1e-6 || Math.abs(e.pic.fy - 0.5) > 1e-6));

// ---------------------------------------------------------------- boxes
/** The clear area: the frame minus the safe zones (where the parts may go). */
export const clearArea = (W: number, H: number, safe: Edges): Box => ({ x: safe.left * W, y: safe.top * H, w: W - (safe.left + safe.right) * W, h: H - (safe.top + safe.bottom) * H });
/** Move `b` inside `a` (a box bigger than the area sits on its top-left edge). */
export function clampBox(b: Box, a: Box): Box {
  return { ...b, x: Math.max(a.x, Math.min(b.x, a.x + a.w - b.w)), y: Math.max(a.y, Math.min(b.y, a.y + a.h - b.h)) };
}
export const inBox = (b: Box, x: number, y: number) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
/** A box ↔ its saved place (fractions of the frame); `px` is the text size for the headline and the offer. */
export const placeOf = (b: Box, W: number, H: number, px?: number): AdPlace => ({ x: b.x / W, y: b.y / H, w: b.w / W, ...(px ? { s: px / W } : {}) });

// ---------------------------------------------------------------- snapping
export interface Guides { xs: number[]; ys: number[] }
/** The lines a part snaps to: the clear area's and the margins' edges, the frame's centre lines, and the other parts' edges and centres. */
export function guidesFor(W: number, H: number, clear: Box, area: Box, others: Box[]): Guides {
  const xs = [clear.x, clear.x + clear.w, area.x, area.x + area.w, W / 2], ys = [clear.y, clear.y + clear.h, area.y, area.y + area.h, H / 2];
  for (const b of others) { xs.push(b.x, b.x + b.w / 2, b.x + b.w); ys.push(b.y, b.y + b.h / 2, b.y + b.h); }
  return { xs, ys };
}
/** The nearest guide to any of `vs` within `th`: how far to move, and the guide (null: nothing close enough). */
export function snapTo(vs: number[], lines: number[], th: number): { d: number; at: number | null } {
  let best = { d: 0, at: null as number | null }; let bestAbs = th + 1e-9;
  for (const v of vs) for (const g of lines) { const d = g - v; if (Math.abs(d) < bestAbs) { bestAbs = Math.abs(d); best = { d, at: g }; } }
  return best;
}
/** Snap a moving box: its left / centre / right to the x guides, top / middle / bottom to the y guides. */
export function snapBox(b: Box, g: Guides, th: number): { box: Box; gx: number | null; gy: number | null } {
  const sx = snapTo([b.x, b.x + b.w / 2, b.x + b.w], g.xs, th), sy = snapTo([b.y, b.y + b.h / 2, b.y + b.h], g.ys, th);
  return { box: { ...b, x: b.x + sx.d, y: b.y + sy.d }, gx: sx.at, gy: sy.at };
}

// ---------------------------------------------------------------- the picture
/** The part of a sw × sh picture shown in a fw × fh frame: covered at zoom 1, `zoom` times closer, centred on the focal point as far as
 *  the picture allows. Always inside the picture and always the frame's shape, so the frame never shows an empty edge. */
export function picCrop(sw: number, sh: number, fw: number, fh: number, f?: AdFrame | null): Box {
  if (!(sw > 0 && sh > 0 && fw > 0 && fh > 0)) return { x: 0, y: 0, w: 0, h: 0 };
  const wide = sw * fh > sh * fw; const cw = wide ? (sh * fw) / fh : sw, ch = wide ? sh : (sw * fh) / fw;
  const z = clampN(f?.zoom ?? 1, PIC_ZOOM.min, PIC_ZOOM.max); const w = cw / z, h = ch / z;
  const fx = clampN(f?.fx ?? 0.5, 0, 1), fy = clampN(f?.fy ?? 0.5, 0, 1);
  return { x: clampN(fx * sw - w / 2, 0, sw - w), y: clampN(fy * sh - h / 2, 0, sh - h), w, h };
}
/** The framing after dragging the picture by (dx, dy) frame pixels from `f`, or zooming to `zoom`: the focal point is the crop's centre,
 *  so it never drifts past what the picture can show. */
export function moveFrame(f: AdFrame | null | undefined, sw: number, sh: number, fw: number, fh: number, dx: number, dy: number, zoom?: number): AdFrame {
  const z = clampN(zoom ?? f?.zoom ?? 1, PIC_ZOOM.min, PIC_ZOOM.max); const c = picCrop(sw, sh, fw, fh, { zoom: z, fx: f?.fx ?? 0.5, fy: f?.fy ?? 0.5 });
  if (!c.w) return { zoom: z, fx: 0.5, fy: 0.5 };
  const n = picCrop(sw, sh, fw, fh, { zoom: z, fx: (c.x + c.w / 2 - (dx * c.w) / fw) / sw, fy: (c.y + c.h / 2 - (dy * c.h) / fh) / sh });
  return { zoom: z, fx: (n.x + n.w / 2) / sw, fy: (n.y + n.h / 2) / sh };
}
