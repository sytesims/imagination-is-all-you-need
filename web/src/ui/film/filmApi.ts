/**
 * Film REST client (server filmProjects.ts). Every edit is a list of ops on a revision: a 409 rev_conflict hands back the current film,
 * and the same ops are applied once more on top of it (they are whole-value sets, so re-applying is safe).
 * Errors carry the server's status, code and body (e.code 'route_changed', 'missing_frame', 'quote_required'…).
 */
import type { FilmOp, FilmProject, FilmSummary, FilmSample } from './types';
import { brandedPost } from './filmLogic';

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, { method, headers: body === undefined ? undefined : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e: any = new Error(d?.error ?? d?.message ?? `HTTP ${r.status}`); e.status = r.status; e.code = d?.code; e.body = d; throw e; }
  return d as T;
}
const base = (id: string) => `/api/films/${encodeURIComponent(id)}`;
const shot = (filmId: string, shotId: string, what: string) => `${base(filmId)}/shots/${encodeURIComponent(shotId)}/${what}`;
/** A response that carries the film (the doc itself, or { film }) → the film; else null. */
export const filmOf = (d: any): FilmProject | null => d && typeof d === 'object' ? (Array.isArray(d.shots) && typeof d.rev === 'number' ? d : d.film && Array.isArray(d.film.shots) ? d.film : null) : null;

export const listFilms = async (): Promise<FilmSummary[]> => (await call<{ items: FilmSummary[] }>('GET', '/api/films')).items ?? [];
export const createFilm = (title: string, aspect?: string) => call<FilmProject>('POST', '/api/films', { title, ...(aspect ? { aspect } : {}) });
export const getFilm = (id: string) => call<FilmProject>('GET', base(id));
export const deleteFilm = (id: string) => call('DELETE', base(id));
export const listSamples = async (): Promise<FilmSample[]> => (await call<{ items: FilmSample[] }>('GET', '/api/films/samples')).items ?? [];
export const openSample = (name: string) => call<FilmProject>('POST', `/api/films/samples/${encodeURIComponent(name)}`);
/** A new film opens with the IIAYN FILMS ident and the end credit on (the Stitch bar edits or turns them off). Best effort: a film without
 *  them still opens. */
export async function branded(f: FilmProject): Promise<FilmProject> {
  if (f.post.titleCard || f.post.endCard) return f;
  try { return await applyOps(f, [{ op: 'set_post', post: brandedPost() }]); } catch { return f; }
}

/** POST ops on baseRev; on a 409 rev_conflict re-apply them once on the film it returns. */
export async function applyOps(film: FilmProject, ops: FilmOp[]): Promise<FilmProject> {
  const post = (rev: number) => call<FilmProject>('POST', `${base(film.id)}/ops`, { baseRev: rev, ops });
  try { return await post(film.rev); }
  catch (e: any) { if (e?.status !== 409) throw e; const cur = filmOf(e.body) ?? await getFilm(film.id); return post(cur.rev); }
}
/** The price of rendering this card as set: the h3-video quote (credits, routeId, cost, demo…) plus `submit`. A 400 missing_frame still carries `quote`. */
export const quoteShot = (filmId: string, shotId: string) => call<any>('POST', shot(filmId, shotId, 'quote'), {});
/** Render with the price you saw (quote = charge): { job, take, film }. */
export const renderShot = (filmId: string, shotId: string, q: { quotedCredits: number; quotedRouteId?: string | null }) =>
  call<{ job: any; take: any; film: FilmProject }>('POST', shot(filmId, shotId, 'render'), { quotedCredits: q.quotedCredits, ...(q.quotedRouteId ? { quotedRouteId: q.quotedRouteId } : {}) });
