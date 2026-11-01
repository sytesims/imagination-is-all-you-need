/**
 * MODEL-PICKER-REVIEW task 7: the price of THIS run on every picker row, in one call.
 *
 *   POST /api/models/quotes { toolId, params?: { …the page's current quote params }, models?: (modelKey | { model, runOn? })[] }
 *   → { toolId, params, quotes: { [modelKey]: { …priceNow, priceRange } } }
 *
 *  - priceNow: each model is quoted through the SAME GET /api/tools/:id/price the Generate button uses (app.inject), with the page's
 *    current settings (aspect, resolution / quality, duration, count, references, sound…) and `model=<key>`, plus the `runOn` the page
 *    would send (its saved choice; the server applies a saved choice on its own too). So a row's price = that quote = the submit's
 *    estimate, at the place that would run it (the saved choice, else the pre-selection judged on THIS job, not the listing's default job).
 *  - A setting this model can't take (the page snaps it when you switch): resolution → the model's first allowed one, duration → the
 *    nearest allowed length, another enum → its first allowed value; `adjusted` names what changed.
 *  - Create Image: each row is first set to the settings the bar switches to when that model is picked (shared/imageSnap.ts paramsOnSwitch:
 *    Auto / the model's default aspect, its default quality and resolution on that place's route, the count capped at its batch size), so
 *    the row's price = what Generate shows right after picking it. Only what picking can't change (too many images, a mask) still blocks.
 *  - priceRange: min..max over the places that can run this job now (runnable, not a sample), each place with its own price, for the
 *    row's tooltip.
 *  - Cheap: one request per picker; answers are cached for a few seconds per (settings, model, place) and the cache is keyed by the
 *    routing prefs, key status, billing mode and mock-keys flag, so a saved choice or a new key is never answered from an old entry.
 */
import type { FastifyInstance } from 'fastify';
import { getTool } from '../tools/registry.js';
import { toolModels, runOnsOf, modelRoutes, runOnOfRoute, catalogueFields, type ToolModel } from './modelRegistry.js';
import { capsFor } from '../shared/imageCaps.js';
import { VIDEO_LIMITS, ROUTE_LIMITS } from '../tools/h3/videoCaps.js';
import { paramsOnSwitch } from '../shared/imageSnap.js';
import { fitSettings, fitLength, fitResolution, changesBetween, fitNote, fitHint, needOf, videoFitCaps, type FitCaps, type FitValues } from '../shared/settingsFit.js';
import type { ToolDef } from '../tools/types.js';
import { rowRefParams } from '../shared/refFit.js';
import { getPrefs } from './prefs.js';
import { providerSettings } from './settings.js';
import { mockKeys } from './keys.js';
import { billingMode } from '../billingMode.js';
import { localAvailable } from './select.js';
import { toolProviders } from '../providers.js';

/** Request fields that pick the model / place: the batch sets them per row, so the page's own values are dropped. */
const DROP = new Set(['provider', 'model', 'runOn', 'run_on', 'route', 'quotedRouteId', 'quotedCredits', 'toolId', 'allowFallback', 'fields']);
const MAX_MODELS = 60; const MAX_VARIANTS = 48; const TTL_MS = 8_000; const MAX_CACHE = 4_000;
/** Extra quote fields an option price needs (the price token's estimate flag, the per-second rate, the local time range). */
const VARIANT_EXTRA = ['upTo', 'perSecond', 'eta', 'localRun', 'priceRef', 'issues'] as const;
/** The quote fields a row needs (the rest of a quote stays with the single quote). */
const KEEP = ['credits', 'listCredits', 'chargeable', 'free', 'local', 'demo', 'demoTag', 'runnable', 'needsKey', 'priceAvailable', 'cost', 'billingMode', 'runOn', 'runOnLabel', 'place', 'placeLabel',
  'routeId', 'routeKind', 'modelKey', 'reason', 'reasonCode', 'blockedReason', 'unavailableReason', 'error', 'code', 'warn', 'setupOptions' /* a row that needs a key shows its per-run estimate */] as const;
const cache = new Map<string, { at: number; v: Promise<Row> }>();
type Row = Record<string, any> & { status: number };

