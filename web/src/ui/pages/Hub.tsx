import { Notice } from '../../shared/Notice';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { hueOf } from '../MediaArt';
import { exampleAt } from '../examples';

/** /community: Community hub on GET/POST/DELETE /api/hub/*. Visuals only; data from Platform's hub API. */
type Flags = { commercialUse?: boolean; sellImages?: boolean; creditRequired?: boolean; label?: string };
type Item = { id: string; type: string; name: string; description?: string; creator?: { username: string }; tags?: string[]; useCases?: string[]; baseModel?: string; stats?: { downloadCount?: number; favoriteCount?: number; rating?: number }; publishedAt?: string; posterUrl?: string | null; installed?: boolean | string[]; sample?: boolean; flags?: Flags; installAs?: string[] };
type Resp = { items: Item[]; total: number; sample?: boolean; sorts: string[]; useCases: { id: string; label: string }[]; types: string[] };
const n = (x?: number) => x == null ? '-' : x >= 1000 ? (x / 1000).toFixed(x >= 10000 ? 0 : 1) + 'k' : String(x);
const SORT: Record<string, string> = { popular: 'Most popular', trending: 'Trending', new: 'Newest', rated: 'Top rated' };
const RATIOS = ['3/4', '1/1', '4/5', '2/3'];

/** Round 1 (C1): sample catalogue items are examples, not real hub items: no creator, no counts, Install off with the reason. */
const SAMPLE_WHY = 'Sample catalogue: these are examples, not real hub items, so they can’t be installed. Connect a hub source to install real ones.';
function CardInstall({ it }: { it: Item }) {
  if (it.sample) return <span className="hub-card-install-wrap" title={SAMPLE_WHY}><button type="button" className="btn btn-sm hub-card-install is-sample" data-action="hub-install" disabled aria-describedby="hub-sample-note">Install</button></span>;
  const [st, setSt] = useState<'idle' | 'busy' | 'done' | 'err'>((it as any).installed ? 'done' : 'idle'); const as = ((it as any).installAs?.[0]) ?? (it.type === 'workflow' ? 'workflow' : 'lora');
  const go = async () => { if (st === 'done') return; setSt('busy'); try { const r = await fetch('/api/hub/install', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: it.id, as }) }); setSt(r.ok ? 'done' : 'err'); } catch { setSt('err'); } };
  return <button type="button" className={`btn btn-sm hub-card-install ${st === 'done' ? 'is-done' : 'btn-primary'}`} data-action="hub-install" disabled={st === 'busy'} onClick={go} title={st === 'err' ? 'Install failed. Open the card for details.' : `Install as ${as}`}>{st === 'busy' ? 'Installing…' : st === 'done' ? '✓ Installed' : st === 'err' ? 'Retry install' : 'Install'}</button>;
}
function Chips(_: { f?: Flags }) { return null; }
function Poster({ it, i }: { it: Item; i: number }) {
  return <div className="hub-poster" style={{ aspectRatio: RATIOS[i % 4], ['--h' as any]: hueOf(it.id) }}>
    <img src={it.posterUrl || exampleAt(i, null, 4).poster} alt="" loading="lazy" onError={e => { const im = e.currentTarget; const fb = exampleAt(i, null, 4).poster; if (!im.src.endsWith(fb)) im.src = fb; }} />
    {it.sample && <span className="hub-sample">Sample</span>}
    {!it.sample && <span className="hub-type">{it.type === 'lora' ? 'LoRA' : 'Workflow'}</span>}
  </div>;
}

