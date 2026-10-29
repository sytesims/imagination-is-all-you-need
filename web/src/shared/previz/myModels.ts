/**
 * Your 3D models for Direct a Shot (2026-10-27): what the Add props drawer's "Your models" tab lists and how one becomes a placed model.
 *  - your finished 3D jobs (Image to 3D, from the jobs API; a job that has a light web copy shipped with the app uses that copy),
 *  - GLBs you uploaded (POST /api/3d/upload, GET /api/3d/uploads),
 *  - the example character (Mossbun, from Explore's model sheets), so a fresh install can try it for free.
 * The words the Render uses for a model: the example's own, else the source picture's prompt (the 3D job's parent), else its name; you can edit them.
 */
import { useEffect, useState } from 'react';
import { getJob, listJobs, type JobState } from '../../api';
import { posterOf3d } from '../model3d';
import { EXPLORE_SHEETS } from '../../../../server/src/shared/exploreShowcase';
import { cleanWords, MODEL_DESC_MAX, MODEL_NAME_MAX, MODEL_MAX_BYTES } from '../../../../server/src/shared/previzModels';
import { rolesOf, canMove } from '../../../../server/src/shared/previzRig';
import { MOSSBUN_RIG, MOSSBUN_STATIC } from '../rig/mossbunRig';

export interface ModelChoice { key: string; src: string; job?: string; name: string; desc: string; poster: string | null; tag: 'yours' | 'upload' | 'example'; front: number }
/** the cast with a shipped 3D copy (Mossbun): its job id, file, words, picture */
const SHIPPED = EXPLORE_SHEETS.cast.flatMap((c) => (c.threeD ? [{ name: c.name, face: c.face, ...c.threeD }] : []));
const shippedFor = (jobId: string) => SHIPPED.find((s) => jobId === s.jobId || jobId.startsWith(s.jobId));
/** a shipped character with its own rig plays that copy (Mossbun: his own skeleton and moves) */
const rigOf = (url: string) => (url === MOSSBUN_STATIC ? MOSSBUN_RIG : url);
export const EXAMPLE_CHOICES: ModelChoice[] = SHIPPED.map((s) => ({ key: `example:${s.name.toLowerCase()}`, src: rigOf(s.url), name: s.name, desc: s.desc ?? s.name, poster: s.url.replace(/-3d\.glb$/, '-480.webp'), tag: 'example', front: s.front ?? 0 }));
const short = (s: string) => { const t = s.replace(/\s+/g, ' ').trim(); const first = t.split(/(?<=[.!?])\s/)[0] ?? t; return cleanWords(first.length > 20 ? first : t, MODEL_DESC_MAX).replace(/[.\s]+$/, ''); };

