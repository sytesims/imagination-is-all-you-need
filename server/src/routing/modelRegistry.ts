/**
 * Model registry (MODEL-ROUTE-SPEC steps 1–2): joins the static model table (shared/modelIds.ts) with the live tools and routes.
 *
 *   toolModels(tool)            models a tool offers, each with its engines (old provider ids) and the routes they contribute
 *   modelKeyOf(toolId, engine)  engine alias → model key, per tool (camera comfy-open depends on the move: ltx-* → LTX-2 19B)
 *   engineAlias(tool, engine)   engine → { model, runOn } (runOn = the one place the engine runs, else 'auto')
 *   resolveModelRequest(…)      { model, runOn, provider, route } on a quote or a submit → the engine + route fields the old resolver takes.
 *                               Quote (routing/http.ts) and submit (index.ts) call it with the same fields, so they resolve the same route.
 *   modelsBlock(tool, providers) per-tool models[] for GET /api/tools (built from the provider views already computed there)
 *   registryView()              GET /api/models/registry
 *   jobModelFields(job)         modelKey / runOn for a job (stored on new jobs, derived on read for old ones)
 *
 * Old engine ids stay valid everywhere; nothing here changes a route id or a price.
 */
import { visiblePlaces } from './hiddenPlaces.js';
import { VUP_TOOLS, VUP_ORDER } from '../shared/videoUpscale.js';
import { threeDModel } from '../shared/threeD.js';
import { LOCAL_HW_BLOCK } from './routes.js';
import type { ToolDef } from '../tools/types.js';
import { getTool, listTools } from '../tools/registry.js';
import { getProvider, toolProviders, providerLicense, providerOpenWeights, openWeightsOnly } from '../providers.js';
import { routesFor, findRoute, tierOf, NOT_A_CHOICE } from './routes.js';
import type { RouteDef } from './types.js';
import { cardName } from '../models.js';
import { catalogFor, cleanName, MODEL_CATALOG } from '../shared/modelCatalog.js';
import { LICENSES } from '../licenses.js';
import { lifecycleFields } from '../shared/lifecycle.js';
import { weightsGate } from '../hardware/requirements.js';
import { MAC_WEIGHTS_REASON } from '../hardware/macWeights.js';
import { LOCAL_UNREACHABLE_REASON } from './runnable.js';
import { MODELS, MAKERS, makerOf, RUN_ON_IDS, RUN_ON_LABELS, RUN_ON_BILLED_TO, engineModelKey, ENGINE_MODEL, TOOL_SPLITS, engineSplits, isLtxMove, normRunOn, runOnOfRoute, runOnOfRouteId, aKey, COMFY_DEPLOY_DETAIL, placeOf, type ModelDef, type RunOn, type InputRule } from '../shared/modelIds.js';
import { CATALOGUE, THREE_D_BEST_FOR, variantsOf, type AudioKind } from '../shared/modelRank.js';
import { IMAGE_CAPS } from '../shared/imageCaps.js';
import { VIDEO_LIMITS, ROUTE_LIMITS } from '../tools/h3/videoCaps.js';
import { getPrefs, toolPinOf } from './prefs.js';
import { routeChoiceNames } from '../shared/routeNames.js';
import { RELEASES } from '../releaseDates.js';

export { normRunOn, runOnOfRoute, RUN_ON_LABELS, type RunOn };
export const baseToolOf = (tool?: { id: string; app?: any } | null): string | null => (tool as any)?.app?.gallery?.base ?? null;
const toolOf = (t: ToolDef | string) => (typeof t === 'string' ? getTool(t) : t);
/** Job / request `types` (array, JSON string, comma list) → move ids. */
export const typesList = (v: unknown): string[] => { if (Array.isArray(v)) return v.map(String); const s = String(v ?? '').trim(); if (!s) return [];
  try { const t = JSON.parse(s); return Array.isArray(t) ? t.map(String) : [String(t)]; } catch { return s.split(',').map((x) => x.trim()).filter(Boolean); } };
const ruleFits = (rule: InputRule | undefined, types: string[]) => !rule || !types.length || (rule === 'camera-ltx' ? types.every(isLtxMove) : !types.some(isLtxMove));

export interface ModelPart { engine: string; /** route ids of this engine that serve the model; null = all its routes on this tool */ routes: string[] | null; input?: InputRule }
export interface ToolModel { key: string; def: ModelDef & { derived?: boolean }; parts: ModelPart[]; /** engine that runs it by default (first offered) */ primary: string }

/** A model entry for an engine missing from the table (plugin tools): key = the engine id, name from its card. Never throws. */
function derivedDef(tool: ToolDef, engine: string): ModelDef & { derived: true } {
  const P = getProvider(engine); const name = cardName(tool.id, engine) ?? cleanName(P?.name ?? engine);
  const medium = /image/i.test(tool.id) || (tool as any).category === 'Image' ? 'image' : /audio|voice|sound/i.test(tool.id) ? 'audio' : 'video';
  return { key: engine, name, family: name.split(/[\s.-]/)[0] || name, medium, openWeights: threeDModel(engine)?.openWeights ?? providerOpenWeights(P) /* 3D: the model's own weights, not the place (TRELLIS.2 on fal is still open) */, license: null, blurbKey: `${tool.id}:${engine}`, derived: true };
}
const cache = new WeakMap<ToolDef, ToolModel[]>();
/** Every model a tool offers (all engines in tool.providers, so every old id resolves), in the tool's own order (best first). */
export function toolModels(t: ToolDef | string): ToolModel[] {
  const tool = toolOf(t); if (!tool) return [];
  const hit = cache.get(tool); if (hit) return hit;
  const base = baseToolOf(tool); const out: ToolModel[] = [];
  const add = (key: string, def: ToolModel['def'], part: ModelPart) => { let e = out.find((x) => x.key === key); if (!e) { e = { key, def, parts: [], primary: part.engine }; out.push(e); } e.parts.push(part); };
  for (const engine of tool.providers) {
    const splits = engineSplits(tool.id, engine, base);
    if (splits) { for (const s of splits) add(s.model, MODELS[s.model], { engine, routes: s.routes, input: s.input }); continue; }
    const k = engineModelKey(tool.id, engine, base);
    if (k && MODELS[k]) add(k, MODELS[k], { engine, routes: null }); else { const d = derivedDef(tool, engine); add(d.key, d, { engine, routes: null }); }
  }
  // A model whose first engine is only a Comfy Cloud twin alias (cloud-ltx-camera listed after comfy-open) keeps the open engine as primary.
  cache.set(tool, out); return out;
}
export const findToolModel = (t: ToolDef | string, key: string) => toolModels(t).find((m) => m.key === key);
/** Routes of one part (the engine's routes on this tool, narrowed to the split). */
export const partRoutes = (tool: ToolDef, p: ModelPart): RouteDef[] => routesFor(p.engine, tool).filter((r) => !p.routes || p.routes.includes(r.routeId));
/** All routes of a model on a tool, de-duplicated by route id (first engine wins), with the engine that owns each. */
export function modelRoutes(tool: ToolDef, m: ToolModel): { engine: string; route: RouteDef }[] {
  const seen = new Set<string>(); const out: { engine: string; route: RouteDef }[] = [];
  for (const p of m.parts) for (const r of partRoutes(tool, p)) if (!seen.has(r.routeId)) { seen.add(r.routeId); out.push({ engine: p.engine, route: r }); }
  return out;
}
/**
 * Engine alias → model key for this tool. With input, an engine that serves several models picks by the job (camera comfy-open: LTX moves → ltx-2-19b).
 * Unknown tool or engine → the engine id itself (never throws).
 */
