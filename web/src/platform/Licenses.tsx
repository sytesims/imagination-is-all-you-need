import { InlineError, useLoad, getJSON } from '../shared/InlineError';
import { Skeleton } from '../shared/Skeleton';
import { useEffect, useMemo, useRef, useState } from 'react';
import { listTools, type ToolInfo } from '../api';
import { makerOfModel, type ToolModel } from '../shared/models';
import { MakerTile } from '../shared/MakerTile';
/** Models & Licences (GET /api/licenses). Minimal on purpose: Design Planner styles it (.licenses-page / .lic-*). */
interface Src { licenseId?: string; url?: string; clause?: string }
interface Row { modelKey?: string; note?: string; providerId: string; model: string; kind: string; runsOn?: string; licenseId?: string; license: string; licenseUrl: string | null; sourceUrl: string | null; commercial: string; tools: string[]; attribution?: string | null; attributionSources?: Src[] }
interface Comp { model: string; license: string; url: string | null; commercial?: string }
/** Parts built into the app itself (not model cards) that carry their own licence: shown under the credit lines. */
const BUILT_IN: [string, string][] = [['audio-player', 'Audio player'], ['canvas', 'Canvas']];
/** Credit line (encouraged) from the API (models[].attribution + attributionSources[].clause/url). */
function Credit({ m }: { m: Row }) {
  if (!m.attribution) return <span className="lic-none" aria-label="No credit line">—</span>;
  const src = (m.attributionSources ?? []).find(x => x.url) ?? m.attributionSources?.[0];
  return <span className="lic-credit"><q>{m.attribution}</q>{src?.url && <> <a href={src.url} target="_blank" rel="noreferrer" title={src.clause ?? ''}>clause</a></>}</span>;
}
export default function Licenses() {
  const { data: d, error: err, retry } = useLoad<{ note: string; models: Row[]; attributions?: string[]; components?: Record<string, Comp[]> }>(sig => getJSON('/api/licenses', sig), []);
  /* BH10 P1-1: loading/error use the loaded page's container and heading, and hold the page height, so nothing (footer included) jumps when the table lands. */
  if (err && !d) return <div className="licenses-page lic-hold" data-testid="licenses"><span className="eyebrow">Licences</span><h1 className="pg-h1">Models &amp; Licences</h1><InlineError what="licences" error={err} onRetry={retry} /></div>;
  if (!d) return <div className="licenses-page lic-hold" data-testid="licenses" aria-busy="true"><span className="eyebrow">Licences</span><h1 className="pg-h1">Models &amp; Licences</h1><p className="helper lic-note-ph" aria-hidden>&nbsp;</p><Skeleton variant="rows" count={12} label="Loading licences" /></div>;
  return <ByModel d={d} />;
}

/** Model vs Run-on (spec §2.6): one row per MODEL (a licence is a model fact), from the tools' models[] joined with the licence report's rows for
 *  the model's engines (commercial use, credit line, source). The generic "Open weights (ComfyUI workflow)" engine row becomes the real models.
 *  An open model that also runs on a hosted place says "Provider terms apply on fal / Comfy Cloud". Engine rows no tool lists stay as they are. */
function ByModel({ d }: { d: { note: string; models: Row[]; attributions?: string[]; components?: Record<string, Comp[]> } }) {
  const [tools, setTools] = useState<ToolInfo[] | null>(null);
  useEffect(() => { listTools().then(setTools).catch(() => setTools([])); }, []);
  const rows = useMemo(() => { if (!tools) return null; const by = new Map<string, Row>(); const used = new Set<string>();
    for (const t of tools) for (const m of (t.models ?? []) as ToolModel[]) {
      const own = d.models.filter(r => m.engines.includes(r.providerId)); own.forEach(r => used.add(`${r.providerId}|${r.license}|${r.licenseUrl}`));
      const pick = own.find(r => (r.kind === 'open-weights') === m.openWeights && r.licenseId === m.license?.id) ?? own.find(r => (r.kind === 'open-weights') === m.openWeights) ?? own[0];
      const hosted = m.openWeights ? [...new Set(m.runsOn.filter(r => r.id !== 'local' && r.status !== 'coming-soon').map(r => r.label))] : [];
      const prev = by.get(m.key); if (prev) { if (!prev.tools.includes(t.id)) prev.tools.push(t.id); continue; }
      by.set(m.key, { modelKey: m.key, providerId: pick?.providerId ?? m.primaryEngine, model: m.displayName || m.name, kind: m.openWeights ? 'open-weights' : pick?.kind === 'hosted-direct' ? 'hosted-direct' : 'hosted',
        runsOn: `Runs on ${m.runsOn.filter(r => r.status !== 'coming-soon').map(r => r.label).join(', ') || 'nothing here yet'}`, licenseId: m.license?.id ?? pick?.licenseId, license: m.license?.name ?? pick?.license ?? 'Not listed',
        licenseUrl: m.license?.url ?? pick?.licenseUrl ?? null, sourceUrl: pick?.sourceUrl ?? null, commercial: pick?.commercial ?? (m.openWeights ? 'restricted' : 'provider-terms'), tools: [t.id],
        attribution: pick?.attribution ?? null, attributionSources: pick?.attributionSources ?? [], note: hosted.length ? `Provider terms apply on ${hosted.join(' / ')}` : undefined }); }
    const rest = d.models.filter(r => !used.has(`${r.providerId}|${r.license}|${r.licenseUrl}`) && !/^open weights\b/i.test(r.model));
    return [...by.values(), ...rest]; }, [tools, d]);
  if (!rows) return <div className="licenses-page lic-hold" data-testid="licenses" aria-busy="true"><span className="eyebrow">Licences</span><h1 className="pg-h1">Models &amp; Licences</h1><p className="helper lic-note-ph" aria-hidden>&nbsp;</p><Skeleton variant="rows" count={12} label="Loading licences" /></div>;
  return <LicTable d={{ ...d, models: rows }} />;
}

