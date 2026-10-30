// Queue lanes + provider busy + spend-limit race (2026-10-25, queue.ts / busyRetry.ts / billing.ts holdSpend). No network, fake keys, no spend.
// Unit (in process): Comfy Router submit 429 (Retry-After) then 201 → waited, sent again with the SAME Idempotency-Key, collected once; always 429 →
//  5 tries then queue_full marked busy; fal submit 429 then 200 → one queued request.
// E2E A (:8771, mock backend, mock keys, Local on, CLOUD_CONCURRENCY=2): /api/queue + /api/config report the lanes; 3 long local runs + 4 cloud runs
//  submitted together → the cloud runs finish while the first local run still renders (one local at a time, the rest wait with "Waiting for your
//  Mac/computer"), a 3rd cloud run waits "for a free cloud slot"; cancel while queued in each lane; 10 parallel submits against a spending cap that
//  fits 2 → exactly 2 pass; restart with queued jobs in both lanes → both come back and finish.
// E2E B (:8772 keyed, fake Comfy Router :8773): 429 then 201 → done, 2 submits with one idempotency key, charged once; always 429 → failed
//  "stayed busy", queue_full, 5 submits, credits back.
// Run: npx tsx test/queue-lanes.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import http from 'node:http'; import os from 'node:os'; import path from 'node:path'; import { randomUUID } from 'node:crypto';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'qlanes-')); const ok = (m: string) => console.log('ok ' + m);
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_COMFY_API_KEY: '', OPENHIGGSFIELD_MINIMAX_API_KEY: '', OPENHIGGSFIELD_DASHSCOPE_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '', OPENHIGGSFIELD_BILLING_MODE: '', OPENHIGGSFIELD_USE_LOCAL: '', OPENHIGGSFIELD_CONCURRENCY: '', OPENHIGGSFIELD_LOCAL_CONCURRENCY: '', OPENHIGGSFIELD_CLOUD_CONCURRENCY: '' };
const KEY = 'test-not-a-real-key'; const PORT_FAKE = testPort(8773); const FAKE = `http://127.0.0.1:${PORT_FAKE}`;
Object.assign(process.env, NOKEYS, { OPENHIGGSFIELD_DATA_DIR: fs.mkdtempSync(path.join(D, 'unit-')), OPENHIGGSFIELD_BACKEND: 'mock' });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------- unit: busy retry ----------------
{ const R = await import('../src/comfyRouter.ts'); const base = 'https://router.test';
  const h = { request_id: 'r1', status: 'IN_QUEUE', status_url: `${base}/v2/models/openai/gpt-image-2/requests/r1/status`, response_url: `${base}/v2/models/openai/gpt-image-2/requests/r1`, cancel_url: `${base}/v2/models/openai/gpt-image-2/requests/r1/cancel` };
  const js = (code: number, o: any, hd: Record<string, string> = {}) => new Response(JSON.stringify(o), { status: code, headers: { 'content-type': 'application/json', ...hd } });
  const make = (busyPosts: number) => { const posts: string[] = []; const sleeps: number[] = []; let n = 0;
    const f = (async (u: any, init: any = {}) => { const url = String(u);
      if (url.endsWith('/requests?fallback_provider=false')) { posts.push(init.headers['Idempotency-Key']); return ++n <= busyPosts ? js(429, { detail: 'busy', error_type: 'rate_limited' }, { 'x-comfy-error-type': 'rate_limited', 'retry-after': '7' }) : js(201, h); }
      if (url.endsWith('/status')) return js(200, { ...h, status: 'COMPLETED' });
      return js(200, { data: [{ url: 'https://x/y.png' }] }, { 'x-comfy-credits-used': '3' }); }) as typeof fetch;
    return { posts, sleeps, c: new R.ComfyRouter(KEY, f, base, async (ms) => { sleeps.push(ms); }, 1) }; };
  const a = make(1); const waits: number[] = []; a.c.onBusy = (ms) => waits.push(ms);
  const r = await a.c.runQueued('openai/gpt-image-2', { prompt: 'x' }, 'job1-a1-o0'); assert.equal(r.creditsUsed, 3);
  assert.equal(a.posts.length, 2, 'sent again once'); assert.deepEqual(a.posts, ['job1-a1-o0', 'job1-a1-o0'], 'same Idempotency-Key on the retry'); assert.equal(a.sleeps[0], 7000, 'Retry-After 7 s waited'); assert.deepEqual(waits, [7000]);
  const b = make(99); await assert.rejects(b.c.runQueued('openai/gpt-image-2', {}, 'k'), (e: any) => e.reasonCode === 'queue_full' && e.busy === true && e.busyTries === 5);
  assert.equal(b.posts.length, 5, 'capped: 1 + 4 retries');
  ok('Router: 429 (Retry-After 7 s) → waited, same Idempotency-Key, one request collected; always busy → 5 tries, then queue_full marked busy');
  const F = await import('../src/providers/fal.ts'); let subs = 0;
  const ff = (async (u: any, init: any = {}) => { const url = String(u);
    if (init.method === 'POST') return ++subs === 1 ? new Response('rate limited', { status: 429, headers: { 'retry-after': '0' } }) : js(200, { request_id: 'f1', status_url: 'https://q/s', response_url: 'https://q/r' });
    if (url === 'https://q/s') return js(200, { status: 'COMPLETED' }); return js(200, { images: [{ url: 'https://x/i.png' }] }); }) as typeof fetch;
  const fr = await F.falRun('fal-ai/x', { prompt: 'x' }, 'k', { timeoutMs: 5000, pollMs: 1, f: ff }); assert.equal(fr.requestId, 'f1'); assert.equal(subs, 2);
  ok('fal: submit 429 then 200 → one queued request (the refused one never started)'); }

