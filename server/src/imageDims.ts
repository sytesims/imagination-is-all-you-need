/**
 * A PNG / JPEG's shown size from its header (2026-10-23, input prep): the submit checks a "fitted" photo's shape without ffprobe.
 * JPEG EXIF orientation 5–8 (rotated a quarter turn) swaps width and height, as browsers draw it. null = not a PNG / JPEG we can read.
 */
import fs from 'node:fs';

export function imageDimsOf(buf: Buffer): { width: number; height: number } | null {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47 && buf.toString('ascii', 12, 16) === 'IHDR') return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2; let orient = 1;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1]; if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if (m === 0xe1 && buf.toString('ascii', i + 4, i + 8) === 'Exif') orient = exifOrientation(buf, i + 10, len - 8) ?? orient;
    if ((m >= 0xc0 && m <= 0xc3) || (m >= 0xc5 && m <= 0xc7) || (m >= 0xc9 && m <= 0xcb) || (m >= 0xcd && m <= 0xcf)) {
      const h = buf.readUInt16BE(i + 5), w = buf.readUInt16BE(i + 7);
      return orient >= 5 && orient <= 8 ? { width: h, height: w } : { width: w, height: h };
    }
    i += 2 + len;
  }
  return null;
}
function exifOrientation(b: Buffer, start: number, len: number): number | null {
  try {
    const le = b.toString('ascii', start, start + 2) === 'II'; const u16 = (o: number) => (le ? b.readUInt16LE(o) : b.readUInt16BE(o)); const u32 = (o: number) => (le ? b.readUInt32LE(o) : b.readUInt32BE(o));
    const ifd = start + u32(start + 4); const n = u16(ifd);
    for (let k = 0; k < n; k++) { const e = ifd + 2 + k * 12; if (e + 12 > start + len) break; if (u16(e) === 0x0112) return u16(e + 8); }
  } catch { /* a short or odd EXIF block */ }
  return null;
}
/** Reads the first 256 KB (enough for any header, EXIF included). */
export function imageDimsOfFile(file: string): { width: number; height: number } | null {
  let fd: number | null = null;
  try { fd = fs.openSync(file, 'r'); const b = Buffer.alloc(256 * 1024); const n = fs.readSync(fd, b, 0, b.length, 0); return imageDimsOf(b.subarray(0, n)); } catch { return null; } finally { if (fd != null) fs.closeSync(fd); }
}
