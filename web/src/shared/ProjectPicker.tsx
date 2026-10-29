/** The project picker ("Project: All generations ▾"): one component for every place that picks a project. Create Image's feed toolbar
 *  (new results go there and the feed shows it) and the Canvas assets drawer (the board's project) use it. Branded rows with covers and
 *  counts, an inline "New project" field and a Manage projects link. The caller owns which project is picked (`pj`). */
import { Notice } from './Notice';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Popover } from './Popover';
import { tip } from './Tooltip';
import { Link } from '../platform/router';
import { useToast } from './Toast';
import { useDismiss } from './useDismiss';
import { listProjects, createProject, type ProjectRow } from './feedProject';
import { ChevronDownIcon, ChevronRightIcon, GridIcon, PlusIcon, ProjectsIcon, SettingsIcon } from '../ui/Icons';
import { CHECK as check } from './checkGlyph';
import './projectPicker.css';

/** What the picker shows and changes: the project list and the picked id (null = All generations). */
export interface ProjectPick { list: ProjectRow[] | null; pid: string | null; setPid: (id: string | null) => void; reload: () => Promise<void> | void; current: ProjectRow | null }

/** The project list, reloaded on focus and after a change anywhere in the app (ohf:projects-changed). */
export function useProjectList() {
  const [list, setList] = useState<ProjectRow[] | null>(null);
  const load = () => listProjects().then(setList).catch(() => undefined);
  useEffect(() => { void load(); const f = () => void load(); addEventListener('focus', f); addEventListener('ohf:projects-changed', f); return () => { removeEventListener('focus', f); removeEventListener('ohf:projects-changed', f); }; }, []);
  return { list, reload: load };
}

/** A project's cover: its newest finished image (GET /api/projects coverUrl), else an orange initial tile (also when the image is gone). */
export function ProjectCover({ p, size }: { p: ProjectRow; size: 'row' | 'btn' }) {
  const [bad, setBad] = useState<string | null>(null); const url = p.coverUrl && bad !== p.coverUrl ? p.coverUrl : null;
  const init = (p.name.trim().match(/\p{L}|\p{N}/u)?.[0] ?? '#').toUpperCase();
  return url ? <img className={`fd-pp-cv fd-pp-cv-${size}`} src={url} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setBad(url)} data-testid="fd-project-cover" />
    : <span className={`fd-pp-cv fd-pp-cv-${size} fd-pp-init`} aria-hidden data-testid="fd-project-initial">{init}</span>;
}

/** Projects in tree order: each parent, then its subprojects right after it (depth = how far to indent). A project whose parent is gone sits at the top level. */
export function projectTree(list: ProjectRow[]): { p: ProjectRow; depth: number }[] {
  const ids = new Set(list.map(p => p.id)); const kids = new Map<string | null, ProjectRow[]>();
  for (const p of list) { const k = p.parentId && ids.has(p.parentId) ? p.parentId : null; (kids.get(k) ?? kids.set(k, []).get(k)!).push(p); }
  const out: { p: ProjectRow; depth: number }[] = []; const seen = new Set<string>();
  const walk = (k: string | null, depth: number) => { for (const p of kids.get(k) ?? []) { if (seen.has(p.id)) continue; seen.add(p.id); out.push({ p, depth }); walk(p.id, depth + 1); } };
  walk(null, 0); for (const p of list) if (!seen.has(p.id)) out.push({ p, depth: 0 }); // a cycle (never made by the server): still listed
  return out;
}
/** The rows of a project list, shared by every project menu (the feed's picker, the media picker's project filter and its Move to project):
 *  a first row (All generations / All projects / No project), then each project with its cover, nested ones indented, the chosen one ticked. */
export function ProjectRows({ list, value, onPick, first, testPre, counts = true }: { list: ProjectRow[] | null; /** chosen id; null = the first row; undefined = none ticked */ value: string | null | undefined;
  onPick: (id: string | null) => void; first: { label: string; icon?: ReactNode; testId: string }; /** row test ids: `${testPre}-${id}` */ testPre: string; /** show the generation count tag */ counts?: boolean }) {
  const row = (id: string | null, name: string, lead: ReactNode, count: number | null, testId: string, depth = 0) => { const on = value !== undefined && (value ?? null) === id;
    return <button key={id ?? '-'} type="button" role="option" aria-selected={on} className="fd-pp-row" data-testid={testId} data-depth={depth || undefined} style={depth ? { ['--pp-depth' as any]: depth } : undefined} title={id ? name : undefined} onClick={() => onPick(id)}>
      {depth > 0 && <span className="fd-pp-indent" aria-hidden />}{lead}<span className="fd-pp-name">{name}</span>{count != null && <span className="fd-pp-n" aria-label={`${count} result${count === 1 ? '' : 's'}`}>{count}</span>}
      <i className="fd-pp-ck" aria-hidden>{on ? check : null}</i></button>; };
  return <>
    {row(null, first.label, first.icon ?? <span className="fd-pp-cv fd-pp-cv-row fd-pp-all" aria-hidden><GridIcon size={15} /></span>, null, first.testId)}
    {list == null ? <p className="fd-pp-note">Loading…</p> : projectTree(list).map(({ p, depth }) => row(p.id, p.name, <ProjectCover p={p} size="row" />, counts ? p.count : null, `${testPre}-${p.id}`, depth))}
  </>;
}

