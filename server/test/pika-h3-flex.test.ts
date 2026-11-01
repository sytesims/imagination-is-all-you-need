// Pika H3 Flex (2026-11-01): the official Comfy Pika H3 Flex templates (FL2VA adapter: text / start frame / start + end frame) on Comfy Cloud.
// FAKE fetches only (no network, no key, no spend).
//  1 template: the saved graphs match the official templates node by node (bundled in workflows/templates), only our listed changes differ;
//    the LoRA, strength, sampler, CFG, sigma list, fps and frame grid are the template's; no turbo / Lightning LoRA anywhere
//  2 free check: the Pika LoRA in the library / imported / missing / Cloud not answering; a missing LoRA refuses after GETs only, nothing sent or charged
//  3 plan: t2v / start frame / start + end × 768p / 480p × 5–15 s: prompt, seconds, seed, megapixels, frames wired to the right nodes, refusals
//  4 routes + price: its own model and Comfy Cloud route on Generate Video, an unmeasured "≈" estimate, quote = charge
//  5 run (fake Comfy Cloud): missing → refused, nothing uploaded or submitted; present → submitted with the template's settings
// Run: npx tsx test/pika-h3-flex.test.ts
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.OPENHIGGSFIELD_ALLOW_UNMEASURED_CLOUD = '1';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'pika-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0' });
for (const k of ['COMFY_API_KEY', 'COMFY_CLOUD_URL', 'OPENHIGGSFIELD_COMFY_CLOUD_URL', 'COMFY_DEPLOY_URL', 'COMFY_RUNNER_URL', 'COMFY_BASE_URL']) delete process.env[k];
globalThis.fetch = (async (u: unknown) => { throw new Error(`network blocked in this test: ${String(u).slice(0, 80)}`); }) as typeof fetch;
const ok = (m: string) => console.log('ok ' + m);
const KEY = 'comfyui-fake-pika-key-123';
const P = await import('../src/comfy/pikaH3Flex.ts');
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
const { MODELS, makerOf } = await import('../src/shared/modelIds.ts');
const OI = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'object-info-pika-h3-flex-cloud-2026-10-26.json'), 'utf8'));
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(WORKFLOWS_DIR, f), 'utf8'));
const LORA_ERR = `"lora_name" = ${JSON.stringify(P.PIKA_LORA)} is not in the list`;
/** Cloud's 2026-10-26 object_info predates the LoRA: that is the only gap allowed (checked per run). */
const clean = (label: string, g: Record<string, any>) => { const c = checkCloudGraph(g, OI); const errs = c.errors.filter((e) => !e.includes(LORA_ERR));
  assert.deepEqual(errs, [], `${label}: ${errs.join(' | ')}`); assert.deepEqual(c.warnings, [], `${label}: ${c.warnings.join(' | ')}`); };
