/**
 * The studio catalog, read from the server itself so the MCP tools can't drift from the app:
 *  - GET /api/tools: every runnable tool (id, media, inputs, presets, models with run_on and prices). run_tool's tool_id list and
 *    describe_tool's field schema are generated from it.
 *  - GET /api/models/registry → runOn: the places a job can run (local, comfy-cloud, fal, …).
 * TOOL_SNAPSHOT (catalog.snapshot.ts, `npm run gen:catalog`) is only the fallback for when the API is not up yet when the MCP server starts;
 * test/catalog.ts fails when it no longer matches a fresh server, so a new server tool can't go missing from the MCP server unnoticed.
 */
import { get } from './api.js';
import { TOOL_SNAPSHOT } from './catalog.snapshot.js';

export type Input = { name: string; kind: string; required?: boolean; options?: (string | number)[]; default?: unknown; min?: number; max?: number; accept?: string; label?: string; description?: string; maxBytes?: number };
export type ServerTool = { id: string; name: string; media: string; listed?: boolean; category?: string; group?: string; description?: string; route?: string; status?: string; badge?: string; inputs?: Input[]; presets?: any[]; models?: any[]; providers?: any[]; defaultProvider?: string; localFree?: boolean };

const TTL_MS = 30_000;
let cache: { at: number; tools: ServerTool[] } | null = null;
let inflight: Promise<ServerTool[]> | null = null;
/** The live tool list (cached 30 s). Throws when the API can't be reached. */
export async function loadTools(fresh = false, includeUnlisted = false): Promise<ServerTool[]> {
  const visible = (ts: ServerTool[]) => includeUnlisted ? ts : ts.filter(t => t.listed !== false);
  if (!fresh && cache && Date.now() - cache.at < TTL_MS) return visible(cache.tools);
  inflight ??= get('/api/tools').then((ts: ServerTool[]) => { cache = { at: Date.now(), tools: ts }; return ts; }).finally(() => { inflight = null; });
  return visible(await inflight);
}
/** Tool ids for run_tool's enum: the last live list, else the generated snapshot. */
export const knownToolIds = (): string[] => (cache?.tools ?? TOOL_SNAPSHOT).map((t) => t.id);
export const catalogSource = () => (cache ? 'live' : 'snapshot');
export async function findTool(id: string): Promise<ServerTool> {
  const ts = await loadTools(false, true); const t = ts.find((x) => x.id === id);
  if (t) return t;
  const near = ts.filter((x) => x.id.includes(id) || id.includes(x.id) || x.name.toLowerCase().includes(id.toLowerCase())).map((x) => x.id).slice(0, 6);
  throw new Error(`Unknown tool "${id}".${near.length ? ` Did you mean: ${near.join(', ')}?` : ''} list_tools shows every tool id.`);
}

const FILE_KINDS = new Set(['file', 'files']);
export const isFileInput = (i?: Input) => !!i && FILE_KINDS.has(i.kind);
const MEDIA_HINT = 'local file path, http(s) URL, or a server path (/files/… from upload_media or a past output, /samples/…)';
/** JSON Schema for one tool's job fields, generated from its server inputs (kinds: file, files, select, list, number, boolean, text). */
export function fieldSchema(t: ServerTool) {
  const properties: Record<string, any> = {}; const required: string[] = [];
  for (const i of t.inputs ?? []) {
    const d = [i.label, i.description].filter(Boolean).join('. ');
    let s: any;
    switch (i.kind) {
      case 'file': s = { type: 'string', description: `Media (${i.accept ?? 'any'}): ${MEDIA_HINT}` }; break;
      case 'files': s = { type: 'array', items: { type: 'string' }, ...(i.max ? { maxItems: i.max } : {}), description: `Media list (${i.accept ?? 'any'}): ${MEDIA_HINT}` }; break;
      case 'select': s = { type: 'string', ...(i.options?.length ? { enum: i.options.map(String) } : {}) }; break;
      case 'list': s = { type: 'array', items: i.options?.length ? { type: 'string', enum: i.options.map(String) } : { type: 'string' }, description: 'One or more values (sent as a JSON array)' }; break;
      case 'number': s = { type: 'number', ...(i.min != null ? { minimum: i.min } : {}), ...(i.max != null ? { maximum: i.max } : {}) }; break;
      case 'boolean': s = { type: 'boolean' }; break;
      default: s = { type: 'string' };
    }
    if (i.default !== undefined) s.default = i.default;
    if (d) s.description = s.description ? `${d}. ${s.description}` : d;
    properties[i.name] = s; if (i.required) required.push(i.name);
  }
  return { type: 'object', properties, ...(required.length ? { required } : {}) };
}

