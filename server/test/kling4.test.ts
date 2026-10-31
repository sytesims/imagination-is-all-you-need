// Kling 4.0 on Comfy Cloud (2026-10-31, comfy/kling4Cloud.ts + tools/comfyFeatured.ts). FAKE fetches only (no network, no real key, no spend).
//  1 graphs: text, start frame, start + end, 1–10 references pass an object_info built from the node schemas in ComfyUI PR #17364
//    (test/fixtures/object-info-kling4-from-pr-17364.json; Comfy Cloud's own copy needs a key); bad values are caught
//  2 route + plain refusals: 3–30 s, 720p / 1080p, ≤ 10 images, no start frame, picture size and shape
//  3 menu: Kling 4.0 on Create Video with its real name and maker, four modes, sound always on (no switch)
//  4 prices: the price badge per second × resolution; the REAL quote endpoint = the charge (3 s and 30 s, 720p and 1080p)
//  5 run on a fake Comfy Cloud (3 references): files uploaded, key once in extra_data, the checked graph submitted
//  6 keyframes (2026-10-31): 2–10 frames, first / evenly spaced middle / last, no times; the bar's caps, the quote and the submit agree; H3 keeps 2–5 at times
// Run: npx tsx test/kling4.test.ts
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'kling4-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0' });
for (const k of ['OPENHIGGSFIELD_ALLOW_UNMEASURED_CLOUD', 'COMFY_API_KEY', 'COMFY_CLOUD_URL', 'OPENHIGGSFIELD_COMFY_CLOUD_URL', 'COMFY_DEPLOY_URL', 'COMFY_RUNNER_URL', 'COMFY_BASE_URL', 'OPENHIGGSFIELD_FAL_KEY', 'FAL_KEY']) delete process.env[k];
globalThis.fetch = (async (u: unknown) => { throw new Error(`network blocked in this test: ${String(u).slice(0, 80)}`); }) as typeof fetch;
const ok = (m: string) => console.log('ok ' + m);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const OI = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'object-info-kling4-from-pr-17364.json'), 'utf8'));
const K = await import('../src/comfy/kling4Cloud.ts');
const { checkCloudGraph } = await import('../src/comfy/cloudGraphCheck.ts');
const { CLOUD_WORKFLOWS, isStandalone } = await import('../src/comfy/cloudWorkflows.ts');
const { routesFor, findRoute } = await import('../src/routing/routes.ts');
const { HOSTED_BY_ID } = await import('../src/shared/hostedPrices.ts');
const { runCloudWorkflow, setCloudFetch } = await import('../src/routing/cloudRun.ts');
const { CLOUD_RUNNER_ROUTES } = await import('../src/routing/runnable.ts');
const { routeCredits, routeInput } = await import('../src/routing/select.ts');
const { getTool } = await import('../src/tools/registry.ts');
const { toolModels } = await import('../src/routing/modelRegistry.ts');
const { VIDEO_LIMITS } = await import('../src/tools/h3/videoCaps.ts');
const { aboutLink } = await import('../src/shared/modelLinks.ts');
const ff = (args: string[]) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args]);
const img = (name: string, size: string) => { ff(['-f', 'lavfi', '-i', `testsrc=size=${size}`, '-frames:v', '1', path.join(D, name)]); return name; };
const clean = (name: string, g: Record<string, any>) => { const r = checkCloudGraph(g, OI); assert.deepEqual(r.errors, [], `${name}: ${r.errors.join(' | ')}`); assert.deepEqual(r.warnings, [], `${name}: ${r.warnings.join(' | ')}`); };
const bad = (g: Record<string, any>, mut: (g: any) => void, re: RegExp) => { const x = structuredClone(g); mut(x); const r = checkCloudGraph(x, OI); assert.ok(r.errors.some((e) => re.test(e)), `${re}: ${r.errors}`); };
const ASSET = { __type: 'core/ASSET', info: { id: 'asset_1', hash: 'blake3:00', file_path: 'x.png' } };

