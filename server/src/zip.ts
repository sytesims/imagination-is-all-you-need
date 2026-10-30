/** Minimal store-only (no compression) ZIP writer: media outputs are already compressed. No dependency; the writer is shared with the web app. */
import { crc32 } from 'node:zlib';
import { zipStore } from './shared/zipStore.js';
export function makeZip(files: { name: string; data: Buffer }[]): Buffer {
  const z = zipStore(files, (d) => crc32(d)); return Buffer.from(z.buffer, z.byteOffset, z.length);
}
