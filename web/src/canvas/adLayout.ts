/**
 * Ad layout (2026-10-30): the maths behind the Ad layout card, as plain functions (no React, no DOM), so server/test/ad-layout.test.ts checks
 * them without a browser. The picture is made with no text; code lays the real headline, offer line, button and logo on top, so the words
 * and the logo are always right. adDraw.ts draws this layout on a canvas; the card (AdNode.tsx) previews it and exports the pack.
 *
 * One unit (the smaller of the width and the frame's geometric mean, over 1080) scales the same numbers on every size. The words stack
 * headline (wraps to 3 lines, then shrinks, then ends in "…"), offer line, button; a layout preset places that stack and the logo, and
 * the platforms' safe zones (adPlatforms.ts) keep them clear of each app's own buttons and captions. The card's style (AdStyle, below:
 * logo plate and colour, button shape and colour, text alignment, weight, colour and backdrop) is the same on every size; with none, the
 * ad looks as it did before styles.
 */
import { luminance, normHex, type BrandKit } from '../../../server/src/shared/brandKit';
import { AD_PLATFORMS, NO_EDGES, adExportPlan, type AdPlatform, type Edges } from './adPlatforms';
import { clampBox, clampN, clearArea, type AdEdit, type AdPart } from './adEdit';

export const AD_LIMITS = { headlines: 3, headline: 90, offer: 60, button: 28 } as const;

export interface Box { x: number; y: number; w: number; h: number }
/** The part of a sw × sh picture that fills a W × H frame (cover, centred). */
export function coverCrop(sw: number, sh: number, W: number, H: number): Box {
  if (!(sw > 0 && sh > 0)) return { x: 0, y: 0, w: 0, h: 0 };
  const wide = sw * H > sh * W; const w = wide ? (sh * W) / H : sw, h = wide ? sh : (sw * H) / W;
  return { x: (sw - w) / 2, y: (sh - h) / 2, w, h };
}

/** Text width at a size: the browser measures with the brand's fonts ('heading' for the headline, 'offer' and 'button' in the body font). */
export type AdMeasure = (text: string, px: number, role: 'heading' | 'offer' | 'button') => number;
type One = (text: string) => number;

/** Cut a line to fit `maxW`, ending in "…" (at a word break when one is near). */
export function ellipsize(text: string, maxW: number, m: One): string {
  if (m(text) <= maxW) return text; let t = text;
  while (t.length > 1 && m(t.trimEnd() + '…') > maxW) t = t.slice(0, -1);
  const sp = t.lastIndexOf(' '); if (sp > t.length * 0.6 && text[t.length] !== ' ') t = t.slice(0, sp);
  return t.trimEnd().replace(/[,;:.\-–—]+$/, '') + '…';
}
/** Greedy word wrap; a word wider than the line stays on its own line. */
export function wrapWords(text: string, maxW: number, m: One): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean); const out: string[] = []; let cur = '';
  for (const w of words) { const next = cur ? `${cur} ${w}` : w; if (!cur || m(next) <= maxW) cur = next; else { out.push(cur); cur = w; } }
  if (cur) out.push(cur); return out;
}
/** The biggest size (from `start` down to `min`) at which the text wraps into `maxLines` lines that all fit; at `min` it still doesn't,
 *  the last line ends in "…" (and a single too-long word is cut). */
export function fitLines(text: string, maxW: number, maxLines: number, start: number, min: number, measure: (t: string, px: number) => number): { lines: string[]; px: number } {
  const t = text.replace(/\s+/g, ' ').trim(); if (!t) return { lines: [], px: start };
  for (let px = Math.round(start); px >= min; px -= Math.max(1, Math.round(px * 0.04))) {
    const m = (s: string) => measure(s, px); const lines = wrapWords(t, maxW, m);
    if (lines.length <= maxLines && lines.every((l) => m(l) <= maxW)) return { lines, px };
  }
  const px = Math.round(min); const m = (s: string) => measure(s, px); const all = wrapWords(t, maxW, m);
  const lines = all.slice(0, maxLines);
  if (all.length > maxLines) lines[maxLines - 1] += ` ${all[maxLines]}`; /* too long for the line, so it ends in "…" */
  return { lines: lines.map((l) => ellipsize(l, maxW, m)), px };
}

