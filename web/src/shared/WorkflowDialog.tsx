/**
 * "Every result is a workflow": Get workflow / Open in ComfyUI for one result (GET /api/jobs/:id/workflow, server/src/workflowExport.ts).
 * Download = the ComfyUI API-format graph with the user's prompt, seed and settings filled in. Open in ComfyUI = open the ComfyUI address set in
 * Connections → Local, with the JSON on the clipboard and the file downloaded: ComfyUI has no documented "load a workflow from a URL", but its
 * editor opens API-format files dropped on the canvas or picked with Workflow → Open (docs.comfy.org: "Yes, but without layout").
 */
import { useEffect, useRef, useState } from 'react';
import { appFileName } from './brand';
import { createPortal } from 'react-dom';
import { Link } from '../platform/router';
import './workflow.css';

export interface WorkflowInfo {
  jobId: string; toolId: string; available: boolean; exact: boolean; source: 'submitted' | 'rebuilt' | 'equivalent' | 'partner' | null;
  ranOn: { id: string | null; label: string | null; kind: string | null }; headline: string; notes: string[]; reason?: string;
  passes: { index: number; label: string; workflow: string; nodes: number; partnerNodes: string[]; url: string }[];
  media: { pass: number; node: string; field: string; file: string; what: string; how?: string }[]; runtime: { pass: number; node: string; field: string; what: string }[];
  formats: { api: true; ui: false; uiNote: string }; comfy: { url: string | null; opensApiFormat: true; howTo: string[]; docs: string };
}
const SOURCE: Record<string, [string, string]> = {
  submitted: ['Saved graph', 'The submitted graph saved with this result.'],
  rebuilt: ['Rebuilt from settings', 'Rebuilt from saved settings, not the original submitted graph.'],
  equivalent: ['Same-model alternative', 'An alternative workflow for the same model. Outputs can differ from the hosted run.'],
  partner: ['Partner node', 'A ComfyUI partner-node version of this provider call, not the original submitted graph.'],
};
const GraphGlyph = () => <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="4" width="6" height="5" rx="1.5" /><rect x="15" y="4" width="6" height="5" rx="1.5" /><rect x="9" y="15" width="6" height="5" rx="1.5" /><path d="M9 6.5h6M6 9v2.5a2 2 0 0 0 2 2h1.5M18 9v2.5a2 2 0 0 1-2 2h-1.5" /></svg>;

async function fetchGraph(url: string) { const u = new URL(url, window.location.href); u.searchParams.set('download', '0'); const r = await fetch(u); if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? `HTTP ${r.status}`); return r.text(); }
const fileName = (info: WorkflowInfo, k: number) => appFileName(`${info.toolId}-${info.jobId}${info.passes.length > 1 ? `-run${k + 1}` : ''}-api`, 'json');
function saveText(text: string, name: string) { const a = document.createElement('a'); const u = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }
async function copy(text: string) { try { await navigator.clipboard.writeText(text); return true; } catch { return false; } }

/** The graph's nodes in plain groups, read-only (node id order): what the workflow does, without a canvas. */
type NodeRow = { id: string; title: string; type: string };
const GROUPS: [string, RegExp][] = [['Models & inputs', /load|checkpoint|unet|lora|clip(?!text)|vae(?!decode|encode)/i], ['Prompt', /text|prompt|condition/i],
  ['Sampling', /sampl|schedul|sigma|noise|guider|cfg|latent|vaeencode/i], ['Output', /decode|save|preview|combine/i]];
