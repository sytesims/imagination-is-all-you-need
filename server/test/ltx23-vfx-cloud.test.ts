// Footage Effects · Comfy Cloud (2026-10-27): four official Comfy LTX-2.3 IC-LoRA templates as the Comfy Cloud place of Footage Effects.
// FAKE fetches only (no network, no key, no spend).
//  1 graphs: the four saved graphs pass Comfy Cloud's object_info (fixture cut from the 2026-10-26 copy): every class, input, link, LoRA and model file
//  2 plan: every Cloud effect × Draft / Sharper × 16:9 / 9:16 / 1:1 (Extend the frame: × shape × direction) passes Cloud, with the job's size, frames,
//    seed, prompt, LoRA, the clip's sound (or none); a local effect is refused
//  3 parseInput: the clip conformed (a silent track when it has none), Extend the frame's inner size + pads, Remove an object needs its line
//  4 routes + price: the Comfy Cloud place on Footage Effects (held until measured), each place refuses the other's effects, quote endpoint = charge
//  5 run (fake Comfy Cloud): unmeasured → nothing sent; allowed → the clip uploaded and a valid graph submitted; the mock sample shows the new shape
//  6 Workflows cards: one per new effect, credited, with our own drawing
// Run: npx tsx test/ltx23-vfx-cloud.test.ts
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
process.env.OPENHIGGSFIELD_ALLOW_UNMEASURED_CLOUD = '0'; // these checks cover the held state (cloud runs before a measured price are allowed by default since 2026-10-27)
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'vfxcloud-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0', OPENHIGGSFIELD_MOCK_DELAY_MS: '20' });
for (const k of ['COMFY_API_KEY', 'COMFY_CLOUD_URL', 'OPENHIGGSFIELD_COMFY_CLOUD_URL', 'COMFY_DEPLOY_URL', 'COMFY_RUNNER_URL', 'COMFY_BASE_URL']) delete process.env[k];
globalThis.fetch = (async (u: unknown) => { throw new Error(`network blocked in this test: ${String(u).slice(0, 80)}`); }) as typeof fetch;
const ok = (m: string) => console.log('ok ' + m);
const KEY = 'comfyui-fake-vfx-key-123';
const V = await import('../src/comfy/ltx23VfxCloud.ts');
const S = await import('../src/shared/footageFx.ts');
const { MAKE_REAL_SIZES } = await import('../src/shared/makeItReal.ts');
const { CLOUD_WORKFLOWS, buildCloudPlan, isStandalone } = await import('../src/comfy/cloudWorkflows.ts');
const { checkCloudGraph } = await import('../src/comfy/cloudGraphCheck.ts');
const { routesFor, findRoute } = await import('../src/routing/routes.ts');
const { HOSTED_BY_ID } = await import('../src/shared/hostedPrices.ts');
const { runCloudWorkflow, setCloudFetch } = await import('../src/routing/cloudRun.ts');
const { CLOUD_RUNNER_ROUTES, routeRunnable } = await import('../src/routing/runnable.ts');
const { routeCredits, routeInput } = await import('../src/routing/select.ts');
const { getTool } = await import('../src/tools/registry.ts');
const { getProvider, providerOpenWeights } = await import('../src/providers.ts');
const { modelNameForRun } = await import('../src/models.ts');
const { WORKFLOWS_DIR } = await import('../src/config.ts');
const { WF_ENTRIES, WF_SOURCES } = await import('../src/shared/workflowCatalog.ts');
const OI = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'object-info-ltx23-vfx-cloud-2026-10-26.json'), 'utf8'));
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(WORKFLOWS_DIR, f), 'utf8'));
const clean = (label: string, g: Record<string, any>) => { const c = checkCloudGraph(g, OI); assert.deepEqual(c.errors, [], `${label}: ${c.errors.join(' | ')}`); assert.deepEqual(c.warnings, [], `${label}: ${c.warnings.join(' | ')}`);
  const ids = new Set(Object.keys(g)); for (const [id, n] of Object.entries<any>(g)) for (const v of Object.values<any>(n.inputs)) if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'string') assert.ok(ids.has(v[0]), `${label}: ${id} links to removed ${v[0]}`); };
