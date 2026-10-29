/** The Create Image feed list: filtered and paged on the server (GET /api/jobs ?cursor, 60 a page, with the total for the count), with
 *  the page's own live jobs on top (a run still going, a placeholder while it uploads, a result that just landed). Local patches
 *  (Like, Move to project, Delete) show at once, before the next fetch. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { JobState } from '../../../api';
import { serverParams, matches, staleView, liveExtras, feedCompare, FEED_STATUS, LIVE_STATUS as LIVE, type FeedFilter, type FeedScope } from './feedFilter';

const PAGE = 60;
/** Ids trashed from any feed on this page load (Select → Delete, the viewer's Delete): a live job with one of these ids never joins a feed
 *  again, even before the next poll says so. The server page stays the truth (a result restored from Trash comes back with it). */
const TRASHED = new Set<string>();
/** The main feed lists finished results and runs still going (FEED_STATUS); Show: Failed asks for failed,blocked. Canceled runs stay in Assets.
 *  `counts=failed` also returns how many failed runs the same filters hold (the toolbar's "N failed" link). */
export async function fetchFeedPage(params: Record<string, string>, cursor: string, limit = PAGE, counts = false): Promise<{ items: JobState[]; nextCursor: string | null; total: number; failed: number | null }> {
  const u = new URLSearchParams({ ...params, cursor, limit: String(limit) }); if (!u.has('status')) u.set('status', FEED_STATUS); if (counts) u.set('counts', 'failed');
  const r = await fetch('/api/jobs?' + u); if (!r.ok) throw new Error('Couldn’t load your generations');
  const j = await r.json(); return { items: (j.items ?? []).filter((x: any) => !x?.deletedAt), nextCursor: j.nextCursor ?? null, total: typeof j.total === 'number' ? j.total : (j.items ?? []).length, failed: typeof j.failed === 'number' ? j.failed : null };
}
/** Every id the filter matches (Select all), up to `max`. */
export async function fetchAllIds(params: Record<string, string>, max = 2000): Promise<{ id: string; status: string; outputs: number; favourite: boolean; url: string | null }[]> {
  const out: { id: string; status: string; outputs: number; favourite: boolean; url: string | null }[] = []; let cursor = '';
  while (out.length < max) { const p = await fetchFeedPage(params, cursor, 500); out.push(...p.items.map(j => ({ id: j.id, status: j.status, outputs: ((j as any).outputs ?? []).length, favourite: !!(j as any).favourite, url: ((j as any).outputs ?? [])[0]?.url ?? j.resultUrl ?? null }))); if (!p.nextCursor) break; cursor = p.nextCursor; }
  return out.slice(0, max);
}
type MergedEntry = { s: JobState; l: JobState | undefined; p: Partial<JobState> | undefined; out: JobState & { _gone?: boolean } };

