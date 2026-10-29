/**
 * Shared layer maths for any multi-output job that stacks (Image to layers today): pure RGBA helpers (no DOM, so tests and the PSD writer use them
 * as they are) plus two small browser helpers (load a layer's pixels, composite onto a canvas).
 *  - compositeLayers(): every layer drawn bottom first with source-over, the same picture the photo was (and what the feed card / PSD preview show);
 *  - alphaBounds(): the non-transparent box of a layer ([left, top, right, bottom], right/bottom exclusive), used when a layer has no box from the model;
 *  - cropRgba(): a layer cut to that box (PSD layers are stored at their own position and size).
 */
export type Rgba = { width: number; height: number; data: Uint8ClampedArray | Uint8Array };
export type Box = [number, number, number, number];
/** A layer placed on the picture: its pixels and where its top-left corner sits (0, 0 for a full-size layer). */
export type Placed = { image: Rgba; left?: number; top?: number };

/** Every visible layer, bottom first, composited onto a transparent W × H picture (straight alpha, source-over). `hidden` holds layer indexes to skip. */
export function compositeLayers(layers: Placed[], width: number, height: number, hidden: ReadonlySet<number> = new Set()): Rgba {
  const out = new Uint8ClampedArray(width * height * 4);
  layers.forEach((l, k) => {
    if (hidden.has(k)) return; const { image: im } = l; const ox = Math.round(l.left ?? 0), oy = Math.round(l.top ?? 0);
    for (let y = Math.max(0, oy); y < Math.min(height, oy + im.height); y++) for (let x = Math.max(0, ox); x < Math.min(width, ox + im.width); x++) {
      const s = ((y - oy) * im.width + (x - ox)) * 4; const sa = im.data[s + 3] / 255; if (sa <= 0) continue; const d = (y * width + x) * 4;
      const da = out[d + 3] / 255; const oa = sa + da * (1 - sa);
      for (let c = 0; c < 3; c++) out[d + c] = (im.data[s + c] * sa + out[d + c] * da * (1 - sa)) / oa;
      out[d + 3] = oa * 255;
    }
  });
  return { width, height, data: out };
}
/** The box around a layer's visible pixels, or null when it is fully transparent. */
export function alphaBounds(im: Rgba): Box | null {
  let l = im.width, t = im.height, r = -1, b = -1;
  for (let y = 0; y < im.height; y++) for (let x = 0; x < im.width; x++) if (im.data[(y * im.width + x) * 4 + 3] > 0) { if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y; }
  return r < 0 ? null : [l, t, r + 1, b + 1];
}
/** A copy of `box` out of `im`. */
export function cropRgba(im: Rgba, [l, t, r, b]: Box): Rgba {
  const w = Math.max(0, r - l), h = Math.max(0, b - t); const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) data.set(im.data.subarray(((t + y) * im.width + l) * 4, ((t + y) * im.width + l + w) * 4), y * w * 4);
  return { width: w, height: h, data };
}
/** A layer box as CSS percentages of the picture (for highlighting it on a stage that scales). */
export const boxPercent = ([l, t, r, b]: Box, W: number, H: number) => ({ left: `${(l / W) * 100}%`, top: `${(t / H) * 100}%`, width: `${((r - l) / W) * 100}%`, height: `${((b - t) / H) * 100}%` });

// ---- browser ----
/** A layer file's pixels (fetched with the page's own origin; /files URLs are same-origin). */
export async function loadRgba(url: string): Promise<Rgba> {
  const im = new Image(); im.decoding = 'async'; im.src = url; await im.decode();
  const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, c.width, c.height); return { width: d.width, height: d.height, data: d.data };
}
