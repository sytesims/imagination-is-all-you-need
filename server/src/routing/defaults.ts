/**
 * Cloud-first defaults. One rule for every tool's default model:
 *  - tool.providers is in quality order (best first). preferredProvider = the quality pick (first in that order, per mode).
 *  - defaultProvider = the user's saved pin first (a model with a saved per-model route that runs), else the first model in quality order
 *    that really runs now with the current keys and settings (a local route counts only when Use local ComfyUI is on or pinned, or when the
 *    tool has no cloud model at all), else the first model whose cloud route is wired and only needs a key (the cloud default is kept:
 *    keyless mock servers show it as a sample run), else preferredProvider.
 *  - defaultFallback {note, from, to, fromName, toName, reasonCode} when defaultProvider !== preferredProvider. The quote follows defaultProvider.
 * Every model carries its status (runnable, demo, needsKey, keyOwner, wired, reasonCode, reason) so pickers can say why without guessing.
 *
 * Cloud first, one key (2026-10-27): shared/cloudDefaults.ts names each tool's cloud default (a Comfy Cloud / Comfy Router model). Order:
 *  1. the user's own default (★ Make default, prefs.favourites[toolId]) wherever the tool lists it and it can run or only needs a key;
 *     one that needs a download, Local turned on, or is gone says so (defaultFallback) and the recommended default is used;
 *  2. a saved route pin that runs;  3. with Use local ComfyUI on, the local default when it runs;
 *  4. the cloud default when it runs now (or makes a sample, or only waits for the job's own input);
 *  5. the first model that really runs now (a fal-only setup keeps working);  6. the cloud default needing its key (Generate says how to add it);
 *  7. the old rules. recommendedProvider = what 2-7 pick (the menu's "Recommended"), favouriteProvider = the user's own, defaultSource = which won.
 */
import { swapNeverAuto, swapTypesOf, type SwapKind } from '../shared/cloudSwap.js';
const SWAP_TOOL_IDS = new Set(['object-swap', 'motion-transfer']);
import type { ToolDef } from '../tools/types.js';
import { toolProviders, getProvider } from '../providers.js';
import { routesFor, isTwinAlias, toolKeys, tierLabel, tierOf } from './routes.js';
import { option, resolveRoute, keyOwner, byTier, localAvailable, savedPinOf, localOnlyModel } from './select.js';
import { getPrefs, favouriteOf } from './prefs.js';
import { config } from '../config.js';
import { LOCAL_OFF_REASON, LOCAL_UNREACHABLE_REASON, TOO_HEAVY_REASON, OPEN_WEIGHTS_ONLY_REASON, NOT_WIRED_REASON, reasonSentence, routeRunnable } from './runnable.js';
import { cardName } from '../models.js';
import { cleanName } from '../shared/modelCatalog.js';
import { isRetiring } from '../shared/lifecycle.js';
import { aKey } from '../shared/modelIds.js';
import { IMAGE_FEATURES, featureById, type ImageFeatureId } from '../shared/imageFeatures.js';
import { IMAGE_DEFAULTS, pickEditorial, featureForToolMode, defaultsOfFeature, type EditorialPick, type WorkflowDefaults } from '../shared/imageDefaults.js';
import { VIDEO_DEFAULTS } from '../shared/videoDefaults.js';
import { AUDIO_DEFAULTS } from '../shared/audioDefaults.js';
import { audioWorkflowForToolMode, audioWorkflowById, AUDIO_WORKFLOW_IDS, LYRICS_REQUIRED_FOR } from '../shared/audioWorkflows.js';
import { THREE_D_DEFAULTS } from '../shared/threeDDefaults.js';
import { threeDWorkflowForToolMode, threeDWorkflowById } from '../shared/threeD.js';
import { currentHardware } from '../hardware.js';
import { CLOUD_DEFAULTS, cloudDefaultOf, TOOL_SLOT } from '../shared/cloudDefaults.js';
import { MAC_WEIGHTS_REASON } from '../hardware/macWeights.js';
import { weightsGate } from '../hardware/requirements.js';

export type DefaultReasonCode = 'key_missing' | 'not_wired' | 'local_off' | 'local_unreachable' | 'too_heavy' | 'open_weights_only' | 'input_blocked' | 'no_price' | 'coming_soon' | 'mode_unsupported' | 'not_runnable';
export interface ModelStatus {
  id: string; name: string; rank: number;
  /** A real run (not a demo preview) starts with the current keys and settings. */ runnable: boolean;
  /** Generate runs a sample run (mock backend, no key): sample output, 0 credits. */ demo: boolean;
  /** A key would make it run for real (a wired cloud route lacks only its key). */ needsKey: boolean; keyOwner: string | null;
  /** Some cloud route of this model has a live executor (false = partner node not connected yet: a key alone won't run it). */ wired: boolean;
  /** The model has at least one cloud route (false = local only). */ hasCloud: boolean;
  reasonCode: DefaultReasonCode | null; reason: string | null;
  /** Route Auto would use for it now (demo route on a keyless mock server), its kind / tier, and the job's price. */
  routeId: string | null; routeKind: string | null; tier: number | null; tierLabel: string | null; credits: number | null; listCredits: number | null;
  /** The user saved a route for this model (Settings / route picker). */ pinned: boolean;
  /** HW-SHAPES B3: the local route's fit on this computer (verdict + reasonCode + its plain reason), null for cloud-only models. */ fit?: { verdict: string; reasonCode: string; reason?: string } | null;
}
export interface DefaultFallback { note: string; from: string; to: string; fromName: string; toName: string; reasonCode: DefaultReasonCode | 'pinned' }
/** The per-workflow default (shared/imageDefaults.ts) as resolved for this tool and mode: which feature, its local / hosted pair, the one for the
 *  active setup and whether it runs; `source` says what picked defaultProvider (a saved route pin, this default, or the first that runs). */
