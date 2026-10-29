import { useEffect, useState } from 'react';
import { getLedger, LedgerEntry, ToolInfo } from '../api';
import { Link } from '../platform/router';
import { UsageChart } from './pages/Backlog';
import { ledgerUsd } from '../shared/billing';
import { ledgerWords } from '../shared/creditsBack';
/** Account → Usage: every charge, refund and free gen with running balance (GET /api/ledger). */
export default function Usage({ tools }: { tools: ToolInfo[] }) {
  const [d, setD] = useState<any | null>(null); const [f, setF] = useState<'all' | 'charge' | 'refund'>('all'); const [err, setErr] = useState(''); const [tool, setTool] = useState(''); const [more, setMore] = useState(false);
  /** GET /api/usage?kind=&toolId=&limit=&cursor= → {localFree, hidden, balance, totals, byTool, entries, nextCursor}. */
  const page = (cursor?: string | number | null) => fetch(`/api/usage?${new URLSearchParams({ limit: '50', ...(f !== 'all' && { kind: f }), ...(tool && { toolId: tool }), ...(cursor != null && { cursor: String(cursor) }) })}`).then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)));
  useEffect(() => { setD(null); setErr(''); page().then(setD).catch(() => getLedger().then(setD).catch(e => setErr(e.message))); }, [f, tool]);
  const loadMore = () => { setMore(true); page(d?.nextCursor).then(j => setD((x: any) => ({ ...j, entries: [...(x?.entries ?? []), ...(j.entries ?? [])] }))).catch(e => setErr(e.message)).finally(() => setMore(false)); };
  const rows: LedgerEntry[] = (d?.entries ?? []).filter((e: LedgerEntry) => f === 'all' || e.kind === f);
  const byTool: [string, any][] = Object.entries(d?.byTool ?? {});
  /* Load placeholders follow the last known localFree, so the Balance block or the green strip doesn't pop in and push the page. */
  const lfKey = 'ohf:usage:localFree'; const showBal = d != null && !(d.localFree === true || (d.localFree == null && d.hidden));
  useEffect(() => { if (d) try { localStorage.setItem(lfKey, showBal ? '0' : '1'); } catch { /* ignore */ } }, [d, showBal]);
  const wasBal = (() => { try { return localStorage.getItem(lfKey) === '0'; } catch { return false; } })();
  const name = (id?: string, n?: string) => n ?? tools.find(t => t.id === id)?.name ?? id ?? '—';
  return (
    <div className="usage-page">
      <div className="usage-head">
        <div className="mh"><span className="eyebrow">Account</span><h1>Usage</h1><p className="helper usage-lede" data-testid="usage-lede">Every charge and refund.</p></div>
        {/* Balance shows whenever the server says local runs aren't free (localFree false); the green strip only when they are. */}
        {d == null ? (wasBal && !err ? <div className="usage-bal usage-ph" aria-hidden><span className="helper">Balance</span><b>&nbsp;</b></div> : null) : !showBal ? null : <div className="usage-bal" data-testid="usage-balance"><span className="helper">Balance</span><b>{d?.balance != null ? ledgerUsd(d.balance) : '—'}</b><span className="helper">left</span><a href="#activity" className="usage-why">Where did it go?</a></div>}
      </div>
      {d == null && !err && !wasBal && <div className="usage-strip usage-ph" aria-hidden />}{d?.localFree === true && <div className="usage-strip" role="note" data-testid="usage-local-free"><b className="lf-headline"><span className="lf-dot" />Free on your computer</b><span className="helper">Runs on your computer are free. Cloud runs show their cost.</span></div>}
      {d == null && !err && <div className="usage-totals usage-ph" aria-hidden>{[0, 1, 2].map(i => <div key={i} className="xcard ut-card"><span className="helper">&nbsp;</span><b>&nbsp;</b></div>)}</div>}{d?.totals && !d.hidden && <div className="usage-totals">{(['charged', 'refunded', 'granted'] as const).map(k => <div key={k} className="xcard ut-card"><span className="helper" title={k === 'refunded' ? 'Back to your balance, not provider refunds' : undefined}>{k[0].toUpperCase() + k.slice(1)}</span><b>{ledgerUsd(d.totals[k] ?? 0)}</b></div>)}</div>}
      {/* Batch 25 (GAP 20): summary first, then the chart, then the filters that drive the table */}
      <UsageChart />
      {d == null && !err && <div className="usage-bk usage-ph" aria-hidden><div className="usage-bk-sum"><b>&nbsp;</b></div></div>}
      {d && !d.hidden && Array.isArray(d.buckets) && d.buckets.length > 0 && <Buckets b={d.buckets} overdraft={d.overdraft} />}
      <div className="usage-filters">
      <div className="subtabs usage-tabs" role="tablist">{([['all', 'All'], ['charge', 'Charges'], ['refund', 'Refunds']] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={f === k} className={f === k ? 'on' : ''} title={k === 'refund' ? 'Refunds: back to your balance, not provider refunds' : undefined} onClick={() => setF(k)}>{l}</button>)}</div>
      {d == null && !err && <label className="usage-tool-sel usage-ph" aria-hidden><span className="helper">Tool</span><select disabled><option>All tools</option></select></label>}{byTool.length > 0 && <label className="usage-tool-sel"><span className="helper">Tool</span><select data-testid="usage-tool" value={tool} onChange={e => setTool(e.target.value)}><option value="">All tools</option>{byTool.map(([id, t]) => <option key={id} value={id}>{t.toolName ?? id} ({t.runs})</option>)}</select></label>}
      </div>
      {err && <div className="err">{err}</div>}
      {d && !rows.length ? <div className="usage-empty"><p>No activity yet. Every charge and refund will show here.</p>{tools[0] && <Link to={tools[0].route} className="btn btn-light">Start generating</Link>}</div> :
        <table className="usage-table" id="activity"><thead><tr><th>Time <span className="helper">(local)</span></th><th>Activity</th><th>Tool</th><th>Model</th><th className="num">Amount</th><th className="num">Balance</th></tr></thead>
          <tbody>{rows.map(e => <tr key={e.id} data-kind={e.kind}>
            <td>{new Date(e.ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
            <td><span className={`uk uk-${e.kind}`}>{e.kind === 'charge' ? (e.amount === 0 ? 'Free gen' : 'Charge') : e.kind === 'refund' ? 'Back to balance' : 'Grant'}</span>{' '}{e.jobId && <Link to={`/jobs/${e.jobId}`} className="usage-job">{usageNote(e)}</Link>}{!e.jobId && <span className="helper"> {usageNote(e)}</span>}</td>
            <td>{name(e.toolId, (e as any).toolName)}</td><td className="helper usage-model" title={(e as any).model}>{(e as any).model ?? e.provider ?? '—'}</td>
            <td className={`num ${e.amount > 0 ? 'pos' : e.amount < 0 ? 'neg' : ''}`}>{e.amount > 0 ? '+' : e.amount < 0 ? '−' : ''}{ledgerUsd(Math.abs(e.amount))}</td><td className="num helper">{ledgerUsd(e.balance)}</td></tr>)}</tbody></table>}
      {d?.nextCursor != null && <div className="usage-more"><button className="btn" disabled={more} onClick={loadMore}>{more ? 'Loading…' : 'Load more'}</button></div>}
    </div>
  );
}
/** B15: ledger notes are plain server copy now ("Run canceled: credits back to your app balance"); show them as sent, minus the
 *  credits-back clause the "Credits back" chip already says ("balance" and "app balance"), and never a raw route id. */
function usageNote(e: any): string {
  const n = ledgerWords(String(e?.note ?? '').trim()).replace(/(^|[^\d.,$])(\d[\d,]*) credits?\b/g, (_m: string, a: string, x: string) => `${a}${ledgerUsd(Number(x.replace(/,/g, '')))}`); if (e?.kind !== 'refund') return n;
  if (/^route\s+\S+\s+failed\b/i.test(n)) return 'A route failed, trying the next one';
  return n.replace(/[:;,·\s-]*\(?\s*credits back to (your )?(app )?balance\s*\)?\.?$/i, '').trim() || 'Run did not finish';
}

/** Batch 25 (v2 spec): where the balance comes from, one row per credit bucket (GET /api/usage → buckets). Spent first-in, first-out. */
function Buckets({ b, overdraft }: { b: any[]; overdraft?: number }) {
  /* Credits never expire. Labels follow the bucket's source; spend order matches the server: starter first, then the oldest. */
  const SRC: Record<string, string> = { starter: 'Starter balance', topup: 'Top-up', promo: 'Bonus', refund: 'Back to balance' };
  const src = (x: any) => SRC[String(x.source ?? '')] ?? 'Added';
  const rows = [...b].sort((x, y) => (x.source === 'starter' ? 0 : 1) - (y.source === 'starter' ? 0 : 1) || (Number(x.createdAt) || 0) - (Number(y.createdAt) || 0));
  const left = rows.filter(x => (x.remaining ?? 0) > 0).length;
  return <details className="usage-bk" data-testid="usage-buckets"><summary className="usage-bk-sum"><b>Balance sources</b><span className="helper"> · {left} of {rows.length} with money left</span></summary>
    <ul className="usage-bk-list">{rows.map((x, i) => { const amt = Number(x.amount) || 0; const rem = Math.max(0, Number(x.remaining) || 0); const pct = amt > 0 ? Math.min(100, Math.round(rem / amt * 100)) : 0;
      return <li key={x.id ?? i} className={rem === 0 ? 'ubk-off' : undefined}>
        <span className="ubk-name">{src(x)}<span className="helper"> · added {x.createdAt ? new Date(x.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '—'}</span></span>
        <span className="ubk-bar" role="img" aria-label={`${pct}% left`}><i style={{ width: `${pct}%` }} /></span>
        <span className="ubk-num"><b>{ledgerUsd(rem)}</b><span className="helper"> / {ledgerUsd(amt)}</span></span>
        <span className="helper ubk-exp">No expiry</span></li>; })}</ul>
    <p className="helper usage-bk-note">Runs use the starter balance first, then the oldest top-up.{overdraft ? ` Short by ${ledgerUsd(Number(overdraft))}; the next top-up covers this first.` : ''}</p></details>;
}
