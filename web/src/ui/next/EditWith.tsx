import { newIdemKey, jobPostError } from '../../api';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { listTools, ToolInfo } from '../../api';
import { navigate, Link } from '../../platform/router';
import { ToolIconFor } from '../Icons';

/** "Edit with…" on results: POST /api/jobs/:id/edit {tool, params, output?} → route to the new job. Tools are those that take this output kind as input. */
let toolsCache: Promise<ToolInfo[]> | null = null;
const inputOf = (t: any): string => t.app?.input ?? ((t.inputs ?? []).some((i: any) => i.name === 'video') ? 'video' : (t.inputs ?? []).some((i: any) => i.name === 'image') ? 'image' : 'none');
export function EditWith({ jobId, kind, output = 0, exclude }: { jobId: string; kind: 'video' | 'image' | 'audio'; output?: number; exclude?: string }) {
  const [open, setOpen] = useState(false); const [tools, setTools] = useState<ToolInfo[]>([]); const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const btn = useRef<HTMLButtonElement>(null); const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useEffect(() => { if (!open || tools.length) return; (toolsCache ??= listTools()).then(ts => setTools(ts.filter(t => t.id !== exclude && !t.id.startsWith('app-') && (inputOf(t) === kind || (kind === 'image' && inputOf(t) === 'image-optional'))))).catch(() => setErr('Could not load tools')); }, [open]);
  useEffect(() => { if (!open) return; const r = btn.current!.getBoundingClientRect(); setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, innerWidth - 300)) }); const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [open]);
  async function run(t: ToolInfo) {
    setBusy(t.id); setErr('');
    const types = t.presets?.[0] ? [t.presets[0].id] : undefined;
    try {
      const r = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/edit`, { method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': newIdemKey() }, body: JSON.stringify({ tool: t.id, output, params: { ...(types && (t as any).app ? { types } : {}) } }) });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw jobPostError(j, r.status, `That edit couldn’t start (HTTP ${r.status}). Nothing was charged.`); setOpen(false); navigate(`/jobs/${j.id}`);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(''); }
  }
  return <>
    <button ref={btn} type="button" className="btn btn-primary edit-with-btn" data-action="edit-with" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}>Edit with ▾</button>
    {open && pos && createPortal(<div className="ew-scrim" onMouseDown={e => e.target === e.currentTarget && setOpen(false)}>
      <div className="ew-menu" role="menu" style={{ top: pos.top, left: pos.left }}>
        <p className="ew-head helper">Use this {kind} as the input. No re-upload.</p>
        {!tools.length && !err && <div className="shimmer" style={{ height: 120 }} />}
        {tools.map(t => <button key={t.id} role="menuitem" className="ew-item" disabled={!!busy} onClick={() => run(t)}><ToolIconFor id={t.id} ui={t.ui} size={15} /><span><b>{t.name}</b><small>{(t.description ?? '').split('.')[0]}</small></span>{busy === t.id && <em>Starting…</em>}</button>)}
        {err && <p className="inline-err ew-err">{err}</p>}
      </div></div>, document.body)}
  </>;
}

/** Lineage strip: GET /api/jobs/:id/lineage → {chain[], children[]} (root first). */
type Node = { id: string; toolId: string; toolName: string; status: string; resultUrl: string | null; prompt?: string | null };
const Thumb = ({ n, cur }: { n: Node; cur?: boolean }) => {
  const isVid = /\.(mp4|webm|mov)$/i.test(n.resultUrl ?? '');
  return <Link to={`/jobs/${n.id}`} className={`ln-node ${cur ? 'cur' : ''} ln-${n.status}`}><span className="ln-thumb">{n.resultUrl ? (isVid ? <video src={n.resultUrl} muted preload="metadata" /> : <img src={n.resultUrl} alt="" loading="lazy" />) : <i>{n.status}</i>}</span><b title={n.toolName}>{n.toolName}</b><small>{n.status}</small></Link>;
};
export function LineageStrip({ jobId, reserve }: { jobId: string; reserve?: boolean }) {
  const [d, setD] = useState<{ chain: Node[]; children: Node[] } | null>(null);
  useEffect(() => { fetch(`/api/jobs/${encodeURIComponent(jobId)}/lineage`).then(r => r.ok ? r.json() : null).then(setD).catch(() => 0); }, [jobId]);
  // reserve: the job has a parent, so the strip will show; hold its space while it loads.
  if (!d) return reserve ? <nav className="lineage lineage-ph" aria-hidden><span className="ln-label helper">History</span><div className="ln-row" /></nav> : null;
  if (d.chain.length <= 1 && !d.children.length) return null;
  return <nav className="lineage" aria-label="Edit history">
    <span className="ln-label helper">History</span>
    <div className="ln-row">{d.chain.map((n, i) => <span key={n.id} className="ln-step">{i > 0 && <span className="ln-arrow" aria-hidden>→</span>}<Thumb n={n} cur={n.id === jobId} /></span>)}
      {d.children.length > 0 && <span className="ln-step ln-kids"><span className="ln-arrow" aria-hidden>↳</span>{d.children.map(n => <Thumb key={n.id} n={n} />)}</span>}</div>
  </nav>;
}
