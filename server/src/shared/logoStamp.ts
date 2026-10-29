/**
 * "Add logo and text" (2026-10-28): your brand's logo, and an optional line of text in its heading font, placed on a result exactly as they are
 * (composited by code, never redrawn by a model). One layout for the viewer's live preview, the transparent overlay PNG the browser draws at
 * the result's full size, and the video end card, so what you see is what the file gets. The server composites the PNG with ffmpeg
 * (routesStamp.ts): images exactly, videos with the sound kept. The original result is never changed; the stamped copy is a separate file.
 * Isomorphic, no imports.
 */
export type StampSpot = 'tl' | 'tc' | 'tr' | 'ml' | 'mc' | 'mr' | 'bl' | 'bc' | 'br';
export const STAMP_SPOTS: StampSpot[] = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'];
export const STAMP_CORNERS: StampSpot[] = ['tl', 'tr', 'bl', 'br'];
export const SPOT_NAME: Record<StampSpot, string> = { tl: 'Top left', tc: 'Top', tr: 'Top right', ml: 'Left', mc: 'Centre', mr: 'Right', bl: 'Bottom left', bc: 'Bottom', br: 'Bottom right' };
export type StampSize = 'S' | 'M' | 'L';
/** Logo height as a share of the picture's short side. */
export const STAMP_SIZES: Record<StampSize, number> = { S: 0.08, M: 0.12, L: 0.18 };
export interface StampSettings {
  spot: StampSpot; size: StampSize; /** 0.3..1 */ opacity: number; textOn: boolean; /** '' = the brand's name */ text: string;
  /** video only: a short card with the logo at the end */ endCard: boolean; /** auto: a plate behind the logo when it would get lost */ backing: 'auto' | 'off';
}
/** Approved defaults (user, 2026-10-28): bottom right, small, 90%, text in the heading font, no end card. */
export const STAMP_DEFAULTS: StampSettings = { spot: 'br', size: 'S', opacity: 0.9, textOn: true, text: '', endCard: false, backing: 'auto' };
export const STAMP_TEXT_MAX = 60;
/** Anything → valid settings (unknown or bad fields fall back to the defaults). */
export function normStamp(v: unknown): StampSettings {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>; const d = STAMP_DEFAULTS;
  const op = Number(o.opacity);
  return {
    spot: STAMP_SPOTS.includes(o.spot as StampSpot) ? (o.spot as StampSpot) : d.spot,
    size: o.size === 'S' || o.size === 'M' || o.size === 'L' ? o.size : d.size,
    opacity: Number.isFinite(op) ? Math.round(Math.max(0.3, Math.min(1, op)) * 100) / 100 : d.opacity,
    textOn: typeof o.textOn === 'boolean' ? o.textOn : d.textOn,
    text: typeof o.text === 'string' ? o.text.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, STAMP_TEXT_MAX) : d.text,
    endCard: typeof o.endCard === 'boolean' ? o.endCard : d.endCard,
    backing: o.backing === 'off' ? 'off' : 'auto',
  };
}
/** Which of the nine spots a point is in (fractions of the picture, 0..1): thirds both ways. */
export function spotAt(fx: number, fy: number): StampSpot {
  const c = fx < 1 / 3 ? 'l' : fx > 2 / 3 ? 'r' : 'c', r = fy < 1 / 3 ? 't' : fy > 2 / 3 ? 'b' : 'm';
  return `${r}${c}` as StampSpot;
}
/** The part of the picture a spot covers (its third both ways), as [x0, y0, x1, y1] fractions: where to read the brightness behind the stamp. */
export function spotPart(sp: StampSpot): [number, number, number, number] {
  const x = sp[1] === 'l' ? 0 : sp[1] === 'r' ? 2 / 3 : 1 / 3, y = sp[0] === 't' ? 0 : sp[0] === 'b' ? 2 / 3 : 1 / 3; return [x, y, x + 1 / 3, y + 1 / 3];
}
/** A plate behind the stamp when the logo's brightness and the picture's behind it are close (both 0..1): 'light' behind a dark logo, 'dark' behind a light one. */
export function plateFor(backing: StampSettings['backing'], logoLum: number | null, areaLum: number | null): 'light' | 'dark' | null {
  if (backing === 'off' || logoLum == null || areaLum == null) return null;
  return Math.abs(logoLum - areaLum) < 0.45 ? (logoLum < 0.5 ? 'light' : 'dark') : null;
}

