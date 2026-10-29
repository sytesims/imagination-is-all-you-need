// Agent budgets (agentBudget.ts): POST /api/agent/budgets, X-OHF-Agent-Budget on quotes and submits, refusal BEFORE a job exists (nothing reaches a
// provider), local runs at $0, unknown ids fail closed, team-mode credit budgets, receipts, the Spend agent filter, POST /api/compose, job.agent.
// Run: npx tsx test/agent-budget.test.ts (port 9171; temp data dir, mock backend, mock keys, no network; needs ffmpeg on PATH).
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
// These tests exercise spend limits on the mock backend, so mock runs must count like real ones here (a real install never sets this).
process.env.OPENHIGGSFIELD_COUNT_SIMULATED_SPEND = '1';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbudget-')); const ok = (m: string) => console.log('ok ' + m);
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_BILLING_MODE: '' };
const PORT = testPort(9171); const B = `http://localhost:${PORT}`; const HDR = 'x-ohf-agent-budget';
const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PATH: `/opt/homebrew/bin:${process.env.PATH}`, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, '.env.local'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_MOCK_DELAY_MS: '50', OPENHIGGSFIELD_HOSTED: '', OPENHIGGSFIELD_USE_LOCAL: '' }, stdio: 'ignore', detached: true });
const get = async (u: string, h: Record<string, string> = {}) => (await (await fetch(B + u, { headers: h })).json()) as any;
const postJ = async (u: string, b: unknown, h: Record<string, string> = {}) => { const r = await fetch(B + u, { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(b) }); return { status: r.status, body: (await r.json()) as any }; };
const putJ = async (u: string, b: unknown) => { const r = await fetch(B + u, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, body: (await r.json()) as any }; };
const VIDEO = { prompt: 'a ceramic mug turning on a table', model: 'minimax-h3', runOn: 'comfy-cloud', duration: '6', types: '["t2v"]' };
const submit = async (h: Record<string, string>, extra: Record<string, string> = {}) => { const f = new FormData(); for (const [k, v] of Object.entries({ ...VIDEO, ...extra })) f.set(k, v);
  const r = await fetch(`${B}/api/tools/h3-video/jobs`, { method: 'POST', body: f, headers: h }); return { status: r.status, body: (await r.json()) as any }; };
