/**
 * Model vs Run-on (MODEL-ROUTE-SPEC steps 3–5), the client side.
 *
 *  - MODEL: what you get ("MiniMax H3"). Each tool lists its models in GET /api/tools → tools[].models[] (one row per model, with the
 *    engines (old provider ids) that build it, where it runs (runsOn[]) and a "from" price). Tool pages still keep an engine id as their
 *    `provider` state; modelOfEngine() maps it to the model, so every old id, draft and deep link keeps working.
 *  - RUN ON: the account that runs and bills it (Local, Comfy Cloud, fal, …). The choice is remembered per (tool, model) on the server
 *    (PUT /api/me/routing perTool, prefs v2) and mirrored in localStorage (`ohf:runon:<tool>:<model>`), so Camera Moves' choice never leaks
 *    into Object Swap. Quotes and submits carry `model` + `runOn` (see applyRunOnParams, called by the fetch guard in api.ts).
 *  - Old per-engine pins (`ohf:route:<engine>`, `ohf:fallback:<engine>`) are read once and migrated into perTool (migrateLegacyPins).
 */
import { useEffect, useRef, useState } from 'react';
import { requestRequote } from './quote';
import { runPrice } from './billing';
import { LOCAL_LABEL, placeOf as sharedPlaceOf, PLACE_LABELS, type Place } from '../../../server/src/shared/modelIds';

export type RunOnStatus = 'ready' | 'sample' | 'needs-key' | 'off' | 'not-installed' | 'coming-soon' | 'unavailable';
/** The one action a place that isn't ready needs (server: routing/modelRegistry.ts rowAction / routing/select.ts placeAction). */
export interface PlaceAction { kind: 'turn_on' | 'download' | 'install_node' | 'add_key' | 'set_up_gpu' | string; text: string; missingBytes?: number | null; downloadId?: string | null; /** 'deploy': the Comfy place needs your own deployment, not a key (Connections → Your Comfy deployment) */ connection?: string }
export interface RunOnRow { id: string; label: string; billedTo: string; status: RunOnStatus; credits: number | null; reason: string | null; reasonCode: string | null; routes: string[]; engines: string[]; comfyVariants?: ('workflow' | 'partner')[];
  /** Run on groups: gpu (Local), comfy (Comfy Cloud / Comfy Router), api (direct providers). */ group?: 'gpu' | 'comfy' | 'api'; /** "Comfy Router" / "Comfy Cloud" on the Comfy row. */ detail?: string | null; action?: PlaceAction | null;
  /** 2026-10-27: the model's ways to run at this place when there are two or more (server shared/routeNames.ts): each by name, with its price and limits. */ choices?: RouteChoice[] }
export interface RouteChoice { routeId: string; engine: string; name: string; word: string; why: string; status: RunOnStatus; credits: number | null; reason: string | null; /** route_not_enabled: Comfy Router refused it before running; "Check again" clears it */ reasonCode?: string | null; limits: { resolutions: string[] | null; durations: number[] | null; aspects: string[] | null } | null; /** the jobs it takes (null = every job the model does) */ modes?: string[] | null }
/** The named way a route runs ("Comfy Cloud · open workflow"), when its place has several for this model; null = the place's name is enough. */
export const routeChoiceOf = (m: Pick<ToolModel, 'runsOn'> | null | undefined, routeId: string | null | undefined): RouteChoice | null => {
  if (!m || !routeId) return null; for (const r of m.runsOn ?? []) { const c = r.choices?.find(x => x.routeId === routeId); if (c) return c; } return null; };