// ---------------- fake Comfy Router ----------------
const log: { method: string; url: string; idem?: string; prompt: string }[] = []; const reqs = new Map<string, { polls: number }>(); let busyLeft = 0;
const fake = http.createServer(async (req, res) => {
  const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer); const raw = Buffer.concat(chunks).toString();
  log.push({ method: req.method!, url: req.url!, idem: req.headers['idempotency-key'] as string | undefined, prompt: raw });
  const send = (code: number, o: any, h: Record<string, string> = {}) => { res.writeHead(code, { 'content-type': 'application/json', 'x-comfy-request-id': randomUUID(), ...h }); res.end(JSON.stringify(o)); };
  if (req.url!.startsWith('/assets/')) { res.writeHead(200, { 'content-type': 'image/png' }); return res.end(Buffer.from('89504e470d0a1a0a', 'hex')); }
  let m = /^\/v2\/models\/([^/]+)\/([^/]+)(\/estimate|\/requests)?(?:\?fallback_provider=false)?$/.exec(req.url!);
  if (m && req.method === 'POST') {
    if (m[3] === '/estimate') return send(200, { source: 'unknown', reason: 'not_quotable' });
    if (/BUSYALWAYS/.test(raw) || (/BUSYONCE/.test(raw) && busyLeft-- > 0)) return send(429, { detail: 'busy', error_type: 'concurrency_limit_exceeded' }, { 'x-comfy-error-type': 'concurrency_limit_exceeded', 'retry-after': '1' });
    const id = randomUUID(); const b = `${FAKE}/v2/models/${m[1]}/${m[2]}/requests/${id}`; reqs.set(id, { polls: 0 });
    return send(201, { request_id: id, status: 'IN_QUEUE', status_url: `${b}/status`, response_url: b, cancel_url: `${b}/cancel` }); }
  m = /^\/v2\/models\/[^/]+\/[^/]+\/requests\/([^/]+)(\/status|\/cancel)?$/.exec(req.url!);
  if (m) { const r = reqs.get(m[1]); if (!r) return send(404, { error_type: 'request_not_found' });
    if (m[2] === '/status') { r.polls++; return send(200, { status: 'COMPLETED' }, { 'retry-after': '1' }); }
    return send(200, { data: [{ url: `${FAKE}/assets/out.png` }] }, { 'x-comfy-credits-used': '5' }); }
  send(404, { error_type: 'model_not_found' });
});
await new Promise<void>((r) => fake.listen(PORT_FAKE, '127.0.0.1', r));

