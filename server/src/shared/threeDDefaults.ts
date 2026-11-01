/**
 * Default models for the 3D page (2026-10-23), keyed by 3D workflow (shared/threeD.ts). Same shape and resolution as shared/imageDefaults.ts,
 * videoDefaults.ts and audioDefaults.ts: one model for a local GPU and one for a hosted key, with a short line on why. routing/defaults.ts
 * resolves it (saved pick > this default for the active setup, if it runs > the first model that runs) and the web marks it "Default".
 *  - hosted: Tripo 3.1 through Comfy (partner node, the Comfy key); TRELLIS.2 on fal when there is no Comfy route.
 *  - local: Pixal3D + TRELLIS.2 (the official Comfy template) once its files are downloaded; until then it isn't runnable.
 * Every id here must be a model the three-d tool offers (test/three-d.test.ts checks it).
 */
import type { WorkflowDefaults } from './imageDefaults.js';
import type { ThreeDWorkflowId } from './threeD.js';
import { cloudModel } from './cloudDefaults.js';

export const THREE_D_DEFAULTS: Partial<Record<ThreeDWorkflowId, WorkflowDefaults>> = {
  'text-to-3d': { local: null, hosted: cloudModel('text-to-3d'), hostedFirstWhenNeither: true, why: { hosted: 'A textured model from your description' } },
  'multiview-to-3d': { local: null, hosted: cloudModel('multiview-to-3d'), hostedFirstWhenNeither: true, why: { hosted: 'One model from front, side and back views' } },
  'image-to-3d': { local: 'comfy-pixal3d-trellis2', hosted: cloudModel('image-to-3d'), hostedFallback: 'fal-trellis2', hostedFirstWhenNeither: true /* no key yet: name Tripo (the Comfy key is the common one) */,
    why: { local: 'Textured models free, locally, once its 15 GB of files are downloaded', hosted: 'Tripo 3.1: clean, textured models with PBR maps' } },
};
export const threeDDefaultsOf = (id: string): WorkflowDefaults | null => (THREE_D_DEFAULTS as Record<string, WorkflowDefaults>)[id] ?? null;
