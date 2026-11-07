/**
 * Layers: depth over the whole clip, and the layer order (our own code).
 *  - Depth Anything 3 renders each frame on its own; we measure the clip once (small grey copies of every frame) and stretch every frame with
 *    the same low / high values (the 1st and 99th percentile of the whole clip), written as a 16-bit PNG sequence plus a grey preview clip.
 *  - Order: for each object, the median depth inside its matte on every frame where it shows, then the median over the clip. Near = white =
 *    a higher value, so layers sort far (bottom) to near (top). Without depth, the first chip is on top.
 */
import { spawn } from 'node:child_process';
import { seq } from './masks.js';

/** Grey frames of a sequence or clip, shrunk to w × h, as one byte per pixel. */
export function grabGrey(input: { dir?: string; file?: string; fps: number }, w: number, h: number): Promise<Buffer> {
  const src = input.dir ? ['-framerate', String(input.fps), '-i', seq(input.dir)] : ['-i', input.file!];
  return new Promise((ok, no) => {
    const c = spawn('ffmpeg', ['-v', 'error', ...src, '-vf', `scale=${w}:${h}:flags=area,format=gray`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { stdio: ['ignore', 'pipe', 'ignore'] });
    const parts: Buffer[] = []; c.stdout.on('data', (d: Buffer) => parts.push(d));
    c.on('error', no); c.on('close', (code) => (code === 0 ? ok(Buffer.concat(parts)) : no(new Error(`Layers: reading frames failed (ffmpeg ${code})`))));
  });
}

/** The p-th percentile (0–100) of byte values, from a histogram. */
export function percentile(values: Uint8Array, p: number): number {
  const hist = new Array<number>(256).fill(0); for (const v of values) hist[v]++;
  const want = Math.max(1, Math.ceil((p / 100) * values.length)); let seen = 0;
  for (let v = 0; v < 256; v++) { seen += hist[v]; if (seen >= want) return v; }
  return 255;
}
/** The clip's stretch: low and high (0–255) from the 1st / 99th percentile; never a zero range. */
export function clipRange(depth: Uint8Array): { lo: number; hi: number } {
  if (!depth.length) return { lo: 0, hi: 255 };
  const lo = percentile(depth, 1); const hi = percentile(depth, 99);
  return hi > lo ? { lo, hi } : { lo: Math.max(0, lo - 1), hi: Math.min(255, lo + 1) };
}
/** ffmpeg lut for the stretch at 16 bits: (v − lo) × 65535 / (hi − lo), clipped. Works on grey16 values (8-bit × 257). */
export function stretchLut(r: { lo: number; hi: number }): string {
  const lo = r.lo * 257; const k = 65535 / ((r.hi - r.lo) * 257);
  return `lut=c0='clip((val-${lo})*${k.toFixed(6)},0,65535)'`;
}
/** 16-bit PNG sequence of the stretched depth. */
export function depth16Args(o: { dir: string; fps: number; range: { lo: number; hi: number }; outDir: string }): string[] {
  return ['-y', '-v', 'error', '-framerate', String(o.fps), '-i', seq(o.dir), '-vf', `format=gray16le,${stretchLut(o.range)}`, '-pix_fmt', 'gray16be', seq(o.outDir)];
}
/** The grey preview clip (H.264) of the stretched depth. */
export function depthPreviewArgs(o: { dir: string; fps: number; range: { lo: number; hi: number }; out: string; width: number; height: number }): string[] {
  const k = 255 / (o.range.hi - o.range.lo);
  return ['-y', '-v', 'error', '-framerate', String(o.fps), '-i', seq(o.dir), '-vf', `format=gray,lut=c0='clip((val-${o.range.lo})*${k.toFixed(6)},0,255)',scale=${o.width}:${o.height},format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-movflags', '+faststart', o.out];
}

/** Median of numbers (0 for none). */
export function median(xs: number[]): number {
  if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
/** Per object: the median depth inside its matte on each frame where it covers at least `minPx` pixels, then the median over the clip.
 *  masks[k] and depth are frame-major byte buffers of the same small size (frame = px bytes). null = the object never showed. */
export function objectDepths(depth: Uint8Array, masks: Uint8Array[], px: number, minPx = 4): (number | null)[] {
  const frames = Math.floor(depth.length / px);
  return masks.map((m) => {
    const perFrame: number[] = [];
    for (let f = 0; f < frames && (f + 1) * px <= m.length; f++) {
      const vals: number[] = [];
      for (let i = f * px; i < (f + 1) * px; i++) if (m[i] > 127) vals.push(depth[i]);
      if (vals.length >= minPx) perFrame.push(median(vals));
    }
    return perFrame.length ? median(perFrame) : null;
  });
}
/** Stacking order, bottom first (indices into the objects). With depth: far (low) to near (high); an object never seen goes to the bottom.
 *  Without depth: the first chip on top. Ties keep the chip order (the earlier chip nearer). */
export function layerOrder(n: number, depths: (number | null)[] | null): number[] {
  const ids = Array.from({ length: n }, (_, k) => k);
  if (!depths) return ids.reverse();
  return ids.sort((a, b) => {
    const da = depths[a] ?? -1; const db = depths[b] ?? -1;
    return da !== db ? da - db : b - a;
  });
}
/** Whether an object showed on enough frames to be a layer worth naming (a warning otherwise). */
export function coverage(mask: Uint8Array, px: number): number {
  const frames = Math.floor(mask.length / px); if (!frames) return 0; let on = 0;
  for (let f = 0; f < frames; f++) { let c = 0; for (let i = f * px; i < (f + 1) * px; i++) if (mask[i] > 127) c++; if (c >= 4) on++; }
  return on / frames;
}
