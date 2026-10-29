// Create Image feed toolbar (2026-10-23): server filters for the feed (liked, project, compare group, failed newest-first, search, total),
// fast filtering over 1000+ jobs with paging intact, POST /api/jobs/bulk (Select mode), projectId on submit, and Compare models
// (POST /api/compare/quote: adapted settings, exclusions, total = sum of quotes = what the runs charge, combined spending cap, agent budget,
// partial failure: the others land and only what ran is charged). Spend summary realRuns.
// Run: npx tsx test/feed-toolbar.e2e.ts (port 9263; temp data dir, mock backend, mock keys, no network).
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { adaptForModel } from '../src/shared/compareAdapt.ts'; import { IMAGE_CAPS } from '../src/shared/imageCaps.ts';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'feedtb-')); const ok = (m: string) => console.log('ok ' + m);
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_BILLING_MODE: '' };
const PORT = testPort(9263); const B = `http://localhost:${PORT}`;
const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PATH: `/opt/homebrew/bin:${process.env.PATH}`, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_MOCK_DELAY_MS: '20', OPENHIGGSFIELD_MAX_QUEUED: '5000', OPENHIGGSFIELD_HOSTED: '', OPENHIGGSFIELD_COUNT_SIMULATED_SPEND: '1' }, stdio: 'ignore', detached: true });
const get = async (u: string, h: Record<string, string> = {}) => (await (await fetch(B + u, { headers: h })).json()) as any;
const post = async (u: string, b: unknown, h: Record<string, string> = {}) => { const r = await fetch(B + u, { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(b) }); return { status: r.status, body: (await r.json()) as any }; };
const putJ = async (u: string, b: unknown) => { const r = await fetch(B + u, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, body: (await r.json()) as any }; };
const submit = async (extra: Record<string, string> = {}) => { const f = new FormData(); for (const [k, v] of Object.entries({ prompt: 'a calm lake', provider: 'api-seedream', types: '["generate"]', rights: '1', ...extra })) f.set(k, v);
  const r = await fetch(`${B}/api/tools/create-image/jobs`, { method: 'POST', body: f }); return { status: r.status, body: (await r.json()) as any }; };
