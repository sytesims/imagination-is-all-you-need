// Render (Direct a Shot step 3, 2026-10-24): LTX-2.5 + Layout to Render, local and free. In-process, temp data dir, mock backend, no network,
// nothing queued anywhere.
// 1 the graph validates against a saved, trimmed /object_info of the user's ComfyUI (test/fixtures/object-info-ltx25-layout.json): every node class
//   and input exists, combos hold our values, links point at real nodes; the recipe (GGUF + LoRA 1.0, 8 + 3 distilled steps, CFG 1, euler_ancestral,
//   layout guide on both stages, the first frame before the clip, x2 latent upscale) and the per-job sizes / frames / seed / prompt
// 2 the conform maths: 24 fps, 8k + 1 frames (snapped down), sides ÷ 64 (stage 1 ÷ 32), the ffmpeg arguments
// 3 requirements: the six files; a file smaller than its known size is still downloading (never ready); a complete set is ready
// 4 prompt prefill (preset restyle prompt + "Describe your shot"), the words Lightricks says to leave out, the first-frame painter prompt
// 5 Plan ↔ Real: parseInput conforms the plan's video, needs a first frame, keeps the link; the plan job lists its real clips (madeRealOf)
// Run: npx tsx test/make-it-real.test.ts
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'mir-')); const MODELS = path.join(D, 'models'); fs.mkdirSync(MODELS);
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'none.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0',
  OPENHIGGSFIELD_HW_MOCK: JSON.stringify({ gpu: { name: 'Apple M1 Max', type: 'mps' }, ramGB: 64, ggufNode: true }) });
delete process.env.COMFY_BASE_URL; delete process.env.OPENHIGGSFIELD_COMFY_MODELS_DIR;
const { buildPlan, hasPlan } = await import('../src/comfy/plans.js');
const { conformArgs, firstFrameArgs, patchMakeReal } = await import('../src/comfy/makeItReal.js');
const S = await import('../src/shared/makeItReal.js');
const { getTool } = await import('../src/tools/registry.js');
const { getProvider } = await import('../src/providers.js');
const R = await import('../src/hardware/requirements.js');
const { jobs } = await import('../src/jobs.js');
const { madeRealOf, makeRealFiles } = await import('../src/routesMakeItReal.js');
const ok = (m: string) => console.log('ok ' + m);
const P = S.MAKE_REAL_PROVIDER; const tool = getTool(S.MAKE_REAL_TOOL)!;
assert.ok(tool, 'the make-it-real tool is registered'); assert.equal(tool.listed, false, 'hidden: opened from a Direct a Shot recording'); assert.equal(tool.providers[0], P, 'local LTX first (the default)'); assert.ok(tool.providers.includes('router-kling-edit') && tool.providers.includes('router-aleph2') && tool.providers.includes('router-ray32-edit'), 'cloud Render models listed');
assert.equal(getProvider(P)?.kind, 'open-weights');

