// Comfy Cloud downloads + Retry download (2026-11-07, jobs e47bb4e4 → 42a3ef5c): a FAKE Comfy Cloud and a FAKE storage host (local HTTP servers,
// fake key, no network, nothing paid). Checks:
//  - downloadPlan / download: relative url → 302 → signed link (ok, the link never gets the key); an absolute url on another host never gets the
//    key (the content endpoint on the Cloud base is used when the asset id is known); a signed link refused once → a fresh link on the next try;
//    content endpoint 401 → key_invalid; a link refused every time → download_refused with host + step + status, never the key or the query
//  - Tripo: a run whose download fails keeps a collectable handle (job.remote, canCollect), Retry download polls the SAME Cloud job and saves the
//    GLB with no upload and no submit
//  - older failed Tripo jobs (no job.remote, only cloudJobId: loaded after a restart) can be collected; several at once
//  - plain Retry on a download_failed paid job answers 409 confirm_price without the OK'd price (no job, no Cloud call); with it, it starts
//  - restart while a Tripo job runs: picked up by polling, never re-uploaded or re-submitted
// Run: npx tsx test/cloud-download-collect.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import http from 'node:http';
import { testPort } from './_ports.js';
const ok = (m: string) => console.log('ok ' + m);
const KEY = 'comfy-fake-test-key-0000';
type Hit = { host: 'cloud' | 'store'; method: string; url: string; auth: string | null };
const hits: Hit[] = [];
let mode = { signedFailFirst: 0, signedAlways403: false, content401: false };
const GLB = Buffer.from('glTF-fake-binary');
const jobsState: Record<string, any> = {};
let storeBase = '';
const listen = (h: http.RequestListener) => new Promise<{ srv: http.Server; base: string }>((res) => { const srv = http.createServer(h); srv.listen(0, '127.0.0.1', () => res({ srv, base: `http://127.0.0.1:${(srv.address() as any).port}` })); });
const store = await listen((req, res) => { hits.push({ host: 'store', method: req.method!, url: req.url!, auth: req.headers.authorization ?? null });
  if (mode.signedAlways403 || mode.signedFailFirst > 0) { mode.signedFailFirst--; res.writeHead(403, { 'content-type': 'application/xml' }); return res.end('<Error>AccessDenied</Error>'); }
  res.writeHead(200, { 'content-type': 'model/gltf-binary' }); res.end(GLB); });
storeBase = store.base;
const cloud = await listen((req, res) => { const u = req.url!; hits.push({ host: 'cloud', method: req.method!, url: u, auth: req.headers.authorization ?? null });
  const send = (s: number, o: any) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (req.headers.authorization !== `Bearer ${KEY}`) return send(401, { error: { code: 'unauthorized', message: 'no key' } });
  if (req.method === 'POST' && u === '/api/v2/assets') return send(201, { id: 'in-asset', file_path: 'in.png' });
  if (req.method === 'POST' && u === '/api/v2/jobs') { const id = `cj-new-${Object.keys(jobsState).length}`; jobsState[id] = 'succeeded'; return send(201, { id, status: 'queued' }); }
  const m = /^\/api\/v2\/jobs\/([^/]+)$/.exec(u); if (m && req.method === 'GET') { const st = jobsState[m[1]]; if (!st) return send(404, { error: { code: 'not_found' } });
    return send(200, st === 'running' ? { id: m[1], status: 'running', progress: { value: 0.5 } } : { id: m[1], status: 'succeeded', outputs: [{ node_id: '3', id: `glb-${m[1]}`, name: 'model.glb', type: '3d', content_type: 'model/gltf-binary', url: `/api/v2/assets/glb-${m[1]}/content` }] }); }
  const c = /^\/api\/v2\/assets\/([^/]+)\/content$/.exec(u); if (c) { if (mode.content401) return send(401, { error: { code: 'unauthorized' } }); res.writeHead(302, { location: `${storeBase}/bucket/${c[1]}.glb?X-Goog-Signature=SECRETSIG` }); return res.end(); }
  return send(404, { error: { code: 'not_found', message: u } }); });
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'clouddl-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock', COMFY_API_KEY: KEY, OPENHIGGSFIELD_COMFY_API_KEY: KEY,
  OPENHIGGSFIELD_COMFY_CLOUD_URL: cloud.base, COMFY_CLOUD_URL: cloud.base, OPENHIGGSFIELD_COMFY_CLOUD_POLL_MS: '5', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_FEATURED: '0',
  PORT: String(testPort(9583)), OPENHIGGSFIELD_HOSTED: '' });