const probe = (f: string) => { const [w, h, n] = execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,nb_read_frames', '-of', 'csv=p=0', f]).toString().trim().split(','); return { width: +w, height: +h, frames: +n }; };
const hasAudio = (f: string) => execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', f]).toString().trim().length > 0;
const json = (o: any, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
const mkClip = (name: string, secs: number, size = '1280x720', audio = true) => { const f = path.join(D, name);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `testsrc=size=${size}:rate=24:duration=${secs}`, ...(audio ? ['-f', 'lavfi', '-i', `sine=frequency=440:duration=${secs}`, '-c:a', 'aac', '-shortest'] : []), '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', f]); return f; };
const CLOUD = ['restore', 'remove-object', 'remove-text', 'extend-frame'];
const plan = (input: Record<string, any>) => buildCloudPlan({ id: 'j1', toolId: 'footage-fx', provider: V.VFX_CLOUD_PROVIDER, input });
const jobInput = (effect: string, p: any, extra: Record<string, any> = {}) => { const e = S.footageEffect(effect)!; return { types: [effect], finalPrompt: S.footageFxPrompt(e, 'the red car'), negative: e.negative, seed: 42, duration: p.seconds, resolution: p.resolution,
  videoPath: '/x/clip.mp4', hasAudio: true, keepAudio: true, footageFx: { effect, plan: p, ...extra } }; };
