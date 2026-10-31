/**
 * The one media picker (2026-10-25), grown out of Create Image's ImagePicker: Uploads · Generations · Liked, an "Upload from your
 * computer" tile, Recent / All, Sort. Every upload slot in the app opens it:
 *  - Create Image's bar renders it in its dock (ui/next/ImagePicker.tsx, a thin wrapper).
 *  - Everywhere else, <MediaPickerHost/> (mounted once in App) catches the click on a slot's own file input (input[type=file] that takes
 *    images, videos or sounds) and opens the picker instead of Finder. A pick is put into that same input (DataTransfer + change event),
 *    so each slot's own handler, checks and previews run unchanged. "Upload from your computer" then opens Finder on that input.
 * What the slot accepts (its `accept`) filters every tab: a video reference shows videos, a voice sample shows sounds. A slot can name
 * itself and its limits with data-picker-title / data-picker-limits (on the input or a parent). Every image slot can take a frame from a
 * video (first, last or a time: FrameGrab, 2026-10-26); data-picker-frames="off" turns that off. data-native-picker on an input keeps Finder.
 * A picked library file is tagged (libraryFiles.ts) so the job sends its URL, not the bytes. Drop or paste (⌘V) files onto the panel.
 * Projects: a "Project: <name> ▾" chip (hidden with no projects) filters every tab. It starts on the feed's current project (shared/feedProject,
 * the same state the feed toolbar and the submit use), remembers a change per tab while the picker is open, and starts over next time.
 * Each tile's ⋯ menu moves it to a project (a generation: its job, setJobProject; an upload: POST /api/media/project).
 * Search (2026-10-27): words in the box search the references database (GET /api/library/references, server libraryDb.ts) by title, prompt
 * and tags, ranked, in the same tab, kinds and project; an empty box is the plain list again.
 * Clean pass (2026-10-31): tooltips are short names (tileName), never prompts; a slot that takes several picks tiles into a numbered
 * selection with an "Add n" bar; the picked tab is a subtle fill with an orange underline.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { gridSrc } from './thumbs';
import { libraryFile } from './libraryFiles';
import { saveVideoFrame, type FrameAt } from './videoFrame';
import { useToast } from './Toast';
import { Popover } from './Popover';
import { useDismiss } from './useDismiss';
import { useFeedProject, type ProjectRow } from './feedProject';
import { ProjectCover, ProjectRows, useProjectList } from './ProjectPicker';
import { setJobProject } from '../api';
import { ChevronDownIcon, MoreIcon, ProjectsIcon, SearchIcon, CloseIcon } from '../ui/Icons';
import './mediaPicker.css';

export type PickTab = 'Uploads' | 'Generations' | 'Liked';
export type MediaKind = 'image' | 'video' | 'audio';
export interface LibItem { id: string; url: string; thumbUrl: string; type: MediaKind; name: string; createdAt: number; toolName?: string | null; label?: string | null; uses?: number; title?: string;
  /** the result's job (generations, liked) */ jobId?: string | null; /** projects it is in ([] = No project) */ projectIds?: string[] }
const TABS: PickTab[] = ['Uploads', 'Generations', 'Liked'];
const PAGE = 48;

