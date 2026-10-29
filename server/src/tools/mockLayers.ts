/**
 * Image to layers: the mock backend's sample layers (2026-10-24). Never a render and never an outside image: a small poster scene we draw ourselves
 * (sky, sun, cloud, hills, a box with its shadow, two round "pups" peeking in, a title, a subtitle, a badge, a logo disc, sparkles), one element per
 * transparent PNG, each the picture's size, with the same fields a real Seedream run gives (name, description, bounding box [left, top, right, bottom]).
 * The count follows the prompt ("13 layers", "2 layers": 2–13), else the seed (6–13), so the feed, viewer, names and PSD can be checked at any size.
 * Pure JS (a tiny rasteriser + PNG encoder), so it needs no ffmpeg filter and gives the same pixels everywhere.
 */
import zlib from 'node:zlib';

type Px = Uint8ClampedArray;
type Layer = { id: string; name: string; description: string; z: number; draw: (c: Canvas) => void };
class Canvas {
  readonly px: Px;
  constructor(readonly w: number, readonly h: number) { this.px = new Uint8ClampedArray(w * h * 4); }
  /** source-over one pixel */
  dot(x: number, y: number, r: number, g: number, b: number, a = 255) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return; const i = (y * this.w + x) * 4; const p = this.px;
    const sa = a / 255, da = p[i + 3] / 255, oa = sa + da * (1 - sa); if (oa <= 0) return;
    p[i] = (r * sa + p[i] * da * (1 - sa)) / oa; p[i + 1] = (g * sa + p[i + 1] * da * (1 - sa)) / oa; p[i + 2] = (b * sa + p[i + 2] * da * (1 - sa)) / oa; p[i + 3] = oa * 255;
  }
  rect(x0: number, y0: number, x1: number, y1: number, c: number[], a = 255) {
    for (let y = Math.max(0, Math.round(y0)); y < Math.min(this.h, Math.round(y1)); y++) for (let x = Math.max(0, Math.round(x0)); x < Math.min(this.w, Math.round(x1)); x++) this.dot(x, y, c[0], c[1], c[2], a);
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: number[], a = 255) {
    for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(this.h - 1, Math.ceil(cy + ry)); y++) for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(this.w - 1, Math.ceil(cx + rx)); x++) {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2; if (d <= 1) this.dot(x, y, c[0], c[1], c[2], a * Math.min(1, (1 - d) * Math.max(rx, ry) / 1.5)); }
  }
  /** blocky 5×7 text, `s` px per cell, centred on cx */
  text(s: string, cx: number, y: number, cell: number, c: number[]) {
    const chars = [...s.toUpperCase()]; const width = chars.length * 6 * cell - cell; let x0 = Math.round(cx - width / 2);
    for (const ch of chars) { const g = FONT[ch] ?? FONT[' ']; for (let r = 0; r < 7; r++) for (let k = 0; k < 5; k++) if (g[r] & (16 >> k)) this.rect(x0 + k * cell, y + r * cell, x0 + (k + 1) * cell, y + (r + 1) * cell, c); x0 += 6 * cell; }
  }
}
// 5×7 glyphs (rows, 5 bits each): only what the scene writes
const FONT: Record<string, number[]> = {
  ' ': [0, 0, 0, 0, 0, 0, 0], A: [14, 17, 17, 31, 17, 17, 17], E: [31, 16, 16, 30, 16, 16, 31], G: [14, 17, 16, 23, 17, 17, 15], I: [14, 4, 4, 4, 4, 4, 14], M: [17, 27, 21, 21, 17, 17, 17],
  N: [17, 25, 21, 19, 17, 17, 17], L: [16, 16, 16, 16, 16, 16, 31], O: [14, 17, 17, 17, 17, 17, 14], U: [17, 17, 17, 17, 17, 17, 14], W: [17, 17, 17, 21, 21, 27, 17], Y: [17, 17, 10, 4, 4, 4, 4],
  D: [30, 17, 17, 17, 17, 17, 30], H: [17, 17, 17, 31, 17, 17, 17], P: [30, 17, 17, 30, 16, 16, 16], K: [17, 18, 20, 24, 20, 18, 17], '!': [4, 4, 4, 4, 4, 0, 4],
};

