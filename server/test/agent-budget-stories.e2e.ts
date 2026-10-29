// Agent budgets on the internal submit paths (AGENT-AUDIT gap 1): Director → Story (POST /api/stories, /retry) and Edit in place
// (POST /api/jobs/:id/edit) honour X-OHF-Agent-Budget like a direct submit:
//  - a story over what is left of the budget is refused (400 agent_budget) BEFORE any shot runs: no story, no shot job, no spend row;
//  - a story that fits runs, every shot goes through the guard with the header, so each shot is tagged with the agent and on the receipt;
//  - an edit over the budget is refused (nothing created); one that fits runs, tagged with the agent, and is on the receipt.
// Run: npx tsx test/agent-budget-stories.e2e.ts (port 8837; temp data dir, mock backend + mock keys, simulated spend counted, no network; ffmpeg on PATH).
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.OPENHIGGSFIELD_COUNT_SIMULATED_SPEND = '1'; // mock runs count like real ones, so amounts are non-zero (a real install never sets this)
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbudget-stories-')); const ok = (m: string) => console.log('ok ' + m);
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_BILLING_MODE: '' };
const PORT = testPort(8837); const B = `http://localhost:${PORT}`; const HDR = 'x-ohf-agent-budget';
const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PATH: `/opt/homebrew/bin:${process.env.PATH}`, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, '.env.local'),
  OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_MOCK_DELAY_MS: '50', OPENHIGGSFIELD_HOSTED: '', OPENHIGGSFIELD_USE_LOCAL: '' }, stdio: ['ignore', 'ignore', 'inherit'], detached: true });