/** The place picked for a model with no saved choice (first ready: Comfy → other API → Local; else the mock sample; else none: null). */
export interface Preselect { runOn: string; label: string; status: RunOnStatus; action: PlaceAction | null }
/** A place the model could be set up on (server models[].setup / quote setupOptions), in the pre-selection order. credits: per run once set up. */
export interface SetupPlace { runOn: string; label: string; action: PlaceAction; credits: number | null; slow?: boolean }
/** The one status a picker row shows (server rowStatus): the model at its pre-selected place, else what setting it up takes. */
export interface RowStatus { kind: 'ready' | 'sample' | 'add_key' | 'download' | 'turn_on' | 'install_node' | 'set_up' | 'coming_soon' | 'unavailable' | string; text: string; runOn: string | null; credits: number | null; missingBytes?: number | null }
export type ModelState = 'ready' | 'sample' | 'needs-key' | 'not-installed' | 'coming-soon' | 'unavailable';
export interface ToolModel {
  key: string; name: string; /** maker key + display name (server MAKERS); older servers omit them */ maker?: string | null; makerName?: string | null; family: string; medium?: string; openWeights: boolean; license?: { id: string; name: string; url?: string | null; osi?: boolean } | null;
  blurb: string | null; note?: string; engines: string[]; primaryEngine: string; isDefault?: boolean; state: ModelState; fromPrice: number | null;
  runsOn: RunOnRow[]; /** = preselect.runOn (older field) */ autoRunOn: string | null; preselect?: Preselect | null; lifecycle?: string | null; lifecycleNote?: string | null;
  /** Model catalogue (server shared/modelRank.ts; older servers omit it): name with version, one plain best-for line, rank per medium
   *  (lower = higher, API before Local), editorial featured / popular, search aliases, sourced release date, capability summary, variant links. */
  displayName?: string | null; bestFor?: string | null; rank?: number | null; home?: 'api' | 'gpu' | null; featured?: boolean; popular?: boolean; aliases?: string[];
  releasedAt?: string | null; caps?: { summary: string | null; [k: string]: unknown } | null; variantOf?: string | null; variants?: string[];
  /** Picker section (server withSections): featured (catalogue, API, ≤ 5) · api · gpu (best locally) · soon (nothing runs it here yet); isNew = released ≤ 60 days ago */
  section?: 'featured' | 'api' | 'gpu' | 'soon'; isNew?: boolean;
  /** places to set up, in order (nothing is pre-chosen when none is ready) */ setup?: { runOn: string; label: string; action: PlaceAction; credits: number | null }[]; rowStatus?: RowStatus;
}
/** Picker order (MODEL-PICKER-REVIEW §4.6): catalogue rank, then the name. Models without a rank (older servers, plugins) keep their place after ranked ones. */
export const byRank = (a: Pick<ToolModel, 'rank' | 'name'> | undefined, b: Pick<ToolModel, 'rank' | 'name'> | undefined): number => (a?.rank ?? 999) - (b?.rank ?? 999);
/** The name a picker shows: the catalogue's name with version, else the model name. */
export const shownName = (m: Pick<ToolModel, 'displayName' | 'name'>) => m.displayName || m.name;
/** Search text of a model: names, maker, family, aliases and the best-for line. */
export const searchText = (m: Partial<ToolModel>) => [m.displayName, m.name, m.makerName, m.family, m.bestFor, ...(m.aliases ?? [])].filter(Boolean).join(' ').toLowerCase();
type ToolLike = { id: string; name?: string; providers?: { id: string }[]; models?: ToolModel[] };

/** User-facing labels (spec §2.1), for ids that arrive without a label (old jobs, spend rows). */
export const RUN_ON_LABEL: Record<string, string> = { local: LOCAL_LABEL, 'comfy-cloud': 'Comfy Cloud', fal: 'fal', replicate: 'Replicate', bfl: 'Black Forest Labs', minimax: 'MiniMax', ltx: 'LTX', openai: 'OpenAI', google: 'Google', byteplus: 'BytePlus', dashscope: 'Alibaba Cloud', luma: 'Luma AI', direct: 'Direct API' };
/** Short chip text in the model menu. */
export const RUN_ON_CHIP: Record<string, string> = { local: LOCAL_LABEL, 'comfy-cloud': 'Comfy Cloud', fal: 'fal', replicate: 'Replicate', bfl: 'BFL', minimax: 'MiniMax', ltx: 'LTX', openai: 'OpenAI', google: 'Google', byteplus: 'BytePlus', dashscope: 'Alibaba', luma: 'Luma', direct: 'API' };
/** Settings → Connections card for a run-on (billing ids, as /api/settings/billing and /api/accounts use). */
export const RUN_ON_BILLING: Record<string, string> = { local: 'local', 'comfy-cloud': 'comfy', fal: 'fal', replicate: 'replicate', bfl: 'bfl', minimax: 'minimax', ltx: 'ltx', openai: 'openai', google: 'google', byteplus: 'byteplus', dashscope: 'dashscope', luma: 'luma' };
export const runOnLabel = (id?: string | null) => (id ? RUN_ON_LABEL[id] ?? id : '');
/** The place a quote, job, route or spend row ran or will run on, in the one set of words (server/src/shared/modelIds.ts placeOf): Your computer,
 *  Comfy Cloud, Comfy Router, Comfy deployment, fal… The server's own place wins; then the route id; then the run-on. */
