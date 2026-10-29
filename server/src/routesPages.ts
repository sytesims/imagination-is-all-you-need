/** Asset counts, locating a job in a section, public projects and visibility. */
import type { FastifyInstance } from 'fastify';
import { jobs, type Job } from './jobs.js';
import { history } from './queue.js';
import * as lib from './library.js';
import { getKv, setKv } from './db.js';
import { isEnhanced, mediaOf } from './pages.js';
import { filterJobList, type JobListQuery } from './routesEdge.js';

const bad = (field: string, message: string, code = 'invalid') => ({ error: message, errorType: 'validation', issues: [{ code, field, message }] });
const isAsset = (j: Job) => j.status === 'done' && !!j.outputs?.length;
/** Same membership as GET /api/assets?section=all|favourites|trash (default view, no include=ended), same order. */
function section(sec: 'assets' | 'favourites' | 'trash') {
  return history().filter((j) => { const m = lib.metaOf(j.id); if (sec === 'trash') return !!m.deletedAt; if (m.deletedAt || !isAsset(j)) return false; return sec === 'favourites' ? !!m.favourite : true; });
}
type Vis = 'private' | 'public';
const visOf = (id: string): Vis => (getKv<Record<string, Vis>>('projectVisibility', {})[id] === 'public' ? 'public' : 'private');

export function registerPages(app: FastifyInstance) {
  app.get('/api/assets/counts', async () => {
    const all = section('assets'); const byMedia = { image: 0, video: 0, audio: 0, enhanced: 0 };
    for (const j of all) { byMedia[mediaOf(j)]++; if (isEnhanced(j as any)) byMedia.enhanced++; }
    return { all: all.length, projects: lib.listProjects().length, favourites: section('favourites').length, elements: lib.listElements().length, trash: section('trash').length, byMedia };
  });

  /** Where a job sits in a list. Default section=jobs: exactly the GET /api/jobs list (same filters, same sort, same query params:
   *  status, state, tool/toolId, from, to, q, media, enhanced, since). pageSize (alias limit) defaults to the list's own page size (50; 200 with status/state).
   *  section=assets|favourites|trash: the GET /api/assets?section=all|favourites|trash membership (done jobs only), pageSize default 50. */
  app.get<{ Params: { id: string }; Querystring: JobListQuery & { section?: string; pageSize?: string } }>('/api/jobs/:id/locate', async (req, reply) => {
    const sec = (req.query.section || 'jobs') as any; if (!['jobs', 'assets', 'favourites', 'trash'].includes(sec)) return reply.code(400).send(bad('section', 'section must be jobs, assets, favourites or trash'));
    if (!jobs.get(req.params.id)) return reply.code(404).send({ error: `job ${req.params.id} not found`, errorType: 'not_found' });
    let list: { id: string }[]; let pageSize: number; let filters: Record<string, string> | undefined;
    if (sec === 'jobs') {
      const { section: _s, pageSize: ps, cursor: _c, limit, ...f } = req.query; const r = filterJobList({ ...f, limit: ps || limit });
      if ('error' in r) return reply.code(400).send(bad(r.error.field, r.error.message));
      list = r.all; pageSize = Math.max(1, r.defaultLimit); filters = Object.fromEntries(Object.entries(f).filter(([, v]) => v != null && v !== '')) as Record<string, string>;
    } else { list = section(sec); pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize || req.query.limit) || 50)); }
    const pos = list.findIndex((j) => j.id === req.params.id);
    if (pos < 0) return reply.code(404).send({ error: `job ${req.params.id} is not in ${sec === 'jobs' ? 'the job list with these filters' : sec}`, errorType: 'not_found', section: sec, ...(filters ? { filters } : {}) });
    const page = Math.floor(pos / pageSize) + 1; const start = (page - 1) * pageSize;
    return { section: sec, pageSize, page, cursor: start ? String(start) : null, index: pos - start, position: pos, total: list.length, ...(filters ? { filters } : {}) };
  });

  app.get<{ Querystring: { cursor?: string; limit?: string } }>('/api/projects/public', async (req) => {
    const vis = getKv<Record<string, Vis>>('projectVisibility', {}); const profile = getKv<{ displayName?: string | null }>('profile', {});
    const all = lib.listProjects().filter((p) => vis[p.id] === 'public').map((p) => {
      const js = [...jobs.values()].filter((j) => lib.metaOf(j.id).projectId === p.id && !lib.metaOf(j.id).deletedAt).sort((a, b) => b.createdAt - a.createdAt);
      const poster = js.find(isAsset)?.outputs.find((o) => /\.(png|jpe?g|webp|gif)(\?|$)/i.test(o.url))?.url ?? js.find(isAsset)?.outputs[0]?.url ?? null;
      return { id: p.id, name: p.name, author: profile.displayName || 'you', posterUrl: poster, visibility: 'public' as const, count: js.length, updatedAt: Math.max(p.createdAt, js[0]?.createdAt ?? 0) };
    }).sort((a, b) => b.updatedAt - a.updatedAt);
    const off = Math.max(0, Number(req.query.cursor) || 0); const lim = Math.min(100, Math.max(1, Number(req.query.limit) || 24));
    return { items: all.slice(off, off + lim), total: all.length, nextCursor: off + lim < all.length ? String(off + lim) : null };
  });

  app.post<{ Params: { id: string }; Body: { visibility?: unknown } }>('/api/projects/:id/visibility', async (req, reply) => {
    if (!lib.getProject(req.params.id)) return reply.code(404).send({ error: 'project not found', errorType: 'not_found' });
    const v = req.body?.visibility; if (v !== 'private' && v !== 'public') return reply.code(400).send(bad('visibility', "visibility must be 'private' or 'public'"));
    const m = { ...getKv<Record<string, Vis>>('projectVisibility', {}) }; if (v === 'public') m[req.params.id] = 'public'; else delete m[req.params.id]; setKv('projectVisibility', m);
    return { id: req.params.id, visibility: visOf(req.params.id) };
  });
}
