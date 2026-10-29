// Render · LTX-2.5 + Layout to Render · Comfy Cloud (2026-10-27): the Comfy Cloud place of Direct a Shot's Render (local route comfy-ltx25-layout).
// FAKE fetches only (no network, no key, no spend).
//  1 graph: our local graph with the official int8 ConvRot files (same node ids and wiring), the Layout to Render LoRA as the user's import; on Cloud
//  2 plan: Draft / Sharper / 720p × 16:9 / 9:16 / 1:1 × 2–10 s pass Cloud's object_info (0 errors besides the imported LoRA name), 24·s + 1 frames,
//    stage 2 on the 64 grid, guides (first frame before the clip, layout from frame 0, both stages), 720p scaled back to 1280×720; LoRA name resolution
//  3 parseInput: an 8.0 s 1280×720 mockup → 8 s = 193 frames at 1280×704 (last frame held once), first frame squeezed the same way; local unchanged
//  4 routes + price: the Comfy Cloud place on Render, estimate row, the real quote endpoint = charge; the free LoRA check endpoint
//  5 run (fake Comfy Cloud): price-first refusal, LoRA missing → refused after GETs only with the import link, imported → uploads (fields first) + submit
// Run: npx tsx test/ltx25-layout-cloud.test.ts
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
process.env.OPENHIGGSFIELD_ALLOW_UNMEASURED_CLOUD = '0'; // these checks cover the held state (cloud runs before a measured price are allowed by default since 2026-10-27)
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'layoutcloud-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0' });
for (const k of ['COMFY_API_KEY', 'COMFY_CLOUD_URL', 'OPENHIGGSFIELD_COMFY_CLOUD_URL', 'COMFY_DEPLOY_URL', 'COMFY_RUNNER_URL', 'COMFY_BASE_URL', 'COMFY_CLOUD_LAYOUT_LORA']) delete process.env[k];
globalThis.fetch = (async (u: unknown) => { throw new Error(`network blocked in this test: ${String(u).slice(0, 80)}`); }) as typeof fetch;
const ok = (m: string) => console.log('ok ' + m);
const KEY = 'comfyui-fake-layout-key-123';
const L = await import('../src/comfy/ltx25LayoutCloud.ts');
const S = await import('../src/shared/makeItReal.ts');
const { LTX25_CLOUD_FILES } = await import('../src/comfy/ltx25Cloud.ts');
const { CLOUD_WORKFLOWS, buildCloudPlan, isStandalone } = await import('../src/comfy/cloudWorkflows.ts');
const { checkCloudGraph } = await import('../src/comfy/cloudGraphCheck.ts');
const { conformArgs } = await import('../src/comfy/makeItReal.ts');
const { routesFor, findRoute } = await import('../src/routing/routes.ts');
const { HOSTED_BY_ID } = await import('../src/shared/hostedPrices.ts');
const { runCloudWorkflow, setCloudFetch } = await import('../src/routing/cloudRun.ts');
const { CLOUD_RUNNER_ROUTES, routeRunnable } = await import('../src/routing/runnable.ts');
const { routeCredits, routeInput } = await import('../src/routing/select.ts');
const { getTool } = await import('../src/tools/registry.ts');
const { getProvider, providerOpenWeights } = await import('../src/providers.ts');
const { jobs } = await import('../src/jobs.ts');
const { WORKFLOWS_DIR } = await import('../src/config.ts');
const OI = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'object-info-comfy-cloud-2026-10-26.json'), 'utf8'));
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(WORKFLOWS_DIR, f), 'utf8'));
const IMPORTED = S.LAYOUT_LORA_IMPORTED;
const clean = (label: string, g: Record<string, any>, lora = IMPORTED) => { const c = checkCloudGraph(g, OI); const errs = c.errors.filter((e) => !e.includes(JSON.stringify(lora)));
  assert.deepEqual(errs, [], `${label}: ${errs.join(' | ')}`); assert.deepEqual(c.warnings, [], `${label}: ${c.warnings.join(' | ')}`);
  const ids = new Set(Object.keys(g)); for (const [id, n] of Object.entries<any>(g)) for (const v of Object.values<any>(n.inputs)) if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'string') assert.ok(ids.has(v[0]), `${label}: ${id} links to removed ${v[0]}`); };