export interface EditorialDefault extends EditorialPick { feature: string; local: string | null; hosted: string | null; source: 'pin' | 'editorial' | 'fallback' }
/** What picked defaultProvider: the user's own default, a saved route pin, the local default (Use local on), the cloud default, or the first that runs. */
export type DefaultSource = 'favourite' | 'pin' | 'local' | 'cloud' | 'fallback';
export interface ToolDefaults { mode: string | null; preferredProvider: string | null; defaultProvider: string | null; defaultRoute: string | null; defaultFallback: DefaultFallback | null; defaultState: ModelStatus | null; models: ModelStatus[]; editorial?: EditorialDefault | null;
  /** The default without the user's own pick (the menu's "Recommended"). */ recommendedProvider?: string | null;
  /** The user's own default for this tool (★), even when this mode doesn't list it. */ favouriteProvider?: string | null;
  defaultSource?: DefaultSource }
/** The cloud-defaults slot of a tool and mode (shared/cloudDefaults.ts keys): the video slots, the image feature / Audio / 3D workflow, `tool:mode`, else the tool. */
export function cloudSlot(tool: ToolDef, feat: string | null, mode: string | null): string {
  const base = TOOL_SLOT[tool.id] ?? feat ?? tool.id;
  return mode && CLOUD_DEFAULTS[`${base}:${mode}`] ? `${base}:${mode}` : base; // one mode with its own pick (Generate Video's references: MiniMax H3)
}

const nameOf = (tool: ToolDef, id: string) => cardName(tool.id, id) ?? cleanName(getProvider(id)?.name ?? id);
const typesOf = (v: unknown): string | null => { if (Array.isArray(v)) return v[0] != null ? String(v[0]) : null; const s = String(v ?? ''); if (!s) return null; try { const t = JSON.parse(s); return Array.isArray(t) ? (t[0] != null ? String(t[0]) : null) : String(t); } catch { return s.split(',')[0].trim() || null; } };
/** The mode ids a tool switches between (media tools: Generate / Edit / Inpaint, Music / SFX / Voice …), first = what the page opens on. */
export function toolModes(tool: ToolDef): string[] {
  const mp = (tool.app as any)?.modeProviders as Record<string, string[]> | undefined; if (!(tool.app as any)?.providerModes && mp) return Object.keys(mp); // Cinema: generate first
  const pm = (tool.app as any)?.providerModes as Record<string, string[]> | undefined; if (!pm) return [];
  const G = (tool.app as any)?.gallery; const locked = typesOf(G?.locked?.types);
  if (locked) return [...new Set([locked, ...Object.values<string>(G?.modeWhenFile ?? {}).map(typesOf).filter((x): x is string => !!x)])];
  const fromPresets = (tool.presets ?? []).filter((p: any) => p.group === 'Mode').map((p) => p.id);
  return fromPresets.length ? fromPresets : [...new Set(Object.values(pm).flat())];
}
/** provider → modes: app.providerModes (media tools), or the inverse of app.modeProviders (Cinema: mode → providers). */
const providerModesOf = (tool: ToolDef): Record<string, string[]> | undefined => { const pm = (tool.app as any)?.providerModes; if (pm) return pm; const mp = (tool.app as any)?.modeProviders as Record<string, string[]> | undefined; if (!mp) return undefined;
  const out: Record<string, string[]> = {}; for (const [m, ids] of Object.entries(mp)) for (const id of ids) (out[id] ??= []).push(m); return out; };
