// MiniMax H3 Fast · Comfy Cloud (2026-10-27): the official FastVideo FastH3 templates (text / image to video) as their own model on Create Video.
// FAKE fetches only (no network, no key, no spend).
//  1 graphs: both saved graphs pass Comfy Cloud's object_info (2026-10-26 cut) except the FastH3 checkpoint, which that copy did not have (checked per run)
//  2 plan: t2v / i2v × 768p / 480p × 2–10 s: prompt, seconds, seed, megapixels, aspect, the start frame, the found checkpoint name; refusals
//  3 routes + price: its own model and Comfy Cloud route on Generate Video (t2v / i2v), estimate row well under full H3, quote endpoint = charge
//  4 run (fake Comfy Cloud): unmeasured → nothing sent; checkpoint missing → refused after GETs only with the import steps; present → submitted
// Run: npx tsx test/h3-fast-cloud.test.ts
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.OPENHIGGSFIELD_ALLOW_UNMEASURED_CLOUD = '0'; // these checks cover the held state (cloud runs before a measured price are allowed by default since 2026-10-27)
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'h3fast-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0' });
for (const k of ['COMFY_API_KEY', 'COMFY_CLOUD_URL', 'OPENHIGGSFIELD_COMFY_CLOUD_URL', 'COMFY_DEPLOY_URL', 'COMFY_RUNNER_URL', 'COMFY_BASE_URL']) delete process.env[k];
globalThis.fetch = (async (u: unknown) => { throw new Error(`network blocked in this test: ${String(u).slice(0, 80)}`); }) as typeof fetch;
const ok = (m: string) => console.log('ok ' + m);
const KEY = 'comfyui-fake-h3fast-key-123';
const F = await import('../src/comfy/h3FastCloud.ts');
const { CLOUD_WORKFLOWS, buildCloudPlan, isStandalone } = await import('../src/comfy/cloudWorkflows.ts');
const { checkCloudGraph } = await import('../src/comfy/cloudGraphCheck.ts');
const { routesFor, findRoute } = await import('../src/routing/routes.ts');
const { HOSTED_BY_ID } = await import('../src/shared/hostedPrices.ts');
const { runCloudWorkflow, setCloudFetch } = await import('../src/routing/cloudRun.ts');
const { CLOUD_RUNNER_ROUTES, routeRunnable } = await import('../src/routing/runnable.ts');
const { routeCredits, routeInput } = await import('../src/routing/select.ts');
const { getTool } = await import('../src/tools/registry.ts');
const { getProvider, providerOpenWeights } = await import('../src/providers.ts');
const { VIDEO_LIMITS } = await import('../src/tools/h3/videoCaps.ts');
const { WORKFLOWS_DIR } = await import('../src/config.ts');
const OI = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'object-info-h3-fast-cloud-2026-10-26.json'), 'utf8'));
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(WORKFLOWS_DIR, f), 'utf8'));
const UNET_ERR = `"unet_name" = ${JSON.stringify(F.H3F_UNET)} is not in the list`;
const clean = (label: string, g: Record<string, any>, unet = F.H3F_UNET) => { const c = checkCloudGraph(g, OI); const errs = c.errors.filter((e) => !e.includes(`"unet_name" = ${JSON.stringify(unet)}`));
  assert.deepEqual(errs, [], `${label}: ${errs.join(' | ')}`); assert.deepEqual(c.warnings, [], `${label}: ${c.warnings.join(' | ')}`); };
