// Spending limits were removed (user decision 2026-10-28, D2: users control spend by how much they top up). This test pins the removal:
//  - a limit saved by an older version (a $0 daily cap on Comfy, a "warn above" amount) is ignored safely: the quote is runnable with no
//    limitBlock / warn, a submit runs (200), and GET /api/settings/billing no longer lists limits;
//  - PUT /api/settings/billing with an old client's `limits` is accepted and ignored (no 400, nothing saved);
//  - the spend summary has no cap / left fields; the Spend log keeps working.
// Run: npx tsx test/spend-limits.test.ts (port 9142; temp data dir, mock backend, mock keys, no network).
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.OPENHIGGSFIELD_COUNT_SIMULATED_SPEND = '1'; // mock runs count like real ones here (a real install never sets this)
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'spendlim-')); const ok = (m: string) => console.log('ok ' + m);
// an old install's saved limits, written before the server starts (same kv row the old Settings › Spend and limits wrote)
process.env.OPENHIGGSFIELD_DATA_DIR = D;
{ const db = await import('../src/db.js'); db.setKv('billing.settings', { mode: 'own-accounts', limits: { comfy: { dailyUsd: 0, monthlyUsd: 0, warnAboveUsd: 0 } } }); }
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_BILLING_MODE: '' };
const PORT = testPort(9142); const B = `http://localhost:${PORT}`;
const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PATH: `/opt/homebrew/bin:${process.env.PATH}`, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_MOCK_DELAY_MS: '50', OPENHIGGSFIELD_HOSTED: '' }, stdio: 'ignore', detached: true });
const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
const putJ = async (u: string, b: unknown) => { const r = await fetch(B + u, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, body: (await r.json()) as any }; };
const submit = async (extra: Record<string, string> = {}) => { const f = new FormData(); for (const [k, v] of Object.entries({ prompt: 'a calm lake', provider: 'api-seedream', types: '["generate"]', rights: '1', ...extra })) f.set(k, v);
  const r = await fetch(`${B}/api/tools/create-image/jobs`, { method: 'POST', body: f }); return { status: r.status, body: (await r.json()) as any }; };
const waitEnd = async (id: string) => { for (let i = 0; i < 80; i++) { const j = await get(`/api/jobs/${id}`); if (!['queued', 'running'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 250)); } throw new Error('job did not end'); };
const Q = '/api/tools/create-image/price?provider=api-seedream';
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  const s0 = await get('/api/settings/billing'); assert.equal(s0.limits, undefined, 'no limits in the settings'); assert.equal(s0.limitProviders, undefined); assert.equal(s0.mode, 'own-accounts', 'the old row\'s mode still reads');
  ok('an old saved $0 cap is not listed any more');
  const q = await get(Q); assert.equal(q.runnable, true, JSON.stringify(q)); assert.equal(q.limitBlock, undefined); assert.notEqual(q.blockedCode, 'spend_limit'); assert.equal(q.warn, undefined); assert.ok(q.cost.estUsd > 0);
  ok(`quote under an old $0 cap: runnable, no limitBlock, no warn (≈ $${q.cost.estUsd})`);
  for (let k = 0; k < 2; k++) { const r = await submit(); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal((await waitEnd(r.body.id)).status, 'done'); }
  ok('two paid runs over the old $0 cap: both run (never 400 spend_limit)');
  const put = await putJ('/api/settings/billing', { limits: { comfy: { dailyUsd: 0 }, local: { dailyUsd: -1 } } }); assert.equal(put.status, 200, JSON.stringify(put.body)); assert.equal(put.body.limits, undefined);
  assert.equal((await get(Q)).runnable, true);
  ok('PUT with an old client\'s limits (even invalid ones): 200, ignored');
  const sum = await get('/api/spend/summary?period=day'); const c = sum.providers.find((x: any) => x.provider === 'comfy'); assert.ok(c && c.spentUsd > 0, JSON.stringify(sum)); assert.equal(c.capUsd, undefined); assert.equal(c.leftUsd, undefined);
  assert.ok(((await get('/api/spend?limit=10')).items as any[]).length >= 2, 'the Spend log keeps every run');
  ok(`summary: spent $${c.spentUsd}, no cap / left; the Spend log stays`);
  console.log('ALL OK spend-limits');
} finally { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* */ } fs.rmSync(D, { recursive: true, force: true }); }
