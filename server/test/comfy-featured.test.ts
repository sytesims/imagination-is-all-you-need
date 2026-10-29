// Official Comfy templates from comfy.org/workflows "Most popular" (2026-10-27, tools/comfyFeatured.ts). FAKE fetches only (no network, no real key, no spend).
//  1 graphs: Gemini Omni 1.1 Flash (t2v / i2v / flf × 720p / 1080p / 4K × 16:9 / 9:16), Topaz Bloom 2 (×2 / ×4, wide / tall) and Wan Animate 2
//    (1, 2, 3 windows) pass Comfy Cloud's object_info (0 errors, 0 warnings); the checker catches a bad value on each; Wan Animate 2's reference
//    file equals the builder's one-window graph
//  2 routes: each model's place is Comfy Cloud (runnable by the Cloud runner, partner nodes send the key in extra_data); Wan Animate 2 is open
//    weights (tier 0) and held until its price is measured; what a route can't take is refused with a plain reason
//  3 menus: the models are on their tabs (Create Video, Motion Control, Upscale) with their real names; Topaz Bloom 2 is one card, two places
//  4 prices: rows from the partner-node page; the REAL quote endpoint = the charge
//  5 run on a fake Comfy Cloud (Gemini Omni i2v, Topaz Bloom 2 ×2): files uploaded, key once in extra_data, the checked graph submitted, the result saved
// Run: npx tsx test/comfy-featured.test.ts
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
process.env.OPENHIGGSFIELD_ALLOW_UNMEASURED_CLOUD = '0'; // these checks cover the held state (cloud runs before a measured price are allowed by default since 2026-10-27)
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'cfeat-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0' });
for (const k of ['COMFY_API_KEY', 'COMFY_CLOUD_URL', 'OPENHIGGSFIELD_COMFY_CLOUD_URL', 'COMFY_DEPLOY_URL', 'COMFY_RUNNER_URL', 'COMFY_BASE_URL', 'OPENHIGGSFIELD_FAL_KEY', 'FAL_KEY']) delete process.env[k];
globalThis.fetch = (async (u: unknown) => { throw new Error(`network blocked in this test: ${String(u).slice(0, 80)}`); }) as typeof fetch;
const ok = (m: string) => console.log('ok ' + m);
const HERE = path.dirname(new URL(import.meta.url).pathname); const ROOT = path.resolve(HERE, '../..');
const fx = (f: string) => JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', f), 'utf8'));
const OI = { ...fx('object-info-comfy-cloud-2026-10-26.json'), ...fx('object-info-comfy-cloud-featured-2026-10-26.json') };
const O = await import('../src/comfy/geminiOmniCloud.ts'); const B = await import('../src/comfy/topazImageCloud.ts'); const W = await import('../src/comfy/wanAnimate2Cloud.ts');
const { checkCloudGraph } = await import('../src/comfy/cloudGraphCheck.ts');
const { CLOUD_WORKFLOWS, isStandalone } = await import('../src/comfy/cloudWorkflows.ts');
const { routesFor, findRoute, tierOf } = await import('../src/routing/routes.ts');
const { HOSTED_BY_ID } = await import('../src/shared/hostedPrices.ts');
const { runCloudWorkflow, setCloudFetch } = await import('../src/routing/cloudRun.ts');
const { CLOUD_RUNNER_ROUTES } = await import('../src/routing/runnable.ts');
const { routeCredits, routeInput } = await import('../src/routing/select.ts');
const { getTool } = await import('../src/tools/registry.ts');
const { getProvider, providerOpenWeights } = await import('../src/providers.ts');
const { toolModels } = await import('../src/routing/modelRegistry.ts');
const { UPSCALE_ORDER, UPSCALE_MODELS } = await import('../src/shared/imageUpscale.ts');
const ff = (args: string[]) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args]);
const img = (name: string, size: string) => { ff(['-f', 'lavfi', '-i', `testsrc=size=${size}`, '-frames:v', '1', path.join(D, name)]); return name; };
const clean = (name: string, g: Record<string, any>) => { const r = checkCloudGraph(g, OI); assert.deepEqual(r.errors, [], `${name}: ${r.errors.join(' | ')}`); assert.deepEqual(r.warnings, [], `${name}: ${r.warnings.join(' | ')}`); };
const bad = (g: Record<string, any>, mut: (g: any) => void, re: RegExp) => { const x = structuredClone(g); mut(x); const r = checkCloudGraph(x, OI); assert.ok(r.errors.some((e) => re.test(e)), `${re}: ${r.errors}`); };
const ASSET = { __type: 'core/ASSET', info: { id: 'asset_1', hash: 'blake3:00', file_path: 'x.png' } };

