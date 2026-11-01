/**
 * Plugin graphs (docs/PLUGINS.md): the one mapping from a job onto a plugin's ComfyUI workflow, shared by the plugin
 * loader (plugins.ts: sample runs write it to <jobId>-graph.json) and the local runner (comfy/plans.ts: real runs).
 * No imports from the tool registry, so comfy/plans.ts can read it without an import cycle (plans → plugins → apps → plans).
 */
import path from 'node:path';
import type { PluginNodeMap, NodeRef } from './plugins.js';

/** What the local runner needs to build a plugin's plan. Registered only for loaded plugins that ship a node map. */
export interface PluginSpec { id: string; workflowId: string; input: 'image' | 'video' | 'none'; outKind: 'image' | 'video'; graph: Record<string, any>; nodeMap: PluginNodeMap }
const specs = new Map<string, PluginSpec>();
export const registerPluginSpec = (s: PluginSpec) => { specs.set(s.id, s); };
export const pluginSpec = (toolId: string): PluginSpec | null => specs.get(toolId) ?? null;
export const clearPluginSpecs = () => specs.clear();
export const removePluginSpec = (toolId: string) => specs.delete(toolId);
/** A loaded plugin's graph by its workflow id (plugins/<folder>/workflow.json), wherever its folder lives (comfyNodes.ts). */
export const pluginGraphOf = (workflowId: string): Record<string, any> | null => { for (const s of specs.values()) if (s.workflowId === workflowId) return s.graph; return null; };

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
  const pr = input.finalPrompt ?? input.prompt; set(nm.inputs.prompt, typeof pr === 'string' && !pr.trim() ? undefined : pr); // an empty prompt keeps the workflow's own text
  set(nm.inputs.seed, input.seed);
  set(nm.inputs.resolution, input.resolution);
  for (const [k, r] of Object.entries(nm.fields ?? {})) for (const x of Array.isArray(r) ? r : [r]) set(x, input.fields?.[k]);
  for (const t of input.types ?? []) for (const r of nm.presets?.[t] ?? []) put(r.node, r.field, r.value);
  return g;
}

/** The text a workflow's mapped prompt field holds (through a Primitive it links to), or null: the prompt it runs with when you leave yours empty. */
export function graphPromptOf(graph: Record<string, any> | undefined, nm: PluginNodeMap | null | undefined): string | null {
  const r = nm?.inputs.prompt; let v = r ? graph?.[r.node]?.inputs?.[r.field] : undefined;
  if (isLink(v) && /^Primitive/.test(String(graph?.[v[0]]?.class_type))) v = graph![v[0]].inputs?.value;
  return typeof v === 'string' && v.trim() ? v : null;
}

/** A model file's stem in plain words: "qwen_image_2.1_int8_convrot" → "Qwen Image 2.1", "flux1-dev" → "Flux1 Dev". Drops the
 *  precision / quantisation tags (int8, fp8_scaled, bf16, convrot, Q4_K_M…), splits on _ and -, and capitalises each word. */
const TAG = /^(int\d+|fp\d+|bf\d+|nvfp\d+|mxfp\d+|e\dm\d(fn)?|convrot|scaled|mixed|w\da\d+|q\d+(_\d)?|gguf)$/i;
export function modelWords(stem: string): string {
  const parts = stem.split(/[_\-\s]+/).filter(Boolean); const out: string[] = [];
  for (let k = 0; k < parts.length; k++) { const w = parts[k];
    if (TAG.test(w)) { while (/^[kmsl0]$/i.test(parts[k + 1] ?? '')) k++; continue; } // Q4_K_M: the K and M go with the Q4
    out.push(/^[a-z]/.test(w) ? w[0].toUpperCase() + w.slice(1) : w); }
  return (out.join(' ') || stem).trim();
}
/** The main model of a graph in plain words ("Flux1 Dev" from flux1-dev.safetensors): the first diffusion model or checkpoint loader's file
 *  (unet_name / ckpt_name, the "dit" role in hardware/requirements.ts), without folders, extension or precision tags. null when there is none. */
export function mainModelOf(graph: Record<string, any> | undefined): string | null {
  const ids = Object.keys(graph ?? {}).sort((a, b) => (Number(a) - Number(b)) || a.localeCompare(b));
  for (const k of ['unet_name', 'ckpt_name']) for (const id of ids) { const v = graph![id]?.inputs?.[k];
    if (typeof v === 'string' && v.trim()) { const name = v.replace(/\\/g, '/').split('/').pop()!.replace(/\.(safetensors|gguf|ckpt|pt|pth|bin|sft)$/i, '').trim(); if (name) return modelWords(name).slice(0, 60); } }
  return null;
}
