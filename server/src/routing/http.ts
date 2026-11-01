/**
 * Routing HTTP surface (registered from index.ts):
 *   GET  /api/settings/providers        provider key status (never values); POST {id, key} / DELETE /:id only when bound to loopback
 *   GET/PUT /api/setup                  first-run setup sheet state {done, choices}
 *   GET  /api/me/routing  PUT /api/me/routing   {global:{mode, allowFallback}, perModel:{[modelId]:{route, allowFallback}}}
 *   GET  /api/routes?toolId=&modelId=  route options with price/speed/key status
 *   POST /api/jobs/:id/fallback {route} | {decline:true}
 * and enriches /api/models (each model card: routes[], defaultRoute, routing) and /api/tools (each provider: routes[], defaultRoute).
 */
import { videoFitFor, videoFitQuote, fitModeOf } from '../shared/videoFit.js';
import { VUP_TOOLS, vupSizing, vupBlock, VUP_MODELS, VUP_TARGET_LABEL } from '../shared/videoUpscale.js';
/** How an upscale estimate reads: "to 1080p" for the size models (Real-ESRGAN, SeedVR2, Topaz), "at 2×" for the factor ones. */
const vupHow = (model: string | undefined, input: Record<string, any>, sc: number) => (model && VUP_MODELS[model] && VUP_MODELS[model].fit !== 'scale' ? `to ${input.targetLongEdge ? `${input.targetLongEdge} px` : VUP_TARGET_LABEL[input.maxOutput] ?? input.maxOutput}` : `at ${sc}×`);
import path from 'node:path';
import { SAMPLES_DIR } from '../config.js';
import { modelNameForRun, cardName } from '../models.js';
import type { FastifyInstance } from 'fastify';
import { getTool, listTools } from '../tools/registry.js';
import { jobs } from '../jobs.js';
import { getBalance, canAfford } from '../ledger.js';
import { routesFor, findRoute, isTwinAlias, toolKeys } from './routes.js';
import { requestMode, toolDefaults, setStatusInput, toolModes, lyricsFreeDefault, draftOn, draftCapableDefault } from './defaults.js';
import { localRunnerName } from './routes.js';
import { hwBlock, withAlternative } from './fitView.js';
import { tooHeavyWarning, weightsGate } from '../hardware/requirements.js';
import { LOCAL_UNREACHABLE_REASON, NOT_WIRED_REASON, SLOW_LOCAL_NOTE, LOCAL_OFF_REASON, LOCAL_OFF_DETAIL, LOCAL_PINNED_REASON, LOCAL_ONLY_REASON, LOCAL_AUTO_REASON, demoReason, reasonSentence, notWiredSentence } from './runnable.js';
import { HOSTED_BY_ID, unitInfo, type HostedPrice } from '../shared/hostedPrices.js';
import { routeExactUsd } from './select.js';
import { adjustNotesById, option, autoOrder, plan, resolveRoute, routeInput, noProvider, placeAction, localAvailable, demoNotice, demoKeyless, DEMO_MESSAGE, localState, localOnlyModel, keyOwner as keyOwnerOf, savedPinOf, setupKind } from './select.js';
import { mockKeys } from './keys.js';
import { getPrefs, savePrefs, livePerModel, envUseLocal, setFavourite } from './prefs.js';
import { CLOUD_DEFAULTS } from '../shared/cloudDefaults.js';
import { providerSettings, storeKey, removeKey, isLoopback, ACCOUNT_ONLY } from './settings.js';
import { continueCheck, continueOn, decline, plainRoute } from './run.js';
import type { RoutingPrefs, RouteOption, ToolPin } from './types.js';
import { preferRunnablePart } from './partPick.js';
import { registerRouteOff } from './routeOff.js';
import { registerQuotesBatch } from './quotesBatch.js';
import { capsFor } from '../shared/imageCaps.js';
import { catalogueName, resolveModelRequest, modelKeyOf, routeModelKey, routeModelFields, modelsBlock, rowStatusOf, registryView, resolveModelId, findToolModel, modelRoutes, toolModels, setLtxDefaultMove, type ModelResolution } from './modelRegistry.js';
import { RUN_ON_LABELS, normRunOn, runOnOfRoute, makerOf, type RunOn } from '../shared/modelIds.js';
import { toolProviders, getProvider, providerOpenWeights, comfyCloudOpen } from '../providers.js';
import { catalogFor, cleanName } from '../shared/modelCatalog.js';
import { lifecycleFields, RETIRED_MODELS } from '../shared/lifecycle.js';
import { upscaleTargetLong } from '../tools/apps.js';
import { upscaleOutputSize } from '../shared/pricing.js';
import { durationsFor, defaultDurationFor } from '../tools/h3/videoCaps.js';
import { durToolOf, cameraDefaultMove } from '../tools/apps.js';
import { videoQuoteFields } from './videoQuote.js';
import { audioQuoteFields, AUDIO_TOOLS } from './audioQuote.js';
import { enumParamError } from '../shared/enumParams.js';
import { recipeUploadsOf } from '../shared/workflows.js';
import type { ToolDef } from '../tools/types.js';
import { ledgerUsd } from '../shared/priceText.js';
/** Quote flags follow the route that would actually run: an open-weights model quoted on a cloud route (useLocal off → cloud first) is not "free · runs locally". */
const routeFlags = (kind: string | null | undefined, credits: number | null, label?: string) => (!kind || kind === 'local' ? { local: true } : { local: false, free: false, basis: 'hosted',
  breakdown: [{ label: `${label ?? kind} · ${credits != null ? usd(credits) : '?'}`, factor: 1 }] });
/** Item 4: a demo preview on a cloud route (e.g. fal) is never "No credits · runs locally": the line is the demo copy plus the real list price
 *  (1 credit = $0.01). priceLine is the one display string for the quote / route; localRun says whether it runs on your ComfyUI. */
const usd = (cr: number) => ledgerUsd(cr); // shared/priceText.ts: one $ formatter (prices in dollars, 2026-10-26)
/** A routed job's route story, added to GET /api/jobs/:id (hook below) and to each job of GET /api/jobs?ids= (routesEdge.ts). {} when it has no routing. */
export const jobRouteFields = (j: { routing?: any; route?: string | null; routeAttempts?: unknown[]; alternatives?: unknown[]; status: string; error?: unknown; refund?: unknown; decision?: unknown; busyNote?: unknown } | undefined) => !j?.routing ? {} : {
  route: j.route ?? null, routing: { mode: j.routing.mode, allowFallback: j.routing.allowFallback, order: j.routing.order }, routeAttempts: j.routeAttempts ?? [], alternatives: j.alternatives ?? [],
  ...(j.status === 'needs_decision' ? { status: j.status, error: j.error, refund: j.refund, decision: j.decision ?? null } : {}), ...(j.busyNote ? { busyNote: j.busyNote } : {}) };
export const demoPriceLine = (list: number | null | undefined) => `${DEMO_MESSAGE}${list != null ? ` List price ≈ ${usd(list)}.` : ''}`;
export const priceLine = (kind: string | null | undefined, credits: number | null, demo: boolean, list?: number | null) =>
  demo ? demoPriceLine(list) : !kind || kind === 'local' ? 'Free · on your computer' : credits == null ? 'Price unavailable' : `≈ ${usd(credits)}`;
/** Oct 18 #7: every quote carries its billing unit at top level (unit / unitLabel / unitHelp; null on local routes) and `hosted` for the route that
 *  would run (demo and needsKey quotes had hosted:null). The payload's own row is kept when it is that route's (it may carry audio / video-input variants). */
const unitFields = (priceRef: string | null | undefined, hosted: any) => { const h = (!priceRef ? null : hosted && hosted.unit && hosted.providerId === priceRef ? hosted : HOSTED_BY_ID[priceRef] ?? (hosted && hosted.unit ? hosted : null)) as HostedPrice | null; const u = h ? unitInfo(h.unit) : null;
  return { unit: h?.unit ?? null, unitLabel: u?.unitLabel ?? null, unitHelp: u?.unitHelp ?? null, hosted: h ? { ...h, unitLabel: u!.unitLabel, unitHelp: u!.unitHelp } : null }; };
/** Oct 19 b2 (DP #1/#2): a runnable quote on a local route while Use local ComfyUI is off says why it runs (same codes as the route lists). */
const localNote = (_tool: ToolDef, model: string, pl: { first: { kind: string }; routing: { mode: string; demo?: unknown } }) =>
  pl.first.kind !== 'local' || pl.routing.demo || getPrefs().global.useLocal ? {} : localOnlyModel(model) ? { reasonCode: 'local_only', reason: LOCAL_ONLY_REASON, localNote: LOCAL_ONLY_REASON }
    : pl.routing.mode === 'pinned' ? { reasonCode: 'local_pinned', reason: LOCAL_PINNED_REASON, localNote: LOCAL_PINNED_REASON } : { reasonCode: 'local_auto', reason: LOCAL_AUTO_REASON, localNote: LOCAL_AUTO_REASON };
const noCharged = (t: unknown) => (typeof t === 'string' ? t.replace(/\s*Nothing was charged\.?/g, '').trim() : t) as string;
const demoFlags = (kind: string | null | undefined, list: number | null | undefined) => ({ local: false, localRun: false, free: false, basis: 'hosted',
  breakdown: [{ label: demoPriceLine(list), factor: 1 }], priceLine: demoPriceLine(list), routeKind: kind ?? null });

/** Extend quote fields from query params (extendMethod, guideFrames, extendSeconds), typed as the h3-extend parser keeps them on the job, so the
 *  Comfy Cloud route's priceInput (ltx25CloudRenderSeconds) reads the same fields on quote and charge. Shared by routeQuoteInput and the price hook. */
export function extendQuoteFields(q: Record<string, unknown>): Record<string, any> {
  const num = (v: unknown) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined); const o: Record<string, any> = {};
  if (q.extendMethod != null && q.extendMethod !== '') o.extendMethod = String(q.extendMethod);
  if (num(q.guideFrames)) o.guideFrames = num(q.guideFrames); if (num(q.extendSeconds)) o.extendSeconds = num(q.extendSeconds); return o;
}

/** Video Swap quote fields, typed as tools/videoSwap.ts parseInput keeps them on the job (swapType, target, point {x, y, t}), so a route's own check
 *  (the cloud edits' swapIssue, H3 Character Swap's side-or-click rule) refuses the quote exactly as it refuses the submit (2026-10-31: Object mode
 *  quoted Kling as runnable, then the submit refused it). Only fields the query carries; an absent field stays absent. */
export function swapQuoteFields(q: Record<string, string | undefined>): Record<string, any> {
  const o: Record<string, any> = {}; if (q.swapType === 'person' || q.swapType === 'object') o.swapType = q.swapType;
  if (q.target != null) o.target = String(q.target).trim();
  const m = /^([\d.]+),([\d.]+)(?:,([\d.]+))?$/.exec(String(q.point ?? '')); if (m) o.point = { x: Number(m[1]), y: Number(m[2]), t: Number(m[3] ?? 0) };
  return o;
}
/** Job-shaped input for a route quote from query params (GET /api/routes, same names as /api/tools/:id/price): seconds|duration, resolution|quality,
 *  n, imageResolution, tier, mode|types, audio; Upscale: width, height (source px), scale, maxOutput | targetLongEdge | target → outputSize (same cap as the job), so quote = charge. */
export function routeQuoteInput(tool: { id: string; app?: any; providers?: string[] }, q: Record<string, string | undefined>, modelId?: string): Record<string, any> {
  const i: Record<string, any> = {}; const num = (v?: string) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);
  const secs = num(q.seconds ?? q.duration); if (secs) i.duration = secs;
  if (q.resolution || q.quality) i.resolution = q.resolution || q.quality;
  if (tool.id === 'reshoot' && num(q.angleCount)) i.angleCount = num(q.angleCount); // dp30 (d)
  if (num(q.n)) i.n = num(q.n); if (q.imageResolution) i.imageResolution = q.imageResolution; if (q.tier) i.tier = q.tier;
  if (q.mode || q.types) i.types = q.mode ? [q.mode] : (() => { try { return JSON.parse(String(q.types)); } catch { return String(q.types).split(','); } })();
  if (q.audio != null && q.audio !== '') i.audio = /^(1|true|on|yes)$/i.test(q.audio);
  if (num(q.speechSeconds)) i.speechSeconds = num(q.speechSeconds); // Talking photo: the speech length (H3 on Router: 2–15 s, the clip at least 5 s)
  for (const k of ['smooth48', 'loop'] as const) if (q[k] != null && q[k] !== '') i[k] = q[k]; // LTX-2.5 DFR: the 48 fps pass is priced; DFR with Loop runs at 720p (shared/ltxDfr.ts ltxDfrPriceInput)
  if (q.split != null && q.split !== '') i.split = /^(1|true|on|yes)$/i.test(q.split); // Talking Video: InfiniteTalk speech over 60 s in parts (shared/talkingVideo.ts)
  Object.assign(i, extendQuoteFields(q)); // LTX Extend on Comfy Cloud: the method and guide length set the rendered seconds (quote = charge)
  Object.assign(i, swapQuoteFields(q)); // Video Swap: Person / Object, the target, the click (same route checks as the job)
  for (const k of ['detail', 'texture', 'faces'] as const) if (q[k]) i[k] = q[k]; // 3D (2026-10-23): the price key's settings (ToolDef.routeInput turns them into it)
  const a = tool.app;
  if (a?.scales) {
    const sc = num(q.scale) ?? a.defaultScale ?? a.scales[0]; i.scale = sc; i.types ??= ['precise'];
    const w = num(q.width), h = num(q.height);
    if (w && h && w > 0 && h > 0) {
      const tl = upscaleTargetLong(q); const mo = a.outputTargets ? a.outputTargets[q.maxOutput || Object.keys(a.outputTargets)[0]] : null;
      const o = upscaleOutputSize(w, h, sc, tl != null && tl >= 720 ? tl : mo ?? a.maxLongSide ?? 3840);
      i.inputSize = { width: w, height: h }; i.outputSize = { width: o.width, height: o.height };
    }
    const vm = modelId ?? q.model ?? q.provider ?? tool.providers?.[0]; // Video Upscale: the model's own size rule (shared/videoUpscale.ts), as on submit
    if (VUP_TOOLS.has(a?.gallery?.base ?? tool.id) && vm) vupSizing(vm, i, { ...q, width: w, height: h });
  }
  return i;
}
/** (D) Picker groups. Per route: local → 'Local'; a Comfy Cloud route of an open graph (no API nodes) → 'Comfy Cloud'; everything else → 'API'.
 *  runsOnKind: 'local' | 'comfy-cloud-open' | 'api' (stable ids for DP; providerGroup is the display label). */
