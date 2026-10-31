/**
 * Assets drawer: a fold-out panel on the right with your recent finished results (GET /api/jobs, the same list as Assets), drawn as
 * feed tiles (shared grid thumbnails + FeedCaption). Click a tile to place it at the centre of the view, or drag it onto the board.
 * The drag is pointer-based (not HTML drag and drop) so tldraw's own drop handling never sees it.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useEditor } from 'tldraw';
import { listJobsPage, type JobState } from '../api';
import { useOwnAccounts } from '../shared/billing';
import { FeedCaption } from '../shared/FeedCaption';
import { gridSrc } from '../shared/thumbs';
import { resultMedia, type ResultKind, type ResultMedia } from '../shared/resultMedia';
import { addResultCard } from './resultCardUtil';
import { ProjectPicker, useProjectList, type ProjectPick } from '../shared/ProjectPicker';
import { AudioIcon, CubeIcon, CloseIcon } from '../ui/Icons';
import { PlayButton, stopPreview, togglePreview, useMediaLength, fmtLength } from '../shared/PreviewPlay';
import { TypeFilter, type TypePick } from '../shared/TypeFilter';

type Item = { job: JobState; m: ResultMedia };
const KINDS: ResultKind[] = ['image', 'video', 'audio', '3d'];

export function AssetsDrawer({ open, onClose, projectId, onProject }: { open: boolean; onClose: () => void; /** the board's project: the drawer shows its results */ projectId: string | null; onProject: (id: string | null) => void }) {
  const editor = useEditor(); const own = useOwnAccounts();
  const [jobs, setJobs] = useState<JobState[] | null>(null); const [err, setErr] = useState(''); const [filter, setFilter] = useState<TypePick>('all');
  const [drag, setDrag] = useState<{ item: Item; x: number; y: number } | null>(null); const start = useRef<{ item: Item; x: number; y: number; moved: boolean } | null>(null);
  /* the shared project picker (same component and GET /api/jobs?project= as the Create Image feed); the pick is the board's project */
  const { list: projects, reload } = useProjectList();
  const pj: ProjectPick = { list: projects, pid: projectId, setPid: onProject, reload, current: projects?.find(p => p.id === projectId) ?? null };
  useEffect(() => { if (!open) return; let on = true; setErr(''); setJobs(null);
    listJobsPage({ status: 'done', order: 'desc', limit: 80, ...(projectId ? { project: projectId } : {}) }).then(r => { if (on) setJobs(r.items); }).catch(e => { if (on) setErr(e?.message || 'Could not load your results.'); });
    return () => { on = false; }; }, [open, projectId]);
  const items = useMemo<Item[]>(() => (jobs ?? []).map(job => ({ job, m: resultMedia(job, own) })).filter((x): x is Item => !!x.m), [jobs, own]);
  /* search (2026-10-27): the references database ranks your results by title, prompt and tags; the drawer keeps that order */
  const [q, setQ] = useState(''); const [rank, setRank] = useState<string[] | null>(null);
  useEffect(() => { const w = q.trim(); if (!w) { setRank(null); return; } let on = true; const t = setTimeout(() => { fetch(`/api/library/references?${new URLSearchParams({ q: w, source: 'generated', limit: '100', ...(projectId ? { project: projectId } : {}) })}`).then(r => r.json()).then(d => { if (on) setRank([...new Set<string>((d.items ?? []).map((x: any) => x.jobId))]); }).catch(() => on && setRank([])); }, 250); return () => { on = false; clearTimeout(t); }; }, [q, projectId]);
  /* the shared type filter (shared/TypeFilter, as the media picker): only the kinds there are; a kind that runs out falls back to All */
  const kinds = KINDS.filter(k => items.some(i => i.m.kind === k));
  useEffect(() => { if (filter !== 'all' && jobs != null && !kinds.includes(filter as ResultKind)) setFilter('all'); }, [filter, jobs, kinds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const kindShown = filter === 'all' ? items : items.filter(i => i.m.kind === filter);
  const shown = rank ? rank.map(id => kindShown.find(i => i.job.id === id)).filter((x): x is Item => !!x) : kindShown;

  const clicks = useRef(0);
  /* a click places it in the middle of the part of the board the drawer leaves visible, each next one a little lower right */
  const place = (it: Item, at?: { x: number; y: number }) => { const dropped = !!at;
    if (!at) { const r = document.querySelector('.cv-board')?.getBoundingClientRect(); const d = document.querySelector('.cv-drawer.open')?.getBoundingClientRect(); const k = (clicks.current++ % 6) * 28;
      if (r) at = { x: r.left + ((d ? d.left : r.right) - r.left) / 2 + k, y: r.top + r.height / 2 + k }; }
    void addResultCard(editor, it.job.id, it.m, at ? editor.screenToPage(at) : undefined, { free: !dropped }); };
  const onDown = (e: React.PointerEvent, item: Item) => { if (e.button !== 0) return; start.current = { item, x: e.clientX, y: e.clientY, moved: false }; (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); };
  const onMove = (e: React.PointerEvent) => { const s = start.current; if (!s) return; if (!s.moved && Math.hypot(e.clientX - s.x, e.clientY - s.y) < 5) return; s.moved = true; setDrag({ item: s.item, x: e.clientX, y: e.clientY }); };
  const onUp = (e: React.PointerEvent) => { const s = start.current; start.current = null; setDrag(null); if (!s) return;
    if (!s.moved) { place(s.item); return; }
    const over = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    if (over?.closest('.cv-drawer') || !over?.closest('.cv-board')) return; /* dropped back on the drawer or outside the board */
    place(s.item, { x: e.clientX, y: e.clientY }); };

  useEffect(() => { if (!open) stopPreview(); }, [open]); useEffect(() => stopPreview, []); /* a sound preview stops with the drawer */
  return <>
    <aside className={`cv-drawer${open ? ' open' : ''}`} aria-label="Assets" aria-hidden={!open} data-testid="cv-drawer" {...(!open ? { inert: '' } as any : {})}>
      <header className="cv-dr-head"><h2>Assets</h2><button type="button" className="cv-icon-btn" aria-label="Close Assets" onClick={onClose}><CloseIcon size={16} /></button></header>
      <div className="cv-dr-proj"><ProjectPicker pj={pj} heading="This board's project" testId="cv-project" tipText={pj.current ? `Showing ${pj.current.name}. This board keeps it, and results made from the board will go there.` : 'Showing all generations. Pick a project to keep this board to it.'} /></div>
      {kinds.length > 1 && <div className="cv-dr-filters"><TypeFilter kinds={kinds} value={filter} onChange={setFilter} testPre="cv-dr-type" /></div>}
      <input type="search" className="cv-dr-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search by prompt or tag" aria-label="Search your results" data-testid="cv-dr-search" />
      <p className="cv-dr-hint">Click to add at the centre, or drag onto the board.</p>
      <div className="cv-dr-grid" data-testid="cv-dr-grid">
        {err && <p className="cv-dr-empty">{err}</p>}
        {!err && jobs == null && Array.from({ length: 6 }, (_, i) => <span key={i} className="cv-dr-tile sk" />)}
        {!err && jobs != null && !shown.length && <p className="cv-dr-empty">{rank ? `Nothing matches “${q.trim()}”.` : items.length ? 'Nothing of this kind yet.' : pj.current ? `No finished results in ${pj.current.name} yet.` : 'Your finished results show up here.'}</p>}
        {shown.map(it => <DrawerTile key={it.job.id} it={it} onDown={onDown} onMove={onMove} onUp={onUp} onCancel={() => { start.current = null; setDrag(null); }} onPlace={place} />)}
      </div>
    </aside>
    {drag && <div className="cv-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden>{drag.item.m.poster ? <img src={gridSrc(drag.item.m.poster, 150)} alt="" /> : <span className="cv-dr-ph"><AudioIcon size={22} /></span>}</div>}
  </>;
}

/** One result in the drawer. A sound shows its short title (what it says, else the feature), the model and length, and the shared play
 *  button beside the tile (never inside it: the tile is a button that places or drags); Space plays it, Enter places it. */
function DrawerTile({ it, onDown, onMove, onUp, onCancel, onPlace }: { it: Item; onDown: (e: React.PointerEvent, it: Item) => void; onMove: (e: React.PointerEvent) => void; onUp: (e: React.PointerEvent) => void; onCancel: () => void; onPlace: (it: Item) => void }) {
  const audio = it.m.kind === 'audio'; const len = fmtLength(useMediaLength(it.m.url, it.m.kind, audio));
  const title = audio ? it.m.title : it.m.caption.model || it.m.title;
  return <div className="cv-dr-cell" data-kind={it.m.kind}>
    <button type="button" className={`cv-dr-tile${it.m.kind === 'image' ? ' alpha-bg' : ''}`} data-kind={it.m.kind} data-testid="cv-dr-item" title={it.m.title} aria-label={audio ? `Audio: ${title}${len ? `, ${len}` : ''}` : undefined}
      onPointerDown={e => onDown(e, it)} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onCancel}
      onKeyDown={e => { if (e.key === ' ' && audio) { e.preventDefault(); if (!e.repeat) togglePreview(it.m.url); } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPlace(it); } }}>
      {it.m.poster ? <img src={gridSrc(it.m.poster, 150)} alt="" loading="lazy" draggable={false} /> : <span className="cv-dr-ph">{it.m.kind === '3d' && <CubeIcon size={26} />}</span>}
      {it.m.kind !== 'image' && <span className="cv-dr-kind">{it.m.kind === '3d' ? '3D' : it.m.kind === 'video' ? 'Video' : 'Audio'}</span>}
      <FeedCaption title={title} parts={audio ? [it.m.caption.model, len] : [it.m.caption.price, it.m.caption.time]} />
    </button>
    {audio && <PlayButton url={it.m.url} label={title} className="cv-dr-pv" testId="cv-dr-play" />}
  </div>;
}
