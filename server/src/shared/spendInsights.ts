/**
 * Spend page (Gallery, 2026-10-24): the pure maths behind the hero, the KPI row, the mosaic and the tip line. No I/O, no React, so the
 * server (GET /api/spend/overview) and the web page share one source of truth, and test/spend-insights.test.ts covers it.
 *  - periodStart: where 7 days / Month / All begin.
 *  - buckets + cumulative: the hero sparkline (spend over the period).
 *  - quoteAccuracy / quoteHint: actual vs estimate, per run and overall.
 *  - shareByTool / overQuoteByTool: what the notices may say; tipLines builds the words (warnings by dollars, then the tip), only when the data supports them.
 *  - tileSpans: which mosaic tiles grow (2×2 / 2×1) by cost.
 */
export type SpendPeriod = '7d' | 'month' | 'all';
export const SPEND_PERIODS: SpendPeriod[] = ['7d', 'month', 'all'];
export const isSpendPeriod = (v: unknown): v is SpendPeriod => v === '7d' || v === 'month' || v === 'all';

const DAY = 86_400_000;
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

/** The first instant of a period (local time). 'all' starts at `earliest` (the first run), or now when there is none. */
export function periodStart(p: SpendPeriod, now = new Date(), earliest?: number | null): number {
  if (p === 'month') return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  if (p === '7d') return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6).getTime();
  const e = earliest != null && Number.isFinite(earliest) ? new Date(earliest) : now;
  return new Date(e.getFullYear(), e.getMonth(), e.getDate()).getTime();
}

/** Spend per bucket from `from` to `to`: one per day, or one per month when the span is over 62 days. */
export function buckets(rows: { createdAt: number; usd: number }[], from: number, to: number): { unit: 'day' | 'month'; points: { t: number; usd: number }[] } {
  const unit: 'day' | 'month' = to - from > 62 * DAY ? 'month' : 'day';
  const starts: number[] = [];
  for (let d = new Date(from); d.getTime() <= to; ) {
    starts.push(d.getTime());
    d = unit === 'day' ? new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1) : new Date(d.getFullYear(), d.getMonth() + 1, 1);
  }
  if (!starts.length) starts.push(from);
  const usd = starts.map(() => 0);
  for (const r of rows) {
    if (!(r.usd > 0) || r.createdAt < from || r.createdAt > to) continue;
    let i = starts.length - 1; while (i > 0 && starts[i] > r.createdAt) i--; usd[i] += r.usd;
  }
  return { unit, points: starts.map((t, i) => ({ t, usd: r4(usd[i]) })) };
}
/** Running total of a series (the sparkline climbs as money is spent). */
export const cumulative = (xs: number[]): number[] => { let s = 0; return xs.map((x) => r4((s += x))); };

/** One run's quote vs its bill: 'on quote' within 15 %, '11× quote' from 1.5×, else '+23 %' / '−20 %'. null without both figures. */
export function quoteHint(estUsd: number | null | undefined, actualUsd: number | null | undefined): { tone: 'ok' | 'over' | 'under'; text: string; ratio: number } | null {
  if (estUsd == null || actualUsd == null || !(estUsd > 0) || !(actualUsd >= 0)) return null;
  const ratio = actualUsd / estUsd;
  if (Math.abs(ratio - 1) <= 0.15) return { tone: 'ok', text: 'on quote', ratio };
  if (ratio >= 1.5) return { tone: 'over', text: `${ratio >= 10 ? Math.round(ratio) : Math.round(ratio * 10) / 10}× quote`, ratio };
  const pct = Math.round((ratio - 1) * 100);
  return { tone: pct > 0 ? 'over' : 'under', text: `${pct > 0 ? '+' : '−'}${Math.abs(pct)}% vs quote`, ratio };
}
/** How close bills were to quotes, 0–100 %: the mean of min/max per run with both figures. null when no run has a reported cost. */
export function quoteAccuracy(rows: { estUsd: number; actualUsd: number | null }[]): { pct: number; runs: number } | null {
  const xs = rows.filter((r) => r.actualUsd != null && r.estUsd > 0 && r.actualUsd >= 0);
  if (!xs.length) return null;
  const m = xs.reduce((s, r) => { const a = r.actualUsd as number; const hi = Math.max(a, r.estUsd); return s + (hi > 0 ? Math.min(a, r.estUsd) / hi : 1); }, 0) / xs.length;
  return { pct: Math.round(m * 100), runs: xs.length };
}
/** Runs billed at least `minRatio`× their quote AND at least `minGapUsd` over it (a 1-cent quote billed 2 cents is not worth a warning), grouped
 *  per tool: the worst run, how many went that far over, and the dollars over quote in all. Biggest dollar gap first. */