const json = (o: any, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
const plan = (input: Record<string, any>) => buildCloudPlan({ id: 'j1', toolId: 'h3-video', provider: P.PIKA_PROVIDER, input });
/** The official template, flattened by our own converter (scripts/ui2api.py) with no changes: the reference for the node-by-node check. */
const official = (name: string) => { const { execFileSync } = require('node:child_process') as typeof import('node:child_process'); const out = path.join(D, `${name}.json`);
  execFileSync('python3', ['-I', path.join(WORKFLOWS_DIR, '..', 'scripts', 'ui2api.py'), path.join(WORKFLOWS_DIR, 'templates', `${name}.json`), path.join(import.meta.dirname, 'fixtures', 'object-info-pika-h3-flex-cloud-2026-10-26.json'), out]);
  return JSON.parse(fs.readFileSync(out, 'utf8')); };
import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);
/** Every setting the docs say to keep, asserted on one graph. */
function templateSettings(label: string, g: Record<string, any>) {
  const loras = Object.values<any>(g).filter((n) => n.class_type === 'LoraLoaderModelOnly');
  assert.equal(loras.length, 1, `${label}: one LoRA only (no turbo / Lightning stacked)`); assert.ok(!JSON.stringify(g).match(/turbo|lightning|lightx2v/i), `${label}: no acceleration LoRA anywhere`);
  assert.deepEqual([g['140:134'].inputs.lora_name, g['140:134'].inputs.strength_model, g['140:134'].inputs.model], [P.PIKA_LORA, 1, ['140:127', 0]], `${label}: the Pika LoRA at 1.0 on the H3 UNet`);
  assert.equal(g['140:127'].inputs.unet_name, 'minimax_h3_fl2va_pruned_int8_convrot.safetensors');
  assert.equal(g['140:123'].inputs.sampler_name, 'lcm'); assert.equal(g['140:143'].class_type, 'ManualSigmas'); assert.equal(g['140:143'].inputs.sigmas, P.PIKA_SIGMAS);
  assert.deepEqual(g['140:143'].inputs.sigmas.split(',').map(Number), [1, 0.972973, 0.923077, 0.8, 0.571429, 0.333333, 0], `${label}: Pika's 6-step list`);
  assert.equal(g['140:126'].class_type, 'BasicGuider', `${label}: CFG 1 (BasicGuider has no CFG)`); assert.deepEqual(g['140:126'].inputs.model, ['140:134', 0], 'the guider samples the LoRA model');
  assert.deepEqual(g['140:125'].inputs.sigmas, ['140:143', 0]); assert.ok(!Object.values<any>(g).some((n) => /BasicScheduler|CFGGuider|KSampler$/.test(n.class_type)), `${label}: no other scheduler / CFG guider`);
  assert.equal(g['140:130'].inputs.fps, 24); assert.equal(g['140:132'].inputs.expression, 'max(5, round(a * 24)) + (5 - (max(5, round(a * 24)) % 17)) % 17', 'H3 17k + 5 frame grid');
  assert.deepEqual(g['140:131'].inputs.length, ['140:132', 1]); assert.deepEqual(g['140:130'].inputs.audio, ['140:121', 0], 'sound on');
}
try {
  // ---- 1. the official templates, node by node ----
  const TPL = { t2v: official('video_pika_h3_flex_t2v'), fl2va: official('video_pika_h3_flex_fl2va') };
  for (const kind of ['t2v', 'fl2va'] as const) for (const [where, f] of [['cloud', P.PIKA_GRAPHS[kind]], ['local', P.PIKA_LOCAL_GRAPHS[kind]]] as const) {
    const g = load(f); const t = TPL[kind]; const label = `${where} ${kind}`; templateSettings(label, g);
    // what we changed, and nothing else
    const allowed: Record<string, string[]> = { '140:129': ['noise_seed'], '92': ['filename_prefix'], ...(where === 'cloud' ? { '140:119': ['vae_name'] } : {}), ...(kind === 'fl2va' ? { '147': ['image'], '148': ['image'], '149': ['image'] } : {}) };
    const extra = Object.keys(g).filter((k) => !(k in t)); assert.deepEqual(extra, kind === 'fl2va' ? ['154'] : [], `${label}: added nodes`); assert.deepEqual(Object.keys(t).filter((k) => !(k in g)), [], `${label}: no template node dropped`);
    for (const id of Object.keys(t)) { assert.equal(g[id].class_type, t[id].class_type, `${label} ${id}`);
      for (const k of new Set([...Object.keys(t[id].inputs), ...Object.keys(g[id].inputs)])) if (!(allowed[id] ?? []).includes(k)) assert.deepEqual(g[id].inputs[k], t[id].inputs[k], `${label} ${id}.${k} = template`); }
    assert.equal(g['140:119'].inputs.vae_name, where === 'cloud' ? 'minimax_h3_video_vae_fp16.safetensors' : 'minimax_h3_video_vae_int8_convrot.safetensors', `${label}: video VAE`);
    if (kind === 'fl2va') { assert.equal(g['154'].class_type, 'ImageScaleToTotalPixels'); assert.deepEqual(g['154'].inputs.image, ['148', 0]); assert.deepEqual(g['149'].inputs.image, ['154', 0], 'the size follows 768p / 480p');
      assert.deepEqual([g['140:131'].inputs.first_frame, g['140:131'].inputs.last_frame], [['148', 0], ['147', 0]], 'frames go unscaled, as in the template'); }
    if (where === 'cloud') { const c = checkCloudGraph(g, OI); assert.deepEqual(c.errors.map((e) => e.includes(LORA_ERR)), [true], `${label}: the only gap is the LoRA (${c.errors.join(' | ')})`); clean(label, g); }
  }
  for (const m of P.PIKA_REQUIRES.models) { if (m.file === P.PIKA_LORA) continue; const s = OI[m.loader].input.required[m.field]; const o = Array.isArray(s[0]) ? s[0] : s[1].options; assert.ok(o.includes(m.file), `${m.file} on Comfy Cloud`); }
  ok('templates: both graphs = the official Pika H3 Flex templates node by node (LoRA 1.0, lcm, ManualSigmas 6 steps, BasicGuider, 24 fps, 17k+5); changes: seed, save name, Cloud fp16 VAE, fl2va size node; no turbo LoRA');

  // ---- 2. the free check ----
  const lib = (o: { assets?: any[]; loras?: string[] | null; assetsDown?: boolean }) => async (url: string) => {
    if (url.includes('/api/assets?')) return o.assetsDown ? new Response('x', { status: 500 }) : json({ assets: o.assets ?? [], total: (o.assets ?? []).length, has_more: false });
    if (url.endsWith('/api/object_info')) return o.loras == null ? new Response('x', { status: 503 }) : json({ LoraLoaderModelOnly: { input: { required: { lora_name: [o.loras, {}] } } } });
    return new Response('{}', { status: 404 }); };
  assert.deepEqual(await P.checkPikaLora(lib({ loras: [P.PIKA_LORA] })), { state: 'present', loaderPath: P.PIKA_LORA, via: 'object_info' });
  assert.equal((await P.checkPikaLora(lib({ assets: [{ name: P.PIKA_IMPORTED, loader_path: P.PIKA_IMPORTED }] }))).loaderPath, P.PIKA_IMPORTED, 'the user\'s import');
  assert.equal((await P.checkPikaLora(lib({ loras: ['minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors'] }))).state, 'missing');
  assert.equal((await P.checkPikaLora(lib({ loras: null, assetsDown: true }))).state, 'unknown', 'Cloud not answering: the run goes on (Cloud validates at submit)');
  await assert.rejects(P.pikaPreflight(lib({ loras: ['other.safetensors'] })), (e: any) => e.reasonCode === 'cloud_import_missing' && /Pika H3 Flex needs .*pika_h3_flex_fl2va_v1_bf16/.test(e.message) && /Nothing was sent or charged$/.test(e.message)
    && e.message.includes('MiniMax-H3/resolve/main/loras/pika_h3_flex_fl2va_v1_bf16.safetensors'));
  assert.deepEqual(await P.pikaPreflight(lib({ loras: [P.PIKA_LORA] })), { pikaLora: P.PIKA_LORA });
  ok('free check: present (library / import), missing → refused with the import steps, unknown when Cloud doesn\'t answer');

  // ---- 3. plan ----
  let n = 0;
  for (const mode of ['t2v', 'i2v', 'flf'] as const) for (const resolution of ['768p', '480p']) for (const s of P.PIKA_SECONDS) {
    const pl = plan({ mode, prompt: 'a red fox runs through snow', finalPrompt: 'a red fox runs through snow', duration: s, resolution, aspect: '9:16', seed: 7,
      ...(mode !== 't2v' ? { imagePath: '/x/start.png' } : {}), ...(mode === 'flf' ? { lastFramePath: '/x/end.png' } : {}) });
    const g = pl.passes[0].graph; clean(`${mode} ${resolution} ${s}s`, g); templateSettings(`${mode} plan`, g); n++;
    const mp = resolution === '480p' ? 0.4 : 0.98; const pr = g['140:131'].inputs.prompt as string;
    assert.equal(pl.passes[0].workflow, P.PIKA_GRAPHS[mode === 't2v' ? 't2v' : 'fl2va']); assert.equal(g['140:133'].inputs.value, s); assert.equal(g['140:129'].inputs.noise_seed, 7);
    assert.equal(pl.passes[0].expect.frames, s * 24 + ((5 - ((s * 24) % 17)) % 17 + 17) % 17); assert.equal(pl.passes[0].expect.steps, 6);
    if (mode === 't2v') { assert.equal(pr, 'a red fox runs through snow'); assert.deepEqual([g['115'].inputs.aspect_ratio, g['115'].inputs.megapixels], ['9:16 (Portrait Widescreen)', mp]); assert.ok(!g['148'] && !g['147']); }
    else { assert.deepEqual(g['148'].inputs.image, { __file: '/x/start.png' }); assert.deepEqual(g['140:131'].inputs.first_frame, ['148', 0]); assert.equal(g['154'].inputs.megapixels, mp); assert.ok(pr.endsWith('a red fox runs through snow')); }
    if (mode === 'flf') { assert.deepEqual(g['147'].inputs.image, { __file: '/x/end.png' }); assert.deepEqual(g['140:131'].inputs.last_frame, ['147', 0]);
      assert.ok(pr.startsWith('How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark'), 'the template\'s frame line'); assert.match(pr, new RegExp(`Picture 2 \\(from Shot 1\\) aligns with the ${(pl.passes[0].expect.frames / 24).toFixed(2)}-second mark`)); }
    if (mode === 'i2v') { assert.ok(!g['147'] && !('last_frame' in g['140:131'].inputs), 'start frame only: no end frame node'); assert.match(pr, /<Picture 1> \(from \[Shot 1\]\) is fully referenced/); }
  }
  assert.match(plan({ mode: 'flf', prompt: 'x', duration: 5, imagePath: '/a.png', lastFramePath: '/b.png' }).passes[0].graph['140:131'].inputs.prompt, /5\.17-second mark/, 'the template\'s own 5 s example: 5.17');
  { const own = 'How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark; Picture 2 aligns with the 3.00-second mark.\n\nshot'; assert.equal(plan({ mode: 'flf', prompt: own, finalPrompt: own, duration: 5, imagePath: '/a.png', lastFramePath: '/b.png' }).passes[0].graph['140:131'].inputs.prompt, own, 'a prompt with its own line is kept'); }
  assert.equal(plan({ mode: 't2v', prompt: 'x', duration: 5, pikaLora: P.PIKA_IMPORTED }).passes[0].graph['140:134'].inputs.lora_name, P.PIKA_IMPORTED, 'the name the free check found');
  assert.throws(() => plan({ mode: 'r2v', prompt: 'x', duration: 5 }), /references aren’t offered yet/); assert.throws(() => plan({ mode: 't2v', prompt: 'x', duration: 4 }), /5–15 s/); assert.throws(() => plan({ mode: 't2v', prompt: 'x', duration: 16 }), /5–15 s/);
  assert.throws(() => plan({ mode: 'i2v', prompt: 'x', duration: 5 }), /needs a start frame/); assert.throws(() => plan({ mode: 'flf', prompt: 'x', duration: 5, imagePath: '/a.png' }), /needs an end frame/);
  ok(`plan: ${n} variants (text / start frame / start + end × 768p / 480p × 5–15 s) pass Cloud; frames on the right nodes; frame line; refusals`);

  // ---- 4. routes + price ----
  const tool = getTool('h3-video')!; const pm = (tool as any).app?.providerModes?.[P.PIKA_PROVIDER] ?? (tool as any).providerModes?.[P.PIKA_PROVIDER];
  assert.ok(tool.providers.includes(P.PIKA_PROVIDER) || routesFor('comfy-h3-pika', tool).some((r) => r.routeId === P.PIKA_ROUTE)); assert.deepEqual(pm ?? (tool as any).providerModes?.['comfy-h3-pika'], ['t2v', 'i2v', 'flf']);
  const rt = findRoute(P.PIKA_ROUTE)!; assert.equal(rt.routeId, P.PIKA_ROUTE); assert.equal(rt.kind, 'comfy-cloud');
  { const pv = getProvider(P.PIKA_PROVIDER)!; assert.equal(pv.name, P.PIKA_NAME); assert.ok(providerOpenWeights(pv), 'open weights');
    const mdl = MODELS['pika-h3-flex']; assert.equal(mdl.name, 'Pika H3 Flex'); assert.equal(mdl.license, 'minimax-community'); assert.equal(makerOf('pika-h3-flex')?.name, 'Pika', 'Pika credited'); assert.match(mdl.note!, /Apache-2\.0/);
    const row = HOSTED_BY_ID[P.PIKA_PROVIDER]; assert.ok(row?.priceUnmeasured && row.estimated, 'an estimate (unmeasured)'); assert.ok(row.usdByQuality!['768p'] > row.usdByQuality!['480p']);
    assert.ok(CLOUD_RUNNER_ROUTES.has(rt.routeId)); assert.ok(routeRunnable(rt)); const w = CLOUD_WORKFLOWS[rt.routeId]; assert.ok(isStandalone(w) && w.target === 'cloud' && w.preflight === P.pikaPreflight);
    assert.deepEqual(VIDEO_LIMITS[P.PIKA_PROVIDER].durations, [...P.PIKA_SECONDS]); }
  const Fastify = (await import('fastify')).default; const app = Fastify(); (await import('../src/routesBatch1.ts')).registerBatch1(app); (await import('../src/routing/http.ts')).registerRouting(app); await app.ready();
  const seen: Record<string, number> = {};
  for (const [mode, s, res] of [['t2v', 5, '768p'], ['t2v', 5, '480p'], ['t2v', 15, '768p'], ['flf', 5, '480p'], ['i2v', 10, '768p']] as const) {
    const qs = new URLSearchParams({ provider: P.PIKA_PROVIDER, route: P.PIKA_ROUTE, seconds: String(s), duration: String(s), resolution: res, types: JSON.stringify([mode]), mode });
    const r = await app.inject({ url: `/api/tools/h3-video/price?${qs}` }); assert.equal(r.statusCode, 200, r.body.slice(0, 300)); const b = r.json(); assert.equal(b.route, P.PIKA_ROUTE, JSON.stringify(b).slice(0, 300));
    assert.ok(b.estimated === true || b.priceUnmeasured === true || /≈|estimate/i.test(JSON.stringify(b)), `shown as an estimate: ${JSON.stringify(b).slice(0, 300)}`);
    const quoted = b.listCredits ?? b.credits; const charge = routeCredits(tool, rt, routeInput(tool, { mode, types: [mode], duration: s, resolution: res, prompt: 'x', ...(mode !== 't2v' ? { imagePath: '/x/a.png' } : {}), ...(mode === 'flf' ? { lastFramePath: '/x/b.png' } : {}) }))!;
    assert.equal(quoted, charge, `${mode} ${s} s ${res}: quote ${quoted} = charge ${charge}`); seen[`${mode} ${s}s ${res}`] = quoted; }
  assert.ok(seen['t2v 15s 768p'] > seen['t2v 5s 768p'] && seen['t2v 5s 768p'] > seen['t2v 5s 480p'], JSON.stringify(seen)); await app.close();
  const usd = (s: number, q: string) => (s * HOSTED_BY_ID[P.PIKA_PROVIDER].usdByQuality![q]).toFixed(3);
  ok(`routes + price: Comfy Cloud route on Generate Video (text / start / start + end), unmeasured estimate, quote = charge ${JSON.stringify(seen)}; 5 s 768p ≈ $${usd(5, '768p')}, 5 s 480p ≈ $${usd(5, '480p')}`);

  // ---- 5. run on a fake Comfy Cloud ----
  const runOnce = async (o: Parameters<typeof lib>[0], input: Record<string, any> = { mode: 't2v', prompt: 'a fox', finalPrompt: 'a fox', duration: 5, resolution: '768p', aspect: '16:9', seed: 3 }) => {
    const calls: { url: string; method: string; body?: any }[] = []; const h = lib(o);
    setCloudFetch((async (u: any, init: any = {}) => { const url = String(u); calls.push({ url, method: init.method ?? 'GET', body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined });
      if (url.includes('/api/assets?') || url.endsWith('/api/object_info')) return h(url);
      if (url.endsWith('/api/v2/assets')) return json({ id: `a${calls.length}` }); if (url.endsWith('/api/v2/jobs')) return json({ id: 'j1' });
      if (url.endsWith('/api/v2/jobs/j1')) return json({ status: 'succeeded', outputs: [{ node_id: '92', id: 'o1', name: 'pika.mp4', content_type: 'video/mp4', url: '/api/v2/assets/o1/content' }] });
      return new Response(Buffer.from('fake-mp4'), { status: 200 }); }) as typeof fetch, 1);
    const job: any = { id: `pk${Math.random().toString(36).slice(2, 7)}`, toolId: 'h3-video', provider: P.PIKA_PROVIDER, route: P.PIKA_ROUTE, input, status: 'queued', outputs: [] };
    let err: Error | null = null; try { await runCloudWorkflow(job, findRoute(P.PIKA_ROUTE)!, { n: 1 } as any); } catch (e) { err = e as Error; } return { job, err, calls }; };
  process.env.COMFY_API_KEY = KEY;
  { const a = await runOnce({ assets: [], loras: ['minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors'] }); assert.equal(a.job.reasonCode, 'cloud_import_missing'); assert.match(a.err!.message, /Pika H3 Flex LoRA/);
    assert.match(a.err!.message, /Nothing was sent or charged/); assert.ok(a.calls.every((c) => c.method === 'GET'), 'only free GETs: nothing uploaded or submitted'); assert.ok(!a.job.actualUsd && !a.job.costUsd, 'nothing charged'); }
  { const a = await runOnce({ assets: [], loras: [P.PIKA_LORA] }); assert.equal(a.err, null, String(a.err?.message)); const wf = a.calls.find((c) => c.method === 'POST' && c.url.endsWith('/api/v2/jobs'))!.body.workflow;
    clean('submitted', wf); templateSettings('submitted', wf); assert.equal(wf['140:133'].inputs.value, 5); assert.equal(a.job.status, 'done', a.job.error); assert.ok(!JSON.stringify(a.job).includes(KEY)); }
  { const img = path.join(D, 'first.png'); const img2 = path.join(D, 'last.png'); fs.copyFileSync(path.join(import.meta.dirname, 'fixtures', 'ref-512.png'), img); fs.copyFileSync(img, img2);
    const a = await runOnce({ assets: [{ name: P.PIKA_IMPORTED, loader_path: P.PIKA_IMPORTED }] }, { mode: 'flf', prompt: 'she spins', finalPrompt: 'she spins', duration: 5, resolution: '480p', seed: 1, imagePath: img, lastFramePath: img2 });
    assert.equal(a.err, null, String(a.err?.message)); const wf = a.calls.find((c) => c.method === 'POST' && c.url.endsWith('/api/v2/jobs'))!.body.workflow;
    assert.equal(wf['140:134'].inputs.lora_name, P.PIKA_IMPORTED, 'the user\'s import'); assert.equal(a.calls.filter((c) => c.method === 'POST' && c.url.endsWith('/api/v2/assets')).length, 2, 'both frames uploaded');
    assert.deepEqual([wf['140:131'].inputs.first_frame, wf['140:131'].inputs.last_frame], [['148', 0], ['147', 0]]); }
  ok('run: LoRA missing → refused after GETs only (nothing uploaded, submitted or charged); present or imported → submitted with the template\'s settings');
  console.log('ALL OK pika-h3-flex');
} finally { setCloudFetch(null); delete process.env.COMFY_API_KEY; fs.rmSync(D, { recursive: true, force: true }); }
