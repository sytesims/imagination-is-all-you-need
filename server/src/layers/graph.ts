/**
 * Layers: the analysis graph (workflows/layers-split-api.json, our own, core ComfyUI nodes only), patched for one job. Proven chains only
 * (2026-11-07: a text-only SAM3_VideoTrack graph, which no proven graph uses, never finished on Comfy Cloud):
 *  - SAM 3.1: exactly the SAM part of Swap Two People (workflows/cloud/h3-two-person-swap-api.json, done on Comfy Cloud; nodes 42 → 143/243 →
 *    160/161 → 162 → 163 → 170 → 148/248), with one name per object instead of "person" + a half-frame: frame 0 → one SAM3_Detect per name
 *    (threshold 0.35, refine 2) → MaskToImage → BatchImagesNode → ImageToMask → ONE SAM3_VideoTrack seeded with those masks (no text detection,
 *    max_objects = the number of names) → SAM3_TrackToMask i. Index i is always name i, so names never swap. (The one-object form of this chain
 *    ran on Comfy Cloud on 2026-11-07: "woman", 48 frames, about 18 s.)
 *  - BiRefNet: the official template utility_birefnet_remove_background's chain (LoadBackgroundRemovalModel → RemoveBackground) on every frame;
 *    its mask is multiplied with each object's grown matte on this computer (masks.ts), so it only softens that object's edge.
 *  - Depth Anything 3: the official template utility_depth_anything3_video_depth_estimation's chain (DA3Inference 504, lower_bound_resize, mono →
 *    DA3Render depth, v2_style). Small on your computer; Mono-Large on Comfy Cloud (plan.ts). Frames saved as PNG; depth.ts stretches them over the clip.
 * In 2-second pieces (owner, 2026-11-07, from the Comfy Cloud test: 48 frames tracked in about 18 s; 120 frames in one pass ran past 73 s and
 * was stopped): the SAM part is repeated per piece of 48 frames (ImageFromBatch batch_index / length), each piece finding every name again on its
 * own first frame, pieces overlapping by 4 frames. Name i is track i in every piece; stitch.ts joins the pieces with a crossfade in the overlap.
 * BiRefNet and depth have no memory, so they run once over the whole clip. SAM 3.1 loads once for every piece (one graph, one job).
 * Unused objects and switched-off parts are taken out, so ComfyUI only loads what this job needs.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { WORKFLOWS_DIR } from '../config.js';
import { LAYERS_MAX_OBJECTS, LAYERS_WORKFLOW } from './constants.js';

export type FileRef = { __file: string };
export interface GraphJob { source: string; objects: string[]; edges: boolean; depth: boolean; /** frames of the clip (the pieces follow it) */ frames: number }
/** A piece: its first frame in the clip and its length. */
export type Piece = { start: number; length: number };
export const PIECE_FRAMES = 48;
export const PIECE_OVERLAP = 4;
/** The pieces of a clip: 48 frames each, every next one starting 4 frames before the last one ends; the last one ends with the clip.
 *  A tail that would sit wholly inside the overlap is left out (the piece before covers it). */
export function pieces(frames: number, size = PIECE_FRAMES, overlap = PIECE_OVERLAP): Piece[] {
  const n = Math.max(1, Math.floor(frames)); const out: Piece[] = []; const stride = size - overlap;
  for (let start = 0; ; start += stride) {
    const length = Math.min(size, n - start); out.push({ start, length });
    if (start + size >= n) break;
    if (n - (start + stride) <= overlap) break;
  }
  return out;
}
/** Output nodes of the analysis graph, in the order the plan reads them back. */
/** Piece p's node ids: the first piece keeps the file's ids, piece p adds 1000 × p. */
const pid = (p: number, id: number | string) => String(p * 1000 + Number(id));
export const maskNode = (k: number, p = 0) => pid(p, 202 + 10 * k);
export const EDGES_NODE = '303';
export const DEPTH_NODE = '403';
/** Depth Anything 3 on Comfy Cloud: the template's own default (on your computer: Small, 0.14 GB). */
export const DA3_CLOUD_MODEL = 'depth_anything_3_mono_large.safetensors';

const load = () => JSON.parse(readFileSync(path.join(WORKFLOWS_DIR, LAYERS_WORKFLOW), 'utf8')) as Record<string, any>;
const drop = (g: Record<string, any>, ids: string[]) => { for (const id of ids) delete g[id]; };
const detectNodes = (k: number) => [100, 101, 102].map((n) => String(n + 10 * k));
const trackNodes = (k: number) => [200, 201, 202].map((n) => String(n + 10 * k));

/** The SAM nodes of one piece in the file (frames, first frame, the detect / batch / track / mask chains). */
const SAM_PIECE = ['5', '4', ...[0, 1, 2, 3].flatMap((k) => [...detectNodes(k), ...trackNodes(k)]), '150', '151', '152'];
const isLink = (v: unknown): v is [string, number] => Array.isArray(v) && v.length === 2 && typeof v[0] === 'string';

export function layersGraph(j: GraphJob): Record<string, any> {
  const n = j.objects.length;
  if (n < 1 || n > LAYERS_MAX_OBJECTS) throw new Error(`Video to layers needs 1–${LAYERS_MAX_OBJECTS} objects`);
  const g = load();
  g['1'].inputs.file = { __file: j.source } satisfies FileRef;
  for (let k = 0; k < LAYERS_MAX_OBJECTS; k++) {
    if (k < n) { g[String(100 + 10 * k)].inputs.text = j.objects[k]; continue; }
    drop(g, [...detectNodes(k), ...trackNodes(k)]);
    delete g['150'].inputs[`images.image${k}`];
  }
  g['152'].inputs.max_objects = n;
  if (!j.edges) drop(g, ['300', '301', '302', EDGES_NODE]);
  if (!j.depth) drop(g, ['400', '401', '402', DEPTH_NODE]);
  // one copy of the SAM part per piece; links inside the piece move with it, links to the shared nodes (video, SAM model) stay
  const ps = pieces(j.frames); const tmpl = Object.fromEntries(SAM_PIECE.filter((id) => g[id]).map((id) => [id, structuredClone(g[id])]));
  for (const [p, pc] of ps.entries()) {
    for (const [id, node] of Object.entries<any>(tmpl)) {
      const c = p === 0 ? g[id] : structuredClone(node);
      for (const [key, v] of Object.entries<any>(c.inputs)) if (isLink(v) && tmpl[v[0]]) c.inputs[key] = [pid(p, v[0]), v[1]];
      if (id === '5') Object.assign(c.inputs, { batch_index: pc.start, length: pc.length });
      if (c.class_type === 'SaveImage') c.inputs.filename_prefix = String(c.inputs.filename_prefix).replace(/_p\d+$/, `_p${p}`);
      g[pid(p, id)] = c;
    }
  }
  return g;
}

/** The output nodes this graph saves: the object mattes per piece (piece by piece, chip order), then edges, then depth. */
export function outputNodes(j: Pick<GraphJob, 'objects' | 'edges' | 'depth' | 'frames'>): { node: string; role: string }[] {
  const out = pieces(j.frames).flatMap((_, p) => j.objects.map((__, k) => ({ node: maskNode(k, p), role: `mask${k}p${p}` })));
  if (j.edges) out.push({ node: EDGES_NODE, role: 'edges' });
  if (j.depth) out.push({ node: DEPTH_NODE, role: 'depth' });
  return out;
}
