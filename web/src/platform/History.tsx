import { AudioCover } from '../shared/AudioViz';
import { audioKindOfJob } from '../shared/audioVizLogic';
import { is3dUrl, posterOf3d } from '../shared/model3d';
import { sendTo3dHref } from '../../../server/src/shared/threeD';
import { mediaOf } from '../ui/pages/Live';
import '../shared/featureCredit.css';
import { gridSrc } from '../shared/thumbs'; // performance: grid tiles load a scaled copy (viewer keeps full size)
import { useToast, useCopied, Copied } from '../shared/Toast';
import { askConfirm, askText } from '../shared/Dialog';
import { InlineError } from '../shared/InlineError';
import { Skeleton } from '../shared/Skeleton';
import { useFlipOnPrepend } from '../shared/flipGrid';
import { isDemoJob, demoMessage } from '../shared/quote';
import { isCancellable, cancelQueued, canceledPatch } from '../shared/QueueCancel';
import GenTile from '../shared/GenTile';
import { FailIcon, FailTitle } from '../shared/FailureState';
import { useActiveJobs, isCanceling, isActiveJob } from '../shared/activeJobs';
import { jobPctShown, jobStatusLabel, jobStatusShort } from '../shared/jobStatus';
import { setAssetOrder, setOpener } from '../shared/assetOrder';
import { Popover } from '../shared/Popover';
import { AssetSendMenu } from './AssetSendMenu';
import { ShareDialog } from '../shared/ResultView';
import { AddSoundDialog } from '../shared/AddSound';
import { canAddSound } from '../shared/addSoundLogic';
import { purgeForever } from '../shared/ResultViewer';
import { WorkflowDialog } from '../shared/WorkflowDialog';
import { openSaveLook } from '../shared/SaveLookDialog';
import { canSaveLook } from '../shared/looks';
import { useLedger } from '../shared/balance';
import { ownAccountsNow, ledgerUsd } from '../shared/billing';
import { pollWithBackoff, jobSig } from '../shared/backoff';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { JobState, JobLocation, listJobsPage, locateJob, ToolInfo, STATE_LABELS, listAssets, setJobProject, trashJob, restoreJob, listProjects, createProject, deleteProject, patchProject, setProjectVisibility, listPublicProjects, Project, restoreAllTrash, emptyTrash, fmtBytes } from '../api';
import { recreateUrl, refTarget, sendGroups, sendTo, outputMedium } from './SendTo';
import { stitchAddHref } from '../../../server/src/shared/videoWorkflows';
import { Link, navigate } from './router';
import { exampleFor } from '../ui/examples';
import { AssetsIcon, ProjectsIcon, HeartIcon, BrandIcon, TrashIcon, DownloadIcon, MoreIcon, SearchIcon, ToolIconFor, CubeIcon, SoundIcon, StitchIcon } from '../ui/Icons';
import { heldBack, nothingHeld, stripCreditSentences } from '../shared/creditsBack';
import { demoTag } from '../shared/quote';
import { aspectOf, dayKey, dayLabel, daysAgo, groupByDay, justify, masonry, rangeBounds } from './assetsLayout';
import { typedPromptOf } from '../../../server/src/shared/typedPrompt';
import { favOf, saveFavourite, toggleFavourite, useFavourites } from '../shared/favourites';
import '../ui/pages/assets.css'; /* PP: Assets page styles (scoped to .pp-assets) */
/** Failed-tile error line: the server's message minus its balance sentences. Money held → the tile status ($N back to your balance) is the only such text; nothing held → one "Nothing was charged". */
const errLine = (j: any): string => { const m = stripCreditSentences(String(j?.error ?? '')); if (heldBack(j) > 0) return m; return nothingHeld(j) ? `${m ? `${m.replace(/\.?$/, '.')} ` : ''}Nothing was charged.` : m; };
/** Deep-link pin: the prompt in quotes when there is one; else the model or tool name; else "this result". Never empty quotes. */
const pinLabel = (j: any, toolName?: string): string => { const t = typedPromptOf(j?.input).trim(); if (t) return `Open “${t.length > 60 ? `${t.slice(0, 59)}…` : t}”`; const n = String(j?.modelName ?? toolName ?? j?.model ?? '').trim(); return n ? `Open this ${n} result` : 'Open this result'; };

const SECTIONS: [string, typeof AssetsIcon][] = [['Assets', AssetsIcon], ['Projects', ProjectsIcon], ['Favourites', HeartIcon], ['Brands', BrandIcon], ['Trash', TrashIcon]];
/* Brands (2026-10-27): your brand profiles (ui/brand/BrandKitPage.tsx, its own chunk), next to your other saved things; /assets/brands (/assets/brand redirects) */
const BrandKitPage = lazy(() => import('../ui/brand/BrandKitPage'));
/* Elements (saved @name references) were removed from the app (user, 2026-10-23). /assets/elements and ?section=elements land on Assets (see fromUrl). */
const SECTION_COPY: Record<string, string> = { Brands: 'Your brand profiles: colours, fonts and mood. Pick one with Brand in the Image, Video or Audio bar to keep results on-brand, or export it to Figma, Canva, Adobe, Procreate and more.', Projects: 'Group generations into projects.', Favourites: 'Heart a result to keep it here.', Trash: 'Deleted assets stay here. Restore any time.' };

const label: Record<string, string> = STATE_LABELS;
/** ?section=projects|favourites|trash (any case) picks the sidebar section. */
const secFromUrl = () => { const v = (new URLSearchParams(location.search).get('section') ?? '').toLowerCase(); return SECTIONS.find(([n]) => n.toLowerCase() === v)?.[0] ?? 'Assets'; };
const PAGE = 40;
const MEDIA_Q = { Images: 'image', Video: 'video', Audio: 'audio' } as const;
type MediaF = '' | 'Images' | 'Video' | 'Audio' | 'Enhanced';
const MEDIAS = ['Images', 'Video', 'Audio', 'Enhanced'] as const;
/** PB-22: one path per section and media filter (/assets/trash, /assets/videos…), so they can be bookmarked and Back restores them. ?section= still works. */
const MEDIA_SLUG: Record<string, MediaF> = { images: 'Images', videos: 'Video', video: 'Video', audio: 'Audio', enhanced: 'Enhanced' };
const SEC_SLUG: Record<string, string> = { brands: 'Brands', brand: 'Brands' /* the first name (2026-10-27): the URL is rewritten below */, projects: 'Projects', favourites: 'Favourites', favorites: 'Favourites', trash: 'Trash' };
const slugOf = (sec: string, m: MediaF) => m ? (m === 'Video' ? 'videos' : m.toLowerCase()) : sec === 'Assets' ? '' : sec.toLowerCase();
const fromUrl = (): { sec: string; media: MediaF } => { const seg = (location.pathname.split('/')[2] ?? '').toLowerCase();
  if (MEDIA_SLUG[seg]) return { sec: 'Assets', media: MEDIA_SLUG[seg] }; if (SEC_SLUG[seg]) return { sec: SEC_SLUG[seg], media: '' }; return { sec: secFromUrl(), media: '' }; };
/** Page titles: plural where the sidebar label is singular. */
const mediaTitle = (m: MediaF) => m === 'Video' ? 'Videos' : m;
/** PB-23: what an empty section says (its own title and line, never the library's). */
const EMPTY_COPY: Record<string, [string, string]> = {
  Favourites: ['No favourites yet', 'Tap the heart on any result and it’s kept here, one click away.'],
  Project: ['This project is empty', 'Add results from a result’s ⋯ menu (Add to project), or select several and use Add to.'],
  Images: ['No images yet', 'Pictures you make or edit land here.'], Video: ['No videos yet', 'Clips you make, extend or edit land here.'],
  Audio: ['No audio yet', 'Voices, music and sound effects land here.'], Enhanced: ['Nothing enhanced yet', 'Upscaled and enhanced results land here.'] };
