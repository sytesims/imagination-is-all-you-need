/**
 * Layers: a streaming store-only ZIP writer (no compression; ProRes and PNG are already compressed). The export can be hundreds of MB, so files
 * are streamed from disk into the ZIP file one by one with a running CRC, never held in memory. Sizes go in a data descriptor after each file.
 * Limits: under 4 GB in all and 65,535 files (no ZIP64), which a 15 s split stays far below.
 */
import { createReadStream, createWriteStream } from 'node:fs';
import { crc32 } from 'node:zlib';
import { once } from 'node:events';

const FLAGS = 0x0808; // bit 3: sizes in the data descriptor; bit 11: UTF-8 names
function dosTime(d = new Date()) {
  return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
}

export async function writeZip(out: string, files: { name: string; path?: string; data?: Buffer }[]): Promise<number> {
  const ws = createWriteStream(out); let offset = 0; const central: Buffer[] = []; const { time, date } = dosTime();
  const put = async (b: Buffer) => { offset += b.length; if (!ws.write(b)) await once(ws, 'drain'); };
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8'); const start = offset;
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(FLAGS, 6); lh.writeUInt16LE(0, 8);
    lh.writeUInt16LE(time, 10); lh.writeUInt16LE(date, 12); lh.writeUInt16LE(name.length, 26);
    await put(lh); await put(name);
    let crc = 0; let size = 0;
    if (f.data) { crc = crc32(f.data); size = f.data.length; await put(f.data); }
    else for await (const chunk of createReadStream(f.path!)) { const b = chunk as Buffer; crc = crc32(b, crc); size += b.length; await put(b); }
    if (offset > 0xffffffff) throw new Error('The export is over 4 GB');
    const dd = Buffer.alloc(16); dd.writeUInt32LE(0x08074b50, 0); dd.writeUInt32LE(crc >>> 0, 4); dd.writeUInt32LE(size, 8); dd.writeUInt32LE(size, 12); await put(dd);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(FLAGS, 8);
    ch.writeUInt16LE(time, 12); ch.writeUInt16LE(date, 14); ch.writeUInt32LE(crc >>> 0, 16); ch.writeUInt32LE(size, 20); ch.writeUInt32LE(size, 24);
    ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(start, 42); central.push(ch, name);
  }
  const cd = Buffer.concat(central); const cdStart = offset; await put(cd);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(cdStart, 16); await put(end);
  ws.end(); await once(ws, 'finish');
  return offset;
}