const procs: ChildProcess[] = [];
async function boot(port: number, DD: string, extra: Record<string, string>) {
  const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, detached: true, stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, ...NOKEYS, PATH: `/opt/homebrew/bin:${process.env.PATH}`, PORT: String(port), OPENHIGGSFIELD_DATA_DIR: DD, OPENHIGGSFIELD_ENV_FILE: path.join(DD, 'sandbox.env'),
    OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '50', OPENHIGGSFIELD_SEED_COMMUNITY: '0', OPENHIGGSFIELD_FILMING_FILE: path.join(DD, 'nofilm.json'), OPENHIGGSFIELD_HOSTED: '', ...extra } });
  let err = ''; p.stderr!.on('data', (d) => { err += d; if (err.length > 20000) err = err.slice(-10000); }); procs.push(p); const B = `http://localhost:${port}`;
  for (let i = 0; i < 240; i++) { try { if ((await fetch(`${B}/api/health`)).ok) return { B, p, err: () => err }; } catch { /* booting */ } await wait(250); }
  throw new Error(`server :${port} did not start: ${err.slice(-2000)}`);
}
const stop = async (p: ChildProcess) => { try { process.kill(-p.pid!, 'SIGKILL'); } catch { /* gone */ } await wait(500); };
const J = async (r: Response) => ({ status: r.status, body: (await r.json()) as any });
const get = async (B: string, u: string) => (await (await fetch(B + u)).json()) as any;
const send = async (B: string, m: string, u: string, b: unknown) => J(await fetch(B + u, { method: m, headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }));
const post = async (B: string, f: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries({ rights: '1', types: '["generate"]', aspect: '1:1', ...f })) fd.append(k, v); return J(await fetch(`${B}/api/tools/create-image/jobs`, { method: 'POST', body: fd })); };
const job = (B: string, id: string) => get(B, `/api/jobs/${id}`);
const until = async (B: string, id: string, t = 600) => { for (let i = 0; i < t; i++) { const j = await job(B, id); if (!['queued', 'running'].includes(j.status)) return j; await wait(50); } throw new Error('timeout ' + id); };
const untilStatus = async (B: string, id: string, st: string) => { for (let i = 0; i < 200; i++) { const j = await job(B, id); if (j.status === st) return j; await wait(25); } throw new Error(`${id} never ${st}`); };
const LOCAL = { provider: 'comfy-flux3-klein', prompt: 'a calm lake' }; const CLOUD = { provider: 'api-seedream', prompt: 'a paper boat' };
try {
  // ================= A: lanes =================
  const DA = fs.mkdtempSync(path.join(D, 'a-'));
  let A = await boot(testPort(8771), DA, { OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_USE_LOCAL: '1', OPENHIGGSFIELD_CLOUD_CONCURRENCY: '2', OPENHIGGSFIELD_COUNT_SIMULATED_SPEND: '1' });
  assert.equal((await get(A.B, '/api/health')).backend, 'mock');
  { const q = await get(A.B, '/api/queue'); assert.equal(q.localConcurrency, 1); assert.equal(q.cloudConcurrency, 2); assert.equal(q.concurrency, 3); assert.deepEqual(q.lanes.local, { running: 0, waiting: 0, limit: 1 }); assert.deepEqual(q.lanes.cloud, { running: 0, waiting: 0, limit: 2 });
    const c = await get(A.B, '/api/config'); assert.equal(c.lanes.local.limit, 1); assert.equal(c.lanes.cloud.limit, 2); }
  ok('/api/queue + /api/config: lanes local {limit 1}, cloud {limit 2 (env)}, concurrency = both');
  assert.equal((await send(A.B, 'PUT', '/api/me/routing', { perModel: { 'comfy-flux3-klein': { route: 'local:comfy-flux3-klein' } } })).status, 200);
  assert.equal((await get(A.B, '/api/tools/create-image/price?provider=comfy-flux3-klein&types=generate')).runOn, 'local');
  // 3 long local runs, then 4 cloud runs
  assert.equal((await send(A.B, 'POST', '/api/dev/mock-delay', { ms: 9000 })).status, 200);
  const L: string[] = []; for (let i = 0; i < 3; i++) { const s = await post(A.B, LOCAL); assert.equal(s.status, 200, JSON.stringify(s.body)); L.push(s.body.id); }
  await untilStatus(A.B, L[0], 'running');
  assert.equal((await send(A.B, 'POST', '/api/dev/mock-delay', { ms: 1200 })).status, 200);
  const C: string[] = []; for (let i = 0; i < 4; i++) { const s = await post(A.B, CLOUD); assert.equal(s.status, 200, JSON.stringify(s.body)); C.push(s.body.id); }
  await untilStatus(A.B, C[0], 'running'); await untilStatus(A.B, C[1], 'running'); await wait(150); // both cloud slots busy (a slow runner starts the second later)
  { const l1 = await job(A.B, L[1]); const l2 = await job(A.B, L[2]); const c2 = await job(A.B, C[2]); const c3 = await job(A.B, C[3]);
    assert.equal(l1.status, 'queued'); assert.equal(l1.runLane, 'local'); assert.equal(l1.queuePos, 1); assert.equal(l2.queuePos, 2);
    assert.match(l1.queueReason, /^Waiting for your computer: one run at a time$/); assert.equal(l1.progressInfo.queueReason, l1.queueReason);
    assert.equal(c2.status, 'queued'); assert.equal(c2.runLane, 'cloud'); assert.equal(c2.queuePos, 1, 'position counts in its own lane'); assert.equal(c2.queueReason, 'Waiting for a free cloud slot'); assert.equal(c3.queuePos, 2);
    const q = await get(A.B, '/api/queue'); assert.deepEqual(q.lanes.local, { running: 1, waiting: 2, limit: 1 }); assert.deepEqual(q.lanes.cloud, { running: 2, waiting: 2, limit: 2 });
    const act = await get(A.B, '/api/queue/activity'); assert.equal(act.items.find((x: any) => x.id === L[1]).queueReason, l1.queueReason); assert.equal(act.lanes.cloud.limit, 2); }
  ok('waiting: local #1/#2 "Waiting for your Mac: one local run at a time", cloud #1/#2 "Waiting for a free cloud slot" (positions per lane); /api/queue lanes {1 running, 2 waiting} / {2, 2}');
  // cancel while queued, one per lane
  { const cl = await send(A.B, 'POST', `/api/jobs/${L[2]}/cancel`, {}); assert.equal(cl.status, 200, JSON.stringify(cl.body)); assert.equal((await job(A.B, L[2])).status, 'canceled');
    const cc = await send(A.B, 'POST', `/api/jobs/${C[3]}/cancel`, {}); assert.equal(cc.status, 200, JSON.stringify(cc.body)); assert.equal((await job(A.B, C[3])).status, 'canceled');
    const q = await get(A.B, '/api/queue'); assert.equal(q.lanes.local.waiting, 1); assert.equal(q.lanes.cloud.waiting, 1); }
  ok('cancel while queued: a local and a cloud job → canceled, each lane one fewer waiting');
  for (const id of C.slice(0, 3)) assert.equal((await until(A.B, id)).status, 'done', id);
  { const l0 = await job(A.B, L[0]); assert.equal(l0.status, 'running', 'the first local run still renders'); assert.equal((await job(A.B, L[1])).status, 'queued', 'the next local run still waits for it'); }
  ok('3 cloud runs finished (2 at once + 1 after a slot freed) while the first long local run was still rendering and the second still waited');
  // restart with queued jobs in both lanes (the running ones fail as before; the queued ones come back in their own lane)
  assert.equal((await send(A.B, 'POST', '/api/dev/mock-delay', { ms: 9000 })).status, 200);
  const C2: string[] = []; for (let i = 0; i < 3; i++) C2.push((await post(A.B, CLOUD)).body.id);
  await untilStatus(A.B, C2[1], 'running'); assert.equal((await job(A.B, C2[2])).status, 'queued');
  await wait(600); await stop(A.p); A = await boot(testPort(8771), DA, { OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_USE_LOCAL: '1', OPENHIGGSFIELD_CLOUD_CONCURRENCY: '2', OPENHIGGSFIELD_COUNT_SIMULATED_SPEND: '1' });
  { const l1 = await until(A.B, L[1]); const c = await until(A.B, C2[2]); assert.equal(l1.status, 'done'); assert.ok(l1.requeuedAt, 'local job requeued'); assert.equal(c.status, 'done'); assert.ok(c.requeuedAt, 'cloud job requeued');
    assert.equal((await job(A.B, L[0])).status, 'failed'); assert.equal((await job(A.B, C2[0])).status, 'failed'); }
  ok('restart: queued local + queued cloud jobs come back (requeuedAt) and finish in their lanes; running ones fail as before');
  // no spending limits (removed 2026-10-28): 10 parallel submits all go in, whatever an old client saved as a cap
  { assert.equal((await send(A.B, 'PUT', '/api/settings/billing', { limits: { comfy: { dailyUsd: 0 } } })).status, 200);
    const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => post(A.B, { ...CLOUD, prompt: `race ${i}` })));
    assert.equal(rs.filter((r) => r.status === 200).length, 10, rs.map((r) => r.status).join(','));
    ok('no spending limits: 10 parallel submits all accepted'); }
  await send(A.B, 'POST', '/api/dev/mock-delay', { ms: null });

  // ================= B: provider busy on a keyed Comfy Router route =================
  const DB = fs.mkdtempSync(path.join(D, 'b-'));
  const Bk = await boot(testPort(8772), DB, { COMFY_API_KEY: KEY, OPENHIGGSFIELD_BILLING_MODE: 'team', OPENHIGGSFIELD_USE_LOCAL: '0', OPENHIGGSFIELD_COMFY_ROUTER_URL: FAKE, OPENHIGGSFIELD_ROUTER_RETRY_SCALE: '0.02', OPENHIGGSFIELD_CONCURRENCY: '2' });
  { const q = await get(Bk.B, '/api/queue'); assert.equal(q.localConcurrency, 2, 'old OPENHIGGSFIELD_CONCURRENCY sets the local lane'); assert.equal(q.cloudConcurrency, 10); ok('OPENHIGGSFIELD_CONCURRENCY=2 → local lane 2 (backward compat), cloud 10 (default)'); }
  const bal = async () => (await get(Bk.B, '/api/ledger')).balance as number;
  const posts = () => log.filter((l) => l.method === 'POST' && /\/requests\?fallback_provider=false$/.test(l.url));
  { busyLeft = 1; const b0 = await bal(); const n0 = posts().length;
    const s = await post(Bk.B, { provider: 'api-seedream', prompt: 'BUSYONCE boat' }); assert.equal(s.status, 200, JSON.stringify(s.body)); assert.ok(s.body.cost > 0);
    const d = await until(Bk.B, s.body.id); assert.equal(d.status, 'done', `${d.status} ${d.error}`); assert.equal(d.route, 'comfy-router:api-seedream');
    const mine = posts().slice(n0); assert.equal(mine.length, 2, 'refused once, sent again once'); assert.equal(mine[0].idem, mine[1].idem, 'same Idempotency-Key'); assert.ok(mine[0].idem);
    for (let i = 0; i < 40 && (await bal()) !== b0 - s.body.cost; i++) await wait(50); assert.equal(await bal(), b0 - s.body.cost, 'charged once');
    ok(`busy then free: done, 2 submits with one Idempotency-Key, charged once (✦${s.body.cost})`); }
  { const b0 = await bal(); const n0 = posts().length;
    const s = await post(Bk.B, { provider: 'api-seedream', prompt: 'BUSYALWAYS boat' }); assert.equal(s.status, 200, JSON.stringify(s.body));
    const d = await until(Bk.B, s.body.id); assert.equal(d.status, 'failed'); assert.equal(d.reasonCode, 'queue_full'); assert.equal(d.errorType, 'temporary'); assert.match(d.error, /stayed busy and didn't take the request after 5 tries/);
    assert.equal(posts().length - n0, 5, '1 + 4 retries');
    for (let i = 0; i < 40 && (await bal()) !== b0; i++) await wait(50); assert.equal(await bal(), b0, 'credits back');
    ok(`always busy: failed after 5 submits, "${d.error}", credits back`); }
  console.log('PASS queue-lanes');
} finally { for (const p of procs) { try { process.kill(-p.pid!, 'SIGKILL'); } catch { /* */ } } fake.close(); }
process.exit(0);
