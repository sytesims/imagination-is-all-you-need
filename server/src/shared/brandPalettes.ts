/**
 * Brand palettes for design apps (2026-10-28): the kit's colours as the swatch files other apps import. Our own writers, built from each format's
 * public description (no code from other projects). Isomorphic and dependency-free: the Brands page builds the file in the browser.
 *  - .ase  Adobe Swatch Exchange (Photoshop, Illustrator, InDesign): big-endian binary; "ASEF", version 1.0, a block count, then blocks.
 *          Ours: one group named after the brand holding one RGB colour entry per colour.
 *  - .swatches  Procreate: a zip (stored, no compression) with one Swatches.json: [{ name, swatches: [{ hue, saturation, brightness, alpha, colorSpace }] }],
 *          HSB values 0..1. Procreate holds up to 30 swatches per palette (a kit has at most 12).
 *  - .gpl  GIMP palette (GIMP, Inkscape, Krita; Blender with its Import Palettes add-on): plain text, "R G B<tab>name" per line.
 *  - .sketchpalette  Sketch Palettes plugin (v2 file): JSON with colours as red / green / blue / alpha in 0..1.
 * Affinity's own palette file (.afpalette) has no public description, so there is no writer for it.
 */
import { colourWords, hexToRgb, kitSlug, normHex, type BrandKit } from './brandKit.js';

export type PaletteKind = 'ase' | 'procreate' | 'gpl' | 'sketch';
export interface PaletteFile { data: Uint8Array | string; name: string; mime: string }

/** The kit's valid colours with a display name each (the user's name, else the colour in words). */
const swatchesOf = (kit: Pick<BrandKit, 'colors'>) => (kit.colors ?? []).map((c) => ({ hex: normHex(c.hex), name: (c.name || '').trim() })).filter((c): c is { hex: string; name: string } => !!c.hex)
  .map((c) => ({ hex: c.hex, name: c.name || colourWords(c.hex).replace(/\b\w/, (x) => x.toUpperCase()) }));
