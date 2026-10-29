/**
 * Create Image feed toolbar (2026-10-23):
 *  - POST /api/jobs/bulk: Select mode actions on many results at once (Like / Unlike, Move to project, Delete to Trash, Restore for Undo).
 *  - POST /api/compare/quote: Compare models. The SAME prompt + settings on 2–4 models: each model's adapted settings (shared/compareAdapt.ts),
 *    its own quote through GET /api/models/quote (the price the Generate button shows = the charge), the combined total, and one check of the
 *    whole set against the agent budget (agentBudget.ts) before anything runs (no spending limits since 2026-10-28).
 *    The client then submits one job per model with quotedRouteId + quotedCredits (each submit still runs the usual spend guard) and
 *    compareGroup / compareOf / compareIndex, so the feed shows them as one labelled group.
 */
import type { FastifyInstance } from 'fastify';
import { jobs } from './jobs.js';
import * as lib from './library.js';
import { getProvider } from './providers.js';
import { budgetBlockFor, budgetOfRequest, AGENT_HEADER } from './agentBudget.js';
import { adaptForModel, COMPARE_MAX, COMPARE_MIN, type CompareChange, type CompareParams } from './shared/compareAdapt.js';

const ACTIVE = new Set(['queued', 'running', 'needs_decision']);
const BULK_MAX = 500;
type BulkAction = 'like' | 'unlike' | 'project' | 'trash' | 'restore';

export interface CompareRow {
  model: string; name: string; ok: boolean; /** why it can't be in this comparison (text-only on an edit, needs setup / a key…) */ excluded: { code: string; reason: string } | null;
  /** no verified price (quote = charge): blocks the whole run until it is removed */ unpriced: boolean;
  params: CompareParams | null; changes: CompareChange[]; credits: number | null; estUsd: number; billedTo: string | null; runOn: string | null; routeId: string | null; local: boolean; demo: boolean;
}

