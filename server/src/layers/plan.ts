/**
 * Layers: the ComfyUI plan, the same on your computer and on Comfy Cloud.
 *  Pass 1: the analysis graph (graph.ts): every object's matte per frame in 2-second pieces, soft edges, depth. One graph, so SAM 3.1 loads once.
 *  Pass 2 (Clean background on, your computer only): Footage Effects' Vanish, exactly as Footage Effects builds it (LTX-2.5 + the Clean Plate
 *          IC-LoRA, comfy/plans.ts footageFx). It takes no mask, so assemble.ts pastes it ONLY inside the objects' area. On Comfy Cloud the clean
 *          background is skipped with a plain note until its Cloud step (the official LTX-2.3 remove-object template) is confirmed by a real run.
 *  Finish: assemble.ts on this computer (post 'custom').
 */
import type { Plan } from '../comfy/plans.js';
import { buildPlan } from '../comfy/plans.js';
import { FOOTAGE_FX_PROVIDER } from '../shared/footageFx.js';
import { LAYERS_TOOL, LAYERS_WORKFLOW, CLOUD_PLATE_NOTE } from './constants.js';
import { layersGraph, outputNodes, DA3_CLOUD_MODEL } from './graph.js';
import { assembleLayers, rawFromOuts } from './assemble.js';

type J = { id: string; toolId: string; provider: string; input: Record<string, any> };

export function layersPlan(j: J, where: 'local' | 'cloud'): Plan {
  const i = j.input; if (!i.videoPath || !Array.isArray(i.objects)) throw new Error('Layers: the clip was not prepared. Add it again and press Split');
  const graph = layersGraph({ source: i.videoPath, objects: i.objects, edges: !!i.edges, depth: !!i.depth, frames: Number(i.frames) || 1 });
  if (where === 'cloud' && graph['400']) graph['400'].inputs.model_name = DA3_CLOUD_MODEL; // the official template's default on Comfy Cloud
  const outs = outputNodes({ objects: i.objects, edges: !!i.edges, depth: !!i.depth, frames: Number(i.frames) || 1 });
  const passes: Plan['passes'] = [{ label: 'Layers', workflow: LAYERS_WORKFLOW, graph, output: outs[0].node, extraOutputs: outs.slice(1).map((o) => ({ node: o.node, label: o.role })),
    expect: { objects: i.objects, edges: !!i.edges, depth: !!i.depth, frames: i.frames } }];
  const notes = [`Layers: ${i.objects.length} object${i.objects.length === 1 ? '' : 's'} (${i.objects.join(', ')}), ${i.width}×${i.height}, ${i.fps} fps, ${i.frames} frames`];
  if (i.background && i.plate && where === 'local') { // Comfy Cloud: skipped until its step is confirmed by a real run (CLOUD_PLATE_NOTE, said on the result)
    const p = buildPlan({ id: `${j.id}-plate`, toolId: 'footage-fx', input: i.plate, provider: FOOTAGE_FX_PROVIDER } as any);
    passes.push(...p.passes.map((x) => ({ ...x, label: 'Clean background' }))); notes.push(...p.notes);
  }
  if (i.background && where === 'cloud') notes.push(CLOUD_PLATE_NOTE);
  return { tool: LAYERS_TOOL, passes, outKind: 'video', muxSourceAudio: false, imageBatches: true, notes,
    post: { kind: 'custom', run: async (job, o) => assembleLayers(job, await rawFromOuts(job.id, job.input as any, o), where === 'cloud' ? 'comfy-cloud' : 'your-computer') } };
}
