/**
 * Camera Moves, Photo FX and Orbit Shot on Comfy Router: the video models that run them and the
 * workflow each feature + model pair is credited with (same shape and wording as the image features' credit, shared/imageFeatures.ts).
 * The job maps to the model's Router body (routing/routerModels.ts): the move / effect / orbit becomes our prompt recipe, the photo the first frame.
 * Kling v3 (Router schema has no image input) and Veo 3.1 (retiring) are not offered on these tools.
 */
import type { WorkflowSource } from './workflowSources.js';

/** Router video models offered on the three apps, in quality order (B6). */
export const ROUTER_APP_MODELS = ['router-seedance', 'api-minimax-h3'];

const official = (id: string, name: string): WorkflowSource => ({ source: 'official', name: `${name} (${id})`, url: `https://github.com/Comfy-Org/workflow_templates/blob/main/templates/${id}.json`,
  author: 'Comfy Org', licence: 'MIT (Comfy-Org/workflow_templates)' });
/** The official partner-node template whose node sends what our body sends (prompt + first frame; we leave the last frame out). */
const TEMPLATE: Record<string, WorkflowSource> = {
  'router-seedance': official('api_seedance2_0_flf2v', 'Seedance2.0: First-Last-Frame to Video'),
  'api-minimax-h3': official('api_minimax_h3_flf2v', 'MiniMax H3: First-Last-Frame to Video'),
};
const FIRST_FRAME = 'your photo is the first frame (centre-cropped to the aspect you pick; no last frame)';
export const VIDEO_APP_FEATURES: Record<string, { name: string; recipe: string }> = {
  camera: { name: 'Camera Moves', recipe: `Our camera recipe: the move you pick becomes a camera sentence around your prompt; ${FIRST_FRAME}.` },
  'photo-fx': { name: 'Photo FX', recipe: `Our effect recipe: the effect you pick becomes the prompt, your twist is added after it; ${FIRST_FRAME}.` },
  'app-orbit-shot': { name: 'Orbit Shot', recipe: `Our orbit recipe: the orbit type and backdrop become the prompt; ${FIRST_FRAME}.` },
};
export interface VideoAppWorkflow extends WorkflowSource { recipe: string }
/** The workflow a (tool, provider) pair is credited with; null = not a Router app pair. */
export function videoAppWorkflow(toolId: string, providerId: string): VideoAppWorkflow | null {
  const f = VIDEO_APP_FEATURES[toolId]; const t = TEMPLATE[providerId]; return f && t ? { ...t, recipe: f.recipe } : null;
}
/** app.workflowByProvider on the tool listing: {providerId: workflow} for the Router models. */
export const videoAppWorkflows = (toolId: string) => Object.fromEntries(ROUTER_APP_MODELS.flatMap((p) => { const w = videoAppWorkflow(toolId, p); return w ? [[p, w]] : []; }));
const NAMES: Record<string, string> = { 'router-seedance': 'Seedance 2.0', 'api-minimax-h3': 'MiniMax H3' };
/** Job view `feature` for these pairs ("Camera Moves · Seedance 2.0" + its workflow credit), like featureOfJob for images. */
export function videoAppFeatureOfJob(j: { toolId: string; provider?: string | null }): { id: string; name: string; model: string; label: string; workflow: VideoAppWorkflow } | null {
  const p = String(j.provider ?? ''); const w = videoAppWorkflow(j.toolId, p); if (!w) return null; const f = VIDEO_APP_FEATURES[j.toolId];
  return { id: j.toolId, name: f.name, model: NAMES[p], label: `${f.name} · ${NAMES[p]}`, workflow: w };
}
