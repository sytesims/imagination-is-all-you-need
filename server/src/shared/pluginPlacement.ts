/**
 * Plugin placement (2026-11-01): "Drop a folder in and your workflow shows up in the app, next to the built-in ones."
 * A plugin's manifest (plugins/<id>/plugin.json, docs/PLUGINS.md) may say where it belongs: `tab` (image | video | audio | 3d), `category`
 * (one of that tab's own workflow categories, e.g. video "edit") and `goal` (a Workflows page goal id). This file turns what GET /api/tools
 * says about a plugin tool (ToolInfo.plugin) into the rows each surface already lists, so a plugin needs no hand-written line anywhere:
 *  - Video: a VideoWorkflow placed into VIDEO_WORKFLOWS (the picker, the header Video menu, ?workflow=<id>, old /tools/<id> links, search).
 *  - Image, Audio, 3D: a header menu row that opens the plugin's own page.
 *  - Workflows page: a catalogue entry (WfEntry) with its Plugin badge, author and licence.
 * Isomorphic (no server imports): the web app places plugins from GET /api/tools, the server from its registry (capabilities search). One
 * mapping for both. Test: server/test/plugin-placement.test.ts.
 */
import { VIDEO_WORKFLOWS, VIDEO_WORKFLOW_CATEGORIES, videoWorkflowHref, type VideoWorkflow, type VideoWorkflowCategory } from './videoWorkflows.js';
import { WORKFLOW_CATEGORIES } from './workflows.js';
import { AUDIO_WORKFLOW_CATEGORIES } from './audioWorkflows.js';
import { THREE_D_CATEGORIES } from './threeD.js';
import type { WfEntry, WfCat } from './workflowCatalog.js';

export const PLUGIN_TABS = ['image', 'video', 'audio', '3d'] as const;
export type PluginTab = (typeof PLUGIN_TABS)[number];
const cats = (l: { id: string }[]) => l.map((c) => c.id).filter((id) => id !== 'all');
/** Each tab's own workflow categories (the ones its picker shows), the only values `category` may take with that tab. */
export const PLUGIN_CATEGORIES: Record<PluginTab, string[]> = { image: cats(WORKFLOW_CATEGORIES), video: cats(VIDEO_WORKFLOW_CATEGORIES), audio: cats(AUDIO_WORKFLOW_CATEGORIES), '3d': cats(THREE_D_CATEGORIES) };
export const TAB_LABEL: Record<PluginTab, string> = { image: 'Image', video: 'Video', audio: 'Audio', '3d': '3D' };
/** A goal id: the Workflows page goals (shared/workflowGoals.ts WF_GOALS once it lands: create, shop, ads, people, film, music, fix). Checked by shape here. */
const GOAL_RE = /^[a-z][a-z-]{1,23}$/;

/** What the badge on every plugin row says. */
export interface PluginBadge { author: string | null; licence: string; /** the manifest ships a handler (code that runs in the app's server) */ runsCode: boolean;
  /** you added it in the app ("Added by you"); otherwise its folder ships with the app ("Add-on") */ user?: boolean }
/** What GET /api/tools says about a plugin tool (ToolInfo.plugin), placement included. */
export interface PluginInfo { id: string; tab?: PluginTab | null; category?: string | null; goal?: string | null; author?: string | null; handler?: boolean;
  license?: { id: string; name?: string } | null; input?: 'image' | 'video' | 'none'; output?: 'image' | 'video'; user?: boolean }
export interface PluginToolLike { id: string; name: string; description?: string; route?: string; plugin?: PluginInfo | null; inputs?: { name: string; label?: string }[] }

/** Errors in the placement fields of a manifest (empty = fine). `category` keeps its old free-form meaning (the tool's group) when there is no `tab`. */
export function placementErrors(m: { tab?: unknown; category?: unknown; goal?: unknown; author?: unknown }): string[] {
  const e: string[] = [];
  if (m.tab != null) {
    if (!PLUGIN_TABS.includes(m.tab as PluginTab)) e.push(`tab must be one of ${PLUGIN_TABS.join(', ')}`);
    else if (!PLUGIN_CATEGORIES[m.tab as PluginTab].includes(String(m.category))) e.push(`category must be one of the ${TAB_LABEL[m.tab as PluginTab]} tab's categories: ${PLUGIN_CATEGORIES[m.tab as PluginTab].join(', ')}`);
  }
  if (m.goal != null && !(typeof m.goal === 'string' && GOAL_RE.test(m.goal))) e.push('goal must be a goal id like "fix" or "create"');
  if (m.author != null && !(typeof m.author === 'string' && m.author.trim() && m.author.length <= 80)) e.push('author must be a short name');
  return e;
}

export const placedTab = (t: PluginToolLike): PluginTab | null => (t.plugin?.tab && PLUGIN_TABS.includes(t.plugin.tab) ? t.plugin.tab : null);
export const pluginBadge = (t: PluginToolLike): PluginBadge | null => t.plugin ? { author: t.plugin.author ?? null, licence: t.plugin.license?.name ?? t.plugin.license?.id ?? 'Unknown licence', runsCode: !!t.plugin.handler, user: !!t.plugin.user } : null;
/** The one-line tagline: the description's first sentence. */
export const pluginLine = (t: PluginToolLike): string => { const d = (t.description ?? '').trim(); const s = d.split(/(?<=[.!?])\s|:\s/)[0].replace(/[.!?]$/, ''); return s || t.name; };
const RESERVED = new Set(['video', 'image', 'types', 'prompt', 'resolution', 'seed', 'provider', 'rights', 'draft', 'duration', 'steps', 'enhance']);
const NEEDS = { video: '1 clip', image: '1 photo', none: 'Prompt' } as const;
const optionLabels = (t: PluginToolLike) => (t.inputs ?? []).filter((i) => !RESERVED.has(i.name) && i.label).map((i) => i.label!);

