/**
 * Plugins (plan step 7): the web's one door to the server's switches.
 *  - usePluginOn(id): is this plugin running? Read once from GET /api/ui and again after every change, so a part of the app whose plugin
 *    is off can hide (the Canvas tab when Canvas is off). Unknown (loading, or an older server without /api/ui) counts as on.
 *  - useLinkOn(): (href) => may this link show? A link into a studio that is off (Video, Image, Audio, 3D, Edit…) hides: the header tabs,
 *    hand-offs, Explore and Workflows cards all ask it (shared/studioLinks.ts finds the studio of a link).
 *  - usePluginList(): GET /api/plugins for the Plugins page and the quick menu, refreshed after every change.
 *  - setPluginOn / installPlugin / setSafeMode: the changes. A change that also switches others asks first (the shared confirm dialog),
 *    naming them; the data it keeps is said too.
 */
import { useEffect, useSyncExternalStore } from 'react';
import type { PluginsAnswer, PluginRow } from '../../../server/src/shared/pluginCatalog';
import { askConfirm } from './Dialog';
import { refreshTools } from './useTools';
import { studiosOfHref } from './studioLinks';
import { catalogEntry } from '../../../server/src/shared/pluginCatalog';

export type { PluginsAnswer, PluginRow };
export { PLUGIN_GROUPS } from '../../../server/src/shared/pluginCatalog';

let ui: { on: string[]; safeMode: boolean; toolStudio?: Record<string, string>; toolNeeds?: Record<string, string> } | null = null; let list: PluginsAnswer | null = null; let listErr = false;
const subs = new Set<() => void>(); const tell = () => subs.forEach((f) => f());
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

let uiLoading: Promise<void> | null = null;
export function refreshPluginsUi(): Promise<void> {
  return (uiLoading ??= fetch('/api/ui', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => { ui = j && Array.isArray(j.on) ? j : null; tell(); })
    .catch(() => { /* an older server: everything counts as on */ }).finally(() => { uiLoading = null; }));
}
let listLoading: Promise<void> | null = null;
export function refreshPluginList(): Promise<void> {
  return (listLoading ??= fetch('/api/plugins', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))).then((j: PluginsAnswer) => { list = j; listErr = false; tell(); })
    .catch(() => { listErr = true; tell(); }).finally(() => { listLoading = null; }));
}
/** After a change: the switches, and the tool list (a studio turned on brings its tools back, no reload). */
const refreshAll = () => { refreshTools(); return Promise.all([refreshPluginsUi(), refreshPluginList()]); };

/** Is the plugin running? (true while unknown) */
export function usePluginOn(id: string): boolean {
  useEffect(() => { if (!ui && !uiLoading) void refreshPluginsUi(); }, []);
  return useSyncExternalStore(subscribe, () => !ui || ui.on.includes(id));
}
/** Is this plugin running, right now (true while unknown)? For code outside React; components use usePluginOn. */
const onNow = (id: string) => !ui || ui.on.includes(id);
/** The studio that a link opens and that is off right now ({id, name}), or null: the link is fine. */
export function offStudioOf(href: string): { id: string; name: string } | null {
  const id = studiosOfHref(href, ui?.toolStudio ?? {}, ui?.toolNeeds ?? {}).find((s) => !onNow(s));
  return id ? { id, name: catalogEntry(id)?.name ?? id } : null;
}
/** Is this tool's studio on (true for tools no studio owns, and while unknown)? */
export const toolOn = (toolId: string): boolean => [ui?.toolStudio?.[toolId], ui?.toolNeeds?.[toolId]].every((s) => !s || onNow(s));
/** May this link show? false for a link into a studio that is off. */
export const linkOn = (href: string | null | undefined): boolean => !href || !offStudioOf(href);
/** linkOn for components: re-renders when a plugin is turned on or off. */
export function useLinkOn(): (href: string | null | undefined) => boolean {
  useEffect(() => { if (!ui && !uiLoading) void refreshPluginsUi(); }, []);
  useSyncExternalStore(subscribe, () => ui);
  return linkOn;
}
/** The studio a page opens that is off ({id, name}), or null (the router shows "<Studio> is off" for it). */
export function useOffStudio(href: string): { id: string; name: string } | null {
  useLinkOn();
  return offStudioOf(href);
}
export function usePluginList(): { data: PluginsAnswer | null; error: boolean; reload: () => Promise<unknown> } {
  useEffect(() => { void refreshPluginList(); }, []);
  const data = useSyncExternalStore(subscribe, () => list); const error = useSyncExternalStore(subscribe, () => listErr);
  return { data, error, reload: refreshAll };
}

