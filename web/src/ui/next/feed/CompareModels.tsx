/** Compare models: pick 2–4 models, see each one's price and what it adapts, one Generate runs the SAME prompt + settings on each
 *  (POST /api/compare/quote first: quote = charge, spending caps and the agent budget checked for the whole set). Results land in the
 *  feed as one labelled group (CompareGroupHead) with a side-by-side view (CompareView). */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { JobState, ProviderInfo } from '../../../api';
import { Popover } from '../../../shared/Popover';
import { tip } from '../../../shared/Tooltip';
import { useToast } from '../../../shared/Toast';
import { MakerTile } from '../../../shared/MakerTile';
import { modelOfEngine, shownName } from '../../../shared/models';
import { forgetQuote, requestRequote } from '../../../shared/quote';
import { useOwnAccounts, runPrice, fmtUsd, ledgerUsd } from '../../../shared/billing';
import { jobCaption } from '../../../shared/FeedCaption';
import { isSubmitting } from '../../../shared/submitGuard';
import { gridSrc } from '../../../shared/thumbs';
import { CloseIcon, CompareIcon } from '../../Icons';
import { MentionText } from '../../../shared/MentionChips';
import { COMPARE_MAX, COMPARE_MIN, type CompareWant, type CompareParams, type CompareChange } from '../../../../../server/src/shared/compareAdapt';
import { LOCAL_LABEL, LOCAL_FREE } from '../../../../../server/src/shared/modelIds';

export interface CompareRow { model: string; name: string; ok: boolean; excluded: { code: string; reason: string } | null; unpriced: boolean; params: CompareParams | null; changes: CompareChange[];
  credits: number | null; estUsd: number; billedTo: string | null; runOn: string | null; routeId: string | null; local: boolean; demo: boolean }
export interface CompareQuote { rows: CompareRow[]; included: string[]; order: string[]; total: { credits: number; estUsd: number; byBilledTo: Record<string, number>; models: number; localRuns: number }; runnable: boolean; block: { code: string; message: string } | null }
export async function compareQuote(models: string[], want: CompareWant, preview = false): Promise<CompareQuote> {
  const r = await fetch('/api/compare/quote', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ models, ...want, ...(preview ? { preview: true } : {}) }) });
  const j = await r.json().catch(() => null); if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`); return j;
}
/** A compared run's price in the Generate button's words (Sample / Free · this computer / ≈ $0.08; team mode $0.08). */
export const rowPriceText = (r: Pick<CompareRow, 'demo' | 'local' | 'credits' | 'runOn'>, own: boolean | null): string => r.demo ? 'Sample · free' : r.local ? (own === false ? 'Free' : LOCAL_FREE) : runPrice({ own, credits: r.credits, runOn: r.runOn }) ?? 'Price unavailable';
/** The total: sum of the quotes (what the runs charge). */
export function totalText(q: CompareQuote | null, own: boolean | null): string {
  if (!q || !q.included.length) return ''; const inc = q.rows.filter(r => r.ok); const paid = inc.filter(r => !r.demo && !r.local);
  if (!paid.length) return inc.every(r => r.demo) ? 'Sample · free' : inc.some(r => r.demo) ? `Free (samples + ${LOCAL_LABEL})` : own === false ? 'Free' : LOCAL_FREE;
  const money = own === false ? ledgerUsd(paid.reduce((s, r) => s + (r.credits ?? 0), 0)) : `≈ ${fmtUsd(q.total.estUsd)}`;
  const free = inc.length - paid.length; return free ? `${money} · ${free} free` : money;
}
const waitIdle = async (toolId: string) => { for (let i = 0; i < 100 && isSubmitting(toolId); i++) await new Promise(r => setTimeout(r, 60)); };
const newGroup = () => `cmp-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export interface CompareModelsProps { open: boolean; onClose: () => void; anchor: React.RefObject<HTMLElement>; toolId: string; providers: ProviderInfo[]; current: string;
  want: CompareWant; /** the bar's other fields (style, rig…), sent with every run */ base: Record<string, string>; prompt: string; ready: boolean; notReady: string;
  run: (extra: Record<string, string>) => Promise<unknown> }