/** A finished 3D job as a choice (null when it isn't one). */
export function choiceOfJob(j: JobState): ModelChoice | null {
  const url = [j.resultUrl, ...(j.outputs ?? []).map((o) => o.url)].find((u) => u && /^\/files\/[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.glb$/i.test(u) && !u.includes('..')); if (j.status !== 'done' || (j as any).deletedAt || !url) return null;
  const ship = shippedFor(j.id); const model = String((j as any).model ?? '').trim(); const rig = (j.input as any)?.rig;
  return { key: `job:${j.id}`, src: ship ? rigOf(ship.url) : url, job: j.id, name: ship?.name ?? cleanWords(rig ? `${rig.name ?? 'Character'}, rigged` : model ? `${model} model` : '3D model', MODEL_NAME_MAX), desc: ship?.desc ?? '', poster: posterOf3d(j) ?? (j.input as any)?.imageUrl ?? null, tag: 'yours', front: ship?.front ?? 0 };
}
/** The words for a job's model: the shipped words, else the prompt of the picture it was made from (one sentence), else ''. */
export async function describeChoice(c: ModelChoice): Promise<string> {
  if (c.desc || !c.job) return c.desc;
  try { const j = await getJob(c.job); const own = String((j.input as any)?.prompt ?? '').trim(); if (own) return short(own);
    const parent = (j as any).parentId ?? (j.input as any)?.fromJob; if (parent) { const p = await getJob(String(parent)); const pp = String((p.input as any)?.prompt ?? '').trim(); if (pp) return short(pp); } } catch { /* no words: the field stays for you to fill */ }
  return '';
}
/** A 3D job by id as a choice (Use in Direct a Shot), or an example by its key. */
export async function choiceById(id: string): Promise<ModelChoice | null> {
  const ex = EXAMPLE_CHOICES.find((c) => c.key === id || c.key === `example:${id}`); if (ex) return ex;
  try { const j = await getJob(id); const c = choiceOfJob(j); return c ? { ...c, desc: await describeChoice(c) } : null; } catch { return null; }
}
const uploadChoice = (u: { url: string; name: string }): ModelChoice => ({ key: `upload:${u.url}`, src: u.url, name: u.name, desc: '', poster: null, tag: 'upload', front: 0 });
/** Upload a GLB (checked here for size, on the server for the rest). Resolves with its choice, or rejects with the reason in plain words. */
export async function uploadModel(f: File): Promise<ModelChoice> {
  if (!/\.glb$/i.test(f.name)) throw new Error('Pick a .glb file (binary glTF).');
  if (f.size > MODEL_MAX_BYTES) throw new Error(`That GLB is larger than ${Math.round(MODEL_MAX_BYTES / 1048576)} MB. Make a lighter copy and try again.`);
  const fd = new FormData(); fd.append('model', f, f.name); const r = await fetch('/api/3d/upload', { method: 'POST', body: fd }); const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b.error || 'That GLB could not be uploaded.'); bump(); return uploadChoice(b);
}
const subs = new Set<() => void>(); const bump = () => subs.forEach((f) => f());
/** Rig as a character: a new rigged result shows in the list at once. */
export const refreshModelChoices = () => bump();
const movesCache = new Map<string, Promise<boolean>>();
/** Whether a GLB has moves (an idle, walk or run clip: a rigged character), read from its JSON chunk only. Cached per page. */
/** what glbHasMoves has found so far (for code that can't wait: Build mode's Make it the actor) */
export const knownMoves = new Map<string, boolean>([[MOSSBUN_RIG, true]]);
export function glbHasMoves(src: string): Promise<boolean> {
  let p = movesCache.get(src); if (!p) { p = fetch(src).then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => { if (!b || b.byteLength < 20) return false; const v = new DataView(b); if (v.getUint32(0, true) !== 0x46546c67) return false;
    const len = v.getUint32(12, true); const j = JSON.parse(new TextDecoder().decode(new Uint8Array(b, 20, len))); return canMove(rolesOf((j.animations ?? []).map((a: any) => String(a.name ?? '')))); }).catch(() => false).then((x) => { knownMoves.set(src, x); return x; }); movesCache.set(src, p); }
  return p;
}
export function useGlbMoves(src: string | null): boolean { const [has, setHas] = useState(false);
  useEffect(() => { let live = true; setHas(false); if (src) void glbHasMoves(src).then((x) => { if (live) setHas(x); }); return () => { live = false; }; }, [src]); return has; }
/** The drawer's list (loaded while it is open): your 3D jobs newest first, your uploads, then the example. */
export function useModelChoices(on: boolean): { items: ModelChoice[] | null; error: string | null; reload: () => void } {
  const [items, setItems] = useState<ModelChoice[] | null>(null); const [error, setError] = useState<string | null>(null); const [n, setN] = useState(0);
  useEffect(() => { const f = () => setN((x) => x + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  useEffect(() => { if (!on) return; let live = true;
    Promise.allSettled([listJobs('three-d'), fetch('/api/3d/uploads').then((r) => { if (!r.ok) throw new Error('Uploads unavailable'); return r.json(); })]).then(([jr, ur]) => {
      const jobs: JobState[] = jr.status === 'fulfilled' ? jr.value : []; const up = ur.status === 'fulfilled' ? ur.value : { uploads: [] };
      if (!live) return; const mine = jobs.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)).map(choiceOfJob).filter((c): c is ModelChoice => !!c);
      setItems([...mine, ...((up.uploads ?? []) as { url: string; name: string }[]).map(uploadChoice), ...EXAMPLE_CHOICES]); setError(jr.status === 'rejected' || ur.status === 'rejected' ? 'Some Assets could not be listed. Refresh to try again; placed props are unchanged.' : null); })
      .catch(() => { if (live) { setItems(EXAMPLE_CHOICES); setError('Your models could not be listed. Try again.'); } });
    return () => { live = false; }; }, [on, n]);
  return { items, error, reload: () => setN((x) => x + 1) };
}