const supports = (tool: ToolDef, id: string, mode: string | null) => { const pm = providerModesOf(tool); return !mode || !pm?.[id] || pm[id].includes(mode); };
/** The tool's listed models in quality order (open-weights-only mode respected; B6 twin cards hidden: they are routes of their open model). */
export function qualityOrder(tool: ToolDef, mode: string | null = null): string[] {
  const tk = toolKeys(tool); return toolProviders(tool).map((p) => p.id).filter((id) => !isTwinAlias(id, tk) && supports(tool, id, mode));
}
let inputHook: ((tool: ToolDef, modelId: string) => Record<string, any>) | null = null;
/** http.ts registers the listing's default job input (app locks, Camera's first move and length), so status = listing = quote. */
export const setStatusInput = (f: typeof inputHook) => { inputHook = f; };
function statusInput(tool: ToolDef, modelId: string, mode: string | null, extra: Record<string, any> = {}) {
  const base = inputHook ? inputHook(tool, modelId) : {};
  return { ...base, ...(mode ? { types: [mode], mode } : {}), ...extra };
}
/** One model's status for this tool (and mode): what Auto would do now, and why it can't run when it can't. */
export function modelStatus(tool: ToolDef, modelId: string, mode: string | null = null, rank = 0, extra: Record<string, any> = {}): ModelStatus {
  const input = statusInput(tool, modelId, mode, extra); const prefs = getPrefs();
  const rs = routesFor(modelId, tool).filter((r) => !r.comingSoon); const opts = rs.map((r) => option(tool, r, input));
  const pin = savedPinOf(tool, modelId, input)?.route; const pinned = !!pin && pin !== 'auto' && rs.some((r) => r.routeId === pin);
  const cloud = opts.filter((o) => o.kind !== 'local'); const hasCloud = cloud.length > 0;
  const keyable = cloud.filter((o) => o.wired && (o.available || o.reasonCode === 'key_missing')).sort(byTier(false));
  const wired = cloud.some((o) => o.wired && o.reasonCode !== 'input_blocked');
  const name = nameOf(tool, modelId);
  const lf = opts.find((o) => o.kind === 'local')?.fit; const base = { id: modelId, name, rank, wired, hasCloud, pinned, fit: lf ? { verdict: String(lf.verdict), reasonCode: String(lf.reasonCode), ...(lf.reason ? { reason: String(lf.reason) } : {}) } : null };
  const empty = { routeId: null, routeKind: null, tier: null, tierLabel: null, credits: null, listCredits: null };
  if (!supports(tool, modelId, mode)) return { ...base, ...empty, runnable: false, demo: false, needsKey: false, keyOwner: null, reasonCode: 'mode_unsupported', reason: `${name} doesn't do this mode` };
  if (!rs.length) return { ...base, ...empty, runnable: false, demo: false, needsKey: false, keyOwner: null, reasonCode: 'coming_soon', reason: 'Coming soon' };
  const pl = resolveRoute(tool, modelId, input, 1, {});
  if (!('error' in pl)) {
    const f = pl.first; const at = { routeId: f.routeId, routeKind: f.kind, tier: tierOf(f), tierLabel: tierLabel(f), credits: pl.routing.prices[f.routeId] ?? f.credits, listCredits: f.listCredits ?? f.credits };
    if (!pl.routing.demo) return { ...base, ...at, runnable: true, demo: false, needsKey: false, keyOwner: null, reasonCode: null, reason: null };
    const k = keyable[0]; const owner = k ? keyOwner(k.envKey) : f.kind !== 'local' ? keyOwner(f.envKey) : null;
    if (f.kind === 'local') return { ...base, ...at, runnable: false, demo: true, needsKey: !!k, keyOwner: k ? owner : null, reasonCode: k ? 'key_missing' : null, reason: k ? `You’ll get a free sample. Real runs need ${aKey(String(owner))} in Settings → Connections` : 'You’ll get a free sample' };
    if (k) return { ...base, ...at, runnable: false, demo: true, needsKey: true, keyOwner: owner, reasonCode: 'key_missing', reason: `You’ll get a free sample. Real runs need ${aKey(String(owner))} in Settings → Connections` };
    return { ...base, ...at, runnable: false, demo: true, needsKey: false, keyOwner: owner, reasonCode: 'not_wired', reason: `${name} isn’t ready in this app yet. You’ll get a sample for now; nothing is billed` };
  }
  const err = pl as any; const routes: any[] = err.routes ?? opts;
  const local = routes.find((o) => o.kind === 'local');
  const k = keyable[0];
  const fail = (reasonCode: DefaultReasonCode, reason: string, needsKey = false, owner: string | null = null): ModelStatus => ({ ...base, ...empty, ...(k ? { routeId: k.routeId, routeKind: k.kind, tier: k.tier ?? null, tierLabel: k.tierLabel ?? null, listCredits: k.credits } : {}), runnable: false, demo: false, needsKey, keyOwner: owner, reasonCode, reason });
  // a local route reports reachability first when the user runs local (Use local on) or nothing else could run: "Local ComfyUI isn't reachable", not a Comfy Cloud key hint
  if (local && !localAvailable() && (prefs.global.useLocal || !k)) return fail('local_unreachable', LOCAL_UNREACHABLE_REASON);
  if (k && k.reasonCode === 'key_missing') return fail('key_missing', `Add ${aKey(keyOwner(k.envKey))} in Settings → Connections to run ${name}`, true, keyOwner(k.envKey));
  if (cloud.some((o) => o.reasonCode === 'not_wired')) return fail('not_wired', `${name} isn’t ready yet. Pick another model`);
  if (cloud.some((o) => o.reasonCode === 'key_missing') && !wired) return fail('not_wired', `${name} isn’t ready in this app yet. Pick another model`, false, keyOwner(cloud.find((o) => o.reasonCode === 'key_missing')!.envKey));
  if (cloud.length && cloud.every((o) => o.reason === OPEN_WEIGHTS_ONLY_REASON) && !local) return fail('open_weights_only', OPEN_WEIGHTS_ONLY_REASON);
  if (local && !localAvailable()) return fail('local_unreachable', LOCAL_UNREACHABLE_REASON);
  // HW-SHAPES B3: every local route of this model is too heavy for this computer (checked before local_off: turning Use local on wouldn't help)
  { const locals = routes.filter((o) => o.kind === 'local'); if (locals.length && locals.every((o) => o.reasonCode === 'too_heavy')) return { ...fail('too_heavy', locals.every((o) => o.fit?.reasonCode === 'unsupported_weights') ? MAC_WEIGHTS_REASON : TOO_HEAVY_REASON), fit: locals[0].fit ?? null } as ModelStatus; }
  // a model that runs only on your computer runs with Use local off too (select.ts autoOrder), so "turn it on" isn't its step: the plan's own
  // reason below says what is (its files, an add-on), the same step its menu row and setup card show (2026-10-31: Wan 2.2 Animate)
  if (local && !prefs.global.useLocal && !localOnlyModel(modelId, tool, input)) return fail('local_off', LOCAL_OFF_REASON);
  const blocked = routes.find((o) => o.reasonCode === 'input_blocked');
  if (blocked) return fail('input_blocked', String(blocked.reason ?? 'This job does not fit this model'));
  if (routes.some((o) => o.reason === NOT_WIRED_REASON)) return fail('not_wired', `${name} isn’t ready yet. Pick another model`);
  // a direct-API route whose only gap is its key (e.g. FLUX.2 [flex] without a BFL key): say so, so pickers offer Add key
  { const kr = routes.find((o) => o.envKey && (o.reasonCode === 'key_missing' || /\bkey\b/i.test(String(o.reason ?? '')))) ?? (/\bneeds an? .*\bkey\b/i.test(String(err.error ?? '')) ? routes.find((o) => o.envKey) : null);
    if (kr) return fail('key_missing', `Add ${aKey(keyOwner(kr.envKey))} in Settings → Connections to run ${name}`, true, keyOwner(kr.envKey)); }
  return fail('not_runnable', reasonSentence(String(err.error ?? 'Not available here')).replace(/\s*Nothing was charged\.?/, '').replace(/\.$/, ''));
}
const WHY: Record<string, (s: ModelStatus) => string> = {
  key_missing: (s) => `needs a ${s.keyOwner ?? 'provider'} key`,
  not_wired: () => "isn’t ready in this app yet",
  local_off: () => 'runs only on your computer, and running on your computer is off',
  local_unreachable: () => "runs only on your computer, and ComfyUI isn’t running there",
  too_heavy: (s) => { if (s.fit?.reasonCode === 'unsupported_weights') return MAC_WEIGHTS_REASON.replace(/^Needs/, 'needs'); const r = String((s as any).fit?.reason ?? '').trim().replace(/\.$/, ''); return r ? `is too heavy for your computer (${r.charAt(0).toLowerCase()}${r.slice(1)})` : 'is too heavy for your computer'; }, // dp30 (g): the fit's own reason (VRAM, RAM, disk…), never a blanket 'graphics memory'
  open_weights_only: () => 'is hidden in open-weights-only mode',
  input_blocked: () => "can't run this job",
  no_price: () => 'has no verified price yet',
  coming_soon: () => 'is coming soon',
  mode_unsupported: () => "doesn't do this mode",
  not_runnable: (s) => { const r = String(s.reason ?? '').trim().replace(/\.$/, ''); return r ? `can't run here (${r})` : "can't run here"; }, // never an empty '()'
};
type DefaultsOpts = { mode?: string | null; extra?: Record<string, any>; only?: (id: string) => boolean; /** the image feature or Audio workflow to resolve the per-workflow default for (default: the tool's, for this mode) */ feature?: ImageFeatureId | string | null;
  /** leave the user's own default out (the recommended one) */ noFavourite?: boolean };
