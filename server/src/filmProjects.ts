/**
 * Film (2026-10-27): the Film tab's projects. One row per film in the `films` table (db.ts JSON-row pattern); the document is
 * shared/filmProject.ts FilmProject. Edits are ops on a rev (a stale baseRev → 409 with the current film).
 *
 * Nothing here runs a model or ffmpeg itself. Every step goes through the existing routes (app.inject), so quotes, the quote = charge
 * handshake, agent budgets, the spend log and Assets all apply unchanged (there are no spending limits since 2026-10-28):
 *  - quote  → GET  /api/tools/h3-video/price  (the same fields the render sends, image=1 / lastFrame=1 for its stills)
 *  - render → POST /api/tools/h3-video/jobs   (multipart; stills sent as `@file:image` / `@file:lastFrame` library picks; quotedCredits required)
 *  - continue-frame / bridge → GET /api/jobs/:id/prefill?…&t=last&cont=1 (the exact last frame, videoFrame.ts)
 *  - stitch → POST /api/compose (free, on this computer): active takes in order with their trims, music / voice ducked, normalised, fade out.
 * Takes follow their jobs when a film is read (status, video, poster, cost); there is no polling loop.
 *
 *  GET    /api/films                                  → { items: FilmSummary[] } newest first (a built-in sample is added once when its jobs exist)
 *  POST   /api/films                  {title, aspect?} → 201 film
 *  GET    /api/films/samples                          → { items: [{name, title, note, available, missingJobs, shotCount, aspect}] }
 *  POST   /api/films/samples/:name                    → 201 film (a fresh copy; 409 when its jobs aren't on this computer)
 *  GET    /api/films/:id                              → film
 *  POST   /api/films/:id/ops          {baseRev, ops}  → film (rev + 1); 409 rev_conflict {film}; 400 {opIndex, field}
 *  DELETE /api/films/:id                              → { ok: true } (its jobs stay in Assets)
 *  POST   /api/films/:id/shots/:shotId/quote          → the Generate Video quote + submit {toolId, fields, files}
 *  POST   /api/films/:id/shots/:shotId/render  {quotedCredits, quotedRouteId?} → { job, take, film } (the job route's own errors pass through)
 *  POST   /api/films/:id/shots/:shotId/continue-frame → film (startFrom = the previous shot's active take's last frame)
 *  POST   /api/films/:id/gap-quote  {afterShotId, kind} → the quote for a Continue card or a bridge after that shot, before it exists (the gap chip)
 *  POST   /api/films/:id/bridge           {afterShotId} → { film, shotId } (a bridge shot: that shot's last frame → the next shot's start still)
 *  POST   /api/films/:id/stitch                       → the compose result (+ film, shotIds, skipped)
 *  POST   /api/films/:id/preview                      → { url, durationSec, shotIds, skipped, film }: a rough cut (≤360p, fast encode, the clips' own
 *                                                       sound, no music / levelling), not a job and not in Assets; the newest replaces the last
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { all, del, put, db, getKv, setKv } from './db.js';
import { SAMPLES_DIR, DATA_DIR } from './config.js';
import { mediaDuration, videoSize, hasAudio } from './ffmpeg.js';
import { composeRender, cleanTmp } from './compose.js';
import { clampTrim, parseSeams } from './agentBudget.js';
import { jobs, type Job } from './jobs.js';
import { metaOf } from './library.js';
import { jobSpendView, jobThumb } from './billing.js';
import { AGENT_HEADER } from './agentBudget.js';
import {
  zFilm, newFilm, applyOps, normalizeFilm, shotSubmit, filmStitchBody, activeTakeOf, startStillOf, zTake, BRIDGE_DEFAULTS, FILM_VIDEO_TOOL, FILM_TITLE_MAX, FILM_MAX_SHOTS,
  type FilmProject, type FilmShot, type FilmSummary,
} from './shared/filmProject.js';

/** A bridge's starting prompt (the user rewrites it: one continuous move from A to B, no cuts; skills/film-making). */
export const BRIDGE_PROMPT = 'One continuous, smooth camera move from the first frame to the last frame, with no cuts. The same people, clothes, place and light throughout.';
const VIDEO = /\.(mp4|mov|webm|mkv)(\?|$)/i;
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
const newId = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 10)}`;
const getRow = db.prepare('SELECT data FROM films WHERE id = ?');
const load = (id: string): FilmProject | null => { const r = getRow.get(id) as { data: string } | undefined; if (!r) return null; const p = zFilm.safeParse(JSON.parse(r.data)); return p.success ? p.data : null; };
const save = (f: FilmProject) => { put('films', f.id, f); return f; };

/** A job that can stand behind a take (not in Trash). */
const liveJob = (id: string | null | undefined): Job | null => { const j = id ? jobs.get(id) : undefined; return j && !metaOf(j.id).deletedAt ? j : null; };
const videoOut = (j: Job) => { const i = (j.outputs ?? []).findIndex((o) => VIDEO.test(o.url ?? '')); return i >= 0 ? { index: i, url: j.outputs![i].url } : null; };

/** Takes follow their jobs: status, video, poster, length and cost (the spend log's countedUsd). Writes back only when something changed (rev unchanged). */
export function refreshFilm(f: FilmProject): FilmProject {
  const before = JSON.stringify(f); const sp = { countedUsd: 0, actualUsd: 0, actualRuns: 0, quotedUsd: 0, runs: 0, sampleRuns: 0 };
  for (const s of f.shots) for (const t of s.takes) {
    const j = liveJob(t.jobId);
    if (!j) { t.status = 'missing'; continue; }
    const st = j.status === 'done' ? 'done' : j.status === 'queued' ? 'queued' : j.status === 'running' || j.status === 'needs_decision' ? 'running' : j.status === 'canceled' ? 'canceled' : 'failed';
    const v = st === 'done' ? videoOut(j) : null;
    const was = t.status; t.status = st === 'done' && !v ? 'failed' : st; t.url = v?.url ?? null;
    if (t.status === 'done' && was !== 'done' && !s.activeTakeId) s.activeTakeId = t.id; /* a finished take shows when the shot has none */
    t.error = t.status === 'failed' ? (j.error ?? (st === 'done' ? 'This job has no video.' : null)) : null;
    const th = jobThumb(j); t.posterUrl = th?.poster || ((j.outputs ?? []).find((o: any) => o?.posterUrl) as any)?.posterUrl || null;
    const d = Number((j as any).durationSec ?? j.input?.duration); t.durationSec = Number.isFinite(d) && d > 0 ? d : null;
    const sv = jobSpendView(j.id); t.costUsd = sv ? r4(sv.countedUsd || 0) : j.status === 'done' && (j.cost ?? 0) === 0 ? 0 : null;
    t.quotedUsd = sv ? r4(sv.estUsd || 0) : null; t.actualUsd = sv?.actualUsd != null ? r4(sv.actualUsd) : null; t.local = sv?.billedTo === 'local'; t.sample = !!(sv?.demo || sv?.simulated);
    sp.runs++; sp.countedUsd += t.costUsd ?? 0; sp.quotedUsd += t.sample ? 0 : t.quotedUsd ?? 0; if (t.actualUsd != null) { sp.actualUsd += t.actualUsd; sp.actualRuns++; } if (t.sample) sp.sampleRuns++;
  }
  for (const e of f.exports) { const j = liveJob(e.jobId); e.url = j ? (j.resultUrl ?? videoOut(j)?.url ?? null) : null; }
  if (f.preview && !existsSync(path.join(DATA_DIR, path.basename(f.preview.url)))) f.preview = null;
  f.spend = { ...sp, countedUsd: r4(sp.countedUsd), actualUsd: r4(sp.actualUsd), quotedUsd: r4(sp.quotedUsd) }; f.spentUsd = f.spend.countedUsd; normalizeFilm(f);
  if (JSON.stringify(f) !== before) save(f);
  return f;
}
const posterOf = (f: FilmProject): string | null => {
  for (const s of f.shots) { const t = activeTakeOf(s); if (t?.posterUrl) return t.posterUrl; }
  for (const s of f.shots) { const st = startStillOf(s); if (st) return st.url; }
  return null;
};
export const summaryOf = (f: FilmProject): FilmSummary => ({ id: f.id, title: f.title, aspect: f.aspect, shotCount: f.shots.length, updatedAt: f.updatedAt, createdAt: f.createdAt, posterUrl: posterOf(f), rev: f.rev, sample: f.sample });
export const getFilm = (id: string): FilmProject | null => { const f = load(id); return f ? refreshFilm(f) : null; };
export const listFilms = (): FilmSummary[] => all<unknown>('films').map((x) => zFilm.safeParse(x)).filter((p) => p.success).map((p) => summaryOf(refreshFilm(p.data!))).sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt);
/** Store a changed film: rev + 1, updatedAt now. */
const commit = (f: FilmProject) => { f.rev += 1; f.updatedAt = Date.now(); return save(normalizeFilm(f)); };

// ---------------------------------------------------------------- built-in samples (server/samples/films/<name>.json)
/** A sample film: small metadata only, media referenced by app URLs and job ids. It loads only when every job it names exists here. */
export interface FilmSample { name: string; title: string; note?: string; requiresJobs: string[]; film: Record<string, any> }
const SAMPLE_DIR = path.join(SAMPLES_DIR, 'films');
export function listSamples(): FilmSample[] {
  if (!existsSync(SAMPLE_DIR)) return [];
  return readdirSync(SAMPLE_DIR).filter((n) => n.endsWith('.json')).flatMap((n) => { try { const s = JSON.parse(readFileSync(path.join(SAMPLE_DIR, n), 'utf8')); return s?.name && s?.film ? [s as FilmSample] : []; } catch { return []; } });
}
const missingJobs = (s: FilmSample) => s.requiresJobs.filter((id) => !liveJob(id));
/** A film from a sample: takes attached to their jobs, an empty prompt filled with the prompt its first take was made with. */
export function filmFromSample(s: FilmSample): FilmProject | { error: string; code: string } {
  const now = Date.now(); const raw = structuredClone(s.film);
  const shots = (raw.shots ?? []).map((sh: any) => {
    const takes = (sh.takes ?? []).map((t: any) => zTake.parse({ id: newId('take'), jobId: t.jobId, status: 'queued', createdAt: now }));
    const first = takes[0] ? liveJob(takes[0].jobId) : null;
    return { ...sh, prompt: sh.prompt || String(first?.input?.prompt ?? ''), takes, activeTakeId: takes[0]?.id ?? null };
  });
  const p = zFilm.safeParse({ ...raw, id: newId('film'), rev: 0, shots, createdAt: now, updatedAt: now, sample: s.name });
  if (!p.success) return { error: `The sample ${s.name} can't be read: ${p.error.issues[0]?.path.join('.')}: ${p.error.issues[0]?.message}`, code: 'bad_sample' };
  return refreshFilm(save(normalizeFilm(p.data)));
}
/** Once per data folder: each sample whose jobs all exist is added to the list (deleting it doesn't bring it back). */
function seedSamples() {
  const done = getKv<string[]>('films.samples.seeded', []);
  for (const s of listSamples()) { if (done.includes(s.name) || missingJobs(s).length) continue; const f = filmFromSample(s); if (!('error' in f)) setKv('films.samples.seeded', [...done, s.name]); }
}