type Range = '' | 'today' | '7d' | '30d' | 'custom';
const RANGES: [Range, string][] = [['', 'Any time'], ['today', 'Today'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['custom', 'Custom range']];
const BAD = ['failed', 'blocked', 'canceled'];
let cfgP: Promise<any> | null = null; const appConfig = () => (cfgP ??= fetch('/api/config').then(r => r.ok ? r.json() : {}).catch(() => ({})));
/** View (persisted): layout, split by date, card size (row height), sort. */
const SIZES = [140, 170, 200, 230, 270, 320]; const GAP = 4;
type View = { layout: 'masonry' | 'square'; split: boolean; size: number; sort: 'new' | 'old' };
const VIEW0: View = { layout: 'masonry', split: true, size: 3, sort: 'new' };
const readView = (): View => { try { const v = JSON.parse(localStorage.getItem('oj:assets-view') ?? 'null'); return v && typeof v === 'object' ? { ...VIEW0, ...v, size: Math.min(SIZES.length - 1, Math.max(0, Number(v.size ?? VIEW0.size) || 0)) } : VIEW0; } catch { return VIEW0; } };

const G = (d: React.ReactNode, s = 16, cls = 'am-ic') => <svg className={cls} width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>;
const P = { open: <path d="M9.5 2.5h4v4M13.5 2.5 8 8M7 3.5H4A1.5 1.5 0 0 0 2.5 5v7A1.5 1.5 0 0 0 4 13.5h7a1.5 1.5 0 0 0 1.5-1.5V9" />, select: <><rect x="2.5" y="2.5" width="11" height="11" rx="2.5" /><path d="m5.5 8 1.8 1.8L10.5 6" /></>, send: <path d="M2.5 8h9M8.5 4.5 12 8l-3.5 3.5M13.5 3v10" />,
  recreate: <><path d="M13 8a5 5 0 1 1-1.5-3.6" /><path d="M13 2.5v3h-3" /></>, ref: <><rect x="2.5" y="3.5" width="8" height="9" rx="1.5" /><path d="M10.5 6h1.5a1.5 1.5 0 0 1 1.5 1.5v5" /><path d="m4 10.5 2-2 2.5 2.5" /></>, link: <><path d="M6.5 9.5 9.5 6.5" /><path d="M7 4.5 8.3 3.2a2.5 2.5 0 0 1 3.5 3.5L10.5 8M9 11.5l-1.3 1.3a2.5 2.5 0 0 1-3.5-3.5L5.5 8" /></>,
  share: <><path d="M9.5 3.5 13 7l-3.5 3.5" /><path d="M13 7H7a4 4 0 0 0-4 4v1.5" /></>, x: <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />, filter: <path d="M2.5 4h11M4.5 8h7M6.5 12h3" />, view: <><rect x="2.5" y="2.5" width="4.5" height="6" rx="1" /><rect x="9" y="2.5" width="4.5" height="3.5" rx="1" /><rect x="2.5" y="10.5" width="4.5" height="3" rx="1" /><rect x="9" y="8" width="4.5" height="5.5" rx="1" /></>,
  chev: <path d="m6 3.5 4.5 4.5L6 12.5" />, back: <path d="m10 3.5L5.5 8l4.5 4.5" /> };
const CheckGlyph = () => <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const MixGlyph = () => <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><path d="M3 6h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
const MEDIA_GLYPH: Record<string, React.ReactNode> = { Images: <><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="9" cy="9" r="1.75" /><path d="m21 15-5-5L5 21" /></>, Video: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M10 9.5v5l4-2.5z" /></>, Audio: <><path d="M9 18V6l10-2v12" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="16.5" cy="16" r="2.5" /></>, Enhanced: <><path d="m4 20 10-10M14 4v3M12.5 5.5h3M19 9v3M17.5 10.5h3" /></> };
const thumbOf = (j?: JobState) => !j?.resultUrl ? '' : /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(j.resultUrl) ? j.resultUrl : /\.(wav|mp3|ogg|flac|m4a)(\?|$)/i.test(j.resultUrl) ? '' : (j as any).outputs?.[0]?.posterUrl ?? `/api/media/thumb?url=${encodeURIComponent(j.resultUrl)}`;

/** Assets / history: every job across tools, split by day, in native aspect ratios. Multi-select with a bulk bar; Filter and View popovers. */
export default function History({ tools, toolId }: { tools: ToolInfo[]; toolId?: string }) {
  const toast = useToast(); useFavourites(); /* re-render when any heart changes */ const liveJobs = useActiveJobs().jobs; const [copied, flash] = useCopied();
  const [jobs, setJobs] = useState<JobState[]>([]); const [err, setErr] = useState(''); const [loaded, setLoaded] = useState(false); const [filter, setFilter] = useState(() => new URLSearchParams(location.search).get('tool') ?? ''); const [section, setSection] = useState(() => fromUrl().sec); const [openErr, setOpenErr] = useState<Set<string>>(new Set());
  const [project, setProject] = useState(() => new URLSearchParams(location.search).get('project') ?? ''); /* ?project=<id>: the profile page's Projects tab opens one */ const [projects, setProjects] = useState<Project[]>([]); const [tick, setTick] = useState(0); const [hideDrafts, setHideDrafts] = useState(false);
  const [showFailed, setShowFailed] = useState(false); const [q, setQ] = useState(() => new URLSearchParams(location.search).get('q') ?? ''); const [favOnly, setFavOnly] = useState(false); const [model, setModel] = useState('');
  const [menu, setMenu] = useState(''); const menuAnchor = useRef<HTMLElement | null>(null); const sendAnchor = useRef<HTMLButtonElement | null>(null); const [menuAlign, setMenuAlign] = useState<'start' | 'end'>('end'); const [sub, setSub] = useState<'' | 'send' | 'project'>(''); useEffect(() => { setSub(''); }, [menu]);
  const closeMenu = useCallback(() => setMenu(''), []); const [share, setShare] = useState(''); const [wfJob, setWfJob] = useState(''); const [soundJob, setSoundJob] = useState('');
  const [media, setMedia] = useState<MediaF>(() => fromUrl().media); const [range, setRange] = useState<Range>(''); const [dFrom, setDFrom] = useState(''); const [dTo, setDTo] = useState('');
  const [view, setView0] = useState<View>(readView); const setView = (p: Partial<View>) => setView0(v => { const n = { ...v, ...p }; try { localStorage.setItem('oj:assets-view', JSON.stringify(n)); } catch { /* storage off */ } return n; }); const sort = view.sort;
  const [fsub, setFsub] = useState<'' | 'type' | 'model' | 'tool' | 'date'>('');
  const [tip, setTip] = useState(() => { try { return !localStorage.getItem('oj:assets-tip'); } catch { return false; } });
  const [pop, setPop] = useState<'' | 'filters' | 'view' | 'bulkmore' | 'bulkproj'>(''); const closePop = useCallback(() => setPop(''), []); useEffect(() => setFsub(''), [pop]);
  const fRef = useRef<HTMLButtonElement>(null); const vRef = useRef<HTMLButtonElement>(null); const bmRef = useRef<HTMLButtonElement>(null); const bpRef = useRef<HTMLButtonElement>(null);
  const [counts, setCounts] = useState<{ all: number; projects: number; favourites: number; trash: number; byMedia: Record<string, number>; source: 'server' | 'derived' } | null>(null);
  const deepJob = new URLSearchParams(location.search).get('job') ?? ''; const [pinned, setPinned] = useState<JobState | null>(null); const [deepNote, setDeepNote] = useState('');
  const [rename, setRename] = useState(''); const [pubIds, setPubIds] = useState<Set<string>>(new Set()); const [pubTick, setPubTick] = useState(0);
  /* selection: ids, the shift-click anchor, and phone select mode (long-press or the Select button) */
  const [sel, setSel] = useState<Set<string>>(new Set()); const anchorId = useRef(''); const [selMode, setSelMode] = useState(false); const lp = useRef<{ t: number; x: number; y: number; fired: boolean }>({ t: 0, x: 0, y: 0, fired: false });
  /* aspect ratios measured from the media once loaded (only when they differ from what the data said), batched per frame */
  const [aspects, setAspects] = useState<Record<string, number>>({}); const pendA = useRef<Record<string, number>>({}); const rafA = useRef(0);
  const noteAspect = (id: string, w: number, h: number, used: number) => { if (!(w > 0 && h > 0)) return; const a = w / h; if (Math.abs(a - used) / used < 0.02 || pendA.current[id] === a) return; pendA.current[id] = a;
    if (!rafA.current) rafA.current = requestAnimationFrame(() => { rafA.current = 0; const p = pendA.current; pendA.current = {}; setAspects(s => ({ ...s, ...p })); }); };
  useEffect(() => { setRename(projects.find(p => p.id === project)?.name ?? ''); }, [project, projects]);
  useEffect(() => { if (section !== 'Projects') return; listPublicProjects().then(r => setPubIds(new Set(r.items.map(x => x.id)))).catch(() => undefined); }, [section, pubTick, tick]);
  const [next, setNext] = useState<string | null>(null); const [more, setMore] = useState(false); const loadedRef = useRef(0); const located = useRef(false); const baseCursor = useRef(''); const [deepMissing, setDeepMissing] = useState(false); const [deepLoc, setDeepLoc] = useState<JobLocation | null>(null); const prevQ = useRef('');
  const [qD, setQD] = useState(q); useEffect(() => { const t = setTimeout(() => setQD(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  const [trashDays, setTrashDays] = useState<number | null>(null); useEffect(() => { appConfig().then(c => typeof c.trashDays === 'number' && setTrashDays(c.trashDays)); }, []);
  const [from, to] = range === 'today' ? [daysAgo(0), ''] : range === '7d' ? [daysAgo(6), ''] : range === '30d' ? [daysAgo(29), ''] : range === 'custom' ? [dFrom, dTo] : ['', ''];
  const qry = { toolId: toolId || filter || undefined, media: media && media !== 'Enhanced' ? MEDIA_Q[media] : undefined, enhanced: media === 'Enhanced', q: qD || undefined, ...rangeBounds(from, to), order: sort === 'old' ? 'asc' as const : undefined };
  const qKey = JSON.stringify(qry);
  useEffect(() => { loadedRef.current = 0; }, [qKey]);
  const loadMore = () => { if (!next || more) return; setMore(true); listJobsPage({ ...qry, cursor: next, limit: PAGE }).then(r => { setJobs(js => { const seen = new Set(js.map(j => j.id)); return [...js, ...r.items.filter(j => !seen.has(j.id) && !j.deletedAt)]; }); setNext(r.nextCursor); loadedRef.current += r.items.length; }).catch(e => setErr(e.message)).finally(() => setMore(false)); };
  const [dataKey, setDataKey] = useState(''); const curKey = `${section}|${project}|${qKey}`;
  useEffect(() => {
    let live = true; const myKey = curKey;
    const load = () => {
      const sec = section === 'Favourites' ? 'favourites' : section === 'Trash' ? 'trash' : section === 'Projects' && project ? `project:${project}` : '';
      const p = (sec ? listAssets(toolId, sec) : (async () => {
        // Assets: server-side filters + cursor paging. Polls re-read everything loaded so far from the base cursor (one request).
        // ?job= deep link: GET /api/jobs/:id/locate with the same filters → load that page (cursor, pageSize) and highlight items[index].
        if (prevQ.current && prevQ.current !== qKey) { baseCursor.current = ''; loadedRef.current = 0; } prevQ.current = qKey;
        if (deepJob && !located.current) { located.current = true; const loc = await locateJob(deepJob, qry, PAGE).catch(() => null);
          if (loc === 'not_found') { if (live) setDeepMissing(true); } else if (loc) { baseCursor.current = loc.cursor ?? ''; if (live) setDeepLoc(loc); } }
        const r = await listJobsPage({ ...qry, cursor: baseCursor.current, limit: Math.max(PAGE, loadedRef.current) });
        if (live) { setNext(r.nextCursor); loadedRef.current = r.items.length; } return r.items.filter(j => !j.deletedAt);
      })()).then(j => { if (live) { setJobs(j); setLoaded(true); setErr(''); setDataKey(myKey); } return j.map(jobSig).join(','); }).catch(e => { if (live) setErr(e.message || 'error'); return ''; });
      listProjects().then(p => live && setProjects(p)).catch(() => undefined);
      return p;
    };
    load(); const stop = pollWithBackoff(load); return () => { live = false; stop(); };
  }, [toolId, section, project, tick, qKey]);
  /* Sidebar counts: GET /api/assets/counts {all, projects, favourites, trash, byMedia:{image,video,audio,enhanced}}. */
  useEffect(() => { let live = true;
    fetch('/api/assets/counts').then(r => r.ok ? r.json() : Promise.reject()).then(c => live && setCounts({ ...c, byMedia: { Images: c.byMedia?.image ?? 0, Video: c.byMedia?.video ?? 0, Audio: c.byMedia?.audio ?? 0, Enhanced: c.byMedia?.enhanced ?? 0 }, source: 'server' })).catch(() => live && setCounts(null));
    return () => { live = false; }; }, [tick, jobs.length, tools.length]);
  /* ?job= deep link: scroll to and highlight the card; if it isn't in the loaded list, pin it from GET /api/jobs/:id. */
  /* Highlight items[index] of the located page (the page starts at baseCursor); fall back to the id when locate didn't answer. */
  const hlId = deepJob && deepLoc && !['Favourites', 'Trash', 'Projects'].includes(section) && jobs[deepLoc.index] ? jobs[deepLoc.index].id : deepJob;
  /* …then open it in the viewer over this list: ?job= leaves the URL (closing returns to the clean /assets URL, filters kept) and /jobs/:id is pushed. */
  const deepOpened = useRef('');
  const openDeep = (id: string) => { if (deepOpened.current === id || !tools.length) return; /* /jobs/:id over Assets needs the tool list (App) */ deepOpened.current = id; const q = new URLSearchParams(location.search); q.delete('job');
    history.replaceState(history.state, '', `${location.pathname}${q.toString() ? `?${q}` : ''}`); lastSearch.current = location.pathname + location.search; setOpener(id); navigate(`/jobs/${encodeURIComponent(id)}`); };
  useEffect(() => { if (!deepJob) return; if (deepMissing) { setPinned(null); setDeepNote('That result wasn’t found. It may have been deleted.'); return; } if (!jobs.length) return;
    const el = document.getElementById(`asset-${hlId}`); if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('asset-hl'); setPinned(null); setDeepNote(deepLoc && deepLoc.page > 1 ? `Opened at page ${deepLoc.page} of ${Math.max(1, Math.ceil(deepLoc.total / deepLoc.pageSize))} (item ${deepLoc.position + 1} of ${deepLoc.total}).` : ''); openDeep(hlId); return; }
    fetch(`/api/jobs/${encodeURIComponent(deepJob)}`).then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status)))).then(j => { setPinned((j.job ?? j) as JobState); setDeepNote('This one isn’t in the current list, so it’s pinned here.'); openDeep(deepJob); }).catch(() => setDeepNote('That result wasn’t found. It may have been deleted.')); }, [deepJob, hlId, jobs.length, section, deepMissing, deepLoc, tools.length > 0]);
  /* Back/forward to another ?section= or ?tool= re-reads them. Closing the viewer (back to the same /assets URL) keeps filters, scroll and selection. */
  const lastSearch = useRef(location.pathname + location.search);
  /* Brands: the first URL /assets/brand becomes /assets/brands in place (same page, Back skips it) */
  useEffect(() => { if (/^\/(assets|history)\/brand\/?$/i.test(location.pathname)) history.replaceState(history.state, '', location.pathname.replace(/brand\/?$/i, 'brands') + location.search); }, []);
  /* old Elements links (/assets/elements, ?section=elements): the section is gone, so the URL is rewritten to the library in place */
  useEffect(() => { const seg = (location.pathname.split('/')[2] ?? '').toLowerCase(); const q = new URLSearchParams(location.search); if (seg !== 'elements' && (q.get('section') ?? '').toLowerCase() !== 'elements') return;
    q.delete('section'); const url = `${/^\/history(\/|$)/.test(location.pathname) ? '/history' : '/assets'}${q.toString() ? `?${q}` : ''}`; history.replaceState(history.state, '', url); lastSearch.current = location.pathname + location.search; }, []);
  useEffect(() => { const f = () => { if (!/^\/(assets|history)(\/|$)/.test(location.pathname)) return; const k = location.pathname + location.search; if (k === lastSearch.current) return; lastSearch.current = k; const u = fromUrl(); setSection(u.sec); setMedia(u.media); setSel(new Set()); setSelMode(false); setFilter(new URLSearchParams(location.search).get('tool') ?? ''); }; addEventListener('popstate', f); return () => removeEventListener('popstate', f); }, []);
  /** PB-22: a section or media filter is its own path (/assets/trash, /assets/videos); a new history entry, so Back returns to the previous one. `replace` for in-page filter changes. */
  const go = (n: string, m: MediaF = '', replace = false) => { if (n !== section || m !== media) { setSel(new Set()); setSelMode(false); } setSection(n); setMedia(m); const q = new URLSearchParams(location.search); q.delete('section'); q.delete('job');
    const base = /^\/history(\/|$)/.test(location.pathname) ? '/history' : '/assets'; const slug = slugOf(n, m); const url = `${base}${slug ? `/${slug}` : ''}${q.toString() ? `?${q}` : ''}`;
    if (url !== location.pathname + location.search) { if (replace) history.replaceState(history.state, '', url); else history.pushState({ ...(history.state ?? {}), inApp: true }, '', url); } lastSearch.current = location.pathname + location.search; };
  const pickMedia = (m: MediaF) => section === 'Assets' ? go('Assets', m, true) : setMedia(m);
  const purge = async (id: string) => { if (await purgeForever(id, toast)) setTick(n => n + 1); };
  /* The viewer over this page (Restore, Delete forever, Move to Trash, Try again) says when the list changed. */
  useEffect(() => { const f = () => setTick(n => n + 1); addEventListener('ohf:jobs-changed', f); return () => removeEventListener('ohf:jobs-changed', f); }, []);
  const askTrash = async (ids: string[]) => { const n = ids.length; if (!n) return false;
    if (!(await askConfirm({ title: n === 1 ? 'Move to Trash?' : `Move ${n} items to Trash?`, body: `Shared links will stop working. You can restore ${n === 1 ? 'it' : 'them'} from Trash.`, confirm: 'Move to Trash', cancel: 'Keep', danger: true }))) return false;
    const r = await Promise.allSettled(ids.map(id => trashJob(id))); const bad = r.filter(x => x.status === 'rejected').length; setTick(t => t + 1);
    toast(bad ? `Moved ${n - bad} of ${n} to Trash. ${bad} couldn’t be moved.` : `Moved ${n === 1 ? '1 item' : `${n} items`} to Trash.`, bad ? 'error' : undefined); return true; };
  const act = (p: Promise<unknown>) => p.then(() => setTick(n => n + 1)).catch(e => setErr(e.message));
  const tool = (id: string) => tools.find(t => t.id === id);
  const newProject = async () => { const n = await askText({ title: 'New project', label: 'Project name', placeholder: 'e.g. Spring campaign', confirm: 'Create' }); if (!n) return null; try { const p = await createProject(n); setTick(t => t + 1); return p; } catch (e: any) { toast(`Couldn’t create the project: ${e.message}`, 'error'); return null; } };
  const bal = useLedger();
  const serverFiltered = section === 'Assets';
  const inRange = (t?: number) => { const k = dayKey(t); return (!from || k >= from) && (!to || k <= to); };
  const modelOf = (j: JobState) => String((j as any).modelName || (j as any).model || '').split(' · ')[0].trim();
  const local = serverFiltered ? jobs : (filter ? jobs.filter(j => j.toolId === filter) : jobs).filter(j => !media || (media === 'Enhanced' ? !!(j as any).enhanced : (tool(j.toolId) ? mediaGroup(tool(j.toolId)!) : 'Images') === media)).filter(j => !from && !to || inRange(j.createdAt))
    .filter(j => { if (!q) return true; const t = q.toLowerCase(); return [j.input?.prompt, j.toolId, tool(j.toolId)?.name, j.createdAt ? new Date(j.createdAt).toLocaleDateString() : ''].some(v => String(v ?? '').toLowerCase().includes(t)); });
  const sorted = serverFiltered ? local : [...local].sort((a, b) => sort === 'old' ? (a.createdAt ?? 0) - (b.createdAt ?? 0) : (b.createdAt ?? 0) - (a.createdAt ?? 0));
  const shown = sorted.filter(j => !(hideDrafts && j.badge === 'draft' && j.finalId)).filter(j => section === 'Trash' || showFailed || !BAD.includes(j.status)).filter(j => !favOnly || favOf(j)).filter(j => !model || modelOf(j) === model);
  /* Results that land while you're looking (e.g. a clip an agent just made) wait behind a "Show" pill instead of pushing
   * the whole grid over; one click slots them in (and the tiles glide). Changing section/filters/search starts fresh. */
  const viewKey = `${section}|${project}|${filter}|${media}|${from}|${to}|${q}|${showFailed}|${hideDrafts}|${sort}|${favOnly}|${model}`;
  const seen = useRef<{ key: string; ids: Set<string> } | null>(null); const [, setReveal] = useState(0);
  /* only once the list for these filters has arrived (else the old list's ids would mark the new list as "new") */ const fresh = dataKey === curKey;
  if (loaded && fresh && (!seen.current || seen.current.key !== viewKey)) seen.current = { key: viewKey, ids: new Set(shown.map(j => j.id)) };
  const held = loaded && fresh && seen.current?.key === viewKey ? shown.filter(j => !seen.current!.ids.has(j.id)) : [];
  const grid = held.length ? shown.filter(j => seen.current!.ids.has(j.id)) : shown;
  const reveal = () => { held.forEach(j => seen.current!.ids.add(j.id)); setReveal(n => n + 1); };
  const gridRef = useRef<HTMLDivElement | null>(null); useFlipOnPrepend(gridRef, grid.map(j => `asset-${j.id}`), 'article[id^="asset-"]');
  const [gridW, setGridW] = useState(0); const ro = useRef<ResizeObserver | null>(null);
  const gridEl = useCallback((el: HTMLDivElement | null) => { gridRef.current = el; ro.current?.disconnect(); if (el) { const w0 = Math.floor(el.clientWidth); if (w0) setGridW(w0); } if (el && typeof ResizeObserver !== 'undefined') { ro.current = new ResizeObserver(([e]) => setGridW(w => { const n = Math.floor(e.contentRect.width); return n === w ? w : n; })); ro.current.observe(el); } }, []);
  useEffect(() => { setAssetOrder(shown.filter(j => j.status === 'done' || j.status === 'failed' || j.status === 'blocked').map(j => j.id)); }, [shown.map(j => j.id).join()]); // C3: overlay prev/next follow this order
  const failedCount = jobs.filter(j => BAD.includes(j.status)).length;
  const listSection = section === 'Assets' || section === 'Favourites' || section === 'Trash' || (section === 'Projects' && !!project);
  /* ---------- selection ---------- */
  const ids = grid.map(j => j.id); const selecting = selMode || sel.size > 0;
  const pick = (id: string, shift = false) => { const a = ids.indexOf(anchorId.current), b = ids.indexOf(id); setSel(s => { const n = new Set(s);
    if (shift && a >= 0 && b >= 0) { const [lo, hi] = a < b ? [a, b] : [b, a]; for (let i = lo; i <= hi; i++) n.add(ids[i]); } else if (n.has(id)) n.delete(id); else n.add(id); return n; }); anchorId.current = id; };
  const pickMany = (xs: string[], on: boolean) => setSel(s => { const n = new Set(s); xs.forEach(x => on ? n.add(x) : n.delete(x)); return n; });
  const clearSel = useCallback(() => { setSel(new Set()); setSelMode(false); }, []);
  useEffect(() => { setSel(s => { if (!s.size) return s; const have = new Set(shown.map(j => j.id)); const n = new Set([...s].filter(x => have.has(x))); return n.size === s.size ? s : n; }); }, [shown.map(j => j.id).join()]);
  useEffect(() => { if (!selecting) return; const k = (e: KeyboardEvent) => { if (e.key !== 'Escape' || location.pathname.startsWith('/jobs/') || document.querySelector('.apop, .dlg, .rvx, .mp-scrim')) return; clearSel(); }; addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [selecting]);
  const selJobs = shown.filter(j => sel.has(j.id)); const selDone = selJobs.filter(j => j.status === 'done' && !j.deletedAt);
  const allFav = selDone.length > 0 && selDone.every(j => favOf(j));
  const bulkFav = () => { const on = !allFav; const xs = selDone.filter(j => favOf(j) !== on); /* the shared favourite store: every heart flips now, each failure goes back */
    Promise.all(xs.map(j => saveFavourite(j, on, undefined, { quiet: true }))).then(r => { setTick(t => t + 1); const bad = r.filter(ok => !ok).length; toast(bad ? `Couldn’t update ${bad} of ${xs.length}.` : on ? `Added ${xs.length} to Favourites` : `Removed ${xs.length} from Favourites`, bad ? 'error' : undefined); }); };
  const bulkProject = (pid: string, name?: string) => { const xs = selJobs.map(j => j.id); setPop(''); Promise.allSettled(xs.map(id => setJobProject(id, pid || null))).then(r => { setTick(t => t + 1); const bad = r.filter(x => x.status === 'rejected').length; const nm = name ?? projects.find(p => p.id === pid)?.name; toast(bad ? `Couldn’t move ${bad} of ${xs.length}.` : pid ? `Added ${xs.length} to ${nm ?? 'the project'}` : `Removed ${xs.length} from their project`, bad ? 'error' : undefined); }); };
  const bulkRestore = () => { const xs = selJobs.map(j => j.id); Promise.allSettled(xs.map(id => restoreJob(id))).then(() => { setTick(t => t + 1); toast(`Restored ${xs.length} to Assets`); clearSel(); }); };
  const zipHref = (xs: string[]) => `/api/jobs/download.zip?ids=${xs.slice(0, 100).map(encodeURIComponent).join(',')}`;
  /* ---------- filters ---------- */
  const toolSeen = useRef(new Set<string>()); jobs.forEach(j => toolSeen.current.add(j.toolId)); if (filter) toolSeen.current.add(filter);
  const toolOpts = [...toolSeen.current].map(id => tool(id) ?? { id, name: id } as ToolInfo).map(t => toolSeen.current.size && [...toolSeen.current].filter(x => tool(x)?.name === t.name).length > 1 ? { ...t, name: `${t.name} · ${mediaOf(t) === 'image' ? 'Image' : mediaOf(t) === 'audio' ? 'Audio' : 'Video'}` } as ToolInfo : t).sort((a, b) => a.name.localeCompare(b.name)); // two tools with one name (Upscale): say which medium
  const modelSeen = useRef(new Set<string>()); jobs.forEach(j => { const m = modelOf(j); if (m) modelSeen.current.add(m); }); const modelOpts = [...modelSeen.current].sort();
  const fmtDay = (k: string) => k ? new Date(`${k}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
  const rangeLabel = range === 'custom' ? (dFrom && dTo ? (dFrom === dTo ? fmtDay(dFrom) : `${fmtDay(dFrom)} – ${fmtDay(dTo)}`) : dFrom ? `From ${fmtDay(dFrom)}` : dTo ? `Until ${fmtDay(dTo)}` : 'Custom range') : RANGES.find(r => r[0] === range)![1];
  const nActive = [media, filter, model, range, favOnly, showFailed && section !== 'Trash', hideDrafts].filter(Boolean).length;
  const clearFilters = () => { pickMedia(''); setFilter(''); setModel(''); setRange(''); setDFrom(''); setDTo(''); setShowFailed(false); setHideDrafts(false); setFavOnly(false); };
  const filtered = !!(media || filter || from || to || favOnly || model);
  const doneShown = shown.filter(j => j.status === 'done').map(j => j.id);
  /* PB-23: nothing in this list at all (not "nothing matches"): only a media filter may be on, which is the page itself (/assets/videos) */
  const bare = listSection && loaded && !err && !jobs.length && !q && !(filter || from || to || favOnly || model);
  /* PB-24: Trash → Restore all / Empty trash. Empty trash runs only after the in-page confirmation below. */
  const [trashBusy, setTrashBusy] = useState<'' | 'restore' | 'empty'>('');
  const restoreAll = async () => { if (trashBusy) return; setTrashBusy('restore');
    try { const r = await restoreAllTrash(); clearSel(); setTick(t => t + 1); window.dispatchEvent(new Event('ohf:jobs-changed')); toast(r.restored === 1 ? 'Restored 1 item to Assets' : `Restored ${r.restored} items to Assets`); }
    catch (e) { toast(`Couldn’t restore: ${(e as Error).message}`, 'error'); } finally { setTrashBusy(''); } };
  const emptyAll = async () => { if (trashBusy) return; const n = counts?.trash ?? jobs.length;
    if (!(await askConfirm({ title: 'Empty Trash?', body: `This deletes ${n === 1 ? 'the 1 item' : `all ${n} items`} in Trash and ${n === 1 ? 'its' : 'their'} files from this computer for good. You can’t undo this.`, confirm: 'Empty trash', cancel: 'Keep', danger: true }))) return;
    setTrashBusy('empty');
    try { const r = await emptyTrash(); clearSel(); setTick(t => t + 1); window.dispatchEvent(new Event('ohf:jobs-changed')); const b = r.removed?.bytes ?? 0; toast(`Trash emptied · ${r.purged === 1 ? '1 item' : `${r.purged} items`} deleted${b > 0 ? ` · freed ${fmtBytes(b)}` : ''}`); }
    catch (e) { toast(`Couldn’t empty Trash: ${(e as Error).message}`, 'error'); } finally { setTrashBusy(''); } };
  /* PB-23: each section's own empty state. Trash has no call to action; Favourites and an empty project point back to Assets. */
  const sectionEmpty = () => { const k = section === 'Assets' ? media : section === 'Projects' ? 'Project' : section;
    const Ic = section === 'Trash' ? TrashIcon : section === 'Favourites' ? HeartIcon : section === 'Projects' ? ProjectsIcon : null;
    const [h, p] = section === 'Trash' ? ['Trash is empty', trashDays ? `Anything you delete waits here for ${trashDays} days, so you can change your mind.` : 'Anything you delete waits here, so you can change your mind.'] : EMPTY_COPY[k] ?? ['Nothing here yet', ''];
    const toAssets = (counts?.all ?? 0) > 0 && section !== 'Assets';
    return <div className="empty assets-empty as-sec-empty" data-testid="as-empty" data-section={k || section}>
      <span className="as-sec-empty-ic" aria-hidden>{Ic ? <Ic size={26} /> : media ? <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{MEDIA_GLYPH[media]}</svg> : null}</span>
      <h2>{h}</h2>{p && <p className="helper">{p}</p>}
      {section === 'Trash' ? null : toAssets ? <button type="button" className="btn as-start" data-testid="as-to-assets" onClick={() => go('Assets')}>Browse Assets</button> : startLink}</div>; };
  /* ---------- tiles ---------- */
  const narrow = gridW > 0 && gridW < 560; const W = gridW || 1000; const rowH = SIZES[view.size] ?? 230;
  const openMenu = (e: React.MouseEvent<HTMLElement>, id: string) => { const b = e.currentTarget; if (menu === id) { setMenu(''); return; } menuAnchor.current = b; const r = b.getBoundingClientRect(); const m = b.closest('.assets')?.getBoundingClientRect(); setMenuAlign(m && r.right - 264 < m.left ? 'start' : 'end'); setMenu(id); };
  /* PB-02: a live job reads from the same shared active list as the tool page (same words, same percent); PB-04: a cancel in flight shows Canceled at once */
  const liveById = new Map(liveJobs.map(x => [x.id, x]));
  const liveView = (j: JobState): JobState => isCanceling(j.id) && isActiveJob(j) ? canceledPatch(j) : isActiveJob(j) && liveById.has(j.id) ? { ...j, ...liveById.get(j.id)! } : j;
  const toggleFav = (j: JobState) => void toggleFavourite(j, toast); /* shared store (shared/favourites.ts): the viewer, this grid and the feeds show one value */
  const copyLink = (j: JobState) => { const tok = (j as any).shareToken; const u = tok ? `${location.origin}/s/${tok}` : `${location.origin}/jobs/${j.id}`; navigator.clipboard?.writeText(u).then(() => { flash(j.id); setTimeout(() => setMenu(m => m === j.id ? '' : m), 1200); }).catch(() => toast('Couldn’t copy the link', 'error')); }; // PB-14: the item says Copied, then the menu closes
  const tile = (j0: JobState, style: React.CSSProperties, a: number) => {
    const j = liveView(j0);
    const t = tool(j.toolId); const on = sel.has(j.id); const isVid = j.status === 'done' && !!j.resultUrl && !/\.(png|jpe?g|webp|gif|avif|wav|mp3|ogg|flac|m4a|glb)(\?|$)/i.test(j.resultUrl); /* a GLB is a 3D model, not a video */
    const rc = !j.deletedAt ? recreateUrl(j, tools) : null; const rf = !j.deletedAt ? refTarget(j, tools) : null;
    const startLp = (e: React.PointerEvent) => { if (e.pointerType !== 'touch' || (e.target as HTMLElement).closest('.asset-tools, .as-check')) return; clearTimeout(lp.current.t); lp.current = { x: e.clientX, y: e.clientY, fired: false, t: window.setTimeout(() => { lp.current.fired = true; setSelMode(true); pick(j.id); navigator.vibrate?.(10); }, 450) }; };
    const endLp = () => clearTimeout(lp.current.t);
    return (
      <article key={j.id} id={`asset-${j.id}`} style={style} data-sel={on || undefined} className={`asset asset-${j.status}${j.id === hlId ? ' asset-hl' : ''}${menu === j.id ? ' menu-open' : ''}${on ? ' as-on' : ''}`}
        onPointerDown={startLp} onPointerUp={endLp} onPointerCancel={endLp} onPointerMove={e => { if (Math.hypot(e.clientX - lp.current.x, e.clientY - lp.current.y) > 10) endLp(); }} onContextMenu={e => { if (lp.current.fired) e.preventDefault(); }}
        onClickCapture={e => { const tg = e.target as HTMLElement; if (tg.closest('.asset-tools, .as-check, .asset-err')) return;
          if (lp.current.fired) { lp.current.fired = false; e.preventDefault(); e.stopPropagation(); return; }
          if (selecting || e.shiftKey) { e.preventDefault(); e.stopPropagation(); pick(j.id, e.shiftKey); } }}>
        <div className="asset-media">
          {j.status === 'done' && j.resultUrl
            ? <Link to={`/jobs/${j.id}`} className="asset-link-media" aria-label={`Open ${t?.name ?? j.toolId} result`}>{/\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(j.resultUrl) ? <img src={gridSrc(j.resultUrl, rowH * 2)} alt="" loading="lazy" decoding="async" draggable={false} onLoad={e => noteAspect(j.id, e.currentTarget.naturalWidth, e.currentTarget.naturalHeight, a)} />
              : /\.(wav|mp3|ogg|flac|m4a)(\?|$)/i.test(j.resultUrl) ? <span className="asset-audio" role="img" aria-label="Audio result"><AudioCover seed={j.id} prompt={(j as any).input?.prompt} kind={audioKindOfJob(j)} /><span className="asset-audio-g" aria-hidden>♪</span></span>
              : is3dUrl(j.resultUrl) ? (posterOf3d(j) ? <img src={posterOf3d(j)!} alt="" loading="lazy" decoding="async" draggable={false} data-kind="3d" onLoad={e => noteAspect(j.id, e.currentTarget.naturalWidth, e.currentTarget.naturalHeight, a)} /> : <span className="asset-audio asset-3d" aria-label="3D model"><CubeIcon size={28} /></span>) /* 3D (2026-10-23): the saved still, never a live viewer in the grid */
              : <video className={/\.webm(\?|$)/i.test(j.resultUrl ?? '') ? 'alpha-bg' : undefined} src={j.resultUrl} poster={gridSrc(thumbOf(j), rowH * 2)} muted loop playsInline preload="none" onLoadedMetadata={e => noteAspect(j.id, e.currentTarget.videoWidth, e.currentTarget.videoHeight, a)} onMouseEnter={e => { e.currentTarget.play().catch(() => {}); }} onMouseLeave={e => e.currentTarget.pause()} />}</Link>
            : (() => { const inp: any = j.input ?? {}; const src = inp.imageUrl ?? inp.image ?? inp.refs?.[0] ?? null; const vid = inp.videoUrl ?? null; const ex = exampleFor(j.toolId + j.id);
              const bad = ['failed', 'blocked'].includes(j.status); const live = j.status === 'running' || j.status === 'queued';
              if (live) return <Link to={`/jobs/${j.id}`} className={`asset-stile asset-gen st-${j.status}`} aria-label={`Open ${t?.name ?? j.toolId} job`}><GenTile job={j} inButton testId={`asset-gen-${j.id}`} onCanceled={() => setTick(n => n + 1)} /></Link>; /* 4i: the shared generating tile */
              return <Link to={`/jobs/${j.id}`} className={`asset-stile st-${j.status}`}>
                {vid ? <img src={`/api/media/thumb?url=${encodeURIComponent(vid)}`} alt="" loading="lazy" /> : <img src={typeof src === 'string' ? src : ex.poster} alt="" loading="lazy" />}
                <span className="as-ov" title={(j as any).requeuedAt && j.status === 'queued' ? 'Back in line after a server restart. You weren’t charged twice.' : undefined}>{bad ? <FailIcon job={j} size={40} /> : live ? <span className="as-spin" aria-hidden /> : <span className="as-ic" aria-hidden>⦸</span>}<b>{live ? jobStatusLabel(j) : bad ? <FailTitle job={j} /> : label[j.state ?? j.status] ?? j.status}{(() => { if (ownAccountsNow()) return ''; /* QA #7: no app balance in own-accounts mode */ const amt = heldBack(j); return amt ? ` · ✦${amt} back to your balance` : (j as any).refund?.refunded ? ' · back to your balance' : ''; })()}</b></span>
                {live && <div className="asset-progress"><div style={{ width: `${jobPctShown(j) ?? 0}%` }} /></div>}
              </Link>; })()}
          {isVid && <span className="as-play" aria-hidden><svg width="14" height="14" viewBox="0 0 14 14"><path d="M4 2.2v9.6L11.6 7z" fill="currentColor" /></svg></span>}
          {(j as any).feature?.label && <span className="asset-feat" data-testid={`asset-feat-${j.id}`}>{(j as any).feature.label}</span>}
          <button type="button" className="as-check" role="checkbox" aria-checked={on} aria-label={`Select ${t?.name ?? j.toolId} result`} data-testid={`as-check-${j.id}`} onClick={e => { e.preventDefault(); e.stopPropagation(); pick(j.id, e.shiftKey); }}><CheckGlyph /></button>
          <span className="pp-assets-badges" style={isActiveJob(j) ? { display: 'none' } : undefined /* 4i: the generating tile shows place, price and Sample itself */}>{j.badge && <span className={`badge badge-${j.badge}`} data-badge={j.badge}>{j.badge === 'draft' ? 'Draft' : 'Final'}</span>}{isDemoJob(j) && <span className="badge demo-badge" data-testid={`asset-demo-${j.id}`} title={demoMessage(j) ?? undefined}>{demoTag(j)}</span>}
            {j.status !== 'done' && !isActiveJob(j) && (() => { const full = jobStatusLabel(j); const short = isActiveJob(j) ? jobStatusShort(j) : full; /* PB-05: narrow tiles show the short form, so the badge never runs under the buttons or off the tile */
              return <span className={`status status-${j.status}${short !== full ? ' st-2' : ''}`} data-state={j.state} title={full}><span className="st-full">{full}</span>{short !== full && <span className="st-short" aria-hidden>{short}</span>}</span>; })()}</span>
          <div className="asset-tools">
            {isCancellable(j) && !isActiveJob(j) && <button type="button" className="at-btn at-cancel" data-testid={`at-cancel-${j.id}`} onClick={e => { e.preventDefault(); e.stopPropagation(); void cancelQueued(j, toast).then(ok => ok && setTick(n => n + 1)); }}>Cancel</button> /* PB-03: a labelled Cancel at the tile's top-right (PB-04: optimistic) */}
            {j.status === 'done' && !j.deletedAt && <button className="at-btn" aria-pressed={favOf(j)} aria-label={favOf(j) ? 'Remove from Favourites' : 'Add to Favourites'} title={favOf(j) ? 'Remove from Favourites' : 'Add to Favourites'} data-fav onClick={() => toggleFav(j)}><HeartIcon size={14} /></button>}
            {j.resultUrl && <a className="at-btn" href={j.resultUrl} download aria-label="Download" title="Download"><DownloadIcon size={14} /></a>}
            {rc && !BAD.includes(j.status) && <button className="at-btn" aria-label={`Recreate in ${rc.tool.name}`} title={`Recreate in ${rc.tool.name}`} data-testid={`at-recreate-${j.id}`} onClick={() => navigate(rc.url)}>{G(P.recreate, 14, '')}</button>}
            {rf && <button className="at-btn" aria-label={`Use as reference in ${rf.tool.name}`} title={`Use as reference in ${rf.tool.name}`} data-testid={`at-ref-${j.id}`} onClick={() => navigate(rf.url)}>{G(P.ref, 14, '')}</button>}
            {j.deletedAt && <><button className="at-btn btn-restore" aria-label="Restore" title="Restore" onClick={() => act(restoreJob(j.id))}>↺</button><button className="at-btn btn-purge" aria-label="Delete forever" title="Delete forever" data-testid="asset-purge" onClick={() => purge(j.id)}><TrashIcon size={14} /></button></>}
            <button className="at-btn" aria-label="More actions" aria-haspopup="menu" aria-expanded={menu === j.id} data-testid={`asset-more-${j.id}`} onClick={e => openMenu(e, j.id)}><MoreIcon size={14} /></button>
          </div>
          {j.error && errLine(j) && <div role="note" data-testid={`asset-err-${j.id}`} className={`asset-err asset-err-ov ${openErr.has(j.id) ? 'open' : ''}`}><p>{errLine(j)}</p>
            {errLine(j).length > 90 && <button className="link-btn" aria-expanded={openErr.has(j.id)} onClick={() => setOpenErr(s => { const n = new Set(s); n.has(j.id) ? n.delete(j.id) : n.add(j.id); return n; })}>{openErr.has(j.id) ? 'Show less' : 'Show more'}</button>}</div>}
        </div>
      </article>);
  };
  const byId = new Map(grid.map(j => [j.id, j]));
  const groups = view.split ? groupByDay(grid) : [{ key: '*', items: grid }];
  const lay = (items: JobState[]) => { const xs = items.map(j => ({ id: j.id, a: aspectOf(j, aspects[j.id]) }));
    if (view.layout === 'square') return <div className="ag-square" style={{ ['--as-sq' as any]: `${narrow ? Math.min(rowH, Math.floor((W - GAP) / 2)) : rowH}px` }}>{xs.map(x => tile(byId.get(x.id)!, {}, x.a))}</div>;
    if (narrow) return <div className="ag-masonry">{masonry(xs, view.size <= 1 ? 3 : 2).map((col, c) => <div key={c} className="ag-col">{col.map(x => tile(byId.get(x.id)!, { aspectRatio: String(x.a) }, x.a))}</div>)}</div>;
    return <div className="ag-rows">{justify(xs, W, rowH, GAP).map((row, r) => <div key={r} className="ag-row">{row.map(b => tile(byId.get(b.id)!, { width: b.w, height: b.h }, xs.find(x => x.id === b.id)!.a))}</div>)}</div>; };
  /* ---------- ⋯ menu: Open, Select | Send to ›, Recreate, Use as reference, Save as look, Add to project › | Favourite, Copy link, Download, Share | Move to Trash ---------- */
  const mj = menu ? shown.find(j => j.id === menu) ?? null : null;
  const menuBody = mj && (() => { const j = mj;
    const live = j.status === 'done' && !j.deletedAt; const groupsS = live ? sendGroups(j, tools) : []; const nT = groupsS.reduce((n, g) => n + g.items.length, 0); const trash = !j.deletedAt && j.status !== 'running' && j.status !== 'queued';
    const rc = !j.deletedAt && !BAD.includes(j.status) ? recreateUrl(j, tools) : null; const rf = !j.deletedAt ? refTarget(j, tools) : null; const owner = (j as any).isOwner !== false;
    const kindOk = live && !/\.(wav|mp3|ogg|flac|m4a)(\?|$)/i.test(j.resultUrl ?? '');
    const subRow = (k: 'send' | 'project', lbl: string, icon: React.ReactNode, extra?: string) => <button type="button" ref={k === 'send' ? sendAnchor : undefined} className={`am-item am-subrow${sub === k ? ' am-open' : ''}`} role="menuitem" aria-haspopup={k === 'send' ? 'dialog' : 'menu'} aria-expanded={sub === k} data-testid={`am-${k}-${j.id}`} onKeyDown={k === 'send' ? e => { if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); setSub('send'); } } : undefined} onClick={() => setSub(sub === k ? '' : k)}>{icon}<span className="am-l">{lbl}</span>{extra && <small className="am-x">{extra}</small>}{G(P.chev, 14, 'am-chev')}</button>;
    const back = (lbl: string) => <button type="button" className="am-item am-back" onClick={() => setSub('')}>{G(P.back)}<span className="am-l">{lbl}</span></button>;
    const run = (f: () => void) => () => { setMenu(''); f(); };
    return <div className={`asset-menu${sub === 'project' ? ' am-sub-open' : ''}`} data-testid={`asset-menu-${j.id}`}>
      <Link to={`/jobs/${j.id}`} className="am-item" role="menuitem" onClick={() => { setOpener(j.id); setMenu(''); }}>{G(P.open)}<span className="am-l">Open</span></Link>
      <button type="button" className="am-item" role="menuitem" data-testid={`am-select-${j.id}`} onClick={run(() => { setSelMode(true); pick(j.id); })}>{G(P.select)}<span className="am-l">{sel.has(j.id) ? 'Deselect' : 'Select'}</span></button>
      {(nT > 0 || rc || rf || kindOk) && <hr className="am-div" />}
      {nT > 0 && subRow('send', 'Send to', G(P.send), String(nT))}
      {sub === 'send' && <AssetSendMenu anchor={sendAnchor} cardTrigger={menuAnchor} groups={groupsS} jobId={j.id} onBack={() => setSub('')} onClose={closeMenu} onSelect={tt => { setMenu(''); sendTo(j, tt); }} />}
      {rc && <button type="button" className="am-item" role="menuitem" data-testid={`am-openin-${j.id}`} onClick={run(() => navigate(rc.url))}>{G(P.recreate)}<span className="am-l">Recreate</span><small className="am-x">{rc.tool.name}</small></button>}
      {rf && <button type="button" className="am-item" role="menuitem" data-testid={`am-ref-${j.id}`} onClick={run(() => navigate(rf.url))}>{G(P.ref)}<span className="am-l">Use as reference</span><small className="am-x">{rf.tool.name}</small></button>}
      {canAddSound(j as any) && tools.some(t => t.id === 'soundtrack') && <button type="button" className="am-item" role="menuitem" data-testid={`am-sound-${j.id}`} onClick={run(() => setSoundJob(j.id))}><SoundIcon size={16} className="am-ic" /><span className="am-l">Add sound</span><small className="am-x">MMAudio · free</small></button>}
      {live && outputMedium(j, tools) === 'video' && <button type="button" className="am-item" role="menuitem" data-testid={`am-stitch-${j.id}`} onClick={run(() => navigate(stitchAddHref(j.id)))}><StitchIcon size={16} className="am-ic" /><span className="am-l">Add to Stitch</span><small className="am-x">Timeline · free</small></button>}
      {rf && tools.some(t => t.id === 'three-d') && <button type="button" className="am-item" role="menuitem" data-testid={`am-3d-${j.id}`} onClick={run(() => navigate(sendTo3dHref(j.id)))}><CubeIcon size={16} className="am-ic" /><span className="am-l">Send to 3D</span><small className="am-x">Image to 3D</small></button>}
      {kindOk && owner && canSaveLook(j) && <button type="button" className="am-item" role="menuitem" data-testid={`am-look-${j.id}`} onClick={run(() => openSaveLook({ job: j }))}><span className="am-ic am-tick" aria-hidden>✦</span><span className="am-l">Save as look</span></button>}
      {live && owner && subRow('project', 'Add to project', <ProjectsIcon size={16} className="am-ic" />, projects.find(p => p.id === j.projectId)?.name)}
      {sub === 'project' && <div className="am-nest" aria-label="Add to project">{back('Add to project')}{[{ id: '', name: 'No project' }, ...projects].map(p => <button type="button" key={p.id || 'none'} className="am-item" role="menuitemradio" aria-checked={(j.projectId ?? '') === p.id} onClick={run(() => act(setJobProject(j.id, p.id || null)))}><span className="am-ic am-tick" aria-hidden>{(j.projectId ?? '') === p.id ? '✓' : ''}</span><span className="am-l">{p.name}</span></button>)}
        <button type="button" className="am-item" role="menuitem" onClick={run(async () => { const p = await newProject(); if (p) act(setJobProject(j.id, p.id)); })}><span className="am-ic am-tick" aria-hidden>+</span><span className="am-l">New project…</span></button></div>}
      <hr className="am-div" />
      {live && <button type="button" className="am-item" role="menuitem" data-testid={`am-fav-${j.id}`} aria-pressed={favOf(j)} onClick={run(() => toggleFav(j))}><HeartIcon size={16} className="am-ic" /><span className="am-l">{favOf(j) ? 'Remove from Favourites' : 'Add to Favourites'}</span></button>}
      <button type="button" className="am-item" role="menuitem" data-testid={`am-copy-${j.id}`} onClick={() => copyLink(j)}>{G(P.link)}<span className="am-l">{copied === j.id ? <Copied text={(j as any).shareToken ? 'Copied' : 'Copied, only you can open it'} /> : 'Copy link'}</span></button>
      {j.resultUrl && <a className="am-item" role="menuitem" data-testid={`am-download-${j.id}`} href={j.resultUrl} download onClick={() => setMenu('')}><DownloadIcon size={16} className="am-ic" /><span className="am-l">Download</span></a>}
      {live && owner && <button type="button" className="am-item" role="menuitem" data-testid={`am-share-${j.id}`} onClick={run(() => setShare(j.id))}>{G(P.share)}<span className="am-l">Share</span></button>}
      {j.status === 'done' && owner && <button type="button" className="am-item" role="menuitem" data-testid={`am-workflow-${j.id}`} onClick={run(() => setWfJob(j.id))}>{G(<><rect x="1.5" y="2.5" width="4.5" height="3.5" rx="1" /><rect x="10" y="2.5" width="4.5" height="3.5" rx="1" /><rect x="5.75" y="10" width="4.5" height="3.5" rx="1" /><path d="M6 4.25h4M3.75 6v1.5A1.5 1.5 0 0 0 5.25 9H6M12.25 6v1.5A1.5 1.5 0 0 1 10.75 9H10" /></>)}<span className="am-l">View workflow</span><small className="am-x">ComfyUI</small></button>}
      {trash && <><hr className="am-div" /><button type="button" className="am-item am-danger" role="menuitem" data-testid={`am-trash-${j.id}`} onClick={run(() => askTrash([j.id]))}><TrashIcon size={16} className="am-ic" /><span className="am-l">Move to Trash</span></button></>}
    </div>; })();
  const startLink = <Link to={tools.find(t => t.id === 'create-image')?.route ?? tools[0]?.route ?? '/tools/create-image'} className="btn as-start" data-testid="as-start"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M10 3.5 11.8 8.2 16.5 10l-4.7 1.8L10 16.5l-1.8-4.7L3.5 10l4.7-1.8z" /><path d="M18 14.5v5M15.5 17h5" /></svg>Start generating</Link>;
  const secCount = (n: string) => counts ? ({ Assets: counts.all, Projects: counts.projects, Favourites: counts.favourites, Trash: counts.trash } as Record<string, number>)[n] : undefined;
  /* Filter popover: rows that open in place (Type, Model, Tool, Date range), then Activity and Status */
  const frow = (k: 'type' | 'model' | 'tool' | 'date', lbl: string, val: string, body: React.ReactNode) => <>
    <button type="button" className={`am-item am-subrow${fsub === k ? ' am-open' : ''}`} data-apop-item aria-expanded={fsub === k} data-testid={`asf-row-${k}`} onClick={() => setFsub(fsub === k ? '' : k)}><span className="am-l">{lbl}</span><small className="am-x">{val}</small>{G(P.chev, 14, 'am-chev')}</button>
    {fsub === k && <div className="am-nest" role="radiogroup" aria-label={lbl}>{body}</div>}</>;
  const radio = (on: boolean, lbl: React.ReactNode, onClick: () => void, tid: string, icon?: React.ReactNode) => <button key={tid} type="button" className="am-item" role="radio" aria-checked={on} data-testid={tid} onClick={onClick}>{icon ?? <span className="am-ic am-tick" aria-hidden>{on ? '✓' : ''}</span>}<span className="am-l">{lbl}</span>{icon && on && <span className="am-tick" aria-hidden>✓</span>}</button>;
  const sw = (on: boolean, lbl: React.ReactNode, set: (v: boolean) => void, tid: string) => <button type="button" className="am-item asf-sw" role="switch" aria-checked={on} data-apop-item data-testid={tid} onClick={() => set(!on)}><span className="am-l">{lbl}</span><i aria-hidden /></button>;
  return (
    <div className={`assets-shell pp-assets${selecting ? ' as-selecting' : ''}`}>
      <aside className="assets-side" aria-label="Library sections">
        {SECTIONS.map(([n, I]) => <button key={n} data-testid={`as-sec-${n.toLowerCase()}`} className={`assets-link ${section === n && !media ? 'on' : ''}`} onClick={() => go(n)}><span className="pp-assets-ic" aria-hidden><I size={16} /></span>{n}{n !== 'Trash' && <span className="count">{secCount(n) ?? ''}</span>}</button>)}
        <span className="side-label as-tools-h">Features</span>
        {(['Images', 'Video', 'Audio', 'Enhanced'] as const).map(g => <button key={g} data-testid={`as-media-${g.toLowerCase()}`} className={`assets-link ${section === 'Assets' && media === g ? 'on' : ''}`} onClick={() => go('Assets', g)}><span className="as-mic pp-assets-ic" aria-hidden><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{MEDIA_GLYPH[g]}</svg></span>{g}<span className="count">{counts ? String(counts.byMedia[g] ?? 0) : ''}</span></button>)}
      </aside>
    {/* BH5 P1 / PB-23: an empty library or section hides search, filters and the credits line (nothing to act on yet) */}
    {section === 'Brands' ? <div className="assets as-brand" data-testid="assets-main">
      <div className="assets-top"><div className="page-head mh"><span className="eyebrow">Assets</span><h1>Brands</h1><p className="helper" data-testid="as-sec-copy">{SECTION_COPY.Brands}</p></div></div>
      <ScrollTabs><div className="seg seg-scroll assets-mobile-tabs" role="tablist">{SECTIONS.map(([n]) => { const on = section === n && !media; return <button key={n} role="tab" aria-selected={on} className={on ? 'on' : ''} onClick={() => go(n)}>{n}</button>; })}</div></ScrollTabs>
      <Suspense fallback={<Skeleton variant="tiles" count={3} />}><BrandKitPage /></Suspense>
    </div> :
    <div className={`assets${bare ? ' assets-libempty' : ''}`} data-testid="assets-main">
      <div className="assets-top"><div className="page-head mh"><span className="eyebrow">{section === 'Assets' && !media ? 'Library' : 'Assets'}</span><h1>{mediaTitle(media) || section}</h1>{section !== 'Assets' && <p className="helper" data-testid="as-sec-copy">{section === 'Trash' && trashDays != null ? (trashDays > 0 ? `Items are deleted for good after ${trashDays} days. Restore anything before then.` : 'Items stay here until you delete them.') : SECTION_COPY[section]}</p>}
        {section === 'Trash' && loaded && jobs.length > 0 && <div className="row as-trash-acts" data-testid="as-trash-acts"><button type="button" className="btn btn-sm" data-testid="as-restore-all" disabled={!!trashBusy} onClick={restoreAll}>{trashBusy === 'restore' ? 'Restoring…' : 'Restore all'}</button><button type="button" className="btn btn-sm btn-ghost as-empty-trash" data-testid="as-empty-trash" disabled={!!trashBusy} onClick={emptyAll}>{trashBusy === 'empty' ? 'Emptying…' : 'Empty trash'}</button></div>}</div>
        {listSection && grid.length > 0 && <button type="button" className={`as-select-btn${selecting ? ' on' : ''}`} data-testid="as-select" aria-pressed={selecting} onClick={() => selecting ? clearSel() : setSelMode(true)}>{selecting ? 'Done' : 'Select'}</button>}
        <div className="as-head-acts">
          {<div className="pp-assets-find"><label className="assets-search"><SearchIcon size={14} /><input type="search" placeholder="Search by prompt, tool or date" aria-label="Search assets" value={q} onChange={e => setQ(e.target.value)} autoFocus={new URLSearchParams(location.search).has('q')} /></label></div>}
          {listSection && !bare && <button ref={fRef} type="button" className={`as-hbtn${nActive ? ' on' : ''}`} data-testid="as-filters-btn" aria-haspopup="dialog" aria-expanded={pop === 'filters'} aria-label={nActive ? `Filter (${nActive} active)` : 'Filter'} onClick={() => setPop(pop === 'filters' ? '' : 'filters')}>{G(P.filter, 15, '')}<span>Filter</span>{nActive > 0 && <b className="as-dot" aria-hidden>{nActive}</b>}</button>}
          {listSection && !bare && <button ref={vRef} type="button" className="as-hbtn" data-testid="as-view-btn" aria-haspopup="dialog" aria-expanded={pop === 'view'} onClick={() => setPop(pop === 'view' ? '' : 'view')}>{G(P.view, 15, '')}<span>View</span></button>}
          {tip && !bare && <div className="as-tip" role="note" data-testid="as-tip">Now you can search by date and prompt<button type="button" aria-label="Dismiss tip" onClick={() => { try { localStorage.setItem('oj:assets-tip', '1'); } catch { /* storage off */ } setTip(false); }}>✕</button></div>}
        </div></div>
      {deepJob && deepNote && <div className="as-deep" data-testid="as-deep">{deepNote}{pinned && <> <Link to={`/jobs/${pinned.id}`}>{pinLabel(pinned, tool(pinned.toolId)?.name)}</Link></>}</div>}
      <ScrollTabs><div className="seg seg-scroll assets-mobile-tabs" role="tablist">{SECTIONS.map(([n]) => { const on = section === n && !media; return <button key={n} role="tab" aria-selected={on} className={on ? 'on' : ''} onClick={() => go(n)}>{n}</button>; })}
        {/* PB-26: the media filters as tabs too (no sidebar on a phone) */}{MEDIAS.map(g => { const on = section === 'Assets' && media === g; return <button key={g} role="tab" aria-selected={on} className={`as-mtab${on ? ' on' : ''}`} data-testid={`as-mtab-${g.toLowerCase()}`} onClick={() => go('Assets', g)}>{mediaTitle(g)}</button>; })}</div></ScrollTabs>
      {section === 'Projects' && <div className="projects-bar row">
        {projects.map(p => { const par = p.parentId ? projects.find(x => x.id === p.parentId) : null; return <button key={p.id} data-testid={`proj-chip-${p.id}`} className={`chip ${project === p.id ? 'on' : ''}`} onClick={() => setProject(project === p.id ? '' : p.id)}>{par ? `${par.name} / ` : ''}{p.name} ({p.count ?? 0}){pubIds.has(p.id) ? ' · Public' : ''}</button>; })}
        <button className="btn btn-sm" data-testid="proj-new" onClick={async () => { const p = await newProject(); if (p) setProject(p.id); }}>New project</button>
        {project && <button className="btn btn-sm btn-ghost" data-testid="proj-delete" onClick={async () => { const cur = projects.find(p => p.id === project); const ok = await askConfirm({ title: `Delete “${cur?.name ?? 'this project'}”?`, body: 'Its items stay in Assets without a project, and any sub-projects move up one level.', confirm: 'Delete project', cancel: 'Keep', danger: true }); if (ok) { act(deleteProject(project)); setProject(''); } }}>Delete project</button>}
      </div>}
      {section === 'Projects' && project && (() => { const cur = projects.find(p => p.id === project); if (!cur) return null; const isPub = pubIds.has(project);
        const kids = (id: string): string[] => projects.filter(p => p.parentId === id).flatMap(p => [p.id, ...kids(p.id)]); const blocked = new Set([project, ...kids(project)]);
        return <div className="proj-tools row" data-testid="proj-tools">
          <form className="proj-rename" onSubmit={e => { e.preventDefault(); const n = rename.trim(); if (n && n !== cur.name) act(patchProject(project, { name: n })); }}><input aria-label="Project name" data-testid="proj-name" value={rename} maxLength={80} onChange={e => setRename(e.target.value)} /><button className="btn btn-sm" type="submit" disabled={!rename.trim() || rename.trim() === cur.name}>Rename</button></form>
          <label className="proj-move">Move into <select data-testid="proj-move" value={cur.parentId ?? ''} onChange={e => act(patchProject(project, { parentId: e.target.value || null }))}><option value="">Top level</option>{projects.filter(p => !blocked.has(p.id)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <div className="seg vis-seg" role="radiogroup" aria-label="Project visibility">{(['private', 'public'] as const).map(v => <button key={v} type="button" role="radio" aria-checked={(v === 'public') === isPub} data-testid={`proj-vis-${v}`} className={(v === 'public') === isPub ? 'on' : ''} onClick={() => act(setProjectVisibility(project, v).then(() => setPubTick(n => n + 1)))}>{v === 'public' ? 'Public' : 'Private'}</button>)}</div>
          {isPub && <span className="helper">Listed in Community → Projects.</span>}
        </div>; })()}
      {/* the credits line (quiet, right) */}
      {listSection && (bal || !loaded) && <div className="pp-assets-bar">
        {!bal && !loaded && <div className="usage usage-ph" aria-hidden="true" />}{/* BH4 CLS: reserve the balance line while loading */}
        {bal && !ownAccountsNow() && <details className="usage"><summary>Team balance: {ledgerUsd(bal.balance)} left · <Link to="/usage">Where did it go?</Link></summary>
          <table><tbody>{bal.entries.slice(0, 30).map(e => <tr key={e.id}><td>{new Date(e.ts).toLocaleTimeString()}</td><td>{e.kind}</td><td>{e.amount > 0 ? '+' : e.amount < 0 ? '−' : ''}{ledgerUsd(Math.abs(e.amount))}</td><td>{e.jobId ? <Link to={`/jobs/${e.jobId}`}>{e.jobId}</Link> : ''}</td><td>{e.note}</td></tr>)}</tbody></table>
        </details>}
      </div>}
      <Popover open={pop === 'filters'} anchor={fRef} onClose={closePop} label="Filter" placement="bottom" align="end" width={300} className="as-pop" testId="as-filters">
        <div className="asset-menu asf">
          <div className="am-gh">Type</div>
          {frow('type', 'Type', media === 'Video' ? 'Videos' : media || 'All', (['', 'Images', 'Video', 'Audio', 'Enhanced'] as MediaF[]).map(m => radio(media === m, m === 'Video' ? 'Videos' : m || 'All', () => pickMedia(m), `asf-media-${(m || 'all').toLowerCase()}`)))}
          {frow('model', 'Model', model || 'All models', [radio(!model, 'All models', () => setModel(''), 'asf-model-all'), ...modelOpts.map(m => radio(model === m, m, () => setModel(m), `asf-model-${m}`))])}
          {frow('tool', 'Tool', filter ? tool(filter)?.name ?? filter : 'All tools', [radio(!filter, 'All tools', () => setFilter(''), 'asf-tool-all'), ...toolOpts.map(tt => radio(filter === tt.id, tt.name, () => setFilter(tt.id), `asf-tool-${tt.id}`, <ToolIconFor id={tt.id} ui={(tt as any).ui} size={16} className="am-ic" />))])}
          {frow('date', 'Date range', rangeLabel, <>{RANGES.map(([k, l]) => radio(range === k, l, () => setRange(k), `asf-range-${k || 'any'}`))}
            {range === 'custom' && <div className="asf-dates"><label>From<input type="date" data-testid="as-day" value={dFrom} max={dTo || undefined} onChange={e => setDFrom(e.target.value)} /></label><label>To<input type="date" data-testid="as-day-to" value={dTo} min={dFrom || undefined} onChange={e => setDTo(e.target.value)} /></label></div>}</>)}
          <hr className="am-div" /><div className="am-gh">Activity</div>
          {sw(favOnly, 'Favourites only', setFavOnly, 'asf-fav')}
          <hr className="am-div" /><div className="am-gh">Status</div>
          {section !== 'Trash' && sw(showFailed, <>Show failed{failedCount ? <small className="am-x"> {failedCount}</small> : null}</>, setShowFailed, 'asf-failed')}
          {sw(hideDrafts, 'Hide drafts that have a final', setHideDrafts, 'asf-drafts')}
          <div className="asf-foot"><button type="button" className="btn btn-sm btn-ghost" disabled={!nActive} data-testid="asf-clear" onClick={clearFilters}>Clear all</button>{/* PB-28: every option applies at once (the grid behind updates live), so this only closes; the count says what's shown now */}<span className="asf-n" aria-live="polite" data-testid="asf-count">{shown.length === 1 ? '1 shown' : `${shown.length} shown`}</span><button type="button" className="btn btn-sm" data-testid="asf-done" onClick={closePop}>Done</button></div>
        </div>
      </Popover>
      <Popover open={pop === 'view'} anchor={vRef} onClose={closePop} label="View" placement="bottom" align="end" width={280} className="as-pop" testId="as-view">
        <div className="asset-menu asf">
          <div className="am-gh">Layout</div>
          {radio(view.layout === 'masonry', 'Masonry', () => setView({ layout: 'masonry' }), 'asv-masonry')}
          {radio(view.layout === 'square', 'Square', () => setView({ layout: 'square' }), 'asv-square')}
          <hr className="am-div" />
          {sw(view.split, 'Split by date', v => setView({ split: v }), 'asv-split')}
          <div className="am-gh">Card size</div>
          <div className="asv-size" role="radiogroup" aria-label="Card size">{SIZES.map((_, i) => <button key={i} type="button" role="radio" aria-checked={view.size === i} aria-label={`Size ${i + 1} of ${SIZES.length}`} data-testid={`asv-size-${i}`} className={view.size === i ? 'on' : ''} onClick={() => setView({ size: i })}><i style={{ width: 6 + i * 2, height: 6 + i * 2 }} /></button>)}</div>
          <hr className="am-div" /><div className="am-gh">Sort</div>
          {radio(sort === 'new', 'Newest first', () => setView({ sort: 'new' }), 'as-sort-new')}
          {radio(sort === 'old', 'Oldest first', () => setView({ sort: 'old' }), 'as-sort-old')}
          {doneShown.length > 0 && <><hr className="am-div" />
            <a className="am-item zip-bulk" role="menuitem" href={zipHref(doneShown)} download title="Includes every output and a settings file to recreate it." onClick={() => setPop('')}><DownloadIcon size={16} className="am-ic" /><span className="am-l">Download all shown</span><small className="am-x">ZIP · {Math.min(100, doneShown.length)}</small></a>
            <button type="button" className="am-item" role="menuitem" data-testid="as-select-all" onClick={() => { setSelMode(true); pickMany(grid.map(j => j.id), true); setPop(''); }}>{G(P.select)}<span className="am-l">Select all shown</span></button></>}
        </div>
      </Popover>
      <Popover open={!!mj} anchor={menuAnchor} onClose={closeMenu} label="Asset actions" role="menu" placement="bottom" align={menuAlign} width={264} className="as-pop as-pop-asset">{menuBody}</Popover>
      {wfJob && <WorkflowDialog jobId={wfJob} onClose={() => setWfJob('')} />}
      {soundJob && (() => { const sj: any = shown.find(x => x.id === soundJob); const o0 = sj?.outputs?.[0]; return <AddSoundDialog jobId={soundJob} output={0} durationSec={o0?.durationSec ?? null} hasAudio={o0?.hasAudio} onClose={() => setSoundJob('')} />; })()}
      {share && <ShareDialog jobId={share} onClose={() => setShare('')} onError={m => toast(m, 'error')} />}
      {!listSection ? section === 'Projects' && projects.length ? <div className="empty assets-empty as-sec-empty" data-testid="as-pick-project"><span className="as-sec-empty-ic" aria-hidden><ProjectsIcon size={26} /></span><h2>Pick a project</h2><p className="helper">Choose one above to see its results, or start a new one.</p></div> /* projects exist but none is open: say what to do instead of a blank page */  : <div className="empty assets-empty" data-testid="as-empty"><h2>{({ Projects: 'No projects yet', Favourites: 'No favourites yet', Trash: 'Trash is empty' } as Record<string, string>)[section] ?? 'Nothing here yet'}</h2><p className="helper">{SECTION_COPY[section]}</p><EmptyShelf />{startLink}</div> : <>
      {err && <InlineError what="your assets" error={/HTTP 5\d\d|\b5\d\d\b/.test(err) ? Object.assign(new Error(err), { status: 500 }) : new Error(err)} onRetry={() => setTick(n => n + 1)} />}
      {!loaded ? (err ? null : <Skeleton variant="tiles" count={12} className="asset-grid as-skel" label="Loading your assets" />) : !shown.length && (q || filtered) && !bare ? <div className="empty assets-empty as-nomatch" data-testid="as-no-matches" role="status"><h2>No matches</h2><p className="helper">{q ? <>Nothing matches “{q.length > 60 ? `${q.slice(0, 59)}…` : q}”{filtered ? ' with these filters' : ''}.</> : 'Nothing matches these filters.'} Try other words, or clear the search.</p><div className="row as-nomatch-acts">{q && <button type="button" className="btn" data-testid="as-clear-search" onClick={() => setQ('')}>Clear search</button>}{filtered && <button type="button" className="btn" data-testid="as-clear-filters" onClick={clearFilters}>Clear filters</button>}</div></div>
        : !shown.length && section === 'Assets' && !media ? <div className="empty assets-empty" data-testid="as-empty"><h2>Nothing here yet</h2><p className="helper">{q || filtered ? 'Nothing matches these filters.' : 'Every image, clip and sound you make is saved here, ready to open again or send to another tool.'}</p>{q || filtered ? <EmptyShelf /> : null}{startLink}</div>
        : !shown.length ? sectionEmpty() :
        <div className="asset-grid as-jgrid" ref={gridEl} onClickCapture={e => { const a = (e.target as HTMLElement).closest('article[id^="asset-"]'); if (a) setOpener(a.id.slice(6)); }}>{held.length > 0 && <button type="button" className="as-newpill" data-testid="as-new-pill" onClick={reveal}>{held.length === 1 ? '1 new result' : `${held.length} new results`} · Show</button>}
          {groups.map(g => { const gi = g.items.map(j => j.id); const nOn = gi.filter(x => sel.has(x)).length; const all = nOn === gi.length;
            return <section key={g.key} className="as-group" aria-label={g.key === '*' ? 'All results' : dayLabel(g.key)} data-testid={`as-group-${g.key}`}>
              {g.key !== '*' && <div className="as-group-h"><button type="button" className="as-check as-gcheck" role="checkbox" aria-checked={all ? true : nOn ? 'mixed' : false} aria-label={`Select all from ${dayLabel(g.key)}`} onClick={() => { pickMany(gi, !all); anchorId.current = gi[gi.length - 1]; }}>{nOn > 0 && !all ? <MixGlyph /> : <CheckGlyph />}</button><h2>{dayLabel(g.key)}</h2></div>}
              {lay(g.items)}</section>; })}
        </div>}
      {serverFiltered && next && shown.length > 0 && <div className="as-more"><button type="button" className="btn" data-testid="as-more" disabled={more} onClick={loadMore}>{more ? 'Loading…' : 'Show more'}</button></div>}
      {selecting && <div className="as-bulk" role="toolbar" aria-label="Selected assets" data-testid="as-bulk">
        <span className="as-bulk-n" aria-live="polite">{sel.size > 0 && thumbOf(selJobs[0]) ? <img src={thumbOf(selJobs[0])} alt="" /> : null}{sel.size ? `${sel.size} selected` : 'Tap items to select'}</span>
        {sel.size > 0 && <>
          <a className={`as-bulk-b${selDone.length ? '' : ' is-off'}`} data-testid="as-bulk-zip" href={selDone.length ? zipHref(selDone.map(j => j.id)) : undefined} download aria-disabled={!selDone.length} title={selDone.length > 100 ? 'The ZIP takes the first 100.' : 'ZIP with every output and its settings'}><DownloadIcon size={15} /><span>Download</span></a>
          {section !== 'Trash' && <button ref={bpRef} type="button" className="as-bulk-b" data-testid="as-bulk-project" aria-haspopup="menu" aria-expanded={pop === 'bulkproj'} onClick={() => setPop(pop === 'bulkproj' ? '' : 'bulkproj')}><ProjectsIcon size={15} /><span>Add to</span></button>}
          {section !== 'Trash' && <button type="button" className="as-bulk-b" data-testid="as-bulk-fav" aria-pressed={allFav} disabled={!selDone.length} onClick={bulkFav}><HeartIcon size={15} /><span>{allFav ? 'Unfavourite' : 'Favourite'}</span></button>}
          {section === 'Trash' ? <button type="button" className="as-bulk-b" data-testid="as-bulk-restore" onClick={bulkRestore}>↺<span>Restore</span></button>
            : <button type="button" className="as-bulk-b as-bulk-danger" data-testid="as-bulk-trash" onClick={async () => { const xs = selJobs.filter(j => j.status !== 'running' && j.status !== 'queued').map(j => j.id); if (await askTrash(xs)) clearSel(); }}><TrashIcon size={15} /><span>Delete</span></button>}
        </>}
        <button ref={bmRef} type="button" className="as-bulk-b as-bulk-ic" data-testid="as-bulk-more" aria-label="More" aria-haspopup="menu" aria-expanded={pop === 'bulkmore'} onClick={() => setPop(pop === 'bulkmore' ? '' : 'bulkmore')}><MoreIcon size={15} /></button>
        <button type="button" className="as-bulk-b as-bulk-ic" data-testid="as-bulk-clear" onClick={clearSel} aria-label="Clear selection" title="Clear selection (Esc)">{G(P.x)}</button>
        <Popover open={pop === 'bulkproj'} anchor={bpRef} onClose={closePop} label="Add to project" role="menu" placement="top" width={240} className="as-pop" testId="as-bulk-proj">
          <div className="asset-menu">{[{ id: '', name: 'No project' }, ...projects].map(p => <button key={p.id || 'none'} type="button" className="am-item" role="menuitem" onClick={() => bulkProject(p.id)}><ProjectsIcon size={16} className="am-ic" /><span className="am-l">{p.name}</span></button>)}
            <button type="button" className="am-item" role="menuitem" onClick={async () => { setPop(''); const p = await newProject(); if (p) bulkProject(p.id, p.name); }}><span className="am-ic am-tick" aria-hidden>+</span><span className="am-l">New project…</span></button></div>
        </Popover>
        <Popover open={pop === 'bulkmore'} anchor={bmRef} onClose={closePop} label="More" role="menu" placement="top" width={240} className="as-pop" testId="as-bulk-more-menu">
          <div className="asset-menu">
            <button type="button" className="am-item" role="menuitem" onClick={() => { pickMany(grid.map(j => j.id), true); setPop(''); }}>{G(P.select)}<span className="am-l">Select all shown</span><small className="am-x">{grid.length}</small></button>
            {sel.size > 0 && <button type="button" className="am-item" role="menuitem" onClick={() => { setSel(new Set(grid.map(j => j.id).filter(x => !sel.has(x)))); setPop(''); }}>{G(P.select)}<span className="am-l">Invert selection</span></button>}
          </div>
        </Popover>
      </div>}
    </>}
    </div>}
    </div>
  );
}

/** Media type for local (non-Assets) filtering. "Enhanced" is job.enhanced from the server, not inferred from the tool. */
function mediaGroup(t: { id: string; app?: any; media?: string }): 'Images' | 'Video' | 'Audio' {
  if (t.media === 'image') return 'Images'; if (t.media === 'audio') return 'Audio'; if (t.media === 'video') return 'Video';
  const k = t.app?.kind;
  if (k === 'audio' || k === 'soundtrack' || /audio|voice|music|soundtrack/.test(t.id)) return 'Audio';
  if (k === 'image' || /image|photo|cutout|product|character|inpaint/.test(t.id)) return 'Images';
  return 'Video';
}

/** Horizontal tab strip with a hint: edge fades + ‹ › buttons appear only on the side that has more tabs. */
function ScrollTabs({ children }: { children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null); const [edge, setEdge] = useState({ l: false, r: false });
  const strip = () => box.current?.querySelector<HTMLElement>('.seg-scroll') ?? null;
  const upd = () => { const s = strip(); if (!s) return; const l = s.scrollLeft > 2, r = s.scrollLeft + s.clientWidth < s.scrollWidth - 2; setEdge(e => (e.l === l && e.r === r ? e : { l, r })); };
  useEffect(() => { const s = strip(); if (!s) return; upd(); s.addEventListener('scroll', upd, { passive: true }); const ro = new ResizeObserver(upd); ro.observe(s); return () => { s.removeEventListener('scroll', upd); ro.disconnect(); }; }, []);
  // keep the active tab visible (horizontal only, never scrolls the page)
  const active = (box.current?.querySelector('.seg-scroll .on')?.textContent) ?? '';
  useEffect(() => { const s = strip(); const on = s?.querySelector<HTMLElement>('.on'); if (!s || !on) return; const l = on.offsetLeft - s.offsetLeft, r = l + on.offsetWidth; if (l < s.scrollLeft || r > s.scrollLeft + s.clientWidth) s.scrollLeft = Math.max(0, r - s.clientWidth + 36); upd(); }, [active]);
  const by = (d: number) => strip()?.scrollBy({ left: d * Math.max(120, (strip()?.clientWidth ?? 300) * 0.6), behavior: 'smooth' });
  return <div ref={box} className={`tabs-scroll ${edge.l ? 'more-l' : ''} ${edge.r ? 'more-r' : ''}`} data-testid="assets-tabs-scroll">{children}
    {edge.l && <button type="button" className="ts-arrow ts-l" aria-label="Scroll tabs left" tabIndex={-1} onClick={() => by(-1)}>‹</button>}
    {edge.r && <button type="button" className="ts-arrow ts-r" aria-label="Scroll tabs right" tabIndex={-1} onClick={() => by(1)} data-testid="assets-tabs-more">›</button>}</div>;
}

/** B30 (P3) / PP: our own empty-state drawing in HTML on HF tokens: three tilted cards (organise, reuse, generate). No HF art, no photos, no people. */
function EmptyShelf() {
  const I = (d: React.ReactNode) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>;
  return <div className="as-shelf" aria-hidden data-testid="as-empty-art">
    <div className="ash-card ash-a"><b>{I(<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />)}Organize</b><i /><i /><span className="ash-chips"><span /><span /></span></div>
    <div className="ash-card ash-b"><b>{I(<><circle cx="12" cy="12" r="4" /><path d="M16 8v5a3 3 0 0 0 5 0v-1a9 9 0 1 0-3.5 7.1" /></>)}Reuse looks</b><i /><span className="ash-dots"><span /><span /><span /></span></div>
    <div className="ash-card ash-c"><b>{I(<><path d="M10 3.5 11.8 8.2 16.5 10l-4.7 1.8L10 16.5l-1.8-4.7L3.5 10l4.7-1.8z" /><path d="M18 14.5v5M15.5 17h5" /></>)}Generate</b><i /><span className="ash-pic" /></div>
  </div>;
}
