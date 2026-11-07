// RunPod place (plugins-builtin/place-runpod.ts; providers/runpod.ts; routing/runpodRoutes.ts): our ComfyUI image graphs on a RunPod Serverless
// endpoint with the worker-comfyui image. No real API and no real key: a tiny local fake server answers with bodies shaped like the docs
// (https://docs.runpod.io/serverless/endpoints/send-requests; worker-comfyui README: input {workflow, images[{name, image}]}, output images
// [{filename, type base64|s3_url, data}]). Keys are fake strings that only ever reach 127.0.0.1.
// Checks: hidden without the key and the Endpoint ID; the quote is an estimate; run → IN_QUEUE → IN_PROGRESS → COMPLETED with a base64 image saved
// and the GPU-time cost recorded; an S3 link output (fetched without the key); FAILED with RunPod's error; cancel; 401; a file over the 10 MB body
// cap refused before anything is sent; off by default (not in the desktop profile: no routes, no Connections card).
// Run: npx tsx test/place-runpod.e2e.ts
import assert from 'node:assert/strict'; import http from 'node:http'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { testPort } from './_ports.js';
const ok = (m: string) => console.log('ok ' + m);
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'runpod-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: process.env.OPENHIGGSFIELD_DATA_DIR || D, OPENHIGGSFIELD_ENV_FILE: process.env.OPENHIGGSFIELD_ENV_FILE || path.join(D, 'none.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_POLL_MAX_MISSES: '3' });
for (const k of ['OPENHIGGSFIELD_RUNPOD_API_KEY', 'RUNPOD_API_KEY', 'OPENHIGGSFIELD_MOCK_KEYS', 'OPENHIGGSFIELD_ROUTING_LIVE', 'OPENHIGGSFIELD_PLACE_RUNPOD_ENDPOINT_ID']) delete process.env[k];

// ---- the fake RunPod: records every request; each test sets the answers ----
type Req = { method: string; url: string; headers: http.IncomingHttpHeaders; body: Buffer };
const seen: Req[] = []; let answer: (r: Req) => { status?: number; json?: unknown; bytes?: Buffer } = () => ({ status: 404, json: {} });
const PORT = testPort(9483); const BASE = `http://127.0.0.1:${PORT}/v2`;
const srv = http.createServer((req, res) => { const chunks: Buffer[] = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => {
  const r: Req = { method: req.method!, url: req.url!, headers: req.headers, body: Buffer.concat(chunks) }; seen.push(r); const a = answer(r);
  res.writeHead(a.status ?? 200, { 'content-type': a.bytes ? 'image/png' : 'application/json' }); res.end(a.bytes ?? JSON.stringify(a.json ?? {})); }); });
await new Promise<void>((done) => srv.listen(PORT, '127.0.0.1', done));
const reset = () => { seen.length = 0; };
process.env.OPENHIGGSFIELD_PLACE_RUNPOD_BASE_URL = BASE; // the plugin's baseUrl setting (ctx.settings: profile → env → kv), tests only

// Endpoint ID through the settings' kv layer (what Connections saves), so a test can set and clear it
const { setSettingsKv } = await import('../src/kernel/settings.js');
let kv: Record<string, unknown> = {}; setSettingsKv((k) => (k === 'settings.place-runpod' ? kv : null));
const setEndpoint = (e: string | null) => { kv = e ? { endpointId: e } : {}; };

const PNG = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../samples/card-name.png'));
const { CORE_KEYS } = await import('../src/kernel/coreKeys.js');
const { runpodPlaceOf } = await import('../src/plugins-builtin/place-runpod.js');
const { RUNPOD_TOO_BIG, RUNPOD_KEY_REFUSED } = await import('../src/providers/runpod.js');
const { RUNPOD_PRICE_REF } = await import('../src/routing/runpodRoutes.js');
const { places, PlaceError } = await import('../src/services/places.js');
const { findRoute, routesFor } = await import('../src/routing/routes.js');
const { getTool } = await import('../src/tools/registry.js');
await import('../src/services/placesBuiltin.js');
const tool = getTool('create-image')!;
const R = findRoute('runpod:comfy-zimage-turbo')!; const RE = findRoute('runpod:comfy-qwen21-turbo')!;
assert.ok(R && RE, 'the route rows exist (findRoute finds them even while the place is off)');
assert.equal(R.kind, 'runpod'); assert.equal(R.label, 'RunPod'); assert.deepEqual(R.tools, ['create-image']);
const runner = runpodPlaceOf(CORE_KEYS, { pollMs: 2 });

