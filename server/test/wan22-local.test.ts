// Wan 2.2 TI2V 5B, the free local route on Generate Video (2026-10-24). In-process, temp data dir, mock backend, no network, nothing queued anywhere.
// 1 the graph (text to video and image to video) validates against a saved, trimmed ComfyUI /object_info (test/fixtures/object-info-wan22-5b.json):
//   every node class and input exists, combos hold our values, links point at real nodes, sizes on the 32 grid, length on Wan's 4n+1 grid
// 2 caps: modes t2v + i2v, 2–5 s (2 s default), 704p / 480p, no sound; the local route carries them and the honest slow note
// 3 requirements: the three fp16 files (the "Files needed / Download" list), green on Apple MPS, fits a Mac; first ETA estimate for a Mac
// 4 defaults: on Apple Silicon the suggested local video model is Wan 2.2 5B; elsewhere MiniMax H3 stays
// Run: npx tsx test/wan22-local.test.ts
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'wan22-')); const MODELS = path.join(D, 'models'); fs.mkdirSync(MODELS);
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'none.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0',
  OPENHIGGSFIELD_HW_MOCK: JSON.stringify({ gpu: { name: 'Apple M1 Max', type: 'mps' }, ramGB: 64 }) });
delete process.env.COMFY_BASE_URL; delete process.env.OPENHIGGSFIELD_COMFY_MODELS_DIR;
const { buildPlan, hasPlan } = await import('../src/comfy/plans.js');
const { wanFrames, wan22Size, WAN22_5B_STEPS } = await import('../src/comfy/wan22.js');
const { VIDEO_LIMITS, durationsFor } = await import('../src/tools/h3/videoCaps.js');
const { routesFor } = await import('../src/routing/routes.js');
const { getTool } = await import('../src/tools/registry.js');
const R = await import('../src/hardware/requirements.js');
const HW = await import('../src/hardware.js');
const { pickEditorial } = await import('../src/shared/imageDefaults.js');
const { VIDEO_DEFAULTS } = await import('../src/shared/videoDefaults.js');
const { getProvider } = await import('../src/providers.js');
const ok = (m: string) => console.log('ok ' + m);
const P = 'comfy-wan22-5b'; const tool = getTool('h3-video')!;

