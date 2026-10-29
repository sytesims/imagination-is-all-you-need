/**
 * Media picker hand-off (2026-10-25). A file picked from the library (an upload or a generation) reaches its slot as a normal File, so
 * previews, trims and checks work unchanged; it is tagged with the library URL it came from. At submit (api.createJob) a slot that still
 * holds that exact file sends `@file:<field>` = /files/<name> instead of the bytes: no re-upload, and the server links the job to the same
 * copy on disk (server mediaStore.ts checks it is the user's own upload or a job file). Other endpoints just upload the bytes, which the
 * server stores once by content. Same tagging idea as handoffFiles.ts (A16).
 */
import { mediaToFile } from './urlFile';

const tags = new Map<string, string>();
const keyOf = (f: File) => `${f.name}|${f.size}|${f.lastModified}|${f.type}`;
export const libraryUrlOf = (f: File): string | null => tags.get(keyOf(f)) ?? null;
const ownFile = (u: string) => /^\/files\/[^?#]+$/.test(u) && !u.includes('..');

/** A library item as a File for a slot, tagged with its URL when its bytes are unchanged (images redrawn to PNG are sent as bytes). */
export async function libraryFile(url: string, kind: 'image' | 'video' | 'audio', name?: string): Promise<File> {
  const f = await mediaToFile(url, kind, name);
  const ext = (url.split('?')[0].split('.').pop() ?? '').toLowerCase();
  const same = kind !== 'image' || (f.type === 'image/png' && ext === 'png') || (f.type === 'image/jpeg' && /^jpe?g$/.test(ext));
  if (same && ownFile(url)) tags.set(keyOf(f), url);
  return f;
}
/** createJob: tagged files → `@file:<field>` text parts, in the same order (the server keeps slot order by arrival). */
export function applyLibraryRefs(fd: FormData): number {
  const all = [...fd.entries()]; let n = 0;
  if (!all.some(([, v]) => v instanceof File && tags.has(keyOf(v)))) return 0;
  for (const k of new Set(all.map(([k]) => k))) fd.delete(k);
  for (const [k, v] of all) {
    const u = v instanceof File ? tags.get(keyOf(v)) : undefined;
    if (u && !k.startsWith('@')) { fd.append(`@file:${k}`, u); n++; } else fd.append(k, v as any);
  }
  return n;
}