export function modelKeyOf(toolId: string, engine: string, input?: Record<string, any> | null): string {
  const tool = getTool(toolId); if (!tool) return engineModelKey(toolId, engine) ?? engine;
  const ms = toolModels(tool).filter((m) => m.parts.some((p) => p.engine === engine)); if (!ms.length) return engineModelKey(toolId, engine, baseToolOf(tool)) ?? engine;
  if (ms.length === 1 || !input) return ms[0].key;
  const ty = typesList(input.types ?? input.preset);
  return (ms.find((m) => m.parts.some((p) => p.engine === engine && p.input && ty.length && ruleFits(p.input, ty))) ?? ms[0]).key;
}
/** The model a route of an engine serves on a tool: the only split that lists it, else by the job (camera local:comfy-open serves both). */
export function routeModelKey(toolId: string, engine: string, routeId: string, input?: Record<string, any> | null): string {
  const ms = toolModels(toolId).filter((m) => m.parts.some((p) => p.engine === engine && (!p.routes || p.routes.includes(routeId))));
  return ms.length === 1 ? ms[0].key : modelKeyOf(toolId, engine, input);
}
/** The part of a model an engine contributes on a tool. */
const partOf = (m: ToolModel, engine: string) => m.parts.find((p) => p.engine === engine);
/** engine → { model, runOn }: runOn is the single account the engine's routes (for that model) run on, else 'auto' (Auto picks among several). */
export function engineAlias(tool: ToolDef, engine: string, input?: Record<string, any> | null): { model: string; runOn: RunOn | 'auto' } {
  const key = modelKeyOf(tool.id, engine, input); const m = findToolModel(tool, key); const p = m ? partOf(m, engine) : undefined;
  const ro = [...new Set((p ? partRoutes(tool, p) : routesFor(engine, tool)).filter((r) => !r.comingSoon).map((r) => runOnOfRoute(r)))];
  return { model: key, runOn: ro.length === 1 ? ro[0] : 'auto' };
}
/** comfyVariant of a Comfy Cloud route: our open workflow on Comfy's GPUs, or a partner/API node through Comfy. */
/** The method label every given route shares (RouteDef caps.methodLabel), else ''. */
const methodOf = (ids: string[]) => { const ls = ids.map((id) => (findRoute(id)?.caps as any)?.methodLabel).filter((x): x is string => typeof x === 'string' && !!x); return ls.length && ls.length === ids.length && new Set(ls).size === 1 ? ls[0] : ''; };
export const comfyVariantOf = (r: { kind: string; routeId: string }) => (r.routeId.startsWith('comfy-deploy:') ? 'deployment' as const : r.kind === 'comfy-cloud' || r.kind === 'comfy-router' ? (tierOf(r) === 0 ? 'workflow' as const : 'partner' as const) : undefined);
/** What one route takes (sizes, lengths, shapes) for Run on's choice rows: a video route's own limits (its VIDEO_LIMITS row, else its engine's,
 *  narrowed by ROUTE_LIMITS), an image route's caps (route caps first, then the engine's image caps). null = nothing known. */
export function routeLimitsOf(engine: string, routeId: string): { resolutions: string[] | null; durations: number[] | null; aspects: string[] | null } | null {
  const r = findRoute(routeId); const own = VIDEO_LIMITS[routeId.slice(routeId.indexOf(':') + 1)]; const L: any = own ?? VIDEO_LIMITS[engine];
  if (L) { const v = { ...L, ...(ROUTE_LIMITS[routeId] ?? {}) }; return { resolutions: v.resolutions ?? null, durations: v.durations ?? null, aspects: v.aspects ?? null }; }
  const rc: any = r?.caps ?? {}; const ic: any = IMAGE_CAPS[engine];
  const res = Array.isArray(rc.resolutions) ? rc.resolutions : ic?.resolutions ?? null; const asp = Array.isArray(rc.aspects) && rc.aspects.length ? rc.aspects : ic?.aspects ?? null;
  return res || asp ? { resolutions: res, durations: null, aspects: asp } : null;
}
/** Run on's choices inside one place, when the model has two or more live routes there: each by name (shared/routeNames.ts), with its own
 *  price, status and limits, so the user can pick "Comfy Cloud · open workflow" over "Comfy Cloud · MiniMax’s service". */
