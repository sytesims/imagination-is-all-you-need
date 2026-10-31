/** Select mode's action bar (replaces the toolbar while selecting): Download (one zip, or one by one), Move to project, Use as references,
 *  Like, Delete (to Trash, with Undo), Select all / none. Running tiles can't be picked; actions that need an image say why they're off. Esc exits. */
import { useEffect, useRef, useState } from 'react';
import { appFileName } from '../../../shared/brand';
import type { JobState } from '../../../api';
import { Popover } from '../../../shared/Popover';
import { tip } from '../../../shared/Tooltip';
import { useToast } from '../../../shared/Toast';
import { favOf, noteFavourites, useFavourites } from '../../../shared/favourites';
import { cleanHref } from '../../../shared/sharePrefs';
import { CloseIcon, DownloadIcon, HeartIcon, ProjectsIcon, TrashIcon, ImageIcon } from '../../Icons';
import type { ProjectRow } from '../../../shared/feedProject';

export interface SelInfo { id: string; status: string; outputs: number; favourite?: boolean; /** first image (one-by-one download) */ url?: string | null }
export const LIVE = ['queued', 'running', 'needs_decision'];
/** Why a tile can't be picked (null = it can). */
export const unselectable = (j: Pick<JobState, 'id' | 'status'>): string | null => !j.id ? 'Still uploading' : LIVE.includes(j.status) ? 'Still running: pick it when it’s done' : null;