const waitEnd = async (id: string) => { for (let i = 0; i < 600; i++) { const j = await get(`/api/jobs/${id}`); if (!['queued', 'running'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 100)); } throw new Error('job did not end'); };
const list = (q: string) => get(`/api/jobs?features=*&${/(^|&)cursor=/.test(q) ? '' : 'cursor=&'}${q}`);
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }

  // ---- adapt rules (isomorphic, also used by the picker) ----
  const textOnly = Object.entries(IMAGE_CAPS).find(([, c]) => !c.supports.refs)?.[0]; assert.ok(textOnly, 'a text-only model exists');
  const ex = adaptForModel(textOnly!, { mode: 'edit', refs: 1 }); assert.equal(ex.ok, false); assert.equal((ex as any).code, 'text_only');
  const nb = adaptForModel('api-nano-banana', { aspect: '5:3', imageResolution: '2K', n: 2 }); assert.ok(nb.ok); assert.equal((nb as any).params.aspect, '16:9'); assert.ok((nb as any).changes.some((c: any) => c.field === 'aspect' && /closest/.test(c.message)));
  const au = adaptForModel('api-nano-banana', { aspect: 'auto' }); assert.ok(au.ok); assert.equal((au as any).params.aspect, '1:1'); assert.match((au as any).changes[0].message, /No Auto/);
  ok('adapt: text-only excluded from an edit, unsupported aspect → closest with a reason, Auto → the model default');

  // ---- projectId + compare fields on submit ----
  const proj = (await post('/api/projects', { name: 'Lookbook' })).body; assert.ok(proj.id);
  const s1 = await submit({ prompt: 'filed in a project', projectId: proj.id }); assert.equal(s1.status, 200);
  const s2 = await submit({ prompt: 'unknown project is ignored', projectId: 'nope1234' }); assert.equal(s2.status, 200, 'an unknown project never blocks the run');
  await waitEnd(s1.body.id); await waitEnd(s2.body.id);
  assert.equal((await get(`/api/jobs/${s1.body.id}`)).projectId, proj.id); assert.equal((await get(`/api/jobs/${s2.body.id}`)).projectId, null);
  ok('submit projectId files the result there; an unknown project id is ignored');
  { const empty = (await post('/api/projects', { name: 'Empty one' })).body; const ps = await get('/api/projects'); const lb = ps.find((x: any) => x.id === proj.id);
    assert.equal(lb.count, 1); assert.match(lb.coverUrl ?? '', /\.(png|jpe?g|webp|gif)(\?|$)/i, 'cover = the newest finished image'); assert.equal(ps.find((x: any) => x.id === empty.id).coverUrl, null);
    await post('/api/jobs/bulk', { ids: [s1.body.id], action: 'trash' }); const tr = (await get('/api/projects')).find((x: any) => x.id === proj.id); assert.equal(tr.count, 0); assert.equal(tr.coverUrl, null, 'a trashed cover falls back');
    await post('/api/jobs/bulk', { ids: [s1.body.id], action: 'restore' }); }
  ok('projects list: count + coverUrl (newest finished image; null when empty or trashed)');

  // ---- 1000+ jobs: filters stay fast, paging intact ----
  const ids: string[] = []; const N = 1010; const t0 = Date.now();
  for (let i = 0; i < N; i += 50) { const batch = await Promise.all(Array.from({ length: Math.min(50, N - i) }, (_, k) => submit({ prompt: `bulk ${i + k} ${(i + k) % 10 === 0 ? 'zebra' : 'plain'}`, ...((i + k) % 97 === 0 ? { simulate: 'provider_outage' } : {}) })));
    for (const b of batch) { assert.equal(b.status, 200, JSON.stringify(b.body).slice(0, 200)); ids.push(b.body.id); } }
  for (let i = 0; i < 600; i++) { const a = await get('/api/jobs?state=active&cursor=&limit=1'); if (!a.total) break; await new Promise((r) => setTimeout(r, 250)); }
  console.log(`  (made ${N} jobs in ${Date.now() - t0} ms)`);
  const all = await list('limit=60&status=done,failed,blocked,queued,running,needs_decision&order=desc'); assert.equal(all.items.length, 60); assert.ok(all.total >= N + 2, `total ${all.total}`); assert.equal(all.nextCursor, '60');
  const p2 = await list('limit=60&cursor=60&status=done,failed,blocked,queued,running,needs_decision&order=desc'); assert.equal(p2.items.length, 60); assert.ok(!p2.items.some((j: any) => all.items.some((k: any) => k.id === j.id)), 'pages do not overlap');
  let ts = Date.now(); const z = await list('limit=60&q=zebra&order=desc'); const tq = Date.now() - ts; assert.equal(z.total, Math.ceil(N / 10)); assert.ok(z.items.every((j: any) => /zebra/.test(j.input?.prompt ?? '')));
  ts = Date.now(); const f = await list('limit=60&status=failed,blocked&order=desc'); const tf = Date.now() - ts; assert.ok(f.total >= 1, `failed ${f.total}`); assert.ok(f.items.every((j: any) => ['failed', 'blocked'].includes(j.status)));
  assert.ok(f.items.length < 2 || f.items[0].createdAt >= f.items[1].createdAt, 'order=desc keeps newest first with a status filter');
  const fa = await get('/api/jobs?status=failed,blocked&limit=5'); assert.ok(Array.isArray(fa)); assert.ok(fa.length < 2 || fa[0].createdAt <= fa[1].createdAt, 'old callers (no order): status lists stay oldest first');
  assert.ok(tq < 1500 && tf < 1500, `filters fast (${tq} ms, ${tf} ms)`);
  ok(`1000+ jobs: total, cursor paging, search (${tq} ms) and failed filter (${tf} ms); old status order kept`);
  const plainArr = await get('/api/jobs?features=*&limit=3'); assert.ok(Array.isArray(plainArr), 'no cursor → plain array as before');

  // ---- bulk: like / project / trash / restore ----
  const pick = ids.slice(0, 5);
  let r = await post('/api/jobs/bulk', { ids: pick, action: 'like' }); assert.equal(r.status, 200); assert.deepEqual(r.body.done, pick);
  const liked = await list('limit=60&liked=1'); assert.equal(liked.total, 5);
  r = await post('/api/jobs/bulk', { ids: pick.slice(0, 2), action: 'unlike' }); assert.equal((await list('limit=60&liked=1')).total, 3);
  r = await post('/api/jobs/bulk', { ids: pick, action: 'project', projectId: proj.id }); assert.equal(r.body.done.length, 5);
  assert.equal((await list(`limit=60&project=${proj.id}`)).total, 6); assert.equal((await get('/api/projects')).find((x: any) => x.id === proj.id).count, 6);
  assert.ok((await list('limit=1&project=none')).total >= N - 5);
  r = await post('/api/jobs/bulk', { ids: pick, action: 'project', projectId: 'missing' }); assert.equal(r.status, 404);
  const before = (await list('limit=1')).total;
  r = await post('/api/jobs/bulk', { ids: [...pick, 'zzzzzzzz'], action: 'trash' }); assert.equal(r.body.done.length, 5); assert.deepEqual(r.body.skipped, [{ id: 'zzzzzzzz', reason: 'Not found' }]);
  assert.equal((await list('limit=1')).total, before - 5);
  r = await post('/api/jobs/bulk', { ids: pick, action: 'restore' }); assert.equal((await list('limit=1')).total, before);
  const run = await submit({ prompt: 'still running' }); r = await post('/api/jobs/bulk', { ids: [run.body.id], action: 'trash' });
  if ((await get(`/api/jobs/${run.body.id}`)).status === 'done') console.log('  (the job finished before the trash call; running-skip not exercised this time)'); else assert.match(r.body.skipped[0]?.reason ?? '', /running/i);
  assert.equal((await post('/api/jobs/bulk', { ids: [], action: 'like' })).status, 400); assert.equal((await post('/api/jobs/bulk', { ids: pick, action: 'nuke' })).status, 400);
  await waitEnd(run.body.id);
  ok('bulk: like / unlike / move (count updates) / trash (running skipped with a reason) / restore = undo; validation');

  // ---- Compare models ----
  const four = ['api-nano-banana', 'api-gpt-image', 'api-seedream', 'api-flux2'];
  let c = await post('/api/compare/quote', { models: ['api-nano-banana'], aspect: '1:1' }); assert.equal(c.status, 200); assert.equal(c.body.runnable, false); assert.equal(c.body.block.code, 'compare_min');
  c = await post('/api/compare/quote', { models: [...four, 'comfy-zimage-turbo'] }); assert.equal(c.status, 400); assert.equal(c.body.code, 'compare_max');
  c = await post('/api/compare/quote', { models: four, aspect: '5:3', n: 1 }); assert.equal(c.body.runnable, true, JSON.stringify(c.body.block));
  const sum = c.body.rows.filter((x: any) => x.ok).reduce((s: number, x: any) => s + x.credits, 0); assert.equal(c.body.total.credits, sum);
  for (const row of c.body.rows) { const q = await get(`/api/models/quote?model=${row.model}&aspect=${row.params.aspect}&n=1&mode=generate${row.params.quality ? `&quality=${row.params.quality}` : ''}${row.params.imageResolution ? `&imageResolution=${row.params.imageResolution}` : ''}`); assert.equal(row.credits, q.credits, `${row.model}: compare row = its own quote`); assert.ok(row.changes.some((x: any) => x.field === 'aspect'), 'no 5:3 → adapted with a reason'); }
  const preview = await post('/api/compare/quote', { models: [...four, 'comfy-zimage-turbo', 'comfy-qwen-image'], preview: true }); assert.equal(preview.status, 200); assert.equal(preview.body.rows.length, 6);
  const edit = await post('/api/compare/quote', { models: ['api-nano-banana', textOnly], mode: 'edit', refs: 1 }); const exr = edit.body.rows.find((x: any) => x.model === textOnly); assert.equal(exr.excluded.code, 'text_only'); assert.equal(edit.body.block.code, 'compare_min');
  ok('compare quote: 1 model blocked, 5 refused, total = sum of the models’ own quotes, settings adapted with reasons, text-only left out of an edit');

  // combined run: quote = charge, one failing still lets the others land
  c = await post('/api/compare/quote', { models: four.slice(0, 3), aspect: '1:1', n: 1 }); assert.equal(c.body.runnable, true);
  const g = 'cmp-test1'; const started: any[] = [];
  for (const id of c.body.order) { const row = c.body.rows.find((x: any) => x.model === id); const idx = c.body.included.indexOf(id);
    const s = await submit({ prompt: 'a vintage camera', provider: id, aspect: row.params.aspect, n: String(row.params.n), compareGroup: g, compareOf: '3', compareIndex: String(idx), quotedRouteId: row.routeId, quotedCredits: String(row.credits), ...(id === 'api-gpt-image' ? { simulate: 'provider_outage' } : {}) });
    assert.equal(s.status, 200, JSON.stringify(s.body).slice(0, 200)); assert.equal(s.body.cost, row.credits, `${id}: charged = quoted`); started.push(s.body); }
  const ended = await Promise.all(started.map((s) => waitEnd(s.id)));
  assert.equal(ended.filter((j) => j.status === 'done').length, 2); assert.equal(ended.find((j) => j.provider === 'api-gpt-image').status, 'failed');
  const grp = await list(`limit=60&compare=${g}`); assert.equal(grp.total, 3); assert.ok(grp.items.every((j: any) => j.compare?.id === g && j.compare.n === 3));
  assert.deepEqual(grp.items.map((j: any) => j.compare.i).sort(), [0, 1, 2]);
  const spend = await get('/api/spend?limit=200'); const rows = spend.items.filter((x: any) => started.some((s) => s.id === x.jobId));
  assert.equal(rows.length, 3, 'one spend row per run that started');
  const charged = rows.reduce((s: number, x: any) => s + x.countedUsd, 0); const doneUsd = rows.filter((x: any) => ended.find((j) => j.id === x.jobId)?.status === 'done').reduce((s: number, x: any) => s + x.countedUsd, 0);
  assert.ok(charged <= c.body.total.estUsd + 1e-6, `charged ${charged} ≤ quoted ${c.body.total.estUsd}`); assert.ok(doneUsd > 0);
  ok(`compare run: each run charged its quote, one failed (charged only by its provider’s rule: ${(charged - doneUsd).toFixed(4)} USD), the others landed as one group`);

  // no spending limits (removed 2026-10-28): an old client's cap is ignored, the set stays runnable
  { const pr = await putJ('/api/settings/billing', { mode: 'own-accounts', limits: { comfy: { dailyUsd: 0 } } }); assert.equal(pr.status, 200, JSON.stringify(pr.body));
    c = await post('/api/compare/quote', { models: four.slice(0, 3), aspect: '1:1', n: 1 }); assert.notEqual(c.body.block?.code, 'spend_limit'); assert.equal(c.body.runnable, true, JSON.stringify(c.body.block));
    ok('no spending limits: an old $0 cap does not block the set'); }

  // agent budget: the combined estimate against the agent's budget
  const bud = await post('/api/agent/budgets', { name: 'compare bot', budgetUsd: 0.05 }); assert.ok([200, 201].includes(bud.status), JSON.stringify(bud.body)); const bid = bud.body.id ?? bud.body.budget?.id;
  c = await post('/api/compare/quote', { models: four.slice(0, 3), aspect: '1:1', n: 1 }, { 'x-ohf-agent-budget': bid }); assert.equal(c.body.runnable, false); assert.equal(c.body.block.code, 'agent_budget');
  ok('agent budget: a combined run over the budget is blocked');

  // spend summary: realRuns leaves sample runs out (team mode shows ✦ in the UI from the same figures)
  const day = await get('/api/spend/summary?period=day'); assert.equal(typeof day.totals.realRuns, 'number'); assert.ok(day.totals.realRuns <= day.totals.runs);
  ok('spend summary carries realRuns');
  console.log('ALL OK feed-toolbar');
} catch (e) { console.error(e); process.exitCode = 1; } finally { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); try { fs.rmSync(D, { recursive: true, force: true }); } catch { /* the server may still be writing */ } }
