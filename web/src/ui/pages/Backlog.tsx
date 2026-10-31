import { toolPage } from '../../../../server/src/shared/pages';
import { comfyNote } from '../../shared/comfyVersion';
import { ledgerUsd } from '../../shared/billing';
import { openWeightsOf } from '../../shared/OpenWeights';
/** PB backlog, Oct 17 05:06: share page, self-host health, API endpoints, handoff, publish,
 *  usage chart, profile, route-prompt suggestion, model page. Our tokens; licence details stay on /licenses. */
import { useEffect, useMemo, useState } from 'react';
import { Link, navigate } from '../../platform/router';
import { useToast } from '../../shared/Toast';
import { AttributionLine } from '../../shared/Attribution';
import { useProfile, UserAvatar } from '../../shared/profile';

const j = (u: string, o?: RequestInit) => fetch(u, o).then(async r => { const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b.error ?? `HTTP ${r.status}`); return b; });
const post = (u: string, body?: any, method = 'POST') => j(u, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
/** /share/:token: public view of a shared result. */
export function SharePage({ token }: { token: string }) {
  const [d, setD] = useState<any>(null); const [err, setErr] = useState('');
  useEffect(() => { j(`/api/share/${encodeURIComponent(token)}`).then(setD).catch(e => setErr(e.message)); }, [token]);
  const url = d?.resultUrl ?? d?.job?.resultUrl ?? d?.url;
  return <div className="page bl-share" data-testid="share-page">
    {err && <p className="helper warn">{err}</p>}
    {d && <><ShareByline />
      <div className="bl-share-media">{url ? (/\.(png|jpe?g|webp)$/i.test(url) ? <img src={url} alt="" /> : <video src={url} controls playsInline />) : <div className="canvas-empty"><h3>No media</h3></div>}</div>
      <div className="row bl-share-bar"><span className="helper">{d.model ?? d.job?.model ?? ''}</span>{(d.attribution ?? d.job?.attribution)?.text && <AttributionLine a={d.attribution ?? d.job?.attribution} />}</div></>}
  </div>;
}


/** Who shared it: your picture and name (one person per install). */
function ShareByline() {
  const p = useProfile(); if (!p) return null;
  return <div className="bl-share-by" data-testid="share-byline"><UserAvatar profile={p} size={32} /><span><b>{p.displayName || (p.handle ? `@${p.handle}` : 'A local creator')}</b>{p.displayName && p.handle && <small className="helper"> @{p.handle}</small>}</span></div>;
}

/** API endpoint list (GET /api/openapi/endpoints) with tag filter + search. */
export function ApiEndpoints() {
  const [d, setD] = useState<any>(null); const [tag, setTag] = useState('All'); const [q, setQ] = useState('');
  useEffect(() => { j('/api/openapi/endpoints').then(setD).catch(() => setD({ items: [], tags: [] })); }, []);
  const items = useMemo(() => (d?.items ?? []).filter((x: any) => (tag === 'All' || x.tag === tag) && (!q || `${x.method} ${x.path} ${x.summary}`.toLowerCase().includes(q.toLowerCase()))), [d, tag, q]);
  /* Grouped by the spec's own tags (server order), each row with a Copy that gives a ready-to-run curl line. */
  const groups = useMemo(() => { const order: string[] = [...(d?.tags ?? [])]; const m = new Map<string, any[]>(); for (const x of items) { const t = String(x.tag ?? 'Other'); if (!m.has(t)) m.set(t, []); m.get(t)!.push(x); if (!order.includes(t)) order.push(t); } return order.filter(t => m.has(t)).map(t => [t, m.get(t)!] as const); }, [items, d]);
  return <section className={`bl-api${d ? '' : ' bl-api-hold'}`} data-testid="api-endpoints" aria-busy={!d}><div className="row bl-api-bar"><h2>Endpoints <span className="helper">{d?.total ?? ''}</span></h2><input type="search" placeholder="Search endpoints" aria-label="Search endpoints" value={q} onChange={e => setQ(e.target.value)} />{d?.specUrl && <a className="btn btn-sm" href={d.specUrl} target="_blank" rel="noreferrer">OpenAPI JSON ↗</a>}</div>
    <div className="pills">{['All', ...(d?.tags ?? [])].map((t: string) => <button key={t} className={`pill ${tag === t ? 'on' : ''}`} onClick={() => setTag(t)}>{t}</button>)}</div>
    {d && !items.length && <p className="helper">No endpoints match.</p>}
    <table className="usage-table api-table api-grouped">{groups.map(([t, xs]) => <tbody key={t} data-testid={`api-group-${t}`}><tr className="api-grp"><th colSpan={4}>{t} <span className="helper">{xs.length}</span></th></tr>
      {xs.map((x: any) => <tr key={x.method + x.path}><td><span className={`meth meth-${String(x.method).toLowerCase()}`}>{x.method}</span></td><td><code>{x.path}</code></td><td className="helper">{x.summary}</td><td className="api-cp"><CopyLine text={curlFor(x.method, x.path)} label={`Copy curl for ${x.method} ${x.path}`} /></td></tr>)}</tbody>)}</table></section>;
}
const curlFor = (m: string, path: string) => { const meth = String(m).toUpperCase(); const u = `${location.origin}${path}`; return meth === 'GET' ? `curl -s '${u}'` : `curl -s -X ${meth} '${u}'`; };
/** Small Copy button for one line (endpoint rows, MCP tool names). */
export function CopyLine({ text, label, idle = 'Copy' }: { text: string; label: string; idle?: string }) {
  const [done, setDone] = useState<'' | 'ok' | 'err'>('');
  const copy = () => navigator.clipboard?.writeText(text).then(() => setDone('ok'), () => setDone('err')).finally(() => setTimeout(() => setDone(''), 1400));
  return <button type="button" className={`btn btn-sm cp-line ${done}`} data-testid="copy-line" aria-label={label} title={text} onClick={copy}>{done === 'ok' ? 'Copied' : done === 'err' ? 'Couldn’t copy' : idle}</button>;
}

/** Handoff "Send to" via GET /api/jobs/:id/handoff (+ ?to=&as=ref). */
export function HandoffMenu({ jobId }: { jobId: string }) {
  const [t, setT] = useState<any[] | null>(null); const toast = useToast();
  useEffect(() => { j(`/api/jobs/${encodeURIComponent(jobId)}/handoff`).then(d => setT(d.targets ?? [])).catch(() => setT([])); }, [jobId]);
  if (!t?.length) return null;
  const go = async (to: string, as?: string) => { try { const r = await j(`/api/jobs/${encodeURIComponent(jobId)}/handoff?to=${encodeURIComponent(to)}${as ? `&as=${as}` : ''}`); navigate(r.route ?? toolPage(to)); } catch (e) { toast((e as Error).message, 'error'); } };
  return <label className="send-to-wrap" data-testid="handoff"><span aria-hidden>↗</span><select className="send-to" aria-label="Send to" value="" onChange={e => { const [to, as] = e.target.value.split('|'); if (to) go(to, as || undefined); }}>
    <option value="">Send to…</option>{t.map((x: any) => <option key={x.toolId + (x.as ?? '')} value={`${x.toolId}|${x.as ?? ''}`}>{x.name ?? x.toolId}{x.as === 'ref' ? ' (as reference)' : ''}</option>)}</select></label>;
}

/** Publish to Community with a showPrompt toggle. */
export function PublishControl({ job }: { job: any }) {
  const [pub, setPub] = useState<boolean>(!!job?.published); const [sp, setSp] = useState<boolean>(job?.publishShowPrompt ?? false); const toast = useToast();
  if (job?.status !== 'done') return null;
  const set = async (on: boolean) => { try { await post(`/api/jobs/${encodeURIComponent(job.id)}/publish`, on ? { showPrompt: sp } : undefined, on ? 'POST' : 'DELETE'); setPub(on); toast(on ? 'Published to Community' : 'Unpublished'); } catch (e) { toast((e as Error).message, 'error'); } };
  return <span className="bl-publish" data-testid="publish"><button type="button" className={`btn ${pub ? '' : 'btn-light'}`} onClick={() => set(!pub)}>{pub ? 'Unpublish' : 'Publish'}</button>
    <label className="helper row"><input type="checkbox" checked={sp} onChange={e => setSp(e.target.checked)} disabled={pub} /> Show prompt</label></span>;
}

/** Usage chart (GET /api/usage/series). Plain SVG bars: charged vs refunded. */
export function UsageChart() {
  const [bucket, setBucket] = useState<'day' | 'hour'>('day'); const [d, setD] = useState<any[]>([]); const [loaded, setLoaded] = useState(false);
  /* Server buckets in the viewer's zone (GET /api/usage/series?tz=<IANA>); date keys are already local, so no client regrouping. */
  const [zone, setZone] = useState('');
  useEffect(() => { const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; j(`/api/usage/series?bucket=${bucket}&days=${bucket === 'day' ? 30 : 2}&tz=${encodeURIComponent(tz)}`).then(r => { setZone(r.timezone ?? tz);
    const items: any[] = r.items ?? []; setLoaded(true); setD(bucket === 'hour' ? items.slice(-48).map(x => ({ ...x, date: String(x.date).replace('T', ' ') + ':00', label: `${String(x.date).slice(11, 13)}h` })) : items.slice(-30).map(x => ({ ...x, label: String(x.date).slice(5) })));
  }).catch(() => { setLoaded(true); setD([]); }); }, [bucket]);
  const max = Math.max(1, ...d.map(x => x.charged ?? 0)); const W = 640, H = 160, bw = d.length ? W / d.length : W;
  return <section className="bl-usage" data-testid="usage-chart"><div className="row"><h2>Spend over time <small className="helper" data-testid="usage-tz">· {zone || 'your local time'}</small></h2><div className="pills">{(['day', 'hour'] as const).map(b => <button key={b} className={`pill ${bucket === b ? 'on' : ''}`} onClick={() => setBucket(b)}>{b === 'day' ? 'Daily' : 'Hourly'}</button>)}</div></div>
    {d.length ? <svg viewBox={`0 0 ${W} ${H + 18}`} className="bl-chart" role="img" aria-label="Charged, and refunds back to your balance">{d.map((x, i) => { const c = (x.charged ?? 0) / max * H, r = (x.refunded ?? 0) / max * H; return <g key={i}><rect x={i * bw + 2} y={H - c} width={Math.max(2, bw - 4)} height={c} className="bl-bar-c"><title>{`${x.date ?? x.hour}: ${ledgerUsd(x.charged ?? 0)} charged, ${ledgerUsd(x.refunded ?? 0)} back to your balance`}</title></rect><rect x={i * bw + 2} y={H - r} width={Math.max(2, bw - 4)} height={r} className="bl-bar-r" />{(d.length <= 16) && <text x={i * bw + bw / 2} y={H + 14} textAnchor="middle" className="bl-ax">{x.label ?? String(x.date ?? x.hour).slice(5, 10)}</text>}</g>; })}</svg> : !loaded ? <div className="bl-chart bl-chart-ph" aria-busy="true" aria-label="Loading the chart" style={{ aspectRatio: `${W} / ${H + 18}` }} /> : <p className="helper">No usage yet.</p>}
    <p className="helper"><span className="bl-key c" /> charged <span className="bl-key r" /> refunds back to your balance</p></section>;
}

/** Route-prompt suggestion chip for the home prompt (POST /api/route-prompt, debounced). */
export function RouteSuggest({ prompt }: { prompt: string }) {
  const [s, setS] = useState<any>(null);
  useEffect(() => { if (prompt.trim().length < 6) { setS(null); return; } let live = true; const t = setTimeout(() => post('/api/route-prompt', { prompt }).then(d => live && setS(d)).catch(() => live && setS(null)), 400); return () => { live = false; clearTimeout(t); }; }, [prompt]);
  if (!s?.route) return null;
  return <div className="bl-suggest" data-testid="route-suggest"><span className="helper">Best tool:</span><button type="button" className="chip" onClick={() => navigate(s.route)}>{s.name} →</button>{(s.alternatives ?? []).slice(0, 2).map((a: any) => <button key={a.toolId} type="button" className="chip" onClick={() => navigate(a.route)}>{a.name}</button>)}</div>;
}

/** /models/:id: model detail. Short credit line only; licence details link to /licenses. */
export function ModelPage({ id }: { id: string }) {
  const [m, setM] = useState<any>(null); const [err, setErr] = useState('');
  useEffect(() => { j(`/api/models/${encodeURIComponent(id)}`).then(setM).catch(e => setErr(e.message)); }, [id]);
  if (err) return <div className="page"><h1>Model not found</h1><p className="helper">{err}</p></div>;
  if (!m) return <div className="page"><p className="helper">Loading…</p></div>;
  return <div className="page bl-model" data-testid="model-page"><span className="eyebrow">{openWeightsOf(m.kind === 'hosted' ? 'hosted' : 'open-weights', m) ? 'Open weights' : 'Hosted API'}</span><h1>{m.name}</h1>
    {m.description && <p className="lede">{m.description}</p>}
    {m.license?.attribution && <p className="rv-credit">{m.license.attribution}</p>}
    {/* The ComfyUI requirement: the server's requirementNote (model detail), else built from minComfyVersion. */}
    {(m.license?.name || m.licenseName || m.requirementNote || m.minComfyVersion) && <p className="helper bl-model-facts" data-testid="model-facts">{[(m.license?.name ?? m.licenseName) ? `Licence: ${m.license?.name ?? m.licenseName}` : '', m.requirementNote ? String(m.requirementNote) : m.minComfyVersion ? comfyNote(m.minComfyVersion, m.description) : ''].filter(Boolean).join(' · ')}</p>}
    {m.tech && <details className="tech-details bl-model-tech" data-testid="model-tech"><summary>Technical details</summary><p className="helper">{String(m.tech)}</p></details>}
    <h2>Used in</h2><div className="row bl-model-tools">{(m.tools ?? []).map((t: any) => <Link key={t.toolId} to={t.route} className="btn">{t.name}</Link>)}</div>
    <p className="helper mt-12"><Link to="/licenses">Licence details →</Link></p></div>;
}

/** Community: results you published (GET /api/community?source=published). Prompt shown only when the owner allowed it. */
export function PublishedStrip() {
  const [items, setItems] = useState<any[] | null>(null);
  useEffect(() => { j('/api/community?source=published').then(d => setItems(d.items ?? [])).catch(() => setItems([])); }, []);
  if (!items) return null;
  return <section className="bl-pub" data-testid="community-published"><h2>Published <span className="helper">{items.length}</span></h2>
    {!items.length ? <p className="helper">Nothing published yet. Open a finished result and press Publish.</p>
      : <div className="sw-grid bl-pub-grid">{items.map(it => <Link key={it.id} to={it.route ?? `/jobs/${it.jobId ?? it.id}`} className="sw-tile"><span className="sw-poster" style={it.posterUrl ? { backgroundImage: `url(${it.posterUrl})` } : undefined} /><span className="sw-tile-t"><b>{it.title ?? it.toolName}</b>{it.prompt && <small>{it.prompt}</small>}</span></Link>)}</div>}
  </section>;
}
