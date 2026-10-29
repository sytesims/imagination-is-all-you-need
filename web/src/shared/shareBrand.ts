/**
 * Branded share images drawn on a canvas at the result's native resolution (re-encoding
 * through the canvas also drops every byte of metadata), the transparent badge/strip overlay for video, and the 1080p end card.
 * Layout (S = short side): margin 4% of S (≥16px), badge 4.5% of S (28–72px), strip 7% of S. Contrast plate #0F1113 at 62%, 75% when
 * the area behind it is bright. Text #F7F7F8; "Imagination" and the separators #FF7A1A. Brand fonts and marks come from shareCard.ts.
 */
import { drawOrbit, drawWordmark, fit, wrap, roundRect, loadImg, REPO_URL } from './shareCard';
import { appFileName } from './brand';
import type { BrandStyle, BrandToggles } from './sharePrefs';
import { beanSvg, avatarChoiceOf } from '../../../server/src/shared/beanSvg';

export interface BrandInfo { workflow: string; model: string | null; handle: string | null; displayName: string | null; avatar?: { mood?: string; tint?: string } | null; avatarUrl?: string | null; prompt: string | null; /** Image to layers: the number of layers ("13 layers" on the strip and the framed card) */ layers?: number | null }
export interface BrandOpts { style: BrandStyle; toggles: BrandToggles; info: BrandInfo; /** marks sized for this short side (shareFrame.ts, a letterboxed picture) */ S?: number }
const INK = '#F7F7F8', ORANGE = '#FF7A1A', NEAR_BLACK = '#0F1113', GREY = '#A6A7A9';
const SG = '"Space Grotesk", Inter, system-ui, sans-serif', IN = 'Inter, system-ui, sans-serif';
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** `scaleS` (optional): size the marks for a larger short side than the picture's own, e.g. a picture letterboxed into a 1080-wide Reel, so the
 *  badge reads at the frame's size rather than the picture's. */
export function layoutOf(w: number, h: number, scaleS?: number) {
  const S = Math.max(Math.min(w, h), scaleS ?? 0);
  return { S, margin: Math.max(16, Math.round(S * 0.04)), badgeH: Math.round(clamp(S * 0.045, 28, 72)), stripH: Math.round(Math.max(28, S * 0.07)) };
}
/** Exported for tests: what each style shows given the toggles (handle only when one is set). */
export function visibleBits(o: BrandOpts) {
  const t = o.toggles; const handle = t.handle && o.info.handle ? `@${o.info.handle}` : null;
  return { app: t.app, handle, workflow: t.workflow && o.info.workflow ? o.info.workflow : null, model: t.model && o.info.model ? o.info.model : null,
    prompt: o.style === 'card' && t.prompt && o.info.prompt ? o.info.prompt : null, layers: t.layers !== false && o.info.layers && o.info.layers > 1 ? `${o.info.layers} layers` : null };
}
export const hasAnything = (o: BrandOpts) => { const b = visibleBits(o); return o.style === 'card' || !!(o.style === 'badge' ? (b.app || b.handle) : (b.app || b.handle || b.workflow || b.model)); };

/** Mean luma (0–1) of a region of the source (for the plate's opacity). */
export function regionLuma(img: CanvasImageSource | null, sw: number, sh: number, r: { x: number; y: number; w: number; h: number }): number {
  if (!img) return 0; try { const c = document.createElement('canvas'); c.width = 24; c.height = 8; const x = c.getContext('2d', { willReadFrequently: true })!;
    x.drawImage(img, r.x, r.y, Math.max(1, r.w), Math.max(1, r.h), 0, 0, 24, 8); const d = x.getImageData(0, 0, 24, 8).data; let s = 0;
    for (let i = 0; i < d.length; i += 4) s += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255; return s / (d.length / 4); } catch { return 0; } void sw; void sh;
}
const plate = (luma: number) => `rgba(15,17,19,${luma > 0.6 ? 0.75 : 0.62})`;

