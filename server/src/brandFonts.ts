/**
 * Brand fonts (2026-10-31): font files a brand keeps on this computer (DATA_DIR/brand-fonts/<kit>/), registered by the web app with @font-face.
 *  - sniffFont: is this really a font? Checked by content (TrueType / OpenType table directory, WOFF / WOFF2 header and length), never by name.
 *  - sfntFamily: the family name inside a TTF / OTF file (its name table), so an upload is named like the font, not like the file.
 *  - fetchGoogleFont: the one network use. Looks a Google Font up in the Fontsource catalogue (an open mirror of Google Fonts with each
 *    font's licence) and downloads its Latin regular and bold WOFF2 files once. OPENHIGGSFIELD_FONTS_API points it elsewhere (tests).
 */
import type { FontFormat } from './shared/brandKit.js';

const EXT_FORMAT: Record<string, FontFormat> = { '.ttf': 'truetype', '.otf': 'opentype', '.woff': 'woff', '.woff2': 'woff2' };
export const FONT_MIME: Record<FontFormat, string> = { truetype: 'font/ttf', opentype: 'font/otf', woff: 'font/woff', woff2: 'font/woff2' };

/** The file's real format from its bytes, or null (not a font, damaged, or the extension says something else). TTF and OTF may swap:
 *  both are the same table format, so a CFF font named .ttf still counts as a font. */
export function sniffFont(b: Buffer, ext: string): FontFormat | null {
  const want = EXT_FORMAT[ext.toLowerCase()]; if (!want || b.length < 12) return null;
  const tag = b.subarray(0, 4).toString('latin1');
  if (tag === 'wOFF' || tag === 'wOF2') { const f: FontFormat = tag === 'wOFF' ? 'woff' : 'woff2'; return f === want && b.length >= 44 && b.readUInt32BE(8) === b.length && b.readUInt16BE(12) > 0 ? f : null; }
  const sfnt = b.readUInt32BE(0) === 0x00010000 || tag === 'OTTO' || tag === 'true';
  if (!sfnt || (want !== 'truetype' && want !== 'opentype')) return null;
  const n = b.readUInt16BE(4); if (n < 1 || n > 128 || 12 + n * 16 > b.length) return null;
  for (let i = 0; i < n; i++) { const r = 12 + i * 16; const off = b.readUInt32BE(r + 8), len = b.readUInt32BE(r + 12); if (off + len > b.length || !/^[\x20-\x7e]{4}$/.test(b.subarray(r, r + 4).toString('latin1'))) return null; }
  return tag === 'OTTO' ? 'opentype' : 'truetype';
}

/** The family name in a TTF / OTF name table (typographic family 16, else family 1; Windows UTF-16 first, then Mac Roman). '' when there is none. */
export function sfntFamily(b: Buffer): string {
  try {
    const n = b.readUInt16BE(4); let name = -1;
    for (let i = 0; i < n; i++) { const r = 12 + i * 16; if (b.subarray(r, r + 4).toString('latin1') === 'name') name = b.readUInt32BE(r + 8); }
    if (name < 0) return '';
    const count = b.readUInt16BE(name + 2), strings = name + b.readUInt16BE(name + 4); const found: Record<string, string> = {};
    for (let i = 0; i < count; i++) {
      const r = name + 6 + i * 12; const plat = b.readUInt16BE(r), id = b.readUInt16BE(r + 6), len = b.readUInt16BE(r + 8), off = b.readUInt16BE(r + 10);
      if (id !== 1 && id !== 16) continue; const raw = b.subarray(strings + off, strings + off + len);
      const txt = plat === 3 || plat === 0 ? Buffer.from(raw.subarray(0, len & ~1)).swap16().toString('utf16le') : plat === 1 ? raw.toString('latin1') : '';
      if (txt && !found[`${id}`]) found[`${id}`] = txt;
    }
    return (found['16'] || found['1'] || '').replace(/\s+/g, ' ').trim();
  } catch { return ''; }
}

const API = () => (process.env.OPENHIGGSFIELD_FONTS_API || 'https://api.fontsource.org/v1/fonts').replace(/\/+$/, '');
/** "DM Serif Display" → "dm-serif-display" (the catalogue's id). */
export const fontId = (family: string) => family.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
export class FontFetchError extends Error { constructor(public code: 'offline' | 'not_found' | 'bad_font', message: string) { super(message); } }
const OFFLINE = 'Couldn’t reach Google Fonts. Check your internet connection, or upload the font file instead.';

async function get(url: string, ms: number): Promise<Response> {
  try { return await fetch(url, { signal: AbortSignal.timeout(ms), headers: { accept: 'application/json, font/woff2, */*' } }); }
  catch { throw new FontFetchError('offline', OFFLINE); }
}
/** Only the catalogue's own host and its CDN may serve the files (never an address the answer makes up). */
const fileHostOk = (u: string) => { try { const h = new URL(u); return (h.protocol === 'https:' || h.protocol === 'http:') && (h.host === new URL(API()).host || h.host === 'cdn.jsdelivr.net'); } catch { return false; } };

/** A Google Font by name → its real family name, licence, specimen page and the WOFF2 files for 400 and 700 (the nearest weights it has). */
export async function fetchGoogleFont(family: string, maxBytes: number): Promise<{ family: string; licence: string; sourceUrl: string; files: { weight: number; bytes: Buffer }[] }> {
  const id = fontId(family); if (!id) throw new FontFetchError('not_found', 'Type the name of a Google Font, like “Fraunces”.');
  const r = await get(`${API()}/${encodeURIComponent(id)}`, 15000);
  if (r.status === 404) throw new FontFetchError('not_found', `There’s no Google Font called “${family.trim()}”. Check the spelling on fonts.google.com.`);
  if (!r.ok) throw new FontFetchError('offline', OFFLINE);
  const meta = await r.json().catch(() => null) as any;
  if (!meta || meta.type !== 'google' || typeof meta.family !== 'string' || !meta.variants) throw new FontFetchError('not_found', `There’s no Google Font called “${family.trim()}”.`);
  const weights = Object.keys(meta.variants).map(Number).filter((w) => meta.variants[w]?.normal).sort((a, b) => a - b);
  if (!weights.length) throw new FontFetchError('bad_font', 'That font has no regular style to download.');
  const near = (w: number) => weights.reduce((best, x) => (Math.abs(x - w) < Math.abs(best - w) ? x : best), weights[0]);
  const subset = meta.variants[weights[0]].normal.latin ? 'latin' : String(meta.defSubset ?? Object.keys(meta.variants[weights[0]].normal)[0]);
  const files: { weight: number; bytes: Buffer }[] = [];
  for (const w of [...new Set([near(400), near(700)])]) {
    const url = meta.variants[w]?.normal?.[subset]?.url?.woff2; if (typeof url !== 'string' || !fileHostOk(url)) throw new FontFetchError('bad_font', 'That font couldn’t be downloaded.');
    const f = await get(url, 30000); if (!f.ok) throw new FontFetchError('offline', OFFLINE);
    const bytes = Buffer.from(await f.arrayBuffer()); if (bytes.length > maxBytes || sniffFont(bytes, '.woff2') !== 'woff2') throw new FontFetchError('bad_font', 'That font file didn’t look right, so it wasn’t saved.');
    files.push({ weight: w, bytes });
  }
  return { family: meta.family, licence: String(meta.license || 'OFL-1.1'), sourceUrl: `https://fonts.google.com/specimen/${meta.family.replace(/ /g, '+')}`, files };
}