type Group = { providerGroup: 'Local' | 'Comfy Cloud' | 'API'; runsOnKind: 'local' | 'comfy-cloud-open' | 'api' };
const routeGroup = (kind: string, p: ReturnType<typeof getProvider>): Group => kind === 'local' ? { providerGroup: 'Local', runsOnKind: 'local' }
  : kind === 'comfy-cloud' && p && comfyCloudOpen(p) ? { providerGroup: 'Comfy Cloud', runsOnKind: 'comfy-cloud-open' } : { providerGroup: 'API', runsOnKind: 'api' };
/** Per model: open-weights models → 'Local' (they run on your ComfyUI; other routes are listed per route), open Comfy Cloud graphs → 'Comfy Cloud', else 'API'. */
const modelGroup = (p: ReturnType<typeof getProvider>): Group => !p ? { providerGroup: 'API', runsOnKind: 'api' } : p.kind === 'open-weights' ? { providerGroup: 'Local', runsOnKind: 'local' }
  : comfyCloudOpen(p) ? { providerGroup: 'Comfy Cloud', runsOnKind: 'comfy-cloud-open' } : { providerGroup: 'API', runsOnKind: 'api' };
const q2types = (q: Record<string, string>) => (q.mode ? `["${q.mode}"]` : q.types ?? '');
/** BH11/12: Settings → pinned routes show names, not ids. Each perModel entry also carries modelName (the model card name), routeLabel
 *  (plain route name, 'Auto' for auto), provider (who runs it: Local ComfyUI, Comfy Cloud, Comfy API, fal, Replicate, direct API) and routeKind.
 *  plus displayName ('<modelName> · local | Comfy Cloud | hosted'). Read-only extras: PUT accepts them back and ignores them. global gets modeLabel the same way. */
/** What a saved 'auto' (old clients, MCP, global.mode) means now: the pre-selected place (routing/select.ts autoOrder). Never shown as 'Auto'. */
export const PRESELECT_LABEL = 'Best ready place';
const KIND_PROVIDER: Record<string, string> = { 'comfy-cloud': 'Comfy Cloud', 'comfy-router': 'Comfy API', fal: 'fal', replicate: 'Replicate', direct: 'Direct API' };
function pinLabel(modelId: string | null, route: string) {
  if (!route || route === 'auto') return { routeLabel: PRESELECT_LABEL, provider: null, routeKind: null };
  const r = findRoute(route); if (!r) return { routeLabel: route, provider: null, routeKind: null };
  const P = getProvider(r.modelId ?? modelId ?? '');
  return { routeLabel: plainRoute(r), provider: r.kind === 'local' ? localRunnerName(P ?? { id: r.modelId } as any) : KIND_PROVIDER[r.kind] ?? r.kind, routeKind: r.kind };
}
/** COPY-FIXES-PART2 P2-6: a pin's display name is '<model name> · <local | Comfy Cloud | hosted>' ('· Auto' when the pin is Auto), e.g. 'Z-Image Turbo · local'. */
const pinKindWord = (kind: string | null) => (!kind ? 'pre-selected' : kind === 'local' ? 'local' : kind === 'comfy-cloud' ? 'Comfy Cloud' : 'hosted');
export function labelledPrefs(p: RoutingPrefs) {
  const perModel = Object.fromEntries(Object.entries<any>(p.perModel ?? {}).map(([m, v]) => { const P = getProvider(m);
    const modelName = P ? cleanName(P.name) : m; const pl = pinLabel(m, v?.route);
    return [m, { ...v, modelName, ...pl, displayName: `${modelName} · ${pinKindWord(pl.routeKind)}` }]; }));
  return { ...p, global: { ...p.global, modeLabel: pinLabel(null, (p.global as any)?.mode ?? 'auto').routeLabel }, envUseLocal: envUseLocal(), perModel, v: 2 as const, perTool: perToolView(p) };
}
/**
 * Step 2: GET /api/me/routing perTool = every choice in effect per (tool, model): the explicit v2 entries, plus the old per-engine pins
 * migrated on read (source 'legacy', engine = the old id): each applies only on the tools where its route serves that engine, under the
 * model the engine means there. Labels: modelName, runOnLabel, routeLabel. Read-only extras are ignored on PUT; 'legacy' rows are not stored.
 */
export function perToolView(p: RoutingPrefs) {
  const out: Record<string, Record<string, any>> = {};
  const label = (toolId: string, mk: string, e: ToolPin, extra: Record<string, any>) => { const ro = e.route && e.route !== 'auto' ? (findRoute(e.route) ? runOnOfRoute(findRoute(e.route)!) : null) : e.runOn ?? 'auto';
    return { ...e, ...(ro ? { runOn: ro } : {}), modelName: (findToolModel(toolId, mk) ? catalogueName(mk) : null) ?? mk, runOnLabel: !ro || ro === 'auto' ? PRESELECT_LABEL : RUN_ON_LABELS[ro as RunOn] ?? ro, ...(e.route ? { routeLabel: pinLabel(null, e.route).routeLabel } : {}), ...extra }; };
  // a stored runOn 'auto' (written by older clients) is no choice at all: the tool + model uses the pre-selected place, so it isn't listed
  for (const [toolId, ms] of Object.entries(p.perTool ?? {})) for (const [mk, e] of Object.entries(ms ?? {})) { if (!e.route && (!e.runOn || e.runOn === 'auto')) continue; (out[toolId] ??= {})[mk] = label(toolId, mk, e, { source: 'tool' }); }
  for (const [engine, v] of Object.entries(p.perModel ?? {})) { if (!v?.route || v.route === 'auto') continue; // an old 'auto' pin = no choice
    for (const tool of listTools()) { if (!tool.providers.includes(engine)) continue; if (v.route !== 'auto' && !routesFor(engine, tool).some((r) => r.routeId === v.route)) continue;
      for (const m of toolModels(tool).filter((x) => x.parts.some((pp) => pp.engine === engine && (v.route === 'auto' || !pp.routes || pp.routes.includes(v.route))))) {
        if (out[tool.id]?.[m.key]) continue; (out[tool.id] ??= {})[m.key] = label(tool.id, m.key, { route: v.route, ...(v.allowFallback != null ? { allowFallback: v.allowFallback } : {}) }, { source: 'legacy', engine }); } } }
  return out;
}
/** PUT /api/me/routing perTool: {[toolId]: {[modelKey | old engine id]: {runOn?, route?, allowFallback?} | null}} → the stored v2 map (or an error). */
function parsePerTool(b: any): { value: NonNullable<RoutingPrefs['perTool']> } | { error: string; field: string; code: string } {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { error: 'perTool must be an object {toolId: {model: {runOn, route?, allowFallback?}}}', field: 'perTool', code: 'invalid' };
  const out: NonNullable<RoutingPrefs['perTool']> = {};
  for (const [toolId, ms] of Object.entries<any>(b)) {
    const tool = getTool(toolId); if (!tool) return { error: `perTool.${toolId}: unknown tool`, field: `perTool.${toolId}`, code: 'unknown_tool' };
    if (!ms || typeof ms !== 'object') return { error: `perTool.${toolId} must be an object`, field: `perTool.${toolId}`, code: 'invalid' };
    for (const [id, e] of Object.entries<any>(ms)) {
      const f = `perTool.${toolId}.${id}`; if (e == null || e.source === 'legacy') continue; // null deletes; a migrated legacy row read back is not stored (its perModel pin still applies)
      if (typeof e !== 'object') return { error: `${f} must be {runOn, route?, allowFallback?}`, field: f, code: 'invalid' };
      const mk = findToolModel(tool, id) ? id : tool.providers.includes(id) ? modelKeyOf(tool.id, id) : null; const m = mk ? findToolModel(tool, mk) : undefined;
      if (!m) return { error: `${f}: ${tool.name} has no model "${id}"`, field: f, code: 'unknown_model' };
      const ro = e.runOn == null || e.runOn === '' ? null : normRunOn(e.runOn); if (e.runOn != null && e.runOn !== '' && !ro) return { error: `${f}.runOn must be "auto" or a run-on id`, field: `${f}.runOn`, code: 'invalid_run_on' };
      if (e.allowFallback != null && typeof e.allowFallback !== 'boolean') return { error: `${f}.allowFallback must be boolean`, field: `${f}.allowFallback`, code: 'invalid' };
      const routes = modelRoutes(tool, m).map((x) => x.route);
      let route: string | undefined; if (e.route != null && e.route !== '' && e.route !== 'auto') { const r = routes.find((x) => x.routeId === e.route); if (!r) return { error: `${f}.route ${e.route} does not run ${m.def.name} on ${tool.name}`, field: `${f}.route`, code: 'route_not_in_model' };
        if (ro && ro !== 'auto' && runOnOfRoute(r) !== ro) return { error: `${f}: route ${e.route} runs on ${RUN_ON_LABELS[runOnOfRoute(r)]}, not ${RUN_ON_LABELS[ro]}`, field: `${f}.route`, code: 'route_run_on_mismatch' }; route = r.routeId; }
      if (!route && ro && ro !== 'auto' && !routes.some((r) => !r.comingSoon && runOnOfRoute(r) === ro)) return { error: `${f}: ${m.def.name} doesn't run on ${RUN_ON_LABELS[ro]} for ${tool.name}`, field: `${f}.runOn`, code: 'run_on_unavailable' };
      const runOn = route ? runOnOfRoute(routes.find((x) => x.routeId === route)!) : ro ?? 'auto';
      if (runOn === 'auto') continue; // 'auto' (older clients, agents) = no saved choice: the pre-selected place applies, nothing is stored
      (out[tool.id] ??= {})[m.key] = { runOn, ...(route ? { route } : {}), ...(e.allowFallback != null ? { allowFallback: e.allowFallback } : {}) };
    }
  }
  return { value: out };
}
/** displayName + providerGroup + runsOnKind for one tool/model: the labels /api/models, /api/routes and /api/tools providers[] share. */
export function providerLabels(toolId: string, modelId: string) {
  const P = getProvider(modelId); const mg = modelGroup(P);
  return { displayName: cardName(toolId, modelId) ?? (P ? cleanName(P.name) : modelId), providerGroup: mg.providerGroup, runsOnKind: mg.runsOnKind };
}
/** Oct 19 #3: THE route availability rule, shared by GET /api/routes (routesView) and the Edit Video menu, matching what the quote/job resolver
 *  (plan / autoOrder) does: option() per route, then
 *  - a local route while Use local ComfyUI is off (and it isn't pinned, the Auto demo pick, or the model's only route) → available:false, runnable:false,
 *    reason LOCAL_OFF_REASON, reasonCode 'local_off', status 'Reachable, but off' (still pinnable);
 *  - a keyless priced cloud route on the mock backend → demo:true (credits 0, listCredits = price), reason demoReason (key needed for real runs);
 *  - runnable = available || demo; pinned. */