const { setRetrySleep } = await import('../src/hostedPoll.ts'); setRetrySleep(async () => {});
const { ComfyCloudV2 } = await import('../src/comfy/cloudV2.ts');
const reset = () => { hits.length = 0; mode = { signedFailFirst: 0, signedAlways403: false, content401: false }; };
const noKeyLeak = () => assert.ok(hits.filter((h) => h.host === 'store').every((h) => h.auth === null), 'the storage host never saw an Authorization header');
const failOf = async (p: Promise<unknown>) => { try { await p; } catch (e) { return e as any; } throw new Error('expected a failure'); };
try {
  const c = new ComfyCloudV2(cloud.base, KEY, 'unit');
  // 1. relative url → content endpoint (key) → 302 → signed link (no key)
  { reset(); const dest = path.join(D, 'a.glb'); await c.download({ url: '/api/v2/assets/g1/content', filename: 'model.glb' } as any, dest);
    assert.equal(fs.readFileSync(dest).toString(), GLB.toString()); assert.equal(hits[0].host, 'cloud'); assert.equal(hits[0].auth, `Bearer ${KEY}`); noKeyLeak();
    ok('relative output url → content endpoint with the key → 302 → signed link fetched without it'); }
  // 2. absolute url on another host: never the key there
  { reset(); const dest = path.join(D, 'b.glb'); await c.download({ url: `${storeBase}/cdn/model.glb?token=abc`, filename: 'model.glb' } as any, dest);
    assert.equal(fs.readFileSync(dest).toString(), GLB.toString()); assert.ok(hits.every((h) => h.host === 'store')); noKeyLeak();
    reset(); await c.download({ url: `${storeBase}/api/v2/assets/g2/content`, filename: 'model.glb' } as any, path.join(D, 'b2.glb'));
    assert.equal(hits[0].host, 'cloud', 'a content url on another host is fetched from the Cloud base by its asset id'); assert.equal(hits[0].url, '/api/v2/assets/g2/content'); noKeyLeak();
    reset(); await c.download({ url: `${storeBase}/cdn/x.glb`, id: 'g3', filename: 'model.glb' } as any, path.join(D, 'b3.glb'));
    assert.equal(hits[0].url, '/api/v2/assets/g3/content', 'an asset id: the content endpoint first'); noKeyLeak();
    assert.deepEqual(c.downloadPlan({ url: 'https://evil.example/x.glb' }), [{ url: 'https://evil.example/x.glb', auth: false }]);
    ok('absolute url on another host: never sent the key (content endpoint on the base when the asset id is known)'); }
  // 3. signed link refused once → a fresh link on the next try
  { reset(); mode.signedFailFirst = 1; await c.download({ url: '/api/v2/assets/g4/content', filename: 'm.glb' } as any, path.join(D, 'c.glb'));
    assert.equal(hits.filter((h) => h.host === 'cloud').length, 2, 'the content endpoint was asked again for a fresh link'); noKeyLeak();
    ok('signed link 403 → next try asks the content endpoint again → ok'); }
  // 4. content endpoint 401 → key_invalid; signed link refused every time → download_refused with host/step/status, no key, no query
  { reset(); mode.content401 = true; const e = await failOf(c.download({ url: '/api/v2/assets/g5/content', filename: 'm.glb' } as any, path.join(D, 'd.glb')));
    assert.equal(e.downloadFailed, true); assert.equal(e.last.reasonCode, 'key_invalid'); assert.match(e.message, /API key was not accepted/);
    reset(); mode.signedAlways403 = true; const f = await failOf(c.download({ url: '/api/v2/assets/g6/content', filename: 'm.glb' } as any, path.join(D, 'e.glb')));
    assert.equal(f.last.reasonCode, 'download_refused'); assert.match(f.message, /download link was refused or has expired \(signed link on 127\.0\.0\.1:\d+\/bucket\/g6\.glb answered 403\)/);
    assert.doesNotMatch(f.message + JSON.stringify(f.last.provider), /SECRETSIG|X-Goog|comfy-fake-test-key/); assert.doesNotMatch(f.message, /API key/); noKeyLeak();
    ok('content endpoint 401 → key_invalid; signed link 403 every time → "download link was refused or has expired" with host, step and status (no key, no signature)'); }

  // ---- the app: jobs seeded as if loaded after a restart ----
  const { jobs } = await import('../src/jobs.ts');
  const ROUTE = 'comfy-cloud:cloud-tripo-31';
  const routing = { modelId: 'cloud-tripo-31', order: [ROUTE], prices: { [ROUTE]: 30 }, allowFallback: false, mode: 'pinned' };
  const input = { types: ['text-to-3d'], mode: 'text-to-3d', prompt: 'a wooden chair', finalPrompt: 'a wooden chair', detail: 'standard', texture: 'standard', faces: 'auto', format: 'glb', outKind: '3d', resolution: 'standard.standard', duration: 1, warnings: [] };
  const base = (id: string, extra: any): any => ({ id, toolId: 'three-d', provider: 'cloud-tripo-31', route: ROUTE, status: 'failed', stage: 'failed', progress: 0, queuePos: 0, eta: 0, resultUrl: null, outputs: [], warnings: [], parentId: null,
    createdAt: Date.now() - 600_000, startedAt: Date.now() - 590_000, finishedAt: Date.now() - 500_000, input: { ...input }, cost: 30, refunded: 0, routing: structuredClone(routing), ...extra });
  const legacy = (id: string, cj: string) => base(id, { reasonCode: 'download_failed', errorType: 'temporary', error: 'Comfy Cloud · Tripo partner node failed: … the API key was not accepted …', cloudJobId: cj, remote: null,
    refund: { refunded: false, amount: 0, freeGenReturned: false }, routeAttempts: [{ n: 1, routeId: ROUTE, status: 'failed', startedAt: Date.now() - 590_000, charged: 30, refunded: 0, requestId: cj, endedAt: Date.now() - 500_000 }] });
  const L1 = legacy('legacy01', 'cj-old-1'), L2 = legacy('legacy02', 'cj-old-2'); jobsState['cj-old-1'] = 'succeeded'; jobsState['cj-old-2'] = 'succeeded';
  const R = base('running1', { status: 'running', stage: 'rendering', cloudJobId: 'cj-run', routeAttempts: [{ n: 1, routeId: ROUTE, status: 'running', startedAt: Date.now() - 60_000, charged: 30, refunded: 0, requestId: 'cj-run' }],
    remote: { kind: 'cloud', id: 'cj-run', routeId: ROUTE, attempt: 1, output: 0, outputs: 1, at: Date.now() - 60_000 } }); jobsState['cj-run'] = 'succeeded';
  for (const j of [L1, L2, R]) jobs.set(j.id, j);
  reset();
  await import('../src/index.ts'); // boot: the running job is picked up; the failed ones stay as they are
  const B = `http://127.0.0.1:${process.env.PORT}`;
  const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
  const post = async (u: string, b: unknown = {}) => { const r = await fetch(B + u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, body: (await r.json().catch(() => ({}))) as any }; };
  const waitEnd = async (id: string) => { for (let i = 0; i < 400; i++) { const j = jobs.get(id)!; if (!['queued', 'running'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 10)); } throw new Error('job did not end ' + id); };
  const submits = () => hits.filter((h) => h.method === 'POST' && (h.url === '/api/v2/jobs' || h.url === '/api/v2/assets')).length;

  // restart while running: polled, never re-sent
  { const j = await waitEnd('running1'); assert.equal(j.status, 'done', j.error); assert.equal(submits(), 0, 'no upload, no submit'); assert.ok(hits.some((h) => h.url === '/api/v2/jobs/cj-run'));
    assert.equal(fs.readFileSync(path.join(D, 'running1-out0.glb')).toString(), GLB.toString()); noKeyLeak();
    ok('restart while a Tripo job runs → its Cloud job is polled and the GLB saved; nothing uploaded or submitted again'); }

  // older failed jobs: Retry download offered; the plain Retry asks for the price first
  { assert.equal((await get('/api/jobs/legacy01')).canCollect, true); assert.equal((await get('/api/jobs/legacy02')).canCollect, true);
    const before = jobs.size; reset();
    const r = await post('/api/jobs/legacy01/retry'); assert.equal(r.status, 409, JSON.stringify(r.body)); assert.equal(r.body.code, 'confirm_price'); assert.equal(r.body.charged, false);
    const price = r.body.quote.credits; assert.ok(price > 0); assert.equal(r.body.canCollect, true); assert.ok(r.body.message.includes(`new paid run (about $${(price / 100).toFixed(2)})`), r.body.message);
    assert.equal(jobs.size, before, 'no job created'); assert.equal(hits.length, 0, 'nothing sent to Comfy Cloud');
    const q = await post('/api/jobs/legacy01/retry', { quote: true }); assert.equal(q.status, 200); assert.equal(q.body.quote.credits, price); assert.equal(jobs.size, before);
    ok('plain Retry on a download_failed paid job → 409 confirm_price with the price, no job, no Cloud call; quote:true still answers the price'); }
  { reset(); const a = await post('/api/jobs/legacy01/collect'); const b = await post('/api/jobs/legacy02/collect'); assert.equal(a.status, 200, JSON.stringify(a.body)); assert.equal(b.status, 200, JSON.stringify(b.body));
    const [j1, j2] = [await waitEnd('legacy01'), await waitEnd('legacy02')];
    for (const j of [j1, j2]) { assert.equal(j.status, 'done', j.error); assert.equal(j.routeAttempts.length, 1); assert.equal(fs.readFileSync(path.join(D, `${j.id}-out0.glb`)).toString(), GLB.toString()); }
    assert.equal(submits(), 0, 'no upload, no submit'); assert.ok(hits.some((h) => h.url === '/api/v2/jobs/cj-old-1') && hits.some((h) => h.url === '/api/v2/jobs/cj-old-2')); noKeyLeak();
    assert.equal((await post('/api/jobs/legacy01/collect')).status, 409, 'nothing left to collect');
    ok('two older failed Tripo jobs (cloudJobId only) → Retry download on both polls their own Cloud jobs and saves the GLBs; nothing uploaded or submitted'); }

  // a new Tripo run whose download fails keeps a collectable handle; Retry download fetches it without a new submit
  { const { runRouted } = await import('../src/routing/run.ts'); const { getTool } = await import('../src/tools/registry.ts') as any;
    const j: any = base('fresh01', { status: 'running', stage: 'queued', cost: 30, routeAttempts: [] });
    jobs.set(j.id, j); reset(); mode.signedAlways403 = true;
    await runRouted(j, getTool('three-d')); assert.equal(j.status, 'failed'); assert.equal(j.reasonCode, 'download_failed'); assert.equal(submits(), 1, 'one submit (text to 3D: no upload)');
    assert.equal(j.remote?.kind, 'cloud'); assert.equal(j.remote?.collectable, 'download'); assert.equal(j.remote?.id, j.cloudJobId);
    assert.match(j.error, /download link was refused or has expired/); assert.doesNotMatch(j.error, /API key/);
    assert.equal(j.providerError?.errorType, 'download_refused'); assert.equal(j.providerError?.httpStatus, 403); assert.match(j.providerError?.step, /signed link/); assert.doesNotMatch(JSON.stringify(j.providerError), /SECRETSIG|comfy-fake-test-key/);
    assert.equal((await get('/api/jobs/fresh01')).canCollect, true);
    mode.signedAlways403 = false; const n0 = submits(); const c2 = await post('/api/jobs/fresh01/collect'); assert.equal(c2.status, 200);
    const d = await waitEnd('fresh01'); assert.equal(d.status, 'done', d.error); assert.equal(submits(), n0, 'collect never submits'); noKeyLeak();
    ok('new Tripo run, download refused → download_failed with a collectable handle (job.remote) and where it failed (providerError); Retry download → done, no new submit'); }
  // the price OK'd → the paid re-run starts
  { const r = await post('/api/jobs/legacy01/retry', { quotedCredits: 30 }); assert.equal(r.status, 409, 'legacy01 is done now: not retryable');
    const j2: any = jobs.get('legacy02')!; j2.status = 'failed'; j2.reasonCode = 'download_failed'; // as if it had failed again
    const pq = (await post('/api/jobs/legacy02/retry', { quote: true })).body.quote.credits;
    const ok2 = await post('/api/jobs/legacy02/retry', { quotedCredits: pq }); assert.equal(ok2.status, 200, JSON.stringify(ok2.body)); assert.ok(ok2.body.id); assert.equal(ok2.body.cost, pq);
    ok('with the OK\'d price (quotedCredits) the re-run starts as before'); }
  process.exit(0);
} catch (e) { console.error(e); process.exit(1); }
