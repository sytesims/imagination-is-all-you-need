/**
 * The Plugins page's switches (plan step 7). Your choices sit on top of the edition (the profile): the profile says what this edition
 * ships and which of those start off (`off:`); you turn plugins on or off, install the installable ones (kie.ai, RunPod: already in the
 * app, nothing is downloaded), and switch safe mode. Choices are saved in the db (kv `plugins.choices`) and read at every start.
 *
 * Live where the kernel can: turning a plugin off disposes its fiber (its places, tools, checks and hooks go, its routes answer 404 like an
 * unknown route; its data stays). Turning one on mounts it again; a plugin whose routes were added at boot gets the same routes back
 * (kernel/http.ts). Two cases wait for the next start, and the page says "Applies after restart": a plugin marked restartOnly in the
 * catalogue (comfy-featured, webhooks), and one that adds routes but was not running when the app started (Fastify can't add routes later).
 *
 * The spend guard and the kernel services are never switches (400). `legacy` (the server) and `web-static` (this page) aren't either.
 * Safe mode pauses every plugin that isn't ours (step 9 brings them; registerOutsidePlugin is that door); ours stay on.
 * A plugin that throws while it starts doesn't stop the app: it is marked failed with its reason, and you can turn it off.
 *
 * OPENHIGGSFIELD_PLUGIN_CHOICES=ignore runs the profile exactly as written (no saved choices, no `off:` list): the test runner sets it, so
 * tests see the whole edition; plugins-ui.e2e.ts tests the choices themselves.
 */
import fs from 'node:fs'; import path from 'node:path';
import type { Context, PluginDef } from './index.js';
import { mounted } from './index.js';
import { NeedsRestart } from './http.js';
import { PROFILES_DIR, parseProfile, type Profile } from './profile.js';
import { keyConfigured } from './keys.js';
import { PLUGIN_CATALOG, CORE_ROWS, catalogEntry, neededBy, needsAll, type PluginRow, type PluginsAnswer } from '../shared/pluginCatalog.js';

type Fiber = { state: number; dispose(): Promise<void> } & PromiseLike<unknown>;
type Loader = () => Promise<{ default: PluginDef<any> }>;
export interface Choices { on: Record<string, boolean>; safeMode: boolean }

/** Never switches: the kernel's services (the money guard among them), the server itself and the page. */
export const ALWAYS_ON = ['settings', 'db', 'keys', 'http', 'places', 'tools', 'workflows', 'spend', 'spend-guard', 'pricing', 'jobs', 'legacy', 'web-static'];
export const SPEND_GUARD_LINE = 'The spend guard is always on: every paid run shows its price and waits for your OK.';
const KV = 'plugins.choices';

let root: Context | null = null;
let profile: Profile = { name: 'desktop', plugins: [], file: '' };
let loaders: Record<string, Loader> = {};
let kv: { get: <T>(k: string, d: T) => T; set: (k: string, v: unknown) => void } | null = null;
const fibers = new Map<string, Fiber>();
const failed = new Map<string, string>();
/** Plugins that aren't ours (step 9): id → loader + what the page shows. Safe mode pauses them. */
const outside = new Map<string, { load: Loader; name: string; description: string }>();

export const choicesIgnored = () => /^(ignore|off|0|false)$/i.test(process.env.OPENHIGGSFIELD_PLUGIN_CHOICES?.trim() ?? '');
export function readChoices(): Choices {
  const c = kv?.get<Partial<Choices>>(KV, {}) ?? {};
  return { on: c.on && typeof c.on === 'object' ? { ...c.on } : {}, safeMode: c.safeMode === true };
}
const saveChoices = (c: Choices) => kv?.set(KV, c);

/** A plugin made by someone else (step 9 installs them; tests use it). Must be called before boot for it to start with the app. */
export function registerOutsidePlugin(id: string, o: { load: Loader; name: string; description: string }) { outside.set(id, o); }
const isOurs = (id: string) => !outside.has(id);
const known = (id: string) => !!loaders[id] || outside.has(id);

/** Does the user (or the edition) want this plugin on? */
function wanted(id: string, c = readChoices()): boolean {
  if (choicesIgnored()) return profile.plugins.includes(id);
  if (ALWAYS_ON.includes(id)) return profile.plugins.includes(id) || id === 'spend-guard';
  if (c.on[id] !== undefined) return c.on[id];
  if (outside.has(id)) return true; // installed = on
  return profile.plugins.includes(id) && !(profile.off ?? []).includes(id);
}
const needsMissing = (id: string, c: Choices) => (catalogEntry(id)?.needs ?? []).filter((n) => !wanted(n, c));
/** Should it run now: wanted, not paused by safe mode, everything it needs wanted too. */
const shouldRun = (id: string, c: Choices) => wanted(id, c) && !(c.safeMode && !isOurs(id) && !choicesIgnored()) && !needsMissing(id, c).length;

