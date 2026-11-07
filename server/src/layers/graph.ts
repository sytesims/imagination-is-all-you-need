/**
 * Layers: the analysis graph (workflows/layers-split-api.json, our own, core ComfyUI nodes only), patched for one job.
 *  - SAM 3.1 finds each named object on the first frame (SAM3_Detect, one text prompt per chip), the masks go into ONE SAM3_VideoTrack as its
 *    initial masks in chip order (no text detection while tracking), so track index k is always chip k: names never swap (our pattern from
 *    Swap Two People). SAM3_TrackToMask k → SaveImage gives one matte per frame for each object.
 *  - BiRefNet (RemoveBackground) gives a soft whole-frame matte; we keep it only near each object's edge (masks.ts).
 *  - Depth Anything 3 Small (DA3Inference + DA3Render) gives depth per frame; depth.ts normalises it over the clip.
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

const load = () => JSON.parse(readFileSync(path.join(WORKFLOWS_DIR, LAYERS_WORKFLOW), 'utf8')) as Record<string, any>;
const drop = (g: Record<string, any>, ids: string[]) => { for (const id of ids) delete g[id]; };
const chipNodes = (k: number) => [100, 101, 102].map((n) => String(n + 10 * k));
const trackNodes = (k: number) => [200, 201, 202].map((n) => String(n + 10 * k));

export function layersGraph(j: GraphJob): Record<string, any> {
  const n = j.objects.length;
  if (n < 1 || n > LAYERS_MAX_OBJECTS) throw new Error(`Layers needs 1–${LAYERS_MAX_OBJECTS} objects`);
  const g = load();
  g['1'].inputs.file = { __file: j.source } satisfies FileRef;
  for (let k = 0; k < LAYERS_MAX_OBJECTS; k++) {
    if (k < n) { g[String(100 + 10 * k)].inputs.text = j.objects[k]; continue; }
    drop(g, [...chipNodes(k), ...trackNodes(k)]);
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
