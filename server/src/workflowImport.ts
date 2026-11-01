/**
 * Add a workflow (2026-11-01): drop in a ComfyUI workflow file and it becomes a normal workflow in its tab, with no code or folders.
 *  1. readWorkflow: the API format ("Export (API)") as is; the saved format (nodes + links) converted with ComfyUI's own node list
 *     (your running ComfyUI, else the node list that ships with the app), or plain help to export the API version.
 *  2. guessMapping: which node takes the photo or clip, the prompt, the seed, which node saves the result, and the settings worth showing.
 *  3. saveWorkflow: plugin.json + workflow.json + node-map.json (never a handler or script), checked by the loader's own rules
 *     (plugins.ts validateManifest), written into USER_PLUGINS_DIR and loaded at once (addPluginFolder): no restart.
 * Routes: routesWorkflowImport.ts. Test: server/test/workflow-import.test.ts.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { USER_PLUGINS_DIR, WORKFLOWS_DIR } from './config.js';
import { toolIdTaken } from './tools/registry.js';
import { LICENSES } from './licenses.js';
import { hasFileKey, pluginOutKind } from './pluginGraph.js';
import { addPluginFolder, isUserPluginDir, pluginStatus, removePlugin, validateManifest } from './plugins.js';
import { PLUGIN_CATEGORIES, PLUGIN_TABS, TAB_LABEL, type PluginTab } from './shared/pluginPlacement.js';

/** The biggest workflow file the app takes (ComfyUI graphs are a few hundred KB at most). */
export const MAX_WORKFLOW_BYTES = 2 * 1024 * 1024;
const ID_RE = /^[a-z][a-z0-9-]{1,39}$/;

type Graph = Record<string, { class_type: string; inputs: Record<string, any>; _meta?: { title?: string } }>;
const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const isLink = (v: unknown): v is [string, number] => Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && typeof v[1] === 'number';
const isApi = (g: unknown): g is Graph => isObj(g) && Object.keys(g).length > 0 && Object.values(g).every((n) => isObj(n) && typeof n.class_type === 'string' && isObj(n.inputs));
const isUi = (g: unknown) => isObj(g) && Array.isArray(g.nodes) && Array.isArray(g.links);

// ---- 1. Read ----

export const EXPORT_HELP = 'This is the saved (editor) format. In ComfyUI, open the workflow, then use Workflow › Export (API) and add that file here.';
export type ReadResult = { graph: Graph; format: 'api' | 'ui'; convertedWith?: 'comfyui' | 'built-in' } | { error: string; help?: string };

/** A dropped file (text or parsed) → an API-format graph, or a plain error. `objectInfo` = ComfyUI's node list for the saved format. */
export function readWorkflow(input: unknown, objectInfo?: { info: Record<string, any>; from: 'comfyui' | 'built-in' } | null): ReadResult {
  let j: unknown = input;
  if (typeof input === 'string') {
    if (Buffer.byteLength(input) > MAX_WORKFLOW_BYTES) return { error: `That file is too big (over ${MAX_WORKFLOW_BYTES / 1024 / 1024} MB). A ComfyUI workflow is usually much smaller.` };
    try { j = JSON.parse(input); } catch { return { error: 'That isn’t a ComfyUI workflow: the file isn’t valid JSON.' }; }
  } else if (JSON.stringify(input ?? null).length > MAX_WORKFLOW_BYTES) return { error: `That file is too big (over ${MAX_WORKFLOW_BYTES / 1024 / 1024} MB).` };
  /* some exports wrap the graph: { prompt: {...} } (ComfyUI's /prompt body) or { output: {...} } */
  if (isObj(j) && !isApi(j) && !isUi(j)) { const inner = (j as any).prompt ?? (j as any).output; if (isApi(inner)) j = inner; }
  if (hasFileKey(j)) return { error: 'This workflow has "__file" entries. The app fills in your photos and clips itself, so it can’t take this file.' };
  if (isApi(j)) return { graph: j, format: 'api' };
  if (isUi(j)) {
    if (!objectInfo) return { error: 'This is the saved format, not the API one.', help: EXPORT_HELP };
    const r = uiToApi(j as any, objectInfo.info);
    if ('error' in r) return { error: r.error, help: EXPORT_HELP };
    if (hasFileKey(r.graph)) return { error: 'This workflow has "__file" entries. The app fills in your photos and clips itself, so it can’t take this file.' };
    return { graph: r.graph, format: 'ui', convertedWith: objectInfo.from };
  }
  return { error: 'That isn’t a ComfyUI workflow. Export it from ComfyUI with Workflow › Export (API).' };
}

