/** The tab feeds' filter (Image and Video, 2026-10-27: one calm toolbar row): what the Filter menu offers (Type, From, Show, search, Sort, Grid),
 *  the server query each one means (GET /api/jobs, filtered and paged on the server), and the same test on the client for live jobs the page
 *  already has (a run still going, a result that just landed). */
import type { JobState } from '../../../api';
import { inVideoFeed, videoFeedOf, ALL_VIDEO_FEED, VIDEO_FEED_GROUPS } from '../../../../../server/src/shared/videoFeed';
import { inImageFeed, imageFeedOf, ALL_IMAGE_FEED, IMAGE_FEED_GROUPS } from '../../../../../server/src/shared/imageFeed';
import { UPLOADS_GROUP, type FeedGroup } from '../../../../../server/src/shared/mediaFeed';
import { inAudioFeed, audioFeedOf, ALL_AUDIO_FEED, AUDIO_FEED_GROUPS } from '../../../../../server/src/shared/audioFeed';

/** From: your own results (the default), your uploaded files (the media library, not jobs) or Featured (yours and the app's own). */
export type FeedSource = 'mine' | 'uploads' | 'featured';
/** Show: every result, the liked ones, or the runs that didn't finish. */
export type FeedShow = 'all' | 'liked' | 'failed';
export interface FeedFilter { /** Type: 'all' or a chip id from IMAGE_FEED_GROUPS / VIDEO_FEED_GROUPS ('group:<key>') */ group: string; source: FeedSource; show: FeedShow; q: string; sort: 'new' | 'old'; size: 'small' | 'medium' | 'large' }
export const FILTER_DEFAULT: FeedFilter = { group: 'all', source: 'mine', show: 'all', q: '', sort: 'new', size: 'medium' };
export const ALL_GROUP = 'all';
/** The Type choices of a tab: its chip list without Uploads (Uploads is a From choice). */
export const typeGroups = (groups: FeedGroup[]): FeedGroup[] => groups.filter(g => !g.uploads);
const ALL_GROUPS: FeedGroup[] = [...IMAGE_FEED_GROUPS, ...VIDEO_FEED_GROUPS, ...AUDIO_FEED_GROUPS].filter(g => !g.uploads);
/** A Type's words ("Motion"); the same id means the same words in both tabs. */
export const groupLabel = (id: string): string => ALL_GROUPS.find(g => g.id === id)?.label ?? 'All';
export const SHOW_LABEL: Record<FeedShow, string> = { all: 'All', liked: 'Favourites', failed: 'Failed' };
export const SOURCE_LABEL: Record<FeedSource, string> = { mine: 'Yours', uploads: 'Uploads', featured: 'Featured' };
/** What actually applies: Type and Show only filter your own results (they are greyed out under Uploads and Featured). */
export const effectiveFilter = (f: FeedFilter): FeedFilter => f.source === 'mine' ? f : { ...f, group: ALL_GROUP, show: 'all' };
/** The scope one filter reads: the tab's feed narrowed to the picked Type (Uploads: the Uploads chip, which holds no jobs). Cached, so it is stable. */
const EFF = new Map<string, FeedScope>();
function scopeFor(f: FeedFilter, scope: FeedScope): FeedScope {
  if (!scope || !(scope.videoFeed || scope.imageFeed || scope.audioFeed)) return scope; const e = effectiveFilter(f);
  const pick = f.source === 'uploads' ? UPLOADS_GROUP : e.group !== ALL_GROUP ? e.group : null; if (!pick) return scope;
  /* Audio has no Uploads chip and its own Type list: a Type it doesn't know reads as All */
  if (scope.audioFeed && !audioFeedOf(pick)) return scope;
  const key = `${scope.videoFeed ? 'v' : scope.audioFeed ? 'a' : 'i'}|${pick}`; let s = EFF.get(key);
  if (!s) { s = scope.videoFeed ? { ...scope, videoFeed: pick } : scope.audioFeed ? { ...scope, audioFeed: pick } : { ...scope, imageFeed: pick }; EFF.set(key, s); } return s;
}
/** Whose results a feed lists: Create Image's (every image feature, the default) or one tool's own (Generate Video: { toolId: 'h3-video', media: 'video' }). */
export type FeedScope = { toolId?: string; media: 'video' | 'audio' | 'image'; /** a Video workflow's feed (server/src/shared/videoFeed.ts: the workflow's tool, aliases, Lip Sync's mode; 'all' = every video) */ videoFeed?: string;
  /** an Image feed (server/src/shared/imageFeed.ts: 'all' = every job whose output is an image, a chip, or one image workflow) */ imageFeed?: string; /** the Audio tab's feed (server/src/shared/audioFeed.ts: 'all' = every Audio workflow's results, or a chip) */ audioFeed?: string } | null;
