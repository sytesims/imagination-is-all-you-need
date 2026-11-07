/**
 * Layers: the ComfyUI plan, the same on your computer and on Comfy Cloud.
 *  Pass 1: the analysis graph (graph.ts): every object's matte per frame, soft edges, depth. One graph, so SAM 3.1 loads once.
 *  Pass 2 (Clean background on), exactly as Footage Effects builds it: on your computer Vanish (LTX-2.5 + the Clean Plate IC-LoRA, comfy/plans.ts
 *          footageFx); on Comfy Cloud Remove an object with your names (the official LTX-2.3 remove-object template, workflows/cloud/
 *          ltx23-remove-object-api.json, comfy/ltx23VfxCloud.ts; NOT yet confirmed by a done Comfy Cloud run). Neither takes a mask, so
 *          assemble.ts pastes the result ONLY inside the objects' area.
 *  Finish: assemble.ts on this computer (post 'custom').
 */
import type { Plan } from '../comfy/plans.js';
import { buildPlan } from '../comfy/plans.js';
import { vfxCloudPlan, VFX_CLOUD_PROVIDER } from '../comfy/ltx23VfxCloud.js';
import { FOOTAGE_FX_PROVIDER } from '../shared/footageFx.js';
import { LAYERS_TOOL, LAYERS_WORKFLOW } from './constants.js';
import { layersGraph, outputNodes, DA3_CLOUD_MODEL } from './graph.js';
import { assembleLayers, rawFromOuts } from './assemble.js';

type J = { id: string; toolId: string; provider: string; input: Record<string, any> };

export function layersPlan(j: J, where: 'local' | 'cloud'): Plan {
  const i = j.input; if (!i.videoPath || !Array.isArray(i.objects)) throw new Error('Layers: the clip was not prepared. Add it again and press Split');
  const graph = layersGraph({ source: i.videoPath, objects: i.objects, edges: !!i.edges, depth: !!i.depth });
  if (where === 'cloud' && graph['400']) graph['400'].inputs.model_name = DA3_CLOUD_MODEL; // the official template's default on Comfy Cloud
  const outs = outputNodes({ objects: i.objects, edges: !!i.edges, depth: !!i.depth });
  const passes: Plan['passes'] = [{ label: 'Layers', workflow: LAYERS_WORKFLOW, graph, output: outs[0].node, extraOutputs: outs.slice(1).map((o) => ({ node: o.node, label: o.role })),
    expect: { objects: i.objects, edges: !!i.edges, depth: !!i.depth, frames: i.frames } }];
  const notes = [`Layers: ${i.objects.length} object${i.objects.length === 1 ? '' : 's'} (${i.objects.join(', ')}), ${i.width}×${i.height}, ${i.fps} fps, ${i.frames} frames`];
  const plateIn = where === 'cloud' ? i.plateCloud : i.plate;
  if (i.background && plateIn) {
    const plateJob = { id: `${j.id}-plate`, toolId: 'footage-fx', input: plateIn };
    const p = where === 'cloud' ? vfxCloudPlan({ ...plateJob, provider: VFX_CLOUD_PROVIDER }) : buildPlan({ ...plateJob, provider: FOOTAGE_FX_PROVIDER } as any);
    passes.push(...p.passes.map((x) => ({ ...x, label: 'Clean background' }))); notes.push(...p.notes);
  }
  return { tool: LAYERS_TOOL, passes, outKind: 'video', muxSourceAudio: false, imageBatches: true, notes,
    post: { kind: 'custom', run: async (job, o) => assembleLayers(job, await rawFromOuts(job.id, job.input as any, o), where === 'cloud' ? 'comfy-cloud' : 'your-computer') } };
}