const waitEnd = async (id: string) => { for (let i = 0; i < 160; i++) { const j = await get(`/api/jobs/${id}`); if (!['queued', 'running'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 250)); } throw new Error('job did not end'); };
const Q = '/api/tools/h3-video/price?model=minimax-h3&runOn=comfy-cloud&duration=6&types=%5B%22t2v%22%5D';
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  // validation
  for (const [body, why] of [[{ budgetUsd: 2 }, 'no name'], [{ name: 'x' }, 'no amount'], [{ name: 'x', budgetUsd: -1 }, 'negative'], [{ name: 'x'.repeat(61), budgetUsd: 1 }, 'long name']] as const) {
    const r = await postJ('/api/agent/budgets', body); assert.equal(r.status, 400, why); assert.equal(r.body.errorType, 'validation', why); }
  ok('POST /api/agent/budgets validation: name and an amount are required, no negatives');

  const q0 = await get(Q); const est = q0.cost.estUsd; assert.ok(est > 0, `paid route expected: ${JSON.stringify(q0.cost)}`); assert.equal(q0.agentBudget, undefined, 'no header → no agentBudget');
  const cr = await postJ('/api/agent/budgets', { name: 'Claude', budgetUsd: Math.round(est * 2.5 * 100) / 100 }); assert.equal(cr.status, 201); const b = cr.body; assert.match(b.id, /^ab_/); assert.equal(b.spentUsd, 0);
  const H = { [HDR]: b.id };
  const q1 = await get(Q, H); assert.equal(q1.agentBudget.fits, true); assert.equal(q1.agentBudget.thisRunUsd, est); assert.equal(q1.agentBudget.remainingUsd, b.budgetUsd);
  ok(`quote with the header: agentBudget {fits, thisRunUsd $${est}, remaining $${b.budgetUsd}}`);

  const ids: string[] = [];
  for (let i = 0; i < 2; i++) { const r = await submit(H); assert.equal(r.status, 200, JSON.stringify(r.body)); ids.push(r.body.id); }
  const jobsBefore = (await get('/api/jobs?limit=200')).length; const spendBefore = (await get('/api/spend?limit=200')).total;
  const q2 = await get(Q, H); assert.equal(q2.runnable, false); assert.equal(q2.blockedCode, 'agent_budget'); assert.equal(q2.agentBudget.fits, false); assert.equal(q2.credits, q0.credits, 'price stays on a blocked quote');
  ok('quote over the budget: runnable:false, blockedCode agent_budget (the price stays)');
  const r3 = await submit(H); assert.equal(r3.status, 400); assert.equal(r3.body.errorType, 'limit'); assert.equal(r3.body.code, 'agent_budget');
  assert.equal(r3.body.neededUsd, est); assert.equal(r3.body.remainingUsd, Math.round((b.budgetUsd - 2 * est) * 10000) / 10000); assert.equal(r3.body.charged, false); assert.match(r3.body.error, /Nothing was sent to a provider/);
  assert.equal((await get('/api/jobs?limit=200')).length, jobsBefore, 'no job created'); assert.equal((await get('/api/spend?limit=200')).total, spendBefore, 'no spend row');
  ok(`submit over the budget: 400 limit/agent_budget, needed $${r3.body.neededUsd}, left $${r3.body.remainingUsd}; no job, no spend row (nothing reached a provider)`);

  const rl = await submit(H, { runOn: 'local' }); assert.equal(rl.status, 200, JSON.stringify(rl.body)); assert.equal(rl.body.estimate.billedTo, 'local'); ids.push(rl.body.id);
  ok('a local run still fits an almost-spent budget ($0)');
  for (const id of ids) { const j = await waitEnd(id); assert.equal(j.status, 'done'); assert.equal(j.agent.id, b.id); assert.equal(j.agent.name, 'Claude'); assert.equal(j.agent.budgetUsd, b.budgetUsd); }
  ok('jobs carry agent {id, name, budgetUsd, spentUsd}');

  // unknown / closed ids fail closed
  const bad = await submit({ [HDR]: 'ab_nope' }); assert.equal(bad.status, 400); assert.equal(bad.body.code, 'agent_budget_unknown');
  const qb = await get(Q, { [HDR]: 'ab_nope' }); assert.equal(qb.runnable, false); assert.equal(qb.blockedCode, 'agent_budget_unknown');
  ok('unknown budget id: quote blocked, submit 400 agent_budget_unknown (fails closed)');

  // compose ($0, local) + receipt
  const cmp = await postJ('/api/compose', { clips: ids, title: 'Mug ad' }, H); assert.equal(cmp.status, 200, JSON.stringify(cmp.body)); assert.equal(cmp.body.status, 'done'); assert.match(cmp.body.resultUrl, /^\/files\/.*\.mp4$/); assert.equal(cmp.body.cost, 0);
  assert.ok(cmp.body.durationSec > 0); const cj = await get(`/api/jobs/${cmp.body.id}`); assert.equal(cj.status, 'done'); assert.equal(cj.agent.id, b.id);
  const cbad = await postJ('/api/compose', { clips: ['nope'] }); assert.equal(cbad.status, 400);
  ok(`POST /api/compose: ${ids.length} clips → ${cmp.body.durationSec}s mp4, a done job with agent; bad clip → 400`);
  const rc = await get(`/api/agent/budgets/${b.id}/receipt`);
  assert.equal(rc.items.length, 4); assert.equal(rc.refusals.length, 1); assert.equal(rc.totals.spentUsd, Math.round(2 * est * 10000) / 10000); assert.equal(rc.totals.budgetUsd, b.budgetUsd);
  assert.equal(rc.items.filter((i: any) => i.billedTo === 'nobody (free)').length, 2, 'local run + compose are free'); assert.ok(rc.items.every((i: any) => i.outputs.length > 0));
  ok(`receipt: ${rc.items.length} items, 1 refusal, spent $${rc.totals.spentUsd} of $${rc.totals.budgetUsd}`);

  const sp = await get(`/api/spend?agent=${b.id}`); assert.equal(sp.total, 4); assert.ok(sp.items.every((r: any) => r.agentName === 'Claude'));
  const none = await get('/api/spend?agent=none'); assert.ok(none.items.every((r: any) => !r.agentId)); const list = await get('/api/agent/budgets'); assert.ok(list.items.some((x: any) => x.id === b.id));
  ok('GET /api/spend?agent=<id>|any|none filters; rows carry agentName');

  // close
  const cl = await postJ(`/api/agent/budgets/${b.id}/close`, {}); assert.equal(cl.body.closed, true); const after = await submit(H, { runOn: 'local' }); assert.equal(after.body.code, 'agent_budget_unknown');
  ok('closed budget refuses later runs');

  // team mode: credit budgets
  await putJ('/api/settings/billing', { mode: 'team' });
  const tb = (await postJ('/api/agent/budgets', { name: 'Team bot', budgetCredits: q0.credits })).body; const TH = { [HDR]: tb.id };
  const t1 = await submit(TH); assert.equal(t1.status, 200, JSON.stringify(t1.body)); await waitEnd(t1.body.id);
  const t2 = await submit(TH); assert.equal(t2.status, 400); assert.equal(t2.body.code, 'agent_budget'); assert.equal(t2.body.neededCredits, q0.credits); assert.equal(t2.body.remainingCredits, 0);
  ok(`team mode: a ${q0.credits}-credit budget allows one run, refuses the second`);
  await putJ('/api/settings/billing', { mode: 'own-accounts' });
  console.log('ALL OK agent-budget');
} finally { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* */ } fs.rmSync(D, { recursive: true, force: true }); }