export function listedRoutes(tool: ToolDef, modelId: string, input: Record<string, any>): any[] {
  const prefs = getPrefs(); const saved = savedPinOf(tool, modelId, input); const choice = saved?.route ?? prefs.global.mode ?? 'auto';
  const pinnedId = choice !== 'auto' && routesFor(modelId, tool).some((r) => r.routeId === choice) ? choice : null;
  // Bug Hunter #12: a local route is available only when Use local ComfyUI is on, it is pinned, or the model is local-only. Unreachable keeps its own reason.
  const localOnly = localOnlyModel(modelId, tool, input); const lOn = prefs.global.useLocal || localOnly; const auto = autoOrder(tool, modelId, input); const demoId = auto[0]?.demo ? auto[0].routeId : null;
  const autoLocalId = !lOn && auto[0] && auto[0].kind === 'local' && !auto[0].demo && auto[0].routeId !== pinnedId ? auto[0].routeId : null; // re-check 6: Auto's local pick (never a demo)
  return routesFor(modelId, tool).map((r) => option(tool, r, input)).map((o): any => o.kind === 'local' && o.available && o.routeId === autoLocalId ? { ...o, status: 'Runs locally · free', reason: LOCAL_AUTO_REASON, reasonCode: 'local_auto', runsWhenPinned: true }
    : o.kind === 'local' && o.available && !lOn && o.routeId !== pinnedId && o.routeId !== demoId
    // Oct 19 b2 (DP #1/#4): Auto skips it; a pin (saved or route= on the request) still runs it locally → runsWhenPinned, plus a secondary line
    ? { ...o, available: false, reason: LOCAL_OFF_REASON, reasonDetail: LOCAL_OFF_DETAIL, reasonCode: 'local_off', reasonText: 'Running on your computer is off in Settings.', status: 'Reachable, but off', pinnable: true, runsWhenPinned: true }
    // BH #5: a local pin runs locally even with Use local off (plan() pinned path), so the listing says so: available, pinned, 'Pinned · runs locally' (+ local_pinned when Use local is off)
    : o.kind === 'local' && o.available && o.routeId === pinnedId && !prefs.global.useLocal && !localOnly ? { ...o, status: 'Pinned · runs locally', reason: LOCAL_PINNED_REASON, reasonCode: 'local_pinned', pinnable: true, runsWhenPinned: true }
    // Oct 19 b2 (DP #2): the 'only route' exception: a local-only model runs locally with Use local off, and says why
    : o.kind === 'local' && o.available && localOnly && !prefs.global.useLocal && o.routeId !== demoId ? { ...o, status: 'Local only · runs on your computer', reason: LOCAL_ONLY_REASON, reasonCode: 'local_only', runsWhenPinned: true }
    : o.kind === 'local' ? { ...o, runsWhenPinned: !!o.available, status: o.routeId === pinnedId && o.available ? 'Pinned · runs locally' : o.routeId === demoId ? 'Sample' : o.available ? 'Reachable and on' : o.reason === LOCAL_UNREACHABLE_REASON ? 'Not reachable' : o.reason }
    // demo mode: a keyless priced cloud route runs as a labelled mock preview when Auto picks it or the user chooses it (plan() pinned path)
    : demoKeyless(o) ? { ...o, demo: true, listCredits: o.credits, credits: 0, demoMessage: DEMO_MESSAGE, status: 'Sample', priceLine: demoPriceLine(o.credits), reason: demoReason(keyOwnerOf(o.envKey)), keyNeededForRealRuns: o.wired !== false, keyOwner: keyOwnerOf(o.envKey), demoLabel: demoLabel(o, providerLabels(tool.id, modelId).displayName), demoTag: DEMO_TAG } : o) // demo previews are free
    .map((o: any) => ({ ...o, runnable: o.available || !!o.demo, demo: !!o.demo, pinned: o.routeId === pinnedId }))
    .map((o: any) => fitListing(o, pinnedId, modelId));
}
/** HW-SHAPES quote fields on a local route: fit (+ alternative, eta) and requirements; Q2 fitWarning when a too-heavy pin runs anyway; Q3 a slow route's
 *  priceLine says so; Q4 / DP 3: missing weights → runnable:false (weights_missing, or not_enough_disk when they can't fit), nothing charged. */
function quoteHw(tool: ToolDef, model: string, input: Record<string, any>, pl: any) {
  const hb: any = hwBlock(tool, model, input, { fit: pl.first.fit }); if (!hb.fit) return {};
  const warn = pl.routing.fitWarning?.message ?? null; const g = weightsGate(tool, model, input);
  return { ...hb, etaRange: hb.fit.etaRange ?? null, ...(warn ? { fitWarning: warn, warnings: [warn] } : {}), ...(hb.fit.verdict === 'slow' && !pl.routing.demo ? { priceLine: 'Free · on your computer · slow', fitNote: SLOW_LOCAL_NOTE } : {}),
    localFreeOption: hb.fit.verdict === 'fits' || hb.fit.verdict === 'unknown',
    ...(g ? { runnable: false, chargeable: false, valid: false, reasonCode: g.code, blockedCode: g.code, blockedReason: g.message, missingBytes: g.missingBytes, missingFiles: g.missingFiles, diskFreeBytes: g.diskFreeBytes, downloadable: g.downloadable, downloadEndpoint: g.downloadEndpoint, downloadId: g.downloadId } : {}) };
}
/** HW-SHAPES B3 / Q2 / Q3: local fit in the listing. too_heavy → available:false, Auto skips it, a pin still runs it with a warning (runsWhenPinned,
 *  pinWarning); slow → still runnable, 'Runs locally · free' becomes '… · slow on this computer' (only a fitting route shows as plain free). */
function fitListing(o: any, pinnedId: string | null, modelId: string) {
  if (o.kind !== 'local' || !o.fit) return o;
  const v = o.fit.verdict; const name = getProvider(modelId)?.name ?? 'This model';
  if (o.reasonCode === 'too_heavy') { const pinned = o.routeId === pinnedId; const pinWarning = tooHeavyWarning(o.fit, name);
    // HW2: a pinned too_heavy route runs (Q2), so its listing fit carries the same fit.warning as the quote and the job
    return { ...o, available: false, runnable: pinned, runsWhenPinned: true, pinnable: true, status: pinned ? 'Pinned · too heavy for your computer' : 'Too heavy for your computer', pinWarning, fitStatus: 'too_heavy', ...(pinned ? { fit: { ...o.fit, warning: pinWarning, pinnedAnyway: true } } : {}) }; }
  if (v === 'slow') return { ...o, fitStatus: 'slow', fitNote: SLOW_LOCAL_NOTE, status: typeof o.status === 'string' && /^(Runs locally · free|Reachable and on|Pinned · runs locally|Local only · runs on your computer)$/.test(o.status) ? `${o.status} · slow on your computer` : o.status };
  return { ...o, fitStatus: v };
}
/** The quote's `refs` field as a count: a number ("0" = none), else any other value = one image. */
const refCount = (v: unknown): number => { if (v == null || v === '') return 0; const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 1; };
/** 2026-11-01: the uploads an Image recipe's bar always sends (its required photos), as the quote turns image=1 / refs=<n> into the job, so a
 *  listing judges the job the bar quotes (a Relight with no photo made every hosted edit route look blocked: the listing then pre-selected,
 *  and hid, other places than the quote named). Callers' own fields win. */
const recipeJob = (toolId: string): Record<string, any> => { const u = recipeUploadsOf(toolId); if (!u) return {};
  return { ...(u.refs > 0 ? { refPaths: Array.from({ length: u.refs }, (_, k) => `quote:ref${k}`) } : {}), ...(u.image && !/^(generate|t2v|)$/.test(u.mode) ? { imagePath: 'quote:image' } : {}) }; };
export function routesView(toolId: string, modelId: string, rawInput: Record<string, any> = {}, o: { hw?: boolean } = {}) {
  const tool = getTool(toolId); if (!tool) return null;
  // Item 4 / P0: the listing applies the tool's fixed routing input (routeInput, e.g. h3-extend mode extend) like resolveRoute does, so the
  // default route, demo flag and via text match the quote and the submit (no 'local · free' while the quote runs a fal demo).
  // Apps (app-*): their locked params (types, duration) apply as in the quote hook; the locked provider stays the quote's business.
  const G = (tool as any).app?.gallery as { locked?: Record<string, string> } | undefined;
  const locked = G?.locked ? routeQuoteInput(tool, Object.fromEntries(Object.entries(G.locked).filter(([k]) => k !== 'provider'))) : {};
  // Oct 19 #2: Camera is judged on the job it starts as (the model's first move, its default length), like the quote and the job, so the route line names the route that runs
  const camDef = toolId === 'camera' && rawInput.types == null && cameraDefaultMove(modelId) ? { types: [cameraDefaultMove(modelId)], ...(rawInput.duration == null && defaultDurationFor('camera', modelId) ? { duration: defaultDurationFor('camera', modelId) } : {}) } : {};
  const input = routeInput(tool, { ...recipeJob(toolId), ...camDef, ...rawInput, ...locked });
  const labels = { ...providerLabels(toolId, modelId), ...((n) => (n ? { displayName: n } : {}))(modelNameForRun(toolId, modelId, input)), ...lifecycleFields(modelId) }; // BH9 P1-4; audit 2026-10-21: lifecycle (retiring)
  const prefs = getPrefs(); const saved = savedPinOf(tool, modelId, input);
  const choice = saved?.route ?? prefs.global.mode ?? 'auto';
  const pinnedId = choice !== 'auto' && routesFor(modelId, tool).some((r) => r.routeId === choice) ? choice : null;
  // Bug Hunter #12: a local route is available only when Use local ComfyUI is on, it is pinned, or the model is local-only; otherwise it is
  // listed as disabled (reason local_off, status "Reachable, but off"; still pinnable). Unreachable keeps its own reason.
  const auto = autoOrder(tool, modelId, input);
  const ow = providerOpenWeights(getProvider(modelId)); // same marker as /api/tools providers[].openWeights (Comfy Cloud: only graphs without API nodes)
  const durs = durationsFor(durToolOf(tool) ?? toolId, modelId); // allowed clip lengths (same rule as quote + submit), per route
  const routes = listedRoutes(tool, modelId, input).map((o: any) => (o.kind === 'local' && o.fit ? { ...o, fit: (() => { try { return withAlternative(tool, modelId, input, o.fit); } catch { return o.fit; } })() } : o)).map((o: any) => ({ ...o, ...(durs ? { durations: durs } : {}), openWeights: ow && o.kind !== 'comfy-router' /* a Router run is a partner API call, never open weights (H3 Camera / Extend / Lip Sync gained Router places, 5bc53d48) */, ...routeGroup(o.kind, getProvider(modelId)), ...lifecycleFields(o.routeId),
      // P2 3d: per-route displayName: local routes name the model ('Local ComfyUI · Wan 2.2 Animate 14B'); others use their label without the price part
      displayName: o.kind === 'local' ? `${localRunnerName(getProvider(modelId) ?? { id: modelId })} · ${labels.displayName}` : String(o.label ?? o.routeId).replace(/\s*·\s*(free|✦?\d+.*)$/i, ''),
      ...routeModelFields(o), modelKey: routeModelKey(toolId, modelId, o.routeId, input) }));
  const pinned = pinnedId;
  const def = pinned ?? auto[0]?.routeId ?? null; const d = routes.find((r) => r.routeId === def);
  const np = !def ? (({ status, routes: _r, ...x }) => x)(noProvider(tool, modelId, routes)) : null;
  const demoN = !pinned && auto[0]?.demo ? demoNotice(auto[0], toolId) : null;
  const hw = o.hw ? (() => { try { const lr = routes.find((r: any) => r.kind === 'local'); return lr ? hwBlock(tool, modelId, input, { fit: lr.fit, label: labels.displayName }) : {}; } catch { return {}; } })() : {}; // full fit + requirements (models / routes listings)
  return { ...labels, ...hw, ...(durs ? { durations: durs } : {}), modelKey: modelKeyOf(toolId, modelId, input), routes, defaultRoute: def, demo: !!demoN, demoMessage: demoN ? DEMO_MESSAGE : null, demoNotice: demoN, ...(np ? { noProvider: np, state: np.state, options: np.options } : { state: 'ready' as const }), routing: { mode: pinned ? 'pinned' : 'auto', route: pinned ?? 'auto', allowFallback: saved?.allowFallback ?? prefs.global.allowFallback, useLocal: prefs.global.useLocal },
    priceRef: d ? d.priceRef ?? null : null,
    via: d ? { label: d.kind === 'local' ? 'local' : d.kind, credits: d.credits, /* N3: no prices in via.text (prices come from the quote only) */ text: d.kind === 'local' ? 'local · free' : d.demo ? 'Sample' : `via ${d.tierLabel ?? (d.kind === 'comfy-cloud' ? 'Comfy Cloud' : d.kind === 'fal' ? 'fal' : d.kind === 'replicate' ? 'Replicate' : 'direct API')}`, ...(d.demo && d.kind !== 'local' ? { demoLabel: demoLabel(d, labels.displayName), demoTag: DEMO_TAG } : {}) } : null };
}
/**
 * Run on: the listing's pre-selection comes from the SAME resolver as the quote and the submit (resolveRoute with the request's route set to
 * 'auto', i.e. ignoring a saved choice), judged on the listing's default job, so models[].preselect names the place the quote will name.
 * modelsBlock's own status-based pick stays as the fallback (and supplies status / action for that place).
 */
