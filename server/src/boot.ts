/**
 * Boots the server as a plugin tree (plan §3.2): reads the profile (kernel/profile.ts), creates the Cordis context, mounts the kernel's
 * services, then the profile's plugins in order, and `legacy` (today's server) last.
 */
import { createRoot, mount, type Context, type PluginDef } from './kernel/index.js';
import { readProfile, type Profile } from './kernel/profile.js';
import { PlacesService } from './services/places.js';

/** Built-in plugins by profile id. */
export const BUILTIN_PLUGINS: Record<string, () => Promise<{ default: PluginDef<any> }>> = {
  'place-fal': () => import('./plugins-builtin/place-fal.js'),
  'place-replicate': () => import('./plugins-builtin/place-replicate.js'),
  legacy: () => import('./plugins-builtin/legacy.js'),
};

export async function boot(profile: Profile = readProfile(), o: { legacy?: boolean } = {}): Promise<Context> {
  const unknown = profile.plugins.filter((id) => !BUILTIN_PLUGINS[id]);
  if (unknown.length) throw new Error(`profile ${profile.name} (${profile.file}): unknown plugin ${unknown.map((x) => `"${x}"`).join(', ')}`);
  if (!profile.plugins.includes('legacy')) throw new Error(`profile ${profile.name} (${profile.file}): needs the "legacy" plugin (the server itself)`);
  const ctx = createRoot();
  await mount(ctx, PlacesService);
  for (const id of profile.plugins) if (id !== 'legacy') await mount(ctx, (await BUILTIN_PLUGINS[id]()).default);
  if (o.legacy !== false) await mount(ctx, (await BUILTIN_PLUGINS.legacy()).default);
  return ctx;
}