/** The scope of one Video feed: a workflow id, a flow shortcut id or 'all'. */
export const videoScope = (feed: string): NonNullable<FeedScope> => ({ media: 'video', videoFeed: videoFeedOf(feed) ? feed : 'create' });
/** The scope of one Image feed: 'all' (the Image tab's landing), a chip id or an image workflow id. */
export const imageScope = (feed: string): NonNullable<FeedScope> => ({ media: 'image', imageFeed: imageFeedOf(feed) ? feed : ALL_IMAGE_FEED });
/** The scope of the Audio feed: 'all' (the Audio tab) or a chip id. */
export const audioScope = (feed: string = ALL_AUDIO_FEED): NonNullable<FeedScope> => ({ media: 'audio', audioFeed: audioFeedOf(feed) ? feed : ALL_AUDIO_FEED });
/** The tab feed a scope names (Video's, Image's or Audio's). */
export const tabFeedOf = (scope: FeedScope): string | null => scope?.videoFeed ?? scope?.imageFeed ?? scope?.audioFeed ?? null;
/** "Motion Control videos", "videos" (All workflows), "clips" (an older one-tool scope). */
function scopeNoun(scope: NonNullable<FeedScope>): string {
  if (scope.videoFeed) { const d = videoFeedOf(scope.videoFeed); return !d || d.id === ALL_VIDEO_FEED ? 'videos' : d.noun ? d.noun : d.id === 'create' ? 'generated videos' : `${d.name} videos`; }
  if (scope.imageFeed) { const d = imageFeedOf(scope.imageFeed); return !d || d.id === ALL_IMAGE_FEED ? 'images' : d.noun ? d.noun : `${d.name} images`; }
  if (scope.audioFeed) return audioFeedOf(scope.audioFeed)?.noun ?? 'sounds';
  return scope.media === 'video' ? 'clips' : scope.media === 'audio' ? 'tracks' : 'results';
}
/** Words for an empty result ("No favourite motion videos yet."). */
export function emptyTextFor(f0: FeedFilter, project: string | null, scope0: FeedScope): string {
  const f = effectiveFilter(f0); const inP = project ? ' in this project' : '';
  if (f.q.trim()) return `Nothing matches “${f.q.trim()}”${f.group !== ALL_GROUP ? ` in ${groupLabel(f.group)}` : ''}${f.source === 'featured' ? ' in Featured' : ''}.`;
  if (f.source === 'featured') return 'Nothing featured yet. Open a result, then More › Feature this.';
  const scope = scopeFor(f0, scope0); const noun = scope ? scopeNoun(scope) : 'results';
  if (f.source === 'uploads') return `No uploads${inP} yet.`;
  return f.show === 'liked' ? `No favourite ${noun}${inP} yet. Tap the heart on any result to keep it here.` : f.show === 'failed' ? `No failed runs${inP}.` : tabFeedOf(scope) ? `No ${noun}${inP} yet.` : project ? 'This project is empty. New results go here while it’s picked.' : `No ${noun} yet.`;
}
export const isDefaultQuery = (f0: FeedFilter, project: string | null) => { const f = effectiveFilter(f0); return f.group === ALL_GROUP && f.source === 'mine' && f.show === 'all' && !f.q.trim() && f.sort === 'new' && !project; };
/** What the feed shows under its toolbar (2026-10-27, user: "no extra empty page"; ResultFeed FeedGallery). Always the feed: 'cards' = the
 *  results; 'loading' / 'hint' = one quiet line (Loading…, the error, or the filter's empty words with Clear filters). A fresh install's examples
 *  are ordinary results (the Examples project), so there is no separate starter view (2026-10-29). */