// ---------------------------------------------------------------- routes
const bad = (reply: FastifyReply, status: number, code: string, error: string, extra: Record<string, unknown> = {}) =>
  reply.code(status).send({ error, errorType: status === 404 ? 'not_found' : status === 409 ? 'conflict' : 'validation', code, ...extra });
const nothing = { refunded: false, amount: 0, charged: false, note: 'Nothing was charged.' };

/** multipart/form-data for app.inject: plain fields, and library picks as `@file:<field>` = /files/… URL (index.ts createJob links them in). */
function multipart(fields: Record<string, string>, files: Record<string, string>) {
  const boundary = `----ohffilm${randomUUID().replace(/-/g, '')}`; const part = (k: string, v: string) => `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`;
  const body = [...Object.entries(fields).map(([k, v]) => part(k, v)), ...Object.entries(files).map(([k, v]) => part(`@file:${k}`, v)), `--${boundary}--\r\n`].join('');
  return { payload: Buffer.from(body), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}
/** Headers a film call passes on to the routes it uses: the agent budget (the request's, else the film's), Idempotency-Key, client id. */
function passHeaders(req: FastifyRequest, f: FilmProject): Record<string, string> {
  const h: Record<string, string> = {}; const one = (k: string) => { const v = req.headers[k]; return Array.isArray(v) ? v[0] : v; };
  const ab = one(AGENT_HEADER) ?? f.budgetId ?? undefined; if (ab) h[AGENT_HEADER] = ab;
  for (const k of ['idempotency-key', 'x-client-id']) { const v = one(k); if (v) h[k] = v; }
  return h;
}

export function registerFilms(app: FastifyInstance) {
  const need = (id: string, reply: FastifyReply) => { const f = getFilm(id); if (!f) bad(reply, 404, 'not_found', 'No film with that id.'); return f; };
  const needShot = (f: FilmProject, shotId: string, reply: FastifyReply) => { const i = f.shots.findIndex((s) => s.id === shotId); if (i < 0) bad(reply, 404, 'unknown_shot', 'No shot with that id in this film.'); return i; };

  /** The exact last frame of a shot's active take (the shared Continue path). */
  async function lastFrameOf(s: FilmShot, reply: FastifyReply, what: string): Promise<{ url: string; jobId: string } | null> {
    const t = activeTakeOf(s); const j = t ? liveJob(t.jobId) : null; const v = j && t?.status === 'done' ? videoOut(j) : null;
    if (!t || !j || !v) { bad(reply, 409, 'take_not_ready', `${what} has no finished take yet. Render it (or pick a take) first.`, { shotId: s.id }); return null; }
    const r = await app.inject({ method: 'GET', url: `/api/jobs/${j.id}/prefill?action=send-to&tool=${FILM_VIDEO_TOOL}&as=image&out=${v.index}&t=last&cont=1` });
    let b: any = {}; try { b = r.json(); } catch { /* */ }
    const url = b?.output?.frameUrl; if (r.statusCode !== 200 || !url) { reply.code(r.statusCode >= 400 ? r.statusCode : 500).send({ ...b, error: b?.error ?? 'Could not read the last frame.', code: b?.code ?? 'frame_failed' }); return null; }
    return { url, jobId: j.id };
  }

  app.get('/api/films', async () => { seedSamples(); return { items: listFilms() }; });
  app.post<{ Body: { title?: unknown; aspect?: unknown } | undefined }>('/api/films', async (req, reply) => {
    const b = req.body ?? {}; const title = typeof b.title === 'string' ? b.title.replace(/\s+/g, ' ').trim().slice(0, FILM_TITLE_MAX) : '';
    const aspect = b.aspect == null || b.aspect === '' ? null : String(b.aspect);
    if (aspect && !/^\d{1,2}:\d{1,2}$/.test(aspect)) return bad(reply, 400, 'invalid_aspect', 'aspect is like "16:9", "9:16" or "1:1".', { field: 'aspect' });
    const n = all<{ title?: string }>('films').length;
    const f = save(newFilm({ id: newId('film'), title: title || `Untitled film ${n + 1}`, aspect, now: Date.now() }));
    return reply.code(201).send(f);
  });
  app.get('/api/films/samples', async () => ({ items: listSamples().map((s) => ({ name: s.name, title: s.title, note: s.note ?? null, available: !missingJobs(s).length, missingJobs: missingJobs(s),
    shotCount: Array.isArray(s.film.shots) ? s.film.shots.length : 0, aspect: typeof s.film.aspect === 'string' ? s.film.aspect : null })) }));
  app.post<{ Params: { name: string } }>('/api/films/samples/:name', async (req, reply) => {
    const s = listSamples().find((x) => x.name === req.params.name); if (!s) return bad(reply, 404, 'not_found', 'No sample film with that name.');
    const miss = missingJobs(s); if (miss.length) return bad(reply, 409, 'sample_unavailable', `This sample uses clips that aren't on this computer (${miss.length} missing).`, { missingJobs: miss });
    const f = filmFromSample(s); if ('error' in f) return bad(reply, 500, f.code, f.error);
    return reply.code(201).send(f);
  });
  app.get<{ Params: { id: string } }>('/api/films/:id', async (req, reply) => { const f = need(req.params.id, reply); if (!f) return reply; return reply.header('cache-control', 'no-store').send(f); });
  app.delete<{ Params: { id: string } }>('/api/films/:id', async (req, reply) => { const f = load(req.params.id); if (!f) return bad(reply, 404, 'not_found', 'No film with that id.');
    if (f.preview) rmSync(path.join(DATA_DIR, path.basename(f.preview.url)), { force: true }); del('films', req.params.id); return { ok: true, id: req.params.id }; });

  app.post<{ Params: { id: string }; Body: { baseRev?: unknown; ops?: unknown } | undefined }>('/api/films/:id/ops', async (req, reply) => {
    const f = need(req.params.id, reply); if (!f) return reply; const b = req.body ?? {};
    if (!Number.isInteger(b.baseRev)) return bad(reply, 400, 'invalid_rev', 'Send baseRev: the rev of the film you edited.', { field: 'baseRev' });
    if (!Array.isArray(b.ops) || !b.ops.length || b.ops.length > 200) return bad(reply, 400, 'invalid_ops', 'ops is a list of 1–200 edits.', { field: 'ops' });
    if (b.baseRev !== f.rev) return bad(reply, 409, 'rev_conflict', 'This film changed somewhere else. Here is the latest; apply your edit to it.', { rev: f.rev, film: f });
    const r = applyOps(f, b.ops, { newId, now: Date.now(), jobExists: (id) => !!liveJob(id) });
    if ('error' in r) return bad(reply, 400, r.code, r.error, { field: r.field, opIndex: r.opIndex });
    return refreshFilm(commit(r.film));
  });

  /** The quote for exactly what render sends (nothing runs, nothing is charged). */
  async function quoteFor(f: FilmProject, s: FilmShot) {
    const sub = shotSubmit(f, s); const qs = new URLSearchParams(sub.fields);
    if (sub.files.image) qs.set('image', '1'); if (sub.files.lastFrame) qs.set('lastFrame', '1');
    const r = await app.inject({ method: 'GET', url: `/api/tools/${FILM_VIDEO_TOOL}/price?${qs}` }); let q: any = {}; try { q = r.json(); } catch { /* */ }
    return { status: r.statusCode, quote: q, sub };
  }
  const missingBody = (s: FilmShot, missing: string[]) => ({ error: missing.includes('lastFrame') ? 'This bridge needs an end still (the next shot\'s start still).' : 'This shot needs a start still: make one, pick one from Assets, or continue from the previous shot.',
    errorType: 'validation', code: 'missing_frame', field: missing[0], missing, shotId: s.id, charged: false, refund: nothing });

  app.post<{ Params: { id: string; shotId: string } }>('/api/films/:id/shots/:shotId/quote', async (req, reply) => {
    const f = need(req.params.id, reply); if (!f) return reply; const i = needShot(f, req.params.shotId, reply); if (i < 0) return reply; const s = f.shots[i];
    const { status, quote, sub } = await quoteFor(f, s);
    if (sub.missing.length) return reply.code(400).send({ ...missingBody(s, sub.missing), quote });
    return reply.code(status).send({ ...quote, submit: { toolId: FILM_VIDEO_TOOL, fields: sub.fields, files: sub.files } });
  });

  /** The price of an AI join before it exists (the gap chip): "continue" = a next card like this one (same model, place, length and quality) from
   *  its last frame; "bridge" = the default bridge (LTX-2.5, 4 s, first and last frame). The frames aren't read here; the quote only needs to
   *  know there will be one. Nothing runs, nothing is charged. */
  app.post<{ Params: { id: string }; Body: { afterShotId?: unknown; kind?: unknown } | undefined }>('/api/films/:id/gap-quote', async (req, reply) => {
    const f = need(req.params.id, reply); if (!f) return reply; const after = String(req.body?.afterShotId ?? ''); const kind = String(req.body?.kind ?? '');
    const a = f.shots.find((s) => s.id === after); if (!a) return bad(reply, 404, 'unknown_shot', 'afterShotId: no shot with that id in this film.', { field: 'afterShotId' });
    if (kind !== 'continue' && kind !== 'bridge') return bad(reply, 400, 'invalid_kind', 'kind is "continue" or "bridge".', { field: 'kind' });
    const frame = { kind: 'last_frame', url: '/files/_gap-quote.png', jobId: null };
    const r = applyOps({ ...f, shots: [] }, [{ op: 'upsert_shot', shot: kind === 'bridge'
      ? { id: 'gap_quote', kind: 'bridge', prompt: BRIDGE_PROMPT, aspect: a.aspect, startFrom: frame, endFrame: { url: '/files/_gap-quote.png', jobId: null } }
      : { id: 'gap_quote', prompt: a.prompt || 'next shot', types: ['i2v'], startFrom: frame, aspect: a.aspect, ...(a.kind === 'bridge' ? {} : { modelKey: a.modelKey, runOn: a.runOn, resolution: a.resolution, durationSec: a.durationSec }) } }], { newId, now: Date.now() });
    if ('error' in r) return bad(reply, 400, r.code, r.error);
    const { status, quote } = await quoteFor(f, r.film.shots[0]);
    return reply.code(status).send({ ...quote, kind, ...(kind === 'bridge' ? { modelKey: BRIDGE_DEFAULTS.modelKey, durationSec: BRIDGE_DEFAULTS.durationSec } : { modelKey: a.kind === 'bridge' ? null : a.modelKey, durationSec: a.kind === 'bridge' ? null : a.durationSec }) });
  });

  app.post<{ Params: { id: string; shotId: string }; Body: { quotedCredits?: unknown; quotedRouteId?: unknown } | undefined }>('/api/films/:id/shots/:shotId/render', async (req, reply) => {
    const f = need(req.params.id, reply); if (!f) return reply; const i = needShot(f, req.params.shotId, reply); if (i < 0) return reply; const s = f.shots[i];
    const b = req.body ?? {}; const qc = b.quotedCredits == null || b.quotedCredits === '' ? NaN : Number(b.quotedCredits);
    if (!Number.isFinite(qc) || qc < 0) return bad(reply, 400, 'quote_required', 'Get the quote first (POST …/quote) and send its credits as quotedCredits, so the run costs what you saw.', { field: 'quotedCredits', charged: false, refund: nothing });
    if (s.takes.length >= 30) return bad(reply, 400, 'too_many_takes', 'This shot keeps 30 takes. Delete some first.');
    const sub = shotSubmit(f, s); if (sub.missing.length) return reply.code(400).send(missingBody(s, sub.missing));
    const fields = { ...sub.fields, rights: '1', quotedCredits: String(qc), ...(typeof b.quotedRouteId === 'string' && b.quotedRouteId ? { quotedRouteId: b.quotedRouteId } : {}) };
    const { payload, headers } = multipart(fields, sub.files);
    const r = await app.inject({ method: 'POST', url: `/api/tools/${FILM_VIDEO_TOOL}/jobs`, payload, headers: { ...headers, ...passHeaders(req, f) } });
    let body: any = {}; try { body = r.json(); } catch { /* */ }
    if (r.statusCode !== 200 || !body?.id) return reply.code(r.statusCode === 200 ? 500 : r.statusCode).send(body); /* the job route's answer as is (409 route_changed + fresh quote, 402, limits…) */
    const cur = load(f.id) ?? f; const at = cur.shots.findIndex((x) => x.id === s.id);
    const take = zTake.parse({ id: newId('take'), jobId: body.id, status: 'queued', createdAt: Date.now() });
    if (at >= 0) { cur.shots[at].takes.push(take); cur.shots[at].changed = false; }
    const saved = refreshFilm(commit(cur));
    return { job: body, take, film: saved };
  });

  app.post<{ Params: { id: string; shotId: string } }>('/api/films/:id/shots/:shotId/continue-frame', async (req, reply) => {
    const f = need(req.params.id, reply); if (!f) return reply; const i = needShot(f, req.params.shotId, reply); if (i < 0) return reply;
    if (i === 0) return bad(reply, 400, 'no_previous_shot', 'The first shot has nothing to continue from.');
    const fr = await lastFrameOf(f.shots[i - 1], reply, 'The previous shot'); if (!fr) return reply;
    const cur = load(f.id) ?? f; const s = cur.shots.find((x) => x.id === req.params.shotId); if (!s) return bad(reply, 404, 'unknown_shot', 'No shot with that id in this film.');
    s.startFrom = { kind: 'last_frame', url: fr.url, jobId: fr.jobId }; s.continueFromPrev = true; if (!s.types.includes('flf')) s.types = ['i2v'];
    if (!s.prompt.trim()) { const pj = liveJob(fr.jobId); const { continuePrompt } = await import('./shared/continueFrame.js'); s.prompt = continuePrompt(pj?.input?.prompt, s.durationSec ?? pj?.input?.duration); }
    if (s.takes.length) s.changed = true;
    return refreshFilm(commit(cur));
  });

  app.post<{ Params: { id: string }; Body: { afterShotId?: unknown; prompt?: unknown } | undefined }>('/api/films/:id/bridge', async (req, reply) => {
    const f = need(req.params.id, reply); if (!f) return reply; const after = String(req.body?.afterShotId ?? '');
    const i = f.shots.findIndex((s) => s.id === after); if (i < 0) return bad(reply, 404, 'unknown_shot', 'afterShotId: no shot with that id in this film.', { field: 'afterShotId' });
    if (f.shots.length >= FILM_MAX_SHOTS) return bad(reply, 400, 'too_many_shots', `A film has at most ${FILM_MAX_SHOTS} shots.`);
    const next = f.shots[i + 1]; if (!next) return bad(reply, 400, 'no_next_shot', 'A bridge goes between two shots. Add the next shot first.', { field: 'afterShotId' });
    const end = startStillOf(next); if (!end) return bad(reply, 409, 'next_has_no_still', 'The next shot has no start still yet, so the bridge has nowhere to land.', { shotId: next.id });
    const fr = await lastFrameOf(f.shots[i], reply, 'That shot'); if (!fr) return reply;
    const cur = load(f.id) ?? f;
    const r = applyOps(cur, [{ op: 'upsert_shot', index: cur.shots.findIndex((s) => s.id === after) + 1, shot: {
      kind: 'bridge', prompt: typeof req.body?.prompt === 'string' && req.body.prompt.trim() ? req.body.prompt : BRIDGE_PROMPT, aspect: f.shots[i].aspect,
      startFrom: { kind: 'last_frame', url: fr.url, jobId: fr.jobId }, endFrame: { url: end.url, jobId: end.jobId },
      notes: 'Bridge: one continuous move from the last frame to the next start still, no cuts (3–5 s).' } }], { newId, now: Date.now() });
    if ('error' in r) return bad(reply, 400, r.code, r.error);
    const saved = refreshFilm(commit(r.film)); const shotId = saved.shots[saved.shots.findIndex((s) => s.id === after) + 1]?.id;
    return reply.code(201).send({ film: saved, shotId });
  });

  app.post<{ Params: { id: string } }>('/api/films/:id/preview', async (req, reply) => {
    const f = need(req.params.id, reply); if (!f) return reply;
    const r = await renderPreview(f); if (!r.ok) return bad(reply, r.status, r.code, r.error, { skipped: r.skipped });
    const cur = load(f.id) ?? f; const old = cur.preview?.url; cur.preview = { url: r.url, createdAt: Date.now(), durationSec: r.durationSec, shotIds: r.shotIds };
    if (old && old !== r.url) rmSync(path.join(DATA_DIR, path.basename(old)), { force: true });
    save(cur); /* a preview isn't an edit: rev unchanged */
    return { url: r.url, durationSec: r.durationSec, shotIds: r.shotIds, skipped: r.skipped, film: refreshFilm(cur) };
  });

  app.post<{ Params: { id: string } }>('/api/films/:id/stitch', async (req, reply) => {
    const f = need(req.params.id, reply); if (!f) return reply;
    const { body, shotIds, skipped } = filmStitchBody(f);
    if (!shotIds.length) return bad(reply, 400, 'nothing_to_stitch', 'No shot has a finished take yet.', { skipped, charged: false, refund: nothing });
    const r = await app.inject({ method: 'POST', url: '/api/compose', payload: body, headers: { 'content-type': 'application/json', ...passHeaders(req, f) } });
    let out: any = {}; try { out = r.json(); } catch { /* */ }
    if (r.statusCode !== 200 || !out?.id) return reply.code(r.statusCode === 200 ? 500 : r.statusCode).send({ ...out, skipped });
    const cur = load(f.id) ?? f; cur.exports = [...cur.exports, { jobId: out.id, url: out.resultUrl ?? null, createdAt: Date.now(), durationSec: out.durationSec ?? null }].slice(-100);
    return { ...out, shotIds, skipped, film: refreshFilm(commit(cur)) };
  });
}
export { BRIDGE_DEFAULTS };

/** The rough cut: the same order, trims and seams as the stitch, through the same engine (compose.ts, draft mode), written next to the media. */
export async function renderPreview(f: FilmProject): Promise<{ ok: true; url: string; durationSec: number; shotIds: string[]; skipped: { shotId: string; reason: string }[] } | { ok: false; status: number; code: string; error: string; skipped: { shotId: string; reason: string }[] }> {
  const { body, shotIds, skipped } = filmStitchBody(f); const urls = body.clips as string[];
  if (!urls.length) return { ok: false, status: 400, code: 'nothing_to_stitch', error: 'No shot has a finished take yet.', skipped };
  const files = urls.map((u) => path.join(DATA_DIR, path.basename(decodeURIComponent(u.replace(/^\/files\//, '').split(/[?#]/)[0]))));
  const gone = files.findIndex((x) => !existsSync(x)); if (gone >= 0) return { ok: false, status: 409, code: 'missing_media', error: `Shot ${shotIds[gone]}: its video isn't on this computer.`, skipped };
  const sizes = await Promise.all(files.map(videoSize)); const bad1 = sizes.findIndex((x) => !x); if (bad1 >= 0) return { ok: false, status: 409, code: 'unreadable', error: `Shot ${shotIds[bad1]}: its video can't be read (is ffmpeg installed?).`, skipped };
  const full = await Promise.all(files.map(mediaDuration)); const auds = await Promise.all(files.map(hasAudio));
  const trims = (body.trims as ({ in?: number; out?: number } | null)[] | undefined) ?? [];
  const seams = parseSeams(body.seams, urls.length); const id = randomUUID().slice(0, 8); const tmp = path.join(DATA_DIR, `.${id}-filmprev`);
  const outName = `${f.id}-preview-${id}.mp4`; const out = path.join(DATA_DIR, outName);
  const r = await composeRender({ clips: files.map((file, i) => ({ file, full: full[i], cut: clampTrim(trims[i], full[i]), w: sizes[i]!.width, h: sizes[i]!.height, audio: auds[i] })), layout: 'sequence',
    aspect: null, fit: null, crop: { x: 0.5, y: 0.5 }, transition: (body.transition as any) ?? 'cut', transitionSec: Number(body.transitionSec) || 0.5, seams: 'error' in seams ? null : seams.list,
    draft: true, title: null, end: null, captions: [], music: null, voice: null, keepClip: true, mix: { clip: 1, music: 0, voice: 0, duck: false, duckAmount: 0, normalize: false },
    fade: Number(body.fadeOutSec) || 0, videoFade: body.videoFade === true, out, tmp });
  cleanTmp(tmp);
  if (!r.ok || !existsSync(out)) { rmSync(out, { force: true }); return { ok: false, status: 500, code: 'preview_failed', error: `ffmpeg could not join the shots (exit ${r.code}).`, skipped }; }
  return { ok: true, url: `/files/${outName}`, durationSec: r.total, shotIds, skipped };
}