function Drawer({ id, onClose, onChange }: { id: string; onClose: () => void; onChange: () => void }) {
  const [it, setIt] = useState<Item | null>(null); const [err, setErr] = useState(''); const [as, setAs] = useState(''); const [busy, setBusy] = useState(false); const [restart, setRestart] = useState(false);
  const load = () => fetch(`/api/hub/items/${encodeURIComponent(id)}`).then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))).then((j: Item) => { setIt(j); setAs(a => a || j.installAs?.[0] || 'lora'); }).catch(e => setErr(e.message));
  useEffect(() => { load(); const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [id]);
  const installedAs = (it?.installed && Array.isArray(it.installed)) ? it.installed : it?.installed ? [as] : [];
  const isIn = installedAs.includes(as);
  async function act() {
    setBusy(true); setErr('');
    try {
      const r = isIn ? await fetch(`/api/hub/installed/${encodeURIComponent(`${id}:${as}`)}`, { method: 'DELETE' })
        : await fetch('/api/hub/install', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, as }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? j.message ?? `HTTP ${r.status}`);
      if (j.requiresRestart) setRestart(true);
      await load(); onChange();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return createPortal(<div className="hub-scrim" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <aside className="hub-drawer" role="dialog" aria-label={it?.name ?? 'Item'}>
      <button className="hub-x" onClick={onClose} aria-label="Close">×</button>
      {!it && !err && <div className="shimmer xshim" />}
      {err && !it && <p className="inline-err">Couldn’t load ({err}).</p>}
      {it && <>
        <Poster it={it} i={1} />
        <h2 className="hub-dname">{it.name}</h2>
        <p className="helper">{it.sample ? `Sample catalogue item${it.baseModel ? ` · ${it.baseModel}` : ''}` : `@${it.creator?.username} · ${it.baseModel} · ${it.publishedAt?.slice(0, 10)}`}</p>
        <p>{it.description}</p>
        {!it.sample && <p className="hub-stats">↓ {n(it.stats?.downloadCount)} · ♥ {n(it.stats?.favoriteCount)} · ★ {it.stats?.rating?.toFixed(2) ?? '-'}</p>}
        <Chips f={it.flags} />
        {!!it.tags?.length && <div className="hub-tags">{it.tags.map(t => <span key={t} className="hub-tag">#{t}</span>)}</div>}
        <div className="hub-install">
          <label className="helper">Install as</label>
          <div className="seg">{(it.installAs ?? ['lora']).map(a => <button key={a} className={as === a ? 'on' : ''} aria-pressed={as === a} onClick={() => setAs(a)}>{a === 'lora' ? 'LoRA' : a[0].toUpperCase() + a.slice(1)}</button>)}</div>
          <button className={`btn ${isIn ? '' : 'btn-primary'} hub-act`} disabled={busy || !!it.sample} onClick={act} title={it.sample ? SAMPLE_WHY : undefined}>{busy ? 'Working…' : isIn ? 'Uninstall' : 'Install'}</button>
        </div>
        {it.sample && <p className="helper hub-sample-why">{SAMPLE_WHY}</p>}
        {err && <p className="inline-err">{err}</p>}
        {restart && <Notice kind="success" title="Installed.">Restart the server to load it (<code>npm run dev</code>).</Notice>}
      </>}
    </aside>
  </div>, document.body);
}

export default function Hub() {
  const [tab, setTab] = useState<'lora' | 'workflow' | 'installed'>('lora');
  const [commOnly, setCommOnly] = useState(false); const [useCase, setUseCase] = useState(''); const [sort, setSort] = useState('popular'); const [q, setQ] = useState(''); const [dq, setDq] = useState('');
  const [d, setD] = useState<Resp | null>(null); const [err, setErr] = useState(''); const [open, setOpen] = useState<string | null>(null); const [tick, setTick] = useState(0);
  useEffect(() => { const t = setTimeout(() => setDq(q), 250); return () => clearTimeout(t); }, [q]);
  useEffect(() => {
    setD(null); setErr('');
    const url = tab === 'installed' ? '/api/hub/installed' : `/api/hub/items?${new URLSearchParams({ type: tab, sort, limit: '40', ...(useCase && { useCase }), ...(dq && { q: dq }) })}`;
    fetch(url).then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))).then(j => setD(prev => ({ sorts: prev?.sorts ?? [], useCases: prev?.useCases ?? [], types: [], total: j.items?.length ?? 0, ...j }))).catch(e => setErr(e.message));
  }, [tab, sort, useCase, dq, tick]);
  const [meta, setMeta] = useState<Pick<Resp, 'sorts' | 'useCases'>>({ sorts: ['popular', 'trending', 'new', 'rated'], useCases: [] });
  useEffect(() => { if (d?.useCases?.length) setMeta({ sorts: d.sorts?.length ? d.sorts : meta.sorts, useCases: d.useCases }); }, [d]);
  const allItems = (d?.items ?? []).map((x: any) => x.item ?? (x.itemId ? { ...x, id: x.itemId, installed: true, installedAs: x.as } : x)) as Item[];
  const items = commOnly ? allItems.filter((x: any) => (x.flags ?? x.licenseFlags ?? x.license)?.commercialUse) : allItems;
  return <div className="hub-tab" data-testid="hub">
    <div className="hub-bar">
      <input className="hub-q" type="search" placeholder="Search LoRAs and workflows" value={q} onChange={e => setQ(e.target.value)} aria-label="Search the hub" />
      <div className="seg hub-tabs" role="tablist">{([['lora', 'LoRA'], ['workflow', 'Workflow'], ['installed', 'Installed']] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab !== 'installed' && <label className="hub-sort-wrap"><span className="helper">Sort</span><select className="hub-sort" value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort">{meta.sorts.map(s => <option key={s} value={s}>{SORT[s] ?? s}</option>)}</select><span className="hub-sort-caret" aria-hidden>▾</span></label>}
      <button type="button" className={`pill hub-comm ${commOnly ? 'on' : ''}`} aria-pressed={commOnly} onClick={() => setCommOnly(c => !c)}>Commercial only</button>
    </div>
    {tab !== 'installed' && <div className="pills hub-uc"><button className={`pill ${!useCase ? 'on' : ''}`} onClick={() => setUseCase('')}>All</button>{meta.useCases.map(u => <button key={u.id} className={`pill ${useCase === u.id ? 'on' : ''}`} onClick={() => setUseCase(u.id)}>{u.label}</button>)}</div>}
    {d?.sample && <div className="hub-notice" role="note" id="hub-sample-note" data-testid="hub-sample-note"><b>Sample catalogue, no hub connected.</b> These cards show how the hub works; they aren’t real models or workflows, so Install is off.</div>}
    {err && <div className="xcard xcard-empty"><b>Couldn’t load the hub</b><p className="helper">{err}</p><button className="btn" onClick={() => setTick(t => t + 1)}>Retry</button></div>}
    {!d && !err && <div className="masonry xmasonry">{Array.from({ length: 8 }, (_, i) => <div key={i} className="masonry-item"><div className="shimmer" style={{ aspectRatio: RATIOS[i % 4] }} /></div>)}</div>}
    {d && !items.length && <div className="xcard xcard-empty"><b>{tab === 'installed' ? 'Nothing installed yet' : 'No matches'}</b><p className="helper">{tab === 'installed' ? 'Open a LoRA or workflow and press Install.' : 'Try another use case or search.'}</p></div>}
    {d && !!items.length && <div className="masonry xmasonry hub-grid">{items.map((it, i) => <div key={it.id + i} className="masonry-item"><button className="hub-card" onClick={() => setOpen(it.id)}>
      <Poster it={it} i={i} />
      <div className="hub-meta"><b>{it.name}</b>{it.installed && <span className="nb nb-new">Installed</span>}</div>
      <div className="hub-sub helper">{it.sample ? <span>Example · {it.type === 'lora' ? 'LoRA' : 'Workflow'}{it.baseModel ? ` · ${it.baseModel}` : ''}</span> : <>@{it.creator?.username}<span>↓ {n(it.stats?.downloadCount)} · ♥ {n(it.stats?.favoriteCount)}{it.stats?.rating ? ` · ★ ${it.stats.rating.toFixed(1)}` : ''}</span></>}</div>
      <Chips f={it.flags} />
    </button><CardInstall it={it} /></div>)}</div>}
    {open && <Drawer id={open} onClose={() => setOpen(null)} onChange={() => setTick(t => t + 1)} />}
  </div>;
}
