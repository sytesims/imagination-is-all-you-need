/**
 * Layers: the analysis graph (workflows/layers-split-api.json, our own, core ComfyUI nodes only), patched for one job. Proven chains only
 * (owner rule, 2026-11-07, after a text-only SAM3_VideoTrack graph hung twice on Comfy Cloud: research DIAGNOSIS.md):
 *  - SAM 3.1, one chain per object, exactly the chain of our working H3 Character Swap Comfy Cloud graph (workflows/cloud/h3-charswap-api.json
 *    nodes 42→43→46→47; the fixed test graph cloud-test 1-sam3-track-api.v2.json): CLIPTextEncode(name) → SAM3_Detect on frame 0 (threshold 0.35,
 *    refine 2) → SAM3_VideoTrack seeded with that mask (max_objects 1, no text detection while tracking) → SAM3_TrackToMask 0 → SaveImage.
 *    One tracker per object, so each layer keeps its own name.
 *  - BiRefNet: the official template utility_birefnet_remove_background's chain (LoadBackgroundRemovalModel → RemoveBackground) on every frame;
 *    we save its mask (the template's cut-out join is done by us) and keep it only near each object's edge (masks.ts).
 *  - Depth Anything 3: the official template utility_depth_anything3_video_depth_estimation's chain (DA3Inference 504, lower_bound_resize, mono →
 *    DA3Render depth, v2_style), with the Apache-2.0 Small checkpoint and frames saved as PNG; depth.ts normalises it over the clip.
 * Unused objects and switched-off parts are taken out, so ComfyUI only loads what this job needs.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { WORKFLOWS_DIR } from '../config.js';
import { LAYERS_MAX_OBJECTS, LAYERS_WORKFLOW } from './constants.js';

export type FileRef = { __file: string };
export interface GraphJob { source: string; objects: string[]; edges: boolean; depth: boolean }
/** Output nodes of the analysis graph, in the order the plan reads them back. */
export const maskNode = (k: number) => String(105 + 10 * k);
export const EDGES_NODE = '303';
export const DEPTH_NODE = '403';

const load = () => JSON.parse(readFileSync(path.join(WORKFLOWS_DIR, LAYERS_WORKFLOW), 'utf8')) as Record<string, any>;
const drop = (g: Record<string, any>, ids: string[]) => { for (const id of ids) delete g[id]; };
const chainNodes = (k: number) => [0, 1, 2, 3, 4, 5].map((n) => String(100 + 10 * k + n));

export function layersGraph(j: GraphJob): Record<string, any> {
  const n = j.objects.length;
  if (n < 1 || n > LAYERS_MAX_OBJECTS) throw new Error(`Layers needs 1–${LAYERS_MAX_OBJECTS} objects`);
  const g = load();
  g['1'].inputs.file = { __file: j.source } satisfies FileRef;
  for (let k = 0; k < LAYERS_MAX_OBJECTS; k++) {
    if (k < n) { g[String(100 + 10 * k)].inputs.text = j.objects[k]; continue; }
    drop(g, chainNodes(k));
  }
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
