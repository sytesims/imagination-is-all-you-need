/**
 * layers (feature plugin, Made by us · Features): "Split a video into separate layers". One folder (server/src/layers/) + this file + one line in
 * the edition profile. It adds, and takes away again when switched off:
 *  - the Layers tool (Edit Video side; its Video page row and bar appear only while the tool is registered),
 *  - its ComfyUI plan (registerPlanOwner: your computer and Comfy Cloud run the same graph),
 *  - its routes (/api/layers/:id, /api/layers/:id/export.zip).
 * It reads no keys: a Comfy Cloud run goes through the Comfy Cloud place (place-comfy-cloud, its declared Comfy key) and the spend guard, like
 * every Comfy Cloud workflow. Its price row, places and licences are registered once when it first loads (layers/register.ts); with the tool
 * gone, nothing can quote or run them.
 */
import { definePlugin } from '../kernel/index.js';
import { LAYERS_PLUGIN, LAYERS_TOOL, LAYERS_LOCAL } from '../layers/constants.js';

export default definePlugin({
  name: LAYERS_PLUGIN, inject: ['http', 'tools'], keys: [],
  async apply(ctx) {
    await import('../layers/register.js'); const { registerPlanOwner } = await import('../comfy/plans.js');
    const { layersTool } = await import('../layers/tool.js'); const { layersPlan } = await import('../layers/plan.js');
    ctx.tools.register(layersTool, { order: 245 });
    ctx.effect(() => registerPlanOwner({ id: LAYERS_PLUGIN, owns: (j) => j.toolId === LAYERS_TOOL && j.provider === LAYERS_LOCAL && !!j.input?.videoPath, build: (j) => layersPlan(j, 'local') }), 'layers plan');
    await ctx.http.group(async (app) => (await import('../layers/routes.js')).registerLayersRoutes(app));
  },
});