export const placeOfAny = (x: any): Place | null => (x?.place && typeof x.place === 'object' && x.place.label && x.place.billing ? x.place as Place : sharedPlaceOf({ kind: x?.routeKind ?? x?.kind ?? null, routeId: x?.routeId ?? x?.route ?? null, runOn: x?.runOn ?? null, comfyVariant: x?.comfyVariant ?? null }));
export const placeLabelOf = (x: any): string => String(x?.placeLabel ?? '') || placeOfAny(x)?.label || runOnLabel(x?.runOn);
/** A model's Run on row in the place words: the Comfy row says which Comfy place it is (Comfy Cloud, Comfy Router, Comfy deployment, or both). */
export const rowPlaceLabel = (r: { id: string; label: string; detail?: string | null }): string => r.id === 'local' ? LOCAL_LABEL : r.id !== 'comfy-cloud' || !r.detail ? r.label : /deployment/i.test(r.detail) ? PLACE_LABELS['comfy-deploy'] : /^Comfy Router/.test(r.detail) ? PLACE_LABELS['comfy-router'] : /^Comfy Cloud or Comfy Router$/.test(r.detail) ? 'Comfy Cloud or Comfy Router' : PLACE_LABELS['comfy-cloud'];
/** Route id → run-on, learned from the server's listings (each route's explicit vendor: models[].runsOn[].routes). */
const ROUTE_RUN_ON = new Map<string, string>();
type RouteLike = { routeId?: string | null; kind?: string | null; runOn?: string | null; vendor?: string | null };
/** A route (object or id; old jobs and spend rows) → run-on id. Reads the route's own runOn / vendor, then what the server listed for that
 *  route id; the id regex is only the fallback for routes the server never listed. */
export function runOnOfRoute(route?: string | RouteLike | null, kind?: string | null): string | null {
  const o: RouteLike | null = route && typeof route === 'object' ? route : null; const id = o ? String(o.routeId ?? '') : String(route ?? '');
  const own = o?.runOn ?? o?.vendor; if (own && RUN_ON_LABEL[own]) return own;
  const listed = id ? ROUTE_RUN_ON.get(id) : undefined; if (listed) return listed;
  const k = kind ?? o?.kind ?? (id ? id.split(':')[0] : '');
  if (!k) return null; if (k === 'local') return 'local'; if (k === 'comfy-cloud' || k === 'comfy-router') return 'comfy-cloud'; if (k === 'fal' || k === 'replicate') return k;
  if (k === 'direct') { const r = id; return /bfl|flux/i.test(r) ? 'bfl' : /minimax/i.test(r) ? 'minimax' : /ltx/i.test(r) ? 'ltx' : /^direct:(openai\/|direct-openai)/i.test(r) ? 'openai' : /^direct:(google\/|direct-gemini)/i.test(r) ? 'google' : /^direct:(byteplus\/|direct-seed|direct-byteplus)/i.test(r) ? 'byteplus' : /qwen3-tts|dashscope/i.test(r) ? 'dashscope' : /luma/i.test(r) ? 'luma' : 'direct'; }
  return RUN_ON_LABEL[k] ? k : null;
}

// ---------------------------------------------------------------- the tool → models cache (filled by api.listTools)
const TOOLS = new Map<string, ToolLike>(); const tbus = new Set<() => void>();
export function noteToolModels(tools: ToolLike[]) { for (const t of tools) if (t && t.id) { TOOLS.set(t.id, t); for (const m of t.models ?? []) for (const row of (m as any).runsOn ?? []) for (const r of row?.routes ?? []) { const rid = typeof r === 'string' ? r : r?.routeId; if (rid && row.id) ROUTE_RUN_ON.set(rid, row.id); } } tbus.forEach(f => f()); void migrateLegacyPins(); }
/** Maker (key + name) of a model key, from any cached tool that lists it. */
export function makerOfModel(key?: string | null): { maker: string | null; makerName: string | null } | null { if (!key) return null; for (const t of TOOLS.values()) { const m = t.models?.find(x => x.key === key); if (m) return { maker: m.maker ?? null, makerName: m.makerName ?? null }; } return null; }
export const toolLike = (toolId: string) => TOOLS.get(toolId);
export const modelsOf = (toolId?: string | null): ToolModel[] => (toolId ? (TOOLS.get(toolId)?.models ?? []) : []);
export function useToolModels(toolId?: string | null): ToolModel[] { const [, t] = useState(0); useEffect(() => { const f = () => t(x => x + 1); tbus.add(f); return () => { tbus.delete(f); }; }, []); return modelsOf(toolId); }
/** Models an engine builds on a tool (camera's comfy-open builds two: Wan 2.2 Fun Camera 14B and LTX-2 19B). */
export const enginesModels = (toolId: string, engine: string) => modelsOf(toolId).filter(m => m.engines.includes(engine));
/** The model an engine means on a tool. `hint` (a model key or a model name, e.g. the camera move's model) picks among several. */
export function modelOfEngine(toolId: string | null | undefined, engine: string | null | undefined, hint?: string | null): ToolModel | undefined {
  if (!toolId || !engine) return undefined; const ms = enginesModels(toolId, engine); if (ms.length <= 1) return ms[0] ?? modelsOf(toolId).find(m => m.key === engine);
  const h = String(hint ?? '').trim().toLowerCase(); return (h && ms.find(m => m.key.toLowerCase() === h || m.name.toLowerCase() === h)) || ms.find(m => m.key === ACTIVE.get(toolId)) || ms[0];
}
/** The engine to run a model with: the current one when it builds this model (keeps the tool's own variant), else the model's primary engine
 *  (when the tool page lists it), else its first listed engine. `listed` = the provider ids the page offers. */
