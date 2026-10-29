/** Minimal store-only (no compression) ZIP writer: media outputs are already compressed. No dependency. */
import { crc32 } from 'node:zlib';
export function makeZip(files: { name: string; data: Buffer }[]): Buffer {
  const parts: Buffer[] = []; const central: Buffer[] = []; let off = 0;
  const dos = (() => { const d = new Date(); return { t: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), d: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() }; })();
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8'); const crc = crc32(f.data) >>> 0; const n = f.data.length;
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(0, 8);
    lh.writeUInt16LE(dos.t, 10); lh.writeUInt16LE(dos.d, 12); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(n, 18); lh.writeUInt32LE(n, 22); lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    parts.push(lh, name, f.data);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(0, 10);
    ch.writeUInt16LE(dos.t, 12); ch.writeUInt16LE(dos.d, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(n, 20); ch.writeUInt32LE(n, 24); ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(off, 42); central.push(ch, name);
    off += 30 + name.length + n;
  }
  const cd = Buffer.concat(central); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, end]);
}