/** The node list that ships with the app (ComfyUI's core nodes), for converting the saved format when your ComfyUI isn't running. */
let builtInInfo: Record<string, any> | null = null;
export function builtInObjectInfo(): Record<string, any> | null {
  if (!builtInInfo) { try { builtInInfo = JSON.parse(readFileSync(path.resolve(WORKFLOWS_DIR, '../readiness/stub/object_info.json'), 'utf8')); } catch { builtInInfo = null; } }
  return builtInInfo;
}

const WIDGET_TYPES = new Set(['INT', 'FLOAT', 'STRING', 'BOOLEAN', 'COMBO']);
/** Nodes that only live in the editor (notes, reroutes, editor-only primitives): never part of the API graph. */
const FRONTEND_ONLY = new Set(['Note', 'MarkdownNote', 'Reroute', 'PrimitiveNode', 'Label (rgthree)', 'Fast Groups Bypasser (rgthree)', 'Fast Groups Muter (rgthree)']);
/**
 * Saved format → API format, the same steps as scripts/ui2api.py: widget values in the order ComfyUI declares the inputs (skipping the
 * "control after generate" and upload extras), links followed through reroutes, bypassed nodes and subgraphs, muted and bypassed nodes dropped,
 * unused non-output nodes pruned. Refuses (with the export help) when a node isn't in the node list, rather than guessing.
 */