const kitTitle = (kit: Pick<BrandKit, 'name'>) => String(kit.name ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim() || 'Brand';

// ---------------------------------------------------------------- byte helpers
class Bytes {
  private parts: number[] = [];
  u8(n: number) { this.parts.push(n & 255); return this; }
  u16be(n: number) { return this.u8(n >> 8).u8(n); }
  u32be(n: number) { return this.u16be(n >>> 16).u16be(n & 0xffff); }
  u16le(n: number) { return this.u8(n).u8(n >> 8); }
  u32le(n: number) { return this.u16le(n & 0xffff).u16le(n >>> 16); }
  f32be(x: number) { const b = new DataView(new ArrayBuffer(4)); b.setFloat32(0, x, false); for (let i = 0; i < 4; i++) this.u8(b.getUint8(i)); return this; }
  ascii(s: string) { for (const ch of s) this.u8(ch.charCodeAt(0)); return this; }
  raw(b: Uint8Array) { for (const x of b) this.parts.push(x); return this; }
  get length() { return this.parts.length; }
  done() { return Uint8Array.from(this.parts); }
}
const utf8 = (s: string) => new TextEncoder().encode(s);

// ---------------------------------------------------------------- Adobe Swatch Exchange (.ase)
const ASE_COLOR = 0x0001, ASE_GROUP_START = 0xc001, ASE_GROUP_END = 0xc002;
/** An ASE name: u16 length in UTF-16 units including the ending 0, then UTF-16BE text and a 0. */
function aseName(s: string): Uint8Array { const b = new Bytes(); const units: number[] = []; for (let i = 0; i < s.length; i++) units.push(s.charCodeAt(i)); b.u16be(units.length + 1); units.forEach((u) => b.u16be(u)); b.u16be(0); return b.done(); }
export function aseOf(kit: Pick<BrandKit, 'name' | 'colors'>): Uint8Array {
  const sw = swatchesOf(kit); const blocks: [number, Uint8Array][] = [];
  blocks.push([ASE_GROUP_START, aseName(kitTitle(kit).slice(0, 120))]);
  for (const c of sw) { const [r, g, bl] = hexToRgb(c.hex); const body = new Bytes().raw(aseName(c.name.slice(0, 120))).ascii('RGB ').f32be(r / 255).f32be(g / 255).f32be(bl / 255).u16be(2 /* normal (not global, not spot) */); blocks.push([ASE_COLOR, body.done()]); }
  blocks.push([ASE_GROUP_END, new Uint8Array(0)]);
  const out = new Bytes().ascii('ASEF').u16be(1).u16be(0).u32be(blocks.length);
  for (const [type, body] of blocks) out.u16be(type).u32be(body.length).raw(body);
  return out.done();
}

// ---------------------------------------------------------------- Procreate (.swatches): a stored zip holding Swatches.json
/** HSB (HSV): hue, saturation, brightness, each 0..1. */
export function hexToHsb(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map((x) => x / 255); const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  let h = 0; if (d) { h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; if (h < 0) h += 1; }
  return [h, max ? d / max : 0, max];
}
const round4 = (x: number) => Math.round(x * 1e4) / 1e4;
export function procreateJsonOf(kit: Pick<BrandKit, 'name' | 'colors'>): string {
  const swatches = swatchesOf(kit).slice(0, 30).map((c) => { const [h, s, b] = hexToHsb(c.hex); return { hue: round4(h), saturation: round4(s), brightness: round4(b), alpha: 1, colorSpace: 0 }; });
  return JSON.stringify([{ name: kitTitle(kit), swatches }]);
}
let CRC: Uint32Array | null = null;
export function crc32(b: Uint8Array): number {
  if (!CRC) { CRC = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; } }
  let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0;
}
/** A zip with stored (uncompressed) files: local headers, the central directory and its end record. Dates are 1980-01-01 so the bytes don't change between runs. */
export function storedZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const out = new Bytes(); const central = new Bytes(); const TIME = 0, DATE = (0 << 9) | (1 << 5) | 1;
  for (const f of files) {
    const name = utf8(f.name); const crc = crc32(f.data); const at = out.length;
    out.u32le(0x04034b50).u16le(20).u16le(0x0800 /* UTF-8 names */).u16le(0).u16le(TIME).u16le(DATE).u32le(crc).u32le(f.data.length).u32le(f.data.length).u16le(name.length).u16le(0).raw(name).raw(f.data);
    central.u32le(0x02014b50).u16le(20).u16le(20).u16le(0x0800).u16le(0).u16le(TIME).u16le(DATE).u32le(crc).u32le(f.data.length).u32le(f.data.length).u16le(name.length).u16le(0).u16le(0).u16le(0).u16le(0).u32le(0).u32le(at).raw(name);
  }
  const cd = central.done(); const cdAt = out.length; out.raw(cd);
  out.u32le(0x06054b50).u16le(0).u16le(0).u16le(files.length).u16le(files.length).u32le(cd.length).u32le(cdAt).u16le(0);
  return out.done();
}
export const procreateOf = (kit: Pick<BrandKit, 'name' | 'colors'>): Uint8Array => storedZip([{ name: 'Swatches.json', data: utf8(procreateJsonOf(kit)) }]);

// ---------------------------------------------------------------- GIMP palette (.gpl)
export function gplOf(kit: Pick<BrandKit, 'name' | 'colors'>): string {
  const sw = swatchesOf(kit); const pad = (n: number) => String(n).padStart(3, ' ');
  const lines = ['GIMP Palette', `Name: ${kitTitle(kit)}`, `Columns: ${Math.max(1, Math.min(sw.length, 8))}`, '# Made with Imagination Is All You Need',
    ...sw.map((c) => { const [r, g, b] = hexToRgb(c.hex); return `${pad(r)} ${pad(g)} ${pad(b)}\t${c.name.replace(/[\t\r\n]+/g, ' ')}`; })];
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------- Sketch Palettes plugin (.sketchpalette, v2)
export function sketchPaletteOf(kit: Pick<BrandKit, 'name' | 'colors'>): string {
  const colors = swatchesOf(kit).map((c) => { const [r, g, b] = hexToRgb(c.hex); return { name: c.name, red: round4(r / 255), green: round4(g / 255), blue: round4(b / 255), alpha: 1 }; });
  return JSON.stringify({ compatibleVersion: '2.0', pluginVersion: '2.22', colors }, null, 2) + '\n';
}

/** The file for one palette kind, named after the kit ("acme.ase", "acme.swatches", …). */
export function paletteFileOf(kit: Pick<BrandKit, 'name' | 'colors'>, kind: PaletteKind): PaletteFile {
  const slug = kitSlug(kit.name);
  if (kind === 'ase') return { data: aseOf(kit), name: `${slug}.ase`, mime: 'application/octet-stream' };
  if (kind === 'procreate') return { data: procreateOf(kit), name: `${slug}.swatches`, mime: 'application/zip' };
  if (kind === 'gpl') return { data: gplOf(kit), name: `${slug}.gpl`, mime: 'text/plain' };
  return { data: sketchPaletteOf(kit), name: `${slug}.sketchpalette`, mime: 'application/json' };
}
