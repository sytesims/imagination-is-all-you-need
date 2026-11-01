/**
 * Route selection. auto = the pre-selected place: the first READY place in the order Comfy → other API (fal, Replicate, BFL…) → Local
 * (user decision 2026-10-22); on the mock backend with no key, a free sample. Nothing ready → nothing is pre-selected (never a download).
 * pinned = that route only; fallback order appended only when allowFallback.
 */
import { config } from '../config.js';
import { env } from '../env.js';
import { priceOf, outputMegapixels, priceMode, promptBytesFor } from '../shared/pricing.js';
import { upscaleOutMegapixels } from '../shared/imageUpscale.js';
import { HOSTED_BY_ID } from '../shared/hostedPrices.js';
import { openWeightsOnly, getProvider, comfyCloudOpen } from '../providers.js';
import type { ToolDef } from '../tools/types.js';
import { routesFor, findRoute, tierOf, tierLabel } from './routes.js';
import { routerModelOfRoute, refsSent } from './routerModels.js';
import { keyConfigured, keyValue } from './keys.js';
import { getPrefs, toolPinOf } from './prefs.js';
import { modelKeyOf, findToolModel, catalogueName, routeModelKey, routeLimitsOf } from './modelRegistry.js';
import { promptLimitIssue, promptCutNote } from '../shared/promptRefs.js';
import { runOnOfRoute, normRunOn, RUN_ON_LABELS, aKey, type RunOn } from '../shared/modelIds.js';
import { providerSettings } from './settings.js';
import { keyOwnerOf } from '../shared/keyOwners.js';
import { routeRunnable, CLOUD_RUNNER_ROUTES, UNMEASURED_PRICE_REASON, allowUnmeasuredCloud, NOT_WIRED_REASON, notWiredSentence, LOCAL_UNREACHABLE_REASON, TOO_HEAVY_REASON, OPEN_WEIGHTS_ONLY_REASON, NO_PRICE_REASON, modesReason, reasonSentence } from './runnable.js';
import type { RouteDef, RouteOption, JobRouting } from './types.js';
import { localReachable } from '../hardware.js';
import { visiblePlaces } from './hiddenPlaces.js';
import { fitFor, findVariant, variantRunnable, tooHeavyWarning, weightsGate } from '../hardware/requirements.js';
import { MAC_WEIGHTS_REASON } from '../hardware/macWeights.js';
import { mediaIssue } from '../mediaHandoff.js';
import { routeOff, ROUTE_OFF_REASON } from './routeOff.js';
import { videoFitBlock } from '../shared/videoFit.js';
import { toolModes } from './defaults.js';

/** Local ComfyUI available? Q5 (Oct 19): a real check. mock backend → yes (mock render). comfy backend → hardware.ts localReachable(): a cached
 * (30 s) /system_stats check of the ComfyUI address with a 1.5 s timeout, so an empty or Comfy Cloud address never counts as a local ComfyUI.
 * OPENHIGGSFIELD_LOCAL_AVAILABLE=0|1 overrides; tests use setLocalAvailable() (or hardware.ts setComfyReachableOverride()). */
let localOverride: boolean | null = null;
export const setLocalAvailable = (v: boolean | null) => { localOverride = v; };
export function localAvailable(): boolean {
  if (localOverride != null) return localOverride;
  const v = env('LOCAL_AVAILABLE'); if (v != null && v !== '') return /^(1|true|on|yes)$/i.test(v);
  return (config.backend === 'mock' || config.backend === 'comfy') && localReachable();
}
/** What this install can run on, in one word (setups-routing 2026-10-29), the one source every pick, sheet and label reads:
 *  cloud = a Comfy key (Comfy Cloud + Comfy Router), no ComfyUI · local = your own ComfyUI, no Comfy key · both · none = neither.
 *  Other provider keys (fal, BFL…) don't change it; they only open their own places. */
export type SetupKind = 'cloud' | 'local' | 'both' | 'none';
export function setupKind(): SetupKind {
  const cloud = keyConfigured('COMFY_API_KEY'); const local = localAvailable();
  return cloud && local ? 'both' : cloud ? 'cloud' : local ? 'local' : 'none';
}
/** No Comfy key and no ComfyUI on the real backend: Generate asks to connect one (the user's option a, 2026-10-29), never a sample.
 *  The mock backend (development and tests) keeps its free samples. */
export const needsConnection = () => config.backend !== 'mock' && setupKind() === 'none';
export const NO_CONNECTION = { code: 'no_connection' as const, title: 'Connect a Comfy key or your ComfyUI to start',
  message: 'Nothing ran and nothing was charged. Paste a Comfy key, or point the app at your ComfyUI, then press Generate again.' };
/** HW-SHAPES B3: the compact fit a local route carries on every option (full requirements ride on quotes, /api/routes and /api/models). */
export function localFit(tool: ToolDef, r: RouteDef, input: Record<string, any> = {}) {
  try { const f = fitFor(tool, r.modelId, input); return { verdict: f.verdict, reasonCode: f.reasonCode, hardwareReasonCode: f.hardwareReasonCode, reason: f.reason, tier: f.tier, enforced: f.enforced, lighterVariantAvailable: f.lighterVariantAvailable,
    recommendedVramGB: f.recommendedVramGB, effectiveVramGB: f.effectiveVramGB, etaSeconds: f.etaSeconds, eta: f.eta, etaRange: f.etaRange, missingBytes: f.missingBytes, missingBytesSource: f.missingBytesSource, downloadId: f.downloadId, diskFreeBytes: f.diskFreeBytes, blockers: f.blockers, vramFreeHint: f.vramFreeHint, ...(f.variant ? { variant: f.variant } : {}) }; }
  catch { return null; }
}
/** types may be an array, a JSON array string, or a plain/comma string ("edit", as in GET ?types=edit): all three name the same mode, so quote and submit pick the same route. */
const jobMode = (input: Record<string, any>) => { let t: any = input.types;
  if (typeof t === 'string') { try { t = JSON.parse(t); } catch { t = t.split(',').map((x: string) => x.trim()).filter(Boolean); } }
  return Array.isArray(t) && t.length ? String(t[0]) : typeof t === 'string' && t ? t : input.mode ?? input.type ?? 'generate'; };
/** The priceOf result routeCredits rounds (one call, so the exact USD and the credits come from the same input). */
function routePriceOf(tool: ToolDef, r: RouteDef, input: Record<string, any>, passes: number) {
  if (r.priceInput) input = r.priceInput(input); // the job as this route bills it (one rule for quote and charge)
  const nCap = Number((tool.app as any)?.gallery?.perOutput?.max) || 4; // Shots: one image per angle (up to 9), each priced; Create Image n stays 1–4
  return priceOf({ toolId: tool.id, rates: tool.gpuSecPerSec, refVideoSec: Number(input.refVideoSeconds) || 0, quality: input.resolution, durationSec: input.duration, provider: r.priceRef ?? undefined, draft: !!input.draft, passes: input.outKind === 'image' ? passes : Math.max(1, passes / Math.min(nCap, Math.max(1, Number(input.n) || 1))), count: Array.isArray(input.shots) && input.shots.length ? input.shots.length : Math.min(nCap, Math.max(1, Number(input.n) || 1)) /* rounded per output × n; n taken back out of passes */, audio: input.audio === true /* Create Image n: per image × n */, tier: input.tier ?? null, imageRes: input.imageResolution, aspect: typeof input.aspect === 'string' ? input.aspect : null, promptBytes: promptBytesFor(input), bytes: Number(input.bytes) > 0 ? Number(input.bytes) : typeof input.text === 'string' ? Buffer.byteLength(input.text) : typeof input.prompt === 'string' && (tool.id.includes('voice') || input.mode === 'voice') ? Buffer.byteLength(input.prompt) : undefined, chars: Number(input.chars) > 0 ? Number(input.chars) : typeof input.text === 'string' ? input.text.length : typeof input.prompt === 'string' && (tool.id.includes('voice') || input.mode === 'voice') ? input.prompt.length : undefined, megapixels: outputMegapixels(input), mode: priceMode(input),
    refImages: (() => { const spec = routerModelOfRoute(r.routeId); return spec ? refsSent(spec, input) : r.refsPriced?.(input) ?? 0; })(), outMegapixels: tool.id === 'image-upscale' ? upscaleOutMegapixels(input) : undefined /* per-MP upscale prices: the output size (quote = charge) */ /* per-reference prices count what the Router body sends */ });
}
/** The routed price in USD before rounding to whole credits (billing.ts shows Comfy credits from it, rounded up); null when the credits carry
 *  something else (reshoot angles, route add-ons) or the row has no exact figure. */
