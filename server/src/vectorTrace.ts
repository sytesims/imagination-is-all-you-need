/**
 * Image to vector (SVG) on this computer (2026-11-03): VTracer (visioncortex, MIT) through @neplex/vectorizer (MIT, napi-rs prebuilt binaries for macOS
 * arm64 / x64, Windows x64 / arm64 / ia32, Linux glibc and musl, FreeBSD, Android, and a WASI fallback). Nothing to install, no Python, no ComfyUI.
 * Rules and the style → setting map: shared/imageVector.ts.
 *
 *  1. Decode the picture (PNG, JPG, WebP, GIF first frame) to RGBA; an SVG or anything else is refused before this.
 *  2. Bigger than VECTOR_MAX_SIDE on the long side → scaled down here (area average, alpha kept), and the result says so.
 *  3. Trace (colour, stacked, spline) with the style's settings; transparent pixels stay empty (VTracer keys them out).
 *  4. Sanitize (shared sanitizeSvg) and write <job>-out0.svg aside, then move it in.
 * Cancel: the trace runs off the main thread and takes an AbortSignal; the job's cancel aborts it.
 */
import { createRequire } from 'node:module';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { VTRACER_SETTINGS, VECTOR_NOTES, VECTOR_SMALL_SIDE, sanitizeSvg, vectorPhotoBlock, vectorStyleOf, vectorTraceSize, type VectorStyle } from './shared/imageVector.js';

type Vectorizer = typeof import('@neplex/vectorizer');
let lib: Vectorizer | null = null;
/** Loaded on first use, so a platform without a prebuilt binary only fails this tool (with a plain message), never the app's start. */
export function vectorizer(): Vectorizer { return (lib ??= createRequire(import.meta.url)('@neplex/vectorizer') as Vectorizer); }

export interface Decoded { width: number; height: number; pixels: Buffer }
export class TraceError extends Error { constructor(message: string, public code: string) { super(message); } }

/** Decode a picture file to RGBA. Refuses SVG (already a vector) and files that aren't pictures. */
export async function decodePicture(file: string): Promise<Decoded> {
  const buf = await readFile(file);
  const head = buf.subarray(0, 512).toString('utf8').replace(/^﻿/, '').trimStart();
  if (/\.svg$/i.test(file) || /^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(head)) throw new TraceError('That file is already a vector (SVG). Pick a PNG, JPG or WebP picture.', 'already_vector');
  try { const i = await vectorizer().readImage(buf); return { width: i.width, height: i.height, pixels: Buffer.from(i.pixels) }; }
  catch { throw new TraceError('That file could not be read as a picture. Use a PNG, JPG or WebP.', 'format'); }
}

/** Area-average downscale of an RGBA buffer (alpha-weighted colour, so transparent edges don't go dark). */
export function downscaleRgba(src: Decoded, width: number, height: number): Decoded {
  const out = Buffer.alloc(width * height * 4); const sx = src.width / width, sy = src.height / height;
  for (let y = 0; y < height; y++) { const y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < width; x++) { const x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1 && yy < src.height; yy++) for (let xx = x0; xx < x1 && xx < src.width; xx++) { const i = (yy * src.width + xx) * 4; const al = src.pixels[i + 3];
        r += src.pixels[i] * al; g += src.pixels[i + 1] * al; b += src.pixels[i + 2] * al; a += al; n++; }
      const o = (y * width + x) * 4; if (a > 0) { out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(b / a); } out[o + 3] = n ? Math.round(a / n) : 0; } }
  return { width, height, pixels: out };
}

/** Photo-like: many distinct colours (5 bits a channel, opaque pixels, sampled on a grid). Flat art has a few dozen to a few hundred. */
export function looksLikePhoto(img: Decoded): boolean {
  const step = Math.max(1, Math.floor(Math.sqrt((img.width * img.height) / 40_000))); const seen = new Set<number>(); let n = 0;
  for (let y = 0; y < img.height; y += step) for (let x = 0; x < img.width; x += step) { const i = (y * img.width + x) * 4; if (img.pixels[i + 3] < 128) continue; n++;
    seen.add(((img.pixels[i] >> 3) << 10) | ((img.pixels[i + 1] >> 3) << 5) | (img.pixels[i + 2] >> 3)); }
  return n > 0 && seen.size > 1500;
}

export interface TraceResult { svg: string; source: { width: number; height: number }; traced: { width: number; height: number }; scaled: boolean; photo: boolean; notes: string[]; paths: number }
/** Trace one picture file with a style. Throws TraceError (plain message) for a bad input; AbortError when canceled. */
export async function tracePicture(file: string, style: VectorStyle | string, signal?: AbortSignal): Promise<TraceResult> {
  const img = await decodePicture(file); const b = vectorPhotoBlock(img); if (b) throw new TraceError(b.message, b.code);
  const t = vectorTraceSize(img.width, img.height); const use = t.scaled ? downscaleRgba(img, t.width, t.height) : img;
  const photo = looksLikePhoto(use); const s = VTRACER_SETTINGS[vectorStyleOf(style)];
  const stop = () => { if (signal?.aborted) throw Object.assign(new Error('Canceled'), { name: 'AbortError' }); }; stop(); // also checked after: a library that ignores a late abort never writes a result
  const raw = await vectorizer().vectorizeRaw(use.pixels, { width: use.width, height: use.height }, { colorMode: 0, hierarchical: 0, mode: 2, ...s } as any, signal);
  stop(); const svg = sanitizeSvg(raw);
  const notes = [...(t.scaled ? [VECTOR_NOTES.scaled(img.width, img.height, t)] : []), ...(Math.max(img.width, img.height) < VECTOR_SMALL_SIDE ? [VECTOR_NOTES.small(img.width, img.height)] : []), ...(photo ? [VECTOR_NOTES.photo] : [])];
  return { svg, source: { width: img.width, height: img.height }, traced: { width: use.width, height: use.height }, scaled: t.scaled, photo, notes, paths: (svg.match(/<path\b/g) ?? []).length };
}

/** Write an SVG safely: sanitized, written aside, then moved in (nothing reads a half-written file). */
export async function writeSvg(dest: string, svg: string) { const tmp = `${dest}.part`; try { await writeFile(tmp, sanitizeSvg(svg)); await rename(tmp, dest); } finally { await rm(tmp, { force: true }); } }
/** Copy an untrusted SVG (a Comfy Cloud result) into place, sanitized. */
export async function copySanitizedSvg(src: string, dest: string) { await writeSvg(dest, await readFile(src, 'utf8')); }