/* B19 (P17): plain labels for the API's kind / commercial values. */
const KIND: Record<string, string> = { 'open-weights': 'Open weights', hosted: 'Hosted', 'hosted-direct': 'Hosted (direct API)' };
const USE: [string, string][] = [['yes', 'Yes'], ['restricted', 'Restricted'], ['no', 'No'], ['provider-terms', 'Provider terms']];
const kindGroup = (k: string) => k === 'open-weights' ? 'open' : 'hosted';
const qs = () => new URLSearchParams(location.search);
/** B19 (P17): the table with search + kind / commercial-use filters (kept in the URL), tool names instead of ids, and #licenseId deep links. */
function LicTable({ d }: { d: { note: string; models: Row[]; attributions?: string[]; components?: Record<string, Comp[]> } }) {
  /* B20: a fresh load with #licenseId ignores ?q/kind/use so the linked row is visible (the URL effect then drops them) */
  const hashed = () => location.hash.length > 1;
  const [openRows, setOpenRows] = useState<Set<string>>(() => new Set()); const [q, setQ] = useState(() => hashed() ? '' : qs().get('q') ?? ''); const [kind, setKind] = useState(() => hashed() ? '' : qs().get('kind') ?? ''); const [use, setUse] = useState(() => hashed() ? '' : qs().get('use') ?? '');
  const [names, setNames] = useState<Record<string, string>>({}); const [hit, setHit] = useState(() => decodeURIComponent(location.hash.slice(1)));
  useEffect(() => { listTools().then(ts => setNames(Object.fromEntries(ts.map(t => [t.id, t.name])))).catch(() => 0); }, []);
  useEffect(() => { const u = new URL(location.href); for (const [k, v] of [['q', q.trim()], ['kind', kind], ['use', use]] as const) { if (v) u.searchParams.set(k, v); else u.searchParams.delete(k); } history.replaceState(history.state, '', u.toString()); }, [q, kind, use]);
  const tableRef = useRef<HTMLTableElement>(null);
  /* a credit-line link (/licenses#<licenseId>) lands on its row: filters cleared so it is visible, row scrolled to and highlighted */
  useEffect(() => { const f = () => { const h = decodeURIComponent(location.hash.slice(1)); setHit(h); if (h) { setQ(''); setKind(''); setUse(''); } }; window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  useEffect(() => { if (!hit) return; const t = setTimeout(() => { const el = tableRef.current?.querySelector(`[data-lic="${CSS.escape(hit)}"]`); el?.scrollIntoView({ block: 'center' }); }, 60); return () => clearTimeout(t); }, [hit, names]);
  const toolNames = (m: Row) => m.tools.map(t => names[t] ?? t);
  const needle = q.trim().toLowerCase();
  const byText = (m: Row) => !needle || [m.model, m.license, KIND[m.kind] ?? m.kind, m.runsOn ?? '', m.attribution ?? '', ...toolNames(m)].join(' ').toLowerCase().includes(needle);
  const base = d.models.filter(byText);
  const rows = base.filter(m => (!kind || kindGroup(m.kind) === kind) && (!use || m.commercial === use));
  const countK = (k: string) => base.filter(m => (!k || kindGroup(m.kind) === k) && (!use || m.commercial === use)).length;
  const countU = (u: string) => base.filter(m => (!kind || kindGroup(m.kind) === kind) && (!u || m.commercial === u)).length;
  const filtered = !!(needle || kind || use); const clear = () => { setQ(''); setKind(''); setUse(''); };
  const lines = useMemo(() => d.attributions?.length ? d.attributions : [...new Set(d.models.map(m => m.attribution).filter(Boolean) as string[])], [d]);
  const Chip = ({ on, n, onClick, children }: { on: boolean; n: number; onClick: () => void; children: string }) => <button type="button" className={`lic-chip${on ? ' on' : ''}`} aria-pressed={on} onClick={onClick} disabled={!on && n === 0}>{children}<small>{n}</small></button>;
  return (
    <div className="licenses-page" data-testid="licenses">
      <span className="eyebrow">Licences</span><h1 className="pg-h1">Models &amp; Licences</h1>
      <p className="helper">{d.note.replace(/provider-terms/g, 'provider terms')}</p>
      {lines.length > 0 && <section className="lic-credits" data-testid="lic-credits"><h3>Credit lines</h3><p className="helper">We encourage crediting these models wherever their outputs appear.</p><ul>{lines.map(l => <li key={l}><q>{l}</q> <span className="helper">· {d.models.filter(m => m.attribution === l).map(m => m.model).join(', ')}</span></li>)}</ul></section>}
      {BUILT_IN.some(([k]) => d.components?.[k]?.length) && <section className="lic-credits" data-testid="lic-builtin"><h3>Built into the app</h3><p className="helper">Parts of the app itself with their own licence.</p><ul>{BUILT_IN.flatMap(([k, name]) => (d.components?.[k] ?? []).map(c => <li key={k + c.model}><b>{name}:</b> {c.model} · {c.url ? <a href={c.url} target="_blank" rel="noreferrer">{c.license}</a> : c.license}</li>))}</ul></section>}
      <div className="lic-filters" data-testid="lic-filters">
        <input type="search" className="lic-search" data-testid="lic-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search models, licences or tools" aria-label="Search models, licences or tools" />
        <div className="lic-chips" role="group" aria-label="Kind"><span className="lic-chips-k">Kind</span>
          <Chip on={!kind} n={countK('')} onClick={() => setKind('')}>All</Chip><Chip on={kind === 'open'} n={countK('open')} onClick={() => setKind(kind === 'open' ? '' : 'open')}>Open weights</Chip><Chip on={kind === 'hosted'} n={countK('hosted')} onClick={() => setKind(kind === 'hosted' ? '' : 'hosted')}>Hosted</Chip></div>
        <div className="lic-chips" role="group" aria-label="Commercial use"><span className="lic-chips-k">Commercial use</span>
          <Chip on={!use} n={countU('')} onClick={() => setUse('')}>All</Chip>{USE.map(([v, l]) => <Chip key={v} on={use === v} n={countU(v)} onClick={() => setUse(use === v ? '' : v)}>{l}</Chip>)}</div>
        <p className="helper lic-count" data-testid="lic-count" aria-live="polite">{filtered ? `${rows.length} of ${d.models.length} models` : `${d.models.length} models`}{filtered && <> · <button type="button" className="lic-clear" onClick={clear}>Clear filters</button></>}</p>
      </div>
      {rows.length === 0 ? <div className="lic-empty" data-testid="lic-empty"><b>No models match.</b><p className="helper">Try another word, or <button type="button" className="lic-clear" onClick={clear}>clear the filters</button>.</p></div>
      : <table className="lic-table" ref={tableRef}><thead><tr><th>Model</th><th>Kind</th><th>Licence</th><th>Commercial</th><th>Credit line</th><th>Source</th><th>Used by</th></tr></thead>
        <tbody>{rows.map(m => { const rk = m.modelKey ?? `${m.providerId}|${m.license}|${m.licenseUrl}`; const isOpen = openRows.has(rk) || (!!hit && m.licenseId === hit); return <tr key={rk} data-lic={m.licenseId || undefined} className={`lic-row lic-${m.commercial}${hit && m.licenseId === hit ? ' lic-hit' : ''}${isOpen ? ' lic-open' : ''}`}>
          <td data-label="Model"><span className="lic-mk"><MakerTile className="mk-sm" maker={makerOfModel(m.modelKey)?.maker} makerName={makerOfModel(m.modelKey)?.makerName} fallback={m.model} /></span><b className="lic-model">{m.model}</b>{/* BH12: on phones each row starts collapsed to name, licence and use */}<button type="button" className="lic-more" aria-expanded={isOpen} aria-label={`${isOpen ? 'Hide' : 'Show'} details for ${m.model}`} onClick={() => setOpenRows(o => { const x = new Set(o); if (x.has(rk)) x.delete(rk); else x.add(rk); return x; })}>{isOpen ? 'Less' : 'Details'}</button></td><td data-label="Kind"><span>{KIND[m.kind] ?? m.kind}{m.runsOn && <small className="lic-runs">{m.runsOn}</small>}{m.note && <small className="lic-runs lic-terms">{m.note}</small>}</span></td><td data-label="Licence">{m.licenseUrl ? <a href={m.licenseUrl} target="_blank" rel="noreferrer">{m.license}</a> : m.license}</td>
          <td data-label="Commercial" className="lic-commercial">{USE.find(([v]) => v === m.commercial)?.[1] ?? m.commercial}</td><td data-label="Credit line" data-testid="lic-credit"><Credit m={m} /></td><td data-label="Source">{m.sourceUrl ? <a href={m.sourceUrl} target="_blank" rel="noreferrer">Source</a> : '—'}</td><td data-label="Used by" className="lic-tools">{toolNames(m).join(', ') || '—'}</td></tr>; })}</tbody></table>}
    </div>
  );
}
