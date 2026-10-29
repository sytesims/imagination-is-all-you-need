import { Notice } from './Notice';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { listJobsPage, type JobState } from '../api';
import { canSaveLook, lookNameFrom, saveLook } from './looks';
import { useToast } from './Toast';
import { navigate } from '../platform/router';
import { typedPromptOf } from '../../../server/src/shared/typedPrompt';
import './saveLook.css';
/**
 * Save as look (Workflows, 2026-10-23). From a finished image result (viewer and feed menus) it asks for a name (the prompt's first words to start)
 * and saves the job's workflow, prompt, settings and model with that image as the example (POST /api/user-looks). With no job (the "Save your own
 * look" tile) it first shows your recent finished images to pick from, optionally only those of one workflow.
 */
/** One host in App: menus open the dialog here, so it survives the menu closing (a menu item would unmount it with the menu). */
let pushLook: ((p: Omit<Props, 'onClose'> | null) => void) | null = null;
export const openSaveLook = (p: Omit<Props, 'onClose'>) => pushLook?.(p);
export function SaveLookHost() {
  const [p, setP] = useState<Omit<Props, 'onClose'> | null>(null);
  useEffect(() => { pushLook = setP; return () => { pushLook = null; }; }, []);
  return p ? <SaveLookDialog key={p.job?.id ?? 'pick'} {...p} onClose={() => setP(null)} /> : null;
}
type Props = { job?: JobState | null; output?: number; workflow?: { id: string; name: string } | null; onClose: () => void; onSaved?: (look: any) => void };
const featureOf = (j: any): string | null => { const f = j?.feature?.id ?? null; return f === 'edit-image' ? 'create-image' : f; };

export default function SaveLookDialog({ job: job0, output = 0, workflow, onClose, onSaved }: Props) {
  const [job, setJob] = useState<JobState | null>(job0 ?? null); const [name, setName] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [recent, setRecent] = useState<JobState[] | null>(null); const box = useRef<HTMLDivElement>(null); const input = useRef<HTMLInputElement>(null); const back = useRef<HTMLElement | null>(null);
  const toast = useToast();
  useEffect(() => { back.current = document.activeElement as HTMLElement; return () => { back.current?.focus?.(); }; }, []);
  useEffect(() => { if (job) { setName(lookNameFrom((job as any).input?.prompt ?? (job as any).input?.appPrompt, (job as any).feature?.name ?? 'My look')); setErr(''); requestAnimationFrame(() => { input.current?.focus(); input.current?.select(); }); } }, [job?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (job0) return; let live = true;
    listJobsPage({ features: '*', limit: 60 }).then(r => { if (live) setRecent(r.items.filter(j => canSaveLook(j) && (!workflow || featureOf(j) === workflow.id)).slice(0, 24)); }).catch(() => live && setRecent([]));
    requestAnimationFrame(() => box.current?.querySelector<HTMLElement>('button')?.focus()); return () => { live = false; }; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => { if (!job || !name.trim() || busy) return; setBusy(true); setErr('');
    try { const l = await saveLook(job.id, name.trim(), output); onClose(); onSaved?.(l);
      toast(`Saved “${l.name}”`, 'info', { sub: 'It’s on its workflow page, and opens in Create with its prompt, settings and model.', action: { label: 'View look', onClick: () => navigate(`/workflows/${l.workflow}/looks/${l.id}`) } }); }
    catch (e: any) { setErr(String(e?.message ?? 'Couldn’t save the look.')); } finally { setBusy(false); } };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); return; }
    if (e.key === 'Tab') { const f = [...(box.current?.querySelectorAll<HTMLElement>('input,button:not([disabled])') ?? [])]; if (!f.length) return; const i = f.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); } }
  };
  const img = job ? (job.outputs?.[output]?.url ?? job.resultUrl ?? '') : '';
  const wfName = (job as any)?.feature?.name ?? workflow?.name ?? 'Image'; const model = (job as any)?.modelName ?? (job as any)?.model ?? null;
  const prompt = typedPromptOf((job as any)?.input).trim(); // the look keeps your words (the server's prefill), not the workflow's composed prompt
  return createPortal(<div className="dlg-scrim" onMouseDown={e => e.target === e.currentTarget && onClose()} onKeyDown={onKey}>
    <div ref={box} className={`dlg slk ${job ? '' : 'slk-pick'}`} role="dialog" aria-modal="true" aria-labelledby="slk-t" data-testid="save-look-dialog">
      <h2 id="slk-t" className="dlg-t">{job ? 'Save as look' : 'Save your own look'}</h2>
      {!job ? <>
        <p className="dlg-b">Pick one of your finished images{workflow ? ` from ${workflow.name}` : ''}. Its prompt, settings and model become the look.</p>
        {!recent ? <div className="slk-grid" aria-busy="true">{Array.from({ length: 8 }, (_, i) => <span key={i} className="slk-cell shimmer" />)}</div>
          : !recent.length ? <p className="slk-empty" data-testid="save-look-none">No finished images{workflow ? ` from ${workflow.name}` : ''} yet. Make one in Create, then save it here.</p>
          : <div className="slk-grid" role="list">{recent.map(j => <button key={j.id} type="button" role="listitem" className="slk-cell" data-testid={`save-look-pick-${j.id}`} onClick={() => setJob(j)}
              aria-label={`Use ${(j as any).feature?.name ?? 'image'}: ${String((j as any).input?.prompt ?? '').slice(0, 60) || 'no prompt'}`} title={String((j as any).input?.prompt ?? '') || undefined}>
              <img src={j.outputs?.[0]?.url ?? j.resultUrl ?? ''} alt="" loading="lazy" onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} /></button>)}</div>}
        <div className="dlg-a"><button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>Cancel</button></div>
      </> : <form onSubmit={e => { e.preventDefault(); void save(); }}>
        <div className="slk-row">
          <span className="slk-thumb">{img ? <img src={img} alt="" onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} /> : null}</span>
          <dl className="slk-facts">
            <dt>Workflow</dt><dd>{wfName}</dd>
            {model && <><dt>Model</dt><dd>{model}</dd></>}
            <dt>Prompt</dt><dd className="slk-prompt" title={prompt || undefined}>{prompt || <i>None (this workflow needs no prompt)</i>}</dd>
          </dl>
        </div>
        <label className="dlg-l">Name<input ref={input} data-testid="save-look-name" value={name} maxLength={80} onChange={e => setName(e.target.value)} /></label>
        <p className="slk-note">Saves the prompt, settings and model, with this image as the example. You can rename or delete it later.</p>
        {err && <Notice as="p" kind="error" tone="line">{err}</Notice>}
        <div className="dlg-a">
          {!job0 && <button type="button" className="btn btn-sm btn-ghost slk-back" onClick={() => setJob(null)}>Back</button>}
          <button type="button" className="btn btn-sm btn-ghost" data-testid="save-look-cancel" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-sm btn-primary" data-testid="save-look-ok" disabled={!name.trim() || busy}>{busy ? 'Saving…' : 'Save look'}</button>
        </div>
      </form>}
    </div></div>, document.body);
}
