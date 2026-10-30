/**
 * Minimal store-only (no compression) ZIP writer: media is already compressed. Isomorphic, no imports: the API (server/src/zip.ts, with
 * node's fast crc32) and the browser (the Ad layout card's "Export pack") share it.
 */
let TABLE: Uint32Array | null = null;
/** CRC-32 (the ZIP / PNG one). */
export function crc32(data: Uint8Array): number {
  if (!TABLE) { TABLE = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; TABLE[n] = c >>> 0; } }
  let c = 0xffffffff; for (let i = 0; i < data.length; i++) c = TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export function zipStore(files: { name: string; data: Uint8Array }[], crc: (d: Uint8Array) => number = crc32, now = new Date()): Uint8Array {
  const enc = new TextEncoder(); const parts: Uint8Array[] = []; const central: Uint8Array[] = []; let off = 0;
  const t = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1), d = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const head = (size: number, f: (v: DataView) => void) => { const b = new Uint8Array(size); f(new DataView(b.buffer)); return b; };
  for (const f of files) {
    const name = enc.encode(f.name); const sum = crc(f.data) >>> 0; const n = f.data.length;
    parts.push(head(30, (v) => { v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x0800, true); v.setUint16(10, t, true); v.setUint16(12, d, true);
      v.setUint32(14, sum, true); v.setUint32(18, n, true); v.setUint32(22, n, true); v.setUint16(26, name.length, true); }), name, f.data);
    central.push(head(46, (v) => { v.setUint32(0, 0x02014b50, true); v.setUint16(4, 20, true); v.setUint16(6, 20, true); v.setUint16(8, 0x0800, true); v.setUint16(12, t, true); v.setUint16(14, d, true);
      v.setUint32(16, sum, true); v.setUint32(20, n, true); v.setUint32(24, n, true); v.setUint16(28, name.length, true); v.setUint32(42, off, true); }), name);
    off += 30 + name.length + n;
  }
  const cdLen = central.reduce((s, b) => s + b.length, 0);
  const end = head(22, (v) => { v.setUint32(0, 0x06054b50, true); v.setUint16(8, files.length, true); v.setUint16(10, files.length, true); v.setUint32(12, cdLen, true); v.setUint32(16, off, true); });
  const all = [...parts, ...central, end]; const out = new Uint8Array(all.reduce((s, b) => s + b.length, 0)); let p = 0; for (const b of all) { out.set(b, p); p += b.length; }
  return out;
}
