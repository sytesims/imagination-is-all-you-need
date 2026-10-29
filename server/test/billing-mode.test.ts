// Real costs, not a fake balance (decision 2026-10-21): billingMode 'own-accounts' (default) vs 'team' (the old credit ledger).
// Own-accounts: quotes carry cost {billedTo, estUsd, estUnits (Comfy credits at 211/USD), failureRule, estimated}, the ✦ credits stay the same,
// nothing is charged to the app balance, failures say the provider's rule (no "credits back"). Team: charge + refund exactly as before.
// Run: npx tsx test/billing-mode.test.ts (port 9141; temp data dir, mock backend, mock keys, no network).
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'billmode-')); const ok = (m: string) => console.log('ok ' + m);
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_BILLING_MODE: '' };
const PORT = testPort(9141); const B = `http://localhost:${PORT}`;
const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PATH: `/opt/homebrew/bin:${process.env.PATH}`, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_MOCK_DELAY_MS: '50', OPENHIGGSFIELD_HOSTED: '' }, stdio: 'ignore', detached: true });
const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
const putJ = async (u: string, b: unknown) => { const r = await fetch(B + u, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, body: (await r.json()) as any }; };
const submit = async (extra: Record<string, string> = {}) => { const f = new FormData(); for (const [k, v] of Object.entries({ prompt: 'a calm lake', provider: 'api-seedream', types: '["generate"]', rights: '1', ...extra })) f.set(k, v);
  const r = await fetch(`${B}/api/tools/create-image/jobs`, { method: 'POST', body: f }); return { status: r.status, body: (await r.json()) as any }; };
