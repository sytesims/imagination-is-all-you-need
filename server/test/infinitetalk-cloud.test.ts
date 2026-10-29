// InfiniteTalk (Wan 2.1) · Comfy Cloud (2026-10-27): Lip Sync's long talking video (photo + speech up to 60 s). FAKE fetches only (no network, no key, no spend).
//  1 graph: the official template's files and settings (Wan 2.1 I2V 14B 480p fp8 KJ, lightx2v rank 64, single-speaker patch, wav2vec2, umt5 fp8, VAE bf16;
//    6 steps, cfg 1, euler / normal, 81 frames, motion 9, audio_scale 1, 25 fps); every class and file on Comfy Cloud's object_info (2026-10-26)
//  2 window maths: frames = ceil(seconds × 25), windows = 1 + ceil((frames − 81) / 72), every length 0.04–60 s covered with no spare window
//  3 plans for 3 / 10 / 30 / 60 s (and every shape) pass checkCloudGraph with 0 errors: windows chained (previous_frames = the window before), speech from
//    the previous window's start, motion frames dropped, the joined clip cut to the speech
//  4 parseInput: photo + speech required, WAV written, length measured; 60+ s refused (parse and route, before any upload)
//  5 price: per rendered window, priceUnmeasured estimate; the REAL quote endpoint (GET /api/tools/voice/price) = the charge for the same speech
//  6 run (fake Comfy Cloud): refused while unmeasured; then photo + WAV uploaded (fields first), graph submitted, the video saved
// Run: npx tsx test/infinitetalk-cloud.test.ts
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
process.env.OPENHIGGSFIELD_ALLOW_UNMEASURED_CLOUD = '0'; // these checks cover the held state (cloud runs before a measured price are allowed by default since 2026-10-27)
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'itcloud-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0' });
for (const k of ['COMFY_API_KEY', 'COMFY_CLOUD_URL', 'OPENHIGGSFIELD_COMFY_CLOUD_URL', 'COMFY_DEPLOY_URL', 'COMFY_RUNNER_URL', 'COMFY_BASE_URL']) delete process.env[k];
globalThis.fetch = (async (u: unknown) => { throw new Error(`network blocked in this test: ${String(u).slice(0, 80)}`); }) as typeof fetch;
const ok = (m: string) => console.log('ok ' + m);
const IT = await import('../src/comfy/infiniteTalkCloud.ts');
const { CLOUD_WORKFLOWS, buildCloudPlan, isStandalone } = await import('../src/comfy/cloudWorkflows.ts');
const { checkCloudGraph } = await import('../src/comfy/cloudGraphCheck.ts');
const { routesFor, findRoute } = await import('../src/routing/routes.ts');
const { HOSTED_BY_ID } = await import('../src/shared/hostedPrices.ts');
const { runCloudWorkflow, setCloudFetch } = await import('../src/routing/cloudRun.ts');
const { CLOUD_RUNNER_ROUTES, routeRunnable } = await import('../src/routing/runnable.ts');
const { routeCredits, routeInput } = await import('../src/routing/select.ts');
const { getTool } = await import('../src/tools/registry.ts');
const { getProvider, providerOpenWeights } = await import('../src/providers.ts');
const { WORKFLOWS_DIR } = await import('../src/config.ts');
const OI = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'object-info-infinitetalk-cloud-2026-10-26.json'), 'utf8'));
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(WORKFLOWS_DIR, f), 'utf8'));
const clean = (label: string, g: Record<string, any>) => { const c = checkCloudGraph(g, OI); assert.deepEqual(c.errors, [], `${label}: ${c.errors.join(' | ')}`); };
const ff = (...a: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a]);
const photo = (name: string, size: string) => { ff('-f', 'lavfi', '-i', `color=c=gray:size=${size}`, '-frames:v', '1', path.join(D, name)); return name; };
const speech = (name: string, secs: number) => { ff('-f', 'lavfi', '-i', `sine=frequency=220:duration=${secs}`, '-ac', '2', path.join(D, name)); return name; };
const json = (o: any, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
const IMG = path.join(D, photo('tall.png', '720x1280'));
const job = (secs: number, extra: Record<string, any> = {}) => ({ prompt: 'a teacher', finalPrompt: IT.itPrompt('a teacher'), imagePath: IMG, imageSize: { width: 720, height: 1280 }, itSpeechPath: path.join(D, 's.wav'), speechSeconds: secs, aspect: 'auto', seed: 5, ...extra });
const plan = (input: Record<string, any>) => buildCloudPlan({ id: 'j1', toolId: 'voice', provider: IT.IT_PROVIDER, input });
try {
  // ---- 1. graph ----
  const g0 = load(IT.IT_GRAPH); clean('as saved', g0);
  assert.deepEqual(g0['3'].inputs, { unet_name: IT.IT_FILES.unet, weight_dtype: 'default' }); assert.equal(g0['4'].inputs.lora_name, IT.IT_FILES.lora); assert.equal(g0['4'].inputs.strength_model, 1);
  assert.equal(g0['5'].inputs.name, IT.IT_FILES.patch); assert.equal(g0['6'].inputs.clip_name, IT.IT_FILES.textEncoder); assert.equal(g0['6'].inputs.type, 'wan'); assert.equal(g0['7'].inputs.vae_name, IT.IT_FILES.vae); assert.equal(g0['8'].inputs.audio_encoder_name, IT.IT_FILES.audioEncoder);
  for (const w of ['1', '2']) { const t = g0[`${w}02`].inputs; assert.equal(t.mode, 'single_speaker'); assert.equal(t.length, 81); assert.equal(t.motion_frame_count, 9); assert.equal(t.audio_scale, 1);
    assert.deepEqual([g0[`${w}03`].inputs.cfg, g0[`${w}04`].inputs.steps, g0[`${w}04`].inputs.scheduler, g0[`${w}04`].inputs.denoise], [1, 6, 'normal', 1]); }
  assert.equal(g0['11'].inputs.sampler_name, 'euler'); assert.deepEqual(g0['10'].inputs.conditioning, ['9', 0]); assert.equal(g0['92'].inputs.fps, 25); assert.deepEqual(g0['92'].inputs.audio, ['2', 0], 'soundtrack = the speech');
  assert.ok(!Object.values<any>(g0).some((n) => /Painter|Primitive|MarkdownNote/.test(n.class_type)), 'core nodes only, no UI-only nodes');
  for (const m of IT.IT_REQUIRES.models) { const spec = OI[m.loader].input.required[m.field]; const opts = Array.isArray(spec[0]) ? spec[0] : spec[1].options; assert.ok(opts.includes(m.file), `${m.file} on Comfy Cloud`); }
  for (const n of IT.IT_REQUIRES.nodes) assert.ok(OI[n], `${n} on Comfy Cloud`);
  ok('graph: the template\'s files and settings (6 steps, cfg 1, euler / normal, 81 frames, motion 9, audio_scale 1, 25 fps), core nodes only, all on Cloud');

  // ---- 2. window maths ----
  assert.deepEqual([3, 3.24, 3.25, 6, 10, 30, 60].map((s) => [IT.itWindows(s).frames, IT.itWindows(s).windows]), [[75, 1], [81, 1], [82, 2], [150, 2], [250, 4], [750, 11], [1500, 21]]);
  for (let F = 1; F <= 1500; F++) { const w = IT.itWindows(F / 25); assert.equal(w.frames, F, `${F}`); const cover = 81 + 72 * (w.windows - 1); assert.ok(cover >= F && (w.windows === 1 || cover - 72 < F), `${F} frames: ${w.windows} windows, no spare`);
    assert.equal(w.renderedFrames, 81 * w.windows); }
  assert.equal(IT.itWindows(10).renderSeconds, 12.96); assert.equal(IT.itBillSeconds({ speechSeconds: 10 }), 12.96); assert.equal(IT.itBillSeconds({ speechSeconds: 60 }), 68.04);
  ok('windows: frames = ceil(s × 25), 1 + ceil((frames − 81) / 72) windows of 81 frames, every length to 60 s covered with no spare window; 10 s = 4 windows = 12.96 rendered s');

  // ---- 3. plans ----
  for (const s of [3, 10, 30, 60]) for (const aspect of ['auto', '16:9', '9:16', '1:1']) {
    const p = plan(job(s, { aspect })); const ps = p.passes[0]; const g = ps.graph; const w = IT.itWindows(s); const label = `${s} s ${aspect}`;
    assert.equal(ps.workflow, IT.IT_GRAPH); clean(label, g); assert.equal(ps.output, '93'); assert.equal(ps.expect.windows, w.windows);
    const tw = Object.keys(g).filter((id) => g[id].class_type === 'WanInfiniteTalkToVideo').sort((a, b) => +a - +b); assert.equal(tw.length, w.windows, label);
    const sz = aspect === 'auto' ? IT.IT_SIZES['9:16'] : IT.IT_SIZES[aspect as '1:1'];
    for (const [k, id] of tw.entries()) { const t = g[id].inputs; assert.deepEqual([t.width, t.height, t.length, t.motion_frame_count, t.audio_scale, t.mode], [sz.width, sz.height, 81, 9, 1, 'single_speaker'], `${label} window ${k + 1}`);
      assert.equal(g[String((k + 1) * 100 + 5)].inputs.noise_seed, 5 + k);
      if (k === 0) { assert.ok(!t.previous_frames); assert.deepEqual(g['101'].inputs.audio, ['2', 0], 'window 1 hears the whole speech (the template)'); continue; }
      const b = (k + 1) * 100; assert.deepEqual(t.previous_frames, [String(b - 100 + 7), 0], `${label}: window ${k + 1} continues from window ${k}`);
      assert.deepEqual(g[String(b + 1)].inputs.audio, [String(b), 0]); const tr = g[String(b)].inputs; assert.equal(tr.start_index, Math.round((k - 1) * 2.88 * 100) / 100, `${label}: window ${k + 1} speech from window ${k}'s start`);
      assert.ok(tr.start_index < s && tr.start_index + tr.duration >= s, 'the slice runs to the end of the speech');
      assert.deepEqual([g[String(b + 8)].inputs.batch_index, g[String(b + 8)].inputs.length], [9, 72], 'motion frames dropped'); }
    assert.equal(Object.keys(g['90'].inputs).length, w.windows); assert.equal(g['91'].inputs.length, w.frames); assert.ok(81 + 72 * (w.windows - 1) >= w.frames);
    assert.deepEqual(g['1'].inputs.image, { __file: IMG }); assert.deepEqual(g['2'].inputs.audio, { __file: path.join(D, 's.wav') }); assert.match(g['9'].inputs.text, /^a teacher\. The person talks/); }
  assert.deepEqual([[1280, 720], [720, 1280], [1000, 1000], [1100, 1000]].map(([width, height]) => IT.itSize('auto', { width, height }).aspect), ['16:9', '9:16', '1:1', '1:1']);
  assert.throws(() => plan(job(61)), /up to 60 s; yours is 61 s/); assert.throws(() => plan(job(10, { imagePath: undefined })), /needs a photo/);
  ok('plans: 3 / 10 / 30 / 60 s × 4 shapes pass Cloud\'s object_info (0 errors); 1 / 4 / 11 / 21 windows chained, speech offsets 2.88 s apart, motion frames dropped, clip cut to the speech; 61 s refused');

  // ---- 4. parseInput + refusals ----
  const tool = getTool('voice')!; const IMGF = photo('face.jpg', '1280x720'); const S10 = speech('ten.mp3', 10); const S61 = speech('long.wav', 61);
  const base = { provider: IT.IT_PROVIDER, types: '["lipsync"]', prompt: 'a teacher "hello"' };
  const r: any = await tool.parseInput(base, { image: [IMGF], speech: [S10] }); assert.ok(!r.error, r.error);
  assert.ok(Math.abs(r.speechSeconds - 10) < 0.06, String(r.speechSeconds)); assert.equal(r.itWindows, 4); assert.ok(fs.existsSync(r.itSpeechPath) && r.itSpeechPath.endsWith('.wav')); assert.equal(r.aspect, 'auto'); assert.equal(r.width, 832, 'wide photo → 832×480');
  assert.ok(!/"/.test(r.finalPrompt), 'quotes stripped'); assert.equal(r.outKind, 'av-video');
  assert.equal(((await tool.parseInput(base, { speech: [S10] })) as any).issues[0].field, 'image'); assert.equal(((await tool.parseInput(base, { image: [IMGF] })) as any).issues[0].field, 'speech');
  const long: any = await tool.parseInput(base, { image: [IMGF], speech: [S61] }); assert.equal(long.issues[0].code, 'too_long'); assert.match(long.error, /up to 60 s; yours is 61 s/);
  assert.equal(((await tool.parseInput({ ...base, aspect: '4:3' }, { image: [IMGF], speech: [S10] })) as any).issues[0].field, 'aspect');
  const rt = routesFor(IT.IT_PROVIDER, tool).find((q) => q.routeId === IT.IT_ROUTE)!; assert.ok(rt); assert.equal(rt.kind, 'comfy-cloud'); assert.equal(rt.label, 'Comfy Cloud');
  assert.match(String(rt.unavailableFor?.({ speechSeconds: 75 })), /up to 60 s/); assert.equal(rt.unavailableFor?.({ speechSeconds: 60 }) ?? null, null);
  assert.ok(tool.providers.includes(IT.IT_PROVIDER)); assert.deepEqual((tool as any).providerModes?.[IT.IT_PROVIDER] ?? ['lipsync'], ['lipsync']);
  ok('parse: photo + speech required, MP3 → WAV, 10 s measured (4 windows), quotes stripped, wide photo → 832×480; 61 s refused in parse and on the route (before any upload); bad shape refused');

  // ---- 5. routes + price ----
  const pv = getProvider(IT.IT_PROVIDER)!; assert.equal(pv.name, 'InfiniteTalk (Wan 2.1) · Comfy Cloud'); assert.ok(providerOpenWeights(pv), 'open weights');
  const row = HOSTED_BY_ID[IT.IT_PROVIDER]; assert.ok(row?.priceUnmeasured && row.estimated && row.unit === 'second');
  assert.ok(CLOUD_RUNNER_ROUTES.has(IT.IT_ROUTE)); assert.ok(routeRunnable(findRoute(IT.IT_ROUTE)!)); const w = CLOUD_WORKFLOWS[IT.IT_ROUTE]; assert.ok(isStandalone(w) && w.target === 'cloud');
  const c3 = routeCredits(tool, rt, { speechSeconds: 3 })!, c10 = routeCredits(tool, rt, { speechSeconds: 10 })!, c60 = routeCredits(tool, rt, { speechSeconds: 60 })!; assert.ok(c3 > 0 && c10 > c3 && c60 > c10, `${c3} < ${c10} < ${c60}`);
  { const Fastify = (await import('fastify')).default; const app = Fastify(); (await import('../src/routesBatch1.ts')).registerBatch1(app); (await import('../src/routing/http.ts')).registerRouting(app); await app.ready();
    const charge = routeCredits(tool, rt, routeInput(tool, r))!;
    const qs = new URLSearchParams({ provider: IT.IT_PROVIDER, route: IT.IT_ROUTE, types: '["lipsync"]', mode: 'lipsync', speechSeconds: String(r.speechSeconds), image: '1', speech: '1' });
    const res = await app.inject({ url: `/api/tools/voice/price?${qs}` }); assert.equal(res.statusCode, 200, res.body.slice(0, 300)); const b = res.json(); assert.equal(b.route, IT.IT_ROUTE, JSON.stringify(b).slice(0, 300));
    const quoted = b.listCredits ?? b.credits; assert.equal(quoted, charge, `quote ${quoted} = charge ${charge}`);
    const res61 = await app.inject({ url: `/api/tools/voice/price?${new URLSearchParams({ provider: IT.IT_PROVIDER, route: IT.IT_ROUTE, types: '["lipsync"]', mode: 'lipsync', speechSeconds: '61' })}` });
    assert.match(res61.body, /up to 60 s/, 'the quote says 61 s is refused');
    const auto61 = await app.inject({ url: `/api/tools/voice/price?${new URLSearchParams({ provider: IT.IT_PROVIDER, types: '["lipsync"]', speechSeconds: '61', image: '1', speech: '1' })}` });
    assert.match(String(auto61.json().noProvider?.error ?? auto61.json().error), /up to 60 s; yours is 61 s/, 'no key yet: the refusal, not "add a key"'); await app.close();
    ok(`price: per rendered window (3 s ${c3} cr, 10 s ${c10} cr, 60 s ${c60} cr), unmeasured estimate; quote endpoint = charge (${quoted} cr for ${r.speechSeconds} s); 61 s refused at quote`); }

  // ---- 6. run on a fake Comfy Cloud ----
  const out = path.join(D, 'gen.mp4'); ff('-f', 'lavfi', '-i', 'testsrc=size=832x480:rate=25:duration=10', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=10', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', out);
  const runOnce = async () => { const calls: { url: string; method: string; body?: any; form?: string[] }[] = []; const gen = fs.readFileSync(out);
    setCloudFetch((async (u: any, init: any = {}) => { const url = String(u); calls.push({ url, method: init.method ?? 'GET', body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined, form: init.body instanceof FormData ? [...init.body.keys()] : undefined });
      if (url.endsWith('/api/v2/assets')) return json({ id: `a${calls.length}` }); if (url.endsWith('/api/v2/jobs')) return json({ id: 'j1' });
      if (url.endsWith('/api/v2/jobs/j1')) return json({ status: 'succeeded', outputs: [{ node_id: '93', id: 'o1', name: 'talk.mp4', content_type: 'video/mp4', url: '/api/v2/assets/o1/content' }] });
      return new Response(gen, { status: 200 }); }) as typeof fetch, 1);
    const j: any = { id: `it${Math.random().toString(36).slice(2, 7)}`, toolId: 'voice', provider: IT.IT_PROVIDER, route: IT.IT_ROUTE, input: structuredClone(r), status: 'queued', outputs: [] };
    let err: Error | null = null; try { await runCloudWorkflow(j, findRoute(IT.IT_ROUTE)!, { n: 1 } as any); } catch (e) { err = e as Error; } return { job: j, err, calls }; };
  process.env.COMFY_API_KEY = 'comfyui-fake-it-key-123';
  { const a = await runOnce(); assert.equal(a.calls.length, 0, 'unmeasured price: nothing sent'); assert.equal(a.job.reasonCode, 'price_unmeasured'); }
  process.env.OPENHIGGSFIELD_ALLOW_UNMEASURED_CLOUD = '1';
  { const a = await runOnce(); assert.equal(a.err, null, String(a.err?.message)); const ups = a.calls.filter((c) => c.url.endsWith('/api/v2/assets'));
    assert.equal(ups.length, 2, 'photo + speech WAV uploaded'); for (const u of ups) assert.deepEqual(u.form, ['content_type', 'file_path', 'file'], 'upload fields before the file');
    const sub = a.calls.find((c) => c.url.endsWith('/api/v2/jobs'))!; const wf = sub.body.workflow; clean('submitted', JSON.parse(JSON.stringify(wf).replace(/\{"__type":"core\/ASSET","info":\{[^}]*\}\}/g, '{"__file":"x"}')));
    assert.equal(wf['1'].inputs.image.__type, 'core/ASSET'); assert.equal(wf['2'].inputs.audio.__type, 'core/ASSET'); assert.equal(Object.values<any>(wf).filter((n) => n.class_type === 'WanInfiniteTalkToVideo').length, 4); assert.equal(wf['91'].inputs.length, r.itWindows ? IT.itWindows(r.speechSeconds).frames : 0);
    assert.equal(a.job.status, 'done', a.job.error); assert.ok(a.job.outputs[0]?.url?.startsWith('/files/'), JSON.stringify(a.job.outputs)); assert.ok(fs.existsSync(path.join(D, a.job.outputs[0].url.slice('/files/'.length)))); }
  ok('run: refused before any call while unmeasured; then photo + WAV uploaded (fields first), 4-window graph submitted (Cloud-valid), the talking video saved');
} finally { setCloudFetch(null); fs.rmSync(D, { recursive: true, force: true }); }
