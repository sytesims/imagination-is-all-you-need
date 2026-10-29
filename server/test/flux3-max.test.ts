// FLUX 3 Max on Comfy (2026-10-27, comfy/flux3MaxCloud.ts + tools/comfyFeatured.ts). FAKE fetches only (no network, no real key, no spend).
//  1 graphs: text (720p / 1080p × shapes) and 1–10 keyframes (spread / at times) pass Comfy Cloud's object_info; bad values are caught
//  2 routes: one card, place Comfy: the partner nodes on Comfy Cloud (every mode) + Comfy Router fal/flux-3-max (text at 720p); plain refusals
//  3 menu: FLUX 3 Max is on Create Video with its real name, modes t2v / i2v / flf / r2v, 10 keyframe slots
//  4 prices: rows from the docs (launch rates, then standard after Nov 7); the REAL quote endpoint = the charge, and picks the right place
//  5 run on a fake Comfy Cloud (3 keyframes at times): files uploaded, key once in extra_data, the checked graph submitted; the Router body
// Run: npx tsx test/flux3-max.test.ts
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'f3max-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0' });
for (const k of ['OPENHIGGSFIELD_ALLOW_UNMEASURED_CLOUD', 'COMFY_API_KEY', 'COMFY_CLOUD_URL', 'OPENHIGGSFIELD_COMFY_CLOUD_URL', 'COMFY_DEPLOY_URL', 'COMFY_RUNNER_URL', 'COMFY_BASE_URL', 'OPENHIGGSFIELD_FAL_KEY', 'FAL_KEY']) delete process.env[k];
globalThis.fetch = (async (u: unknown) => { throw new Error(`network blocked in this test: ${String(u).slice(0, 80)}`); }) as typeof fetch;
const ok = (m: string) => console.log('ok ' + m);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const OI = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'object-info-flux3-max-cloud-2026-10-26.json'), 'utf8'));
const F = await import('../src/comfy/flux3MaxCloud.ts');
const { checkCloudGraph } = await import('../src/comfy/cloudGraphCheck.ts');
const { CLOUD_WORKFLOWS, isStandalone } = await import('../src/comfy/cloudWorkflows.ts');
const { routesFor, findRoute } = await import('../src/routing/routes.ts');
const { HOSTED_BY_ID } = await import('../src/shared/hostedPrices.ts');
const { runCloudWorkflow, setCloudFetch } = await import('../src/routing/cloudRun.ts');
const { CLOUD_RUNNER_ROUTES, ROUTER_RUNNER_ROUTES } = await import('../src/routing/runnable.ts');
const { ROUTER_MODELS } = await import('../src/routing/routerModels.ts');
const { routeCredits, routeInput } = await import('../src/routing/select.ts');
const { getTool } = await import('../src/tools/registry.ts');
const { toolModels } = await import('../src/routing/modelRegistry.ts');
const { VIDEO_LIMITS } = await import('../src/tools/h3/videoCaps.ts');
const ff = (args: string[]) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args]);
const img = (name: string, size: string) => { ff(['-f', 'lavfi', '-i', `testsrc=size=${size}`, '-frames:v', '1', path.join(D, name)]); return name; };
const clean = (name: string, g: Record<string, any>) => { const r = checkCloudGraph(g, OI); assert.deepEqual(r.errors, [], `${name}: ${r.errors.join(' | ')}`); assert.deepEqual(r.warnings, [], `${name}: ${r.warnings.join(' | ')}`); };
const bad = (g: Record<string, any>, mut: (g: any) => void, re: RegExp) => { const x = structuredClone(g); mut(x); const r = checkCloudGraph(x, OI); assert.ok(r.errors.some((e) => re.test(e)), `${re}: ${r.errors}`); };
const ASSET = { __type: 'core/ASSET', info: { id: 'asset_1', hash: 'blake3:00', file_path: 'x.png' } };
const realNow = Date.now;