export interface AdText { headline: string; offer: string; button: string }

/** The four one-click layouts. Split puts the picture on one side and the words on a plain panel (top / bottom on tall sizes). */
export type AdPreset = 'bottom' | 'top' | 'center' | 'split';
export type AdAlign = 'left' | 'center' | 'right';
export const AD_PRESETS: { id: AdPreset; label: string }[] = [
  { id: 'bottom', label: 'Text bottom' }, { id: 'top', label: 'Text top' }, { id: 'center', label: 'Centred' }, { id: 'split', label: 'Split' }];
export const asPreset = (v: unknown): AdPreset => (AD_PRESETS.some((x) => x.id === v) ? (v as AdPreset) : 'bottom');
/** Split goes side by side when the frame is at least this wide (16:9, 1.91:1); otherwise picture on top, words below. */
export const splitSideways = (W: number, H: number) => W / H >= 1.3;

export interface AdLayout {
  W: number; H: number; unit: number; margin: number;
  /** where the automatic layout puts the logo and words: inside the margins and out of every safe zone */ area: Box;
  /** where hand-placed parts may go: out of every safe zone (adEdit.ts) */ clear: Box;
  /** the words' column, and how they line up */ col: { x: number; w: number }; align: AdAlign;
  /** where the picture is drawn (the whole frame, or one side for Split) */ pic: Box; /** Split's plain panel behind the words */ panel: Box | null;
  logo: Box | null;
  /** lines line up left at x, or centred in x … x + w */
  headline: { lines: string[]; px: number; lineH: number; x: number; y: number; w: number } | null;
  offer: { text: string; px: number; x: number; y: number; w: number } | null;
  button: (Box & { r: number; text: string; px: number }) | null;
  /** the dark fade behind the words: 'down' darkens to the bottom, 'up' to the top, 'all' the whole frame; null: no words, a panel, or
   *  another backdrop picked */
  scrim: { dir: 'down' | 'up' | 'all'; from: number; to: number } | null;
  /** the "Solid panel" backdrop: a rounded box behind the words, inside the clear area */ backdrop: (Box & { r: number }) | null;
  /** the words' box (for reading the picture's brightness behind them) */ block: Box | null;
  /** each part's box as drawn (the headline's and offer's around their words): what "Edit ad" picks, moves and snaps to */
  boxes: Partial<Record<AdPart, Box>>;
}

/** The words stacked top-down from y = 0 in a column `w` wide: headline, offer line, button. */
function stack(t: AdText, w: number, u: number, start: number, maxLines: number, measure: AdMeasure) {
  let y = 0; let head: { lines: string[]; px: number; lineH: number; y: number } | null = null, offer: { text: string; px: number; y: number } | null = null, button: { w: number; h: number; text: string; px: number; y: number } | null = null;
  const ht = t.headline.replace(/\s+/g, ' ').trim(), ot = t.offer.replace(/\s+/g, ' ').trim(), bt = t.button.replace(/\s+/g, ' ').trim();
  if (ht) { const f = fitLines(ht, w, maxLines, start, Math.min(start, 56 * u), (s, px) => measure(s, px, 'heading')); const lineH = Math.round(f.px * 1.08); head = { lines: f.lines, px: f.px, lineH, y }; y += lineH * f.lines.length; }
  if (ot) { const f = fitLines(ot, w, 1, 44 * u, 32 * u, (s, px) => measure(s, px, 'offer')); if (head) y += Math.round(22 * u); offer = { text: f.lines[0], px: f.px, y }; y += Math.round(f.px * 1.25); }
  if (bt) {
    const h = Math.round(100 * u), pad = Math.round(52 * u); const f = fitLines(bt, w - 2 * pad, 1, 36 * u, 28 * u, (s, px) => measure(s, px, 'button'));
    if (offer) y += Math.round(40 * u); else if (head) y += Math.round(44 * u);
    button = { w: Math.min(w, Math.max(h * 2.4, measure(f.lines[0], f.px, 'button') + 2 * pad)), h, text: f.lines[0], px: f.px, y }; y += h;
  }
  return { head, offer, button, h: y };
}

