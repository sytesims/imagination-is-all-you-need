/**
 * Canvas boards (2026-10-24, step 1): the /canvas page's saved boards. One row per board in the `canvas_boards` table (db.ts JSON-row
 * pattern). The board document is the tldraw store snapshot JSON (getSnapshot(editor.store).document), stored as-is.
 *
 * Media never lives inside a snapshot: pictures dropped or uploaded on a board go through POST /api/media and the snapshot keeps
 * the /files/... URL. A save that carries inline data: media is refused (400 inline_media), so a board stays small and its files
 * stay in the media library (backups and media GC see them through the /files/ URLs).
 *
 *  GET    /api/canvas/boards           → { items: [{ id, name, createdAt, updatedAt, rev, shapes, projectId }] } newest first
 *  POST   /api/canvas/boards           { name? } → the new board (name defaults to "Untitled board N")
 *  GET    /api/canvas/boards/:id       → { id, name, createdAt, updatedAt, rev, snapshot }
 *  PATCH  /api/canvas/boards/:id       { name?, projectId? } → the board summary (rename; the board's project, null = All generations)
 *  PUT    /api/canvas/boards/:id       { snapshot, rev? } → { id, rev, updatedAt }; a stale rev → 409 rev_conflict
 *  POST   /api/canvas/boards/:id/save  same as PUT (for a keepalive save when the page closes)
 *  DELETE /api/canvas/boards/:id       → { ok: true }
 *  GET    /api/canvas/boards/:id/spend → { runs, running, estUsd, countedUsd, simulated } (step 2: jobs started from this board, input.boardId)
 */
import type { FastifyInstance, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import { all, del, put, db } from './db.js';
import { getProject, metaOf } from './library.js';
import { jobs } from './jobs.js';
import { jobSpendView, jobThumb } from './billing.js';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export interface CanvasBoard { id: string; name: string; createdAt: number; updatedAt: number; rev: number; snapshot: unknown | null; /** the board's project (Assets drawer filter; results made from the board go there in step 2); null = All generations */ projectId?: string | null }
export type BoardSummary = Omit<CanvasBoard, 'snapshot'> & { shapes: number };

/** Snapshots above this are refused (a board of URLs is a few hundred KB even with hundreds of shapes). */
export const MAX_SNAPSHOT_BYTES = 12 * 1024 * 1024;
export const MAX_NAME = 80;
const getRow = db.prepare('SELECT data FROM canvas_boards WHERE id = ?');
export const getBoard = (id: string): CanvasBoard | null => { const r = getRow.get(id) as { data: string } | undefined; return r ? JSON.parse(r.data) : null; };

/** Shapes on a board: records whose typeName is 'shape' in a tldraw document snapshot ({ store: { id: record } }). */
export function shapeCount(snapshot: unknown): number {
  const store = (snapshot as any)?.store ?? (snapshot as any)?.document?.store; if (!store || typeof store !== 'object') return 0;
  let n = 0; for (const r of Object.values(store)) if ((r as any)?.typeName === 'shape') n++; return n;
}
/** A project deleted since reads as null (All generations). */
const liveProject = (id: string | null | undefined) => (id && getProject(id) ? id : null);
export const summary = (b: CanvasBoard): BoardSummary => ({ id: b.id, name: b.name, createdAt: b.createdAt, updatedAt: b.updatedAt, rev: b.rev, shapes: shapeCount(b.snapshot), projectId: liveProject(b.projectId) });
export const listBoards = (): BoardSummary[] => all<CanvasBoard>('canvas_boards').map(summary).sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt);

/** "Untitled board N": one more than the highest N in use. */
export function nextBoardName(names: string[]): string {
  let max = 0; for (const n of names) { const m = /^Untitled board (\d+)$/.exec(n.trim()); if (m) max = Math.max(max, Number(m[1])); }
  return `Untitled board ${max + 1}`;
}
const cleanName = (v: unknown): string | null => { if (typeof v !== 'string') return null; const s = v.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME); return s || null; };