type Seg = { t: string; color: string; font: string };
const segW = (c: CanvasRenderingContext2D, s: Seg) => { c.font = s.font; return c.measureText(s.t).width; };
function drawSegs(c: CanvasRenderingContext2D, segs: Seg[], x: number, y: number) { for (const s of segs) { c.font = s.font; c.fillStyle = s.color; c.fillText(s.t, x, y); x += c.measureText(s.t).width; } return x; }
/** Shrink the flexible segments (workflow, model, handle) until the line fits `maxW`. */
function fitSegs(c: CanvasRenderingContext2D, segs: (Seg & { flex?: boolean })[], maxW: number) {
  const full = new Map(segs.map((s) => [s, s.t]));
  for (let guard = 0; guard < 8; guard++) {
    for (const s of segs) s.t = full.get(s)!;
    const flex = segs.filter((s) => s.flex); const fixed = segs.filter((s) => !s.flex).reduce((a, s) => a + segW(c, s), 0);
    const avail = maxW - fixed; const widths = flex.map((s) => segW(c, s)); if (widths.reduce((a, b) => a + b, 0) <= avail) return segs;
    // water-fill: short parts keep their width, the rest share what is left equally
    const caps = new Map<typeof segs[number], number>(); let left = avail; let rest = [...flex].sort((x, y) => segW(c, x) - segW(c, y));
    while (rest.length) { const share = left / rest.length; const s = rest[0]; const w = segW(c, s); if (w <= share) { caps.set(s, w); left -= w; rest = rest.slice(1); } else { for (const r of rest) caps.set(r, share); break; } }
    const minW = (s: Seg) => { c.font = s.font; return c.measureText(`${s.t.slice(0, 4)}…`).width; };
    if (flex.every((s) => caps.get(s)! >= Math.min(segW(c, s), minW(s))) || flex.length < 2) { for (const s of flex) { c.font = s.font; s.t = fit(c, s.t, Math.max(0, caps.get(s)!)); } return segs; }
    // too narrow to say everything: drop the last flexible part (and its separator) rather than show "R…"
    const i = segs.lastIndexOf(flex[flex.length - 1]); const drop = i > 0 && !segs[i - 1].flex ? 2 : 1; segs.splice(i - drop + 1, drop);
  }
  return segs;
}

