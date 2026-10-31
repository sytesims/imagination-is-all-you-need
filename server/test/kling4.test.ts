// Kling 4.0 on Comfy Cloud (2026-10-31, comfy/kling4Cloud.ts + tools/comfyFeatured.ts). FAKE fetches only (no network, no real key, no spend).
//  1 graphs: text, start frame, start + end, 1–10 references pass an object_info built from the node schemas in ComfyUI PR #17364
//    (test/fixtures/object-info-kling4-from-pr-17364.json; Comfy Cloud's own copy needs a key); bad values are caught
//  2 route + plain refusals: 3–30 s, 720p / 1080p, ≤ 10 images, no start frame, picture size and shape
//  3 menu: Kling 4.0 on Create Video with its real name and maker, four modes, sound always on (no switch)
//  4 prices: the price badge per second × resolution; the REAL quote endpoint = the charge (3 s and 30 s, 720p and 1080p)
//  5 run on a fake Comfy Cloud (3 references): files uploaded, key once in extra_data, the checked graph submitted
//  7 reference videos (2026-10-31): up to 5 clips in reference to video; the price is a range, quoted at its top '≈ up to' (quote = charge); refFit sees them
//  8 Prompt Edit's Kling 4.0 (2026-10-31): Kling4EditVideoNode as a model choice beside Bernini-R (unchanged); 3–30 s, 720p / 1080p, Fit to model
//    trims / enlarges; the badge price per second of the clip; quote = charge
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
    assert.match(String(cloud.unavailableFor!({ mode: 'r2v', refAudioPaths: ['a.mp3'] })), /no reference sound/);
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

  // ---- 7. reference videos ----
  { const g = K.k4Graph({ mode: 'r2v', prompt: '@image1 dances like @video1', resolution: '1080p', duration: 10 }, [ASSET, ASSET], [ASSET, ASSET]); clean('r2v 2 images + 2 videos', g);
    assert.deepEqual(g['1'].inputs['model.reference_videos.video_2'], ['31', 0]); assert.equal(g['30'].class_type, 'LoadVideo'); assert.deepEqual(g['1'].inputs['model.reference_images.image_2'], ['11', 0]);
    clean('r2v videos only', K.k4Graph({ mode: 'r2v', prompt: 'like @video1', duration: 5 }, [], [ASSET]));
    const cloud = routesFor(K.K4_PROVIDER, video)[0]; const u = (x: any) => cloud.unavailableFor!({ mode: 'r2v', refPaths: ['a.png'], ...x });
    assert.equal(u({ refVideoPaths: ['a.mp4', 'b.mp4'], refVideoSecondsEach: [10, 20] }), null);
    assert.match(String(u({ refVideoPaths: Array(6).fill('a.mp4') })), /up to 5 reference videos; you added 6/);
    assert.match(String(u({ refVideoPaths: ['a.mp4'], refVideoSecondsEach: [31] })), /at most 30 s; one of yours is 31 s/);
    assert.match(String(u({ refVideoPaths: ['a.mp4', 'b.mp4'], refVideoSecondsEach: [20, 15] })), /add up to 30 s; yours are 35 s/);
    assert.match(String(u({ refVideoPaths: ['a.mp4'], refVideoSecondsEach: [2] })), /at least 3 s/);
    assert.match(String(cloud.unavailableFor!({ mode: 'i2v', refVideoPaths: ['a.mp4'] })), /reference to video only/);
    const { videoCapsBlock } = await import('../src/tools/h3/videoCaps.ts'); const { refFitOf } = await import('../src/shared/refFit.ts'); const vc = videoCapsBlock(VIDEO_LIMITS[K.K4_PROVIDER]);
    const caps = { modes: (video as any).app.providerModes[K.K4_PROVIDER], refKinds: vc.refKinds, refMax: vc.refMax };
    { const f = refFitOf(caps, { start: false, image: 2, video: 2, audio: 0 }, 't2v'); assert.equal(f.mode, 'r2v'); assert.ok(f.all, 'works with your files'); assert.equal(f.caps.refVideos, 5); }
    { const f = refFitOf(caps, { start: true, image: 1, video: 6, audio: 1 }, 'r2v'); assert.ok(!f.all); assert.deepEqual(f.parts.map((p) => [p.kind, p.used, p.have]), [['image', 2, 2], ['video', 5, 6], ['audio', 0, 1]], '+N: one clip and the sound not used'); }
    // a real job: the clip is read (ffprobe), its frame checked, and the charge = the quote's top of the range
    const clip = (name: string, size: string, secs: number, fps = 24) => { ff(['-f', 'lavfi', '-i', `testsrc=size=${size}:rate=${fps}`, '-t', String(secs), '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', path.join(D, name)]); return name; };
    const job = async (vids: string[], res = '720p', s = '5') => video.parseInput({ provider: K.K4_PROVIDER, prompt: '@image1 moves like @video1', types: '["r2v"]', duration: s, resolution: res }, { refs: [img('rv.png', '1024x576')], refVideos: vids }) as Promise<any>;
    assert.match(String((await job([clip('small.mp4', '640x360', 4)])).error), /Reference video 1 is 640×360; this model needs at least 700 px a side/);
    assert.match(String((await job([clip('slow.mp4', '1280x720', 4, 12)])).error), /runs at 12 fps; this model needs at least 24 fps/);
    assert.match(String((await job([clip('long.mp4', '1280x720', 31)])).error), /at most 30 s/);
    const Fastify = (await import('fastify')).default; const app = Fastify(); (await import('../src/routesBatch1.ts')).registerBatch1(app); (await import('../src/routing/http.ts')).registerRouting(app); await app.ready();
    const seen: string[] = [];
    for (const [res, s, rate] of [['720p', '5', 0.13442], ['1080p', '10', 0.20163]] as const) {
      const qs = new URLSearchParams({ provider: K.K4_PROVIDER, types: '["r2v"]', duration: s, resolution: res, refs: '1', refVideos: '1', refVideoSeconds: '4', refVideoSecondsEach: '4' });
      const b = (await app.inject({ url: `/api/tools/h3-video/price?${qs}` })).json(); assert.equal(b.route, K.K4_ROUTE, JSON.stringify(b).slice(0, 300)); assert.ok(!b.blockedReason, b.blockedReason);
      const top = Math.ceil(Math.round(rate * (30 + Number(s)) * 100 * 1e6) / 1e6); const quoted = b.listCredits ?? b.credits; assert.equal(quoted, top, `${res} ${s} s: the top of the range`);
      assert.equal(b.upTo, true, '≈ up to'); assert.equal(b.perSecond, null, 'not rate × seconds');
      const lo = `$${(rate * 2 * Number(s)).toFixed(2)}`, hi = `$${(top / 100).toFixed(2)}`; assert.ok(b.upToNote.includes(`${lo}–${hi}`), b.upToNote);
      const j = await job([clip(`ok${s}.mp4`, '1280x720', 4)], res, s); assert.ok(!j.error, String(j.error)); const charge = routeCredits(video, findRoute(K.K4_ROUTE)!, routeInput(video, j))!;
      assert.equal(charge, quoted, 'charge = quote'); seen.push(`${res} ${s} s: ${lo}–${hi}, quoted ≈ up to $${(quoted / 100).toFixed(2)}`);
      const plan = K.k4CloudPlan({ id: 'rv', toolId: 'h3-video', provider: K.K4_PROVIDER, input: j }); const pg = plan.passes[0].graph; assert.equal(pg['30'].class_type, 'LoadVideo'); assert.match(plan.notes[0], /1 reference image \+ 1 reference video/); }
    { const qs = new URLSearchParams({ provider: K.K4_PROVIDER, types: '["r2v"]', duration: '5', resolution: '720p', refs: '1' }); const b = (await app.inject({ url: `/api/tools/h3-video/price?${qs}` })).json();
      assert.ok(!b.upTo, 'no clips: one figure'); assert.equal(b.listCredits ?? b.credits, Math.ceil(5 * 22.451)); }
    { const qs = new URLSearchParams({ provider: K.K4_PROVIDER, types: '["r2v"]', duration: '30', resolution: '720p', refs: '1', refVideos: '1', refVideoSeconds: '4' }); const b = (await app.inject({ url: `/api/tools/h3-video/price?${qs}` })).json();
      assert.ok(!b.upTo, '30 s: the ends meet (2 × 30 = 30 + 30), one figure'); assert.equal(b.listCredits ?? b.credits, Math.ceil(Math.round(0.13442 * 60 * 100 * 1e6) / 1e6)); }
    { const qs = new URLSearchParams({ provider: K.K4_PROVIDER, types: '["r2v"]', duration: '5', resolution: '720p', refs: '1', refVideos: '1', refVideoSeconds: '31', refVideoSecondsEach: '31' }); const b = (await app.inject({ url: `/api/tools/h3-video/price?${qs}` })).json();
      assert.equal(b.runnable, false); assert.match(String(b.blockedReason ?? b.reason), /at most 30 s/); }
    await app.close(); ok(`reference videos: graph + node schema, 5-clip / 3–30 s / 30 s total / frame / fps refusals, refFit uses them; ${seen.join('; ')}`); }

  // ---- 8. Prompt Edit: Kling 4.0 ----
  { const PE = await import('../src/tools/promptEdit.ts'); const tool = getTool('prompt-edit')!; const { videoFitFor } = await import('../src/shared/videoFit.ts'); const { VIDEO_BARS } = await import('../src/shared/videoBar.ts');
    for (const res of K.K4_RESOLUTIONS) clean(`edit ${res}`, K.k4EditGraph({ prompt: 'make it night', resolution: res, seed: 7 }, ASSET));
    { const g = K.k4EditGraph({ prompt: 'x' }, ASSET); assert.equal(g['1'].class_type, K.K4_EDIT_NODE); assert.equal(g['1'].inputs['model.aspect_ratio'], 'adaptive'); assert.equal(g['10'].class_type, 'LoadVideo');
      bad(g, (x) => { x['1'].inputs['model.resolution'] = '480p'; }, /not in the list/); }
    assert.deepEqual(tool.providers.map((p) => p.id ?? p), ['cloud-bernini-r', K.K4_EDIT_PROVIDER], 'Bernini-R stays first (the default)'); assert.deepEqual(Object.keys(PE.EDIT_MODELS), ['cloud-bernini-r', K.K4_EDIT_PROVIDER]);
    const rs = routesFor(K.K4_EDIT_PROVIDER, tool); assert.deepEqual(rs.map((r) => r.routeId), [K.K4_EDIT_ROUTE]); const r = rs[0];
    assert.ok(CLOUD_RUNNER_ROUTES.has(K.K4_EDIT_ROUTE) && (CLOUD_WORKFLOWS[K.K4_EDIT_ROUTE] as any).partnerAuth);
    assert.match(String(r.unavailableFor!({ resolution: '480p', duration: 5 })), /720p or 1080p/); assert.match(String(r.unavailableFor!({ resolution: '720p', duration: 2 })), /at least 3 s/);
    assert.equal(r.unavailableFor!({ resolution: '1080p', duration: 30 }), null);
    { const m = toolModels('prompt-edit').find((x: any) => x.key === 'kling-4')!; assert.ok(m, 'Kling 4.0 on Prompt Edit'); assert.deepEqual(m.parts.map((p: any) => p.engine), [K.K4_EDIT_PROVIDER]);
      assert.ok(toolModels('prompt-edit').some((x: any) => x.key === 'bernini-r'), 'Bernini-R still there'); }
    { const c = VIDEO_BARS['prompt-edit'].controls.find((x) => x.field === 'resolution')!; assert.deepEqual(c.providers, [K.K4_EDIT_PROVIDER], 'the size chip for Kling only'); assert.deepEqual((tool as any).app.resolutionsByProvider, { 'cloud-bernini-r': ['480p'], [K.K4_EDIT_PROVIDER]: ['720p', '1080p'] }); }
    // Fit to model: Kling's own video rules (the node's checks), fixed for free before the upload
    { const f = (x: any) => videoFitFor('prompt-edit', K.K4_EDIT_PROVIDER, { width: 1280, height: 720, duration: 8, fps: 24, ...x })!;
      assert.equal(f({}).changed, false); assert.equal(f({ width: 640, height: 360 }).frame.height, 700, 'a 360p clip is enlarged to 700 px'); assert.equal(f({ duration: 45 }).trimTo, 30);
      assert.equal(f({ fps: 12 }).fps, 24); assert.match(String(f({ fps: 12 }).problems), /at least 24 fps/); assert.match(String(f({ duration: 2 }).blocked), /at least 3 s/);
      assert.equal(videoFitFor('prompt-edit', 'cloud-bernini-r', { width: 640, height: 360, duration: 8 }), null, 'Bernini-R: no Fit row, as before'); }
    const vclip = (name: string, size: string, secs: number) => { ff(['-f', 'lavfi', '-i', `testsrc=size=${size}:rate=24`, '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', String(secs), '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(D, name)]); return name; };
    const e = (f: Record<string, string>, v: string) => tool.parseInput({ prompt: 'make it night', ...f }, { video: [v] }) as Promise<any>;
    vclip('e8.mp4', '1280x720', 8); vclip('e2.mp4', '1280x720', 2); vclip('e32.mp4', '1280x720', 32);
    { const j = await e({}, 'e8.mp4'); assert.ok(!j.error); assert.equal(j.resolution, '480p'); assert.equal(j.duration, 5); assert.equal(j.keepAudio, true); assert.match(j.warnings[0], /first 5 s/); } // Bernini-R as before
    { const j = await e({ provider: K.K4_EDIT_PROVIDER }, 'e8.mp4'); assert.ok(!j.error, j.error); assert.equal(j.resolution, '720p'); assert.ok(Math.abs(j.duration - 8) < 0.1); assert.equal(j.keepAudio, undefined); assert.equal(j.clipSound, true);
      const plan = K.k4EditPlan({ id: 'e', toolId: 'prompt-edit', provider: K.K4_EDIT_PROVIDER, input: j }); assert.equal(plan.muxSourceAudio, true); assert.equal(plan.passes[0].graph['1'].inputs['model.prompt'], 'make it night');
      const off = await e({ provider: K.K4_EDIT_PROVIDER, keepAudio: '0', resolution: '1080p' }, 'e8.mp4'); assert.equal(off.clipSound, false); assert.equal(off.resolution, '1080p');
      assert.equal(K.k4EditPlan({ id: 'e', toolId: 'prompt-edit', provider: K.K4_EDIT_PROVIDER, input: off }).muxSourceAudio, false, 'sound off: Kling\'s own sound'); }
    assert.match(String((await e({ provider: K.K4_EDIT_PROVIDER, resolution: '480p' }, 'e8.mp4')).error), /Kling 4.0 edits at 720p or 1080p/);
    assert.match(String((await e({ provider: K.K4_EDIT_PROVIDER }, 'e2.mp4')).error), /too short \(2\.0 s\)\. Kling 4\.0 needs one of at least 3 s/);
    { const j = await e({ provider: K.K4_EDIT_PROVIDER }, 'e32.mp4'); assert.ok(!j.error); assert.ok(j.duration > 31, 'the clip as it is: Fit to model trims it'); assert.equal(videoFitFor('prompt-edit', K.K4_EDIT_PROVIDER, j)!.trimTo, 30); }
    // prices: the badge per second of the clip; the quote = the charge (a 32 s clip is billed as its first 30 s)
    const Fastify = (await import('fastify')).default; const app = Fastify(); (await import('../src/routesBatch1.ts')).registerBatch1(app); (await import('../src/routing/http.ts')).registerRouting(app); await app.ready();
    assert.deepEqual(HOSTED_BY_ID[K.K4_EDIT_PROVIDER].usdByQuality, { '720p': 0.26884, '1080p': 0.40326 });
    const seen: string[] = [];
    for (const [v, res, secs] of [['e8.mp4', '720p', 8], ['e8.mp4', '1080p', 8], ['e32.mp4', '720p', 30]] as const) {
      const j = await e({ provider: K.K4_EDIT_PROVIDER, resolution: res }, v); const fit = videoFitFor('prompt-edit', K.K4_EDIT_PROVIDER, j); if (fit?.trimTo) j.duration = fit.trimTo; // as the submit does
      const charge = routeCredits(tool, findRoute(K.K4_EDIT_ROUTE)!, routeInput(tool, j))!;
      const qs = new URLSearchParams({ provider: K.K4_EDIT_PROVIDER, types: '["edit"]', resolution: res, seconds: String(j.sourceSeconds), width: '1280', height: '720', fps: '24', videoFormat: 'mp4' });
      const b = (await app.inject({ url: `/api/tools/prompt-edit/price?${qs}` })).json(); assert.equal(b.route, K.K4_EDIT_ROUTE); assert.ok(!b.blockedReason, b.blockedReason);
      const quoted = b.listCredits ?? b.credits; assert.equal(quoted, charge, `${v} ${res}: quote ${quoted} = charge ${charge}`); assert.ok(Math.abs(j.duration - secs) < 0.1); assert.equal(charge, Math.ceil(Math.round(j.duration * K.K4_EDIT_RATES[res] * 100 * 1e6) / 1e6), 'the badge rate × the clip seconds');
      seen.push(`${secs} s ${res} $${(quoted / 100).toFixed(2)}`); }
    { const b = (await app.inject({ url: `/api/tools/prompt-edit/price?${new URLSearchParams({ provider: 'cloud-bernini-r', types: '["edit"]', resolution: '480p', seconds: '8', width: '1280', height: '720' })}` })).json(); assert.equal(b.route, 'comfy-cloud:cloud-bernini-r', 'Bernini-R quote as before'); }
    await app.close(); ok(`Prompt Edit: Kling 4.0 beside Bernini-R (unchanged), 3–30 s, 720p / 1080p, Fit to model, Keep sound = the clip's or Kling's; quote = charge: ${seen.join(', ')}`); }

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