/** Where a snapshot carries inline media (a data: URL for an image, video or audio), or null when it holds URLs only. */
export function inlineMediaPath(v: unknown, at = ''): string | null {
  if (typeof v === 'string') return /^data:(image|video|audio)\//i.test(v) ? at || '(root)' : null;
  if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) { const p = inlineMediaPath(v[i], `${at}[${i}]`); if (p) return p; } return null; }
  if (v && typeof v === 'object') { for (const [k, x] of Object.entries(v)) { const p = inlineMediaPath(x, at ? `${at}.${k}` : k); if (p) return p; } }
  return null;
}

const bad = (reply: FastifyReply, code: string, error: string, status = 400) => reply.code(status).send({ error, errorType: status === 404 ? 'not_found' : status === 409 ? 'conflict' : 'validation', code });
const notFound = (reply: FastifyReply) => bad(reply, 'not_found', 'No board with that id.', 404);

export function createBoard(name?: unknown): CanvasBoard {
  const now = Date.now();
  const b: CanvasBoard = { id: `brd_${randomUUID().replace(/-/g, '').slice(0, 16)}`, name: cleanName(name) ?? nextBoardName(listBoards().map((x) => x.name)), createdAt: now, updatedAt: now, rev: 0, snapshot: null };
  put('canvas_boards', b.id, b); return b;
}

/** Validate and store a snapshot. Returns the saved board or an error tuple. */
export function saveSnapshot(id: string, body: any): CanvasBoard | { status: number; code: string; error: string; rev?: number } {
  const b = getBoard(id); if (!b) return { status: 404, code: 'not_found', error: 'No board with that id.' };
  const snap = body?.snapshot; if (!snap || typeof snap !== 'object' || Array.isArray(snap)) return { status: 400, code: 'invalid_snapshot', error: 'Send the board as { snapshot: { store, schema } }.' };
  if (!snap.store || typeof snap.store !== 'object' || !snap.schema || typeof snap.schema !== 'object') return { status: 400, code: 'invalid_snapshot', error: 'The snapshot needs a store and a schema.' };
  if (body.rev != null && Number(body.rev) !== b.rev) return { status: 409, code: 'rev_conflict', error: 'This board was saved somewhere else. Reload to get the latest.', rev: b.rev };
  const where = inlineMediaPath(snap); if (where) return { status: 400, code: 'inline_media', error: `Media must be uploaded, not stored inside the board (found inline data at ${where.slice(0, 120)}).` };
  const json = JSON.stringify(snap); if (json.length > MAX_SNAPSHOT_BYTES) return { status: 413, code: 'too_large', error: 'This board is too big to save.' };
  const name = cleanName(body.name);
  const nb: CanvasBoard = { ...b, ...(name ? { name } : {}), snapshot: snap, rev: b.rev + 1, updatedAt: Date.now() };
  put('canvas_boards', id, nb); return nb;
}

const ENDED_NO_RESULT = new Set(['failed', 'blocked', 'canceled']);
/** What a board's runs cost (step 2): every job started from it (input.boardId, not in Trash), summed from the spend log the Spend page
 *  uses (billing.ts jobSpendView). countedUsd is what counts against limits (sample / mock runs and uncharged failures count $0); estUsd is
 *  the estimate at submit, so a board of sample runs can still say what real runs would have cost (a failed or canceled run adds only what it was charged). */