try {
  // ---- 1. graphs ----
  assert.deepEqual(S.FOOTAGE_CLOUD_EFFECTS.map((e) => e.id), CLOUD);
  for (const [id, d] of Object.entries(V.VFX_CLOUD_GRAPHS)) { const g = load(d.graph); clean(`${id} as saved`, g); assert.equal(g[d.out].class_type, 'SaveVideo'); assert.equal(g[d.load].class_type, 'LoadVideo');
    const e = S.footageEffect(id)!; assert.ok(JSON.stringify(g).includes(e.cloud!.loraFile), `${id}: the template's LoRA`); }
  for (const n of V.VFX_CLOUD_REQUIRES.nodes) assert.ok(OI[n], `${n} on Comfy Cloud`);
  for (const m of V.VFX_CLOUD_REQUIRES.models) { const spec = OI[m.loader].input.required[m.field] ?? OI[m.loader].input.optional[m.field]; const opts = Array.isArray(spec[0]) ? spec[0] : spec[1].options; assert.ok(opts.includes(m.file), `${m.file} (${m.loader}.${m.field}) on Comfy Cloud`); }
  assert.ok(V.VFX_CLOUD_REQUIRES.models.length >= 12, 'every model file listed');
  { const o = load(V.VFX_CLOUD_GRAPHS['extend-frame'].graph); assert.ok(!Object.values<any>(o).some((n) => /^VHS_|LoadImage|LTXVImgToVideoConditionOnly/.test(n.class_type)), 'outpaint: no VHS nodes, no bypassed image step'); }
  ok(`graphs: 4 official templates pass Comfy Cloud's object_info; ${V.VFX_CLOUD_REQUIRES.nodes.length} classes and ${V.VFX_CLOUD_REQUIRES.models.length} model files (all four LoRAs) in Cloud's library`);

  // ---- 2. plans ----
  let n = 0;
  for (const effect of CLOUD) for (const res of ['448p', '576p']) for (const [w, h] of [[1280, 720], [720, 1280], [960, 960]]) {
    const p = S.footageFxPlan({ width: w, height: h, seconds: 6 }, { seconds: 3, resolution: res })!; const label = `${effect} ${res} ${w}×${h}`;
    const variants: Record<string, any>[] = effect === 'extend-frame' ? S.OUTPAINT_SHAPES.flatMap((shape) => S.OUTPAINT_GROW.map((grow) => { const [cw, ch] = MAKE_REAL_SIZES[p.size].dims[shape]; return { outpaint: S.outpaintPlan({ width: w, height: h }, { width: cw, height: ch }, shape, grow) }; })) : [{}];
    for (const x of variants) {
      const pl = plan(jobInput(effect, p, x)); const ps = pl.passes[0]; const g = ps.graph; clean(label, g); n++;
      assert.deepEqual(g[V.VFX_CLOUD_GRAPHS[effect].load].inputs.file, { __file: '/x/clip.mp4' }); assert.equal(ps.output, V.VFX_CLOUD_GRAPHS[effect].out); assert.equal(ps.expect.frames, p.frames);
      assert.ok(!Object.values<any>(g).some((q) => q.class_type === 'ImageStitch' || q.class_type === 'ImageConcanate'), `${label}: compare branch pruned`);
      const txt = JSON.stringify(g); assert.ok(txt.includes(S.footageEffect(effect)!.cloud!.loraFile));
      if (effect === 'restore' || effect === 'remove-text') { const P = V.VFX_CLOUD_GRAPHS[effect] as any; const q = (id: string) => g[`${P.p}${id}`];
        assert.deepEqual([q('5093').inputs.width, q('5093').inputs.height], [p.stage1.width, p.stage1.height]); assert.deepEqual([q('5068').inputs['resize_type.width'], q('5068').inputs['resize_type.height']], [p.width, p.height]);
        assert.equal(q('5058').inputs.noise_seed, 42); assert.equal(q('5087').inputs.strength_model, effect === 'restore' ? 1 : 1.2); assert.equal(q('5091').inputs.text, jobInput(effect, p).finalPrompt);
        assert.equal(p.stage1.width % 32, 0); assert.equal(p.stage1.height % 32, 0); }
      if (effect === 'remove-object') { assert.equal(g['54:9'].inputs.text, 'Remove the red car from the foreground.'); assert.equal(g['54:50'].inputs.value, 24); assert.equal(g['54:19'].inputs.seed, 42); assert.equal(g['54:15'].inputs.strength_model, 2);
        assert.deepEqual([g['54:41'].inputs['resize_type.width'], g['54:41'].inputs['resize_type.height']], [p.width, p.height]); }
      if (effect === 'extend-frame') { const o = x.outpaint; const pad = g['5151:5139'].inputs; assert.equal(o.inner.width + pad.left + pad.right, o.canvas.width, label); assert.equal(o.inner.height + pad.top + pad.bottom, o.canvas.height);
        assert.equal(o.canvas.width % 32, 0); assert.equal(o.canvas.height % 32, 0); assert.deepEqual([ps.expect.width, ps.expect.height], [o.canvas.width, o.canvas.height]);
        if (o.grow === 'left') assert.equal(pad.right, 0); if (o.grow === 'up') assert.equal(pad.bottom, 0); if (o.grow === 'right') assert.equal(pad.left, 0); if (o.grow === 'down') assert.equal(pad.top, 0); }
    }
  }
  { const p = S.footageFxPlan({ width: 1280, height: 720, seconds: 4 }, { seconds: 2 })!; const g = plan({ ...jobInput('restore', p), keepAudio: false }).passes[0].graph; assert.equal(g['5189:5062'].inputs.audio, undefined, 'sound off: none on the result');
    assert.deepEqual(plan(jobInput('restore', p)).passes[0].graph['5189:5062'].inputs.audio, ['5190', 1], 'the clip’s own sound kept');
    assert.throws(() => plan({ ...jobInput('restore', p), footageFx: { effect: 'vanish', plan: p }, types: ['vanish'] }), /Vanish runs on your computer/);
    assert.throws(() => plan({ ...jobInput('extend-frame', p) }), /pick a shape/); assert.throws(() => plan({ ...jobInput('restore', p), videoPath: undefined }), /not prepared/); }
  { const o = S.outpaintPlan({ width: 1280, height: 720 }, { width: 448, height: 768 }, '9:16', 'left'); assert.equal(o.grow, 'around', 'no room to grow left in a taller frame'); assert.equal(o.zoomOut, false);
    const z = S.outpaintPlan({ width: 1280, height: 720 }, { width: 768, height: 448 }, '16:9', 'right'); assert.ok(z.zoomOut && z.pad.left === 0 && z.pad.right > 0, 'same shape: zoom out, grow right'); }
  ok(`plan: ${n} variants (4 effects × Draft / Sharper × 3 clip shapes; Extend the frame × 3 shapes × 5 directions) pass Cloud with the job's sizes, seed, prompt, LoRA; sound kept or off; local effects refused`);

  // ---- 3. parseInput ----
  const tool = getTool('footage-fx')!; const route = V.VFX_CLOUD_ROUTE; const P = S.FOOTAGE_FX_PROVIDER;
  const clipA = mkClip('a.mp4', 3); const clipS = mkClip('silent.mp4', 3, '1280x720', false);
  const parse = (f: Record<string, string>, clip = clipA) => tool.parseInput({ provider: P, route, duration: '2', ...f }, { video: [path.basename(clip)] }) as Promise<any>;
  { const r = await parse({ types: '["restore"]', prompt: 'a 1920s street parade' }); assert.ok(!r.error, r.error); assert.deepEqual(probe(r.videoPath), { width: 768, height: 448, frames: 49 }); assert.ok(hasAudio(r.videoPath));
    assert.equal(r.finalPrompt, 'A modern, high-resolution video shot in vivid color, sharp detail, contemporary cinematography. A 1920s street parade.'); assert.equal(r.footageFx.cloud, true); assert.equal(r.compareUrl, r.videoUrl);
    assert.equal(r.footageFx.modelName, 'LTX-2.3 22B + Dearchive IC-LoRA'); assert.equal(modelNameForRun('footage-fx', P, { types: ['restore'] }), 'LTX-2.3 22B + Dearchive IC-LoRA'); }
  { const r = await parse({ types: '["remove-text"]' }, clipS); assert.ok(!r.error, r.error); assert.ok(hasAudio(r.videoPath), 'a silent track for a clip with none (the template encodes the sound)'); assert.equal(r.hasAudio, false);
    assert.equal(plan(r).passes[0].graph['5161:5062'].inputs.audio, undefined, 'no sound on the result of a silent clip'); }
  { const r = await parse({ types: '["remove-object"]' }); assert.equal(r.issues?.[0]?.field, 'prompt'); assert.match(r.error, /Say what to remove/);
    const r2 = await parse({ types: '["remove-object"]', prompt: 'The man in the hat.' }); assert.equal(r2.finalPrompt, 'Remove the man in the hat from the foreground.'); }
  { const r = await parse({ types: '["extend-frame"]', shape: '9:16', grow: 'up', resolution: '576p' }); assert.ok(!r.error, r.error); const o = r.footageFx.outpaint;
    assert.deepEqual([r.width, r.height, r.aspect], [576, 1024, '9:16']); assert.deepEqual(probe(r.videoPath), { width: o.inner.width, height: o.inner.height, frames: 49 }); assert.equal(o.pad.bottom, 0); assert.ok(o.pad.top > 0);
    assert.equal(r.compareUrl, undefined, 'a new shape has no same-size before'); const pl = plan(r); clean('parsed outpaint', pl.passes[0].graph);
    assert.equal((await parse({ types: '["extend-frame"]', shape: '4:3' })).issues[0].field, 'shape'); assert.equal((await parse({ types: '["extend-frame"]', grow: 'sideways' })).issues[0].field, 'grow');
    const w = await parse({ types: '["extend-frame"]', shape: '9:16', grow: 'left' }); assert.match(w.warnings.join(' '), /grows around/); }
  ok('parse: clip conformed (Draft 768×448, 49 frames, sound), silent track added for a silent clip, the template prompts, Remove an object needs its line, Extend the frame conformed to its inner size with pads; bad shape / direction refused');

  // ---- 4. routes + price ----
  const rs = routesFor(P, tool); const loc = rs.find((q) => q.kind === 'local')!; const cr = rs.find((q) => q.routeId === route)!; assert.ok(loc && cr, rs.map((q) => q.routeId).join());
  assert.equal(cr.kind, 'comfy-cloud'); assert.equal(cr.label, 'Comfy Cloud'); assert.equal(cr.heldUntilMeasured, true); assert.deepEqual((cr.caps as any).effects, CLOUD);
  for (const id of CLOUD) { assert.equal(cr.unavailableFor?.({ types: [id] }) ?? null, null); assert.match(String(loc.unavailableFor?.({ types: [id] })), /runs on Comfy Cloud/); }
  for (const id of ['vanish', 'day-to-night', 'rain', 'flood', 'alpha-matte']) { assert.match(String(cr.unavailableFor?.({ types: [id] })), /runs on your computer/); assert.equal(loc.unavailableFor?.({ types: [id] }) ?? null, null); }
  assert.ok(!routesFor('comfy-ltx25-video', 'footage-fx').some((q) => q.routeId === route));
  { const pv = getProvider(V.VFX_CLOUD_PROVIDER)!; assert.equal(pv.name, V.VFX_CLOUD_NAME); assert.ok(providerOpenWeights(pv), 'open weights');
    const row = HOSTED_BY_ID[V.VFX_CLOUD_PROVIDER]; assert.ok(row?.priceUnmeasured && row.estimated); assert.ok(row.usdByQuality!['576p'] > row.usdByQuality!['448p']);
    const rt = findRoute(route)!; assert.ok(CLOUD_RUNNER_ROUTES.has(rt.routeId)); assert.ok(routeRunnable(rt)); const w = CLOUD_WORKFLOWS[rt.routeId]; assert.ok(isStandalone(w) && w.target === 'cloud' && !w.preflight); }
  const Fastify = (await import('fastify')).default; const app = Fastify(); (await import('../src/routesBatch1.ts')).registerBatch1(app); (await import('../src/routing/http.ts')).registerRouting(app); await app.ready();
  const seen: Record<string, number> = {};
  for (const [effect, len, res] of [['restore', '5', '576p'], ['restore', '2', '448p'], ['remove-object', '3', '448p'], ['remove-text', '4', '576p'], ['extend-frame', '2', '448p']] as const) {
    const job: any = await tool.parseInput({ provider: P, route, types: JSON.stringify([effect]), duration: len, resolution: res, prompt: 'the red car', shape: '9:16' }, { video: [path.basename(mkClip(`q${len}.mp4`, 6))] }); assert.ok(!job.error, job.error);
    const charge = routeCredits(tool, cr, routeInput(tool, job))!; assert.ok(charge > 0);
    const qs = new URLSearchParams({ provider: P, route, seconds: len, duration: len, resolution: res, types: effect });
    const r = await app.inject({ url: `/api/tools/footage-fx/price?${qs}` }); assert.equal(r.statusCode, 200, r.body.slice(0, 300)); const b = r.json();
    assert.equal(b.route, route, JSON.stringify(b).slice(0, 300)); const quoted = b.listCredits ?? b.credits; assert.equal(quoted, charge, `${effect} ${len} s ${res}: quote ${quoted} = charge ${charge}`); seen[`${effect} ${len}s ${res}`] = quoted; }
  assert.ok(seen['restore 5s 576p'] > seen['restore 2s 448p'], JSON.stringify(seen));
  assert.deepEqual(tool.routeInput!({ types: 'restore' }), { types: ['restore'] }, 'a quote’s text types are read, not replaced by the first effect'); assert.deepEqual(tool.routeInput!({ types: '["extend-frame"]' }), { types: ['extend-frame'] });
  for (const t of CLOUD) { const b = (await app.inject({ url: `/api/tools/footage-fx/price?provider=${P}&types=${t}&seconds=2&resolution=448p` })).json(); assert.notEqual(b.route, `local:${P}`, `${t}: never quoted as a free local run`); }
  await app.close();
  const usd = (s: number, q: string) => (s * HOSTED_BY_ID[V.VFX_CLOUD_PROVIDER].usdByQuality![q]).toFixed(3);
  ok(`routes + price: Comfy Cloud place on Footage Effects (held until measured), each place refuses the other's effects; quote = charge ${JSON.stringify(seen)}; 2 s Draft $${usd(2, '448p')}, 5 s Sharper $${usd(5, '576p')}`);

  // ---- 5. run on a fake Comfy Cloud, and the mock sample ----
  const rt = findRoute(route)!; const r0: any = await parse({ types: '["restore"]' }); const outBuf = fs.readFileSync(mkClip('out.mp4', 2));
  const runOnce = async () => { const calls: { url: string; method: string; body?: any }[] = [];
    setCloudFetch((async (u: any, init: any = {}) => { const url = String(u); calls.push({ url, method: init.method ?? 'GET', body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined });
      if (url.endsWith('/api/v2/assets')) return json({ id: `a${calls.length}` }); if (url.endsWith('/api/v2/jobs')) return json({ id: 'j1' });
      if (url.endsWith('/api/v2/jobs/j1')) return json({ status: 'succeeded', outputs: [{ node_id: '5187', id: 'o1', name: 'fx.mp4', content_type: 'video/mp4', url: '/api/v2/assets/o1/content' }] });
      return new Response(outBuf, { status: 200 }); }) as typeof fetch, 1);
    const job: any = { id: `vx${Math.random().toString(36).slice(2, 7)}`, toolId: 'footage-fx', provider: P, route: rt.routeId, input: structuredClone(r0), status: 'queued', outputs: [] };
    let err: Error | null = null; try { await runCloudWorkflow(job, rt, { n: 1 } as any); } catch (e) { err = e as Error; } return { job, err, calls }; };
  process.env.COMFY_API_KEY = KEY;
  { const a = await runOnce(); assert.equal(a.calls.length, 0, 'unmeasured price: nothing sent'); assert.equal(a.job.reasonCode, 'price_unmeasured'); }
  process.env.OPENHIGGSFIELD_ALLOW_UNMEASURED_CLOUD = '1';
  { const a = await runOnce(); assert.equal(a.err, null, String(a.err?.message)); assert.equal(a.calls.filter((c) => c.url.endsWith('/api/v2/assets')).length, 1, 'the clip uploaded once');
    const wf = a.calls.find((c) => c.method === 'POST' && c.url.endsWith('/api/v2/jobs'))!.body.workflow; clean('submitted', JSON.parse(JSON.stringify(wf).replace(/\{"__type":"core\/ASSET","info":\{[^}]*\}\}/g, '{"__file":"x"}')));
    assert.equal(wf['5188'].inputs.file.__type, 'core/ASSET'); assert.equal(a.job.status, 'done', a.job.error); assert.ok(!JSON.stringify(a.job).includes(KEY)); }
  delete process.env.COMFY_API_KEY; process.env.OPENHIGGSFIELD_ALLOW_UNMEASURED_CLOUD = '0'; setCloudFetch(null);
  { const r: any = await parse({ types: '["extend-frame"]', shape: '9:16', grow: 'around' }); const job: any = { id: 'mk1', toolId: 'footage-fx', provider: V.VFX_CLOUD_PROVIDER, input: r, status: 'queued', outputs: [] };
    await tool.run(job); assert.equal(job.status, 'done', job.error); assert.deepEqual(probe(path.join(D, job.outputs[0].url.slice('/files/'.length))).width, 448, 'mock sample in the new shape'); }
  ok('run: unmeasured → refused before any call; allowed → the clip uploaded, a valid restore graph submitted, result saved; the mock sample shows the new shape');

  // ---- 6. Workflows cards ----
  for (const id of CLOUD) { const e = WF_ENTRIES.find((x) => x.source === `fx:${id}`)!; assert.ok(e, id); assert.ok(e.tags.includes('comfy cloud')); assert.notEqual(e.art, 'fx', `${id}: its own drawing`);
    assert.match(e.how![1][1], /official Comfy template, on Comfy Cloud/); assert.ok(WF_SOURCES.some((s) => s.key === `fx:${id}`)); }
  ok('workflows: a card per Comfy Cloud effect, credited to the official template, with its own drawing');
  console.log('ALL OK ltx23-vfx-cloud');
} finally { setCloudFetch(null); fs.rmSync(D, { recursive: true, force: true }); }