const json = (o: any, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
const plan = (input: Record<string, any>) => buildCloudPlan({ id: 'j1', toolId: 'h3-video', provider: F.H3F_PROVIDER, input });
try {
  // ---- 1. graphs ----
  for (const [mode, f] of Object.entries(F.H3F_GRAPHS)) { const g = load(f); const c = checkCloudGraph(g, OI);
    assert.deepEqual(c.errors.map((e) => e.includes(UNET_ERR)), [true], `${mode}: the only gap is the FastH3 checkpoint (${c.errors.join(' | ')})`); clean(mode, g);
    assert.equal(g['105:9'].inputs.steps, 8); assert.equal(g['105:17'].inputs.sampler_name, 'res_multistep'); assert.equal(g['105:11'].inputs.vae_name, 'minimax_h3_video_vae_fp16.safetensors', 'the fp16 video VAE (int8 is not on Cloud)');
    assert.equal(g['92'].class_type, 'SaveVideo'); }
  { const spec = OI.UNETLoader.input.required.unet_name; const opts: string[] = Array.isArray(spec[0]) ? spec[0] : spec[1].options; assert.ok(!opts.some((o) => /fasth3/i.test(o)), 'not in Cloud\'s library on 2026-10-26: checked per run');
    for (const m of F.H3F_REQUIRES.models) { if (m.file === F.H3F_UNET) continue; const s = OI[m.loader].input.required[m.field]; const o = Array.isArray(s[0]) ? s[0] : s[1].options; assert.ok(o.includes(m.file), `${m.file} on Comfy Cloud`); } }
  ok('graphs: both official FastH3 templates pass Comfy Cloud\'s object_info except the checkpoint (not in the 2026-10-26 copy), fp16 video VAE, 8 steps');

  // ---- 2. plan ----
  let n = 0;
  for (const mode of ['t2v', 'i2v'] as const) for (const resolution of ['768p', '480p']) for (const s of F.H3F_SECONDS) {
    const pl = plan({ mode, prompt: 'a red fox runs through snow', finalPrompt: 'a red fox runs through snow', duration: s, resolution, aspect: '9:16', seed: 7, ...(mode === 'i2v' ? { imagePath: '/x/start.png' } : {}) });
    const g = pl.passes[0].graph; clean(`${mode} ${resolution} ${s}s`, g); n++;
    assert.equal(pl.passes[0].workflow, F.H3F_GRAPHS[mode]); assert.equal(g['105:111'].inputs.value, s); assert.equal(g['105:15'].inputs.noise_seed, 7); assert.equal(g['105:104'].inputs.prompt, 'a red fox runs through snow');
    const mp = resolution === '480p' ? 0.4 : 1.0;
    if (mode === 't2v') { assert.deepEqual([g['143'].inputs.aspect_ratio, g['143'].inputs.megapixels], ['9:16 (Portrait Widescreen)', mp]); assert.ok(!g['136']); }
    else { assert.deepEqual(g['136'].inputs.image, { __file: '/x/start.png' }); assert.equal(g['142'].inputs.megapixels, mp); assert.deepEqual(g['105:104'].inputs.first_frame, ['136', 0]); } }
  assert.equal(plan({ mode: 't2v', prompt: 'x', duration: 5, h3FastUnet: F.H3F_IMPORTED }).passes[0].graph['105:6'].inputs.unet_name, F.H3F_IMPORTED, 'the name the free check found');
  assert.throws(() => plan({ mode: 'r2v', prompt: 'x', duration: 5 }), /text to video or image to video/); assert.throws(() => plan({ mode: 't2v', prompt: 'x', duration: 12 }), /2–10 s/);
  assert.throws(() => plan({ mode: 'i2v', prompt: 'x', duration: 5 }), /needs a start frame/);
  ok(`plan: ${n} variants (t2v / i2v × 768p / 480p × 2–10 s) pass Cloud with prompt, seconds, seed, megapixels, aspect, start frame; the imported name; refusals`);

  // ---- 3. routes + price ----
  const tool = getTool('h3-video')!; assert.ok(tool.providers.includes(F.H3F_PROVIDER)); assert.deepEqual((tool as any).app?.providerModes?.[F.H3F_PROVIDER] ?? (tool as any).providerModes?.[F.H3F_PROVIDER], ['t2v', 'i2v']);
  const rs = routesFor(F.H3F_PROVIDER, tool); assert.equal(rs.length, 1); const rt = rs[0]; assert.equal(rt.routeId, F.H3F_ROUTE); assert.equal(rt.kind, 'comfy-cloud'); assert.equal(rt.label, 'Comfy Cloud');
  { const pv = getProvider(F.H3F_PROVIDER)!; assert.equal(pv.name, F.H3F_NAME); assert.ok(providerOpenWeights(pv), 'open weights');
    const row = HOSTED_BY_ID[F.H3F_PROVIDER]; assert.ok(row?.priceUnmeasured && row.estimated); assert.ok(row.usdByQuality!['768p'] > row.usdByQuality!['480p']);
    assert.ok(row.usdByQuality!['768p'] < HOSTED_BY_ID['cloud-h3-wf'].usdByQuality!['720p'] / 2, 'well under full H3 on Comfy Cloud');
    assert.ok(CLOUD_RUNNER_ROUTES.has(rt.routeId)); assert.ok(routeRunnable(rt)); const w = CLOUD_WORKFLOWS[rt.routeId]; assert.ok(isStandalone(w) && w.target === 'cloud' && !!w.preflight);
    assert.deepEqual(VIDEO_LIMITS[F.H3F_PROVIDER].durations, [...F.H3F_SECONDS]); }
  const Fastify = (await import('fastify')).default; const app = Fastify(); (await import('../src/routesBatch1.ts')).registerBatch1(app); (await import('../src/routing/http.ts')).registerRouting(app); await app.ready();
  const seen: Record<string, number> = {};
  for (const [mode, s, res] of [['t2v', 5, '768p'], ['t2v', 2, '480p'], ['t2v', 10, '768p'], ['i2v', 5, '480p']] as const) {
    const qs = new URLSearchParams({ provider: F.H3F_PROVIDER, route: F.H3F_ROUTE, seconds: String(s), duration: String(s), resolution: res, types: JSON.stringify([mode]), mode });
    const r = await app.inject({ url: `/api/tools/h3-video/price?${qs}` }); assert.equal(r.statusCode, 200, r.body.slice(0, 300)); const b = r.json(); assert.equal(b.route, F.H3F_ROUTE, JSON.stringify(b).slice(0, 300));
    const quoted = b.listCredits ?? b.credits; const charge = routeCredits(tool, rt, routeInput(tool, { mode, types: [mode], duration: s, resolution: res, prompt: 'x', ...(mode === 'i2v' ? { imagePath: '/x/a.png' } : {}) }))!;
    assert.equal(quoted, charge, `${mode} ${s} s ${res}: quote ${quoted} = charge ${charge}`); seen[`${mode} ${s}s ${res}`] = quoted; }
  assert.ok(seen['t2v 10s 768p'] > seen['t2v 5s 768p'] && seen['t2v 5s 768p'] > seen['t2v 2s 480p'], JSON.stringify(seen)); await app.close();
  const usd = (s: number, q: string) => (s * HOSTED_BY_ID[F.H3F_PROVIDER].usdByQuality![q]).toFixed(3);
  ok(`routes + price: its own Comfy Cloud model on Generate Video (t2v / i2v), estimate under half of full H3; quote = charge ${JSON.stringify(seen)}; 5 s 768p $${usd(5, '768p')}, 5 s 480p $${usd(5, '480p')}`);

  // ---- 4. run on a fake Comfy Cloud ----
  const outBuf = Buffer.from('fake-mp4');
  const lib = (o: { assets?: any[]; unets?: string[] | null; assetsDown?: boolean }) => (url: string) => {
    if (url.includes('/api/assets?')) return o.assetsDown ? new Response('x', { status: 500 }) : json({ assets: o.assets ?? [], total: (o.assets ?? []).length, has_more: false });
    if (url.endsWith('/api/object_info')) return o.unets == null ? new Response('x', { status: 503 }) : json({ UNETLoader: { input: { required: { unet_name: [o.unets, {}] } } } }); return null; };
  const runOnce = async (o: Parameters<typeof lib>[0]) => { const calls: { url: string; method: string; body?: any }[] = []; const h = lib(o);
    setCloudFetch((async (u: any, init: any = {}) => { const url = String(u); calls.push({ url, method: init.method ?? 'GET', body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined });
      const hit = h(url); if (hit) return hit;
      if (url.endsWith('/api/v2/assets')) return json({ id: `a${calls.length}` }); if (url.endsWith('/api/v2/jobs')) return json({ id: 'j1' });
      if (url.endsWith('/api/v2/jobs/j1')) return json({ status: 'succeeded', outputs: [{ node_id: '92', id: 'o1', name: 'h3.mp4', content_type: 'video/mp4', url: '/api/v2/assets/o1/content' }] });
      return new Response(outBuf, { status: 200 }); }) as typeof fetch, 1);
    const job: any = { id: `hf${Math.random().toString(36).slice(2, 7)}`, toolId: 'h3-video', provider: F.H3F_PROVIDER, route: F.H3F_ROUTE, input: { mode: 't2v', prompt: 'a fox', finalPrompt: 'a fox', duration: 5, resolution: '768p', aspect: '16:9', seed: 3 }, status: 'queued', outputs: [] };
    let err: Error | null = null; try { await runCloudWorkflow(job, findRoute(F.H3F_ROUTE)!, { n: 1 } as any); } catch (e) { err = e as Error; } return { job, err, calls }; };
  process.env.COMFY_API_KEY = KEY;
  { const a = await runOnce({}); assert.equal(a.calls.length, 0, 'unmeasured price: nothing sent'); assert.equal(a.job.reasonCode, 'price_unmeasured'); }
  process.env.OPENHIGGSFIELD_ALLOW_UNMEASURED_CLOUD = '1';
  { const a = await runOnce({ assets: [], unets: ['minimax_h3_fl2va_pruned_int8_convrot.safetensors'] }); assert.equal(a.job.reasonCode, 'cloud_import_missing'); assert.match(a.err!.message, /FastH3 checkpoint/); assert.ok(a.err!.message.includes('FastVideo-FastH3-Comfy/resolve/main'));
    assert.match(a.err!.message, /Nothing was sent or charged/); assert.ok(a.calls.every((c) => c.method === 'GET'), 'only free GETs'); }
  { const a = await runOnce({ assets: [], unets: [F.H3F_UNET] }); assert.equal(a.err, null, String(a.err?.message)); const wf = a.calls.find((c) => c.method === 'POST' && c.url.endsWith('/api/v2/jobs'))!.body.workflow;
    clean('submitted', wf); assert.equal(wf['105:6'].inputs.unet_name, F.H3F_UNET); assert.equal(wf['105:111'].inputs.value, 5); assert.equal(a.job.status, 'done', a.job.error); assert.ok(!JSON.stringify(a.job).includes(KEY)); }
  { const a = await runOnce({ assets: [{ name: F.H3F_IMPORTED, loader_path: F.H3F_IMPORTED }] }); assert.equal(a.err, null); assert.equal(a.calls.find((c) => c.method === 'POST' && c.url.endsWith('/api/v2/jobs'))!.body.workflow['105:6'].inputs.unet_name, F.H3F_IMPORTED, 'the user\'s import'); }
  { const a = await runOnce({ unets: null, assetsDown: true }); assert.equal(a.err, null, 'checks down → goes on (Cloud validates at submit)'); }
  ok('run: unmeasured → nothing sent; checkpoint missing → refused after GETs only with the import steps; on Cloud or imported → submitted with that name');
  console.log('ALL OK h3-fast-cloud');
} finally { setCloudFetch(null); delete process.env.COMFY_API_KEY; process.env.OPENHIGGSFIELD_ALLOW_UNMEASURED_CLOUD = '0'; fs.rmSync(D, { recursive: true, force: true }); }
