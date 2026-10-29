/**
 * Clean copies of media for downloads, share ZIPs and /s/:token.
 * ComfyUI PNGs carry a tEXt "prompt" chunk with the whole graph and prompt; cameras and editors add EXIF/XMP. The originals on disk are
 * never changed: images are cleaned in memory, video and audio are stream-copied by ffmpeg into <DATA_DIR>/clean-cache (refreshed when the
 * original changes).
 *  PNG   drop tEXt, iTXt, zTXt, eXIf (pure Buffer work, every other chunk byte for byte)
 *  JPEG  drop APP1 (EXIF, XMP), APP13 (IPTC) and COM segments
 *  WebP  drop the EXIF and XMP chunks (and their VP8X flags)
 *  MP4/MOV/WebM/audio  ffmpeg -c copy -map_metadata -1 -map_chapters -1 (no re-encode; cover art dropped)
 */
import { existsSync, mkdirSync, readFileSync, statSync, renameSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DATA_DIR } from './config.js';
import { runFfmpeg } from './ffmpeg.js';

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_DROP = new Set(['tEXt', 'iTXt', 'zTXt', 'eXIf']);
export const isPng = (b: Buffer) => b.length > 8 && b.subarray(0, 8).equals(PNG_SIG);
export const isJpeg = (b: Buffer) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8;
export const isWebp = (b: Buffer) => b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP';

/** PNG without its text and EXIF chunks. A malformed file is returned unchanged. */
export function cleanPng(b: Buffer): Buffer {
  if (!isPng(b)) return b; const parts: Buffer[] = [PNG_SIG]; let p = 8;
  while (p + 12 <= b.length) {
    const len = b.readUInt32BE(p); const type = b.toString('latin1', p + 4, p + 8); const end = p + 12 + len; if (end > b.length) return b;
    if (!PNG_DROP.has(type)) parts.push(b.subarray(p, end)); p = end; if (type === 'IEND') break;
  }
  return Buffer.concat(parts);
}
/** JPEG without APP1 (EXIF/XMP), APP13 (IPTC) and comment segments. Everything from SOS on is copied as is. */
export function cleanJpeg(b: Buffer): Buffer {
  if (!isJpeg(b)) return b; const parts: Buffer[] = [b.subarray(0, 2)]; let p = 2;
  while (p + 4 <= b.length) {
    if (b[p] !== 0xff) return b; const m = b[p + 1];
    if (m === 0xff) { p++; continue; } // fill byte
    if (m === 0xd9) { parts.push(b.subarray(p)); return Buffer.concat(parts); }
    if ((m >= 0xd0 && m <= 0xd7) || m === 0x01) { parts.push(b.subarray(p, p + 2)); p += 2; continue; }
    const len = b.readUInt16BE(p + 2); const end = p + 2 + len; if (end > b.length) return b;
    if (m === 0xda) { parts.push(b.subarray(p)); return Buffer.concat(parts); } // SOS: entropy data follows
    if (m !== 0xe1 && m !== 0xed && m !== 0xfe) parts.push(b.subarray(p, end));
    p = end;
  }
  return Buffer.concat(parts);
}
/** WebP without EXIF/XMP chunks; the VP8X flags and RIFF size are fixed up. */
export function cleanWebp(b: Buffer): Buffer {
  if (!isWebp(b)) return b; const parts: Buffer[] = []; let p = 12;
  while (p + 8 <= b.length) {
    const id = b.toString('latin1', p, p + 4); const len = b.readUInt32LE(p + 4); const end = p + 8 + len + (len & 1); if (p + 8 + len > b.length) return b;
    if (id === 'VP8X') { const c = Buffer.from(b.subarray(p, Math.min(end, b.length))); c[8] &= ~(0x08 | 0x04); parts.push(c); }
    else if (id !== 'EXIF' && id !== 'XMP ') parts.push(b.subarray(p, Math.min(end, b.length)));
    p = end;
  }
  const body = Buffer.concat(parts); const head = Buffer.alloc(12); head.write('RIFF', 0, 'latin1'); head.writeUInt32LE(body.length + 4, 4); head.write('WEBP', 8, 'latin1');
  return Buffer.concat([head, body]);
}
/** An image buffer cleaned by its sniffed type (others unchanged). */
export const cleanImage = (b: Buffer) => isPng(b) ? cleanPng(b) : isJpeg(b) ? cleanJpeg(b) : isWebp(b) ? cleanWebp(b) : b;