export function routeExactUsd(tool: ToolDef, r: RouteDef, input: Record<string, any> = {}, passes = 1): number | null {
  if (!r.priceRef || (tool.id === 'reshoot' && Math.round(Number(input.angleCount)) > 1) || (r.extraCredits?.(input) ?? 0) > 0) return null;
  const p = routePriceOf(tool, r, input, passes); return p.basis === 'hosted' && typeof p.exactUsd === 'number' ? p.exactUsd : null;
}
/** Credits for this route and job (same priceOf as the Generate button). */
export function routeCredits(tool: ToolDef, r: RouteDef, input: Record<string, any> = {}, passes = 1): number | null {
  if (!r.priceRef) return 0;
  { const ac = Math.round(Number(input.angleCount)); if (tool.id === 'reshoot' && ac > 1) { const one = routeCredits(tool, r, { ...input, angleCount: 1 }, Math.max(1, passes / ac)); return one == null ? null : one * ac; } } // dp30 (d): N × the one-angle price (quote passes 1, submit passes N)
  const p = routePriceOf(tool, r, input, passes);
  return p.basis === 'unavailable' ? null : p.credits + (r.extraCredits?.(input) ?? 0); // extraCredits: route add-ons (OpenSoul cloud upscale)
}
/** I2: the user-facing name of the account a key belongs to (UI copy never names env vars; the env name stays in reasonDetail). */
export const keyOwner = keyOwnerOf;
/** Routes on the user's own Comfy deployment (envKey COMFY_DEPLOY_URL, comfy/deploy.ts): what is missing is the deployment, not a key (the Comfy key may well be set). */
export const DEPLOY_URL_ENV = 'COMFY_DEPLOY_URL';
export const DEPLOY_SETUP_REASON = 'Needs your own Comfy deployment (one-time setup in your Comfy account). Set it up in Connections → Your Comfy deployment';
const isDeployOpt = (o: { routeId: string; envKey?: string | null }) => o.envKey === DEPLOY_URL_ENV || o.routeId.startsWith('comfy-deploy:');
/** "New angle · H3 CrossView · cloud" → "New angle": the short name a sentence starts with. */
const shortName = (name: string) => name.split(' · ')[0].trim() || name;
/** How the page names a deployment-only model in that sentence (Re-shoot's "New angle" card is H3 CrossView). */
const DEPLOY_LEAD: Record<string, string> = { 'minimax-h3-crossview': 'New angle' };
export const deployNeededError = (name: string) => `${shortName(name)} needs your own Comfy deployment (one-time setup in your Comfy account). Set it up in Connections → Your Comfy deployment. Nothing was charged.`;
export const keyMissingReason = (envKey?: string | null) => (envKey === DEPLOY_URL_ENV ? `${DEPLOY_SETUP_REASON}.` : `Add ${aKey(keyOwner(envKey))} in Settings → Connections.`);
/** True when the only thing stopping a route is its missing key. */
export const keyMissing = (o: Pick<RouteOption, 'reasonCode'>) => o.reasonCode === 'key_missing';
/** The prompt this job sends (the app's recipe text when it has one) is over the model's or the route's character cap: the plain reason, else null. */
const promptTooLong = (tool: ToolDef, r: RouteDef, input: Record<string, any>): string | null => {
  const text = [input.finalPrompt, input.hostedPrompt, input.prompt, input.text].find((x) => typeof x === 'string' && x) as string | undefined; if (!text) return null;
  const issue = promptLimitIssue(routeModelKey(tool.id, r.modelId, r.routeId, input), text, r.routeId); return issue ? `${issue}.` : null;
};
/** Notes for a job this route runs adjusted instead of refusing it (2026-10-28: never block a run over a rule we can meet by adjusting):
 *  the route's own adjustNote (a length rounded, speech trimmed) and a prompt the provider will cut (Wan 3.0). Shown on the quote and the job. */
