// Restart with hosted runs in flight (audit 2026-11-01 #5), FAKE providers only (stubbed fetch, fake keys, no spend):
//  - a running fal job with its stored request → picked up at boot, polled (never re-submitted) and finished with the paid result
//  - a running Comfy Cloud job (stored Cloud job id) → picked up, polled, NOT cancelled
//  - a job made of several requests (can't be picked up) → failed as before, and its request cancelled at the provider
// Run: npx tsx test/hosted-restart-pickup.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'hostedrestart-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_ROUTING_LIVE: '1', OPENHIGGSFIELD_FAL_KEY: 'fal-fake-test-key', COMFY_API_KEY: 'comfyui-fake-test-key',
  OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_HOSTED_POLL_MS: '2', OPENHIGGSFIELD_COMFY_CLOUD_URL: 'https://cloud.test' });
const ok = (m: string) => console.log('ok ' + m);
const json = (o: any, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
type Call = { url: string; method: string }; const seen: Call[] = [];
const FAL = 'https://queue.fal.run/test/vid/requests/r1';
const MP4 = Buffer.from('fake-mp4-bytes');
globalThis.fetch = (async (u: any, init: any = {}) => { const c = { url: String(u), method: init.method ?? 'GET' }; seen.push(c);
  if (c.url === `${FAL}/status`) return json({ status: 'COMPLETED' });
  if (c.url === FAL) return json({ video: { url: 'https://cdn.test/v.mp4' } });
  if (c.url === 'https://cdn.test/v.mp4') return new Response(MP4, { headers: { 'content-type': 'video/mp4' } });
  return json({ error: 'unexpected ' + c.url }, 418); }) as typeof fetch;
const { EXTRA_ROUTES } = await import('../src/routing/routes.ts') as any;
const ROUTE = { routeId: 'fal:test/vid', kind: 'fal', modelId: 'test-hosted-model', endpoint: 'test/vid', priceRef: null, sourceUrl: '', checkedAt: '', typicalLatencySec: 1, latencyEstimated: true, envKey: 'OPENHIGGSFIELD_FAL_KEY', label: 'Test video · fal', output: 'video', request: async (j: any) => ({ prompt: j.input.prompt }) };
EXTRA_ROUTES['test-hosted-model'] = [ROUTE];
const { jobs } = await import('../src/jobs.ts');
const { setOrphanCancel } = await import('../src/routing/orphans.ts'); const orphanCancels: string[] = []; setOrphanCancel(async (id) => { orphanCancels.push(id); return true; });
// a Comfy Cloud job: the runner is fed a fake Cloud (status → succeeded; no outputs to keep the graph's post-processing out of it)
const { setCloudFetch } = await import('../src/routing/cloudRun.ts');
setCloudFetch((async (u: any, init: any = {}) => { const c = { url: String(u), method: init.method ?? 'GET' }; seen.push(c);
  if (c.url === 'https://cloud.test/api/v2/jobs/cj-5' && c.method === 'GET') return json({ id: 'cj-5', status: 'running', progress: { value: 0.9 } });
  return json({ error: { code: 'unexpected' } }, 418); }) as typeof fetch, 1);
const base = (id: string, extra: any): any => ({ id, toolId: 'h3-video', provider: 'test-hosted-model', status: 'running', stage: 'rendering', progress: 40, queuePos: 0, eta: 0, resultUrl: null, outputs: [], error: null, errorType: null, warnings: [], parentId: null,
  createdAt: Date.now() - 60_000, startedAt: Date.now() - 50_000, input: { prompt: 'a kite' }, cost: 0, refunded: 0, ...extra });
const falJob = base('rs-fal', { route: ROUTE.routeId, routing: { modelId: 'test-hosted-model', order: [ROUTE.routeId], prices: { [ROUTE.routeId]: 0 }, allowFallback: false, mode: 'pinned' },
  routeAttempts: [{ n: 1, routeId: ROUTE.routeId, status: 'running', startedAt: Date.now() - 50_000, charged: 0, refunded: 0, requestId: 'r1' }],
  remote: { kind: 'fal', id: 'r1', statusUrl: `${FAL}/status`, responseUrl: FAL, cancelUrl: `${FAL}/cancel`, routeId: ROUTE.routeId, attempt: 1, output: 0, outputs: 1, at: Date.now() - 50_000 } });
const CLOUD = 'comfy-cloud:cloud-h3-wf';
const cloudJob = base('rs-cloud', { provider: 'cloud-h3-wf', route: CLOUD, cloudJobId: 'cj-5', input: { prompt: 'a kite', mode: 't2v', duration: 5 }, routing: { modelId: 'cloud-h3-wf', order: [CLOUD], prices: { [CLOUD]: 0 }, allowFallback: false, mode: 'pinned' },
  routeAttempts: [{ n: 1, routeId: CLOUD, status: 'running', startedAt: Date.now() - 50_000, charged: 0, refunded: 0, requestId: 'cj-5' }] }); // an older job: only cloudJobId stored
const multiJob = base('rs-multi', { route: ROUTE.routeId, routing: { modelId: 'test-hosted-model', order: [ROUTE.routeId], prices: { [ROUTE.routeId]: 0 }, allowFallback: false, mode: 'pinned' },
  routeAttempts: [{ n: 1, routeId: ROUTE.routeId, status: 'running', startedAt: Date.now(), charged: 0, refunded: 0, requestId: 'r7' }],
  remote: { kind: 'fal', id: 'r7', statusUrl: `${FAL}/status`, responseUrl: FAL, cancelUrl: `${FAL}/cancel`, routeId: ROUTE.routeId, attempt: 1, output: 1, outputs: 2, at: Date.now() } });
for (const j of [falJob, cloudJob, multiJob]) jobs.set(j.id, j);

await import('../src/queue.ts'); // boot recovery runs here
assert.equal(falJob.stage, 'reconnecting'); assert.equal(falJob.remote.resuming, true); assert.equal(cloudJob.stage, 'reconnecting');
assert.equal(multiJob.status, 'failed'); assert.match(multiJob.error, /The server restarted while this was in progress/);
for (let i = 0; i < 300 && (falJob.status === 'running' || orphanCancels.length === 0 || !seen.some((c) => c.url.includes('/jobs/cj-5'))); i++) await new Promise((r) => setTimeout(r, 10));

assert.equal(falJob.status, 'done', falJob.error); assert.equal(falJob.routeAttempts.length, 1); assert.equal(falJob.routeAttempts[0].status, 'done');
assert.equal(fs.readFileSync(path.join(D, path.basename(falJob.resultUrl))).toString(), 'fake-mp4-bytes'); assert.ok(falJob.warnings.some((w: string) => /collected from fal after the run was interrupted/.test(w)));
assert.ok(!seen.some((c) => c.method === 'POST' && c.url.startsWith('https://queue.fal.run')), 'nothing re-submitted to fal');
ok('restart with a running fal job → picked up, polled with its stored request, finished done (no new submit, same attempt)');

assert.ok(seen.some((c) => c.method === 'GET' && c.url === 'https://cloud.test/api/v2/jobs/cj-5'), 'the Cloud job id is polled again');
assert.ok(!seen.some((c) => c.method === 'POST' && /\/api\/v2\/jobs(\/cj-5\/cancel)?$/.test(c.url)), 'never re-submitted, never cancelled');
assert.ok(!orphanCancels.includes('cj-5'), 'the Comfy Cloud job is not an orphan');
ok('restart with a running Comfy Cloud job → picked up (its job id polled), not cancelled');

assert.deepEqual(orphanCancels, ['r7'], 'only the job that cannot be picked up is cancelled at its provider'); assert.equal(multiJob.remote, null);
ok('a job of several requests (can\'t be picked up) → failed as before, its request cancelled at fal');
process.exit(0);