/** "+ New project" turned into a name field: Enter creates (and selects), Esc cancels just the field (not the popover). */
function NewProjectField({ names, onCreate, onCancel }: { names: string[]; onCreate: (name: string) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  useDismiss(true, onCancel); // stacked over the popover's own Escape
  const go = async () => { const n = name.trim(); if (!n) { setErr('Type a name first'); return; }
    if (names.some(x => x.trim().toLowerCase() === n.toLowerCase())) { setErr('You already have a project with that name'); return; }
    setBusy(true); try { await onCreate(n); } catch (e: any) { setErr(String(e?.message ?? 'Couldn’t create it')); setBusy(false); } };
  return <form className={`fd-pp-new${err ? ' bad' : ''}`} data-testid="fd-project-form" onSubmit={e => { e.preventDefault(); void go(); }}>
    <span className="fd-pp-cv fd-pp-cv-row fd-pp-plus" aria-hidden><PlusIcon size={14} /></span>
    <input autoFocus maxLength={80} value={name} readOnly={busy} onChange={e => { setName(e.target.value); setErr(''); }} placeholder="Name your project" aria-label="New project name" aria-invalid={!!err || undefined} aria-describedby={err ? 'fd-pp-err' : undefined} data-testid="fd-project-name" />
    <kbd className="fd-pp-kbd" aria-hidden>Enter</kbd>
    {err && <Notice as="small" kind="error" tone="line" id="fd-pp-err" className="fd-pp-err" testId="fd-project-err">{err}</Notice>}
  </form>;
}

export function ProjectPicker({ pj, heading = 'New results go to', tipText, testId = 'fd-project' }: { pj: ProjectPick; /** the list's heading */ heading?: string;
  /** the button's tooltip (default: where new results go) */ tipText?: string; testId?: string }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLButtonElement>(null); const [adding, setAdding] = useState(false); const toast = useToast();
  const listRef = useRef<HTMLDivElement>(null); const addRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (!open) setAdding(false); }, [open]);
  useLayoutEffect(() => { const l = listRef.current; const r = l?.querySelector<HTMLElement>('[aria-selected="true"]'); if (!open || !l || !r) return; // the chosen project in view (only the list scrolls)
    if (r.offsetTop < l.scrollTop || r.offsetTop + r.offsetHeight > l.scrollTop + l.clientHeight) l.scrollTop = r.offsetTop - (l.clientHeight - r.offsetHeight) / 2; }, [open, pj.list]);
  const pick = (id: string | null) => { pj.setPid(id); setOpen(false); };
  const make = async (n: string) => { const p = await createProject(n); await pj.reload(); pj.setPid(p.id); dispatchEvent(new Event('ohf:projects-changed')); setOpen(false); toast(`New results go to ${p.name}`); };
  const cancelAdd = () => { setAdding(false); requestAnimationFrame(() => addRef.current?.focus()); };
  const label = pj.current?.name ?? 'All generations'; const list = pj.list ?? [];
  return <>
    <button ref={ref} type="button" className={`fd-btn fd-proj${pj.current ? ' on' : ''}`} aria-haspopup="dialog" aria-expanded={open} data-testid={testId} onClick={() => setOpen(o => !o)} {...tip(tipText ?? (pj.current ? `New results go to ${pj.current.name}; the feed shows this project` : 'New results go to no project'))}>
      {pj.current ? <ProjectCover p={pj.current} size="btn" /> : <ProjectsIcon size={15} />}<span className="fd-proj-k">Project:</span><span className="fd-proj-n">{label}</span><ChevronDownIcon size={13} /></button>
    <Popover open={open} anchor={ref} onClose={() => setOpen(false)} label="Project" placement="bottom" testId="fd-pop-project" width={300} className="fd-pp-pop">
      <div className="fd-pp">
        <span className="fd-pp-h" id="fd-pp-h">{heading}</span>
        <div ref={listRef} className="fd-pp-list" role="listbox" aria-labelledby="fd-pp-h" data-count={list.length}>
          <ProjectRows list={pj.list} value={pj.pid ?? null} onPick={pick} first={{ label: 'All generations', testId: 'fd-project-none' }} testPre="fd-project" />
        </div>
        <div className="fd-pp-sep" role="separator" />
        {adding ? <NewProjectField names={list.map(p => p.name)} onCreate={make} onCancel={cancelAdd} />
          : <button ref={addRef} type="button" className="fd-pp-act fd-pp-add" data-apop-item data-testid="fd-project-new" onClick={() => setAdding(true)}><span className="fd-pp-cv fd-pp-cv-row fd-pp-plus" aria-hidden><PlusIcon size={14} /></span>New project</button>}
        <Link to="/assets?section=Projects" className="fd-pp-act fd-pp-manage" data-apop-item data-testid="fd-project-manage" onClick={() => setOpen(false)}><span className="fd-pp-ic" aria-hidden><SettingsIcon size={15} /></span>Manage projects<ChevronRightIcon size={14} className="fd-pp-go" /></Link>
      </div>
    </Popover>
  </>;
}