try {
  // ---- 1. graphs ----
  { let n = 0;
    for (const resolution of K.K4_RESOLUTIONS) for (const aspect of K.K4_ASPECTS) for (const duration of [3, 17, 30]) {
      const g = K.k4Graph({ mode: 't2v', resolution, aspect, duration, prompt: 'a fox in snow' }); clean(`t2v ${resolution} ${aspect} ${duration}`, g); n++;
      assert.equal(g['1'].class_type, K.K4_T2V_NODE); assert.equal(g['1'].inputs['model.duration'], duration); assert.equal(g['1'].inputs['model.aspect_ratio'], aspect === 'auto' ? '16:9' : aspect); }
    for (const mode of ['i2v', 'flf'] as const) { const g = K.k4Graph({ mode, prompt: '', resolution: '1080p', duration: 8 }, Array(mode === 'flf' ? 2 : 1).fill(ASSET)); clean(mode, g); n++;
      assert.equal(g['1'].class_type, K.K4_I2V_NODE); assert.equal('model.last_frame' in g['1'].inputs, mode === 'flf'); }
    for (const k of [1, 4, 10]) { const g = K.k4Graph({ mode: 'r2v', prompt: '@image1 walks', resolution: '720p', duration: 5 }, Array(k).fill(ASSET)); clean(`r2v ${k}`, g); n++;
      assert.equal(g['1'].class_type, K.K4_R2V_NODE); assert.equal(g['1'].inputs['model.aspect_ratio'], 'adaptive'); assert.deepEqual(g['1'].inputs[`model.reference_images.image_${k}`], [String(9 + k), 0]); }
    const g = K.k4Graph({ mode: 't2v', prompt: 'x' });
    bad(g, (x) => { x['1'].inputs['model.resolution'] = '4K'; }, /not in the list/); bad(g, (x) => { x['1'].inputs['model.duration'] = 31; }, /outside/); bad(g, (x) => { x['1'].inputs['model.duration'] = 2; }, /outside/);
    ok(`${n} graphs pass the node schemas (0 errors, 0 warnings); 4K, 2 s and 31 s caught`); }

  // ---- 2. route + refusals ----
  const video = getTool('h3-video')!;
  { const rs = routesFor(K.K4_PROVIDER, video); assert.deepEqual(rs.map((r) => r.routeId), [K.K4_ROUTE]); const [cloud] = rs; assert.equal(cloud.label, 'Comfy Cloud');
    assert.ok(CLOUD_RUNNER_ROUTES.has(K.K4_ROUTE) && isStandalone(CLOUD_WORKFLOWS[K.K4_ROUTE]) && (CLOUD_WORKFLOWS[K.K4_ROUTE] as any).partnerAuth, 'Cloud runner, key in extra_data');
    for (const s of [3, 30]) assert.equal(cloud.unavailableFor!({ mode: 't2v', resolution: '1080p', duration: s }), null);
    assert.match(String(cloud.unavailableFor!({ mode: 't2v', duration: 31 })), /3 to 30 s/); assert.match(String(cloud.unavailableFor!({ mode: 't2v', duration: 2 })), /3 to 30 s/);
    assert.match(String(cloud.unavailableFor!({ mode: 't2v', resolution: '4K' })), /720p or 1080p/);
    assert.match(String(cloud.unavailableFor!({ mode: 'r2v', refCount: 11 })), /up to 10 reference images; you added 11/); assert.equal(cloud.unavailableFor!({ mode: 'r2v', refCount: 10 }), null);
    assert.match(String(cloud.unavailableFor!({ mode: 'r2v', refVideoPaths: ['a.mp4'] })), /not wired/);
    const plan = (input: any) => { try { K.k4CloudPlan({ id: 'x', toolId: 'h3-video', provider: K.K4_PROVIDER, input }); return null; } catch (e: any) { return String(e.message); } };
    assert.match(String(plan({ mode: 'i2v', prompt: 'p' })), /needs a start frame.*Nothing was sent or charged/);
    assert.match(String(plan({ mode: 'flf', imagePath: path.join(D, img('s.png', '1280x720')) })), /start and an end frame/);
    assert.match(String(plan({ mode: 'i2v', imagePath: path.join(D, img('tiny.png', '320x200')) })), /at least 300 px/);
    assert.match(String(plan({ mode: 'r2v', prompt: 'p', refPaths: [path.join(D, img('wide.png', '1600x400'))] })), /Image 1 is 1600×400.*2:5 to 5:2/);
    assert.match(String(plan({ mode: 't2v', prompt: '' })), /needs a prompt/); assert.equal(plan({ mode: 'i2v', prompt: '', imagePath: path.join(D, 's.png') }), null, 'image to video: prompt optional');
    ok('route: Comfy Cloud only; 3–30 s, resolution, 10-image cap, no start frame, picture size / shape refuse in plain words'); }

  // ---- 3. menu ----
  { const m = toolModels('h3-video').find((x: any) => x.key === 'kling-4')!; assert.ok(m, 'Kling 4.0 on Create Video'); assert.equal(m.def.name, 'Kling 4.0'); assert.equal(m.def.maker, 'kling'); assert.deepEqual(m.parts.map((p: any) => p.engine), [K.K4_PROVIDER]);
    assert.deepEqual((video as any).app.providerModes[K.K4_PROVIDER], ['t2v', 'i2v', 'flf', 'r2v', 'keyframes']); const L = VIDEO_LIMITS[K.K4_PROVIDER];
    assert.equal(L.refKinds.image, 10); assert.equal(L.minSeconds, 3); assert.equal(L.maxSeconds, 30); assert.deepEqual(L.audio, { supported: true, toggle: false, default: true, priceAffects: false, off: 'provider' });
    assert.equal(aboutLink('kling-4'), 'https://kling.ai/release-note/release-notes');
    ok('menu: Kling 4.0 (Kuaishou Kling) on Create Video, five modes, 10 references, 3–30 s, sound always on, About = Kling'); }

  // ---- 4. prices ----
  assert.deepEqual(HOSTED_BY_ID[K.K4_PROVIDER].usdByQuality, { '720p': 0.22451, '1080p': 0.33605 });
  const P = [img('p1.png', '1280x720'), img('p2.png', '1280x720'), img('p3.png', '1280x720')];
  const parse = async (t: any, f: Record<string, string>, files: Record<string, string[]>) => { const r: any = await t.parseInput(f, files); assert.ok(!r.error, String(r.error)); return r; };
  { const Fastify = (await import('fastify')).default; const app = Fastify(); (await import('../src/routesBatch1.ts')).registerBatch1(app); (await import('../src/routing/http.ts')).registerRouting(app); await app.ready();
    const seen: Record<string, string> = {};
    for (const [mode, s, res] of [['t2v', '3', '720p'], ['t2v', '30', '1080p'], ['t2v', '30', '720p'], ['i2v', '5', '1080p'], ['flf', '10', '720p'], ['r2v', '8', '1080p']] as const) {
      const qs = new URLSearchParams({ provider: K.K4_PROVIDER, types: JSON.stringify([mode]), duration: s, resolution: res, ...(mode === 't2v' ? {} : { image: '1' }) });
      const r = await app.inject({ url: `/api/tools/h3-video/price?${qs}` }); assert.equal(r.statusCode, 200, r.body.slice(0, 300)); const b = r.json(); assert.equal(b.route, K.K4_ROUTE, `${mode} ${res}: ${JSON.stringify(b).slice(0, 300)}`);
      const files = mode === 't2v' ? {} : mode === 'i2v' ? { image: [P[0]] } : mode === 'flf' ? { image: [P[0]], lastFrame: [P[1]] } : { refs: P };
      const job = await parse(video, { provider: K.K4_PROVIDER, prompt: 'a fox trots across snow', types: JSON.stringify([mode]), duration: s, resolution: res }, files);
      const charge = routeCredits(video, findRoute(K.K4_ROUTE)!, routeInput(video, job))!; const quoted = b.listCredits ?? b.credits;
      assert.equal(quoted, charge, `${mode} ${s} ${res}: quote ${quoted} = charge ${charge}`); assert.equal(charge, Math.ceil(Math.round(Number(s) * K.K4_RATES[res] * 100 * 1e6) / 1e6));
      seen[`${mode} ${s}s ${res}`] = `$${(quoted / 100).toFixed(2)}`; }
    await app.close(); ok(`quote endpoint = charge: ${JSON.stringify(seen)}`); }

  // ---- 6. keyframes ----
  { for (const k of [2, 3, 10]) { const g = K.k4Graph({ mode: 'keyframes', prompt: '', resolution: '720p', duration: 6 }, Array(k).fill(ASSET)); clean(`keyframes ${k}`, g);
      const n = g['1'].inputs; assert.equal(g['1'].class_type, K.K4_I2V_NODE); assert.deepEqual(n['model.first_frame'], ['10', 0]); assert.deepEqual(n['model.last_frame'], [String(9 + k), 0]);
      assert.deepEqual(Object.keys(n).filter((x) => x.startsWith('model.middle_frames.')), Array.from({ length: k - 2 }, (_, j) => `model.middle_frames.middle_frame_${j + 1}`)); }
    { const { videoCapsBlock } = await import('../src/tools/h3/videoCaps.ts');
      assert.deepEqual(videoCapsBlock(VIDEO_LIMITS[K.K4_PROVIDER]).keyframes, { min: 2, max: 10, times: false }, 'the bar reads the model\'s frame limits');
      assert.deepEqual(VIDEO_LIMITS['comfy-h3'].keyframes, { min: 2, max: 5, times: true }, 'H3 keeps its own rules'); }
    const frames = (n: number) => ({ keyframes: Array.from({ length: n }, (_, k) => img(`kf${k}.png`, '1024x576')) });
    const kfJob = (n: number, extra: Record<string, string> = {}, prov = K.K4_PROVIDER) => video.parseInput({ provider: prov, prompt: '@image1 turns around', types: '["keyframes"]', duration: '6', resolution: prov === K.K4_PROVIDER ? '720p' : '768p', ...extra }, frames(n)) as Promise<any>;
    for (const n of [3, 10]) { const j = await kfJob(n); assert.ok(!j.error, String(j.error)); assert.equal(j.keyframePaths.length, n); assert.equal(j.keyframeTimes, undefined, 'no times for Kling');
      const plan = K.k4CloudPlan({ id: 'kf', toolId: 'h3-video', provider: K.K4_PROVIDER, input: j }); const g = plan.passes[0].graph; assert.equal(g['1'].class_type, K.K4_I2V_NODE);
      assert.equal(Object.keys(g['1'].inputs).filter((x) => x.startsWith('model.middle_frames.')).length, n - 2); assert.match(plan.notes[0], new RegExp(`${n} keyframes spaced evenly`)); }
    assert.match(String((await kfJob(11)).error), /up to 10 frames for this model; you added 11/);
    assert.match(String((await kfJob(1)).error), /needs 2 to 10 frames/);
    assert.match(String((await kfJob(3, { keyframeTimes: '[0,2,6]' })).error), /spaces the frames evenly.*no times/);
    assert.match(String((await kfJob(6, {}, 'comfy-h3')).error), /up to 5 frames for this model; you added 6/, 'H3: 2–5 frames');
    { const j = await kfJob(3, { keyframeTimes: '[0,2,6]' }, 'comfy-h3'); assert.ok(!j.error, String(j.error)); assert.deepEqual(j.keyframeTimes, [0, 2, 6], 'H3: times kept'); }
    const Fastify = (await import('fastify')).default; const app = Fastify(); (await import('../src/routesBatch1.ts')).registerBatch1(app); (await import('../src/routing/http.ts')).registerRouting(app); await app.ready();
    const quote = async (prov: string, n: number, res: string) => (await app.inject({ url: `/api/tools/h3-video/price?${new URLSearchParams({ provider: prov, types: '["keyframes"]', duration: '6', resolution: res, keyframes: String(n) })}` })).json();
    for (const n of [3, 10]) { const b = await quote(K.K4_PROVIDER, n, '720p'); assert.equal(b.route, K.K4_ROUTE); assert.ok(!b.blockedReason, b.blockedReason); assert.equal(b.listCredits ?? b.credits, Math.ceil(6 * 22.451)); }
    { const b = await quote(K.K4_PROVIDER, 11, '720p'); assert.equal(b.runnable, false); assert.match(String(b.blockedReason ?? b.reason), /up to 10 keyframes; you added 11/); }
    { const h3kf = routesFor('comfy-h3', video).find((r) => r.routeId === 'comfy-cloud:cloud-h3-keyframes')!; const at = (n: number) => h3kf.unavailableFor!({ mode: 'keyframes', duration: 6, resolution: '768p', keyframePaths: Array(n).fill('quote:k') });
      assert.equal(at(5), null); assert.match(String(at(6)), /2 to 5 frames; you added 6/, 'H3 Keyframes: the bar\'s count refused on its route too'); }
    await app.close(); ok('keyframes: 2 / 3 / 10 frames → first, evenly spaced middle frames, last (graphs pass the node schema); 11 frames and times refused on the quote and the submit; H3 keeps 2–5 at times'); }

  // ---- 5. fake Comfy Cloud run ----
  process.env.COMFY_API_KEY = 'comfyui-fake-kling4-key-0000'; process.env.COMFY_CLOUD_URL = 'http://cloud.test';
  const json = (o: any, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
  { const out = path.join(D, 'out.mp4'); ff(['-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=24', '-t', '1', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', out]);
    const calls: { url: string; method: string; body?: any }[] = [];
    setCloudFetch((async (u: any, init: any = {}) => { const url = String(u); calls.push({ url, method: init.method ?? 'GET', body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined });
      if (url.endsWith('/api/v2/assets')) return json({ id: `a${calls.length}`, hash: 'blake3:00', file_path: 'x.png' }, 201);
      if (url.endsWith('/api/v2/jobs')) return json({ id: 'k4-cj', status: 'queued' }, 201);
      if (url.endsWith('/api/v2/jobs/k4-cj')) return json({ status: 'succeeded', outputs: [{ node_id: '2', id: 'o1', name: 'k.mp4', filename: 'k.mp4', content_type: 'video/mp4', url: '/api/v2/assets/o1/content' }] });
      return new Response(fs.readFileSync(out), { status: 200 }); }) as typeof fetch, 1);
    const input = await parse(video, { provider: K.K4_PROVIDER, prompt: 'The woman from @image1 walks through the hall from @image2', types: '["r2v"]', duration: '12', resolution: '1080p', aspect: '9:16' }, { refs: P });
    const job: any = { id: 'k4', toolId: 'h3-video', provider: K.K4_PROVIDER, route: K.K4_ROUTE, input, status: 'queued', outputs: [] };
    await runCloudWorkflow(job, findRoute(K.K4_ROUTE)!, { n: 1 } as any); assert.equal(job.status, 'done', job.error);
    const sub = calls.find((c) => c.url.endsWith('/api/v2/jobs') && c.method === 'POST')!.body; assert.deepEqual(sub.extra_data, { api_key_comfy_org: 'comfyui-fake-kling4-key-0000' });
    clean('sent', sub.workflow); const n = sub.workflow['1'].inputs; assert.equal(sub.workflow['1'].class_type, K.K4_R2V_NODE);
    assert.equal(n['model.resolution'], '1080p'); assert.equal(n['model.duration'], 12); assert.equal(n['model.aspect_ratio'], '9:16'); assert.match(n['model.prompt'], /@Image1.*@Image2/, 'chips in the node\'s own @Image1 form');
    assert.equal(calls.filter((c) => c.url.endsWith('/api/v2/assets')).length, 3, 'three references uploaded'); assert.ok(!JSON.stringify(job).includes('comfyui-fake-kling4-key-0000'));
    ok('fake Cloud run: 3 references uploaded, key once in extra_data, checked graph sent'); }
} finally { setCloudFetch(null); fs.rmSync(D, { recursive: true, force: true }); }
console.log('kling4: all ok');