/** The ids boot mounts before `legacy` and after it (features), in the profile's order; extra ones (installed, outside) go where they belong. */
export function bootPlan(p: Profile, o: { features: string[] }): { before: string[]; after: string[] } {
  const c = readChoices(); const ids = p.plugins.filter((x) => x !== 'legacy');
  const extra = [...Object.keys(loaders), ...outside.keys()].filter((x) => !p.plugins.includes(x) && x !== 'legacy' && !ids.includes(x));
  const all = [...ids, ...extra].filter((x) => shouldRun(x, c));
  return { before: all.filter((x) => !o.features.includes(x)), after: all.filter((x) => o.features.includes(x)) };
}

/** boot.ts hands over the tree, the profile, how to load each plugin and the kv store (the db is open by then). */
export function initSwitchboard(o: { ctx: Context; profile: Profile; loaders: Record<string, Loader>; kv: NonNullable<typeof kv> }) {
  root = o.ctx; profile = o.profile; loaders = o.loaders; kv = o.kv; fibers.clear(); failed.clear();
}

const plain = (e: unknown) => { const m = e instanceof Error ? e.message : String(e); return m.length > 200 ? `${m.slice(0, 197)}…` : m; };

/** Mount one plugin. A throw marks it failed (the app keeps going); NeedsRestart leaves it for the next start. */
export async function start(id: string): Promise<'on' | 'failed' | 'restart'> {
  if (!root) throw new Error('switchboard: not booted');
  if (fibers.has(id)) return 'on';
  let def: PluginDef<any>;
  try { def = (await (outside.get(id)?.load ?? loaders[id])()).default; } catch (e) { failed.set(id, `It couldn't load: ${plain(e)}`); return 'failed'; }
  const fiber = (root.plugin as unknown as (p: unknown) => Fiber)(def); mounted.push({ name: def.name, fiber });
  try { await fiber; fibers.set(id, fiber); failed.delete(id); return 'on'; } catch (e) {
    await fiber.dispose().catch(() => {});
    if (e instanceof NeedsRestart) { failed.delete(id); return 'restart'; }
    failed.set(id, plain(e)); console.error(`[plugins] ${id} didn't start: ${plain(e)}`); return 'failed';
  }
}
async function stop(id: string) { const f = fibers.get(id); fibers.delete(id); failed.delete(id); if (f) await f.dispose(); }
const running = (id: string) => fibers.has(id);

export class PluginRefused extends Error { constructor(readonly status: number, message: string, readonly body: Record<string, unknown> = {}) { super(message); } }

/** Turn a plugin on or off (Install = on for an installable one). Without confirm, a change that also switches others answers 409 with
 *  the list (alsoOff / alsoOn); with confirm it does them all. Applies live where it can. */
export async function setPlugin(id: string, on: boolean, o: { confirm?: boolean } = {}) {
  if (id === 'spend-guard') throw new PluginRefused(400, SPEND_GUARD_LINE, { code: 'always_on' });
  if (ALWAYS_ON.includes(id)) throw new PluginRefused(400, 'This is part of the app itself and is always on.', { code: 'always_on' });
  if (!known(id) || (!catalogEntry(id) && isOurs(id))) throw new PluginRefused(404, `There is no plugin called "${id}".`, { code: 'not_found' });
  if (choicesIgnored()) throw new PluginRefused(409, 'Plugin choices are turned off for this server (OPENHIGGSFIELD_PLUGIN_CHOICES=ignore).', { code: 'choices_ignored' });
  const c = readChoices();
  const others = (on ? needsAll(id) : neededBy(id)).filter((x) => wanted(x, c) !== on);
  if (others.length && !o.confirm) {
    const named = others.map((x) => ({ id: x, name: catalogEntry(x)?.name ?? x, on: running(x) }));
    throw new PluginRefused(409, on ? `${named.map((x) => x.name).join(', ')} turns on too.` : `${named.map((x) => x.name).join(', ')} turns off too.`,
      { code: 'confirm', ...(on ? { alsoOn: named } : { alsoOff: named }) });
  }
  const changed = [...others, id]; for (const x of changed) c.on[x] = on; saveChoices(c);
  const order = on ? [...others.slice().reverse(), id] : [...others, id]; // on: what it needs first; off: what needs it first
  const restart: string[] = [];
  for (const x of order) {
    if (catalogEntry(x)?.restartOnly) { restart.push(x); continue; }
    if (on) { if (shouldRun(x, c) && (await start(x)) === 'restart') restart.push(x); } else await stop(x);
  }
  if (changed.some((x) => x.startsWith('studio-')) && running('apps-gallery')) { await stop('apps-gallery'); await start('apps-gallery'); } // its recipes wrap the studios' tools
  return { ok: true, changed, restartNeeded: restart };
}