/** Fields every job takes besides the tool's own inputs (POST /api/tools/{toolId}/jobs, openapi JOB_FORM). run_tool sets most of them from its own arguments. */
export const COMMON_JOB_FIELDS: Record<string, string> = {
  model: 'Model key from describe_tool / list_models (run_tool argument model)',
  runOn: 'Where it runs and who bills it (run_tool argument run_on)',
  seed: 'Omit for a random seed (returned)',
  fromJob: 'Hand a past job\'s output in as input, no re-upload (run_tool argument from_job; next_actions lists which tools take it)',
  output: 'With fromJob: which output (default 0)',
  reuseInputs: 'With fromJob: re-attach that job\'s own input files ("image", "refs,colourRef" or "all")',
  draft: '1 = 480p draft at about 30% of the price (video tools that offer it)',
};

/** A compact model card from /api/tools → models (real model names, open weights, licence, limits, run_on places with prices). */
export function modelCard(m: any, caps?: any) {
  return { model: m.key, name: m.displayName ?? m.name, maker: m.makerName ?? null, bestFor: m.bestFor ?? null, openWeights: !!m.openWeights, license: m.license?.name ?? null, default: !!m.isDefault, state: m.state ?? null,
    fromCredits: m.fromPrice ?? null, limits: caps ? limitsOf(caps) : m.caps?.summary ?? null,
    run_on: (m.runsOn ?? []).map((r: any) => ({ id: r.id, label: r.detail ? `${r.label} · ${r.detail}` : r.label, status: r.status, credits: r.credits ?? null, usd: r.credits != null ? r.credits / 100 : null, ...(r.reason ? { reason: r.reason } : {}),
      ...(r.choices?.length ? { routes: r.choices.map((c: any) => ({ route: c.routeId, name: c.name, status: c.status, credits: c.credits, why: c.why || null, limits: c.limits })) } : {}) })) };
}
/** What a video model takes (videoCaps from /api/models?toolId=): durations, resolutions, aspects, sound, loop, reference kinds. */
export function limitsOf(c: any) {
  if (!c || typeof c !== 'object') return null;
  const out: Record<string, unknown> = {};
  for (const k of ['resolutions', 'resolutionLabels', 'durations', 'minSeconds', 'maxSeconds', 'aspects', 'refKinds', 'refMax', 'loop', 'quality', 'defaultSeconds', 'durationsByResolution', 'qualityTiers', 'defaultTier', 'defaultAspect', 'defaultResolution', 'maxBatch', 'supports', 'edit', 'verified', 'unverified', 'source']) if (c[k] !== undefined) out[k] = c[k];
  if (c.audio !== undefined) out.audio = typeof c.audio === 'object' ? !!c.audio?.supported : !!c.audio;
  if (c.maxImages !== undefined) out.maxImages = c.maxImages; if (c.aspects === undefined && c.allowAuto !== undefined) out.allowAuto = c.allowAuto;
  return Object.keys(out).length ? out : null;
}

/** Places a job can run (registry runOn), with their labels. Falls back to the documented list when the API is down. */
export async function runOnPlaces(): Promise<{ id: string; label: string; billedTo: string }[]> {
  try { const r: any = await get('/api/models/registry'); if (Array.isArray(r?.runOn) && r.runOn.length) return r.runOn; } catch { /* below */ }
  return ['local', 'comfy-cloud', 'fal', 'replicate', 'bfl', 'minimax', 'ltx', 'openai', 'google', 'byteplus', 'dashscope', 'luma', 'direct'].map((id) => ({ id, label: id, billedTo: id }));
}

/** API paths the MCP server calls. test/catalog.ts checks each one is in the server's /api/openapi.json, so a renamed route fails a test. */
export const API_PATHS = [
  '/api/prompt-grammar', '/api/models/{key}/prompt-grammar', '/api/tools', '/api/tools/{toolId}/price', '/api/tools/{toolId}/preflight', '/api/tools/{toolId}/jobs', '/api/models', '/api/models/quote', '/api/models/quotes', '/api/models/registry',
  '/api/jobs', '/api/jobs/{id}', '/api/jobs/{id}/cancel', '/api/jobs/{id}/retry', '/api/jobs/{id}/support', '/api/jobs/{id}/recipe', '/api/jobs/{id}/share', '/api/jobs/{id}/next-actions',
  '/api/search', '/api/capabilities', '/api/media', '/api/compose', '/api/config', '/api/health', '/api/spend', '/api/spend/summary', '/api/accounts',
  '/api/image-workflows', '/api/audio-workflows', '/api/3d-workflows', '/api/video-presets', '/api/edit-video/tools', '/api/make-it-real/prep',
  '/api/agent/budgets', '/api/agent/budgets/{id}', '/api/agent/budgets/{id}/receipt', '/api/stories', '/api/stories/quote', '/api/stories/{id}', '/api/stories/{id}/retry',
  '/api/library/workflows', '/api/library/workflows/{id}', '/api/library/references', '/api/library/references/{id}',
  '/api/canvas/boards', '/api/canvas/boards/{id}', '/api/canvas/agent/presence', '/api/canvas/agent/sessions', '/api/canvas/agent/open', '/api/canvas/agent/workflows', '/api/canvas/agent/channel',
  '/api/canvas/boards/{id}/agent/ops', '/api/canvas/boards/{id}/agent/summary', '/api/canvas/boards/{id}/agent/wait', '/api/canvas/boards/{id}/agent/inbox', '/api/canvas/agent/proposals/{pid}',
];

