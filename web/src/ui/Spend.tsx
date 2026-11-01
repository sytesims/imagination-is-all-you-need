/** Account → Spend, "Gallery" design (2026-10-24; own-accounts mode). What your runs cost on the accounts that bill them, shown as the
 *  results you paid for.
 *  - Overview: a hero total for 7 days / Month / All with a sparkline, four KPI cards, a mosaic of results sized by cost (Paid / Everything;
 *    a tile opens its job) and a "Worth a look" card of notices computed from the data (only when the data supports it). No spending limits (removed
 *    2026-10-28, user decision: spend is controlled by how much you top up).
 *  - All runs: the full filterable run table with thumbnails, estimate next to actual, and each provider's failed-run rule shown once.
 *  GET /api/spend/overview, /api/spend, /api/spend/summary, /api/accounts, GET/PUT /api/settings/billing. Team mode shows the credits
 *  Usage page instead (SpendOrUsage). The maths (accuracy, tile sizes, tips) lives in server/src/shared/spendInsights.ts. */
import { Notice } from '../shared/Notice';
import { InlineError } from '../shared/InlineError';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ToolInfo } from '../api';
import UsagePage from './Usage';
import { Link } from '../platform/router';
import { cleanModelName, ranOnOf } from '../shared/models';
import { Segmented } from '../shared/BarPop';
import { MakerTile } from '../shared/MakerTile';
import { Waveform, useWaveform } from '../shared/Waveform';
import { tip } from '../shared/Tooltip';
import { gridSrc } from '../shared/thumbs';
import { resultKindOfUrl, videoPoster, type ResultKind } from '../shared/mediaKind';
import { useNearView } from '../shared/useNearView';
import { useBilling, useBillingError, retryBilling, useSpendDay, useSpendMonth, useAccounts, fmtUsd, RULE_TEXT, knownBalanceUsd, ago, balanceText, balanceDetail, comfyPlanNow, type Account, type FailureRule } from '../shared/billing';
import { cumulative, quoteHint, tileSpans, tipLines, type SpendPeriod } from '../../../server/src/shared/spendInsights';
import { LOCAL_LABEL } from '../../../server/src/shared/modelIds';
import './spend.css';

const STATUS: Record<string, string> = { done: 'Done', failed: 'Failed', blocked: 'Blocked', canceled: 'Canceled', queued: 'Queued', running: 'Running', needs_decision: 'Waiting for you' };
const ruleClass = (r: FailureRule) => (r === 'not-charged' ? 'ok' : r === 'may-charge' ? 'warn' : 'muted');
const dayStart = (d: string) => (d ? new Date(`${d}T00:00:00`).getTime() : null);
const PERIOD_WORDS: Record<SpendPeriod, { hero: string; tip: string; share: string }> = { '7d': { hero: 'Spent in the last 7 days', tip: 'the last 7 days', share: 'your spend in the last 7 days' }, month: { hero: 'Spent this month', tip: 'this month', share: "this month's spend" }, all: { hero: 'Spent so far', tip: 'all your spend', share: 'all your spend' } };
const FAILED = new Set(['failed', 'blocked', 'canceled']);

interface Tile { jobId: string; toolId: string; model: string; route: string | null; modelName: string | null; createdAt: number; status: string; billedTo: string; usd: number; estUsd: number; actualUsd: number | null; local: boolean; sample: boolean; url: string; poster: string; seconds: number | null; resolution: string | null; types: string | null }
interface Overview { period: SpendPeriod; from: string; to: string; totals: { spentUsd: number; runs: number; everRuns: number; paidRuns: number; freeRuns: number; sampleRuns: number; savedUsd: number; chargedUsd?: number; estimatedUsd?: number }; series: { unit: 'day' | 'month'; points: { t: number; usd: number }[] };
  biggest: Tile | null; accuracy: { pct: number; runs: number } | null; overQuote: { jobId: string; toolId: string; ratio: number; count: number; estUsd: number; actualUsd: number } | null; failedCharged: { runs: number; usd: number; providers?: string[] } | null;
  overQuotes?: { jobId: string; toolId: string; ratio: number; count: number; gapUsd: number; estUsd: number; actualUsd: number; run: Tile }[];
  tools: { toolId: string; usd: number; runs: number; share: number }[]; topRun: Tile | null; paidTiles: Tile[]; paidMore: number; freeTiles: Tile[]; freeMore: number }

