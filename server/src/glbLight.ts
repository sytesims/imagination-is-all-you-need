/**
 * A lighter copy of a big GLB for Direct a Shot (2026-11-03). Direct a Shot loads models up to MODEL_MAX_BYTES (shared/previzModels.ts): a
 * dense model slows the open city down. Image to 3D results are often heavier than that (a Tripo 3.1 result: 1.5 M triangles, 41 MB), so a
 * model over the cap gets a light copy, made once next to it (/files/<name>-light.glb) and reused; the original is never touched.
 *  - Textures larger than TEX_MAX px on a side are scaled down with ffmpeg (already needed for media), same format.
 *  - Meshes are simplified with meshoptimizer (MIT, github.com/zeux/meshoptimizer) to at most TRI_BUDGET triangles and a byte budget;
 *    every vertex attribute (UVs, colours, skin joints and weights, morph targets) is carried over, so rigs and animations keep working.
 *  - Read and written with glTF Transform (MIT, gltf-transform.dev); every extension it knows is kept.
 * Pure of HTTP: routes3d.ts serves it as POST /api/3d/light.
 */
import { spawn } from './security/childProcess.js';
import { stat, readFile, writeFile, rename } from 'node:fs/promises';
import { NodeIO, type Document, type Primitive, Accessor } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { MODEL_MAX_BYTES, MODEL_SOURCE_MAX_BYTES } from './shared/previzModels.js';

/** the most triangles a light copy keeps (four placed models stay smooth in the city) */
export const TRI_BUDGET = 400_000;
/** the longest side a light copy's textures keep (px) */
export const TEX_MAX = 2048;
export class LightError extends Error { constructor(msg: string, readonly code: 'too_large' | 'bad_glb' | 'cant_lighten') { super(msg); } }

let io: Promise<NodeIO> | null = null;
const getIO = () => (io ??= (async () => { await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder }); })());

/** Scale an image (PNG / JPEG / WebP bytes) so its longest side is `max`, same format, with ffmpeg. Null when it can't. */
export function scaleImage(img: Uint8Array, mime: string, max: number): Promise<Uint8Array | null> {
  const fmt = mime === 'image/png' ? ['-c:v', 'png', '-f', 'image2pipe'] : mime === 'image/jpeg' ? ['-c:v', 'mjpeg', '-q:v', '3', '-f', 'image2pipe'] : mime === 'image/webp' ? ['-c:v', 'libwebp', '-quality', '88', '-f', 'image2pipe'] : null;
  if (!fmt) return Promise.resolve(null);
  return new Promise((res) => {
    let c; try { c = spawn('ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-vf', `scale='min(${max},iw)':'min(${max},ih)':force_original_aspect_ratio=decrease:flags=lanczos`, '-frames:v', '1', ...fmt, 'pipe:1'], { stdio: ['pipe', 'pipe', 'ignore'] }); } catch { res(null); return; }
    const out: Buffer[] = []; c.stdout.on('data', (d: Buffer) => out.push(d)); c.on('error', () => res(null));
    c.on('close', (code) => res(code === 0 && out.length ? new Uint8Array(Buffer.concat(out)) : null)); c.stdin.on('error', () => undefined); c.stdin.end(Buffer.from(img));
  });
}

const trisOf = (p: Primitive) => p.getMode() === 4 ? Math.floor((p.getIndices()?.getCount() ?? p.getAttribute('POSITION')?.getCount() ?? 0) / 3) : 0;
export const triangleCount = (doc: Document) => doc.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + trisOf(p), 0), 0);

/** A copy of `a` holding only the vertices in `keep` (old indices, in new order). */
function pick(doc: Document, a: Accessor, keep: Uint32Array): Accessor {
  const src = a.getArray()!; const n = a.getElementSize(); const Ctor = src.constructor as new (len: number) => typeof src;
  const out = new Ctor(keep.length * n); for (let i = 0; i < keep.length; i++) for (let k = 0; k < n; k++) out[i * n + k] = src[keep[i] * n + k];
  return doc.createAccessor(a.getName()).setType(a.getType()).setArray(out).setNormalized(a.getNormalized()).setBuffer(a.getBuffer());
}