export function registerFeed(app: FastifyInstance, pub: (j: any) => any) {
  app.post<{ Body: { ids?: unknown; action?: unknown; projectId?: unknown } }>('/api/jobs/bulk', async (req, reply) => {
    const b = req.body ?? {}; const ids = Array.isArray(b.ids) ? [...new Set(b.ids.filter((x): x is string => typeof x === 'string' && !!x))] : [];
    const action = String(b.action ?? '') as BulkAction;
    const bad = (field: string, message: string) => reply.code(400).send({ error: message, errorType: 'validation', issues: [{ code: 'invalid', field, message }] });
    if (!['like', 'unlike', 'project', 'trash', 'restore'].includes(action)) return bad('action', 'action must be like, unlike, project, trash or restore');
    if (!ids.length) return bad('ids', 'Pass ids: the results to change.'); if (ids.length > BULK_MAX) return bad('ids', `At most ${BULK_MAX} results at once.`);
    const pid = b.projectId == null || b.projectId === '' ? null : String(b.projectId);
    if (action === 'project' && pid && !lib.getProject(pid)) return reply.code(404).send({ error: 'project not found', errorType: 'not_found' });
    const done: string[] = []; const skipped: { id: string; reason: string }[] = [];
    for (const id of ids) {
      const j = jobs.get(id); if (!j || (j as any).seed) { skipped.push({ id, reason: 'Not found' }); continue; }
      if (action === 'trash' && ACTIVE.has(j.status)) { skipped.push({ id, reason: 'Still running: cancel it first' }); continue; }
      if (action === 'like' || action === 'unlike') lib.setFavourite(id, action === 'like');
      else if (action === 'project') lib.setProject(id, pid);
      else if (action === 'trash') lib.trash(id); else lib.restore(id);
      done.push(id);
    }
    return { ok: true, action, done, skipped, items: done.map((id) => pub(jobs.get(id)!)) };
  });

  app.post<{ Body: { models?: unknown; aspect?: string; quality?: string; imageResolution?: string; n?: unknown; refs?: unknown; mode?: string; preview?: unknown } }>('/api/compare/quote', async (req, reply) => {
    const b = req.body ?? {}; const models = Array.isArray(b.models) ? [...new Set(b.models.filter((x): x is string => typeof x === 'string' && !!x))] : [];
    const preview = b.preview === true || b.preview === 1 || b.preview === '1'; // the picker's list: each model's adapted price, up to 60 models, no run check
    if (models.length > (preview ? 60 : COMPARE_MAX)) return reply.code(400).send({ error: `Compare up to ${COMPARE_MAX} models at once.`, errorType: 'validation', code: 'compare_max', issues: [{ code: 'compare_max', field: 'models', message: `Pick ${COMPARE_MIN}–${COMPARE_MAX} models.` }] });
    const want = { aspect: b.aspect, quality: b.quality, imageResolution: b.imageResolution, n: Number(b.n) || 1, refs: Number(b.refs) || 0, mode: b.mode === 'edit' ? 'edit' as const : 'generate' as const };
    const agentHdr = req.headers[AGENT_HEADER];
    const rows: CompareRow[] = [];
    for (const id of models) {
      const name = getProvider(id)?.name ?? id; const base = { model: id, name, ok: false, excluded: null, unpriced: false, params: null, changes: [] as CompareChange[], credits: null, estUsd: 0, billedTo: null, runOn: null, routeId: null, local: false, demo: false };
      if (!getProvider(id)) { rows.push({ ...base, excluded: { code: 'unknown_model', reason: 'Unknown model' } }); continue; }
      const a = adaptForModel(id, want); if (!a.ok) { rows.push({ ...base, excluded: { code: a.code, reason: a.reason } }); continue; }
      const p = a.params; const qs = new URLSearchParams({ model: id, aspect: p.aspect, n: String(p.n), refs: String(p.refs), mode: p.mode, ...(p.quality ? { quality: p.quality } : {}), ...(p.imageResolution ? { imageResolution: p.imageResolution } : {}) });
      const r = await app.inject({ method: 'GET', url: `/api/models/quote?${qs}`, headers: { 'x-forwarded-for': String(req.ip ?? ''), ...(agentHdr ? { [AGENT_HEADER]: String(agentHdr) } : {}) } });
      const q = r.json() as any; const row: CompareRow = { ...base, params: p, changes: a.changes };
      if (r.statusCode >= 400) { rows.push({ ...row, excluded: { code: String(q?.code ?? 'invalid'), reason: String(q?.error ?? 'Can’t run these settings') } }); continue; }
      Object.assign(row, { routeId: q.routeId ?? q.route ?? null, runOn: q.runOn ?? null, local: q.local === true, demo: q.demo === true, billedTo: q.cost?.billedTo ?? null, estUsd: q.demo ? 0 : Number(q.cost?.estUsd ?? 0) || 0, credits: typeof q.credits === 'number' ? q.credits : null });
      if (q.priceAvailable === false || (q.credits == null && !q.setupOptions)) { rows.push({ ...row, unpriced: true, excluded: null, ok: false }); continue; }
      if (q.runnable === false && (q.agentBudgetBlock || q.blockedCode === 'agent_budget')) { rows.push({ ...row, ok: true }); continue; } // over a cap on its own: the combined check below names it
      if (q.runnable === false || q.credits == null) { const why = q.needsKey ? `Needs a ${q.keyOwner ?? q.cost?.billedToName ?? 'provider'} key` : Array.isArray(q.setupOptions) && q.setupOptions.length ? 'Needs setup first: pick it in the bar to set it up' : String(q.reason ?? q.error ?? 'Can’t run here right now');
        rows.push({ ...row, excluded: { code: q.needsKey ? 'needs_key' : Array.isArray(q.setupOptions) && q.setupOptions.length ? 'needs_setup' : 'not_runnable', reason: why } }); continue; }
      rows.push({ ...row, ok: true });
    }
    const inc = rows.filter((r) => r.ok); const unpriced = rows.filter((r) => r.unpriced);
    const credits = inc.reduce((s, r) => s + (r.credits ?? 0), 0); const estUsd = Math.round(inc.reduce((s, r) => s + r.estUsd, 0) * 1e4) / 1e4;
    const byBilledTo: Record<string, number> = {}; for (const r of inc) if (r.billedTo && r.estUsd > 0) byBilledTo[r.billedTo] = Math.round(((byBilledTo[r.billedTo] ?? 0) + r.estUsd) * 1e4) / 1e4;
    if (preview) return { rows, preview: true };
    let block: { code: string; message: string } | null = null;
    if (models.length < COMPARE_MIN) block = { code: 'compare_min', message: `Pick at least ${COMPARE_MIN} models to compare.` };
    else if (unpriced.length) block = { code: 'price_unavailable', message: `No verified price for ${unpriced.map((r) => r.name).join(', ')} at these settings, so it can’t run (the quote must equal the charge). Remove it or change the settings.` };
    else if (inc.length < COMPARE_MIN) block = { code: 'compare_min', message: `Only ${inc.length} of these models can run these settings here. Pick at least ${COMPARE_MIN} that can.` };
    if (!block) { const bud = budgetOfRequest(req); if (bud && 'error' in bud) block = { code: 'agent_budget_unknown', message: bud.error }; else if (bud) { const bb = budgetBlockFor(bud, estUsd, inc.reduce((s, r) => s + (r.demo ? 0 : r.credits ?? 0), 0)); if (bb) block = { code: 'agent_budget', message: bb.message }; } }
    // Hosted runs start at once; runs locally queue one after another in the order you picked them
    const order = [...inc.filter((r) => !r.local), ...inc.filter((r) => r.local)].map((r) => r.model);
    return { rows, included: inc.map((r) => r.model), order, total: { credits, estUsd, byBilledTo, models: inc.length, localRuns: inc.filter((r) => r.local).length }, runnable: !block, block,
      note: 'Each model runs with the settings it supports (changes listed per model). The total is the sum of each model’s quote, which is what each run charges; a model that fails is charged only by its provider’s failure rule.' };
  });
}