/** Something needs you: a plugin that failed, or one that is on and waits for its key (the quick menu's "Needs you"). */
export const needsYou = (p: PluginRow) => p.state === 'failed' || p.state === 'needs-key';
/** A real problem (the orange dot): a plugin that didn't start, or a key the provider refused. A place with no key yet is not one. */
export const isProblem = (p: PluginRow) => p.state === 'failed' || !!p.key?.rejected;

type Answer = { ok?: boolean; restartNeeded?: string[]; code?: string; error?: string; alsoOff?: { id: string; name: string; on: boolean }[]; alsoOn?: { id: string; name: string; on: boolean }[] };
async function post(url: string, body: unknown, method = 'POST'): Promise<{ status: number; body: Answer }> {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

/** Turn a plugin on or off. Resolves to the plain result, or null when you said no. Throws with the server's sentence when it refuses. */
export async function setPluginOn(p: Pick<PluginRow, 'id' | 'name'>, on: boolean): Promise<Answer | null> {
  let r = await post(`/api/plugins/${encodeURIComponent(p.id)}`, { on });
  if (r.status === 409 && r.body.code === 'confirm') {
    const others = (on ? r.body.alsoOn : r.body.alsoOff) ?? []; const names = others.map((x) => x.name);
    const n = others.length + 1; const list = names.join(', ');
    const yes = await askConfirm(on
      ? { title: `Turn on ${p.name}?`, body: [`${p.name} needs ${list}, so ${others.length === 1 ? 'it turns' : 'they turn'} on too.`], confirm: `Turn on ${n} plugins` }
      : { title: `Turn off ${p.name}?`, body: [`${list} ${others.length === 1 ? 'needs' : 'need'} ${p.name}, so ${others.length === 1 ? 'it turns' : 'they turn'} off too.`, 'Your boards and other things you made are kept and come back when you turn it on again.'],
        confirm: `Turn off ${n} plugins`, danger: true });
    if (!yes) return null;
    r = await post(`/api/plugins/${encodeURIComponent(p.id)}`, { on, confirm: true });
  }
  if (r.status >= 400) throw new Error(r.body.error ?? 'That didn’t work. Try again.');
  await refreshAll(); return r.body;
}
export async function installPlugin(id: string): Promise<Answer> {
  const r = await post(`/api/plugins/${encodeURIComponent(id)}/install`, {});
  if (r.status >= 400) throw new Error(r.body.error ?? 'That didn’t work. Try again.');
  await refreshAll(); return r.body;
}
export async function setSafeMode(on: boolean): Promise<void> {
  const r = await post('/api/settings/safe-mode', { on }, 'PUT');
  if (r.status >= 400) throw new Error(r.body.error ?? 'That didn’t work. Try again.');
  await refreshAll();
}

/** Where a plugin's key is added: its Connections card. */
export const connectionsHref = (connection: string) => `/settings#conn-${connection}`;

/** One row's state as a short label for the page and the menu. */
export function stateLabel(p: PluginRow): { text: string; tone: 'on' | 'off' | 'warn' | 'error' | 'lock' } {
  if (p.core) return { text: 'Always on', tone: 'lock' };
  if (p.state === 'failed') return { text: 'Didn’t start', tone: 'error' };
  if (p.state === 'needs-key') return { text: 'Needs a key', tone: 'warn' };
  if (p.state === 'paused') return { text: 'Paused', tone: 'off' };
  if (p.restartNeeded) return { text: 'Applies after restart', tone: 'warn' };
  if (p.state === 'on') return { text: 'On', tone: 'on' };
  return { text: 'Off', tone: 'off' };
}