// ---- 1. graph vs the saved /object_info ----
const OI: Record<string, any> = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'object-info-ltx25-layout.json'), 'utf8'));
const isLink = (v: any) => Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && typeof v[1] === 'number';
function validate(g: Record<string, any>, label: string) {
  for (const [id, n] of Object.entries<any>(g)) {
    const spec = OI[n.class_type]; assert.ok(spec, `${label}: node ${id} class ${n.class_type} exists in ComfyUI`);
    const all = { ...(spec.input.required ?? {}), ...(spec.input.optional ?? {}) };
    for (const k of Object.keys(spec.input.required ?? {})) assert.ok(k in n.inputs, `${label}: ${n.class_type}.${k} (required) is set`);
    for (const [k, v] of Object.entries<any>(n.inputs)) {
      if (k.includes('.')) { const parent = all[k.split('.')[0]]; assert.ok(parent && /DYNAMICCOMBO/.test(String(parent[0])), `${label}: ${n.class_type}.${k} belongs to a dynamic combo`); continue; }
      const s = all[k]; assert.ok(s, `${label}: ${n.class_type}.${k} is an input ComfyUI knows`);
      if (isLink(v)) { assert.ok(g[v[0]], `${label}: ${n.class_type}.${k} links to node ${v[0]}, which is in the graph`);
        const outT = OI[g[v[0]].class_type].output[v[1]]; const inT = String(s[0]); assert.ok(outT != null, `${label}: ${v[0]} has output ${v[1]}`);
        if (!/MATCHTYPE|\*/.test(inT) && !Array.isArray(s[0])) assert.ok(inT.split(',').includes(outT), `${label}: ${n.class_type}.${k} (${inT}) takes ${g[v[0]].class_type}[${v[1]}] (${outT})`); continue; }
      if (v && typeof v === 'object' && '__file' in v) { assert.ok(['LoadImage', 'LoadVideo'].includes(n.class_type), `${label}: only Load Image / Load Video take an uploaded file`); continue; }
      const [type, o = {}] = s;
      if (Array.isArray(type)) { if (type.length) assert.ok(type.includes(v), `${label}: ${n.class_type}.${k}=${v} is one of ComfyUI's choices`); continue; }
      if (type === 'COMBO' || /DYNAMICCOMBO/.test(type)) { const opts = (o.options ?? []).map((x: any) => (typeof x === 'object' ? x.key : x)); if (opts.length) assert.ok(opts.includes(v), `${label}: ${n.class_type}.${k}=${v} is an option`); continue; }
      if (/^(INT|FLOAT)/.test(type)) { assert.equal(typeof v, 'number', `${label}: ${n.class_type}.${k} is a number`); if (o.min != null) assert.ok(v >= o.min, `${label}: ${k} ≥ min`); if (o.max != null) assert.ok(v <= o.max, `${label}: ${k} ≤ max`);
        if (type === 'INT' && o.step > 1) assert.equal((v - (o.min ?? 0)) % o.step, 0, `${label}: ${n.class_type}.${k}=${v} on its step ${o.step}`); continue; }
      if (type === 'STRING') { assert.equal(typeof v, 'string', `${label}: ${n.class_type}.${k} is text`); continue; }
      if (type === 'BOOLEAN') { assert.equal(typeof v, 'boolean'); continue; }
      assert.fail(`${label}: ${n.class_type}.${k} is a link type (${type}) but holds a value`);
    }
  }
}
const raw = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', '..', 'workflows', S.MAKE_REAL_WORKFLOW), 'utf8'));
validate(raw, 'workflow as saved');
// the model files the graph names are the six files, and the user's ComfyUI listed each of them (the fixture's combos are its files)
const FILES = S.MAKE_REAL_FILES.map((f) => f.file);
assert.deepEqual([raw['1'].inputs.unet_name, raw['4'].inputs.clip_name, raw['5'].inputs.vae_name, raw['6'].inputs.vae_name, raw['7'].inputs.model_name, raw['2'].inputs.lora_name], FILES);
assert.equal(raw['1'].class_type, 'UnetLoaderGGUF', 'the GGUF transformer (ComfyUI-GGUF)'); assert.equal(raw['4'].inputs.type, 'ltxv');
assert.ok(!/fp8|int8|nvfp4/i.test(FILES.join(' ')), 'Mac-safe files only');
assert.equal(raw['2'].inputs.strength_model, 1, 'LoRA at full strength (model card)');
assert.equal(raw['37'].inputs.sigmas.split(',').length - 1, 8, 'stage 1: 8 distilled steps'); assert.equal(raw['55'].inputs.sigmas.split(',').length - 1, 3, 'stage 2: 3 steps');
assert.match(raw['55'].inputs.sigmas, /^0\.909375,/, 'stage 2 enters at sigma 0.909375 (ltx_pipelines ic_lora)');
for (const id of ['38', '56']) assert.deepEqual([raw[id].inputs.video_cfg, raw[id].inputs.audio_cfg], [1, 1], 'CFG 1'); assert.equal(raw['36'].inputs.sampler_name, 'euler_ancestral');
for (const id of ['32', '52']) { assert.equal(raw[id].class_type, 'LTXVAddGuide'); assert.deepEqual(raw[id].inputs.image, ['21', 0], 'the layout clip guides both stages'); assert.deepEqual(raw[id].inputs.iclora_parameters, ['3', 0]); assert.equal(raw[id].inputs.frame_idx, 0); }
for (const id of ['31', '51']) { assert.equal(raw[id].class_type, 'LTXVAddLatentGuide'); assert.equal(raw[id].inputs.latent_idx, -1, 'the first frame sits just before the clip (temporal position -1)'); }
assert.deepEqual(raw['50'].inputs.samples, ['41', 2], 'stage 1 guides are cropped before the x2 latent upscale'); assert.deepEqual(raw['60'].inputs.samples, ['59', 2], 'stage 2 guides are cropped before decode');
assert.deepEqual(raw['2'].inputs.model, ['1', 0]); for (const id of ['38', '56']) assert.deepEqual(raw[id].inputs.model, ['2', 0], 'both stages sample with the LoRA');