export function nodeGroups(graph: Record<string, any>): { name: string; nodes: NodeRow[] }[] {
  const ids = Object.keys(graph ?? {}).filter((k) => graph[k] && typeof graph[k] === 'object' && typeof graph[k].class_type === 'string')
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const out = new Map<string, NodeRow[]>([...GROUPS.map(([n]) => [n, []] as [string, NodeRow[]]), ['Other steps', []]]);
  for (const id of ids) { const n = graph[id]; const type = String(n.class_type); const title = String(n._meta?.title ?? '').trim() || type;
    out.get(GROUPS.find(([, re]) => re.test(type))?.[0] ?? 'Other steps')!.push({ id, title, type }); }
  return [...out].filter(([, ns]) => ns.length).map(([name, nodes]) => ({ name, nodes }));
}
function NodeList({ url, label }: { url: string; label?: string }) {
  const [groups, setGroups] = useState<{ name: string; nodes: NodeRow[] }[] | null>(null);
  useEffect(() => { let on = true; setGroups(null); fetchGraph(url).then((t) => { const g = JSON.parse(t); if (on) setGroups(nodeGroups(g?.prompt && typeof g.prompt === 'object' ? g.prompt : g)); }).catch(() => on && setGroups([])); return () => { on = false; }; }, [url]);
  if (groups && !groups.length) return null;
  return <details className="wf-details wf-nodes" open data-testid="wf-nodes"><summary>Nodes{label ? <span>{label}</span> : null}</summary>
    {!groups ? <div className="wf-skel" aria-busy="true" aria-label="Loading nodes"><i /><i /></div>
      : <div className="wf-detail-body">{groups.map((g) => <section key={g.name}><h5>{g.name}</h5><ol>{g.nodes.map((n) => <li key={n.id}><b>{n.title}</b>{n.title !== n.type && <small className="wf-mono">{n.type}</small>}</li>)}</ol></section>)}</div>}
  </details>;
}

export function useWorkflowInfo(jobId: string | null) {
  const [info, setInfo] = useState<WorkflowInfo | null>(null); const [err, setErr] = useState(''); const [attempt, setAttempt] = useState(0);
  useEffect(() => { setInfo(null); setErr(''); if (!jobId) return; let on = true;
    fetch(`/api/jobs/${jobId}/workflow`).then(async r => { const b = await r.json().catch(() => null); if (!r.ok || !b) throw new Error(b?.error ?? `HTTP ${r.status}`); return b; }).then(b => on && setInfo(b)).catch(e => on && setErr(e.message)); return () => { on = false; }; }, [jobId, attempt]);
  return { info, err, retry: () => setAttempt(n => n + 1) };
}

