/**
 * Ad layout card, drawing (2026-10-30): the layout from adLayout.ts on a canvas, and the "Export pack" zip. Free and in the browser:
 * no AI, no server call. The logo comes from the shared stamp code (loadStampArt / drawLogo / plateFor), so it looks the same as
 * "Add logo and text". Fonts are the brand's own when this browser has them; otherwise the app's Manrope (the card says so). Nothing is downloaded.
 */
import type { BrandKit } from '../../../server/src/shared/brandKit';
import { plateFor } from '../../../server/src/shared/logoStamp';
import { zipStore } from '../../../server/src/shared/zipStore';
import { brightness, cssFont, drawLogo, loadImg, loadStampArt, type StampArt } from '../shared/logoStampDraw';
import { adColors, adPackFiles, buttonOn, layoutAd, logoSeeThrough, logoToneFor, postCopy, scrimAlpha, slugOf, type AdMeasure, type AdPreset, type AdStyle, type AdText, type LogoTone } from './adLayout';
import { adExportPlan, type AdPlatform, type AdSizeOption, type Edges } from './adPlatforms';
import { picCrop, type AdEdit, type AdEdits } from './adEdit';

const FALLBACK = '"Manrope", system-ui, sans-serif';
export interface AdArt { kit: BrandKit | null; stamp: StampArt | null; heading: string; body: string; /** brand fonts this browser doesn't have */ missing: string[];
  /** the logo is see-through, so the Light / Dark logo colours can recolour it (adLayout.logoSeeThrough) */ logoSeeThrough: boolean }

/** Does this browser have the font? (A missing one measures exactly like the generic fallback, with two different fallbacks.) */
function hasFont(name: string): boolean {
  if (!name.trim()) return false;
  try { const g = document.createElement('canvas').getContext('2d'); if (!g) return true; const t = 'AaBbGgMmQqWw1234567890 &@';
    return ['monospace', 'serif'].some((b) => { g.font = `40px ${b}`; const a = g.measureText(t).width; g.font = `40px "${name}", ${b}`; return g.measureText(t).width !== a; }); }
  catch { return true; }
}
const artCache = new Map<string, Promise<AdArt>>();
/** The brand's logo and both fonts, ready to draw (null kit: no logo, the app's font). */
export function loadAdArt(kit: BrandKit | null): Promise<AdArt> {
  const key = kit ? `${kit.id}|${kit.updatedAt}|${kit.logo?.url ?? ''}|${kit.fonts.heading}|${kit.fonts.body}` : '-'; const hit = artCache.get(key); if (hit) return hit;
  const p = (async () => {
    await Promise.all(['700 40px Manrope', '500 40px Manrope', '400 40px Manrope', ...(kit ? [`700 40px ${cssFont(kit.fonts.body)}`, `500 40px ${cssFont(kit.fonts.body)}`] : [])].map((f) => document.fonts?.load(f).catch(() => undefined)));
    if (!kit) return { kit: null, stamp: null, heading: FALLBACK, body: FALLBACK, missing: [], logoSeeThrough: false };
    const stamp = await loadStampArt(kit); const missing: string[] = [];
    const pick = (name: string) => { if (hasFont(name)) return `"${name}", ${FALLBACK}`; if (name.trim() && !missing.includes(name)) missing.push(name); return FALLBACK; };
    return { kit, stamp, heading: pick(kit.fonts.heading), body: pick(kit.fonts.body), missing, logoSeeThrough: stamp.logo ? seeThroughOf(stamp.logo) : false };
  })();
  artCache.set(key, p); p.catch(() => artCache.delete(key)); return p;
}
export const loadAdPicture = (url: string) => loadImg(url);

const fontOf = (art: AdArt, role: 'heading' | 'offer' | 'button', px: number, st?: AdStyle | null) =>
  role === 'heading' ? `${st?.textWeight === 'regular' ? 400 : 700} ${px}px ${art.heading}` : role === 'offer' ? `500 ${px}px ${art.body}` : `700 ${px}px ${art.body}`;

