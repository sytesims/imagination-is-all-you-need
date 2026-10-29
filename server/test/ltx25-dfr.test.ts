// LTX-2.5 DFR (2026-10-29): the "DFR" quality of the LTX-2.5 22B card on Create Video (shared/ltxDfr.ts, comfy/ltx25Dfr.ts).
// FAKE fetches only (no network, no key, no spend).
//  1 graph: workflows/ltx25-dfr-i2v-api.json = cloud copy; every node, link and value valid against object-info-ltx25-dfr.json (Comfy Cloud's object_info
//    for the template's classes + the generated-keyframe nodes from ComfyUI core); the template's files; no prompt enhancer
//  2 plan: image, prompt, size (16:9 / 9:16 / 1:1, stage 1 half), seconds 2–5 (1 + floor(24 s / 8) · 8 frames), seed on all three stages, the 48 fps toggle
//    (on: three stages at 48 fps; off: stage 3 pruned, 24 fps); local and Comfy Cloud plans; DFR asked on text / Loop → the usual 720p plan
//  3 routes + states: the Comfy Cloud place takes DFR; local needs the DFR files (weights gate lists them), Free never claimed while they're missing
//  4 quote: ≈ estimate, 48 fps vs 24 fps, DFR on text → 720p with a note; quote = the route's priced input
//  5 run (fake Comfy Cloud): the IC-LoRA check (GET only) refuses with the import steps, or passes the imported name to the graph
// Run: npx tsx test/ltx25-dfr.test.ts
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'ltxdfr-'));
const MD = path.join(D, 'models'); fs.mkdirSync(MD);
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0' });
for (const k of ['COMFY_API_KEY', 'COMFY_CLOUD_URL', 'OPENHIGGSFIELD_COMFY_CLOUD_URL', 'COMFY_DEPLOY_URL', 'COMFY_RUNNER_URL', 'COMFY_BASE_URL', 'OPENHIGGSFIELD_COMFY_MODELS_DIR', 'OPENHIGGSFIELD_ALLOW_UNMEASURED_CLOUD']) delete process.env[k];
globalThis.fetch = (async (u: unknown) => { throw new Error(`network blocked in this test: ${String(u).slice(0, 80)}`); }) as typeof fetch;
const ok = (m: string) => console.log('ok ' + m);
const X = await import('../src/shared/ltxDfr.ts');
const P = await import('../src/comfy/ltx25Dfr.ts');
const C = await import('../src/comfy/ltx25Cloud.ts');
const { checkCloudGraph } = await import('../src/comfy/cloudGraphCheck.ts');
const { CLOUD_WORKFLOWS, buildCloudPlan, isStandalone } = await import('../src/comfy/cloudWorkflows.ts');
const { buildPlan } = await import('../src/comfy/plans.ts');
const { routesFor, findRoute } = await import('../src/routing/routes.ts');
const { routeExactUsd, adjustNotesFor, localSetupGate } = await import('../src/routing/select.ts');
const { HOSTED_BY_ID, cloudGpuUsd } = await import('../src/shared/hostedPrices.ts');
const { getTool } = await import('../src/tools/registry.ts');
const { WORKFLOWS_DIR } = await import('../src/config.ts');
const { jobWorkflows, requirementsFor } = await import('../src/hardware/requirements.ts');
const { limitsFor } = await import('../src/tools/h3/videoCaps.ts');
const { ltxDfrFeatureOfJob } = await import('../src/shared/appWorkflows.ts');
const { modelNameForRun } = await import('../src/models.ts');
const OI = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'object-info-ltx25-dfr.json'), 'utf8'));
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(WORKFLOWS_DIR, f), 'utf8'));
const isLink = (v: any) => Array.isArray(v) && v.length === 2 && typeof v[0] === 'string';
const clean = (label: string, g: Record<string, any>) => { const c = checkCloudGraph(g, OI); assert.deepEqual(c.errors, [], `${label}: ${c.errors.join(' | ')}`); assert.deepEqual(c.warnings, [], `${label}: ${c.warnings.join(' | ')}`);
  for (const [id, n] of Object.entries<any>(g)) for (const v of Object.values<any>(n.inputs)) if (isLink(v)) assert.ok(g[v[0]], `${label}: ${id} links to missing ${v[0]}`); };