export function engineForModel(m: ToolModel, current?: string | null, listed?: string[] | null): string {
  const ok = (e: string) => !listed || listed.includes(e);
  if (current && m.engines.includes(current) && ok(current)) return current;
  return ok(m.primaryEngine) ? m.primaryEngine : m.engines.find(ok) ?? m.primaryEngine;
}
/** The model a page shows for an ambiguous engine (camera: set by the move); read by modelOfEngine and the request params. */
const ACTIVE = new Map<string, string>();
export const setActiveModel = (toolId: string, modelKey: string | null) => { if (modelKey) ACTIVE.set(toolId, modelKey); else ACTIVE.delete(toolId); };
/** ?model= deep links: a model key or an old engine id → the engine the page should select (null = not this tool's). Sync, from the
 *  tool's own models[]; resolveModelLink() asks GET /api/models/resolve for anything else. */
export function engineForModelParam(tool: ToolLike | null | undefined, id: string | null | undefined): string | null {
  if (!tool || !id) return null; const ps = (tool.providers ?? []).map(p => p.id);
  if (ps.includes(id)) return id; const m = (tool.models ?? []).find(x => x.key === id); if (!m) return null;
  /* an engine shared by several models here (Camera's comfy-open: Wan Fun Camera and LTX-2 19B): prefer one only this model uses, and say which model is meant */
  const shared = (e: string) => (tool.models ?? []).filter(x => x.engines.includes(e)).length > 1;
  const e = engineForModel(m, null, ps); if (!shared(e)) return e;
  setActiveModel(tool.id, m.key); return m.engines.find(x => ps.includes(x) && !shared(x)) ?? e;
}
export async function resolveModelLink(toolId: string, id: string): Promise<{ model: string; engine: string; runOn: string; name: string } | null> {
  try { const r = await fetch(`/api/models/resolve?${new URLSearchParams({ toolId, model: id })}`); return r.ok ? await r.json() : null; } catch { return null; }
}
/** The ?model= value of the current URL. */
export const modelParam = () => { try { return new URLSearchParams(location.search).get('model'); } catch { return null; } };
/** Deep link that names something the tool's own list doesn't (an alias the server knows): resolve it once, then select that engine. */
export function useModelLink(tool: ToolLike | null | undefined, setProvider: ((id: string) => void) | undefined) {
  useEffect(() => { const id = modelParam(); if (!tool || !id || !setProvider || engineForModelParam(tool, id)) return; let live = true;
    void resolveModelLink(tool.id, id).then(r => { if (!live || !r) return; const ps = (tool.providers ?? []).map(p => p.id); const e = ps.includes(r.engine) ? r.engine : engineForModelParam(tool, r.model); if (e) setProvider(e); });
    return () => { live = false; }; }, [tool?.id]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** `search` with ?model= set to `value` (or removed), other params kept in order. */
export function withModelSearch(search: string, value: string | null): string { const sp = new URLSearchParams(search); if (value) sp.set('model', value); else sp.delete('model'); const q = sp.toString(); return q ? `?${q}` : ''; }
/** The ?model= value for a picked engine: the model key the tool lists for it (qwen-image-2-1), else the engine id. */
export const modelParamFor = (toolId: string, engine: string) => modelOfEngine(toolId, engine)?.key ?? engine;
/**
 * ?model= follows the model picker (history.replaceState, so switching models never adds Back entries). A deep link the page can't map yet
 * (an alias resolved by useModelLink) is left alone on the first render, and replaced once the picked model changes.
 */
export function useModelParamSync(tool: ToolLike | null | undefined, engine: string | null | undefined, enabled = true) {
  const first = useRef(true);
  useEffect(() => {
    const wasFirst = first.current; first.current = false;
    if (!enabled || !tool || !engine) return; const cur = modelParam();
    if (cur && engineForModelParam(tool, cur) === engine) return; // already names this model (its key or an old engine id)
    if (wasFirst && cur && !engineForModelParam(tool, cur)) return; // an alias still resolving
    const want = modelParamFor(tool.id, engine); if (cur === want) return;
    try { history.replaceState(history.state, '', location.pathname + withModelSearch(location.search, want) + location.hash); } catch { /* sandboxed */ }
  }, [tool?.id, engine, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
}

// ---------------------------------------------------------------- routing prefs cache (GET/PUT /api/me/routing)
let ROUTING: any = null; const rbus = new Set<() => void>(); let rload: Promise<void> | null = null;
export function setRouting(v: any) { ROUTING = v; mirrorPerTool(v); rbus.forEach(f => f()); }
export const routingNow = () => ROUTING;
export function loadRouting(force = false): Promise<void> { if (rload && !force) return rload; rload = fetch('/api/me/routing').then(r => r.ok ? r.json() : null).then(v => { if (v) setRouting(v); }).catch(() => undefined); return rload; }
export function useRouting() { const [, t] = useState(0); useEffect(() => { const f = () => t(x => x + 1); rbus.add(f); if (!ROUTING) void loadRouting(); return () => { rbus.delete(f); }; }, []); return ROUTING; }

// ---------------------------------------------------------------- run-on choice per (tool, model)
export interface RunOnPick { runOn: string; allowFallback?: boolean; route?: string; source?: 'tool' | 'legacy' | 'local' }
const LS = (t: string, m: string) => `ohf:runon:${t}:${m}`;
const lsGet = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string | null) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode */ } };
/** Keep the localStorage mirror equal to the server's choices (explicit and migrated ones), so a fresh tab paints the right run-on at once. */
function mirrorPerTool(v: any) {
  const pt = v?.perTool; if (!pt || typeof pt !== 'object') return;
  try { const keep = new Set<string>();
    for (const [t, ms] of Object.entries<any>(pt)) for (const [m, e] of Object.entries<any>(ms ?? {})) { const k = LS(t, m); keep.add(k); lsSet(k, JSON.stringify({ runOn: e?.runOn ?? 'auto', ...(e?.allowFallback != null ? { allowFallback: !!e.allowFallback } : {}), ...(e?.route ? { route: e.route } : {}) })); }
    for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && k.startsWith('ohf:runon:') && k !== MIGRATED && !keep.has(k)) localStorage.removeItem(k); }
  } catch { /* private mode */ }
}
/** The saved choice for (tool, model): the server's perTool entry (explicit or a migrated old pin), else the local mirror, else Auto. */
export function getRunOn(toolId: string, modelKey: string): RunOnPick {
  const e = ROUTING?.perTool?.[toolId]?.[modelKey];
  if (e) return { runOn: String(e.runOn ?? 'auto'), allowFallback: e.allowFallback ?? undefined, route: e.route ?? undefined, source: e.source === 'legacy' ? 'legacy' : 'tool' };
  if (ROUTING) return { runOn: 'auto' };
  const raw = lsGet(LS(toolId, modelKey)); if (raw) { try { const j = JSON.parse(raw); return { runOn: String(j.runOn ?? 'auto'), allowFallback: j.allowFallback, route: j.route, source: 'local' }; } catch { /* ignore */ } }
  return { runOn: 'auto' };
}
export function useRunOn(toolId?: string | null, modelKey?: string | null): RunOnPick { useRouting(); return toolId && modelKey ? getRunOn(toolId, modelKey) : { runOn: 'auto' }; }
/** The explicit perTool map to PUT back (read-only labels and migrated 'legacy' rows left out; the server keeps applying those). */
function explicitPerTool(): Record<string, Record<string, any>> {
  const out: Record<string, Record<string, any>> = {};
  for (const [t, ms] of Object.entries<any>(ROUTING?.perTool ?? {})) for (const [m, e] of Object.entries<any>(ms ?? {})) { if (!e || e.source === 'legacy') continue;
    if (!e.route && (!e.runOn || e.runOn === 'auto')) continue; (out[t] ??= {})[m] = { runOn: e.runOn, ...(e.route ? { route: e.route } : {}) }; }
  return out;
}
/** Plain words for a refused PUT (the server's own message, minus field paths). */
const putError = (b: any, status: number) => { const m = String(b?.issues?.[0]?.message && b.issues[0].code !== 'local_unavailable' ? b.issues[0].message : b?.error ?? `Couldn’t save (HTTP ${status}).`);
  return /local ComfyUI is not available/i.test(m) ? 'Local isn’t set up on this server, so this can’t run there yet. Set up ComfyUI first.' : m.replace(/^perTool\.[^:]+:\s*/, ''); };
