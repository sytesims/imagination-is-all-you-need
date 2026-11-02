/**
 * Plugin placement (2026-11-01): "Drop a folder in and your workflow shows up in the app, next to the built-in ones."
 * A plugin's manifest (plugins/<id>/plugin.json, docs/PLUGINS.md) may say where it belongs: `tab` (image | video | audio | 3d), `category`
 * (one of that tab's own workflow categories, e.g. video "edit") and `goal` (a Workflows page goal id). This file turns what GET /api/tools
 * says about a plugin tool (ToolInfo.plugin) into the rows each surface already lists, so a plugin needs no hand-written line anywhere:
 *  - Video: a VideoWorkflow placed into VIDEO_WORKFLOWS (the picker, the header Video menu, ?workflow=<id>, old /tools/<id> links, search) and a
 *    bar recipe in VIDEO_BARS, so it runs in the Video page's own bar like the built-ins.
 *  - Image (2026-11-02, "an added workflow shows up in its tab as a workflow, never a page of its own"): a recipe in GET /api/image-workflows
 *    (pluginImageRecipe), so Create Image's picker lists it next to the built-ins and its bar grows only the inputs it needs; its jobs join the
 *    Image feeds (mediaFeed ADDED_IMAGE_WORKFLOWS). /image?workflow=<id> opens it; old /tools/<id> links redirect there.
 *  - Audio, 3D: a header menu row that opens the plugin's own page (an added ComfyUI workflow saves images or videos, so it lands in Image or Video).
 *  - Workflows page: a catalogue entry (WfEntry) with its Plugin badge, author and licence.
 * Isomorphic (no server imports): the web app places plugins from GET /api/tools, the server from its registry (capabilities search). One
 * mapping for both. Test: server/test/plugin-placement.test.ts.
 */
import { VIDEO_WORKFLOWS, VIDEO_WORKFLOW_CATEGORIES, videoWorkflowHref, type VideoWorkflow, type VideoWorkflowCategory } from './videoWorkflows.js';
import { WORKFLOW_CATEGORIES, type WorkflowRecipe, type WorkflowControl, type WorkflowCategory } from './workflows.js';
import { VIDEO_BARS, type VideoBar, type VBarControl } from './videoBar.js';
import { ADDED_IMAGE_WORKFLOWS } from './mediaFeed.js';
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
  license?: { id: string; name?: string } | null; input?: 'image' | 'video' | 'none'; output?: 'image' | 'video'; user?: boolean; /** a workflow you added: the model its graph loads */ mainModel?: string | null }
export interface PluginToolLike { id: string; name: string; description?: string; route?: string; plugin?: PluginInfo | null; homepageUrl?: string | null;
  inputs?: { name: string; label?: string; kind?: string; options?: string[]; default?: string; min?: number; max?: number }[]; providers?: (string | { id: string })[] }

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
 *  Every Video surface reads that list, so the picker, the header menu, links and search see them with no other change. A built-in id wins.
 *  Each also gets a bar recipe (VIDEO_BARS), so it runs in the Video page's own bar. */
export function placeVideoPlugins(tools: PluginToolLike[]): void {
  for (let i = VIDEO_WORKFLOWS.length - 1; i >= 0; i--) if (VIDEO_WORKFLOWS[i].plugin) { delete VIDEO_BARS[VIDEO_WORKFLOWS[i].id]; VIDEO_WORKFLOWS.splice(i, 1); }
  for (const t of tools) {
    if (placedTab(t) !== 'video' || VIDEO_WORKFLOWS.some((w) => w.id === t.id)) continue;
    const w = pluginVideoWorkflow(t); let at = -1; VIDEO_WORKFLOWS.forEach((x, i) => { if (x.category === w.category) at = i; });
    VIDEO_WORKFLOWS.splice(at < 0 ? VIDEO_WORKFLOWS.length : at + 1, 0, w);
    if (!VIDEO_BARS[t.id]) VIDEO_BARS[t.id] = pluginVideoBar(t);
  }
}
/** Every tab at once: Video (above) and Image (ADDED_IMAGE_WORKFLOWS + the recipes GET /api/image-workflows adds). The server calls it after
 *  loading or adding a plugin, the web app after each GET /api/tools. */
