/** Files in a submit body must still be readable when the request is sent.
 *
 *  The browser reads a File / Blob in a FormData lazily, while the request streams. When that read fails (a draft file restored from
 *  IndexedDB whose stored copy the browser dropped when the draft was saved again, a picked file that was moved, edited or deleted on
 *  disk since), the browser sends the headers and then cuts the connection: the API logs `aborted` / ECONNRESET, fetch rejects with a
 *  plain TypeError, the module fetch takes it for a network drop, re-sends the same dead body and ends on "Can't reach the server",
 *  however often the user presses Generate (2026-10-27, Video → LTX-2.5 Pro with a start image).
 *
 *  `probeFormFiles` reads one byte at each end of every file before anything is sent, so a dead file is a clear, inline
 *  "attach it again" error instead. `materializeFile` copies a stored file into memory, so it no longer depends on where it was stored. */

export const FILE_UNREADABLE = 'file_unreadable';

const LABELS: Record<string, string> = { image: 'start image', lastFrame: 'end image', endImage: 'end image', video: 'video', audio: 'audio', refs: 'reference image', mask: 'mask', presenterImage: 'presenter image', speech: 'speech audio', voiceAudio: 'voice sample' };
export const unreadableMessage = (field: string, name: string) =>
  `Your ${LABELS[field] ?? 'file'}${name ? ` (${name})` : ''} can’t be read any more: it was moved, changed or cleared since you added it. Remove it and add it again. Nothing was sent or charged.`;

export const unreadableError = (field: string, name: string) => { const message = unreadableMessage(field, name);
  return Object.assign(new Error(message), { code: FILE_UNREADABLE, errorType: 'validation', status: 0, calm: true, charged: false, field, issues: [{ code: FILE_UNREADABLE, field, message }] }); };

type BlobLike = { size: number; name?: string; slice: (a?: number, b?: number) => { arrayBuffer: () => Promise<ArrayBuffer> } };
/** True when the first and last byte of the file can be read now (an empty file is readable). */
export async function blobReadable(b: BlobLike): Promise<boolean> {
  if (!b.size) return true;
  try { await b.slice(0, 1).arrayBuffer(); if (b.size > 1) await b.slice(b.size - 1, b.size).arrayBuffer(); return true; } catch { return false; }
}

/** Throws an `unreadableError` (code file_unreadable, field = the form field) for the first file in `fd` that can't be read. */
export async function probeFormFiles(fd: { forEach: (cb: (v: any, k: string) => void) => void }): Promise<void> {
  const files: [string, BlobLike][] = []; fd.forEach((v, k) => { if (v && typeof v !== 'string' && typeof v.slice === 'function') files.push([k, v]); });
  for (const [k, f] of files) if (!(await blobReadable(f))) throw unreadableError(k, String(f.name ?? ''));
}

/** A copy of `blob` held in memory as a File (name, type, lastModified kept); null when it can't be read. */
export async function materializeFile(blob: Blob, name: string, type: string, lastModified?: number): Promise<File | null> {
  try { const buf = await blob.arrayBuffer(); if (buf.byteLength !== blob.size) return null; return new File([buf], name, { type, lastModified: lastModified || Date.now() }); } catch { return null; }
}