/** Can run as the tool's default: really, as a sample, waiting only for the job's own input (a photo), or once its key is added (Generate says how). */
const canStart = (s: ModelStatus | undefined) => !!s && (s.runnable || s.demo || s.reasonCode === 'input_blocked' || (s.needsKey && s.wired));
/** Defaults for one tool (and mode), the user's own default first. extra = job input fields that change what can run (e.g. Camera move types). */
export function toolDefaults(tool: ToolDef, opts: DefaultsOpts = {}): ToolDefaults {
  const base = recommendedDefaults(tool, opts); const fav = opts.noFavourite ? null : favouriteOf(tool.id);
  const rec = { ...base, recommendedProvider: base.defaultProvider, favouriteProvider: fav };
  if (!fav || fav === base.defaultProvider) return fav ? { ...rec, defaultSource: 'favourite' } : rec;
  const s = base.models.find((m) => m.id === fav); const to = base.defaultState;
  // a local favourite whose files aren't downloaded yet can't start: say so and use the recommended default (Generate would only refuse it)
  const dl = s && s.routeKind === 'local' ? (() => { try { const g = weightsGate(tool, s.id, statusInput(tool, s.id, base.mode)); return g && g.code !== 'nodes_missing' ? g : null; } catch { return null; } })() : null;
  if (s && canStart(s) && !dl) return { ...rec, defaultProvider: s.id, defaultRoute: s.routeId, defaultState: s, defaultFallback: null, defaultSource: 'favourite' };
  const offered = toolProviders(tool).some((p) => p.id === fav);
  if (offered && !s) return rec; // the tool lists it, but not in this mode (or this call's `only`): the recommended default here
  if (!to) return rec;
  const favName = s?.name ?? nameOf(tool, fav); const rc = (s?.reasonCode ?? 'not_runnable') as DefaultReasonCode;
  const why = !s ? 'isn’t available any more' : dl ? `needs its files downloaded first${dl.missingBytes ? ` (${Math.round(dl.missingBytes / 1e8) / 10} GB)` : ''}` : WHY[rc]?.(s) ?? "can't run here";
  return { ...rec, defaultFallback: { from: fav, to: to.id, fromName: favName, toName: to.name, reasonCode: rc, note: `Your default, ${favName}, ${why}, so ${to.name} is used.` } };
}
/** The recommended default for one tool (and mode): everything but the user's own pick. */
function recommendedDefaults(tool: ToolDef, opts: DefaultsOpts = {}): ToolDefaults {
  const modes = toolModes(tool); const mode = opts.mode ?? modes[0] ?? null;
  const ids = qualityOrder(tool, mode).filter((id) => !opts.only || opts.only(id));
  const models = ids.map((id, k) => modelStatus(tool, id, mode, k + 1, opts.extra));
  if (!models.length) return { mode, preferredProvider: null, defaultProvider: null, defaultRoute: null, defaultFallback: null, defaultState: null, models, editorial: null };
  // A model that can never run in this tool (coming soon, or only cloud routes with no live executor here: Seedance 2.0 on Restyle / Director) is listed
  // and greyed but never the default (Auto) or what holds back a local model (2026-11-02 unwired audit). Mock keys don't change this.
  const neverRuns = (id: string) => { const rs = routesFor(id, tool).filter((r) => !r.comingSoon); return !rs.length || rs.every((r) => r.kind !== 'local' && !routeRunnable(r)); };
  const explicitLocal = getPrefs().global.useLocal; const anyCloud = models.some((m) => m.hasCloud && m.reasonCode !== 'not_wired' && !neverRuns(m.id)); // cloud routes that aren't built yet (Director) don't hold back a local model that runs
  // Provider audit (2026-10-21): a retiring model (shared/lifecycle.ts, e.g. Veo 3.1) stays listed and pinnable but is never the quality pick or the default.
  // a swap model with a known problem (shared/cloudSwap.ts warning: Seedance 2.5 Edit refuses photos of real people) is listed and pickable the same way
  const listedLive = models.filter((m) => !isRetiring(m.id) && !(SWAP_TOOL_IDS.has(tool.id) && swapNeverAuto(m.id))); const pref = listedLive[0] ?? models[0];
  const live = listedLive.filter((m) => !neverRuns(m.id)); // what Auto may start on (the quality pick above may be one that can't run here: the fallback note says so)
  // Per-workflow defaults (2026-10-23, shared/imageDefaults.ts): after a saved pin, the workflow's chosen model for the active setup (local GPU or a
  // hosted key) when it runs now; else the old rule (the first model that runs). Only models this call lists count (mode, `only`).
  // Image features resolve per feature; Generate Video (h3-video) has its own table (shared/videoDefaults.ts) keyed by the tool id; the Audio
  // tools (audio / voice / soundtrack and Music Bed) resolve per Audio workflow from their tool:mode (shared/audioDefaults.ts).
  const feat: string | null = opts.feature !== undefined ? opts.feature : featureForToolMode(IMAGE_FEATURES, tool.id, mode) ?? (VIDEO_DEFAULTS[tool.id] ? tool.id : null) ?? audioWorkflowForToolMode(tool.id, mode) ?? threeDWorkflowForToolMode(tool.id, mode); // 3D: per 3D workflow (shared/threeDDefaults.ts)
  const wf: WorkflowDefaults | undefined = feat ? ((feat === tool.id ? VIDEO_DEFAULTS[feat] : undefined) /* Video Upscale (tool upscale) vs the image feature 'upscale' (tool image-upscale): same id, the tool's own table wins */ ?? (IMAGE_DEFAULTS as Record<string, WorkflowDefaults>)[feat] ?? VIDEO_DEFAULTS[feat] ?? (AUDIO_DEFAULTS as Record<string, WorkflowDefaults>)[feat] ?? (THREE_D_DEFAULTS as Record<string, WorkflowDefaults>)[feat]) : undefined;
  const byId = (id: string) => models.find((m) => m.id === id);
  const sampleLocal = !!wf?.sampleLocal && config.backend === 'mock' && !(wf.hosted && byId(wf.hosted)?.runnable); // keyless sample server: open on the local pick (a hosted default that really runs keeps its place)
  const ed = wf ? pickEditorial(wf, byId, explicitLocal || sampleLocal, { apple: currentHardware().gpu?.type === 'mps' }) : null; // Apple Silicon: wf.localApple (Generate Video: Wan 2.2 5B)
  const pinnedDef = models.find((m) => m.pinned && (m.runnable || m.demo)); // a saved pin wins when it runs (real, or the sample run on a keyless mock server)
  const edDef = ed?.runs && ed.id && !neverRuns(ed.id) ? byId(ed.id) : undefined;
  // nothing runs: among the models a key alone would run, the workflow's default comes first (it needs the same kind of key as the old pick);
  // a hosted fallback on the common key (Generate Video: Seedance 2.0 on the Comfy key) goes before a default that needs a rarer lab key
  const edKey = ed?.id && !ed.runs ? (wf!.hostedFirstWhenNeither ? [ed.id, wf!.hosted, wf!.hostedFallback] : [...(wf!.hostedFallback ? [wf!.hostedFallback] : []), ed.id, wf!.hosted]).map((id) => (id ? byId(id) : undefined)).find((e) => e && e.needsKey && e.wired) : undefined;
  // cloud first (shared/cloudDefaults.ts): the slot's cloud model when it starts now; when it only lacks its key, after any model that really runs
  const cdId = cloudDefaultOf(cloudSlot(tool, feat, mode), tool.id)?.model ?? null; const cdS = cdId ? byId(cdId) : undefined;
  const cdNow = cdS && !neverRuns(cdS.id) && (cdS.runnable || cdS.demo || cdS.reasonCode === 'input_blocked') ? cdS : undefined;
  const localDef = explicitLocal && edDef && edDef.routeKind === 'local' ? edDef : undefined;
  const runsNow = live.find((m) => m.runnable && (m.routeKind !== 'local' || explicitLocal || m.pinned || !anyCloud));
  const def = pinnedDef ?? localDef ?? cdNow ?? edDef
    ?? runsNow
    ?? (canStart(cdS) ? cdS : undefined)
    ?? edKey
    ?? live.find((m) => m.needsKey && m.wired)
    ?? live[0] ?? models.find((m) => !neverRuns(m.id))
    ?? pref;
  const source: DefaultSource = pinnedDef ? 'pin' : def === localDef ? 'local' : def === cdS ? 'cloud' : def === edDef && edDef?.routeKind === 'local' ? 'local' : 'fallback';
  // the cloud default itself: nothing to explain (a missing key shows on Generate). With Use local on, the notes below say why the local default isn't used.
  if (!pinnedDef && !explicitLocal && def === cdS && !models.some((m) => m.pinned && !(m.runnable || m.demo) && m.id !== def.id))
    return { mode, preferredProvider: pref.id, defaultProvider: def.id, defaultRoute: def.routeId, defaultFallback: null, defaultState: def, models, defaultSource: source,
      editorial: feat && wf && ed?.id ? { ...ed, ...(ed.id !== def.id ? { id: def.id, setup: 'hosted' as const, why: wf.why.hosted ?? ed.why } : {}), runs: def.runnable || def.demo, reason: def.runnable || def.demo ? null : def.reason, feature: feat, local: wf.local, hosted: wf.hosted, source: 'editorial' } : null };
  const editorial: EditorialDefault | null = feat && wf && ed?.id ? { ...ed, feature: feat, local: wf.local, hosted: wf.hosted, source: pinnedDef ? 'pin' : edDef ? 'editorial' : 'fallback' } : null;
  // What to do next when the model in use can't run for real: sample output, the key to add, or (nothing runs) the next key worth adding and where.
  const nextKey = models.find((m) => m.keyOwner && m.needsKey && m.wired) ?? models.find((m) => m.keyOwner && m.needsKey);
  // nothing runs: name why the model in use can't either (Restyle on a computer without a graphics card: its local default is too heavy), same words as WHY
  const ownWhy = (m: ModelStatus) => { const w = m.reasonCode ? WHY[m.reasonCode]?.(m) : null; return w ? ` ${m.name} ${w}.` : ''; };
  const tailOf = (m: ModelStatus) => m.runnable ? '' : m.demo ? ' It makes sample output here until its key is added.' : m.needsKey ? ` Add a ${m.keyOwner ?? 'provider'} key in Settings → Connections to run it.` : `${ownWhy(m)}${nextKey ? ` Nothing can run yet. Add ${aKey(String(nextKey.keyOwner))} in Settings → Connections to start.` : ' Nothing can run yet.'}`;
  const nothingRuns = !def.runnable && !def.demo && !def.needsKey;
  // Bug 7: the user's saved pick can't run (key missing, local off ...): say so under its own code, then name what is used instead
  const blockedPin = pinnedDef ? undefined : models.find((m) => m.pinned && !(m.runnable || m.demo) && m.id !== def.id);
  if (blockedPin) {
    const rc = (blockedPin.reasonCode ?? 'not_runnable') as DefaultReasonCode; const why = WHY[rc]?.(blockedPin) ?? "can't run here";
    const fb: DefaultFallback = { from: blockedPin.id, to: def.id, fromName: blockedPin.name, toName: def.name, reasonCode: rc,
      note: nothingRuns ? `Your pick, ${blockedPin.name}, ${why}.${tailOf(def)}` : `Your pick, ${blockedPin.name}, ${why}, so ${def.name} is used.${tailOf(def)}` };
    return { mode, preferredProvider: pref.id, defaultProvider: def.id, defaultRoute: def.routeId, defaultFallback: fb, defaultState: def, models, defaultSource: source, editorial: editorial ? { ...editorial, source: edDef ? 'editorial' : 'fallback' } : null };
  }
  // The workflow's default can't run here: say so, and name what runs instead (Generate Video: Seedance 2.5 -> Seedance 2.0 on the Comfy key)
  const edFallbackNote = (e: ModelStatus): DefaultFallback => {
    const why = e.reasonCode ? WHY[e.reasonCode]?.(e) ?? "can't run here" : "can't run here"; const area = featureById(feat!)?.name ?? audioWorkflowById(feat!)?.name ?? threeDWorkflowById(feat!)?.name ?? tool.name;
    return { from: e.id, to: def.id, fromName: e.name, toName: def.name, reasonCode: (e.reasonCode ?? 'not_runnable') as DefaultReasonCode,
      note: nothingRuns ? `${e.name} is the default for ${area} but ${why}.${tailOf(def)}` : `${e.name} is the default for ${area} but ${why}, so ${def.name} is used.${tailOf(def)}` };
  };
  const hostedDef = wf?.hosted && !pinnedDef && wf.hostedFallback === def.id ? byId(wf.hosted) : undefined; // the fallback took over from the lab-key default
  if (!pinnedDef && (edDef || (edKey && def === edKey && edKey.id === ed?.id))) return { mode, preferredProvider: pref.id, defaultProvider: def.id, defaultRoute: def.routeId, defaultFallback: hostedDef && !hostedDef.runnable ? edFallbackNote(hostedDef) : null, defaultState: def, models, defaultSource: source, editorial: editorial ? { ...editorial, source: 'editorial' } : null }; // the default itself (it may still need its key: the quote and pre-flight say so)
  if (editorial && !pinnedDef && def.id !== editorial.id) { const fb = edFallbackNote(byId(editorial.id!)!);
    return { mode, preferredProvider: pref.id, defaultProvider: def.id, defaultRoute: def.routeId, defaultFallback: fb, defaultState: def, models, defaultSource: source, editorial };
  }
  const reasonCode: DefaultFallback['reasonCode'] = def.pinned && def.id !== pref.id && (pref.runnable || pref.demo) ? 'pinned' : (neverRuns(pref.id) ? 'not_wired' : pref.reasonCode ?? (pref.runnable && pref.routeKind === 'local' && !explicitLocal ? 'local_off' : explicitLocal && pref.fit?.verdict === 'too_heavy' ? 'too_heavy' : 'not_runnable')); // MiniMax H3 with Use local on, no graphics card: its own route here is too heavy (was "can't run here ()") // a local quality pick passed over because Use local ComfyUI is off (was 'not_runnable' with an empty reason)
  const why = reasonCode === 'pinned' ? 'is the best-quality option, but you saved a route for' : WHY[reasonCode]?.(pref) ?? "can't run here";
  const tail = tailOf(def);
  const fb: DefaultFallback | null = def.id === pref.id ? null : {
    from: pref.id, to: def.id, fromName: pref.name, toName: def.name, reasonCode,
    note: reasonCode === 'pinned' ? `${def.name} is selected because you saved a route for it; ${pref.name} is the best-quality option.` : nothingRuns ? `${pref.name} ${why}.${tail}` : `${pref.name} ${why}, so ${def.name} is the default.${tail}`,
  };
  return { mode, preferredProvider: pref.id, defaultProvider: def.id, defaultRoute: def.routeId, defaultFallback: fb, defaultState: def, models, defaultSource: source, editorial };
}
/** The default model for a submit or quote that names none (mode-aware). Falls back to the first listed provider. */
export function defaultProviderFor(tool: ToolDef, mode?: string | null, extra?: Record<string, any>): string | undefined {
  try { return toolDefaults(tool, { mode: mode ?? null, extra }).defaultProvider ?? toolProviders(tool)[0]?.id; } catch { return toolProviders(tool)[0]?.id; }
}
/** Music without lyrics (2026-10-23): YuE2 only sings lyrics. When no model is asked, the job has no lyrics and the default is a lyrics-only model,
 *  the default among the other models is used instead (submit and quote alike; a quote says lyrics=1, or sends the text, when Lyrics is filled).
 *  Cover a song is left alone (it needs lyrics and says so). null = keep the default. */