export function placePlugins(tools: PluginToolLike[]): void {
  placeVideoPlugins(tools);
  ADDED_IMAGE_WORKFLOWS.clear(); IMAGE_RECIPES.length = 0;
  for (const t of tools) { if (placedTab(t) !== 'image') continue; const r = pluginImageRecipe(t); IMAGE_RECIPES.push(r); ADDED_IMAGE_WORKFLOWS.set(t.id, { name: t.name, category: r.category }); }
}

/* ---- the settings a plugin shows (its manifest's inputs.fields), as bar controls ---- */
type FieldIn = NonNullable<PluginToolLike['inputs']>[number];
const settingFields = (t: PluginToolLike): FieldIn[] => (t.inputs ?? []).filter((i) => !RESERVED.has(i.name) && !['image', 'video', 'types'].includes(i.name) && i.kind !== 'file' && i.kind !== 'files');
/** A slider's step from its range and default: whole numbers for steps and sizes, hundredths for a 0–1 strength. */
const stepOf = (f: FieldIn) => ((f.max ?? 100) <= 1 ? 0.01 : Number.isInteger(Number(f.default ?? 0)) ? 1 : 0.1);
const hasPrompt = (t: PluginToolLike) => (t.inputs ?? []).some((i) => i.name === 'prompt');
const providersOf = (t: PluginToolLike) => (t.providers ?? ['comfy-open']).map((p) => (typeof p === 'string' ? p : p.id));
const IMAGE_CATS: WorkflowCategory[] = ['edit', 'people', 'product', 'camera'];

/** The recipes GET /api/image-workflows adds for the Image-tab plugins (filled by placePlugins, server side). */
export const IMAGE_RECIPES: (Omit<WorkflowRecipe, 'id'> & { id: string; modelInfo: Record<string, { name: string | null; workflow: null }>; prep: Record<string, never>; added: true })[] = [];
/** An Image-tab plugin as a Create Image recipe: its photo slot (when it takes one), its prompt (when it has one), its settings in one chip,
 *  its main model on the model chip, and Generate. It runs on its own tool (id = the workflow id), like every built-in recipe. */