const waitEnd = async (id: string) => { for (let i = 0; i < 80; i++) { const j = await get(`/api/jobs/${id}`); if (!['queued', 'running'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 250)); } throw new Error('job did not end'); };
const Q = '/api/tools/create-image/price?provider=api-seedream';
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  const s0 = await get('/api/settings/billing'); assert.equal(s0.mode, 'own-accounts'); assert.equal(s0.modeLocked, false); assert.deepEqual(s0.limits, {});
  assert.ok(s0.providers.some((x: any) => x.id === 'fal' && x.failureRule && x.billingUrl), 'provider billing info listed');
  assert.equal((await get('/api/config')).billingMode, 'own-accounts'); assert.equal((await get('/api/ledger')).billingMode, 'own-accounts');
  ok('default billing mode is own-accounts (settings, /api/config, /api/ledger)');

  const q = await get(Q); assert.equal(q.billingMode, 'own-accounts'); assert.equal(q.routeKind, 'comfy-router'); assert.ok(q.credits > 0);
  assert.equal(q.cost.billedTo, 'comfy'); assert.equal(q.cost.estUsd, q.credits / 100); assert.equal(typeof q.exactUsd, 'number'); assert.ok(q.exactUsd <= q.cost.estUsd, 'credits round up, never below the exact price');
  assert.equal(q.cost.estUnits, Math.ceil(Math.round(q.exactUsd * 211 * 100) / 100), 'Comfy credits come from the exact routed price (×211, rounded up), not from the rounded ✦ credits'); assert.equal(q.cost.unitLabel, 'Comfy credits');
  assert.equal(q.cost.failureRule, 'may-charge'); assert.equal(q.cost.estimated, true); assert.equal(q.warn, false);
  ok(`quote: ✦${q.credits} → cost {comfy, $${q.cost.estUsd}, ${q.cost.estUnits} Comfy credits, may-charge, estimated}`);

  const bal0 = (await get('/api/ledger')).balance; const r1 = await submit(); assert.equal(r1.status, 200, JSON.stringify(r1.body)); assert.equal(r1.body.billingMode, 'own-accounts');
  assert.equal(r1.body.cost, q.credits, 'cost (✦) field kept'); assert.equal(r1.body.estimate.billedTo, 'comfy');
  const j1 = await waitEnd(r1.body.id); assert.equal(j1.status, 'done', j1.error);
  const l1 = await get('/api/ledger'); assert.equal(l1.balance, bal0, 'own-accounts: the app balance is not charged'); assert.ok(!l1.entries.some((e: any) => e.jobId === r1.body.id), 'no ledger row for the job');
  ok('own-accounts submit: 200 with cost + estimate; no ledger charge');

  const r2 = await submit({ simulateRouteFail: 'comfy-router:api-seedream' }); const j2 = await waitEnd(r2.body.id); assert.equal(j2.status, 'failed');
  assert.ok(!/credits? (went )?back|back to your balance|refund/i.test(j2.error), `no credits-back promise: ${j2.error}`); assert.match(j2.error, /Comfy Cloud may still bill your account/);
  assert.equal(j2.refund.refunded, false); assert.ok(!(await get('/api/ledger')).entries.some((e: any) => e.kind === 'refund' && e.jobId === r2.body.id));
  ok('own-accounts failure: the provider rule in the message, no refund row');

  // team mode: the existing ledger, unchanged
  const bad = await putJ('/api/settings/billing', { mode: 'free' }); assert.equal(bad.status, 400);
  const t = await putJ('/api/settings/billing', { mode: 'team' }); assert.equal(t.status, 200); assert.equal(t.body.mode, 'team');
  const qt = await get(Q); assert.equal(qt.billingMode, 'team'); assert.equal(qt.credits, q.credits, 'the ✦ number is the same in both modes'); assert.equal(qt.cost.estUsd, q.cost.estUsd);
  const balT = (await get('/api/ledger')).balance; const r3 = await submit(); assert.equal(r3.status, 200); await waitEnd(r3.body.id);
  const lt = await get('/api/ledger'); assert.equal(lt.balance, balT - q.credits, 'team: charged'); assert.ok(lt.entries.some((e: any) => e.kind === 'charge' && e.jobId === r3.body.id));
  const r4 = await submit({ simulateRouteFail: 'comfy-router:api-seedream' }); const j4 = await waitEnd(r4.body.id); assert.equal(j4.status, 'failed');
  const lt2 = await get('/api/ledger'); assert.equal(lt2.balance, balT - q.credits, 'team: the failed run went back'); assert.ok(j4.refund.refunded && j4.refund.amount === q.credits, JSON.stringify(j4.refund));
  ok('team mode: charge on submit, refund on failure (ledger as before)');
  await fetch(`${B}/api/dev/balance`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ credits: 1 }) });
  const r5 = await submit(); assert.equal(r5.status, 402); assert.equal(r5.body.errorType, 'credits'); ok('team mode: not enough credits → 402 as before');
  const back = await putJ('/api/settings/billing', { mode: 'own-accounts' }); assert.equal(back.body.mode, 'own-accounts');
  const r6 = await submit(); assert.equal(r6.status, 200, 'own-accounts: no app balance to run out of'); await waitEnd(r6.body.id);
  ok('own-accounts again: a low app balance never blocks a run');
  // Your plans (prices in dollars, 2026-10-26): the Comfy plan is picked here (Comfy publishes no plan endpoint) and only shows in price details
  const p0 = await get('/api/settings/billing'); assert.equal(p0.plans.comfy.plan, null); assert.equal(p0.plans.comfy.source, null); assert.deepEqual(p0.plans.comfy.options.map((o: any) => o.id), ['standard', 'creator', 'pro', 'payg']);
  assert.equal((await putJ('/api/settings/billing', { comfyPlan: 'gold' })).status, 400);
  const p1 = await putJ('/api/settings/billing', { comfyPlan: 'creator' }); assert.equal(p1.status, 200); assert.equal(p1.body.plans.comfy.plan, 'creator'); assert.equal(p1.body.plans.comfy.source, 'picked'); assert.equal(p1.body.mode, 'own-accounts', 'mode kept');
  const qc = await get('/api/tools/h3-video/price?runOn=comfy-cloud&prompt=a%20fox');
  if (qc.cost?.billedTo === 'comfy') { assert.equal(qc.cost.plan, 'creator'); assert.match(qc.cost.usdText, /^≈ \$\d/); assert.match(String(qc.cost.detail), /Comfy credits · on your Creator plan/); assert.ok(!/credit/i.test(qc.cost.usdText)); }
  const p2 = await putJ('/api/settings/billing', { comfyPlan: null }); assert.equal(p2.body.plans.comfy.plan, null);
  ok('Your plans: pick / clear the Comfy plan (bad id → 400); a Comfy quote names it in its detail line, the $ text never says credits');
  console.log('ALL OK billing-mode');
} finally { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* */ } fs.rmSync(D, { recursive: true, force: true }); }