let jn = 0;
const mkJob = (input: Record<string, any>, provider = 'comfy-zimage-turbo') => ({ id: `rp${++jn}-${Date.now().toString(36)}`, toolId: 'create-image', provider, status: 'running', input: { prompt: 'a red fox in snow', types: ['generate'], n: 1, ...input }, createdAt: Date.now() } as any);
const mkKit = (job: any, o: { canceledAfter?: () => boolean } = {}) => { const remembered: any[] = [];
  return { remembered, kit: { timeoutMs: 60_000, key: 'fake-runpod-not-real', requestId: () => `${job.id}-a1`, isCanceled: () => job.status === 'canceled', resuming: null, resumeAt: () => null,
    remember: (ref: any, k: number, n: number) => remembered.push({ ...ref, k, n }), label: () => 'Result', count: 1, save: async () => '', where: 'RunPod' } as any }; };
const attempt = () => ({ n: 1, routeId: R.routeId, status: 'running', startedAt: Date.now(), charged: 0, refunded: 0 } as any);
const statusSeq = (id: string, final: Record<string, unknown>) => { let n = 0; return (r: Req) => {
  if (r.url === `/v2/ep123/status/${id}`) { n++; return { json: n === 1 ? { id, status: 'IN_QUEUE' } : n === 2 ? { id, status: 'IN_PROGRESS', delayTime: 900 } : { id, delayTime: 900, ...final } }; }
  return null; }; };
const jsonOf = (r: Req) => JSON.parse(r.body.toString() || '{}');
const plugin = places.register(runner); // as if place-runpod were in the profile (it isn't built in); boot below checks the real thing