export function pluginImageRecipe(t: PluginToolLike): (typeof IMAGE_RECIPES)[number] {
  const inp = t.plugin?.input ?? 'image'; const fields = settingFields(t); const provs = providersOf(t); const cat = t.plugin?.category as WorkflowCategory;
  const controls: WorkflowControl[] = fields.map((f) => f.kind === 'number'
    ? { field: f.name, label: f.label ?? f.name, kind: 'slider', group: 'settings', ...(f.default != null ? { default: String(f.default) } : {}), ...(f.min != null ? { min: f.min } : {}), ...(f.max != null ? { max: f.max } : {}), step: stepOf(f), unit: '' }
    : f.kind === 'select' ? { field: f.name, label: f.label ?? f.name, kind: 'select', group: 'settings', options: (f.options ?? []).map((o) => ({ value: o, label: o })), ...(f.default != null ? { default: String(f.default) } : {}) }
    : { field: f.name, label: f.label ?? f.name, kind: 'text', group: 'settings', optional: true, maxLength: 2000, ...(f.default ? { placeholder: String(f.default).slice(0, 60) } : {}) });
  const badge = pluginBadge(t)!;
  return { id: t.id, name: t.name, icon: 'create', category: IMAGE_CATS.includes(cat) ? cat : 'edit', tagline: pluginLine(t), needs: NEEDS[inp === 'video' ? 'video' : inp],
    source: { kind: t.plugin?.user ? 'yours' : 'addon', author: badge.author ?? (t.plugin?.user ? 'You' : ''), url: t.homepageUrl ?? null, licence: badge.licence, file: null, note: t.plugin?.user ? 'a workflow you added' : 'an add-on folder' },
    runner: { kind: 'create-image', toolId: t.id },
    slots: inp === 'none' ? [] : [{ name: 'image', label: 'Photo', required: true, sendsAs: inp === 'video' ? 'video' : 'image', order: 1, hint: 'Add the photo to use', missing: 'Add a photo' }],
    groups: controls.length ? [{ id: 'settings', label: 'Settings', icon: 'detail', summary: controls.filter((c) => c.kind !== 'text').slice(0, 2).map((c) => c.field) }] : [],
    controls, prompt: hasPrompt(t) ? { mode: inp === 'none' ? 'required' : 'optional', placeholder: inp === 'none' ? 'Describe what you want to see' : 'Describe the change (optional)', composer: 'plain', frames: [] } : { mode: 'hidden', placeholder: '', composer: 'plain', frames: [] },
    modes: { default: 'default', whenSlot: null }, models: { default: provs }, locked: {}, output: { aspect: inp === 'none' ? 'model' : 'follow-photo', resolution: inp === 'none' ? 'model' : 'follow-photo', count: 1 },
    surface: null, generateLabel: 'Generate', aliases: { toolId: t.id, routes: [`/tools/${t.id}`] }, status: 'ready', route: `/image?workflow=${encodeURIComponent(t.id)}`,
    modelInfo: Object.fromEntries(provs.map((p) => [p, { name: t.plugin?.mainModel ?? null, workflow: null }])), prep: {}, added: true };
}

/** A Video-tab plugin as a Video bar recipe: its clip or photo slot, its prompt (when it has one), its settings in one chip, Generate. */
export function pluginVideoBar(t: PluginToolLike): VideoBar {
  const inp = t.plugin?.input ?? 'video'; const fields = settingFields(t).filter((f) => f.name !== 'resolution');
  const controls: VBarControl[] = fields.map((f) => f.kind === 'number'
    ? { field: f.name, label: f.label ?? f.name, group: 'settings', kind: 'slider', ...(f.default != null ? { default: String(f.default) } : {}), ...(f.min != null ? { min: f.min } : {}), ...(f.max != null ? { max: f.max } : {}), step: stepOf(f) }
    : f.kind === 'select' ? { field: f.name, label: f.label ?? f.name, group: 'settings', kind: 'choice', options: (f.options ?? []).map((o) => ({ value: o, label: o })), ...(f.default != null ? { default: String(f.default) } : {}) }
    : { field: f.name, label: f.label ?? f.name, group: 'settings', kind: 'text', maxLength: 2000 });
  return { slots: inp === 'none' ? [] : [inp === 'image' ? { name: 'image', label: 'Photo', kind: 'image', required: true, hint: 'The photo to start from', missing: 'Add a photo' } : { name: 'video', label: 'Clip', kind: 'video', required: true, hint: 'The clip to work on', missing: 'Add a clip' }],
    prompt: hasPrompt(t) ? { mode: inp === 'none' ? 'required' : 'optional', placeholder: inp === 'none' ? 'Describe what you want to see' : 'Describe the change (optional)' } : { mode: 'hidden', placeholder: '' },
    groups: controls.length ? [{ id: 'settings', label: 'Settings', icon: 'resolution' }] : [], controls, generateLabel: 'Generate' };
}

/** Where a placed plugin opens: its tab with it picked (Video: its Video workflow; Image: Create Image's bar), else its own page. */
export const pluginHref = (t: PluginToolLike): string => (placedTab(t) === 'video' ? videoWorkflowHref(t.id) : placedTab(t) === 'image' ? `/image?workflow=${encodeURIComponent(t.id)}` : t.route ?? `/tools/${t.id}`);
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