/**
 * Lay out one ad on a W × H frame. `logoSize` = the logo file's own size (null: no logo). `safe` = the parts the platforms cover
 * (adPlatforms.ts): the logo and words always stay out of them, whatever the layout. A headline that doesn't fit the room left
 * drops to 2 lines, then 1. `edit` = this size's hand edits from "Edit ad" (adEdit.ts): hidden parts are left out, placed parts go
 * where the user put them; with none, the layout is automatic.
 */
export function layoutAd(W: number, H: number, text: AdText, logoSize: { w: number; h: number } | null, measure: AdMeasure, o: { safe?: Edges; preset?: AdPreset; edit?: AdEdit | null; style?: AdStyle | null } = {}): AdLayout {
  /* parts taken off this size are left out, as if they were empty */
  const hide = o.edit?.hide ?? []; const t = { ...text, offer: hide.includes('offer') ? '' : text.offer, button: hide.includes('button') ? '' : text.button };
  const logo = hide.includes('logo') ? null : logoSize;
  const u = Math.min(W, Math.sqrt(W * H)) / 1080; const margin = Math.round(80 * u); const gap = Math.round(40 * u); const safe = o.safe ?? NO_EDGES; const preset = o.preset ?? 'bottom';
  const inset = (f: number, d: number) => Math.max(margin, Math.round(f * d + (f > 0 ? 24 * u : 0)));
  const area: Box = { x: inset(safe.left, W), y: inset(safe.top, H), w: 0, h: 0 }; area.w = W - inset(safe.right, W) - area.x; area.h = H - inset(safe.bottom, H) - area.y;
  const x1 = area.x + area.w, y1 = area.y + area.h;
  const side = preset === 'split' && splitSideways(W, H); const align: AdAlign = o.style?.textAlign ?? (preset === 'center' ? 'center' : 'left');
  const col = side ? { x: Math.max(area.x, Math.round(W / 2) + margin), w: 0 } : { x: area.x, w: area.w }; if (side) col.w = x1 - col.x;

  let lg: Box | null = null;
  if (logo && logo.w > 0 && logo.h > 0) {
    let lh = 92 * u, lw = lh * (logo.w / logo.h); const cap = Math.min(W * 0.4, col.w); if (lw > cap) { lh *= cap / lw; lw = cap; }
    lg = { x: align === 'center' ? col.x + (col.w - lw) / 2 : align === 'right' ? col.x + col.w - lw : col.x, y: preset === 'top' ? y1 - lh : area.y, w: lw, h: lh };
  }
  /* the room the words get, top to bottom */
  const roomTop = preset === 'top' || !lg ? area.y : lg.y + lg.h + gap, roomBottom = preset === 'top' && lg ? lg.y - gap : y1;
  const start = (side ? 72 : H / W > 1.6 ? 104 : H > W ? 96 : 88) * u;
  let s = stack(t, col.w, u, start, 3, measure);
  for (let n = 2; n >= 1 && s.h > roomBottom - roomTop && s.head && s.head.lines.length > n; n--) s = stack(t, col.w, u, start, n, measure);
  const y0 = preset === 'top' ? roomTop : preset === 'bottom' || (preset === 'split' && !side) ? roomBottom - s.h : Math.round(roomTop + Math.max(0, (roomBottom - roomTop - s.h) / 2));
  const xOf = (w: number) => (align === 'center' ? col.x + (col.w - w) / 2 : align === 'right' ? col.x + col.w - w : col.x);
  const radius = (h: number) => buttonRadius(o.style?.buttonShape, h);
  let headline = s.head && { lines: s.head.lines, px: s.head.px, lineH: s.head.lineH, x: col.x, y: y0 + s.head.y, w: col.w };
  let offer = s.offer && { text: s.offer.text, px: s.offer.px, x: col.x, y: y0 + s.offer.y, w: col.w };
  let button = s.button && { x: xOf(s.button.w), y: y0 + s.button.y, w: s.button.w, h: s.button.h, r: radius(s.button.h), text: s.button.text, px: s.button.px };
  const boxes: AdLayout['boxes'] = {}; if (lg) boxes.logo = lg;
  if (headline) { const tw = Math.max(...headline.lines.map((l) => measure(l, headline!.px, 'heading'))); boxes.headline = { x: xOf(tw), y: headline.y, w: tw, h: headline.lineH * headline.lines.length }; }
  if (offer) { const tw = measure(offer.text, offer.px, 'offer'); boxes.offer = { x: xOf(tw), y: offer.y, w: tw, h: Math.round(offer.px * 1.25) }; }
  if (button) boxes.button = { x: button.x, y: button.y, w: button.w, h: button.h };

  /* hand-placed parts (adEdit.ts): sized from their saved fractions, always inside the clear area */
  const clear = clearArea(W, H, safe); const c = clear; const at = o.edit?.at ?? {};
  if (at.logo && lg && logo) {
    const r = logo.h / logo.w; const w = clampN((at.logo.w ?? lg.w / W) * W, Math.min(24 * u, c.w, c.h / r), Math.min(c.w, c.h / r));
    lg = clampBox({ x: at.logo.x * W, y: at.logo.y * H, w, h: w * r }, c); boxes.logo = lg;
  }
  if (at.headline && headline) {
    const a = at.headline; const w = clampN((a.w ?? boxes.headline!.w / W) * W, Math.min(c.w, 80 * u), c.w); let px = clampN((a.s ?? headline.px / W) * W, 16 * u, 400 * u);
    const m = (q: string, n: number) => measure(q, n, 'heading'); let f = fitLines(t.headline, w, 3, px, px, m); /* its own size, no shrinking: the first drag mustn't re-wrap it */ let lineH = Math.round(f.px * 1.08);
    for (let i = 0; i < 6 && lineH * f.lines.length > c.h; i++) { px = Math.max(8 * u, (px * c.h) / (lineH * f.lines.length) * 0.97); f = fitLines(t.headline, w, 3, px, px, m); lineH = Math.round(f.px * 1.08); }
    const lines = f.lines.slice(0, Math.max(1, Math.floor(c.h / lineH)));
    const b = clampBox({ x: a.x * W, y: a.y * H, w, h: lineH * lines.length }, c); headline = { lines, px: f.px, lineH, x: b.x, y: b.y, w }; boxes.headline = b;
  }
  if (at.offer && offer) {
    const px = clampN((at.offer.s ?? offer.px / W) * W, 14 * u, 200 * u); const f = fitLines(t.offer, c.w, 1, px, px * 0.8, (q, n) => measure(q, n, 'offer'));
    const tw = Math.min(c.w, measure(f.lines[0], f.px, 'offer')); const b = clampBox({ x: at.offer.x * W, y: at.offer.y * H, w: tw, h: Math.round(f.px * 1.25) }, c);
    offer = { text: f.lines[0], px: f.px, x: b.x, y: b.y, w: tw }; boxes.offer = b;
  }
  if (at.button && button) {
    const h = Math.min(button.h, c.h); const w = clampN((at.button.w ?? button.w / W) * W, Math.min(c.w, h * 1.4), c.w); const pad = Math.min(52 * u, w * 0.16);
    const f = fitLines(t.button, w - 2 * pad, 1, 36 * u, Math.min(28 * u, 20 * u), (q, n) => measure(q, n, 'button'));
    const b = clampBox({ x: at.button.x * W, y: at.button.y * H, w, h }, c); button = { ...b, r: radius(h), text: f.lines[0], px: f.px }; boxes.button = b;
  }
  const words = [boxes.headline, boxes.offer, boxes.button].filter((b): b is Box => !!b);
  const top = words.length ? Math.min(...words.map((b) => b.y)) : 0; const block = words.length ? { x: 0, y: top, w: W, h: Math.max(...words.map((b) => b.y + b.h)) - top } : null;

  let pic: Box = { x: 0, y: 0, w: W, h: H }, panel: Box | null = null, scrim: AdLayout['scrim'] = null, backdrop: AdLayout['backdrop'] = null; const bd = o.style?.backdrop ?? 'gradient';
  if (preset === 'split' && side) { const half = Math.round(W / 2); pic = { x: 0, y: 0, w: half, h: H }; panel = { x: half, y: 0, w: W - half, h: H }; }
  else if (preset === 'split') { const ptop = block ? Math.max(0, Math.round(block.y - gap)) : Math.round(H * 0.62); pic = { x: 0, y: 0, w: W, h: ptop }; panel = { x: 0, y: ptop, w: W, h: H - ptop }; }
  else if (block && bd === 'panel') {
    /* around the words (not the whole width), padded, and cut back to the clear area so it never pokes into a safe zone */
    const pad = Math.round(32 * u); const x0 = Math.max(c.x, Math.min(...words.map((b) => b.x)) - pad), x1 = Math.min(c.x + c.w, Math.max(...words.map((b) => b.x + b.w)) + pad);
    const t0 = Math.max(c.y, block.y - pad), t1 = Math.min(c.y + c.h, block.y + block.h + pad); backdrop = { x: x0, y: t0, w: x1 - x0, h: t1 - t0, r: Math.round(20 * u) };
  }
  else if (block && bd === 'gradient') scrim = preset === 'bottom' ? { dir: 'down', from: Math.max(0, block.y - H * 0.22), to: H } : preset === 'top' ? { dir: 'up', from: 0, to: Math.min(H, block.y + block.h + H * 0.22) } : { dir: 'all', from: 0, to: H };
  return { W, H, unit: u, margin, area, clear, col, align, pic, panel, logo: lg, headline, offer, button, scrim, backdrop, block, boxes };
}