async function putPerTool(pt: Record<string, Record<string, any>>) {
  const r = await fetch('/api/me/routing', { method: 'PUT', headers: { 'content-type': 'application/json', 'x-openhiggsfield-source': 'web run-on' }, body: JSON.stringify({ perTool: pt }) });
  const b = await r.json().catch(() => null); if (!r.ok) throw new Error(putError(b, r.status)); setRouting(b); requestRequote(); return b;
}
/** Save where a model runs on a tool (a run-on id). 'auto' / '' forgets the choice: the pre-selected place applies again. The quote re-runs right after. */
export async function setRunOn(toolId: string, modelKey: string, runOn: string): Promise<void> {
  if (!ROUTING) await loadRouting(true);
  const pt = explicitPerTool();
  if (!runOn || runOn === 'auto') { if (pt[toolId]) { delete pt[toolId][modelKey]; if (!Object.keys(pt[toolId]).length) delete pt[toolId]; } }
  else (pt[toolId] ??= {})[modelKey] = { runOn };
  await putPerTool(pt);
}
/** Save one named way to run at a place (Run on's choice rows): remembered per tool and model on the server, like Make default, so the quote,
 *  the run and MCP all use it. */
export async function setRoute(toolId: string, modelKey: string, runOn: string, routeId: string): Promise<void> {
  if (!ROUTING) await loadRouting(true);
  const pt = explicitPerTool(); (pt[toolId] ??= {})[modelKey] = { runOn, route: routeId }; await putPerTool(pt);
}
/** Forget the choices for one tool (or every tool): back to Auto. Old per-engine pins that apply there are cleared too. */
export async function resetRunOns(toolId?: string): Promise<void> {
  if (!ROUTING) await loadRouting(true);
  const pt = explicitPerTool(); if (toolId) delete pt[toolId]; const body: any = { perTool: toolId ? pt : {} };
  if (!toolId) body.perModel = {}; // the old per-engine pins too ("Reset all")
  const r = await fetch('/api/me/routing', { method: 'PUT', headers: { 'content-type': 'application/json', 'x-openhiggsfield-source': 'web run-on reset' }, body: JSON.stringify(body) });
  const b = await r.json().catch(() => null); if (!r.ok) throw new Error(putError(b, r.status)); setRouting(b); requestRequote();
}