export type FeedView = 'cards' | 'loading' | 'hint';
export function feedView(o: { count: number; loading: boolean }): FeedView { return o.count ? 'cards' : o.loading ? 'loading' : 'hint'; }

/** GET /api/jobs params for this filter (the tab's feed, narrowed to the Type; Favourites / Failed; search; project; order). */
export function serverParams(f0: FeedFilter, project: string | null, scope0: FeedScope = null): Record<string, string> {
  const f = effectiveFilter(f0);
  /* Featured (2026-10-26): your starred results of this tab's medium, whatever tool made them */
  if (f.source === 'featured') { const p: Record<string, string> = { featured: '1', media: scope0?.media ?? 'image', status: 'done' }; if (f.q.trim()) p.q = f.q.trim(); p.order = f.sort === 'old' ? 'asc' : 'desc'; return p; }
  const scope = scopeFor(f0, scope0);
  const p: Record<string, string> = scope?.videoFeed ? { videoFeed: scope.videoFeed } : scope?.imageFeed ? { imageFeed: scope.imageFeed } : scope?.audioFeed ? { audioFeed: scope.audioFeed } : scope?.toolId ? { toolId: scope.toolId } : { features: '*' };
  if (f.show === 'liked') p.liked = '1'; if (f.show === 'failed') p.status = 'failed,blocked';
  if (f.q.trim()) p.q = f.q.trim(); p.order = f.sort === 'old' ? 'asc' : 'desc'; if (project) p.project = project;
  return p;
}
/** The same filter on a job the page already holds (live runs and fresh results join the list without waiting for a reload). */
export function matches(j: JobState, f0: FeedFilter, project: string | null, scope0: FeedScope = null): boolean {
  const any = j as any; const f = effectiveFilter(f0);
  if (f.source === 'featured') return !!any.featured && j.status === 'done';
  const scope = scopeFor(f0, scope0);
  if (scope?.videoFeed && j.id && !inVideoFeed(j as any, scope.videoFeed)) return false;
  if (scope?.imageFeed && j.id && !inImageFeed(j as any, scope.imageFeed)) return false;
  if (scope?.audioFeed && j.toolId && !inAudioFeed(j as any, scope.audioFeed)) return false;
  if (scope?.toolId && j.toolId && j.toolId !== scope.toolId) return false;
  if (project && any.projectId !== project && j.id) return false;
  if (f.show === 'liked' && !any.favourite) return false;
  if (f.show === 'failed' && j.status !== 'failed' && j.status !== 'blocked') return false;
  const q = f.q.trim().toLowerCase(); if (q && !`${j.id} ${j.toolId ?? ''} ${String(any.input?.prompt ?? '')}`.toLowerCase().includes(q)) return false;
  return true;
}

/* ---- what the main feed lists (2026-10-25) ----
 * Show: All / Favourites (any Type) = finished results and runs still going. Failed and blocked runs live under Show: Failed (the toolbar's
 * "N failed" link opens it), except a run that failed during this visit: it stays where it was, with Retry, until you leave. Trashed
 * results are never listed, in either sort order (the server leaves them out; the page's own live jobs are checked here too). */
export const LIVE_STATUS = ['queued', 'running', 'needs_decision'];
export const FAILED_STATUS = ['failed', 'blocked'];
/** The feed's order (2026-10-26, shared by Image, Video and Audio): runs going now first (a placeholder while it uploads counts as one), then the
 *  queue, then everything else by date (`dir` -1 = newest first, 1 = oldest first). */
export const liveRank = (j: Pick<JobState, 'status'> & { id?: string }): number => !j.id || j.status === 'running' || (j.status as string) === 'needs_decision' ? 0 : j.status === 'queued' ? 1 : 2;
const madeAt = (j: JobState) => Number((j as any).createdAt ?? 0) || Number.MAX_SAFE_INTEGER; /* a placeholder (no createdAt yet) is the newest */
export const feedCompare = (dir: 1 | -1 = -1) => (a: JobState, b: JobState): number => liveRank(a) - liveRank(b) || dir * (madeAt(a) - madeAt(b));
/** GET /api/jobs ?status= for the main feed (Show: Failed sends failed,blocked instead). */
export const FEED_STATUS = ['done', ...LIVE_STATUS].join(',');

