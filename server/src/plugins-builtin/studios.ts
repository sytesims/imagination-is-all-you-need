/**
 * The studios: each one registers its built-in tools (tools/builtin.ts) into ctx.tools with their nav order. Leave one out of the profile and
 * its tools are gone from /api/tools, menus and search; a run, quote or link to one answers that it isn't in this app (routesPrefill.ts says
 * "turned off"). The other studios keep working.
 *
 * apps-gallery starts after the other studios: each app-<id> recipe wraps a base tool of another studio, and a recipe whose base is off is
 * left out.
 */
import { definePlugin, type PluginDef } from '../kernel/index.js';
import { STUDIO_TOOLS, galleryEntries, type StudioId } from '../tools/builtin.js';
import { soulUpscaleAddOn } from '../tools/soul/cloud.js';

/** studio-image also owns OpenSoul's cloud upscale (a route add-on on its cloud routes: services/routeAddOns.ts). */
const studio = (id: Exclude<StudioId, 'apps-gallery'>): PluginDef => definePlugin({
  name: id, inject: id === 'studio-image' ? ['tools', 'pricing'] : ['tools'],
  apply(ctx) {
    for (const e of STUDIO_TOOLS[id]) ctx.tools.register(e.tool, { order: e.order, aliases: e.aliases });
    if (id === 'studio-image') ctx.pricing.addOn(soulUpscaleAddOn);
  },
});

export const STUDIO_PLUGINS: Record<StudioId, PluginDef> = {
  'studio-video': studio('studio-video'),
  'studio-image': studio('studio-image'),
  'studio-audio': studio('studio-audio'),
  'studio-3d': studio('studio-3d'),
  'studio-edit': studio('studio-edit'),
  'apps-gallery': definePlugin({
    name: 'apps-gallery', inject: ['tools'],
    apply(ctx) {
      for (const e of STUDIO_TOOLS['apps-gallery']) ctx.tools.register(e.tool, { order: e.order, aliases: e.aliases });
      for (const e of galleryEntries((id) => ctx.tools.find(id))) ctx.tools.register(e.tool, { order: e.order });
    },
  }),
};