function withResolvedPreselect(tool: ToolDef, models: any[]): any[] {
  for (const m of models) { try {
    const mr0 = resolveModelRequest(tool, { model: m.key }); if (!mr0.ok) continue; const mr = preferRunnablePart(tool, mr0, listingInput(tool, mr0.provider ?? m.primaryEngine, mr0.types ? { types: mr0.types } : {})) as typeof mr0; const engine = mr.provider ?? m.primaryEngine; if (!engine) continue;
    const input = listingInput(tool, engine, mr.types ? { types: mr.types } : {});
    const pl: any = resolveRoute(tool, engine, input, 1, { route: 'auto', allowRoutes: mr.allowRoutes, modelKey: mr.modelKey });
    if ('error' in pl) { m.preselect = null; m.autoRunOn = null; } // nothing ready: nothing is pre-selected (never a download / key place)
    else { const ro = runOnOfRoute(pl.first); let row = (m.runsOn as any[]).find((r) => r.id === ro);
      // a hidden other provider (routing/hiddenPlaces.ts) that the resolver picks for the default job comes back: the menu names where a run goes
      if (!row && Array.isArray(m._hiddenRows)) { row = m._hiddenRows.find((r: any) => r.id === ro); if (row) { m.runsOn.push(row); m.hiddenRunsOn = (m.hiddenRunsOn ?? []).filter((h: any) => h.id !== ro); if (!m.hiddenRunsOn.length) delete m.hiddenRunsOn; } }
      if (row) { if (m.preselect?.runOn !== ro) m.preselect = { runOn: ro, label: row.label, status: row.status, action: row.action ?? null }; m.autoRunOn = ro; } }
    m.rowStatus = rowStatusOf(m);
  } catch { /* keep modelsBlock's pick */ } finally { delete m._hiddenRows; } }
  return models;
}
/** The job a listing / status check judges a model on (app locks, Camera's first move and length), shared with routing/defaults.ts. */
export function listingInput(tool: ToolDef, modelId: string, rawInput: Record<string, any> = {}) {
  if (tool.id === 'app-photos-to-reel' || tool.id === 'photos-reel') { const camera = getTool('camera'); if (camera) return listingInput(camera, modelId, { ...rawInput, duration: 5, aspect: '9:16', types: [cameraDefaultMove(modelId)].filter(Boolean) }); }
  const G = (tool as any).app?.gallery as { locked?: Record<string, string> } | undefined;
  const locked = G?.locked ? routeQuoteInput(tool, Object.fromEntries(Object.entries(G.locked).filter(([k]) => k !== 'provider'))) : {};
  const camDef = tool.id === 'camera' && rawInput.types == null && cameraDefaultMove(modelId) ? { types: [cameraDefaultMove(modelId)], ...(rawInput.duration == null && defaultDurationFor('camera', modelId) ? { duration: defaultDurationFor('camera', modelId) } : {}) } : {};
  // Task 7: a tool whose modes don't include 'generate' (Generate Video: t2v / i2v / flf / r2v; Audio: music / sfx / voice) is judged on its
  // first mode, the one its page starts on, not on 'generate' (no route serves that, so MiniMax H3 pre-selected Local while the page's
  // quote ran on Comfy).
  const ms = rawInput.types == null && rawInput.mode == null && !(camDef as any).types && !(locked as any).types ? toolModes(tool) : [];
  const modeDef = ms.length && !ms.includes('generate') ? { types: [ms[0]] } : {};
  return routeInput(tool, { ...recipeJob(tool.id), ...camDef, ...modeDef, ...rawInput, ...locked });
}
setStatusInput((tool, modelId) => listingInput(tool, modelId));
/** BH12: a keyless default route says plainly what happens: '<route> · sample output · needs a <owner> key for real runs' (or 'not connected here yet'). */
export const routeName = (o: { label?: string; routeId: string }, modelName?: string | null) => { const l = String(o.label ?? o.routeId).replace(/\s*·\s*(free|✦?\d+.*)$/i, ''); return modelName && !/\bvia\b/.test(l) && /^(Comfy Cloud|Comfy Router|Comfy Cloud · partner API)$/.test(l) ? `${modelName} on ${l}` : l; };
/** Short chip label next to demoLabel/demoReason (DP #27); the client used to slice this from the sentence. */
export const DEMO_TAG = 'Sample';
export const demoLabel = (o: { label?: string; routeId: string; envKey?: string | null; wired?: boolean }, modelName?: string | null) => `${routeName(o, modelName)} · sample output · ${o.wired === false ? "not ready in this app yet" : `needs a ${keyOwnerOf(o.envKey)} key for real runs`}`;
/** BH12/BH13: the free-demo-preview words for one model's default route (result actions like Upscale on a draft; same text as the quote). {} when the route runs for real or locally. */
export function demoFieldsFor(tool: ToolDef, modelId: string, input: Record<string, any> = {}) {
  const pl = plan(tool, modelId, input) as any; const f = pl?.first as RouteOption | undefined; if (!f || !pl.routing?.demo || f.kind === 'local') return {};
  const n = providerLabels(tool.id, modelId).displayName; const owner = keyOwnerOf(f.envKey);
  return { demo: true, routeLabel: demoLabel(f, n), demoLabel: demoLabel(f, n), demoTag: DEMO_TAG, keyNeededForRealRuns: f.wired !== false, keyOwner: owner, listCredits: (f as any).listCredits ?? (f.credits || null),
    demoReason: f.wired === false ? `${routeName(f, n)} isn’t ready in this app yet. You’ll get a sample for now; nothing is billed.` : demoReason(owner) + '.' };
}
const validPrefs = (b: any): string | null => {
  if (!b || typeof b !== 'object') return 'body must be an object';
  if (b.global && ((b.global.mode != null && typeof b.global.mode !== 'string') || (b.global.allowFallback != null && typeof b.global.allowFallback !== 'boolean'))) return 'global = {mode: "auto" | routeId, allowFallback: boolean}';
  if (b.global?.useLocal != null && typeof b.global.useLocal !== 'boolean') return 'global.useLocal must be boolean';
  if (b.global?.mockKeys != null && typeof b.global.mockKeys !== 'boolean') return 'global.mockKeys must be boolean';
  if (b.global?.showOtherProviders != null && typeof b.global.showOtherProviders !== 'boolean') return 'global.showOtherProviders must be boolean';
  if (b.global?.mode && b.global.mode !== 'auto' && !findRoute(b.global.mode)) return `global.mode must be "auto" or a routeId`;
  for (const [m, v] of Object.entries<any>(b.perModel ?? {})) {
    if (RETIRED_MODELS[m]) continue; // a removed model's stale pin is dropped on save, not an error
    if (!v || typeof v.route !== 'string') return `perModel.${m}.route must be "auto" or a routeId`;
    if (v.route !== 'auto' && findRoute(v.route)?.modelId !== m && !listTools().some((t) => routesFor(m, t).some((r) => r.routeId === v.route))) return `perModel.${m}.route ${v.route} does not serve ${m}`;
    if (v.allowFallback != null && typeof v.allowFallback !== 'boolean') return `perModel.${m}.allowFallback must be boolean`;
  }
  return null;
};
/** Step 2: the quote's tool for a model key with no toolId (/api/models/quote): Create Image if it offers it, else the first tool that does. */
const offers = (t: string, id: string) => !!getTool(t) && (!!findToolModel(t, id) || getTool(t)!.providers.includes(id));
/** …Create Image first, then Generate Video (the home of the video models; Camera Moves now lists MiniMax H3 too), else the first tool that does. */
const toolForModel = (id: string) => (offers('create-image', id) ? getTool('create-image') : offers('h3-video', id) ? getTool('h3-video') : listTools().find((t) => !!findToolModel(t, id) || t.providers.includes(id)));
/** GET /api/tools additions: providers[] carry the same displayName / providerGroup / runsOnKind as /api/models and /api/routes, and each tool
 *  gets models[] (one row per model). Never throws: a tool whose rows fail keeps its plain providers. */