/** This card starts on the exact last frame of the card before it: the film back. */
export const continueFrame = (filmId: string, shotId: string) => call<FilmProject>('POST', shot(filmId, shotId, 'continue-frame'), {});
/** A bridge card after `afterShotId`, into the next card's start still: { film, shotId }. */
export const addBridge = (filmId: string, afterShotId: string, prompt?: string) => call<{ film: FilmProject; shotId: string }>('POST', `${base(filmId)}/bridge`, { afterShotId, ...(prompt ? { prompt } : {}) });
/** The price of an AI join before it exists: a Continue card like `afterShotId`, or the default bridge (LTX-2.5, 4 s). Nothing runs. */
export const gapQuote = (filmId: string, afterShotId: string, kind: 'continue' | 'bridge') => call<any>('POST', `${base(filmId)}/gap-quote`, { afterShotId, kind });
/** A quick low-quality rough cut (not a job, not in Assets): { url, durationSec, shotIds, skipped, film }. */
export const previewFilm = (filmId: string) => call<{ url: string; durationSec: number | null; shotIds: string[]; skipped: { shotId: string; reason: string }[]; film: FilmProject }>('POST', `${base(filmId)}/preview`, {});
/** The full Stitch (free, on this computer): the compose job + { shotIds, skipped, film }. */
export const stitchFilm = (filmId: string) => call<any>('POST', `${base(filmId)}/stitch`, {});

/** A take's first or last frame as a still in the library (the shared prefill path Continue uses; the same frame twice is one file). Cached
 *  per job and end, so the chips under each take read once. */
const frames = new Map<string, Promise<string | null>>();
export function takeFrame(jobId: string, end: 'first' | 'last'): Promise<string | null> {
  const k = `${jobId}|${end}`; let p = frames.get(k);
  if (!p) { p = call<any>('GET', `/api/jobs/${encodeURIComponent(jobId)}/prefill?action=send-to&tool=h3-video&as=image&out=0&t=${end}${end === 'last' ? '&cont=1' : ''}`).then(d => d?.output?.frameUrl ?? null).catch(() => { frames.delete(k); return null; }); frames.set(k, p); }
  return p;
}

/** A start still made in place (Create Image, Generate mode): the price first, then the job with that price (quote = charge). */
export const STILL_TOOL = 'create-image';
const stillFields = (prompt: string, aspect: string) => ({ prompt, types: JSON.stringify(['generate']), aspect });
export const quoteStill = (prompt: string, aspect: string) => call<any>('GET', `/api/tools/${STILL_TOOL}/price?${new URLSearchParams(stillFields(prompt, aspect))}`);
export async function makeStill(prompt: string, aspect: string, q: { credits: number; routeId?: string | null }): Promise<{ id: string }> {
  const fd = new FormData(); Object.entries({ ...stillFields(prompt, aspect), rights: '1', quotedCredits: String(q.credits), ...(q.routeId ? { quotedRouteId: q.routeId } : {}) }).forEach(([k, v]) => fd.append(k, v));
  const r = await fetch(`/api/tools/${STILL_TOOL}/jobs`, { method: 'POST', body: fd }); const d = await r.json().catch(() => ({}));
  if (!r.ok || !d?.id) { const e: any = new Error(d?.error ?? `HTTP ${r.status}`); e.status = r.status; e.code = d?.code; e.body = d; throw e; }
  return d;
}
/** Wait for a job to finish: its first output's URL, or an error with the job's own message. */
export async function jobResult(id: string, every = 2000, tries = 180): Promise<string> {
  for (let i = 0; i < tries; i++) {
    const j = await call<any>('GET', `/api/jobs/${encodeURIComponent(id)}`);
    if (j?.status === 'done') { const u = j.resultUrl ?? j.outputs?.[0]?.url; if (u) return u; throw new Error('It finished without a picture.'); }
    if (j?.status === 'failed' || j?.status === 'canceled') throw new Error(j.error ?? 'It didn’t finish. Nothing more is charged for it.');
    await new Promise(r => setTimeout(r, every));
  }
  throw new Error('It’s taking a while. It will show up in Assets when it’s ready.');
}