/** The average colour (a hex) of a part of the canvas, given as fractions of it (so a scaled preview reads the same as the file). */
function colorAt(src: HTMLCanvasElement, x: number, y: number, w: number, h: number): string | null {
  try { const c = document.createElement('canvas'); c.width = 1; c.height = 1; const g = c.getContext('2d', { willReadFrequently: true }); if (!g) return null;
    g.drawImage(src, x * src.width, y * src.height, Math.max(1, w * src.width), Math.max(1, h * src.height), 0, 0, 1, 1);
    const d = g.getImageData(0, 0, 1, 1).data; return '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join(''); }
  catch { return null; }
}
/** Read the logo's pixels once (a 64 × 64 sample) to tell a see-through mark from a logo with its own background. */
function seeThroughOf(img: HTMLImageElement): boolean {
  try { const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d', { willReadFrequently: true }); if (!g) return true;
    g.drawImage(img, 0, 0, 64, 64); return logoSeeThrough(g.getImageData(0, 0, 64, 64).data); }
  catch { return true; }
}
/** The logo all white or all near black (the "Light" / "Dark" logo style), drawn once per logo and kept. */
const tinted = new WeakMap<HTMLImageElement, Partial<Record<LogoTone, HTMLCanvasElement>>>();
function logoIn(img: HTMLImageElement, tone: LogoTone | undefined): CanvasImageSource {
  if (!tone || tone === 'original') return img; const hit = tinted.get(img)?.[tone]; if (hit) return hit;
  const c = document.createElement('canvas'); c.width = img.naturalWidth || 1; c.height = img.naturalHeight || 1; const g = c.getContext('2d'); if (!g) return img;
  g.drawImage(img, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = tone === 'light' ? '#FFFFFF' : '#14151A'; g.fillRect(0, 0, c.width, c.height);
  tinted.set(img, { ...tinted.get(img), [tone]: c }); return c;
}

/** Draw one ad on `g` (a W × H frame; the caller may scale the context for a smaller preview). `safe`, `preset` and `edit`: see layoutAd
 *  (the edit's `pic` frames the picture). Returns the layout drawn, so "Edit ad" can pick and move its parts. */
export function drawAd(g: CanvasRenderingContext2D, W: number, H: number, pic: HTMLImageElement | null, art: AdArt, t: AdText, o: { safe?: Edges; preset?: AdPreset; edit?: AdEdit | null; style?: AdStyle | null } = {}) {
  const st = o.style ?? {}; const measure: AdMeasure = (s, px, role) => { g.font = fontOf(art, role, px, st); return g.measureText(s).width; };
  const logoSize = art.stamp?.logo ? art.stamp.logoSize : null;
  const l = layoutAd(W, H, t, logoSize, measure, o);
  g.save(); g.fillStyle = '#0F1113'; g.fillRect(0, 0, W, H);
  if (pic && l.pic.w > 0 && l.pic.h > 0) { const c = picCrop(pic.naturalWidth, pic.naturalHeight, l.pic.w, l.pic.h, o.edit?.pic); if (c.w) g.drawImage(pic, c.x, c.y, c.w, c.h, l.pic.x, l.pic.y, l.pic.w, l.pic.h); }
  const col = adColors(art.kit, st, l.panel ? 'split' : l.backdrop ? 'panel' : null); const panel = l.panel ? col.surface : null; const ink = col.ink;
  if (l.panel && panel) { g.fillStyle = panel; g.fillRect(l.panel.x, l.panel.y, l.panel.w, l.panel.h); }
  /* brightness reads fractions of the frame, so a scaled preview canvas reads the same as the full-size file */
  const cl = (v: number) => Math.max(0, Math.min(1, v));
  const lumAt = (b: { x: number; y: number; w: number; h: number }) => brightness(g.canvas, [cl(b.x / W), cl(b.y / H), cl((b.x + b.w) / W), cl((b.y + b.h) / H)]);
  if (l.scrim && l.block) {
    /* dark behind light words; light behind dark ones (then a dark picture needs more of it) */
    const lum = pic ? lumAt(l.block) : 0; const dark = col.scrim === 'dark'; const a = scrimAlpha(dark ? lum : lum == null ? null : 1 - lum); const { dir, from, to } = l.scrim;
    const shade = (k: number) => `rgba(${dark ? '8,9,11' : '255,255,255'},${(a * k).toFixed(3)})`;
    if (dir === 'all') { g.fillStyle = shade(0.62); g.fillRect(0, 0, W, H); }
    else {
      /* soft fade on the open side, already dark where the text starts, darkest at the edge */
      const gr = dir === 'down' ? g.createLinearGradient(0, from, 0, to) : g.createLinearGradient(0, to, 0, from);
      const f = dir === 'down' ? (l.block.y - from) / (to - from) : (to - (l.block.y + l.block.h)) / (to - from); const stop = (at: number, k: number) => gr.addColorStop(at, shade(k));
      stop(0, 0); stop(f * 0.55, 0.38); stop(f, 0.8); stop(1, 1);
      g.fillStyle = gr; g.fillRect(0, from, W, to - from);
    }
  }
  if (l.backdrop && col.surface) { const b = l.backdrop; g.fillStyle = col.surface; g.beginPath(); g.roundRect(b.x, b.y, b.w, b.h, b.r); g.fill(); }
  if (l.logo && art.stamp?.logo) {
    /* a plate only when the logo would get lost on the picture; its outer edge then sits on the margin, in line with the text.
     * A logo placed by hand: the plate fills the logo's own box (the logo shrinks inside it), so it never pokes into a safe zone */
    const placed = !!o.edit?.at?.logo; const lb = l.logo; const pad = (placed ? Math.min(lb.w, lb.h) : lb.h) * (placed ? 0.15 : 0.18);
    const plateBox = placed ? { ...lb, r: Math.min(lb.w, lb.h) * 0.19 } : { x: lb.x, y: lb.y, w: lb.w + 2 * pad, h: lb.h + 2 * pad, r: lb.h * 0.22 };
    if (!placed) { if (l.align === 'center') plateBox.x -= pad; if (lb.y + plateBox.h > l.area.y + l.area.h) plateBox.y -= 2 * pad; }
    if (!placed && l.align === 'right') plateBox.x -= 2 * pad;
    const behind = l.panel && panel && lb.x >= l.panel.x && lb.y >= l.panel.y ? (col.scrim === 'dark' ? 0.06 : 0.94) : pic ? lumAt(plateBox) : 0.06;
    /* the logo's style: all white / near black, and the plate auto (as before), always or never */
    const tone = logoToneFor(st.logoTone, art.logoSeeThrough); const logoLum = tone === 'light' ? 1 : tone === 'dark' ? 0.05 : art.stamp.logoLum;
    const kind = st.logoPlate === 'off' ? null : st.logoPlate === 'on' ? (logoLum != null && logoLum >= 0.5 ? 'dark' : 'light') : plateFor('auto', logoLum, behind); const q = placed ? (Math.min(lb.w, lb.h) - 2 * pad) / Math.min(lb.w, lb.h) : 1;
    const inner = placed ? { x: lb.x + (lb.w * (1 - q)) / 2, y: lb.y + (lb.h * (1 - q)) / 2, w: lb.w * q, h: lb.h * q } : { ...lb, x: plateBox.x + pad, y: plateBox.y + pad };
    drawLogo(g, logoIn(art.stamp.logo, tone), kind ? inner : lb, kind ? { ...plateBox, kind } : null, lb.h);
  }
  const xAt = (x: number, w: number) => (l.align === 'center' ? x + w / 2 : l.align === 'right' ? x + w : x);
  g.textBaseline = 'alphabetic'; g.textAlign = l.align; g.fillStyle = ink; g.shadowColor = col.shadow;
  if (l.headline) { const h = l.headline; g.font = fontOf(art, 'heading', h.px, st); g.shadowBlur = h.px * col.shadowBlur;
    h.lines.forEach((line, i) => g.fillText(line, xAt(h.x, h.w), h.y + h.lineH * i + h.px * 0.86)); }
  if (l.offer) { g.font = fontOf(art, 'offer', l.offer.px); g.shadowBlur = l.offer.px * col.shadowBlur; g.fillStyle = col.offer; g.fillText(l.offer.text, xAt(l.offer.x, l.offer.w), l.offer.y + l.offer.px * 0.92); }
  g.shadowColor = 'transparent'; g.textAlign = 'left';
  if (l.button) { const b = l.button; const bc = l.panel || l.backdrop ? col.button : buttonOn(col.button, pic ? colorAt(g.canvas, b.x / W, b.y / H, b.w / W, b.h / H) : '#0F1113'); g.beginPath(); g.roundRect(b.x, b.y, b.w, b.h, b.r);
    if (bc.fill) { g.shadowColor = 'rgba(0,0,0,0.28)'; g.shadowBlur = b.h * 0.3; g.shadowOffsetY = b.h * 0.06; g.fillStyle = bc.fill; g.fill(); }
    /* the edge: an outline button's own (inside the box, so it stays in the clear area), or a fill that matches its panel */
    if (bc.edge) { g.shadowColor = 'transparent'; const lw = (bc.fill ? 2 : 4) * l.unit; g.lineWidth = lw; g.strokeStyle = bc.edge;
      if (!bc.fill) { g.beginPath(); g.roundRect(b.x + lw / 2, b.y + lw / 2, b.w - lw, b.h - lw, Math.max(0, b.r - lw / 2)); } g.stroke(); }
    g.shadowColor = 'transparent'; g.shadowOffsetY = 0; g.fillStyle = bc.text; g.font = fontOf(art, 'button', b.px); g.textBaseline = 'middle';
    const tw = g.measureText(b.text).width; g.fillText(b.text, b.x + (b.w - tw) / 2, b.y + b.h / 2 + b.px * 0.04); }
  g.restore(); return l;
}

/** The preview's safe zones: the parts each platform's own buttons and captions cover, shaded and outlined. Never drawn in exports. */
export function drawSafeZones(g: CanvasRenderingContext2D, W: number, H: number, safe: Edges) {
  const t = safe.top * H, b = safe.bottom * H, l = safe.left * W, r = safe.right * W; if (!(t || b || l || r)) return;
  /* light, so the picture still reads through (several platforms used to turn the whole ad red) */
  g.save(); g.fillStyle = 'rgba(255,72,72,0.2)';
  g.fillRect(0, 0, W, t); g.fillRect(0, H - b, W, b); g.fillRect(0, t, l, H - t - b); g.fillRect(W - r, t, r, H - t - b);
  g.strokeStyle = 'rgba(255,150,150,0.85)'; g.lineWidth = Math.max(2, W / 400); g.setLineDash([W / 60, W / 90]); g.strokeRect(l, t, W - l - r, H - t - b);
  g.restore();
}

/** One full-size ad as a canvas. */
export function renderAd(size: AdSizeOption, pic: HTMLImageElement | null, art: AdArt, t: AdText, preset: AdPreset, edit?: AdEdit | null, style?: AdStyle | null): HTMLCanvasElement {
  const { w, h } = size; const c = document.createElement('canvas'); c.width = w; c.height = h; drawAd(c.getContext('2d')!, w, h, pic, art, t, { safe: size.safe, preset, edit, style }); return c;
}
const pngOf = (c: HTMLCanvasElement) => new Promise<Uint8Array>((res, rej) => c.toBlob((b) => (b ? b.arrayBuffer().then((a) => res(new Uint8Array(a)), rej) : rej(new Error('Couldn’t draw the ad.'))), 'image/png'));

/**
 * The Export pack: one folder per picked platform (adPlatforms.adExportPlan), each with that platform's sizes × every headline as PNGs at
 * its own pixel size (a size two platforms share is drawn once and written in both folders), and a post-copy.txt with the card's words
 * cut to that platform's limits (adLayout.postCopy). Saved by the browser as one zip. Returns how many pictures went in.
 */
export async function exportAdPack(o: { pic: HTMLImageElement | null; art: AdArt; headlines: string[]; offer: string; button: string; platforms: AdPlatform[]; sizes: AdSizeOption[]; preset: AdPreset; edits?: AdEdits; style?: AdStyle | null }): Promise<number> {
  const brand = o.art.kit?.name ?? 'ad'; const files: { name: string; data: Uint8Array }[] = []; const drawn = new Map<string, Uint8Array>();
  for (const f of adPackFiles(brand, o.platforms, o.headlines)) {
    const tab = o.sizes.find((s) => s.shape === f.shape); if (!tab) continue; const key = `${f.n}|${f.shape}|${f.w}x${f.h}`;
    let data = drawn.get(key); if (!data) { data = await pngOf(renderAd({ ...tab, w: f.w, h: f.h }, o.pic, o.art, { headline: f.headline, offer: o.offer, button: o.button }, o.preset, o.edits?.[f.shape], o.style)); drawn.set(key, data); }
    files.push({ name: f.path, data });
  }
  const pictures = files.length; const enc = new TextEncoder();
  for (const f of adExportPlan(o.platforms)) files.push({ name: `${f.folder}/post-copy.txt`, data: enc.encode(postCopy(f.p, o.headlines, o.offer, o.button)) });
  const zip = zipStore(files); const url = URL.createObjectURL(new Blob([zip as BlobPart], { type: 'application/zip' }));
  const a = document.createElement('a'); a.href = url; a.download = `${slugOf(brand)}-ad-pack.zip`; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000); return pictures;
}