export function useFeed(live: JobState[], f: FeedFilter, project: string | null, scope: FeedScope = null) {
  const params = useMemo(() => serverParams(f, project, scope), [f.group, f.source, f.show, f.q, f.sort, project, scope?.toolId, scope?.videoFeed, scope?.imageFeed, scope?.audioFeed]); // eslint-disable-line react-hooks/exhaustive-deps
  const key = JSON.stringify(params);
  const [st, setSt] = useState<{ key: string; items: JobState[]; next: string | null; total: number; failed: number | null; loading: boolean; error: string; at: number }>({ key: '', items: [], next: null, total: 0, failed: null, loading: true, error: '', at: 0 });
  const since = useRef(Date.now()).current; /* this visit: a run that fails from now on stays in All until the page is left */
  const [patch, setPatch] = useState<Record<string, Partial<JobState> & { _gone?: boolean }>>({});
  const seq = useRef(0); const loaded = useRef(PAGE); loaded.current = Math.max(PAGE, st.items.length);
  const load = useCallback(async (k: string, p: Record<string, string>, keep: boolean) => {
    /* stale-while-revalidate (2026-10-26): a new scope or chip keeps the list it had on screen (its own key, so it reads as stale) until the new page lands */
    const my = ++seq.current; if (!keep) setSt(s => ({ ...s, loading: true, error: '' }));
    try { const at = Date.now(); const r = await fetchFeedPage(p, '', keep ? Math.min(500, loaded.current) : PAGE, true); if (my !== seq.current) return;
      setSt({ key: k, items: r.items, next: r.nextCursor, total: r.total, failed: r.failed, loading: false, error: '', at }); setPatch({}); /* the server page is the truth now */ }
    catch (e: any) { if (my === seq.current) setSt(s => ({ ...s, ...(s.key !== k ? { key: k, items: [], next: null, total: 0, failed: null } : {}), loading: false, error: String(e?.message ?? 'Couldn’t load') })); }
  }, []);
  /* a new filter: the first page (a search waits for typing to pause) */
  useEffect(() => { const t = setTimeout(() => void load(key, params, false), f.q ? 220 : 0); return () => clearTimeout(t); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  /* a live run finished (or a new one landed on the server): the loaded pages again, so the count and the order stay right */
  /* (a finished job the server page already lists the same way, or one this filter leaves out, is no news: a Video bar swap brings its own
   * history, which must not refetch) */
  const sameOnPage = (j: JobState) => { if (!matches(j, f, project, scope)) return true; const s = st.items.find(x => x.id === j.id); return !!s && s.status === j.status && !!(s as any).favourite === !!(j as any).favourite; };
  const sigRef = useRef(''); /* while a new scope loads, the old page can't say what's news: keep the last signature */
  if (st.key === key) sigRef.current = live.filter(j => j.id && !LIVE.includes(j.status) && !sameOnPage(j)).map(j => `${j.id}:${j.status}:${(j as any).favourite ? 1 : 0}`).join(',');
  const doneSig = sigRef.current;
  const first = useRef(true);
  const seenDone = useRef(new Set<string>()); const doneT = useRef<ReturnType<typeof setTimeout>>(); const reloadRef = useRef(() => {}); reloadRef.current = () => void load(key, params, true);
  useEffect(() => { const now = doneSig ? doneSig.split(',') : []; const fresh = now.filter(x => !seenDone.current.has(x)); seenDone.current = new Set(now); /* only news reloads (an entry leaving the list once the page has it doesn't) */
    if (first.current) { first.current = false; return; } if (!fresh.length) return; clearTimeout(doneT.current); doneT.current = setTimeout(() => void reloadRef.current(), 400); }, [doneSig]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => clearTimeout(doneT.current), []);
  const refresh = useCallback(() => void load(key, params, true), [key, load]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const f2 = () => refresh(); addEventListener('ohf:jobs-changed', f2); return () => removeEventListener('ohf:jobs-changed', f2); }, [refresh]);
  /* Late-result rescue: failed local runs the server still watches (lateWatch) may turn done; check those few every 15 s and reload when one changed */
  const lateIds = (st.key === key ? st.items : []).filter(j => j.status === 'failed' && (j as any).lateWatch).map(j => j.id).join(',');
  useEffect(() => { if (!lateIds) return; const ids = lateIds.split(',');
    const t = setInterval(async () => { if (typeof document !== 'undefined' && document.hidden) return;
      const got = await Promise.all(ids.map(id => fetch(`/api/jobs/${id}`).then(r => (r.ok ? r.json() : null)).catch(() => null)));
      if (got.some(j => j && (j.status !== 'failed' || !j.lateWatch))) refresh(); }, 15_000);
    return () => clearInterval(t); }, [lateIds, refresh]);
  const loadMore = useCallback(async () => { if (!st.next || st.loading || st.key !== key) return; const my = seq.current; setSt(s => ({ ...s, loading: true }));
    try { const r = await fetchFeedPage(params, st.next); if (my !== seq.current) return; setSt(s => { const have = new Set(s.items.map(j => j.id)); return { ...s, items: [...s.items, ...r.items.filter(j => !have.has(j.id))], next: r.nextCursor, total: r.total, loading: false }; }); }
    catch (e: any) { setSt(s => ({ ...s, loading: false, error: String(e?.message ?? 'Couldn’t load more') })); } }, [st.next, st.loading, key]); // eslint-disable-line react-hooks/exhaustive-deps

  const fresh = st.key === key;
  const mergedRef = useRef(new Map<string, MergedEntry>());
  const { jobs, counted, serverShown } = useMemo(() => {
    /* not fresh: the previous scope's list, narrowed here to what the new filter matches (or all of it, dimmed, when nothing matches), until the
     * server answers: never an empty "Loading…" over a list */
    const server = fresh ? st.items : staleView(st.items, f, project, scope); const byId = new Map(live.filter(j => j.id).map(j => [j.id, j]));
    const seen = new Set(server.map(j => j.id));
    /* live jobs the server page doesn't have yet (feedFilter liveExtras): uploading, running, made after the server answered, or failed during
     * this visit. Root cause of "deleted clips come back with Oldest" (2026-10-25): this used to add EVERY live job the server left out once
     * the last page was in, and the page's live list still held trashed and old failed runs. */
    const ex = liveExtras(live, { seen, at: st.at, hasMore: !!st.next, since, gone: TRASHED, f, project, scope, patch }); const extra = ex.jobs;
    /* a card whose server row, live job and patch are the very same objects as last time keeps its merged object, so only changed cards render (FeedCard is memoised) */
    const prev = mergedRef.current; const kept = new Map<string, MergedEntry>();
    const merged = server.map(j => { const l = byId.get(j.id); const lw = l && (LIVE.includes(l.status) || Number((l as any).updatedAt ?? 0) > Number((j as any).updatedAt ?? 0)); const lv = lw ? l : undefined; const p = patch[j.id];
      const c = prev.get(j.id); const out = c && c.s === j && c.l === lv && c.p === p ? c.out : { ...j, ...(lv ?? {}), ...(p ?? {}) } as JobState & { _gone?: boolean };
      kept.set(j.id, { s: j, l: lv, p, out }); return out; })
      .filter(j => !j._gone && !(j as any).deletedAt && (!(j.id in patch) || matches(j, f, project, scope)));
    mergedRef.current = kept;
    const all = [...extra, ...merged]; const dir: 1 | -1 = f.sort === 'old' ? 1 : -1;
    return { jobs: all.sort(feedCompare(dir)), counted: ex.counted, serverShown: merged.length }; /* running, then queued, then the rest by date */
  }, [fresh, st.items, st.next, st.at, live, patch, f.group, f.source, f.show, f.q, f.sort, project, scope?.toolId, scope?.videoFeed, scope?.imageFeed, scope?.audioFeed]); // eslint-disable-line react-hooks/exhaustive-deps
  /* the count = what the list holds: the server's total, plus live runs it doesn't count yet, minus results taken out here (still on the server page) */
  const goneCount = fresh ? st.items.filter(j => patch[j.id]?._gone).length : 0;
  /* while stale: the narrowed list's own count when the old list was complete, else the old total (the new one replaces it in a moment) */
  const total = fresh || st.next ? st.total : serverShown;
  return { jobs, total: Math.max(0, total + counted - goneCount), failed: fresh ? st.failed : null, loading: st.loading || !fresh, /** showing the previous scope's list while the new page loads */ stale: !fresh && st.items.length > 0, error: st.error, hasMore: fresh && !!st.next, loadMore, refresh, params,
    /** show a change at once (Like, Move, Delete); `_gone` takes it out of this list (and out of every feed's live jobs on this page) */ patch: (ids: string[], p: Partial<JobState> & { _gone?: boolean }) => { if (p._gone) ids.forEach(id => TRASHED.add(id)); setPatch(m => { const n = { ...m }; for (const id of ids) n[id] = { ...(n[id] ?? {}), ...p }; return n; }); },
    unpatch: (ids: string[]) => { ids.forEach(id => TRASHED.delete(id)); setPatch(m => { const n = { ...m }; for (const id of ids) delete n[id]; return n; }); } };
}