const get = async (u: string, h: Record<string, string> = {}) => (await (await fetch(B + u, { headers: h })).json()) as any;
const postJ = async (u: string, b: unknown, h: Record<string, string> = {}) => { const r = await fetch(B + u, { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(b) }); return { status: r.status, body: (await r.json()) as any }; };
const budget = async (name: string, usd: number) => { const r = await postJ('/api/agent/budgets', { name, budgetUsd: usd }); assert.equal(r.status, 201, JSON.stringify(r.body)); return r.body as { id: string; budgetUsd: number }; };
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const counts = async () => ({ jobs: (await get('/api/jobs?limit=500')).length, spend: (await get('/api/spend?limit=500')).total });
const waitEnd = async (id: string) => { for (let i = 0; i < 200; i++) { const j = await get(`/api/jobs/${id}`); if (!['queued', 'running'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 250)); } throw new Error('job did not end'); };
const untilStory = async (id: string) => { for (let i = 0; i < 400; i++) { const s = await get(`/api/stories/${id}`); if (s.status !== 'running') return s; await new Promise((r) => setTimeout(r, 250)); } throw new Error(`story ${id} timed out`); };
const SPEC = { title: 'Budget story', runOn: 'comfy-cloud', shots: [{ prompt: 'a lighthouse at dusk, slow push in', duration: 6 }, { prompt: 'the beam sweeps the night sea', duration: 6 }] };
try {
  for (let i = 0; i < 160; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }

  // ---- Stories
  const q = await postJ('/api/stories/quote', SPEC); assert.equal(q.status, 200, JSON.stringify(q.body)); assert.equal(q.body.ok, true, q.body.error);
  const T = q.body.total.estUsd; assert.ok(T > 0, `a paid story expected: ${JSON.stringify(q.body.total)}`);
  const unk = await postJ('/api/stories', SPEC, { [HDR]: 'ab_nope' }); assert.equal(unk.status, 400); assert.equal(unk.body.code, 'agent_budget_unknown');
  ok('story with an unknown budget id: 400 agent_budget_unknown (fails closed)');

  const small = await budget('Tight', Math.floor((T / 2) * 100) / 100); const before = await counts();
  const over = await postJ('/api/stories', SPEC, { [HDR]: small.id });
  assert.equal(over.status, 400, JSON.stringify(over.body)); assert.equal(over.body.code, 'agent_budget'); assert.equal(over.body.errorType, 'limit'); assert.equal(over.body.charged, false);
  assert.equal(over.body.neededUsd, r4(T)); assert.equal(over.body.remainingUsd, small.budgetUsd); assert.match(over.body.error, /Nothing was sent to a provider/);
  assert.deepEqual(await counts(), before, 'no story, no shot job, no spend row');
  const sv = await get(`/api/agent/budgets/${small.id}`); assert.equal(sv.refusals, 1); assert.equal(sv.spentUsd, 0); assert.equal(sv.runs, 0);
  ok(`story over the remaining budget ($${T} > $${small.budgetUsd}): 400 agent_budget before any shot runs; nothing created or charged`);

  const big = await budget('Director agent', Math.ceil((T + 0.5) * 100) / 100); const H = { [HDR]: big.id };
  const st = await postJ('/api/stories', SPEC, H); assert.equal(st.status, 200, JSON.stringify(st.body));
  const done = await untilStory(st.body.id); assert.equal(done.status, 'done', done.error);
  const shotIds: string[] = done.shots.map((s: any) => s.jobId); assert.equal(shotIds.length, 2); assert.ok(shotIds.every(Boolean));
  for (const id of shotIds) { const j = await get(`/api/jobs/${id}`); assert.equal(j.agent?.id, big.id, `shot ${id} tagged with the agent`); }
  assert.equal((await get(`/api/jobs/${st.body.id}`)).agent?.id, big.id, 'the story (stitched film) is tagged too');
  const rc = await get(`/api/agent/budgets/${big.id}/receipt`); const rIds = rc.items.map((i: any) => i.jobId);
  for (const id of shotIds) assert.ok(rIds.includes(id), `shot ${id} on the receipt`);
  assert.equal(rc.totals.spentUsd, r4(T), 'spent = the story total'); assert.equal(rc.refusals.length, 0);
  ok(`story within the budget: both shots tagged with the agent and on the receipt, spent $${rc.totals.spentUsd} of $${big.budgetUsd}`);

  // retry with a now-exhausted budget is refused before anything runs (the story keeps its budget without a header)
  const tightRetry = await budget('Retry', 0.01); const st2 = await postJ('/api/stories', SPEC); assert.equal(st2.status, 200); await untilStory(st2.body.id);
  const rr = await postJ(`/api/stories/${st2.body.id}/retry`, { from: 2 }, { [HDR]: tightRetry.id }); assert.equal(rr.status, 400, JSON.stringify(rr.body)); assert.equal(rr.body.code, 'agent_budget');
  ok('retry_story over the budget: 400 agent_budget, nothing re-run');

  // ---- Edit in place
  // an image job to edit (made without a budget)
  const fd = new FormData(); fd.set('prompt', 'a ceramic mug on a table'); fd.set('types', '["generate"]');
  const img = await fetch(`${B}/api/tools/create-image/jobs`, { method: 'POST', body: fd }); const imgB = (await img.json()) as any; assert.equal(img.status, 200, JSON.stringify(imgB));
  const imgJob = await waitEnd(imgB.id); assert.equal(imgJob.status, 'done');
  const EDIT = { tool: 'h3-video', params: { prompt: 'the mug turns slowly', model: 'minimax-h3', runOn: 'comfy-cloud', duration: '6', types: '["i2v"]', rights: '1' } };
  const eq = await get('/api/tools/h3-video/price?model=minimax-h3&runOn=comfy-cloud&duration=6&types=%5B%22i2v%22%5D&image=1'); const E = eq.cost.estUsd; assert.ok(E > 0, `paid edit expected: ${JSON.stringify(eq.cost)}`);
  const eSmall = await budget('Edit tight', Math.floor((E / 2) * 100) / 100); const b2 = await counts();
  const eo = await postJ(`/api/jobs/${imgJob.id}/edit`, EDIT, { [HDR]: eSmall.id });
  assert.equal(eo.status, 400, JSON.stringify(eo.body)); assert.equal(eo.body.code, 'agent_budget'); assert.equal(eo.body.neededUsd, E); assert.equal(eo.body.charged, false);
  assert.deepEqual(await counts(), b2, 'no job, no spend row');
  ok(`edit over the budget ($${E} > $${eSmall.budgetUsd}): 400 agent_budget, nothing created`);
  const eBig = await budget('Edit ok', Math.ceil((E + 0.1) * 100) / 100);
  const eu = await postJ(`/api/jobs/${imgJob.id}/edit`, EDIT, { [HDR]: eBig.id }); assert.equal(eu.status, 200, JSON.stringify(eu.body)); assert.equal(eu.body.editOf, imgJob.id);
  const ej = await waitEnd(eu.body.id); assert.equal(ej.status, 'done'); assert.equal(ej.agent?.id, eBig.id);
  const erc = await get(`/api/agent/budgets/${eBig.id}/receipt`); assert.deepEqual(erc.items.map((i: any) => i.jobId), [eu.body.id]); assert.equal(erc.totals.spentUsd, E);
  ok(`edit within the budget: runs, tagged with the agent, on the receipt ($${erc.totals.spentUsd})`);
  console.log('PASS agent-budget-stories');
} catch (e) { console.error(e); process.exitCode = 1; } finally { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* */ } fs.rmSync(D, { recursive: true, force: true }); }