export function enrichTools(payload: any[]): any[] {
  try {
  // providers[] carry the same displayName / providerGroup / runsOnKind as /api/models and /api/routes. Per provider, so one bad
  // provider can't strip the labels from the whole listing; the fallback uses the same labelling rules as routesView.
  return payload.map((t: any) => { if (!Array.isArray(t?.providers)) return t;
    const providers = t.providers.map((p: any) => {
      try { const v = routesView(t.id, p.id); if (v) return { ...p, ...v, modelKey: modelKeyOf(t.id, p.id) }; } catch { /* fall through to the plain labels */ }
      return { ...p, ...providerLabels(t.id, p.id), modelKey: modelKeyOf(t.id, p.id) };
    });
    // Step 1: one row per MODEL (providers[] stays as is for the current web): key, name, runsOn[] with status and price, fromPrice, lifecycle.
    let models: any[] | undefined; try { const tl = getTool(t.id); if (tl) models = withResolvedPreselect(tl, modelsBlock(tl, providers)); } catch (e) { console.error('[models] models[] failed for', t.id, (e as Error).message); }
    return { ...t, providers, ...(models ? { models } : {}) }; });
  } catch { return payload; }
}
export function registerRouting(app: FastifyInstance) {
  // Camera: the LTX-2 19B model's default move (first preset the LTX engine runs), for requests that name the model but no move.
  void import('../tools/apps.js').then((AP) => setLtxDefaultMove(() => AP.cameraDefaultMove('cloud-ltx-camera'))).catch(() => undefined);
  /** Step 2: quotes accept model (a model key, or an old engine id) and runOn. They are turned into the engine + route fields the existing
   *  resolver reads BEFORE the handler runs, by the same resolveModelRequest the job submit uses (index.ts), so quote route = submit route. */
  app.addHook('preHandler', async (req, reply) => {
    if (req.method !== 'GET') return; const url = req.url.split('?')[0];
    const pm = url.match(/^\/api\/tools\/([^/]+)\/price$/); const isQuote = url === '/api/models/quote'; if (!pm && !isQuote) return;
    if (pm?.[1] === 'app-photos-to-reel' || (isQuote && (req.query as any)?.toolId === 'app-photos-to-reel')) return; // Composite children resolve their own models and routes.
    const q = (req.query ?? {}) as Record<string, string>; const runOnRaw = q.runOn ?? q.run_on;
    { // Enum case (re-check 6): validate + normalise the user's enum values (aspect=AUTO → auto, quality=HIGH → high) BEFORE the price handler's
      // per-model checks, exactly as the submit does (index.ts enumParamError on the job fields), so quote = submit for the same params. Same 400 body.
      const t0 = pm ? getTool(decodeURIComponent(pm[1])) : q.toolId ? getTool(q.toolId) : q.model ? toolForModel(q.model) : getTool('create-image');
      if (t0) { const bad = enumParamError(t0, q); if (bad) { const Dd = toolDefaults(t0, { mode: requestMode(t0, q) });
        return reply.code(400).send({ ...bad, preferredProvider: Dd.preferredProvider, defaultProvider: Dd.defaultProvider, defaultFallback: Dd.defaultFallback, valid: false, credits: null, priceAvailable: false }); } } }
    const tool = pm ? getTool(decodeURIComponent(pm[1])) : q.toolId ? getTool(q.toolId) : q.model ? toolForModel(q.model) : getTool('create-image'); if (!tool) return;
    const noRun = runOnRaw == null || runOnRaw === '';
    if (tool.id !== 'motion-transfer' && ((!q.model && noRun) || (noRun && getProvider(q.model)))) return; // motion also guards legacy provider and route-only requests
    if (isQuote && !q.toolId) q.toolId = tool.id;
    const r = preferRunnablePart(tool, resolveModelRequest(tool, { model: q.model, runOn: runOnRaw, provider: isQuote ? null : q.provider, route: q.route, types: q.mode ? [q.mode] : q.types, mode: q.mode }), q); // H3 map F1: the engine of this model that runs here
    if (!r.ok) { const { ok: _o, status, ...body } = r; return reply.code(status).send({ ...body, issues: [{ code: body.code, field: body.field, message: body.error }], valid: false, credits: null, priceAvailable: false }); }
    if (r.provider) { q.model = r.provider; if (!isQuote) q.provider = r.provider; }
    if (r.route) q.route = r.route; if (r.types && !q.types && !q.mode && tool.inputs.some((i) => i.name === 'types')) q.types = r.types; // the default LTX move only where moves are a setting (Camera), not on the reel, which picks its own per photo
    (req as any).ohfModel = r;
  });
  /** Step 1: the model registry (static: models, per-tool models with their engines and routes, run-on ids, engine aliases). */
  app.get('/api/models/registry', async () => registryView());
  /** Task 7: POST /api/models/quotes, the price of THIS run for every picker row in one call (routing/quotesBatch.ts). */
  registerQuotesBatch(app);
  /** 2026-10-27: Comfy Router routes refused with not_enabled, skipped by the automatic pick for 24 h; "Check again" clears one (routing/routeOff.ts). */
  registerRouteOff(app);
  /** Step 2: ?model= deep links: a model key or an old engine id → { model, engine, runOn } for a tool. */
  app.get<{ Querystring: { toolId?: string; model?: string; id?: string; types?: string } }>('/api/models/resolve', async (req, reply) => {
    const id = String(req.query.model ?? req.query.id ?? '').trim(); const toolId = String(req.query.toolId ?? '').trim() || (id ? toolForModel(id)?.id ?? '' : '');
    if (!id || !toolId || !getTool(toolId)) return reply.code(400).send({ error: 'Pass model (a model key or an engine id) and toolId.', errorType: 'validation' });
    const r = resolveModelId(toolId, id, req.query.types ? { types: req.query.types } : null);
    return r ? r : reply.code(404).send({ error: `${getTool(toolId)!.name} has no model "${id}".`, errorType: 'not_found', models: toolModels(toolId).map((m) => m.key) });
  });
  app.get('/api/settings/providers', async () => ({ providers: providerSettings(), canStoreKeys: isLoopback(process.env.HOST), storeKeysNote: 'Keys can be saved here only when the server runs on this computer. Otherwise add them to the server’s settings file. Saved keys are never shown again.', storeKeysDetail: 'POST /api/settings/providers writes .env.local only when the server binds to 127.0.0.1/::1 (HOST env). Key values are never returned.' }));
  app.post('/api/settings/providers', async (req, reply) => {
    if (!isLoopback(process.env.HOST)) return reply.code(403).send({ error: 'Saving keys from the browser is off because the server isn’t running on this computer. Add the key to the server’s settings file instead.', errorType: 'forbidden', detail: 'The server is not bound to localhost: set HOST=127.0.0.1, or put the key in .env.local.' });
    const b = (req.body ?? {}) as { id?: string; key?: string }; const r = storeKey(String(b.id ?? ''), String(b.key ?? ''));
    if ('error' in r) return reply.code(400).send({ error: r.error, errorType: 'validation' });
    const ps = providerSettings().find((x) => x.id === b.id); return { ok: true, id: b.id, envKey: r.envKey, configured: true, keySetAt: ps?.keySetAt ?? null, keyHint: ps?.keyHint ?? null, keySource: ps?.keySource ?? null, keyFormat: r.keyFormat };
  });
  /** Settings → Connections: remove a key that was saved here (same loopback rule as saving). Keys from the server's own settings are left alone (409). */
  app.delete<{ Params: { id: string } }>('/api/settings/providers/:id', async (req, reply) => {
    if (!isLoopback(process.env.HOST)) return reply.code(403).send({ error: 'Removing keys from the browser is off because the server isn’t running on this computer. Remove the key from the server’s settings file instead.', errorType: 'forbidden' });
    const r = removeKey(String(req.params.id ?? '')); if ('error' in r) return reply.code(r.code === 'unknown_provider' ? 404 : 409).send({ error: r.error, errorType: r.code === 'unknown_provider' ? 'not_found' : 'conflict', code: r.code });
    const ps = providerSettings().find((x) => x.id === req.params.id); return { ok: true, id: req.params.id, configured: !!ps?.configured, keyHint: ps?.keyHint ?? null, keySource: ps?.keySource ?? null, ...(r.stillConfigured ? { stillConfigured: true, stillFromEnvVar: r.stillFromEnvVar, note: `The saved key is removed, but ${ps?.name ?? 'this provider'} is still connected: the server's environment sets ${r.stillFromEnvVar}. Remove it there to disconnect.` } : { stillConfigured: false }) };
  });
  /** First-run setup ("How do you want to run?"): shown once. done = answered or skipped; choices = what was picked (try, gpu, comfy, direct). */
  app.get('/api/setup', async () => { const { getKv } = await import('../db.js'); const v = getKv<any>('setup', null);
    const keys = providerSettings().filter((p) => p.id !== 'local' && !ACCOUNT_ONLY.has(p.id) && p.configured && !p.mockedKey).map((p) => p.id); /* a Hugging Face token alone isn't a way to run */ const prefs = getPrefs();
    return { done: !!v?.done, at: v?.at ?? null, choices: Array.isArray(v?.choices) ? v.choices : [], keys, useLocal: !!prefs.global.useLocal,
      /** the real setup (cloud | local | both | none): the sheet starts from what is connected, never from a sample choice */ setup: setupKind(),
      /** true when nothing is set up yet (no setup answer, no real key, GPU off, no saved choice): the web shows the sheet on a first visit */
      suggest: !v?.done && !keys.length && !prefs.global.useLocal && !Object.keys(prefs.perModel ?? {}).length && !Object.keys(prefs.perTool ?? {}).length }; });
  app.put('/api/setup', async (req, reply) => { const b = (req.body ?? {}) as any;
    if (typeof b.done !== 'boolean') return reply.code(400).send({ error: 'done must be true or false', errorType: 'validation', issues: [{ code: 'invalid', field: 'done', message: 'done must be a boolean' }] });
    const ok = ['gpu', 'comfy', 'direct']; /* no 'try' (sample) choice since 2026-10-29 */ const choices = Array.isArray(b.choices) ? b.choices.map(String).filter((x: string) => ok.includes(x)) : [];
    const { setKv } = await import('../db.js'); const v = { done: b.done, at: new Date().toISOString(), choices }; setKv('setup', v); return v; });
  app.get('/api/me/routing', async () => labelledPrefs(getPrefs()));
  // ★ Make default (2026-10-27): the user's own default model per tool, kept on the server so every browser and MCP agree. Without one, the
  // tool starts on its recommended default (cloud first: shared/cloudDefaults.ts).
  const defaultsView = () => { const fav = getPrefs().favourites ?? {};
    return { favourites: fav, tools: listTools().map((t) => { let d: ReturnType<typeof toolDefaults> | null = null; try { d = toolDefaults(t); } catch { /* a tool that can't list */ }
      const slot = CLOUD_DEFAULTS[t.id] ? t.id : null; return { toolId: t.id, name: t.name, defaultProvider: d?.defaultProvider ?? null, recommendedProvider: d?.recommendedProvider ?? null,
        favourite: fav[t.id] ?? null, defaultSource: d?.defaultSource ?? null, ...(slot ? { cloud: CLOUD_DEFAULTS[slot] } : {}) }; }) }; };
  app.get('/api/me/defaults', async () => defaultsView());
  app.put('/api/me/defaults', async (req, reply) => {
    const b = (req.body ?? {}) as { toolId?: unknown; model?: unknown };
    const t = typeof b.toolId === 'string' ? getTool(b.toolId) : undefined;
    if (!t) return reply.code(400).send({ error: 'toolId must be a tool id from GET /api/tools', errorType: 'validation', issues: [{ code: 'invalid', field: 'toolId', message: 'unknown tool' }] });
    if (b.model != null && b.model !== '' && typeof b.model !== 'string') return reply.code(400).send({ error: 'model must be a model key, a provider id, or null to reset', errorType: 'validation', issues: [{ code: 'invalid', field: 'model', message: 'model must be a string or null' }] });
    let engine: string | null = null;
    if (b.model) { const r = resolveModelId(t.id, b.model as string); if (!r) return reply.code(400).send({ error: `${t.name} doesn't offer ${b.model}`, errorType: 'validation', issues: [{ code: 'not_offered', field: 'model', message: 'not a model of this tool' }] }); engine = r.engine; }
    setFavourite(t.id, engine);
    const d = toolDefaults(t); console.log(`[defaults] ${t.id} favourite=${engine ?? '(reset)'} source="${String(req.headers['x-openhiggsfield-source'] ?? req.headers['user-agent'] ?? 'unknown').slice(0, 80)}"`);
    return { toolId: t.id, favourite: engine, defaultProvider: d.defaultProvider, recommendedProvider: d.recommendedProvider ?? null, defaultSource: d.defaultSource ?? null, defaultFallback: d.defaultFallback, favourites: getPrefs().favourites ?? {} };
  });
  app.put('/api/me/routing', async (req, reply) => {
    const b = req.body as any; const bad = validPrefs(b); if (bad) return reply.code(400).send({ error: bad, errorType: 'validation' });
    const cur = getPrefs();
    // A local pin only when local ComfyUI is available (else the quote would say local while the run 409s). Unchanged existing pins pass through.
    if (!localAvailable()) for (const [m, v] of Object.entries<any>(b.perModel ?? {})) if (findRoute(v.route)?.kind === 'local' && cur.perModel[m]?.route !== v.route)
      return reply.code(400).send({ error: `perModel.${m}.route ${v.route}: local ComfyUI is not available on this server, so this model can't be pinned to local. Add an API key or set up ComfyUI.`, errorType: 'validation', issues: [{ code: 'local_unavailable', field: `perModel.${m}.route`, message: 'local ComfyUI not available' }], localAvailable: false });
    const { modeLabel: _ml, ...bGlobal } = (b.global ?? {}) as any; // read-only label from GET, never stored
    let perTool = cur.perTool ?? {};
    if (b.perTool !== undefined) { const pt = parsePerTool(b.perTool); if ('error' in pt) return reply.code(400).send({ error: pt.error, errorType: 'validation', issues: [{ code: pt.code, field: pt.field, message: pt.error }] });
      if (!localAvailable()) for (const [t, ms] of Object.entries(pt.value)) for (const [mk, e] of Object.entries(ms)) if (e.runOn === 'local' && JSON.stringify(cur.perTool?.[t]?.[mk]) !== JSON.stringify(e))
        return reply.code(400).send({ error: `perTool.${t}.${mk}: local ComfyUI is not available on this server, so this model can't be set to run locally. Add an API key or set up ComfyUI.`, errorType: 'validation', issues: [{ code: 'local_unavailable', field: `perTool.${t}.${mk}.runOn`, message: 'local ComfyUI not available' }], localAvailable: false });
      perTool = pt.value; }
    const next: RoutingPrefs = { global: { ...cur.global, ...bGlobal }, v: 2, perTool, perModel: b.perModel ? Object.fromEntries(Object.entries<any>(livePerModel(b.perModel)).map(([k, v]) => [k, { route: v.route, ...(v.allowFallback != null ? { allowFallback: v.allowFallback } : {}) }])) : cur.perModel };
    // Stability audit: every write is logged with who sent it (header x-openhiggsfield-source, else user-agent), the caller address and what changed; last 100 kept.
    const source = String(req.headers['x-openhiggsfield-source'] ?? req.headers['user-agent'] ?? 'unknown').slice(0, 120); const caller = `${req.ip}${req.headers.referer ? ` ref=${String(req.headers.referer).slice(0, 120)}` : ''}`;
    const changed = Object.fromEntries(Object.keys(next.global).filter((k) => (cur.global as any)[k] !== (next.global as any)[k]).map((k) => [k, [(cur.global as any)[k], (next.global as any)[k]]]));
    const perModelChanged = JSON.stringify(cur.perModel) !== JSON.stringify(next.perModel) || JSON.stringify(cur.perTool ?? {}) !== JSON.stringify(next.perTool ?? {});
    console.log(`[routing-settings] write source="${source}" caller=${caller} port=${process.env.PORT ?? 8787} changed=${JSON.stringify(changed)}${perModelChanged ? ' perModel=changed' : ''}`);
    const { getKv, setKv } = await import('../db.js'); const hist = getKv<any[]>('routingWrites', []); hist.unshift({ at: Date.now(), source, caller, changed, perModelChanged, global: next.global }); setKv('routingWrites', hist.slice(0, 100));
    return labelledPrefs(savePrefs(next));
  });
  /** Who changed the routing settings, newest first (last 100 writes): {at, source, caller, changed{key:[from,to]}, perModelChanged, global}. */
  app.get('/api/me/routing/history', async () => { const { getKv } = await import('../db.js'); const items = getKv<any[]>('routingWrites', []); return { items, total: items.length }; });
  app.get<{ Querystring: Record<string, string | undefined> & { toolId?: string; modelId?: string } }>('/api/routes', async (req, reply) => {
    const t = req.query.toolId ? getTool(req.query.toolId) : undefined;
    const tools = t ? [t] : listTools();
    // route credits for THIS job when the caller passes its params (Upscale: width, height, seconds, scale, maxOutput → output MP-seconds), same as /price
    const routes = tools.flatMap((tl) => tl.providers.filter((m) => !req.query.modelId || m === req.query.modelId).map((m) => ({ toolId: tl.id, modelId: m, ...routesView(tl.id, m, routeQuoteInput(tl as any, req.query, m), { hw: !!t }) })));
    if (!t) return { routes };
    // ?toolId=: also the tool's default model at top level (DP SERVER-NOTES-1018 #2), so a client never reads "no route" as local.
    const D = req.query.modelId ? null : toolDefaults(t, { mode: requestMode(t, req.query) }); // B6: the tool's default model (saved pin, else first runnable in quality order, else the cloud default)
    const want = req.query.modelId || D?.defaultProvider || toolProviders(t)[0]?.id; const top: any = routes.find((r) => r.modelId === want) ?? routes[0];
    return { routes, toolId: t.id, ...(D ? { preferredProvider: D.preferredProvider, defaultProvider: D.defaultProvider, defaultFallback: D.defaultFallback } : {}), modelId: top?.modelId ?? null, displayName: top?.displayName ?? null, providerGroup: top?.providerGroup ?? null, runsOnKind: top?.runsOnKind ?? null, defaultRoute: top?.defaultRoute ?? null, demo: !!top?.demo, demoMessage: top?.demoMessage ?? null, demoNotice: top?.demoNotice ?? null, state: top?.state ?? null, ...(top?.noProvider ? { noProvider: top.noProvider, options: top.options } : {}) };
  });
  app.post<{ Params: { id: string } }>('/api/jobs/:id/fallback', async (req, reply) => {
    const j = jobs.get(req.params.id); if (!j) return reply.code(404).send({ error: 'job not found', errorType: 'not_found' });
    const b = (req.body ?? {}) as { route?: string; decline?: boolean };
    if (b.decline) return decline(j) ? { id: j.id, status: j.status } : reply.code(409).send({ error: 'job is not waiting for a decision', errorType: 'validation' });
    const tool = getTool(j.toolId)!;
    const price = j.routing?.prices[String(b.route)] ?? 0; if (price > 0 && !canAfford(price)) return reply.code(402).send({ error: `Not enough credits: needs ${price}, balance ${getBalance()}.`, errorType: 'credits' });
    const route = String(b.route ?? ''); const ck = continueCheck(j, tool, route);
    if ('error' in ck) return reply.code(ck.status).send({ error: ck.error, errorType: 'validation', alternatives: j.alternatives ?? [] });
    // S-01: the move to another (possibly differently billed) route goes through the submit's spend guard: quote it → spending cap (the same
    // 400 spend_limit body) → agent budget; nothing changes on the job when refused. Passed → its Spend row moves to the new route (estimate, then actual).
    const g = (await import('../spendGuard.js')).guardNextRoute(j, route, req); if ('blocked' in g) return reply.code(g.blocked.status).send(g.blocked.body);
    g.commit();
    const r = continueOn(j, tool, route);
    if ('error' in r) return reply.code(r.status).send({ error: r.error, errorType: 'validation', alternatives: j.alternatives ?? [] });
    return { id: j.id, status: j.status, route: b.route, cost: r.credits, balance: getBalance() };
  });
  // Enrich model and tool listings additively (no change to their handlers).
  app.addHook('preSerialization', async (req, reply, payload: any) => {
    if (payload?.composite === true && payload.toolId === 'app-photos-to-reel') return payload;
    const url = req.url.split('?')[0];
    try {
      if (url === '/api/models' && payload && typeof payload === 'object') {
        const add = (m: any) => { if (!(m && m.toolId && m.id)) return m; const modelKey = modelKeyOf(m.toolId, m.id); const mk = makerOf(modelKey ?? '');
          return { ...m, ...routesView(m.toolId, m.id, {}, { hw: true }), modelKey, maker: mk?.key ?? null, makerName: mk?.name ?? null }; }; // maker on every card: the web never guesses it from a name
        if (Array.isArray(payload)) return payload.map((x: any) => (Array.isArray(x?.models) ? { ...x, models: x.models.map(add) } : add(x)));
        if (Array.isArray(payload.groups)) return { ...payload, groups: payload.groups.map((g: any) => (Array.isArray(g?.models) ? { ...g, models: g.models.map(add) } : g)), selected: payload.selected ? add(payload.selected) : payload.selected };
        if (Array.isArray(payload.models)) return { ...payload, models: payload.models.map(add) };
        if (Array.isArray(payload.tools)) return { ...payload, tools: payload.tools.map((x: any) => (Array.isArray(x?.models) ? { ...x, models: x.models.map(add) } : x)) };
      }
      if (url === '/api/config' && payload && typeof payload === 'object') { const g = getPrefs().global; return { ...payload, useLocal: g.useLocal, routingMode: g.mode, allowFallback: g.allowFallback, localAvailable: localAvailable(), localReachable: localAvailable(), localEnabled: g.useLocal, local: localState(), mockKeys: mockKeys(), setupKind: setupKind() }; }
      // Live prices follow the route Auto/pin would actually pick (shown = charged).
      const pm = url.match(/^\/api\/tools\/([^/]+)\/price$/); const isQuote = url === '/api/models/quote';
      if ((pm || isQuote) && req.method === 'GET' && payload && typeof payload === 'object' && typeof payload.credits === 'number') { // POST /price (uploaded refs) re-enters as an inner GET
        const q = (req.query ?? {}) as Record<string, string>; const mreq = (req as any).ohfModel as (ModelResolution & { ok: true }) | undefined; const tool = getTool(pm ? pm[1] : q.toolId || (typeof payload.toolId === 'string' ? payload.toolId : '') || 'create-image'); // quote of a non-Create-Image model: re-plan on the tool that owns it (was create-image: cloud-h3 quoted 64 = an 8 s default vs h3-video's 48)
        const RES_Q = /^(\d{3,4}p|\dk)$/i;
        const quoteDefs = () => { const Dd = tool ? toolDefaults(tool, { mode: requestMode(tool, q) }) : null; return Dd ? { preferredProvider: Dd.preferredProvider, defaultProvider: Dd.defaultProvider, defaultFallback: Dd.defaultFallback } : {}; };
        // Apps (app-*): the quote uses the app's locked params and its file-driven mode switch (q.<field>=1 or a POST /price file marks an upload),
        // exactly as the job parser does, so the quote resolves the same route (Transitions i2v, UGC Ad t2v / i2v with a product image, Relight edit).
        const G = (tool as any)?.app?.gallery as { base: string; locked: Record<string, string>; modeWhenFile: Record<string, string> | null } | undefined;
        const AP = await import('../tools/apps.js');
        if (tool) { const bad = enumParamError(tool, q); if (bad) { reply.code(400); return { ...bad, ...quoteDefs(), valid: false, credits: null, priceAvailable: false }; } } // DP #20.1: the user's own values first (an app's locks must not hide a bad aspect)
        { const fb = AP.appFieldQuoteError(tool, q); if (fb) { reply.code(400); return { ...fb, ...quoteDefs(), valid: false, credits: null, priceAvailable: false }; } } // BH12: Relight lightX/lightY both or neither, in range (same as submit)
        if (G) Object.assign(q, AP.appQuoteParams(tool, q)); // locks, defaults, file-driven mode switch + the engine that mode picks (tools/apps.ts, same as submit)
        const isH3 = tool?.id === 'h3-video' || G?.base === 'h3-video'; const isAudio = !!tool && (AUDIO_TOOLS.includes(tool.id) || AUDIO_TOOLS.includes(String(G?.base ?? '')));
        const asked0 = (isQuote ? q.model : q.provider) || null; const D = tool ? toolDefaults(tool, { mode: requestMode(tool, q) }) : null; // B6 + DP #27: always name preferred/default/defaultFallback (also on ?provider= quotes)
        let model = asked0 || D?.defaultProvider || (tool ? (await import('../providers.js')).toolProviders(tool)[0]?.id : undefined);
        if (tool && !asked0 && isAudio) { const alt = lyricsFreeDefault(tool, requestMode(tool, q), q, model); if (alt) model = alt; } // music with no lyrics: not a lyrics-only default (same as submit)
        if (tool && !asked0 && draftOn(q)) { const alt = draftCapableDefault(tool, requestMode(tool, q), model); if (alt) model = alt; } // draft on: Auto skips models with no draft mode (same as submit)
        if (tool && !isQuote && !q.provider && q.route && q.route !== 'auto') { const own = toolProviders(tool).find((p) => routesFor(p.id, tool).some((r) => r.routeId === q.route)); if (own && !routesFor(model ?? '', tool).some((r) => r.routeId === q.route)) model = own.id; } // ?route= alone: the model that owns that route (same as submit)
        if (tool) { const bad = enumParamError(tool, q); if (bad) { reply.code(400); return { ...bad, ...quoteDefs(), valid: false, credits: null, priceAvailable: false }; } } // Oct 19 #7: same allowlist as submit; never echo a bad value
        // BH10 P2 #21: clip-length-priced tools (a required source video) quoted before the clip is loaded. ?example=<id> or ?sample=/samples/<clip>
        // → the sample's real length (and size) so the first quote is the final one; otherwise the quote says it assumed DEFAULT_DURATION.
        let clipEstimate: Record<string, any> | null = null;
        let batchQ: ((c: number | null, list?: number | null) => Record<string, any>) = () => ({}); // dp30 (d): Re-shoot batch angles → angleCount + perAngleCredits
        if (tool?.id === 'reshoot') { const R = await import('../tools/reshoot.js'); const ac = R.angleCountOf(q.angleCount);
          if (ac == null) { reply.code(400); return { error: R.ANGLE_COUNT_ERROR, code: 'invalid', field: 'angleCount', allowed: [...R.RESHOOT_ANGLE_COUNTS], valid: false, credits: null, priceAvailable: false }; }
          const per = (v: number | null | undefined) => (v == null ? null : Math.round((v / ac) * 100) / 100);
          batchQ = (c, list) => ({ angleCount: ac, perAngleCredits: per(c), perAngleListCredits: per(list ?? c) }); } // bh12 (4): the real per-angle list price (a sample run charges 0)
        else if (G && (G as any).perOutput) { const sc = Math.max(1, Number(q.n) || 1); const per = (v: number | null | undefined) => (v == null ? null : Math.round((v / sc) * 100) / 100); // Shots: n angles × one image
          batchQ = (c, list) => ({ shotCount: sc, perShotCredits: per(c), perShotListCredits: per(list ?? c) }); }
        if (tool && (q.seconds == null || q.seconds === '') && (q.duration == null || q.duration === '') && (tool.inputs ?? []).some((i: any) => i.name === 'video' && i.required === true)) {
          const { EXAMPLES } = await import('../examples.js'); const src = q.example ? EXAMPLES.find((e) => e.id === q.example)?.video : q.sample;
          const pr = src && /^\/samples\/[\w/.-]+\.(mp4|webm|mov)$/.test(src) && !src.includes('..') ? await (await import('../media.js')).probe(path.join(SAMPLES_DIR, src.slice('/samples/'.length))) : null;
          if (pr?.duration) { q.seconds = String(Math.round(pr.duration * 100) / 100); if (!(Number(q.width) > 0) && pr.width && pr.height) { q.width = String(pr.width); q.height = String(pr.height); } clipEstimate = { estimated: false, clipSeconds: Number(q.seconds), clipSource: src }; }
          else { const { DEFAULT_DURATION } = await import('../shared/pricing.js'); clipEstimate = { estimated: true, assumedSeconds: DEFAULT_DURATION, estimateReason: 'clip_not_loaded', estimateMessage: `Estimate for ${(await import('../shared/userText.js')).withArticle(DEFAULT_DURATION)} s clip; the exact price shows once your clip is loaded.` }; }
        }
        if (tool) { const lang = AP.translateJob(tool, { ...q, types: q2types(q) || q.types }); if (lang) { const pinned = !!(isQuote ? q.model : q.provider); const tr = AP.translateRoute(lang, pinned ? model ?? null : null, toolProviders(tool).map((p) => p.id)); // Oct 18 #6: same rule as submit
          if ('error' in tr) { reply.code(400); return { ...tr, ...quoteDefs(), valid: false, credits: null, priceAvailable: false }; } if (tr.provider) model = tr.provider; } }
        let camBlock: any = null; // Oct 19 b2 (BH P3 #7): a Camera move that needs a start image the quote doesn't have → a priced input block (submit keeps 400 image_required)
        if (tool?.id === 'camera') { // Oct 18 #4: Camera Moves quote = submit. Auto + an H3-only move → H3 Camera Motion; no start image → the same text-capable pick or the
          // same 400 image_required as submit, also when a model is chosen (it no longer quotes a price the job would refuse); a move the chosen model can't run → the same 400 unsupported
          const us = ((all: string[]) => (model && !asked0 ? [model, ...all.filter((x) => x !== model)] : all))((await import('../providers.js')).toolProviders(tool).map((p) => p.id)); let ty = AP.parseTypesField(q2types(q)).map(AP.cameraMoveId); const pinned = !!(isQuote ? q.model : q.provider); // B6: us = default first (submit walks the same list)
          // No move sent → the model's first move (same as submit), so the no-image / preset checks see what the job will run
          if (!ty.length && model) { const dm = AP.cameraDefaultMove(model); if (dm) { ty = [dm]; q.types = JSON.stringify([dm]); } }
          if (!pinned && ty.length) { const pp = AP.cameraPresetProvider(ty, us); if (pp) model = pp; }
          const dr = (await import('../tools/h3/videoCaps.js')).resolveDuration('camera', model ?? '', q.seconds ?? q.duration); // a bad length reports first, as on submit
          const noImage = !q.image && !q.refs;
          if (noImage && ty.length && model && AP.cameraImageRequired(model, ty) && !(dr && 'error' in dr)) { const alt = AP.cameraTextProviders(ty, us);
            if (!pinned && alt[0]) model = alt[0];
            else { const body = AP.cameraImageRequiredBody(ty, pinned ? model : null, pinned ? (AP.cameraApp.providers ?? us) : us);
              if (AP.cameraPresetOff(ty, model)) { reply.code(400); return { ...body, ...quoteDefs(), valid: false, credits: null, priceAvailable: false }; } // the model can't run the move at all: nothing to price (same 400 as submit)
              camBlock = body; q.image = '1'; } } // priced as the job with its image; flagged below
          const off = model && ty.length && !(dr && 'error' in dr) ? AP.cameraPresetOff(ty, model) : null;
          if (off) { reply.code(400); return { ...AP.presetUnsupportedBody(AP.cameraApp.presets ?? [], off, model!), ...quoteDefs(), valid: false, credits: null, priceAvailable: false }; } }
        if (tool && model) { const ab = AP.aspectForProviderError(tool, model, q.aspect || q.aspectRatio); if (ab) { reply.code(400); return { ...ab, ...quoteDefs(), valid: false, credits: null, priceAvailable: false }; } } // BH12: per-engine aspect, same rule as submit
        if (tool && model && VUP_TOOLS.has(G?.base ?? tool.id)) { // Video Upscale: the same size / mode refusal as submit (a clip already at the size, Topaz 720p, 60 fps), in plain words
          const vi = vupSizing(model, { types: q.mode ? [q.mode] : q.types ? AP.parseTypesField(q.types) : ['precise'] }, { ...q, width: Number(q.width) || undefined, height: Number(q.height) || undefined });
          const why = vupBlock(model, vi); if (why) { const code = /already/.test(why) ? 'already_at_target' : 'unsupported'; const field = /mode/.test(why) ? 'types' : 'maxOutput';
            reply.code(400); return { error: `${why}.`, errorType: 'validation', code, issues: [{ code, field, message: `${why}.` }], ...quoteDefs(), valid: false, credits: null, priceAvailable: false }; } }
        if (tool && model) { let resMapped: { from: string; to: string; message: string } | null = null;
          // Task 7: a Create Image quote with no quality prices the model's default tier, as the submit does (checkImageCaps): GPT Image 2 quoted
          // its low tier ($0.01) while the job charged medium. The payload's quality is the generic '720p' default there, not a tier.
          const imgTier = (G?.base ?? tool.id) === 'create-image' && !q.quality && !q.tier && capsFor(model)?.qualityTiers.length ? capsFor(model)!.defaultTier ?? undefined : undefined; if (imgTier) q.tier = imgTier; // the route views below read q.tier
          const input: Record<string, any> = { bytes: Number(q.bytes) || (q.text ? Buffer.byteLength(String(q.text)) : q.prompt ? Buffer.byteLength(String(q.prompt)) : undefined), chars: Number(q.chars) || (q.text ? String(q.text).length : q.prompt ? String(q.prompt).length : undefined) /* TTS quote by script length (= charge) */, resolution: q.quality || q.resolution || (tool as any).app?.defaultResolutionByProvider?.[model ?? ''] || '720p', duration: Number(q.seconds ?? q.duration) || (Number(q.speechSeconds) > 0 && /lipsync/.test(String(q.mode ?? q.types ?? '')) ? Math.min(15, Math.max(2, Math.round(Number(q.speechSeconds)))) /* talking photo: the clip follows the speech, as the job parser sets it */ : undefined), draft: /^(1|true|on)$/i.test(q.draft ?? ''), n: Number(q.n ?? q.count) || 1, imageResolution: payload.imageResolution ?? q.imageResolution, tier: imgTier ?? payload.quality ?? q.tier, types: q.mode ? `["${q.mode}"]` : q.types, outKind: (G?.base ?? tool.id) === 'create-image' ? 'image' : undefined, text: q.text, prompt: q.prompt, promptBytes: q.promptBytes /* GPT Image bills prompt text: the bar sends its length */, aspect: q.aspect, mode: q.mode, ...(Number(q.speechSeconds) > 0 ? { speechSeconds: Number(q.speechSeconds) } : {}) /* Talking photo: the speech length */, ...(q.smooth48 != null && q.smooth48 !== '' ? { smooth48: String(q.smooth48) } : {}), ...(q.loop != null && q.loop !== '' ? { loop: String(q.loop) } : {}) /* LTX-2.5 DFR: the 48 fps pass is priced; with Loop it runs at 720p (shared/ltxDfr.ts) */, ...(q.split != null && q.split !== '' ? { split: /^(1|true|on|yes)$/i.test(String(q.split)) } : {}) /* Talking Video: speech over 60 s in parts */, ...((G?.base ?? tool.id) === 'h3-extend' && Number(q.seconds) > 0 ? { sourceSeconds: Number(q.seconds) } : {}) /* Extend: the clip's length (H3 local / fal take 4 s and up) */, refVideoSeconds: Number(q.refVideoSeconds) || undefined, angleCount: tool.id === 'reshoot' ? Number(q.angleCount) || undefined : undefined /* dp30 (d) */,
            audio: q.audio != null && q.audio !== '' ? /^(1|true|on|yes)$/i.test(q.audio) : isH3 ? ((await import('../tools/h3/videoCaps.js')).limitsFor(model)?.audio.default ?? undefined) : undefined };
          if (Array.isArray((q as any).__snapNotes)) { const SN = await import('../shared/snap.js'); for (const n of (q as any).__snapNotes) SN.addAdjustNote(input, n); } // D5: Create Image settings snapped by the caps check (tools/apps.ts imageCapsQuoteError)
          for (const k of ['detail', 'texture', 'faces'] as const) if (q[k]) input[k] = String(q[k]); // 3D: the price key's settings (three-d routeInput)
          Object.assign(input, extendQuoteFields(q)); // Extend: method / guide length / seconds as the job keeps them (Comfy Cloud LTX bills guide vs continuation differently; quote = charge)
          Object.assign(input, swapQuoteFields(q)); // Video Swap: Person / Object, who or what to replace, the click (the route checks read them, quote = submit)
          if (q.variantId) input.variantId = String(q.variantId); if (q.downloadWeights) input.downloadWeights = /^(1|true|on|yes)$/i.test(String(q.downloadWeights)); // HW-SHAPES Q7 / Q4
          if (tool.id === 'camera' && !input.types) { const dm = cameraDefaultMove(model); if (dm) input.types = `["${dm}"]`; } // Oct 19 #2: no move asked → the model's first move (same as the route listing)
          if (tool.id === 'make-it-real') { const RM = await import('../shared/renderModels.js'); const sec = Number(q.seconds ?? q.duration); if (sec > 0) input.duration = RM.renderBillSeconds(model ?? '', sec); input.clipSeconds = sec > 0 ? sec : undefined; } // Render: each model's own whole-second lengths (shared/renderModels.ts); the billed seconds (Ray: 5 / 10), as the job
          else if (tool.id === 'reshoot' && Number(q.seconds ?? q.duration) > 0) input.duration = Number(q.seconds ?? q.duration); // Re-shoot: seconds = the source clip's length (the Video bar sends it), never a model length to check; submit takes the clip as it is (tools/reshoot.ts, Veo snaps its own 4 / 6 / 8 s), so the quote prices the same clip
          else { const VC = await import('../tools/h3/videoCaps.js'); const durTool = AP.durToolOf(tool) ?? tool.id; const rs = VC.resolveDuration(durTool, model, q.seconds ?? q.duration, q.resolution || (VC.RES_LIKE.test(String(q.quality ?? '')) ? q.quality : undefined)); // ONE duration rule, same as job submit (per resolution: Veo 3.1 1080p = 8 s)
            if (rs && 'error' in rs) { reply.code(400); return { ...VC.durationErrorBody(rs, q.seconds != null && q.seconds !== '' ? 'seconds' : 'duration'), ...quoteDefs(), valid: false, credits: null, priceAvailable: false }; }
            // a source clip's length is not a setting: a clip too short is never 'snapped' longer (it can't be lengthened); Fit to model / the route refuse it in plain words
            const srcClip = (tool.inputs ?? []).some((i: any) => i.name === 'video' && i.required === true) && !!rs && !('error' in rs) && !!rs.snapped && rs.snapped.from < rs.seconds;
            if (rs && srcClip) input.duration = rs.snapped!.from; else if (rs) { input.duration = rs.seconds; VC.noteSnap(input, rs); } else if (G && AP.appDefaultDuration(tool, model)) input.duration = AP.appDefaultDuration(tool, model); else if (VC.hasToolDurations(durTool)) input.duration = VC.defaultDurationFor(durTool, model); } // Director / Camera Moves / Photo FX: same default as the job parser
          if (tool.id === 'image-upscale') { const IU = await import('../shared/imageUpscale.js'); const sc = IU.upscaleScaleOf(q); if (sc && Number.isFinite(sc)) { input.scale = sc; input.types = [`x${sc}`]; } // per-MP prices bill the output size (quote = charge)
            const w = Number(q.width), h = Number(q.height); if (w > 0 && h > 0 && input.scale) { input.sourceSize = { width: w, height: h }; input.outputSize = IU.upscaleOutSize(w, h, input.scale); } }
          if ((tool as any).app?.scales) { const { upscaleOutputSize } = await import('../shared/pricing.js'); const a: any = (tool as any).app; const sc = q.scale ? Number(q.scale) : a.defaultScale ?? a.scales[0]; input.scale = sc; input.types = [q.mode || 'precise']; input.duration = Number(q.seconds ?? q.duration) || undefined;
            if (Number(q.width) > 0 && Number(q.height) > 0) { input.inputSize = { width: Number(q.width), height: Number(q.height) }; const tl = (await import('../tools/apps.js')).upscaleTargetLong(q); const mo = a.outputTargets ? a.outputTargets[q.maxOutput || Object.keys(a.outputTargets)[0]] : null; const o = upscaleOutputSize(Number(q.width), Number(q.height), sc, tl != null && tl >= 720 ? tl : mo ?? a.maxLongSide ?? 3840); /* same cap as the job (targetLongEdge / target / maxOutput) */ input.outputSize = { width: o.width, height: o.height }; const sw = Number(q.width), sh = Number(q.height); if (VUP_TOOLS.has(G?.base ?? tool.id)) { vupSizing(model, input, { ...q, width: sw, height: sh }); o.width = input.outputSize.width; o.height = input.outputSize.height; } /* Video Upscale: the model's own size rule */ clipEstimate = { ...(clipEstimate ?? {}), estimated: !!clipEstimate?.estimated, sizeEstimated: false, sourceSize: { width: sw, height: sh }, sourceResolution: `${Math.min(sw, sh)}p`, scale: sc, outputSize: { width: o.width, height: o.height } }; /* Oct 18 #8 + Oct 19 #1: a real clip size is not assumed: sourceSize / outputSize / scale like ?sourceResolution= */ }
            else { // BH P2 + Oct 18 #3: no source size (no clip, or seconds without width/height, e.g. the Pricing calculator) → assume a 720p 16:9 source (or ?sourceResolution=480p|1080p…) so the estimate follows the selected scale and output cap (maxOutput / targetLongEdge)
              const rh = Number(String(q.sourceResolution ?? '').match(/^(\d{3,4})p$/i)?.[1]) || 720; const rw = Math.round((rh * 16) / 9 / 2) * 2;
              const tl = (await import('../tools/apps.js')).upscaleTargetLong(q); const mo = a.outputTargets ? a.outputTargets[q.maxOutput || Object.keys(a.outputTargets)[0]] : null; const o = upscaleOutputSize(rw, rh, sc, tl != null && tl >= 720 ? tl : mo ?? a.maxLongSide ?? 3840);
              input.inputSize = { width: rw, height: rh }; input.outputSize = { width: o.width, height: o.height };
              if (VUP_TOOLS.has(G?.base ?? tool.id)) { vupSizing(model, input, { ...q, width: rw, height: rh }); o.width = input.outputSize.width; o.height = input.outputSize.height; }
              const secs = clipEstimate?.estimated ? clipEstimate.assumedSeconds : null; const W = (await import('../shared/userText.js')).withArticle;
              if (/^\d{3,4}p$/i.test(String(q.sourceResolution ?? ''))) { // Oct 18 #8: the caller gave the source size → it is not assumed; only missing seconds keep the quote an estimate
                clipEstimate = { ...(clipEstimate ?? {}), estimated: secs != null, sizeEstimated: false, sourceSize: { width: rw, height: rh }, sourceResolution: `${rh}p`, scale: sc, outputSize: { width: o.width, height: o.height },
                  ...(secs != null ? { estimateMessage: `Estimate for ${W(secs)} s clip (${rh}p source ${vupHow(model, input, sc)}, ${o.width}×${o.height} out); the exact price shows once your clip is loaded.` } : {}) };
              } else { clipEstimate = { ...(clipEstimate ?? {}), estimated: true, sizeEstimated: true, ...(clipEstimate?.estimated ? {} : { estimateReason: 'source_size_unknown' }) };
              Object.assign(clipEstimate, { assumedSize: { width: rw, height: rh }, assumedResolution: `${rh}p`, assumedScale: sc, assumedOutputSize: { width: o.width, height: o.height },
                estimateMessage: secs != null ? `Estimate for ${W(secs)} s ${rh}p clip ${vupHow(model, input, sc)} (${o.width}×${o.height} out); the exact price shows once your clip is loaded.` : `Estimate for a ${rh}p source ${vupHow(model, input, sc)} (${o.width}×${o.height} out); the exact price shows once your clip is loaded.` }); } } }
          if (isH3) { const VL = (await import('../tools/h3/videoCaps.js')).limitsFor(model); // resolution follows the model's own tiers (videoCaps resolutions)
            if (VL) { const { resolveResolution, defaultSecondsFor, resolutionMap, snapResolution } = await import('../tools/h3/videoCaps.js'); resMapped = resolutionMap(VL, q.resolution, q.quality);
              { const sr = snapResolution(VL, q.resolution, q.quality); if (sr) { q.resolution = sr.to; if (RES_Q.test(String(q.quality ?? ''))) delete q.quality; (await import('../shared/snap.js')).addAdjustNote(input, sr.note); } } // D5: the nearest tier, with a note (same as submit)
              const rr = resolveResolution(VL, q.resolution, q.quality); input.resolution = rr ?? VL.resolutions[0];
              if (!(Number(input.duration) > 0)) input.duration = defaultSecondsFor(VL); // no seconds/duration asked → the same default the job parser uses (cloud-h3 quoted 8 s = 64 while the job charged 6 s = 48)
              if (rr === null) { reply.code(400); return { error: `Resolution must be one of ${VL.resolutions.join(', ')} for this model.`, errorType: 'validation', issues: [{ code: 'unsupported', field: 'resolution', message: `Resolution must be one of ${VL.resolutions.join(', ')}.` }], resolutions: VL.resolutions, ...quoteDefs(), credits: null, priceAvailable: false }; } } }
          // uploads the job will carry (q.image=1 / q.refs=<n> / POST /price file markers): routes that need a reference image (Klein edit-image) are judged the same way as on submit
          { const nr = refCount(q.refs); if (nr > 0) input.refPaths = Array.from({ length: nr }, (_, k) => `quote:ref${k}`); const m0 = (() => { try { const t = JSON.parse(String(q2types(q))); return Array.isArray(t) ? String(t[0] ?? '') : String(t); } catch { return String(q2types(q)).split(',')[0]; } })();
            if (q.image && !/^(generate|t2v|)$/.test(m0)) input.imagePath = 'quote:image';
            if (m0 && input.mode == null) input.mode = m0; // route checks that read input.mode (Replicate r2v needs public URLs) judge the quote like the job
            if (m0 === 'keyframes' && !input.keyframePaths) { const nk = refCount(q.keyframes); if (nk > 0) input.keyframePaths = Array.from({ length: nk }, (_, k) => `quote:keyframe${k}`); } // Keyframes: the frames on the bar (keyframes=<n>), so a model's frame limit refuses on the quote as on submit
            if (m0 === 'r2v' && !input.refPaths) { const n = (q.image ? 1 : 0) + (q.presenterImage ? 1 : 0) + refCount(q.refs); if (n) input.refPaths = Array.from({ length: n }, (_, k) => `quote:ref${k}`); }
            /* reference videos / sounds on the bar (refVideos / refAudios counts: shared/refFit.ts attachParams): route checks see them as on submit (Reference mode only) */
            if (m0 === 'r2v') { const RK0: any = isH3 ? (await import('../tools/h3/videoCaps.js')).limitsFor(model)?.refKinds ?? null : null; // the clips this model sends (the bar keeps the rest, marked "Not used")
              const nv = Math.min(refCount(q.refVideos), RK0 ? RK0.video ?? 0 : Infinity), na = Math.min(refCount(q.refAudios), RK0 ? RK0.audio ?? 0 : Infinity);
              /* each clip's seconds (refVideoSecondsEach / refAudioSecondsEach, "5,3.2"), else the total split evenly: the length checks judge them as on submit */
              const each = (list: unknown, total: unknown, n: number) => { const l = String(list ?? '').split(',').map(Number).filter((x) => x > 0); return l.length >= n ? l.slice(0, n) : Number(total) > 0 ? Array.from({ length: n }, () => Number(total) / n) : []; };
              if (nv > 0 && !input.refVideoPaths) { input.refVideoPaths = Array.from({ length: nv }, (_, k) => `quote:video${k}.mp4`); input.refVideoSecondsEach ??= each(q.refVideoSecondsEach, q.refVideoSeconds, nv); }
              if (na > 0 && !input.refAudioPaths) { input.refAudioPaths = Array.from({ length: na }, (_, k) => `quote:audio${k}.mp3`); input.refAudioSecondsEach ??= each(q.refAudioSecondsEach, q.refAudioSeconds, na); } } } // r2v: every image upload is a reference (UGC Ad presenter + product), as on submit // generate / t2v ignore an image, as the job parser does
          // Fit to model (shared/videoFit.ts): the clip's size / fps / container and the fit choice (pad | crop | off) from the bar (width, height = the
          // clip's own pixels, as Upscale reads them), so the route check refuses what the free fix can't mend and the price follows a trim, as on submit.
          let vfPlan: ReturnType<typeof videoFitFor> = null;
          if (tool.inputs?.some((x: any) => x.name === 'video') && Number(q.width) > 0 && Number(q.height) > 0) {
            Object.assign(input, { width: Number(q.width), height: Number(q.height), fit: fitModeOf(q.fit), ...(Number(q.fps) > 0 ? { fps: Number(q.fps) } : {}), ...(q.videoFormat ? { videoFormat: String(q.videoFormat).toLowerCase() } : {}) });
            vfPlan = videoFitFor(tool.id, model, input); if (vfPlan?.trimTo && Number(input.duration) > vfPlan.trimTo) input.duration = vfPlan.trimTo; }
          const pl = resolveRoute(tool, model, input, Number(q.passes) || 1, { route: q.route, allowFallback: q.allowFallback, runOn: mreq?.runOn && mreq.runOn !== 'auto' ? mreq.runOn : undefined, allowRoutes: mreq?.allowRoutes ?? null, modelKey: mreq?.modelKey ?? null }); // P0: same resolver as POST /jobs (step 2: + runOn / the model's routes, from the same resolveModelRequest the submit uses)
          const FB = await import('./fallback.js'); const mf = q.requestedModel ? FB.modelFallbackFor(tool, model, q.requestedModel, await FB.requestedCreditsFor(tool, String(q.requestedModel), input, Number(q.passes) || 1)) : null; // model-fallback notice
          const defs = D ? { preferredProvider: D.preferredProvider, defaultProvider: D.defaultProvider, defaultFallback: D.defaultFallback } : quoteDefs(); // B6 + DP #27: also on ?provider= quotes
          const mfOf = (rid: string | null | undefined) => { const rr = rid ? findRoute(rid) : undefined; const ro = rr ? runOnOfRoute(rr) : null; return { modelKey: ('error' in pl ? null : pl.routing.modelKey) ?? (rid && !mreq?.allowRoutes ? routeModelKey(tool.id, model!, rid, input) /* an old engine id: the model of the route quoted (provider=comfy-seedvr2&runOn=local = SeedVR2 3B) */ : null) ?? mreq?.modelKey ?? modelKeyOf(tool.id, model!, input), runOn: ro, runOnLabel: ro ? RUN_ON_LABELS[ro] : null, ...(rr ? routeModelFields(rr) : {}) }; }; // step 2: model + run-on on every quote
          // h3-video quotes: perSecond (per-second routes only) and eta (measured / published range, else null), from the route that runs;
          // audio quotes (audio / voice / soundtrack + apps): perUnit (second / minute / 1k_chars / 1k_bytes / run, from the charge's row) and eta
          const blockCam = (r0: Record<string, any>) => { const rd = r0.routeId ? findRoute(String(r0.routeId)) : undefined; const r: Record<string, any> = { ...r0, ...(vfPlan ? { videoFit: videoFitQuote(vfPlan) } : {}) /* Fit to model: the bar's note and two-choice preview */, exactUsd: rd ? routeExactUsd(tool!, rd, input, Number(q.passes) || 1) : null /* the routed price before rounding (Comfy credits shown from it) */, ...mfOf(r0.routeId), ...(isH3 ? videoQuoteFields(r0, rd?.priceInput ? rd.priceInput(input) : input) /* the rate of the job as the route bills it (LTX-2.5 DFR: 48 / 24 fps, or 720p) */ : isAudio ? audioQuoteFields(tool!.id, r0, input) : {}), ...(r0.priceRef && HOSTED_BY_ID[String(r0.priceRef)]?.upTo ? { upTo: true, upToNote: HOSTED_BY_ID[String(r0.priceRef)]!.upTo } : {}) /* the bill follows the real output (Image to layers): '≈ up to' */ }; if (!camBlock) return r; const { unavailableReason: _u, ...rest } = r; // same shape as the other input blocks (Oct 19 #8)
            return { ...rest, runnable: false, chargeable: false, priceAvailable: rest.credits != null, valid: false, reasonCode: 'input_blocked', blockedCode: 'input_blocked', blockedReason: noCharged(camBlock.error), blockedField: 'image', missingInput: 'image', submitCode: 'image_required', textProviders: camBlock.textProviders ?? [] }; };
          if ('error' in pl) { // can't run right now (no key / route refused): still show the asked route's REAL price, flagged, never 0 as the price
            const { status, routes, ...np } = pl as any; const opts: any[] = routes ?? [];
            const pin = !q.route && !mreq?.runOn ? savedPinOf(tool, model, input, mreq?.allowRoutes ?? null)?.route : undefined; const pinOpt = pin && pin !== 'auto' ? opts.find((o) => o.routeId === pin && !o.available) : undefined; // saved pin that can't run → quote THAT route + why (same 409 the job gets), not a cloud price
            const runOnAsked = mreq?.runOn && mreq.runOn !== 'auto' && !q.route ? opts.find((o) => o.routeId === (pl as any).routeId) : undefined; // step 2: the run-on's route that can't run
            // Run on: nothing ready and no place asked for → nothing is pre-selected: no place, no price (setupOptions lists what each place takes)
            const noneReady = (!q.route || q.route === 'auto') && !runOnAsked && !pinOpt && np.errorType === 'no_provider';
            const asked = noneReady ? null : (q.route && opts.find((o) => o.routeId === q.route)) || runOnAsked || pinOpt || [...opts].filter((o) => o.kind !== 'local' && o.credits != null && !o.reason?.includes('coming soon') && !routesFor(model, tool).find((r) => r.routeId === o.routeId)?.comingSoon).sort((a, b) => (Number(!!b.configured) - Number(!!a.configured)) || a.credits - b.credits)[0] || opts.find((o) => o.kind === 'local') || null; // a place whose key is set first (its own reason: H3 on Comfy Router refusing 30 s of speech, not 'add a fal key'), then the cheapest priced cloud route (what Auto picks once a key is set), else local (0 = free, really)
            const list = asked?.credits ?? null; const needsKey = !!np.needsKey || asked?.reasonCode === 'key_missing';
            // Oct 18 #2: only a missing key keeps the price in `credits` (the price once the key is added; quote-refs contract). Any other reason the route can't run
            // (not_wired, coming soon, unreachable, a job the route refuses) is not chargeable: credits null, priceAvailable false, listCredits = the list price, priceLine says why.
            // Oct 19 #8: an input block (the job's mode / a missing input, reasonCode input_blocked) is not a pricing problem: the real price stays, chargeable:false, blockedReason says what to change.
            const inputBlocked = !needsKey && asked?.reasonCode === 'input_blocked' && list != null;
            const credits = needsKey || inputBlocked ? list : null; const why = np.reasonCode === 'local_only_unreachable' ? np.message /* a local-only model, no ComfyUI: set one up (never a key) */ : asked ? (asked.reason === NOT_WIRED_REASON ? notWiredSentence(asked.label) : asked.reason ? `${asked.label} can't run this job. ${reasonSentence(asked.reason)}` : null) : null;
            const keyRoute = asked?.reasonCode === 'key_missing'; const line = needsKey ? (!keyRoute ? String(np.message ?? noCharged(np.error)) : list != null ? `Needs a ${keyOwnerOf(asked?.envKey)} key. Price once it's added: ≈ ${usd(list)}.` : `Needs a ${keyOwnerOf(asked?.envKey)} key.`) : `${why ?? 'This route can\'t run this job.'}${list != null && list > 0 ? ` List price ≈ ${usd(list)}.` : ''}`;
            const npQ = { ...np, error: noCharged(np.error) }; // a quote charges nothing by definition: no 'Nothing was charged' in quote text (the 409 / 402 on submit keeps it)
            return blockCam({ ...payload, ...defs, ...(clipEstimate ?? {}), ...routeFlags(asked?.kind, list, asked?.label), ...unitFields(asked?.priceRef, payload.hosted), ...(resMapped ? { resolutionMapped: resMapped, resolution: resMapped.to } : {}), credits, ...batchQ(credits, list), ...(isQuote ? { perImage: credits == null ? null : credits / Math.max(1, Number(input.n) || 1) } : {}), priceAvailable: (needsKey || inputBlocked) && credits != null, chargeable: false, runnable: false, route: asked?.routeId ?? null, routeId: asked?.routeId ?? null, demo: false, demoMessage: null, priceRef: asked?.priceRef ?? null, routeKind: asked?.kind ?? null,
              needsKey, setup: np.setup ?? null, setupOptions: np.setupOptions ?? [], listCredits: list, priceLine: inputBlocked ? priceLine(asked?.kind, list, false) : line, ...(needsKey ? { keyMissing: true, ...(keyRoute ? { keyOwner: keyOwnerOf(asked?.envKey) } : {}) } : inputBlocked ? { blockedReason: why ?? noCharged(np.error), blockedCode: 'input_blocked' } : { unavailableReason: why ?? noCharged(np.error) }), reason: noCharged(pinOpt ? np.error : asked?.reason ?? np.error), ...(asked?.reasonCode ? { reasonCode: asked.reasonCode } : np.reasonCode ? { reasonCode: np.reasonCode } : {}), ...(np.localOnly ? { localOnly: true } : {}), ...(pinOpt ? { pinned: pinOpt.routeId, pinnedUnavailable: true } : {}), noProvider: npQ, valid: false, fallback: FB.planNotice(undefined, model, asked?.routeId ?? null, credits, mf), ...(asked?.kind === 'local' && asked?.fit ? hwBlock(tool, model, input, { fit: asked.fit }) : {}) });
          }
          const c = pl.routing.prices[pl.first.routeId] ?? payload.credits; const n = Math.max(1, Number(input.n) || 1);
          const mName = providerLabels(tool.id, model).displayName;
          const dm = pl.routing.demo && pl.first.kind !== 'local' ? { routeLabel: demoLabel(pl.first, mName), demoLabel: demoLabel(pl.first, mName), demoTag: DEMO_TAG, keyNeededForRealRuns: pl.first.wired !== false, keyOwner: keyOwnerOf(pl.first.envKey), demoReason: pl.first.wired === false ? `${routeName(pl.first, mName)} isn’t ready in this app yet. You’ll get a sample for now; nothing is billed.` : demoReason(keyOwnerOf(pl.first.envKey)) + '.' }
            : { routeLabel: routeName(pl.first, mName) }; // BH12: a keyless default says plainly it is a sample run and which key real runs need
          return blockCam({ ...payload, ...defs, ...dm, routeTier: pl.first.tier ?? null, routeTierLabel: pl.first.tierLabel ?? null, ...(clipEstimate ?? {}), ...routeFlags(pl.first.kind, c, pl.first.label), ...unitFields(pl.first.priceRef, payload.hosted), ...(resMapped ? { resolutionMapped: resMapped, resolution: resMapped.to } : {}), credits: c, ...batchQ(c, pl.first.listCredits ?? c), priceAvailable: true, chargeable: !pl.routing.demo && c > 0, runnable: true, needsKey: false, ...(isQuote ? { perImage: c / n } : {}), route: pl.first.routeId, priceRef: pl.first.priceRef ?? null, routeKind: pl.first.kind, routing: { mode: pl.routing.mode, order: pl.routing.order }, routeId: pl.first.routeId, ...(pl.routing.demo ? { listCredits: pl.first.listCredits ?? null } : {}), demo: !!pl.routing.demo, demoMessage: pl.routing.demo ? DEMO_MESSAGE : null, demoNotice: pl.routing.demo ?? null, fallback: FB.planNotice(pl.routing, model, pl.first.routeId, c, mf), ...((nt) => (nt.length ? { adjustNotes: nt, warnings: nt } : {}))(adjustNotesById(tool, pl.first.routeId, { ...input, prompt: input.prompt ?? q.prompt })), // 2026-10-28: a job run adjusted (length rounded, speech trimmed, prompt cut) says so
            localRun: pl.first.kind === 'local', priceLine: priceLine(pl.first.kind, c, !!pl.routing.demo, pl.first.listCredits), ...(pl.routing.demo && pl.first.kind !== 'local' ? demoFlags(pl.first.kind, pl.first.listCredits) : {}), ...localNote(tool, model, pl), ...(pl.first.kind === 'local' ? quoteHw(tool, model, input, pl) : {}), setup: pl.first.kind === 'local' ? placeAction(tool, model, input, pl.first) : pl.routing.demo ? placeAction(tool, model, input, pl.first) : null });
        }
      }
      const jm = url.match(/^\/api\/jobs\/([^/]+)$/);
      if (jm && payload && typeof payload === 'object' && !Array.isArray(payload)) { const j = jobs.get(jm[1]); if (j?.routing) return { ...payload, ...jobRouteFields(j) }; }
      /* GET /api/tools: enrichTools runs once per build of the shared copy (toolsCache.ts), not here */
    } catch { /* never break the listing */ }
    return payload;
  });
}