export function adjustNotesFor(tool: ToolDef, r: RouteDef, input: Record<string, any> = {}): string[] {
  const out: string[] = []; const own = r.adjustNote?.(input); if (own) out.push(own);
  if (typeof input.adjustNote === 'string' && input.adjustNote && !out.includes(input.adjustNote)) out.push(input.adjustNote); // the job's own sizing note (Video Upscale: a size moved up, shared/videoUpscale.ts)
  if (Array.isArray(input.adjustNotes)) for (const n of input.adjustNotes) if (typeof n === 'string' && n && !out.includes(n)) out.push(n); // D5 (2026-10-28): a setting snapped to the nearest allowed value (shared/snap.ts)
  const text = [input.finalPrompt, input.hostedPrompt, input.prompt, input.text].find((x) => typeof x === 'string' && x) as string | undefined;
  const cut = text ? promptCutNote(routeModelKey(tool.id, r.modelId, r.routeId, input), text, r.routeId) : null; if (cut) out.push(cut);
  return out;
}
/** adjustNotesFor by route id (quote and submit only know the picked route's id). */
export const adjustNotesById = (tool: ToolDef, routeId: string | null | undefined, input: Record<string, any> = {}): string[] => { const r = routeId ? findRoute(routeId) : undefined; return r ? adjustNotesFor(tool, r, input) : []; };
export function option(tool: ToolDef, r: RouteDef, input: Record<string, any> = {}, passes = 1): RouteOption {
  const h = r.priceRef ? HOSTED_BY_ID[r.priceRef] : undefined; const credits = routeCredits(tool, r, input, passes);
  const configured = keyConfigured(r.envKey, r.envAliases);
  const local = r.kind === 'local';
  // no mode asked (a listing or quote without types): the tool's first mode, as its defaults read it (defaults.ts recommendedDefaults)
  const modeOk = !r.modes || r.modes.includes(input.types == null && input.mode == null && input.type == null ? toolModes(tool)[0] ?? jobMode(input) : jobMode(input));
  let reason: string | undefined; let inputBlock = false; let tooHeavy = false; // Oct 19 #8: the job's inputs (mode, missing image…) block this route, not a key or wiring
  const fit = local && !r.comingSoon ? localFit(tool, r, input) : null;
  if (r.comingSoon) reason = r.comingSoon;
  else if (local && !r.noComfy && !localAvailable()) reason = LOCAL_UNREACHABLE_REASON; // noComfy: ffmpeg-only routes (3D turntable) don't need ComfyUI
  else if (!local && openWeightsOnly() && tierOf(r) !== 0) reason = OPEN_WEIGHTS_ONLY_REASON; // Comfy Cloud open-weight workflows (tier 0, incl. B6 twins) count as open weights
  else if (!modeOk) { reason = modesReason(r.modes!); inputBlock = true; }
  else if (credits == null) reason = NO_PRICE_REASON;
  else if (r.unavailableFor?.(input)) { reason = r.unavailableFor(input)!; inputBlock = true; }
  else if (videoFitBlock(tool.id, r.modelId, input)) { reason = videoFitBlock(tool.id, r.modelId, input)!; inputBlock = true; } // Fit to model (shared/videoFit.ts): a clip the free fix can't make fit this model (too short, or Fit off)
  else if (mediaIssue(r, input)) { reason = mediaIssue(r, input)!; inputBlock = true; } // media hand-off: a file too big for this provider, or no way to send it (mediaHandoff.ts)
  else if (promptTooLong(tool, r, input)) { reason = promptTooLong(tool, r, input)!; inputBlock = true; } // prompt grammar: refused with the cap, never cut (shared/promptRefs.ts)
  else if (local && typeof input.variantId === 'string' && input.variantId && !variantOk(r, input.variantId)) { reason = VARIANT_BLOCK_REASON; inputBlock = true; } // Q7: a lighter version that can't run here
  else if (local && fit?.enforced && fit.verdict === 'too_heavy') { reason = fit.reasonCode === 'unsupported_weights' ? MAC_WEIGHTS_REASON : TOO_HEAVY_REASON; tooHeavy = true; } // Mac-blocked weights (hardware/macWeights.ts) say so in plain words // B3: Auto never picks it (a pin still runs it, with a warning: plan())
  else if (!configured) reason = keyMissingReason(r.envKey);
  else if (h?.priceUnmeasured && CLOUD_RUNNER_ROUTES.has(r.routeId) && !!keyValue(r) && !allowUnmeasuredCloud()) reason = UNMEASURED_PRICE_REASON; // a real run would bill unknown GPU time
  else if (r.kind === 'comfy-router' && routeOff(r.routeId)) reason = ROUTE_OFF_REASON; // Comfy Router refused it before running (not_enabled, routing/routeOff.ts): the same model's Comfy Cloud route runs instead
  else if (!routeRunnable(r) && (!r.envKey || !!keyValue(r))) reason = NOT_WIRED_REASON; // a real key is set, but only the mock executor exists: never Auto-picked, never charged (OPENHIGGSFIELD_MOCK_KEYS, the mock-backend simulation, stays as before)
  return { priceRef: r.priceRef, routeId: r.routeId, kind: r.kind, ...(r.vendor ? { vendor: r.vendor } : {}), label: r.label, endpoint: r.endpoint, credits, estimatedPrice: !!h?.estimated, priceSourceUrl: h?.sourceUrl ?? null, priceCheckedAt: h?.checkedAt ?? null,
    typicalLatencySec: r.typicalLatencySec, latencyEstimated: r.latencyEstimated, envKey: r.envKey, configured, available: !reason, ...(reason ? { reason } : {}), ...(reason && !configured && reason === keyMissingReason(r.envKey) ? { reasonCode: 'key_missing' as const, reasonDetail: `${r.envKey} not set` } : {}), ...(r.comingSoon ? { reasonCode: 'not_wired' as const, reasonDetail: `coming soon: ${r.comingSoon}` } : {}), ...(reason === NOT_WIRED_REASON ? { reasonCode: 'not_wired' as const, reasonDetail: 'no live connection for this route on this server yet' } : {}), ...(inputBlock ? { reasonCode: 'input_blocked' as const, reasonDetail: reason === VARIANT_BLOCK_REASON ? "the lighter version needs the ComfyUI-GGUF node on the connected ComfyUI" : 'the job inputs do not fit this route' } : {}), ...(tooHeavy ? { reasonCode: 'too_heavy' as const, reasonDetail: fit!.reason } : {}), ...(reason === ROUTE_OFF_REASON && !r.comingSoon /* coming-soon Router models share the words; they stay not_wired */ ? { reasonCode: 'route_not_enabled' as const, reasonDetail: 'Comfy Router answered not_enabled for this model; re-checked after 24 h' } : {}), ...(fit ? { fit } : {}), sourceUrl: r.sourceUrl, ...(r.caps ? { caps: r.caps } : {}), tier: tierOf(r), tierLabel: tierLabel(r), wired: routeRunnable(r), ...(r.twinProvider ? { twinOf: r.modelId, twinProvider: r.twinProvider } : {}) };
}
/** Bug Hunter #12: reachable (can we talk to local ComfyUI) is separate from enabled (Settings → Use local ComfyUI = global.useLocal). */
export function localState() {
  const reachable = localAvailable(); const enabled = getPrefs().global.useLocal;
  const status = !reachable ? 'unreachable' as const : enabled ? 'on' as const : 'off' as const;
  return { reachable, enabled, status, statusText: status === 'on' ? 'Reachable and on' : status === 'off' ? 'Reachable, but off' : 'Not reachable' }; // shape kept (strict clients); the tier is on GET /api/hardware
}
/** Models whose only (non-coming-soon) routes are local run locally even with Use local off (they count as a local pin). */
export const localOnlyModel = (modelId: string, tool?: ToolDef | null, input?: Record<string, any>, allow: string[] | null = null) => routesIn(modelId, tool, allow).filter((r) => !r.comingSoon && !twinHeld(r) && !(tool && input && twinBlocked(tool, r, input))).every((r) => r.kind === 'local');
/** A B6 twin marked heldUntilMeasured (routes.ts TWINS) whose Comfy Cloud price is not measured yet (2026-10-27, LTX-2.5 22B · Comfy Cloud): it can't run for real, so it never makes its model
 *  "not local-only" (the local place keeps working with Use local off, as before the twin) and is never the sample place ahead of local. Listed as usual. */
export const twinHeld = (r: { twinProvider?: string; priceRef?: string | null; heldUntilMeasured?: boolean }) => !!r.twinProvider && !!r.heldUntilMeasured && !!r.priceRef && !!HOSTED_BY_ID[r.priceRef]?.priceUnmeasured && !allowUnmeasuredCloud();
/** A B6 twin route that can't serve this job (Wan moves on the LTX twin): it doesn't count as a cloud route, so the model stays local-only for it. */
const twinBlocked = (tool: ToolDef, r: RouteDef, input: Record<string, any>) => !!r.twinProvider && option(tool, r, input).reasonCode === 'input_blocked';
/**
 * The pre-selected place for a model with no saved choice (Run on, 2026-10-22: replaces Auto; "auto" on the API means this). Order of places
 * (user decision 2026-10-22): Comfy (Comfy Cloud workflow, then Comfy Router / partner node) → a connected other API (fal, Replicate, BFL,
 * vendor; cheapest first) → Local (Use local ComfyUI on, or a local-only model / local pin, AND its files and custom nodes are here). So
 * Local is pre-selected only when it is the only ready place. Inside a place: the real price for this job, then latency. Nothing ready →
 * the mock backend's free sample (demo) → NOTHING ([]): a place that needs a download, a key or a switch is never pre-selected; the user
 * picks one from setupOptions (the setup card). The first entry is the place; the rest are listed for callers that ask (alternatives),
 * tried next when the first fails without charging and costs the same or less (D4, 2026-10-28; routing/run.ts), unless allowFallback=0.
 */