// ---------------------------------------------------------------- quote / submit params (the fetch guard in api.ts calls this)
type Params = { get(k: string): any; set(k: string, v: string): void; has(k: string): boolean; delete(k: string): void };
/**
 * Add `model` (+ `runOn`, `allowFallback`) to a quote or a submit for this tool, from its `provider` (engine) and the saved run-on:
 *  - an explicit `route` or `runOn` on the request wins (Recreate, a fallback choice): untouched;
 *  - `model` only when the engine means one model here (or the page said which, setActiveModel), so the server narrows to that model's routes;
 *  - `runOn` when the choice isn't Auto; the engine is swapped for one that runs there when the current one can't (quote and submit swap alike).
 */
export function applyRunOnParams(toolId: string, p: Params) {
  try {
    if (p.has('route') || p.has('runOn') || p.has('run_on')) return; const engine = String(p.get('provider') ?? ''); if (!engine) return;
    const ms = enginesModels(toolId, engine); if (!ms.length) return;
    const act = ACTIVE.get(toolId); const m = ms.length === 1 ? ms[0] : ms.find(x => x.key === act); if (!m) return;
    if (!p.has('model')) p.set('model', m.key);
    const pick = getRunOn(toolId, m.key); if (!pick.runOn || pick.runOn === 'auto') return; // no saved choice: the server pre-selects the place (quote and submit alike) and names it
    const row = m.runsOn.find(r => r.id === pick.runOn); if (!row) return; // a choice this model no longer has: the server's own pin logic says so
    if (!row.engines.includes(engine) && row.engines[0]) { p.set('provider', row.engines[0]); p.delete('quotedRouteId'); p.delete('quotedCredits'); } // that quote was keyed by the other engine
    p.set('runOn', pick.runOn);
  } catch { /* never block a request */ }
}

// ---------------------------------------------------------------- one-time migration of the old per-engine browser pins
const MIGRATED = 'ohf:runon:migrated';
let migrating = false;
export async function migrateLegacyPins() {
  if (migrating || lsGet(MIGRATED) === '1' || !TOOLS.size) return; migrating = true;
  try {
    const old: [string, string][] = []; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k?.startsWith('ohf:route:')) { const v = localStorage.getItem(k); if (v && v !== 'auto') old.push([k.slice(10), v]); } } } catch { /* private mode */ }
    if (!old.length) { lsSet(MIGRATED, '1'); return; }
    await loadRouting(); const pt = explicitPerTool(); let n = 0;
    for (const [engine, route] of old) { const fb = lsGet(`ohf:fallback:${engine}`);
      for (const t of TOOLS.values()) for (const m of t.models ?? []) { if (!m.engines.includes(engine)) continue; const row = m.runsOn.find(r => r.routes.includes(route)); if (!row) continue; // only where that route serves this engine (no cross-tool leak)
        if (pt[t.id]?.[m.key] || ROUTING?.perTool?.[t.id]?.[m.key]) continue; void fb; (pt[t.id] ??= {})[m.key] = { runOn: row.id }; n++; } }
    if (n) { try { await putPerTool(pt); } catch { const noGpu = JSON.parse(JSON.stringify(pt)); for (const ms of Object.values<any>(noGpu)) for (const [k, e] of Object.entries<any>(ms)) if (e.runOn === 'local') delete ms[k]; await putPerTool(noGpu).catch(() => undefined); } }
    lsSet(MIGRATED, '1'); // the old keys stay (read-only) for one release
  } catch { /* try again next load */ } finally { migrating = false; }
}

