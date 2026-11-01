/**
 * Plugin loader (docs/PLUGINS.md). Each folder in PLUGINS_DIR (repo-root plugins/, shipped with the app) and USER_PLUGINS_DIR (<data>/plugins:
 * the workflows you added in the app, workflowImport.ts) with a plugin.json becomes a tool in the shared registry (nav, Explore, Assets, media
 * picker, pricing, model picker, generic web AppTool). Bad plugins are skipped with clear errors (GET /api/plugins); the server never crashes on
 * a plugin. A folder can also be loaded or removed while the app runs (addPluginFolder / removePlugin), with no restart.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PLUGINS_DIR, USER_PLUGINS_DIR, DATA_DIR } from './config.js';
import { getTool, registerTool, unregisterTool, toolIdTaken } from './tools/registry.js';
import { makeApp, FieldSpec } from './tools/apps.js';
import { mockRun, registerMockResult } from './tools/shared.js';
import { getProvider } from './providers.js';
import { LICENSES, LicenseInfo, registerLicense, registerWorkflowLicense } from './licenses.js';
import { registerModelInfo, Info } from './models.js';
import { RESOLUTIONS } from './media.js';
import type { Job } from './jobs.js';
import type { ToolDef } from './tools/types.js';
import { placementErrors, placeVideoPlugins, TAB_LABEL, type PluginTab } from './shared/pluginPlacement.js';
import { mapGraph, hasFileKey, pluginOutKind, registerPluginSpec, clearPluginSpecs, removePluginSpec, mainModelOf, graphPromptOf } from './pluginGraph.js';
export { mapGraph } from './pluginGraph.js';

export const PLUGIN_SCHEMA = 1;
export interface NodeRef { node: string; field: string; map?: Record<string, unknown> }
export interface PluginNodeMap { inputs: Partial<Record<'video' | 'image' | 'prompt' | 'seed' | 'resolution', NodeRef>>; fields?: Record<string, NodeRef | NodeRef[]>; presets?: Record<string, { node: string; field: string; value: unknown }[]>; output: { node: string }; /** more results from the same run (e.g. Cutout's matte) */ extraOutputs?: { node: string; label: string }[] }
export interface PluginManifest {
  schema: number; id: string; name: string; version?: string; category: string; description: string; status?: string; previewUrl?: string | null;
  /** What it takes: a photo, a clip, or nothing but its prompt and settings ("none": text to image, text to video). */
  input: 'image' | 'video' | 'none';
  /** Where it shows up (shared/pluginPlacement.ts): the tab, and `category` is then one of that tab's workflow categories (video: create, edit,
   *  motion, camera, apps). Without `tab`, `category` is only the tool's group and the plugin is listed on the Plugins page. */
  tab?: PluginTab;
  /** The Workflows page goal (create, shop, ads, people, film, music, fix). */
  goal?: string;
  /** Who made it, shown on its card. */
  author?: string;
  /** What the plugin makes (default: read from the node map's output node, SaveImage → image, else video). */
  output?: 'image' | 'video';
  inputs?: { prompt?: boolean; mix?: number; durations?: number[]; enhance?: boolean; steps?: number[]; resolutions?: string[]; fields?: FieldSpec[] };
  presets: { id: string; label: string; prompt: string; group?: string }[];
  providers?: string[];
  license: { id: string; name?: string; osi?: boolean; url?: string };
  components?: { name: string; license: string; url: string; kind?: 'model' | 'node-pack' | 'code' }[];
  licenses?: LicenseInfo[];
  pricing: { gpuSecPerSec: Record<string, number>; optionFactors?: Record<string, number>; providerFactors?: Record<string, number> };
  workflow: string; nodeMap?: string; handler?: string;
  model?: string; modelInfo?: Info;
  /** Where the workflow came from (a link), shown on its card. */
  homepageUrl?: string;
  stages?: [string, string][]; mock?: { result?: string; results?: string[]; ms?: number };
}
export interface PluginContext {
  manifest: PluginManifest; dir: string; nodeMap: PluginNodeMap | null; workflowId: string;
  /** Workflow with the job input mapped onto node-map fields (generic mapping). */
  buildGraph: (input: Record<string, any>) => Record<string, any>;
  /** Generic mock run (sample clip, progress stages). */
  mockRun: (job: Job, labels?: string[]) => Promise<void>;
}
export interface PluginHandler {
  parseInput?: (fields: Record<string, string>, files: Record<string, string[]>, ctx: PluginContext & { base: () => Promise<Record<string, any> | { error: string }> }) => Promise<Record<string, any> | { error: string }>;
  run?: (job: Job, ctx: PluginContext) => Promise<void>;
}
export interface PluginStatus { id: string; dir: string; ok: boolean; errors: string[]; warnings: string[]; toolId?: string; license?: LicenseInfo; handler?: boolean; /** a workflow you added (USER_PLUGINS_DIR) */ user?: boolean }
const status: PluginStatus[] = [];
export const pluginStatus = () => status;