function choicesOf(ro: RunOn, rs: any[], maker: string | null) {
  // only real alternatives: routes split by job type (fal's text-to-video / image-to-video endpoints, an edit twin) serve different jobs, not a choice
  const modesOf = (id: string) => findRoute(id)?.modes ?? null; const overlap = (a: string, b: string) => { const x = modesOf(a), y = modesOf(b); return !x || !y || x.some((k) => y.includes(k)); };
  const live0 = rs.filter((x) => x.status !== 'coming-soon' && !NOT_A_CHOICE.has(x.routeId)) /* a route the mode alone picks (Keyframes · Comfy Cloud) is never a choice */; const live = live0.filter((x) => live0.some((y) => y !== x && overlap(x.routeId, y.routeId))); if (live.length < 2) return null;
  const jobless = (id: string) => id.replace(/\/?(text|image|reference|video)-to-(image|video)|\/edit(-image)?|#edit/g, ''); if (new Set(live.map((x) => jobless(x.routeId))).size < 2) return null; // the same endpoint per job type
  const names = routeChoiceNames(RUN_ON_LABELS[ro], live.map((x) => { const r = findRoute(x.routeId); return { routeId: x.routeId, kind: x.kind, comfyVariant: x.comfyVariant, methodLabel: (r?.caps as any)?.methodLabel ?? null, label: r?.label ?? null }; }), maker);
  return live.map((x, i) => ({ routeId: x.routeId, engine: x.engine, name: names[i].name, word: names[i].word, why: names[i].why, status: x.status, credits: x.listCredits ?? null, reason: x.status === 'ready' || x.status === 'sample' ? null : x.reason, reasonCode: x.reasonCode ?? null, limits: routeLimitsOf(x.engine, x.routeId), modes: modesOf(x.routeId) }));
}
/** The place of a route (shared/modelIds.ts placeOf with its Comfy variant): the one source for every place label the server sends. */
export const routePlace = (r: { kind: string; routeId: string; envKey?: string | null; vendor?: string | null } | null | undefined) => (r ? placeOf({ ...r, comfyVariant: comfyVariantOf(r) ?? null }) : null);
/** Additive route fields (listings): runOn, its label, comfyVariant, and the place (label + billing). */
export const routeModelFields = (r: { kind: string; routeId: string; envKey?: string | null; vendor?: string | null }) => { const ro = runOnOfRoute(r); const cv = comfyVariantOf(r); const pl = routePlace(r); return { runOn: ro, runOnLabel: RUN_ON_LABELS[ro], ...(cv ? { comfyVariant: cv } : {}), ...(pl ? { place: pl, placeLabel: pl.label } : {}) }; };

// ---------------------------------------------------------------- request resolution (quote = submit)
export interface ModelRequest { model?: string | null; runOn?: string | null; provider?: string | null; route?: string | null; types?: unknown; mode?: string | null }
export type ModelResolution =
  | { ok: true; /** engine (old provider id) the existing resolver runs */ provider: string | null; modelKey: string | null; runOn: RunOn | 'auto' | null;
      /** route field for plan(): explicit route, 'auto' for runOn auto, else unchanged */ route: string | null;
      /** routes of the engine that belong to the model (null = all) */ allowRoutes: string[] | null;
      /** camera: the move list to use when the request named none (LTX-2 19B → its first LTX move) */ types: string | null; legacy: boolean }
  | { ok: false; status: 400; error: string; errorType: 'validation'; code: string; field: string; allowed?: string[] };
const bad = (code: string, field: string, error: string, allowed?: string[]): ModelResolution => ({ ok: false, status: 400, error, errorType: 'validation', code, field, ...(allowed ? { allowed } : {}) });
/** Request mode for route-mode checks (fal t2v / i2v / r2v endpoints). */
const modeOf = (r: ModelRequest) => typesList(r.types)[0] ?? (typeof r.mode === 'string' && r.mode ? r.mode : null);
const modeFits = (route: RouteDef, mode: string | null) => !mode || !route.modes || route.modes.includes(mode);
/** Run-ons a model has on a tool (non-coming-soon routes), in registry order. */
export const runOnsOf = (tool: ToolDef, m: ToolModel): RunOn[] => [...new Set(modelRoutes(tool, m).filter((x) => !x.route.comingSoon).map((x) => runOnOfRoute(x.route)))];
/** Camera LTX default move (first preset the LTX engine runs), injected lazily (tools/apps.ts imports this module's importers). */
let ltxDefaultMove: () => string | null = () => 'ltx-dolly-in';
export const setLtxDefaultMove = (f: () => string | null) => { ltxDefaultMove = f; };
/**
 * Deterministic: depends only on the request fields, never on keys or prefs (plan() does the rest with the job input), so a quote and a submit
 * with the same fields resolve the same engine and constraint. Precedence (spec §2.7 B): route > runOn > provider/model default.
 *  - no `model` → unchanged (legacy fields only); `runOn` alone still applies in plan() to the engine the tool picks.
 *  - `model` = an old engine id → legacy alias: that engine, all its routes (exactly what provider=<id> did).
 */
export function resolveModelRequest(t: ToolDef | string, req: ModelRequest): ModelResolution {
  const tool = toolOf(t); if (!tool) return bad('unknown_tool', 'toolId', 'Unknown tool.');
  // Scope the removal to NEW motion requests (legacy provider, model and explicit-route clients alike).
  // jobModelFields/modelKeyOf below still resolve the real model of historical runs.
  if (tool.id === 'motion-transfer' && [req.provider, req.model, req.route].some((v) => /^(?:comfy-h3-charswap|cloud-h3-charswap|minimax-h3-character-swap|local:comfy-h3-charswap|comfy-cloud:cloud-h3-charswap)$/.test(String(v ?? ''))))
    return bad('motion_model_unavailable', 'model', 'MiniMax H3 Character Swap is not available for Motion Control. Choose another motion model, or use Object / Person Swap.');
  const rawRun = req.runOn == null ? '' : String(req.runOn).trim(); const runOn = rawRun ? normRunOn(rawRun) : null;
  if (rawRun && !runOn) return bad('invalid_run_on', 'runOn', `runOn must be "auto" or one of ${RUN_ON_IDS.join(', ')}.`, ['auto', ...RUN_ON_IDS]);
  const route = req.route && String(req.route).trim() && String(req.route).trim() !== 'auto' ? String(req.route).trim() : null;
  const mk = req.model == null ? '' : String(req.model).trim();
  const provider = req.provider ? String(req.provider).trim() : null;
  if (!mk) return { ok: true, provider, modelKey: provider ? modelKeyOf(tool.id, provider, { types: req.types }) : null, runOn, route: route ?? (runOn === 'auto' && !req.route ? 'auto' : req.route ?? null), allowRoutes: null, types: null, legacy: true };
  const models = toolModels(tool);
  let m = models.find((x) => x.key === mk); let fixed: string | null = null; let legacy = false;
  if (!m && tool.providers.includes(mk)) { fixed = mk; legacy = true; m = findToolModel(tool, modelKeyOf(tool.id, mk, { types: req.types })); }
  if (!m) return bad('unknown_model', 'model', `${tool.name} has no model "${mk}". Models: ${models.map((x) => x.key).join(', ')}.`, models.map((x) => x.key));
  if (provider && provider !== fixed) { if (!m.parts.some((p) => p.engine === provider)) return bad('model_provider_mismatch', 'provider', `provider ${provider} does not run ${m.def.name} on ${tool.name}.`, m.parts.map((p) => p.engine)); fixed = provider; }
  const parts = fixed ? m.parts.filter((p) => p.engine === fixed) : m.parts;
  const ty = typesList(req.types);
  const done = (p: ModelPart, r: string | null): ModelResolution => {
    if (p.input && !ruleFits(p.input, ty)) return bad('preset_model_mismatch', 'types', p.input === 'camera-ltx' ? `${m!.def.name} runs the LTX camera moves only (ids ltx-*).` : `${m!.def.name} doesn't run the LTX camera moves; pick LTX-2 19B for those.`);
    const types = p.input === 'camera-ltx' && !ty.length ? JSON.stringify([ltxDefaultMove()].filter(Boolean)) : null;
    return { ok: true, provider: p.engine, modelKey: m!.key, runOn, route: r, allowRoutes: legacy ? null : p.routes, types, legacy };
  };
  // A legacy engine id keeps its own routes (provider=<id> behaviour): no split narrowing, no move rewrite.
  if (legacy) {
    if (route) return { ok: true, provider: fixed, modelKey: m.key, runOn, route, allowRoutes: null, types: null, legacy };
    return { ok: true, provider: fixed, modelKey: m.key, runOn, route: runOn === 'auto' ? 'auto' : null, allowRoutes: null, types: null, legacy };
  }
  if (route) { // most specific: the engine (of this model) that owns the route
    const p = parts.find((x) => partRoutes(tool, x).some((r) => r.routeId === route));
    if (!p) return bad('route_not_in_model', 'route', `route ${route} does not run ${m.def.name} on ${tool.name}.`, modelRoutes(tool, m).map((x) => x.route.routeId));
    return done(p, route);
  }
  if (runOn && runOn !== 'auto') {
    const mode = modeOf(req); const fits = (p: ModelPart, strictMode: boolean) => partRoutes(tool, p).some((r) => !r.comingSoon && runOnOfRoute(r) === runOn && (!strictMode || modeFits(r, mode)));
    const ok = (x: ModelPart) => !x.input || ruleFits(x.input, ty);
    const p = parts.find((x) => ok(x) && fits(x, true)) ?? parts.find((x) => ok(x) && fits(x, false)) ?? parts.find((x) => fits(x, false));
    if (!p) return bad('run_on_unavailable', 'runOn', `${m.def.name} doesn't run on ${RUN_ON_LABELS[runOn]} for ${tool.name}. Run on: ${runOnsOf(tool, m).map((x) => RUN_ON_LABELS[x]).join(', ') || 'nowhere yet'}.`, runOnsOf(tool, m));
    return done(p, null);
  }
  // a route picked in Run on (perTool route, 2026-10-27): the engine of this model that owns it, so the saved pin applies on that engine
  if (runOn !== 'auto') { const pin = toolPinOf(getPrefs(), tool.id, m.key); const pr = pin?.route && pin.route !== 'auto' ? pin.route : null;
    const pp = pr ? parts.find((x) => (!x.input || ruleFits(x.input, ty)) && partRoutes(tool, x).some((r) => r.routeId === pr)) : undefined; if (pp) return done(pp, null); }
  const p = parts.find((x) => !x.input || ruleFits(x.input, ty)) ?? parts[0];
  return done(p, runOn === 'auto' ? 'auto' : null);
}

// ---------------------------------------------------------------- catalogue (shared/modelRank.ts + maker, release date, capability summary)
/** Engines (provider ids) that can build a model: its blurb engine first, then every ENGINE_MODEL / TOOL_SPLITS entry naming it. */
const enginesOfModel = (key: string): string[] => { const d = MODELS[key]; const out = new Set<string>(d ? [d.blurbKey.split(':').pop()!] : []);
  for (const [eng, v] of Object.entries(ENGINE_MODEL)) if (typeof v === 'string' ? v === key : Object.values(v).includes(key)) out.add(eng);
  for (const byEngine of Object.values(TOOL_SPLITS)) for (const [eng, ss] of Object.entries(byEngine)) if (ss.some((x) => x.model === key)) out.add(eng);
  return [...out]; };
const RES_ORDER = (r: string) => { const m = /^(\d+)(p|k)$/i.exec(r); return m ? (m[2].toLowerCase() === 'k' ? Number(m[1]) * 1000 : Number(m[1])) : 0; };
const AUDIO_KIND_LABEL: Record<AudioKind, string> = { music: 'Music', voice: 'Voice', sfx: 'Sound effects', score: 'Sound for a clip', 'voice-change': 'Voice change', translate: 'Translation' };
/** Capability summary from the data the app already has (image: shared/imageCaps.ts, video: tools/h3/videoCaps.ts VIDEO_LIMITS of the model's
 *  first engine that has one, audio: the catalogue kind). `summary` is one short line ("1080p · 3–15 s · Sound"); null when nothing is known. */
export function capsSummary(key: string): Record<string, unknown> & { summary: string | null } {
  const d = MODELS[key]; const c = CATALOGUE[key]; const engines = enginesOfModel(key);
  if (d?.medium === 'image') { const ic = engines.map((x) => IMAGE_CAPS[x]).find(Boolean); if (!ic) return { summary: null };
    const maxRes = [...ic.resolutions].sort((a, b) => RES_ORDER(b) - RES_ORDER(a))[0] ?? null; const maxRefs = ic.features?.modelMaxRefs ?? ic.supports.maxRefs; const edit = !!ic.supports.refs; const mask = !!ic.supports.draw;
    return { maxResolution: maxRes, maxRefs, edit, mask, summary: [maxRes, edit ? 'Edit' : null, maxRefs > 1 ? `Up to ${maxRefs} images` : null, mask ? 'Mask' : null].filter(Boolean).join(' · ') || null }; }
  if (d?.medium === 'video') { const vl = engines.map((x) => VIDEO_LIMITS[x]).find(Boolean); if (!vl) return { summary: null };
    const secs = vl.minSeconds === vl.maxSeconds ? `${vl.maxSeconds} s` : `${vl.minSeconds}–${vl.maxSeconds} s`; const sound = !!vl.audio?.supported;
    return { maxResolution: vl.maxResolution, minSeconds: vl.minSeconds, maxSeconds: vl.maxSeconds, sound, summary: [vl.maxResolution, secs, sound ? 'Sound' : null].filter(Boolean).join(' · ') }; }
  if (d?.medium === 'audio' && c?.kind) return { kind: c.kind, ...(c.kinds ? { kinds: c.kinds } : {}), summary: (c.kinds ?? [c.kind]).map((k) => AUDIO_KIND_LABEL[k]).join(' · ') };
  return { summary: null };
}
/** Public release date of a model: the first of its engines with a sourced date (releaseDates.ts); null when none is sourced. */
const releasedAtOf = (key: string): string | null => enginesOfModel(key).map((x) => RELEASES[x]?.date).find(Boolean) ?? null;
/** The catalogue block a listing carries per model (GET /api/tools models[], GET /api/models/registry). Plugin models with no entry get null fields. */
export function catalogueFields(key: string) {
  const c = CATALOGUE[key]; const mk = makerOf(key);
  return { displayName: c?.displayName ?? MODELS[key]?.name ?? null, bestFor: c?.bestFor ?? THREE_D_BEST_FOR[key] ?? null, rank: c?.rank ?? null, home: c?.home ?? null, featured: !!c?.featured, popular: !!c?.popular,
    aliases: c?.aliases ?? [], releasedAt: releasedAtOf(key), maker: mk?.key ?? null, makerName: mk?.name ?? null, caps: capsSummary(key), variantOf: c?.variantOf ?? null, variants: variantsOf(key) };
}

/** The catalogue name of a model key ("Seedance 2.0"), else its MODELS name, else null. */
export const catalogueName = (key: string | null | undefined): string | null => (key ? CATALOGUE[key]?.displayName ?? MODELS[key]?.name ?? null : null);
const nameNorm = (s: string) => s.toLowerCase().replace(/\s*·.*$/, '').replace(/\s+(api|comfy cloud workflow|comfy cloud|workflow|partner node)$/, '').replace(/[^a-z0-9]+/g, ' ').trim();
/**
 * MODEL-PICKER-REVIEW task 3 (one name everywhere): a served model name in the catalogue's words. When `served` names the model this job's
 * engine builds ("Seedance", "Veo", "Kling", "Seedance 2.0 API"), the catalogue name with version comes back ("Seedance 2.0"); any other
 * name (a LoRA stack, a hosted fallback that is another model, an LTX camera move) is kept as it is.
 */
export function catalogueNameOf(toolId: string, engine: string, served: string, input?: Record<string, any> | null): string {
  if (!served) return served; let key: string; try { key = modelKeyOf(toolId, engine, input); } catch { return served; }
  const c = CATALOGUE[key]; if (!c) return served; const n = nameNorm(served);
  return n === nameNorm(MODELS[key]?.name ?? '') || n === nameNorm(c.displayName) ? c.displayName : served;
}

// ---------------------------------------------------------------- listings
export type RunOnStatus = 'ready' | 'sample' | 'needs-key' | 'off' | 'not-installed' | 'coming-soon' | 'unavailable';
/** The run menu's mini line for the Local row (hardware plan §3.5): the memory the model needs and its time on this computer (learned, else reported). */
const hereOf = (f: any) => (f ? { memGB: typeof f.recommendedVramGB === 'number' ? f.recommendedVramGB : null, etaSeconds: typeof f.etaSeconds === 'number' && f.etaSeconds > 0 ? f.etaSeconds : null,
  etaSource: f.etaRange?.source ?? f.eta?.source ?? null, samples: Number(f.etaRange?.samples ?? f.eta?.samples ?? 0) || 0, untested: !!f.variant && f.variant.verified === false } : null);
/** 2026-10-25: a local route whose model files a Mac can't load (hardware/macWeights.ts, fit unsupported_weights): never runs here, so no Download. */
const macBlockedOpt = (o: any) => o.kind === 'local' && o.fit?.reasonCode === 'unsupported_weights';
const statusOf = (o: any): RunOnStatus => o.comingSoon || o.reasonCode === 'not_wired' || /coming soon/i.test(String(o.reason ?? '')) ? 'coming-soon'
  : macBlockedOpt(o) ? 'unavailable' : o.demo ? 'sample' : o.reasonCode === 'input_blocked' ? (o.configured === false ? 'needs-key' : 'ready') /* the listing's default job doesn't fit this endpoint; other jobs do */ : o.kind === 'local' && (o.reasonCode === 'local_off') ? 'off' : o.available || o.runnable ? 'ready' : o.reasonCode === 'key_missing' ? 'needs-key'
  : o.kind === 'local' && (o.reasonCode === 'too_heavy' || o.reasonCode === 'weights_missing' || o.reason) ? 'not-installed' : 'unavailable';
const RANK: Record<RunOnStatus, number> = { ready: 0, sample: 1, off: 2, 'needs-key': 3, 'not-installed': 4, unavailable: 5, 'coming-soon': 6 };
/** License block for a model on a tool: the table's licence, else the engine's own workflow licence. */
function licenseOf(tool: ToolDef, m: ToolModel) { const id = m.def.license; const l = id ? LICENSES[id] : null; if (l) return { id: l.id, name: l.name, url: l.url ?? null, osi: !!l.osi };
  const P = getProvider(m.primary); if (!P) return null; const pl: any = providerLicense(tool, P); return pl ? { id: pl.id, name: pl.name, url: pl.url ?? null, osi: !!pl.osi } : null; }
/** The one action a place that isn't ready needs (the Run-on menu row's link / button). Same words as routing/select.ts placeAction. */
const KEY_SHORT_L: Record<string, string> = { 'comfy-cloud': 'Comfy Cloud', fal: 'fal', replicate: 'Replicate', bfl: 'BFL', minimax: 'MiniMax', ltx: 'LTX', openai: 'OpenAI', google: 'Google', byteplus: 'BytePlus', dashscope: 'Alibaba Cloud', luma: 'Luma' };
const gbT = (b?: number | null) => (b && b > 0 ? `${Math.max(0.1, Math.round(b / 1e8) / 10)} GB` : '');
function rowAction(ro: RunOn, b: any): { kind: string; text: string; missingBytes?: number | null; downloadId?: string | null } | null {
  if (b.status === 'ready' || b.status === 'coming-soon' || b.status === 'unavailable') return null;
  if (ro === 'local') {
    if (b.status === 'off') return { kind: 'turn_on', text: 'Turn on' };
    if (b.reasonCode === 'weights_missing') return { kind: 'download', text: `Download ${gbT(b.missingBytes) || 'files'}`.trim(), missingBytes: b.missingBytes ?? null, downloadId: b.downloadId ?? null };
    if (b.reasonCode === 'nodes_missing') return { kind: 'install_node', text: 'Install node' };
    if (b.reasonCode === 'too_heavy' || b.reasonCode === 'not_enough_disk') return null;
    return { kind: 'set_up_gpu', text: 'Set up GPU' };
  }
  if ((b.status === 'needs-key' || b.status === 'sample') && b.comfyVariant === 'deployment') return { kind: 'add_key', text: 'Set up your deployment', connection: 'deploy' } as any; // your own Comfy deployment is missing, not the key
  return b.status === 'needs-key' || b.status === 'sample' ? { kind: 'add_key', text: `Add ${aKey(KEY_SHORT_L[ro] ?? RUN_ON_LABELS[ro])}` } : null;
}
/** Place order (user decision 2026-10-22): Comfy → other API (fal, Replicate, BFL…) → Local. Same as routing/select.ts placeRank. */
const PLACE_RANK = (ro: string) => (ro === 'comfy-cloud' ? 0 : ro === 'local' ? 2 : 1);
const placeOrd = (xs: any[]) => [...xs].sort((a, b) => PLACE_RANK(a.id) - PLACE_RANK(b.id) || ((a._best.tier ?? 2) - (b._best.tier ?? 2)) || ((a._best.listCredits ?? 1e9) - (b._best.listCredits ?? 1e9)) || (a._best.latency - b._best.latency));
/**
 * The pre-selected place (Run on, 2026-10-22: replaces Auto), from the listing's per-place status, with the rule routing/select.ts autoOrder
 * applies to a job: the first READY place, Comfy → other API (cheapest) → Local; else the mock backend's free sample (wired first); else
 * NOTHING (null): a place that needs a download, a key or a switch is never pre-selected (models[].setup lists them for the user to pick).
 * The quote of the default job names the same place (test/runon-preselect.e2e.ts).
 */
function preselectOf(runsOn: any[]): { runOn: string; label: string; status: string; action: any } | null {
  const out = (r: any) => (r ? { runOn: r.id, label: r.label, status: r.status, action: r.action ?? null } : null);
  const ready = placeOrd(runsOn.filter((r) => r.status === 'ready')); if (ready[0]) return out(ready[0]);
  const sample = placeOrd(runsOn.filter((r) => r.status === 'sample')).sort((a, b) => Number(b._best.wired) - Number(a._best.wired)); return out(sample[0]);
}
/** The places a model could be set up on, in the pre-selection order, each with its one action (the setup card's rows; none is pre-chosen).
 *  credits = the price per run once set up (Local: 0). Places not connected on this server, unpriced or too heavy are left out. */
function setupOf(runsOn: any[]): { runOn: string; label: string; action: any; credits: number | null }[] {
  return placeOrd(runsOn.filter((r) => r.action && (r.id === 'local' ? ['turn_on', 'download', 'install_node'].includes(r.action.kind) : r.action.kind === 'add_key' && r.status === 'needs-key' && r._best.wired && r._best.listCredits != null)))
    .map((r) => ({ runOn: r.id, label: r.label, action: r.action, credits: r.id === 'local' ? 0 : r.credits ?? null }));
}
/** One status per model row (MODEL-PICKER-REVIEW §5b.4), from one source: the model's state at the pre-selected place, else what setting it up takes. */
export type RowStatus = { kind: 'ready' | 'sample' | 'add_key' | 'download' | 'turn_on' | 'install_node' | 'set_up' | 'coming_soon' | 'unavailable'; text: string; runOn: string | null; credits: number | null; missingBytes?: number | null };
export function rowStatusOf(m: { preselect?: any; runsOn: any[]; setup?: any[] }): RowStatus {
  const p = m.preselect; const row = p ? m.runsOn.find((r) => r.id === p.runOn) : null;
  if (p && p.status === 'ready') return { kind: 'ready', text: p.label, runOn: p.runOn, credits: p.runOn === 'local' ? 0 : row?.credits ?? null };
  if (p && p.status === 'sample') return { kind: 'sample', text: 'Sample · free', runOn: p.runOn, credits: 0 };
  if (m.runsOn.length && m.runsOn.every((r) => r.status === 'coming-soon')) return { kind: 'coming_soon', text: 'Coming soon', runOn: null, credits: null };
  const s = m.setup ?? []; if (!s.length) return { kind: 'unavailable', text: m.runsOn.some((r) => r.id === 'local' && r.reasonCode === 'unsupported_weights') ? MAC_WEIGHTS_REASON : 'Not available here', runOn: null, credits: null };
  if (s.length > 1) return { kind: 'set_up', text: 'Set up', runOn: null, credits: null };
  const a = s[0].action; const k = a.kind as RowStatus['kind'];
  return { kind: k, runOn: s[0].runOn, credits: null, text: k === 'add_key' ? `Add key · ${KEY_SHORT_L[s[0].runOn] ?? s[0].label}` : k === 'download' ? `Download · ${gbT(a.missingBytes) || 'files'}` : k === 'turn_on' ? 'Turn on · Your computer' : 'Install add-on · Your computer', ...(k === 'download' ? { missingBytes: a.missingBytes ?? null } : {}) };
}
/** Picker sections (MODEL-PICKER-REVIEW §4.1 / task 5), in display order. */
export type ModelSection = 'featured' | 'api' | 'gpu' | 'soon';
export const SECTION_ORDER: ModelSection[] = ['featured', 'api', 'gpu', 'soon'];
export const FEATURED_MAX = 5;
/** NEW badge window: a model released at most this many days ago (catalogue releasedAt). */
export const NEW_DAYS = 60;
export const isNewModel = (releasedAt: string | null | undefined, now = Date.now()): boolean => { const t = releasedAt ? Date.parse(releasedAt) : NaN; return Number.isFinite(t) && t <= now && now - t <= NEW_DAYS * 86_400_000; };
/**
 * One section per model row, decided here so every picker and the header menus agree (status never reorders rows):
 *  - soon: nothing can run it on this server (every place coming soon), shown collapsed at the end;
 *  - featured: the catalogue's featured API models (at most FEATURED_MAX per list, by rank), never retiring;
 *  - api: hosted models (catalogue home 'api'; models without an entry: any place other than Local);
 *  - gpu: models whose best place is your own computer.
 * Rows come back sorted: section, then rank, then name. Each row also gets isNew (releasedAt within NEW_DAYS).
 */
/** A tool whose menu has its own order (Video Upscale: local first, then cloud cheapest-good, then best quality: shared/videoUpscale.ts VUP_ORDER). */
const toolOrderOf = (tool: ToolDef): { sections: ModelSection[]; engines: string[] } | undefined => (VUP_TOOLS.has(baseToolOf(tool) ?? tool.id) || VUP_TOOLS.has(tool.id) ? { sections: ['gpu', 'featured', 'api', 'soon'], engines: VUP_ORDER } : undefined);
/** The section order a tool's menu uses (most tools: SECTION_ORDER). */
export const sectionOrderFor = (tool: ToolDef): ModelSection[] => toolOrderOf(tool)?.sections ?? SECTION_ORDER;
export function withSections<T extends { key: string; name: string; rank?: number | null; home?: string | null; featured?: boolean; lifecycle?: string | null; releasedAt?: string | null; runsOn: { id: string; status: string }[]; rowStatus?: { kind: string } }>(rows: T[], order?: { sections: ModelSection[]; engines: string[] }): (T & { section: ModelSection; isNew: boolean })[] {
  const soon = (m: T) => m.rowStatus?.kind === 'coming_soon' || (m.runsOn.length > 0 && m.runsOn.every((r) => r.status === 'coming-soon'));
  const home = (m: T) => (m.home === 'gpu' || m.home === 'api' ? m.home : m.runsOn.some((r) => r.id !== 'local') ? 'api' : 'gpu');
  const byRankName = (a: T, b: T) => (a.rank ?? 999) - (b.rank ?? 999) || a.name.localeCompare(b.name);
  const feat = new Set(rows.filter((m) => m.featured && home(m) === 'api' && !soon(m) && m.lifecycle !== 'retiring').sort(byRankName).slice(0, FEATURED_MAX).map((m) => m.key));
  const out = rows.map((m) => ({ ...m, section: (soon(m) ? 'soon' : feat.has(m.key) ? 'featured' : home(m)) as ModelSection, isNew: isNewModel(m.releasedAt) }));
  const so = order?.sections ?? SECTION_ORDER; const eo = (m: any) => { const i = order ? order.engines.indexOf(m.primaryEngine ?? '') : -1; return i < 0 ? 999 : i; };
  return out.sort((a, b) => so.indexOf(a.section) - so.indexOf(b.section) || (order ? eo(a) - eo(b) : 0) || byRankName(a, b));
}
/**
 * models[] for one tool, built from the provider views GET /api/tools already computed (providers[].routes with price, status, demo, reason),
 * so nothing is priced twice and the numbers equal the providers[] numbers. One row per model; runsOn = one row per account.
 */
export function modelsBlock(tool: ToolDef, providers: any[]): any[] {
  const listed = new Set(toolProviders(tool).map((p) => p.id)); const byId = new Map(providers.map((p) => [p.id, p]));
  const openOnly = openWeightsOnly();
  const rows = toolModels(tool).filter((m) => m.parts.some((p) => listed.has(p.engine))).map((m) => {
    const rows: any[] = []; const seen = new Set<string>();
    for (const part of m.parts) { if (!listed.has(part.engine)) continue; const pv = byId.get(part.engine); const views: any[] = Array.isArray(pv?.routes) ? pv.routes : [];
      for (const r of partRoutes(tool, part)) { if (seen.has(r.routeId)) continue; seen.add(r.routeId);
        if (openOnly && r.kind !== 'local' && tierOf(r) !== 0) continue; // Open models only: no partner-node or closed-API places to run
        // the same route can sit under several engines (a Comfy Cloud twin): take the view judged on a job this model runs (not input-blocked)
        const all = m.parts.flatMap((pp) => (Array.isArray(byId.get(pp.engine)?.routes) ? byId.get(pp.engine).routes : []).filter((v: any) => v.routeId === r.routeId));
        const o0 = all.find((v: any) => v.reasonCode !== 'input_blocked') ?? views.find((v) => v.routeId === r.routeId) ?? all[0] ?? { routeId: r.routeId, kind: r.kind, comingSoon: !!r.comingSoon }; const o = { ...o0 };
        let st = statusOf({ ...o, comingSoon: !!r.comingSoon }); const soon = st === 'coming-soon';
        // a local route only counts as ready when its weight files are here (the quote and submit refuse it otherwise)
        const wg = st === 'ready' && r.kind === 'local' && !o.demo ? weightsGate(tool, part.engine) : null;
        if (wg) { st = 'not-installed'; o.reasonCode = wg.code; o.reason = wg.message; }
        if (r.kind === 'local' && o.reason === LOCAL_UNREACHABLE_REASON && !o.reasonCode) o.reasonCode = 'local_unreachable';
        if (macBlockedOpt(o)) { o.reasonCode = 'unsupported_weights'; o.reason = MAC_WEIGHTS_REASON; }
        { const hw = r.kind === 'local' ? LOCAL_HW_BLOCK[part.engine]?.() : null; if (hw) { st = 'unavailable'; o.reasonCode = 'unsupported_hardware'; o.reason = hw; } } // Video Upscale: SeedVR2 3B locally on NVIDIA only
        rows.push({ engine: part.engine, routeId: r.routeId, runOn: runOnOfRoute(r), kind: r.kind, comfyVariant: comfyVariantOf(r) ?? null, status: st, credits: soon ? null : o.credits ?? null, listCredits: soon ? null : o.demo ? o.listCredits ?? null : o.credits ?? null, reason: o.reason ?? null, reasonCode: o.reasonCode ?? null,
          wired: o.wired !== false, tier: typeof o.tier === 'number' ? o.tier : null, latency: Number(o.typicalLatencySec) || 0, missingBytes: wg?.missingBytes ?? null, downloadId: wg?.downloadId ?? null, here: r.kind === 'local' ? hereOf(o.fit) : null }); } }
    const runsOn = RUN_ON_IDS.filter((ro) => rows.some((x) => x.runOn === ro)).map((ro) => { const rs = rows.filter((x) => x.runOn === ro).sort((a, b) => RANK[a.status as RunOnStatus] - RANK[b.status as RunOnStatus] || (a.listCredits ?? 1e9) - (b.listCredits ?? 1e9));
      const best = rs[0]; const priced = rs.map((x) => x.listCredits).filter((c): c is number => typeof c === 'number');
      return { id: ro, label: RUN_ON_LABELS[ro], billedTo: RUN_ON_BILLED_TO[ro], status: best.status, credits: ro === 'local' ? (best.status === 'ready' ? 0 : null) /* free only once it runs here: an uninstalled / off GPU is never "Free" */ : priced.length ? Math.min(...priced) : null, reason: best.status === 'ready' || best.status === 'sample' ? null : best.reason, reasonCode: best.reasonCode,
        routes: rs.map((x) => x.routeId), engines: [...new Set(rs.map((x) => x.engine))], ...(rs.some((x) => x.comfyVariant) ? { comfyVariants: [...new Set(rs.map((x) => x.comfyVariant).filter(Boolean))] } : {}),
        group: ro === 'local' ? 'gpu' as const : ro === 'comfy-cloud' ? 'comfy' as const : 'api' as const, detail: ro === 'comfy-cloud' ? (rs.every((x) => x.comfyVariant === 'deployment') ? COMFY_DEPLOY_DETAIL : rs.some((x) => x.kind === 'comfy-router') && !rs.some((x) => x.kind === 'comfy-cloud') ? ['Comfy Router', methodOf(rs.map((x) => x.routeId))].filter(Boolean).join(' · ') /* how this place does it, when it differs from the model's own way (H3 Extend · via last frame, H3 camera · prompt-directed) */ : rs.some((x) => x.kind === 'comfy-cloud') && !rs.some((x) => x.kind === 'comfy-router') ? 'Comfy Cloud' : 'Comfy Cloud or Comfy Router') : null,
        wired: rs.some((x) => x.wired), action: rowAction(ro, best), ...(ro === 'local' && best.here ? { here: best.here } : {}), ...((c) => (c ? { choices: c } : {}))(choicesOf(ro, rs, makerOf(m.key)?.name ?? null)), _best: best }; });
    // Other providers the Comfy place (or your computer) covers are hidden unless Settings → Routing → Show other providers is on (routing/hiddenPlaces.ts)
    const vis = visiblePlaces(tool.id, m.key, runsOn, undefined, preselectOf(runsOn)?.runOn ?? null); const hiddenRows: any[] = [];
    if (vis.hidden.length) { const keepIds = new Set(vis.shown.map((r) => r.id)); for (let k = runsOn.length - 1; k >= 0; k--) if (!keepIds.has(runsOn[k].id)) hiddenRows.unshift(...runsOn.splice(k, 1)); }
    for (const r of hiddenRows) delete (r as any)._best;
    const preselect = preselectOf(runsOn); const setup = setupOf(runsOn); for (const r of runsOn) delete (r as any)._best;
    // "from" price: only places that run now (ready, or the mock sample); none when nothing is set up (never another place's 0 or list price)
    const prices = runsOn.filter((r) => r.status === 'ready' || r.status === 'sample').map((r) => r.credits).filter((c): c is number => typeof c === 'number');
    const state = runsOn.some((r) => r.status === 'ready') ? 'ready' : runsOn.some((r) => r.status === 'sample') ? 'sample' : runsOn.some((r) => r.status === 'needs-key') ? 'needs-key' : runsOn.some((r) => r.status === 'off' || r.status === 'not-installed') ? 'not-installed' : runsOn.every((r) => r.status === 'coming-soon') ? 'coming-soon' : 'unavailable';
    const primary = byId.get(m.primary); const lc = lifecycleFields(m.def.lifecycleKey ?? m.primary) as any;
    const cat = MODEL_CATALOG[m.def.blurbKey] ?? catalogFor(tool.id, m.primary) ?? catalogFor(baseToolOf(tool) ?? '', m.primary);
    return { ...catalogueFields(m.key), key: m.key, name: m.def.name, maker: makerOf(m.key)?.key ?? null, makerName: makerOf(m.key)?.name ?? null, family: m.def.family, medium: m.def.medium, openWeights: m.def.openWeights, license: licenseOf(tool, m), blurb: cat?.description ?? primary?.description ?? primary?.hint ?? null, blurbKey: m.def.blurbKey,
      ...(m.def.note ? { note: m.def.note } : {}), ...(m.def.derived ? { derived: true } : {}), engines: m.parts.filter((p) => listed.has(p.engine)).map((p) => p.engine), primaryEngine: m.primary,
      ...(vis.hidden.length ? { hiddenRunsOn: vis.hidden } : {}), isDefault: !!primary?.isDefault || !!primary?.default, state, fromPrice: prices.length ? Math.min(...prices) : null, fromPriceUnit: 'credits', runsOn,
      preselect, autoRunOn: preselect?.runOn ?? null, // autoRunOn: kept for older clients (= the pre-selected place)
      setup, rowStatus: rowStatusOf({ preselect, runsOn, setup }),
      lifecycle: lc.lifecycle ?? null, lifecycleNote: lc.lifecycleNote ?? null, ...(hiddenRows.length ? { _hiddenRows: hiddenRows } : {}) };
  }).filter((m) => !openOnly || m.runsOn.length > 0);
  return withSections(rows, toolOrderOf(tool));
}
/** GET /api/models/registry: the model table, every tool's models with their routes, and the engine alias table. Static (no prices or key status). */
export function registryView() {
  const tools = listTools().map((tool) => ({ toolId: tool.id, name: tool.name, ...(baseToolOf(tool) ? { baseToolId: baseToolOf(tool) } : {}),
    models: toolModels(tool).map((m) => ({ key: m.key, name: m.def.name, primaryEngine: m.primary, engines: m.parts.map((p) => ({ engine: p.engine, routes: partRoutes(tool, p).map((r) => r.routeId), ...(p.input ? { input: p.input } : {}) })),
      runsOn: runOnsOf(tool, m).map((ro) => ({ id: ro, label: RUN_ON_LABELS[ro], routes: modelRoutes(tool, m).filter((x) => runOnOfRoute(x.route) === ro).map((x) => ({ routeId: x.route.routeId, engine: x.engine, priceRef: x.route.priceRef, kind: x.route.kind, ...(comfyVariantOf(x.route) ? { comfyVariant: comfyVariantOf(x.route) } : {}), ...(x.route.comingSoon ? { comingSoon: true } : {}) })) })) })) }));
  const aliases: Record<string, Record<string, { model: string; runOn: RunOn | 'auto' }>> = {};
  for (const tool of listTools()) for (const e of tool.providers) (aliases[e] ??= {})[tool.id] = engineAlias(tool, e);
  const used = new Set(tools.flatMap((t) => t.models.map((x) => x.key)));
  return { makers: Object.entries(MAKERS).map(([key, v]) => ({ key, name: v.name })), models: Object.values(MODELS).filter((d) => used.has(d.key)).map((d) => ({ ...d, makerName: makerOf(d.key)?.name ?? null, ...lifecycleFields(d.lifecycleKey ?? null), catalogue: catalogueFields(d.key) })), derivedModels: [...used].filter((k) => !MODELS[k]),
    runOn: RUN_ON_IDS.map((id) => ({ id, label: RUN_ON_LABELS[id], billedTo: RUN_ON_BILLED_TO[id] })), tools, aliases };
}
/** ?model= deep links and pickers: a model key or an old engine id → { model, engine, runOn } for this tool (null = unknown). */
export function resolveModelId(toolId: string, id: string, input?: Record<string, any> | null) {
  const tool = getTool(toolId); if (!tool || !id) return null;
  const m = findToolModel(tool, id); if (m) return { toolId: tool.id, model: m.key, name: m.def.name, engine: m.primary, runOn: 'auto' as const, legacy: false };
  if (!tool.providers.includes(id)) return null; const a = engineAlias(tool, id, input);
  return { toolId: tool.id, model: a.model, name: findToolModel(tool, a.model)?.def.name ?? a.model, engine: id, runOn: a.runOn, legacy: true };
}
const nativeRunOn = (engine: string): RunOn | null => { const r = engine ? routesFor(engine)[0] : undefined; return r ? runOnOfRoute(r) : null; };
/** modelKey + runOn for a job: stored fields first (new jobs), else derived from tool + provider (+ input for camera) and the route that ran. */
export function jobModelFields(j: { toolId: string; provider: string; route?: string | null; input?: Record<string, any>; modelKey?: string; runOn?: string | null }) {
  const modelKey = j.modelKey ?? (j.provider ? modelKeyOf(j.toolId, j.provider, j.input ?? null) : null);
  const r = j.route ? findRoute(j.route) : undefined;
  const runOn = r ? runOnOfRoute(r) /* the route that ran (a fallback may have moved it) */ : (j.runOn as RunOn | undefined) ?? (j.route ? runOnOfRouteId(j.route) : nativeRunOn(j.provider)); // no route (pre-routing / free lane): the engine's native route
  return { modelKey, runOn: runOn ?? null, runOnLabel: runOn ? RUN_ON_LABELS[runOn as RunOn] ?? runOn : null };
}