// ---- 1. graph vs the saved /object_info ----
const OI: Record<string, any> = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'object-info-wan22-5b.json'), 'utf8'));
const isLink = (v: any) => Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && typeof v[1] === 'number';
function validate(g: Record<string, any>, label: string) {
  for (const [id, n] of Object.entries<any>(g)) {
    const spec = OI[n.class_type]; assert.ok(spec, `${label}: node ${id} class ${n.class_type} exists in ComfyUI`);
    const all = { ...(spec.input.required ?? {}), ...(spec.input.optional ?? {}) };
    for (const k of Object.keys(spec.input.required ?? {})) assert.ok(k in n.inputs, `${label}: ${n.class_type}.${k} (required) is set`);
    for (const [k, v] of Object.entries<any>(n.inputs)) {
      if (k.includes('.')) { const parent = all[k.split('.')[0]]; assert.ok(parent && /DYNAMICCOMBO/.test(String(parent[0])), `${label}: ${n.class_type}.${k} belongs to a dynamic combo`); continue; }
      const s = all[k]; assert.ok(s, `${label}: ${n.class_type}.${k} is an input ComfyUI knows`);
      if (isLink(v)) { assert.ok(g[v[0]], `${label}: ${n.class_type}.${k} links to node ${v[0]}, which is in the graph`); continue; }
      if (v && typeof v === 'object' && '__file' in v) { assert.equal(n.class_type, 'LoadImage', `${label}: only Load Image takes an uploaded file`); continue; }
      const [type, o = {}] = s;
      if (Array.isArray(type)) { if (type.length) assert.ok(type.includes(v), `${label}: ${n.class_type}.${k}=${v} is one of ComfyUI's choices`); continue; } // empty = model files / user images (checked below)
      if (type === 'COMBO' || /DYNAMICCOMBO/.test(type)) { const opts = (o.options ?? []).map((x: any) => (typeof x === 'object' ? x.key : x)); assert.ok(opts.includes(v), `${label}: ${n.class_type}.${k}=${v} is an option`); continue; }
      if (type === 'INT' || type === 'FLOAT') { assert.equal(typeof v, 'number', `${label}: ${n.class_type}.${k} is a number`); if (o.min != null) assert.ok(v >= o.min, `${label}: ${k} ≥ min`); if (o.max != null) assert.ok(v <= o.max, `${label}: ${k} ≤ max`);
        if (type === 'INT' && o.step > 1) assert.equal((v - (o.min ?? 0)) % o.step, 0, `${label}: ${n.class_type}.${k}=${v} on its step ${o.step}`); continue; }
      if (type === 'STRING') { assert.equal(typeof v, 'string', `${label}: ${n.class_type}.${k} is text`); continue; }
      assert.fail(`${label}: ${n.class_type}.${k} is a link type (${type}) but holds a value`);
    }
  }
}
const IMG = path.join(import.meta.dirname, 'fixtures', 'ref-512.png');
const job = (input: Record<string, any>) => ({ id: 'j', toolId: 'h3-video', provider: P, input: { prompt: 'a red fox runs through snow', seed: 7, duration: 2, resolution: '704p', aspect: '16:9', steps: 20, ...input } });
assert.equal(hasPlan(job({ mode: 't2v' })), true, 'Generate Video on Wan 2.2 5B has a local plan');
const t2v = buildPlan(job({ mode: 't2v' })); const g1 = t2v.passes[0].graph; validate(g1, 't2v');
assert.equal(g1['56'], undefined, 't2v: no Load Image'); assert.equal(g1['55'].inputs.start_image, undefined, 't2v: no start image');
assert.deepEqual([g1['55'].inputs.width, g1['55'].inputs.height, g1['55'].inputs.length], [1280, 704, 49], 't2v: 1280×704, 2 s = 49 frames');
assert.deepEqual([g1['3'].inputs.sampler_name, g1['3'].inputs.scheduler, g1['3'].inputs.steps, g1['3'].inputs.seed, g1['3'].inputs.cfg], ['euler', 'simple', 20, 7, 5], 't2v: euler (Mac-safe), template cfg 5, seed and steps from the job');
assert.equal(g1['6'].inputs.text, 'a red fox runs through snow'); assert.equal(g1['57'].inputs.fps, 24); assert.equal(g1['48'].inputs.shift, 8);
assert.equal(t2v.passes[0].output, '58'); assert.equal(t2v.outKind, 'video');
const i2v = buildPlan(job({ mode: 'i2v', imagePath: IMG, aspect: 'auto', resolution: '480p', duration: 5, steps: WAN22_5B_STEPS.fast })); const g2 = i2v.passes[0].graph; validate(g2, 'i2v');
assert.deepEqual(g2['56'].inputs.image, { __file: IMG }, 'i2v: the start frame is uploaded'); assert.deepEqual(g2['55'].inputs.start_image, ['56', 0]);
assert.deepEqual([g2['55'].inputs.width, g2['55'].inputs.height, g2['55'].inputs.length, g2['3'].inputs.steps], [640, 640, 121, 12], 'i2v auto: square frame → 640×640 at 480p; 5 s = 121 frames; Fast = 12 steps');
// loader files = the requirements list (what "Files needed" shows)
const FILES = ['wan2.2_ti2v_5B_fp16.safetensors', 'umt5_xxl_fp16.safetensors', 'wan2.2_vae.safetensors'];
assert.deepEqual([g1['37'].inputs.unet_name, g1['38'].inputs.clip_name, g1['39'].inputs.vae_name], FILES, 'fp16 files only (no fp8: Apple MPS has no float8)');
assert.equal(g1['38'].inputs.type, 'wan');
ok('graph: t2v + i2v validate against the saved /object_info (classes, inputs, combos, steps, links)');
assert.deepEqual([2, 3, 4, 5].map(wanFrames), [49, 73, 97, 121]); for (const n of [2, 3, 4, 5].map(wanFrames)) assert.equal((n - 1) % 4, 0);
for (const [res, a, w, h] of [['704p', '9:16', 704, 1280], ['704p', '1:1', 960, 960], ['480p', '16:9', 832, 480], ['480p', '9:16', 480, 832]] as const) assert.deepEqual(wan22Size(res, a), { width: w, height: h });
{ const s = wan22Size('704p', 'auto', { width: 1080, height: 1920 }); assert.ok(s.height > s.width && s.width % 32 === 0 && s.height % 32 === 0, 'auto follows a portrait frame'); }
ok('sizes on the 32 grid per tier and aspect; frames on the 4n+1 grid at 24 fps');

