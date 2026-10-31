/**
 * The result feed's state and frame, shared by Create Image and Generate Video (2026-10-24): one toolbar (Project, Filter with its pills, "N videos",
 * the queue, today's spend, Select), one justified grid of FeedCards, one quiet one-line hint when it has nothing to show, "Show more", and one result viewer (shared/ResultView variant="viewer"
 * or FailedViewer) with ← / → through the finished and failed results. Each page keeps only what is its own (Image: Compare models groups,
 * angle groups, Use as references; Video: the clip card and the viewer's run-again actions).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { JobState } from '../../../api';
import { useToast } from '../../../shared/Toast';
import { useProjects } from './FeedToolbar';
import { unselectable, type SelInfo } from './SelectBar';
import { useFeed, fetchAllIds } from './useFeed';
import { viewParam, withViewParam } from '../../../shared/tabRestore';
import { clearedFilter, feedView, isDefaultQuery, parseSavedFilter, savedFilterText, type FeedFilter, type FeedScope } from './feedFilter';

/** Projects, filter (saved per tab; a reload brings back only Sort and Grid, so the feed opens on everything), the server-paged list and Select mode. */
export function useFeedState(live: JobState[], opts: { scope?: FeedScope; /** localStorage key for the grid size (older installs); the filter is kept under the same key with feedFilter */ sizeKey?: string } = {}) {
  const sizeKey = opts.sizeKey ?? 'ohf:feedSize'; const filterKey = sizeKey.replace('feedSize', 'feedFilter'); const toast = useToast();
  const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
  const pj = useProjects(); const [filt, setFiltRaw] = useState<FeedFilter>(() => parseSavedFilter(read(filterKey), read(sizeKey)));
  const setFilt = (f: FeedFilter) => { setFiltRaw(f); try { localStorage.setItem(filterKey, savedFilterText(f)); } catch { /* this visit only */ } };
  const feed = useFeed(live, filt, pj.pid, opts.scope ?? null);
  const [selecting, setSelecting] = useState(false); const [sel, setSel] = useState<Map<string, SelInfo>>(new Map()); const [allBusy, setAllBusy] = useState(false);
  const stopSelect = () => { setSelecting(false); setSel(new Map()); };
  const togglePick = (j: JobState) => { if (unselectable(j)) return; setSel(m => { const n2 = new Map(m); if (n2.has(j.id)) n2.delete(j.id); else n2.set(j.id, { id: j.id, status: j.status, outputs: ((j as any).outputs ?? []).length, favourite: !!(j as any).favourite, url: ((j as any).outputs ?? [])[0]?.url ?? j.resultUrl ?? null }); return n2; }); };
  const selectAll = async () => { setAllBusy(true); try { const all = await fetchAllIds(feed.params); setSel(m => { const n2 = new Map(m); for (const x of all) if (!unselectable(x as any)) n2.set(x.id, x); return n2; }); } catch { toast('Couldn’t select them all. Try again.', 'error'); } finally { setAllBusy(false); } };
  const isDefault = isDefaultQuery(filt, pj.pid);
  return { pj, filt, setFilt, feed, selecting, setSelecting, sel, setSel, allBusy, stopSelect, togglePick, selectAll, isDefault, scope: opts.scope ?? null };
}
export type FeedState = ReturnType<typeof useFeedState>;