const isStr = (v: unknown, max = 2000): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Validate a manifest (+ its files). Returns the error list (empty = valid). */
export function validateManifest(m: any, dir: string): { errors: string[]; warnings: string[]; graph?: Record<string, any>; nodeMap?: PluginNodeMap | null } {
  const e: string[] = []; const w: string[] = [];
  if (!isObj(m)) return { errors: ['plugin.json must be a JSON object'], warnings: w };
  if (m.schema !== PLUGIN_SCHEMA) e.push(`schema must be ${PLUGIN_SCHEMA}`);
  if (!isStr(m.id, 40) || !/^[a-z][a-z0-9-]{1,39}$/.test(m.id)) e.push('id must match ^[a-z][a-z0-9-]{1,39}$');
  else if (toolIdTaken(m.id)) e.push(`id "${m.id}" is already used by another tool`);
  for (const k of ['name', 'category', 'description'] as const) if (!isStr(m[k], k === 'description' ? 500 : 60)) e.push(`${k} is required (non-empty string)`);
  if (m.input !== 'image' && m.input !== 'video' && m.input !== 'none') e.push('input must be "image", "video" or "none"');
  e.push(...placementErrors(m));
  if (m.output != null && m.output !== 'image' && m.output !== 'video') e.push('output must be "image" or "video"');
  if (!Array.isArray(m.presets) || !m.presets.length) e.push('presets must be a non-empty array (they are the tool\'s type grid)');
  else m.presets.forEach((p: any, i: number) => { if (!isObj(p) || !isStr(p.id, 40) || !isStr(p.label, 60) || typeof p.prompt !== 'string') e.push(`presets[${i}] needs id, label, prompt`); });
  const ids = new Set((m.presets ?? []).map((p: any) => p?.id)); if (ids.size !== (m.presets ?? []).length) e.push('preset ids must be unique');
  const inp = m.inputs ?? {};
  if (!isObj(inp)) e.push('inputs must be an object');
  else {
    if (inp.mix != null && !(Number.isInteger(inp.mix) && inp.mix >= 1 && inp.mix <= 4)) e.push('inputs.mix must be an integer 1–4');
    for (const k of ['durations', 'steps']) if (inp[k] != null && !(Array.isArray(inp[k]) && inp[k].length && inp[k].every((x: any) => Number.isInteger(x) && x > 0))) e.push(`inputs.${k} must be a non-empty array of positive integers`);
    if (inp.resolutions != null && !(Array.isArray(inp.resolutions) && inp.resolutions.length && inp.resolutions.every((r: any) => (RESOLUTIONS as readonly string[]).includes(r)))) e.push(`inputs.resolutions must be a subset of ${RESOLUTIONS.join(', ')}`);
    (inp.fields ?? []).forEach((f: any, i: number) => {
      if (!isObj(f) || !/^[a-z][a-zA-Z0-9_]{0,30}$/.test(f.name ?? '')) e.push(`inputs.fields[${i}].name must be an identifier`);
      else if (['video', 'image', 'types', 'prompt', 'resolution', 'seed', 'provider', 'rights', 'draft', 'duration', 'steps', 'enhance'].includes(f.name)) e.push(`inputs.fields[${i}].name "${f.name}" is reserved`);
      if (!['select', 'text', 'number', 'boolean'].includes(f?.kind)) e.push(`inputs.fields[${i}].kind must be select | text | number | boolean`);
      if (f?.kind === 'select' && !(Array.isArray(f.options) && f.options.length && f.options.every((o: any) => isStr(o?.value, 60)))) e.push(`inputs.fields[${i}].options must be [{ value, label? }]`);
    });
  }
  for (const p of m.providers ?? []) if (!getProvider(p)) e.push(`provider "${p}" is not registered`);
  // licences
  for (const l of m.licenses ?? []) if (!isObj(l) || !isStr(l.id, 60) || !isStr(l.name, 120) || typeof l.osi !== 'boolean') e.push('licenses[] entries need id, name, osi (boolean), url');
  const known = (id: string) => !!LICENSES[id] || (m.licenses ?? []).some((l: any) => l?.id === id);
  if (!isObj(m.license) || !isStr(m.license.id, 60)) e.push('license.id is required (SPDX-style id, e.g. "mit")');
  else if (!known(m.license.id)) e.push(`license "${m.license.id}" is unknown: declare it in licenses[] with osi true/false`);
  (m.components ?? []).forEach((c: any, i: number) => { if (!isObj(c) || !isStr(c.name, 120) || !isStr(c.license, 60) || !isStr(c.url, 500)) e.push(`components[${i}] needs name, license, url`); else if (!known(c.license)) e.push(`components[${i}].license "${c.license}" is unknown: declare it in licenses[]`); });
  if (!m.components?.length) w.push('no components listed: list every model and node pack with its licence');
  // pricing
  if (!isObj(m.pricing) || !isObj(m.pricing.gpuSecPerSec) || !Object.values(m.pricing.gpuSecPerSec).every(isNum)) e.push('pricing.gpuSecPerSec is required: { "480p": n, "720p": n, ... }');
  for (const k of ['optionFactors', 'providerFactors']) if (m.pricing?.[k] != null && !(isObj(m.pricing[k]) && Object.values(m.pricing[k]).every((x) => isNum(x) && (x as number) > 0))) e.push(`pricing.${k} must map ids to positive numbers`);
  for (const k of Object.keys(m.pricing?.optionFactors ?? {})) if (!ids.has(k)) w.push(`pricing.optionFactors.${k} is not a preset id`);
  // files
  const file = (k: string, f: unknown) => { if (!isStr(f, 200) || f.includes('..') || path.isAbsolute(f)) { e.push(`${k} must be a relative file name`); return null; } const p = path.join(dir, f); if (!existsSync(p)) { e.push(`${k}: ${f} not found`); return null; } return p; };
  let graph: Record<string, any> | undefined; let nodeMap: PluginNodeMap | null = null;
  const wf = file('workflow', m.workflow);
  if (wf) try { graph = JSON.parse(readFileSync(wf, 'utf8')); if (!isObj(graph) || !Object.values(graph!).every((n: any) => isObj(n) && isStr(n.class_type) && isObj(n.inputs))) { e.push('workflow must be ComfyUI API format: { "<id>": { class_type, inputs } }'); graph = undefined; }
    else if (hasFileKey(graph)) { e.push('workflow must not contain "__file" keys: the app fills in your input files itself'); graph = undefined; } } catch (x: any) { e.push(`workflow is not valid JSON: ${x.message}`); }
  if (m.nodeMap != null) {
    const nm = file('nodeMap', m.nodeMap);
    if (nm) try {
      nodeMap = JSON.parse(readFileSync(nm, 'utf8'));
      if (hasFileKey(nodeMap)) e.push('nodeMap must not contain "__file" keys: the app fills in your input files itself');
      const chk = (k: string, r: any) => { const out = k === 'output' || k.startsWith('extraOutputs'); if (!isObj(r) || !isStr(r.node) || (!out && !isStr(r.field))) e.push(`nodeMap ${k} needs node${!out ? ' + field' : ''}`); else if (graph && !graph[r.node]) e.push(`nodeMap ${k}: node "${r.node}" is not in the workflow`); else if (graph && !out && !(r.field in graph[r.node].inputs)) e.push(`nodeMap ${k}: node ${r.node} has no input "${r.field}"`); };
      if (!isObj(nodeMap!.inputs)) e.push('nodeMap.inputs must be an object');
      else if (m.input !== 'none' && !nodeMap!.inputs[m.input as 'video']) e.push(`nodeMap.inputs.${m.input} is required`);
      for (const [k, r] of Object.entries(nodeMap!.inputs ?? {})) chk(`inputs.${k}`, r);
      for (const [k, r] of Object.entries(nodeMap!.fields ?? {})) { (Array.isArray(r) ? r : [r]).forEach((x, i) => chk(`fields.${k}${Array.isArray(r) ? `[${i}]` : ''}`, x)); if (!(inp.fields ?? []).some((f: any) => f.name === k)) e.push(`nodeMap.fields.${k} is not an inputs.fields name`); }
      for (const [k, list] of Object.entries(nodeMap!.presets ?? {})) { if (!ids.has(k)) e.push(`nodeMap.presets.${k} is not a preset id`); (list ?? []).forEach((r: any, i: number) => chk(`presets.${k}[${i}]`, r)); }
      chk('output', nodeMap!.output);
      if ((m.output === 'image' || m.output === 'video') && graph && graph[nodeMap!.output?.node] && pluginOutKind(graph, nodeMap) !== m.output) e.push(`output is "${m.output}" but the output node ${nodeMap!.output.node} (${graph[nodeMap!.output.node].class_type}) saves ${pluginOutKind(graph, nodeMap)}`);
      const xo = nodeMap!.extraOutputs;
      if (xo != null) { if (!Array.isArray(xo)) e.push('nodeMap.extraOutputs must be [{ node, label }]'); else xo.forEach((r: any, i: number) => { if (!isObj(r) || !isStr(r.label, 60)) e.push(`nodeMap.extraOutputs[${i}] needs node + label`); else chk(`extraOutputs[${i}]`, { node: r.node }); }); }
    } catch (x: any) { e.push(`nodeMap is not valid JSON: ${x.message}`); }
  } else w.push('no nodeMap: the generic handler cannot map inputs onto the workflow');
  if (m.handler != null) { if (!/^handler\.(ts|js|mjs)$/.test(m.handler)) e.push('handler must be handler.ts, handler.js or handler.mjs'); else file('handler', m.handler); }
  if (m.mock?.result != null) file('mock.result', m.mock.result);
  (m.mock?.results ?? []).forEach((r: unknown, i: number) => file(`mock.results[${i}]`, r));
  return { errors: e, warnings: w, graph, nodeMap };
}