export default function CompareModels(p: CompareModelsProps) {
  const own = useOwnAccounts(); const toast = useToast();
  const [picked, setPicked] = useState<string[]>([]); const [q, setQ] = useState<CompareQuote | null>(null); const [qErr, setQErr] = useState(''); const [busy, setBusy] = useState(false); const [qBusy, setQBusy] = useState(false);
  useEffect(() => { if (p.open && !picked.length && p.current && p.providers.some(x => x.id === p.current)) setPicked([p.current]); }, [p.open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPicked(ps => ps.filter(id => p.providers.some(x => x.id === id))); }, [p.providers.map(x => x.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const models = useMemo(() => p.providers.map(x => ({ x, m: modelOfEngine(p.toolId, x.id) })), [p.providers, p.toolId]);
  /* every row's price at the settings that model would really run (adapted), from the same quote as the run */
  const [list, setList] = useState<Record<string, CompareRow> | null>(null); const allKey = JSON.stringify([p.providers.map(x => x.id), p.want]);
  useEffect(() => { if (!p.open) return; let live = true; compareQuote(p.providers.map(x => x.id).slice(0, 60), p.want, true).then(v => { if (live) setList(Object.fromEntries(v.rows.map(r => [r.model, r]))); }).catch(() => undefined); return () => { live = false; }; }, [p.open, allKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const listText = (r: CompareRow | undefined) => !r ? '' : r.excluded ? r.excluded.reason : r.unpriced ? 'Price unavailable' : rowPriceText(r, own);
  const wantKey = JSON.stringify([picked, p.want]);
  useEffect(() => { if (!p.open || !picked.length) { setQ(null); return; } let live = true; setQBusy(true);
    const t = setTimeout(() => { compareQuote(picked, p.want).then(v => { if (live) { setQ(v); setQErr(''); } }).catch(e => { if (live) { setQ(null); setQErr(String(e?.message ?? 'Couldn’t price this')); } }).finally(() => { if (live) setQBusy(false); }); }, 200);
    return () => { live = false; clearTimeout(t); }; }, [p.open, wantKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (id: string) => setPicked(ps => ps.includes(id) ? ps.filter(x => x !== id) : ps.length >= COMPARE_MAX ? ps : [...ps, id]);
  const nameOf = (id: string) => { const r = models.find(y => y.x.id === id); return (r?.m ? shownName(r.m) : null) ?? r?.x.name ?? id; };
  const why = !p.ready ? p.notReady : picked.length < COMPARE_MIN ? `Pick at least ${COMPARE_MIN} models` : qErr || (q?.block?.message ?? '') || (qBusy || !q ? 'Pricing…' : '');
  const go = async () => {
    if (!q || why || busy) return; setBusy(true); const g = newGroup(); const inc = q.included; let started = 0; const notStarted: string[] = [];
    try {
      for (const id of q.order) { const r = q.rows.find(x => x.model === id)!; const pr = r.params!; await waitIdle(p.toolId); forgetQuote(p.toolId, id);
        const rid = await p.run({ ...p.base, aspect: pr.aspect, quality: pr.quality ?? '', imageResolution: pr.imageResolution ?? '', n: String(pr.n), provider: id,
          compareGroup: g, compareOf: String(inc.length), compareIndex: String(inc.indexOf(id)), ...(r.routeId ? { quotedRouteId: r.routeId, quotedCredits: String(r.credits ?? 0) } : {}) }).catch(() => undefined);
        if (rid) started++; else notStarted.push(nameOf(id)); }
    } finally { setBusy(false); requestRequote(); }
    if (!notStarted.length) { toast(`Comparing ${started} models. Results land together in your feed.`); p.onClose(); }
    else toast(`${started} of ${inc.length} started. ${notStarted.join(', ')} didn’t start, so ${notStarted.length > 1 ? 'they weren’t' : 'it wasn’t'} charged.`, started ? 'warn' : 'error');
  };
  const rowOf = (id: string) => q?.rows.find(r => r.model === id) ?? null;
  return <Popover open={p.open} anchor={p.anchor} onClose={p.onClose} label="Compare models" placement="bottom" align="end" testId="cmp-pop" width={460} closeButton>
    <div className="cmp" data-testid="cmp-dialog">
      <p className="cmp-h">The same prompt and settings on {COMPARE_MIN}–{COMPARE_MAX} models. Each one runs with the settings it supports.</p>
      <p className="cmp-prompt" data-testid="cmp-prompt">{p.prompt.trim() ? <>“{p.prompt.trim().slice(0, 140)}{p.prompt.trim().length > 140 ? '…' : ''}”</> : <span className="cmp-muted">Write a prompt in the bar first.</span>}</p>
      <div className="cmp-list" role="group" aria-label="Models">{models.map(({ x, m }) => { const on = picked.includes(x.id); const full = !on && picked.length >= COMPARE_MAX; const r = rowOf(x.id);
        return <label key={x.id} className={`cmp-row${on ? ' on' : ''}${full ? ' off' : ''}`} data-testid={`cmp-row-${x.id}`} {...tip(full ? `Up to ${COMPARE_MAX} models` : r?.excluded?.reason ?? null)}>
          <input type="checkbox" aria-label={`Compare ${nameOf(x.id)}`} checked={on} disabled={full} onChange={() => toggle(x.id)} data-testid={`cmp-pick-${x.id}`} />
          <MakerTile className="cmp-dot" medium="image" maker={m?.maker} makerName={m?.makerName} fallback={(x as any).family || x.name} />
          <span className="cmp-name">{nameOf(x.id)}{on && <small className="cmp-ord">{picked.indexOf(x.id) + 1}</small>}</span>
          <span className={`cmp-row-p${list?.[x.id]?.excluded || list?.[x.id]?.unpriced ? ' off' : ''}`} data-testid={`cmp-row-price-${x.id}`} title={list?.[x.id]?.changes.map(c => c.message).join(' · ') || undefined}>{listText(list?.[x.id])}</span>
        </label>; })}</div>
      {picked.length > 0 && <div className="cmp-sel" data-testid="cmp-selected">{picked.map(id => { const r = rowOf(id);
        return <div key={id} className={`cmp-s${r?.excluded ? ' ex' : ''}${r?.unpriced ? ' bad' : ''}`} data-testid={`cmp-sel-${id}`}>
          <span className="cmp-s-n">{nameOf(id)}</span>
          <span className="cmp-s-p" data-testid={`cmp-price-${id}`}>{!r ? '…' : r.excluded ? 'Left out' : r.unpriced ? 'Price unavailable' : rowPriceText(r, own)}</span>
          <button type="button" className="cmp-s-x" aria-label={`Remove ${nameOf(id)}`} onClick={() => toggle(id)}><CloseIcon size={11} /></button>
          {r?.excluded && <small className="cmp-s-why" data-testid={`cmp-why-${id}`}>{r.excluded.reason}</small>}
          {r?.unpriced && <small className="cmp-s-why">No verified price at these settings</small>}
          {r && r.changes.length > 0 && <small className="cmp-s-adj" data-testid={`cmp-adj-${id}`}>{r.changes.map(c => c.message).join(' · ')}</small>}
        </div>; })}</div>}
      {q && q.total.localRuns > 1 && <p className="cmp-note">Runs locally go one after another, in the order you picked them.</p>}
      <div className="cmp-foot">
        {why && why !== 'Pricing…' ? <p className="cmp-why" role="status" data-testid="cmp-block">{why}</p> : <p className="cmp-why cmp-ok">{q ? `${q.included.length} models · the total is the sum of each model’s price` : ''}</p>}
        <button type="button" className="btn btn-primary cmp-go" data-testid="cmp-generate" disabled={!!why || busy} onClick={() => void go()} title={why || undefined}>
          {busy ? <i className="as-spin" aria-hidden /> : null}<span>{(q?.included.length || picked.length) > 1 ? `Compare ${q?.included.length || picked.length} models` : 'Compare models'}</span><small data-testid="cmp-total">{totalText(q, own)}</small></button>
      </div>
    </div>
  </Popover>;
}

/** A compared job's caption: model · place · price · time. */
/** The header over a comparison group in the feed. */
export function CompareGroupHead({ jobs, onSide }: { jobs: JobState[]; onSide: () => void }) {
  const own = useOwnAccounts(); const n = (jobs[0] as any)?.compare?.n ?? jobs.length; const prompt = String((jobs[0] as any)?.input?.prompt ?? '');
  const sample = jobs.length > 0 && jobs.every(j => (j as any).demo || (j as any).isSample); const charged = jobs.filter(j => !(j as any).demo && !(j as any).isSample && (j as any).runOn !== 'local' && !(j.status === 'failed' && ((j as any).refunded > 0 || (j as any).refund?.refunded))).reduce((s, j) => s + Number((j as any).cost ?? 0), 0);
  const failed = jobs.filter(j => j.status === 'failed' || j.status === 'blocked').length;
  return <div className="cmp-gh" data-testid="cmp-group-head"><CompareIcon size={14} /><b>Compare · {n} models</b>
    {prompt && <span className="cmp-gh-p" title={prompt}>“<MentionText text={prompt} />”</span>}
    <span className="cmp-gh-t" data-testid="cmp-group-total">{charged > 0 ? `${runPrice({ own, credits: charged }) ?? ''} total` : sample ? 'Samples · nothing billed' : 'Free'}{failed ? ` · ${failed} failed` : ''}{jobs.length < n ? ` · ${n - jobs.length} not shown` : ''}</span>
    <button type="button" className="fd-link cmp-gh-b" data-testid="cmp-side" onClick={onSide} disabled={!jobs.some(j => j.status === 'done')}>Side by side</button></div>;
}
/** Side by side: every model's first image with its caption; a click opens it in the viewer. */
export function CompareView({ jobs, onClose, onOpen }: { jobs: JobState[]; onClose: () => void; onOpen: (id: string) => void }) {
  const own = useOwnAccounts(); const box = useRef<HTMLDivElement>(null);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }; addEventListener('keydown', k, true); box.current?.querySelector<HTMLElement>('button')?.focus(); return () => removeEventListener('keydown', k, true); }, [onClose]);
  const prompt = String((jobs[0] as any)?.input?.prompt ?? '');
  return createPortal(<div className="cmp-view" role="dialog" aria-modal="true" aria-label="Compare side by side" data-testid="cmp-view" ref={box} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="cmp-view-in">
      <div className="cmp-view-h"><CompareIcon size={16} /><b>Side by side</b>{prompt && <span className="cmp-gh-p" title={prompt}>“<MentionText text={prompt} />”</span>}<button type="button" className="fd-btn fd-sq" aria-label="Close" onClick={onClose}><CloseIcon size={14} /></button></div>
      <div className="cmp-view-grid" style={{ ['--n' as any]: String(jobs.length) }}>{jobs.map(j => { const c = jobCaption(j, own); const url = ((j as any).outputs ?? [])[0]?.url ?? j.resultUrl;
        return <figure key={j.id} className="cmp-cell" data-testid={`cmp-cell-${j.id}`}>
          {j.status === 'done' && url ? <button type="button" className="cmp-img" onClick={() => onOpen(j.id)} aria-label={`Open ${c.model}`}><img src={gridSrc(url, 900)} alt={`${c.model}: ${prompt}`} /></button>
            : <div className="cmp-img cmp-img-off">{j.status === 'failed' || j.status === 'blocked' ? 'Failed' : 'Still running…'}</div>}
          <figcaption><b>{c.model}</b><span>{[c.place, c.price, c.time].filter(Boolean).join(' · ')}</span></figcaption></figure>; })}</div>
    </div>
  </div>, document.body);
}
