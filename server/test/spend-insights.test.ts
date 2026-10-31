// Spend page (Gallery) maths, pure functions in src/shared/spendInsights.ts: share of spend per tool, the "would have cost" tip,
// over-quote detection, quote accuracy and hints, period starts, sparkline buckets and mosaic tile sizes.
// Run: npx tsx test/spend-insights.test.ts (no server, no data dir).
import assert from 'node:assert/strict';
import { periodStart, buckets, cumulative, quoteHint, quoteAccuracy, overQuoteByTool, priceFixedNow, shareByTool, tileSpans, tipLines } from '../src/shared/spendInsights.ts';
const ok = (m: string) => console.log('ok ' + m);

// share of spend
{ const s = shareByTool([{ toolId: 'video', usd: 3.27 }, { toolId: 'image', usd: 0.5 }, { toolId: 'video', usd: 2.18 }, { toolId: 'image', usd: 0 }, { toolId: 'free', usd: 0 }]);
  assert.deepEqual(s.map((x) => x.toolId), ['video', 'image']); assert.equal(s[0].usd, 5.45); assert.equal(s[0].runs, 2); assert.equal(s[1].runs, 1);
  assert.ok(Math.abs(s[0].share - 5.45 / 5.95) < 1e-9); assert.ok(Math.abs(s[0].share + s[1].share - 1) < 1e-9);
  assert.deepEqual(shareByTool([]), []); ok('share of spend per tool (free runs left out, shares add to 1)'); }

// over-quote detection: per tool, at least 2× AND at least $0.05 over, biggest dollar gap first
{ const rows = [{ id: 'a', toolId: 'layers', estUsd: 0.03, actualUsd: 0.33 }, { id: 'b', toolId: 'img', estUsd: 0.02, actualUsd: 0.025 }, { id: 'c', toolId: 'layers', estUsd: 0.1, actualUsd: 0.25 },
    { id: 'd', toolId: 'img', estUsd: 0, actualUsd: 1 }, { id: 'e', toolId: 'img', estUsd: 1, actualUsd: null }, { id: 'tiny', toolId: 'img', estUsd: 0.01, actualUsd: 0.02 },
    { id: 'v', toolId: 'video', estUsd: 1, actualUsd: 2.5 }];
  const g = overQuoteByTool(rows);
  assert.deepEqual(g.map((x) => x.toolId), ['video', 'layers']); // img's only 2× run is a 1-cent gap: ignored
  assert.equal(g[0].gapUsd, 1.5); assert.equal(g[1].row.id, 'a'); assert.ok(Math.abs(g[1].ratio - 11) < 1e-9); assert.equal(g[1].count, 2); assert.equal(g[1].gapUsd, 0.45);
  assert.deepEqual(overQuoteByTool([{ toolId: 'x', estUsd: 1, actualUsd: 1.9 }]), []); assert.deepEqual(overQuoteByTool([]), []);
  assert.equal(overQuoteByTool([{ toolId: 'x', estUsd: 0.01, actualUsd: 0.02 }], 2, 0).length, 1);
  assert.equal(priceFixedNow({ actualUsd: 0.33, nowUsd: 0.4 }), true); assert.equal(priceFixedNow({ actualUsd: 0.33, nowUsd: 0.03 }), false); assert.equal(priceFixedNow({ actualUsd: 0.33 }), false); assert.equal(priceFixedNow({ actualUsd: 0.25, nowUsd: 0.64 }), false);
  ok('over-quote: per tool, worst run, count, dollar gap; 1-cent gaps and missing figures ignored'); }

// quote accuracy + per-run hint
{ assert.equal(quoteAccuracy([]), null); assert.equal(quoteAccuracy([{ estUsd: 1, actualUsd: null }]), null);
  assert.deepEqual(quoteAccuracy([{ estUsd: 1, actualUsd: 1 }, { estUsd: 1, actualUsd: 0.5 }]), { pct: 75, runs: 2 });
  assert.deepEqual(quoteAccuracy([{ estUsd: 0.03, actualUsd: 0.33 }]), { pct: 9, runs: 1 });
  assert.equal(quoteHint(3.27, 3.27)!.text, 'on quote'); assert.equal(quoteHint(0.03, 0.33)!.text, '11× quote'); assert.equal(quoteHint(0.1, 0.25)!.text, '2.5× quote');
  assert.equal(quoteHint(0.02, 0.025)!.text, '+25% vs quote'); assert.equal(quoteHint(1, 0.6)!.text, '−40% vs quote'); assert.equal(quoteHint(1, 0.6)!.tone, 'under');
  assert.equal(quoteHint(0, 1), null); assert.equal(quoteHint(1, null), null); ok('quote accuracy (mean of min/max) and the per-run hint'); }