async function loadOne(dir: string, user: boolean): Promise<PluginStatus> {
  const st: PluginStatus = { id: path.basename(dir), dir, ok: false, errors: [], warnings: [], ...(user ? { user: true } : {}) };
  let m: PluginManifest;
  try { m = JSON.parse(readFileSync(path.join(dir, 'plugin.json'), 'utf8')); } catch (x: any) { st.errors.push(`plugin.json: ${x.message}`); return st; }
  const v = validateManifest(m, dir); st.errors.push(...v.errors); st.warnings.push(...v.warnings); if (isStr((m as any)?.id)) st.id = m.id;
  if (user && m.handler != null) st.errors.push('a workflow added in the app never runs code: remove "handler" (only folders shipped in plugins/ may have one)');
  if (st.errors.length) return st;
  for (const l of m.licenses ?? []) registerLicense({ id: l.id, name: l.name, osi: l.osi, url: l.url ?? null });
  const partIds = [...new Set([m.license.id, ...(m.components ?? []).map((c) => c.license)])];
  const parts = partIds.map((id) => LICENSES[id]);
  const gov = parts.find((p) => !p.osi) ?? LICENSES[m.license.id];
  st.license = gov;
  // K2: plugins are never skipped because of their licence (open-weights-only only drops hosted providers).
  let handler: PluginHandler = {};
  if (m.handler) {
    // Prefer a compiled handler.js next to handler.ts (scripts/build-plugins.mjs) so node dist (npm start) works without tsx.
    const js = m.handler.endsWith('.ts') ? m.handler.replace(/\.ts$/, '.mjs') : m.handler;
    const pick = existsSync(path.join(dir, js)) ? js : m.handler;
    try { const mod = await import(pathToFileURL(path.join(dir, pick)).href); handler = (mod.default ?? mod) as PluginHandler; st.handler = true;
      if ((handler.run && typeof handler.run !== 'function') || (handler.parseInput && typeof handler.parseInput !== 'function')) { st.errors.push('handler must export { parseInput?, run? } functions'); return st; } }
    catch (x: any) { st.errors.push(`handler failed to load: ${x.message}${m.handler.endsWith('.ts') ? ' (handler.ts needs the tsx runtime: npm run dev; ship handler.js for node dist)' : ''}`); return st; }
  }
  const workflowId = `plugins/${path.basename(dir)}/${m.workflow}`;
  registerWorkflowLicense(workflowId, partIds);
  const inp = m.inputs ?? {};
  const outKind = pluginOutKind(v.graph, v.nodeMap, m.output);
  /* "none" (text only): the image app with its photo always optional, then without the photo input at all */
  const none = m.input === 'none';
  const app0 = makeApp({
    id: m.id, name: m.name, description: m.description, category: m.tab ? TAB_LABEL[m.tab] : m.category, status: m.status, previewUrl: m.previewUrl ?? null, input: m.input === 'video' ? 'video' : 'image', ...(none ? { imageOptional: () => true } : {}),
    types: m.presets.map((p) => ({ ...p })), mix: inp.mix, durations: inp.durations, enhance: inp.enhance, steps: inp.steps, prompt: inp.prompt, resolutions: inp.resolutions,
    fields: inp.fields, workflow: workflowId, model: m.model ?? (user ? mainModelOf(v.graph) : null) ?? m.name /* a workflow you added: its main model, never the workflow's own name */, gpuSecPerSec: m.pricing.gpuSecPerSec, stages: m.stages, providers: m.providers ?? ['comfy-open'],
  });
  const app: ToolDef = none ? { ...app0, inputs: app0.inputs.filter((i) => i.name !== 'image'), app: { ...app0.app, input: 'none' } as any, stages: m.stages ?? [['queued', 'Queued'], ['rendering', 'Rendering'], ['saving', 'Saving']] } : app0;
  const stages = app.stages;
  const ctx: PluginContext = {
    manifest: m, dir, nodeMap: v.nodeMap ?? null, workflowId,
    buildGraph: (input) => mapGraph(v.graph!, v.nodeMap ?? null, input),
    mockRun: (job, labels) => mockRun(job, stages, labels ?? [(job.input.types ?? []).map((t: string) => m.presets.find((p) => p.id === t)?.label ?? t).join(' + ') || 'Result'], m.mock?.ms ?? 6000),
  };
  const baseParse = app.parseInput; const baseRun = app.run;
  const tool: ToolDef = {
    ...app, pricing: { optionFactors: m.pricing.optionFactors, providerFactors: m.pricing.providerFactors },
    plugin: { id: m.id, dir, version: m.version, license: gov, handler: !!st.handler, tab: m.tab ?? null, category: m.tab ? m.category : null, goal: m.goal ?? null, author: m.author ?? null, input: m.input, output: outKind, ...(user ? { user: true, mainModel: mainModelOf(v.graph), defaultPrompt: graphPromptOf(v.graph, v.nodeMap) } : {}) },
    parseInput: async (f, fl) => { const r = await (handler.parseInput ? handler.parseInput(f, fl, { ...ctx, base: () => baseParse(f, fl) }) : baseParse(f, fl)); return outKind === 'image' && !('error' in r) ? { ...r, outKind } : r; },
    /* Reached only when the job does not run on your own ComfyUI (providers.ts sends local runs to comfy/runNative.ts with the plan from comfy/plans.ts):
       a sample result, plus the workflow a real run would send (<jobId>-graph.json, shown by workflowExport.ts as a sample). */
    async run(job) {
      try { writeFileSync(path.join(DATA_DIR, `${job.id}-graph.json`), JSON.stringify(ctx.buildGraph(job.input))); } catch { /* best effort */ }
      if (handler.run) return handler.run(job, ctx);
      if (m.input === 'image' && outKind === 'video') return baseRun(job);
      return ctx.mockRun(job);
    },
  };
  const mocks = m.mock?.results ?? (m.mock?.result ? [m.mock.result] : []);
  if (mocks.length) registerMockResult(m.id, mocks.map((r) => path.join(dir, r)));
  if (m.modelInfo) registerModelInfo(`${m.id}:${(m.providers ?? ['comfy-open'])[0]}`, m.modelInfo);
  registerTool(tool);
  if (v.graph && v.nodeMap) registerPluginSpec({ id: m.id, workflowId, input: m.input, outKind, graph: v.graph, nodeMap: v.nodeMap });
  st.ok = true; st.toolId = m.id;
  return st;
}