const stamp = () => { try { return JSON.stringify([getPrefs(), providerSettings().map((p) => `${p.id}:${p.configured ? 1 : 0}:${(p as any).disabledReason ? 1 : 0}`), mockKeys(), billingMode(), localAvailable()]); } catch { return String(Date.now()); } };
const pick = (d: any) => { const o: Record<string, any> = {}; if (d && typeof d === 'object') for (const k of KEEP) if (d[k] !== undefined) o[k] = d[k]; return o; };
/** The page's own params for a variant quote: string values only, the model / place fields kept (each variant is that page's quote). */
export function variantParams(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {}; if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) { if (v == null || typeof v === 'object') continue; const s = String(v); if (s.length <= 2_000) out[k] = s; }
  return out;
}
/** Clean a params object: string values only, no per-row fields. */
export function batchParams(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {}; if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) { if (DROP.has(k) || v == null || typeof v === 'object') continue; const s = String(v); if (s.length <= 2_000) out[k] = s; }
  return out;
}
/** The value to try instead of a setting this model refuses (null = drop the field). */
function snap(field: string, body: any, cur: string | undefined): string | null | undefined {
  const num = (x: unknown) => Number(String(x).replace(/[^\d.]/g, ''));
  if (/^(duration|seconds)$/.test(field)) { const ds: number[] = (body.durations ?? body.allowedDurations ?? []).map(Number).filter((x: number) => Number.isFinite(x)); if (!ds.length) return undefined;
    const c = num(cur); return String(Number.isFinite(c) ? (fitLength(ds, c)?.to ?? ds.reduce((a, b) => (Math.abs(b - c) < Math.abs(a - c) ? b : a))) : ds[0]); } // shared/settingsFit.ts: the longest up to yours
  if (field === 'resolution' && Array.isArray(body.resolutions) && body.resolutions.length && cur) return fitResolution(body.resolutions.map(String), cur)?.to ?? String(body.resolutions[0]); // the highest up to yours
  const list: unknown[] = Array.isArray(body.resolutions) && field === 'resolution' ? body.resolutions : Array.isArray(body.allowed) ? body.allowed : Array.isArray(body.issues?.[0]?.allowed) ? body.issues[0].allowed : [];
  if (Array.isArray(body.allowed) && body.allowed.length === 0) return null;
  return list.length ? String(list[0]) : undefined;
}

