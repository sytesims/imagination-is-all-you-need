// Ledger reconciliation (temp DATA_DIR, no server): /api/usage totals = balance; two processes on one DB can't double-refund.
// Run: npx tsx test/ledger-reconcile.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'led-')); process.env.OPENHIGGSFIELD_DATA_DIR = D; process.env.OPENHIGGSFIELD_BACKEND = 'mock'; process.env.OPENHIGGSFIELD_BILLING_MODE = 'team'; // the credit ledger charges only in team mode (real-cost decision 2026-10-21)
const W = path.resolve(import.meta.dirname, 'fixtures/ledger-worker.mts');
const child = (...a: string[]) => execFileSync('npx', ['tsx', W, ...a], { env: { ...process.env, OPENHIGGSFIELD_DATA_DIR: D }, cwd: path.resolve(import.meta.dirname, '..') }).toString();
const L = await import('../src/ledger.js'); const { put } = await import('../src/db.js');

L.grant(1000, 'topup'); L.charge('j1', 'object-swap', 'router-veo', 400); L.refund('j1', 'failed'); L.charge('j2', 'object-swap', 'router-veo', 300);
{ const t = L.usageTotals(); assert.equal(t.reconciles, true); assert.equal(t.computed, t.balance); assert.equal(t.discrepancies.length, 0); assert.equal(t.buckets.reconciles, true, JSON.stringify(t.buckets)); }

// second process (same DB) charges + refunds; this process then refunds the same job: one refund row only, ids unique
L.charge('j3', 'object-swap', 'router-veo', 400); const b0 = L.getBalance();
assert.match(child('refund', 'j3'), /refunded 400/);
assert.equal(L.refund('j3', 'failed (temporary): auto-refund'), 0, 'second process already refunded j3');
assert.equal(L.refundAttempt('j3', 1, 400), 0); assert.equal(L.refundPartial('j3', 100, 'x'), 0);
{ const rows = L.ledger().entries.filter((e: any) => e.jobId === 'j3'); assert.equal(rows.filter((e: any) => e.kind === 'refund').length, 1); assert.equal(L.getBalance(), b0 + 400);
  const ids = L.ledger().entries.map((e: any) => e.id); assert.equal(new Set(ids).size, ids.length); }
// other process writes while we hold a stale seq: our next write gets a fresh id (no overwrite)
child('charge', 'j4', '50'); L.charge('j5', 'object-swap', 'router-veo', 20);
{ const e = L.ledger().entries; assert.ok(e.some((x: any) => x.jobId === 'j4') && e.some((x: any) => x.jobId === 'j5')); const t = L.usageTotals(); assert.equal(t.reconciles, true); assert.equal(t.discrepancies.length, 0, JSON.stringify(t.discrepancies)); }
console.log('ok two processes on one DB: one refund row, unique ids, totals reconcile');

// legacy phantom row (the live 2026-10-17 shape: refund recorded but balance unchanged) → listed, totals still reconcile
{ const last = L.ledger().entries[0]; put('ledger', last.id + 1, { id: last.id + 1, ts: Date.now(), kind: 'refund', amount: 400, balance: last.balance, jobId: 'j1', note: 'dup' });
  const t = L.usageTotals(); assert.equal(t.reconciles, true); assert.equal(t.unaccounted, 0); assert.equal(t.recordedDrift, 400); assert.deepEqual(t.discrepancies.map((d: any) => [d.jobId, d.amount, d.effective]), [['j1', 400, 0]]);
  console.log(`ok phantom duplicate refund listed (${JSON.stringify(t.discrepancies[0])}); granted ${t.granted} − charged ${t.charged} + refunded ${t.refunded} − expired ${t.expired} = ${t.computed} = balance ${t.balance}`); }
