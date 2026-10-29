// LTX-2.5 22B · Comfy Cloud (2026-10-27): the open LTX-2.5 22B on shared Comfy Cloud, twin of comfy-ltx25-video and comfy-ltx25-extend.
// FAKE fetches only (no network, no key, no spend).
//  1 graphs: the official template files (UNETLoader int8 ConvRot, Gemma 4 int8, video VAE bf16), same node ids as the local graphs; every plan variant
//    (text, start frame, loop, first + last, Morph; Draft / Sharper / 720p; 16:9 / 9:16 / 1:1; 2–5 s; Extend guide 1 / 9 / 17; continuation) passes
//    Comfy Cloud's object_info (checkCloudGraph, 0 errors) with frames on 8n + 1 and sizes on the 32 grid
//  2 continuation maths: context frames, latent / audio-latent mask timing, the edit point, 505-frame limit, short sources
//  3 parseInput writes the context clip (C frames, no sound) and its WAV (exactly C / 24 s); the local place refuses 720p and the continuation
//  4 routes + price: Comfy Cloud places on Generate Video / Transitions / Extend, priceUnmeasured estimate per rendered second
//  5 run (fake Comfy Cloud): price-first refusal, then context clip + WAV uploaded, the continuation graph submitted, the result joined
//    (N + added frames, sound as long as the picture)
// Run: npx tsx test/ltx25-cloud.test.ts
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'ltxcloud-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0' });
for (const k of ['OPENHIGGSFIELD_ALLOW_UNMEASURED_CLOUD', 'COMFY_API_KEY', 'COMFY_CLOUD_URL', 'OPENHIGGSFIELD_COMFY_CLOUD_URL', 'COMFY_DEPLOY_URL', 'COMFY_RUNNER_URL', 'COMFY_BASE_URL']) delete process.env[k];
globalThis.fetch = (async (u: unknown) => { throw new Error(`network blocked in this test: ${String(u).slice(0, 80)}`); }) as typeof fetch;
const ok = (m: string) => console.log('ok ' + m);
const L = await import('../src/comfy/ltx25Cloud.ts');
const X = await import('../src/comfy/ltx25Extend.ts');
const { CLOUD_WORKFLOWS, buildCloudPlan, isStandalone } = await import('../src/comfy/cloudWorkflows.ts');
const { checkCloudGraph } = await import('../src/comfy/cloudGraphCheck.ts');
const { routesFor, findRoute } = await import('../src/routing/routes.ts');
const { HOSTED_BY_ID } = await import('../src/shared/hostedPrices.ts');
const { runCloudWorkflow, setCloudFetch } = await import('../src/routing/cloudRun.ts');
const { CLOUD_RUNNER_ROUTES, routeRunnable } = await import('../src/routing/runnable.ts');
const { routeCredits } = await import('../src/routing/select.ts');
const { getTool } = await import('../src/tools/registry.ts');
const { getProvider, providerOpenWeights } = await import('../src/providers.ts');
const { WORKFLOWS_DIR } = await import('../src/config.ts');
const OI = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'object-info-comfy-cloud-2026-10-26.json'), 'utf8'));
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(WORKFLOWS_DIR, f), 'utf8'));
const clean = (label: string, g: Record<string, any>) => { const c = checkCloudGraph(g, OI); assert.deepEqual(c.errors, [], `${label}: ${c.errors.join(' | ')}`); };
const grid = (label: string, e: Record<string, any>) => { assert.equal((e.frames - 1) % 8, 0, `${label}: frames ${e.frames} on 8n + 1`);
  for (const v of [e.width, e.height, e.stage1.width, e.stage1.height]) assert.equal(v % 32, 0, `${label}: size ${e.width}×${e.height} / ${e.stage1.width}×${e.stage1.height} on the 32 grid`); };
