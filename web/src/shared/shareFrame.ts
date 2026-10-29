/**
 * Share sheet files for Instagram, TikTok and Share… (2026-10-24): the result reframed to 4:5, 1:1 or 9:16, Clean or Branded, built on the
 * same renderer as the original-size download (shareBrand.ts renderBranded), so a badge, strip or framed card looks the same everywhere.
 *  - composeStill: an image (or a video's poster) in a frame. `fit` keeps the whole picture on a blurred, darkened copy of itself;
 *    `fill` crops to cover. The framed card always fits (a crop would cut its footer).
 *  - composeVideoOverlay: the transparent brand layer at the exported video's size, placed where the server puts the video (shareExport.ts).
 *  - explodeLayers: Image to layers as a short 9:16 video: the stack tilts into an isometric deck, the layers fan apart, then settle back.
 * Sizes and their sources: sharePlatforms.ts.
 */
import { renderBranded, canvasBlob, type BrandOpts } from './shareBrand';
import { FRAME_PX, fitRect, type Fit, type Frame } from './sharePlatforms';
import { drawOrbit } from './shareCard';

const canvas = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
/** The source, blurred (down-and-up scaling: ctx.filter isn't in Safari) and darkened, covering W × H. */
function backdrop(c: CanvasRenderingContext2D, src: CanvasImageSource, sw: number, sh: number, W: number, H: number) {
  const t = canvas(36, Math.max(8, Math.round(36 * H / W))); const tc = t.getContext('2d')!; const r = fitRect(sw, sh, t.width, t.height, 'fill');
  tc.drawImage(src, r.x, r.y, r.w, r.h); c.save(); c.imageSmoothingQuality = 'high'; c.drawImage(t, -W * 0.04, -H * 0.04, W * 1.08, H * 1.08);
  c.fillStyle = 'rgba(15,17,19,.42)'; c.fillRect(0, 0, W, H); c.restore();
}
/** A still at the frame's size × `scale` (preview < 1). `brand` null = Clean. */
export async function composeStill(img: CanvasImageSource, sw: number, sh: number, o: { frame: Frame; fit: Fit; brand: BrandOpts | null }, scale = 1): Promise<HTMLCanvasElement> {
  if (o.frame === 'original') { if (o.brand) return renderBranded(img, sw, sh, o.brand, scale); const cv = canvas(sw * scale, sh * scale); cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height); return cv; }
  const [W, H] = FRAME_PX[o.frame]; const fill = o.fit === 'fill' && o.brand?.style !== 'card';
  if (fill) { // crop first, then brand the cropped frame, so the badge or strip is never cut off
    const base = canvas(W, H); const r = fitRect(sw, sh, W, H, 'fill'); const bc = base.getContext('2d')!; bc.imageSmoothingQuality = 'high'; bc.drawImage(img, r.x, r.y, r.w, r.h);
    if (o.brand) return renderBranded(base, W, H, o.brand, scale); if (scale === 1) return base; const cv = canvas(W * scale, H * scale); cv.getContext('2d')!.drawImage(base, 0, 0, cv.width, cv.height); return cv;
  }
  // badge / strip sized for the frame, not the (smaller) letterboxed picture; the framed card keeps its own proportions
  const fitK = fitRect(sw, sh, W, H, 'fit').k; const S = o.brand && o.brand.style !== 'card' ? Math.min(W, H) / fitK : undefined;
  const inner = o.brand ? await renderBranded(img, sw, sh, { ...o.brand, S }, 1) : null; const iw = inner ? inner.width : sw, ih = inner ? inner.height : sh;
  const cv = canvas(W * scale, H * scale); const c = cv.getContext('2d')!; c.scale(scale, scale); c.imageSmoothingQuality = 'high';
  backdrop(c, img, sw, sh, W, H);
  const r = fitRect(iw, ih, W, H, 'fit');
  c.save(); c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = 40; c.shadowOffsetY = 12; c.fillStyle = '#0F1113'; c.fillRect(r.x, r.y, r.w, r.h); c.restore();
  c.drawImage(inner ?? img, r.x, r.y, r.w, r.h); return cv;
}
/** The transparent brand overlay for a reframed (or original-size) video. Clean = an empty frame (the server still needs one at that size). */
export async function composeVideoOverlay(sw: number, sh: number, o: { frame: Frame; fit: Fit; brand: BrandOpts | null }, poster: CanvasImageSource | null): Promise<HTMLCanvasElement> {
  if (o.frame === 'original') return o.brand ? renderBranded(null, sw, sh, o.brand, 1, { transparent: true, lumaSource: poster }) : canvas(sw, sh);
  const [W, H] = FRAME_PX[o.frame]; const out = canvas(W, H); if (!o.brand) return out;
  if (o.fit === 'fill') { let luma: HTMLCanvasElement | null = null; if (poster) { luma = canvas(W, H); const r = fitRect(sw, sh, W, H, 'fill'); luma.getContext('2d')!.drawImage(poster, r.x, r.y, r.w, r.h); }
    return renderBranded(null, W, H, o.brand, 1, { transparent: true, lumaSource: luma }); }
  const r = fitRect(sw, sh, W, H, 'fit'); const w = Math.round(r.w), h = Math.round(r.h);
  const ov = await renderBranded(null, w, h, { ...o.brand, style: o.brand.style === 'card' ? 'badge' : o.brand.style, S: Math.min(W, H) }, 1, { transparent: true, lumaSource: scaledTo(poster, w, h) });
  out.getContext('2d')!.drawImage(ov, Math.round(r.x), Math.round(r.y)); return out;
}
const scaledTo = (img: CanvasImageSource | null, w: number, h: number) => { if (!img) return null; const c = canvas(w, h); c.getContext('2d')!.drawImage(img, 0, 0, w, h); return c; };
/** Server placement of a reframed video (must match shareExport.ts frameFilter): even sides, centred. */
export const videoRect = (sw: number, sh: number, frame: Exclude<Frame, 'original'>, fit: Fit) => { const [W, H] = FRAME_PX[frame]; const r = fitRect(sw, sh, W, H, fit); return { ...r, W, H }; };

