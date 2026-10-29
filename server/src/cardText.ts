/**
 * Title and end cards drawn on the server, for Stitch requests that send card text but no PNG (the REST API and the MCP stitch_video tool).
 * The web panel draws its own cards on a canvas and sends them as PNGs; this is the same look (shared/stitchTimeline CARD_LOOKS) without a
 * browser. This ffmpeg has no drawtext, so the letters come from a pre-drawn glyph sheet: server/samples/card-font.png (Manrope 700 at 96 px,
 * white on black, drawn once in a browser) with card-font.json (where each glyph sits and how far it advances). Each glyph is sampled
 * (bilinear) at the card's size into a transparent frame with a soft shadow, and written as a PNG with node:zlib.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { SAMPLES_DIR } from './config.js';
import { CARD_LOOKS, BRAND_ORANGE, type CardStyle } from './shared/stitchTimeline.js';

type Sheet = { size: number; cell: number; baseline: number; w: number; h: number; glyphs: Record<string, [number, number, number, number, number]>; px: Buffer };
let sheet: Promise<Sheet | null> | null = null;
function loadSheet(): Promise<Sheet | null> {
  return sheet ??= (async () => {
    try { const meta = JSON.parse(readFileSync(path.join(SAMPLES_DIR, 'card-font.json'), 'utf8'));
      const px = await new Promise<Buffer>((res, rej) => { const c = spawn('ffmpeg', ['-v', 'error', '-i', path.join(SAMPLES_DIR, 'card-font.png'), '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { stdio: ['ignore', 'pipe', 'ignore'] });
        const parts: Buffer[] = []; c.stdout.on('data', (d: Buffer) => parts.push(d)); c.on('error', rej); c.on('close', (code) => (code === 0 ? res(Buffer.concat(parts)) : rej(new Error(`ffmpeg ${code}`)))); });
      return px.length === meta.w * meta.h ? { ...meta, px } : null; } catch { return null; }
  })();
}

/** Lines that fit `max` px at scale `s` (greedy by words; a word wider than a line stays whole and is shrunk by the caller). */
function wrap(text: string, adv: (ch: string) => number, max: number): string[] {
  const width = (t: string) => [...t].reduce((w, ch) => w + adv(ch), 0); const out: string[] = []; let cur = '';
  for (const w of text.split(/\s+/).filter(Boolean)) { const t = cur ? `${cur} ${w}` : w; if (!cur || width(t) <= max) cur = t; else { out.push(cur); cur = w; } }
  if (cur) out.push(cur); return out;
}

/** The PNG bytes of a W×H RGBA buffer. Exported for tests. */
export function encodePng(W: number, H: number, rgba: Uint8Array): Buffer {
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (b: Buffer) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (t: string, d: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t, 'latin1'), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((W * 4 + 1) * H); for (let y = 0; y < H; y++) { raw[y * (W * 4 + 1)] = 0; Buffer.from(rgba.buffer, rgba.byteOffset + y * W * 4, W * 4).copy(raw, y * (W * 4 + 1) + 1); }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}

