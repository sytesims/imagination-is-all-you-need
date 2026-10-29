/** A16: files brought in by a ?fromJob hand-off are tagged here. If the slot still holds that exact file at submit,
 *  createJob sends fromJob + output (+ as=ref) instead of re-uploading it, so the server links the new job (parentId → "Made from"). */
type Tag = { fromJob: string; output: string };
const tags = new Map<string, Tag>();
const keyOf = (f: File) => `${f.name}|${f.size}|${f.lastModified}|${f.type}`;
export const tagHandoff = (f: File, t: Tag) => { tags.set(keyOf(f), t); };
/** The hand-off a file came from (a picture handed over from Image shows "From your image"), or null. */
export const handoffOf = (f: File | null | undefined): Tag | null => (f ? tags.get(keyOf(f)) ?? null : null);
/** Fields the server can fill from fromJob (index.ts): video → video; image → image, or refs with as=ref. */
const SWAPPABLE = new Set(['video', 'image', 'refs']);
export function applyHandoff(fd: FormData): Tag | null {
  if (fd.has('fromJob')) return null;
  for (const [k, v] of [...fd.entries()]) {
    if (!SWAPPABLE.has(k) || !(v instanceof File)) continue;
    const t = tags.get(keyOf(v)); if (!t) continue;
    const rest = fd.getAll(k).filter(x => !(x instanceof File && keyOf(x) === keyOf(v))); fd.delete(k); rest.forEach(x => fd.append(k, x as any));
    fd.append('fromJob', t.fromJob); fd.append('output', t.output); if (k === 'refs') fd.append('as', 'ref');
    return t; // the server takes one fromJob per job
  }
  return null;
}