const IMG = path.join(D, 'start.png'); // a real 1376×768 PNG header (16:9-ish) so the plan reads the size
{ const b = Buffer.alloc(33); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0); b.writeUInt32BE(13, 8); b.write('IHDR', 12); b.writeUInt32BE(1376, 16); b.writeUInt32BE(768, 20); fs.writeFileSync(IMG, b); }
const tool = getTool('h3-video')!;

// 1 graph
{
  const g = load(P.LTX25_DFR_WORKFLOW); const c = load(P.LTX25_DFR_CLOUD_GRAPH);
  assert.deepEqual(c, g, 'local and Comfy Cloud graphs are the same file');
  const raw = structuredClone(g); for (const id of Object.values(P.DFR_NODES).flat()) assert.ok(raw[id], `template node ${id} kept`);
  clean('the vendored graph (template defaults)', raw);
  const classes = new Set(Object.values<any>(g).map((n) => n.class_type));
  for (const k of ['LTXVAddGeneratedKeyframes', 'LTXVSeparateGeneratedKeyframes', 'LTXVGeneratedKeyframesToGuides', 'LTXVAddLatentGuide', 'LTXVFreezeLatent', 'LoraLoaderModelOnly']) assert.ok(classes.has(k), k);
  assert.ok(!classes.has('TextGenerateLTX2Prompt') && !classes.has('ResolutionSelector') && !classes.has('PreviewAny'), 'no prompt enhancer, our size');
  const files = new Set(Object.values<any>(g).flatMap((n) => Object.values<any>(n.inputs).filter((v) => typeof v === 'string' && /\.safetensors$/.test(v))));
  for (const f of Object.values(X.LTX_DFR_FILES)) assert.ok(files.has(f), `the template's file ${f}`);
  assert.equal(files.size, Object.keys(X.LTX_DFR_FILES).length, 'no other model file (the enhancer Gemma is gone)');
  const sig = (id: string) => g[id].inputs.sigmas.split(',').length - 1; assert.deepEqual([sig('5953:5811'), sig('5953:5842'), sig('5953:5875')], [8, 3, 4], 'the template\'s 8 / 3 / 4 fixed steps');
  // the official file is bundled unchanged next to its licence, and every API node comes from it
  const tplPath = path.join(WORKFLOWS_DIR, 'templates', 'video_ltx2_5_dfr_i2v.json'); const crypto = await import('node:crypto');
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(tplPath)).digest('hex'), 'd26f80074b5b73ec24d7db13df22e51bc409c2368f7c5e0b535d20b815afcd86', 'template bundled unchanged (commit 0cf483d1)');
  assert.match(fs.readFileSync(path.join(WORKFLOWS_DIR, 'templates', 'LICENSE-workflow_templates'), 'utf8'), /^MIT License/);
  const tpl = JSON.parse(fs.readFileSync(tplPath, 'utf8')); const tplIds = new Set([...tpl.nodes.map((n: any) => String(n.id)), ...tpl.definitions.subgraphs[0].nodes.map((n: any) => `5953:${n.id}`)]);
  for (const id of Object.keys(g)) assert.ok(tplIds.has(id), `${id} is a template node`);
  for (const id of Object.keys(g)) assert.equal(g[id].class_type, [...tpl.nodes, ...tpl.definitions.subgraphs[0].nodes].find((n: any) => String(n.id) === id.replace(/^5953:/, ''))?.type, `${id} same class as the template`);
  ok('1 graph: the official DFR template vendored (73 nodes, valid against object_info, the template\'s 7 files, 8 / 3 / 4 steps)');
}

