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
 * Unused objects and switched-off parts are taken out, so ComfyUI only loads what this job needs.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { WORKFLOWS_DIR } from '../config.js';
import { LAYERS_MAX_OBJECTS, LAYERS_WORKFLOW } from './constants.js';

export type FileRef = { __file: string };
export interface GraphJob { source: string; objects: string[]; edges: boolean; depth: boolean }
/** Output nodes of the analysis graph, in the order the plan reads them back. */
export const maskNode = (k: number) => String(202 + 10 * k);
export const EDGES_NODE = '303';
export const DEPTH_NODE = '403';
/** Depth Anything 3 on Comfy Cloud: the template's own default (on your computer: Small, 0.14 GB). */
export const DA3_CLOUD_MODEL = 'depth_anything_3_mono_large.safetensors';

const load = () => JSON.parse(readFileSync(path.join(WORKFLOWS_DIR, LAYERS_WORKFLOW), 'utf8')) as Record<string, any>;
const drop = (g: Record<string, any>, ids: string[]) => { for (const id of ids) delete g[id]; };
const detectNodes = (k: number) => [100, 101, 102].map((n) => String(n + 10 * k));
const trackNodes = (k: number) => [200, 201, 202].map((n) => String(n + 10 * k));

export function layersGraph(j: GraphJob): Record<string, any> {
  const n = j.objects.length;
  if (n < 1 || n > LAYERS_MAX_OBJECTS) throw new Error(`Layers needs 1–${LAYERS_MAX_OBJECTS} objects`);
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
  return g;
}

/** The output nodes this graph saves: the object mattes first (chip order), then edges, then depth. */
export function outputNodes(j: Pick<GraphJob, 'objects' | 'edges' | 'depth'>): { node: string; role: string }[] {
  const out = j.objects.map((_, k) => ({ node: maskNode(k), role: `mask${k}` }));
  if (j.edges) out.push({ node: EDGES_NODE, role: 'edges' });
  if (j.depth) out.push({ node: DEPTH_NODE, role: 'depth' });
  return out;
}
