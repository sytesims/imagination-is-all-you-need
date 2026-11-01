/**
 * Add a workflow, step 2 (2026-11-01): the quiet "Needs" list on a workflow you added. Each model file its graph loads, with its folder and
 * whether your ComfyUI has it (server workflowModels.ts, GET /api/workflows/:id/models). A missing file the app's model list knows comes with
 * its link; any other takes a Hugging Face or Civitai link you paste (saved with the workflow). "Download missing" is the same model download as
 * Local setup (POST /api/local/downloads, progress with the shared DlProgress bar). Generate itself refuses a run while files are missing (server).
 */
import { useCallback, useEffect, useState } from 'react';
import { Notice } from '../shared/Notice';
import { requestRequote } from '../shared/quote';
import { Link } from '../platform/router';
import { DlProgress } from '../shared/DlProgress';
import { gbText, LOCAL_SETUP_HREF } from '../shared/fit';
import { cancelDownload, dryRunDownload, getDownload, getWorkflowNeeds, listDownloads, saveWorkflowLink, startDownload, type Download, type NeedRow, type Needs } from '../shared/hardware';

const SHOW = 6;
const active = (x?: Download | null) => !!x && (x.status === 'queued' || x.status === 'downloading');
const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

function LinkForm({ row, toolId, onSaved, initial = '' }: { row: NeedRow; toolId: string; onSaved: (n: Needs) => void; initial?: string }) {
  const [url, setUrl] = useState(initial); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const save = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); setErr(''); const r = await saveWorkflowLink(toolId, row.folder, row.file, url); setBusy(false); if (r.ok) onSaved(r.data); else setErr(r.error); };
  return <form className="wn-link" onSubmit={save} data-testid="wn-link-form">
    <input type="url" value={url} onChange={e => { setUrl(e.target.value); setErr(''); }} placeholder="Hugging Face or Civitai file link" aria-label={`Download link for ${row.file}`} aria-invalid={!!err || undefined} data-testid="wn-link-input" />
    <button type="submit" className="btn btn-sm" disabled={busy || !url.trim()} aria-busy={busy}>{busy ? 'Saving…' : 'Save'}</button>
    {err && <Notice as="p" kind="error" tone="line" className="wn-err" testId="wn-link-err">{err}</Notice>}
  </form>;
}