/** The filters that are on, in the toolbar's pill order (Type, From, Show, search, Oldest). Grid size is a view choice, not a filter. */
export type FilterPill = { key: 'type' | 'source' | 'show' | 'q' | 'sort'; label: string; clear: Partial<FeedFilter> };
export function activePills(f0: FeedFilter): FilterPill[] {
  const f = effectiveFilter(f0); const out: FilterPill[] = [];
  if (f.group !== ALL_GROUP) out.push({ key: 'type', label: groupLabel(f.group), clear: { group: ALL_GROUP } });
  if (f.source !== 'mine') out.push({ key: 'source', label: SOURCE_LABEL[f.source], clear: { source: 'mine' } });
  if (f.show !== 'all') out.push({ key: 'show', label: SHOW_LABEL[f.show], clear: { show: 'all' } });
  if (f.q.trim()) out.push({ key: 'q', label: `“${f.q.trim()}”`, clear: { q: '' } });
  if (f.sort === 'old') out.push({ key: 'sort', label: 'Oldest first', clear: { sort: 'new' } });
  return out;
}
/** How many filters are on (the Filter button's count). */
export const activeCount = (f: FeedFilter): number => activePills(f).length;
/** The Filter button's words for screen readers: "Filter, 2 on: Motion, Favourites". */
export function filterSummary(f: FeedFilter): string {
  const on = activePills(f).map(p => p.key === 'q' ? `search ${p.label}` : p.label);
  return on.length ? `Filter, ${on.length} on: ${on.join(', ')}` : 'Filter';
}
/** Clear every filter, keeping the grid size. */
export const clearedFilter = (f: FeedFilter): FeedFilter => ({ ...FILTER_DEFAULT, size: f.size });

/* ---- saved per tab (localStorage) ----
 * Version 2 (2026-10-27) keeps Type, From, Show, Sort and Grid; the search is never kept. A version-1 value (one `kind`) is migrated:
 * liked / failed → Show, featured → From, created → Type Create, edits → Type Edit, wf:<id> → the Type holding that workflow, else All.
 * On reload only Sort and Grid come back (parseSavedFilter), so the feed always opens on everything. */
const SIZES = ['small', 'medium', 'large'];
/** The Type holding a workflow (the most specific one: Upscale before Edit); All when none does. */
export function groupOfWorkflow(id: string): string {
  for (const list of [IMAGE_FEED_GROUPS, VIDEO_FEED_GROUPS]) { const g = list.filter(x => !x.uploads && x.id !== ALL_GROUP && x.workflows.includes(id)).sort((a, b) => a.workflows.length - b.workflows.length)[0]; if (g) return g.id; }
  return ALL_GROUP;
}
/** A saved value, read in full (version 2, or migrated from version 1). Bad values fall back to the defaults. `legacySize` = the old grid-size-only key. */
export function migrateSavedFilter(raw: string | null, legacySize: string | null = null): FeedFilter {
  let o: any = null; try { o = raw ? JSON.parse(raw) : null; } catch { o = null; } if (!o || typeof o !== 'object') o = {};
  const size = SIZES.includes(o.size) ? o.size : legacySize === 'small' || legacySize === 'large' ? legacySize : FILTER_DEFAULT.size;
  const base: FeedFilter = { ...FILTER_DEFAULT, sort: o.sort === 'old' ? 'old' : 'new', size };
  if (o.v === 2) return { ...base, group: ALL_GROUPS.some(g => g.id === o.group) ? o.group : ALL_GROUP, source: ['mine', 'uploads', 'featured'].includes(o.source) ? o.source : 'mine', show: ['all', 'liked', 'failed'].includes(o.show) ? o.show : 'all' };
  const k = String(o.kind ?? 'all');
  if (k === 'liked' || k === 'failed') return { ...base, show: k }; if (k === 'featured') return { ...base, source: 'featured' };
  if (k === 'created') return { ...base, group: 'group:create' }; if (k === 'edits') return { ...base, group: 'group:edit' };
  if (k.startsWith('wf:')) return { ...base, group: groupOfWorkflow(k.slice(3)) };
  return base;
}
/** What a tab opens with: only Sort and Grid come back, so "one feed" always lands on everything. */
export function parseSavedFilter(raw: string | null, legacySize: string | null = null): FeedFilter {
  const m = migrateSavedFilter(raw, legacySize); return { ...FILTER_DEFAULT, sort: m.sort, size: m.size };
}
export const savedFilterText = (f: FeedFilter) => JSON.stringify({ v: 2, group: f.group, source: f.source, show: f.show, sort: f.sort, size: f.size });

