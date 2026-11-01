/**
 * Plugin graphs (docs/PLUGINS.md): the one mapping from a job onto a plugin's ComfyUI workflow, shared by the plugin
 * loader (plugins.ts: sample runs write it to <jobId>-graph.json) and the local runner (comfy/plans.ts: real runs).
 * No imports from the tool registry, so comfy/plans.ts can read it without an import cycle (plans → plugins → apps → plans).
 */
import path from 'node:path';
import type { PluginNodeMap, NodeRef } from './plugins.js';

/** What the local runner needs to build a plugin's plan. Registered only for loaded plugins that ship a node map. */
export interface PluginSpec { id: string; workflowId: string; input: 'image' | 'video'; outKind: 'image' | 'video'; graph: Record<string, any>; nodeMap: PluginNodeMap }
const specs = new Map<string, PluginSpec>();
export const registerPluginSpec = (s: PluginSpec) => { specs.set(s.id, s); };
export const pluginSpec = (toolId: string): PluginSpec | null => specs.get(toolId) ?? null;
export const clearPluginSpecs = () => specs.clear();

/** The result kind: the manifest's `output` when set, else read from the output node (SaveImage / PreviewImage → image, anything else → video). */
export const pluginOutKind = (graph: Record<string, any> | undefined, nm: PluginNodeMap | null | undefined, declared?: 'image' | 'video'): 'image' | 'video' =>
  declared ?? (/image/i.test(String(nm && graph?.[nm.output?.node]?.class_type)) ? 'image' : 'video');

/** True when a value holds a `__file` key anywhere. The runner uploads every { __file } it finds, so a shared plugin must never carry one. */
export const hasFileKey = (v: unknown): boolean => Array.isArray(v) ? v.some(hasFileKey) : !!v && typeof v === 'object' && Object.entries(v).some(([k, x]) => k === '__file' || hasFileKey(x));

const isLink = (v: any) => Array.isArray(v) && v.length === 2 && typeof v[0] === 'string';
/**
 * Generic mapping: job input → workflow fields via the node map. Inputs come only from the job's own imagePath / videoPath;
 * `file` turns each into what the graph holds (its file name for a sample, an upload placeholder for a real run).
 * A field linked to a Primitive* node sets that node's value (same rule as comfy/plans.ts setIn).
 */
export function mapGraph(graph: Record<string, any>, nm: PluginNodeMap | null, input: Record<string, any>, file: (p: string) => unknown = (p) => path.basename(p)) {
  const g = structuredClone(graph); if (!nm) return g;
  const put = (node: string, field: string, v: unknown) => { const n = g[node]; if (!n) return; const cur = n.inputs[field];
    if (isLink(cur) && g[cur[0]] && /^Primitive/.test(g[cur[0]].class_type)) g[cur[0]].inputs.value = v; else n.inputs[field] = v; };
  const set = (r: NodeRef | undefined, v: unknown) => { if (r && v !== undefined && v !== null) put(r.node, r.field, r.map && String(v) in r.map ? r.map[String(v)] : v); };
  set(nm.inputs.video, input.videoPath ? file(input.videoPath) : undefined);
  set(nm.inputs.image, input.imagePath ? file(input.imagePath) : undefined);
  set(nm.inputs.prompt, input.finalPrompt ?? input.prompt);
  set(nm.inputs.seed, input.seed);
  set(nm.inputs.resolution, input.resolution);
  for (const [k, r] of Object.entries(nm.fields ?? {})) for (const x of Array.isArray(r) ? r : [r]) set(x, input.fields?.[k]);
  for (const t of input.types ?? []) for (const r of nm.presets?.[t] ?? []) put(r.node, r.field, r.value);
  return g;
}