/** A run's media for a tile or a table thumbnail: kind from its URL, the still to draw (image itself, a video's / 3D model's poster). */
function mediaOf(r: { url?: string; poster?: string }): { kind: ResultKind | null; still: string | null; url: string } {
  const url = r.url ?? ''; const kind = resultKindOfUrl(url);
  const still = kind === 'image' ? url : kind === 'video' ? (r.poster || videoPoster(url)) : kind === '3d' ? (r.poster || null) : null;
  return { kind, still, url };
}
const MEDIUM: Record<string, string> = { audio: 'audio', voice: 'audio', soundtrack: 'audio', 'three-d': '3d', 'three-d-turntable': '3d' };
const mediumOf = (toolId: string, kind: ResultKind | null) => kind ?? MEDIUM[toolId] ?? (/video|camera|reshoot|motion|h3|cinema|fps/.test(toolId) ? 'video' : 'image');

/** Overview for one period; refreshes when a run starts or ends (the month summary's run count) and on 'ohf:billing'. */
function useOverview(period: SpendPeriod, tick: number) {
  const [d, setD] = useState<Overview | null>(null); const [err, setErr] = useState('');
  const [bump, setBump] = useState(0);
  useEffect(() => { const f = () => setBump((x) => x + 1); addEventListener('ohf:billing', f); return () => removeEventListener('ohf:billing', f); }, []);
  useEffect(() => { let on = true; setErr('');
    fetch(`/api/spend/overview?period=${period}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))).then((j) => { if (on) setD(j); }).catch((e) => { if (on) setErr(e.message); });
    return () => { on = false; }; }, [period, tick, bump]);
  return { d, err, loading: !d || d.period !== period };
}

/** Today's quote (free: a quote never runs anything) for a run's own model, route and settings, at `seconds` (else its own length). 0 when none. */
async function quoteRun(run: Tile, seconds = run.seconds): Promise<number> {
  const u = new URLSearchParams({ provider: run.model }); if (seconds != null) u.set('seconds', String(seconds));
  if (run.route) u.set('route', run.route); if (run.resolution) u.set('resolution', run.resolution); if (run.types) u.set('types', run.types);
  const j = await fetch(`/api/tools/${encodeURIComponent(run.toolId)}/price?${u}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const c = j?.cost; return c ? (c.estUsd > 0 ? c.estUsd : c.realRunUsd ?? 0) : 0;
}
/** Today's quotes for the over-quote warnings' worst runs, by jobId (to say when the price has since been fixed). */
function useNowQuotes(runs: Tile[]): Record<string, number> {
  const [q, setQ] = useState<Record<string, number>>({}); const k = runs.map((r) => r.jobId).join(',');
  useEffect(() => { if (!runs.length) return; let on = true;
    void Promise.all(runs.map(async (r) => [r.jobId, await quoteRun(r)] as const)).then((xs) => { if (on) setQ(Object.fromEntries(xs.filter(([, v]) => v > 0))); });
    return () => { on = false; }; }, [k]); // eslint-disable-line react-hooks/exhaustive-deps
  return q;
}

/** Real quotes (free: a quote never runs anything) for the costliest run of the top tool: the same model, route and resolution at its own
 *  length and at 5 (or 6) seconds. Shown only when today's quote for its own length still matches what it was quoted (within 25 %),
 *  so the two numbers compare like with like. */
function useShorterQuote(run: Tile | null | undefined): { seconds: number; usd: number; fromUsd: number } | null {
  const [q, setQ] = useState<{ k: string; seconds: number; usd: number; fromUsd: number } | null>(null);
  const k = run ? `${run.jobId}:${run.seconds}` : '';
  useEffect(() => { if (!run || run.seconds == null || run.seconds <= 6 || !(run.estUsd > 0)) return; let on = true;
    const quote = (s: number) => quoteRun(run, s);
    const ask = async () => { const from = await quote(run.seconds!); if (!(from > 0) || Math.abs(from - run.estUsd) / run.estUsd > 0.25) return;
      for (const s of [5, 6]) { const usd = await quote(s); if (usd > 0) { if (on) setQ({ k, seconds: s, usd, fromUsd: from }); return; } } };
    void ask(); return () => { on = false; }; }, [k]); // eslint-disable-line react-hooks/exhaustive-deps
  return q && q.k === k ? q : null;
}

/** An account's balance we can show: a real one read from the provider, or the mock backend's labelled sample. */
const balanceOf = (a: Account | undefined, mockBackend: boolean): { usd: number; sample: boolean } | null => {
  if (!a) return null; const real = knownBalanceUsd(a); if (real != null) return { usd: real, sample: false };
  return mockBackend && a.mock && a.balanceUsd == null ? { usd: a.mock.balanceUsd, sample: true } : null;
};

export default function Spend({ tools }: { tools: ToolInfo[] }) {
  const b = useBilling(); const day = useSpendDay(); const month = useSpendMonth(); const acc = useAccounts();
  const [tab, setTab] = useState<'overview' | 'runs'>(() => (location.hash === '#runs' ? 'runs' : 'overview'));
  const [period, setPeriod] = useState<SpendPeriod>('month');
  const tick = (day?.totals.runs ?? 0) + (month?.totals.runs ?? 0);
  const ov = useOverview(period, tick);
  const toolName = (id: string) => (id === 'compose' ? 'Stitch' : tools.find((t) => t.id === id)?.name ?? id);
  const nameOf = (id: string) => (id === 'local' ? LOCAL_LABEL : b?.providers.find((p) => p.id === id)?.name ?? id);
  const [runsInit, setRunsInit] = useState<RunsFilter>({}); // the failed-runs warning opens All runs pre-filtered
  const go = (t: 'overview' | 'runs', f: RunsFilter = {}) => { setRunsInit(f); setTab(t); try { history.replaceState(null, '', t === 'runs' ? '#runs' : location.pathname); } catch { /* sandboxed */ } };
  return (
    <div className="spg bp-host" data-testid="spend-page">
      <header className="spg-head">
        <div className="mh"><Link to="/settings" className="back-link spg-back" data-testid="spend-back">‹ Back to Settings</Link><span className="eyebrow">Account</span><h1>Spend</h1>
          <p className="lede spg-lede" data-testid="spend-lede">What your runs cost on the accounts that bill them. Runs on your computer are free. <Link to="/models" data-testid="spend-pricing-link">See prices per model</Link>.</p></div>
        <Segmented className="spg-tabs" label="Spend view" value={tab} onChange={go} testId="spend-tabs"
          options={[{ value: 'overview', label: 'Overview', testId: 'spend-tab-overview' }, { value: 'runs', label: 'All runs', testId: 'spend-tab-runs' }]} />
      </header>
      {tab === 'overview'
        ? <OverviewTab ov={ov} period={period} setPeriod={setPeriod} toolName={toolName} nameOf={nameOf} onAllRuns={(f) => go('runs', f)} tools={tools} />
        : <RunsTab key={JSON.stringify(runsInit)} init={runsInit} tools={tools} toolName={toolName} tick={tick} />}
      <p className="spg-foot">Balances and keys: <Link to="/settings#connections">Settings → Connections</Link>. You pay each provider on its own site; this app never handles payments.</p>
    </div>
  );
}

function OverviewTab({ ov, period, setPeriod, toolName, nameOf, onAllRuns, tools }: { ov: ReturnType<typeof useOverview>; period: SpendPeriod; setPeriod: (p: SpendPeriod) => void; toolName: (id: string) => string; nameOf: (id: string) => string; onAllRuns: (f?: RunsFilter) => void; tools: ToolInfo[] }) {
  const b = useBilling(); const day = useSpendDay(); const month = useSpendMonth(); const acc = useAccounts();
  const d = ov.d; const t = d?.totals;
  const shorter = useShorterQuote(d?.topRun && d.tools[0] && d.topRun.toolId === d.tools[0].toolId ? d.topRun : null);
  // hero line: the balance of the account you spend most on, today's spend, what local runs saved
  const spendBy = new Map((month?.providers ?? []).map((p) => [p.provider, p.spentUsd]));
  const bal = useMemo(() => { const list = (acc?.accounts ?? []).map((a) => ({ a, b: balanceOf(a, !!acc?.mockBackend) })).filter((x) => x.b);
    list.sort((x, y) => (spendBy.get(y.a.provider) ?? 0) - (spendBy.get(x.a.provider) ?? 0)); return list[0] ?? null; }, [acc, month]); // eslint-disable-line react-hooks/exhaustive-deps
  const empty = !!d && t!.everRuns === 0;
  const [show, setShow] = useState<'paid' | 'all'>('paid'); const [limit, setLimit] = useState(24);
  useEffect(() => setLimit(24), [period, show]);
  const onlyFree = !!d && t!.paidRuns === 0 && (d.freeTiles.length > 0);
  const mode = onlyFree ? 'all' : show;
  const tiles = useMemo(() => !d ? [] : mode === 'paid' ? d.paidTiles : [...d.paidTiles, ...d.freeTiles].sort((x, y) => y.usd - x.usd || y.createdAt - x.createdAt), [d, mode]);
  const spans = useMemo(() => tileSpans(tiles.map((x) => x.usd)), [tiles]);
  const more = !d ? 0 : (mode === 'paid' ? d.paidMore : d.paidMore + d.freeMore);
  const overs = d?.overQuotes ?? []; const nowQ = useNowQuotes(useMemo(() => overs.map((o) => o.run), [d])); // eslint-disable-line react-hooks/exhaustive-deps
  const tips = !d ? [] : tipLines({ periodWords: PERIOD_WORDS[period].share, paidRuns: t!.paidRuns,
    top: d.tools[0] ? { name: toolName(d.tools[0].toolId), share: d.tools[0].share } : null,
    shorter: shorter && d.topRun?.seconds ? { seconds: shorter.seconds, fromSeconds: d.topRun.seconds, usd: shorter.usd, fromUsd: shorter.fromUsd } : null,
    over: overs.map((o) => ({ ...o, name: toolName(o.toolId), nowUsd: nowQ[o.jobId] ?? null })), failedCharged: d.failedCharged });
  // the tip's button: the top tool with the same model at the shorter length when there is one, else the tool itself (its price shows there)
  const topTool = d?.topRun ? tools.find((x) => x.id === d.topRun!.toolId) : undefined;
  const tipTo = topTool && d?.topRun ? `${topTool.route}${topTool.route.includes('?') ? '&' : '?'}${new URLSearchParams({ model: d.topRun.model, ...(shorter ? { duration: String(shorter.seconds) } : {}) })}` : null;
  const dateOf = (iso: string) => { const x = new Date(iso); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  const kpis: { k: string; label: string; value: string; sub?: string; tone?: 'free'; to?: string }[] = [];
  if (d) {
    kpis.push({ k: 'paid', label: 'Paid runs', value: t!.paidRuns.toLocaleString(), sub: t!.sampleRuns ? `${t!.sampleRuns} sample run${t!.sampleRuns === 1 ? '' : 's'}, nothing billed` : t!.paidRuns ? `of ${t!.runs.toLocaleString()} runs` : 'Nothing billed' });
    kpis.push({ k: 'free', label: 'Free runs', value: t!.freeRuns.toLocaleString(), sub: t!.savedUsd > 0 ? `Saved ≈ ${fmtUsd(t!.savedUsd)} running locally` : 'Ran on your computer', tone: 'free' });
    if (d.biggest) kpis.push({ k: 'big', label: 'Biggest run', value: fmtUsd(d.biggest.usd), sub: `${toolName(d.biggest.toolId)} · ${new Date(d.biggest.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}`, to: `/jobs/${d.biggest.jobId}` });
    if (d.accuracy) kpis.push({ k: 'acc', label: 'Quote accuracy', value: `${d.accuracy.pct}%`, sub: `${d.accuracy.runs} run${d.accuracy.runs === 1 ? '' : 's'} with a reported bill` });
    else if (t!.paidRuns > 0) kpis.push({ k: 'avg', label: 'Average paid run', value: fmtUsd(t!.spentUsd / t!.paidRuns), sub: 'No provider reported a bill yet: estimates' });
    if (kpis.length < 4 && t!.savedUsd > 0) { kpis.push({ k: 'saved', label: 'Saved on your computer', value: `≈ ${fmtUsd(t!.savedUsd)}`, sub: 'vs the cheapest cloud option', tone: 'free' }); kpis[1].sub = 'Ran on your computer'; }
  }
  const line: React.ReactNode[] = [];
  if (bal) line.push(<span key="bal" data-testid="spend-balance" {...tip(bal.b!.sample ? 'Sample figure (mock mode, no key): shows how a connected balance looks. Not your account.' : balanceDetail({ units: bal.a.balance ?? null, unitLabel: bal.a.balanceUnit ?? null, plan: bal.a.provider === 'comfy' ? comfyPlanNow() : null, checked: ago(bal.a.fetchedAt) }))}>{balanceText(bal.b!.usd, bal.a.name)}{bal.b!.sample ? ' (sample)' : ''}{bal.a.billingUrl && <> · <a href={bal.a.billingUrl} target="_blank" rel="noopener noreferrer" className="spg-topup" data-testid="spend-topup">Top up ↗</a></>}</span>);
  if (period !== 'all' && (day?.totals.spentUsd ?? 0) > 0) line.push(<span key="day">{fmtUsd(day!.totals.spentUsd)} today</span>);
  if (t && t.savedUsd > 0) line.push(<span key="saved" data-testid="spend-saved">saved {fmtUsd(t.savedUsd)} locally</span>);
  if (t && t.spentUsd === 0 && t.runs > 0 && t.freeRuns === t.runs) line.push(<span key="free">Every run was free on your computer</span>);
  return <>
    <section className="spg-hero" data-testid="spend-hero" aria-busy={ov.loading || undefined}>
      <div className="spg-hero-l">
        <span className="eyebrow">{PERIOD_WORDS[period].hero}</span>
        <div className="spg-huge" data-testid="spend-total">{d ? fmtUsd(t!.spentUsd) : <span className="spg-ph" aria-hidden>$0.00</span>}</div>
        {d && (t!.estimatedUsd ?? 0) > 0 && <p className="spg-split" data-testid="spend-split" {...tip('Charged: costs the provider reported. Estimated: runs with no reported cost, and failed runs counted at their estimate.')}>{(t!.chargedUsd ?? 0) > 0 ? <>{fmtUsd(t!.chargedUsd!)} charged <i aria-hidden>·</i> {fmtUsd(t!.estimatedUsd!)} estimated</> : 'All estimated: no provider reported a bill yet'}</p>}
        {line.length > 0 && <p className="spg-line">{line.map((x, i) => <span key={i}>{i > 0 && <i aria-hidden> · </i>}{x}</span>)}</p>}
      </div>
      {d && t!.everRuns > 0 && <Spark points={d.series.points} unit={d.series.unit} />}{d && t!.everRuns === 0 && <span className="spg-spark-gap" />}
      <Segmented className="spg-period" label="Period" value={period} onChange={setPeriod} testId="spend-period"
        options={[{ value: '7d', label: '7 days' }, { value: 'month', label: 'Month' }, { value: 'all', label: 'All' }]} />
    </section>
    {ov.err && <Notice as="p" kind="error" tone="line">{ov.err}</Notice>}

    {empty ? <section className="spg-empty" data-testid="spend-empty">
      <div className="spg-empty-art" aria-hidden>{[0, 1, 2, 3, 4].map((i) => <i key={i} />)}</div>
      <div><h2>Nothing spent yet</h2><p>Your results land here as a wall of tiles, bigger when they cost more. Runs on your computer are free. Comfy Cloud and other providers bill you directly.</p>
        {tools[0] && <Link to={tools[0].route} className="btn btn-primary" data-testid="spend-start">Start generating</Link>}</div>
    </section> : <>
      {d && <div className="spg-kpis" data-testid="spend-kpis" style={{ ['--n' as any]: Math.min(4, kpis.length) }}>{kpis.slice(0, 4).map((k) => { const body = <><small>{k.label}</small><b className={k.tone === 'free' ? 'free' : undefined}>{k.value}</b>{k.sub && <span>{k.sub}</span>}</>;
        return k.to ? <Link key={k.k} to={k.to} className="spg-kpi is-link" data-testid={`spend-kpi-${k.k}`}>{body}</Link> : <div key={k.k} className="spg-kpi" data-testid={`spend-kpi-${k.k}`}>{body}</div>; })}</div>}

      {d && <section className="spg-wall" data-testid="spend-gallery">
        <div className="spg-row"><h2 className="eyebrow">{mode === 'paid' ? 'What you paid for' : 'Everything you made'} <em>· bigger tile = more money</em></h2>
          <Segmented className="spg-show" label="Show" value={mode} onChange={setShow} testId="spend-show"
            options={[{ value: 'paid', label: 'Paid', disabled: onlyFree, title: onlyFree ? 'No paid runs in this period' : undefined }, { value: 'all', label: 'Everything' }]} /></div>
        {tiles.length ? <div className="spg-mosaic" data-testid="spend-mosaic">{tiles.slice(0, limit).map((x, i) => <SpendTile key={x.jobId} t={x} span={spans[i]} toolName={toolName(x.toolId)} />)}</div>
          : <div className="spg-none">{t!.runs ? `No paid runs ${PERIOD_WORDS[period].tip === 'all your spend' ? 'yet' : `in ${PERIOD_WORDS[period].tip}`}.` : `No runs in ${PERIOD_WORDS[period].tip}.`}{t!.runs > 0 && mode === 'paid' && <> <button type="button" className="spg-link" onClick={() => setShow('all')}>Show everything</button></>}</div>}
        {(tiles.length > limit || more > 0) && <div className="spg-more">
          {tiles.length > limit && <button type="button" className="btn btn-sm" onClick={() => setLimit((n) => n + 24)} data-testid="spend-more">Show more</button>}
          {more > 0 && tiles.length <= limit && <button type="button" className="btn btn-sm" onClick={() => onAllRuns()}>See all {(t!.runs).toLocaleString()} runs</button>}
        </div>}
      </section>}

      {tips.length > 0 && <section className="spn" data-testid="spend-tips" aria-label="Worth a look">
        <h2 className="eyebrow spn-title">Worth a look</h2>
        <div className="spn-list">{tips.map((x, i) => { const fig = x.kind === 'over' ? `+${fmtUsd(x.usd)}` : x.kind === 'failed' ? fmtUsd(x.usd) : `${Math.round((d!.tools[0]?.share ?? 0) * 100)}%`;
          const label = x.kind === 'over' ? 'Open run' : x.kind === 'failed' ? 'Show failed runs' : tipTo ? (shorter ? `Try ${shorter.seconds}\u00a0s` : `Open ${toolName(d!.topRun!.toolId)}`) : '';
          const act = x.kind === 'over' ? <Link to={`/jobs/${x.jobId}`} className="spn-act">{label}<span aria-hidden> →</span></Link>
            : x.kind === 'failed' ? <button type="button" className="spn-act" data-testid="spend-failed-runs" onClick={() => onAllRuns({ status: 'failed-counted', from: period === 'all' ? '' : dateOf(d!.from) })}>{label}<span aria-hidden> →</span></button>
            : label ? <Link to={tipTo!} className="spn-act">{label}<span aria-hidden> →</span></Link> : null;
          return <div key={i} className={`spn-item is-${x.kind}`} data-testid={`spend-tip-${x.kind}`}>
            <span className="spn-ic" aria-hidden>{NOTICE_ICON[x.kind]}</span>
            <div className="spn-body"><b>{x.head}</b><p>{x.text}</p></div>
            <span className="spn-fig">{fig}</span>{act}</div>; })}</div>
      </section>}
    </>}

  </>;
}

/** The notices' icons: over quote, failed runs counted, the saving tip. */
const ic = (d: string) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
const NOTICE_ICON = { over: ic('M7 17L17 7M9 7h8v8'), failed: ic('M12 8v5M12 16.5v.01M10.3 3.9L2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z'), tip: ic('M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z') } as const;

/** The hero sparkline: running total over the period, an end dot, the first date and "Today" under it. */
function Spark({ points, unit }: { points: { t: number; usd: number }[]; unit: 'day' | 'month' }) {
  const ys = cumulative(points.map((p) => p.usd)); const max = Math.max(...ys, 0); const n = ys.length;
  const X = (i: number) => (n <= 1 ? 400 : (i / (n - 1)) * 400); const Y = (v: number) => (max > 0 ? 84 - (v / max) * 76 : 84);
  const d = ys.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ') || 'M0 84 L400 84';
  const area = `${n <= 1 ? 'M0 84 L400 84' : d} L400 90 L0 90 Z`;
  const fmt = (t: number) => new Date(t).toLocaleDateString([], unit === 'month' ? { month: 'short', year: '2-digit' } : { month: 'short', day: 'numeric' });
  const last = ys[n - 1] ?? 0;
  return <div className={`spg-spark${max > 0 ? '' : ' flat'}`} role="img" aria-label={`Spend over the period: ${fmtUsd(last)} in total`} data-testid="spend-spark">
    <svg viewBox="0 0 400 90" preserveAspectRatio="none" aria-hidden><defs><linearGradient id="spg-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity=".22" /><stop offset="1" stopColor="var(--accent)" stopOpacity="0" /></linearGradient></defs>
      <path d={area} fill="url(#spg-fill)" /><path d={n <= 1 ? 'M0 84 L400 84' : d} fill="none" vectorEffect="non-scaling-stroke" /></svg>
    <span className="spg-dot" style={{ left: '100%', top: `${(Y(last) / 90) * 100}%` }} aria-hidden />
    {points[0] && <div className="spg-axis" aria-hidden><span>{fmt(points[0].t)}</span><span>Today</span></div>}
  </div>;
}

/** One mosaic tile: the result (image, video still, waveform, 3D poster) under a glass tag with the feature and what it cost. Opens the job. */
function SpendTile({ t, span, toolName }: { t: Tile; span: 'big' | 'wide' | ''; toolName: string }) {
  const m = mediaOf(t); const [bad, setBad] = useState(false);
  const failed = FAILED.has(t.status); const q = !t.local && !t.sample ? quoteHint(t.estUsd, t.actualUsd) : null;
  const price = t.local ? 'Free' : t.sample ? 'Sample' : fmtUsd(t.usd);
  const w = span === 'big' ? 420 : span === 'wide' ? 400 : 200;
  const words = `${toolName} · ${t.modelName ?? ''} · ${price}${failed ? ' · failed' : ''} · ${new Date(t.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
  return <Link to={`/jobs/${t.jobId}`} className={`spg-tile ${span}${t.local ? ' free' : ''}${t.sample ? ' sample' : ''}${failed ? ' failed' : ''}`} data-testid="spend-tile" data-kind={m.kind ?? 'none'} aria-label={`Open ${words}`} {...tip(t.modelName ?? toolName)}>
    {m.kind === 'audio' && !bad ? <AudioTile src={m.url} />
      : m.still && !bad ? <img src={gridSrc(m.still, w)} alt="" loading="lazy" decoding="async" onError={() => setBad(true)} />
      : <span className="spg-blank"><MakerTile medium={mediumOf(t.toolId, m.kind)} title={false} /><small>{failed ? 'No result' : 'No preview'}</small></span>}
    {m.kind === 'video' && !bad && <span className="spg-play" aria-hidden><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg></span>}
    {m.kind === '3d' && m.still && !bad && <span className="spg-chip">3D</span>}
    {failed && <span className="spg-chip bad">{STATUS[t.status] ?? t.status}</span>}
    {!failed && q && q.tone === 'over' && q.ratio >= 1.5 && <span className="spg-chip warn">{q.text}</span>}
    <span className="spg-tag"><span>{toolName}</span><b>{price}</b></span>
  </Link>;
}
function AudioTile({ src }: { src: string }) {
  const [ref, near] = useNearView<HTMLSpanElement>(); const w = useWaveform(src, { bars: 36, enabled: near });
  return <span ref={ref} className="spg-audio"><Waveform bars={w.bars} time={0} duration={0} decorative state={w.state} className="spg-wave" /></span>;
}

/** All runs: the filterable table (ran on, tool, made by, date range), with thumbnails, estimate next to actual, and each provider's
 *  failed-run rule said once above the table instead of on every row. */
type RunsFilter = { status?: string; from?: string };
function RunsTab({ init, tools, toolName, tick }: { init: RunsFilter; tools: ToolInfo[]; toolName: (id: string) => string; tick: number }) {
  const b = useBilling();
  const [prov, setProv] = useState(''); const [tool, setTool] = useState(''); const [status, setStatus] = useState(init.status ?? ''); const [from, setFrom] = useState(init.from ?? ''); const [to, setTo] = useState(''); const [agent, setAgent] = useState(''); const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [rows, setRows] = useState<any[] | null>(null); const [next, setNext] = useState<string | null>(null); const [total, setTotal] = useState(0); const [err, setErr] = useState(''); const [more, setMore] = useState(false);
  const qs = (cursor?: string | null) => { const u = new URLSearchParams({ limit: '50' }); if (prov) u.set('provider', prov); if (tool) u.set('tool', tool); if (agent) u.set('agent', agent); if (status) { u.set('status', status === 'failed-counted' ? 'failed' : status); if (status === 'failed-counted') u.set('counted', '1'); } const f = dayStart(from); const t = dayStart(to); if (f != null) u.set('from', String(f)); if (t != null) u.set('to', String(t + 86_400_000)); if (cursor) u.set('cursor', cursor); return u; };
  const load = (cursor?: string | null) => fetch(`/api/spend?${qs(cursor)}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))));
  useEffect(() => { setErr(''); load().then((j) => { setRows(j.items); setNext(j.nextCursor); setTotal(j.total); }).catch((e) => setErr(e.message)); }, [prov, tool, status, from, to, agent, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fetch('/api/agent/budgets').then((r) => (r.ok ? r.json() : null)).then((j) => j && setAgents(j.items)).catch(() => undefined); }, [tick]); // agent budgets (MCP): the "Made by" filter
  const loadMore = () => { setMore(true); load(next).then((j) => { setRows((x) => [...(x ?? []), ...j.items]); setNext(j.nextCursor); }).catch((e) => setErr(e.message)).finally(() => setMore(false)); };
  const toolIds = useMemo(() => [...new Set((rows ?? []).map((r) => r.toolId))], [rows]);
  const rules = useMemo(() => { const m = new Map<string, { name: string; rule: FailureRule }>(); for (const r of rows ?? []) if (r.billedTo !== 'local' && !r.demo && !m.has(r.billedTo)) m.set(r.billedTo, { name: r.billedToName, rule: r.failureRule });
    return [...m.values()]; }, [rows]);
  const filtered = !!(prov || tool || status || from || to || agent);
  return <section className="spg-runs" id="runs">
    <div className="usage-filters spend-filters spg-filters">
      <label className="usage-tool-sel"><span className="helper">Ran on</span><select data-testid="spend-provider" value={prov} onChange={(e) => setProv(e.target.value)}><option value="">All</option>{(b?.providers ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label className="usage-tool-sel"><span className="helper">Tool</span><select data-testid="spend-tool" value={tool} onChange={(e) => setTool(e.target.value)}><option value="">All tools</option>{[...new Set([...toolIds, ...(tool ? [tool] : [])])].map((id) => <option key={id} value={id}>{toolName(id)}</option>)}</select></label>
      {agents.length > 0 && <label className="usage-tool-sel"><span className="helper">Made by</span><select data-testid="spend-agent" value={agent} onChange={(e) => setAgent(e.target.value)}><option value="">Everyone</option><option value="none">You</option><option value="any">Any agent</option>{agents.map((a) => <option key={a.id} value={a.id}>Agent: {a.name}</option>)}</select></label>}
      <label className="usage-tool-sel"><span className="helper">Status</span><select data-testid="spend-status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option><option value="done">Done</option><option value="failed">Failed</option><option value="failed-counted">Failed, still counted</option></select></label>
      <label className="usage-tool-sel"><span className="helper">From</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="spend-from" /></label>
      <label className="usage-tool-sel"><span className="helper">To</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} data-testid="spend-to" /></label>
    </div>
    {rules.length > 0 && <div className="spg-rules" data-testid="spend-rules"><span className="helper">If a run fails:</span>{rules.map((r) => <span key={r.name} className={`spg-rule rule-${ruleClass(r.rule)}`}><b>{r.name}</b> {RULE_TEXT[r.rule].replace(/^A failed run/, 'a failed run').replace(/^Failed runs/, 'failed runs').replace(/^Failed-run/, 'failed-run')}</span>)}</div>}
    {err && <div className="err">{err}</div>}
    {rows && !rows.length ? <div className="spg-none">No runs{filtered ? ' match these filters' : ' yet'}.{!filtered && tools[0] && <> <Link to={tools[0].route} className="spg-link">Start generating</Link></>}</div> :
      <div className="spend-table-wrap"><table className="usage-table spend-table spg-table" data-testid="spend-runs"><thead><tr><th>Run</th><th>When <span className="helper">(local)</span></th><th>Ran on</th><th>Billed to</th><th className="num">Estimate</th><th className="num">Actual</th><th>Status</th></tr></thead>
        <tbody>{rows == null && [0, 1, 2, 3, 4, 5].map((i) => <tr key={i} className="spg-skel" aria-hidden><td colSpan={7}><i /></td></tr>)}{(rows ?? []).map((r) => { const local = r.billedTo === 'local' || r.demo; const h = !local ? quoteHint(r.estUsd, r.actualUsd) : null; const m = mediaOf(r);
          const failedCharged = FAILED.has(r.status) && !local && (r.countedUsd ?? 0) > 0;
          return <tr key={r.id} data-status={r.status}>
            <td><Link to={`/jobs/${r.jobId}`} className="spg-run"><RunThumb m={m} toolId={r.toolId} /><span className="spg-run-t"><b>{toolName(r.toolId)}{r.agentName && <span className="sp-tag" data-testid="spend-agent-tag" title="Started by an AI agent over MCP, within its budget">Agent: {r.agentName}</span>}</b>
              <small title={String(r.modelName ?? r.model ?? '')}>{cleanModelName(r, String(r.modelName ?? r.model ?? ''))}</small></span></Link></td>
            <td className="spg-when">{new Date(r.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
            <td data-testid="spend-ran-on">{ranOnOf(r) || '—'}</td>
            <td>{r.billedTo === 'local' ? 'Nobody (free)' : r.billedToName}{r.demo && <span className="sp-tag" title="Sample output, nothing billed">Sample</span>}</td>
            <td className="num" title={r.unitLabel && r.estUnits != null ? `${r.estUnits} ${r.unitLabel}` : undefined}>{local ? <span className="free">Free</span> : `≈ ${fmtUsd(r.estUsd)}`}</td>
            <td className="num">{r.actualUsd != null ? <>{fmtUsd(r.actualUsd)}{h && <small className={`spg-acc ${h.tone}`} data-testid="spend-acc">{h.text}</small>}</> : <span className="helper">{local ? '—' : 'Not reported'}</span>}</td>
            <td><span className={`sp-st sp-${r.status}`}>{STATUS[r.status] ?? r.status}</span>{failedCharged && <small className="spg-acc over" title={RULE_TEXT[r.failureRule as FailureRule]}>counted {fmtUsd(r.countedUsd)}</small>}</td></tr>; })}</tbody></table></div>}
    {rows && rows.length > 0 && <p className="helper spend-count">{rows.length.toLocaleString()} of {total.toLocaleString()} run{total === 1 ? '' : 's'}. Estimates use each provider’s list price; “actual” appears when the provider reports the real cost.</p>}
    {next && <div className="usage-more"><button className="btn" disabled={more} onClick={loadMore}>{more ? 'Loading…' : 'Load more'}</button></div>}
  </section>;
}
function RunThumb({ m, toolId }: { m: ReturnType<typeof mediaOf>; toolId: string }) {
  const [bad, setBad] = useState(false);
  return <span className="spg-thumb" aria-hidden>{m.still && !bad ? <img src={gridSrc(m.still, 44)} alt="" loading="lazy" onError={() => setBad(true)} /> : <MakerTile medium={mediumOf(toolId, m.kind)} title={false} />}</span>;
}

/** /account/usage, /usage, /spend: Spend in own-accounts mode (default), the credits Usage page in team mode. */
export function SpendOrUsage({ tools }: { tools: ToolInfo[] }) {
  const b = useBilling(); const err = useBillingError();
  if (!b) return <div className="spg" aria-busy={err ? undefined : true}><header className="spg-head"><div className="mh"><Link to="/settings" className="back-link spg-back" data-testid="spend-back">‹ Back to Settings</Link><span className="eyebrow">Account</span><h1>{err ? 'Spend' : '\u00a0'}</h1></div></header>
    {err && <InlineError what="your spending" error={err} onRetry={() => void retryBilling()} testId="spend-error" /> /* server down: say so with Retry, never a blank page (audit 2026-11-01) */}</div>;
  return b.mode === 'team' ? <UsagePage tools={tools} /> : <Spend tools={tools} />;
}
