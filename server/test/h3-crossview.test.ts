// H3 runner Step 3 (Oct 26): "New angle · H3 CrossView · cloud" on Re-shoot, with FAKE fetches only (no network, no key, no spend).
//  - graph + Build list: our API graph of Comfy's Reshoot recipe; requires = every node class + the 7 model files
//  - zones (green / yellow / red), plan (camera, size, length, prompt, seed, original vs generated sound, warp guide)
//  - parse edge cases: <4 s refused, 4–5 s padded to 5 s, >15 s cut to 15 s, az ±90 (red), az past 90 refused, extreme elevation, 768p at 15 s,
//    two angles, a replacement soundtrack, 720p, a pad preset
//  - route + price: deployment route only, priceUnmeasured; run: not set up → deploy_missing; a full fake run; deployment missing nodes → refused, nothing sent
// Run: npx tsx test/h3-crossview.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'h3cv-')); process.env.OPENHIGGSFIELD_DATA_DIR = D; process.env.OPENHIGGSFIELD_BACKEND = 'mock';
process.env.OPENHIGGSFIELD_FILMING_FILE = path.join(D, 'nofilm.json'); process.env.OPENHIGGSFIELD_ALLOW_UNMEASURED_CLOUD = '0';
const KEY = 'comfyui-fake-cv-key-789'; const DEP = 'https://cv-dep.run.comfy.app';
const clear = () => { for (const k of ['COMFY_DEPLOY_URL', 'COMFY_API_KEY', 'COMFY_RUNNER_URL', 'COMFY_RUNNER_TOKEN']) delete process.env[k]; };
clear();
const ok = (m: string) => console.log('ok ' + m);
const { CROSSVIEW_GRAPH, CROSSVIEW_REQUIRES, CROSSVIEW_BUILD, CROSSVIEW_BUILD_GB, crossviewPlan } = await import('../src/comfy/crossview.ts');
const { crossviewZone, crossviewFrames, crossviewSize } = await import('../src/shared/crossview.ts');
const { CLOUD_WORKFLOWS, isStandalone } = await import('../src/comfy/cloudWorkflows.ts');
const { reshootTool } = await import('../src/tools/reshoot.ts');
const { findRoute, routesFor } = await import('../src/routing/routes.ts');
const { HOSTED_BY_ID } = await import('../src/shared/hostedPrices.ts');
const { runCloudWorkflow, setCloudFetch } = await import('../src/routing/cloudRun.ts');
const { probeDeploy } = await import('../src/comfy/deploy.ts');
const { CLOUD_RUNNER_ROUTES } = await import('../src/routing/runnable.ts');
const clip = (name: string, secs: number, audio = true) => { const f = path.join(D, name);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `testsrc=size=854x480:rate=24:duration=${secs}`, ...(audio ? ['-f', 'lavfi', '-i', `sine=frequency=440:duration=${secs}`] : []), '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', ...(audio ? ['-c:a', 'aac', '-shortest'] : []), f]); return name; };
const dur = (f: string) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
const parse = (fields: Record<string, string>, files: Record<string, string[]>) => reshootTool.parseInput!({ provider: 'cloud-h3-crossview', ...fields }, files) as Promise<any>;
type Call = { url: string; method: string; body?: any };
const json = (o: any, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
try {
  // ---- graph + Build list ----
  const g = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../workflows', CROSSVIEW_GRAPH), 'utf8'));
  for (const c of ['CrossViewPrepareClip', 'CrossViewWarp', 'LoadMoGeModel', 'MoGeInference', 'MiniMaxH3ReferenceToVideo', 'MiniMaxH3AddGuide', 'MiniMaxH3SigmaShift', 'LoadVideo', 'SaveVideo']) assert.ok(CROSSVIEW_REQUIRES.nodes.includes(c), c);
  assert.equal(CROSSVIEW_REQUIRES.models.length, 7); assert.deepEqual(CROSSVIEW_REQUIRES.models.map((m) => m.file).sort(), CROSSVIEW_BUILD.models.map((m) => m.file).sort());
  for (const m of CROSSVIEW_REQUIRES.models) assert.ok(Object.values<any>(g).some((n) => n.class_type === m.loader && n.inputs[m.field] === m.file), m.file);
  assert.equal(CROSSVIEW_BUILD.nodePacks[0].commit, 'fbb1e93c7193329ff3ce7c17f95166b539687876'); assert.ok(CROSSVIEW_BUILD_GB > 50 && CROSSVIEW_BUILD_GB < 60, String(CROSSVIEW_BUILD_GB));
  const w = CLOUD_WORKFLOWS['comfy-deploy:cloud-h3-crossview']; assert.ok(isStandalone(w)); assert.equal(w.target, 'deploy'); assert.ok(CLOUD_RUNNER_ROUTES.has('comfy-deploy:cloud-h3-crossview'));
  ok(`graph: every node class + 7 model files listed for the probe; Build ≈ ${CROSSVIEW_BUILD_GB} GB; comfyrob fork pinned at fbb1e93`);

  // ---- zones + helpers ----
  assert.equal(crossviewZone(-30, 15), 'green'); assert.equal(crossviewZone(45, 0), 'green'); assert.equal(crossviewZone(0, -25), 'yellow'); assert.equal(crossviewZone(60, 10), 'yellow');
  assert.equal(crossviewZone(90, 0), 'red'); assert.equal(crossviewZone(-90, 0), 'red'); assert.equal(crossviewZone(0, 45), 'red'); assert.equal(crossviewZone(0, -40), 'red');
  assert.equal(crossviewFrames(5), 107); assert.equal(crossviewFrames(15), 345); assert.equal(crossviewFrames(30), 345); assert.equal((crossviewFrames(8) - 5) % 17, 0);
  assert.deepEqual(crossviewSize(1280, 720, '480p'), { width: 864, height: 480 }); assert.deepEqual(crossviewSize(1280, 720, '768p'), { width: 1376, height: 768 });
  assert.deepEqual(crossviewSize(720, 1280, '480p'), { width: 480, height: 864 });
  ok('zones: green ±45 / +30 −20, yellow to ±90 / +45 −35, red at ±90 and past; frames 17k+5 capped at 15 s; 864×480 / 1376×768 following the shape (9:16 too)');

  // ---- parse edge cases (real ffmpeg clips, no network) ----
  { const r = await parse({ azimuth: '-30', elevation: '15' }, { video: [clip('c3.mp4', 3)] }); assert.ok(r.error); assert.match(r.error, /5–15 s/); assert.equal(r.issues[0].code, 'too_short'); }
  const c45 = clip('c45.mp4', 4.5);
  { const r = await parse({ azimuth: '-30', elevation: '15' }, { video: [c45] }); assert.ok(!r.error, r.error); assert.equal(r.duration, 5); assert.ok(r.crossviewClip.padded);
    assert.ok(Math.abs(dur(r.videoPath) - 5) < 0.15, String(dur(r.videoPath))); assert.ok(r.warnings.some((x: string) => /padded to 5 s/.test(x))); assert.equal(r.crossview.zone, 'green'); assert.equal(r.crossviewAudio, 'original'); assert.equal(r.resolution, '480p'); }
  { const r = await parse({ azimuth: '-30', elevation: '15' }, { video: [clip('c45s.mp4', 4.5, false)] }); assert.ok(!r.error, r.error); assert.ok(Math.abs(dur(r.videoPath) - 5) < 0.15); }
  const c20 = clip('c20.mp4', 20);
  { const r = await parse({ azimuth: '30', elevation: '10' }, { video: [c20] }); assert.ok(!r.error, r.error); assert.equal(r.duration, 15); assert.ok(r.crossviewClip.trimmed); assert.ok(dur(r.videoPath) <= 15.2); assert.ok(r.warnings.some((x: string) => /first 15 s/.test(x))); }
  const c15 = clip('c15.mp4', 15);
  { const r = await parse({ azimuth: '20', elevation: '5', resolution: '768p', generateAudio: '1' }, { video: [c15] }); assert.ok(!r.error, r.error); assert.equal(r.resolution, '768p'); assert.equal(r.crossviewSize, '768p'); assert.equal(r.duration, 15);
    assert.ok(r.warnings.some((x: string) => /768p over 10 s/.test(x))); assert.equal(r.crossviewAudio, 'generated'); }
  const c8 = clip('c8.mp4', 8);
  for (const az of ['90', '-90']) { const r = await parse({ azimuth: az, elevation: '0' }, { video: [c8] }); assert.ok(!r.error, r.error); assert.equal(r.crossview.zone, 'red'); assert.ok(r.warnings.some((x: string) => /invented/.test(x))); }
  { const r = await parse({ azimuth: '95', elevation: '0' }, { video: [c8] }); assert.equal(r.issues[0].field, 'azimuth'); assert.equal(r.issues[0].code, 'out_of_range'); }
  { const r = await parse({ azimuth: '0', elevation: '45' }, { video: [c8] }); assert.ok(!r.error); assert.equal(r.crossview.zone, 'red'); }
  { const r = await parse({ azimuth: '0', elevation: '-45' }, { video: [c8] }); assert.ok(!r.error); assert.equal(r.crossview.zone, 'red'); }
  { const r = await parse({ azimuth: '0', elevation: '60' }, { video: [c8] }); assert.equal(r.issues[0].field, 'elevation'); }
  { const r = await parse({ azimuth: '0', elevation: '0', distance: '3' }, { video: [c8] }); assert.equal(r.issues[0].field, 'distance'); }
  { const r = await parse({ azimuth: '2', elevation: '1' }, { video: [c8] }); assert.ok(r.warnings.some((x: string) => /very small move/i.test(x))); }
  { const r = await parse({ angles: JSON.stringify([{ start: 0, end: 4, yaw: -30, tilt: 10 }, { start: 4, end: 8, yaw: 30, tilt: 0 }]) }, { video: [c8] }); assert.equal(r.issues[0].code, 'too_many'); }
  { const r = await parse({ angles: JSON.stringify([{ start: 0, end: 3, yaw: -40, tilt: 12 }]) }, { video: [c8] }); assert.ok(!r.error); assert.equal(r.crossview.azimuth, -40); assert.deepEqual([r.angles[0].start, r.angles[0].end], [0, 8]); }
  { const r = await parse({ angles: JSON.stringify(['left side']) }, { video: [c8] }); assert.ok(!r.error, r.error); assert.equal(r.crossview.azimuth, -90); }
  { const r = await parse({ angles: JSON.stringify(['slow push in']) }, { video: [c8] }); assert.equal(r.issues[0].code, 'angle_needs_position'); }
  { const r = await parse({}, { video: [c8] }); assert.equal(r.issues[0].field, 'azimuth'); }
  { const r = await parse({ azimuth: '10', elevation: '10', resolution: '720p' }, { video: [c8] }); assert.equal(r.issues[0].field, 'resolution'); }
  fs.writeFileSync(path.join(D, 'snd.wav'), Buffer.alloc(64));
  { const r = await parse({ azimuth: '10', elevation: '10' }, { video: [c8], audio: ['snd.wav'] }); assert.equal(r.issues[0].field, 'audio'); }
  { const r = await parse({ azimuth: '10', elevation: '10', angleCount: '4' }, { video: [c8] }); assert.equal(r.issues[0].field, 'angleCount'); }
  ok('parse: <4 s refused (5–15 s message); 4.5 s padded to 5 s (with and without sound); 20 s → first 15 s; 768p at 15 s + generated sound; az ±90 red, 95 refused; el ±45 red, 60 refused; distance range; tiny move warns; 2 angles / soundtrack / 720p / batch refused; pad preset → numbers');

  // ---- plan ----
  { const p = crossviewPlan({ id: 'p1', toolId: 'reshoot', provider: 'cloud-h3-crossview', input: { videoPath: '/x/take.mp4', duration: 8, crossview: { azimuth: 40, elevation: -10, distance: 1.2 }, crossviewSize: '768p', prompt: 'the far wall', seed: 7 } });
    const gg = p.passes[0].graph; assert.deepEqual(gg['1'].inputs.file, { __file: '/x/take.mp4' }); assert.equal(gg['2'].inputs.megapixels, 1); assert.equal(gg['2'].inputs.duration, 8);
    assert.deepEqual([gg['5'].inputs.azimuth, gg['5'].inputs.elevation, gg['5'].inputs.distance], [40, -10, 1.2]); assert.equal(gg['20'].inputs.prompt, 'crossview. the far wall'); assert.equal(gg['30'].inputs.noise_seed, 7);
    assert.equal(p.passes[0].output, '41'); assert.ok(!gg['43'] && !gg['42'] && !gg['36'], 'generated-sound branch pruned'); assert.ok(gg['45']); assert.equal(p.passes[0].extraOutputs![0].node, '45'); assert.equal(p.muxSourceAudio, false); }
  { const p = crossviewPlan({ id: 'p2', toolId: 'reshoot', provider: 'cloud-h3-crossview', input: { videoPath: '/x/t.mp4', duration: 15, crossview: { azimuth: -30, elevation: 15, distance: 1 }, crossviewAudio: 'generated', seed: 1 } });
    const gg = p.passes[0].graph; assert.equal(p.passes[0].output, '43'); assert.ok(gg['36'] && !gg['41']); assert.equal(gg['2'].inputs.megapixels, 0.4); assert.equal(gg['20'].inputs.prompt, 'crossview.'); }
  ok('plan: take uploaded, 0.4 / 1.0 MP, length, az/el/distance, "crossview." + reveal text, seed; original sound by default (generated branch pruned) or generated; warp guide as a second output');

  // ---- route + price ----
  const rt = findRoute('comfy-deploy:cloud-h3-crossview'); assert.equal(rt?.label, 'Your Comfy deployment'); assert.equal(rt?.priceRef, 'cloud-h3-crossview');
  assert.deepEqual(routesFor('cloud-h3-crossview', 'reshoot').map((r) => r.routeId), ['comfy-deploy:cloud-h3-crossview']); assert.deepEqual(routesFor('cloud-h3-crossview').map((r) => r.routeId), ['comfy-deploy:cloud-h3-crossview']);
  const row = HOSTED_BY_ID['cloud-h3-crossview']; assert.equal(row.priceUnmeasured, true); assert.ok(row.usdByQuality!['768p'] > row.usdByQuality!['480p']);
  assert.ok(reshootTool.providers.includes('cloud-h3-crossview'));
  ok('route: only comfy-deploy:cloud-h3-crossview (no shared-Cloud route), label Your Comfy deployment; price row unmeasured, 768p > 480p');

  // ---- runs on the fake deployment ----
  const input = (await parse({ azimuth: '-30', elevation: '15' }, { video: [c8] }));
  const runOnce = async (h: (c: Call) => Response) => { const calls: Call[] = [];
    setCloudFetch((async (u: any, init: any = {}) => { const c: Call = { url: String(u), method: init.method ?? 'GET', body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined }; calls.push(c); return h(c); }) as typeof fetch, 1);
    const job: any = { id: `cv${Math.random().toString(36).slice(2, 7)}`, toolId: 'reshoot', provider: 'cloud-h3-crossview', route: rt!.routeId, input: structuredClone(input), status: 'queued' };
    let err: Error | null = null; try { await runCloudWorkflow(job, rt!, { n: 1 } as any); } catch (e) { err = e as Error; } return { job, err, calls }; };
  const mp4 = fs.readFileSync(path.join(D, c8));
  const happy = (c: Call) => c.url.endsWith('/api/v2/assets') ? json({ id: 'a1' }) : c.url.endsWith('/api/v2/jobs') ? json({ id: 'j1' })
    : c.url.endsWith('/api/v2/jobs/j1') ? json({ status: 'succeeded', outputs: [{ node_id: '41', id: 'o1', name: 'new.mp4', content_type: 'video/mp4', url: '/api/v2/assets/o1/content' }, { node_id: '45', id: 'o2', name: 'warp.mp4', content_type: 'video/mp4', url: '/api/v2/assets/o2/content' }] })
    : new Response(mp4, { status: 200 });
  process.env.COMFY_DEPLOY_URL = DEP; process.env.COMFY_API_KEY = KEY;
  { const r = await runOnce(happy); assert.equal(r.calls.length, 0); assert.equal(r.job.reasonCode, 'price_unmeasured'); }
  process.env.OPENHIGGSFIELD_ALLOW_UNMEASURED_CLOUD = '1'; clear();
  { const r = await runOnce(happy); assert.equal(r.calls.length, 0); assert.equal(r.job.reasonCode, 'deploy_missing'); assert.match(r.err!.message, /isn't set up/); }
  process.env.COMFY_DEPLOY_URL = DEP; process.env.COMFY_API_KEY = KEY;
  { const r = await runOnce(happy); assert.equal(r.err, null, String(r.err)); assert.equal(r.job.status, 'done'); assert.ok(r.calls.every((c) => c.url.startsWith(DEP)));
    const sub = r.calls.find((c) => c.method === 'POST' && c.url.endsWith('/api/v2/jobs'))!.body.workflow; assert.equal(sub['5'].class_type, 'CrossViewWarp'); assert.equal(sub['5'].inputs.azimuth, -30);
    assert.equal(r.job.outputs.length, 2); assert.match(r.job.outputs[1].label, /Warp guide/); assert.ok(!JSON.stringify(r.job).includes(KEY)); }
  // deployment missing nodes: the free check found CrossViewWarp + the LoRA missing → refused before any upload or submit
  const info = { LoadVideo: {}, MiniMaxH3ReferenceToVideo: {}, UNETLoader: { input: { required: { unet_name: [['minimax_h3_ref2va_pruned_int8_convrot.safetensors'], {}] } } } };
  const pr = await probeDeploy({ nodes: true, f: (async (u: any) => String(u).endsWith('/api/object_info') ? json(info) : json({ status: 'healthy' })) as typeof fetch });
  const rec = pr.recipes.find((x) => x.id === 'cloud-h3-crossview')!; assert.equal(rec.ready, false); assert.ok(rec.missingNodes.includes('CrossViewWarp')); assert.ok(rec.missingModels.includes('MiniMax-H3_Ref2VA-LoRA-CrossView-Warp_v1_3500.safetensors'));
  { const r = await runOnce(happy); assert.equal(r.calls.length, 0, 'nothing uploaded or submitted'); assert.equal(r.job.reasonCode, 'deploy_incomplete'); assert.match(r.err!.message, /missing what H3 CrossView needs: .*CrossViewWarp/); }
  process.env.OPENHIGGSFIELD_ALLOW_UNMEASURED_CLOUD = '0'; setCloudFetch(null);
  ok('run: not set up → deploy_missing; unmeasured → refused; with the flag: upload → submit (CrossViewWarp az −30) → 2 outputs, all on the deployment; probe finds missing nodes → refused with the list, nothing sent');
  console.log('ALL OK h3-crossview');
} finally { clear(); fs.rmSync(D, { recursive: true, force: true }); }
