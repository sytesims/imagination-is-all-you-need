// Savings locally: a free local run stores what the cheapest hosted route for the same model and settings was quoted at submit
// (job.savedUsd + job.savedVs, copied onto its spend row), and GET /api/spend/summary totals it for finished runs. A model with no hosted
// route stores nothing (no made-up saving). Unit part: localSavingsOf only counts hosted routes that could really take the job.
// Run: npx tsx test/local-savings.test.ts (port 9171; temp data dir, mock backend, Local on, no keys, no network).
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const ok = (m: string) => console.log('ok ' + m);
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_BILLING_MODE: '', OPENHIGGSFIELD_MINIMAX_API_KEY: '', OPENHIGGSFIELD_DASHSCOPE_API_KEY: '' };
const DU = fs.mkdtempSync(path.join(os.tmpdir(), 'savings-unit-')); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'savings-'));
const ENVF = path.join(D, 'scratch.env'); fs.writeFileSync(ENVF, '');
Object.assign(process.env, NOKEYS, { OPENHIGGSFIELD_DATA_DIR: DU, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_ENV_FILE: ENVF });
// ---- unit part ----
{
  const BL = await import('../src/billing.ts');
  const o = (routeId: string, kind: string, credits: number | null, available: boolean, reasonCode?: string) => ({ routeId, kind, credits, available, reasonCode, envKey: null });
  assert.equal(BL.localSavingsOf([o('local:a', 'local', 0, true)]), null, 'local only: nothing');
  assert.equal(BL.localSavingsOf([o('local:a', 'local', 0, true), o('fal:x', 'fal', 8, false, 'not_wired'), o('fal:y', 'fal', 4, false, 'input_blocked'), o('fal:z', 'fal', null, false)]), null, 'not wired / input-blocked / unpriced routes are no alternative');
  const s = BL.localSavingsOf([o('local:a', 'local', 0, true), o('replicate:r', 'replicate', 9, false, 'key_missing'), o('fal:f', 'fal', 6, true), o('comfy-router:c', 'comfy-router', 12, true)]);
  assert.deepEqual(s, { savedUsd: 0.06, vs: { routeId: 'fal:f', runOn: 'fal', label: 'fal', credits: 6 } }, 'the cheapest hosted route (ready or only missing a key)');
  ok('localSavingsOf: cheapest real hosted alternative; none when only local, not wired, input-blocked or unpriced');
}
// ---- HTTP part ----
const PORT = testPort(9171); const B = `http://localhost:${PORT}`;
const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PATH: `/opt/homebrew/bin:${process.env.PATH}`, PORT: String(PORT), HOST: '127.0.0.1', OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: ENVF,
  OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_USE_LOCAL: '1', OPENHIGGSFIELD_HW_MOCK: 'mac36', OPENHIGGSFIELD_MOCK_KEYS: '', OPENHIGGSFIELD_MOCK_DELAY_MS: '50', OPENHIGGSFIELD_HOSTED: '' }, stdio: 'ignore', detached: true });
const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
const submit = async (provider: string) => { const f = new FormData(); for (const [k, v] of Object.entries({ prompt: 'a calm lake at dawn', rights: '1', provider, types: '["generate"]' })) f.set(k, v);
  const r = await fetch(`${B}/api/tools/create-image/jobs`, { method: 'POST', body: f }); return { status: r.status, body: (await r.json()) as any }; };
const waitEnd = async (id: string) => { for (let i = 0; i < 80; i++) { const j = await get(`/api/jobs/${id}`); if (!['queued', 'running'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 250)); } throw new Error('job did not end'); };
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 500)); }
  // Z-Image Turbo runs locally and also on fal / Replicate (keys missing here: still a real alternative once a key is added)
  const a = await submit('comfy-zimage-turbo'); assert.equal(a.status, 200, JSON.stringify(a.body)); assert.match(a.body.route, /^local:/);
  // Z-Image (base) runs locally only
  const b = await submit('comfy-zimage'); assert.equal(b.status, 200, JSON.stringify(b.body)); assert.match(b.body.route, /^local:/);
  const ja = await waitEnd(a.body.id); const jb = await waitEnd(b.body.id); assert.equal(ja.status, 'done'); assert.equal(jb.status, 'done');
  assert.ok(ja.savedUsd > 0, `savedUsd stored: ${ja.savedUsd}`); assert.equal(ja.cost, 0, 'the local run itself is free');
  assert.ok(['fal', 'replicate'].includes(ja.savedVs?.runOn), JSON.stringify(ja.savedVs)); assert.match(ja.savedVs.routeId, /^(fal|replicate):/); assert.equal(ja.savedUsd, ja.savedVs.credits / 100);
  const q = await get(`/api/tools/create-image/price?${new URLSearchParams({ provider: 'comfy-zimage-turbo', prompt: 'a calm lake at dawn', types: '["generate"]', route: ja.savedVs.routeId })}`);
  if (typeof q.credits === 'number' && q.credits > 0) assert.equal(ja.savedVs.credits, q.credits, 'the same price the hosted quote gives');
  assert.equal(ja.machine, 'M3 Max', 'machine name for Local');
  ok(`local job with a hosted alternative stores savedUsd (${ja.savedUsd} vs ${ja.savedVs.label}) and the machine`);
  assert.equal(jb.savedUsd, null, 'no hosted route → no saving'); assert.equal(jb.savedVs, null);
  ok('local job without a hosted alternative stores none');
  const rows = (await get('/api/spend')).items as any[]; const ra = rows.find((r) => r.jobId === ja.id); const rb = rows.find((r) => r.jobId === jb.id);
  assert.equal(ra.billedTo, 'local'); assert.equal(ra.savedUsd, ja.savedUsd); assert.equal(rb.savedUsd, undefined);
  const sum = await get('/api/spend/summary?period=month'); /* this run is a mock sample (nothing generated), so it is stored but not counted as a real saving */ assert.equal(sum.totals.savedUsd, 0); assert.equal(sum.totals.savedRuns, 0); assert.equal(sum.totals.spentUsd, 0);
  ok('spend row carries savedUsd; the month summary leaves sample runs out of savings and spends $0');
} finally { try { process.kill(-p.pid!); } catch { /* gone */ } }