const rec = { width: 1280, height: 720, seconds: 3 };
const plan = S.makeRealPlan(rec);
const job = (input: Record<string, any>) => ({ id: 'j', toolId: S.MAKE_REAL_TOOL, provider: P, input: { prompt: 'A street at dusk', finalPrompt: 'A street at dusk', seed: 7, layoutPath: '/tmp/layout.mp4', firstFramePath: '/tmp/first.png', makeReal: { plan }, ...input } });
assert.equal(hasPlan(job({})), true, 'a native plan exists'); assert.equal(hasPlan(job({ firstFramePath: null })), false, 'no first frame → no plan (Lightricks: required)');
const p1 = buildPlan(job({})); const g = p1.passes[0].graph; validate(g, 'job graph');
assert.equal(p1.passes[0].output, '63'); assert.equal(p1.outKind, 'video');
assert.deepEqual([g['30'].inputs.width, g['30'].inputs.height, g['30'].inputs.length], [384, 224, 65], 'Draft 16:9: stage 1 at 384×224, 65 frames');
assert.deepEqual([g['23'].inputs.width, g['23'].inputs.height], [384, 224], 'the first frame is scaled to stage 1 too');
assert.equal(g['33'].inputs.frames_number, 65); assert.equal(g['12'].inputs.frame_rate, 24); assert.equal(g['62'].inputs.fps, 24);
assert.deepEqual([g['35'].inputs.noise_seed, g['54'].inputs.noise_seed], [7, 8]); assert.equal(g['10'].inputs.text, 'A street at dusk');
assert.deepEqual(g['20'].inputs.file, { __file: '/tmp/layout.mp4' }); assert.deepEqual(g['22'].inputs.image, { __file: '/tmp/first.png' });
assert.throws(() => patchMakeReal(structuredClone(raw), { plan, prompt: 'x', layout: 'a', firstFrame: null as any }), /required/);
const pStd = S.makeRealPlan({ width: 720, height: 1280, seconds: 6 }, { size: 'standard', frames: 121 }); const g2 = buildPlan(job({ makeReal: { plan: pStd }, seed: undefined })).passes[0].graph; validate(g2, 'sharper 9:16');
assert.deepEqual([g2['30'].inputs.width, g2['30'].inputs.height, g2['30'].inputs.length, g2['35'].inputs.noise_seed], [288, 512, 121, 42], 'Sharper 9:16: stage 1 288×512, 121 frames, seed 42 by default');
ok('graph: validates against the user\'s /object_info (classes, inputs, combos, link types); recipe and per-job sizes, frames, seed, prompt, files');

// ---- 2. conform maths ----
assert.deepEqual([1, 8, 9, 64, 65, 72, 73, 96, 120, 121, 240].map(S.snap8k1), [1, 1, 9, 57, 65, 65, 73, 89, 113, 121, 233], '8k + 1, snapped down');
assert.equal(S.framesAvailable(3), 65, 'a 72-frame, 3 s clip becomes 65 frames (model card)'); assert.equal(S.framesAvailable(4), 89);
assert.deepEqual(S.lengthsFor(3), [41, 65]); assert.deepEqual(S.lengthsFor(4), [41, 65]); assert.deepEqual(S.lengthsFor(5), [41, 65, 97]); assert.deepEqual(S.lengthsFor(10), [41, 65, 97, 121]);
for (const size of ['quick', 'standard'] as const) for (const a of ['16:9', '9:16', '1:1'] as const) { const [w, h] = S.MAKE_REAL_SIZES[size].dims[a];
  assert.ok(w % 64 === 0 && h % 64 === 0, `${size} ${a}: ${w}×${h} divisible by 64`); assert.ok((w / 2) % 32 === 0 && (h / 2) % 32 === 0, 'stage 1 on the 32 grid'); assert.ok(w * h <= 1024 * 576, 'a small Mac draft'); }
