/**
 * Share cards (Most Viral): the 1200×630 image behind a /s/<token> link preview (Open Graph / X card).
 *
 * Two sources, no new dependencies:
 *  - designed card: the browser draws it on a <canvas> (brand fonts, result, model, Run on, repo link; web/src/shared/shareCard.ts) when
 *    the owner opens Share, and uploads the PNG (PUT /api/jobs/:id/share/card). Only accepted while the result has a share link.
 *  - server card (fallback, e.g. a link made over REST or MCP): composed here. ffmpeg decodes and scales the result to raw RGBA (the
 *    Homebrew ffmpeg and some Linux builds have no drawtext or SVG decoder), then this file draws the Orbit mark (analytic arcs) and the name (a
 *    pre-drawn PNG, server/samples/card-name.png) and writes the PNG with node:zlib. No text beyond the wordmark.
 * Files: <DATA_DIR>/share-cards/<jobId>.png (uploaded) and <jobId>.auto.png (server card cache).
 */
import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import { DATA_DIR, SAMPLES_DIR } from './config.js';
import type { Job } from './jobs.js';
import { localFileOf, kindOfUrl } from './outputMeta.js';
import { ensureLayersPoster } from './layerPoster.js';

export const CARD_W = 1200, CARD_H = 630;
export const CARDS_DIR = path.join(DATA_DIR, 'share-cards');
const safeId = (id: string) => id.replace(/[^\w-]/g, '');
export const uploadedCardFile = (jobId: string) => path.join(CARDS_DIR, `${safeId(jobId)}.png`);
/** v2 (2026-10-24): layered jobs show the composite; the version in the name drops cards drawn from the background plate. */
const autoCardFile = (jobId: string) => path.join(CARDS_DIR, `${safeId(jobId)}.auto2.png`);
export const MAX_CARD_BYTES = 4 * 1024 * 1024;

/** PNG signature + IHDR 1200×630 check (the browser card is always that size). */
export function validCardPng(b: Buffer): string | null {
  if (b.length < 33 || b.length > MAX_CARD_BYTES) return 'The card must be a PNG under 4 MB.';
  if (b.readUInt32BE(0) !== 0x89504e47 || b.toString('ascii', 12, 16) !== 'IHDR') return 'The card must be a PNG.';
  if (b.readUInt32BE(16) !== CARD_W || b.readUInt32BE(20) !== CARD_H) return `The card must be ${CARD_W}×${CARD_H}.`;
  return null;
}
export function saveUploadedCard(jobId: string, b: Buffer) { mkdirSync(CARDS_DIR, { recursive: true }); writeFileSync(uploadedCardFile(jobId), b); }
export function dropCards(jobId: string) { for (const f of [uploadedCardFile(jobId), autoCardFile(jobId), path.join(CARDS_DIR, `${safeId(jobId)}.auto.png`)]) try { unlinkSync(f); } catch { /* none */ } }