export function uiToApi(ui: { nodes: any[]; links: any[]; definitions?: { subgraphs?: any[] } }, oi: Record<string, any>): { graph: Graph } | { error: string } {
  const subs = new Map<string, any>((ui.definitions?.subgraphs ?? []).map((s: any) => [s.id, s]));
  const unknown = new Set<string>(); const api: Graph = {};
  const specIn = (t: string) => oi[t]?.input ?? {};
  const assign = (inp: any, vals: any[], out: Record<string, any>, prefix: string) => {
    for (const sect of ['required', 'optional']) for (const [name, val] of Object.entries<any>(inp?.[sect] ?? {})) {
      const t = val?.[0]; const opts = isObj(val?.[1]) ? val[1] : {};
      if (t === 'COMFY_DYNAMICCOMBO_V3') { if (!vals.length) return; const v = vals.shift(); out[prefix + name] = v; for (const o of opts.options ?? []) if (o.key === v) assign(o.inputs ?? {}, vals, out, `${prefix}${name}.`); continue; }
      if (Array.isArray(t) || WIDGET_TYPES.has(t)) {
        if (!vals.length) return; out[prefix + name] = vals.shift();
        if (t === 'INT' && (opts.control_after_generate || name === 'seed' || name === 'noise_seed') && ['fixed', 'randomize', 'increment', 'decrement'].includes(vals[0])) vals.shift();
        if ((opts.image_upload || opts.video_upload || opts.audio_upload) && ['image', 'video', 'audio'].includes(vals[0])) vals.shift();
      }
    }
  };
  const widgetNames = (t: string) => { const names: string[] = []; for (const sect of ['required', 'optional']) for (const [name, val] of Object.entries<any>(specIn(t)[sect] ?? {})) { const ty = val?.[0]; if (Array.isArray(ty) || WIDGET_TYPES.has(ty) || ty === 'COMFY_DYNAMICCOMBO_V3') names.push(name); } return names; };
  const normLinks = (g: any) => { const m = new Map<number, any>(); for (const l of g.links ?? []) { if (Array.isArray(l)) m.set(l[0], { id: l[0], origin_id: l[1], origin_slot: l[2], target_id: l[3], target_slot: l[4] }); else if (isObj(l)) m.set(l.id, l); } return m; };
  type Ctx = { g: any; prefix: string; parent: Ctx | null; inst: any; nodes: Map<any, any>; links: Map<number, any> };
  const mk = (g: any, prefix: string, parent: Ctx | null, inst: any): Ctx => ({ g, prefix, parent, inst, nodes: new Map((g.nodes ?? []).map((n: any) => [n.id, n])), links: normLinks(g) });
  let depth = 0;
  const resolve = (ctx: Ctx, originId: any, slot: number): [string, number] | null => {
    if (++depth > 5000) throw new Error('loop');
    try {
      if (originId === -10) { const name = ctx.g.inputs?.[slot]?.name; const par = ctx.parent; if (!par) return null;
        for (const inp of ctx.inst?.inputs ?? []) if (inp.name === name && inp.link != null) { const l = par.links.get(inp.link); return l ? resolve(par, l.origin_id, l.origin_slot) : null; }
        return null; }
      const n = ctx.nodes.get(originId); if (!n) return null;
      if (subs.has(n.type)) { const inner = mk(subs.get(n.type), `${ctx.prefix}${n.id}:`, ctx, n);
        for (const l of inner.links.values()) if (l.target_id === -20 && l.target_slot === slot) return resolve(inner, l.origin_id, l.origin_slot);
        return null; }
      if ((n.mode ?? 0) === 4) { const ot = n.outputs?.[slot]?.type; for (const inp of n.inputs ?? []) if (inp.type === ot && inp.link != null) { const l = ctx.links.get(inp.link); return l ? resolve(ctx, l.origin_id, l.origin_slot) : null; } return null; }
      if (n.type === 'Reroute') { const l = ctx.links.get(n.inputs?.[0]?.link); return l ? resolve(ctx, l.origin_id, l.origin_slot) : null; }
      return [`${ctx.prefix}${n.id}`, slot];
    } finally { depth--; }
  };
  const emit = (ctx: Ctx, level = 0) => {
    if (level > 8) throw new Error('subgraphs nested too deep');
    for (const n of ctx.g.nodes ?? []) {
      if ([2, 4].includes(n.mode ?? 0)) continue;
      if (subs.has(n.type)) { emit(mk(subs.get(n.type), `${ctx.prefix}${n.id}:`, ctx, n), level + 1); continue; }
      if (FRONTEND_ONLY.has(n.type)) continue;
      if (!oi[n.type]) { unknown.add(String(n.type)); continue; }
      const inputs: Record<string, any> = {}; const wv = n.widgets_values ?? [];
      if (isObj(wv)) { const ok = new Set(widgetNames(n.type)); for (const [k, v] of Object.entries(wv)) if (ok.has(k)) inputs[k] = v; }
      else if (Array.isArray(wv)) assign(specIn(n.type), [...wv], inputs, '');
      for (const inp of n.inputs ?? []) { if (inp.link == null) continue; const l = ctx.links.get(inp.link); const src = l ? resolve(ctx, l.origin_id, l.origin_slot) : null; if (src) inputs[inp.name] = src; }
      api[`${ctx.prefix}${n.id}`] = { inputs, class_type: n.type, _meta: { title: n.title || oi[n.type]?.display_name || n.type } };
    }
  };
  try { emit(mk(ui, '', null, null)); } catch { return { error: 'This saved workflow couldn’t be read.' }; }
  if (unknown.size) return { error: `Some nodes aren’t known here (${[...unknown].slice(0, 4).join(', ')}${unknown.size > 4 ? '…' : ''}).` };
  for (let changed = true; changed;) { changed = false;
    const used = new Set(Object.values(api).flatMap((n) => Object.values(n.inputs).filter((v) => isLink(v) && api[v[0]]).map((v) => (v as [string, number])[0])));
    for (const k of Object.keys(api)) if (!used.has(k) && !oi[api[k].class_type]?.output_node) { delete api[k]; changed = true; } }
  if (!Object.keys(api).length) return { error: 'This saved workflow has no nodes that make anything.' };
  return { graph: api };
}

// ---- 2. Guess ----

export type Role = 'input' | 'prompt' | 'seed' | 'output';
/** One node a role can point at: `ref` is "<node>.<field>" ("<node>" for the output). */
export interface NodeChoice { ref: string; node: string; field?: string; label: string; classType: string; kind?: 'image' | 'video' }
export interface Extra { key: string; label: string; node: string; field: string; kind: 'number' | 'text'; value: number | string; on: boolean; min?: number; max?: number }
export interface Guess { input: 'image' | 'video' | 'none'; output: 'image' | 'video'; tab: PluginTab; category: string; name: string; description: string;
  choices: Record<Role, NodeChoice[]>; pick: Partial<Record<Role, string>>; extras: Extra[]; nodeTypes: string[] }