assert.equal(S.MAKE_REAL_DEFAULT_SIZE, 'quick'); assert.deepEqual([plan.width, plan.height, plan.frames, plan.seconds, plan.aspect], [768, 448, 65, 2.7, '16:9'], 'default: Draft 768×448, 65 frames');
assert.equal(S.makeRealPlan(rec, { frames: 121 }).frames, 65, 'asking more frames than the recording has falls back');
assert.equal(S.makeRealPlan({ width: 960, height: 960, seconds: 3 }).aspect, '1:1');
const ca = conformArgs('in.mp4', 'out.mp4', plan); assert.ok(ca.includes('fps=24,scale=768:448:force_original_aspect_ratio=increase:flags=lanczos,crop=768:448,setsar=1'), 'cover-scale and centre-crop at 24 fps');
assert.deepEqual(ca.slice(ca.indexOf('-frames:v'), ca.indexOf('-frames:v') + 2), ['-frames:v', '65'], 'exactly 65 frames'); assert.ok(ca.includes('-an'));
assert.ok(firstFrameArgs('a.png', 'b.png', plan).join(' ').includes('crop=768:448'));
{ const e = S.makeRealEtaSeconds(plan); const e2 = S.makeRealEtaSeconds(S.makeRealPlan(rec, { size: 'standard' })); assert.ok(e.low < e.high && e2.low > e.low, 'Sharper takes longer'); assert.match(S.minutesText(e), /^about \d+ min$/); assert.equal(S.minutesText(S.makeRealEtaSeconds({ width: 768, height: 448, frames: 121 })), 'about 19 min', 'calibrated: 5 s Draft ≈ 19 min (our measured run)'); assert.equal(S.minutesText(S.makeRealEtaSeconds({ width: 768, height: 448, frames: 65 })), 'about 10 min'); }
ok('conform: 24 fps, 8k + 1 frames (snapped down), sides ÷ 64, stage 1 ÷ 32, Draft 768 by default, cover + crop with ffmpeg');

// ---- 3. requirements ----
const req0 = R.requirementsFor(tool, P, { types: ['make-it-real'] })!;
assert.deepEqual(req0.workflows, ['workflows/' + S.MAKE_REAL_WORKFLOW]); assert.equal(req0.missingBytesSource, 'assumed_all');
assert.equal(req0.downloadBytes, S.MAKE_REAL_FILES.reduce((a, f) => a + f.bytes, 0), 'download size = the six files');
assert.equal(req0.mps, 'amber', 'bf16 + GGUF on Apple: runs, slowly'); assert.notEqual(req0.mps, 'red');
process.env.OPENHIGGSFIELD_COMFY_MODELS_DIR = MODELS; R.clearRequirementsCache();
const put = (f: (typeof S.MAKE_REAL_FILES)[number], bytes: number) => { fs.mkdirSync(path.join(MODELS, f.folder), { recursive: true }); const p = path.join(MODELS, f.folder, f.file); fs.writeFileSync(p, ''); fs.truncateSync(p, bytes); };
const [gguf, te, vv, av, up] = S.MAKE_REAL_FILES;
put(gguf, gguf.bytes); put(te, 9e9); put(vv, vv.bytes); put(av, av.bytes); put(up, up.bytes); // sparse files; the LoRA is missing, the text encoder half there
let req = R.requirementsFor(tool, P, { types: ['make-it-real'] })!;
assert.equal(req.missingBytesSource, 'checked');
assert.deepEqual(req.missingFiles!.map((f) => f.file).sort(), [te.file, S.MAKE_REAL_FILES[5].file].sort(), 'a partial file counts as missing, never ready');
assert.equal(req.missingFiles!.find((f) => f.file === te.file)!.partial, true); assert.equal(req.missingFiles!.find((f) => f.file === te.file)!.haveBytes, 9e9);
let st = makeRealFiles(MODELS, req.missingFiles); assert.deepEqual(st.map((f) => f.state), ['ready', 'downloading', 'ready', 'ready', 'ready', 'missing'], 'Files needed: ready / still downloading / missing');
put(te, te.bytes); put(S.MAKE_REAL_FILES[5], S.MAKE_REAL_FILES[5].bytes); R.clearRequirementsCache();
req = R.requirementsFor(tool, P, { types: ['make-it-real'] })!; assert.deepEqual(req.missingFiles, [], 'every file complete'); st = makeRealFiles(MODELS, req.missingFiles); assert.ok(st.every((f) => f.state === 'ready'));
assert.deepEqual(makeRealFiles(null, null).map((f) => f.state), Array(6).fill('unknown'), 'no models folder: not checked');
const fit = R.fitFor(tool, P, { types: ['make-it-real'], duration: 2.7 }, undefined, req); assert.notEqual(fit.verdict, 'too_heavy', `a 64 GB Mac can run it (${fit.reason})`);
ok('requirements: six files; a short file is still downloading (never ready); complete set ready; runs on a 64 GB Mac (amber, slow)');

