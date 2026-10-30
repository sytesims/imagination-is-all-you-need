/**
 * Add logo and text (2026-10-28): drawing and making the stamped copy, all from one layout (server/src/shared/logoStamp.ts).
 *  - drawStamp: the plate, the logo and the text on a canvas of any size: the viewer's live preview (the picture's size on screen) and the
 *    transparent overlay PNG at the result's full size use the same call, so the file matches the preview.
 *  - drawEndCard: the video end card (the logo and text centred on the brand's background colour).
 *  - makeStamped: draws the overlay (and the end card) at full size and asks the server to composite it (POST /api/jobs/:id/stamp). Free.
 *    The original result is never touched; the copy is cached here per result + settings + brand.
 */
import { fontStack, luminance, normHex, type BrandKit } from '../../../server/src/shared/brandKit';
import { endCardLayout, plateFor, stampLayout, type Box, type StampLayout, type StampSettings } from '../../../server/src/shared/logoStamp';

export interface StampArt { kit: BrandKit; logo: HTMLImageElement | null; logoSize: { w: number; h: number } | null; logoLum: number | null; font: string }
const lumOf = (r: number, g: number, b: number) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
/** Average brightness (0..1) of a picture's opaque pixels, optionally only inside a part of it ([x0, y0, x1, y1] fractions). */
export function brightness(src: CanvasImageSource, part?: [number, number, number, number]): number | null {
  try {
    const W = 48, H = 27; const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true }); if (!g) return null;
    g.drawImage(src, 0, 0, W, H); const [x0, y0, x1, y1] = part ?? [0, 0, 1, 1];
    const d = g.getImageData(Math.floor(x0 * W), Math.floor(y0 * H), Math.max(1, Math.round((x1 - x0) * W)), Math.max(1, Math.round((y1 - y0) * H))).data;
    let s = 0, n = 0; for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 128) continue; s += lumOf(d[i], d[i + 1], d[i + 2]); n++; } return n ? s / n : null;
  } catch { return null; }
}
export const loadImg = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = () => rej(new Error('That image couldn’t be read.')); i.src = src; });
export const cssFont = (name: string) => fontStack(name || 'Manrope').map((f) => (/^(sans-serif|serif|monospace)$/.test(f) ? f : `"${f}"`)).join(', ');
const artCache = new Map<string, Promise<StampArt>>();
/** The brand's logo (loaded, with its own size and brightness) and the heading font (asked for, so the canvas uses it when the app has it). */
export function loadStampArt(kit: BrandKit): Promise<StampArt> {
  const key = `${kit.id}|${kit.updatedAt}|${kit.logo?.url ?? ''}|${kit.fonts.heading}`; const hit = artCache.get(key); if (hit) return hit;
  const p = (async () => {
    const font = cssFont(kit.fonts.heading); await document.fonts?.load(`700 32px ${font}`).catch(() => undefined);
    let logo: HTMLImageElement | null = null; if (kit.logo?.url) logo = await loadImg(kit.logo.url).catch(() => null);
    const logoSize = logo ? { w: logo.naturalWidth || 512, h: logo.naturalHeight || 512 } : null;
    return { kit, logo, logoSize, logoLum: logo ? brightness(logo) : null, font };
  })();
  artCache.set(key, p); return p;
}
/** The logo in its box, on a soft plate when one is needed (else a faint shadow); `unit` (the logo's height) sizes the shadows.
 *  Shared by the stamp and the Ad layout card, so a logo looks the same everywhere. */
export function drawLogo(g: CanvasRenderingContext2D, img: CanvasImageSource, logo: Box, plate: (Box & { r: number; kind: 'light' | 'dark' }) | null, unit: number) {
  if (plate) { g.fillStyle = plate.kind === 'light' ? 'rgba(255,255,255,0.86)' : 'rgba(12,12,14,0.74)'; g.shadowColor = 'rgba(0,0,0,0.22)'; g.shadowBlur = unit * 0.25; g.shadowOffsetY = unit * 0.05;
    g.beginPath(); g.roundRect(plate.x, plate.y, plate.w, plate.h, plate.r); g.fill(); g.shadowColor = 'transparent'; }
  else { g.shadowColor = 'rgba(0,0,0,0.3)'; g.shadowBlur = unit * 0.06; g.shadowOffsetY = unit * 0.02; }
  g.drawImage(img, logo.x, logo.y, logo.w, logo.h); g.shadowColor = 'transparent';
}
/** The line of text the stamp shows ('' = none): the typed line, else the brand's name. */
export const stampText = (kit: BrandKit, s: StampSettings) => (s.textOn ? (s.text.trim() || kit.name) : '');
/** The text's width at a font size, measured with the heading font. */
function measurer(g: CanvasRenderingContext2D, font: string, text: string) { return (px: number) => { if (!text) return 0; g.font = `700 ${px}px ${font}`; return g.measureText(text).width; }; }
/** Lay out and draw the stamp on `g` (a W × H canvas, already cleared). `picture` = the result (or the frame on screen): its brightness right
 *  behind the stamp decides the plate and the text ink. */