const plan = (toolId: string, input: Record<string, any>, provider = L.LTX25_CLOUD_PROVIDER) => buildCloudPlan({ id: 'j1', toolId, provider, input });
const IMG = path.join(D, 'start.png'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=gray:size=1280x720', '-frames:v', '1', IMG]);
const END = path.join(D, 'end.png'); fs.copyFileSync(IMG, END);
const clip = (name: string, secs: number, size = '1280x720', fps = 24) => { const f = path.join(D, name);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `testsrc=size=${size}:rate=${fps}:duration=${secs}`, '-f', 'lavfi', '-i', `sine=frequency=440:duration=${secs}`, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', f]); return f; };
const probeFrames = (f: string) => Number(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', f]).toString().trim());
const probeDur = (f: string, s: 'a' | 'v') => Number(execFileSync('ffprobe', ['-v', 'error', '-select_streams', `${s}:0`, '-show_entries', 'stream=duration', '-of', 'csv=p=0', f]).toString().trim());
const json = (o: any, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
try {
  // ---- 1. graphs ----
  for (const [local, cloud] of Object.entries(L.LTX25_CLOUD_GRAPHS)) {
    const l = load(local), c = load(cloud); assert.deepEqual(Object.keys(c).sort(), Object.keys(l).sort(), `${cloud}: same node ids as ${local}`);
    const unet = Object.keys(c).find((id) => c[id].class_type === 'UNETLoader')!; assert.equal(l[unet].class_type, 'UnetLoaderGGUF', 'only the model loader changes class');
    assert.deepEqual(c[unet].inputs, { unet_name: L.LTX25_CLOUD_FILES.unet, weight_dtype: 'default' });
    const files = Object.values<any>(c).flatMap((n) => Object.entries<any>(n.inputs).filter(([k]) => /_name$/.test(k)).map(([, v]) => v));
    for (const f of Object.values(L.LTX25_CLOUD_FILES)) assert.ok(files.includes(f), `${cloud} loads ${f}`);
    assert.ok(!files.some((f) => /gguf|conv-bf16|gemma4-12b-with-proj-ltx-2\.5-bf16/i.test(f)), `${cloud}: no Mac files`);
    for (const id of Object.keys(c)) if (c[id].class_type !== 'UNETLoader' && !/Loader/.test(c[id].class_type)) assert.deepEqual(c[id], l[id], `${cloud} node ${id} unchanged`);
    clean(cloud, c);
  }
  { const g = load(L.LTX25_CONTINUE_GRAPH); clean('continue (as saved)', g);
    assert.deepEqual(g['965'].inputs, { audio: ['964', 0], audio_vae: ['386', 0] }); assert.deepEqual(g['966'].inputs, { latent: ['965', 0] });
    assert.deepEqual(g['967'].inputs, { video_latent: ['377', 0], audio_latent: ['966', 0] }); assert.deepEqual(g['344'].inputs.latent_image, ['967', 0]);
    for (const id of ['357', '349']) { assert.equal(g[id].inputs.strength, 1, `${id}: context frozen`); assert.deepEqual(g[id].inputs.image, ['351', 0]); }
    assert.deepEqual(g['351'].inputs.image, ['961', 0]); assert.deepEqual(g['340'].inputs.audio_latent, ['367', 1], 'stage 2 keeps the stage 1 sound with its mask');
    assert.ok(!g['350'] && !g['395'], 'no start-frame preprocess (the context is encoded clean)'); assert.equal(g['384'].inputs.unet_name, L.LTX25_CLOUD_FILES.unet); }
  for (const m of L.LTX25_CLOUD_REQUIRES.models) { const spec = OI[m.loader].input.required[m.field]; const opts = Array.isArray(spec[0]) ? spec[0] : spec[1].options; assert.ok(opts.includes(m.file), `${m.file} on Comfy Cloud`); }
  for (const n of L.LTX25_CLOUD_REQUIRES.nodes) assert.ok(OI[n], `${n} on Comfy Cloud`);
  ok('graphs: official template files (int8 ConvRot UNETLoader, Gemma 4 int8, video VAE bf16), same node ids as local, continuation graph wired (frozen picture + sound), all on Cloud');

  // ---- 1b. every Generate variant ----
  let n = 0;
  for (const res of ['448p', '576p', '720p']) for (const aspect of ['auto', '16:9', '9:16', '1:1']) for (const duration of [2, 3, 4, 5]) for (const v of [
    ['h3-video', { mode: 't2v', prompt: 'a fox runs' }], ['h3-video', { mode: 'i2v', imagePath: IMG, imageSize: { width: 1280, height: 720 } }],
    ['h3-video', { mode: 'i2v', loop: true, imagePath: IMG, imageSize: { width: 1280, height: 720 } }], ['h3-video', { mode: 'flf', imagePath: IMG, lastFramePath: END, imageSize: { width: 1280, height: 720 } }],
    ['app-transition', { mode: 'flf', imagePath: IMG, lastFramePath: END, imageSize: { width: 1280, height: 720 } }]] as const) {
    const p = plan(v[0], { prompt: 'x', ...v[1], resolution: res, aspect, duration, seed: 7 }); const ps = p.passes[0]; const label = `${v[0]} ${(v[1] as any).mode}${(v[1] as any).loop ? ' loop' : ''} ${res} ${aspect} ${duration}s`;
    assert.ok(ps.workflow.startsWith('cloud/ltx25-'), label); clean(label, ps.graph); grid(label, ps.expect); assert.equal(ps.expect.frames, duration * 24 + 1); assert.ok(!ps.graph['980'] && !ps.graph['981'], `${label}: Generate keeps the template's sound path`); n++;
    if (res === '720p' && aspect === '16:9') assert.deepEqual([ps.expect.width, ps.expect.height], [1280, 704]);
    if (res === '720p' && aspect === '9:16') assert.deepEqual([ps.expect.width, ps.expect.height], [704, 1280]);
    if (res === '720p' && aspect === '1:1') assert.deepEqual([ps.expect.width, ps.expect.height], [960, 960]);
  }
  assert.ok(plan('h3-video', { mode: 't2v', prompt: 'x' }).notes.some((t) => /Comfy Cloud workflow \(cloud-ltx25-video\)/.test(t)));
  assert.throws(() => plan('photo-fx', { mode: 'i2v', imagePath: IMG, types: ['xpldv'] }), /LoRA effects run on this computer only/);
  ok(`generate: ${n} variants (text / start frame / loop / first + last / Morph × Draft / Sharper / 720p × 4 aspects × 2–5 s) pass Cloud's object_info, 8n + 1 frames, 32-grid sizes, 720p = 1280×704; LoRA effects refused`);

  // ---- 2. extend: guide + continuation maths ----
  // Oct 27 (painter clip): Extend makes its sound once, on stage 1 (KJNodes audio normaliser on the stage 1 model), and stage 2 gets it frozen
  const soundOnStage1 = (label: string, g: Record<string, any>) => { assert.equal(g['980']?.class_type, 'LTX2AudioLatentNormalizingSampling', label); assert.deepEqual(g['388'].inputs.model, ['980', 0], `${label}: stage 1 model normalises the sound`);
    assert.deepEqual(g['980'].inputs.model, ['384', 0]); assert.equal(g['980'].inputs.audio_normalization_factors.split(',').length, (g['397'].inputs.sigmas.split(',').length - 1), `${label}: one factor per stage 1 step`);
    assert.deepEqual(g['391'].inputs.model, ['384', 0], `${label}: stage 2 model untouched`); assert.equal(g['981']?.class_type, 'LTXVFreezeLatent'); assert.deepEqual(g['981'].inputs.latent, ['367', 1]); assert.deepEqual(g['340'].inputs.audio_latent, ['981', 0], `${label}: stage 2 keeps stage 1's sound`); };
  const src = { width: 1280, height: 720, frames: 240 };
  for (const res of ['448p', '576p', '720p']) for (const G of [1, 9, 17]) for (const s of [2, 3, 4, 5]) {
    const p = X.extendPlan(src, { seconds: s, resolution: res, guideFrames: G }) as any; assert.ok(!p.error, p.error);
    const g = plan('h3-extend', { prompt: 'p', seed: 3, ltxExtend: { plan: p, guidePath: path.join(D, G === 1 ? 'g.png' : 'g.mp4') }, extendMethod: 'guide' }, L.LTX25_CLOUD_EXTEND_PROVIDER);
    const label = `guide ${res} G${G} +${s}`; clean(label, g.passes[0].graph); assert.ok(!g.passes[0].graph['980'], `${label}: no stage-1 sound normaliser (it broke the Cloud sampler)`); grid(label, g.passes[0].expect); assert.equal(g.passes[0].workflow, 'cloud/ltx25-ti2v-api.json'); assert.equal(g.post.kind, 'extend'); }
  { const p = X.extendPlan(src, { seconds: 5, resolution: '720p' }) as any; assert.deepEqual([p.gen.width, p.gen.height, p.gen.stage1.width, p.gen.stage1.height], [1280, 704, 640, 352]); assert.deepEqual([p.out.width, p.out.height], [1280, 720]); }
  assert.deepEqual([240, 121, 120, 100, 48, 25, 24, 9, 3].map(X.continueContextFrames), [121, 121, 113, 97, 41, 25, 17, 9, 1]);
  const cp = X.continuePlan(src, { seconds: 5, resolution: '720p' }) as any; assert.ok(!cp.error);
  assert.equal(cp.method, 'continue'); assert.equal(cp.guideFrames, 121); assert.equal(cp.gen.frames, 241); assert.equal(cp.crossfade, 16); assert.equal(cp.audioXfade, 0.02); assert.equal(cp.out.frames, 360); assert.equal(cp.out.seconds, 15);
  const mk = X.continueMask(cp);
  assert.deepEqual(mk, { contextFrames: 121, newFrames: 120, contextSeconds: 121 / 24, totalSeconds: 241 / 24, videoLatents: 31, frozenVideoLatents: 16, audioLatents: 251, frozenAudioLatents: 126, editAt: 10, pictureFade: 16, soundCut: 0.02 });
  for (const s of [2, 3, 4, 5]) for (const N of [25, 48, 120, 240, 1200]) { const q = X.continuePlan({ width: 1280, height: 720, frames: N }, { seconds: s, resolution: '720p' }) as any; assert.ok(!q.error, `${N} +${s}: ${q.error}`);
    assert.equal((q.guideFrames - 1) % 8, 0); assert.equal((q.gen.frames - 1) % 8, 0); assert.ok(q.gen.frames <= X.LTX25_CONTINUE_MAX_FRAMES); assert.ok(q.crossfade <= Math.min(16, q.guideFrames - 1));
    const g = plan('h3-extend', { prompt: 'p', seed: 3, ltxExtend: { plan: q, continuePlan: q, guidePath: 'x', contextPath: path.join(D, 'c.mp4'), contextAudioPath: path.join(D, 'c.wav') } }, L.LTX25_CLOUD_EXTEND_PROVIDER);
    const ps = g.passes[0]; const label = `continue N${N} +${s}`; assert.equal(ps.workflow, L.LTX25_CONTINUE_GRAPH); clean(label, ps.graph); assert.ok(!ps.graph['980'], `${label}: no stage-1 sound normaliser`); grid(label, ps.expect);
    assert.equal(ps.graph['356'].inputs.length, q.gen.frames); assert.equal(ps.graph['366'].inputs.frames_number, q.gen.frames); assert.equal(ps.graph['962'].inputs.batch_index, q.guideFrames - 1);
    assert.deepEqual(ps.graph['960'].inputs.file, { __file: path.join(D, 'c.mp4') }); assert.deepEqual(ps.graph['964'].inputs.audio, { __file: path.join(D, 'c.wav') }); assert.equal(g.post.kind === 'extend' && g.post.plan.method, 'continue'); }
  assert.match((X.continuePlan({ width: 1280, height: 720, frames: 20 }, { seconds: 2 }) as any).error, /at least 25 frames/);
  assert.equal((X.continuePlan(src, { seconds: 5, crossfade: 17 }) as any).field, 'crossfade'); assert.equal((X.continuePlan(src, { seconds: 7 }) as any).field, 'extendSeconds');
  ok('extend: guide 1 / 9 / 17 × 3 sizes × +2–5 s and continuation × 5 source lengths × +2–5 s pass Cloud; 10 s 720p +5 s = 121 kept + 120 new frames (16 of 31 latents frozen, 126 of 251 audio latents), edit at 10 s, 16-frame fade, sound cut');

  // ---- 3. parseInput + local refusals ----
  const tool = getTool('h3-extend')!; const SRC = clip('painter.mp4', 10); const rel = path.basename(SRC);
  const r: any = await tool.parseInput({ provider: X.LTX25_EXTEND, extendSeconds: '5', resolution: '720p', prompt: 'she keeps painting' }, { video: [rel] }); assert.ok(!r.error, r.error);
  const x = r.ltxExtend; assert.equal(x.plan.method, 'guide'); assert.equal(x.continuePlan.guideFrames, 121); assert.equal(x.continuePlan.gen.frames, 241); assert.equal(r.outputDuration, 15);
  assert.equal(probeFrames(x.contextPath), 121, 'context clip = the last 121 frames'); assert.ok(Math.abs(probeDur(x.contextAudioPath, 'a') - 121 / 24) < 0.002, 'context sound = exactly 121 / 24 s');
  const rs = routesFor(X.LTX25_EXTEND, tool); const local = rs.find((q) => q.kind === 'local')!; const cloud = rs.find((q) => q.routeId === L.LTX25_CLOUD_EXTEND_ROUTE)!; assert.ok(local && cloud);
  assert.match(String(local.unavailableFor?.(r)), /720p runs on Comfy Cloud/); assert.equal(cloud.unavailableFor?.(r) ?? null, null);
  assert.match(String(local.unavailableFor?.({ ...r, resolution: '448p', extendMethod: 'continue' })), /continuation runs on Comfy Cloud/); assert.equal(local.unavailableFor?.({ ...r, resolution: '448p' }) ?? null, null);
  { const rg: any = await tool.parseInput({ provider: X.LTX25_EXTEND, extendSeconds: '5', resolution: '720p', extendMethod: 'continue', crossfade: '12' }, { video: [rel] }); assert.equal(rg.ltxExtend.continuePlan.crossfade, 12); assert.equal(rg.ltxExtend.plan.crossfade, 4); }
  assert.equal(((await tool.parseInput({ provider: X.LTX25_EXTEND, extendMethod: 'sideways' }, { video: [rel] })) as any).issues[0].field, 'extendMethod');
  { const short = clip('short.mp4', 0.75); const rsh: any = await tool.parseInput({ provider: X.LTX25_EXTEND, extendSeconds: '2' }, { video: [path.basename(short)] }); assert.ok(!rsh.error); assert.ok(!rsh.ltxExtend.continuePlan && rsh.ltxExtend.continueError);
    assert.equal(L.cloudExtendMethod(rsh), 'guide', 'too short: Comfy Cloud falls back to the guide'); assert.match(String(cloud.unavailableFor?.({ ...rsh, extendMethod: 'continue' })), /at least 25 frames/); }
  assert.equal(L.cloudExtendMethod(r), 'continue'); assert.equal(L.cloudExtendMethod({ ...r, extendMethod: 'guide' }), 'guide');
  const vr = routesFor('comfy-ltx25-video', getTool('h3-video')!); const vl = vr.find((q) => q.kind === 'local')!; const vc = vr.find((q) => q.routeId === L.LTX25_CLOUD_ROUTE)!; assert.ok(vl && vc);
  assert.match(String(vl.unavailableFor?.({ mode: 't2v', resolution: '720p', duration: 5 })), /720p runs on Comfy Cloud/); assert.equal(vl.unavailableFor?.({ mode: 't2v', resolution: '576p', duration: 5 }) ?? null, null);
  assert.equal(vc.unavailableFor?.({ mode: 't2v', resolution: '720p', duration: 5 }) ?? null, null);
  ok('parse: context clip (121 frames) + WAV (exactly 121 / 24 s) written, method field; local refuses 720p and the continuation; short clip → guide on Cloud');

  // ---- 4. routes + price ----
  for (const [model, tool2, route] of [['comfy-ltx25-video', 'h3-video', L.LTX25_CLOUD_ROUTE], ['comfy-ltx25-video', 'app-transition', L.LTX25_CLOUD_ROUTE], [X.LTX25_EXTEND, 'h3-extend', L.LTX25_CLOUD_EXTEND_ROUTE]]) {
    const rr = routesFor(model, tool2).find((q) => q.routeId === route); assert.ok(rr, `${model} on ${tool2}`); assert.equal(rr!.kind, 'comfy-cloud'); assert.equal(rr!.label, 'Comfy Cloud'); assert.deepEqual((rr!.caps as any).resolutions, route.includes('cloud-ltx25-video') ? ['448p', '576p', '720p', 'dfr'] /* DFR (2026-10-29) */ : ['448p', '576p', '720p']); }
  assert.ok(!routesFor('comfy-ltx25-video', 'photo-fx').some((q) => q.routeId === L.LTX25_CLOUD_ROUTE), 'Photo FX stays local (LoRA files)');
  for (const id of [L.LTX25_CLOUD_PROVIDER, L.LTX25_CLOUD_EXTEND_PROVIDER]) { const pv = getProvider(id)!; assert.equal(pv.name, 'LTX-2.5 22B · Comfy Cloud'); assert.ok(providerOpenWeights(pv), `${id} open weights`);
    const row = HOSTED_BY_ID[id]; assert.ok(row && !row.priceUnmeasured && row.estimated, 'checked upper estimate (Oct 27): not held'); assert.ok(row.usdByQuality!['720p'] > row.usdByQuality!['576p'] && row.usdByQuality!['576p'] > row.usdByQuality!['448p']);
    const rt = findRoute(`comfy-cloud:${id}`)!; assert.ok(CLOUD_RUNNER_ROUTES.has(rt.routeId)); assert.ok(routeRunnable(rt)); const w = CLOUD_WORKFLOWS[rt.routeId]; assert.ok(isStandalone(w) && w.target === 'cloud'); }
  assert.equal(L.ltx25CloudRenderSeconds(r), 10.04); assert.equal(L.ltx25CloudRenderSeconds({ ...r, extendMethod: 'guide' }), 5.38); assert.equal(L.ltx25CloudRenderSeconds({ ...r, extendMethod: 'guide', guideFrames: 17 }), 5.71);
  assert.equal(L.ltx25CloudRenderSeconds({ mode: 'extend', extendSeconds: '5', resolution: '720p' }), 10.04, 'before the upload: the same figure (quote = charge)'); assert.equal(L.ltx25CloudRenderSeconds({ duration: 5 }), 5);
  const usd = (q: any, input: any) => routeCredits(q.tool, q.r, input);
  const cont = usd({ tool, r: cloud }, r)!, guide = usd({ tool, r: cloud }, { ...r, extendMethod: 'guide' })!; assert.ok(cont > guide && guide > 0, `continuation ${cont} > guide ${guide} credits`);
  const gen5 = usd({ tool: getTool('h3-video'), r: vc }, { mode: 't2v', resolution: '720p', duration: 5 })!; assert.ok(gen5 > 0);
  // Oct 27: the REAL quote endpoint (GET /api/tools/h3-extend/price + the routed-price hook) prices guide vs continuation exactly as the job is
  // charged (parseInput → routeInput → the Cloud route's priceInput). Live bug: a guide run quoted the continuation ($0.29) and charged $0.16.
  { const Fastify = (await import('fastify')).default; const app = Fastify(); (await import('../src/routesBatch1.ts')).registerBatch1(app); (await import('../src/routing/http.ts')).registerRouting(app); await app.ready();
    const { routeInput } = await import('../src/routing/select.ts'); const seen: Record<string, number> = {};
    for (const [method, gf] of [['guide', '9'], ['guide', '1'], ['guide', '17'], ['continue', ''], ['', '']] as const) {
      const fields: Record<string, string> = { provider: X.LTX25_EXTEND, extendSeconds: '5', resolution: '720p', prompt: 'p', ...(method ? { extendMethod: method } : {}), ...(gf ? { guideFrames: gf } : {}) };
      const job: any = await tool.parseInput(fields, { video: [rel] }); assert.ok(!job.error, job.error); const charge = routeCredits(tool, cloud, routeInput(tool, job))!;
      const qs = new URLSearchParams({ provider: X.LTX25_EXTEND, route: L.LTX25_CLOUD_EXTEND_ROUTE, extendSeconds: '5', resolution: '720p', video: '1', ...(method ? { extendMethod: method } : {}), ...(gf ? { guideFrames: gf } : {}) });
      const res = await app.inject({ url: `/api/tools/h3-extend/price?${qs}` }); assert.equal(res.statusCode, 200, res.body.slice(0, 300)); const b = res.json();
      assert.equal(b.route, L.LTX25_CLOUD_EXTEND_ROUTE, JSON.stringify(b).slice(0, 300)); const quoted = b.listCredits ?? b.credits /* keyless test server: sample output, credits 0, list price = the real charge */; assert.equal(quoted, charge, `${method || 'default'} ${gf}: quote ${quoted} = charge ${charge}`); seen[`${method || 'default'}${gf}`] = quoted; }
    assert.ok(seen.continue > seen.guide17 && seen.guide17 >= seen.guide9 && seen.guide9 >= seen.guide1, JSON.stringify(seen)); assert.equal(seen.default, seen.continue, 'no method = continuation (as the run picks it)');
    await app.close(); ok(`quote endpoint = charge on Comfy Cloud Extend +5 s 720p: ${JSON.stringify(seen)}`); }
  ok(`routes: Comfy Cloud place on Generate Video, Transitions and Extend (720p), not Photo FX; open weights; checked upper-estimate rows (not held); +5 s 720p: continuation ${cont} cr > guide ${guide} cr; 5 s 720p generate ${gen5} cr`);

  // ---- 5. run on a fake Comfy Cloud ----
  const rt = findRoute(L.LTX25_CLOUD_EXTEND_ROUTE)!; const genClip = clip('gen.mp4', 241 / 24, '640x352');
  const runOnce = async () => { const calls: { url: string; method: string; body?: any; form?: string[] }[] = []; const gen = fs.readFileSync(genClip);
    setCloudFetch((async (u: any, init: any = {}) => { const url = String(u); const c = { url, method: init.method ?? 'GET', body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined, form: init.body instanceof FormData ? [...init.body.keys()] : undefined }; calls.push(c);
      if (url.endsWith('/api/v2/assets')) return json({ id: `a${calls.length}` }); if (url.endsWith('/api/v2/jobs')) return json({ id: 'j1' });
      if (url.endsWith('/api/v2/jobs/j1')) return json({ status: 'succeeded', outputs: [{ node_id: '75', id: 'o1', name: 'cont.mp4', content_type: 'video/mp4', url: '/api/v2/assets/o1/content' }] });
      return new Response(gen, { status: 200 }); }) as typeof fetch, 1);
    const job: any = { id: `lc${Math.random().toString(36).slice(2, 7)}`, toolId: 'h3-extend', provider: X.LTX25_EXTEND, route: rt.routeId, input: structuredClone(r), status: 'queued', outputs: [] };
    let err: Error | null = null; try { await runCloudWorkflow(job, rt, { n: 1 } as any); } catch (e) { err = e as Error; } return { job, err, calls }; };
  process.env.COMFY_API_KEY = 'comfyui-fake-ltx-key-123';
  // the price is a checked upper estimate since Oct 27 (not held): it runs without OPENHIGGSFIELD_ALLOW_UNMEASURED_CLOUD
  delete process.env.OPENHIGGSFIELD_ALLOW_UNMEASURED_CLOUD;
  { const a = await runOnce(); assert.equal(a.err, null, String(a.err?.message)); const ups = a.calls.filter((c) => c.url.endsWith('/api/v2/assets'));
    assert.equal(ups.length, 2, 'context clip + WAV uploaded'); for (const u of ups) assert.deepEqual(u.form, ['content_type', 'file_path', 'file'], 'upload fields before the file');
    const sub = a.calls.find((c) => c.url.endsWith('/api/v2/jobs'))!; const wf = sub.body.workflow; clean('submitted', JSON.parse(JSON.stringify(wf).replace(/\{"__type":"core\/ASSET","info":\{[^}]*\}\}/g, '{"__file":"x"}')));
    assert.equal(wf['384'].class_type, 'UNETLoader'); assert.equal(wf['960'].inputs.file.__type, 'core/ASSET'); assert.equal(wf['964'].inputs.audio.__type, 'core/ASSET'); assert.equal(wf['356'].inputs.length, 241);
    assert.equal(a.job.status, 'done', a.job.error); const out = path.join(D, a.job.outputs[0].url.slice('/files/'.length));
    const T = probeFrames(genClip); assert.equal(probeFrames(out), 240 + T - 121, `joined: 240 source + ${T - 121} new frames (the model's 121 context copies dropped)`); assert.ok(Math.abs(probeDur(out, 'a') - (240 + T - 121) / 24) < 0.06, `sound ${probeDur(out, 'a')} s = picture`); }
  ok('run (price not held, no unmeasured flag): context clip + WAV uploaded (fields first), continuation graph submitted (UNETLoader, 241 frames), result joined (source + new frames, sound as long as the picture)');
} finally { setCloudFetch(null); fs.rmSync(D, { recursive: true, force: true }); }