// ---- 2. caps ----
const L = VIDEO_LIMITS[P]; assert.ok(L, 'Wan 2.2 5B has a caps row');
assert.deepEqual(L.durations, [2, 3, 4, 5]); assert.equal(L.defaultSeconds, 2); assert.deepEqual(L.resolutions, ['704p', '480p']); assert.equal(L.audio.supported, false);
assert.deepEqual(durationsFor('h3-video', P), [2, 3, 4, 5]);
assert.ok(tool.providers.includes(P), 'Generate Video offers it'); assert.deepEqual((tool as any).app.providerModes[P], ['t2v', 'i2v']);
const routes = routesFor(P, tool); assert.equal(routes.length, 1, 'one route: local'); const r0 = routes[0];
assert.equal(r0.routeId, `local:${P}`); assert.equal(r0.kind, 'local'); assert.equal(r0.priceRef, null, 'free');
assert.equal((r0.caps as any).audio, false); assert.deepEqual((r0.caps as any).durations, [2, 3, 4, 5]); assert.deepEqual((r0.caps as any).resolutions, ['704p', '480p']);
assert.match(String((r0.caps as any).note), /slow/i, 'the route says honestly that local video is slow');
assert.equal(getProvider(P)?.kind, 'open-weights'); assert.deepEqual(getProvider(P)?.licenseParts, ['apache-2.0']);
// job parsing: 6 s refused (quote = submit), audio is always off, default 2 s
const parse = (f: Record<string, string>) => tool.parseInput({ provider: P, prompt: 'a fox', types: '["t2v"]', ...f }, {});
const bad6: any = await parse({ duration: '6' }); assert.equal(bad6.code, 'invalid_duration', '6 s is refused'); assert.deepEqual(bad6.durations, [2, 3, 4, 5]);
const okp: any = await parse({ audio: '1' }); assert.ok(!('error' in okp), JSON.stringify(okp)); assert.equal(okp.duration, 2, 'default 2 s'); assert.equal(okp.audio, false, 'silent model'); assert.equal(okp.frames, 49); assert.equal(okp.steps, 20); assert.equal(okp.resolution, '704p');
const p720: any = await parse({ resolution: '720p' }); assert.equal(p720.resolution, '704p', '720p maps to 704p');
ok('caps: t2v + i2v, 2–5 s (2 s default), 704p / 480p, silent, free local route with the slow note; 6 s refused');

// ---- 3. requirements + fit on a Mac ----
const req = R.requirementsFor(tool, P, { mode: 't2v', resolution: '704p', duration: 2 })!;
assert.deepEqual(req.workflows, ['workflows/wan22-ti2v-5b-api.json']);
assert.equal(req.missingBytesSource, 'assumed_all', 'no models folder: every file counted as missing');
assert.equal(req.downloadBytes, 9999658848 + 1409400960 + 11366399385, 'download size = the three files');
assert.equal(req.mps, 'green', 'fp16 files run on Apple MPS'); assert.equal(req.downloadable, true); assert.equal(req.downloadId, P);
process.env.OPENHIGGSFIELD_COMFY_MODELS_DIR = MODELS; R.clearRequirementsCache();
const req2 = R.requirementsFor(tool, P, { mode: 'i2v', resolution: '480p', duration: 3 })!;
assert.deepEqual(req2.missingFiles!.map((f) => f.file).sort(), [...FILES].sort(), 'Files needed lists the three files'); assert.ok(req2.missingFiles!.every((f) => f.url.startsWith('https://huggingface.co/Comfy-Org/Wan-2.')));
const hw = HW.currentHardware(); assert.equal(hw.gpu?.type, 'mps');
const fit = R.fitFor(tool, P, { mode: 't2v', resolution: '704p', duration: 2 }, hw, req);
assert.equal(fit.verdict, 'fits', `fits a 64 GB Mac (${fit.reason})`);
assert.equal(fit.eta.estimateSeconds, 600, 'first Mac estimate: 2 s at 704p ≈ 10 min (300 s per output second), replaced by this computer\'s own runs');
ok('requirements: three fp16 files (22.8 GB) for Files needed / Download, green on MPS, fits a 64 GB Mac, first ETA estimate 10 min for 2 s');

// ---- 4. defaults (2026-10-26): LTX-2.5 22B is the Video tab's local default on every computer, Apple Silicon included; Wan 2.2 5B stays offered ----
const V = VIDEO_DEFAULTS['h3-video']; const LTX = 'comfy-ltx25-video'; assert.equal(V.localApple, LTX); assert.ok(tool.providers.some((p: any) => (typeof p === 'string' ? p : p.id) === P), 'Wan 2.2 5B still offered');
const st = (id: string) => (id === P || id === LTX ? { runnable: true, demo: false, routeKind: 'local', reasonCode: null, reason: null } : undefined);
assert.equal(pickEditorial(V, st, true, { apple: true }).id, LTX, 'Mac, Use local on → LTX-2.5 22B'); assert.match(String(pickEditorial(V, st, true, { apple: true }).why), /your computer/);
assert.equal(pickEditorial(V, st, true).id, LTX, 'NVIDIA / unknown → LTX-2.5 22B too');
ok('defaults: LTX-2.5 22B is the local video default on Apple Silicon and elsewhere; Wan 2.2 5B stays in the list');
console.log('wan22-local: all passed');
process.exit(0);