export function lyricsFreeDefault(tool: ToolDef, mode: string | null, f: Record<string, any>, current?: string | null): string | null {
  const base = String((tool.app as any)?.gallery?.base ?? tool.id); if (mode !== 'music' || !['audio', 'soundtrack'].includes(base)) return null;
  if (String(f.lyrics ?? f.text ?? '').trim()) return null;
  try { const d = current ?? toolDefaults(tool, { mode }).defaultProvider; if (!d || !LYRICS_REQUIRED_FOR.includes(d)) return null;
    const x = toolDefaults(tool, { mode, only: (id) => !LYRICS_REQUIRED_FOR.includes(id), feature: null }); // no editorial pick among the rest: the setup decides
    if (getPrefs().global.useLocal) { const l = x.models.find((m) => m.routeKind === 'local' && (m.runnable || m.demo) && !isRetiring(m.id)); if (l) return l.id; } // the next local model (MiniMax Music 3)
    return x.defaultProvider; } catch { return null; }
}
/** Draft on (quote ?draft=1 / submit draft field). */
export const draftOn = (f: Record<string, any>) => /^(1|true|on)$/i.test(String(f.draft ?? ''));
/** true when the model has at least one route that takes a draft (a route's unavailableFor that only blocks once draft is on = no draft mode). */
export function hasDraftMode(tool: ToolDef, modelId: string, mode: string | null): boolean {
  const rs = routesFor(modelId, tool).filter((r) => !r.comingSoon); if (!rs.length) return false;
  const input = statusInput(tool, modelId, mode, {});
  return rs.some((r) => !r.unavailableFor || r.unavailableFor({ ...input, draft: true }) === r.unavailableFor({ ...input, draft: false }));
}
/** Quote = submit (2026-10-25): with draft on, Auto skips models that have no draft mode (Seedance 2.5 on BytePlus), so the quote prices the model
 *  the submit runs. The current default when it takes drafts, or none does (the job then reports the model's own "no draft mode" block, quote and
 *  submit alike); else the default among the models that take drafts. null = keep the default. */
