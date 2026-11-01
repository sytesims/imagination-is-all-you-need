/** Feed layout for the tab feeds (Image, Video): the shown jobs split into sections, in order. A set (Compare models, Material Swap's swatches:
 *  every job that shares a compare id, setIdOf) is one section: open, it is its own full-width row with a header; folded, it is one tile-sized
 *  card that flows in the justified rows like any result (SetRow.tsx). The singles between sets are plain sections that flow into the justified
 *  tile rows (imageCanvas.css .ic-jfeed). Anything that flows inline (singles, a folded set) and is followed by an open set must end its last row
 *  with a filler (.ic-jfill): the open set takes a full line, so without it the tiles on that last row grow to fill the whole width (one single
 *  result became a full-width, cropped banner above the group). */
export interface FeedSection<J, T> { group: string | null; jobs: J[]; tiles: T[]; /** end the last tile row here (an open set comes next) */ fill: boolean;
  /** a set shown folded into one card */ folded?: boolean }
type SetJob = { compare?: { id?: string; n?: number; i?: number; kind?: string } | null; status?: string; createdAt?: number | string | null };
/** The set a job belongs to (its compare id: Compare models, Material Swap), or null for a single result. */
export const setIdOf = (j: SetJob): string | null => j.compare?.id || null;
const live = (j: SetJob) => j.status === 'queued' || j.status === 'running' || j.status === 'needs_decision';
/** What decides whether a set starts open: still running (or being sent), or the newest set in the feed. */
export interface SetInfo { running: boolean; latest: boolean }
/** The default rule (user, 2026-11-01): a set stays open while it runs and for the latest run; older finished sets start folded. */
export const setOpenByDefault = (s: SetInfo): boolean => s.running || s.latest;

export function feedSections<J extends SetJob, T>(shown: J[], tileOf: (j: J) => T[], isOpen?: (group: string, info: SetInfo) => boolean): FeedSection<J, T>[] {
  const out: FeedSection<J, T>[] = [];
  for (const j of shown) {
    const g = setIdOf(j); const last = out[out.length - 1];
    if (last && last.group === g) { last.jobs.push(j); last.tiles.push(...tileOf(j)); continue; } // same set, or more singles
    out.push({ group: g, jobs: [j], tiles: tileOf(j), fill: false });
  }
  /* the newest set (by its newest job), whatever the sort */
  const t = (s: FeedSection<J, T>) => Math.max(0, ...s.jobs.map(j => Number(j.createdAt ?? 0) || 0)); let latest: FeedSection<J, T> | null = null;
  for (const s of out) if (s.group && (!latest || t(s) > t(latest))) latest = s;
  for (const s of out) if (s.group && isOpen && !isOpen(s.group, { running: s.jobs.some(live), latest: s === latest })) s.folded = true;
  for (let k = 1; k < out.length; k++) if (out[k].group && !out[k].folded && !(out[k - 1].group && !out[k - 1].folded)) out[k - 1].fill = true;
  return out;
}

/** A set's jobs sit together, at its newest (first shown) member's place, in their set order (compare.i). `places` may add a set's waiting
 *  cards while it is still being sent (withSetPlaces). A retried run takes the place of the one it retries (the server puts it in the same set). */
export function groupSets<J extends SetJob & { id?: string; input?: { retryOf?: string } | null }>(all: J[], places?: (members: J[], group: string) => J[]): J[] {
  const retried = new Set(all.filter(j => setIdOf(j) && j.input?.retryOf).map(j => String(j.input!.retryOf))); const list = all.filter(j => !j.id || !retried.has(j.id));
  const byI = (a: J, b: J) => Number(a.compare?.i ?? 0) - Number(b.compare?.i ?? 0); const out: J[] = []; const done = new Set<string>();
  for (const j of list) { const g = setIdOf(j); if (!g) { out.push(j); continue; } if (done.has(g)) continue; done.add(g);
    const members = list.filter(x => setIdOf(x) === g); out.push(...(places ? places(members, g) : members.sort(byI))); }
  return out;
}

/** A folded set's words: its name and how many it holds ("Material Swap", "4 swatches"). */
export function setWords(jobs: SetJob[]): { title: string; count: string; n: number } {
  const c = jobs[0]?.compare; const n = Number(c?.n ?? 0) || jobs.length;
  return c?.kind === 'swatch' ? { title: 'Material Swap', count: `${n} swatches`, n } : { title: 'Compare models', count: `${n} models`, n };
}
/** A set's progress: finished, failed, still running, out of its places. */
export function setProgress(jobs: SetJob[]): { done: number; failed: number; running: number; total: number } {
  const total = Math.max(jobs.length, Number(jobs[0]?.compare?.n ?? 0) || 0);
  return { done: jobs.filter(j => j.status === 'done').length, failed: jobs.filter(j => j.status === 'failed' || j.status === 'blocked').length, running: jobs.filter(live).length, total };
}

/** The reader's own choice per set (open or folded), kept in this browser: { [set id]: true | false }, newest choices last, capped. */
export const SET_FOLD_KEY = 'ohf:setFold';
export const SET_FOLD_MAX = 400;
export function parseSetFold(raw: string | null | undefined): Record<string, boolean> {
  try { const o = JSON.parse(raw || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? Object.fromEntries(Object.entries(o).filter(([k, v]) => typeof v === 'boolean' && /^[\w-]{1,64}$/.test(k))) as Record<string, boolean> : {}; } catch { return {}; }
}
/** Set some sets' choice; the oldest choices drop off past SET_FOLD_MAX. */
export function withSetFold(m: Record<string, boolean>, ids: string[], open: boolean): Record<string, boolean> {
  const n = { ...m }; for (const id of ids) { delete n[id]; n[id] = open; }
  const ks = Object.keys(n); for (const k of ks.slice(0, Math.max(0, ks.length - SET_FOLD_MAX))) delete n[k];
  return n;
}

/** A set that is still being sent (Material Swap's swatches, Compare models' runs go one request at a time): every place it will have,
 *  from the first frame, so the set row appears once at its full size and each card updates in place. `members` are the set's jobs so far
 *  (any order); `make(i)` is a waiting card for place i. Places are 0 … n-1 (n from the members' compare.n). Sorted by place. */
export function withSetPlaces<J extends { compare?: { n?: number; i?: number } | null }>(members: J[], make: (i: number) => J): J[] {
  const byI = (x: J) => Number(x.compare?.i ?? 0); const n = Math.max(0, ...members.map(x => Number(x.compare?.n ?? 0)));
  const have = new Set(members.map(byI)); const out = [...members];
  for (let i = 0; i < n; i++) if (!have.has(i)) out.push(make(i));
  return out.sort((a, b) => byI(a) - byI(b));
}
