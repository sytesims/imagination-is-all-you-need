import { toolPage } from './shared/videoWorkflows.js';
/** Oct 17 page-spec refreshes: result specs + next actions, preset source/prefill, visibility + public shots, model page facts. Registered from index.ts. */
import { reseedIfDue } from './communitySeed.js';
import { metaOf as metaOfUrl } from './outputMeta.js';
import { sampleFor } from './sampleMedia.js';
import { SAMPLE_TOOL_ID } from './communitySeed.js';
import type { FastifyInstance } from 'fastify';
import { jobs } from './jobs.js';
import * as lib from './library.js';
import { getTool, listTools } from './tools/registry.js';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getKv, setKv } from './db.js';
import { DATA_DIR } from './config.js';
import { jobAttribution } from './attribution.js';

const bad = (field: string, message: string, code = 'invalid') => ({ error: message, errorType: 'validation', issues: [{ code, field, message }] });
const VIS = ['private', 'unlisted', 'public'] as const;
/** private (default) | unlisted (share link) | public (opt-in gallery). */
export const visibilityOf = (id: string) => { const m = lib.metaOf(id); return m.published ? 'public' : m.shareToken ? 'unlisted' : 'private'; };
/** Page 19 specs panel: one flat block from the job input (null when the tool has no such setting). */
export function jobSpecs(j: any) {
  const i = j.input ?? {}; const n = (v: any) => (v == null || v === '' ? null : v);
  const dur = n(i.durationSec ?? i.duration ?? i.seconds); const t = getTool(j.toolId);
  return { resolution: n(i.resolution ?? i.imageRes ?? i.quality), durationSec: dur == null ? null : Number(dur), aspect: n(i.aspect ?? i.aspectRatio), prompt: n(i.prompt), seed: n(i.seed), toolName: t?.name ?? j.toolId };
}
/** Action row (Turn to video, Upscale, Edit…): tools that take this output as an input, via fromJob. */
const NEXT: [string, string][] = [['h3-video', 'Turn to video'], ['camera', 'Add a camera move'], ['upscale', 'Upscale'], ['edit-video', 'Edit'], ['create-image', 'Edit image'], ['photo-fx', 'Photo FX'], ['restyle', 'Restyle']];