/** The scene, bottom to top (z): the pups sit behind the box front, so hiding the box shows them whole. Positions are fractions of the canvas, so any photo shape works. */
const SCENE: Layer[] = [
  { id: 'bg', z: 0, name: 'Background', description: 'Blue sky gradient filling the whole poster', draw: (c) => { for (let y = 0; y < c.h; y++) { const t = y / c.h; c.rect(0, y, c.w, y + 1, [60 + 120 * t, 130 + 90 * t, 230 - 20 * t]); } } },
  { id: 'sun', z: 1, name: 'sun', description: 'Warm yellow sun in the top right corner', draw: (c) => c.ellipse(c.w * 0.84, c.h * 0.17, c.h * 0.1, c.h * 0.1, [255, 214, 90]) },
  { id: 'cloud', z: 2, name: 'cloud', description: 'Soft white cloud drifting on the left', draw: (c) => { for (const [x, y, r] of [[0.14, 0.3, 0.07], [0.2, 0.27, 0.09], [0.27, 0.31, 0.065]]) c.ellipse(c.w * x, c.h * y, c.h * r * 1.4, c.h * r, [250, 252, 255], 235); } },
  { id: 'hills', z: 3, name: 'green hills', description: 'Rolling grass hills along the bottom edge', draw: (c) => { c.ellipse(c.w * 0.25, c.h * 1.02, c.w * 0.45, c.h * 0.26, [86, 168, 92]); c.ellipse(c.w * 0.8, c.h * 1.05, c.w * 0.5, c.h * 0.25, [70, 150, 80]); } },
  { id: 'shadow', z: 4, name: 'box shadow', description: 'Semi-transparent shadow under the box', draw: (c) => c.ellipse(c.w * 0.5, c.h * 0.86, c.w * 0.26, c.h * 0.05, [10, 20, 10], 110) },
  { id: 'box', z: 7, name: 'cardboard box', description: 'Open cardboard box in the middle of the scene', draw: (c) => { c.rect(c.w * 0.3, c.h * 0.56, c.w * 0.7, c.h * 0.86, [196, 140, 82]); c.rect(c.w * 0.3, c.h * 0.56, c.w * 0.7, c.h * 0.6, [150, 100, 55]); c.rect(c.w * 0.27, c.h * 0.5, c.w * 0.36, c.h * 0.58, [214, 160, 100]); c.rect(c.w * 0.64, c.h * 0.5, c.w * 0.73, c.h * 0.58, [214, 160, 100]); } },
  { id: 'pupL', z: 5, name: 'left pup', description: 'Round orange pup peeking out of the box, on the left', draw: (c) => { const x = c.w * 0.42, y = c.h * 0.54, r = c.h * 0.085; c.ellipse(x - r * 0.8, y - r * 0.8, r * 0.35, r * 0.55, [170, 90, 30]); c.ellipse(x + r * 0.8, y - r * 0.8, r * 0.35, r * 0.55, [170, 90, 30]); c.ellipse(x, y, r, r, [232, 140, 60]); c.ellipse(x - r * 0.35, y - r * 0.1, r * 0.12, r * 0.12, [20, 20, 20]); c.ellipse(x + r * 0.35, y - r * 0.1, r * 0.12, r * 0.12, [20, 20, 20]); c.ellipse(x, y + r * 0.3, r * 0.18, r * 0.12, [40, 25, 20]); } },
  { id: 'pupR', z: 6, name: 'right pup', description: 'Grey pup with a white muzzle peeking out of the box, on the right', draw: (c) => { const x = c.w * 0.59, y = c.h * 0.55, r = c.h * 0.08; c.ellipse(x - r * 0.85, y - r * 0.6, r * 0.3, r * 0.6, [90, 90, 100]); c.ellipse(x + r * 0.85, y - r * 0.6, r * 0.3, r * 0.6, [90, 90, 100]); c.ellipse(x, y, r, r, [150, 150, 160]); c.ellipse(x, y + r * 0.35, r * 0.5, r * 0.4, [240, 240, 240]); c.ellipse(x - r * 0.35, y - r * 0.15, r * 0.11, r * 0.11, [20, 20, 20]); c.ellipse(x + r * 0.35, y - r * 0.15, r * 0.11, r * 0.11, [20, 20, 20]); } },
  { id: 'title', z: 8, name: 'title text', description: 'Headline "IMAGINE" in bold white letters', draw: (c) => c.text('IMAGINE', c.w / 2, Math.round(c.h * 0.08), Math.max(2, Math.round(c.h * 0.018)), [255, 255, 255]) },
  { id: 'sub', z: 9, name: 'subtitle', description: 'Tagline "ALL YOU NEED" under the headline', draw: (c) => c.text('ALL YOU NEED', c.w / 2, Math.round(c.h * 0.27), Math.max(1, Math.round(c.h * 0.009)), [255, 236, 200]) },
  { id: 'badge', z: 10, name: 'new badge', description: 'Red round "NEW!" badge on the upper left', draw: (c) => { const x = c.w * 0.12, y = c.h * 0.62, r = c.h * 0.07; c.ellipse(x, y, r, r, [220, 50, 50]); c.text('NEW!', x, Math.round(y - c.h * 0.012), Math.max(1, Math.round(c.h * 0.0035)), [255, 255, 255]); } },
  { id: 'logo', z: 11, name: 'logo', description: 'Orange ring logo in the bottom right corner', draw: (c) => { const x = c.w * 0.9, y = c.h * 0.88, r = c.h * 0.05; c.ellipse(x, y, r, r, [255, 122, 26]); c.ellipse(x, y, r * 0.65, r * 0.65, [255, 255, 255]); c.ellipse(x, y, r * 0.3, r * 0.3, [255, 122, 26]); } },
  { id: 'sparkles', z: 12, name: 'small decorative sparkle stars scattered around the headline text', description: 'A few tiny sparkles around the title (a long layer name, kept on purpose)', draw: (c) => { for (const [x, y] of [[0.22, 0.1], [0.78, 0.09], [0.3, 0.22], [0.7, 0.24]]) { const s = Math.max(2, c.h * 0.012); c.rect(c.w * x - s * 2, c.h * y - s / 3, c.w * x + s * 2, c.h * y + s / 3, [255, 250, 210]); c.rect(c.w * x - s / 3, c.h * y - s * 2, c.w * x + s / 3, c.h * y + s * 2, [255, 250, 210]); } } },
];
/** Which elements a run of `n` layers keeps (always the background; the most telling elements first), returned in z order. */
const PRIORITY = ['bg', 'pupL', 'title', 'box', 'pupR', 'logo', 'sun', 'cloud', 'hills', 'sub', 'shadow', 'badge', 'sparkles'];
export const MOCK_LAYERS_MIN = 2, MOCK_LAYERS_MAX = SCENE.length;
export function mockLayerCount(prompt: unknown, seed: unknown): number {
  const m = /(\d{1,2})\s*layers?\b/i.exec(String(prompt ?? '')); if (m) return Math.max(MOCK_LAYERS_MIN, Math.min(MOCK_LAYERS_MAX, Number(m[1])));
  const s = Number(seed); return Number.isFinite(s) ? 6 + (Math.abs(Math.trunc(s)) % 8) : 9;
}
const pick = (n: number) => { const keep = new Set(PRIORITY.slice(0, Math.max(1, Math.min(SCENE.length, n)))); return SCENE.filter((l) => keep.has(l.id)).sort((a, b) => a.z - b.z); };
/** Names as the model would send them (layerLabel turns them into the shown labels). */
export const mockLayerNames = (n: number) => pick(n).map((l) => l.name);
/** Canvas for the sample: the photo's shape, longest side ≤ 1024 (1024 × 768 without a photo size). */
export function mockLayerSize(src?: { width?: number; height?: number } | null): [number, number] {
  const w = Number(src?.width) || 1024, h = Number(src?.height) || 768; const k = Math.min(1, 1024 / Math.max(w, h));
  return [Math.max(64, Math.round((w * k) / 2) * 2), Math.max(64, Math.round((h * k) / 2) * 2)];
}
/** Bounding box of the non-transparent pixels ([left, top, right, bottom], right/bottom exclusive), or null when the layer is empty. */
export function alphaBox(px: ArrayLike<number>, w: number, h: number): [number, number, number, number] | null {
  let l = w, t = h, r = -1, b = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3] > 0) { if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y; }
  return r < 0 ? null : [l, t, r + 1, b + 1];
}
export type MockLayer = { name: string; description: string; box: [number, number, number, number] | null; png: Buffer };
/** Layer k of an n-layer sample at w × h. */
export function mockLayer(k: number, n: number, w: number, h: number): MockLayer {
  const l = pick(n)[k] ?? pick(n)[0]; const c = new Canvas(w, h); l.draw(c);
  return { name: l.name, description: l.description, box: alphaBox(c.px, w, h), png: encodePng(c.px, w, h) };
}

// ---- PNG (RGBA, 8 bit, no filter) ----
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type: string, data: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'latin1'), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
export function encodePng(px: ArrayLike<number>, w: number, h: number): Buffer {
  const raw = Buffer.alloc((w * 4 + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; for (let i = 0; i < w * 4; i++) raw[y * (w * 4 + 1) + 1 + i] = px[y * w * 4 + i]; }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}