// 2 plan
{
  const base = { mode: 'i2v', types: ['i2v'], resolution: 'dfr', imagePath: IMG, imageSize: { width: 1376, height: 768 }, prompt: 'The man looks up and says hello', duration: 5, seed: 77, aspect: 'auto' };
  for (const [aspect, wh, s1] of [['16:9', [1280, 704], [640, 352]], ['9:16', [704, 1280], [352, 640]], ['1:1', [960, 960], [480, 480]]] as const)
    for (const seconds of X.LTX_DFR_SECONDS) for (const smooth of [true, false]) {
      const i = { ...base, aspect, duration: seconds, smooth48: smooth ? '1' : '0' };
      const { graph: g, expect } = P.patchLtx25Dfr(load(P.LTX25_DFR_WORKFLOW), i, 77);
      clean(`${aspect} ${seconds}s smooth=${smooth}`, g);
      assert.deepEqual(g['2004'].inputs.image, { __file: IMG }); assert.equal(g['5953:5771'].inputs.text, base.prompt);
      assert.deepEqual([g['5953:5904'].inputs['resize_type.width'], g['5953:5904'].inputs['resize_type.height']], wh);
      assert.deepEqual([expect.stage1.width, expect.stage1.height], s1, 'stage 1 = half (floor(x/32)·32/2)');
      assert.equal(g['5953:5918'].inputs.value, seconds); assert.equal(g['5953:5917'].inputs.value, 24); assert.equal(expect.frames, 1 + Math.floor(24 * seconds / 8) * 8);
      for (const s of P.DFR_NODES.seeds) if (g[s]) assert.equal(g[s].inputs.noise_seed, 77);
      assert.ok(!g[P.DFR_NODES.videoSwitch] && !g[P.DFR_NODES.fpsSwitch] && !g[P.DFR_NODES.decodeSwitch], 'switches resolved');
      if (smooth) { assert.ok(g['5953:5879'] && g['5953:5871'], 'stage 3 kept'); assert.deepEqual(g['5953:5895'].inputs.fps, ['5953:5886', 0]); assert.equal(expect.fps, 48); assert.equal(expect.outFrames, (expect.frames - 1) * 2 + 1); }
      else { assert.ok(!g['5953:5879'] && !g['5953:5871'] && !g['5953:5747'], 'stage 3 and the temporal upscaler pruned'); assert.deepEqual(g['5953:5895'].inputs.fps, ['5953:5917', 0]); assert.equal(expect.fps, 24); }
    }
  assert.equal(P.patchLtx25Dfr(load(P.LTX25_DFR_WORKFLOW), { ...base, aspect: 'auto', imageSize: { width: 720, height: 1280 } }, 1).expect.aspect, '9:16', 'Auto follows the start frame');
  assert.equal(P.patchLtx25Dfr(load(P.LTX25_DFR_WORKFLOW), { ...base }, 1).expect.smooth, true, 'smooth motion on by default');
  assert.throws(() => P.patchLtx25Dfr(load(P.LTX25_DFR_WORKFLOW), { ...base, imagePath: undefined }, 1), /start frame/);
  // the app's plans: local (comfy-ltx25-video) and Comfy Cloud (twin), and DFR asked where it can't run
  const job = (input: any, provider = 'comfy-ltx25-video') => ({ id: 'j1', toolId: 'h3-video', provider, input, status: 'queued' } as any);
  const lp = buildPlan(job(base)); assert.equal(lp.passes[0].workflow, P.LTX25_DFR_WORKFLOW); assert.equal(lp.passes[0].expect.dfr, true);
  const cp = buildCloudPlan(job(base, 'cloud-ltx25-video')); assert.equal(cp.passes[0].workflow, P.LTX25_DFR_CLOUD_GRAPH); clean('cloud plan', cp.passes[0].graph);
  const imp = buildCloudPlan(job({ ...base, dfrLora: C.LTX_DFR_LORA_IMPORTED }, 'cloud-ltx25-video')); assert.equal(imp.passes[0].graph['5953:5903'].inputs.lora_name, C.LTX_DFR_LORA_IMPORTED, 'an imported LoRA name reaches the graph');
  assert.equal(buildCloudPlan(job({ ...base, mode: 't2v', types: ['t2v'], imagePath: undefined, resolution: '720p' }, 'cloud-ltx25-video')).passes[0].workflow, 'cloud/ltx25-ti2v-api.json', 'text: the usual graph');
  assert.equal(buildPlan(job({ ...base, loop: true })).passes[0].workflow, 'ltx25-flf-api.json', 'Loop: the loop graph, never DFR');
  ok('2 plan: image, prompt, 3 shapes × 2–5 s × 48 fps on/off map onto the template inputs and stay valid; local + Comfy Cloud plans; text / Loop never run DFR');
}