// ---- 4. prompts ----
assert.equal(S.makeRealPrompt({ restyle: { short: 'A slow walk through a bright home.' }, shot: { note: 'rainy evening, neon' } }), 'A slow walk through a bright home. Rainy evening, neon.');
assert.equal(S.makeRealPrompt({ restyle: { short: 'A town at dusk.' }, shot: { note: '' } }), 'A town at dusk.');
assert.equal(S.makeRealPrompt({ restyle: null, shot: { note: 'my own scene' } }), 'my own scene', 'an imported scene: the note alone');
assert.ok(S.PROMPT_AVOID.test('a clay town') && S.PROMPT_AVOID.test('3D render') && S.PROMPT_AVOID.test('in Unreal') && !S.PROMPT_AVOID.test('a clayish pot'));
assert.equal(S.stripAvoidWords('A town at dusk, clay look, 3D.'), 'A town at dusk, look.');
assert.ok(!S.PROMPT_AVOID.test(S.firstFramePrompt('a clay town at dusk')), 'the first-frame painter prompt never says clay / 3D');
// the first-frame painter gets a STILL prompt (2026-10-26): look, place, people, light and time of day kept; camera moves, motion, timings, beats and sound dropped
for (const [inp, out] of [
  ['A fictional adult in a blue jacket walks down a sunny city street, camera tracking alongside, natural motion.', 'A fictional adult in a blue jacket mid-stride on a sunny city street'],
  ['An unbranded red glass bottle turning slowly on a stone pedestal, soft studio light, shallow focus.', 'An unbranded red glass bottle on a stone pedestal, soft studio light, shallow focus'],
  ['Drone view over a small town at golden hour, a teal train crossing on a raised track, light haze.', 'Drone view over a small town at golden hour, a teal train on a raised track, light haze'],
  ['A slow daylight walk through a bright modern home with pale wood floors and a cream sofa.', 'A daylight view of a bright modern home with pale wood floors and a cream sofa'],
  ['Rainy street at night, neon signs. The person: 0–2 s walks nervously, 3 s waves.', 'Rainy street at night, neon signs'],
  ['A knight in a forest at dawn while the camera orbits slowly, with birdsong and footsteps.', 'A knight in a forest at dawn'],
  ['A woman with red hair runs across a bridge in the rain, then stops. Slow motion. Rain sound.', 'A woman with red hair mid-run on a bridge in the rain'],
] as const) assert.equal(S.stillPrompt(inp), out, inp);
{ const fp = S.firstFramePrompt('A woman runs across a plaza at dusk, the camera follows her for 4 seconds, music swells.', { who: true });
  assert.match(fp, /^Turn this rough frame into a finished, photoreal film still: A woman mid-run on a plaza at dusk\. Keep the exact composition/); assert.doesNotMatch(fp, /camera follows|seconds|music/); assert.ok(fp.endsWith(S.WHO_LINE), 'Who is it line');
  assert.doesNotMatch(S.firstFramePrompt('x'), /second picture/, 'no Who line without a picture'); assert.match(S.firstFramePrompt('camera pans left'), /film still: a real place in natural light\./, 'nothing left: a neutral still'); }
