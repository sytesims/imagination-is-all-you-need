// Spend page (Gallery) maths, pure functions in src/shared/spendInsights.ts: share of spend per tool, the "would have cost" tip,
// over-quote detection, quote accuracy and hints, period starts, sparkline buckets and mosaic tile sizes.
// Run: npx tsx test/spend-insights.test.ts (no server, no data dir).
import assert from 'node:assert/strict';
import { periodStart, buckets, cumulative, quoteHint, quoteAccuracy, worstOverQuote, shareByTool, tileSpans, tipLines } from '../src/shared/spendInsights.ts';
const ok = (m: string) => console.log('ok ' + m);

// share of spend
{ const s = shareByTool([{ toolId: 'video', usd: 3.27 }, { toolId: 'image', usd: 0.5 }, { toolId: 'video', usd: 2.18 }, { toolId: 'image', usd: 0 }, { toolId: 'free', usd: 0 }]);
  assert.deepEqual(s.map((x) => x.toolId), ['video', 'image']); assert.equal(s[0].usd, 5.45); assert.equal(s[0].runs, 2); assert.equal(s[1].runs, 1);
  assert.ok(Math.abs(s[0].share - 5.45 / 5.95) < 1e-9); assert.ok(Math.abs(s[0].share + s[1].share - 1) < 1e-9);
  assert.deepEqual(shareByTool([]), []); ok('share of spend per tool (free runs left out, shares add to 1)'); }

// over-quote detection
{ const rows = [{ id: 'a', estUsd: 0.03, actualUsd: 0.33 }, { id: 'b', estUsd: 0.02, actualUsd: 0.025 }, { id: 'c', estUsd: 0.1, actualUsd: 0.25 }, { id: 'd', estUsd: 0, actualUsd: 1 }, { id: 'e', estUsd: 1, actualUsd: null }];
  const w = worstOverQuote(rows)!; assert.equal(w.row.id, 'a'); assert.ok(Math.abs(w.ratio - 11) < 1e-9); assert.equal(w.count, 2);
  assert.equal(worstOverQuote([{ estUsd: 1, actualUsd: 1.9 }]), null); assert.equal(worstOverQuote([]), null); ok('over-quote: worst run, count at 2× and up, no estimate or no bill ignored'); }

// quote accuracy + per-run hint
{ assert.equal(quoteAccuracy([]), null); assert.equal(quoteAccuracy([{ estUsd: 1, actualUsd: null }]), null);
  assert.deepEqual(quoteAccuracy([{ estUsd: 1, actualUsd: 1 }, { estUsd: 1, actualUsd: 0.5 }]), { pct: 75, runs: 2 });
  assert.deepEqual(quoteAccuracy([{ estUsd: 0.03, actualUsd: 0.33 }]), { pct: 9, runs: 1 });
  assert.equal(quoteHint(3.27, 3.27)!.text, 'on quote'); assert.equal(quoteHint(0.03, 0.33)!.text, '11× quote'); assert.equal(quoteHint(0.1, 0.25)!.text, '2.5× quote');
  assert.equal(quoteHint(0.02, 0.025)!.text, '+25% vs quote'); assert.equal(quoteHint(1, 0.6)!.text, '−40% vs quote'); assert.equal(quoteHint(1, 0.6)!.tone, 'under');
  assert.equal(quoteHint(0, 1), null); assert.equal(quoteHint(1, null), null); ok('quote accuracy (mean of min/max) and the per-run hint'); }

// "would have cost" tip, over-quote warning, only when the data supports it
{ const t = tipLines({ periodWords: 'this month', paidRuns: 30, top: { name: 'Generate Video', share: 0.85 }, shorter: { seconds: 6, fromSeconds: 15, usd: 1.31, fromUsd: 3.27 }, over: { ratio: 11, count: 1, name: 'Create Image' } });
  assert.equal(t.length, 2); assert.deepEqual(t[0], { tone: 'warn', text: 'One run cost 11× its quote (Create Image).' });
  assert.equal(t[1].text, 'Generate Video was 85% of this month. A 6-second clip instead of 15 s would have cost about $1.31 (not $3.27).');
  // no tip under half the spend, with one paid run, or when the shorter clip saves under 20 %
  assert.deepEqual(tipLines({ periodWords: 'this month', paidRuns: 30, top: { name: 'X', share: 0.4 } }), []);
  assert.deepEqual(tipLines({ periodWords: 'this month', paidRuns: 1, top: { name: 'X', share: 1 } }), []);
  assert.equal(tipLines({ periodWords: 'this month', paidRuns: 3, top: { name: 'X', share: 1 }, shorter: { seconds: 5, fromSeconds: 6, usd: 0.9, fromUsd: 1 } })[0].text, 'X was all of this month.');
  // one warning at most: over-quote wins over a failed charged run
  const w = tipLines({ periodWords: 'this month', paidRuns: 0, over: { ratio: 3, count: 4, name: 'Y' }, failedCharged: { runs: 2, usd: 0.4 } });
  assert.equal(w.length, 1); assert.match(w[0].text, /^4 runs cost at least twice their quote; the biggest gap was 3×/);
  assert.match(tipLines({ periodWords: 'this month', paidRuns: 0, failedCharged: { runs: 1, usd: 0.4 } })[0].text, /^One failed run still counted \$0\.40/);
  assert.deepEqual(tipLines({ periodWords: 'this month', paidRuns: 0 }), []); ok('tip lines: share, would-have-cost, over-quote, failed charged, nothing when the data is thin'); }

// periods, buckets, running total
{ const now = new Date(2026, 9, 24, 15, 0);
  assert.equal(periodStart('month', now), new Date(2026, 9, 1).getTime()); assert.equal(periodStart('7d', now), new Date(2026, 9, 18).getTime());
  assert.equal(periodStart('all', now, new Date(2026, 6, 3, 9).getTime()), new Date(2026, 6, 3).getTime()); assert.equal(periodStart('all', now, null), new Date(2026, 9, 24).getTime());
  const from = periodStart('month', now); const b = buckets([{ createdAt: new Date(2026, 9, 2, 10).getTime(), usd: 1 }, { createdAt: new Date(2026, 9, 24, 9).getTime(), usd: 2.5 }, { createdAt: new Date(2026, 9, 24, 9).getTime(), usd: 0 }], from, now.getTime());
  assert.equal(b.unit, 'day'); assert.equal(b.points.length, 24); assert.equal(b.points[1].usd, 1); assert.equal(b.points[23].usd, 2.5);
  assert.deepEqual(cumulative(b.points.map((p) => p.usd)).slice(-1), [3.5]);
  const long = buckets([{ createdAt: new Date(2026, 6, 5).getTime(), usd: 4 }], new Date(2026, 6, 3).getTime(), now.getTime()); assert.equal(long.unit, 'month'); assert.equal(long.points.length, 4); assert.equal(long.points[0].usd, 4);
  ok('period starts, daily / monthly buckets, running total'); }

// tile sizes
{ assert.deepEqual(tileSpans([3.27, 2.18, 1.12, 0.45, 0.42, 0.05, 0]), ['big', 'wide', 'wide', '', '', '', '']);
  assert.deepEqual(tileSpans([0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05]), Array(15).fill(''));
  assert.deepEqual(tileSpans([52.1, 0.05, 0.02]), ['big', '', '']); assert.deepEqual(tileSpans([1]), ['']); // one huge run grows; a lone tile stays
  assert.deepEqual(tileSpans([0, 0, 0, 0]), ['', '', '', '']); ok('tile sizes: the big spends grow, even spends and free tiles stay 1×1'); }
console.log('spend-insights: all ok');