// expire (dev set balance down) counted
{ L.setBalanceDev(L.getBalance() - 10); const t = L.usageTotals(); assert.equal(t.reconciles, true); assert.ok(t.expired >= 10); }
// one-time bucket repair: buckets drifted below the balance (the live −407 shape) → one repair credits exactly the gap, balance and
// ledger rows untouched, listed in discrepancies with date/amount/reason; second call is a no-op (also after a module reload)
{ const R = 'one-time bucket repair (dual-process overlap, Oct 17 2026)'; const { getKv, setKv } = await import('../src/db.js');
  // the child process above refunded j3 (+400) and charged j4 (−50) into its OWN buckets → ours are 350 short (the real bug);
  // push it to the live −407 shape in the persisted buckets, then reload the module from the DB
  { const t = L.usageTotals(); assert.equal(t.buckets.drift, -350, JSON.stringify(t.buckets)); }
  const bk = getKv<any[]>('creditBuckets', []); const big = bk.reduce((m, b) => (b.remaining > m.remaining ? b : m)); big.remaining -= 57; setKv('creditBuckets', bk);
  const L2 = await import(`../src/ledger.js?reload=${Date.now()}`);
  const t0 = L2.usageTotals(); assert.equal(t0.buckets.drift, -407); assert.equal(t0.buckets.reconciles, false);
  const bal0 = L2.getBalance(); const rows0 = L2.ledger().entries.length; const disc0 = t0.discrepancies.length;
  const r = L2.repairBucketGap('2026-10-17-dual-process', R); assert.equal(r.applied, true); assert.equal(r.gap, 407);
  const t1 = L2.usageTotals(); assert.equal(t1.buckets.reconciles, true, JSON.stringify(t1.buckets)); assert.equal(t1.buckets.drift, 0); assert.equal(t1.buckets.remaining - t1.buckets.overdraft, t1.balance);
  assert.equal(t1.reconciles, true); assert.equal(L2.getBalance(), bal0, 'balance unchanged'); assert.equal(L2.ledger().entries.length, rows0, 'no ledger row written or removed');
  const d = t1.discrepancies.at(-1); assert.equal(t1.discrepancies.length, disc0 + 1); assert.equal(d.kind, 'bucket-repair'); assert.equal(d.amount, 407); assert.equal(d.note, R); assert.match(d.date, /^\d{4}-\d\d-\d\dT/);
  assert.equal(L2.listBuckets().filter((b: any) => b.id === 'repair-2026-10-17-dual-process').length, 1);
  const again = L2.repairBucketGap('2026-10-17-dual-process', R); assert.equal(again.applied, false); assert.equal(again.repair.amount, 407);
  assert.deepEqual(L2.repairBucketGap('other-key', R), { applied: false, gap: 0, repair: null }, 'zero gap → no-op, nothing recorded');
  const L3 = await import(`../src/ledger.js?reload=${Date.now() + 1}`); assert.equal(L3.repairBucketGap('2026-10-17-dual-process', R).applied, false, 'no-op after reload');
  const t2 = L3.usageTotals(); assert.equal(t2.discrepancies.filter((x: any) => x.kind === 'bucket-repair').length, 1); assert.equal(t2.buckets.reconciles, true); assert.equal(L3.listBuckets().filter((b: any) => b.id.startsWith('repair-')).length, 1);
  console.log(`ok bucket repair: gap ${r.gap} credited once (${JSON.stringify(d)}); rerun no-op; buckets ${t2.buckets.remaining} − ${t2.buckets.overdraft} = balance ${t2.balance}`); }
// Bucket source 'refund' (Usage panel): credits back whose original bucket was gone land in a refund-<job> bucket with source 'refund';
// the boot migration turns old refund-* buckets stored as 'topup' into 'refund' (idempotent); /api/ledger/grant never takes 'refund' (index.ts → 400).
{ const { getKv, setKv } = await import('../src/db.js');
  setKv('creditBuckets', [...getKv<any[]>('creditBuckets', []), { id: 'refund-legacy', source: 'topup', amount: 7, remaining: 0, expiresAt: null, createdAt: 1 }]);
  const M1 = await import(`../src/ledger.js?reload=${Date.now() + 11}`); assert.equal(M1.listBuckets().find((b: any) => b.id === 'refund-legacy')?.source, 'refund');
  assert.equal(getKv<any[]>('creditBuckets', []).find((b) => b.id === 'refund-legacy')?.source, 'refund', 'migration is saved');
  const n1 = M1.listBuckets().length; const M2 = await import(`../src/ledger.js?reload=${Date.now() + 12}`);
  assert.equal(M2.listBuckets().length, n1); assert.equal(M2.listBuckets().filter((b: any) => b.source === 'refund').length, M1.listBuckets().filter((b: any) => b.source === 'refund').length, 'idempotent');
  M2.charge('jgone', 'object-swap', 'router-veo', 30); const use = getKv<Record<string, unknown>>('bucketUse', {}); delete use.jgone; setKv('bucketUse', use); // the original bucket record is gone
  const M3 = await import(`../src/ledger.js?reload=${Date.now() + 13}`); assert.equal(M3.refund('jgone', 'failed'), 30);
  const rb = M3.listBuckets().find((b: any) => b.id === 'refund-jgone'); assert.equal(rb?.source, 'refund', JSON.stringify(rb)); assert.equal(rb.remaining, 30);
  assert.equal(M3.usageTotals().buckets.reconciles, true);
  console.log('ok bucket source refund: restore() → refund-<job> source refund; legacy refund-* topup → refund on boot (idempotent)'); }
console.log('ALL OK ledger-reconcile');