/** Corner badge: the Orbit mark, "Imagination", @handle; bottom-right on a pill plate. */
function drawBadge(c: CanvasRenderingContext2D, w: number, h: number, o: BrandOpts, luma: number) {
  const L = layoutOf(w, h, o.S); const b = visibleBits(o); if (!b.app && !b.handle) return;
  const bh = L.badgeH; const pad = bh * 0.36; const mark = bh * 0.62; const fs = Math.round(bh * 0.44);
  const segs: (Seg & { flex?: boolean })[] = [];
  if (b.app) segs.push({ t: 'Imagination', color: INK, font: `700 ${fs}px ${SG}` });
  if (b.handle) { if (b.app) segs.push({ t: '  ·  ', color: ORANGE, font: `600 ${fs}px ${IN}` }); segs.push({ t: b.handle, color: INK, font: `600 ${fs}px ${IN}`, flex: true }); }
  const markW = b.app ? mark + bh * 0.22 : 0; fitSegs(c, segs, w - 2 * L.margin - 2 * pad - markW);
  const tw = segs.reduce((a, s) => a + segW(c, s), 0); const pw = Math.ceil(pad * 2 + markW + tw);
  const x = w - L.margin - pw, y = h - L.margin - bh;
  c.save(); roundRect(c, x, y, pw, bh, bh / 2); c.fillStyle = plate(luma); c.fill(); c.restore();
  if (b.app) drawOrbit(c, x + pad + mark / 2, y + bh / 2, mark * 48 / 36.5);
  c.save(); c.textBaseline = 'middle'; drawSegs(c, segs, x + pad + markW, y + bh / 2 + fs * 0.04); c.restore();
}
/** Bottom strip: "Made with Imagination · <workflow> · <model> · @handle" across the bottom. */
function drawStrip(c: CanvasRenderingContext2D, w: number, h: number, o: BrandOpts, luma: number) {
  const L = layoutOf(w, h, o.S); const b = visibleBits(o); const sh = L.stripH; const fs = Math.max(11, Math.round(sh * 0.36)); const y = h - sh;
  const segs: (Seg & { flex?: boolean })[] = []; const sep = () => segs.length && segs.push({ t: '  ·  ', color: ORANGE, font: `600 ${fs}px ${IN}` });
  if (b.app) segs.push({ t: 'Made with ', color: INK, font: `500 ${fs}px ${IN}` }, { t: 'Imagination', color: ORANGE, font: `700 ${fs}px ${SG}` });
  for (const v of [b.workflow, b.layers, b.model, b.handle]) if (v) { sep(); segs.push({ t: v, color: INK, font: `600 ${fs}px ${IN}`, flex: true }); }
  if (!segs.length) return;
  c.save(); c.fillStyle = plate(luma); c.fillRect(0, y, w, sh);
  const mark = b.app ? sh * 0.5 : 0; const x0 = L.margin + (mark ? mark + sh * 0.25 : 0);
  if (mark) drawOrbit(c, L.margin + mark / 2, y + sh / 2, mark * 48 / 36.5);
  fitSegs(c, segs, w - x0 - L.margin); c.textBaseline = 'middle'; drawSegs(c, segs, x0, y + sh / 2 + fs * 0.04); c.restore();
}
const beanCache = new Map<string, Promise<HTMLImageElement | null>>();
/** The bean avatar (or the profile photo) as an image for the canvas. */
export function avatarImage(info: BrandInfo): Promise<HTMLImageElement | null> {
  const key = info.avatarUrl || JSON.stringify(info.avatar ?? {}); const hit = beanCache.get(key); if (hit) return hit;
  const p = (async () => { if (info.avatarUrl) { try { return await loadImg(info.avatarUrl); } catch { /* bean */ } }
    const svg = beanSvg({ ...avatarChoiceOf(info.avatar as any), uid: 'sharecv', size: 256 }); try { return await loadImg(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.includes('xmlns') ? svg : svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"'))}`); } catch { return null; } })();
  beanCache.set(key, p); return p;
}
function drawAvatar(c: CanvasRenderingContext2D, av: HTMLImageElement | null, cx: number, cy: number, d: number) {
  c.save(); c.beginPath(); c.arc(cx, cy, d / 2, 0, Math.PI * 2); c.closePath(); c.fillStyle = '#1C1E20'; c.fill(); c.clip();
  if (av) { const k = Math.max(d / av.width, d / av.height); c.drawImage(av, cx - (av.width * k) / 2, cy - (av.height * k) / 2, av.width * k, av.height * k); } c.restore();
}
/** Framed card size for a w×h result. */
export function framedSize(w: number, h: number, o: BrandOpts) {
  const L = layoutOf(w, h); const p = Math.max(16, Math.round(L.S * 0.05)); const foot = Math.round(clamp(L.S * 0.15, 72, 300)); const b = visibleBits(o);
  const promptH = b.prompt ? Math.round(foot * 0.42) : 0; return { W: w + 2 * p, H: h + p + foot + promptH, p, foot, promptH };
}
function drawFramed(c: CanvasRenderingContext2D, img: CanvasImageSource | null, w: number, h: number, o: BrandOpts, av: HTMLImageElement | null) {
  const L = layoutOf(w, h); const F = framedSize(w, h, o); const b = visibleBits(o);
  c.fillStyle = NEAR_BLACK; c.fillRect(0, 0, F.W, F.H);
  const r = Math.max(6, Math.round(L.S * 0.016));
  c.save(); roundRect(c, F.p, F.p, w, h, r); c.clip(); if (img) c.drawImage(img, F.p, F.p, w, h); c.restore();
  c.save(); roundRect(c, F.p + 0.5, F.p + 0.5, w - 1, h - 1, r); c.strokeStyle = 'rgba(255,255,255,.08)'; c.lineWidth = 1; c.stroke(); c.restore();
  const fy = F.p + h, fh = F.foot; const cy = fy + fh / 2; let x = F.p; const right = F.p + w;
  // right: the wordmark lockup
  let wmW = 0; if (b.app) { const wh = Math.round(fh * 0.34); wmW = wh * 1.25 + wh * 0.62 * 6.2; drawWordmark(c, right - wmW, cy - wh / 2, wh); }
  const textMax = right - x - (wmW ? wmW + fh * 0.3 : 0);
  // left: bean + name / @handle, then workflow · model
  const name = b.handle ? (o.info.displayName || b.handle) : null; const d = Math.round(fh * 0.5);
  if (name) { drawAvatar(c, av, x + d / 2, cy, d); x += d + fh * 0.18; }
  const f1 = Math.max(12, Math.round(fh * 0.2)), f2 = Math.max(11, Math.round(fh * 0.15)); const avail = Math.max(40, textMax - (x - F.p));
  c.save(); c.textBaseline = 'alphabetic';
  const line1: (Seg & { flex?: boolean })[] = name ? [{ t: name, color: INK, font: `700 ${f1}px ${SG}`, flex: true }, ...(o.info.displayName && b.handle ? [{ t: `  ${b.handle}`, color: GREY, font: `500 ${f1 * 0.8}px ${IN}`, flex: true }] : [])] : [];
  const line2: (Seg & { flex?: boolean })[] = []; for (const v of [b.workflow, b.layers, b.model]) if (v) { if (line2.length) line2.push({ t: '  ·  ', color: ORANGE, font: `600 ${f2}px ${IN}` }); line2.push({ t: v, color: line1.length ? GREY : INK, font: `${line1.length ? 500 : 700} ${line1.length ? f2 : f1}px ${line1.length ? IN : SG}`, flex: true }); }
  const lines = [line1, line2].filter((l) => l.length); const lh = [f1 * 1.25, f2 * 1.35]; const tot = lines.reduce((a, _l, i) => a + lh[i], 0);
  let ty = cy - tot / 2 + f1 * 0.95; for (const l of lines) { fitSegs(c, l, avail); drawSegs(c, l, x, ty); ty += lh[1]; }
  if (b.prompt) { c.font = `italic 400 ${f2}px ${IN}`; c.fillStyle = GREY; const pl = wrap(c, `“${b.prompt}”`, w, 2); pl.forEach((t, i) => c.fillText(t, F.p, fy + fh + f2 * (1 + i * 1.35) - f2 * 0.3)); }
  c.restore();
}
/** A branded still at native resolution × `scale` (preview < 1). `img` null draws only the brand (video overlay). */
export async function renderBranded(img: CanvasImageSource | null, w: number, h: number, o: BrandOpts, scale = 1, opts: { transparent?: boolean; lumaSource?: CanvasImageSource | null } = {}): Promise<HTMLCanvasElement> {
  try { await Promise.all([`700 20px "Space Grotesk"`, '600 20px Inter', '500 20px Inter', 'italic 400 20px Inter'].map((f) => document.fonts.load(f))); } catch { /* system fonts */ }
  const card = o.style === 'card' && !opts.transparent; const F = card ? framedSize(w, h, o) : { W: w, H: h };
  const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(F.W * scale)); cv.height = Math.max(1, Math.round(F.H * scale));
  const c = cv.getContext('2d')!; c.scale(scale, scale); c.imageSmoothingQuality = 'high';
  if (card) { drawFramed(c, img, w, h, o, visibleBits(o).handle ? await avatarImage(o.info) : null); return cv; }
  if (img) c.drawImage(img, 0, 0, w, h);
  const L = layoutOf(w, h, o.S); const src = opts.lumaSource ?? img;
  const zone = o.style === 'strip' ? { x: 0, y: h - L.stripH, w, h: L.stripH } : { x: w * 0.6, y: h - L.margin - L.badgeH, w: w * 0.4 - L.margin, h: L.badgeH };
  const luma = regionLuma(src, w, h, zone);
  if (o.style === 'strip') drawStrip(c, w, h, o, luma); else drawBadge(c, w, h, o, luma);
  return cv;
}
export const END_W = 1920, END_H = 1080;
/** The end card: logo, bean, @handle, "Made with Imagination · open source". 1920 × 1080 by default; any size (1080 × 1920 for a Reel)
 *  is drawn as the 1080p design scaled to fit and centred, so a vertical card keeps the same look. */
export async function renderEndCard(o: BrandOpts, scale = 1, size: readonly [number, number] = [END_W, END_H], bare = false): Promise<HTMLCanvasElement> {
  const [W, H] = size; if (W !== END_W || H !== END_H) {
    const inner = await renderEndCard(o, 1, [END_W, END_H], true); /* no backdrop of its own: no seam */ const cv = document.createElement('canvas'); cv.width = Math.round(W * scale); cv.height = Math.round(H * scale); const c = cv.getContext('2d')!;
    c.scale(scale, scale); c.fillStyle = NEAR_BLACK; c.fillRect(0, 0, W, H);
    const g = c.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, Math.max(W, H) * 0.45); g.addColorStop(0, 'rgba(255,122,26,.12)'); g.addColorStop(1, 'rgba(255,122,26,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    const k = Math.min(W / END_W, H / END_H) * (W < H ? 1.5 : 1); const iw = END_W * k, ih = END_H * k; c.drawImage(inner, (W - iw) / 2, (H - ih) / 2, iw, ih); return cv; }
  try { await Promise.all([`700 64px "Space Grotesk"`, '600 32px Inter', '500 28px Inter'].map((f) => document.fonts.load(f))); } catch { /* */ }
  const cv = document.createElement('canvas'); cv.width = Math.round(END_W * scale); cv.height = Math.round(END_H * scale); const c = cv.getContext('2d')!; c.scale(scale, scale);
  if (!bare) { c.fillStyle = NEAR_BLACK; c.fillRect(0, 0, END_W, END_H);
    const g = c.createRadialGradient(END_W / 2, END_H * 0.38, 0, END_W / 2, END_H * 0.38, 700); g.addColorStop(0, 'rgba(255,122,26,.14)'); g.addColorStop(1, 'rgba(255,122,26,0)'); c.fillStyle = g; c.fillRect(0, 0, END_W, END_H); }
  const b = visibleBits(o); c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  drawOrbit(c, END_W / 2, 330, 260);
  c.font = `700 92px ${SG}`; c.fillStyle = INK; c.fillText('Imagination', END_W / 2, 560);
  c.font = `500 40px ${IN}`; c.fillStyle = ORANGE; c.fillText('is all you need', END_W / 2, 616);
  let y = 720;
  if (b.handle) { const av = await avatarImage(o.info); const label = fit(c, o.info.displayName && o.info.displayName !== b.handle ? `${o.info.displayName}  ${b.handle}` : b.handle, 1000);
    c.font = `600 40px ${IN}`; const tw = c.measureText(label).width; const d = 72; const x0 = END_W / 2 - (tw + d + 20) / 2;
    drawAvatar(c, av, x0 + d / 2, y - 14, d); c.textAlign = 'left'; c.fillStyle = INK; c.fillText(label, x0 + d + 20, y); c.textAlign = 'center'; y += 90; }
  c.font = `500 36px ${IN}`; const parts: Seg[] = [{ t: 'Made with ', color: INK, font: `500 36px ${IN}` }, { t: 'Imagination', color: ORANGE, font: `700 36px ${SG}` }, { t: '  ·  ', color: ORANGE, font: `600 36px ${IN}` }, { t: 'open source', color: INK, font: `500 36px ${IN}` }];
  const tw = parts.reduce((a, s) => a + segW(c, s), 0); c.textAlign = 'left'; drawSegs(c, parts, END_W / 2 - tw / 2, y);
  c.textAlign = 'center'; c.font = `500 28px ${IN}`; c.fillStyle = GREY; c.fillText(REPO_URL.replace(/^https?:\/\//, ''), END_W / 2, y + 60);
  return cv;
}
export const canvasBlob = (cv: HTMLCanvasElement, type: 'image/png' | 'image/jpeg' = 'image/png') => new Promise<Blob>((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('Could not draw the image'))), type, type === 'image/jpeg' ? 0.92 : undefined));
/** PNG, or JPG q0.92 when the source is a JPG or larger than 8 MP. */
export const exportType = (srcUrl: string, w: number, h: number): 'image/png' | 'image/jpeg' => /\.jpe?g($|\?)/i.test(srcUrl) || w * h > 8_000_000 ? 'image/jpeg' : 'image/png';
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
/** imagination-relight-ada.makes.png */
export const shareFileName = (workflow: string, handle: string | null, ext: string) => appFileName([slug(workflow) || 'result', handle ? slug(handle) : ''].filter(Boolean).join('-'), ext);
/** The caption lives with the destinations (sharePlatforms.ts): no hashtag, our own voice. */
export { captionOf } from './sharePlatforms';

/** Cost receipt tag (2026-10-26, off by default: "Burn receipt into the file"): a small pill in the top-left corner, opposite the badge,
 *  "≈ $0.32 · Kling 3.0 · 41 s" with the cost in orange. Drawn onto `cv` at its own size (a preview canvas scales with it), so the same call
 *  marks a still and the transparent overlay the server burns into a video with ffmpeg (shareExport.ts, audio kept). `lumaSource` (same size
 *  as `cv`, optional) picks the plate's opacity. Long parts shrink (the model first), never the cost. */
export interface ReceiptTagParts { cost: string | null; model: string | null; place?: string | null; time: string | null }
export async function drawReceiptTag(cv: HTMLCanvasElement, r: ReceiptTagParts, lumaSource: CanvasImageSource | null = null): Promise<HTMLCanvasElement> {
  try { await Promise.all(['700 20px Inter', '600 20px Inter'].map((f) => document.fonts.load(f))); } catch { /* system fonts */ }
  const w = cv.width, h = cv.height; const c = cv.getContext('2d')!; const L = layoutOf(w, h);
  const th = Math.round(clamp(L.S * 0.04, 22, 64)); const pad = th * 0.42; const fs = Math.round(th * 0.44);
  const segs: (Seg & { flex?: boolean })[] = []; const sep = () => segs.length && segs.push({ t: '  ·  ', color: ORANGE, font: `600 ${fs}px ${IN}` });
  if (r.cost) segs.push({ t: r.cost, color: ORANGE, font: `700 ${fs}px ${IN}` });
  for (const v of [r.model, r.time]) if (v) { sep(); segs.push({ t: v, color: INK, font: `600 ${fs}px ${IN}`, flex: v === r.model }); }
  if (!segs.length) return cv;
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); fitSegs(c, segs, Math.max(40, w * 0.72 - 2 * pad));
  const tw = segs.reduce((a, s) => a + segW(c, s), 0); const pw = Math.ceil(tw + 2 * pad); const x = L.margin, y = L.margin;
  const luma = regionLuma(lumaSource, w, h, { x, y, w: pw, h: th });
  roundRect(c, x, y, pw, th, th / 2); c.fillStyle = plate(luma); c.fill();
  roundRect(c, x + 0.5, y + 0.5, pw - 1, th - 1, th / 2); c.strokeStyle = 'rgba(255,255,255,.10)'; c.lineWidth = Math.max(1, th / 40); c.stroke();
  c.textBaseline = 'middle'; drawSegs(c, segs, x + pad, y + th / 2 + fs * 0.04); c.restore(); return cv;
}