/** The live jobs a feed watches (2026-10-26, Video's All view): the page's own runs, plus every queued or running job on the server (the shared
 *  active-jobs poller: runs started in another workflow, another tab, the MCP server or Canvas) and the ones that finished since this page
 *  loaded (so a run that ends elsewhere turns into its result, and the feed reloads). One job per id: the fresher copy wins. */
export function mergeLiveJobs(own: JobState[], ...others: JobState[][]): JobState[] {
  const out = [...own]; const at = new Map<string, number>(); own.forEach((j, i) => { if (j.id) at.set(j.id, i); });
  const t = (j: JobState) => Number((j as any).updatedAt ?? 0);
  for (const list of others) for (const j of list) { if (!j?.id) continue; const i = at.get(j.id);
    if (i == null) { at.set(j.id, out.length); out.push(j); continue; }
    const cur = out[i]; const curLive = LIVE_STATUS.includes(cur.status); const newLive = LIVE_STATUS.includes(j.status);
    if (t(j) > t(cur) || (curLive && !newLive)) out[i] = j; }
  return out;
}

export interface ExtrasCtx { /** ids the server page holds */ seen: Set<string>; /** when the server answered (ms) */ at: number; /** more server pages to come */ hasMore: boolean;
  /** when this visit to the feed began (a failure after it stays in All) */ since: number; /** ids trashed from this page */ gone: Set<string>;
  f: FeedFilter; project: string | null; scope: FeedScope; patch: Record<string, Partial<JobState>> }
/** The page's live jobs that join the server page: a placeholder, a run still going, a result made after the server answered (at the top
 *  for Newest; at the end for Oldest once the last page is in), and a run that failed during this visit. Never a trashed job, never an
 *  older job the server left out on purpose (trashed, failed before this visit, filtered out). `counted` = how many the server's total
 *  doesn't include yet. */
export function liveExtras(live: JobState[], c: ExtrasCtx): { jobs: JobState[]; counted: number } {
  const jobs: JobState[] = []; let counted = 0;
  for (const j of live) {
    const a = j as any;
    if (!j.id) { jobs.push(j); counted++; continue; } // a placeholder while it uploads
    if (c.seen.has(j.id) || c.gone.has(j.id) || a.deletedAt || a.trashed) continue;
    const made = Number(a.createdAt ?? 0); const fresh = made > c.at - 500; const failed = FAILED_STATUS.includes(j.status);
    const keep = LIVE_STATUS.includes(j.status) ? true
      : failed ? Number(a.updatedAt ?? a.finishedAt ?? made) >= (effectiveFilter(c.f).show === 'failed' ? c.at - 500 : c.since)
      : fresh && (c.f.sort === 'new' || !c.hasMore);
    if (!keep || !matches({ ...j, ...(c.patch[j.id] ?? {}) } as JobState, c.f, c.project, c.scope)) continue;
    jobs.push(j); if (j.status !== 'canceled' && (fresh || failed)) counted++;
  }
  return { jobs, counted };
}
/** Stale-while-revalidate (useFeed, 2026-10-26): what a feed shows while a new scope or chip loads. The previous list, narrowed to what the new
 *  filter matches; all of it (dimmed by the page) when nothing matches, so a list never drops to an empty "Loading…". */
export function staleView<J extends JobState>(items: J[], f: FeedFilter, project: string | null, scope: FeedScope): J[] {
  const narrow = items.filter(j => matches(j, f, project, scope)); return narrow.length ? narrow : items;
}