const { PREVIZ_TEMPLATES, restylePromptFor, normalizePlanShot } = await import('../src/shared/previzTemplates.js');
for (const t of PREVIZ_TEMPLATES) assert.ok(!S.PROMPT_AVOID.test(restylePromptFor(normalizePlanShot({ template: t.id }), 'short')), `${t.id}: its short restyle prompt avoids clay / 3D`);
ok('prompts: preset restyle prompt + note; clay / 3D / Unreal warned and left out; every preset prompt is clean');

// ---- 5. Plan ↔ Real ----
const vid = path.join(D, 'plan1-out0.mp4');
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=24', '-frames:v', '72', '-pix_fmt', 'yuv420p', vid]);
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=orange:size=1280x720', '-frames:v', '1', path.join(D, 'look.png')]);
jobs.set('plan1', { id: 'plan1', toolId: 'plan-a-shot', status: 'done', createdAt: 1, outputs: [{ label: 'Clay view', url: '/files/plan1-out0.mp4' }], resultUrl: '/files/plan1-out0.mp4',
  input: { previz: { presetName: 'Walk-by', width: 1280, height: 720, fps: 24, frames: 72, shot: { seconds: 3, note: 'rainy' }, restyle: { short: 'A street.' } } } } as any);
const noFirst: any = await tool.parseInput({ planJob: 'plan1', prompt: 'A street.' }, {}); assert.equal(noFirst.code, 'required'); assert.equal(noFirst.issues[0].field, 'firstFrame', 'the first frame is required');
const badPlan: any = await tool.parseInput({ planJob: 'nope', prompt: 'x' }, { firstFrame: ['look.png'] }); assert.equal(badPlan.issues[0].field, 'planJob');
const inp: any = await tool.parseInput({ planJob: 'plan1', prompt: 'A street at night, clay look.', frames: '65' }, { firstFrame: ['look.png'] });
assert.ok(!('error' in inp), JSON.stringify(inp)); assert.equal(inp.makeReal.planJobId, 'plan1'); assert.equal(inp.makeReal.planUrl, '/files/plan1-out0.mp4');
assert.equal(inp.finalPrompt, 'A street at night, look.', 'the model never gets “clay”'); assert.ok(inp.warnings.some((w: string) => /clay/i.test(w)));
const probe = execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-show_entries', 'stream=width,height,nb_read_frames,r_frame_rate', '-of', 'csv=p=0', inp.layoutPath]).toString().trim();
assert.equal(probe, '768,448,24/1,65', 'the plan is conformed: 768×448, 24 fps, 65 frames');
assert.equal(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', inp.firstFramePath]).toString().trim(), '768,448', 'the first frame is fitted to the same size');
jobs.set('real1', { id: 'real1', toolId: S.MAKE_REAL_TOOL, status: 'done', createdAt: 5, resultUrl: '/files/real1-out0.mp4', parentId: 'plan1', input: inp } as any);
jobs.set('real2', { id: 'real2', toolId: S.MAKE_REAL_TOOL, status: 'running', createdAt: 9, input: { makeReal: { planJobId: 'plan1' } } } as any);
assert.deepEqual(madeRealOf(jobs.get('plan1') as any)!.map((r) => [r.id, r.status]), [['real2', 'running'], ['real1', 'done']], 'the plan lists its real clips, newest first');
assert.equal(madeRealOf(jobs.get('real1') as any), null);
ok('Plan ↔ Real: the plan is conformed and linked, a first frame is required, clay is left out of the prompt, the plan lists its real clips');
console.log('make-it-real: all passed');
process.exit(0);

// 2026-10-25: Render must keep LTX's own soundtrack. runNative treats input.keepAudio === false as "strip the audio",
// so the tool's parsed input must never set it (it once did, and every result saved silent).
{ const { readFileSync } = await import('node:fs'); const src = readFileSync(new URL('../src/tools/makeItReal.ts', import.meta.url), 'utf8');
  if (/keepAudio:\s*false/.test(src)) throw new Error('make-it-real sets keepAudio:false, which strips the generated audio'); console.log('ok make-it-real keeps the generated audio'); }