/** "Save Image #9", or "My prompt (CLIPTextEncode) #6" when the title is the author's own. */
const titleOf = (id: string, n: Graph[string]) => { const t = (n._meta?.title ?? '').trim(); const plain = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${!t ? n.class_type : plain(t).startsWith(plain(n.class_type)) || plain(n.class_type).startsWith(plain(t)) ? t : `${t} (${n.class_type})`} #${id}`; };
const VIDEO_LOADER = /LoadVideo/i; const IMAGE_LOADER = /^LoadImage(?!Mask)/;
const SAVE = /^(Save|Preview)(Image|Video|AnimatedWEBP|AnimatedPNG|WEBM)|^VHS_VideoCombine$|^Image Save$/;
const TEXT_FIELDS = ['text', 'prompt', 'text_g', 'positive_prompt', 'string', 'value'];
const TEXT_NODE = /Text|Prompt|CLIP|String|Encode/i;
const SAMPLER = /KSampler|RandomNoise|SamplerCustom|Sampler/i;
const isPrim = (g: Graph, v: unknown) => isLink(v) && !!g[v[0]] && /^Primitive/.test(g[v[0]].class_type);
/** A number setting: a plain number, or a link to a Primitive holding one (the mapping writes through to the Primitive). */
const numOf = (g: Graph, v: unknown): number | null => (typeof v === 'number' ? v : isPrim(g, v) && typeof g[(v as [string, number])[0]].inputs.value === 'number' ? g[(v as [string, number])[0]].inputs.value : null);

/** Every node upstream of a value (following links). */
function upstream(g: Graph, starts: unknown[]): Set<string> {
  const seen = new Set<string>(); const q = starts.filter(isLink).map((l) => l[0]);
  while (q.length) { const id = q.pop()!; if (seen.has(id) || !g[id]) continue; seen.add(id); for (const v of Object.values(g[id].inputs)) if (isLink(v)) q.push(v[0]); }
  return seen;
}
const EXTRAS: { key: string; label: string; fields: string[]; node?: RegExp; min: number; max: number; on: boolean; text?: boolean }[] = [
  { key: 'width', label: 'Width', fields: ['width'], node: /Latent|Empty|Size|Resize|Image/i, min: 16, max: 16384, on: true },
  { key: 'height', label: 'Height', fields: ['height'], node: /Latent|Empty|Size|Resize|Image/i, min: 16, max: 16384, on: true },
  { key: 'sampleSteps', label: 'Steps', fields: ['steps'], node: /Sampler|Scheduler/i, min: 1, max: 200, on: true },
  { key: 'cfg', label: 'Guidance (CFG)', fields: ['cfg', 'guidance'], node: /Sampler|Guider|Guidance/i, min: 0, max: 100, on: false },
  { key: 'denoise', label: 'Strength (denoise)', fields: ['denoise'], node: /Sampler|Scheduler/i, min: 0, max: 1, on: false },
  { key: 'frames', label: 'Frames', fields: ['length', 'num_frames', 'frame_count', 'frames'], node: /Latent|Empty|ToVideo|Video$/i, min: 1, max: 2000, on: false },
  { key: 'fps', label: 'Frame rate', fields: ['fps', 'frame_rate'], min: 1, max: 240, on: false },
];
const nice = (s: string) => s.replace(/\.json$/i, '').replace(/[-_ ]?api$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 60);

/** Guess the mapping from the graph alone. Every role lists the nodes it could be; `pick` is the best guess ("" = none). */
export function guessMapping(g: Graph, fileName = ''): Guess {
  const ids = Object.keys(g);
  // input: photo and clip loaders
  const input: NodeChoice[] = [];
  for (const id of ids) { const n = g[id];
    if (VIDEO_LOADER.test(n.class_type)) { const f = ['file', 'video'].find((k) => typeof n.inputs[k] === 'string'); if (f) input.push({ ref: `${id}.${f}`, node: id, field: f, label: titleOf(id, n), classType: n.class_type, kind: 'video' }); }
    else if (IMAGE_LOADER.test(n.class_type) && typeof n.inputs.image === 'string') input.push({ ref: `${id}.image`, node: id, field: 'image', label: titleOf(id, n), classType: n.class_type, kind: 'image' });
  }
  // conditioning: what feeds the samplers' positive and negative inputs
  const pos: unknown[] = []; const neg: unknown[] = [];
  for (const n of Object.values(g)) { for (const [k, v] of Object.entries(n.inputs)) { if (k === 'positive' || (k === 'conditioning' && /Guider/i.test(n.class_type))) pos.push(v); else if (k === 'negative') neg.push(v); } }
  const P = upstream(g, pos); const N = upstream(g, neg);
  const texts: (NodeChoice & { score: number; value: string })[] = [];
  for (const id of ids) { const n = g[id]; if (IMAGE_LOADER.test(n.class_type) || VIDEO_LOADER.test(n.class_type) || SAVE.test(n.class_type)) continue;
    for (const f of TEXT_FIELDS) { const v = n.inputs[f]; if (typeof v !== 'string' && !isPrim(g, v)) continue;
      /* "text" and "prompt" on any node (CLIPTextEncode, a model's own encoder); the generic names only on text nodes */
      if (!['text', 'prompt', 'positive_prompt'].includes(f) && !TEXT_NODE.test(n.class_type)) continue; if (f === 'value' && !/^Primitive/.test(n.class_type)) continue;
      const value = typeof v === 'string' ? v : String(g[(v as [string, number])[0]].inputs.value ?? '');
      texts.push({ ref: `${id}.${f}`, node: id, field: f, label: titleOf(id, n), classType: n.class_type, value, score: (P.has(id) ? 2 : 0) + (N.has(id) ? 0 : 1) + (value.trim() ? 0.5 : 0) }); break; } }
  /* a Primitive that a text node already reads is the same prompt: keep the text node (the mapping writes through to the Primitive) */
  const fed = new Set(texts.flatMap((t) => { const v = g[t.node].inputs[t.field!]; return isLink(v) ? [v[0]] : []; }));
  const prompt = texts.filter((t) => !fed.has(t.node)).sort((a, b) => b.score - a.score);
  // seed
  const seeds: (NodeChoice & { score: number })[] = [];
  for (const id of ids) { const n = g[id]; for (const f of ['seed', 'noise_seed']) { const v = n.inputs[f]; if (typeof v === 'number' || isPrim(g, v)) { seeds.push({ ref: `${id}.${f}`, node: id, field: f, label: titleOf(id, n), classType: n.class_type, score: SAMPLER.test(n.class_type) ? 1 : 0 }); break; } } }
  seeds.sort((a, b) => b.score - a.score);
  // output
  const outs = ids.filter((id) => SAVE.test(g[id].class_type)).map((id) => ({ ref: id, node: id, label: titleOf(id, g[id]), classType: g[id].class_type }))
    .sort((a, b) => Number(/^Preview/.test(a.classType)) - Number(/^Preview/.test(b.classType)));
  const outKind = pluginOutKind(g, outs[0] ? { inputs: {}, output: { node: outs[0].node } } : null);
  // settings worth showing
  const extras: Extra[] = []; const used = new Set<string>();
  const sampler = ids.find((id) => /KSampler|SamplerCustom/.test(g[id].class_type));
  for (const x of EXTRAS) {
    const has = (i: string) => x.fields.some((f) => numOf(g, g[i].inputs[f]) != null);
    const id = (x.key === 'sampleSteps' || x.key === 'cfg' || x.key === 'denoise') && sampler && has(sampler) ? sampler : ids.find((i) => (!x.node || x.node.test(g[i].class_type)) && has(i));
    if (!id) continue; const f = x.fields.find((k) => numOf(g, g[id].inputs[k]) != null)!; if (used.has(`${id}.${f}`)) continue; used.add(`${id}.${f}`);
    extras.push({ key: x.key, label: x.label, node: id, field: f, kind: 'number', value: numOf(g, g[id].inputs[f])!, on: x.on, min: x.min, max: x.max });
  }
  const negText = texts.filter((t) => N.has(t.node) && !P.has(t.node) && typeof g[t.node].inputs[t.field!] === 'string')[0];
  if (negText) extras.push({ key: 'negative', label: 'Negative prompt', node: negText.node, field: negText.field!, kind: 'text', value: negText.value, on: false });
  const inp = input[0]?.kind ?? 'none'; const tab: PluginTab = outKind === 'video' ? 'video' : 'image';
  const category = tab === 'video' ? (inp === 'video' ? 'edit' : 'create') : PLUGIN_CATEGORIES.image.includes('edit') ? 'edit' : PLUGIN_CATEGORIES.image[0];
  const what = outKind === 'video' ? 'a video' : 'an image';
  const description = inp === 'none' ? `Makes ${what} from a prompt.` : inp === 'image' ? `Makes ${what} from your photo.` : `Makes ${what} from your clip.`;
  const strip = (c: NodeChoice & { score?: number; value?: string }): NodeChoice => { const { score: _s, value: _v, ...rest } = c; void _s; void _v; return rest; };
  return { input: inp, output: outKind, tab, category, name: nice(fileName) || 'My workflow', description,
    choices: { input, prompt: prompt.map(strip), seed: seeds.map(strip), output: outs },
    pick: { input: input[0]?.ref ?? '', prompt: prompt[0]?.ref ?? '', seed: seeds[0]?.ref ?? '', output: outs[0]?.ref ?? '' }, extras,
    nodeTypes: [...new Set(Object.values(g).map((n) => n.class_type))].sort() };
}

// ---- 3. Save ----

export interface SaveBody { workflow: unknown; fileName?: string; name?: string; description?: string; tab?: string; category?: string;
  input?: string | null; prompt?: string | null; seed?: string | null; output?: string; extras?: string[]; license?: string; source?: string }
export type SaveResult = { ok: true; id: string; tab: PluginTab; errors?: undefined } | { ok: false; error: string; field?: string; errors?: string[] };

/** "My Cool Look!" → "my-cool-look". Only a-z, 0-9 and dashes ever reach the disk. */
export const slugId = (name: string) => name.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/^[^a-z]+/, '').slice(0, 40).replace(/-+$/, '');
const cleanUrl = (u: string | undefined) => { const s = String(u ?? '').trim(); if (!s) return null; try { const x = new URL(s); return /^https?:$/.test(x.protocol) ? x.href.slice(0, 500) : undefined; } catch { return undefined; } };

