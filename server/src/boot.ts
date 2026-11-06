/**
 * Boots the server as a plugin tree (plan §3.2): reads the profile (kernel/profile.ts), creates the Cordis context, mounts the kernel's
 * services (settings, db, keys, http, places, tools, workflows, and the money path: spend, pricing, jobs), then the profile's plugins in order,
 * then `legacy` (the server core), then the feature plugins (route groups, plugins-builtin/features.ts) in the profile's order, and only then
 * starts listening. The money guard (ctx.spend) is a kernel service: no profile can leave it out or list it as a plugin.
 */
import { createRoot, mount, type Context, type PluginDef } from './kernel/index.js';
import { readProfile, type Profile } from './kernel/profile.js';
import { SettingsService, setSettingsKv } from './kernel/settings.js';
import { HttpService } from './kernel/http.js';
import { KeysService } from './kernel/keys.js';
import { PlacesService } from './services/places.js';
import { ToolsService } from './services/tools.js';
import { WorkflowsService } from './services/workflows.js';
import { SpendService } from './services/spend.js';
import { PricingService } from './services/pricing.js';
import { JobsService } from './services/jobs.js';
import { FEATURE_IDS } from './plugins-builtin/features.js';

/** Built-in plugins by profile id. */
export const BUILTIN_PLUGINS: Record<string, () => Promise<{ default: PluginDef<any> }>> = {
  'place-comfy-local': () => import('./plugins-builtin/place-comfy-local.js'),
  'place-comfy-cloud': () => import('./plugins-builtin/place-comfy-cloud.js'),
  'place-comfy-router': () => import('./plugins-builtin/place-comfy-router.js'),
  'place-fal': () => import('./plugins-builtin/place-fal.js'),
  'place-replicate': () => import('./plugins-builtin/place-replicate.js'),
  'place-direct': () => import('./plugins-builtin/place-direct.js'),
  'place-sample': () => import('./plugins-builtin/place-sample.js'),
  ...Object.fromEntries((['studio-video', 'studio-image', 'studio-audio', 'studio-3d', 'studio-edit', 'apps-gallery'] as const)
    .map((id) => [id, () => import('./plugins-builtin/studios.js').then((m) => ({ default: m.STUDIO_PLUGINS[id] }))])),
  'workflow-folders': () => import('./plugins-builtin/workflow-folders.js'),
  'spend-cap': () => import('./plugins-builtin/spend-cap.js'),
  'agent-budgets': () => import('./plugins-builtin/agent-budgets.js'),
  'billing-team-mode': () => import('./plugins-builtin/billing-team-mode.js'),
  'hosted-grant': () => import('./plugins-builtin/hosted-grant.js'),
  'comfy-featured': () => import('./plugins-builtin/comfy-featured.js'),
  'eta-learning': () => import('./plugins-builtin/eta-learning.js'),
  webhooks: () => import('./plugins-builtin/webhooks.js'),
  ...Object.fromEntries(FEATURE_IDS.map((id) => [id, () => import('./plugins-builtin/features.js').then((m) => ({ default: m.FEATURE_PLUGINS[id] }))])),
  legacy: () => import('./plugins-builtin/legacy.js'),
};

/** Kernel services a profile can't list (or leave out): they are always on. */
export const KERNEL_SERVICES = ['settings', 'db', 'keys', 'http', 'places', 'tools', 'workflows', 'spend', 'spend-guard', 'pricing', 'jobs'];

export async function boot(profile: Profile = readProfile(), o: { legacy?: boolean } = {}): Promise<Context> {
  const kernel = profile.plugins.filter((id) => KERNEL_SERVICES.includes(id));
  if (kernel.length) throw new Error(`profile ${profile.name} (${profile.file}): ${kernel.map((x) => `"${x}"`).join(', ')} is part of the kernel and always on (the money guard can't be turned off; leave the line out)`);
  const unknown = profile.plugins.filter((id) => !BUILTIN_PLUGINS[id]);
  if (unknown.length) throw new Error(`profile ${profile.name} (${profile.file}): unknown plugin ${unknown.map((x) => `"${x}"`).join(', ')}`);
  if (!profile.plugins.includes('legacy')) throw new Error(`profile ${profile.name} (${profile.file}): needs the "legacy" plugin (the server itself)`);
  const ctx = createRoot();
  await mount(ctx, SettingsService); // first: reads the env once (filming mode already applied by env.ts)
  const { DbService } = await import('./kernel/db.js'); const { getKv } = await import('./db.js'); // the db opens in the data dir the settings name
  await mount(ctx, DbService); setSettingsKv((k) => getKv(k, null));
  await mount(ctx, KeysService); await mount(ctx, HttpService); await mount(ctx, PlacesService);
  await mount(ctx, ToolsService); await mount(ctx, WorkflowsService);
  await mount(ctx, SpendService); await mount(ctx, PricingService); await mount(ctx, JobsService); // the money path (plan Phase 4): the guard is never a profile plugin
  for (const id of profile.plugins) if (id !== 'legacy' && !FEATURE_IDS.includes(id)) await mount(ctx, (await BUILTIN_PLUGINS[id]()).default);
  if (o.legacy === false) return ctx; // no server: no routes to add, nothing listens
  await mount(ctx, (await BUILTIN_PLUGINS.legacy()).default);
  for (const id of profile.plugins) if (FEATURE_IDS.includes(id)) await mount(ctx, (await BUILTIN_PLUGINS[id]()).default); // the route groups: after the core, before listen
  await (await import('./legacy.js')).listen();
  return ctx;
}