export function boardSpend(id: string) {
  let runs = 0, running = 0, est = 0, counted = 0, simulated = 0, local = 0;
  for (const j of jobs.values()) {
    if ((j.input as any)?.boardId !== id || metaOf(j.id).deletedAt) continue; runs++; if (j.status === 'queued' || j.status === 'running') running++;
    // est: a run that ended without a result (failed, blocked, canceled) adds only what it was charged, never its estimate; done and running runs keep the estimate
    const v = jobSpendView(j.id); if (!v) continue; est += v.demo ? 0 : ENDED_NO_RESULT.has(j.status) ? v.countedUsd || 0 : v.estUsd || 0; counted += v.countedUsd || 0; if (v.simulated || v.demo) simulated++; if (v.billedTo === 'local') local++;
  }
  const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
  const recent = [...jobs.values()].filter(j => (j.input as any)?.boardId === id && !metaOf(j.id).deletedAt).sort((a, b) => b.createdAt - a.createdAt).slice(0, 6).map(j => {
    const v = jobSpendView(j.id); const th = jobThumb(j);
    return { id: j.id, model: j.modelName ?? (j.input as any)?.model ?? j.toolId, status: j.status, url: th?.url ?? '', poster: th?.poster ?? '', createdAt: j.createdAt,
      demo: !!v?.demo || !!j.simulated, local: v?.billedTo === 'local', estUsd: v?.estUsd ?? 0, countedUsd: v?.countedUsd ?? 0 };
  });
  return { runs, running, estUsd: r4(est), countedUsd: r4(counted), simulated, local, recent, limit: null }; // spending limits removed (2026-10-28): no cap to draw
}

