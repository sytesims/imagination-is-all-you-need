// H3 Extend · Comfy Cloud (2026-10-27): the local H3 Extend graph on shared Comfy Cloud, one segment per job, chained by extending the result.
// FAKE fetches only (no network, no key, no spend).
//  1 graph: the local graph with Cloud files only (fp16 video VAE, turbo 8-step + sigma shift + attention), every length (+2–14 s) × shapes × tiers ×
//    character photo on / off passes Comfy Cloud's object_info (checkCloudGraph, 0 errors); frames on H3's 17k + 5 grid, within the trained 362
//  2 plan: context 22 frames, kept frames = 22 + 24 × s, render size ≈ 1 MP / 0.5 MP in the source's shape, prompt prefill + photo role, limits
//  3 parse: 2–14 s accepted, character photo uploaded or carried over from the clip's own job (and characterOff), other places refuse their non-lengths
//  4 routes + price: Comfy Cloud place of the H3 Extend card, preferred; estimate per rendered second; the REAL quote endpoint = the charge
//  5 run + CHAINING on a fake Comfy Cloud: segment 1 from a clip, segment 2 from segment 1's output: preflight GETs, context clip uploaded (fields
//    first), graph submitted, result joined: total = source + added exactly, sound as long as the picture with no gap or click at the cut, the
//    source unchanged before the cut, seam at the source's length
// Run: npx tsx test/h3-extend-cloud.test.ts
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync, spawnSync } from 'node:child_process';
process.env.OPENHIGGSFIELD_ALLOW_UNMEASURED_CLOUD = '0'; // these checks cover the held state (cloud runs before a measured price are allowed by default since 2026-10-27)
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'h3xcloud-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0' });
for (const k of ['COMFY_API_KEY', 'COMFY_CLOUD_URL', 'OPENHIGGSFIELD_COMFY_CLOUD_URL', 'COMFY_DEPLOY_URL', 'COMFY_RUNNER_URL', 'COMFY_BASE_URL']) delete process.env[k];
globalThis.fetch = (async (u: unknown) => { throw new Error(`network blocked in this test: ${String(u).slice(0, 80)}`); }) as typeof fetch;
const ok = (m: string) => console.log('ok ' + m);
const X = await import('../src/comfy/h3ExtendCloud.ts');
const { CLOUD_WORKFLOWS, buildCloudPlan, isStandalone } = await import('../src/comfy/cloudWorkflows.ts');
const { checkCloudGraph } = await import('../src/comfy/cloudGraphCheck.ts');
const { routesFor, findRoute } = await import('../src/routing/routes.ts');
const { HOSTED_BY_ID } = await import('../src/shared/hostedPrices.ts');
const { runCloudWorkflow, setCloudFetch } = await import('../src/routing/cloudRun.ts');
const { CLOUD_RUNNER_ROUTES, routeRunnable } = await import('../src/routing/runnable.ts');
const { routeCredits, routeInput, autoOrder, option } = await import('../src/routing/select.ts');
const { getTool } = await import('../src/tools/registry.ts');
const { getProvider, providerOpenWeights } = await import('../src/providers.ts');
const { WORKFLOWS_DIR } = await import('../src/config.ts');
const { H3_EXTEND_OVERLAP_FRAMES } = await import('../src/tools/h3/catalog.ts');
const { jobs } = await import('../src/jobs.ts');
const OI = JSON.parse(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'fixtures/object-info-comfy-cloud-2026-10-26.json'), 'utf8'));
const json = (o: any, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
const ff = (args: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args]);
/** A clip: moving test picture + a 440 Hz tone (the "voice" that must carry on). */
const clip = (name: string, secs: number, size = '1280x720', rate = 30, freq = 440) => { const f = path.join(D, name);
  ff(['-f', 'lavfi', '-i', `testsrc2=size=${size}:rate=${rate}:duration=${secs}`, '-f', 'lavfi', '-i', `sine=frequency=${freq}:duration=${secs}:sample_rate=48000`, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', f]); return f; };
const frames = (f: string) => Number(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', f]).toString().trim());
const dur = (f: string, s: 'v' | 'a') => Number(execFileSync('ffprobe', ['-v', 'error', '-select_streams', `${s}:0`, '-show_entries', 'stream=duration', '-of', 'csv=p=0', f]).toString().trim());
const pcm = (f: string) => { const b = execFileSync('ffmpeg', ['-v', 'error', '-i', f, '-vn', '-ac', '1', '-ar', '48000', '-f', 's16le', '-'], { maxBuffer: 1 << 28 }); return new Int16Array(b.buffer, b.byteOffset, b.byteLength / 2); };
/** Average PSNR of the first n frames of two clips (how unchanged the source is in the result). */
const psnrOf = (a: string, b: string, n: number) => { const r = spawnSync('ffmpeg', ['-hide_banner', '-i', a, '-i', b, '-filter_complex', `[0:v]trim=end_frame=${n},setpts=PTS-STARTPTS[x];[1:v]trim=end_frame=${n},setpts=PTS-STARTPTS[y];[x][y]psnr`, '-f', 'null', '-'], { encoding: 'utf8' });
  const m = String(r.stderr).match(/average:([\d.]+|inf)/); return m ? (m[1] === 'inf' ? 99 : Number(m[1])) : 0; };

try {
  // ---- 1. graph ----
  const local = JSON.parse(fs.readFileSync(path.join(WORKFLOWS_DIR, 'h3-extend-api.json'), 'utf8')); const cloud = JSON.parse(fs.readFileSync(path.join(WORKFLOWS_DIR, X.H3X_CLOUD_GRAPH), 'utf8'));
  assert.deepEqual(Object.keys(cloud).filter((k) => !local[k]).sort(), ['60', '61', '62'], 'Cloud adds only sigma shift, attention, turbo LoRA');
  for (const id of Object.keys(local)) { assert.equal(cloud[id].class_type, local[id].class_type, `node ${id} same class`);
    for (const [k, v] of Object.entries<any>(local[id].inputs)) { const c = cloud[id].inputs[k]; if (JSON.stringify(c) === JSON.stringify(v)) continue;
      assert.ok(`${id}.${k}` in { '3.vae_name': 1, '11.value': 1, '6.sampler_name': 1, '12.scheduler': 1, '12.model': 1, '13.model': 1, '18.filename_prefix': 1 }, `only the Cloud recipe changes: ${id}.${k}`); } }
  assert.equal(cloud['3'].inputs.vae_name, 'minimax_h3_video_vae_fp16.safetensors'); assert.equal(cloud['11'].inputs.value, 8); assert.deepEqual(cloud['12'].inputs.model, ['62', 0]);
  const files = Object.values<any>(cloud).filter((n) => /Loader/.test(n.class_type)).flatMap((n) => Object.entries<any>(n.inputs).filter(([k]) => /_name$/.test(k)).map(([, v]) => v));
  for (const m of X.H3X_CLOUD_REQUIRES.models) { const opts = OI[m.loader].input.required[m.field]; const list = Array.isArray(opts[0]) ? opts[0] : opts[1].options; assert.ok(list.includes(m.file), `${m.file} on Comfy Cloud`); }
  assert.ok(files.every((f) => X.H3X_CLOUD_REQUIRES.models.some((m) => m.file === f)), 'every model file is required + listed');
  const shapes: [number, number][] = [[1344, 736], [736, 1344], [1024, 1024], [1280, 720], [1440, 1080], [480, 854]]; let n = 0;
  for (const [w, h] of shapes) for (const resolution of ['768p', '480p']) for (const s of X.H3X_SECONDS_LIST) for (const character of [false, true]) {
    const input = { mode: 'extend', extendSeconds: s, resolution, prompt: 'she keeps walking', seed: 7, videoPath: '/x/src.mp4', ...(character ? { characterPath: '/x/face.png' } : {}),
      h3x: { source: '/x/conf.mp4', frames: 240, width: w, height: h, tail: '/x/tail.mp4' } };
    const p = buildCloudPlan({ id: 'j1', toolId: 'h3-extend', provider: X.H3X_CLOUD_PROVIDER, input }); const ps = p.passes[0]; const g = ps.graph; const label = `${w}x${h} ${resolution} +${s}${character ? ' photo' : ''}`;
    const chk = checkCloudGraph(g, OI); assert.deepEqual(chk.errors, [], `${label}: ${chk.errors.join('; ')}`);
    assert.equal(ps.workflow, X.H3X_CLOUD_GRAPH); assert.equal(ps.expect.frames, X.h3Grid(H3_EXTEND_OVERLAP_FRAMES + 24 * s)); assert.equal((ps.expect.frames - 5) % 17, 0, `${label}: 17k + 5`);
    assert.ok(ps.expect.frames <= X.H3X_MAX_FRAMES, `${label}: within the trained range`); assert.equal(ps.expect.keptFrames, 22 + 24 * s);
    assert.ok(g['9'].inputs.value % 32 === 0 && g['10'].inputs.value % 32 === 0 && g['9'].inputs.value * g['10'].inputs.value <= (resolution === '768p' ? 1e6 : 5e5), `${label}: size on the 32 grid within the budget`);
    assert.ok(Math.abs(Math.log((g['9'].inputs.value / g['10'].inputs.value) / (w / h))) < 0.1, `${label}: the source's shape`);
    assert.equal(g['7'].inputs.value, s + 22 / 24); assert.equal(g['42'].inputs.length, 22); assert.ok(Math.abs(g['43'].inputs.duration - 22 / 24) < 1e-9 && g['43'].inputs.start_index === -g['43'].inputs.duration);
    assert.deepEqual(g['21'].inputs.image, ['42', 0]); assert.deepEqual(g['21'].inputs.audio, ['43', 0]); assert.equal(g['21'].inputs.frame_idx, 0, 'context picture + sound anchored at frame 0');
    assert.deepEqual(g['40'].inputs.file, { __file: '/x/tail.mp4' }); assert.equal(g['5'].inputs.noise_seed, 7);
    if (character) { assert.equal(g['20'].class_type, 'MiniMaxH3ReferenceToVideo'); assert.equal(g['1'].inputs.unet_name, X.H3X_REF2VA_UNET); assert.deepEqual(g['50'].inputs.image, { __file: '/x/face.png' }); assert.match(g['20'].inputs.prompt, /<Picture 1>/); }
    else { assert.equal(g['20'].class_type, 'MiniMaxH3ImageToVideo'); assert.ok(!g['50']); assert.equal(g['1'].inputs.unet_name, 'minimax_h3_fl2va_pruned_int8_convrot.safetensors'); }
    assert.equal(p.post.kind, 'extend'); if (p.post.kind === 'extend') { assert.equal(p.post.source, '/x/conf.mp4'); assert.equal(p.post.maxGenFrames, 22 + 24 * s); assert.equal(p.post.plan.out.frames, 240 + 24 * s); }
    n++; }
  ok(`graph: Cloud twin of the local graph (VAE fp16 + turbo recipe only); ${n} variants (6 shapes × 2 tiers × +2–14 s × photo on/off) pass Comfy Cloud's object_info, frames on 17k+5 ≤ 362`);

  // ---- 2. plan maths ----
  const p10 = X.h3xPlan({ width: 1344, height: 736, frames: 240 }, { seconds: 10 }) as any; assert.equal(p10.guideFrames, 22); assert.equal(p10.gen.frames, 262); assert.equal(X.h3Grid(262), 277); assert.equal(p10.out.frames, 480); assert.equal(p10.out.seconds, 20);
  assert.deepEqual([p10.gen.width, p10.gen.height], [1344, 736]); assert.equal(p10.crossfade, X.H3X_XFADE);
  assert.equal(X.h3xRenderSeconds({ extendSeconds: 10 }), 11.54); assert.equal(X.h3xRenderSeconds({ extendSeconds: 5 }), 6.58); assert.equal(X.h3xRenderSeconds({}), 6.58, 'default +5 s');
  assert.deepEqual(X.H3X_SECONDS, { min: 2, max: 14 }); assert.equal((X.h3xPlan({ width: 1280, height: 720, frames: 240 }, { seconds: 15 }) as any).field, 'extendSeconds');
  assert.match((X.h3xPlan({ width: 1280, height: 720, frames: 12 }, { seconds: 5 }) as any).error, /at least 22 frames/); assert.match((X.h3xPlan({ width: 1280, height: 720, frames: 1400 }, { seconds: 5 }) as any).error, /up to 60 s/);
  assert.match(String(X.h3xCloudIssue({ extendSeconds: 15 })), /2–14 s/); assert.equal(X.h3xCloudIssue({ extendSeconds: 8, mode: 'extend', sourceSeconds: 10 }), null); assert.match(String(X.h3xCloudIssue({ direction: 'backward' })), /forward/);
  assert.match(String(X.h3xCloudIssue({ extendSeconds: 14, sourceSeconds: 50 })), /up to 60 s/); assert.match(String(X.h3xCloudIssue({ sourceSeconds: 0.5 })), /at least 1 s/);
  assert.ok(X.h3xPrompt('', false).startsWith(X.H3X_PROMPT_PREFIX)); assert.equal(X.h3xPrompt(`${X.H3X_PROMPT_PREFIX}she turns`, false), `${X.H3X_PROMPT_PREFIX}she turns`); assert.match(X.h3xPrompt('he waves', true), /^he waves The person looks exactly like <Picture 1>/);
  ok('plan: 22-frame context, +10 s on 240 frames = 262 kept of 277 rendered, 480 frames out (20 s); +2–14 s; short / too long refused; prompt prefill + photo role');

  // ---- 3. parse ----
  const tool = getTool('h3-extend')!; const SRC = clip('seg0.mp4', 10); const rel = path.basename(SRC);
  const face = path.join(D, 'face.png'); ff(['-f', 'lavfi', '-i', 'color=c=gray:size=512x512', '-frames:v', '1', face]);
  const parse = async (f: Record<string, string>, fl: Record<string, string[]> = { video: [rel] }) => tool.parseInput({ provider: 'comfy-h3-extend', prompt: 'p', ...f }, fl) as Promise<any>;
  for (const s of [2, 3, 7, 14]) { const r = await parse({ extendSeconds: String(s) }); assert.ok(!r.error, r.error); assert.equal(r.extendSeconds, s); }
  assert.equal((await parse({ extendSeconds: '15' })).issues[0].field, 'extendSeconds');
  { const r = await parse({ extendSeconds: '5' }, { video: [rel], character: ['face.png'] }); assert.equal(r.characterPath, face); assert.equal(r.characterFrom, 'upload'); }
  jobs.set('parentA', { id: 'parentA', toolId: 'h3-extend', provider: 'comfy-h3-extend', input: { characterPath: face, characterUrl: '/files/face.png' } } as any);
  jobs.set('parentB', { id: 'parentB', toolId: 'object-swap', provider: 'comfy-h3-charswap', input: { refPaths: [face] } } as any);
  jobs.set('parentC', { id: 'parentC', toolId: 'h3-video', provider: 'comfy-h3', input: { mode: 'i2v', refPaths: [face] } } as any);
  assert.equal((await parse({ parentId: 'parentA' })).characterPath, face, 'carried over from the previous segment');
  assert.equal((await parse({ parentId: 'parentB' })).characterFrom, 'parentB', 'carried over from an H3 Character Swap result');
  assert.equal((await parse({ parentId: 'parentC' })).characterPath, undefined, 'a start frame is not an identity photo');
  assert.equal((await parse({ parentId: 'parentA', characterOff: '1' })).characterPath, undefined, 'characterOff drops it');
  const rs = routesFor('comfy-h3-extend', tool); const cr = rs.find((r) => r.routeId === X.H3X_CLOUD_ROUTE)!; assert.ok(cr, 'Comfy Cloud place');
  { const r3 = await parse({ extendSeconds: '3' }); const ri = routeInput(tool, r3); assert.equal(ri.resolution, '768p', 'H3 lengths stay H3 (not LTX tiers)'); assert.equal(cr.unavailableFor?.(ri) ?? null, null);
    for (const o of rs.filter((r) => r !== cr && r.kind !== 'comfy-router')) assert.ok(o.unavailableFor?.(ri), `${o.routeId} refuses +3 s`); }
  ok('parse: +2–14 s accepted; character photo uploaded, carried over (previous segment, Character Swap result), not from a start frame, characterOff; other places refuse +3 s');

  // ---- 4. routes + price ----
  assert.equal(cr.kind, 'comfy-cloud'); assert.equal(cr.label, 'Comfy Cloud'); assert.deepEqual((cr.caps as any).extendSeconds, X.H3X_SECONDS_LIST); assert.ok((cr.caps as any).tips.length === 4);
  const pv = getProvider(X.H3X_CLOUD_PROVIDER)!; assert.equal(pv.name, 'H3 Extend · Comfy Cloud'); assert.ok(providerOpenWeights(pv));
  const row = HOSTED_BY_ID[X.H3X_CLOUD_PROVIDER]; assert.ok(row.priceUnmeasured && row.estimated && row.usdByQuality!['768p'] > row.usdByQuality!['480p']);
  assert.ok(CLOUD_RUNNER_ROUTES.has(X.H3X_CLOUD_ROUTE) && routeRunnable(cr)); const w = CLOUD_WORKFLOWS[X.H3X_CLOUD_ROUTE]; assert.ok(isStandalone(w) && w.target === 'cloud' && !!w.prepare);
  { const r10 = await parse({ extendSeconds: '10' }); const c10 = routeCredits(tool, cr, routeInput(tool, r10))!, c5 = routeCredits(tool, cr, routeInput(tool, await parse({ extendSeconds: '5' })))!;
    const c480 = routeCredits(tool, cr, routeInput(tool, await parse({ extendSeconds: '10', resolution: '480p' })))!; assert.ok(c10 > c5 && c5 > 0 && c480 < c10, `${c10} > ${c5}; 480p ${c480}`);
    assert.equal(c10, Math.ceil(11.54 * row.usdByQuality!['768p'] * 100 - 1e-9), '+10 s = 11.54 rendered s at the 768p rate'); }
  { const Fastify = (await import('fastify')).default; const app = Fastify(); (await import('../src/routesBatch1.ts')).registerBatch1(app); (await import('../src/routing/http.ts')).registerRouting(app); await app.ready();
    const seen: Record<string, number> = {};
    for (const [s, res] of [['10', '768p'], ['5', '768p'], ['3', '768p'], ['14', '768p'], ['8', '480p']] as const) {
      const job = await parse({ extendSeconds: s, resolution: res }); const charge = routeCredits(tool, cr, routeInput(tool, job))!;
      const qs = new URLSearchParams({ provider: 'comfy-h3-extend', route: X.H3X_CLOUD_ROUTE, extendSeconds: s, resolution: res, video: '1', seconds: '10' });
      const r = await app.inject({ url: `/api/tools/h3-extend/price?${qs}` }); assert.equal(r.statusCode, 200, r.body.slice(0, 300)); const b = r.json();
      assert.equal(b.route, X.H3X_CLOUD_ROUTE, JSON.stringify(b).slice(0, 300)); const quoted = b.listCredits ?? b.credits; assert.equal(quoted, charge, `+${s} ${res}: quote ${quoted} = charge ${charge}`); seen[`+${s} ${res}`] = quoted; }
    await app.close(); ok(`quote endpoint = charge (credits, 1 = $0.01): ${JSON.stringify(seen)}`); }
  process.env.COMFY_API_KEY = 'comfyui-fake-h3x-key-123';
  { const c = option(tool, cr, routeInput(tool, await parse({ extendSeconds: '10' }))); assert.ok(!c.available && /Off until we can show you its exact price/.test(String(c.reason)), `unmeasured: unavailable with the reason, never a failing button (${c.reason})`);
    const bad = option(tool, cr, routeInput(tool, { ...(await parse({ extendSeconds: '10' })), direction: 'backward' })); assert.ok(!bad.available && /forward/.test(String(bad.reason)), String(bad.reason)); }
  process.env.OPENHIGGSFIELD_ALLOW_UNMEASURED_CLOUD = '1';
  { const o = autoOrder(tool, 'comfy-h3-extend', routeInput(tool, await parse({ extendSeconds: '10' }))); assert.equal(o[0]?.routeId, X.H3X_CLOUD_ROUTE, `preferred place: ${o.map((x) => x.routeId).join(', ')}`); }
  delete process.env.COMFY_API_KEY; { const c = option(tool, cr, routeInput(tool, await parse({ extendSeconds: '10' }))); assert.equal(c.reasonCode, 'key_missing', 'no key: key_missing (sample on the mock backend)'); }
  ok('routes: Comfy Cloud place of H3 Extend, open weights, estimate row; unmeasured → unavailable with its reason; measured/allowed → pre-selected first');

  // ---- 5. run + chaining on a fake Comfy Cloud ----
  process.env.COMFY_API_KEY = 'comfyui-fake-h3x-key-123';
  const rt = findRoute(X.H3X_CLOUD_ROUTE)!;
  /** The fake model: continues the tone (another 440 Hz, a different phase) over a new test picture, at the submitted size and grid length. */
  const runSegment = async (input: any, id: string) => { const calls: { url: string; method: string; body?: any; form?: string[] }[] = []; let genFile = '';
    setCloudFetch((async (u: any, init: any = {}) => { const url = String(u); const c = { url, method: init.method ?? 'GET', body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined, form: init.body instanceof FormData ? [...init.body.keys()] : undefined }; calls.push(c);
      if (url.includes('/api/assets?')) return json({ assets: [] }); if (url.endsWith('/api/object_info')) return json({}, 404);
      if (url.endsWith('/api/v2/assets')) return json({ id: `a${calls.length}` });
      if (url.endsWith('/api/v2/jobs')) { const wf = c.body.workflow; const T = X.h3Grid(Math.round(wf['7'].inputs.value * 24)); genFile = path.join(D, `${id}-fakegen.mp4`);
        ff(['-f', 'lavfi', '-i', `testsrc=size=${wf['9'].inputs.value}x${wf['10'].inputs.value}:rate=24`, '-f', 'lavfi', '-i', `aevalsrc=0.125*sin(2*PI*440*t+1.3):s=48000:d=${T / 24}`, '-frames:v', String(T), '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', genFile]);
        return json({ id: `${id}-cj` }); }
      if (url.endsWith(`/api/v2/jobs/${id}-cj`)) return json({ status: 'succeeded', outputs: [{ node_id: '18', id: 'o1', name: 'h3x.mp4', content_type: 'video/mp4', url: '/api/v2/assets/o1/content' }] });
      return new Response(fs.readFileSync(genFile), { status: 200 }); }) as typeof fetch, 1);
    const job: any = { id, toolId: 'h3-extend', provider: 'comfy-h3-extend', route: rt.routeId, input: structuredClone(input), status: 'queued', outputs: [] };
    let err: Error | null = null; try { await runCloudWorkflow(job, rt, { n: 1 } as any); } catch (e) { err = e as Error; } return { job, err, calls }; };
  const outOf = (j: any) => path.join(D, j.outputs[0].url.slice('/files/'.length));
  /** The sound at the cut: no gap (no 10 ms window of near silence) and no click (no sample step far above the tone's own). */
  const cutCheck = (f: string, cutS: number, label: string) => { const a = pcm(f); const at = Math.round(cutS * 48000); const win = a.slice(at - 4800, at + 4800);
    let maxStep = 0; for (let k = 1; k < win.length; k++) maxStep = Math.max(maxStep, Math.abs(win[k] - win[k - 1]));
    const ref = a.slice(48000, 96000); let refStep = 0; for (let k = 1; k < ref.length; k++) refStep = Math.max(refStep, Math.abs(ref[k] - ref[k - 1]));
    for (let k = 0; k + 480 <= win.length; k += 240) { let e = 0; for (let q = k; q < k + 480; q++) e = Math.max(e, Math.abs(win[q])); assert.ok(e > 1500, `${label}: sound at ${(cutS + (k - 4800) / 48000).toFixed(3)} s (peak ${e}): no gap`); }
    assert.ok(maxStep < refStep * 4, `${label}: no click at the cut (step ${maxStep} vs the tone's ${refStep})`); return { maxStep, refStep }; };
  // Segment 1: from a 10 s clip, +10 s (a 20 s take); the photo is uploaded once
  const in1 = await parse({ extendSeconds: '10', prompt: 'she keeps walking' }, { video: [rel], character: ['face.png'] });
  const a = await runSegment(in1, 'seg1'); assert.equal(a.err, null, String(a.err?.message)); assert.equal(a.job.status, 'done', a.job.error);
  { const gets = a.calls.filter((c) => c.method === 'GET' && /api\/assets\?|object_info/.test(c.url)); assert.ok(gets.length >= 1 && a.calls.indexOf(gets[0]) === 0, 'free GET check first');
    const ups = a.calls.filter((c) => c.url.endsWith('/api/v2/assets')); assert.equal(ups.length, 2, 'context clip + character photo uploaded'); for (const u of ups) assert.deepEqual(u.form, ['content_type', 'file_path', 'file']);
    const wf = a.calls.find((c) => c.url.endsWith('/api/v2/jobs'))!.body.workflow; assert.equal(wf['40'].inputs.file.__type, 'core/ASSET'); assert.equal(wf['50'].inputs.image.__type, 'core/ASSET'); assert.equal(wf['20'].class_type, 'MiniMaxH3ReferenceToVideo');
    const x = a.job.input.h3x; assert.equal(frames(x.tail), 22, 'context = the last 22 frames'); assert.ok(Math.abs(dur(x.tail, 'a') - 22 / 24) < 0.05, 'with their sound'); }
  const out1 = outOf(a.job); const N0 = a.job.input.h3x.frames; assert.equal(N0, 240);
  assert.equal(frames(out1), N0 + 240, 'segment 1: 240 source + 240 new frames'); assert.ok(Math.abs(dur(out1, 'a') - 20) < 0.06, `sound ${dur(out1, 'a')} s = picture`);
  assert.equal(a.job.input.sourceSeconds, 10, 'seam at the source length'); const cut1 = cutCheck(out1, 10, 'segment 1');
  const p1 = psnrOf(a.job.input.h3x.source, out1, N0 - X.H3X_XFADE); assert.ok(p1 > 35, `source unchanged before the cut (PSNR ${p1} dB)`);
  // Segment 2: the Extend button on segment 1's result (fromJob → its output is the clip, parentId → the photo carries over), +5 s
  jobs.set('seg1', a.job); const rel1 = path.basename(out1);
  const in2 = await parse({ extendSeconds: '5', prompt: `${X.H3X_PROMPT_PREFIX}she reaches the door`, parentId: 'seg1' }, { video: [rel1] }); assert.equal(in2.characterPath, face, 'photo carried to segment 2');
  const b = await runSegment(in2, 'seg2'); assert.equal(b.err, null, String(b.err?.message)); assert.equal(b.job.status, 'done', b.job.error);
  { const sub = b.calls.find((c) => c.url.endsWith('/api/v2/jobs'))!.body.workflow; assert.equal(sub['20'].class_type, 'MiniMaxH3ReferenceToVideo'); assert.match(sub['20'].inputs.prompt, /^Continue the same action/); }
  const out2 = outOf(b.job); assert.equal(b.job.input.h3x.frames, 480, 'segment 2 is built from segment 1\'s output (480 frames)');
  assert.equal(frames(out2), 480 + 120, 'take: 20 s + 5 s = 600 frames'); assert.ok(Math.abs(dur(out2, 'a') - 25) < 0.06, `sound ${dur(out2, 'a')} s = picture`);
  const cut2 = cutCheck(out2, 20, 'segment 2'); cutCheck(out2, 10, 'segment 1 cut still clean in the take');
  const p2 = psnrOf(out1, out2, 480 - X.H3X_XFADE); assert.ok(p2 > 33, `segment 1 unchanged before the new cut (PSNR ${p2} dB)`);
  const { seamOf } = await import('../../web/src/shared/continuation.ts'); assert.equal(seamOf(b.job, 25), 20, 'result viewer seam at 0:20'); assert.equal(seamOf(a.job, 20), 10);
  ok(`run + chain: free GET first, context + photo uploaded (fields first), Ref2VA graph; 10 s + 10 s = 20 s, + 5 s = 25 s exact; sound = picture, no gap, no click (steps ${cut1.maxStep}/${cut1.refStep}, ${cut2.maxStep}/${cut2.refStep}); source PSNR ${p1.toFixed(1)} / ${p2.toFixed(1)} dB; seams 0:10 / 0:20`);
  // a clip too short: refused by prepare, nothing uploaded or submitted
  { const s = clip('tiny.mp4', 0.5); const r = { ...(await parse({ extendSeconds: '5' })), videoPath: s, sourceSeconds: 0.5 }; const c = await runSegment(r, 'segT');
    assert.ok(c.err && /at least (22 frames|1 s)/.test(c.err.message), String(c.err?.message)); assert.ok(!c.calls.some((q) => q.method === 'POST'), 'nothing sent'); assert.equal(c.job.reasonCode, 'input_invalid'); }
  ok('a clip under 22 frames is refused before any upload');
} finally { setCloudFetch(null); fs.rmSync(D, { recursive: true, force: true }); }
