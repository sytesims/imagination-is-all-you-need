/**
 * The source-clip rules the video tools refuse at submit (2026-10-31), in one isomorphic place: the tools' parse (tools/shared.ts parseCommon,
 * tools/h3) and the Canvas card's pre-flight read the same numbers and the same words, so a clip that's too small or too long is flagged
 * before Generate with exactly the sentence the server would answer with.
 */
export const CLIP_MIN_PIXELS = 409_600;
export const CLIP_MIN_SEC = 4;
/** Extend (every model) takes clips up to a minute. */
export const EXTEND_MAX_SEC = 60;
/** LTX-2.5 Extend's provider id (comfy/ltx25Extend.ts LTX25_EXTEND; a test keeps the two the same). */
export const LTX25_EXTEND_ID = 'comfy-ltx25-extend';

export interface ClipInfo { width: number; height: number; duration: number }
export interface ClipRule { minSec?: number; minPixels?: number; minSide?: number; maxSec?: number }
export interface ClipIssue { code: 'too_short' | 'too_small' | 'too_long'; message: string }

export const clipTooShortText = (minSec: number) => `Clip is too short — minimum ${minSec} second${minSec === 1 ? '' : 's'}.`;
export const clipTooFewPixelsText = (w: number, h: number) => `Video too small: needs ≥ ${CLIP_MIN_PIXELS.toLocaleString('en-US')} px per frame (e.g. 854×480). Yours is ${w}×${h}.`;
export const clipShortSideText = (w: number, h: number, min: number) => `That clip is too small (${w}×${h}); use one at least ${min} px on its short side.`;
export const EXTEND_TOO_LONG_TEXT = `Extend takes clips up to ${EXTEND_MAX_SEC} s.`;

/** The rule a tool's source clip must meet (null: the tool has no clip rule we check before Generate). */
export function clipRuleFor(toolId: string, provider = ''): ClipRule | null {
  if (toolId === 'soundtrack') return { minSec: 1 };
  if (toolId === 'h3-extend') return provider === LTX25_EXTEND_ID ? { minSide: 128, maxSec: EXTEND_MAX_SEC } : { minSec: 1, minPixels: CLIP_MIN_PIXELS, maxSec: EXTEND_MAX_SEC };
  if (toolId === 'upscale') return { minSec: CLIP_MIN_SEC, minPixels: CLIP_MIN_PIXELS };
  return null;
}

/** The first thing the run would refuse about this clip, in the server's order (length, then size, then too long), or null. */
export function clipIssue(rule: ClipRule | null, c: ClipInfo | null | undefined): ClipIssue | null {
  if (!rule || !c) return null; const { width: w, height: h, duration: d } = c;
  if (rule.minSec && d > 0 && d < rule.minSec) return { code: 'too_short', message: clipTooShortText(rule.minSec) };
  if (w > 0 && h > 0) {
    if (rule.minPixels && w * h < rule.minPixels) return { code: 'too_small', message: clipTooFewPixelsText(w, h) };
    if (rule.minSide && Math.min(w, h) < rule.minSide) return { code: 'too_small', message: clipShortSideText(w, h, rule.minSide) };
  }
  if (rule.maxSec && d > rule.maxSec) return { code: 'too_long', message: EXTEND_TOO_LONG_TEXT };
  return null;
}