export type Workflow = { id: string; area: 'image' | 'audio' | '3d' | 'video' | 'agent'; name: string; tagline: string | null; toolId: string | null; mode: string | null; status: string | null; field?: string; source?: { kind?: string; author?: string | null; url?: string | null } | null;
  /** from GET /api/capabilities (Video workflows, flow shortcuts, viral templates, Explore cards) */
  kind?: string; keywords?: string[]; run?: { tool_id: string; model?: string; fields: Record<string, unknown> } | null; modelKey?: string | null; needs?: string | null; inputs?: string[]; how?: string[]; page?: string; note?: string;
  /** old ids that still run as this one (Video looks merged 2026-10-27) */
  aliases?: string[] };
let wfCache: { at: number; items: Workflow[] } | null = null;
/** The workflows behind each page (image / audio / 3D workflow lists, Generate Video presets), each with the tool that runs it. Cached 30 s. */
export async function loadWorkflows(): Promise<Workflow[]> {
  if (wfCache && Date.now() - wfCache.at < TTL_MS) return wfCache.items;
  const pick = async (area: Workflow['area'], url: string) => { try { const r: any = await get(url); return (r.workflows ?? []).map((w: any) => ({ id: w.id, area, name: w.name, tagline: w.tagline ?? null, toolId: w.runner?.toolId ?? w.toolId ?? w.tool ?? null, mode: w.mode ?? null, status: w.status ?? null,
    source: w.source ? { kind: w.source.kind, author: w.source.author ?? null, url: w.source.url ?? null } : null })); } catch { return []; } };
  const video = async () => { try { const r: any = await get('/api/video-presets'); return (r.items ?? []).map((i: any) => ({ id: i.id, area: 'video', name: i.label, tagline: i.description ? `${i.kind}: ${i.description}` : i.kind, ...(i.aliases?.length ? { aliases: i.aliases } : {}), toolId: r.toolId ?? 'h3-video', mode: null, status: 'ready', field: r.field ?? 'videoPreset' })); } catch { return []; } };
  const caps = async () => { try { const r: any = await get('/api/capabilities'); capWords = r.keywords ?? {};
    return (r.items ?? []).map((c: any) => ({ id: c.id, area: c.area, name: c.name, tagline: c.tagline ?? null, toolId: c.toolId ?? null, mode: null, status: c.status ?? 'ready', kind: c.kind, keywords: c.keywords ?? [], run: c.run ?? null,
      modelKey: c.modelKey ?? null, needs: c.needs ?? null, inputs: c.inputs ?? [], how: c.how ?? [], page: c.page, ...(c.note ? { note: c.note } : {}) })); } catch { return []; } };
  const items = (await Promise.all([pick('image', '/api/image-workflows'), pick('audio', '/api/audio-workflows'), pick('3d', '/api/3d-workflows'), video(), caps()])).flat() as Workflow[];
  // The capabilities entry includes ready run arguments; avoid also listing its raw 3D page row.
  const canonical3d = new Set(items.filter(w => w.area === '3d' && w.id.startsWith('3d/')).map(w => w.id));
  const unique = items.filter(w => w.area !== '3d' || !canonical3d.has(`3d/${w.id}`))
    .map(w => canonical3d.has(w.id) ? { ...w, aliases: [w.id.slice(3)] } : w); // the raw id still describes it
  wfCache = { at: Date.now(), items: unique }; return unique;
}
let capWords: Record<string, string[]> = {};
/** Extra search words for tools and tool modes (`<toolId>/<mode>`), from GET /api/capabilities (read by loadWorkflows). */
export async function loadSearchWords(): Promise<Record<string, string[]>> { await loadWorkflows(); return capWords; }