/** Safe mode: pause every plugin that isn't ours (ours stay on). */
export async function setSafeMode(on: boolean) {
  const c = readChoices(); c.safeMode = on; saveChoices(c);
  for (const id of outside.keys()) { if (on) await stop(id); else if (shouldRun(id, c)) await start(id); }
  return { ok: true, safeMode: on };
}

function editionOf(name: string) {
  const known: Record<string, [string, string]> = { desktop: ['Desktop edition', 'Made for working on this computer'] };
  const [n, d] = known[name] ?? [`${name.charAt(0).toUpperCase()}${name.slice(1).replace(/-/g, ' ')} edition`, ''];
  return { id: name, name: n, description: d };
}
function editions() {
  try { return fs.readdirSync(PROFILES_DIR).filter((f) => /\.ya?ml$/.test(f)).map((f) => editionOf(parseProfile(fs.readFileSync(path.join(PROFILES_DIR, f), 'utf8'), f).name)); } catch { return [editionOf(profile.name)]; }
}

/** The key a plugin runs with: is it set? (RunPod also needs its Endpoint ID.) */
async function keyState(id: string): Promise<{ set: boolean; extra?: string }> {
  let vars: string[] = [];
  try { const k = (await loaders[id]?.())?.default.keys; vars = Array.isArray(k) ? [...k] : []; } catch { /* unknown: treat as not set */ }
  const set = vars.length > 0 && keyConfigured(vars[0], vars.slice(1));
  if (id === 'place-runpod') { const { runpodEndpoint } = await import('../routing/runpodRoutes.js'); if (!runpodEndpoint()) return { set, extra: 'Endpoint ID' }; }
  return { set };
}

async function row(id: string, c: Choices): Promise<PluginRow> {
  const e = catalogEntry(id); const o = outside.get(id); const core = CORE_ROWS.some((x) => x.id === id);
  const base = { id, name: e?.name ?? o?.name ?? id, group: e?.group ?? 'features', description: e?.description ?? o?.description ?? '', source: (o ? 'community' : 'ours') as PluginRow['source'],
    core, canTurnOff: !core, installable: !!e?.installable, needs: e?.needs ?? [], neededBy: neededBy(id), restartOnly: !!e?.restartOnly,
    canSpend: core || !!e?.canSpend, tag: e?.tag ?? null, settings: e?.settings ?? [], licence: o ? 'See its page' : 'AGPL-3.0-or-later' };
  if (core) return { ...base, state: 'on', reason: 'Always on', wanted: true, installed: true, restartNeeded: false, key: null };
  const want = wanted(id, c); const run = running(id); const installed = !e?.installable || c.on[id] !== undefined || profile.plugins.includes(id);
  const ks = e?.key ? await keyState(id) : null;
  const key = e?.key && ks ? { ...e.key, set: ks.set } : null;
  const missing = needsMissing(id, c).map((n) => catalogEntry(n)?.name ?? n);
  let state: PluginRow['state'] = 'off'; let reason = 'Off'; let restartNeeded = false;
  if (failed.has(id) && want) { state = 'failed'; reason = failed.get(id)!; }
  else if (!installed) { state = 'not-installed'; reason = 'Ready to install'; }
  else if (want && c.safeMode && !isOurs(id) && !choicesIgnored()) { state = 'paused'; reason = 'Paused by safe mode'; }
  else if (want && missing.length) { state = 'off'; reason = `Needs ${missing.join(', ')}`; }
  else if (want !== run) { restartNeeded = true; state = run ? 'on' : 'off'; reason = want ? 'Turns on after a restart' : 'Turns off after a restart'; }
  else if (run && key && (!key.set || ks?.extra)) {
    state = 'needs-key';
    reason = !key.set && ks?.extra ? `Add your ${key.label} and ${ks.extra} to start using it` : !key.set ? 'Add a key to start using it' : `Add your ${ks!.extra} to start using it`;
  }
  else if (run) { state = 'on'; reason = 'Started fine'; }
  return { ...base, state, reason, wanted: want, installed, restartNeeded, key };
}

/** GET /api/plugins. */
export async function listPlugins(): Promise<PluginsAnswer> {
  const c = readChoices();
  const ids = [...CORE_ROWS.map((e) => e.id), ...PLUGIN_CATALOG.map((e) => e.id).filter((x) => known(x)), ...outside.keys()]; // the spend guard heads Money
  const plugins = await Promise.all(ids.map((x) => row(x, c)));
  return { edition: editionOf(profile.name), editions: editions(), safeMode: c.safeMode, restartNeeded: plugins.some((p) => p.restartNeeded), plugins };
}

/** GET /api/ui: the plugins running now (the web hides what belongs to the others). */
export const activePlugins = () => ({ on: [...fibers.keys()].sort(), edition: profile.name, safeMode: readChoices().safeMode });

/** Tests: forget the outside plugins. */
export const resetOutside = () => outside.clear();