export function autoOrder(tool: ToolDef, modelId: string, input: Record<string, any> = {}, passes = 1, allow: string[] | null = null): RouteOption[] {
  // A model whose only (non-coming-soon) routes are local counts as a local pin: it runs locally even with useLocal off (rule: useLocal OR a local pin).
  const localOnly = localOnlyModel(modelId, tool, input, allow);
  // L1: a saved local pin is a runnable route for this model (it runs even with Use local off), so Auto uses it before any demo preview
  const savedPin = savedPinOf(tool, modelId, input, allow)?.route; const localPin = !!savedPin && routesIn(modelId, tool, allow).some((r) => r.routeId === savedPin && r.kind === 'local');
  const explicitLocal = getPrefs().global.useLocal; const useLocal = explicitLocal || localOnly || localPin;
  const all = routesIn(modelId, tool, allow).map((r) => option(tool, r, input, passes));
  // Run-on pre-selection (2026-10-22, replaces Auto): the first READY place in the order Comfy → a connected other API → Local (on, weights
  // and nodes present). A demo preview (mock backend, no key) only when nothing is ready. Nothing else: never a place that needs setup.
  const gpuReady = (o: RouteOption) => o.kind !== 'local' || (useLocal && !localSetupGate(tool, modelId, input));
  const tk = takesRank(modelId, input); // inside a place: the route that takes your settings first, then the old tier / price rule
  const real = all.filter((o) => o.available && !o.demo && (o.kind !== 'local' || useLocal) && gpuReady(o)).sort((a, b) => (placeRank(a) - placeRank(b)) || (tk(a) - tk(b)) || byTier(true)(a, b));
  if (real.length) return real;
  // a local route in the demo order runs locally (free); it still needs its files and nodes, else it is a download, never pre-selected
  const held = new Set(routesIn(modelId, tool, allow).filter(twinHeld).map((r) => r.routeId)); // an unmeasured Cloud twin is never pre-selected as a sample place (the model behaves as before the twin)
  const demo = demoOrder(all).filter((o) => o.kind !== 'local' || !localSetupGate(tool, modelId, input));
  return demo.filter((o) => !held.has(o.routeId));
}
/** 2026-10-27 (app-wide): inside one place, a route whose own limits take this job's size and length goes before one that doesn't (MiniMax H3
 *  at 480p: our open workflow before MiniMax's service, which makes 768p / 2K). 0 = takes it (or nothing known), 1 = doesn't. */
export const takesRank = (engine: string, input: Record<string, any>) => (o: { routeId: string }) => {
  const L = routeLimitsOf(engine, o.routeId); if (!L) return 0; const res = input.resolution != null ? String(input.resolution).toLowerCase() : ''; const d = Number(input.duration);
  if (res && L.resolutions?.length && !L.resolutions.some((x) => x.toLowerCase() === res)) return 1;
  return Number.isFinite(d) && d > 0 && L.durations?.length && !L.durations.includes(d) ? 1 : 0;
};
/** Run-on place order (user decision 2026-10-22: Comfy → other APIs → Local): 0, 1, 2. */
export const placeRank = (o: { kind: string; envKey?: string | null; vendor?: string | null }) => { const ro = runOnOfRoute(o); return ro === 'comfy-cloud' ? 0 : ro === 'local' ? 2 : 1; };
/** Pre-selection comparator: place, then (inside a place) the old tier / price / latency rule (a GPU route that fits before a slow one). */
export const byPlace = (a: RouteOption, b: RouteOption) => (placeRank(a) - placeRank(b)) || byTier(true)(a, b);
/** Local isn't ready when the model's files or custom nodes are missing (only checked where the weights gate is enforced: comfy backend). */
export const localSetupGate = (tool: ToolDef, modelId: string, input: Record<string, any> = {}) => { try { return weightsGate(tool, modelId, input); } catch { return null; } };
const byCost = (a: RouteOption, b: RouteOption) => ((a.credits ?? 0) - (b.credits ?? 0)) || ((a.kind === 'local' ? 0 : 1) - (b.kind === 'local' ? 0 : 1)) || (a.typicalLatencySec - b.typicalLatencySec);
/** B6 comparator: tier (local first when Use local is explicitly on), then price, then latency. Q3 (Oct 19): with Use local on, local routes
 *  that fit go first, then slow ones (they carry a 'slow on this computer' note); with it off, a slow local route sorts after a fitting one. */
const slowLocal = (o: RouteOption) => o.kind === 'local' && o.fit?.verdict === 'slow';
export const byTier = (localFirst = false) => (a: RouteOption, b: RouteOption) => { const t = (o: RouteOption) => (localFirst && o.kind === 'local' ? (slowLocal(o) ? -1 : -2) : (o.tier ?? 2) + (slowLocal(o) ? 0.5 : 0)); return (t(a) - t(b)) || byCost(a, b); };
/** Q7: a variantId on a local job must name a lighter version this route can really run (GGUF drop-in + UnetLoaderGGUF on the connected ComfyUI). */
export const VARIANT_BLOCK_REASON = "This lighter version can't run on the connected ComfyUI";
const variantOk = (r: RouteDef, id: string) => { const v = findVariant(id); return !!v && v.providers.includes(r.modelId) && variantRunnable(v); };
/** Mock or demo mode (OPENHIGGSFIELD_BACKEND=mock; off with OPENHIGGSFIELD_DEMO_AUTO=0): first load never looks broken. */
export const demoAuto = () => config.backend === 'mock' && env('DEMO_AUTO') !== '0';
/**
 * Mock/demo Auto when no route is set up: cloud first, so the cheapest priced cloud route whose only blocker is the missing key runs as a
 * labelled mock preview (the mock backend never calls a provider; credits = that route's quote, so route and price agree); a model with no
 * such cloud route uses its local route (mock render, 0 credits). A configured-but-refused route (blocker) or a coming-soon model stays as is.
 */
/** B6: a Cloud twin route that can't take this job's inputs (H3 workflow for r2v, LTX twin for a Wan move) is not a blocker: the model's other routes decide. */
const twinInputBlock = (o: RouteOption) => !!o.twinOf && o.reasonCode === 'input_blocked';
function demoOrder(all: RouteOption[]): RouteOption[] {
  if (!demoAuto() || all.some((o) => o.kind !== 'local' && o.configured && o.reason && !twinInputBlock(o))) return [];
  const mark = (o: RouteOption): RouteOption => asDemo(o);
  // B6: the preview shows the route that would run once keys exist: wired routes first (a key alone makes them real), then by tier and price
  const cloud = all.filter((o) => o.kind !== 'local' && o.credits != null && keyMissing(o)).sort((a, b) => (Number(b.wired !== false) - Number(a.wired !== false)) || byTier(false)(a, b));
  if (cloud.length) return cloud.map(mark);
  return all.filter((o) => o.kind === 'local' && o.available); // re-check 6 (BH P2): a local route is never a demo: it runs locally, free (status/reason 'local_auto' in the listing)
}
/** Demo contract (New Agent + DP, 2026-10-18): a demo preview is a mock run with sample output. It is FREE: credits 0 on the quote, 0 charged,
 *  no ledger debit; listCredits keeps the route's real price for display. Jobs and quotes carry demo:true + demoMessage. */
export const DEMO_MESSAGE = 'Sample output, nothing billed.';
export const asDemo = ({ reason: _r, ...o }: RouteOption): RouteOption => ({ ...o, available: true, demo: true, listCredits: o.credits, credits: 0 });
/** A cloud route whose only blocker is its missing key, priced, in demo mode: it can run as a labelled mock preview (Auto or explicitly chosen). */
export const demoKeyless = (o: RouteOption) => demoAuto() && o.kind !== 'local' && !o.configured && o.credits != null && keyMissing(o);
/** K2: what a local route does, in plain words (UI copy; no 'mock'). */
export const localRouteLine = (toolId?: string) => /extend/i.test(toolId ?? '') ? 'Extends your clip locally with open weights. Free.' : 'Runs locally with open weights. Free.';
export const demoNotice = (o: RouteOption, toolId?: string) => ({ code: 'demo_preview' as const, routeId: o.routeId,
  message: `${DEMO_MESSAGE} ${o.kind === 'local' ? localRouteLine(toolId) : `No key is set for ${o.label}, so nothing is sent to the provider.`}` });