export function draftCapableDefault(tool: ToolDef, mode: string | null, current?: string | null): string | null {
  try { const d = current ?? toolDefaults(tool, { mode }).defaultProvider; if (!d || hasDraftMode(tool, d, mode)) return null;
    const ok = toolProviders(tool).map((p) => p.id).filter((id) => hasDraftMode(tool, id, mode)); if (!ok.length) return null;
    const x = toolDefaults(tool, { mode, only: (id) => ok.includes(id) }); return x.defaultProvider && ok.includes(x.defaultProvider) ? x.defaultProvider : null; } catch { return null; }
}
/** Providers with the default first, then the rest in quality order (submit's auto-pick helpers walk this list). */
export function defaultFirst(tool: ToolDef, mode?: string | null): string[] {
  const all = toolProviders(tool).map((p) => p.id); const d = defaultProviderFor(tool, mode); return d ? [d, ...all.filter((x) => x !== d)] : all;
}
/** Mode of a request (types / mode field), for mode-aware defaults. */
export const requestMode = (tool: ToolDef, f: Record<string, any>): string | null => { const ms = toolModes(tool); if (!ms.length) return null; const m = typesOf(f.types) ?? (typeof f.mode === 'string' ? f.mode : null); return m && ms.includes(m) ? m : null; };
/** Video Swap (object-swap): which swap types each model serves (Person / Object toggle). The web filtered a local-only list; now the server says. */
export { SWAP_TYPES } from '../shared/cloudSwap.js'; // one table (shared/cloudSwap.ts): the menus per type and the cloud edits' own check read the same
/** One model's status as clients read it (/api/tools providers[], swapTypes[].models[]). */
export const modelFields = (s?: ModelStatus) => (s ? { qualityRank: s.rank, runnable: s.runnable, demoPreview: s.demo, ...(s.demo ? { demoTag: 'Sample' } : {}), needsKey: s.needsKey, keyOwner: s.keyOwner, wired: s.wired, hasCloud: s.hasCloud, reasonCode: s.reasonCode, reason: s.reason, statusRoute: s.routeId, pinned: s.pinned, fit: s.fit ? { verdict: s.fit.verdict, reasonCode: s.fit.reasonCode } : null } : {});
const pick = (x: ToolDefaults) => ({ preferredProvider: x.preferredProvider, defaultProvider: x.defaultProvider, defaultRoute: x.defaultRoute, defaultFallback: x.defaultFallback, qualityOrder: x.models.map((s) => s.id), ...(x.editorial ? { editorialDefault: x.editorial } : {}), ...favFields(x) });
/** The menu's hint: recommendedProvider ("Recommended"), favouriteProvider ("Your default") and what picked the default. */
const favFields = (x: ToolDefaults) => ({ recommendedProvider: x.recommendedProvider ?? x.defaultProvider, favouriteProvider: x.favouriteProvider ?? null, defaultSource: x.defaultSource ?? 'fallback' });
/** Per-workflow defaults for every image feature this tool runs (Create Image: create / edit / brush / camera-lens), resolved for the current setup. */
export function workflowDefaultsOf(tool: ToolDef, known?: ToolDefaults): Record<string, ReturnType<typeof pick>> {
  const feats: { id: string; mode: string }[] = [...IMAGE_FEATURES.filter((f) => f.toolId === tool.id),
    ...AUDIO_WORKFLOW_IDS.map((id) => audioWorkflowById(id)!).filter((w) => w.tool === tool.id).map((w) => ({ id: w.id, mode: w.mode }))]; // Audio: per workflow too
  const modes = toolModes(tool); const out: Record<string, ReturnType<typeof pick>> = {};
  for (const f of feats) { const mode = modes.includes(f.mode) ? f.mode : modes[0] ?? null;
    if (known && known.mode === mode && known.editorial?.feature === f.id) { out[f.id] = pick(known); continue; } // the tool's own default already is this one
    try { out[f.id] = pick(toolDefaults(tool, { mode, feature: f.id })); } catch { /* a tool that can't list: no entry */ } }
  return out;
}
/** /api/tools block: per tool and per mode (and per swap type on Object Swap). Every listed model carries its status (modelStatus[id]). */
export function defaultsBlock(tool: ToolDef) {
  const d = toolDefaults(tool); const modes = toolModes(tool);
  const all = qualityOrder(tool, null); const firstMode = (id: string) => (supports(tool, id, d.mode) ? d.mode : modes.find((m) => supports(tool, id, m)) ?? null);
  const status = Object.fromEntries(all.map((id, k) => [id, d.models.find((m) => m.id === id) ?? modelStatus(tool, id, firstMode(id), k + 1)]));
  for (const [k, id] of all.entries()) status[id] = { ...status[id], rank: k + 1 };
  const swap = tool.id === 'object-swap' ? { swapTypes: Object.fromEntries(['person', 'object'].map((st) => { const x = toolDefaults(tool, { extra: { swapType: st }, only: (id) => swapTypesOf(id).includes(st as SwapKind) });
    return [st, { ...pick(x), models: x.models.map((m, k) => ({ id: m.id, name: m.name, ...modelFields({ ...m, rank: k + 1 }) })) }]; })) } : {};
  return { preferredProvider: d.preferredProvider, defaultProvider: d.defaultProvider, defaultRoute: d.defaultRoute, defaultFallback: d.defaultFallback, defaultState: d.defaultState, ...favFields(d),
    qualityOrder: all, modelStatus: status, ...swap, ...(d.editorial ? { editorialDefault: d.editorial } : {}),
    ...(() => { const w = workflowDefaultsOf(tool, d); return Object.keys(w).length ? { workflowDefaults: w } : {}; })(),
    ...(modes.length > 1 ? { defaultsByMode: Object.fromEntries(modes.map((m) => [m, pick(m === d.mode ? d : toolDefaults(tool, { mode: m }))])) } : {}) };
}