/** Media kinds an `accept` string allows (empty when it takes none of them: such inputs keep Finder). */
export function kindsOf(accept: string | null | undefined): MediaKind[] {
  const a = (accept ?? '').toLowerCase(); if (!a.trim()) return [];
  const out = new Set<MediaKind>();
  for (const t of a.split(',').map(s => s.trim())) {
    if (/^image\//.test(t) || /^\.(png|jpe?g|webp|gif|avif|heic)$/.test(t)) out.add('image');
    else if (/^video\//.test(t) || /^\.(mp4|mov|webm|m4v)$/.test(t)) out.add('video');
    else if (/^audio\//.test(t) || /^\.(mp3|wav|m4a|aac|ogg|flac)$/.test(t)) out.add('audio');
  }
  return (['image', 'video', 'audio'] as MediaKind[]).filter(k => out.has(k));
}
export const kindOfFile = (f: File): MediaKind | null => /^image\//.test(f.type) || /\.(png|jpe?g|webp|gif)$/i.test(f.name) ? 'image' : /^video\//.test(f.type) || /\.(mp4|mov|webm|m4v)$/i.test(f.name) ? 'video' : /^audio\//.test(f.type) || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(f.name) ? 'audio' : null;
const NOUN: Record<MediaKind, [string, string]> = { image: ['a picture', 'pictures'], video: ['a video', 'videos'], audio: ['a sound', 'sounds'] };
const list = (xs: string[]) => xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`;
/** "Choose a picture" / "Choose pictures" (a slot that takes several) / "Choose a video or a sound" */
export const defaultTitle = (kinds: MediaKind[], multiple?: boolean) => `Choose ${list(kinds.map(k => NOUN[k][multiple ? 1 : 0]))}`;
const day = (t: number) => t > 0 ? new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
/** A tile's short name, never a prompt: a saved frame says which frame, an upload its file name, a generation its feature. */
export function tileName(x: Pick<LibItem, 'name' | 'type' | 'toolName'>, tab: PickTab): string {
  const frame = /^(First frame|Last frame|Frame at [^·]+?)\s*·/.exec(x.name ?? '')?.[1]?.trim();
  if (frame) return frame;
  if (tab === 'Uploads') return /^[^\s/·]{1,48}\.[a-z0-9]{2,4}$/i.test(x.name ?? '') ? x.name : 'Upload';
  return x.toolName || (x.type === 'video' ? 'Video' : x.type === 'audio' ? 'Sound' : 'Picture');
}
/** A slot label as a picker title: "Start frame" → "Choose a start frame", "Reference images" → "Choose reference images". */
export function chooseTitle(label: string | null | undefined, kinds: MediaKind[], multiple?: boolean): string {
  const l = (label ?? '').replace(/\s*\(optional\)\s*$/i, '').replace(/^(upload|add|drop|pick)\s+(an?\s+|your\s+)?/i, '').trim();
  if (!l) return defaultTitle(kinds, multiple); if (/^choose\b/i.test(l)) return l;
  const lower = /^[A-Z][a-z]/.test(l) ? l[0].toLowerCase() + l.slice(1) : l;
  return `Choose ${multiple || /s$/.test(lower) ? '' : /^[aeiou]/i.test(lower) ? 'an ' : 'a '}${lower}`;
}
/** Files dropped or pasted that the slot can't take → one plain sentence. */
export function wrongTypeMessage(files: File[], kinds: MediaKind[]): string | null {
  const bad = files.filter(f => !kindsOk(f, kinds)); if (!bad.length) return null;
  const k = kindOfFile(bad[0]); const what = k ? `That's ${NOUN[k][0]}` : `${bad[0].name || 'That file'} isn't a picture, clip or sound`;
  return `${what}. This slot takes ${list(kinds.map(x => NOUN[x][1]))}.`;
}
const kindsOk = (f: File, kinds: MediaKind[]) => { const k = kindOfFile(f); return !!k && kinds.includes(k); };
const fmtDur = (s: number) => !isFinite(s) || s <= 0 ? '' : s < 60 ? `${Math.round(s)} s` : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/** Lazily mounted children (thumbnails, audio metadata) once the tile scrolls near the view. */
function useInView<T extends Element>(): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null); const [seen, setSeen] = useState(false);
  useEffect(() => { const el = ref.current; if (!el || seen) return; if (typeof IntersectionObserver === 'undefined') { setSeen(true); return; }
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: '200px' }); io.observe(el); return () => io.disconnect(); }, [seen]);
  return [ref, seen];
}
const Wave = () => <svg className="mpk-wave" viewBox="0 0 64 24" aria-hidden><g fill="currentColor">{[6, 12, 18, 9, 22, 14, 8, 16, 20, 10, 5, 13, 19, 11, 7].map((h, i) => <rect key={i} x={i * 4.3 + 0.5} y={12 - h / 2} width="2.4" height={h} rx="1.2" />)}</g></svg>;

function Tile({ x, tab, onPick, onMore, moreOpen, frameHint, sel }: { x: LibItem; tab: PickTab; onPick: (x: LibItem) => void; /** an image slot: a video tile gives a frame */ frameHint?: boolean; /** the ⋯ menu (Move to project); absent = no menu */ onMore?: (x: LibItem, el: HTMLButtonElement) => void; moreOpen?: boolean;
  /** a slot that takes several: this tile's place in the selection (1-based); 0 = not picked; undefined = picks at once */ sel?: number }) {
  const [ref, seen] = useInView<HTMLDivElement>(); const [dur, setDur] = useState(0);
  /* loaded: React state, so a re-render (picking it) keeps the class */ const [ld, setLd] = useState(false); const loaded = () => setLd(true);
  const tag = tab === 'Uploads' ? null : x.toolName ?? null;
  const kindWord = x.type === 'image' ? 'Picture' : x.type === 'video' ? 'Video' : 'Sound';
  const name = tileName(x, tab); const when = day(x.createdAt); const tip = when ? `${name} · ${when}` : name;
  return <div ref={ref} className={`ic-ref-tile mpk-tile mpk-t-${x.type}${ld ? ' ld' : ''}${sel ? ' mpk-sel' : ''}`}><button type="button" className="mpk-pick" onClick={() => onPick(x)} aria-label={`${kindWord}: ${tip}${dur ? `, ${fmtDur(dur)}` : ''}${frameHint && x.type === 'video' ? ' · pick a frame' : ''}`} title={tip}
    aria-pressed={sel === undefined || (frameHint && x.type === 'video') ? undefined : sel > 0}
    data-testid={tab === 'Generations' ? `ic-ref-gen-${x.id}` : tab === 'Liked' ? `ic-ref-liked-${x.id}` : `ic-ref-up-${x.id}`} data-kind={x.type}>
    {x.type === 'audio'
      ? <span className="mpk-audio"><Wave /><span className="mpk-aname">{name}</span>{seen && <audio src={x.url} preload="metadata" onLoadedMetadata={e => setDur(e.currentTarget.duration)} hidden />}</span>
      : seen ? <img src={x.type === 'image' ? gridSrc(x.url, 160) : (x.thumbUrl || `/api/media/thumb?url=${encodeURIComponent(x.url)}`)} alt="" loading="lazy" decoding="async" onLoad={loaded} onError={loaded} /> : <span className="mpk-ph" aria-hidden />}
    {x.type === 'video' && <span className="mpk-badge" aria-hidden><svg width="9" height="9" viewBox="0 0 10 10"><path d="M2 1l7 4-7 4z" fill="currentColor" /></svg></span>}
    {x.type === 'audio' && dur > 0 && <span className="mpk-badge" aria-hidden>{fmtDur(dur)}</span>}
    {tag && <span className="ic-ref-feat">{tag}</span>}
    {!!sel && <span className="mpk-seln" aria-hidden>{sel}</span>}
  </button>
    {onMore && <button type="button" className="mpk-more" aria-haspopup="listbox" aria-expanded={!!moreOpen} aria-label={`Move ${name} to a project`} title="Move to project" data-testid="mpk-more" onClick={e => onMore(x, e.currentTarget)}><MoreIcon size={16} /></button>}
  </div>;
}

/** "Pick a frame" (2026-10-26): any video in the library gives an image slot a still: First, Last (the true final frame) or scrub to a time.
 *  The server grabs the exact frame at full size (POST /api/media/frame, no metadata) and lists it in Uploads; the slot gets it as a library file. */
function FrameGrab({ item, onUse, onBack }: { item: LibItem; onUse: (f: File) => void; onBack: () => void }) {
  const v = useRef<HTMLVideoElement>(null); const [t, setT] = useState(0); const [d, setD] = useState(0); const [busy, setBusy] = useState(false); const toast = useToast();
  /* which frame: first | last | a time (seconds); the preview follows it */
  const [at, setAt] = useState<FrameAt>('last');
  const seek = (x: number) => { const el = v.current; if (el) el.currentTime = x; setT(x); };
  const jump = (k: 'first' | 'last') => { setAt(k); seek(k === 'first' ? 0 : Math.max(0, d - 0.001)); };
  const grab = async () => { setBusy(true);
    try { const r = await saveVideoFrame({ url: item.url, at }); onUse(await libraryFile(r.item.url, 'image', `${(item.url.split('/').pop() ?? 'frame').replace(/\.\w+$/, '')}-${at === 'last' ? 'last' : at === 'first' ? 'first' : `${(at as number).toFixed(2)}s`}-frame.png`)); }
    catch (e: any) { toast(`Couldn’t take that frame (${e?.message ?? 'error'}). Try another one.`, 'error'); } finally { setBusy(false); } };
  const label = at === 'last' ? 'Last frame' : at === 'first' ? 'First frame' : `Frame at ${fmtClock(t)}`;
  return <div className="mpk-frame" data-testid="mpk-frame" data-at={String(at)}>
    <video ref={v} src={item.url} muted playsInline preload="auto" onLoadedMetadata={e => { const el = e.currentTarget; setD(el.duration); if (at === 'last') { el.currentTime = Math.max(0, el.duration - 0.001); setT(el.currentTime); } }} onTimeUpdate={e => setT(e.currentTarget.currentTime)} />
    <div className="mpk-frame-bar">
      <button type="button" className="mpk-btn" onClick={onBack} data-testid="mpk-frame-back">Back</button>
      <div className="mpk-frame-seg" role="group" aria-label="Which frame">
        <button type="button" className={`mpk-btn${at === 'first' ? ' on' : ''}`} aria-pressed={at === 'first'} onClick={() => jump('first')} data-testid="mpk-frame-first">First</button>
        <button type="button" className={`mpk-btn${at === 'last' ? ' on' : ''}`} aria-pressed={at === 'last'} onClick={() => jump('last')} data-testid="mpk-frame-last">Last</button>
      </div>
      <input type="range" min={0} max={d || 0} step={0.01} value={Math.min(t, d || 0)} aria-label="Frame time" aria-valuetext={label} data-testid="mpk-frame-scrub" onChange={e => { const n = Number(e.target.value); setAt(n <= 0 ? 'first' : n >= d - 0.001 ? 'last' : n); seek(n); }} />
      <span className="mpk-frame-t" data-testid="mpk-frame-label">{label}</span>
      <button type="button" className="mpk-btn mpk-btn-pri" disabled={busy || !d} onClick={() => void grab()} data-testid="mpk-frame-use">{busy ? 'Taking frame…' : 'Use this frame'}</button>
    </div>
  </div>;
}
const fmtClock = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`;

export interface MediaPickerProps {
  tab: PickTab; setTab: (t: PickTab) => void; onClose: () => void;
  /** "Choose a start frame" */ title: string; /** the slot's limits: "Up to 9 images · PNG, JPG or WEBP" */ limits?: ReactNode;
  kinds: MediaKind[]; /** image slot: videos can give a frame (default on) */ frames?: boolean; multiple?: boolean;
  /** a library item, already a File tagged with its URL */ onFile: (f: File, item: LibItem) => void;
  /** "Upload from your computer": opens Finder on the slot's own input */ onUpload: () => void;
  /** files dropped / pasted on the panel (already filtered to what the slot takes) */ onFiles: (f: File[]) => void;
  /** dock (Create Image's bar) or a centred dialog / phone sheet */ host?: boolean; target?: string | null;
  /** formats line on the Upload tile (default from kinds) */ accepts?: string;
}
export function MediaPicker({ tab, setTab, onClose, title, limits, kinds, frames = true, multiple, onFile, onUpload, onFiles, host, target, accepts: acceptsProp }: MediaPickerProps) {
  const toast = useToast();
  /* every matching file, newest first (2026-10-26: "Recent" was a hidden 12-item cap; now newest-first is the sort and the grid pages in as you scroll) */
  const [total, setTotal] = useState<number | null>(null); const [order, setOrder] = useState<'new' | 'old'>('new'); const [sortOpen, setSortOpen] = useState(false);
  const [items, setItems] = useState<LibItem[]>([]); const [page, setPage] = useState(1); const [more, setMore] = useState(false); const [loading, setLoading] = useState(true); const [failed, setFailed] = useState(false);
  const [over, setOver] = useState(false); const [msg, setMsg] = useState<string | null>(null); const [busyId, setBusyId] = useState<string | null>(null); const [frameOf, setFrameOf] = useState<LibItem | null>(null);
  /* projects: the feed's current project (one source of truth) until the user picks another for this tab; a deleted project reads as All projects */
  const [feedPid] = useFeedProject(); const { list: projects } = useProjectList(); const [projByTab, setProjByTab] = useState<Partial<Record<PickTab, string>>>({});
  const proj0 = projByTab[tab] ?? 'all'; void feedPid; /* starts on All projects so nothing is hidden; the chip narrows it */ const proj = proj0 !== 'all' && projects && !projects.some(p => p.id === proj0) ? 'all' : proj0;
  const projRow: ProjectRow | null = projects?.find(p => p.id === proj) ?? null; const hasProjects = !!projects?.length;
  const [projOpen, setProjOpen] = useState(false); const projBtn = useRef<HTMLButtonElement>(null);
  const [moveOf, setMoveOf] = useState<LibItem | null>(null); const moveBtn = useRef<HTMLButtonElement | null>(null);
  /* a slot that takes several: tiles toggle into a selection (kept across tabs), "Add n" hands them over together */
  const [sel, setSel] = useState<LibItem[]>([]);
  const panel = useRef<HTMLDivElement>(null); const sentinel = useRef<HTMLDivElement>(null); const depth = useRef(0);
  const showKinds = frames && kinds.includes('image') && !kinds.includes('video') ? [...kinds, 'video' as MediaKind] : kinds;
  const typeQ = showKinds.join(','); const [q, setQ] = useState(''); const [qd, setQd] = useState(''); /* qd: the search, 250 ms after typing stops */
  useEffect(() => { const t = setTimeout(() => setQd(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  useEffect(() => { setSortOpen(false); setFrameOf(null); setMsg(null); setProjOpen(false); setMoveOf(null); }, [tab]);
  useEffect(() => { if (!sortOpen) return; const d = (e: PointerEvent) => { if (!(e.target as Element | null)?.closest?.('.ic-ref-sortw')) setSortOpen(false); }; document.addEventListener('pointerdown', d, true); return () => document.removeEventListener('pointerdown', d, true); }, [sortOpen]);
  /* data: GET /api/media (server mediaLibrary.ts): each upload once, generations and liked from every feature, filtered by kind */
  const seq = useRef(0);
  const load = useCallback(async (p: number) => {
    const n = ++seq.current; setLoading(true); setFailed(false);
    const qs = new URLSearchParams({ tab: tab.toLowerCase(), type: typeQ, sort: order === 'new' ? 'newest' : 'oldest', page: String(p), pageSize: String(PAGE) });
    if (proj !== 'all') qs.set('project', proj);
    /* a search: the references database, ranked, in this tab (uploads / generations / liked), kinds and project */
    const lq = qd ? new URLSearchParams({ q: qd, kind: typeQ, limit: String(PAGE), cursor: String((p - 1) * PAGE), ...(tab === 'Liked' ? { fav: '1', source: 'generated' } : { source: tab === 'Uploads' ? 'uploaded' : 'generated' }), ...(proj !== 'all' ? { project: proj } : {}) }) : null;
    try { const r = await fetch(lq ? `/api/library/references?${lq}` : `/api/media?${qs}`); if (!r.ok) throw new Error(String(r.status)); const raw = await r.json(); if (n !== seq.current) return;
      const d = lq ? { items: (raw.items ?? []).map((x: any): LibItem => ({ id: x.id, url: x.url, thumbUrl: x.thumbUrl ?? '', type: x.kind, name: x.title, title: x.title, createdAt: x.createdAt, jobId: x.jobId, projectIds: x.projectIds, toolName: x.workflow })), hasMore: !!raw.nextCursor, total: raw.total } : raw;
      setItems(xs => p === 1 ? d.items : [...xs, ...d.items.filter((y: LibItem) => !xs.some(x => x.id === y.id))]); setMore(!!d.hasMore); setPage(p); setTotal(typeof d.total === 'number' ? d.total : null); }
    catch { if (n === seq.current) { setFailed(true); if (p === 1) setItems([]); } }
    finally { if (n === seq.current) setLoading(false); }
  }, [tab, order, typeQ, proj, qd]);
  useEffect(() => { void load(1); }, [load]);
  /* All: the next page loads as the end of the grid scrolls into view */
  useEffect(() => { const el = sentinel.current; if (!el || !more || typeof IntersectionObserver === 'undefined') return; const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting) && !loading) void load(page + 1); }, { rootMargin: '300px' }); io.observe(el); return () => io.disconnect(); }, [more, loading, page, load]);
  /* keyboard: Esc closes (the frame view first); focus moves into the panel and back to the slot on close */
  useEffect(() => { const back = document.activeElement as HTMLElement | null; const first = panel.current?.querySelector<HTMLElement>('[role=tab][aria-selected=true]'); first?.focus({ preventScroll: true });
    return () => { if (host && back && back.isConnected && back.focus) try { back.focus({ preventScroll: true }); } catch { /* gone */ } }; }, [host]);
  /* Esc: the shared dismiss stack (useDismiss), so the picker closes first when it opened over a sheet (the Render sheet), and its own menus (project chip, ⋯) before it */
  useDismiss(true, () => { if (frameOf) setFrameOf(null); else onClose(); });
  const take = useCallback((fs: File[]) => {
    if (!fs.length) return; const m = wrongTypeMessage(fs, kinds); const okFs = fs.filter(f => kindsOk(f, kinds));
    if (!okFs.length) { setMsg(m); return; } if (m) toast(m, 'error'); setMsg(null); onFiles(multiple ? okFs : okFs.slice(0, 1));
  }, [kinds, multiple, onFiles, toast]);
  /* ⌘V: pasted pictures / clips / sounds go to the slot */
  useEffect(() => { const p = (e: ClipboardEvent) => { const fs = [...(e.clipboardData?.files ?? [])]; if (!fs.length) return; const t = e.target as HTMLElement | null; if (t && /^(INPUT|TEXTAREA)$/.test(t.tagName) && !(t as HTMLInputElement).type?.match(/file/)) return; e.preventDefault(); take(fs); };
    document.addEventListener('paste', p); return () => document.removeEventListener('paste', p); }, [take]);
  const pick = async (x: LibItem) => {
    if (x.type === 'video' && !kinds.includes('video')) { setFrameOf(x); return; } // image slot: take a frame from this video
    if (multiple) { setSel(xs => xs.some(y => y.id === x.id) ? xs.filter(y => y.id !== x.id) : [...xs, x]); return; }
    if (busyId) return; setBusyId(x.id);
    try { onFile(await fileOf(x), x); }
    catch { toast('Couldn’t load that file. Try another one.', 'error'); } finally { setBusyId(null); }
  };
  const fileOf = (x: LibItem) => libraryFile(x.url, x.type, x.name && !/·/.test(x.name) ? x.name : undefined);
  const addSel = async () => {
    if (!sel.length || busyId) return; setBusyId('sel');
    try { const fs = await Promise.all(sel.map(fileOf)); onFiles(fs); onClose(); }
    catch { toast('Couldn’t load one of those files. Try again.', 'error'); setBusyId(null); }
  };
  /* Move to project: a generation moves its job; an upload's project set becomes just that one */
  const move = async (x: LibItem, pid: string | null) => {
    setMoveOf(null); const name = pid ? projects?.find(p => p.id === pid)?.name ?? 'that project' : 'No project';
    try {
      if (tab === 'Uploads') { const r = await fetch('/api/media/project', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: x.url, projectId: pid }) }); if (!r.ok) throw new Error(String(r.status)); }
      else { if (!x.jobId) throw new Error('no job'); await setJobProject(x.jobId, pid); dispatchEvent(new Event('ohf:jobs-changed')); /* the feed behind refilters */ }
      toast(`Moved to ${name}`); dispatchEvent(new Event('ohf:projects-changed')); void load(1);
    } catch { toast('Couldn’t move it. Try again.', 'error'); }
  };
  const moveValue = (x: LibItem | null) => { const ids = x?.projectIds ?? []; return ids.length > 1 ? undefined : ids[0] ?? null; };
  const noun = list(showKinds.map(k => NOUN[k][1]));
  /* the count: one kind by name ("48 pictures"); an image slot that also lists videos (for a frame) says "items" */
  const countNoun = (n: number) => showKinds.length > 1 ? (n === 1 ? 'item' : 'items') : NOUN[showKinds[0] ?? 'image'][1].replace(/s$/, n === 1 ? '' : 's');
  const empty = qd ? `Nothing matches “${qd}” here. Try other words or another tab.` : projRow ? `Nothing in ${projRow.name} here yet.` : tab === 'Uploads' ? `Nothing uploaded yet. Drop ${noun} here, paste with ⌘V, or upload from your computer.` : tab === 'Liked' ? `Nothing liked yet. Heart a result in Assets to see it here.` : `Your ${noun} will show up here once you make some.`;
  const accepts = acceptsProp ?? (kinds.length > 1 ? list(kinds.map(k => NOUN[k][1])).replace(/^./, c => c.toUpperCase()) : null) ?? kinds.map(k => k === 'image' ? 'PNG, JPG, WEBP' : k === 'video' ? 'MP4, MOV, WEBM' : 'MP3, WAV, M4A').join(' · ');
  const body = <div ref={panel} className={`ic-ref mpk${over ? ' mpk-over' : ''}${host ? ' mpk-dialog' : ''}`} role="dialog" aria-modal={host ? true : undefined} aria-label={title} data-testid="ic-ref" data-target={target ?? undefined} data-kinds={kinds.join(',')}
    onDragEnter={e => { if (![...e.dataTransfer.types].includes('Files')) return; e.preventDefault(); depth.current++; setOver(true); }} onDragOver={e => { if ([...e.dataTransfer.types].includes('Files')) e.preventDefault(); }}
    onDragLeave={() => { depth.current = Math.max(0, depth.current - 1); if (!depth.current) setOver(false); }}
    onDrop={e => { e.preventDefault(); depth.current = 0; setOver(false); take([...e.dataTransfer.files]); }}>
    <div className="ic-ref-top mpk-top">
      <div className="mpk-head"><h2 className="mpk-title" data-testid="mpk-title">{title}</h2>{limits && <p className="mpk-limits" data-testid="mpk-limits">{limits}</p>}</div>
      {hasProjects && <button ref={projBtn} type="button" className={`mpk-proj${projRow ? ' on' : ''}`} aria-haspopup="listbox" aria-expanded={projOpen} data-testid="mpk-project" data-project={proj} onClick={() => setProjOpen(o => !o)} title={projRow ? `Showing ${projRow.name}` : 'Showing every project'}>
        {projRow ? <ProjectCover p={projRow} size="btn" /> : <ProjectsIcon size={15} />}<span className="mpk-proj-k">Project:</span><span className="mpk-proj-n">{projRow?.name ?? 'All projects'}</span><ChevronDownIcon size={13} /></button>}
      <button type="button" className="ic-ref-x" aria-label="Close" onClick={onClose}><CloseIcon size={16} /></button></div>
    <Popover open={projOpen} anchor={projBtn} onClose={() => setProjOpen(false)} label="Show project" placement="bottom" align="end" testId="mpk-pop-project" width={280} className="fd-pp-pop mpk-pop">
      <div className="fd-pp"><span className="fd-pp-h" id="mpk-pp-h">Show</span>
        <div className="fd-pp-list" role="listbox" aria-labelledby="mpk-pp-h"><ProjectRows list={projects} value={proj === 'all' ? null : proj} counts={false} testPre="mpk-project" first={{ label: 'All projects', testId: 'mpk-project-all' }}
          onPick={id => { setProjByTab(m => ({ ...m, [tab]: id ?? 'all' })); setProjOpen(false); }} /></div></div>
    </Popover>
    <Popover open={!!moveOf} anchor={moveBtn} onClose={() => setMoveOf(null)} label="Move to project" placement="bottom" align="end" testId="mpk-pop-move" width={260} className="fd-pp-pop mpk-pop">
      <div className="fd-pp"><span className="fd-pp-h" id="mpk-mv-h">Move to project</span>
        <div className="fd-pp-list" role="listbox" aria-labelledby="mpk-mv-h"><ProjectRows list={projects} value={moveValue(moveOf)} counts={false} testPre="mpk-move" first={{ label: 'No project', testId: 'mpk-move-none', icon: <span className="fd-pp-cv fd-pp-cv-row fd-pp-all" aria-hidden><ProjectsIcon size={15} /></span> }}
          onPick={id => { if (moveOf) void move(moveOf, id); }} /></div></div>
    </Popover>
    <div className="ic-ref-sub mpk-sub" data-testid="ic-ref-sub">
      <div className="ic-ref-tabs" role="tablist" aria-label="Source">{TABS.map(t => <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} data-testid={`ic-ref-tab-${t.toLowerCase()}`} onClick={() => setTab(t)}
        onKeyDown={e => { if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return; e.preventDefault(); const i = (TABS.indexOf(t) + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length; setTab(TABS[i]); (e.currentTarget.parentElement?.children[i] as HTMLElement | undefined)?.focus(); }}>{t}</button>)}</div>
      <div className="mpk-tools">
        <label className="mpk-search" data-testid="mpk-search"><SearchIcon size={14} /><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search by prompt or tag" aria-label="Search your media"
          onKeyDown={e => { if (e.key === 'Escape' && q) { e.preventDefault(); e.stopPropagation(); setQ(''); } }} />{q && <button type="button" className="mpk-search-x" aria-label="Clear search" onClick={() => setQ('')}><CloseIcon size={12} /></button>}</label>
        {total != null && <span className="mpk-count" data-testid="mpk-count" aria-live="polite">{total.toLocaleString()} {countNoun(total)}</span>}
        {!qd && <div className="ic-ref-sortw"><button type="button" className="ic-ref-sort" aria-haspopup="menu" aria-expanded={sortOpen} data-testid="ic-ref-sort" onClick={() => setSortOpen(o => !o)}><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden><path d="M2.5 4.5h11M4.5 8h7M6.5 11.5h3" /></svg><span className="mpk-sort-w">Sort by</span><span className="ic-ref-sort-v">{order === 'new' ? 'Most recent' : 'Oldest'}</span></button>
          {sortOpen && <div className="ic-ref-sortm" role="menu" aria-label="Sort by">{([['new', 'Most recent first'], ['old', 'Oldest first']] as const).map(([k, l]) => <button key={k} type="button" role="menuitemradio" aria-checked={order === k} className={order === k ? 'on' : ''} data-testid={`ic-ref-sort-${k}`} onClick={() => { setOrder(k); setSortOpen(false); }}>{l}{order === k && <span aria-hidden>✓</span>}</button>)}</div>}</div>}
      </div>
    </div>
    {msg && <p className="mpk-msg" role="alert" data-testid="mpk-msg">{msg}</p>}
    {frameOf ? <FrameGrab item={frameOf} onBack={() => setFrameOf(null)} onUse={f => onFiles([f])} />
      : <div className="ic-ref-grid mpk-grid" aria-busy={loading || undefined}>
        {tab === 'Uploads' && <button type="button" className="ic-ref-tile ic-ref-up mpk-up" data-testid="ic-ref-upload" onClick={onUpload} aria-label="Upload from your computer" title={`Upload from your computer · ${accepts}`}>
          <span className="mpk-up-ic" aria-hidden><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg></span>
          <b>Upload</b><small>or drop files</small></button>}
        {items.map(x => <Tile key={x.id} x={x} tab={tab} onPick={pick} frameHint={x.type === 'video' && !kinds.includes('video')} sel={multiple ? sel.findIndex(y => y.id === x.id) + 1 : undefined} moreOpen={moveOf?.id === x.id} onMore={hasProjects && (tab === 'Uploads' || x.jobId) ? (it, el) => { moveBtn.current = el; setMoveOf(it); } : undefined} />)}
        {loading && !items.length && Array.from({ length: 5 }, (_, i) => <span key={i} className="ic-ref-tile ic-ref-skel" aria-hidden />)}
        {!loading && !items.length && <p className="helper ic-ref-empty mpk-empty" data-testid="mpk-empty">{failed ? 'Couldn’t load your library. Close and try again.' : empty}
          {!failed && projRow && <button type="button" className="mpk-btn mpk-showall" data-testid="mpk-show-all" onClick={() => setProjByTab(m => ({ ...m, [tab]: 'all' }))}>Show all projects</button>}</p>}
        {more && <div ref={sentinel} className="mpk-sentinel" aria-hidden />}
        {busyId && busyId !== 'sel' && <span className="mpk-busy" role="status">Loading…</span>}
      </div>}
    {multiple && sel.length > 0 && !frameOf && <div className="mpk-selbar" data-testid="mpk-selbar">
      <span className="mpk-selbar-n" aria-live="polite"><b>{sel.length}</b> selected</span>
      <button type="button" className="mpk-btn mpk-btn-q" onClick={() => setSel([])} data-testid="mpk-sel-clear">Clear</button>
      <button type="button" className="mpk-btn mpk-btn-pri" disabled={busyId === 'sel'} onClick={() => void addSel()} data-testid="mpk-sel-add">{busyId === 'sel' ? 'Adding…' : `Add ${sel.length}`}</button></div>}
    {over && <div className="mpk-drop" aria-hidden><span>Drop to add</span></div>}
  </div>;
  /* data-apop-keep: a popover underneath (the Render sheet) treats clicks in the picker as inside, so it stays open and its input still gets the pick */
  return <div className={`ic-ref-scrim${host ? ' mpk-scrim' : ''}`} data-apop-keep="" onMouseDown={e => e.target === e.currentTarget && onClose()}>{body}</div>;
}

