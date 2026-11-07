/**
 * Video to layers inside the Video studio (plugins-builtin/studios.ts, studio-video): the studio registers the tool with its other tools
 * (tools/builtin.ts); this adds the rest, undone with the studio: the ComfyUI plan on your computer (Comfy Cloud runs the same graph through
 * its Cloud workflow entry, register.ts) and the routes /api/layers/:id, POST /api/layers/:id/export, GET /api/layers/:id/export.zip.
 * It reads no keys: a Comfy Cloud run goes through the Comfy Cloud place (its declared Comfy key) and the spend guard.
 */
import type { Context } from '../kernel/index.js';
import { LAYERS_TOOL, LAYERS_LOCAL } from './constants.js';

export async function applyLayers(ctx: Context): Promise<void> {
  const { registerPlanOwner } = await import('../comfy/plans.js'); const { layersPlan } = await import('./plan.js');
  ctx.effect(() => registerPlanOwner({ id: LAYERS_TOOL, owns: (j) => j.toolId === LAYERS_TOOL && j.provider === LAYERS_LOCAL && !!j.input?.videoPath, build: (j) => layersPlan(j, 'local') }), 'video to layers plan');
  await ctx.http.group(async (app) => (await import('./routes.js')).registerLayersRoutes(app));
}