async function bulk(ids: string[], action: string, projectId?: string | null): Promise<{ done: string[]; skipped: { id: string; reason: string }[] }> {
  const done: string[] = []; const skipped: { id: string; reason: string }[] = [];
  for (let i = 0; i < ids.length; i += 500) { const r = await fetch('/api/jobs/bulk', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: ids.slice(i, i + 500), action, ...(projectId !== undefined ? { projectId } : {}) }) });
    const j = await r.json().catch(() => null); if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`); done.push(...j.done); skipped.push(...j.skipped); }
  return { done, skipped };
}
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export default function SelectBar(p: { sel: Map<string, SelInfo>; setSel: (m: Map<string, SelInfo>) => void; total: number; onExit: () => void; selectAll: () => Promise<void>; allLoading: boolean;
  projects: ProjectRow[] | null; currentProject: string | null; patch: (ids: string[], v: any) => void; unpatch: (ids: string[]) => void; refresh: () => void;
  /** Use as references (Image); left out on a clip feed */ useAsRefs?: (ids: string[]) => Promise<void>; refsTarget?: string; /** 'clip' words on Video */ noun?: string; onTrashed: (ids: string[]) => void }) {
  const toast = useToast(); useFavourites(); const ids = [...p.sel.keys()]; const infos = [...p.sel.values()]; const n = ids.length;
  const withImg = infos.filter(x => x.status === 'done' && x.outputs > 0); const noImg = n - withImg.length;
  const [busy, setBusy] = useState(''); const [undo, setUndo] = useState<{ ids: string[]; at: number } | null>(null); const [mv, setMv] = useState(false); const mvRef = useRef<HTMLButtonElement>(null); const [dl, setDl] = useState(false); const dlRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.apop, [role=dialog][aria-modal=true]')) p.onExit(); }; addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [p.onExit]);
  useEffect(() => { if (!undo) return; const t = setTimeout(() => setUndo(null), 10000); return () => clearTimeout(t); }, [undo?.at]);
  const run = async (what: string, f: () => Promise<void>) => { if (busy) return; setBusy(what); try { await f(); } catch (e: any) { toast(String(e?.message ?? 'That didn’t work'), 'error'); } finally { setBusy(''); } };
  const offImg = !withImg.length ? (n ? `Failed runs have no ${p.noun ?? 'image'}` : 'Pick some results first') : null;
  const like = () => run('like', async () => { const on = !infos.every(x => favOf(x)); const r = await bulk(ids, on ? 'like' : 'unlike'); p.patch(r.done, { favourite: on } as any); noteFavourites(r.done, on); /* every heart (viewer, Assets, other tabs) */
    p.setSel(new Map(infos.map(x => [x.id, { ...x, favourite: r.done.includes(x.id) ? on : x.favourite }]))); toast(on ? `Added ${plural(r.done.length, 'result')} to Favourites` : `Removed ${plural(r.done.length, 'result')} from Favourites`); });
  const move = (pid: string | null) => run('move', async () => { setMv(false); const r = await bulk(ids, 'project', pid); p.patch(r.done, { projectId: pid } as any); const name = pid ? p.projects?.find(x => x.id === pid)?.name ?? 'the project' : 'No project';
    dispatchEvent(new Event('ohf:projects-changed')); toast(`Moved ${plural(r.done.length, 'result')} to ${name}`); });
  const del = () => run('del', async () => { const r = await bulk(ids, 'trash'); p.patch(r.done, { _gone: true }); p.onTrashed(r.done); setUndo({ ids: r.done, at: Date.now() }); p.setSel(new Map());
    if (r.skipped.length) toast(`${plural(r.skipped.length, 'result')} not deleted: ${r.skipped[0].reason}`, 'warn'); });
  const restore = () => run('undo', async () => { if (!undo) return; await bulk(undo.ids, 'restore'); p.unpatch(undo.ids); setUndo(null); p.refresh(); toast(`Restored ${plural(undo.ids.length, 'result')}`); });
  const zip = () => { setDl(false); const list = withImg.map(x => x.id); if (!list.length) return; for (let i = 0; i < list.length; i += 100) { const a = document.createElement('a'); a.href = `/api/jobs/download.zip?ids=${list.slice(i, i + 100).join(',')}`; a.download = ''; document.body.appendChild(a); a.click(); a.remove(); }
    toast(`Downloading ${plural(list.length, 'result')} as ${list.length > 100 ? `${Math.ceil(list.length / 100)} zip files` : 'a zip'}`); };
  const oneByOne = () => run('dl', async () => { setDl(false); const list = withImg.slice(0, 40); for (const x of list) { const a = document.createElement('a'); a.href = x.url ? cleanHref(x.url) : `/api/jobs/${encodeURIComponent(x.id)}/download.zip`; a.download = x.url ? appFileName(x.id, (x.url.split('?')[0].split('.').pop() || 'png').slice(0, 4)) : ''; document.body.appendChild(a); a.click(); a.remove(); await new Promise(r => setTimeout(r, 350)); }
    toast(withImg.length > 40 ? 'Downloaded the first 40 one by one. Use a zip for more.' : `Downloaded ${plural(list.length, 'result')}`); });
  const refs = () => run('refs', async () => { await p.useAsRefs?.(withImg.map(x => x.id)); });
  return <div className="fd-bar fd-selbar" data-testid="fd-selbar" role="toolbar" aria-label="Selected results">
    <div className="fd-l">
      <button type="button" className="fd-btn fd-sq" aria-label="Stop selecting" data-testid="fd-sel-exit" onClick={p.onExit} {...tip('Stop selecting (Esc)')}><CloseIcon size={14} /></button>
      <span className="fd-count" data-testid="fd-sel-n" aria-live="polite"><b>{n}</b><span className="fd-count-l"> selected</span></span>
      {n < p.total ? <button type="button" className="fd-link" data-testid="fd-sel-all" disabled={p.allLoading} onClick={() => void p.selectAll()}>{p.allLoading ? 'Selecting…' : `Select all ${p.total.toLocaleString()}`}</button> : null}
      {n > 0 && <button type="button" className="fd-link" data-testid="fd-sel-none" onClick={() => p.setSel(new Map())}>None</button>}
      {undo && <span className="fd-undo" role="status" data-testid="fd-undo">{plural(undo.ids.length, 'result')} moved to Trash <button type="button" className="fd-link" onClick={restore} data-testid="fd-undo-btn">Undo</button></span>}
    </div>
    <div className="fd-r fd-acts">
      <button ref={dlRef} type="button" className="fd-btn" data-testid="fd-act-download" disabled={!!busy} aria-disabled={!!offImg || undefined} onClick={() => !offImg && setDl(o => !o)} {...tip(offImg ?? (noImg ? `${plural(noImg, 'failed run')} left out` : 'Download'))}><DownloadIcon size={15} /><span className="fd-act-l">Download</span></button>
      <button ref={mvRef} type="button" className="fd-btn" data-testid="fd-act-move" disabled={!!busy || !n} onClick={() => setMv(o => !o)} {...tip(n ? 'Move to project' : 'Pick some results first')}><ProjectsIcon size={15} /><span className="fd-act-l">Move</span></button>
      {p.useAsRefs && <button type="button" className="fd-btn" data-testid="fd-act-refs" disabled={!!busy} aria-disabled={!!offImg || undefined} onClick={() => !offImg && refs()} {...tip(offImg ?? `Use as references in ${p.refsTarget}${noImg ? ` (${plural(noImg, 'failed run')} left out)` : ''}`)}><ImageIcon size={15} /><span className="fd-act-l">Use as references</span></button>}
      <button type="button" className="fd-btn" data-testid="fd-act-like" disabled={!!busy || !n} onClick={like} {...tip(n ? (infos.every(x => favOf(x)) ? 'Remove from Favourites' : 'Add to Favourites') : 'Pick some results first')}><HeartIcon size={15} /><span className="fd-act-l">{n && infos.every(x => x.favourite) ? 'Unfavourite' : 'Favourite'}</span></button>
      <button type="button" className="fd-btn fd-danger" data-testid="fd-act-delete" disabled={!!busy || !n} onClick={del} {...tip(n ? 'Move to Trash (you can undo)' : 'Pick some results first')}><TrashIcon size={15} /><span className="fd-act-l">Delete</span></button>
    </div>
    <Popover open={mv} anchor={mvRef} onClose={() => setMv(false)} label="Move to project" placement="bottom" align="end" testId="fd-pop-move" width={260}>
      <div className="fd-pop" role="menu"><span className="fd-pop-h">Move {plural(n, 'result')} to</span>
        <button type="button" role="menuitem" className="fd-opt" data-testid="fd-move-none" onClick={() => move(null)}><b>No project</b></button>
        {(p.projects ?? []).length === 0 ? <p className="fd-pop-note">No projects yet. Make one from the Project menu.</p> : <div className="fd-opt-list">{(p.projects ?? []).map(x => <button key={x.id} type="button" role="menuitem" className="fd-opt" title={x.name} data-testid={`fd-move-${x.id}`} onClick={() => move(x.id)}><b>{x.name}</b><small>{x.count}</small></button>)}</div>}
      </div></Popover>
    <Popover open={dl} anchor={dlRef} onClose={() => setDl(false)} label="Download" placement="bottom" align="end" testId="fd-pop-dl" width={240}>
      <div className="fd-pop" role="menu"><span className="fd-pop-h">Download {plural(withImg.length, 'result')}</span>
        <button type="button" role="menuitem" className="fd-opt" data-testid="fd-dl-zip" onClick={zip}><b>One zip file</b><small>{p.noun === 'clip' ? 'Clips' : p.noun === 'sound' ? 'Sounds' : 'Images'} and their settings</small></button>
        <button type="button" role="menuitem" className="fd-opt" data-testid="fd-dl-each" onClick={() => void oneByOne()}><b>One by one</b><small>{withImg.length > 40 ? 'The first 40' : 'A file per result'}</small></button>
      </div></Popover>
  </div>;
}