/** The full-screen viewer over a feed: which result is open, ← / →, and focus back to its card on close (`tileTestId` finds the card). */
export function useFeedViewer(viewable: JobState[], onSelect?: (id: string) => void, tileTestId: (id: string) => string = id => `ic-tile-${id}`, /** the feed has loaded: a ?view=<id> it doesn't hold closes only then */ ready = true) {
  /* the open result is ?view=<id> (2026-10-27, shared/tabRestore): a reload opens it again, Back closes it, ← / → replace it */
  const [viewId, setViewIdRaw] = useState<string | null>(() => (typeof location === 'undefined' ? null : viewParam(location.search)));
  const setViewId = (id: string | null) => {
    setViewIdRaw(id); const cur = viewParam(location.search); if (cur === id) return;
    if (id && !cur) history.pushState({ ...(history.state ?? {}), ohfView: true }, '', withViewParam(location.href, id));
    else if (!id && (history.state as { ohfView?: boolean } | null)?.ohfView) history.back(); /* the entry we added: Back, so Forward reopens it */
    else history.replaceState(history.state, '', withViewParam(location.href, id));
  };
  useEffect(() => { const f = () => setViewIdRaw(viewParam(location.search)); addEventListener('popstate', f); return () => removeEventListener('popstate', f); }, []); const [viewOut, setViewOut] = useState(0); const opener = useRef<HTMLElement | null>(null);
  const viewIdx = viewable.findIndex(j => j.id === viewId); const viewJob = viewIdx >= 0 ? viewable[viewIdx] : null;
  const open = (id: string, k = 0, from?: HTMLElement | null) => { if (from) opener.current = from; setViewOut(k); setViewId(id); onSelect?.(id); };
  const step = (d: number) => { const n2 = viewable[viewIdx + d]; if (n2) open(n2.id); };
  /* Close: focus goes back to the card of the result on screen (after ← / →), else the card that opened it. */
  const close = () => { const id = viewId; setViewId(null); requestAnimationFrame(() => { const t = (id && document.querySelector<HTMLElement>(`[data-testid="${CSS.escape(tileTestId(id))}"] .ic-tile-hit`)) || opener.current; t?.focus({ preventScroll: false }); }); };
  const nav = { onPrev: viewIdx > 0 ? () => step(-1) : null, onNext: viewIdx >= 0 && viewIdx < viewable.length - 1 ? () => step(1) : null, pos: `${viewIdx + 1} / ${viewable.length}` };
  useEffect(() => { if (viewId && !viewJob && ready) setViewId(null); }, [viewId, !!viewJob, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  return { viewId, setViewId, viewOut, viewJob, open, close, nav };
}

/** The feed's one quiet line (2026-10-27, user: "no extra empty page"): under the toolbar, inside the normal feed. Image, Video and Audio use it. */
export function FeedHint({ children, action, testId = 'fd-empty' }: { children: ReactNode; action?: ReactNode; testId?: string }) {
  return <div className="fd-empty" data-testid={testId} role="status"><p>{children}</p>{action}</div>;
}

/** The page's one h1 in the feed state (2026-10-31): visually hidden, since the tab name is already in the nav. Image, Video, Audio and 3D share it. */
export function FeedH1({ children }: { children: ReactNode }) { return <h1 className="sr-only-vis" data-testid="feed-h1">{children}</h1>; }

/** The feed's frame: the toolbar (or Select bar), the grid, and Show more. `children` are the cards. One rule for every tab (2026-10-27, user:
 *  "never a special empty / onboarding screen"): the feed is always the feed. A fresh install isn't empty: its examples are ordinary results in
 *  the Examples project (server/src/featuredSeed.ts, 2026-10-29). Nothing to show gets one quiet line (a filter that matches nothing: Clear filters). */
export function FeedGallery({ title, toolbar, count, st, emptyText, override, testId = 'ic-feed', className = '', children }: { /** the page's hidden h1 (FeedH1) */ title?: string; toolbar: ReactNode; /** cards shown */ count: number; st: FeedState; emptyText: string;
  /** shown under the toolbar instead of the cards */ override?: ReactNode; testId?: string; className?: string; children: ReactNode }) {
  const { feed, filt, setFilt } = st;
  const view = feedView({ count, loading: feed.loading });
  const grid = (cards: ReactNode) => <div className={`ic-feed ic-jfeed${feed.stale ? ' is-stale' : ''}`} data-size={filt.size} data-testid={testId} aria-busy={feed.stale || undefined}>{cards}<i className="ic-jfill" aria-hidden /></div>;
  return <section className={`ic-gal${className ? ` ${className}` : ''}`} aria-label="Your generations">
    {title && <FeedH1>{title}</FeedH1>}{toolbar}
    {override ? override : view === 'cards' ? grid(children)
      : <FeedHint action={view === 'hint' && !feed.error && !isDefaultQuery(filt, null) ? <button type="button" className="fd-link" data-testid="fd-empty-clear" onClick={() => setFilt(clearedFilter(filt))}>Clear filters</button> : undefined}>
        {view === 'loading' ? 'Loading…' : feed.error ? <>{feed.error} <button type="button" className="fd-link" onClick={feed.refresh}>Try again</button></> : emptyText}</FeedHint>}
    {!override && feed.hasMore && <div className="fd-more"><button type="button" className="btn btn-sm" data-testid="fd-more" disabled={feed.loading} onClick={() => void feed.loadMore()}>{feed.loading ? 'Loading…' : `Show more · ${Math.max(0, feed.total - count).toLocaleString()} left`}</button></div>}
  </section>;
}