// notices: warnings by dollars (over-quote, failed runs counted), then the tip; only when the data supports them
{ const ov = (o: Partial<{ toolId: string; name: string; ratio: number; count: number; gapUsd: number; estUsd: number; actualUsd: number; nowUsd: number | null }>) =>
    ({ toolId: 'x', jobId: 'j-' + (o.name ?? 'x'), name: 'X', ratio: 3, count: 1, gapUsd: 0.3, estUsd: 0.15, actualUsd: 0.45, ...o });
  const t = tipLines({ periodWords: "this month's spend", paidRuns: 30, top: { name: 'Generate Video', share: 0.62 }, shorter: { seconds: 5, fromSeconds: 15, usd: 1.09, fromUsd: 3.27 },
    over: [ov({ name: 'Image to layers', ratio: 11, gapUsd: 0.3, estUsd: 0.03, actualUsd: 0.33 })] });
  assert.equal(t.length, 2); assert.deepEqual(t[0], { tone: 'warn', kind: 'over', head: 'Image to layers ran 11× over', text: 'One Image to layers run cost 11× its quote ($0.33, quoted $0.03).', usd: 0.3, jobId: 'j-Image to layers' });
  assert.equal(t[1].text, "Generate Video was 62% of this month's spend. Each 15\u00a0s clip cost about $3.27; at 5\u00a0s it'd be about $1.09."); assert.equal(t[1].kind, 'tip');
  // the price was corrected since: today's quote for the same settings covers the bill
  assert.match(tipLines({ periodWords: 'p', paidRuns: 0, over: [ov({ name: 'L', nowUsd: 0.5 })] })[0].text, /That price is fixed now: the same settings quote \$0\.50 today\.$/);
  assert.doesNotMatch(tipLines({ periodWords: 'p', paidRuns: 0, over: [ov({ name: 'L', nowUsd: 0.15 })] })[0].text, /fixed/);
  // several warnings: biggest dollar amount first, failed runs no longer hidden by a small over-quote gap, at most maxWarn
  const w = tipLines({ periodWords: 'p', paidRuns: 0, over: [ov({ name: 'Y', ratio: 3, count: 4, gapUsd: 0.3 }), ov({ name: 'Z', gapUsd: 2 })], failedCharged: { runs: 16, usd: 14.84 } });
  assert.deepEqual(w.map((x) => x.kind), ['failed', 'over', 'over']); assert.match(w[0].text, /^16 failed runs still counted \$14\.84/);
  assert.match(w[2].text, /^4 Y runs cost at least twice their quote, \$0\.30 over in all; the biggest gap was 3×\.$/);
  assert.equal(tipLines({ periodWords: 'p', paidRuns: 0, over: [ov({}), ov({}), ov({})], failedCharged: { runs: 1, usd: 0.4 } }).length, 3);
  assert.equal(tipLines({ periodWords: 'p', paidRuns: 0, over: [ov({}), ov({})], failedCharged: { runs: 1, usd: 0.4 } }, 2).length, 2);
  // no tip under half the spend, with one paid run, or when the shorter clip saves under 20 %
  assert.deepEqual(tipLines({ periodWords: 'this month', paidRuns: 30, top: { name: 'X', share: 0.4 } }), []);
  assert.deepEqual(tipLines({ periodWords: 'this month', paidRuns: 1, top: { name: 'X', share: 1 } }), []);
  assert.equal(tipLines({ periodWords: 'all your spend', paidRuns: 3, top: { name: 'X', share: 1 }, shorter: { seconds: 5, fromSeconds: 6, usd: 0.9, fromUsd: 1 } })[0].text, 'X was all of all your spend.');
  assert.equal(tipLines({ periodWords: 'p', paidRuns: 0, failedCharged: { runs: 1, usd: 0.4 } })[0].text, 'One failed run still counted $0.40 at its estimate: the provider may bill failed runs.');
  assert.match(tipLines({ periodWords: 'p', paidRuns: 0, failedCharged: { runs: 2, usd: 3, providers: ['Comfy Cloud', 'fal'] } })[0].text, /: Comfy Cloud and fal may bill failed runs\.$/);
  assert.deepEqual(tipLines({ periodWords: 'p', paidRuns: 0 }), []); ok('notices: warnings by dollars with their action kind, fixed-price note, share tip, nothing when the data is thin'); }

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
