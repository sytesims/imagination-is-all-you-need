// E2E (own mock servers :8894 / :8895, temp data dir): GET /api/jobs/:id/locate mirrors GET /api/jobs (same filters, sort, paging) for any filter;
// a perModel local pin is what the quote AND the run use (Klein); a local pin is refused (400) when local ComfyUI is unavailable, and an existing
// unavailable pin is quoted as that route (runnable:false, same reason as the job's 409). Run: npx tsx test/locate-pin.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'lpin-'));
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MOCK_DELAY_MS: '300' };
let srv: ChildProcess | null = null; let B = '';
async function start(port: number, extra: Record<string, string> = {}) {
  B = `http://localhost:${port}`; srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PORT: String(port), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_DEMO_AUTO: '0' /* keyless = no_provider (real-mode rules) */, ...extra }, stdio: 'ignore', detached: true });
  for (let i = 0; i < 90; i++) { try { if ((await fetch(`${B}/api/health`)).ok) return; } catch { /* */ } await new Promise((r) => setTimeout(r, 1000)); } throw new Error('server did not start');
}
const stop = async () => { if (srv) { try { process.kill(-srv.pid!); } catch { /* */ } srv = null; await new Promise((r) => setTimeout(r, 1500)); } };
const req = async (m: string, u: string, body?: any) => { const r = await fetch(B + u, { method: m, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => null) }; };
const get = async (u: string) => (await req('GET', u)).body;
const form = async (tool: string, f: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v); const r = await fetch(`${B}/api/tools/${tool}/jobs`, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() }; };
const settle = async () => { for (let i = 0; i < 300; i++) { const a = await get('/api/jobs?state=active'); if (!a.length) return; await new Promise((r) => setTimeout(r, 200)); } throw new Error('jobs did not settle'); };
try {
  await start(testPort(8894));
  // ---------- 1) locate == list ----------
  await req('PUT', '/api/me/routing', { global: { mode: 'auto', allowFallback: false, useLocal: true, mockKeys: true } }); // own temp server only
  await req('POST', '/api/ledger/grant', { amount: 500 });
  const ids: string[] = [];
  for (let i = 0; i < 7; i++) { const j = await form('create-image', { rights: '1', types: '["generate"]', prompt: `fox ${i % 2 ? 'red' : 'blue'} ${i}`, provider: 'comfy-zimage-turbo' }); assert.equal(j.status, 200, JSON.stringify(j.body)); ids.push(j.body.id); }
  for (let i = 0; i < 3; i++) { const j = await form('create-image', { rights: '1', types: '["generate"]', prompt: `fox fail ${i} [mockfail]`, provider: 'api-flux2', simulate: 'temporary' }); assert.equal(j.status, 200, JSON.stringify(j.body)); ids.push(j.body.id); }
  await settle();
  await req('POST', '/api/dev/mock-delay', { ms: 60000 }); // two stay running/queued (concurrency) while we check active filters
  for (let i = 0; i < 3; i++) { const j = await form('create-image', { rights: '1', types: '["generate"]', prompt: `fox slow ${i}`, provider: 'comfy-zimage-turbo' }); assert.equal(j.status, 200); ids.push(j.body.id); }
  await new Promise((r) => setTimeout(r, 800));
  const all = await get('/api/jobs?limit=500'); const sts = new Set(all.map((j: any) => j.status)); assert.ok(sts.has('done') && sts.has('failed') && (sts.has('running') || sts.has('queued')), [...sts].join(','));
  const FILTERS: Record<string, string>[] = [{}, { status: 'done' }, { status: 'failed,done' }, { state: 'active' }, { toolId: 'create-image' }, { q: 'red' }, { media: 'image' }, { enhanced: '0' }, { q: 'fox', status: 'failed' }];
  let checks = 0;
  for (const f of FILTERS) for (const ps of [undefined, '2', '3']) {
    const qs = new URLSearchParams({ ...f, ...(ps ? { limit: ps } : {}) });
    const list: any[] = (await get(`/api/jobs?${new URLSearchParams({ ...f, limit: '500' })}`)); const listIds = list.map((j) => j.id);
    for (const id of ids) {
      const r = await req('GET', `/api/jobs/${id}/locate?${new URLSearchParams({ ...f, ...(ps ? { pageSize: ps } : {}) })}`);
      if (!listIds.includes(id)) { assert.equal(r.status, 404, `${id} ${JSON.stringify(f)} not in list → 404`); assert.equal(r.body.errorType, 'not_found'); continue; }
      assert.equal(r.status, 200, JSON.stringify(r.body)); const l = r.body; assert.equal(l.section, 'jobs'); assert.equal(l.position, listIds.indexOf(id)); assert.equal(l.total, list.length);
      const page = await get(`/api/jobs?${qs}&cursor=${l.cursor ?? ''}`); // the client's exact request for that page
      assert.equal(page.items[l.index]?.id, id, `filter ${JSON.stringify(f)} pageSize ${ps}: ${JSON.stringify(l)}`); checks++;
    }
  }
  console.log(`ok locate == /api/jobs list: ${checks} (job, filter, pageSize) checks over ${FILTERS.length} filters, statuses ${[...sts].join('/')}`);
  { const d = (await get(`/api/jobs/${ids[0]}/locate`)); assert.equal(d.pageSize, 50); const a = await req('GET', `/api/jobs/${ids[0]}/locate?state=active`); assert.equal(a.status, 404, 'done job not in the active list'); assert.deepEqual(a.body.filters, { state: 'active' });
    const act = (await get('/api/jobs?state=active'))[0]; const la = await get(`/api/jobs/${act.id}/locate?state=active`); assert.equal(la.pageSize, 200, 'status/state → list default 200'); assert.equal(la.position, 0); }
  assert.equal((await req('GET', `/api/jobs/${ids[0]}/locate?media=gif`)).status, 400); assert.equal((await req('GET', `/api/jobs/${ids[0]}/locate?from=nope`)).status, 400);
  assert.equal((await req('GET', `/api/jobs/nope/locate`)).status, 404); assert.equal((await req('GET', `/api/jobs/${ids[0]}/locate?section=x`)).status, 400);
  { const done = all.filter((j: any) => j.status === 'done' && j.outputs?.length); const lo = await get(`/api/jobs/${done[0].id}/locate?section=assets&pageSize=2`); assert.equal(lo.section, 'assets'); assert.equal(lo.position, 0);
    assert.equal((await req('GET', `/api/jobs/${all.find((j: any) => j.status === 'failed').id}/locate?section=assets`)).status, 404, 'assets section = done only (unchanged)'); }
  console.log('ok locate defaults (pageSize 50 / 200 with state), 400 on bad filters/section, 404 unknown/filtered-out, section=assets unchanged');
  await req('POST', '/api/dev/mock-delay', { ms: null });
  // ---------- 2) Klein local pin: quote == run ----------
  await req('PUT', '/api/me/routing', { global: { mode: 'auto', allowFallback: false, useLocal: false, mockKeys: false } });
  const Q = '/api/models/quote?toolId=create-image&model=comfy-flux3-klein';
  { const q = await get(Q); assert.equal(q.runnable, false); assert.equal(q.runOn, null, 'nothing ready → nothing pre-selected'); assert.equal(q.noProvider.localRoute, 'local:comfy-flux3-klein');
    const so = (q.setupOptions ?? []).map((x: any) => `${x.runOn}:${x.action}`); assert.equal(so.at(-1), 'local:turn_on', JSON.stringify(so)); assert.equal(q.setup?.action, q.setupOptions[0].action, 'setup = the first option'); } // before the pin: nothing ready → nothing pre-selected (TRANSPARENCY-PLAN 4k 5b-1); setupOptions list the places in order, Local last ("Turn on")
  { const r = await req('PUT', '/api/me/routing', { perModel: { 'comfy-flux3-klein': { route: 'local:comfy-flux3-klein' } } }); assert.equal(r.status, 200, JSON.stringify(r.body)); } // NeedsKeyHost "Use local ComfyUI instead"
  { const q = await get(Q); assert.equal(q.local, true); assert.equal(q.route, 'local:comfy-flux3-klein'); assert.equal(q.credits, 0); assert.equal(q.runnable, true); assert.equal(q.routing.mode, 'pinned');
    const p = await get('/api/tools/create-image/price?provider=comfy-flux3-klein'); assert.equal(p.local, true); assert.equal(p.route, 'local:comfy-flux3-klein');
    const bal = (await get('/api/ledger')).balance; const j = await form('create-image', { rights: '1', types: '["generate"]', prompt: 'a klein fox', provider: 'comfy-flux3-klein' }); assert.equal(j.status, 200, JSON.stringify(j.body));
    assert.equal(j.body.route, 'local:comfy-flux3-klein'); assert.equal(j.body.cost, 0); await settle(); const jj = await get(`/api/jobs/${j.body.id}`); assert.equal(jj.status, 'done'); assert.equal(jj.route, 'local:comfy-flux3-klein'); assert.equal((await get('/api/ledger')).balance, bal);
    console.log(`ok Klein pin: quote local=${q.local} ${q.route} ${q.credits} cr == run ${jj.route} cost ${j.body.cost}, balance unchanged`); }
  await stop();
  // ---------- 2b) local ComfyUI unavailable (same DB, pin already saved) ----------
  await start(testPort(8895), { OPENHIGGSFIELD_LOCAL_AVAILABLE: '0' });
  { const q = await get(Q); assert.equal(q.runnable, false); assert.equal(q.pinned, 'local:comfy-flux3-klein'); assert.equal(q.pinnedUnavailable, true); assert.equal(q.route, 'local:comfy-flux3-klein'); assert.match(q.reason, /can't run this job\. ComfyUI isn’t running on your computer\./ /* copy wave 1 (2026-10-27) wording */); assert.doesNotMatch(q.reason, /Nothing was charged/); // plain route_not_runnable copy (Oct 18 BH P3); quotes never say 'Nothing was charged'
    const j = await form('create-image', { rights: '1', types: '["generate"]', prompt: 'a klein fox', provider: 'comfy-flux3-klein' }); assert.equal(j.status, 409, JSON.stringify(j.body)); assert.equal(q.reason, j.body.error.replace(/ Nothing was charged\.$/, ''), 'quote reason == job error (the 409 adds Nothing was charged)'); assert.match(j.body.error, /Nothing was charged\.$/);
    console.log(`ok pinned local unavailable: quote runnable=false "${q.reason}" == job 409`); }
  { const r = await req('PUT', '/api/me/routing', { perModel: { 'comfy-zimage-turbo': { route: 'local:comfy-zimage-turbo' } } }); assert.equal(r.status, 400); assert.equal(r.body.issues[0].code, 'local_unavailable');
    const keep = await req('PUT', '/api/me/routing', { perModel: { 'comfy-flux3-klein': { route: 'local:comfy-flux3-klein' } } }); assert.equal(keep.status, 200, 'unchanged existing pin passes');
    const auto = await req('PUT', '/api/me/routing', { perModel: {} }); assert.equal(auto.status, 200); console.log(`ok new local pin with local unavailable → 400 local_unavailable ("${r.body.error}")`); }
  console.log('ALL OK locate-pin');
} finally { await stop(); }