export function registerQuotesBatch(app: FastifyInstance) {
  const one = async (toolId: string, params: Record<string, string>): Promise<Row> => {
    const r = await app.inject({ method: 'GET', url: `/api/tools/${encodeURIComponent(toolId)}/price?${new URLSearchParams(params)}` });
    let d: any = null; try { d = r.json(); } catch { /* not JSON */ } return { status: r.statusCode, ...pick(d), _body: d } as Row;
  };
  const cached = (toolId: string, params: Record<string, string>, st: string): Promise<Row> => {
    const k = `${st}\u0001${toolId}\u0001${new URLSearchParams(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)))}`; const hit = cache.get(k);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.v;
    if (cache.size > MAX_CACHE) cache.clear();
    const v = one(toolId, params).catch(() => ({ status: 500 } as Row)); cache.set(k, { at: Date.now(), v }); return v;
  };
  /** Create Image: the page's params as the bar sets them when this model is picked, on the route that runs it (its resolutions and shapes). */
  const switched = (tool: ToolDef, m: ToolModel, base: Record<string, string>, routeId: string | null, runOn: string | null) => {
    const rs = modelRoutes(tool, m).filter((x) => !x.route.comingSoon);
    const at = (routeId && rs.find((x) => x.route.routeId === routeId)) || (runOn && rs.find((x) => runOnOfRoute(x.route) === runOn)) || null;
    const engine = at?.engine ?? m.primary; const res = (at?.route.caps as any)?.resolutions;
    return paramsOnSwitch(capsFor(engine), base, { routeResolutions: Array.isArray(res) ? res : null, routeShapes: (at?.route.caps as any) ?? null }); // route shapes: a route with fewer shapes than the model
  };
  const isImage = (tool: ToolDef) => tool.id === 'create-image';
  /** Create Video: a model's limits on one of its places (the route's own row in VIDEO_LIMITS, else its engine's, narrowed by ROUTE_LIMITS), or the model's. */
  const videoCapsAt = (tool: ToolDef, m: ToolModel, routeId: string | null): FitCaps | null => {
    const at = routeId ? modelRoutes(tool, m).find((x) => x.route.routeId === routeId) : null; const own = routeId ? VIDEO_LIMITS[routeId.slice(routeId.indexOf(':') + 1)] : undefined;
    const L = own ?? VIDEO_LIMITS[at?.engine ?? m.primary]; if (!L) return null; return videoFitCaps({ ...L, ...(routeId ? ROUTE_LIMITS[routeId] ?? {} : {}) });
  };
  /** The page's params as the bar sets them when this video model is picked: fitted to its caps, and sound at the model's own default (Veo = off, 2026-10-25). */
  const fitVideo = (base0: Record<string, string>, caps: FitCaps | null, m: ToolModel, tool?: ToolDef) => {
    /* what's on the bar (image=1, refImages / refVideos / refAudios: shared/refFit.ts): the row is quoted in the mode it would run, with only
     * the start frame and references it uses (2026-10-31: Seedance rows said "Needs a start image" with one attached) */
    const L = VIDEO_LIMITS[m.primary]; const base = L ? rowRefParams(base0, { modes: (tool?.app as any)?.providerModes?.[m.primary] ?? null, refKinds: Object.keys(L.refKinds ?? {}), refMax: L.refKinds as Record<string, number> }) : base0;
    const f = fitSettings(caps, { duration: base.duration ?? base.seconds, resolution: base.resolution, aspect: base.aspect, audio: base.audio }); const out: Record<string, string> = { ...base };
    for (const [k, v] of Object.entries(f.values) as [keyof FitValues, string | undefined][]) if (v != null && v !== '') { if (k === 'duration' && base.duration == null && base.seconds != null) out.seconds = v; else if (base[k] != null) out[k] = v; }
    const A = VIDEO_LIMITS[m.primary]?.audio; const want = A?.supported && A.toggle ? (A.default ? '1' : '0') : undefined; if (want !== undefined && out.audio != null && !f.changes.some((c) => c.field === 'audio')) out.audio = want;
    return out;
  };
  /** Every other tool (Prompt Edit, Photo FX, Extend, Camera Moves…): a resolution or length this model doesn't make is set to its own default,
   *  as the bar does when the model is picked (VideoWorkflowBar.tsx valOf: the tool's default for this model, else the input's, else the first),
   *  so the row's price = what Generate shows after picking it (Kling 4.0 in Prompt Edit at 480p → 720p). Only a field with a per-model list
   *  moves; a length moves only where the tool names each model's default length. */
  const ownList = (tool: ToolDef, field: 'resolution' | 'duration', prov: string): string[] | null => {
    const a: any = (tool as any).app ?? {}; const inp: any = tool.inputs?.find((x) => x.name === field);
    const l = (field === 'resolution' ? a.resolutionsByProvider?.[prov] : a.durationsByProvider?.[prov]) ?? inp?.byProvider?.[prov];
    return Array.isArray(l) && l.length ? l.map(String) : null;
  };
  const fitOwn = (tool: ToolDef, m: ToolModel, base: Record<string, string>) => {
    const a: any = (tool as any).app ?? {}; const out = { ...base }; const moved = new Set<string>();
    for (const field of ['resolution', 'duration'] as const) {
      const cur = base[field]; const list = ownList(tool, field, m.primary); if (cur == null || cur === '' || !list) continue;
      if (list.some((x) => x.toLowerCase() === cur.toLowerCase())) continue;
      const own = field === 'resolution' ? a.defaultResolutionByProvider?.[m.primary] : a.defaultDurationByProvider?.[m.primary];
      if (field === 'duration' && own == null) continue;
      const inpDef = tool.inputs?.find((x) => x.name === field)?.default; const ok = (v: unknown) => v != null && list.includes(String(v));
      out[field] = ok(own) ? String(own) : ok(inpDef) ? String(inpDef) : list[0]; moved.add(field);
    }
    return { params: out, moved };
  };
  const movedOf = (base: Record<string, string>, p: Record<string, string>) => { const moved: Record<string, string | null> = {}; for (const k of new Set([...Object.keys(base), ...Object.keys(p)])) if (base[k] !== p[k]) moved[k] = p[k] ?? null; return moved; };
  /** A row as it runs once picked: settings switched for this model (Create Image), then quoted; re-switched once if the route that
   *  answered offers other resolutions than the one guessed. */
  const quotePicked = async (tool: ToolDef, base: Record<string, string>, m: ToolModel, runOn: string | null, st: string) => {
    if (tool.id === 'h3-video') { // Create Video (2026-10-27, shared/settingsFit.ts): the settings picking this model gives, on the place that runs it
      const pv = (rid: string | null) => fitVideo(base, videoCapsAt(tool, m, rid), m, tool);
      let p = pv(null); let r = await quoteRow(tool.id, p, m.key, runOn, st);
      const rid = typeof r.q.routeId === 'string' ? r.q.routeId : null; // the place's own limits (Router LTX-2.5 Pro: 6 / 8 / 10 s) narrow the model's
      // only when that place refuses the job as set: a place that takes it (our H3 graph runs 2–15 s) keeps the model's settings
      if (rid && (r.q.status >= 400 || r.q.runnable === false)) { const p2 = pv(rid); if (JSON.stringify(p2) !== JSON.stringify(p)) { const r2 = await quoteRow(tool.id, p2, m.key, runOn, st); if (r2.q.status < 400 && r2.q.runnable !== false) { p = p2; r = r2; } } }
      return { ...r, adjusted: { ...movedOf(base, p), ...r.adjusted } }; }
    if (!isImage(tool)) { const p = fitOwn(tool, m, base).params; const r = await quoteRow(tool.id, p, m.key, runOn, st); return { ...r, adjusted: { ...movedOf(base, p), ...r.adjusted } }; }
    let p = switched(tool, m, base, null, runOn); let r = await quoteRow(tool.id, p, m.key, runOn, st);
    const rid = typeof r.q.routeId === 'string' ? r.q.routeId : null;
    if (rid) { const p2 = switched(tool, m, base, rid, runOn); if (JSON.stringify(p2) !== JSON.stringify(p)) { p = p2; r = await quoteRow(tool.id, p, m.key, runOn, st); } }
    return { ...r, adjusted: { ...movedOf(base, p), ...r.adjusted } }; // what picking this model changes, named in `adjusted` like a snapped setting
  };
  /** One row: the quote at the given place (none = the place that would run it), retrying once or twice with a refused setting snapped. */
  const quoteRow = async (toolId: string, base: Record<string, string>, model: string, runOn: string | null, st: string) => {
    let params: Record<string, string> = { ...base, model, ...(runOn ? { runOn } : {}) }; const adjusted: Record<string, string | null> = {};
    let q = await cached(toolId, params, st);
    for (let i = 0; i < 3 && q.status === 400; i++) {
      const b = q._body ?? {}; const field = String(b.issues?.[0]?.field ?? b.field ?? '').replace(/^aspectRatio$/, 'aspect');
      if (!field || DROP.has(field) || adjusted[field] !== undefined || !(field in params || (field === 'duration' && 'seconds' in params))) break;
      const key = field === 'duration' && !('duration' in params) ? 'seconds' : field; const v = snap(field, b, params[key]); if (v === undefined) break;
      const next = { ...params }; if (v === null) delete next[key]; else next[key] = v; if (next[key] === params[key]) break;
      adjusted[key] = v; params = next; q = await cached(toolId, params, st);
    }
    return { q, params, adjusted };
  };

  /** 2026-10-25, the bar's option prices: POST /api/tools/:toolId/price-variants { params: {the page's own GET /price params, provider
   *  included}, variants: { [id]: { field: value | null (null = drop the field) } } } → { toolId, base, variants: { [id]: quote | null } }.
   *  Each entry IS GET /api/tools/:toolId/price with those params (app.inject, same cache as the picker rows), so a popup's price for an
   *  option = what Generate shows once it is picked. No snapping: a setting the model refuses comes back as its 400 (status, code). */
  app.post('/api/tools/:toolId/price-variants', async (req, reply) => {
    const toolId = String((req.params as any).toolId ?? ''); if (!getTool(toolId)) return reply.code(400).send({ error: 'Unknown tool.', errorType: 'validation', code: 'unknown_tool', field: 'toolId' });
    const b = (req.body ?? {}) as { params?: Record<string, unknown>; variants?: Record<string, unknown> };
    const base = variantParams(b.params); const vs = b.variants && typeof b.variants === 'object' ? Object.entries(b.variants) : [];
    if (vs.length > MAX_VARIANTS) return reply.code(400).send({ error: `At most ${MAX_VARIANTS} variants per call.`, errorType: 'validation', code: 'too_many_variants', field: 'variants' });
    const st = stamp(); const out: Record<string, any> = {};
    const row = (q: Row) => { const d = q._body ?? {}; const o: Record<string, any> = { status: q.status, ...pick(d) }; for (const k of VARIANT_EXTRA) if (d[k] !== undefined) o[k] = d[k]; return o; };
    await Promise.all(vs.map(async ([id, ov]) => {
      if (!ov || typeof ov !== 'object') { out[id] = null; return; }
      const p = { ...base }; for (const [k, v] of Object.entries(ov as Record<string, unknown>)) { if (v == null) delete p[k]; else if (typeof v !== 'object') p[k] = String(v); }
      out[id] = row(await cached(toolId, p, st));
    }));
    return { toolId, base, variants: out };
  });

  app.post('/api/models/quotes', async (req, reply) => {
    const b = (req.body ?? {}) as { toolId?: string; params?: Record<string, unknown>; models?: unknown[]; range?: boolean };
    const tool = getTool(String(b.toolId ?? '')); if (!tool) return reply.code(400).send({ error: 'Pass toolId (a tool id).', errorType: 'validation', code: 'unknown_tool', field: 'toolId' });
    const params = batchParams(b.params); const all = toolModels(tool); const listed = new Set(toolProviders(tool).map((p) => p.id));
    const offered = all.filter((m) => m.parts.some((p) => listed.has(p.engine)));
    const asked: { model: string; runOn: string | null }[] = Array.isArray(b.models) && b.models.length
      ? b.models.map((x: any) => (typeof x === 'string' ? { model: x, runOn: null } : { model: String(x?.model ?? ''), runOn: x?.runOn && x.runOn !== 'auto' ? String(x.runOn) : null }))
      : offered.map((m) => ({ model: m.key, runOn: null }));
    if (asked.length > MAX_MODELS) return reply.code(400).send({ error: `At most ${MAX_MODELS} models per call.`, errorType: 'validation', code: 'too_many_models', field: 'models' });
    const st = stamp(); const withRange = b.range !== false;
    const quotes: Record<string, any> = {};
    await Promise.all(asked.map(async ({ model, runOn }) => {
      const m = offered.find((x) => x.key === model);
      if (!m) { quotes[model] = { model, status: 400, ok: false, error: `${tool.name} has no model "${model}".`, code: 'unknown_model' }; return; }
      const { q, params: used, adjusted } = await quotePicked(tool, params, m, runOn, st);
      const { _body, ...now } = q as any; void _body;
      const row: Record<string, any> = { model, ok: q.status < 400, ...now, ...(Object.keys(adjusted).length ? { adjusted } : {}) };
      { // 2026-10-27 (shared/settingsFit.ts): what picking this model changes, in the bar's words, and what a job no setting can fix needs
        const name = String(catalogueFields(m.key).displayName ?? m.def.name ?? model); const rid = typeof q.routeId === 'string' ? q.routeId : null;
        const caps = tool.id === 'h3-video' ? videoCapsAt(tool, m, rid) : isImage(tool) ? { resolutions: (capsFor(m.primary) as any)?.resolutions ?? null } : null;
        const own = tool.id !== 'h3-video' && !isImage(tool) ? fitOwn(tool, m, params) : null; // other tools: set to the model's default, not the nearest
        const changes = changesBetween(params, used, caps).map((c) => (own?.moved.has(c.field) && used[c.field] === own.params[c.field] ? { ...c, why: 'default' as const } : c));
        if (changes.length) row.fit = { values: Object.fromEntries(changes.map((c) => [c.field, c.to])), changes, note: fitNote(changes, name), hint: fitHint(changes) };
        const blocked = q.status >= 400 || q.runnable === false; const need = blocked && q.needsKey !== true ? needOf(q.blockedReason ?? q.unavailableReason ?? q.reason ?? q.error) : null;
        if (need) row.need = need; }
      if (withRange) { // every place that can run THIS job now (the places this model has on this tool), each at its own price
        const base = isImage(tool) ? params : Object.fromEntries(Object.entries(used).filter(([k]) => k !== 'model' && k !== 'runOn')); // Create Image: each place switched on its own route
        const places = await Promise.all(runOnsOf(tool, m).map(async (ro) => (ro === q.runOn && q.status < 400 && !runOn ? q : (await quotePicked(tool, base, m, ro, st)).q)));
        const ready = places.filter((p) => p.status < 400 && p.runnable !== false && p.demo !== true && typeof p.credits === 'number' && p.runOn
          && (p.reasonCode !== 'local_pinned' || p.runOn === q.runOn)) // a GPU that runs only because it was asked for by name (Use local off) isn't a place this job runs now
          .map((p) => ({ runOn: p.runOn, runOnLabel: p.runOnLabel ?? null, placeLabel: (p as any).placeLabel ?? null, credits: p.credits as number, cost: p.cost ?? null, routeId: p.routeId ?? null }));
        const seen = new Set<string>(); const uniq = ready.filter((p) => (seen.has(p.runOn) ? false : (seen.add(p.runOn), true)));
        const cs = uniq.map((p) => p.credits); const us = uniq.map((p) => (typeof p.cost?.estUsd === 'number' ? p.cost.estUsd : p.credits / 100));
        row.priceRange = uniq.length ? { min: Math.min(...cs), max: Math.max(...cs), minUsd: Math.min(...us), maxUsd: Math.max(...us), places: uniq } : null;
      }
      quotes[model] = row;
    }));
    return { toolId: tool.id, params, quotes };
  });
}