// ---------------------------------------------------------------- price tokens (one unit per context)
/** A place row's price (billing.ts runPrice, the Generate button's words): '≈ $0.64' on any place, team mode '$0.64'; dollars only. A row that already names the place says just 'Free' locally. `credits` are ✦ (1 = $0.01, the server's USD × 100). */
export function listPrice(credits: number | null | undefined, runOn: string | null | undefined, own: boolean | null): string | null {
  if (runOn === 'local') return 'Free'; return runPrice({ own, credits, runOn });
}

// ---------------------------------------------------------------- status words
export const STATUS_WORD: Record<string, string> = { ready: 'Ready', sample: 'Sample', 'needs-key': 'Needs a key', off: 'Off', 'not-installed': 'Not on your computer yet', 'coming-soon': 'Coming soon', unavailable: 'Not available', retiring: 'Retiring' };
/** Dot colour class for a status. */
export const statusDot = (s: string) => (s === 'ready' ? 'ok' : s === 'sample' || s === 'needs-key' ? 'demo' : 'off');
/** "Needs Comfy Cloud or a fal key" for a model's needs-key tooltip. */
export function needsWhat(m: ToolModel): string {
  const ks = m.runsOn.filter(r => r.status === 'needs-key').map(r => (r.id === 'comfy-cloud' ? 'a Comfy key' : `a ${r.label} key`));
  return ks.length ? `Needs ${ks.length > 1 ? `${ks.slice(0, -1).join(', ')} or ${ks.at(-1)}` : ks[0]}` : '';
}
/** One-line state of a model for the menu (status chip + tooltip). Retiring is shown as its own pill, the state stays. */
export function modelStateLine(m: ToolModel): { k: 'ok' | 'demo' | 'off'; s: string; t: string; off: boolean } {
  const rs = m.rowStatus; // one status from one source (server rowStatus): the pre-selected place, else what setting it up takes
  if (rs) {
    const ways = (m.setup ?? []).map(x => `${x.label}: ${x.action.text}`).join(' · ');
    if (rs.kind === 'ready') return { k: 'ok', s: 'Ready', t: rs.runOn === 'local' ? 'Runs locally, free.' : `Runs on ${rs.text}.`, off: false };
    if (rs.kind === 'sample') return { k: 'demo', s: 'Sample', t: 'Free sample output until you add a key.', off: false };
    if (rs.kind === 'coming_soon') return { k: 'off', s: 'Coming soon', t: 'Not connected on this server yet.', off: true };
    if (rs.kind === 'unavailable') return { k: 'off', s: 'Not available', t: 'Not available here.', off: true };
    return { k: rs.kind === 'add_key' || rs.kind === 'set_up' ? 'demo' : 'off', s: rs.text, t: `Not set up yet. ${ways || rs.text}.`, off: false };
  }
  const st = m.state; const why = (r?: RunOnRow) => r?.reason ? String(r.reason).replace(/\.?$/, '.') : '';
  if (st === 'ready') { const gpu = m.runsOn.find(r => r.id === 'local' && r.status === 'ready'); return { k: 'ok', s: 'Ready', t: gpu ? 'Runs locally, free.' : `Runs on ${m.runsOn.filter(r => r.status === 'ready').map(r => r.label).join(', ')}.`, off: false }; }
  if (st === 'sample') return { k: 'demo', s: 'Sample', t: `Free sample output until you add a key.${needsWhat(m) ? ` Real runs: ${needsWhat(m).replace(/^Needs /, '')}.` : ''}`, off: false };
  if (st === 'needs-key') return { k: 'demo', s: 'Needs a key', t: `${needsWhat(m)}. Add one in Settings → Connections.`, off: false };
  if (st === 'not-installed') return { k: 'off', s: 'Not on your computer yet', t: why(m.runsOn.find(r => r.id === 'local')) || 'Runs only on your computer, which isn’t set up yet.', off: false };
  if (st === 'coming-soon') return { k: 'off', s: 'Coming soon', t: 'Not connected on this server yet.', off: true };
  return { k: 'off', s: 'Not available', t: why(m.runsOn[0]) || 'Not available here.', off: true };
}
/** Who bills a run-on, in words for a sub-line. */
export const billsText = (r: RunOnRow) => (r.id === 'local' ? 'Nothing billed' : r.id === 'comfy-cloud' ? 'Billed to your Comfy account' : `Billed to your ${r.label} account`);
/** Comfy Cloud's sub-line: which kind of run it is. */
export function comfyVariantText(r: RunOnRow, modelName: string, _family?: string) {
  const v = r.comfyVariants ?? []; if (!v.length) return '';
  if (v.includes('workflow') && v.includes('partner')) return 'Our open workflow, or the maker’s own model when the workflow can’t take the job';
  return v.includes('workflow') ? 'Our open workflow' : `${modelName} from its maker`;
}