const clientOf = (req: { headers: Record<string, unknown> }) => String(req.headers['x-client-id'] ?? '').replace(/[^\w.-]/g, '').slice(0, 64);
export function registerSpecs(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>('/api/jobs/:id/next-actions', async (req, reply) => {
    const j = jobs.get(req.params.id); if (!j || lib.metaOf(j.id).deletedAt) return reply.code(404).send({ error: 'not found' });
    const t0 = getTool(j.toolId);
    if (j.status === 'failed' || j.status === 'blocked') return { jobId: j.id, items: [], primary: { action: 'retry', label: 'Retry', method: 'POST', endpoint: `/api/jobs/${j.id}/retry` } };
    const out = j.outputs?.[0]?.url; if (j.status !== 'done' || !out) return { jobId: j.id, items: [], primary: j.status === 'canceled' ? { action: 'recreate', label: 'Recreate', tool: j.toolId, route: `${t0?.route ?? toolPage(j.toolId)}?recreate=${j.id}` } : null };
    const isVid = /\.(mp4|mov|webm)$/i.test(out); const isImg = /\.(png|jpe?g|webp)$/i.test(out);
    const items = NEXT.map(([tool, label]) => { const t = getTool(tool); if (!t || t.id === j.toolId) return null; const names = t.inputs.map((x) => x.name);
      const slot = isVid && names.includes('video') ? 'video' : isImg && names.includes('image') ? 'image' : isImg && names.includes('refs') ? 'refs' : null;
      return slot ? { tool: t.id, label, slot, route: `${t.route}?fromJob=${j.id}${slot === 'refs' ? '&as=ref' : ''}`, submit: { fromJob: j.id, ...(slot === 'refs' ? { as: 'ref' } : {}) } } : null; }).filter(Boolean);
    // B6: image → Turn to video (an item, primary:true); video → Recreate; audio → Use as soundtrack (both client routes, not items).
    const isAud = /\.(m4a|mp3|wav|ogg|flac|aac|opus)$/i.test(out);
    const tv = isImg ? items.find((x: any) => x.tool === 'h3-video') : null;
    const marked = items.map((x: any) => ({ ...x, primary: x === tv }));
    const primary = tv ? { action: 'turn-to-video', label: tv.label, tool: tv.tool, route: tv.route }
      : isAud ? { action: 'use-as-soundtrack', label: 'Use as soundtrack', tool: 'soundtrack', route: `/tools/soundtrack?from=${j.id}` }
      : { action: 'recreate', label: 'Recreate', tool: j.toolId, route: `${t0?.route ?? toolPage(j.toolId)}?recreate=${j.id}` };
    return { jobId: j.id, items: marked, primary };
  });

  app.post<{ Params: { id: string }; Body: { visibility?: string; showPrompt?: boolean } }>('/api/jobs/:id/visibility', async (req, reply) => {
    const j = jobs.get(req.params.id); if (!j || lib.metaOf(j.id).deletedAt) return reply.code(404).send({ error: 'not found' });
    const v = String(req.body?.visibility ?? ''); if (!(VIS as readonly string[]).includes(v)) return reply.code(400).send(bad('visibility', 'visibility must be private, unlisted or public.'));
    if (v !== 'private' && j.status !== 'done') return reply.code(409).send({ error: 'Only finished results can be shared or published.', errorType: 'validation' });
    if (v === 'private') { lib.unpublishJob(j.id); lib.unshareJob(j.id); }
    if (v === 'unlisted') { lib.unpublishJob(j.id); lib.shareJob(j.id); }
    if (v === 'public') lib.publishJob(j.id, req.body?.showPrompt !== false);
    const m = lib.metaOf(j.id);
    return { jobId: j.id, visibility: visibilityOf(j.id), showPrompt: m.published ? m.published.showPrompt : null, shareToken: m.shareToken ?? null, shareUrl: m.shareToken ? `/s/${m.shareToken}` : null };
  });

  /** Round 1: this browser's like state for a public shot {id, likes, liked}. */
  app.get<{ Params: { id: string } }>('/api/community/shots/:id/like', async (req, reply) => {
    const j = jobs.get(req.params.id); const m = j ? lib.metaOf(j.id) : null;
    if (!j || !m?.published || m.deletedAt) return reply.code(404).send({ error: 'This shot isn’t public.', errorType: 'not_found' });
    return { id: j.id, likes: lib.likesOf(j.id), liked: lib.likedBy(j.id, clientOf(req)) };
  });
  /** Round 1: like / unlike a public shot. One like per browser (X-Client-Id) on this install; counts start at 0. Body {on?: boolean} (default true). */
  app.post<{ Params: { id: string }; Body: { on?: boolean } }>('/api/community/shots/:id/like', async (req, reply) => {
    const j = jobs.get(req.params.id); const m = j ? lib.metaOf(j.id) : null;
    if (!j || !m?.published || m.deletedAt) return reply.code(404).send({ error: 'This shot isn’t public.', errorType: 'not_found' });
    const c = clientOf(req); if (!c) return reply.code(400).send(bad('X-Client-Id', 'Send X-Client-Id so a like counts once per browser.', 'required'));
    lib.setLike(j.id, c, req.body?.on !== false);
    return { id: j.id, likes: lib.likesOf(j.id), liked: lib.likedBy(j.id, c) };
  });
  /** Page 17: public (published) jobs only. ?sort=trending|new&toolId=&cursor=&limit= */
  app.get<{ Querystring: { sort?: string; toolId?: string; cursor?: string; limit?: string } }>('/api/community/shots', async (req, reply) => {
    reseedIfDue();
    const sort = req.query.sort === 'new' ? 'new' : 'trending'; if (req.query.toolId && !getTool(req.query.toolId)) return reply.code(404).send(bad('toolId', `unknown tool ${req.query.toolId}`, 'unknown'));
    const now = Date.now(); let items = [...jobs.values()].filter((j) => { const m = lib.metaOf(j.id); return j.status === 'done' && !!m.published && !m.deletedAt && (!req.query.toolId || j.toolId === req.query.toolId); })
      .map((j) => { const m = lib.metaOf(j.id); const t = getTool(j.toolId); const o = j.outputs?.[0]?.url ?? j.resultUrl ?? null; const vid = !!o && /\.(mp4|webm|mov)$/i.test(o);
        const smp = sampleFor(o);
        const isSample = j.toolId === SAMPLE_TOOL_ID;
        return { id: j.id, toolId: isSample ? null : j.toolId, toolName: isSample ? null : t?.name ?? j.toolId, kind: isSample ? 'sample' : 'result', aiGenerated: m.aiGenerated ?? true, sampleCredit: m.sampleCredit ?? (isSample ? smp?.label ?? null : null), sampleLabel: smp?.label ?? null, sample: smp, author: (m as any).author || 'you', title: (m as any).title || (m.published!.showPrompt && j.input.prompt ? String(j.input.prompt).slice(0, 80) : (t?.name ?? j.toolId)), shareToken: m.shareToken ?? null, posterUrl: vid ? metaOfUrl(o!).posterUrl ?? (isSample && smp ? o!.replace(/\.mp4$/, '.jpg') : null) ?? (t as any)?.posterUrl ?? null : o, previewUrl: o, prompt: m.published!.showPrompt ? (j.input.prompt || null) : null, showPrompt: m.published!.showPrompt, likes: lib.likesOf(j.id), liked: lib.likedBy(j.id, clientOf(req)), attribution: jobAttribution(j), createdAt: j.createdAt, publishedAt: m.published!.at, shareUrl: m.shareToken ? `/s/${m.shareToken}` : null }; });
    const score = (x: any) => (1 + x.likes) / Math.pow((now - x.publishedAt) / 3600_000 + 2, 0.8);
    items.sort((a, b) => (sort === 'new' ? b.publishedAt - a.publishedAt : score(b) - score(a)));
    const total = items.length; const off = Math.max(0, Number(req.query.cursor) || 0); const lim = Math.min(100, Math.max(1, Number(req.query.limit) || 40));
    items = items.slice(off, off + lim);
    return { sort, items, total, nextCursor: off + lim < total ? String(off + lim) : null };
  });
  // ---- Aliases + plans list (GAP-MATRIX) ----
  app.get('/api/licences', async (req, reply) => { const r = await app.inject({ method: 'GET', url: '/api/licenses' }); return reply.code(r.statusCode).header('content-type', 'application/json').send(r.body); }); // British spelling alias
  /** GET /api/price?toolId=&model=&…: alias of GET /api/tools/:toolId/price (same routed credits, cloud models included). toolId may be omitted when model names a provider; the first tool that offers it is used. */
  app.get<{ Querystring: Record<string, string> }>('/api/price', async (req, reply) => {
    const q = { ...req.query }; const model = q.model || q.provider; let toolId: string | undefined = q.toolId || q.tool;
    const { findToolModel } = await import('./routing/modelRegistry.js'); const { getProvider } = await import('./providers.js'); const isKey = !!model && !getProvider(model); // step 2: a model key (not an engine id) stays model= (the price hook resolves it)
    const home = [...listTools()].sort((a, b) => Number(b.id === 'h3-video') - Number(a.id === 'h3-video')); // video models: Generate Video first (Camera Moves lists MiniMax H3 too)
    if (!toolId && model) toolId = home.find((t) => (t.providers ?? []).includes(model))?.id ?? home.find((t) => !!findToolModel(t, model))?.id;
    if (!toolId) return reply.code(400).send(bad('toolId', 'Pass toolId (or a model that a tool offers).', 'required'));
    delete q.toolId; delete q.tool; if (model && !isKey) { q.provider = model; delete q.model; }
    const r = await app.inject({ method: 'GET', url: `/api/tools/${encodeURIComponent(toolId)}/price?${new URLSearchParams(q)}` });
    return reply.code(r.statusCode).header('content-type', 'application/json').send({ toolId, ...(r.json() as any) });
  });
  app.get('/api/plans', async () => { const pr = (await app.inject({ method: 'GET', url: '/api/pricing' })).json() as any;
    const items = (pr.plans ?? []) as any[]; return { items, total: items.length, topUps: pr.topUps ?? [], plansNote: pr.plansNote ?? null, unit: pr.unit ?? 'credit (1 credit = $0.01)', billing: false, pricingModel: pr.pricingModel ?? null, notice: 'No subscriptions and no payments: pay per run at provider cost, local and open-weights runs are free, credits never expire.', /* user-facing; developer note below */ detail: 'POST /api/plans/:id/choose is a documented no-op (200 chosen:false, charged:false).' }; });

  // ---- Saved looks (moodboard picker 'My looks'): GET /api/looks[?mine=1&q=], POST {name, refs[], toolId?}, DELETE /api/looks/:id ----
  type Look = { id: string; name: string; refs: string[]; toolId: string | null; createdAt: number; updatedAt?: number };
  const loadLooks = () => getKv<Look[]>('looks', []); const saveLooks = (xs: Look[]) => setKv('looks', xs);
  const fileOk = (u: string) => (u.startsWith('/files/') && !u.includes('..') && existsSync(path.join(DATA_DIR, u.slice(7)))) || /^\/samples\/[\w\-./]+$/.test(u);
  const curated = () => listTools().filter((t) => ['photo-fx', 'soul'].includes(t.id) || (t as any).app?.moodboard).flatMap((t) => (t.presets ?? []).map((p: any) => ({ id: `${t.id}:${p.id}`, name: p.label, refs: (p.refs ?? []).filter(Boolean), posterUrl: p.posterUrl ?? null, previewWebm: p.previewWebm ?? null, toolId: t.id, presetId: p.id, source: 'curated' as const, createdAt: null })));
  app.get<{ Querystring: { mine?: string; q?: string; toolId?: string } }>('/api/looks', async (req) => {
    const mine = loadLooks().map((l) => ({ ...l, posterUrl: l.refs[0] ?? null, previewWebm: null, presetId: null, source: 'mine' as const })).sort((a, b) => b.createdAt - a.createdAt);
    let items: any[] = /^(1|true)$/i.test(req.query.mine ?? '') ? mine : [...mine, ...curated()];
    if (req.query.toolId) items = items.filter((x) => !x.toolId || x.toolId === req.query.toolId);
    const q = (req.query.q ?? '').trim().toLowerCase(); if (q) items = items.filter((x) => x.name.toLowerCase().includes(q));
    return { items, total: items.length, mineCount: mine.length, maxRefs: 10 };
  });
  app.post<{ Body: { name?: string; refs?: string[]; toolId?: string } }>('/api/looks', async (req, reply) => {
    const name = String(req.body?.name ?? '').trim().slice(0, 60); if (!name) return reply.code(400).send(bad('name', 'Give the look a name.', 'required'));
    const refs = Array.isArray(req.body?.refs) ? req.body!.refs.map(String) : []; if (!refs.length) return reply.code(400).send(bad('refs', 'Add at least one reference image.', 'required'));
    if (refs.length > 10) return reply.code(400).send(bad('refs', 'A look holds up to 10 references.', 'too_many'));
    const badRef = refs.find((u) => !fileOk(u)); if (badRef) return reply.code(400).send(bad('refs', `Reference not found: ${badRef} (use a /files/ upload or a /samples/ image).`, 'not_found'));
    if (req.body?.toolId && !getTool(req.body.toolId)) return reply.code(400).send(bad('toolId', `unknown tool ${req.body.toolId}`, 'unknown'));
    const look: Look = { id: `look-${randomUUID().slice(0, 8)}`, name, refs, toolId: req.body?.toolId ?? null, createdAt: Date.now() };
    const xs = loadLooks(); if (xs.length >= 200) return reply.code(409).send({ error: 'You can save up to 200 looks. Delete one first.', errorType: 'validation', code: 'limit' });
    saveLooks([look, ...xs]); return reply.code(201).send({ ...look, posterUrl: refs[0], source: 'mine' });
  });
  app.get<{ Params: { id: string } }>('/api/looks/:id', async (req, reply) => {
    const l = loadLooks().find((x) => x.id === req.params.id) ?? curated().find((x: any) => x.id === req.params.id);
    if (!l) return reply.code(404).send({ error: `look ${req.params.id} not found`, errorType: 'not_found' });
    return (l as any).source ? l : { ...l, posterUrl: l.refs[0] ?? null, source: 'mine' };
  });
  /** Rename / replace refs / move tool. Body: {name?, refs? (1–10, replaces the list), addRefs?, removeRefs?, toolId? (null = any tool)}. Curated looks are read-only (404). */
  app.patch<{ Params: { id: string }; Body: { name?: string; refs?: string[]; addRefs?: string[]; removeRefs?: string[]; toolId?: string | null } }>('/api/looks/:id', async (req, reply) => {
    const xs = loadLooks(); const l = xs.find((x) => x.id === req.params.id);
    if (!l) return reply.code(404).send({ error: `look ${req.params.id} not found (curated looks can't be edited)`, errorType: 'not_found' });
    const b = req.body ?? {}; const next = { ...l };
    if (b.name !== undefined) { const n = String(b.name).trim().slice(0, 60); if (!n) return reply.code(400).send(bad('name', 'Give the look a name.', 'required')); next.name = n; }
    let refs = Array.isArray(b.refs) ? b.refs.map(String) : [...l.refs];
    if (Array.isArray(b.addRefs)) refs = [...refs, ...b.addRefs.map(String).filter((u) => !refs.includes(u))];
    if (Array.isArray(b.removeRefs)) refs = refs.filter((u) => !b.removeRefs!.includes(u));
    if (!refs.length) return reply.code(400).send(bad('refs', 'A look needs at least one reference image.', 'required'));
    if (refs.length > 10) return reply.code(400).send(bad('refs', 'A look holds up to 10 references.', 'too_many'));
    const badRef = refs.find((u) => !fileOk(u)); if (badRef) return reply.code(400).send(bad('refs', `Reference not found: ${badRef} (use a /files/ upload or a /samples/ image).`, 'not_found'));
    next.refs = refs;
    if (b.toolId !== undefined) { if (b.toolId && !getTool(b.toolId)) return reply.code(400).send(bad('toolId', `unknown tool ${b.toolId}`, 'unknown')); next.toolId = b.toolId || null; }
    (next as any).updatedAt = Date.now(); saveLooks(xs.map((x) => (x.id === l.id ? next : x)));
    return { ...next, posterUrl: next.refs[0], source: 'mine' };
  });
  app.delete<{ Params: { id: string } }>('/api/looks/:id', async (req, reply) => {
    const xs = loadLooks(); if (!xs.some((l) => l.id === req.params.id)) return reply.code(404).send({ error: `look ${req.params.id} not found (curated looks can't be deleted)`, errorType: 'not_found' });
    saveLooks(xs.filter((l) => l.id !== req.params.id)); return { ok: true, id: req.params.id };
  });

  // ---- /effects/use: masonry of video effects (Photo FX + video presets with motion previews). ?category=&q=&cursor=&limit= ----
  app.get<{ Querystring: { category?: string; q?: string; cursor?: string; limit?: string } }>('/api/effects', async (req) => {
    const tools = listTools().filter((t) => ['photo-fx', 'object-swap', 'motion-transfer', 'restyle'].includes(t.id));
    let items: any[] = tools.flatMap((t) => (t.presets ?? []).map((p: any) => ({ id: p.id, toolId: t.id, toolName: t.name, label: p.label, category: p.category ?? p.group ?? t.name, posterUrl: p.posterUrl ?? null, previewWebm: p.previewWebm ?? null, previewUrl: p.previewUrl ?? null, aiGenerated: p.aiGenerated === true, credit: p.credit ?? null, route: `${t.route}?preset=${encodeURIComponent(p.id)}`, prefill: { toolId: t.id, preset: p.id, types: [p.id] } })));
    const categories = [...new Set(items.map((x) => x.category))];
    if (req.query.category) items = items.filter((x) => x.category === req.query.category);
    const q = (req.query.q ?? '').trim().toLowerCase(); if (q) items = items.filter((x) => `${x.label} ${x.id}`.toLowerCase().includes(q));
    const total = items.length; const off = Math.max(0, Number(req.query.cursor) || 0); const lim = Math.min(200, Math.max(1, Number(req.query.limit) || 60));
    return { categories, items: items.slice(off, off + lim), total, nextCursor: off + lim < total ? String(off + lim) : null };
  });
}
