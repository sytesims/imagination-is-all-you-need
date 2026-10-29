/**
 * Optional plugin handler (docs/PLUGINS.md). Without it the generic handler runs.
 * Here: a warning for slow settings, and two outputs (cutout + matte) instead of the generic one.
 */
import type { PluginHandler } from '../../server/src/plugins.js';

const handler: PluginHandler = {
  async parseInput(_fields, _files, ctx) {
    const input = await ctx.base(); // generic validation: video, rights, types, fields, resolution
    if ('error' in input) return input;
    if (input.fields?.detail === 'fine' && input.resolution === '1080p') input.warnings = [...(input.warnings ?? []), 'Fine edges at 1080p are slow: try Balanced first.'];
    return input;
  },
  run(job, ctx) {
    const bg = ctx.manifest.presets.find((p) => p.id === job.input.types?.[0])?.label ?? 'Cutout';
    return ctx.mockRun(job, [`Cutout · ${bg}`, 'Alpha matte']);
  },
};
export default handler;