export interface Box { x: number; y: number; w: number; h: number }
export interface StampLayout {
  S: number; margin: number; logoH: number; fontPx: number;
  logo: Box | null; text: (Box & { align: 'left' | 'center' | 'right' }) | null;
  /** the plate (when on) and the whole stamp's box (plate included): the drag handle */ plate: (Box & { r: number }) | null; box: Box;
}
/** Where the logo and the text go on a W × H picture. `logo` = the logo file's own size (null: text only); `textWidth(px)` = the text's
 *  width at that font size (the browser measures it with the heading font; 0 = no text). Logo above, text under it, both aligned to the spot's side. */
export function stampLayout(W: number, H: number, s: Pick<StampSettings, 'spot' | 'size'>, logo: { w: number; h: number } | null, textWidth: (px: number) => number, plate: boolean): StampLayout {
  const S = Math.min(W, H); const margin = Math.max(4, Math.round(S * 0.045)); const logoH = S * STAMP_SIZES[s.size];
  const fontPx = Math.max(10, Math.round(logoH * 0.36)); const gap = logoH * 0.15; const maxW = W * 0.6;
  let lw = logo && logo.h > 0 ? logoH * (logo.w / logo.h) : 0, lh = logo ? logoH : 0; if (lw > maxW) { lh *= maxW / lw; lw = maxW; }
  const tw0 = textWidth(fontPx); const tw = Math.min(tw0, maxW), th = tw0 > 0 ? fontPx * 1.25 : 0;
  const bw = Math.max(lw, tw), bh = lh + (lh && th ? gap : 0) + th;
  const pad = plate ? logoH * 0.18 : 0; const ow = bw + 2 * pad, oh = bh + 2 * pad;
  const col = s.spot[1], row = s.spot[0];
  const ox = col === 'l' ? margin : col === 'r' ? W - margin - ow : (W - ow) / 2;
  const oy = row === 't' ? margin : row === 'b' ? H - margin - oh : (H - oh) / 2;
  const align = col === 'l' ? 'left' : col === 'r' ? 'right' : 'center';
  const ax = (w: number) => (align === 'left' ? ox + pad : align === 'right' ? ox + pad + bw - w : ox + pad + (bw - w) / 2);
  return {
    S, margin, logoH, fontPx,
    logo: lw ? { x: ax(lw), y: oy + pad, w: lw, h: lh } : null,
    text: th ? { x: ax(tw), y: oy + pad + lh + (lh ? gap : 0), w: tw, h: th, align } : null,
    plate: plate && bw ? { x: ox, y: oy, w: ow, h: oh, r: logoH * 0.22 } : null, box: { x: ox, y: oy, w: ow, h: oh },
  };
}
/** The end card: the logo centred (22% of the short side tall, at most 60% wide) and the text under it. */
export function endCardLayout(W: number, H: number, logo: { w: number; h: number } | null, textWidth: (px: number) => number): { logo: Box | null; text: Box | null; fontPx: number } {
  const S = Math.min(W, H); let lh = logo ? S * 0.22 : 0, lw = logo && logo.h ? lh * (logo.w / logo.h) : 0; if (lw > W * 0.6) { lh *= (W * 0.6) / lw; lw = W * 0.6; }
  const fontPx = Math.max(12, Math.round(S * 0.06)); const tw = Math.min(textWidth(fontPx), W * 0.8), th = tw > 0 ? fontPx * 1.25 : 0; const gap = lh && th ? S * 0.05 : 0;
  const top = (H - (lh + gap + th)) / 2;
  return { logo: lw ? { x: (W - lw) / 2, y: top, w: lw, h: lh } : null, text: th ? { x: (W - tw) / 2, y: top + lh + gap, w: tw, h: th } : null, fontPx };
}