// 3 routes + states
{
  const L = limitsFor('comfy-ltx25-video')!; assert.ok(L.resolutions.includes('dfr')); assert.equal(L.resolutionLabels?.dfr, 'DFR'); assert.equal(L.resolutionHints?.dfr, X.LTX_DFR_HINT);
  assert.equal(X.LTX_DFR_HINT, 'Best quality: renders at half size, then sharpens to full size, optional 48 fps.');
  assert.deepEqual(L.stageToggle, { field: 'smooth48', label: 'Smooth motion (48 fps)', hint: X.LTX_DFR_SMOOTH_HINT, resolution: 'dfr', modes: ['i2v'], default: true });
  const rs = routesFor('comfy-ltx25-video', tool); const cloud = rs.find((r) => r.routeId === 'comfy-cloud:cloud-ltx25-video')!; const local = rs.find((r) => r.kind === 'local')!;
  const i = { mode: 'i2v', types: ['i2v'], resolution: 'dfr', duration: 2, aspect: '16:9', imagePath: 'quote:image' };
  assert.equal(cloud.unavailableFor?.(i) ?? null, null, 'Comfy Cloud takes DFR'); assert.equal(local.unavailableFor?.(i) ?? null, null, 'local takes DFR (when its files are here)');
  assert.ok((cloud.caps as any).resolutions.includes('dfr'));
  const w = cloud as any; const entry = CLOUD_WORKFLOWS[w.routeId]; assert.ok(isStandalone(entry) && entry.graphs.includes(P.LTX25_DFR_CLOUD_GRAPH) && entry.preflight);
  for (const f of [X.LTX_DFR_FILES.textEncoder, X.LTX_DFR_FILES.temporalUpscaler]) assert.ok(C.LTX25_CLOUD_REQUIRES.models.some((m) => m.file === f));
  // local: DFR runs its own graph, its files are listed; none in the models folder → the weights gate (never "ready")
  assert.deepEqual(jobWorkflows(tool, 'comfy-ltx25-video', i), [P.LTX25_DFR_WORKFLOW]); assert.notDeepEqual(jobWorkflows(tool, 'comfy-ltx25-video', { ...i, resolution: '448p' }), [P.LTX25_DFR_WORKFLOW]);
  process.env.OPENHIGGSFIELD_COMFY_MODELS_DIR = MD; process.env.OPENHIGGSFIELD_ENFORCE_WEIGHTS = '1';
  const req = requirementsFor(tool, 'comfy-ltx25-video', i)!; const miss = new Set((req.missingFiles ?? []).map((f) => f.file));
  for (const f of Object.values(X.LTX_DFR_FILES)) assert.ok(miss.has(f), `local needs ${f}`);
  const gate = localSetupGate(tool, 'comfy-ltx25-video', i); assert.ok(gate && ['weights_missing', 'not_enough_disk'].includes(gate.code), 'local DFR without its files is a download, never ready');
  for (const f of Object.values(X.LTX_DFR_FILES)) assert.ok(gate!.missingFiles.some((x) => x.file === f), `the gate lists ${f}`);
  assert.equal(localSetupGate(tool, 'comfy-ltx25-video', { ...i, resolution: '448p' })?.missingFiles.some((x) => x.file === X.LTX_DFR_FILES.icLora) ?? false, false, 'Draft never asks for the DFR files');
  delete process.env.OPENHIGGSFIELD_COMFY_MODELS_DIR; delete process.env.OPENHIGGSFIELD_ENFORCE_WEIGHTS;
  // transparency
  assert.equal(modelNameForRun('h3-video', 'cloud-ltx25-video', i), 'LTX-2.5 22B · DFR'); assert.equal(modelNameForRun('h3-video', 'comfy-ltx25-video', { ...i, resolution: '720p' }), null);
  const f = ltxDfrFeatureOfJob({ toolId: 'h3-video', provider: 'cloud-ltx25-video', input: i })!; assert.equal(f.model, 'LTX-2.5 22B · DFR'); assert.equal(f.workflow.source, 'official');
  assert.match(f.workflow.url!, /video_ltx2_5_dfr_i2v\.json$/); assert.match(f.workflow.licence!, /MIT/);
  ok('3 routes + states: Comfy Cloud and local take DFR; local lists the 7 DFR files and is not ready without them; result names "LTX-2.5 22B · DFR" + the official template credit');
}