/** Card text → a transparent W×H PNG at `out` in the style's look; null when the glyph sheet is missing or the text is empty. */
export async function drawCardPng(text: string, style: CardStyle, out: string, W: number, H: number): Promise<string | null> {
  const sh = await loadSheet(); const look = CARD_LOOKS[style] ?? CARD_LOOKS.clean; const t = (look.upper ? text.toUpperCase() : text).trim(); if (!sh || !t || !(W > 0 && H > 0)) return null;
  const short = Math.min(W, H); let px = short * look.size; const maxW = W * look.maxW;
  const g = (ch: string) => sh.glyphs[ch] ?? sh.glyphs['?'];
  let s = px / sh.size; const adv = (ch: string) => g(ch)[3] * s + look.tracking * px;
  let lines = wrap(t, adv, maxW);
  for (let k = 0; k < 12 && (lines.length > 3 || lines.some((l) => [...l].reduce((w, ch) => w + adv(ch), 0) > maxW)); k++) { px *= 0.9; s = px / sh.size; lines = wrap(t, adv, maxW); }
  /* even lines: the narrowest width that keeps the same number of lines (no one-word last line) */
  if (lines.length > 1) for (let w = maxW * 0.96; w > maxW * 0.3; w *= 0.96) { const l = wrap(t, adv, w); if (l.length > lines.length) break; lines = l; }
  const lh = sh.cell * s * 0.92; const blockH = lh * lines.length; const top = H * look.y - blockH / 2;
  const cov = new Float32Array(W * H); const widths = lines.map((l) => [...l].reduce((w, ch) => w + adv(ch), 0));
  const left = look.align === 'left' ? W * 0.08 + short * 0.03 : 0;
  lines.forEach((l, li) => {
    let x = look.align === 'left' ? left : (W - widths[li]) / 2; const y0 = top + li * lh;
    for (const ch of l) { const [gx, gy, gw, , lb] = g(ch); const ox = x - lb * s;
      const x1 = Math.max(0, Math.floor(ox)), x2 = Math.min(W - 1, Math.ceil(ox + gw * s)), y1 = Math.max(0, Math.floor(y0)), y2 = Math.min(H - 1, Math.ceil(y0 + sh.cell * s));
      for (let yy = y1; yy <= y2; yy++) for (let xx = x1; xx <= x2; xx++) {
        const sx = (xx - ox) / s, sy = (yy - y0) / s; if (sx < 0 || sy < 0 || sx >= gw - 1 || sy >= sh.cell - 1) continue;
        const ix = Math.floor(sx), iy = Math.floor(sy), fx = sx - ix, fy = sy - iy; const p = (a: number, b: number) => sh.px[(gy + b) * sh.w + gx + a];
        const v = (p(ix, iy) * (1 - fx) + p(ix + 1, iy) * fx) * (1 - fy) + (p(ix, iy + 1) * (1 - fx) + p(ix + 1, iy + 1) * fx) * fy;
        const k = yy * W + xx; cov[k] = Math.max(cov[k], v / 255); }
      x += adv(ch); }
  });
  /* the accent: an orange line under (bold) or a bar to the left (lower third) */
  const acc = new Float32Array(W * H); const fill = (x1: number, y1: number, x2: number, y2: number) => { for (let yy = Math.max(0, Math.round(y1)); yy < Math.min(H, Math.round(y2)); yy++) for (let xx = Math.max(0, Math.round(x1)); xx < Math.min(W, Math.round(x2)); xx++) acc[yy * W + xx] = 1; };
  if (look.accent === 'under') { const bw = short * 0.06; fill((W - bw) / 2, top + blockH + px * 0.25, (W + bw) / 2, top + blockH + px * 0.25 + Math.max(2, short * 0.006)); }
  if (look.accent === 'bar') fill(W * 0.08, top + lh * 0.12, W * 0.08 + Math.max(3, short * 0.008), top + blockH - lh * 0.08);
  /* soft shadow: the coverage blurred (two box passes) and dropped a little */
  const r = Math.max(2, Math.round(short * 0.008)), dy = Math.max(1, Math.round(short * 0.003)); const sh1 = new Float32Array(W * H), sh2 = new Float32Array(W * H);
  for (let y = 0; y < H; y++) { let acc2 = 0; for (let x = -r; x < W + r; x++) { const add = x + r < W && x + r >= 0 ? cov[y * W + x + r] : 0; const sub = x - r - 1 >= 0 && x - r - 1 < W ? cov[y * W + x - r - 1] : 0; acc2 += add - sub; if (x >= 0 && x < W) sh1[y * W + x] = acc2 / (2 * r + 1); } }
  for (let x = 0; x < W; x++) { let acc2 = 0; for (let y = -r; y < H + r; y++) { const add = y + r < H && y + r >= 0 ? sh1[(y + r) * W + x] : 0; const sub = y - r - 1 >= 0 && y - r - 1 < H ? sh1[(y - r - 1) * W + x] : 0; acc2 += add - sub; if (y >= 0 && y < H) { const ty = y + dy; if (ty < H) sh2[ty * W + x] = acc2 / (2 * r + 1); } } }
  const [or, og, ob] = [1, 3, 5].map((i) => parseInt(BRAND_ORANGE.slice(i, i + 2), 16));
  const rgba = new Uint8Array(W * H * 4);
  for (let k = 0; k < W * H; k++) {
    const at = cov[k], aa = acc[k] * (1 - at), as = Math.min(1, sh2[k] * 0.55) * (1 - at - aa); const a = at + aa + as; if (a <= 0.002) continue;
    rgba[k * 4] = Math.round((255 * at + or * aa) / a); rgba[k * 4 + 1] = Math.round((255 * at + og * aa) / a); rgba[k * 4 + 2] = Math.round((255 * at + ob * aa) / a); rgba[k * 4 + 3] = Math.round(a * 255);
  }
  writeFileSync(out, encodePng(W, H, rgba)); return out;
}