export function overQuoteByTool<T extends { toolId: string; estUsd: number; actualUsd: number | null }>(rows: T[], minRatio = 2, minGapUsd = 0.05): { toolId: string; row: T; ratio: number; count: number; gapUsd: number }[] {
  const m = new Map<string, { toolId: string; row: T; ratio: number; count: number; gapUsd: number }>();
  for (const r of rows) {
    if (r.actualUsd == null || !(r.estUsd > 0)) continue; const ratio = r.actualUsd / r.estUsd; const gap = r.actualUsd - r.estUsd;
    if (ratio < minRatio || gap < minGapUsd) continue;
    const g = m.get(r.toolId); if (!g) { m.set(r.toolId, { toolId: r.toolId, row: r, ratio, count: 1, gapUsd: gap }); continue; }
    g.count++; g.gapUsd += gap; if (ratio > g.ratio) Object.assign(g, { row: r, ratio });
  }
  return [...m.values()].map((g) => ({ ...g, gapUsd: r4(g.gapUsd) })).sort((a, b) => b.gapUsd - a.gapUsd);
}
/** Money per tool, biggest first, with each one's share of the total (0–1). */
export function shareByTool(rows: { toolId: string; usd: number }[]): { toolId: string; usd: number; runs: number; share: number }[] {
  const m = new Map<string, { usd: number; runs: number }>(); let total = 0;
  for (const r of rows) { if (!(r.usd > 0)) continue; total += r.usd; const e = m.get(r.toolId) ?? { usd: 0, runs: 0 }; e.usd += r.usd; e.runs++; m.set(r.toolId, e); }
  return [...m].map(([toolId, e]) => ({ toolId, usd: r4(e.usd), runs: e.runs, share: total > 0 ? e.usd / total : 0 })).sort((a, b) => b.usd - a.usd);
}
/** Mosaic tile size per tile (costs sorted biggest first): the top run grows to 2×2 when it is at least a quarter of the money shown,
 *  the next big ones (each at least 8 % of it) to 2×1, at most `wide` of them. Free tiles stay 1×1. */
export function tileSpans(usds: number[], wide = 3): ('big' | 'wide' | '')[] {
  const total = usds.reduce((s, x) => s + (x > 0 ? x : 0), 0); let w = 0;
  return usds.map((x, i) => {
    if (!(x > 0) || !(total > 0)) return '';
    if (i === 0 && x / total >= 0.25 && usds.length >= 2) return 'big';
    if (w < wide && x / total >= 0.08 && usds.length >= 3) { w++; return 'wide'; }
    return '';
  });
}

export interface TipInput {
  /** what the share is of: "this month's spend", "your spend in the last 7 days", "all your spend" */
  periodWords: string;
  paidRuns: number;
  top?: { name: string; share: number } | null;
  /** a real quote for a shorter clip of the costliest run of the top tool */
  shorter?: { seconds: number; fromSeconds: number; usd: number; fromUsd: number } | null;
  /** over-quote groups (overQuoteByTool) with the tool's name; nowUsd: today's quote for the worst run's own settings, when known */
  over?: { toolId: string; jobId: string; name: string; ratio: number; count: number; gapUsd: number; estUsd: number; actualUsd: number; nowUsd?: number | null }[];
  /** providers: who billed them (names), said in the warning */
  failedCharged?: { runs: number; usd: number; providers?: string[] } | null;
}
export type Notice =
  | { tone: 'warn'; kind: 'over'; text: string; usd: number; jobId: string }
  | { tone: 'warn'; kind: 'failed'; text: string; usd: number }
  | { tone: 'tip'; kind: 'tip'; text: string; usd: number };
const usd2 = (n: number) => `$${n < 0.1 ? n.toFixed(3).replace(/0$/, '') : n.toFixed(2)}`;
const times = (k: number) => `${k >= 10 ? Math.round(k) : Math.round(k * 10) / 10}×`;
/** Today's quote for the same settings now matches what was billed (from 15 % under to 50 % over: an 'up to' quote may sit above the bill),
 *  so the price table was wrong then and has been corrected. A quote far from the bill compares unlike settings: no claim. */
export const priceFixedNow = (o: { actualUsd: number; nowUsd?: number | null }) => o.nowUsd != null && o.actualUsd > 0 && o.nowUsd >= o.actualUsd * 0.85 && o.nowUsd <= o.actualUsd * 1.5;
/** The notices under the gallery, plain words, only when the data supports them. Warnings (a bill over its quote, failed runs that still
 *  counted) come first, biggest dollar amount first, at most `maxWarn`; then the saving tip. Each says what its button does (kind). */
export function tipLines(t: TipInput, maxWarn = 3): Notice[] {
  const warn: Notice[] = [];
  for (const o of t.over ?? []) {
    if (!(o.ratio >= 2)) continue;
    let s = o.count > 1 ? `${o.count} ${o.name} runs cost at least twice their quote, ${usd2(o.gapUsd)} over in all; the biggest gap was ${times(o.ratio)}.`
      : `One ${o.name} run cost ${times(o.ratio)} its quote (${usd2(o.actualUsd)}, quoted ${usd2(o.estUsd)}).`;
    if (priceFixedNow(o)) s += ` That price is fixed now: the same settings quote ${usd2(o.nowUsd!)} today.`;
    warn.push({ tone: 'warn', kind: 'over', text: s, usd: o.gapUsd, jobId: o.jobId });
  }
  const f = t.failedCharged;
  if (f && f.runs > 0 && f.usd > 0)
    warn.push({ tone: 'warn', kind: 'failed', usd: f.usd, text: `${f.runs === 1 ? 'One failed run' : `${f.runs} failed runs`} still counted ${usd2(f.usd)} at ${f.runs === 1 ? 'its' : 'their'} estimate: ${f.providers?.length ? f.providers.join(' and ') : 'the provider'} may bill failed runs.` });
  const out = warn.sort((a, b) => b.usd - a.usd).slice(0, maxWarn);
  if (t.top && t.paidRuns >= 2 && t.top.share >= 0.5) {
    const pct = Math.round(t.top.share * 100);
    let s = `${t.top.name} was ${pct >= 100 ? 'all' : `${pct}%`} of ${t.periodWords}.`;
    const sh = t.shorter;
    if (sh && sh.fromSeconds > sh.seconds && sh.usd > 0 && sh.usd <= sh.fromUsd * 0.8)
      s += ` Each ${sh.fromSeconds}\u00a0s clip cost about ${usd2(sh.fromUsd)}; at ${sh.seconds}\u00a0s it'd be about ${usd2(sh.usd)}.`;
    out.push({ tone: 'tip', kind: 'tip', text: s, usd: 0 });
  }
  return out;
}
