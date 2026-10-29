/**
 * Spend page (Gallery, 2026-10-24): the pure maths behind the hero, the KPI row, the mosaic and the tip line. No I/O, no React, so the
 * server (GET /api/spend/overview) and the web page share one source of truth, and test/spend-insights.test.ts covers it.
 *  - periodStart: where 7 days / Month / All begin.
 *  - buckets + cumulative: the hero sparkline (spend over the period).
 *  - quoteAccuracy / quoteHint: actual vs estimate, per run and overall.
 *  - shareByTool / worstOverQuote: what the tip line may say; tipLines builds the words, only when the data supports them.
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
/** The run whose bill was furthest over its quote (at least `minRatio`×), and how many runs went that far over. */
export function worstOverQuote<T extends { estUsd: number; actualUsd: number | null }>(rows: T[], minRatio = 2): { row: T; ratio: number; count: number } | null {
  let best: { row: T; ratio: number } | null = null; let count = 0;
  for (const r of rows) {
    if (r.actualUsd == null || !(r.estUsd > 0)) continue; const ratio = r.actualUsd / r.estUsd; if (ratio < minRatio) continue;
    count++; if (!best || ratio > best.ratio) best = { row: r, ratio };
  }
  return best ? { ...best, count } : null;
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
  periodWords: string;           // 'this month', 'the last 7 days', 'all time'
  paidRuns: number;
  top?: { name: string; share: number } | null;
  /** a real quote for a shorter clip of the costliest run of the top tool */
  shorter?: { seconds: number; fromSeconds: number; usd: number; fromUsd: number } | null;
  over?: { ratio: number; count: number; name: string } | null;
  failedCharged?: { runs: number; usd: number } | null;
}
const usd2 = (n: number) => `$${n < 0.1 ? n.toFixed(3).replace(/0$/, '') : n.toFixed(2)}`;
/** The tip line(s), plain words, only when the data supports them. 'tip' is a saving idea, 'warn' a bill that went over its quote. */
export function tipLines(t: TipInput): { tone: 'tip' | 'warn'; text: string }[] {
  const out: { tone: 'tip' | 'warn'; text: string }[] = [];
  if (t.over && t.over.ratio >= 2) {
    const k = t.over.ratio >= 10 ? Math.round(t.over.ratio) : Math.round(t.over.ratio * 10) / 10;
    out.push({ tone: 'warn', text: t.over.count > 1 ? `${t.over.count} runs cost at least twice their quote; the biggest gap was ${k}× (${t.over.name}).` : `One run cost ${k}× its quote (${t.over.name}).` });
  }
  else if (t.failedCharged && t.failedCharged.runs > 0 && t.failedCharged.usd > 0) // one warning at most: a bill over its quote first
    out.push({ tone: 'warn', text: `${t.failedCharged.runs === 1 ? 'One failed run' : `${t.failedCharged.runs} failed runs`} still counted ${usd2(t.failedCharged.usd)}: that provider may bill failed runs.` });
  if (t.top && t.paidRuns >= 2 && t.top.share >= 0.5) {
    const pct = Math.round(t.top.share * 100);
    let s = `${t.top.name} was ${pct >= 100 ? 'all' : `${pct}%`} of ${t.periodWords}.`;
    const sh = t.shorter;
    if (sh && sh.fromSeconds > sh.seconds && sh.usd > 0 && sh.usd <= sh.fromUsd * 0.8)
      s += ` A ${sh.seconds}-second clip instead of ${sh.fromSeconds} s would have cost about ${usd2(sh.usd)} (not ${usd2(sh.fromUsd)}).`;
    out.push({ tone: 'tip', text: s });
  }
  return out;
}