try {
  // ---- hidden until both the key and the Endpoint ID are set ----
  { const kinds = () => routesFor('comfy-zimage-turbo', tool).map((r) => r.kind);
    setEndpoint(null); assert.ok(!kinds().includes('runpod'), 'no key, no endpoint: hidden');
    process.env.OPENHIGGSFIELD_RUNPOD_API_KEY = 'fake-runpod-not-real'; assert.ok(!kinds().includes('runpod'), 'key only: still hidden');
    delete process.env.OPENHIGGSFIELD_RUNPOD_API_KEY; setEndpoint('ep123'); assert.ok(!kinds().includes('runpod'), 'endpoint only: still hidden');
    process.env.OPENHIGGSFIELD_RUNPOD_API_KEY = 'fake-runpod-not-real'; assert.ok(kinds().includes('runpod'), 'key and endpoint: listed');
    setEndpoint('bad id!'); assert.ok(!kinds().includes('runpod'), 'an Endpoint ID that isn’t one counts as not set');
    process.env.OPENHIGGSFIELD_MOCK_KEYS = '1'; delete process.env.OPENHIGGSFIELD_RUNPOD_API_KEY; setEndpoint('ep123');
    assert.ok(!kinds().includes('runpod'), 'mock keys never fake the RunPod key'); delete process.env.OPENHIGGSFIELD_MOCK_KEYS;
    assert.ok(!routesFor('comfy-zimage-turbo', getTool('shots') ?? 'shots').some((r) => r.kind === 'runpod'), 'Create Image only (V1)');
    ok('hidden without the RunPod key and the Endpoint ID (and with a malformed ID or mock keys); Create Image only'); }

  // ---- the quote is an estimate (GPU seconds × the rate) ----
  { process.env.OPENHIGGSFIELD_RUNPOD_API_KEY = 'fake-runpod-not-real'; setEndpoint('ep123');
    const { option } = await import('../src/routing/select.js'); const { priceOf } = await import('../src/shared/pricing.js'); const { costOf } = await import('../src/billing.js');
    const o = option(tool, R, { types: ['generate'], imageResolution: '1K' }); assert.equal(o.available, true, o.reason); assert.equal(o.credits, 3, '60 s × $0.000486 = $0.029 → 3 credits');
    const p = priceOf({ provider: RUNPOD_PRICE_REF, count: 2, imageRes: '1K' } as any); assert.equal(p.unconfirmed, true, 'marked as an estimate'); assert.equal(p.credits, 6, '× 2 images');
    assert.match(p.breakdown[0].label, /estimate/);
    const c = costOf({ kind: 'runpod', routeId: R.routeId, credits: 3 }); assert.equal(c.unconfirmed, true); assert.equal(c.billedTo, 'runpod'); assert.equal(c.failureRule, 'may-charge');
    kv = { endpointId: 'ep123', gpuUsdPerSecond: 0.001, secondsPerImage: 30 }; assert.equal(option(tool, R, { types: ['generate'], imageResolution: '1K' }).credits, 3, 'the rate settings price the next quote ($0.03)');
    setEndpoint('ep123');
    ok('quote: an estimate (D1 estimateUsd = seconds per image × GPU rate), RunPod bills it, failed runs may be charged'); }

  // ---- run: IN_QUEUE → IN_PROGRESS → COMPLETED, base64 image saved, GPU-time cost ----
  { reset(); const st = statusSeq('job1', { status: 'COMPLETED', executionTime: 12_000, output: { images: [{ filename: 'ComfyUI_00001_.png', type: 'base64', data: PNG.toString('base64') }] } });
    answer = (r) => (r.method === 'POST' && r.url === '/v2/ep123/run' ? { json: { id: 'job1', status: 'IN_QUEUE' } } : st(r) ?? { status: 404, json: {} });
    const job = mkJob({}); const a = attempt(); const { kit, remembered } = mkKit(job); const phases: string[] = [];
    const t = setInterval(() => { if (job.liveStage && phases.at(-1) !== job.liveStage) phases.push(job.liveStage); }, 1);
    await runner.attempt!(job, tool, R, a, kit); clearInterval(t);
    assert.equal(job.status, 'done'); assert.ok(job.outputs?.length === 1 && /^\/files\//.test(job.outputs[0].url));
    const saved = path.join(process.env.OPENHIGGSFIELD_DATA_DIR!, path.basename(job.outputs[0].url)); assert.ok(fs.existsSync(saved) && fs.statSync(saved).size > 100, 'the image is saved in the data dir');
    const sub = seen[0]; assert.equal(sub.headers.authorization, 'Bearer fake-runpod-not-real'); const body = jsonOf(sub);
    assert.ok(body.input?.workflow && typeof body.input.workflow === 'object' && Object.values<any>(body.input.workflow).some((n) => n.class_type === 'KSampler' || /Sampler/.test(n.class_type)), 'a ComfyUI API graph is sent');
    assert.equal(body.input.images, undefined, 'a text-to-image job sends no images');
    assert.equal(a.requestId, 'job1'); assert.deepEqual(remembered[0], { kind: 'runpod', id: 'job1', k: 0, n: 1 }, 'remembered at once (restart: only polled)');
    assert.deepEqual(job.actualCost, { usd: 0.005832, units: 12, unitLabel: 'GPU seconds', source: 'runpod:executionTime' }, '12 s × $0.000486');
    assert.deepEqual(a.reportedCost, { usd: 0.005832, source: 'estimate' });
    assert.ok(seen.every((r) => r.url.startsWith('/v2/ep123/')), 'every call goes to the endpoint on the base URL');
    ok('run: graph + Bearer key → IN_QUEUE → IN_PROGRESS → COMPLETED; base64 image saved; executionTime × rate recorded as the actual cost'); }

  // ---- an input photo goes inline; S3 link output fetched without the key ----
  { reset(); const img = path.join(D, 'photo.png'); fs.writeFileSync(img, PNG);
    const st = statusSeq('job2', { status: 'COMPLETED', executionTime: 5000, output: { images: [{ filename: 'edit_00001_.png', type: 's3_url', data: `http://127.0.0.1:${PORT}/s3/bucket/edit_00001_.png?X-Amz-Signature=x` }] } });
    answer = (r) => r.method === 'POST' && r.url === '/v2/ep123/run' ? { json: { id: 'job2', status: 'IN_QUEUE' } } : r.url.startsWith('/s3/') ? { bytes: PNG } : st(r) ?? { status: 404, json: {} };
    const job = mkJob({ types: ['edit'], imagePath: img }, 'comfy-qwen21-turbo'); const { kit } = mkKit(job);
    await runner.attempt!(job, tool, RE, attempt(), kit);
    assert.equal(job.status, 'done'); const body = jsonOf(seen[0]);
    assert.equal(body.input.images?.length, 1); assert.equal(body.input.images[0].image, PNG.toString('base64'), 'the photo as base64');
    assert.ok(JSON.stringify(body.input.workflow).includes(JSON.stringify(body.input.images[0].name)), 'the graph loads it by the name sent');
    const s3 = seen.find((r) => r.url.startsWith('/s3/'))!; assert.ok(s3, 'the S3 link was fetched'); assert.equal(s3.headers.authorization, undefined, 'never with the RunPod key');
    ok('edit: the input photo goes inline (images[{name, base64}]) and the graph names it; an s3_url output is downloaded without the key'); }

  // ---- FAILED with RunPod's error, TIMED_OUT ----
  { reset(); const st = statusSeq('job3', { status: 'FAILED', executionTime: 3000, error: 'Workflow validation failed: node 7 CheckpointLoaderSimple: ckpt_name not in list' });
    answer = (r) => r.method === 'POST' ? { json: { id: 'job3' } } : st(r) ?? { status: 404, json: {} };
    const job = mkJob({}); const e = await runner.attempt!(job, tool, R, attempt(), mkKit(job).kit).catch((x) => x);
    assert.ok(e instanceof PlaceError); assert.match(e.message, /RunPod: the workflow failed: Workflow validation failed: node 7/); assert.equal(e.cls, 'unknown');
    assert.equal(job.actualCost?.units, 3, 'a failed run’s GPU time is still recorded (RunPod bills it)');
    reset(); const st2 = statusSeq('job4', { status: 'TIMED_OUT', executionTime: 600_000 }); answer = (r) => r.method === 'POST' ? { json: { id: 'job4' } } : st2(r) ?? { status: 404, json: {} };
    const j2 = mkJob({}); const e2 = await runner.attempt!(j2, tool, R, attempt(), mkKit(j2).kit).catch((x) => x);
    assert.match(e2.message, /time limit/); assert.equal(e2.timeout, true);
    ok('FAILED → "RunPod: the workflow failed: <RunPod’s words>", GPU time recorded; TIMED_OUT → a timeout'); }

  // ---- cancel ----
  { reset(); let polls = 0; const job = mkJob({});
    answer = (r) => r.method === 'POST' && r.url === '/v2/ep123/run' ? { json: { id: 'job5' } } : r.method === 'POST' && r.url === '/v2/ep123/cancel/job5' ? { json: { id: 'job5', status: 'CANCELLED' } }
      : r.url === '/v2/ep123/status/job5' ? (++polls >= 2 && (job.status = 'canceled'), { json: { id: 'job5', status: 'IN_PROGRESS' } }) : { status: 404, json: {} };
    await runner.attempt!(job, tool, R, attempt(), mkKit(job).kit).catch(() => undefined);
    assert.ok(seen.some((r) => r.method === 'POST' && r.url === '/v2/ep123/cancel/job5'), 'RunPod was asked to cancel'); assert.equal(seen.find((r) => r.url.includes('/cancel/'))!.headers.authorization, 'Bearer fake-runpod-not-real');
    reset(); answer = () => ({ json: { id: 'job5', status: 'CANCELLED' } });
    assert.equal(await runner.cancel!({ kind: 'runpod', id: 'job5', routeId: R.routeId, attempt: 1, output: 0, outputs: 1, at: 0 } as any, { routeId: R.routeId, envKey: R.envKey, envAliases: R.envAliases }, fetch), true, 'Cancel / an orphan');
    assert.equal(seen[0].url, '/v2/ep123/cancel/job5');
    answer = () => ({ status: 500, json: {} }); assert.equal(await runner.cancel!({ kind: 'runpod', id: 'job5' } as any, { routeId: R.routeId, envKey: R.envKey, envAliases: R.envAliases }, fetch), false, 'not confirmed');
    ok('cancel: Cancel while running → POST /cancel/{id} with the key; cancel() for Cancel / orphans'); }

  // ---- 401 ----
  { reset(); answer = () => ({ status: 401, json: { error: 'Unauthorized' } });
    const job = mkJob({}); const e = await runner.attempt!(job, tool, R, attempt(), mkKit(job).kit).catch((x) => x);
    assert.ok(e instanceof PlaceError); assert.equal(e.message, RUNPOD_KEY_REFUSED); assert.equal(job.reasonCode, 'key_invalid'); assert.equal(e.status, 401);
    ok('401 → "RunPod key not accepted" (key_invalid)'); }

  // ---- over the 10 MB body cap: refused at quote and before sending ----
  { reset(); answer = () => ({ status: 500, json: { error: 'nothing should arrive' } });
    const big = path.join(D, 'big.png'); fs.writeFileSync(big, Buffer.concat([PNG, Buffer.alloc(8_000_000, 1)]));
    const { mediaIssue } = await import('../src/mediaHandoff.js'); const { option } = await import('../src/routing/select.js');
    assert.equal(mediaIssue(RE, { imagePath: big }), RUNPOD_TOO_BIG); assert.equal(RUNPOD_TOO_BIG, 'This file is too big to send to RunPod (max 10 MB). Use a smaller file or another place.');
    const o = option(tool, RE, { types: ['edit'], imagePath: big }); assert.equal(o.available, false); assert.equal(o.reason, RUNPOD_TOO_BIG); assert.equal(o.reasonCode, 'input_blocked');
    assert.equal(mediaIssue(RE, { imagePath: path.join(D, 'photo.png') }), null, 'a small photo is fine');
    const job = mkJob({ types: ['edit'], imagePath: big }, 'comfy-qwen21-turbo'); const e = await runner.attempt!(job, tool, RE, attempt(), mkKit(job).kit).catch((x) => x);
    assert.ok(e instanceof PlaceError); assert.equal(e.message, RUNPOD_TOO_BIG); assert.equal(e.cls, 'bad_input');
    assert.equal(seen.length, 0, 'no request reached RunPod'); assert.ok(!job.requestIds?.length && !job.actualCost, 'nothing sent, nothing to charge');
    ok('over 10 MB: the quote says so (input_blocked) and the runner refuses before sending; no request reaches RunPod'); }
  plugin();

  // ---- off by default: not in the desktop profile; boot with and without it ----
  { const { readProfile } = await import('../src/kernel/profile.js'); const { providerSettings } = await import('../src/routing/settings.js');
    const plugins = readProfile('desktop').plugins; assert.ok(!plugins.includes('place-runpod'), 'RunPod is not in the desktop profile');
    assert.equal(places.off('runpod'), true, 'off without its plugin, even without booting');
    assert.ok(!routesFor('comfy-zimage-turbo', tool).some((r) => r.kind === 'runpod'), 'off: no RunPod route even with the key and endpoint');
    assert.ok(!providerSettings().some((p) => p.id === 'runpod'), 'off: no Connections card');
    const { boot } = await import('../src/boot.js');
    await boot({ name: 't', plugins: [...plugins.filter((x) => x !== 'legacy'), 'place-runpod', 'legacy'], file: 't.yml' }, { legacy: false });
    setSettingsKv((k) => (k === 'settings.place-runpod' ? kv : null)); // boot points the kv layer at the db; keep the test's
    assert.ok(routesFor('comfy-zimage-turbo', tool).some((r) => r.kind === 'runpod'), 'with place-runpod in the profile, key and endpoint: listed');
    const card = providerSettings().find((p) => p.id === 'runpod')!; assert.ok(card, 'Connections card'); assert.equal(card.configured, true);
    assert.deepEqual(card.fields?.map((f) => [f.id, f.label, f.value]), [['endpointId', 'Endpoint ID', 'ep123']]);
    const { declaredKeys, KeyNotDeclared } = await import('../src/kernel/keys.js'); assert.deepEqual(declaredKeys('place-runpod'), ['OPENHIGGSFIELD_RUNPOD_API_KEY', 'RUNPOD_API_KEY']);
    assert.throws(() => places.get('runpod')!.key({ envKey: 'OPENHIGGSFIELD_FAL_KEY', envAliases: [] }), KeyNotDeclared, 'reads only its own key');
    const { storeField } = await import('../src/routing/settings.js'); assert.ok('error' in storeField('runpod', 'endpointId', 'not an id!'), 'a malformed Endpoint ID is refused');
    delete process.env.OPENHIGGSFIELD_RUNPOD_API_KEY; setEndpoint(null);
    assert.ok(!routesFor('comfy-zimage-turbo', tool).some((r) => r.kind === 'runpod'), 'key and endpoint removed: hidden again');
    ok('off by default: not in the desktop profile (no routes, no card); with it listed: card with Endpoint ID, its own key only'); }
} finally { srv.close(); }
process.exit(0);
