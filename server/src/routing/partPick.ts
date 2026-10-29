/**
 * One model, several engines (MiniMax H3 on Create Video = comfy-h3 with its Comfy Cloud workflow twin, plus api-minimax-h3 on Comfy Router).
 * resolveModelRequest picks the engine from the request fields alone; that first engine can land on a route that can't run this job here
 * (the Comfy Cloud workflow with no measured price, or a mode it doesn't do) while another engine of the SAME model, at the SAME place,
 * runs it at a real price. Then the run goes to that engine instead (H3 map F1, 2026-10-26).
 *
 * Shared by the quote (routing/http.ts preHandler), the submit (index.ts) and the listing's pre-selection, all with the same probe built from
 * the request fields, so quote = submit. Never overrides an explicit route (request or saved), a legacy engine id, or an engine that runs.
 */
import type { ToolDef } from '../tools/types.js';
import { findToolModel, partRoutes, type ModelResolution } from './modelRegistry.js';
import { resolveRoute, savedPinOf, type PlanResult } from './select.js';
import { runOnOfRoute } from '../shared/modelIds.js';
import { limitsFor, resolutionMap } from '../tools/h3/videoCaps.js';

type Ok = ModelResolution & { ok: true };
/** The routing-relevant job shape from request fields (query strings or multipart fields): mode, length, resolution, sound. */
export function partProbe(f: Record<string, any>): Record<string, any> {
  const i: Record<string, any> = {}; const num = (v: unknown) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);
  const secs = num(f.seconds ?? f.duration); if (secs) i.duration = secs;
  if (f.resolution || f.quality) i.resolution = f.resolution || f.quality;
  const t = f.mode ? [String(f.mode)] : f.types != null && f.types !== '' ? (Array.isArray(f.types) ? f.types.map(String) : (() => { try { const x = JSON.parse(String(f.types)); return Array.isArray(x) ? x.map(String) : [String(x)]; } catch { return String(f.types).split(',').map((s) => s.trim()).filter(Boolean); } })()) : null;
  if (t?.length) { i.types = t; i.mode = t[0]; }
  if (f.audio != null && f.audio !== '') i.audio = typeof f.audio === 'boolean' ? f.audio : /^(1|true|on|yes)$/i.test(String(f.audio));
  return i;
}
/** The engine's own video limits take this job's resolution and length (no limits known = yes). */
function fitsEngine(engine: string, input: Record<string, any>): boolean {
  const L = limitsFor(engine); if (!L) return true; const res = input.resolution != null ? String(input.resolution) : '';
  if (res && !L.resolutions.some((x) => x.toLowerCase() === res.toLowerCase()) && !resolutionMap(L, res)) return false;
  const d = Number(input.duration); return !(Number.isFinite(d) && d > 0 && L.durations.length && !L.durations.includes(d));
}
/** A plan that really runs here: a priced, non-sample first route. */
const runs = (p: PlanResult): p is Exclude<PlanResult, { error: string }> & { first: any } => !('error' in p) && !p.routing.demo && p.first.available !== false && p.first.credits != null;
/**
 * The engine of this model that runs the job at the requested place (or anywhere, for Auto). Returns the resolution unchanged unless the
 * resolved engine can't run it and another engine of the same model can, at the same place.
 */
export function preferRunnablePart(tool: ToolDef, r: ModelResolution, fields: Record<string, any>): ModelResolution {
  if (!r.ok || r.legacy || !r.modelKey || !r.provider) return r;
  if (r.route && r.route !== 'auto') return r; // an explicit route always wins
  const m = findToolModel(tool, r.modelKey); if (!m || m.parts.length < 2) return r;
  const input = { ...partProbe(fields), ...(r.types ? { types: JSON.parse(r.types) } : {}) };
  const runOn = r.runOn && r.runOn !== 'auto' ? r.runOn : null;
  const saved = savedPinOf(tool, r.provider, input); if (saved && saved.route !== 'auto' && !saved.runOn && !runOn && r.route !== 'auto') return r; // a saved route (not a place) stays
  const planOf = (engine: string, routes: string[] | null) => resolveRoute(tool, engine, input, 1, { route: r.route === 'auto' ? 'auto' : undefined, runOn: runOn ?? undefined, allowRoutes: routes, modelKey: r.modelKey });
  const cur = planOf(r.provider, r.allowRoutes); const curRuns = runs(cur); if (curRuns && fitsEngine(r.provider, input)) return r;
  // 2026-10-27: an engine whose own limits don't take this job's size or length (MiniMax H3 at 480p: the Router engine does 768p / 2K only,
  // our Comfy Cloud workflow does 480p) gives way to an engine of the same model, at the same place, that takes it and runs; failing that,
  // to any engine that runs (the quote then names the size it needs, and a model switch adapts to it: shared/settingsFit.ts)
  for (const pass of [true, false]) {
    if (!pass && curRuns) return r;
    for (const p of m.parts) {
      if (p.engine === r.provider || (pass && !fitsEngine(p.engine, input))) continue;
      const rs = partRoutes(tool, p).filter((x) => !x.comingSoon && (!runOn || runOnOfRoute(x) === runOn)); if (!rs.length) continue;
      const alt = planOf(p.engine, p.routes); if (runs(alt) && (!runOn || runOnOfRoute(alt.first) === runOn)) return { ...r, provider: p.engine, allowRoutes: p.routes };
    }
  }
  return r;
}