/** The two plugin roots: the shipped folders, then the ones you added (the same folder twice counts once, as shipped). */
const roots = (): [string, boolean][] => (path.resolve(USER_PLUGINS_DIR) === path.resolve(PLUGINS_DIR) ? [[PLUGINS_DIR, false]] : [[PLUGINS_DIR, false], [USER_PLUGINS_DIR, true]]);
/** True for a folder inside the add-in-the-app root (USER_PLUGINS_DIR), the only ones the app may write or delete. */
export const isUserPluginDir = (dir: string) => roots().some(([r, u]) => u && path.dirname(path.resolve(dir)) === path.resolve(r));

async function safeLoad(dir: string, user: boolean): Promise<PluginStatus> {
  let st: PluginStatus;
  try { st = await loadOne(dir, user); } catch (x: any) { st = { id: path.basename(dir), dir, ok: false, errors: [`unexpected error: ${x.message}`], warnings: [], ...(user ? { user: true } : {}) }; }
  if (st.ok) console.info(`[openhiggsfield] plugin ${st.id} loaded${st.warnings.length ? ` (warnings: ${st.warnings.join('; ')})` : ''}`);
  else console.warn(`[openhiggsfield] plugin ${st.id} skipped: ${st.errors.join('; ')}`);
  return st;
}
/* plugins with a tab join that tab's lists (shared/pluginPlacement.ts): video ones into VIDEO_WORKFLOWS, so search (capabilities) and links see them */
const place = () => placeVideoPlugins(status.flatMap((x) => (x.ok && x.toolId ? [getTool(x.toolId)!] : [])).filter(Boolean) as any);