/** How dark the scrim gets at the bottom (0..1) for a picture this bright behind the text (0..1; null = unknown). */
export const scrimAlpha = (lum: number | null) => Math.min(0.9, 0.52 + 0.45 * (lum ?? 0.5));

// ---------------------------------------------------------------- style
/**
 * The card's style (2026-10-31), the same on every size; every field is optional and a missing one keeps the look from before styles:
 *  - logoPlate: the plate behind the logo: auto (only when the logo would get lost on the picture), on, off.
 *  - logoTone: the logo as it is, or all white (light) or all near black (dark). Only a see-through logo is recoloured (logoToneFor):
 *    one with its own background (a JPG, a square app icon) would turn into a solid block, so it stays as it is.
 *  - buttonShape: pill, rounded, square or outline (no fill: the colour on the edge and the words); buttonColor: a hex (none: the brand's primary).
 *  - textAlign (none: the layout's own: left, centred for "Centred"), textWeight (none: bold), textColor (a hex; none: white, or the
 *    readable one on a panel) for the headline and the offer.
 *  - backdrop behind the words: none, a soft shadow, the gradient (the default) or a solid panel.
 */
export type LogoPlate = 'auto' | 'on' | 'off';
export type LogoTone = 'original' | 'light' | 'dark';
export type ButtonShape = 'pill' | 'rounded' | 'square' | 'outline';
export type TextWeight = 'regular' | 'bold';
export type Backdrop = 'none' | 'shadow' | 'gradient' | 'panel';
export interface AdStyle { logoPlate?: LogoPlate; logoTone?: LogoTone; buttonShape?: ButtonShape; buttonColor?: string; textAlign?: AdAlign; textWeight?: TextWeight; textColor?: string; backdrop?: Backdrop }
const oneOf = <T extends string>(v: unknown, xs: readonly T[]): T | undefined => (xs.includes(v as T) ? (v as T) : undefined);
/** The saved style, cleaned: odd values are dropped (an old card has none, so it looks as before). */
export function asStyle(v: unknown): AdStyle {
  if (!v || typeof v !== 'object') return {}; const o = v as Record<string, unknown>; const out: AdStyle = {};
  const put = <K extends keyof AdStyle>(k: K, x: AdStyle[K] | undefined | null) => { if (x) out[k] = x; };
  put('logoPlate', oneOf(o.logoPlate, ['auto', 'on', 'off'] as const)); put('logoTone', oneOf(o.logoTone, ['original', 'light', 'dark'] as const));
  put('buttonShape', oneOf(o.buttonShape, ['pill', 'rounded', 'square', 'outline'] as const)); put('buttonColor', normHex(o.buttonColor as string));
  put('textAlign', oneOf(o.textAlign, ['left', 'center', 'right'] as const)); put('textWeight', oneOf(o.textWeight, ['regular', 'bold'] as const));
  put('textColor', normHex(o.textColor as string)); put('backdrop', oneOf(o.backdrop, ['none', 'shadow', 'gradient', 'panel'] as const));
  return out;
}
/** Is the logo see-through (a mark on a transparent background)? `rgba` = its pixels (any small sample); at least 12% of them clear.
 *  A logo with its own background (a JPG, a square or rounded-square icon) is not: recolouring it all would paint a solid block. */