// Apps with a file-driven mode switch (Product Shot edit, UGC Ad r2v) pick the mode's default with the same rule.
void import('../tools/apps.js').then((m) => m.setAppDefaultResolver((t, mode, ids) => { try { const d = toolDefaults(t, { mode, only: (id) => ids.includes(id) }).defaultProvider; return d && ids.includes(d) ? d : null; } catch { return null; } }));
void import('../models.js').then((m) => m.setModelDefaults((t) => { try { return toolDefaults(t).defaultProvider; } catch { return null; } }, (t, id) => isTwinAlias(id, toolKeys(t))));

/** GET /api/image-workflows (and /api/audio-workflows with defaultsOf = audioDefaultsOf): each recipe gets `defaults` {local, hosted, why, note?} (shared/imageDefaults.ts) plus `active`: the default for the
 *  current setup as the bar resolves it (id, setup local | hosted, runs, reason when it can't, and defaultProvider = what the bar starts on). */
export function withWorkflowDefaults<P extends { workflows: { id: string; runner: { toolId: string }; modes?: { default: string } }[] }>(pl: P, getTool: (id: string) => ToolDef | undefined, defaultsOf: (id: string) => WorkflowDefaults | null = defaultsOfFeature): P {
  return { ...pl, workflows: pl.workflows.map((w) => { const d = defaultsOf(w.id); if (!d) return w; const t = getTool(w.runner.toolId); let active: Record<string, any> | null = null;
    if (t) try { const ms = toolModes(t); const md = w.modes?.default ?? null; const x = toolDefaults(t, { mode: md && ms.includes(md) ? md : ms[0] ?? null, feature: w.id }); const e = x.editorial;
      active = e ? { id: e.id, setup: e.setup, runs: e.runs, reason: e.reason, why: e.why, source: e.source, defaultProvider: x.defaultProvider, note: x.defaultFallback?.note ?? null, ...favFields(x) } : null; } catch { /* no live answer: the static pair still lists */ }
    return { ...w, defaults: { local: d.local, hosted: d.hosted, ...(d.hostedFallback ? { hostedFallback: d.hostedFallback } : {}), ...(d.localLight ? { localLight: d.localLight } : {}), ...(d.localApple ? { localApple: d.localApple } : {}), why: d.why, ...(d.note ? { note: d.note } : {}), active } }; }) };
}