/** The dialog. `intent: 'open'` runs Open in ComfyUI as soon as the export is loaded (the ⋯ menu's "Open in ComfyUI"). */
export function WorkflowDialog({ jobId, onClose, intent = 'get' }: { jobId: string; onClose: () => void; intent?: 'get' | 'open' }) {
  const { info, err, retry } = useWorkflowInfo(jobId); const [msg, setMsg] = useState(''); const [failed, setFailed] = useState(false); const [opened, setOpened] = useState(false); const [busy, setBusy] = useState('');
  const box = useRef<HTMLDivElement>(null); const ran = useRef(false); const close = useRef(onClose); close.current = onClose;
  useEffect(() => { const prev = document.activeElement as HTMLElement | null; box.current?.focus({ preventScroll: true });
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close.current(); }
      if (e.key === 'Tab') { const els = Array.from(box.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], summary, [tabindex="0"]') ?? []).filter(el => el.getClientRects().length > 0);
        const first = els[0], last = els[els.length - 1]; if (!first) { e.preventDefault(); return; }
        if (e.shiftKey && (document.activeElement === first || document.activeElement === box.current)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || document.activeElement === box.current)) { e.preventDefault(); first.focus(); }
      }
    };
    const scrim = box.current?.parentElement;
    const outsideScroll = (e: WheelEvent | TouchEvent) => { if (!(e.target as HTMLElement).closest('.wf-body')) e.preventDefault(); };
    scrim?.addEventListener('wheel', outsideScroll, { passive: false }); scrim?.addEventListener('touchmove', outsideScroll, { passive: false });
    addEventListener('keydown', k, true); return () => { removeEventListener('keydown', k, true); scrim?.removeEventListener('wheel', outsideScroll); scrim?.removeEventListener('touchmove', outsideScroll); prev?.focus?.({ preventScroll: true }); }; }, []);
  const flash = (m: string, error = false) => { setMsg(m); setFailed(error); };
  const act = async (label: string, work: () => Promise<void>) => { if (busy) return; setBusy(label); setMsg(''); setFailed(false); try { await work(); } catch (e) { flash(`Couldn’t prepare the workflow. ${(e as Error).message}. Try again.`, true); } finally { setBusy(''); } };
  const download = (k = 0) => { if (!info?.passes[k]) return; return act('download', async () => { saveText(await fetchGraph(info.passes[k].url), fileName(info, k)); flash('Workflow downloaded'); }); };
  const copyJson = (k = 0) => { if (!info?.passes[k]) return; return act('copy', async () => { const ok = await copy(await fetchGraph(info.passes[k].url)); flash(ok ? 'Workflow JSON copied' : 'Clipboard access was blocked. Download the JSON instead.', !ok); }); };
  const openInComfy = () => { if (!info?.comfy.url || !info.passes.length || busy) return;
    // Clear opener synchronously; unlike the noopener feature, this preserves a reliable popup-blocked signal.
    const w = window.open(info.comfy.url, '_blank'); if (w) w.opener = null; setOpened(true);
    return act('open', async () => { const t = await fetchGraph(info.passes[0].url); saveText(t, fileName(info, 0)); const copied = await copy(t);
      flash(!w ? 'Pop-up blocked. Allow pop-ups, then try again. The JSON was downloaded.' : copied ? 'ComfyUI opened. Load the downloaded JSON to continue.' : 'ComfyUI opened; clipboard blocked. Load the downloaded JSON.', !w || !copied); }); };
  useEffect(() => { if (intent === 'open' && info?.available && info.comfy.url && info.passes.length && !ran.current) { ran.current = true; void openInComfy(); } }, [info]);
  const source = info?.source ? SOURCE[info.source] : null; const multi = (info?.passes.length ?? 0) > 1; const available = info?.available && info.passes.length > 0;
  return createPortal(<div className="mp-scrim wf-scrim" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <div className="wf-dlg" role="dialog" aria-modal="true" aria-labelledby="wf-t" tabIndex={-1} ref={box} data-testid="workflow-dialog">
      <header className="wf-head"><span className="wf-ic" aria-hidden><GraphGlyph /></span>
        <div className="wf-ht"><h3 id="wf-t">View workflow</h3>{source && available && <span className="wf-badge" title={source[1]} data-testid="wf-badge">{source[0]}</span>}</div>
        <button type="button" className="wf-x" aria-label="Close" onClick={onClose}>✕</button></header>
      <div className="wf-body">
        {!info && !err && <div className="wf-skel" aria-busy="true" aria-label="Loading workflow"><i /><i /><i /></div>}
        {err && <div className="wf-empty" role="alert"><h4>Workflow couldn’t be loaded</h4><p>{err}</p><button type="button" className="btn wf-second" onClick={retry}>Try again</button></div>}
        {info && !available && <div className="wf-empty" data-testid="wf-unavailable"><h4>Workflow unavailable</h4><p>{info.reason || 'No exportable graph was saved for this result.'}</p>{info.notes.length > 0 && <ul className="wf-notes">{info.notes.map(n => <li key={n}>{n}</li>)}</ul>}</div>}
        {info && available && <>
          <p className="wf-sub">{source?.[1] || info.headline}</p>
          <dl className="wf-meta" data-testid="wf-meta">
            {info.ranOn.label && <div><dt>Ran on</dt><dd>{info.ranOn.label}</dd></div>}
            <div><dt>{multi ? 'Workflows' : 'Workflow'}</dt><dd>{multi ? `${info.passes.length} graphs · ${info.passes.reduce((n, p) => n + p.nodes, 0).toLocaleString()} nodes total` : <><code className="wf-mono wf-file" tabIndex={0}>{info.passes[0].workflow}</code><span className="wf-count">{info.passes[0].nodes.toLocaleString()} nodes</span></>}</dd></div>
            <div><dt>Format</dt><dd>API-format JSON <span className="wf-count">No canvas layout</span></dd></div>
          </dl>
          {(info.source === 'partner' || info.passes.some(p => p.partnerNodes.length > 0)) && <p className="wf-notice">Partner nodes need a Comfy account with credits. They run on the provider’s servers.</p>}
          {!info.comfy.url && <p className="wf-hint">To open ComfyUI, add its address in <Link to="/settings#conn-local" onClick={onClose}>Settings → Connections</Link>.</p>}
          {multi && <ol className="wf-passes" aria-label="Workflow passes">{info.passes.map((p, k) => <li key={p.index}><div><b>{p.label}</b><code className="wf-mono wf-file" tabIndex={0}>{p.workflow}</code><small>{p.nodes.toLocaleString()} nodes</small></div><span className="wf-row-acts"><button type="button" className="btn wf-second" disabled={!!busy} onClick={() => download(k)}>Download<span className="wf-sr"> {p.label}</span></button><button type="button" className="btn wf-second" disabled={!!busy} onClick={() => copyJson(k)}>Copy<span className="wf-sr"> {p.label} JSON</span></button></span></li>)}</ol>}
          <NodeList url={info.passes[0].url} label={multi ? info.passes[0].label : undefined} />
          <details className="wf-details" open={opened} data-testid="wf-steps"><summary>How to use this workflow</summary><div className="wf-detail-body"><ol>{info.comfy.howTo.map(s => <li key={s}>{s}</li>)}</ol><p>{info.formats.uiNote} Loading this file does not install models or custom nodes. <a href={info.comfy.docs} target="_blank" rel="noreferrer">ComfyUI docs ↗</a></p></div></details>
          {(info.media.length > 0 || info.runtime.length > 0) && <details className="wf-details wf-files"><summary>Required inputs <span>{info.media.length} {info.media.length === 1 ? 'file' : 'files'}{info.runtime.length > 0 ? ` · ${info.runtime.length} runtime ${info.runtime.length === 1 ? 'step' : 'steps'}` : ''}</span></summary><ul className="wf-detail-body">
            {info.media.map(m => <li key={`${m.pass}-${m.node}-${m.field}`}><code className="wf-mono wf-file" tabIndex={0}>{m.file}</code><small>Node {m.node} · {m.field}{multi ? ` · run ${m.pass + 1}` : ''}</small><p>{m.what}</p>{m.how && <button type="button" className="btn wf-second" onClick={async () => { const ok = await copy(m.how!); flash(ok ? 'ffmpeg command copied' : 'Clipboard access was blocked. Select and copy the command below.', !ok); }}>Copy ffmpeg command</button>}{m.how && <code className="wf-mono wf-file" tabIndex={0}>{m.how}</code>}</li>)}
            {info.runtime.map(r => <li key={`rt-${r.pass}-${r.node}-${r.field}`}><code className="wf-mono">Node {r.node} · {r.field}{multi ? ` · run ${r.pass + 1}` : ''}</code><p>{r.what}</p></li>)}
          </ul></details>}
          <details className="wf-details"><summary>Technical details &amp; source</summary><div className="wf-detail-body"><p>{info.source === 'rebuilt' ? 'This export uses the current workflow builder and saved settings. Historical builder changes may affect the reconstructed graph.' : info.headline}</p><p>{info.exact && info.source === 'submitted' ? 'Saved submitted graph.' : 'Do not treat this export as a byte-for-byte copy of the original submitted graph.'}</p>{info.passes.map(p => p.partnerNodes.length > 0 && <p key={p.index}>Partner nodes: <code className="wf-mono wf-file" tabIndex={0}>{p.partnerNodes.join(', ')}</code></p>)}{info.notes.length > 0 && <ul className="wf-notes">{info.notes.map(n => <li key={n}>{n}</li>)}</ul>}</div></details>
        </>}
      </div>
      {info && available && <footer className="wf-foot"><div className="wf-acts">
        <button type="button" className="btn wf-primary" disabled={!!busy} onClick={() => download(0)} data-testid="wf-download">{busy === 'download' ? 'Preparing…' : multi ? 'Download run 1' : 'Download workflow'}</button>
        <button type="button" className="btn wf-second" disabled={!!busy} onClick={() => copyJson(0)} data-testid="wf-copy">{busy === 'copy' ? 'Copying…' : 'Copy JSON'}</button>
        <button type="button" className="btn wf-second" disabled={!!busy || !info.comfy.url} title={info.comfy.url ? `Opens ${info.comfy.url}` : 'Add a ComfyUI address in Settings → Connections'} onClick={openInComfy} data-testid="wf-open-comfy">{busy === 'open' ? 'Opening…' : 'Open in ComfyUI'}</button>
      </div><p className={`wf-live${failed ? ' wf-failed' : ''}`} role="status" aria-live="polite">{busy ? 'Preparing your JSON…' : msg || (multi ? 'Download each run above to keep every pass.' : 'Download to inspect the JSON or load it in ComfyUI.')}</p></footer>}
    </div></div>, document.body);
}