try {
  // ---- 1. graphs ----
  { let n = 0;
    for (const resolution of F.F3M_RESOLUTIONS) for (const aspect of F.F3M_ASPECTS) for (const duration of [5, 13, 20]) {
      const g = F.f3mGraph({ mode: 't2v', resolution, aspect, duration, prompt: 'a fox in snow', reasoning: duration === 13 ? 'low' : undefined }); clean(`t2v ${resolution} ${aspect} ${duration}`, g); n++;
      assert.equal(g['1'].class_type, F.F3M_T2V_NODE); assert.equal(g['1'].inputs.duration, String(duration)); assert.equal(g['1'].inputs.reasoning_level, duration === 13 ? 'low' : 'high'); }
    for (const k of [1, 2, 3, 6, 10]) for (const times of [null, Array.from({ length: k }, (_, x) => x * 0.5)]) {
      const g = F.f3mGraph({ mode: k === 1 ? 'i2v' : k === 2 ? 'flf' : 'r2v', resolution: '1080p', duration: 8, prompt: 'p', ...(times ? { keyframeTimes: times.join(',') } : {}) }, Array(k).fill(ASSET));
      clean(`i2v ${k} keyframes ${times ? 'at times' : 'spread'}`, g); n++;
      assert.equal(Object.values<any>(g).filter((v) => v.class_type === 'LoadImage').length, k); assert.equal(g["1"].inputs[`keyframes.image_${k - 1}`][0], String(9 + k));
      assert.equal(g['1'].inputs.placement, times ? 'at times' : 'spread across the clip'); if (times) assert.equal(g['1'].inputs['placement.times'], times.join(', ')); }
    const g = F.f3mGraph({ mode: 'i2v', prompt: 'x' }, [ASSET]);
    bad(g, (x) => { x['1'].inputs.resolution = '4K'; }, /not in the list/); bad(g, (x) => { x['1'].inputs.duration = '21'; }, /not in the list/); bad(g, (x) => { delete x['1'].inputs.seed; }, /"seed" is missing/);
    ok(`${n} graphs pass Comfy Cloud's object_info (0 errors, 0 warnings); bad values caught`); }

  // ---- 2. routes ----
  const video = getTool('h3-video')!;
  { const rs = routesFor(F.F3M_PROVIDER, video); assert.deepEqual(rs.map((r) => r.routeId), [F.F3M_ROUTE, F.F3M_ROUTER_ROUTE], 'Comfy Cloud partner nodes, then Comfy Router');
    const [cloud, router] = rs; assert.equal(cloud.label, 'Comfy Cloud'); assert.equal(router.label, 'Comfy Router'); assert.deepEqual(router.modes, ['t2v']);
    assert.ok(CLOUD_RUNNER_ROUTES.has(F.F3M_ROUTE) && isStandalone(CLOUD_WORKFLOWS[F.F3M_ROUTE]) && (CLOUD_WORKFLOWS[F.F3M_ROUTE] as any).partnerAuth, 'Cloud runner, key in extra_data');
    assert.ok(ROUTER_RUNNER_ROUTES.has(F.F3M_ROUTER_ROUTE)); assert.equal(ROUTER_MODELS[F.F3M_PROVIDER].id, 'fal/flux-3-max');
    assert.match(String(cloud.unavailableFor!({ mode: 't2v', resolution: '720p' })), /Comfy Router/); assert.equal(cloud.unavailableFor!({ mode: 't2v', resolution: '1080p', duration: 20 }), null);
    assert.match(String(cloud.unavailableFor!({ mode: 'r2v', refCount: 11 })), /up to 10 keyframe/); assert.match(String(cloud.unavailableFor!({ mode: 'i2v', duration: 4 })), /5 to 20 s/);
    assert.match(String(cloud.unavailableFor!({ mode: 'r2v', refCount: 3, keyframeTimes: '0, 2' })), /one time per keyframe/); assert.match(String(cloud.unavailableFor!({ mode: 'r2v', refCount: 2, keyframeTimes: '3, 1' })), /go up/);
    assert.match(String(cloud.unavailableFor!({ mode: 'r2v', refCount: 2, keyframeTimes: '0, 9', duration: 8 })), /inside the 8 s clip/); assert.equal(cloud.unavailableFor!({ mode: 'r2v', refCount: 3, keyframeTimes: '0, 2.5, 5', duration: 5 }), null);
    assert.match(String(F.f3mRouterIssue({ mode: 'i2v' })), /text to video only/); assert.match(String(F.f3mRouterIssue({ mode: 't2v', resolution: '1080p' })), /Comfy Cloud/); assert.equal(F.f3mRouterIssue({ mode: 't2v', resolution: '720p', aspect: '21:9' }), null);
    ok('routes: one card, Comfy Cloud (every mode) + Comfy Router (text 720p); keyframe and length rules refuse in plain words'); }

  // ---- 3. menu ----
  { const m = toolModels('h3-video').find((x: any) => x.key === 'flux-3-max')!; assert.ok(m, 'FLUX 3 Max on Create Video'); assert.equal(m.def.name, 'FLUX 3 Max'); assert.equal(m.def.maker, 'bfl'); assert.deepEqual(m.parts.map((p: any) => p.engine), [F.F3M_PROVIDER], 'one card');
    assert.deepEqual((video as any).app.providerModes[F.F3M_PROVIDER], ['t2v', 'i2v', 'flf', 'r2v']); assert.equal(VIDEO_LIMITS[F.F3M_PROVIDER].refKinds.image, 10);
    ok('menu: FLUX 3 Max on Create Video, four modes, 10 keyframe slots, place Comfy'); }

  // ---- 4. prices ----
  { Date.now = () => Date.UTC(2026, 9, 27); assert.deepEqual(HOSTED_BY_ID[F.F3M_PROVIDER].usdByQuality, { '720p': 0.060775, '1080p': 0.103675 }); assert.equal(HOSTED_BY_ID[F.F3M_ROUTER_ROUTE].usdByQuality!['720p'], 0.0303875);
    Date.now = () => Date.UTC(2026, 10, 7); assert.deepEqual(HOSTED_BY_ID[F.F3M_PROVIDER].usdByQuality, { '720p': 0.2431, '1080p': 0.4147 }); assert.equal(HOSTED_BY_ID[F.F3M_ROUTER_ROUTE].usdByQuality!['720p'], 0.12155);
    Date.now = realNow; }
  const K = [img('k1.png', '1280x720'), img('k2.png', '1280x720'), img('k3.png', '1280x720')];
  const parse = async (t: any, f: Record<string, string>, files: Record<string, string[]>) => { const r: any = await t.parseInput(f, files); assert.ok(!r.error, String(r.error)); return r; };
  { const Fastify = (await import('fastify')).default; const app = Fastify(); (await import('../src/routesBatch1.ts')).registerBatch1(app); (await import('../src/routing/http.ts')).registerRouting(app); await app.ready();
    const seen: Record<string, string> = {};
    for (const [mode, s, res, route, rate] of [['t2v', '5', '720p', F.F3M_ROUTER_ROUTE, 0.0303875], ['t2v', '10', '1080p', F.F3M_ROUTE, 0.103675], ['i2v', '8', '720p', F.F3M_ROUTE, 0.060775], ['flf', '20', '1080p', F.F3M_ROUTE, 0.103675], ['r2v', '12', '720p', F.F3M_ROUTE, 0.060775]] as const) {
      const qs = new URLSearchParams({ provider: F.F3M_PROVIDER, types: JSON.stringify([mode]), duration: s, resolution: res, ...(mode === 't2v' ? {} : { image: '1' }) });
      const r = await app.inject({ url: `/api/tools/h3-video/price?${qs}` }); assert.equal(r.statusCode, 200, r.body.slice(0, 300)); const b = r.json(); assert.equal(b.route, route, `${mode} ${res}: ${JSON.stringify(b).slice(0, 300)}`);
      const files = mode === 't2v' ? {} : mode === 'i2v' ? { image: [K[0]] } : mode === 'flf' ? { image: [K[0]], lastFrame: [K[1]] } : { refs: K };
      const job = await parse(video, { provider: F.F3M_PROVIDER, prompt: 'a fox trots across snow', types: JSON.stringify([mode]), duration: s, resolution: res }, files);
      const charge = routeCredits(video, findRoute(route)!, routeInput(video, job))!; const quoted = b.listCredits ?? b.credits;
      assert.equal(quoted, charge, `${mode} ${s} ${res}: quote ${quoted} = charge ${charge}`); assert.equal(charge, Math.ceil(Math.round(Number(s) * rate * 100 * 1e6) / 1e6));
      seen[`${mode} ${s}s ${res}`] = `$${(quoted / 100).toFixed(2)}`; }
    await app.close(); ok(`quote endpoint = charge, right place: ${JSON.stringify(seen)}`); }

  // ---- 5. fake Comfy Cloud run + the Router body ----
  process.env.COMFY_API_KEY = 'comfyui-fake-f3max-key-0000'; process.env.COMFY_CLOUD_URL = 'http://cloud.test';
  const json = (o: any, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
  { const out = path.join(D, 'out.mp4'); ff(['-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=24', '-t', '1', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', out]);
    const calls: { url: string; method: string; body?: any }[] = [];
    setCloudFetch((async (u: any, init: any = {}) => { const url = String(u); calls.push({ url, method: init.method ?? 'GET', body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined });
      if (url.endsWith('/api/v2/assets')) return json({ id: `a${calls.length}`, hash: 'blake3:00', file_path: 'x.png' }, 201);
      if (url.endsWith('/api/v2/jobs')) return json({ id: 'f3m-cj', status: 'queued' }, 201);
      if (url.endsWith('/api/v2/jobs/f3m-cj')) return json({ status: 'succeeded', outputs: [{ node_id: '2', id: 'o1', name: 'f.mp4', filename: 'f.mp4', content_type: 'video/mp4', url: '/api/v2/assets/o1/content' }] });
      return new Response(fs.readFileSync(out), { status: 200 }); }) as typeof fetch, 1);
    const input = await parse(video, { provider: F.F3M_PROVIDER, prompt: 'SHOT ONE the ship lifts off. HARD CUT. SHOT TWO it leaves orbit.', types: '["r2v"]', duration: '6', resolution: '1080p', keyframeTimes: '0, 2.5, 6', reasoning: 'low' }, { refs: K });
    const job: any = { id: 'f3m', toolId: 'h3-video', provider: F.F3M_PROVIDER, route: F.F3M_ROUTE, input, status: 'queued', outputs: [] };
    await runCloudWorkflow(job, findRoute(F.F3M_ROUTE)!, { n: 1 } as any); assert.equal(job.status, 'done', job.error);
    const sub = calls.find((c) => c.url.endsWith('/api/v2/jobs') && c.method === 'POST')!.body; assert.deepEqual(sub.extra_data, { api_key_comfy_org: 'comfyui-fake-f3max-key-0000' });
    clean('sent', sub.workflow); const n = sub.workflow['1'].inputs; assert.equal(n.placement, 'at times'); assert.equal(n['placement.times'], '0, 2.5, 6'); assert.equal(n.reasoning_level, 'low'); assert.equal(n.resolution, '1080p');
    assert.equal(calls.filter((c) => c.url.endsWith('/api/v2/assets')).length, 3, 'three keyframes uploaded'); assert.ok(!JSON.stringify(job).includes('comfyui-fake-f3max-key-0000'));
    const body = await ROUTER_MODELS[F.F3M_PROVIDER].body({ mode: 't2v', prompt: 'a fox', duration: 7, resolution: '720p', aspect: '9:16', audio: false }, 0);
    assert.deepEqual(body, { prompt: 'a fox', duration: 7, resolution: '720p', aspect_ratio: '9:16', reasoning_level: 'high', generate_audio: false });
    assert.deepEqual(ROUTER_MODELS[F.F3M_PROVIDER].outputs({ seed: 1, video: { url: 'https://x/v.mp4' } }), [{ url: 'https://x/v.mp4' }]);
    ok('fake Cloud run: 3 keyframes at times uploaded, key once in extra_data, checked graph sent; Router body = the fal/flux-3-max schema'); }
} finally { Date.now = realNow; setCloudFetch(null); fs.rmSync(D, { recursive: true, force: true }); }
console.log('flux3-max: all ok');