// ---------------------------------------------------------------- jobs and spend rows (copy pass, spec §2.6)
/** Model vs Run-on (spec §2.6): the catalogue model name with version (the tool's models[] entry for job.modelKey) when it names what the server says ran
 *  ("Nano Banana 2", not "Nano Banana 2 edit"); a name that doesn't match what ran (a hosted fallback that is another model) keeps the server's. */
export function cleanModelName(job: any, served: string): string {
  const key = String(job?.modelKey ?? ''); const m = key ? modelsOf(job?.toolId).find(x => x.key === key) : undefined; if (!m) return served;
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); const names = [m.name, m.displayName].filter(Boolean).map(x => norm(String(x))); const s = norm(served);
  return !served || names.some(n => s.startsWith(n) || n.startsWith(s)) ? shownName(m) : served;
}
/** Where a job ran, in the Run-on words: "Local", "Comfy · Comfy Cloud", "Comfy · Comfy Router", "fal". */
export function ranOnOf(job: any, localWhere = ''): string {
  const route = String(job?.route ?? ''); const ro = String(job?.runOn ?? '') || runOnOfRoute(route) || '';
  if (!ro) return ''; if (ro === 'local') return localWhere && !/local comfyui|your gpu/i.test(localWhere) ? localWhere : LOCAL_LABEL;
  const ch = route ? routeChoiceOf(modelsOf(job?.toolId).find(x => x.key === job?.modelKey) ?? null, route) : null; if (ch) return ch.name; // "Comfy Cloud · open workflow" when the place has several ways
  const label = String(job?.runOnLabel ?? '') || runOnLabel(ro);
  return placeLabelOf(job) || label; /* the one place words (Comfy Cloud / Comfy Router / Comfy deployment / fal…), server/src/shared/modelIds.ts placeOf */
}

// ---------------------------------------------------------------- the place shown (Run on, 2026-10-22: no Auto)
/** Where this model runs on this tool now: the saved choice, else the place the live quote resolved (it priced the real job, the same
 *  resolver as the submit), else the listing's pre-selection. Never 'auto'. null = nothing is ready, so nothing is pre-selected (the setup
 *  card asks the user to pick a place; a download or a key place is never shown as the place). */
export function placeOf(m: ToolModel | undefined, pick: string | null | undefined, q?: any): string | null {
  if (pick && pick !== 'auto') return pick;
  const mine = !!q && (!q.modelKey || !m || q.modelKey === m.key);
  const qr = mine && typeof q.runOn === 'string' && q.runOn && q.runOn !== 'auto' ? q.runOn : null;
  if (qr) return qr; if (mine && q.runnable === false && 'runOn' in q && q.runOn == null) return null;
  return m && 'preselect' in m ? m.preselect?.runOn ?? null : m?.autoRunOn ?? m?.runsOn[0]?.id ?? null; // older servers (no preselect): the first place
}
/** The setup card's rows: the quote's setupOptions (judged on the current job), else its one setup, else the listing's models[].setup. */
export function setupPlacesOf(m: ToolModel | undefined, q?: any): SetupPlace[] {
  const act = (o: any): PlaceAction => ({ kind: o.action, text: o.actionText, missingBytes: o.missingBytes ?? null, downloadId: o.downloadId ?? null, ...(o.connection ? { connection: o.connection } : {}) });
  if (q && Array.isArray(q.setupOptions) && q.setupOptions.length) return q.setupOptions.map((o: any) => ({ runOn: o.runOn, label: o.runOnLabel ?? runOnLabel(o.runOn), action: act(o), credits: o.credits ?? null, ...(o.slow ? { slow: true } : {}) }));
  if (q && q.setup && q.setup.actionText) return [{ runOn: q.setup.runOn, label: q.setup.runOnLabel ?? runOnLabel(q.setup.runOn), action: act(q.setup), credits: q.setup.runOn === 'local' ? 0 : q.listCredits ?? null }];
  return !q && m && !m.preselect && m.setup?.length ? m.setup : [];
}
/** Short status words for the chip (it keeps its size); the full action is the tooltip and the menu row. */
export const CHIP_ACTION_WORD: Record<string, string> = { add_key: 'Needs a key', download: 'Download', install_node: 'Needs a node', turn_on: 'Off', set_up_gpu: 'Not set up' };