/* ---------------- Host: every other slot ---------------- */
interface Open { kinds: MediaKind[]; title: string; limits?: string; frames: boolean; multiple: boolean; deliver: (fs: File[]) => void; native: () => void }
let opener: ((o: Open) => void) | null = null; let nativeOnce = false;
/** Run fn (which clicks a file input) letting Finder open instead of the picker: the picker's own Upload tile, Create Image's bar. */
export function withNativePicker(fn: () => void) { nativeOnce = true; try { fn(); } finally { nativeOnce = false; } }
/** Put files into a slot's input as if the user chose them in Finder (its onChange runs). */
export function deliverFiles(input: HTMLInputElement | null | undefined, files: File[]) {
  if (!input || !files.length) return; const dt = new DataTransfer(); (input.multiple ? files : files.slice(0, 1)).forEach(f => dt.items.add(f));
  input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true }));
}
const attr = (el: HTMLElement, k: string) => (el.closest(`[data-picker-${k}]`) as HTMLElement | null)?.getAttribute(`data-picker-${k}`) ?? null;
function slotOf(input: HTMLInputElement): Open {
  const kinds = kindsOf(input.accept);
  const label = attr(input, 'title') ?? input.getAttribute('aria-label') ?? (input.id ? document.querySelector(`label[for="${CSS.escape(input.id)}"]`)?.textContent : null) ?? null;
  return { kinds, title: chooseTitle(label, kinds, input.multiple), limits: attr(input, 'limits') ?? undefined, frames: attr(input, 'frames') !== 'off', multiple: input.multiple,
    deliver: fs => deliverFiles(input, fs), native: () => withNativePicker(() => input.click()) };
}
/** Mount once (App). Catches clicks on media file inputs and opens the picker for that slot. */
export function MediaPickerHost() {
  const [o, setO] = useState<Open | null>(null); const [tab, setTab] = useState<PickTab>('Uploads');
  useEffect(() => {
    opener = (x) => { setTab('Uploads'); setO(x); };
    const onClick = (e: MouseEvent) => {
      const t = e.target; if (!(t instanceof HTMLInputElement) || t.type !== 'file' || nativeOnce || t.disabled) return;
      if (t.hasAttribute('data-native-picker') || !kindsOf(t.accept).length || !t.isConnected) return;
      e.preventDefault(); opener?.(slotOf(t));
    };
    document.addEventListener('click', onClick, true); return () => { document.removeEventListener('click', onClick, true); opener = null; };
  }, []);
  if (!o) return null;
  const close = () => setO(null);
  return <MediaPicker host tab={tab} setTab={setTab} onClose={close} title={o.title} limits={o.limits} kinds={o.kinds} frames={o.frames} multiple={o.multiple}
    onFile={f => { close(); o.deliver([f]); }} onFiles={fs => { close(); o.deliver(fs); }} onUpload={() => { close(); o.native(); }} />;
}
/** Open the picker for a slot's input from code (same as clicking it). */
export function openPickerFor(input: HTMLInputElement | null | undefined) { if (!input) return; if (opener && kindsOf(input.accept).length) opener(slotOf(input)); else withNativePicker(() => input.click()); }
/** Open the picker for a slot with no input of its own: picked, dropped or uploaded files go to onFiles. */
export function pickMedia(r: { accept: string; title?: string; limits?: string; multiple?: boolean; frames?: boolean; onFiles: (fs: File[]) => void }) {
  const kinds = kindsOf(r.accept);
  const native = () => { const i = document.createElement('input'); i.type = 'file'; i.accept = r.accept; i.multiple = !!r.multiple; i.onchange = () => { const fs = [...(i.files ?? [])]; if (fs.length) r.onFiles(fs); }; withNativePicker(() => i.click()); };
  if (!opener || !kinds.length) { native(); return; }
  opener({ kinds, title: r.title ?? defaultTitle(kinds, r.multiple), limits: r.limits, frames: r.frames !== false, multiple: !!r.multiple, deliver: fs => r.onFiles(r.multiple ? fs : fs.slice(0, 1)), native });
}