export function logoSeeThrough(rgba: ArrayLike<number>): boolean {
  let clear = 0, n = 0; for (let i = 3; i < rgba.length; i += 4) { n++; if (rgba[i] < 128) clear++; } return n > 0 && clear / n >= 0.12;
}
/** The logo colour actually drawn: Light / Dark only for a see-through logo, else the logo as it is. */
export const logoToneFor = (tone: LogoTone | undefined, seeThrough: boolean): LogoTone => (tone && seeThrough ? tone : 'original');
/** The button's corner radius for its shape (pill and outline: fully round). */
export const buttonRadius = (shape: ButtonShape | undefined, h: number) => (shape === 'rounded' ? h * 0.24 : shape === 'square' ? 0 : h / 2);
/** WCAG contrast between two colours (1..21). */
export const contrastOf = (a: string, b: string) => { const x = luminance(normHex(a) ?? '#FFFFFF'), y = luminance(normHex(b) ?? '#FFFFFF'); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const rgbaOf = (hex: string, a: number) => { const h = (normHex(hex) ?? '#FFFFFF').slice(1); return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`; };
/** Split's panel and the "Solid panel": the brand's background colour, else near black; with a text colour picked, a panel it reads on
 *  (the brand's background when it does, else near black under light words and white under dark ones). */
export function panelColorOf(kit: BrandKit | null | undefined, text?: string | null): string {
  const bg = normHex(kit?.colors.find((c) => c.role === 'background')?.hex) ?? '#121316'; if (!text) return bg;
  const lightText = inkOn(text) === '#14151A'; return (inkOn(bg) === '#FFFFFF') === lightText ? bg : lightText ? '#121316' : '#FFFFFF';
}
export interface AdColors {
  /** the panel the words sit on (Split's or the solid one), null on the picture */ surface: string | null;
  ink: string; offer: string; /** text shadow ('transparent': none) and its blur per px of text */ shadow: string; shadowBlur: number;
  /** the gradient's colour: dark behind light words, light behind dark ones */ scrim: 'dark' | 'light';
  button: { fill: string | null; edge: string | null; text: string };
}
/** Every colour the ad is drawn with, from the brand and the style; `surface`: what the words sit on (Split's panel, the solid panel,
 *  or none). Words stay readable: a picked text colour gets a panel and a gradient it reads on, and the button's words are white or near
 *  black, whichever reads on it. */
export function adColors(kit: BrandKit | null | undefined, style: AdStyle | null | undefined, surface: 'split' | 'panel' | null): AdColors {
  const st = style ?? {}; const bd = st.backdrop ?? 'gradient'; const sf = surface ? panelColorOf(kit, st.textColor) : null;
  const ink = st.textColor ?? (sf ? inkOn(sf) : '#FFFFFF'); const light = inkOn(ink) === '#14151A';
  const offer = st.textColor ? rgbaOf(ink, 0.88) : light ? 'rgba(255,255,255,0.88)' : 'rgba(20,21,26,0.8)';
  const shadow = sf || bd === 'none' ? 'transparent' : bd === 'shadow' ? (light ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)') : light ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)';
  const fill = st.buttonColor ?? buttonColorOf(kit); let button: AdColors['button'];
  if (st.buttonShape === 'outline') { const c = sf && contrastOf(fill, sf) < 3 ? ink : fill; button = { fill: null, edge: c, text: c }; }
  else button = { fill, edge: sf && contrastOf(fill, sf) < 1.25 ? ink : null, text: inkOn(fill) };
  return { surface: sf, ink, offer, shadow, shadowBlur: bd === 'shadow' ? 0.4 : 0.25, scrim: light ? 'dark' : 'light', button };
}

// ---------------------------------------------------------------- brand
/** The button's colour: the brand's primary, else its first colour, else white (never our own orange on someone else's ad). */
export function buttonColorOf(kit: BrandKit | null | undefined): string {
  const c = kit?.colors ?? []; return normHex(c.find((x) => x.role === 'primary')?.hex ?? c.find((x) => x.role !== 'background' && x.role !== 'text')?.hex ?? c[0]?.hex) ?? '#FFFFFF';
}
/** Readable text on a colour: white or near black, whichever has more contrast (WCAG). */
export function inkOn(hex: string): '#FFFFFF' | '#14151A' {
  const L = luminance(normHex(hex) ?? '#FFFFFF'); const white = 1.05 / (L + 0.05), dark = (L + 0.05) / (luminance('#14151A') + 0.05);
  return white >= dark ? '#FFFFFF' : '#14151A';
}

// ---------------------------------------------------------------- the pack
/** The headline variants to export: each filled headline (1-based number kept), or one plain variant when none is filled. */
export function adVariants(headlines: string[]): { n: number; headline: string }[] {
  const v = headlines.slice(0, AD_LIMITS.headlines).map((h, i) => ({ n: i + 1, headline: (h ?? '').trim() })).filter((x) => x.headline);
  return v.length ? v : [{ n: 0, headline: '' }];
}
export const slugOf = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'ad';
/** brand-headline1-4x5.png (brand-4x5.png with no headline); `tag` is the size's own (AD_SHAPES in adPlatforms.ts). */
export const adFileName = (brand: string, n: number, tag: string) => `${slugOf(brand)}${n ? `-headline${n}` : ''}-${tag}.png`;

/** Every file in the Export pack: `folder/brand-headline1-4x5.png` per picked platform, size and headline. */
export function adPackFiles(brand: string, platforms: AdPlatform[], headlines: string[]) {
  return adExportPlan(platforms).flatMap((f) => adVariants(headlines).flatMap((v) => f.sizes.map((s) => ({ path: `${f.folder}/${adFileName(brand, v.n, s.tag)}`, ...s, n: v.n, headline: v.headline }))));
}

// ---------------------------------------------------------------- post copy
const chars = (s: string) => Array.from(s).length;
/** Cut text to `max` characters at a word break, ending in "…" (whole words only; a single word longer than the limit is cut). */
export function trimWords(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim(); if (chars(t) <= max) return t; let out = '';
  for (const w of t.split(' ')) { const next = out ? `${out} ${w}` : w; if (chars(next) + 1 > max) break; out = next; }
  out = out.replace(/[\s,;:.\-–—·|]+$/, '') || Array.from(t).slice(0, max - 1).join('');
  return `${out}…`;
}
/** The card's words as sentences: "Fresh coffee, every morning. From $4. Order now." */
const sentences = (parts: string[]) => parts.map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean).map((s) => (/[.!?…]$/.test(s) ? s : `${s}.`)).join(' ');
/**
 * post-copy.txt for one platform: per headline, each of its text boxes (adPlatforms.ts, PostField) filled from the card and cut to that
 * box's limit at a word break, then the button's words as the call to action and a "[your link]" line to fill in (we never make one up).
 */
export function postCopy(p: AdPlatform, headlines: string[], offer: string, button: string): string {
  const pf = AD_PLATFORMS[p]; const cta = button.replace(/\s+/g, ' ').trim(); const out = [`${pf.label}: text to paste with the pictures in this folder.`, ''];
  for (const v of adVariants(headlines)) {
    if (v.n) out.push(`Headline ${v.n}`, '');
    for (const f of pf.post) { const text = trimWords(f.from === 'headline' ? v.headline || offer : sentences([v.headline, offer, cta]), f.max - (f.keep ?? 0));
      if (text) out.push(`${f.label} (up to ${f.max} characters${f.keep ? ', with your link' : ''}):`, text, ''); }
    if (cta) out.push(`Call to action: ${cta}`); out.push('Link: [your link]', '');
  }
  return out.join('\n');
}