try {
  // ---- 1. graphs ----
  { let n = 0;
    for (const mode of ['t2v', 'i2v', 'flf']) for (const resolution of O.OMNI_RESOLUTIONS) for (const aspect of ['16:9', '9:16']) {
      const g = O.omniGraph({ mode, resolution, aspect, duration: 6, prompt: 'a red car drifts', seed: 7 }, { start: ASSET, last: ASSET }); clean(`omni ${mode} ${resolution} ${aspect}`, g); n++;
      assert.equal(g['7'].inputs['model.task_type'], mode === 't2v' ? 'text_to_video' : 'image_to_video'); assert.equal(!!g['11'], mode !== 't2v'); assert.equal(!!g['12'], mode === 'flf');
      assert.match(g['7'].inputs['model.prompt'], /^a red car drifts\. A 6-second clip\.$/); }
    const g = O.omniGraph({ mode: 'i2v', resolution: '720p', prompt: 'x' }, { start: ASSET });
    bad(g, (x) => { x['7'].inputs['model.resolution'] = '8k'; }, /not in the list/); bad(g, (x) => { x['7'].inputs['model.aspect_ratio'] = '1:1'; }, /not in the list/); bad(g, (x) => { delete x['7'].inputs['model.seed']; }, /"model\.seed" is missing/);
    for (const scale of [2, 4]) for (const sourceSize of [{ width: 1200, height: 800 }, { width: 800, height: 1200 }, null]) {
      const bg = B.bloomGraph({ scale, sourceSize, prompt: '' }, ASSET); clean(`bloom x${scale} ${JSON.stringify(sourceSize)}`, bg); n++;
      if (sourceSize) assert.equal(Math.max(bg['2'].inputs.output_width, bg['2'].inputs.output_height), Math.max(sourceSize.width, sourceSize.height) * scale); }
    bad(B.bloomGraph({ scale: 2 }, ASSET), (x) => { x['2'].inputs['model.creativity'] = 12; }, /outside/);
    for (const [secs, windows] of [[3.3, 1], [4, 2], [6.6, 2], [10, 3]] as const) {
      const wg = W.wa2Graph({ duration: secs, width: 1280, height: 720, prompt: 'a knight in silver armour' }, { image: ASSET, video: { ...ASSET, info: { ...ASSET.info, file_path: 'd.mp4' } } });
      clean(`wan animate 2 ${secs}s`, wg); n++; assert.equal(Object.values<any>(wg).filter((v) => v.class_type === 'WanAnimate2ToVideo').length, windows, `${secs} s → ${windows} windows`);
      assert.equal(wg['91'].inputs.length, Math.round(secs * 24) + 1, 'cut to the clip'); }
    bad(W.wa2Graph({ duration: 3 }, { image: ASSET, video: ASSET }), (x) => { x['10'].inputs.unet_name = 'wan_animate_3.safetensors'; }, /not in the list/);
    assert.deepEqual(W.wa2Size(1080, 1920), [480, 832]); assert.deepEqual(W.wa2Size(1000, 1000), [624, 624]);
    const file = JSON.parse(fs.readFileSync(path.join(ROOT, 'workflows', W.WA2_GRAPH_FILE), 'utf8'));
    assert.deepEqual(file, W.wa2Graph({ prompt: '', seed: 42, width: 1280, height: 720, duration: 80 / 24 }, { image: 'reference.png', video: 'driving.mp4' }), 'reference file = the builder');
    clean('workflows/cloud-featured/wan-animate2-api.json', file);
    ok(`${n} graphs pass Comfy Cloud's object_info (0 errors, 0 warnings); bad values caught; the Wan Animate 2 reference file matches`); }

  // ---- 2. routes ----
  const video = getTool('h3-video')!; const motion = getTool('motion-transfer')!; const up = getTool('image-upscale')!;
  { const [o] = routesFor(O.OMNI_PROVIDER, video); assert.equal(o.routeId, O.OMNI_ROUTE); assert.equal(o.label, 'Comfy Cloud'); assert.equal(tierOf(o), 1, 'partner node: hosted tier');
    const [b] = routesFor(B.BLOOM_PROVIDER, up); assert.equal(b.routeId, B.BLOOM_ROUTE); assert.equal(b.label, 'Comfy Cloud');
    const [w] = routesFor(W.WA2_PROVIDER, motion); assert.equal(w.routeId, W.WA2_ROUTE); assert.equal(tierOf(w), 0, 'open weights on Comfy Cloud'); assert.ok(providerOpenWeights(getProvider(W.WA2_PROVIDER)));
    for (const r of [O.OMNI_ROUTE, B.BLOOM_ROUTE, W.WA2_ROUTE]) { assert.ok(CLOUD_RUNNER_ROUTES.has(r), `${r} runs on the Cloud runner`); assert.ok(isStandalone(CLOUD_WORKFLOWS[r])); }
    assert.equal((CLOUD_WORKFLOWS[O.OMNI_ROUTE] as any).partnerAuth, true); assert.equal((CLOUD_WORKFLOWS[B.BLOOM_ROUTE] as any).partnerAuth, true); assert.ok(!(CLOUD_WORKFLOWS[W.WA2_ROUTE] as any).partnerAuth, 'core nodes: no partner key');
    assert.equal(HOSTED_BY_ID[W.WA2_PROVIDER].priceUnmeasured, true, 'Wan Animate 2 is held until measured');
    assert.equal(o.unavailableFor!({ mode: 'i2v', duration: 12 }), 'Gemini Omni 1.1 Flash makes 3 to 10 s clips'); assert.match(String(o.unavailableFor!({ mode: 'i2v', aspect: '1:1' })), /16:9 or 9:16/);
    assert.match(String(o.unavailableFor!({ mode: 'r2v' })), /text to video, image to video/); assert.equal(o.unavailableFor!({ mode: 'flf', duration: 8, resolution: '4K', aspect: '9:16' }), null);
    assert.match(String(w.unavailableFor!({ duration: 12 })), /up to 10 s/); assert.equal(w.unavailableFor!({ duration: 8 }), null);
    ok('routes: Comfy Cloud places on the Cloud runner (partner nodes send the key; Wan Animate 2 is open weights, held until measured); plain refusals'); }

  // ---- 3. menus ----
  { const keys = (t: string) => toolModels(t).map((m: any) => m.key);
    assert.ok(video.providers.includes(O.OMNI_PROVIDER)); assert.ok(keys('h3-video').includes('gemini-omni-1.1-flash'));
    assert.deepEqual((video as any).app.providerModes[O.OMNI_PROVIDER], ['t2v', 'i2v', 'flf']);
    assert.ok(motion.providers.includes(W.WA2_PROVIDER)); assert.ok(keys('motion-transfer').includes('wan-animate-2'));
    assert.ok(up.providers.includes(B.BLOOM_PROVIDER)); assert.equal(UPSCALE_ORDER[1], B.BLOOM_PROVIDER, 'Comfy first'); assert.equal(UPSCALE_MODELS[B.BLOOM_PROVIDER].placeLabel, 'Comfy Cloud');
    const bloom = toolModels('image-upscale').find((m: any) => m.key === 'topaz-bloom-2')!; assert.deepEqual(bloom.parts.map((p: any) => p.engine).sort(), ['cloud-topaz-bloom2', 'fal-topaz-bloom'], 'one card, two places');
    ok('menus: Gemini Omni 1.1 Flash on Create Video, Wan Animate 2 on Motion Control, Topaz Bloom 2 one card with Comfy Cloud + fal'); }

  // ---- 4. prices: rows, and the quote endpoint = the charge ----
  const START = img('start.png', '1600x900'), LAST = img('last.png', '1600x900'), PIC = img('pic.png', '1200x800');
  const CLIP = path.join(D, 'drive.mp4'); ff(['-f', 'lavfi', '-i', 'testsrc=size=854x480:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '6', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', CLIP]);
  assert.equal(HOSTED_BY_ID[O.OMNI_PROVIDER].usdByQuality!['720p'], 0.14488); assert.equal(HOSTED_BY_ID[O.OMNI_PROVIDER].usdByQuality!['4K'], 0.43488);
  assert.equal(HOSTED_BY_ID[B.BLOOM_PROVIDER].usd, 0.45758); assert.equal(HOSTED_BY_ID[B.BLOOM_PROVIDER].mpBlock, 8);
  const parse = async (t: any, f: Record<string, string>, files: Record<string, string[]>) => { const r: any = await t.parseInput(f, files); assert.ok(!r.error, String(r.error)); return r; };
  { const Fastify = (await import('fastify')).default; const app = Fastify(); (await import('../src/routesBatch1.ts')).registerBatch1(app); (await import('../src/routing/http.ts')).registerRouting(app); await app.ready();
    const seen: Record<string, string> = {};
    for (const [mode, s, res] of [['t2v', '6', '720p'], ['i2v', '8', '1080p'], ['flf', '4', '4K'], ['i2v', '3', '720p']] as const) {
      const qs = new URLSearchParams({ provider: O.OMNI_PROVIDER, types: JSON.stringify([mode]), duration: s, resolution: res, ...(mode === 't2v' ? {} : { image: '1' }) });
      const r = await app.inject({ url: `/api/tools/h3-video/price?${qs}` }); assert.equal(r.statusCode, 200, r.body.slice(0, 300)); const b = r.json(); assert.equal(b.route, O.OMNI_ROUTE, JSON.stringify(b).slice(0, 300));
      const job = await parse(video, { provider: O.OMNI_PROVIDER, prompt: 'a red car drifts', types: JSON.stringify([mode]), duration: s, resolution: res }, mode === 't2v' ? {} : { image: [START], ...(mode === 'flf' ? { lastFrame: [LAST] } : {}) });
      const charge = routeCredits(video, findRoute(O.OMNI_ROUTE)!, routeInput(video, job))!; const quoted = b.listCredits ?? b.credits;
      assert.equal(quoted, charge, `${mode} ${s} ${res}: quote ${quoted} = charge ${charge}`); assert.equal(charge, Math.ceil(Number(s) * HOSTED_BY_ID[O.OMNI_PROVIDER].usdByQuality![res] * 100 - 1e-9));
      seen[`Gemini Omni ${mode} ${s}s ${res}`] = `$${(quoted / 100).toFixed(2)}`; }
    { const r = await app.inject({ url: `/api/tools/image-upscale/price?${new URLSearchParams({ provider: B.BLOOM_PROVIDER, scale: '2', width: '1200', height: '800' })}` }); assert.equal(r.statusCode, 200, r.body.slice(0, 300)); const b = r.json();
      const job = await parse(up, { provider: B.BLOOM_PROVIDER, scale: '2' }, { image: [PIC] }); const charge = routeCredits(up, findRoute(B.BLOOM_ROUTE)!, routeInput(up, job))!;
      assert.equal(charge, 46, '2400×1600 = 3.84 MP: one started 8 MP block, $0.46'); assert.equal(b.listCredits ?? b.credits, charge, `quote ${b.listCredits ?? b.credits} = charge ${charge}`); seen['Topaz Bloom 2 ×2 (1200×800)'] = `$${(charge / 100).toFixed(2)}`; }
    { const job = await parse(motion, { provider: W.WA2_PROVIDER, prompt: 'a knight in silver armour' }, { video: [path.basename(CLIP)], refs: [START] });
      const w = findRoute(W.WA2_ROUTE)!; const ri = routeInput(motion, job); const charge = routeCredits(motion, w, ri)!;
      assert.ok(charge > 0, 'an estimate is shown'); seen['Wan Animate 2 6 s (2 windows, estimate, held)'] = `$${(charge / 100).toFixed(2)}`; }
    await app.close(); ok(`quote endpoint = charge: ${JSON.stringify(seen)}`); }

  // ---- 5. run on a fake Comfy Cloud ----
  process.env.COMFY_API_KEY = 'comfyui-fake-featured-key-0000'; process.env.COMFY_CLOUD_URL = 'http://cloud.test';
  const json = (o: any, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
  const runOnce = async (tool: any, route: string, provider: string, input: any, id: string, outName: string, outFile: string, outNode = '8') => { const calls: { url: string; method: string; body?: any; form?: string[] }[] = [];
    setCloudFetch((async (u: any, init: any = {}) => { const url = String(u); calls.push({ url, method: init.method ?? 'GET', body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined, form: init.body instanceof FormData ? [...init.body.keys()] : undefined });
      if (url.endsWith('/api/v2/assets')) return json({ id: `a${calls.length}`, hash: 'blake3:00', file_path: 'x.png' }, 201);
      if (url.endsWith('/api/v2/jobs')) return json({ id: `${id}-cj`, status: 'queued' }, 201);
      if (url.endsWith(`/api/v2/jobs/${id}-cj`)) return json({ status: 'succeeded', outputs: [{ node_id: outNode, id: 'o1', name: outName, filename: outName, content_type: /mp4$/.test(outName) ? 'video/mp4' : 'image/png', url: '/api/v2/assets/o1/content' }] });
      return new Response(fs.readFileSync(outFile), { status: 200 }); }) as typeof fetch, 1);
    const job: any = { id, toolId: tool.id, provider, route, input: structuredClone(input), status: 'queued', outputs: [] }; let err: Error | null = null;
    try { await runCloudWorkflow(job, findRoute(route)!, { n: 1 } as any); } catch (e) { err = e as Error; } return { job, err, calls }; };
  { const out = path.join(D, 'omni-out.mp4'); ff(['-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=24', '-t', '1', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', out]);
    const job = await parse(video, { provider: O.OMNI_PROVIDER, prompt: 'the car pulls away', types: '["i2v"]', duration: '5', resolution: '720p' }, { image: [START] });
    const a = await runOnce(video, O.OMNI_ROUTE, O.OMNI_PROVIDER, job, 'omni1', 'omni.mp4', out); assert.equal(a.err, null, String(a.err?.message)); assert.equal(a.job.status, 'done', a.job.error);
    const sub = a.calls.find((c) => c.url.endsWith('/api/v2/jobs'))!.body; assert.deepEqual(sub.extra_data, { api_key_comfy_org: 'comfyui-fake-featured-key-0000' }, 'partner node: key once in extra_data');
    const g = sub.workflow; clean('omni sent', g); assert.equal(g['11'].inputs.image.__type, 'core/ASSET'); assert.equal(g['7'].inputs['model.aspect_ratio'], '16:9'); assert.match(g['7'].inputs['model.prompt'], /the car pulls away\. A 5-second clip\.$/);
    assert.ok(!JSON.stringify(a.job).includes('comfyui-fake-featured-key-0000'), 'the key is never kept on the job');
    const t = await runOnce(video, O.OMNI_ROUTE, O.OMNI_PROVIDER, { ...job, duration: 12 }, 'omni2', 'omni.mp4', out); assert.ok(t.err && /3 to 10 s/.test(t.err.message), String(t.err?.message)); assert.ok(!t.calls.some((c) => c.method === 'POST'), 'refused: nothing sent'); }
  { const out = path.join(D, 'bloom-out.png'); img('bloom-out.png', '2400x1600');
    const job = await parse(up, { provider: B.BLOOM_PROVIDER, scale: '2' }, { image: [PIC] });
    const a = await runOnce(up, B.BLOOM_ROUTE, B.BLOOM_PROVIDER, job, 'bloom1', 'bloom.png', out, '4'); assert.equal(a.err, null, String(a.err?.message)); assert.equal(a.job.status, 'done', a.job.error);
    const sub = a.calls.find((c) => c.url.endsWith('/api/v2/jobs'))!.body; assert.ok(sub.extra_data?.api_key_comfy_org); clean('bloom sent', sub.workflow); assert.equal(sub.workflow['2'].inputs.output_width, 2400); }
  { const job = await parse(motion, { provider: W.WA2_PROVIDER, prompt: 'a knight' }, { video: [path.basename(CLIP)], refs: [START] });
    const a = await runOnce(motion, W.WA2_ROUTE, W.WA2_PROVIDER, job, 'wa2', 'wa2.mp4', CLIP, '93'); assert.ok(a.err && /not measured|measured|exact price/i.test(a.err.message), `held: ${a.err?.message}`); assert.ok(!a.calls.some((c) => c.method === 'POST'), 'held: nothing sent');
    const j2: any = { id: 'wa2prep', input: structuredClone(job) }; await W.prepareWa2Cloud(j2); const p = W.wa2CloudPlan({ id: 'wa2prep', toolId: 'motion-transfer', provider: W.WA2_PROVIDER, input: j2.input });
    clean('wan animate 2 plan', JSON.parse(JSON.stringify(p.passes[0].graph).replace(/\{"__file":"[^"]+"\}/g, JSON.stringify(ASSET))));
    const frames = Number(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', j2.input.wa2.video]).toString().trim());
    assert.ok(frames >= 2 * 80 + 1, `the driving clip covers both windows (${frames} frames)`); }
  ok('fake Cloud run: Gemini Omni and Topaz Bloom 2 upload, send the key once, submit the checked graph and save the result; a refused or held job sends nothing; Wan Animate 2 prep pads the clip for its windows');
} finally { setCloudFetch(null); fs.rmSync(D, { recursive: true, force: true }); }
console.log('comfy-featured: all ok');