/** A video-tab plugin as a Video workflow (same id as its tool, so /video?workflow=<id> opens it and /tools/<id> redirects there). */
export function pluginVideoWorkflow(t: PluginToolLike): VideoWorkflow {
  const inp = t.plugin?.input ?? 'video'; const opts = optionLabels(t); const cat = t.plugin?.category as VideoWorkflowCategory;
  return { id: t.id, name: t.name, toolId: t.id, category: PLUGIN_CATEGORIES.video.includes(cat) ? cat : 'apps', tagline: pluginLine(t), needs: NEEDS[inp],
    inputs: [inp === 'none' ? 'Prompt' : inp === 'image' ? 'Photo' : 'Clip', ...opts], oldRoutes: [`/tools/${t.id}`], inMenu: true, plugin: pluginBadge(t)!,
    how: [inp === 'none' ? ['Write a prompt', 'Say what you want to see.'] : [inp === 'image' ? 'Add a photo' : 'Add your clip', 'Upload one, pick it from your media, or use a result.'], ['Pick the options', opts.length ? `${opts.join(', ')}, or keep the defaults.` : 'Or keep the defaults.'],
      ['Generate', 'Runs on your own ComfyUI. Without one you get a sample.']] };
}

/** Puts the video-tab plugins into VIDEO_WORKFLOWS (in place, next to the built-ins of the same category), replacing the ones placed before.
 *  Every Video surface reads that list, so the picker, the header menu, links and search see them with no other change. A built-in id wins. */
export function placeVideoPlugins(tools: PluginToolLike[]): void {
  for (let i = VIDEO_WORKFLOWS.length - 1; i >= 0; i--) if (VIDEO_WORKFLOWS[i].plugin) VIDEO_WORKFLOWS.splice(i, 1);
  for (const t of tools) {
    if (placedTab(t) !== 'video' || VIDEO_WORKFLOWS.some((w) => w.id === t.id)) continue;
    const w = pluginVideoWorkflow(t); let at = -1; VIDEO_WORKFLOWS.forEach((x, i) => { if (x.category === w.category) at = i; });
    VIDEO_WORKFLOWS.splice(at < 0 ? VIDEO_WORKFLOWS.length : at + 1, 0, w);
  }
}

/** Where a placed plugin opens: its Video workflow, else its own page. */
export const pluginHref = (t: PluginToolLike): string => (placedTab(t) === 'video' ? videoWorkflowHref(t.id) : t.route ?? `/tools/${t.id}`);
/** Header menu rows for a tab other than Video (Video's come from VIDEO_WORKFLOWS). */
export const pluginMenuRows = (tools: PluginToolLike[], tab: PluginTab) => tools.filter((t) => placedTab(t) === tab).map((t) => ({ key: t.id, to: pluginHref(t), name: t.name, line: pluginLine(t), toolId: t.id, plugin: pluginBadge(t)! }));

/** The Workflows page category a plugin lands in, from its tab and category. */
const WF_CAT: Record<PluginTab, Record<string, WfCat>> = {
  video: { create: 'video', edit: 'clip', motion: 'character', camera: 'video', apps: 'video' },
  image: { edit: 'photo', people: 'character', product: 'product', camera: 'image' },
  audio: { create: 'music', voice: 'talk', video: 'music' },
  '3d': { create: '3d', edit: '3d', video: '3d' },
};
const PREFIX: Record<PluginTab, string> = { video: 'v', image: 'i', audio: 'a', '3d': 'd' };
/** Workflows page entries for every placed plugin (id `<v|i|a|d>-<tool id>`, like the built-ins), with their badge, author and licence. */
export function pluginWfEntries(tools: PluginToolLike[]): WfEntry[] {
  return tools.flatMap((t) => { const tab = placedTab(t); if (!tab) return [];
    const w = tab === 'video' ? pluginVideoWorkflow(t) : null;
    return [{ id: `${PREFIX[tab]}-${t.id}`, source: `plugin:${t.id}`, name: t.name, line: pluginLine(t), cat: WF_CAT[tab][t.plugin?.category ?? ''] ?? (tab === 'video' ? 'clip' : tab === 'image' ? 'photo' : tab === 'audio' ? 'music' : '3d'),
      tags: ['plugin', ...(t.plugin?.user ? ['added by you', 'your workflow'] : []), ...(t.plugin?.author ? [t.plugin.author] : [])], medium: tab, toolId: t.id, href: pluginHref(t), models: [], needs: w?.needs ?? NEEDS[t.plugin?.input ?? 'image'], how: w?.how,
      art: t.plugin?.input === 'video' ? 'video' : 'object', goal: t.plugin?.goal ?? undefined, plugin: pluginBadge(t)! } satisfies WfEntry];
  });
}
