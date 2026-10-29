// LTX-2.5 Pro / Fast · Comfy Cloud (2026-10-27): image to video and first + last frame through the LTX-2.5 partner node (LtxApi25ImageToVideo) as a
// Comfy Cloud workflow job. FAKE fetches only (no network, no real key, no spend).
//  1 graph: Pro / Fast × i2v / flf × every duration × every resolution × 16:9 / 9:16 × sound on / off passes Comfy Cloud's object_info (0 errors,
//    0 warnings); what the node refuses (Pro 1440p, Fast over 10 s at 1440p / 4K, 7 s, 1:1) is refused by the route check first
//  2 routing: the LTX-2.5 Pro card's Comfy place runs text on Comfy Router and images on Comfy Cloud (same place "Comfy"); Fast gets the Comfy Cloud
//    place for images; the old "image to video runs on the LTX API" refusal is gone
//  3 price: partner-node rates (Pro $0.1716 / s at 720p, Fast $0.1287 / s at 720p); the REAL quote endpoint = the charge
//  4 fit: start / last images cropped to the clip's shape and scaled to the node's exact size before upload
//  5 run on a fake Comfy Cloud: upload fields first, the key once in extra_data.api_key_comfy_org, the graph checked, the video saved
// Run: npx tsx test/ltx25-api-cloud.test.ts
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'ltxapi-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0' });
for (const k of ['OPENHIGGSFIELD_ALLOW_UNMEASURED_CLOUD', 'COMFY_API_KEY', 'COMFY_CLOUD_URL', 'OPENHIGGSFIELD_COMFY_CLOUD_URL', 'COMFY_DEPLOY_URL', 'COMFY_RUNNER_URL', 'COMFY_BASE_URL', 'OPENHIGGSFIELD_LTX_API_KEY']) delete process.env[k];
globalThis.fetch = (async (u: unknown) => { throw new Error(`network blocked in this test: ${String(u).slice(0, 80)}`); }) as typeof fetch;
const ok = (m: string) => console.log('ok ' + m);
const L = await import('../src/comfy/ltx25ApiCloud.ts');
const { CLOUD_WORKFLOWS, buildCloudPlan, isStandalone } = await import('../src/comfy/cloudWorkflows.ts');
const { checkCloudGraph } = await import('../src/comfy/cloudGraphCheck.ts');
const { routesFor, findRoute } = await import('../src/routing/routes.ts');
const { HOSTED_BY_ID } = await import('../src/shared/hostedPrices.ts');
const { runCloudWorkflow, setCloudFetch } = await import('../src/routing/cloudRun.ts');
const { CLOUD_RUNNER_ROUTES, routeRunnable } = await import('../src/routing/runnable.ts');
const { routeCredits, routeInput, autoOrder, option } = await import('../src/routing/select.ts');
const { getTool } = await import('../src/tools/registry.ts');
const { getProvider, providerOpenWeights } = await import('../src/providers.ts');
const { runOnOfRoute } = await import('../src/shared/modelIds.ts');
const OI = JSON.parse(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'fixtures/object-info-comfy-cloud-2026-10-26.json'), 'utf8'));
const json = (o: any, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
const ff = (args: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args]);
const img = (name: string, size: string) => { ff(['-f', 'lavfi', '-i', `testsrc2=size=${size}:rate=1`, '-frames:v', '1', path.join(D, name)]); return name; };
const dims = (f: string) => execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=s=x:p=0', f]).toString().trim();
const tool = getTool('h3-video')!;
const parse = async (f: Record<string, string>, files: Record<string, string[]>) => { const r: any = await tool.parseInput({ prompt: 'the ship turns toward the light', ...f }, files); assert.ok(!r.error, String(r.error)); return r; };
const PRO = L.LTX_API_CLOUD.pro, FAST = L.LTX_API_CLOUD.fast;
try {
  // ---- 1. graph vs Comfy Cloud object_info ----
  { let n = 0; const A = { __file: 'a.png' }, B = { __file: 'b.png' };
    for (const t of [PRO, FAST]) for (const mode of ['i2v', 'flf']) for (const d of t.durations) for (const res of t.resolutions) for (const aspect of ['16:9', '9:16']) for (const audio of [true, false]) {
      const i = { mode, duration: d, resolution: res, aspect, audio, imagePath: 'a.png', lastFramePath: 'b.png', prompt: 'p', seed: 7 };
      const issue = L.ltxApiCloudIssue(t.tier)(i);
      if (d > 10 && !['720p', '1080p'].includes(res)) { assert.match(String(issue), /over 10 s at 720p or 1080p/); continue; }
      assert.equal(issue, null, `${t.tier} ${mode} ${d} ${res}`);
      const g = L.ltxApiGraph(t.tier, i, { start: A, last: mode === 'flf' ? B : undefined }); const r = checkCloudGraph(g, OI);
      assert.deepEqual(r.errors, [], `${t.tier} ${mode} ${d}s ${res} ${aspect}: ${r.errors.join(' | ')}`); assert.deepEqual(r.warnings, [], `${r.warnings}`);
      const nd = g['6'].inputs; assert.equal(nd.model, t.nodeModel); assert.equal(nd['model.duration'], String(d)); assert.equal(nd['model.resolution'], L.LTX_API_SIZES[res][aspect as '16:9'].join('x'));
      assert.equal(nd['model.generate_audio'], audio); assert.equal(!!g['5'], mode === 'flf'); assert.deepEqual(nd.last_frame ?? null, mode === 'flf' ? ['5', 0] : null); n++; }
    const bad = (mut: (g: any) => void, re: RegExp) => { const g = L.ltxApiGraph('pro', { mode: 'i2v', duration: 6, resolution: '720p' }, { start: A }); mut(g); assert.ok(checkCloudGraph(g, OI).errors.some((e) => re.test(e)), String(re)); };
    bad((g) => { g['6'].inputs['model.duration'] = '12'; }, /not in the list|not one of/); bad((g) => { g['6'].inputs['model.resolution'] = '2560x1440'; }, /not in the list|not one of/);
    bad((g) => { delete g['6'].inputs['model.fps']; }, /"model\.fps" is missing/);
    const no = (tier: 'pro' | 'fast', i: any, re: RegExp) => assert.match(String(L.ltxApiCloudIssue(tier)({ mode: 'i2v', ...i })), re);
    no('pro', { resolution: '1440p' }, /makes 720p or 1080p/); no('pro', { duration: 7 }, /2, 3, 4, 5, 6, 8 or 10 s/); no('fast', { duration: 14, resolution: '4K' }, /over 10 s/);
    no('pro', { aspect: '1:1' }, /16:9 or 9:16/); no('pro', { mode: 't2v' }, /text to video runs on Comfy Router/); no('fast', { draft: true }, /no draft/);
    ok(`${n} partner-node graphs (Pro / Fast × i2v / flf × durations × resolutions × shapes × sound) pass the object_info check; bad values and jobs are refused`); }

  // ---- 2. routing ----
  const START = img('start.png', '1600x900'), LAST = img('last.png', '1600x900'), TALL = img('tall.png', '900x1600'), SQ = img('sq.png', '1000x1000');
  const proRoutes = routesFor('router-ltx-25-pro', tool); const cr = proRoutes.find((r) => r.routeId === PRO.route)!; const rr = proRoutes.find((r) => r.routeId === 'comfy-router:router-ltx-25-pro')!;
  assert.ok(cr && rr, proRoutes.map((r) => r.routeId).join(', ')); assert.equal(cr.kind, 'comfy-cloud'); assert.equal(cr.label, 'Comfy Cloud'); assert.equal(runOnOfRoute(cr), 'comfy-cloud'); assert.equal(runOnOfRoute(rr), 'comfy-cloud');
  assert.deepEqual(cr.modes, ['i2v', 'flf']); assert.ok(CLOUD_RUNNER_ROUTES.has(PRO.route) && routeRunnable(cr)); assert.ok(!providerOpenWeights(getProvider(PRO.provider)!), 'partner node: hosted, not open weights');
  const fr = routesFor('direct-ltx-25-fast', tool).find((r) => r.routeId === FAST.route)!; assert.ok(fr, 'Fast: a Comfy Cloud place for image jobs');
  const w = CLOUD_WORKFLOWS[PRO.route]; assert.ok(isStandalone(w) && w.target === 'cloud' && w.partnerAuth && !!w.prepare);
  process.env.COMFY_API_KEY = 'comfyui-fake-ltxapi-key-0000';
  const i2v = routeInput(tool, await parse({ provider: 'router-ltx-25-pro', types: '["i2v"]', duration: '6', resolution: '720p' }, { image: [START] }));
  const flf = routeInput(tool, await parse({ provider: 'router-ltx-25-pro', types: '["flf"]', duration: '6', resolution: '720p' }, { image: [START], lastFrame: [LAST] }));
  const t2v = routeInput(tool, await parse({ provider: 'router-ltx-25-pro', types: '["t2v"]', duration: '6', resolution: '720p' }, {}));
  assert.equal(autoOrder(tool, 'router-ltx-25-pro', i2v)[0]?.routeId, PRO.route, 'Pro i2v → Comfy Cloud'); assert.equal(autoOrder(tool, 'router-ltx-25-pro', flf)[0]?.routeId, PRO.route, 'Pro flf → Comfy Cloud');
  assert.equal(autoOrder(tool, 'router-ltx-25-pro', t2v)[0]?.routeId, rr.routeId, 'Pro t2v stays on Comfy Router');
  assert.ok(!option(tool, cr, t2v).available && option(tool, rr, i2v).available === false);
  { const fi = routeInput(tool, await parse({ provider: 'direct-ltx-25-fast', types: '["i2v"]', duration: '6', resolution: '720p' }, { image: [START] }));
    const o = autoOrder(tool, 'direct-ltx-25-fast', fi); assert.equal(o[0]?.routeId, FAST.route, `Fast i2v → Comfy Cloud: ${o.map((x) => `${x.routeId} ${x.reason ?? ''}`).join(', ')}`); }
  ok('routing: Pro text → Comfy Router, Pro / Fast start image or first + last → Comfy Cloud partner node (place "Comfy · Comfy Cloud")');

  // ---- 3. price: rows, and the real quote endpoint = the charge ----
  assert.equal(HOSTED_BY_ID[PRO.provider].usdByQuality!['720p'], 0.1716); assert.equal(HOSTED_BY_ID[PRO.provider].usdByQuality!['1080p'], 0.2431);
  assert.equal(HOSTED_BY_ID[FAST.provider].usdByQuality!['720p'], 0.1287); assert.equal(HOSTED_BY_ID[FAST.provider].usdByQuality!['4K'], 0.429);
  assert.equal(HOSTED_BY_ID[PRO.provider].usdByQuality!['720p'], HOSTED_BY_ID['router-ltx-25-pro'].usdByQuality!['720p'], 'same rate as the Router place');
  assert.equal(routeCredits(tool, cr, i2v), Math.ceil(6 * 0.1716 * 100 - 1e-9), '6 s × $0.1716');
  { const Fastify = (await import('fastify')).default; const app = Fastify(); (await import('../src/routesBatch1.ts')).registerBatch1(app); (await import('../src/routing/http.ts')).registerRouting(app); await app.ready();
    const seen: Record<string, string> = {};
    for (const [prov, model, mode, s, res, route] of [['router-ltx-25-pro', null, 'i2v', '6', '720p', PRO.route], ['router-ltx-25-pro', null, 'flf', '10', '1080p', PRO.route], ['direct-ltx-25-fast', null, 'i2v', '6', '720p', FAST.route],
      ['direct-ltx-25-fast', null, 'i2v', '20', '1080p', FAST.route], ['router-ltx-25-pro', null, 't2v', '10', '720p', 'comfy-router:router-ltx-25-pro'], [null, 'ltx-2.5-pro', 'i2v', '8', '720p', PRO.route], [null, 'ltx-2.5-fast', 'flf', '6', '720p', FAST.route]] as const) {
      const qs = new URLSearchParams({ ...(prov ? { provider: prov } : { model: model!, runOn: 'comfy-cloud' }), types: JSON.stringify([mode]), duration: s, resolution: res, image: '1' });
      const r = await app.inject({ url: `/api/tools/h3-video/price?${qs}` }); assert.equal(r.statusCode, 200, r.body.slice(0, 300)); const b = r.json();
      assert.equal(b.route, route, `${prov ?? model} ${mode}: ${JSON.stringify(b).slice(0, 400)}`);
      const job = await parse({ provider: (prov ?? (model === 'ltx-2.5-pro' ? 'router-ltx-25-pro' : 'direct-ltx-25-fast')), types: JSON.stringify([mode]), duration: s, resolution: res }, mode === 't2v' ? {} : { image: [START], ...(mode === 'flf' ? { lastFrame: [LAST] } : {}) });
      const charge = routeCredits(tool, findRoute(route) ?? routesFor(prov ?? (model === 'ltx-2.5-pro' ? 'router-ltx-25-pro' : 'direct-ltx-25-fast'), tool).find((x) => x.routeId === route)!, routeInput(tool, job))!;
      const quoted = b.listCredits ?? b.credits; assert.equal(quoted, charge, `${mode} ${s} ${res}: quote ${quoted} = charge ${charge}`);
      assert.ok(!/runs on the LTX API/.test(r.body), 'the old refusal is gone'); seen[`${prov ?? model} ${mode} ${s}s ${res}`] = `$${(quoted / 100).toFixed(2)}`; }
    await app.close(); ok(`quote endpoint = charge: ${JSON.stringify(seen)}`); }

  // ---- 4. fit ----
  for (const [name, f, asp, want] of [['wide', START, 'auto', '1280x720'], ['tall', TALL, 'auto', '720x1280'], ['square', SQ, 'auto', '1280x720'], ['tall asked 16:9', TALL, '16:9', '1280x720']] as const) {
    const job: any = { id: `fit-${name.replace(/\W/g, '')}`, input: { ...i2v, imagePath: path.join(D, f), aspect: asp } }; await L.prepareLtxApiCloud(job, 'pro');
    assert.equal(dims(job.input.ltxApi.start), want, name); assert.equal(job.input.ltxApi.size, want); }
  { const job: any = { id: 'fit-flf', input: { ...flf, resolution: '1080p', lastFramePath: path.join(D, SQ) } }; await L.prepareLtxApiCloud(job, 'pro');
    assert.equal(dims(job.input.ltxApi.start), '1920x1080'); assert.equal(dims(job.input.ltxApi.last), '1920x1080', 'last frame fitted to the same size'); assert.match(job.input.ltxApi.fit.last.note, /cropped to 16:9/); }
  ok('fit: start / last frames cropped to 16:9 or 9:16 (portrait → 9:16) and scaled to the node size');

  // ---- 5. run on a fake Comfy Cloud ----
  const runOnce = async (input: any, id: string, route = PRO.route) => { const calls: { url: string; method: string; body?: any; form?: string[]; type?: string }[] = []; const out = path.join(D, `${id}-gen.mp4`);
    ff(['-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=24', '-t', '1', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', out]);
    setCloudFetch((async (u: any, init: any = {}) => { const url = String(u); const c = { url, method: init.method ?? 'GET', body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined, form: init.body instanceof FormData ? [...init.body.keys()] : undefined, type: init.body instanceof FormData ? String(init.body.get('content_type')) : undefined }; calls.push(c);
      if (url.endsWith('/api/v2/assets')) return json({ id: `a${calls.length}`, hash: 'blake3:00', file_path: 'x.png' }, 201);
      if (url.endsWith('/api/v2/jobs')) return json({ id: `${id}-cj`, status: 'queued' }, 201);
      if (url.endsWith(`/api/v2/jobs/${id}-cj`)) return json({ status: 'succeeded', outputs: [{ node_id: '2', id: 'o1', name: 'ltx.mp4', filename: 'ltx.mp4', content_type: 'video/mp4', url: '/api/v2/assets/o1/content' }] });
      return new Response(fs.readFileSync(out), { status: 200 }); }) as typeof fetch, 1);
    const r = findRoute(route)!; const job: any = { id, toolId: 'h3-video', provider: 'router-ltx-25-pro', route, input: structuredClone(input), status: 'queued', outputs: [] };
    let err: Error | null = null; try { await runCloudWorkflow(job, r, { n: 1 } as any); } catch (e) { err = e as Error; } return { job, err, calls }; };
  { const a = await runOnce(flf, 'run1'); assert.equal(a.err, null, String(a.err?.message)); assert.equal(a.job.status, 'done', a.job.error);
    const ups = a.calls.filter((c) => c.url.endsWith('/api/v2/assets')); assert.equal(ups.length, 2, 'start + last frame uploaded'); for (const u of ups) { assert.deepEqual(u.form, ['content_type', 'file_path', 'file']); assert.equal(u.type, 'image/png'); }
    const sub = a.calls.find((c) => c.url.endsWith('/api/v2/jobs'))!.body; assert.deepEqual(sub.extra_data, { api_key_comfy_org: 'comfyui-fake-ltxapi-key-0000' }, 'partner node: the key once in extra_data');
    const g = sub.workflow; assert.equal(g['4'].inputs.image.__type, 'core/ASSET'); assert.equal(g['5'].inputs.image.__type, 'core/ASSET'); assert.equal(g['6'].class_type, 'LtxApi25ImageToVideo');
    assert.equal(g['6'].inputs.model, 'LTX-2.5 (Pro)'); assert.equal(g['6'].inputs['model.resolution'], '1280x720'); assert.equal(g['6'].inputs['model.duration'], '6'); assert.match(g['6'].inputs.prompt, /the ship turns toward the light/);
    assert.deepEqual(checkCloudGraph(g, OI).errors, [], 'the graph sent passes the check'); assert.ok(fs.existsSync(path.join(D, a.job.outputs[0].url.slice('/files/'.length))), 'video saved');
    assert.ok(!JSON.stringify(a.job).includes('comfyui-fake-ltxapi-key-0000'), 'the key is never kept on the job'); }
  { const p = buildCloudPlan({ id: 'cov', toolId: 'h3-video', provider: FAST.provider, input: { ...i2v, prompt: '@image1 waves', finalPrompt: '@image1 waves' } }); assert.ok(!/@image1/.test(JSON.stringify(p.passes[0].graph)), 'prompt grammar applied'); }
  { const c = await runOnce({ ...i2v, resolution: '1440p' }, 'run2'); assert.ok(c.err && /720p or 1080p/.test(c.err.message), String(c.err?.message)); assert.ok(!c.calls.some((q) => q.method === 'POST'), 'nothing sent'); }
  ok('fake Cloud run: frames uploaded (fields first, PNG), key once in extra_data, checked graph submitted, video saved; a refused job sends nothing');
  delete process.env.COMFY_API_KEY; assert.equal(option(tool, cr, i2v).reasonCode, 'key_missing', 'no key: key_missing (sample on the mock backend)');
} finally { setCloudFetch(null); fs.rmSync(D, { recursive: true, force: true }); }
console.log('ltx25-api-cloud: all ok');