/** Cloud providers that could serve this model (for the 'add an API key' prompt). */
export function keyProviders(modelId: string, tool?: ToolDef | null, allow: string[] | null = null) {
  const ids = new Set(routesIn(modelId, tool, allow).filter((r) => !r.comingSoon).map((r) => (r.kind === 'fal' ? 'fal' : r.kind === 'replicate' ? 'replicate' : r.kind === 'comfy-router' || r.kind === 'comfy-cloud' ? 'comfy' : r.kind === 'direct' ? providerSettings().find((p) => p.envKey === r.envKey)?.id : null)).filter((x): x is string => !!x));
  return providerSettings().filter((p) => ids.has(p.id)).map(({ id, name, envKey, keysUrl, docsUrl, configured }) => ({ id, name, envKey, keysUrl, docsUrl, configured }));
}
/** Calm structured state for "nothing is set up yet" (real mode, no keys): the UI shows a setup card, not an error. */
export interface NeedsProvider { state: 'needs_provider'; options: ('connect_key' | 'enable_local')[]; title: string; message: string }
export interface NoProvider extends NeedsProvider { error: string; detail?: string; errorType: 'no_provider'; status: 402; /** a key would make it run (false for a model with no cloud place: it never asks for a key) */ needsKey: boolean; /** runs only on your computer (no cloud place) */ localOnly?: boolean; /** local_only_unreachable: a local-only model while no ComfyUI answers */ reasonCode?: 'local_only_unreachable'; providers: ReturnType<typeof keyProviders>; localAvailable: boolean; localRoute: string | null; useLocal: boolean; routes: RouteOption[]; /** Run on: the place to set up first (its one action). */ setup?: SetupTarget | null; /** Every place that could be set up, in the pre-selection order (the setup card); none is pre-chosen. */ setupOptions?: SetupOption[] }
/** Model vs Run-on (spec §2.6): the clean model name for user copy (never an engine id), e.g. "MiniMax H3". */
export const modelNameFor = (tool: ToolDef, modelId: string): string => ((k) => findToolModel(tool, k) ? catalogueName(k) : null)(modelKeyOf(tool.id, modelId)) ?? (getProvider(modelId)?.name ?? modelId).replace(/\s*\(.*$/, '');
/** "Comfy Cloud or a fal key" from the providers whose key would run it (Comfy Cloud is named as itself, the others as "a <name> key"). */
const keyChoices = (ps: { id: string; name: string }[]) => { const w = ps.map((p) => (p.id === 'comfy' ? 'Comfy Cloud' : `a ${p.name.replace(/\s*\(.*$/, '')} key`)); return w.length > 1 ? `${w.slice(0, -1).join(', ')} or ${w.at(-1)}` : w[0] ?? ''; };
/** Run on: what a place that isn't ready needs, as one action (the chip, the menu row and Generate show it). */
export type SetupAction = 'turn_on' | 'download' | 'install_node' | 'add_key' | 'set_up_gpu';
export interface SetupTarget { runOn: RunOn; runOnLabel: string; routeId: string; action: SetupAction; actionText: string; missingBytes?: number | null; downloadId?: string | null; /** the Connections card to open when it isn't the run-on's key card ('deploy' = Your Comfy deployment) */ connection?: 'deploy' }
/** One row of the setup card: a place and what it takes. credits = the price per run once set up (Local: 0, free per run). */
export interface SetupOption extends SetupTarget { credits: number | null; slow?: boolean }
/** Short account names for "Add a … key". */
export const KEY_SHORT: Partial<Record<RunOn, string>> = { 'comfy-cloud': 'Comfy Cloud', fal: 'fal', replicate: 'Replicate', bfl: 'BFL', minimax: 'MiniMax', ltx: 'LTX', openai: 'OpenAI', google: 'Google', byteplus: 'BytePlus', dashscope: 'Alibaba Cloud', luma: 'Luma' };
export const gbText = (b?: number | null) => (b && b > 0 ? `${Math.max(0.1, Math.round(b / 1e8) / 10)} GB` : '');
/**
 * The places that could be SET UP when nothing is ready, one per place, in the pre-selection order: Comfy (Add a Comfy key) → another API
 * whose only gap is its key (cheapest first) → Local (reachable, not too heavy: Turn on when it's off, Download when its files are
 * missing, Install node when a custom node is missing). Routes that aren't connected on this server, or can't take this job, are never
 * listed. The user picks one (the setup card); none is pre-chosen, and nothing is downloaded without that click.
 */
export function setupOptions(tool: ToolDef, modelId: string, input: Record<string, any>, all: RouteOption[], allow: string[] | null = null): SetupOption[] {
  const soon = new Set(routesIn(modelId, tool, allow).filter((r) => r.comingSoon).map((r) => r.routeId));
  const localOn = getPrefs().global.useLocal || localOnlyModel(modelId, tool, input, allow);
  const out: SetupOption[] = []; const seen = new Set<string>();
  for (const o of all.filter((x) => x.kind !== 'local' && !soon.has(x.routeId) && x.wired !== false && x.reasonCode === 'key_missing' && x.credits != null).sort(byPlace)) {
    const ro = runOnOfRoute(o); if (seen.has(ro)) continue; const t = placeAction(tool, modelId, input, o, localOn); if (!t) continue; seen.add(ro); out.push({ ...t, credits: o.credits }); }
  for (const o of all.filter((x) => x.kind === 'local' && x.available && !soon.has(x.routeId)).sort(byTier(true))) {
    const t = placeAction(tool, modelId, input, o, localOn); if (t && t.action !== 'set_up_gpu') { out.push({ ...t, credits: 0, ...(o.fit?.verdict === 'slow' ? { slow: true } : {}) }); break; } }
  // other providers Comfy (or this computer) covers are not offered as a step, as in the model menu (routing/hiddenPlaces.ts; Show other providers brings them back)
  const keep = new Set(visiblePlaces(tool.id, modelKeyOf(tool.id, modelId, input), out.map((o) => ({ id: String(o.runOn), status: o.action === 'turn_on' ? 'off' : 'needs-key' /* an off GPU covers nothing, as in the menu */ }))).shown.map((r) => r.id));
  return out.filter((o) => keep.has(String(o.runOn)));
}
/** The first place to set up (setupOptions[0]), for callers that show one fix. null = nothing to set up. */
export function setupTarget(tool: ToolDef, modelId: string, input: Record<string, any>, all: RouteOption[], allow: string[] | null = null): SetupTarget | null {
  const o = setupOptions(tool, modelId, input, all, allow)[0]; if (!o) return null; const { credits: _c, slow: _s, ...t } = o; return t;
}
/** The one action that makes THIS place run (a saved choice that stopped working says it on the chip, with this fix). null = nothing to do here (ready, too heavy, or not connected on this server). */
export function placeAction(tool: ToolDef, modelId: string, input: Record<string, any>, o: RouteOption, localOn = true): SetupTarget | null {
  const ro = runOnOfRoute(o); const mk = (action: SetupAction, actionText: string, extra: Partial<SetupTarget> = {}): SetupTarget => ({ runOn: ro, runOnLabel: RUN_ON_LABELS[ro], routeId: o.routeId, action, actionText, ...extra });
  if (o.kind === 'local') {
    if (o.reason === LOCAL_UNREACHABLE_REASON) return mk('set_up_gpu', 'Set up GPU');
    if (!o.available) return null; // too heavy / can't take this job / coming soon
    if (!localOn) return mk('turn_on', 'Turn on');
    const g = localSetupGate(tool, modelId, input);
    if (g?.code === 'weights_missing') return mk('download', `Download ${gbText(g.missingBytes) || 'files'}`.trim(), { missingBytes: g.missingBytes || null, downloadId: g.downloadId || null });
    if (g?.code === 'nodes_missing') return mk('install_node', 'Install node');
    return null;
  }
  if ((o.reasonCode === 'key_missing' || o.demo) && isDeployOpt(o)) return mk('add_key', 'Set up your deployment', { connection: 'deploy' }); // the deployment is missing, not the Comfy key: Connections → Your Comfy deployment
  if (o.reasonCode === 'key_missing' || o.demo) return mk('add_key', `Add ${aKey(KEY_SHORT[ro] ?? RUN_ON_LABELS[ro])}`);
  return null;
}
/** The one sentence for a model that runs only on your computer while no ComfyUI answers (routing reason; preflight and pickers show it as is). */
export const localOnlyUnreachable = (name: string) => `Set up ComfyUI to run ${name} free: it runs only on your computer. Point the app at your ComfyUI in Settings → Your computer.`;
export function noProvider(tool: ToolDef, modelId: string, all: RouteOption[], input: Record<string, any> = {}, allow: string[] | null = null): NoProvider {
  const local = all.find((o) => o.kind === 'local'); const la = !!local && localAvailable();
  const providers = keyProviders(modelId, tool, allow); const name = modelNameFor(tool, modelId); // allow: only this model's places (H3 Max Extend is fal only, though its engine also has Router)
  const options: NeedsProvider['options'] = [...(providers.length ? ['connect_key' as const] : []), ...(la ? ['enable_local' as const] : [])];
  const needs = keyChoices(providers);
  const cloud = all.filter((o) => o.kind !== 'local'); const deployOnly = cloud.length > 0 && cloud.every(isDeployOpt) && !la; // H3 CrossView: only your own deployment can run it
  if (deployOnly) return { state: 'needs_provider', options, title: `Set up your Comfy deployment for ${DEPLOY_LEAD[modelKeyOf(tool.id, modelId, input)] ?? shortName(name)}`, message: `${DEPLOY_LEAD[modelKeyOf(tool.id, modelId, input)] ?? shortName(name)} runs on your own Comfy deployment: a one-time setup in your Comfy account, then add it in Connections → Your Comfy deployment.`,
    error: deployNeededError(DEPLOY_LEAD[modelKeyOf(tool.id, modelId, input)] ?? name), errorType: 'no_provider', status: 402, needsKey: true, providers, localAvailable: la, localRoute: null, useLocal: getPrefs().global.useLocal, routes: all, setup: setupTarget(tool, modelId, input, all, allow), setupOptions: setupOptions(tool, modelId, input, all, allow) };
  // setups-routing (2026-10-29): a model with no cloud place never asks for a key (YuE2 said "Add a key first"); with no ComfyUI answering it says to set one up
  const localOnly = !providers.length && !!local; const noGpu = localOnly && !la;
  // the local step, from the same placeAction the setup card and the model row read (2026-10-31: Wan 2.2 Animate's row said "Download 26.6 GB" while
  // this said "Turn it on": a local-only model runs with Use local off, so its files were the real step). One source: setupTarget.
  const step = la ? setupTarget(tool, modelId, input, all, allow) : null; const localStep = step?.runOn === 'local' ? step : null;
  const localDo = localStep?.action === 'download' ? `download its files${gbText(localStep.missingBytes) ? ` (${gbText(localStep.missingBytes)})` : ''}` : localStep?.action === 'install_node' ? 'install its add-on' : 'turn on Your computer';
  return { state: 'needs_provider', options, title: noGpu ? `Set up ComfyUI to run ${name} free` : `Choose where to run ${name}`,
    message: noGpu ? localOnlyUnreachable(name) : `${name} is ready once it has somewhere to run: ${[providers.length ? `connect ${needs}` : '', la ? localDo : ''].filter(Boolean).join(', or ') || 'nothing can run it in this setup'}.`,
    /* T6 (copy wave 1): a model that only runs on your computer never gets key advice */
    error: noGpu ? `${localOnlyUnreachable(name)} Nothing was charged.`
      : localOnly && localStep?.action === 'download' ? (tool.plugin?.user && localSetupGate(tool, modelId, input)?.message ? `${localSetupGate(tool, modelId, input)!.message} Nothing was charged.` /* a workflow you added: the files by name (workflowModels.ts) */
        : `${name} runs on your computer and needs its files first: Download ${gbText(localStep.missingBytes) || 'files'}. Nothing was charged.`)
      : localOnly && localStep?.action === 'install_node' ? `${name} runs on your computer and needs an add-on first. Install it in Settings → Your computer. Nothing was charged.`
      : localOnly ? `${name} runs on your computer. Turn it on in Settings → Your computer. Nothing was charged.`
      : !providers.length ? `Nothing can run ${name} here yet. Pick another model. Nothing was charged.`
      : `${name} needs ${needs}. Add it in Settings → Connections${la ? ', or run it on your computer' : ''}. Nothing was charged.`, errorType: 'no_provider', status: 402, needsKey: providers.length > 0,
    ...(localOnly ? { localOnly: true } : {}), ...(noGpu ? { reasonCode: 'local_only_unreachable' as const } : {}),
    providers, localAvailable: la, localRoute: la ? local!.routeId : null, useLocal: getPrefs().global.useLocal, routes: all, setup: setupTarget(tool, modelId, input, all, allow), setupOptions: setupOptions(tool, modelId, input, all, allow) };
}
export interface Plan { routing: JobRouting; first: RouteOption; options: RouteOption[] }
/** Routes of an engine on a tool, narrowed to the routes of the requested model (model registry splits, e.g. Camera comfy-open: Wan Fun Camera = local only). */
export const routesIn = (modelId: string, tool?: ToolDef | null, allow: string[] | null = null) => routesFor(modelId, tool).filter((r) => !allow || allow.includes(r.routeId));
/**
 * The best route of one account (runOn) for this job: runnable (non-demo) first in Auto's tier/price order, then a keyless demo preview, then any
 * (so a pinned account that can't run says why). Deterministic for the same input, so quote and submit agree.
 */
export function routeForRunOn(tool: ToolDef, modelId: string, input: Record<string, any>, runOn: RunOn, passes = 1, allow: string[] | null = null): RouteOption | null {
  const tk = takesRank(modelId, input); // the route of this place that takes your settings first (2026-10-27)
  const os = routesIn(modelId, tool, allow).filter((r) => !r.comingSoon && runOnOfRoute(r) === runOn).map((r) => option(tool, r, input, passes)).sort((a, b) => (tk(a) - tk(b)) || byTier(runOn === 'local')(a, b));
  // a Router route that answered not_enabled (routing/routeOff.ts) is passed over while another route of this model at the place exists
  const live = os.filter((o) => o.reasonCode !== 'route_not_enabled'); const pool = live.length ? live : os;
  return pool.find((o) => o.available && !o.demo) ?? pool.find((o) => demoKeyless(o)) ?? pool.find((o) => o.reasonCode !== 'input_blocked') ?? pool[0] ?? null;
}
/**
 * The saved choice for (tool, engine) (MODEL-ROUTE-SPEC step 2): the explicit perTool[tool][model] entry first; else an old per-engine pin
 * (perModel[engine]), applied only where it means this model: its route must serve this engine on this tool (or be 'auto'). A route id no
 * tool serves any more stays (plan() reports it as pin_invalid, as before). runOn pins resolve to that account's best route for this job.
 */
export function savedPinOf(tool: ToolDef, modelId: string, input: Record<string, any> = {}, allow: string[] | null = null): { route: string; allowFallback?: boolean; runOn?: RunOn | 'auto'; source: 'tool' | 'legacy' } | undefined {
  const prefs = getPrefs(); const mk = modelKeyOf(tool.id, modelId, input); const e = toolPinOf(prefs, tool.id, mk);
  if (e) { const ro = e.runOn ? normRunOn(e.runOn) : null;
    if (e.route && e.route !== 'auto') return { route: e.route, allowFallback: e.allowFallback, runOn: ro ?? undefined, source: 'tool' };
    if (ro && ro !== 'auto') { const o = routeForRunOn(tool, modelId, input, ro, 1, allow); return o ? { route: o.routeId, allowFallback: e.allowFallback, runOn: ro, source: 'tool' } : undefined; }
    return { route: 'auto', allowFallback: e.allowFallback, runOn: 'auto', source: 'tool' }; }
  const l = prefs.perModel[modelId]; if (!l?.route) return undefined;
  if (l.route === 'auto' || routesFor(modelId, tool).some((r) => r.routeId === l.route) || !findRoute(l.route)) return { route: l.route, allowFallback: l.allowFallback, source: 'legacy' };
  return undefined; // the engine's pin was made for another tool (e.g. the Camera twin route): it doesn't apply here (no cross-tool leak)
}
/** P0 + step 2: everything a request says about where to run (route / runOn / the model's routes). Quote and submit pass the same object. */
export interface RouteRequest { route?: string | null; allowFallback?: string | boolean; runOn?: string | null; allowRoutes?: string[] | null; modelKey?: string | null }
/** P0 (BUG-HUNT-7): job-shape fields a tool's parser always sets (fixed mode, its own duration/resolution) applied to ANY routing input,
 *  so a quote built from query params and a submit built by parseInput resolve the same route. Idempotent on parsed job input. */
export function routeInput(tool: ToolDef, input: Record<string, any>): Record<string, any> {
  const fx = tool.routeInput; return fx ? { ...input, ...fx(input) } : input;
}
/** P0 (BUG-HUNT-7): the ONE route resolver. GET /price (routing/http.ts quote hook), POST /jobs (index.ts submit, partial-groups check)
 *  and retry all call this with the same inputs: tool, model, routing input, passes, request route / allowFallback; plan() reads the saved pin,
 *  open-weights-only mode, provider keys and the Use-local toggle itself. */
export function resolveRoute(tool: ToolDef, modelId: string, input: Record<string, any>, passes = 1, req: RouteRequest = {}): PlanResult {
  return plan(tool, modelId, routeInput(tool, input), passes, req);
}
export type PlanResult = Plan | NoProvider | { error: string; errorType: 'validation' | 'routing'; status: number; routes?: RouteOption[] };
/** Resolve request field > per-model saved choice > global default. */
export function plan(tool: ToolDef, modelId: string, input: Record<string, any>, passes = 1, req: RouteRequest = {}): PlanResult {
  const allow = req.allowRoutes?.length ? req.allowRoutes : null;
  // The job's model is the one the route that runs serves: a request that named a model keeps it (its routes are `allow`); an old engine id with no
  // model (provider=comfy-seedvr2: SeedVR2 on fal or SeedVR2 3B locally) is named by the route Auto picked, so a local 3B run never shows as the fal model.
  const tag = (r: PlanResult): PlanResult => { if (!('error' in r)) Object.assign(r.routing, { modelKey: (allow ? req.modelKey : null) ?? routeModelKey(tool.id, modelId, r.first.routeId, input), runOn: runOnOfRoute(r.first), ...(allow ? { allowRoutes: allow } : {}) }); return r; };
  // Step 2: runOn on the request = that account's best route for this job ('auto' = Auto, ignoring a saved choice). route beats runOn.
  let reqRoute = req.route ? String(req.route).trim() : '';
  if (!reqRoute && req.runOn) { const ro = normRunOn(req.runOn);
    if (!ro) return { error: `runOn must be "auto" or a run-on id. Nothing was charged.`, errorType: 'validation', status: 400, routes: routesIn(modelId, tool, allow).map((r) => option(tool, r, input, passes)) };
    if (ro === 'auto') reqRoute = 'auto';
    else { const o = routeForRunOn(tool, modelId, input, ro, passes, allow);
      if (!o) return { error: `${getProvider(modelId)?.name ?? modelId} doesn't run on ${RUN_ON_LABELS[ro]} for ${tool.name}. Pick another place. Nothing was charged.`, errorType: 'validation', code: 'run_on_unavailable', status: 400, routes: routesIn(modelId, tool, allow).map((r) => option(tool, r, input, passes)) } as any;
      reqRoute = o.routeId; } }
  return tag(planInner(tool, modelId, input, passes, { ...req, route: reqRoute || undefined }, allow));
}
function planInner(tool: ToolDef, modelId: string, input: Record<string, any>, passes: number, req: RouteRequest, allow: string[] | null): PlanResult {
  const prefs = getPrefs(); const saved = savedPinOf(tool, modelId, input, allow);
  const want = (req.route || saved?.route || prefs.global.mode || 'auto').trim();
  // D4 (user decision 2026-10-28): the PRE-SELECTED place (Auto) moves on to the next ready place that costs the same or less when it fails
  // without charging (routing/run.ts failedAttemptNotCharged); a dearer one asks first. A place the user picked (route / runOn / a saved choice)
  // never moves on its own unless the request sets allowFallback=1. allowFallback=0 turns it off for Auto too. Saved allowFallback values are ignored.
  const afAsked = req.allowFallback != null && req.allowFallback !== '' ? /^(1|true|on|yes)$/i.test(String(req.allowFallback)) : null; const af = afAsked ?? false;
  const all = routesIn(modelId, tool, allow).map((r) => option(tool, r, input, passes));
  const prices = Object.fromEntries(all.filter((o) => o.credits != null).map((o) => [o.routeId, o.credits!]));
  if (all.length && all.every((o) => o.reason && routesIn(modelId, tool, allow).find((r) => r.routeId === o.routeId)?.comingSoon)) // coming-soon model (FLUX 3 Upscaler): never runs, never charges
    return { error: `${tool.name}: this model is coming soon. ${reasonSentence(all[0].reason!)} Nothing was charged.`, errorType: 'routing', status: 409, routes: all };
  if (want === 'auto') {
    const order = autoOrder(tool, modelId, input, passes, allow);
    const blocker = all.find((o) => o.kind !== 'local' && o.configured && o.reason && !twinInputBlock(o)); // key is set, but this job can't run there (e.g. FLUX 3 Upscaler 60 fps)
    // Oct 27 (InfiniteTalk, speech over 60 s): no key yet, but every place of a cloud-only model refuses this input: say why, not 'add a key' (a key would not help)
    { const cl = all.filter((o) => o.kind !== 'local'); if (!order.length && !blocker && cl.length && cl.length === all.length && cl.every((o) => o.reasonCode === 'input_blocked' && o.reason))
      return { error: `${reasonSentence(cl[0].reason!)} Nothing was charged.`, errorType: 'validation', status: 409, routes: all }; }
    if (!order.length && blocker) return { error: blocker.reason === NOT_WIRED_REASON ? `${notWiredSentence(blocker.label)} Nothing was charged.` : `${blocker.label} can't run this job. ${reasonSentence(blocker.reason!)} Nothing was charged.`, errorType: 'routing', status: 409, routes: all, setup: setupTarget(tool, modelId, input, all, allow), setupOptions: setupOptions(tool, modelId, input, all, allow) } as PlanResult; // Run on: the place to set up that could take this job
    { const th = all.find((o) => o.kind === 'local' && o.reasonCode === 'too_heavy'); // B3: a local-only model that is too heavy here: say so (409 too_heavy), not 'add a key'
      if (!order.length && th && !all.some((o) => o.kind !== 'local' && !routesIn(modelId, tool, allow).find((r) => r.routeId === o.routeId)?.comingSoon))
        return { error: th.fit?.reasonCode === 'unsupported_weights' ? `${getProvider(modelId)?.name ?? 'This model'} ${MAC_WEIGHTS_REASON.replace(/^Needs/, 'needs')}. Pick another model or run it in the cloud. Nothing was charged.` : `${getProvider(modelId)?.name ?? 'This model'} is too heavy for your computer. ${reasonSentence(String(th.fit?.reason ?? ''))} Pick it in Run on to try anyway, or use another model. Nothing was charged.`, errorType: 'routing', code: 'too_heavy', status: 409, routes: all, charged: false, calm: true, fit: th.fit } as any; }
    { // a model that only runs locally, whose local route refuses this job here (SeedVR2 3B on a Mac: NVIDIA only): say why (409, the same answer
      // as picking that route), never 'add a key' and never another model's cloud route
      const lb = !order.length && !all.some((o) => o.kind !== 'local' && !routesIn(modelId, tool, allow).find((r) => r.routeId === o.routeId)?.comingSoon)
        ? all.find((o) => o.kind === 'local' && o.reasonCode === 'input_blocked' && o.reason) : undefined;
      if (lb) return { error: `${lb.label} can't run this job. ${reasonSentence(lb.reason!)} Nothing was charged.`, errorType: 'routing', code: 'route_not_runnable', routeId: lb.routeId, setup: placeAction(tool, modelId, input, lb), reason: lb.reason, status: 409, routes: all,
        charged: false, userMessage: `${lb.label} can't run this job here. Nothing was charged.`, calm: true } as any; }
    if (!order.length) { // no cloud route set up: a saved local pick still runs locally (rule: useLocal OR a local pin), never 'add an API key'
      const lp = saved?.route ? all.find((o) => o.routeId === saved.route && o.kind === 'local' && o.available) : undefined;
      if (lp) return { routing: { modelId, mode: 'pinned', allowFallback: false, order: [lp.routeId], prices }, first: lp, options: all };
      return noProvider(tool, modelId, all, input, allow);
    }
    if (order[0].demo) for (const o of order) prices[o.routeId] = 0; // demo previews are free (quote 0 = charge 0)
    const autoAf = (afAsked ?? true) && !order[0].demo; // samples never move on (they cost nothing and run nowhere)
    return { routing: { modelId, mode: 'auto', allowFallback: autoAf, order: (autoAf ? order : order.slice(0, 1)).map((o) => o.routeId), prices, ...(order[0].demo ? { demo: demoNotice(order[0], tool.id) } : {}) }, first: order[0], options: all };
  }
  const r = routesIn(modelId, tool, allow).find((x) => x.routeId === want) ?? findRoute(want); // the model's own copy first (Auto-reframe and Luma Reframe share route ids)
  if (!r || r.modelId !== modelId || (allow && !allow.includes(r.routeId))) { // step 2: a route outside the requested model's routes doesn't serve it
    if (!req.route) { // stale saved pin for another model → auto (reported as a fallback notice: pin_invalid)
      const p2 = planInner(tool, modelId, input, passes, { route: 'auto', allowFallback: req.allowFallback }, allow);
      if (!('error' in p2)) p2.routing.planFallback = { code: 'pin_invalid', requestedRoute: want, message: `Your saved choice (${RUN_ON_LABELS[runOnOfRoute(findRoute(want) ?? { kind: String(want).split(':')[0] })] ?? 'a place'}) can’t run ${modelNameFor(tool, modelId)} any more, so it runs on ${RUN_ON_LABELS[runOnOfRoute(p2.first)]}.` };
      return p2; }
    return { error: `route ${want} does not serve ${modelId}. Routes: ${all.map((o) => o.routeId).join(', ')}`, errorType: 'validation', status: 400, routes: all };
  }
  const o = all.find((x) => x.routeId === r.routeId)!;
  // Demo mode (mock backend): an explicitly chosen keyless cloud route runs as a labelled mock preview of that route, at its own quote (route and price agree; nothing is sent).
  if (!o.available && o.kind !== 'local' && !o.configured && keyMissing(o) && demoKeyless(o)) {
    const d: RouteOption = asDemo(o); prices[d.routeId] = 0; // free
    return { routing: { modelId, mode: 'pinned', allowFallback: false, order: [d.routeId], prices, demo: demoNotice(d, tool.id) }, first: d, options: all };
  }
  if (!o.available && o.kind !== 'local' && !o.configured && keyMissing(o) && isDeployOpt(o)) return { ...noProvider(tool, modelId, all, input, allow), setup: placeAction(tool, modelId, input, o), error: deployNeededError(DEPLOY_LEAD[modelKeyOf(tool.id, modelId, input)] ?? modelNameFor(tool, modelId)), detail: `${r.envKey} not set`, routeId: r.routeId } as NoProvider;
  if (!o.available && o.kind !== 'local' && !o.configured && keyMissing(o)) return { ...noProvider(tool, modelId, all, input, allow), setup: placeAction(tool, modelId, input, o), error: `${modelNameFor(tool, modelId)} is set to run on ${RUN_ON_LABELS[runOnOfRoute(r)]}, but there’s no ${keyOwner(r.envKey)} key. Add it in Settings → Connections, or pick another place in Run on. Nothing was charged.`, detail: `${r.envKey} not set`, routeId: r.routeId } as NoProvider;
  // Q2 (Oct 19): a pinned (saved or route=) too_heavy local route still runs, with a loud warning on the quote and the job; nothing switches silently
  if (!o.available && o.reasonCode === 'too_heavy' && o.fit && o.fit.reasonCode !== 'unsupported_weights') { const warning = tooHeavyWarning(o.fit as any, getProvider(r.modelId)?.name ?? 'This model');
    const ot: RouteOption = { ...o, available: true, reason: undefined, fit: { ...o.fit, warning, pinnedAnyway: true } } as RouteOption; delete (ot as any).reason;
    const rest = af ? autoOrder(tool, modelId, input, passes, allow).filter((x) => x.routeId !== r.routeId && !x.demo) : [];
    return { routing: { modelId, mode: 'pinned', allowFallback: af, order: [r.routeId, ...rest.map((x) => x.routeId)], prices, fitWarning: { code: 'too_heavy', routeId: r.routeId, message: warning } }, first: ot, options: all }; }
  if (!o.available) return { error: o.reason === NOT_WIRED_REASON ? `${notWiredSentence(r.label).replace(/ Pick another model\.$/, '')} Pick another place in Run on. Nothing was charged.` : `${r.label} can't run this job. ${reasonSentence(o.reason!)} Pick another place. Nothing was charged.`, errorType: 'routing', code: 'route_not_runnable', routeId: r.routeId, setup: placeAction(tool, modelId, input, o), reason: o.reason, status: 409, routes: all,
    charged: false, userMessage: `${r.label} can't run this job right now. Nothing was charged.`, calm: true } as any;
  // Oct 19 #2: a pinned local route never silently turns into a cloud demo preview (fallback only to routes that really run)
  const rest = af ? autoOrder(tool, modelId, input, passes, allow).filter((x) => x.routeId !== r.routeId && !(o.kind === 'local' && x.demo)) : [];
  return { routing: { modelId, mode: 'pinned', allowFallback: af, order: [r.routeId, ...rest.map((x) => x.routeId)], prices }, first: o, options: all };
}