// 4 quote
{
  const rd = findRoute('comfy-cloud:cloud-ltx25-video')!; const tw = routesFor('comfy-ltx25-video', tool).find((r) => r.routeId === rd.routeId)!;
  const i = { mode: 'i2v', types: ['i2v'], resolution: 'dfr', duration: 2, imagePath: 'quote:image' };
  const h = HOSTED_BY_ID['cloud-ltx25-video']!; assert.equal(h.estimated, true); assert.equal(h.usdByQuality!.dfr, cloudGpuUsd(60)); assert.equal(h.usdByQuality!['dfr-24'], cloudGpuUsd(24));
  for (const r of [rd, tw]) {
    assert.equal(routeExactUsd(tool, r, i), Math.round(2 * cloudGpuUsd(60) * 1e8) / 1e8, '2 s DFR at 48 fps');
    assert.equal(routeExactUsd(tool, r, { ...i, smooth48: '0' }), Math.round(2 * cloudGpuUsd(24) * 1e8) / 1e8, '2 s DFR at 24 fps');
    assert.equal(routeExactUsd(tool, r, { ...i, mode: 't2v', types: ['t2v'] }), Math.round(2 * cloudGpuUsd(15) * 1e8) / 1e8, 'DFR on text: priced as 720p');
    assert.deepEqual(adjustNotesFor(tool, r, { ...i, mode: 't2v', types: ['t2v'] }), ['DFR makes image to video (a start frame): this clip runs at 720p instead.']);
    assert.deepEqual(adjustNotesFor(tool, r, { ...i, loop: '1' }), ['DFR doesn’t make loops: this loop runs at 720p instead.']);
    assert.deepEqual(adjustNotesFor(tool, r, i), []);
  }
  assert.ok(routeExactUsd(tool, rd, { ...i, duration: 5 })! > routeExactUsd(tool, rd, { ...i, resolution: '720p', duration: 5 })!, 'DFR costs more than 720p');
  ok(`4 quote: ≈ $${(2 * cloudGpuUsd(60)).toFixed(3)} for 2 s at 48 fps, $${(2 * cloudGpuUsd(24)).toFixed(3)} at 24 fps (estimate); text / Loop → 720p with a note`);
}

// 5 run preflight (fake Comfy Cloud, GET only)
{
  const calls: string[] = []; const resp = (body: any) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  const get = (lib: string[], assets: any[] = []) => async (p: string) => { calls.push(p); return p.startsWith('/api/assets') ? resp({ assets }) : resp({ LoraLoaderModelOnly: { input: { required: { lora_name: [lib] } } } }); };
  const i = { mode: 'i2v', types: ['i2v'], resolution: 'dfr', imagePath: IMG };
  assert.deepEqual(await C.ltx25CloudPreflight(get(['other.safetensors']), { ...i, resolution: '720p' }), {}, 'not DFR: no check'); assert.equal(calls.length, 0);
  await assert.rejects(C.ltx25CloudPreflight(get(['other.safetensors']), i), (e: any) => e.reasonCode === 'cloud_import_missing' && /Model Library → Import/.test(e.message) && /Nothing was sent or charged/.test(e.message));
  assert.deepEqual(await C.ltx25CloudPreflight(get([X.LTX_DFR_FILES.icLora]), i), { dfrLora: X.LTX_DFR_FILES.icLora }, 'in the shared library');
  assert.deepEqual(await C.ltx25CloudPreflight(get([], [{ loader_path: C.LTX_DFR_LORA_IMPORTED, name: C.LTX_DFR_LORA_IMPORTED }]), i), { dfrLora: C.LTX_DFR_LORA_IMPORTED }, 'the user\'s import');
  assert.ok(calls.every((p) => p.startsWith('/api/')), 'GET paths only');
  ok('5 preflight: DFR jobs only; a free GET-only check for the IC-LoRA refuses with the import steps when it is missing, else passes its name');
}
console.log('ltx25-dfr: all ok');