const probe = (f: string) => { const [w, h, n] = execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,nb_read_frames', '-of', 'csv=p=0', f]).toString().trim().split(','); return { width: +w, height: +h, frames: +n }; };
const json = (o: any, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
const mkClip = (name: string, secs: number, size = '1280x720') => { const f = path.join(D, name); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `testsrc=size=${size}:rate=24:duration=${secs}`, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', f]); return f; };
const plan = (input: Record<string, any>) => buildCloudPlan({ id: 'j1', toolId: 'make-it-real', provider: L.LAYOUT_CLOUD_PROVIDER, input });
const jobInput = (p: any) => ({ prompt: 'x', finalPrompt: 'a street at dusk', seed: 42, duration: p.seconds, resolution: p.tier, layoutPath: '/x/layout.mp4', firstFramePath: '/x/first.png', makeReal: { plan: p } });
try {
  // ---- 1. graph ----
  const local = load('ltx25-layout-to-render-api.json'); const cg = load(L.LAYOUT_CLOUD_GRAPH);
  assert.deepEqual(Object.keys(cg).sort(), Object.keys(local).sort(), 'same node ids as the local graph');
  assert.equal(local['1'].class_type, 'UnetLoaderGGUF'); assert.deepEqual(cg['1'].inputs, { unet_name: LTX25_CLOUD_FILES.unet, weight_dtype: 'default' });
  assert.equal(cg['4'].inputs.clip_name, LTX25_CLOUD_FILES.textEncoder); assert.equal(cg['5'].inputs.vae_name, LTX25_CLOUD_FILES.videoVae); assert.equal(cg['6'].inputs.vae_name, LTX25_CLOUD_FILES.audioVae); assert.equal(cg['7'].inputs.model_name, LTX25_CLOUD_FILES.upscaler);
  assert.equal(cg['2'].inputs.lora_name, IMPORTED); assert.equal(IMPORTED, 'Lightricks__LTX-2.5-22b-IC-LoRA-Layout-To-Render__ltx-2.5-22b-ic-lora-layout-to-render-1.0.safetensors');
  for (const id of Object.keys(cg)) if (!['1', '2', '4', '5', '63'].includes(id)) assert.deepEqual(cg[id].inputs, local[id].inputs, `node ${id} unchanged`);
  for (const id of Object.keys(cg)) for (const [k, v] of Object.entries<any>(cg[id].inputs)) if (Array.isArray(v)) assert.deepEqual(v, local[id].inputs[k], `${id}.${k} wired as local`);
  clean('as saved', cg);
  for (const m of L.LAYOUT_CLOUD_REQUIRES.models) { if (m.file === IMPORTED) continue; const spec = OI[m.loader].input.required[m.field]; const opts = Array.isArray(spec[0]) ? spec[0] : spec[1].options; assert.ok(opts.includes(m.file), `${m.file} on Comfy Cloud`); }
  { const spec = OI.LoraLoaderModelOnly.input.required.lora_name; const opts: string[] = Array.isArray(spec[0]) ? spec[0] : spec[1].options; assert.ok(!opts.some((o) => /layout/i.test(o)), 'the LoRA is not in Cloud\'s shared library (so the user imports it)'); }
  for (const n of L.LAYOUT_CLOUD_REQUIRES.nodes) assert.ok(OI[n], `${n} on Comfy Cloud`);
  ok('graph: local node ids and wiring, official int8 ConvRot files, the imported LoRA name, every class and shared file on Comfy Cloud (the LoRA is not shared)');

  // ---- 2. plan variants ----
  assert.deepEqual(S.cloudLengthsFor(8.0), [2, 3, 4, 5, 6, 7, 8]); assert.deepEqual(S.cloudLengthsFor(7.96), [2, 3, 4, 5, 6, 7, 8]); assert.deepEqual(S.cloudLengthsFor(14), [2, 3, 4, 5, 6, 7, 8, 9, 10]); assert.deepEqual(S.cloudLengthsFor(1.6), []);
  assert.equal(S.makeRealCloudPlan({ width: 1280, height: 720, seconds: 1.5 }), null);
  let n = 0; const recs = { '16:9': [1280, 720], '9:16': [720, 1280], '1:1': [960, 960] } as const;
  for (const [aspect, [rw, rh]] of Object.entries(recs)) for (const size of ['quick', 'standard', 'hd']) for (let s = 2; s <= 10; s++) {
    const p = S.makeRealCloudPlan({ width: rw, height: rh, seconds: 10 }, { seconds: s, size })!; const label = `${aspect} ${size} ${s}s`;
    assert.equal(p.frames, 24 * s + 1); assert.equal((p.frames - 1) % 8, 0, `${label} 8n + 1`); assert.equal(p.width % 64, 0); assert.equal(p.height % 64, 0); assert.equal(p.stage1.width % 32, 0); assert.equal(p.stage1.height % 32, 0);
    const pl = plan(jobInput(p)); const ps = pl.passes[0]; const g = ps.graph; clean(label, g); n++;
    assert.equal(ps.workflow, L.LAYOUT_CLOUD_GRAPH); assert.equal(g['30'].inputs.length, p.frames); assert.equal(g['33'].inputs.frames_number, p.frames); assert.deepEqual([g['30'].inputs.width, g['30'].inputs.height], [p.stage1.width, p.stage1.height]);
    assert.deepEqual([g['23'].inputs.width, g['23'].inputs.height], [p.stage1.width, p.stage1.height]);
    for (const id of ['31', '51']) { assert.equal(g[id].inputs.latent_idx, -1, `${label}: first frame before the clip`); assert.equal(g[id].inputs.strength, 1); }
    for (const id of ['32', '52']) { assert.equal(g[id].inputs.frame_idx, 0, `${label}: layout from frame 0`); assert.deepEqual(g[id].inputs.iclora_parameters, ['3', 0]); assert.deepEqual(g[id].inputs.image, ['21', 0]); }
    assert.equal(g['37'].inputs.sigmas.split(',').length, 9); assert.equal(g['55'].inputs.sigmas.split(',')[0].trim(), '0.909375'); assert.equal(g['35'].inputs.noise_seed, 42); assert.equal(g['54'].inputs.noise_seed, 43);
    assert.ok(!Object.values<any>(g).some((x) => /Normaliz|Freeze/.test(x.class_type)), `${label}: no stage-1 sound patch (it broke the Cloud sampler)`);
    assert.deepEqual(g['20'].inputs.file, { __file: '/x/layout.mp4' }); assert.deepEqual(g['22'].inputs.image, { __file: '/x/first.png' });
    const scaled = size === 'hd' && aspect !== '1:1'; assert.equal(!!g['64'], scaled, `${label}: scale node`);
    if (scaled) { assert.deepEqual([g['64'].inputs.width, g['64'].inputs.height], aspect === '16:9' ? [1280, 720] : [720, 1280]); assert.deepEqual(g['62'].inputs.images, ['64', 0]); assert.equal(g['64'].inputs.crop, 'disabled'); } else assert.deepEqual(g['62'].inputs.images, ['60', 0]);
    assert.deepEqual(ps.expect.out, p.out); assert.equal(ps.expect.frames, p.frames);
  }
  { const p = S.makeRealCloudPlan({ width: 1280, height: 720, seconds: 8.0 })!; assert.deepEqual([p.seconds, p.frames, p.width, p.height, p.stage1.width, p.stage1.height, p.out.width, p.out.height, p.tier], [8, 193, 1280, 704, 640, 352, 1280, 720, '720p'], 'default: the whole 8 s mockup at 720p'); }
  { const p = S.makeRealCloudPlan({ width: 1280, height: 720, seconds: 8 }, { size: 'quick', seconds: 5 })!; assert.deepEqual([p.width, p.height, p.out.width, p.out.height, p.tier], [768, 448, 768, 448, '448p'], 'Draft as local'); }
  { const p = S.makeRealCloudPlan({ width: 1280, height: 720, seconds: 8 })!; const g0 = plan(jobInput(p)).passes[0].graph; assert.equal(g0['2'].inputs.lora_name, IMPORTED, 'default name');
    assert.equal(plan({ ...jobInput(p), layoutLora: 'loras/mine/ltx-2.5-22b-ic-lora-layout-to-render-1.0.safetensors' }).passes[0].graph['2'].inputs.lora_name, 'loras/mine/ltx-2.5-22b-ic-lora-layout-to-render-1.0.safetensors', 'the loader path the free check found');
    process.env.COMFY_CLOUD_LAYOUT_LORA = 'my_layout.safetensors'; assert.equal(plan(jobInput(p)).passes[0].graph['2'].inputs.lora_name, 'my_layout.safetensors', 'env override'); delete process.env.COMFY_CLOUD_LAYOUT_LORA;
    assert.match(plan(jobInput(p)).notes.join(' '), /1280×704 → 1280×720, 193 frames \(8 s\)/);
    assert.throws(() => plan({ ...jobInput(p), makeReal: { plan: S.makeRealPlan({ width: 1280, height: 720, seconds: 8 }) } }), /not prepared for this place/, 'a local plan never runs on Cloud');
    assert.throws(() => plan({ ...jobInput(p), duration: 12 }), /up to 10 s/); }
  assert.match(String(L.layoutCloudIssue({ duration: 11 })), /up to 10 s/); assert.match(String(L.layoutCloudIssue({ duration: 1 })), /at least 2 s/); assert.match(String(L.layoutCloudIssue({ resolution: '1080p' })), /720p/);
  assert.equal(L.layoutCloudIssue({ duration: 8, resolution: '720p' }), null); assert.equal(L.layoutCloudIssue({}), null);
  ok(`plan: ${n} variants (Draft / Sharper / 720p × 3 aspects × 2–10 s) pass Cloud with 24·s + 1 frames, stage 2 on the 64 grid, both guides on both stages, 720p → 1280×720 / 720×1280; LoRA name: import / found path / env; refusals`);

  // ---- 3. parseInput (a fake Direct a Shot mockup: 1280×720, 24 fps, exactly 8.0 s = 192 frames) ----
  const rec = mkClip('mock-simple.mp4', 8); assert.equal(probe(rec).frames, 192);
  const ff = path.join(D, 'first.png'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=1280x720', '-frames:v', '1', ff]);
  const pj = { id: 'pj-layout', toolId: 'plan-a-shot', provider: 'local-previz', status: 'done', createdAt: Date.now(), updatedAt: Date.now(), outputs: [{ label: 'Simple view', url: `/files/${path.basename(rec)}` }], resultUrl: `/files/${path.basename(rec)}`,
    input: { previz: { width: 1280, height: 720, fps: 24, frames: 192, shot: { seconds: 8 }, presetName: 'Walk-by' } } } as any; jobs.set(pj.id, pj);
  const tool = getTool('make-it-real')!; const prompt = 'A young woman in a burnt-orange jacket walks through a sunlit coastal city intersection at golden hour.';
  const r: any = await tool.parseInput({ planJob: pj.id, provider: S.MAKE_REAL_PROVIDER, route: S.MAKE_REAL_CLOUD_PLACE, prompt, length: '8', size: 'hd' }, { firstFrame: [path.basename(ff)] }); assert.ok(!r.error, r.error);
  assert.deepEqual([r.duration, r.resolution, r.width, r.height, r.makeReal.plan.frames, r.makeReal.place], [8, '720p', 1280, 720, 193, 'cloud']);
  assert.deepEqual(probe(r.layoutPath), { width: 1280, height: 704, frames: 193 }, 'layout: 1280×704, 193 frames (last frame held once)'); assert.deepEqual(probe(r.firstFramePath), { width: 1280, height: 704, frames: 1 });
  { const def: any = await tool.parseInput({ planJob: pj.id, provider: S.MAKE_REAL_PROVIDER, route: S.MAKE_REAL_CLOUD_PLACE, prompt }, { firstFrame: [path.basename(ff)] }); assert.deepEqual([def.duration, def.resolution, def.makeReal.plan.frames], [8, '720p', 193], 'defaults: the whole mockup at 720p'); }
  { const dr: any = await tool.parseInput({ planJob: pj.id, provider: S.MAKE_REAL_PROVIDER, route: S.MAKE_REAL_CLOUD_PLACE, prompt, length: '3', size: 'quick' }, { firstFrame: [path.basename(ff)] }); assert.deepEqual(probe(dr.layoutPath), { width: 768, height: 448, frames: 73 }); assert.equal(dr.resolution, '448p'); }
  assert.equal(((await tool.parseInput({ planJob: pj.id, provider: S.MAKE_REAL_PROVIDER, route: S.MAKE_REAL_CLOUD_PLACE, prompt, length: '9' }, { firstFrame: [path.basename(ff)] })) as any).issues[0].field, 'length');
  assert.equal(((await tool.parseInput({ planJob: pj.id, provider: S.MAKE_REAL_PROVIDER, route: S.MAKE_REAL_CLOUD_PLACE, prompt, size: '1080p' }, { firstFrame: [path.basename(ff)] })) as any).issues[0].field, 'size');
  assert.equal(((await tool.parseInput({ planJob: pj.id, provider: S.MAKE_REAL_PROVIDER, route: S.MAKE_REAL_CLOUD_PLACE, prompt }, {})) as any).issues[0].field, 'firstFrame');
  { const lo: any = await tool.parseInput({ planJob: pj.id, provider: S.MAKE_REAL_PROVIDER, prompt }, { firstFrame: [path.basename(ff)] }); assert.ok(!lo.error); assert.deepEqual([lo.makeReal.plan.frames, lo.width, lo.height, lo.resolution], [65, 768, 448, '448p'], 'local route unchanged');
    assert.deepEqual(probe(lo.layoutPath), { width: 768, height: 448, frames: 65 }); }
  assert.ok(!conformArgs('a', 'b', { width: 768, height: 448, frames: 65, fps: 24 }).join(' ').includes('tpad'), 'local conform never pads');
  ok('parse: 8.0 s mockup → 8 s = 193 frames at 1280×704 (720p), first frame squeezed the same way, Draft 3 s = 73 frames at 768×448; bad length / size / no first frame refused; local unchanged');

  // ---- 4. routes + price ----
  const rs = routesFor(S.MAKE_REAL_PROVIDER, tool); const loc = rs.find((q) => q.kind === 'local')!; const cr = rs.find((q) => q.routeId === L.LAYOUT_CLOUD_ROUTE)!; assert.ok(loc && cr);
  assert.equal(cr.kind, 'comfy-cloud'); assert.equal(cr.label, 'Comfy Cloud'); assert.deepEqual((cr.caps as any).resolutions, ['448p', '576p', '720p']); assert.equal(cr.heldUntilMeasured, true);
  assert.match(String(loc.unavailableFor?.({ resolution: '720p' })), /720p runs on Comfy Cloud/); assert.equal(loc.unavailableFor?.({ resolution: '448p' }) ?? null, null); assert.equal(cr.unavailableFor?.(r) ?? null, null);
  assert.ok(!routesFor('comfy-ltx25-video', 'make-it-real').some((q) => q.routeId === L.LAYOUT_CLOUD_ROUTE));
  { const pv = getProvider(L.LAYOUT_CLOUD_PROVIDER)!; assert.equal(pv.name, 'LTX-2.5 + Layout to Render · Comfy Cloud'); assert.ok(providerOpenWeights(pv), 'open weights');
    const row = HOSTED_BY_ID[L.LAYOUT_CLOUD_PROVIDER]; assert.ok(row?.priceUnmeasured && row.estimated); assert.ok(row.usdByQuality!['720p'] > row.usdByQuality!['576p'] && row.usdByQuality!['576p'] > row.usdByQuality!['448p']);
    const rt = findRoute(L.LAYOUT_CLOUD_ROUTE)!; assert.ok(CLOUD_RUNNER_ROUTES.has(rt.routeId)); assert.ok(routeRunnable(rt)); const w = CLOUD_WORKFLOWS[rt.routeId]; assert.ok(isStandalone(w) && w.target === 'cloud' && !!w.preflight); }
  const Fastify = (await import('fastify')).default; const app = Fastify(); (await import('../src/routesBatch1.ts')).registerBatch1(app); (await import('../src/routing/http.ts')).registerRouting(app); (await import('../src/routesComfyDeploy.ts')).registerComfyDeploy(app); await app.ready();
  const seen: Record<string, number> = {};
  for (const [len, size] of [['8', 'hd'], ['5', 'hd'], ['8', 'standard'], ['3', 'quick'], ['2', 'hd']] as const) {
    const job: any = await tool.parseInput({ planJob: pj.id, provider: S.MAKE_REAL_PROVIDER, route: S.MAKE_REAL_CLOUD_PLACE, prompt, length: len, size }, { firstFrame: [path.basename(ff)] }); assert.ok(!job.error, job.error);
    const charge = routeCredits(tool, cr, routeInput(tool, job))!; assert.ok(charge > 0);
    const qs = new URLSearchParams({ provider: S.MAKE_REAL_PROVIDER, route: L.LAYOUT_CLOUD_ROUTE, seconds: len, resolution: S.MAKE_REAL_CLOUD_SIZES[size].tier, types: 'make-it-real' });
    const res = await app.inject({ url: `/api/tools/make-it-real/price?${qs}` }); assert.equal(res.statusCode, 200, res.body.slice(0, 300)); const b = res.json();
    assert.equal(b.route, L.LAYOUT_CLOUD_ROUTE, JSON.stringify(b).slice(0, 300)); const quoted = b.listCredits ?? b.credits; assert.equal(quoted, charge, `${len} s ${size}: quote ${quoted} = charge ${charge}`); seen[`${len}s ${size}`] = quoted; }
  assert.ok(seen['8s hd'] > seen['5s hd'] && seen['8s hd'] > seen['8s standard'] && seen['8s standard'] > seen['3s quick'], JSON.stringify(seen));
  const usd8 = 8 * HOSTED_BY_ID[L.LAYOUT_CLOUD_PROVIDER].usdByQuality!['720p'];
  ok(`routes + price: Comfy Cloud place on Render (held until measured), local refuses 720p, open weights, estimate row; quote endpoint = charge ${JSON.stringify(seen)}; 8 s 720p = $${usd8.toFixed(3)}`);

  // the free check endpoint (GET only on Comfy Cloud)
  { const res = await app.inject({ url: '/api/comfy-cloud/ltx25-layout/check' }); assert.equal(res.statusCode, 409); const b = res.json(); assert.equal(b.code, 'key_missing'); assert.equal(b.recommended[0].hf, S.LAYOUT_LORA_URL); assert.equal(b.importAs, IMPORTED); }
  const lib = (o: { assets?: any[]; objectInfo?: string[] | null; assetsDown?: boolean }) => (c: { url: string }) => {
    if (c.url.includes('/api/assets?')) return o.assetsDown ? new Response('x', { status: 500 }) : json({ assets: o.assets ?? [], total: (o.assets ?? []).length, has_more: false });
    if (c.url.endsWith('/api/object_info')) return o.objectInfo == null ? new Response('x', { status: 503 }) : json({ LoraLoaderModelOnly: { input: { required: { lora_name: [o.objectInfo, {}] } } } }); return null; };
  process.env.COMFY_API_KEY = KEY;
  { const calls: string[] = []; setCloudFetch((async (u: any, init: any = {}) => { calls.push(`${init.method ?? 'GET'} ${u}`); return lib({ assets: [], objectInfo: ['other.safetensors'] })({ url: String(u) })!; }) as typeof fetch, 1);
    const b = (await app.inject({ url: '/api/comfy-cloud/ltx25-layout/check' })).json(); assert.equal(b.state, 'missing'); assert.deepEqual(b.missing, ['layout-lora']); assert.match(b.message, /Layout to Render needs Lightricks’ Layout to Render LoRA/); assert.ok(b.message.includes(S.LAYOUT_LORA_URL));
    assert.match(b.recommended[0].todo, /resolve\/main\/ltx-2\.5-22b-ic-lora-layout-to-render-1\.0\.safetensors → type LoRA\. It shows up as Lightricks__LTX-2\.5-22b-IC-LoRA-Layout-To-Render__/); assert.ok(calls.every((c) => c.startsWith('GET ')), 'GET only');
    assert.ok(calls.some((c) => /name_contains=ic-lora-layout-to-render&/.test(c))); }
  { setCloudFetch((async (u: any) => lib({ assets: [{ name: IMPORTED, loader_path: IMPORTED, is_immutable: false }] })({ url: String(u) })!) as typeof fetch, 1);
    const b = (await app.inject({ url: '/api/comfy-cloud/ltx25-layout/check' })).json(); assert.equal(b.state, 'present'); assert.equal(b.loaderPath, IMPORTED); assert.equal(b.foundVia, 'assets'); assert.ok(!JSON.stringify(b).includes(KEY)); }
  delete process.env.COMFY_API_KEY; await app.close();
  ok('check endpoint: no key → 409 with the import link; missing → the steps (resolve link, import name), GET only; imported → present via the model library');

  // ---- 5. run on a fake Comfy Cloud ----
  const rt = findRoute(L.LAYOUT_CLOUD_ROUTE)!; const outClip = mkClip('render.mp4', 193 / 24); const outBuf = fs.readFileSync(outClip);
  type Call = { url: string; method: string; body?: any; form?: string[] };
  const runOnce = async (o: Parameters<typeof lib>[0]) => { const calls: Call[] = []; const h = lib(o);
    setCloudFetch((async (u: any, init: any = {}) => { const url = String(u); const c: Call = { url, method: init.method ?? 'GET', body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined, form: init.body instanceof FormData ? [...init.body.keys()] : undefined }; calls.push(c);
      const hit = h(c); if (hit) return hit;
      if (url.endsWith('/api/v2/assets')) return json({ id: `a${calls.length}` }); if (url.endsWith('/api/v2/jobs')) return json({ id: 'j1' });
      if (url.endsWith('/api/v2/jobs/j1')) return json({ status: 'succeeded', outputs: [{ node_id: '63', id: 'o1', name: 'real.mp4', content_type: 'video/mp4', url: '/api/v2/assets/o1/content' }] });
      return new Response(outBuf, { status: 200 }); }) as typeof fetch, 1);
    const job: any = { id: `lr${Math.random().toString(36).slice(2, 7)}`, toolId: 'make-it-real', provider: S.MAKE_REAL_PROVIDER, route: rt.routeId, input: structuredClone(r), status: 'queued', outputs: [] };
    let err: Error | null = null; try { await runCloudWorkflow(job, rt, { n: 1 } as any); } catch (e) { err = e as Error; } return { job, err, calls }; };
  process.env.COMFY_API_KEY = KEY;
  { const a = await runOnce({}); assert.equal(a.calls.length, 0, 'unmeasured price: nothing sent'); assert.equal(a.job.reasonCode, 'price_unmeasured'); }
  process.env.OPENHIGGSFIELD_ALLOW_UNMEASURED_CLOUD = '1';
  { const a = await runOnce({ assets: [], objectInfo: ['ltx-2.5-22b-distilled-lora-450-bf16.safetensors'] }); assert.equal(a.job.reasonCode, 'cloud_import_missing'); assert.ok(a.err!.message.includes(S.LAYOUT_LORA_URL)); assert.match(a.err!.message, /Nothing was sent or charged/);
    assert.ok(a.calls.every((c) => c.method === 'GET'), 'only free GETs: nothing uploaded or submitted'); }
  { const a = await runOnce({ assets: [{ name: IMPORTED, loader_path: IMPORTED, is_immutable: false }] }); assert.equal(a.err, null, String(a.err?.message));
    const ups = a.calls.filter((c) => c.url.endsWith('/api/v2/assets')); assert.equal(ups.length, 2, 'layout clip + first frame uploaded'); for (const u of ups) assert.deepEqual(u.form, ['content_type', 'file_path', 'file'], 'upload fields before the file');
    const wf = a.calls.find((c) => c.method === 'POST' && c.url.endsWith('/api/v2/jobs'))!.body.workflow;
    clean('submitted', JSON.parse(JSON.stringify(wf).replace(/\{"__type":"core\/ASSET","info":\{[^}]*\}\}/g, '{"__file":"x"}')));
    assert.equal(wf['1'].class_type, 'UNETLoader'); assert.equal(wf['2'].inputs.lora_name, IMPORTED); assert.equal(wf['30'].inputs.length, 193); assert.deepEqual([wf['30'].inputs.width, wf['30'].inputs.height], [640, 352]);
    assert.deepEqual([wf['64'].inputs.width, wf['64'].inputs.height], [1280, 720]); assert.equal(wf['20'].inputs.file.__type, 'core/ASSET'); assert.equal(wf['22'].inputs.image.__type, 'core/ASSET'); assert.equal(wf['10'].inputs.text, r.finalPrompt);
    assert.equal(a.job.status, 'done', a.job.error); assert.equal(a.job.outputs.length, 1); assert.ok(!JSON.stringify(a.job).includes(KEY)); }
  { const a = await runOnce({ assetsDown: true, objectInfo: null }); assert.equal(a.err, null, String(a.err?.message)); const wf = a.calls.find((c) => c.method === 'POST' && c.url.endsWith('/api/v2/jobs'))!.body.workflow; assert.equal(wf['2'].inputs.lora_name, IMPORTED, 'checks down → goes on with the import name (Cloud validates)'); }
  delete process.env.COMFY_API_KEY; { const a = await runOnce({}); assert.equal(a.calls.length, 0); assert.equal(a.job.reasonCode, 'key_missing'); }
  ok('run: unmeasured → refused before any call; LoRA missing → refused after GETs only with the import link; imported → layout + first frame uploaded (fields first), 193-frame 720p graph submitted with the import, result saved; no key → key_missing');
  console.log('ALL OK ltx25-layout-cloud');
} finally { setCloudFetch(null); fs.rmSync(D, { recursive: true, force: true }); }
