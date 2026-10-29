/**
 * Input prep in the browser (2026-10-23): fit or crop a photo to an aspect with a canvas, so an edit model that follows the photo's shape
 * can run a workflow that needs another shape (Character Sheet 4:3). The geometry is server/src/shared/photoFit.ts (tested there).
 * - EXIF orientation: createImageBitmap(…, { imageOrientation: 'from-image' }) draws the photo the way it is shown.
 * - Fit background: a blurred, enlarged copy of the photo fills the bands. Chosen over a flat grey because edit models tend to keep flat bars
 *   as part of the picture (a frame in the result), while a soft continuation of the photo's own colours reads as background they can repaint.
 *   A PNG with transparency keeps transparent bands instead (and stays a PNG).
 * - Output: JPEG 0.92 for opaque photos (a 4K PNG can pass the upload limit), PNG when transparency is kept.
 */
import { fitPlan, cropPlan, type Box } from '../../../server/src/shared/photoFit';

export type PrepKind = 'fit' | 'crop';
const decode = (f: Blob) => createImageBitmap(f, { imageOrientation: 'from-image' } as ImageBitmapOptions).catch(() => createImageBitmap(f));
/** The photo's shown size (EXIF applied). */
export async function photoSize(f: Blob): Promise<{ width: number; height: number }> { const b = await decode(f); const s = { width: b.width, height: b.height }; b.close?.(); return s; }
/** True when a PNG has any pixel that isn't fully opaque (checked on a 64 px copy: fast, and enough for padding decisions). */
function hasAlpha(b: ImageBitmap, type: string): boolean {
  if (type !== 'image/png') return false; const c = document.createElement('canvas'); const k = Math.min(1, 64 / Math.max(b.width, b.height)); c.width = Math.max(1, Math.round(b.width * k)); c.height = Math.max(1, Math.round(b.height * k));
  const x = c.getContext('2d', { willReadFrequently: true }); if (!x) return false; x.drawImage(b, 0, 0, c.width, c.height); const d = x.getImageData(0, 0, c.width, c.height).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true; return false;
}
const encode = (c: HTMLCanvasElement, png: boolean) => new Promise<Blob>((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('Couldn’t prepare the photo')), png ? 'image/png' : 'image/jpeg', 0.92));
const nameOf = (f: File, kind: PrepKind, aspect: string, png: boolean) => `${(f.name || 'photo').replace(/\.\w+$/, '')}-${kind === 'fit' ? 'fitted' : 'cropped'}-${aspect.replace(':', 'x')}.${png ? 'png' : 'jpg'}`;

/** The whole photo, centred on a canvas of `aspect` (blurred bands, or transparent for a see-through PNG). */
export async function fitPhoto(f: File, aspect: string): Promise<File> {
  const b = await decode(f); const p = fitPlan(b.width, b.height, aspect); const png = hasAlpha(b, f.type);
  const c = document.createElement('canvas'); c.width = p.width; c.height = p.height; const x = c.getContext('2d')!;
  if (!png) { // blurred bands: the photo scaled to cover a tiny canvas, then stretched back up with smoothing (a cheap blur that works in every browser)
    const t = document.createElement('canvas'); const k = 24 / Math.max(p.width, p.height); t.width = Math.max(2, Math.round(p.width * k)); t.height = Math.max(2, Math.round(p.height * k));
    const tx = t.getContext('2d')!; const s = Math.max(t.width / b.width, t.height / b.height); tx.drawImage(b, (t.width - b.width * s) / 2, (t.height - b.height * s) / 2, b.width * s, b.height * s);
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(t, 0, 0, p.width, p.height); x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(0, 0, p.width, p.height);
  }
  x.imageSmoothingQuality = 'high'; x.drawImage(b, p.photo.x, p.photo.y, p.photo.w, p.photo.h); b.close?.();
  return new File([await encode(c, png)], nameOf(f, 'fit', aspect, png), { type: png ? 'image/png' : 'image/jpeg' });
}
/** The part of the photo inside `box` (photo pixels), at most 4096 px on the long side. */
export async function cropPhoto(f: File, aspect: string, box: Box): Promise<File> {
  const b = await decode(f); const p = cropPlan(b.width, b.height, aspect, box); const png = hasAlpha(b, f.type);
  const c = document.createElement('canvas'); c.width = p.width; c.height = p.height; const x = c.getContext('2d')!; x.imageSmoothingQuality = 'high';
  x.drawImage(b, box.x, box.y, box.w, box.h, 0, 0, p.width, p.height); b.close?.();
  return new File([await encode(c, png)], nameOf(f, 'crop', aspect, png), { type: png ? 'image/png' : 'image/jpeg' });
}