/* ---------------- Image to layers: the "explode" video ---------------- */
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** How far apart the layers are at time t (0..1 of the clip): rest, open, hold, close, rest. */
export function explodeAmount(t: number) { if (t < 0.12) return 0; if (t < 0.42) return ease((t - 0.12) / 0.3); if (t < 0.7) return 1; if (t < 0.92) return 1 - ease((t - 0.7) / 0.22); return 0; }
/** One frame of the layers video: the layers (bottom first) on a 1080 × 1920 stage, tilted into an isometric deck by `a` (0 flat … 1 apart). */
export function drawExplodeFrame(c: CanvasRenderingContext2D, layers: CanvasImageSource[], lw: number, lh: number, a: number, o: { W: number; H: number; label: string | null; brand: boolean }) {
  const { W, H } = o; c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#15171A'); g.addColorStop(1, '#0B0C0E'); c.fillStyle = g; c.fillRect(0, 0, W, H);
  const glow = c.createRadialGradient(W / 2, H * 0.48, 0, W / 2, H * 0.48, W * 0.8); glow.addColorStop(0, `rgba(255,122,26,${0.05 + 0.08 * a})`); glow.addColorStop(1, 'rgba(255,122,26,0)'); c.fillStyle = glow; c.fillRect(0, 0, W, H);
  const n = layers.length; const base = Math.min((W * 0.86) / lw, (H * 0.5) / lh); const w = lw * base, h = lh * base;
  // isometric plane: rotate −30° and squash; blended with the flat picture by a
  const rot = (-Math.PI / 6) * a; const sy = 1 - 0.45 * a; const shrink = 1 - 0.18 * a; const gap = Math.min(110, (H * 0.5) / Math.max(1, n - 1)) * a;
  const cosR = Math.cos(rot), sinR = Math.sin(rot);
  for (let k = 0; k < n; k++) {
    const dy = (k - (n - 1) / 2) * -gap; c.setTransform(cosR * shrink, sinR * shrink * sy, -sinR * shrink, cosR * shrink * sy, W / 2, H * 0.52 + dy);
    if (a > 0.02) { c.save(); c.globalAlpha = 0.18 + 0.5 * a; c.fillStyle = k === 0 ? 'rgba(15,17,19,.0)' : 'rgba(255,255,255,.04)'; c.fillRect(-w / 2, -h / 2, w, h);
      c.lineWidth = 2 / shrink; c.strokeStyle = k === n - 1 ? 'rgba(255,122,26,.75)' : 'rgba(255,255,255,.22)'; c.strokeRect(-w / 2, -h / 2, w, h); c.restore(); }
    c.drawImage(layers[k], -w / 2, -h / 2, w, h);
  }
  c.setTransform(1, 0, 0, 1, 0, 0);
  if (o.label) { c.font = '600 44px Inter, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.fillStyle = `rgba(247,247,248,${0.35 + 0.65 * a})`; c.fillText(o.label, W / 2, H * 0.105); }
  if (o.brand) { drawOrbit(c, W / 2 - 150, H * 0.885, 64); c.font = '700 40px "Space Grotesk", Inter, system-ui, sans-serif'; c.textAlign = 'left'; c.fillStyle = '#F7F7F8'; c.fillText('Imagination', W / 2 - 104, H * 0.885 + 14); }
  c.restore();
}
/** Record the layers video in the browser (MediaRecorder; MP4 where the browser can, else WebM). `seconds` of real time. */
export async function recordExplode(layers: CanvasImageSource[], lw: number, lh: number, o: { label: string | null; brand: boolean; seconds?: number; onProgress?: (p: number) => void }): Promise<{ blob: Blob; ext: 'mp4' | 'webm' }> {
  const [W, H] = FRAME_PX['9:16']; const cv = canvas(W, H); const c = cv.getContext('2d')!; const secs = o.seconds ?? 7;
  const mime = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m));
  if (!mime) throw new Error('This browser can’t record video. Try Chrome or Safari.');
  drawExplodeFrame(c, layers, lw, lh, 0, { W, H, label: o.label, brand: o.brand });
  const stream = cv.captureStream(30); const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 10_000_000 }); const parts: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
  const stopped = new Promise<void>((res) => { rec.onstop = () => res(); });
  rec.start(250); const t0 = performance.now();
  await new Promise<void>((res) => { const tick = () => { const t = (performance.now() - t0) / 1000 / secs; if (t >= 1) { res(); return; }
    drawExplodeFrame(c, layers, lw, lh, explodeAmount(t), { W, H, label: o.label, brand: o.brand }); o.onProgress?.(t); setTimeout(tick, 1000 / 30); }; tick(); }); // a timer, not rAF: keeps recording when the window is behind another
  rec.stop(); await stopped; stream.getTracks().forEach((t) => t.stop());
  return { blob: new Blob(parts, { type: mime.split(';')[0] }), ext: mime.startsWith('video/mp4') ? 'mp4' : 'webm' };
}
/** A preview image of the layers video at its widest. */
export function explodePoster(layers: CanvasImageSource[], lw: number, lh: number, o: { label: string | null; brand: boolean }, scale = 0.4) {
  const [W, H] = FRAME_PX['9:16']; const cv = canvas(W * scale, H * scale); const c = cv.getContext('2d')!; c.scale(scale, scale);
  // drawExplodeFrame resets the transform, so draw at full size on a temp canvas and scale down
  const full = canvas(W, H); drawExplodeFrame(full.getContext('2d')!, layers, lw, lh, 1, { W, H, label: o.label, brand: o.brand }); c.drawImage(full, 0, 0, W, H); return cv;
}
export { canvasBlob };