/** Checks the form, builds the folder, validates it with the loader's rules, writes it into USER_PLUGINS_DIR and loads it. */
export async function saveWorkflow(b: SaveBody, objectInfo?: Parameters<typeof readWorkflow>[1]): Promise<SaveResult> {
  const r = readWorkflow(b.workflow, objectInfo ?? null); if ('error' in r) return { ok: false, error: r.error, field: 'workflow' };
  const g = r.graph; const guess = guessMapping(g, b.fileName);
  const name = String(b.name ?? '').replace(/\s+/g, ' ').trim(); if (!name || name.length > 60) return { ok: false, error: 'Give it a name (up to 60 characters).', field: 'name' };
  const id = slugId(name); if (!ID_RE.test(id)) return { ok: false, error: 'Use a name with at least two letters or numbers.', field: 'name' };
  const mine = pluginStatus().find((s) => s.id === id && s.user);
  if (mine || existsSync(path.join(USER_PLUGINS_DIR, id))) return { ok: false, error: 'You already added a workflow with this name. Pick another name.', field: 'name' };
  if (toolIdTaken(id) || pluginStatus().some((s) => s.id === id)) return { ok: false, error: 'A built-in workflow already uses this name. Pick another name.', field: 'name' };
  const description = String(b.description ?? '').replace(/\s+/g, ' ').trim().slice(0, 300) || guess.description;
  const tab = String(b.tab ?? guess.tab) as PluginTab; if (!PLUGIN_TABS.includes(tab)) return { ok: false, error: 'Pick a tab.', field: 'tab' };
  const category = String(b.category ?? ''); if (!PLUGIN_CATEGORIES[tab].includes(category)) return { ok: false, error: `Pick one of the ${TAB_LABEL[tab]} tab’s groups.`, field: 'category' };
  const pick = (role: Role, v: string | null | undefined): NodeChoice | null | 'bad' => { if (!v) return null; return guess.choices[role].find((c) => c.ref === v) ?? 'bad'; };
  const inp = pick('input', b.input); const prm = pick('prompt', b.prompt); const sd = pick('seed', b.seed); const out = pick('output', b.output ?? guess.pick.output);
  for (const [k, v] of [['input', inp], ['prompt', prm], ['seed', sd], ['output', out]] as const) if (v === 'bad') return { ok: false, error: `That ${k} node isn’t in this workflow.`, field: k };
  if (!out || out === 'bad') return { ok: false, error: 'This workflow has no node that saves an image or a video (Save Image, Save Video or Video Combine).', field: 'output' };
  const input = inp && inp !== 'bad' ? inp.kind! : 'none';
  const outKind = pluginOutKind(g, { inputs: {}, output: { node: out.node } });
  const extras = guess.extras.filter((x) => (b.extras ?? []).includes(x.key));
  const licName = String(b.license ?? '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Your own';
  const source = cleanUrl(b.source); if (source === undefined) return { ok: false, error: 'The source link must start with http:// or https://.', field: 'source' };
  const known = Object.values(LICENSES).find((l) => l.id === licName.toLowerCase() || l.name.toLowerCase() === licName.toLowerCase());
  const licId = known?.id ?? `${id}-licence`;
  const ref = (c: NodeChoice | null | 'bad') => (c && c !== 'bad' ? { node: c.node, field: c.field! } : undefined);
  const nodeMap = { inputs: { ...(input !== 'none' ? { [input]: ref(inp) } : {}), ...(prm && prm !== 'bad' ? { prompt: ref(prm) } : {}), ...(sd && sd !== 'bad' ? { seed: ref(sd) } : {}) },
    ...(extras.length ? { fields: Object.fromEntries(extras.map((x) => [x.key, { node: x.node, field: x.field }])) } : {}), output: { node: out.node } };
  const manifest = {
    schema: 1, id, name, version: '1.0.0', tab, category, description, input, output: outKind,
    inputs: { prompt: !!(prm && prm !== 'bad'), resolutions: ['720p'], ...(extras.length ? { fields: extras.map((x) => ({ name: x.key, label: x.label, kind: x.kind, default: x.value, ...(x.kind === 'number' ? { min: x.min, max: x.max } : { maxLength: 2000 }) })) } : {}) },
    presets: [{ id: 'default', label: name, prompt: '' }],
    license: { id: licId }, ...(known ? {} : { licenses: [{ id: licId, name: licName, osi: false, url: source ?? null }] }),
    ...(source ? { homepageUrl: source, components: [{ kind: 'code', name: 'ComfyUI workflow', license: licId, url: source }] } : {}),
    pricing: { gpuSecPerSec: { '720p': outKind === 'video' ? 6 : 2 } }, providers: ['comfy-open'],
    workflow: 'workflow.json', nodeMap: 'node-map.json',
  };
  // write into a hidden folder first (the loader skips dot folders), validate there, then move it into place
  const root = path.resolve(USER_PLUGINS_DIR); const dir = path.join(root, id);
  if (path.dirname(dir) !== root || !isUserPluginDir(dir)) return { ok: false, error: 'That name can’t be used for a folder.', field: 'name' };
  mkdirSync(root, { recursive: true });
  const tmp = path.join(root, `.add-${id}-${randomBytes(4).toString('hex')}`); mkdirSync(tmp);
  try {
    writeFileSync(path.join(tmp, 'workflow.json'), JSON.stringify(g, null, 2) + '\n');
    writeFileSync(path.join(tmp, 'node-map.json'), JSON.stringify(nodeMap, null, 2) + '\n');
    writeFileSync(path.join(tmp, 'plugin.json'), JSON.stringify(manifest, null, 2) + '\n');
    const v = validateManifest(manifest, tmp);
    if (v.errors.length) { rmSync(tmp, { recursive: true, force: true }); return { ok: false, error: 'This workflow doesn’t fit yet. See what to fix below.', errors: v.errors }; }
    renameSync(tmp, dir);
  } catch (x: any) { rmSync(tmp, { recursive: true, force: true }); return { ok: false, error: `Couldn’t save it: ${x?.message ?? x}` }; }
  const st = await addPluginFolder(dir, true);
  if (!st.ok) { removePlugin(st.id); rmSync(dir, { recursive: true, force: true }); return { ok: false, error: 'It saved, but couldn’t load. See what to fix below.', errors: st.errors }; }
  return { ok: true, id, tab };
}

/** Remove a workflow you added: out of the app, then its folder. Shipped folders (plugins/) are never deleted here. */
export function removeWorkflow(id: string): { ok: true } | { ok: false; code: 404 | 403; error: string } {
  const st = pluginStatus().find((s) => s.id === id);
  if (!st) return { ok: false, code: 404, error: 'No workflow with that id.' };
  if (!st.user || !isUserPluginDir(st.dir)) return { ok: false, code: 403, error: 'This one ships with the app and can’t be removed here. Turn it off instead.' };
  removePlugin(id); rmSync(st.dir, { recursive: true, force: true });
  return { ok: true };
}