export function drawStamp(g: CanvasRenderingContext2D, W: number, H: number, art: StampArt, s: StampSettings, picture: CanvasImageSource | null): StampLayout {
  const text = stampText(art.kit, s); const measure = measurer(g, art.font, text);
  const l0 = stampLayout(W, H, s, art.logoSize, measure, false); const b = l0.box;
  const areaLum = picture ? brightness(picture, [Math.max(0, b.x / W), Math.max(0, b.y / H), Math.min(1, (b.x + b.w) / W), Math.min(1, (b.y + b.h) / H)]) : null;
  const plate = art.logo ? plateFor(s.backing, art.logoLum, areaLum) : null;
  const l = plate ? stampLayout(W, H, s, art.logoSize, measure, true) : l0;
  g.save(); g.globalAlpha = s.opacity;
  if (l.logo && art.logo) drawLogo(g, art.logo, l.logo, l.plate && plate ? { ...l.plate, kind: plate } : null, l.logoH);
  if (l.text) {
    const under = plate === 'light' ? 0.9 : plate === 'dark' ? 0.1 : areaLum ?? 0.3; const dark = under > 0.6;
    g.font = `700 ${l.fontPx}px ${art.font}`; g.textBaseline = 'top'; g.fillStyle = dark ? '#14151A' : '#FFFFFF';
    if (!dark && !plate) { g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = l.fontPx * 0.35; g.shadowOffsetY = l.fontPx * 0.06; }
    let t = text; while (t.length > 1 && g.measureText(t).width > l.text.w + 0.5) t = t.slice(0, -2) + '…';
    const w = g.measureText(t).width; const x = l.text.align === 'left' ? l.text.x : l.text.align === 'right' ? l.text.x + l.text.w - w : l.text.x + (l.text.w - w) / 2;
    g.fillText(t, x, l.text.y + l.fontPx * 0.1);
  }
  g.restore(); return l;
}
/** The brand's end-card colour: its background colour, else its first colour, else near black. */
export const endColorOf = (kit: BrandKit) => normHex(kit.colors.find((c) => c.role === 'background')?.hex ?? kit.colors[0]?.hex ?? '#0F1113') ?? '#0F1113';
export function drawEndCard(g: CanvasRenderingContext2D, W: number, H: number, art: StampArt, s: StampSettings) {
  const bg = endColorOf(art.kit); const text = s.textOn ? (s.text.trim() || art.kit.name) : art.kit.name;
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const l = endCardLayout(W, H, art.logoSize, measurer(g, art.font, text));
  if (l.logo && art.logo) g.drawImage(art.logo, l.logo.x, l.logo.y, l.logo.w, l.logo.h);
  if (l.text) { g.font = `700 ${l.fontPx}px ${art.font}`; g.textBaseline = 'top'; g.fillStyle = luminance(bg) > 0.4 ? '#14151A' : '#F5F5F5'; g.fillText(text, l.text.x, l.text.y + l.fontPx * 0.1); }
}
const toPng = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Couldn’t draw the logo.'))), 'image/png'));
const canvasOf = (W: number, H: number) => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
/** A video's size and a frame from its start (for the brightness behind the logo). */
function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((res, rej) => { const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.playsInline = true;
    v.onloadeddata = () => { v.currentTime = Math.min(0.2, (v.duration || 1) / 2); }; v.onseeked = () => res(v); v.onerror = () => rej(new Error('That video couldn’t be read.')); v.src = url; });
}
const made = new Map<string, Promise<string>>();
/** The stamped copy's URL (/files/stamps/…), made once per result output + settings + brand. */
export function makeStamped(o: { jobId: string; out: number; url: string; kind: 'image' | 'video'; kit: BrandKit; settings: StampSettings }): Promise<string> {
  const key = JSON.stringify([o.jobId, o.out, o.url, o.kit.id, o.kit.updatedAt, o.settings]); const hit = made.get(key); if (hit) return hit;
  const p = (async () => {
    const art = await loadStampArt(o.kit);
    const media: HTMLImageElement | HTMLVideoElement = o.kind === 'image' ? await loadImg(o.url) : await loadVideo(o.url);
    const W = media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth, H = media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight;
    if (!W || !H) throw new Error('Couldn’t read the result’s size.');
    const ov = canvasOf(W, H); drawStamp(ov.getContext('2d')!, W, H, art, o.settings, media);
    const fd = new FormData(); fd.append('out', String(o.out)); fd.append('settings', JSON.stringify(o.settings)); fd.append('overlay', await toPng(ov), 'overlay.png');
    if (o.kind === 'video' && o.settings.endCard) { const ec = canvasOf(W, H); drawEndCard(ec.getContext('2d')!, W, H, art, o.settings); fd.append('endcard', await toPng(ec), 'endcard.png'); fd.append('endColor', endColorOf(o.kit)); }
    if (media instanceof HTMLVideoElement) { media.removeAttribute('src'); media.load(); }
    const r = await fetch(`/api/jobs/${encodeURIComponent(o.jobId)}/stamp`, { method: 'POST', body: fd }); const b = await r.json().catch(() => null);
    if (!r.ok || !b?.url) throw new Error(b?.error || `Couldn’t add the logo (${r.status}).`);
    return b.url as string;
  })();
  made.set(key, p); p.catch(() => made.delete(key)); return p;
}
