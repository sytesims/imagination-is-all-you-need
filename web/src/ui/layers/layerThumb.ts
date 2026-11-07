/**
 * Video to layers: a list thumbnail for one layer, cropped to the object. The layer's own see-through clip (VP9 with alpha) is read once in the
 * browser: a frame is drawn small, the box around its visible pixels is found, and that box (with a little room) becomes a square picture.
 * A whole frame squeezed into 44 px showed a sign or a far-away person as a speck, so the crop is what makes the row readable.
 */
import { useEffect, useState } from 'react';

const SIDE = 88; /* 2× the 44 px tile */ const SCAN = 256; /* the frame is scanned at this width */
const cache = new Map<string, Promise<string | null>>();

const once = (v: HTMLVideoElement, ev: string) => new Promise<void>((ok, no) => {
  const done = () => { v.removeEventListener(ev, done); v.removeEventListener('error', fail); ok(); };
  const fail = () => { v.removeEventListener(ev, done); v.removeEventListener('error', fail); no(new Error('no frame')); };
  v.addEventListener(ev, done); v.addEventListener('error', fail);
});

/** The box of pixels at least a bit opaque in a frame, or null when the frame is empty. */
function boxOf(px: Uint8ClampedArray, w: number, h: number) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

async function make(url: string): Promise<string | null> {
  const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
  try {
    await once(v, 'loadeddata'); const w = SCAN, h = Math.max(1, Math.round((SCAN * v.videoHeight) / Math.max(1, v.videoWidth)));
    const scan = document.createElement('canvas'); scan.width = w; scan.height = h; const g = scan.getContext('2d', { willReadFrequently: true })!;
    const d = Number.isFinite(v.duration) ? v.duration : 1;
    for (const t of [Math.min(0.5, d / 2), d / 2, d * 0.85]) { /* a layer can be empty at the start: try a few moments */
      v.currentTime = t; await once(v, 'seeked'); g.clearRect(0, 0, w, h); g.drawImage(v, 0, 0, w, h);
      const b = boxOf(g.getImageData(0, 0, w, h).data, w, h); if (!b) continue;
      const side = Math.min(Math.max(w, h), Math.max(b.x1 - b.x0, b.y1 - b.y0) * 1.15 + 6); const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
      const out = document.createElement('canvas'); out.width = SIDE; out.height = SIDE; const o = out.getContext('2d')!;
      o.drawImage(scan, cx - side / 2, cy - side / 2, side, side, 0, 0, SIDE, SIDE); return out.toDataURL('image/png');
    }
    return null;
  } catch { return null; } finally { v.removeAttribute('src'); v.load(); }
}

/** The cropped thumbnail of a layer clip: undefined while it is made, null when it couldn't be (the row then shows the clip itself). */
export function useLayerThumb(url: string): string | null | undefined {
  const [src, setSrc] = useState<string | null | undefined>(undefined);
  useEffect(() => { let live = true; setSrc(undefined); if (!cache.has(url)) cache.set(url, make(url));
    void cache.get(url)!.then((s) => { if (live) setSrc(s); }); return () => { live = false; }; }, [url]);
  return src;
}