/** Simplify one triangle primitive to about `ratio` of its triangles, then drop the vertices it no longer uses. */
function simplifyPrimitive(doc: Document, p: Primitive, ratio: number, error: number) {
  const posA = p.getAttribute('POSITION'); if (!posA || p.getMode() !== 4) return;
  const count = posA.getCount(); const idxA = p.getIndices();
  const idx = idxA ? Uint32Array.from(idxA.getArray()!) : Uint32Array.from({ length: count - (count % 3) }, (_, i) => i);
  const target = Math.max(3, Math.floor((idx.length * ratio) / 3) * 3); if (target >= idx.length) return;
  const pos = new Float32Array(count * 3); const el: number[] = []; for (let i = 0; i < count; i++) { posA.getElement(i, el); pos[i * 3] = el[0]; pos[i * 3 + 1] = el[1]; pos[i * 3 + 2] = el[2]; }
  const [out] = MeshoptSimplifier.simplify(idx, pos, 3, target, error, []); if (!out.length) return;
  /* compact: the used vertices, in first-use order */
  const remap = new Int32Array(count).fill(-1); const keep: number[] = []; const next = new Uint32Array(out.length);
  for (let i = 0; i < out.length; i++) { const v = out[i]; if (remap[v] < 0) { remap[v] = keep.length; keep.push(v); } next[i] = remap[v]; }
  const kept = Uint32Array.from(keep); const old = new Set<Accessor>([posA, ...(idxA ? [idxA] : [])]);
  for (const sem of p.listSemantics()) { const a = p.getAttribute(sem)!; old.add(a); p.setAttribute(sem, pick(doc, a, kept)); }
  for (const t of p.listTargets()) for (const sem of t.listSemantics()) { const a = t.getAttribute(sem)!; old.add(a); t.setAttribute(sem, pick(doc, a, kept)); }
  const buf = (idxA ?? posA).getBuffer();
  p.setIndices(doc.createAccessor().setType('SCALAR').setArray(kept.length < 65536 ? Uint16Array.from(next) : next).setBuffer(buf));
  for (const a of old) if (a.listParents().every((x) => x === doc.getRoot())) a.dispose();
}

/** Make the light copy of a GLB's bytes. Throws LightError with a plain reason. */
export async function lightenGlb(input: Uint8Array, cap = MODEL_MAX_BYTES): Promise<{ glb: Uint8Array; trisBefore: number; trisAfter: number }> {
  const io = await getIO(); let doc: Document;
  try { doc = await io.readBinary(input); } catch (e) { throw new LightError(`That GLB could not be read${e instanceof Error && e.message ? ` (${e.message.slice(0, 80)})` : ''}.`, 'bad_glb'); }
  if (!doc.getRoot().listMeshes().length) throw new LightError('That GLB has no meshes: there is nothing to show.', 'bad_glb');
  /* textures: no side over TEX_MAX */
  for (const t of doc.getRoot().listTextures()) { const size = t.getSize(); const img = t.getImage(); if (!img || !size || Math.max(...size) <= TEX_MAX) continue;
    const small = await scaleImage(img, t.getMimeType(), TEX_MAX); if (small && small.length) t.setImage(small); }
  const trisBefore = triangleCount(doc); const write = async () => io.writeBinary(doc);
  let glb = await write(); const aim = cap * 0.85;
  if (glb.byteLength <= cap && trisBefore <= TRI_BUDGET) return { glb, trisBefore, trisAfter: trisBefore };
  /* meshes: the triangle budget and the byte budget (images stay as they are now) */
  const imgBytes = doc.getRoot().listTextures().reduce((n, t) => n + (t.getImage()?.byteLength ?? 0), 0); const geo = Math.max(1, glb.byteLength - imgBytes);
  if (imgBytes >= aim) throw new LightError('That model’s pictures are too big even at 2K. Make a copy with fewer or smaller textures and try again.', 'cant_lighten');
  let ratio = Math.min(1, TRI_BUDGET / Math.max(1, trisBefore), (aim - imgBytes) / geo); let error = 0.02; const prims = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives());
  for (let round = 0; round < 4; round++) {
    for (const p of prims) simplifyPrimitive(doc, p, ratio, error);
    glb = await write(); const tris = triangleCount(doc);
    if (glb.byteLength <= cap && tris <= TRI_BUDGET * 1.1) return { glb, trisBefore, trisAfter: tris };
    ratio = 0.6; error *= 3; /* the simplifier stopped short (seams, error bound): allow it more on each pass */
  }
  throw new LightError('That model is too detailed to make a light enough copy. Make a copy with fewer faces and try again.', 'cant_lighten');
}

/** where a model's light copy lives: <name>-light.glb beside it */
export const lightPathOf = (file: string) => file.replace(/\.glb$/i, '-light.glb');
const busy = new Map<string, Promise<{ file: string; bytes: number; reused: boolean }>>();
/** The light copy of a GLB on disk: reused when it is newer than the original, else made once (concurrent asks share one run). */
export function lightCopyOf(file: string): Promise<{ file: string; bytes: number; reused: boolean }> {
  let p = busy.get(file); if (p) return p;
  p = (async () => {
    const st = await stat(file).catch(() => null); if (!st) throw new LightError('That model’s file is no longer on this computer.', 'bad_glb');
    if (st.size > MODEL_SOURCE_MAX_BYTES) throw new LightError(`That model is ${Math.round(st.size / 1048576)} MB: the largest Direct a Shot can lighten is ${Math.round(MODEL_SOURCE_MAX_BYTES / 1048576)} MB. Make a lighter copy and try again.`, 'too_large');
    const out = lightPathOf(file); const have = await stat(out).catch(() => null);
    if (have && have.mtimeMs >= st.mtimeMs && have.size > 0 && have.size <= MODEL_MAX_BYTES) return { file: out, bytes: have.size, reused: true };
    const { glb } = await lightenGlb(new Uint8Array(await readFile(file)));
    const tmp = `${out}.${process.pid}.tmp`; await writeFile(tmp, glb); await rename(tmp, out);
    return { file: out, bytes: glb.byteLength, reused: false };
  })().finally(() => busy.delete(file));
  busy.set(file, p); return p;
}
