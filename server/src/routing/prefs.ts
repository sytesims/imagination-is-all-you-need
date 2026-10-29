/** Saved routing choices (single local user → one kv row). GET/PUT /api/me/routing. */
import { getKv, setKv } from '../db.js';
import type { RoutingPrefs, ToolPin } from './types.js';
import { env } from '../env.js';
import { RETIRED_MODELS } from '../shared/lifecycle.js';
/** OPENHIGGSFIELD_USE_LOCAL=1 / 0 in the env (or the env file) is an explicit choice: null = not set. It is the default of global.useLocal (product default: off = cloud first)
 *  AND, when set, it is applied again each time the server starts (applyEnvPrefsAtStartup), so a stored row from an earlier launch no longer hides it. */
export const envUseLocal = (): boolean | null => { const v = (env('USE_LOCAL') ?? '').trim(); return /^(1|true|on|yes)$/i.test(v) ? true : /^(0|false|off|no)$/i.test(v) ? false : null; };
const USE_LOCAL_DEFAULT = envUseLocal() === true;
const KEY = 'routingPrefs';
export const DEFAULT_PREFS: RoutingPrefs = { global: { mode: 'auto', allowFallback: false, useLocal: USE_LOCAL_DEFAULT }, perModel: {} };
/** A saved route for a removed model (shared/lifecycle.ts RETIRED_MODELS, e.g. Reve) is dropped on read, so the tool falls back to its default. */
export const livePerModel = (pm: RoutingPrefs['perModel'] = {}) => Object.fromEntries(Object.entries(pm).filter(([m]) => !RETIRED_MODELS[m]));
/**
 * v2 (MODEL-ROUTE-SPEC step 2). Rows written before v2 have only perModel (one pin per ENGINE id, shared by every tool that uses the engine:
 * the cross-tool leak). They are migrated on read, not rewritten: perTool starts empty and pinFor() (routing/select.ts) applies an old
 * perModel[engine] pin only on the tools where that route serves the engine, under the model the engine means there. New choices are saved
 * per (tool, model) in perTool, so they never leak. perModel is kept (and still written by older clients) for one release.
 */
export const getPrefs = (): RoutingPrefs => { const p = getKv<RoutingPrefs>(KEY, DEFAULT_PREFS);
  // Run on (2026-10-22): global.mode 'auto' (every saved row) now means the pre-selected place, so it is read as is. The old "If it fails, try
  // another place" switch is gone: a stored allowFallback is read as off (only a request's own allowFallback=1 still opts in).
  return { global: { ...DEFAULT_PREFS.global, ...p.global, allowFallback: false }, perModel: livePerModel(p.perModel), v: 2, perTool: p.perTool ?? {}, favourites: liveFavourites(p.favourites) }; };
/** A favourite for a removed model (RETIRED_MODELS) is dropped on read, so the tool goes back to its recommended default. */
const liveFavourites = (f: RoutingPrefs['favourites']): Record<string, string> => Object.fromEntries(Object.entries(f && typeof f === 'object' ? f : {}).filter(([, m]) => typeof m === 'string' && m && !RETIRED_MODELS[m]));
/** Called once at startup. An explicit OPENHIGGSFIELD_USE_LOCAL wins over the value stored by an earlier launch (the least surprising: the line the user wrote in their env file
 *  does what it says). Settings can still flip it while the server runs; the next start applies the env line again. Not set = the stored choice is left alone. */
export function applyEnvPrefsAtStartup(): { applied: boolean; useLocal: boolean | null } {
  const e = envUseLocal(); if (e == null) return { applied: false, useLocal: null };
  const p = getPrefs(); if (p.global.useLocal === e) return { applied: false, useLocal: e };
  savePrefs({ ...p, global: { ...p.global, useLocal: e } }); return { applied: true, useLocal: e };
}
/** Saves the row. A caller that doesn't carry `favourites` (the routing PUT, Settings) keeps the saved ones. */
export const savePrefs = (p: RoutingPrefs) => { const favourites = p.favourites ?? getKv<RoutingPrefs>(KEY, DEFAULT_PREFS).favourites ?? {};
  setKv(KEY, { global: p.global, perModel: p.perModel, v: 2, perTool: p.perTool ?? {}, favourites }); return { ...p, v: 2 as const, perTool: p.perTool ?? {}, favourites }; };
/** The user's own default model for a tool (★ Make default), if any. */
export const favouriteOf = (toolId: string, p: RoutingPrefs = getPrefs()): string | null => p.favourites?.[toolId] ?? null;
/** Make `model` the tool's default (null = Reset to recommended). */
export function setFavourite(toolId: string, model: string | null): Record<string, string> {
  const p = getPrefs(); const favourites = { ...(p.favourites ?? {}) }; if (model) favourites[toolId] = model; else delete favourites[toolId];
  return savePrefs({ ...p, favourites }).favourites ?? {};
}
/** The explicit per-(tool, model) choice, if any (apps fall back to their base tool's choice? No: each tool keeps its own). */
export const toolPinOf = (p: RoutingPrefs, toolId: string, modelKey: string): ToolPin | undefined => p.perTool?.[toolId]?.[modelKey];