export const VIDEO_RE = /\.(mp4|mov|m4v|webm|mkv)$/i;
export const AUDIO_RE = /\.(m4a|mp3|wav|ogg|oga|flac|aac|opus)$/i;
export const IMAGE_RE = /\.(png|jpe?g|webp)$/i;
const CACHE = () => path.join(DATA_DIR, 'clean-cache');
const inflight = new Map<string, Promise<string>>();
/** A metadata-free copy of a video or audio file (stream copy; nothing re-encoded). Returns its path, or the original if ffmpeg fails. */
export async function cleanAvFile(src: string): Promise<string> {
  const st = statSync(src); const ext = path.extname(src).toLowerCase();
  const key = createHash('sha1').update(`${path.resolve(src)}|${st.size}|${st.mtimeMs}`).digest('hex').slice(0, 12);
  const out = path.join(CACHE(), `${path.basename(src, ext)}-${key}${ext}`); if (existsSync(out)) return out;
  const running = inflight.get(out); if (running) return running;
  const p = (async () => {
    mkdirSync(CACHE(), { recursive: true }); const tmp = `${out}.part${ext}`;
    const audio = AUDIO_RE.test(src);
    const args = ['-y', '-v', 'error', '-i', src, ...(audio ? ['-map', '0:a'] : ['-map', '0:v?', '-map', '0:a?']), '-c', 'copy', '-map_metadata', '-1', '-map_chapters', '-1', '-fflags', '+bitexact',
      ...(audio ? [] : ['-metadata:s', 'handler_name=', '-metadata:s', 'vendor_id=']), ...(/\.(mp4|mov|m4v|m4a)$/i.test(src) ? ['-movflags', '+faststart'] : []), tmp];
    const code = await runFfmpeg(args);
    if (code !== 0) { try { unlinkSync(tmp); } catch { /* */ } return src; }
    renameSync(tmp, out); return out;
  })().finally(() => inflight.delete(out));
  inflight.set(out, p); return p;
}
/** The clean bytes of a file for download: images in memory, video/audio through the cache, anything else as is. */
export async function cleanFileBytes(file: string): Promise<Buffer> {
  if (IMAGE_RE.test(file)) return cleanImage(readFileSync(file));
  if (VIDEO_RE.test(file) || AUDIO_RE.test(file)) return readFileSync(await cleanAvFile(file));
  return readFileSync(file);
}
/** Path of a /files/ URL inside DATA_DIR (null when it escapes or is missing). */
export function dataFileOf(url: string): string | null {
  const rel = decodeURIComponent(url.replace(/^\/files\//, '').split('?')[0]); if (!rel || rel.includes('\0')) return null;
  const p = path.resolve(DATA_DIR, rel); if (!p.startsWith(DATA_DIR + path.sep) || !existsSync(p) || !statSync(p).isFile()) return null; return p;
}
export { cleanUrl } from './shared/cleanUrl.js';
const TYPES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mkv': 'video/x-matroska',
  '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.flac': 'audio/flac', '.aac': 'audio/aac', '.opus': 'audio/ogg' };
export const mimeOf = (f: string) => TYPES[path.extname(f).toLowerCase()] ?? 'application/octet-stream';

/** GET /files/<name>?clean=1 → the metadata-free copy (Range requests work for video/audio). Without ?clean=1 the static route serves the original. */
export function registerCleanFiles(app: import('fastify').FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return; const u = req.url; if (!u.startsWith('/files/') || !/[?&]clean=1(&|$)/.test(u)) return;
    const file = dataFileOf(u); if (!file) return; // let the static route answer 404
    const type = mimeOf(file); const av = VIDEO_RE.test(file) || AUDIO_RE.test(file);
    const buf = av ? null : await cleanFileBytes(file); const servePath = av ? await cleanAvFile(file) : null;
    reply.header('cache-control', 'private, max-age=60').header('x-clean', '1').header('accept-ranges', 'bytes').type(type);
    const name = new URL(u, 'http://x').searchParams.get('name'); if (name && /^[\w.\-]{1,120}$/.test(name)) reply.header('content-disposition', `attachment; filename="${name}"`);
    if (buf) return reply.send(buf);
    const size = statSync(servePath!).size; const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ''));
    const { createReadStream } = await import('node:fs');
    if (range) { let s = range[1] ? Number(range[1]) : size - Number(range[2]); let e = range[1] && range[2] ? Number(range[2]) : size - 1; if (!range[1]) e = size - 1; s = Math.max(0, s); e = Math.min(size - 1, e);
      if (s > e) return reply.code(416).header('content-range', `bytes */${size}`).send();
      return reply.code(206).header('content-range', `bytes ${s}-${e}/${size}`).header('content-length', String(e - s + 1)).send(req.method === 'HEAD' ? '' : createReadStream(servePath!, { start: s, end: e })); }
    return reply.header('content-length', String(size)).send(req.method === 'HEAD' ? '' : createReadStream(servePath!));
  });
}