// ---------------- PNG ----------------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type: string, data: Buffer) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); }
export function encodePng(rgba: Uint8Array, w: number, h: number): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h); // RGB, filter 0 per row
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = rgba[i]; raw[o + 1] = rgba[i + 1]; raw[o + 2] = rgba[i + 2]; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---------------- drawing ----------------
type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
class Canvas {
  px: Float32Array;
  constructor(public w: number, public h: number, bg: RGB) { this.px = new Float32Array(w * h * 3); for (let i = 0; i < w * h; i++) this.px.set(bg, i * 3); }
  blend(x: number, y: number, c: RGB, a: number) { if (a <= 0 || x < 0 || y < 0 || x >= this.w || y >= this.h) return; a = Math.min(1, a); const i = (y * this.w + x) * 3; for (let k = 0; k < 3; k++) this.px[i + k] += (c[k] - this.px[i + k]) * a; }
  rgba(): Uint8Array { const o = new Uint8Array(this.w * this.h * 4); for (let i = 0; i < this.w * this.h; i++) { for (let k = 0; k < 3; k++) o[i * 4 + k] = Math.max(0, Math.min(255, Math.round(this.px[i * 3 + k]))); o[i * 4 + 3] = 255; } return o; }
  /** Paste raw RGBA (w×h) at (ox, oy) with rounded corners radius r and opacity. */
  paste(src: Uint8Array, w: number, h: number, ox: number, oy: number, r = 0, opacity = 1) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let a = opacity;
      if (r) { const cx = x < r ? r - 0.5 : x >= w - r ? w - r - 0.5 : x, cy = y < r ? r - 0.5 : y >= h - r ? h - r - 0.5 : y; const d = Math.hypot(x - cx, y - cy); if (d > r - 0.5) a *= Math.max(0, r + 0.5 - d); }
      const i = (y * w + x) * 4; this.blend(ox + x, oy + y, [src[i], src[i + 1], src[i + 2]], a * (src[i + 3] / 255));
    }
  }
  /** Coverage-mask fill of a polygon set (nonzero), 4 sub-rows per pixel, exact horizontal coverage. */
  fillPolys(polys: [number, number][][], c: RGB) {
    const edges: { x0: number; y0: number; x1: number; y1: number; d: number }[] = [];
    let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
    for (const p of polys) for (let k = 0; k < p.length; k++) { const a = p[k], b = p[(k + 1) % p.length]; if (a[1] === b[1]) continue; edges.push(a[1] < b[1] ? { x0: a[0], y0: a[1], x1: b[0], y1: b[1], d: 1 } : { x0: b[0], y0: b[1], x1: a[0], y1: a[1], d: -1 }); minY = Math.min(minY, a[1]); maxY = Math.max(maxY, a[1]); minX = Math.min(minX, a[0]); maxX = Math.max(maxX, a[0]); }
    const x0 = Math.max(0, Math.floor(minX)), x1 = Math.min(this.w - 1, Math.ceil(maxX)); const cov = new Float32Array(x1 - x0 + 2); const S = 4;
    for (let py = Math.max(0, Math.floor(minY)); py <= Math.min(this.h - 1, Math.ceil(maxY)); py++) {
      cov.fill(0);
      for (let s = 0; s < S; s++) {
        const y = py + (s + 0.5) / S; const xs: { x: number; d: number }[] = [];
        for (const e of edges) if (y >= e.y0 && y < e.y1) xs.push({ x: e.x0 + ((y - e.y0) / (e.y1 - e.y0)) * (e.x1 - e.x0), d: e.d });
        xs.sort((a, b) => a.x - b.x); let wnd = 0;
        for (let k = 0; k < xs.length - 1; k++) { wnd += xs[k].d; if (wnd === 0) continue; const a = xs[k].x - x0, b = xs[k + 1].x - x0; if (b <= a) continue;
          const ia = Math.floor(a), ib = Math.floor(b);
          if (ia === ib) { if (ia >= 0 && ia < cov.length) cov[ia] += (b - a) / S; continue; }
          if (ia >= 0 && ia < cov.length) cov[ia] += (ia + 1 - a) / S; for (let q = Math.max(0, ia + 1); q < Math.min(ib, cov.length); q++) cov[q] += 1 / S; if (ib >= 0 && ib < cov.length) cov[ib] += (b - ib) / S; }
      }
      for (let q = 0; q < cov.length; q++) if (cov[q] > 0) this.blend(x0 + q, py, c, cov[q]);
    }
  }
}
/** SVG path (M L H V Q C Z, absolute) → polygons, scaled and offset. */
function pathPolys(d: string, s: number, ox: number, oy: number): [number, number][][] {
  const toks = d.match(/[MLHVQCZmlhvqcz]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? []; const out: [number, number][][] = []; let cur: [number, number][] = []; let i = 0; let cmd = ''; let px = 0, py = 0;
  const n = () => Number(toks[i++]); const pt = (x: number, y: number): [number, number] => [ox + x * s, oy + y * s];
  while (i < toks.length) {
    if (/[A-Za-z]/.test(toks[i])) cmd = toks[i++];
    if (cmd === 'M') { if (cur.length) out.push(cur); px = n(); py = n(); cur = [pt(px, py)]; cmd = 'L'; }
    else if (cmd === 'L') { px = n(); py = n(); cur.push(pt(px, py)); }
    else if (cmd === 'H') { px = n(); cur.push(pt(px, py)); }
    else if (cmd === 'V') { py = n(); cur.push(pt(px, py)); }
    else if (cmd === 'Q') { const cx = n(), cy = n(), x = n(), y = n(); for (let t = 1; t <= 8; t++) { const u = t / 8; cur.push(pt((1 - u) ** 2 * px + 2 * (1 - u) * u * cx + u * u * x, (1 - u) ** 2 * py + 2 * (1 - u) * u * cy + u * u * y)); } px = x; py = y; }
    else if (cmd === 'C') { const c1x = n(), c1y = n(), c2x = n(), c2y = n(), x = n(), y = n(); for (let t = 1; t <= 10; t++) { const u = t / 10, v = 1 - u; cur.push(pt(v ** 3 * px + 3 * v * v * u * c1x + 3 * v * u * u * c2x + u ** 3 * x, v ** 3 * py + 3 * v * v * u * c1y + 3 * v * u * u * c2y + u ** 3 * y)); } px = x; py = y; }
    else if (cmd === 'Z' || cmd === 'z') { if (cur.length) out.push(cur); cur = []; cmd = ''; }
    else i++; // unsupported token: skip
  }
  if (cur.length) out.push(cur); return out;
}
/** The Orbit mark (BRAND-GUIDE §1): ring r 15.5, stroke 5.5, three 80° arcs centred at −15°, 105°, 225°, core r 6 — in 48-unit space. */
function drawOrbit(c: Canvas, cx: number, cy: number, size: number) {
  const s = size / 48, R = 15.5 * s, half = 2.75 * s, core = 6 * s; const arcs = [-15, 105, 225].map((m) => [(m - 40) * Math.PI / 180, (m + 40) * Math.PI / 180]);
  const orange = hex('#FF7A1A'), white = hex('#F7F7F8'); const ext = Math.ceil(R + half + 2);
  for (let y = Math.floor(cy - ext); y <= cy + ext; y++) for (let x = Math.floor(cx - ext); x <= cx + ext; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, r = Math.hypot(dx, dy); let th = Math.atan2(dy, dx); let best = Infinity;
    for (const [a0, a1] of arcs) { let t = th; while (t < a0) t += 2 * Math.PI; while (t > a0 + 2 * Math.PI) t -= 2 * Math.PI;
      const d = t <= a1 ? Math.abs(r - R) : Math.min(Math.hypot(dx - R * Math.cos(a0), dy - R * Math.sin(a0)), Math.hypot(dx - R * Math.cos(a1), dy - R * Math.sin(a1))); best = Math.min(best, d); }
    c.blend(x, y, orange, Math.max(0, Math.min(1, half - best + 0.5)));
    c.blend(x, y, white, Math.max(0, Math.min(1, core - r + 0.5)));
  }
}
/** Wordmark lockup, `h` px tall, top-left at (x, y): the Orbit mark plus the two-tier name "Imagination / is all you need". The name is a
 *  pre-drawn transparent PNG (server/samples/card-name.png, drawn in Space Grotesk + Inter at h = 38 by the same code as the web card),
 *  decoded to RGBA by ffmpeg; without ffmpeg or the file the card keeps the mark alone. */
async function drawWordmark(c: Canvas, x: number, y: number, h: number) {
  drawOrbit(c, x + h / 2, y + h / 2, h * 48 / 36.5);
  const f = path.join(SAMPLES_DIR, 'card-name.png'); if (!existsSync(f)) return;
  const sz = await probeSize(f); if (!sz) return;
  const px = await ffRaw(['-i', f], sz.w * sz.h * 4); if (px) c.paste(px, sz.w, sz.h, Math.round(x + h * 1.25), y);
}

// ---------------- media via ffmpeg ----------------
function ffRaw(args: string[], bytes: number): Promise<Uint8Array | null> {
  return new Promise((res) => {
    const p = spawn('ffmpeg', ['-v', 'error', ...args, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'], { stdio: ['ignore', 'pipe', 'ignore'] });
    const parts: Buffer[] = []; p.stdout.on('data', (d) => parts.push(d)); p.on('error', () => res(null));
    p.on('close', () => { const b = Buffer.concat(parts); res(b.length >= bytes ? new Uint8Array(b.buffer, b.byteOffset, bytes) : null); });
  });
}
function probeSize(file: string): Promise<{ w: number; h: number } | null> {
  return new Promise((res) => { const p = spawn('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', file], { stdio: ['ignore', 'pipe', 'ignore'] });
    let o = ''; p.stdout.on('data', (d) => (o += d)); p.on('error', () => res(null)); p.on('close', () => { const [w, h] = o.trim().split('\n')[0].split('x').map(Number); res(w > 0 && h > 0 ? { w, h } : null); }); });
}

/** The server card for a job (cached). null when nothing can be drawn (no ffmpeg and no media is still a valid branded card). */
export async function serverCard(job: Job): Promise<Buffer> {
  const f = autoCardFile(job.id); if (existsSync(f)) return readFileSync(f);
  const c = new Canvas(CARD_W, CARD_H, hex('#0F1113'));
  // Image to layers: the stacked composite, not the background plate (output 0)
  const poster = await ensureLayersPoster(job).catch(() => null);
  const out = poster ? { url: poster } : job.outputs?.find((o) => kindOfUrl(o.url) !== 'audio') ?? null; const file = out ? localFileOf(out.url) : null;
  const kind = out ? kindOfUrl(out.url) : null; const seek = kind === 'video' ? ['-ss', '1'] : [];
  let drewMedia = false;
  if (file && existsSync(file)) {
    const bg = await ffRaw([...seek, '-i', file, '-vf', `scale=${CARD_W / 8}:${CARD_H / 8}:force_original_aspect_ratio=increase,crop=${CARD_W / 8}:${CARD_H / 8},boxblur=6:2,scale=${CARD_W}:${CARD_H}:flags=bicubic`], CARD_W * CARD_H * 4);
    if (bg) c.paste(bg, CARD_W, CARD_H, 0, 0, 0, 0.42);
    const sz = await probeSize(file);
    if (sz) {
      const boxW = 1104, boxH = 470; const k = Math.min(boxW / sz.w, boxH / sz.h); const w = Math.max(2, Math.round(sz.w * k / 2) * 2), h = Math.max(2, Math.round(sz.h * k / 2) * 2);
      const fg = await ffRaw([...seek, '-i', file, '-vf', `scale=${w}:${h}:flags=lanczos`], w * h * 4);
      if (fg) { const ox = Math.round((CARD_W - w) / 2), oy = 40 + Math.round((boxH - h) / 2);
        c.paste(fg, w, h, ox, oy, 18); drewMedia = true; }
    }
  }
  if (!drewMedia) drawOrbit(c, CARD_W / 2, 255, 260);
  // bottom bar
  for (let y = 540; y < CARD_H; y++) for (let x = 0; x < CARD_W; x++) c.blend(x, y, hex('#0F1113'), 0.72);
  await drawWordmark(c, 48, 567, 38);
  const png = encodePng(c.rgba(), CARD_W, CARD_H); try { mkdirSync(CARDS_DIR, { recursive: true }); writeFileSync(f, png); } catch { /* cache only */ }
  return png;
}