/** Load every plugin folder once at startup. Never throws. */
export async function loadPlugins() {
  status.length = 0; clearPluginSpecs();
  for (const [root, user] of roots()) {
    if (!existsSync(root)) continue;
    for (const d of readdirSync(root, { withFileTypes: true }).filter((x) => x.isDirectory() && !x.name.startsWith('.') && !x.name.startsWith('_')).sort((a, b) => a.name.localeCompare(b.name))) {
      const dir = path.join(root, d.name);
      if (existsSync(path.join(dir, 'plugin.json'))) status.push(await safeLoad(dir, user));
    }
  }
  place();
  return status;
}

/** Load one more folder while the app runs (a workflow you just added): it joins the registry, its tab and search at once. Never throws. */
export async function addPluginFolder(dir: string, user = true): Promise<PluginStatus> {
  const st = await safeLoad(dir, user);
  const at = status.findIndex((x) => path.resolve(x.dir) === path.resolve(dir)); if (at >= 0) status.splice(at, 1, st); else status.push(st);
  place(); return st;
}
/** Take a loaded plugin out of the app (its tool, plan and placement); the caller deletes its folder. Returns its status, or null when unknown. */
export function removePlugin(id: string): PluginStatus | null {
  const at = status.findIndex((x) => x.id === id); if (at < 0) return null;
  const [st] = status.splice(at, 1);
  if (st.toolId) { unregisterTool(st.toolId); removePluginSpec(st.toolId); }
  place(); return st;
}