// ---------------------------------------------------------------- link previews (a pasted link becomes a card with its title and picture)
/** A public web address only: http(s), and a host that is not this computer or a private network (no peeking at local services). */
const privateIp = (ip: string) => /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.|::1$|::$|f[cd][0-9a-f]{2}:|fe80:|::ffff:(127|10|192\.168)\.)/i.test(ip);
export async function publicUrl(raw: string): Promise<URL | null> {
  let u: URL; try { u = new URL(raw); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || !u.hostname || /^localhost$|\.local$|\.localhost$|\.internal$/i.test(u.hostname)) return null;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) return privateIp(host) ? null : u;
  try { const addrs = await lookup(host, { all: true }); return addrs.length && !addrs.some((a) => privateIp(a.address)) ? u : null; } catch { return null; }
}
const metaTag = (html: string, key: string) => {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*>`, 'i'); const tag = html.match(re)?.[0]; if (!tag) return '';
  return (tag.match(/content=["']([^"']*)["']/i)?.[1] ?? '').trim();
};
const unescapeHtml = (t: string) => t.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
/** Title, description, picture and icon of a public page (Open Graph first, then <title>). Small and quick: 5 s, the first 512 KB. */
export async function unfurl(raw: string): Promise<{ url: string; title: string; description: string; image: string; favicon: string } | null> {
  const u = await publicUrl(raw); if (!u) return null;
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    /* follow at most 3 redirects by hand, each one checked again (a public link must not bounce to a local address) */
    let at: URL | null = u; let r: Response | null = null;
    for (let hop = 0; hop < 4 && at; hop++) {
      r = await fetch(at, { signal: ctrl.signal, redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0 (link preview)', accept: 'text/html,*/*;q=0.5' } });
      const loc = r.status >= 300 && r.status < 400 ? r.headers.get('location') : null; if (!loc) break;
      at = await publicUrl(new URL(loc, at).href); r = null;
    }
    if (!r) return { url: u.href, title: u.hostname, description: '', image: '', favicon: '' };
    if (!r.ok || !/html/i.test(r.headers.get('content-type') ?? 'text/html') || !r.body) return { url: u.href, title: u.hostname, description: '', image: '', favicon: '' };
    const reader = r.body.getReader(); let html = ''; const dec = new TextDecoder();
    while (html.length < 512_000) { const { value, done } = await reader.read(); if (done) break; html += dec.decode(value, { stream: true }); if (/<\/head>/i.test(html)) break; }
    void reader.cancel().catch(() => undefined);
    const base = at?.href ?? u.href; const abs = (x: string) => { try { return x ? new URL(x, base).href : ''; } catch { return ''; } };
    const title = unescapeHtml(metaTag(html, 'og:title') || metaTag(html, 'twitter:title') || (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '').trim() || u.hostname).slice(0, 200);
    const description = unescapeHtml(metaTag(html, 'og:description') || metaTag(html, 'description')).slice(0, 400);
    const image = abs(metaTag(html, 'og:image') || metaTag(html, 'twitter:image'));
    const icon = html.match(/<link[^>]+rel=["'](?:apple-touch-icon|icon|shortcut icon)["'][^>]*>/i)?.[0]?.match(/href=["']([^"']+)["']/i)?.[1] ?? '/favicon.ico';
    return { url: u.href, title, description, image: /^https?:/.test(image) ? image : '', favicon: abs(icon) };
  } catch { return { url: u.href, title: u.hostname, description: '', image: '', favicon: '' }; }
  finally { clearTimeout(t); }
}

export function registerCanvasBoards(app: FastifyInstance) {
  app.get<{ Querystring: { url?: string } }>('/api/canvas/unfurl', async (req, reply) => {
    const raw = String(req.query.url ?? '').trim().slice(0, 2000);
    const r = raw ? await unfurl(raw) : null;
    if (!r) return reply.code(400).send({ error: 'That link can’t be previewed. Paste a public web address.', errorType: 'validation', code: 'bad_url' });
    reply.header('cache-control', 'private, max-age=3600'); return r;
  });
  app.get<{ Params: { id: string } }>('/api/canvas/boards/:id/spend', async (req, reply) => { if (!getBoard(req.params.id)) return notFound(reply); return reply.header('cache-control', 'no-store').send(boardSpend(req.params.id)); });
  app.get('/api/canvas/boards', async () => ({ items: listBoards() }));
  app.post<{ Body: { name?: string } | undefined }>('/api/canvas/boards', async (req, reply) => reply.code(201).send({ ...summary(createBoard(req.body?.name)), snapshot: null }));
  app.get<{ Params: { id: string } }>('/api/canvas/boards/:id', async (req, reply) => { const b = getBoard(req.params.id); if (!b) return notFound(reply); return reply.header('cache-control', 'no-store').send({ ...summary(b), snapshot: b.snapshot }); });
  /* rename ({name}) and/or set the board's project ({projectId}: an id from /api/projects, or null for All generations) */
  app.patch<{ Params: { id: string }; Body: { name?: string; projectId?: string | null } }>('/api/canvas/boards/:id', async (req, reply) => {
    const b = getBoard(req.params.id); if (!b) return notFound(reply); const body = req.body ?? {};
    if (!('name' in body) && !('projectId' in body)) return bad(reply, 'invalid_patch', 'Send a name or a projectId.');
    const name = 'name' in body ? cleanName(body.name) : b.name; if (!name) return bad(reply, 'invalid_name', 'Give the board a name.');
    let projectId = b.projectId ?? null;
    if ('projectId' in body) { const p = body.projectId; if (p !== null && (typeof p !== 'string' || !getProject(p))) return bad(reply, 'unknown_project', 'No project with that id.'); projectId = p; }
    const nb = { ...b, name, projectId, updatedAt: Date.now() }; put('canvas_boards', b.id, nb); return summary(nb);
  });
  const save = async (req: any, reply: FastifyReply) => {
    let body = req.body; if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return bad(reply, 'invalid_snapshot', 'The board could not be read.'); } }
    const r = saveSnapshot(req.params.id, body);
    if ('status' in r) return reply.code(r.status).send({ error: r.error, errorType: r.status === 404 ? 'not_found' : r.status === 409 ? 'conflict' : 'validation', code: r.code, ...(r.rev != null ? { rev: r.rev } : {}) });
    return { id: r.id, rev: r.rev, updatedAt: r.updatedAt, shapes: shapeCount(r.snapshot) };
  };
  app.put('/api/canvas/boards/:id', { bodyLimit: MAX_SNAPSHOT_BYTES + 64 * 1024 }, save);
  /* keepalive save on page close: sendBeacon / fetch keepalive may arrive as text/plain */
  app.post('/api/canvas/boards/:id/save', { bodyLimit: MAX_SNAPSHOT_BYTES + 64 * 1024 }, save);
  app.delete<{ Params: { id: string } }>('/api/canvas/boards/:id', async (req, reply) => { if (!getBoard(req.params.id)) return notFound(reply); del('canvas_boards', req.params.id); return { ok: true }; });
}