function Row({ r, toolId, onSaved }: { r: NeedRow; toolId: string; onSaved: (n: Needs) => void }) {
  const [edit, setEdit] = useState(false); const need = r.state !== 'have';
  const state = r.state === 'have' ? 'In your ComfyUI' : r.state === 'missing' ? 'Missing' : 'Not checked';
  return <li data-state={r.state} data-testid="wn-row">
    <span className="wn-file"><b title={r.file}>{r.file}</b><small>{r.folder}{r.nodes.length > 1 ? ` · used ${r.nodes.length} times` : ''}</small></span>
    <span className={`wn-state wn-${r.state}`}>{r.state === 'have' && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5 10 17 19 7" /></svg>}{state}</span>
    {need && !r.badPath && <span className="wn-src">{r.url && !edit
      ? r.linkFrom === 'list' ? <small>{r.bytes ? `${gbText(r.bytes)} · ` : ''}{r.pageUrl ? <a href={r.pageUrl} target="_blank" rel="noreferrer">{hostOf(r.url)} ↗</a> : hostOf(r.url)}</small>
        : <small>Your link · {hostOf(r.url)} <button type="button" className="link-btn" onClick={() => setEdit(true)}>Change</button></small>
      : null}</span>}
    {((r.state === 'missing' && !r.badPath && !r.url) || edit) && <LinkForm row={r} toolId={toolId} initial={edit ? r.url ?? '' : ''} onSaved={n => { setEdit(false); onSaved(n); }} />}
    {r.badPath && <small className="helper wn-note">This file name can’t be saved in your models folder. Add it to ComfyUI yourself.</small>}
    {r.nodeMissing && <small className="helper wn-note">Its loader node isn’t in your ComfyUI. Install that custom node first.</small>}
  </li>;
}

export default function WorkflowNeeds({ toolId }: { toolId: string }) {
  const [n, setN] = useState<Needs | null | undefined>(undefined); const [all, setAll] = useState(false);
  const [dl, setDl] = useState<Download | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState<{ code?: string | null; text: string } | null>(null);
  const load = useCallback(() => getWorkflowNeeds(toolId).then(r => setN(r.ok ? r.data : null)), [toolId]);
  useEffect(() => { setN(undefined); setDl(null); setErr(null); void load();
    listDownloads().then(r => { if (r.ok) { const x = r.data.downloads.find(d => d.downloadId === `workflow:${toolId}`); if (x && active(x)) setDl(x); } }); }, [toolId, load]);
  useEffect(() => { if (!active(dl)) return; const t = setTimeout(async () => { const r = await getDownload(dl!.id); if (!r.ok) return; setDl(r.data); if (!active(r.data)) { void load(); requestRequote(); /* Generate's price and setup step read the new files */ } }, 1000); return () => clearTimeout(t); }, [dl, load]);
  if (n === undefined) return <section className="wn" aria-busy="true" data-testid="wf-needs"><div className="wn-h"><b>Needs</b><small>Checking your ComfyUI…</small></div></section>;
  if (n === null) return null;
  if (!n.files.length) return <p className="helper wn-none" data-testid="wf-needs" data-missing={0}>Needs no model files.</p>; // nothing to load: one quiet line
  const todo = n.files.filter(r => r.state !== 'have' && !r.badPath); const noLink = todo.filter(r => !r.url); const bytes = todo.reduce((a, r) => a + (r.bytes ?? 0), 0);
  const total = n.files.length; const order = { missing: 0, unknown: 1, have: 2 } as const; const sorted = [...n.files].sort((a, b) => order[a.state] - order[b.state]); const shown = all ? sorted : sorted.slice(0, SHOW); // what's missing first
  const summary = !total ? 'No model files' : n.missing ? `${n.missing} of ${total} missing` : n.unknown ? `${total} file${total > 1 ? 's' : ''} · not checked` : total === 1 ? 'In your ComfyUI' : `All ${total} in your ComfyUI`;
  const download = async () => { setBusy(true); setErr(null); const p = await dryRunDownload(n.downloadId, null, true);
    if (!p.ok) { setBusy(false); setErr({ code: p.code, text: p.error }); return; }
    if (p.data.canDownload === false) { setBusy(false); if (p.data.code === 'nothing_to_download') { void load(); return; } setErr({ code: p.data.code, text: String(p.data.error ?? 'Can’t download right now.') }); return; }
    const r = await startDownload(n.downloadId); setBusy(false); if (r.ok) setDl(r.data); else setErr({ code: r.code, text: r.error }); };
  const canDl = todo.length > 0 && n.modelsDirSet && !noLink.length;
  return <section className="wn" data-testid="wf-needs" data-missing={n.missing}>
    <div className="wn-h"><b>Needs</b><small data-testid="wn-summary">{summary}</small>
      {todo.length > 0 && (n.missing > 0 || n.modelsDirSet) && <span className="wn-act">{active(dl) ? <><DlProgress x={dl} label="Model files" bytes={bytes} /><button type="button" className="btn btn-sm btn-ghost" onClick={async () => { const r = await cancelDownload(dl!.id); if (r.ok) setDl({ ...r.data, status: 'canceled' }); }}>Cancel</button></>
        : <button type="button" className="btn btn-sm" data-testid="wn-download" disabled={!canDl || busy} aria-busy={busy} onClick={download}>{busy ? 'Checking…' : `Download missing${bytes && !noLink.length ? ` · ${gbText(bytes)}` : ''}`}</button>}</span>}
    </div>
    {n.comfy === 'off' && total > 0 && <Notice as="p" kind="warn" tone="line" testId="wn-comfy-off" action={{ label: 'Check again', onClick: () => { setN(undefined); void load(); } }}>ComfyUI isn’t running, so these files can’t be checked yet.</Notice>}
    {n.comfy === 'not_set' && total > 0 && <Notice as="p" kind="info" tone="line" testId="wn-comfy-unset" action={{ label: 'Set up your computer', to: LOCAL_SETUP_HREF }}>Connect your ComfyUI to check these files.</Notice>}
    {n.missing > 0 && !n.modelsDirSet && <Notice as="p" kind="info" tone="line" testId="wn-no-dir" action={{ label: 'Set up your computer', to: LOCAL_SETUP_HREF }}>To download here, choose your ComfyUI models folder first.</Notice>}
    {todo.length > 0 && n.modelsDirSet && noLink.length > 0 && <p className="helper wn-hint" data-testid="wn-need-links">Paste a link for {noLink.length === 1 ? 'the file' : `the ${noLink.length} files`} without one, then download.</p>}
    {err && <Notice as="p" kind="error" tone="line" testId={`wn-err-${err.code ?? 'error'}`} action={err.code === 'no_models_dir' ? { label: 'Set up your computer', to: LOCAL_SETUP_HREF } : undefined}>{err.text}</Notice>}
    {dl?.status === 'failed' && <Notice as="p" kind="error" tone="line" testId="wn-dl-failed">{dl.errorCode === 'hf_gated' && dl.helpUrl ? <>Accept the licence on <a href={dl.helpUrl} target="_blank" rel="noreferrer">the model page ↗</a>, then <Link to="/settings#conn-hf">connect Hugging Face</Link>.</> : dl.error}</Notice>}
    {dl?.status === 'done' && !n.missing && <p className="helper wn-hint" role="status">Downloaded. Press Generate when you’re ready.</p>}
    {total > 0 && <ul className="wn-list">{shown.map(r => <Row key={`${r.folder}/${r.file}`} r={r} toolId={toolId} onSaved={x => { setN(x); requestRequote(); }} />)}</ul>}
    {total > SHOW && <button type="button" className="link-btn wn-more" aria-expanded={all} onClick={() => setAll(a => !a)}>{all ? 'Show fewer' : `Show all ${total}`}</button>}
  </section>;
}
