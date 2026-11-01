// Footage Effects + the shared LTX-2.5 IC-LoRA video-to-video base (2026-10-26). In-process, temp data dir, mock backend, no network, nothing queued.
// 1 the shared graph validates against a saved, trimmed /object_info of the user's ComfyUI (test/fixtures/object-info-ltx25-iclora.json), as saved
//   and patched for every effect (with and without a first frame); the recipe (two stages, guide + IC-LoRA parameters on both, crops); variants
// 2 plan maths: sizes, 8k + 1 frames, short / long / too-short clips, ETA
// 3 prompts per the cards (Water: ADD WATER dual-panel, Alpha matte: empty), the LoRA registry, real model names
// 4 parseInput: conforms the clip (24 fps, size, exact frames, sound kept), errors; the native plan (LoRA per effect, source sound muxed back)
// 5 requirements list the effect's LoRA; the mock run makes a labelled sample with the clip's sound
// Run: npx tsx test/footage-fx.test.ts
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'ffx-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'none.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0',
  OPENHIGGSFIELD_MOCK_DELAY_MS: '20', OPENHIGGSFIELD_HW_MOCK: JSON.stringify({ gpu: { name: 'Apple M1 Max', type: 'mps' }, ramGB: 64, ggufNode: true }) });
delete process.env.COMFY_BASE_URL; delete process.env.OPENHIGGSFIELD_COMFY_MODELS_DIR;
const { buildPlan, hasPlan } = await import('../src/comfy/plans.js');
const { patchLtx25IcLora, conformSourceArgs, IC_LORA_VARIANTS } = await import('../src/comfy/ltx25IcLora.js');
const S = await import('../src/shared/footageFx.js');
const { LTX_LORAS, ltxLorasForJob } = await import('../src/shared/ltxLoras.js');
const { getTool } = await import('../src/tools/registry.js');
const { getProvider } = await import('../src/providers.js');
const { modelNameForRun } = await import('../src/models.js');
const R = await import('../src/hardware/requirements.js');
const { etaFor } = await import('../src/timing.js');
const { VIDEO_BARS } = await import('../src/shared/videoBar.js'); const { videoWorkflowById } = await import('../src/shared/videoWorkflows.js');
const ok = (m: string) => console.log('ok ' + m);
const P = S.FOOTAGE_FX_PROVIDER; const tool = getTool(S.FOOTAGE_FX_TOOL)!;
assert.ok(tool, 'footage-fx is registered'); assert.deepEqual(tool.providers, [P]); assert.equal(getProvider(P)?.kind, 'open-weights');

// ---- 1. graph vs the saved /object_info ----
const OI: Record<string, any> = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'object-info-ltx25-iclora.json'), 'utf8'));
const isLink = (v: any) => Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && typeof v[1] === 'number';
function validate(g: Record<string, any>, label: string) {
  for (const [id, n] of Object.entries<any>(g)) {
    const spec = OI[n.class_type]; assert.ok(spec, `${label}: node ${id} class ${n.class_type} exists in ComfyUI`);
    const all = { ...(spec.input.required ?? {}), ...(spec.input.optional ?? {}) };
    for (const k of Object.keys(spec.input.required ?? {})) assert.ok(k in n.inputs, `${label}: ${n.class_type}.${k} (required) is set`);
    for (const [k, v] of Object.entries<any>(n.inputs)) {
      if (k.includes('.')) { const parent = all[k.split('.')[0]]; assert.ok(parent && /DYNAMICCOMBO/.test(String(parent[0])), `${label}: ${n.class_type}.${k} belongs to a dynamic combo`); continue; }
      const s = all[k]; assert.ok(s, `${label}: ${n.class_type}.${k} is an input ComfyUI knows`);
      if (isLink(v)) { assert.ok(g[v[0]], `${label}: ${n.class_type}.${k} links to node ${v[0]}`);
        const outT = OI[g[v[0]].class_type].output[v[1]]; const inT = String(s[0]); assert.ok(outT != null, `${label}: ${v[0]} has output ${v[1]}`);
        if (!/MATCHTYPE|\*/.test(inT) && !Array.isArray(s[0])) assert.ok(inT.split(',').includes(outT), `${label}: ${n.class_type}.${k} (${inT}) takes ${g[v[0]].class_type}[${v[1]}] (${outT})`); continue; }
      if (v && typeof v === 'object' && '__file' in v) { assert.ok(['LoadImage', 'LoadVideo'].includes(n.class_type), `${label}: only Load Image / Load Video take a file`); continue; }
      const [type, o = {}] = s;
      if (Array.isArray(type)) { if (type.length) assert.ok(type.includes(v), `${label}: ${n.class_type}.${k}=${v} is one of ComfyUI's choices`); continue; }
      if (type === 'COMBO' || /DYNAMICCOMBO/.test(type)) { const opts = (o.options ?? []).map((x: any) => (typeof x === 'object' ? x.key : x)); if (opts.length) assert.ok(opts.includes(v), `${label}: ${n.class_type}.${k}=${v} is an option`); continue; }
      if (/^(INT|FLOAT)/.test(type)) { assert.equal(typeof v, 'number', `${label}: ${n.class_type}.${k} is a number`); if (o.min != null) assert.ok(v >= o.min, `${label}: ${k} ≥ min`); if (o.max != null) assert.ok(v <= o.max, `${label}: ${k} ≤ max`); continue; }
      if (type === 'STRING') { assert.equal(typeof v, 'string', `${label}: ${n.class_type}.${k} is text`); continue; }
      if (type === 'BOOLEAN') { assert.equal(typeof v, 'boolean'); continue; }
      assert.fail(`${label}: ${n.class_type}.${k} is a link type (${type}) but holds a value`);
    }
  }
}
const raw = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', '..', 'workflows', S.FOOTAGE_FX_WORKFLOW), 'utf8'));
validate(raw, 'workflow as saved');
assert.equal(raw['1'].class_type, 'UnetLoaderGGUF'); assert.ok(!/fp8|int8|nvfp4/i.test(JSON.stringify(raw)), 'Mac-safe files only');
assert.equal(raw['37'].inputs.sigmas.split(',').length - 1, 8, 'stage 1: 8 distilled steps'); assert.equal(raw['55'].inputs.sigmas.split(',').length - 1, 3, 'stage 2: 3 steps');
for (const id of ['32', '52']) { assert.equal(raw[id].class_type, 'LTXVAddGuide'); assert.deepEqual(raw[id].inputs.image, ['21', 0], 'the source clip guides both stages'); assert.deepEqual(raw[id].inputs.iclora_parameters, ['3', 0]); assert.equal(raw[id].inputs.frame_idx, 0); }
assert.deepEqual(raw['3'].inputs.iclora_model, ['2', 0], 'IC-LoRA parameters read the effect LoRA loader'); for (const id of ['38', '56']) assert.deepEqual(raw[id].inputs.model, ['2', 0]);
assert.deepEqual(raw['50'].inputs.samples, ['41', 2], 'guides cropped before the upscale'); assert.deepEqual(raw['60'].inputs.samples, ['59', 2], 'and before decode');
const plan = S.footageFxPlan({ width: 1920, height: 1080, seconds: 6 })!;
for (const e of S.FOOTAGE_EFFECTS.filter((x) => !!x.lora) /* every effect with a local place (the Comfy Cloud graphs: test/ltx23-vfx-cloud.test.ts) */) for (const ff of [false, true]) {
  const l = LTX_LORAS[e.lora]; const { graph, output, expect } = patchLtx25IcLora(structuredClone(raw), { variant: 'effect', plan, prompt: S.footageFxPrompt(e, 'a street'), negative: e.negative, lora: { file: l.file, strength: e.strength }, source: { __file: '/tmp/s.mp4' }, ...(ff ? { firstFrame: { __file: '/tmp/f.png' } } : {}) });
  validate(graph, `${e.id}${ff ? ' + first frame' : ''}`); assert.equal(output, '63'); assert.equal(graph['2'].inputs.lora_name, l.file); assert.equal(graph['2'].inputs.strength_model, e.strength);
  assert.equal(expect.firstFrame, ff); assert.equal(!!graph['24'], ff, 'first-frame nodes only when asked'); if (!ff) assert.deepEqual(graph['32'].inputs.latent, ['30', 0]); else assert.deepEqual(graph['52'].inputs.latent, ['25', 0]);
}
for (const v of ['ripple', 'motion', 'outpaint', 'inpaint'] as const) { assert.equal(IC_LORA_VARIANTS[v].built, false); assert.throws(() => patchLtx25IcLora(structuredClone(raw), { variant: v, plan, prompt: '', lora: { file: 'x', strength: 1 }, source: 'x' }), /not built yet/); }
assert.throws(() => patchLtx25IcLora(structuredClone(raw), { variant: 'effect', plan, prompt: '', lora: { file: 'x', strength: 1 }, source: null }), /source clip/);
ok('graph: validates against the user\'s /object_info for every effect (± first frame); guide + IC-LoRA parameters on both stages; later variants are stubs');

// ---- 2. plan maths ----
assert.deepEqual([plan.width, plan.height, plan.stage1.width, plan.stage1.height, plan.frames, plan.seconds, plan.trimmed], [768, 448, 384, 224, 49, 2, true], 'default: Draft 2 s, 49 frames, first seconds of a long clip');
assert.deepEqual(S.FOOTAGE_FX_SECONDS.map(S.footageFxFrames), [49, 73, 97, 121], '8k + 1 frames');
for (const f of [49, 73, 97, 121]) assert.equal((f - 1) % 8, 0);
const p5 = S.footageFxPlan({ width: 720, height: 1280, seconds: 10 }, { seconds: 5, resolution: '576p' })!; assert.deepEqual([p5.width, p5.height, p5.frames, p5.aspect], [576, 1024, 121, '9:16'], 'Sharper 9:16, 5 s cap');
const pS = S.footageFxPlan({ width: 1280, height: 720, seconds: 1.5 }, { seconds: 5 })!; assert.deepEqual([pS.frames, pS.seconds, pS.trimmed], [33, 1.3, false], 'a short clip gives what it has, snapped down');
assert.equal(S.footageFxPlan({ width: 1280, height: 720, seconds: 0.5 }), null, 'too short'); assert.equal(S.footageFxPlan({ width: 1000, height: 1000, seconds: 3 })!.aspect, '1:1');
assert.equal(S.footageFxPlan({ width: 1280, height: 720, seconds: 3 }, { seconds: 7, resolution: '4k' })!.frames, 49, 'unknown picks fall back to the defaults');
{ const e2 = S.footageFxEtaSeconds(plan); const mid = (e2.low + e2.high) / 2; assert.ok(mid > 420 && mid < 540, `2 s Draft ≈ 8 min (${mid})`); const e5 = S.footageFxEtaSeconds(S.footageFxPlan({ width: 1280, height: 720, seconds: 9 }, { seconds: 5 })!); assert.ok((e5.low + e5.high) / 2 > 1000, '5 s Draft ≈ 19 min'); }
assert.ok((etaFor(tool, { providerId: P }).eta.byGpu as any).mseries['448p'] > 0, 'timing anchor for the Mac');
const ca = conformSourceArgs('in.mp4', 'out.mp4', plan); assert.ok(ca.join(' ').includes('fps=24,scale=768:448:force_original_aspect_ratio=increase:flags=lanczos,crop=768:448'));
assert.deepEqual(ca.slice(ca.indexOf('-frames:v'), ca.indexOf('-frames:v') + 2), ['-frames:v', '49']); assert.ok(ca.includes('0:a:0?') && !ca.includes('-an'), 'the sound is kept');
ok('plan: Draft / Sharper sizes on the 32 grid, 8k + 1 frames, ≤ 5 s, short and long clips, honest ETA, conform args');

// ---- 3. prompts, registry, names ----
const fx = (id: string) => S.footageEffect(id)!;
assert.match(S.footageFxPrompt(fx('flood'), 'A cyclist on a street.'), /^Reference shows a cyclist on a street\. Edited shows the same scene with water added\.\nADD WATER /);
assert.match(S.footageFxPrompt(fx('rain'), ''), /^Reference shows the scene in the source video\./); assert.equal(fx('rain').negative, '', 'water: no negative prompt (card)');
assert.equal(S.footageFxPrompt(fx('alpha-matte'), 'anything'), '', 'Alpha matte: empty prompt'); assert.match(S.footageFxPrompt(fx('vanish'), 'a busy square.'), /^An empty clean plate of the exact same location: a busy square, identical background/);
assert.match(S.footageFxPrompt(fx('vanish'), ''), /^An empty clean plate of the exact same location: identical background.*no people/, 'Clean Plate card: describe the empty result');
assert.match(S.footageFxPrompt(fx('day-to-night'), ''), /^A realistic nighttime scene\. A dark night sky.*Only the lighting changes from day to night; identical composition, framing, camera movement and motion\.$/);
assert.match(S.footageFxPrompt(fx('day-to-night'), 'a cafe on a corner'), /^A realistic nighttime scene\. A cafe on a corner\. A dark/);
assert.match(S.footageFxPrompt(fx('flood'), ''), /\nSubject identity, clothing, framing, and background geometry are identical to the reference; only water-related elements differ between reference and edited\.$/);
assert.equal(S.footageFxPrompt(fx('extend-frame'), ''), ''); assert.equal(S.footageFxPrompt(fx('extend-frame'), 'a beach'), 'A beach.');
assert.ok(fx('flood').strength > fx('rain').strength && fx('flood').lora === fx('rain').lora, 'rain and flood: one water LoRA, two strengths');
for (const id of ['clean-plate', 'day-to-night', 'water-simulation', 'alpha-gen']) { const l = LTX_LORAS[id]; assert.ok(l.ic && l.strengths.v2v && l.bytes > 1e8 && /^ltx-2\.5-22b-ic-lora-/.test(l.file), id); }
assert.equal(LTX_LORAS['water-simulation'].trigger, 'ADD WATER');
assert.deepEqual(ltxLorasForJob('footage-fx', P, { types: ['flood'] }), [{ id: 'water-simulation', file: LTX_LORAS['water-simulation'].file, strength: 1.3 }]);
assert.deepEqual(ltxLorasForJob('footage-fx', P, { types: '["vanish"]' }).map((l) => l.id), ['clean-plate']); assert.deepEqual(ltxLorasForJob('footage-fx', 'comfy-open', { types: ['vanish'] }), []);
assert.equal(modelNameForRun('footage-fx', P, { types: ['day-to-night'] }), 'LTX-2.5 22B + Day to Night IC-LoRA', 'the real model is named');
assert.ok((tool.presets ?? []).every((p: any) => p.modelName?.startsWith(S.isCloudOnly(S.footageEffect(p.id)) ? 'LTX-2.3 22B + ' : 'LTX-2.5 22B + ') && p.providers?.includes(P)), 'every effect card names its model');
assert.ok(VIDEO_BARS['footage-fx'] && videoWorkflowById('footage-fx')?.toolId === 'footage-fx', 'a Video page workflow with its bar recipe');
ok('prompts per the cards, four IC-LoRAs registered, the real model on every card and job');

// ---- 4. parseInput + plan ----
const clip = path.join(D, 'clip.mp4'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '3', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', clip]);
const still = path.join(D, 'still.png'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:size=640x480', '-frames:v', '1', still]);
const small = path.join(D, 'small.mp4'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=24', '-t', '2', '-pix_fmt', 'yuv420p', small]);
const parse = (f: Record<string, string>, files: Record<string, string[]> = { video: ['clip.mp4'] }) => tool.parseInput({ types: '["vanish"]', ...f }, files) as Promise<any>;
const r = await parse({ prompt: 'a cyclist on a sunny street', duration: '2' });
assert.ok(!r.error, r.error); assert.equal(r.footageFx.lora.file, LTX_LORAS['clean-plate'].file); assert.equal(r.compareUrl, r.videoUrl, 'the compare\'s "before" is the conformed source');
const probe = (f: string) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-show_entries', 'stream=codec_type,width,height,nb_read_frames,r_frame_rate', '-of', 'json', f]).toString()).streams;
const st = probe(r.videoPath); const v = st.find((s: any) => s.codec_type === 'video');
assert.deepEqual([v.width, v.height, Number(v.nb_read_frames), v.r_frame_rate], [768, 448, 49, '24/1'], 'conformed: 768×448, 49 frames, 24 fps'); assert.ok(st.some((s: any) => s.codec_type === 'audio'), 'with its sound');
assert.equal(r.duration, 2); assert.equal(r.resolution, '448p'); assert.equal(r.hasAudio, true); assert.match(r.warnings.join(' '), /first 2 s/);
assert.equal((await parse({}, {})).code, 'required'); assert.equal((await parse({ types: '["nope"]' })).code, 'unknown_effect');
assert.equal((await parse({ duration: '9' })).code, 'invalid_duration'); assert.equal((await parse({}, { video: ['still.png'] })).code, 'format'); assert.equal((await parse({}, { video: ['small.mp4'] })).code, 'too_small');
const rm = await parse({ types: '["alpha-matte"]', prompt: 'a dancer', resolution: '576p', duration: '5' }); assert.equal(rm.finalPrompt, ''); assert.match(rm.warnings.join(' '), /3(\.0)? s/); assert.equal(rm.width, 1024);
const J = (input: any) => ({ id: 'j', toolId: 'footage-fx', provider: P, input });
assert.equal(hasPlan(J(r)), true); assert.equal(hasPlan(J({ ...r, footageFx: undefined })), false); assert.equal(hasPlan({ ...J(r), provider: 'comfy-open' }), false);
const pl = buildPlan(J(r)); const g = pl.passes[0].graph; validate(g, 'job graph');
assert.equal(pl.muxSourceAudio, true, 'the clip\'s own sound goes back on'); assert.equal(buildPlan(J({ ...r, keepAudio: false })).muxSourceAudio, false);
assert.deepEqual(g['20'].inputs.file, { __file: r.videoPath }); assert.deepEqual([g['30'].inputs.width, g['30'].inputs.height, g['30'].inputs.length], [384, 224, 49]);
assert.match(g['10'].inputs.text, /location: a cyclist on a sunny street, identical background/); assert.match(g['11'].inputs.text, /people/); assert.equal(g['22'], undefined, 'no first frame for effects');
const gf = buildPlan(J((await parse({ types: '["flood"]' })))).passes[0].graph; assert.equal(gf['2'].inputs.strength_model, 1.3); assert.match(gf['10'].inputs.text, /ADD WATER/); assert.equal(gf['11'].inputs.text, '');
ok('parseInput conforms the clip (size, 49 frames, 24 fps, sound), refuses bad input; the plan loads the effect LoRA and muxes the sound back');

// ---- 4b. local stays as it was for the four effects that also run on Comfy Cloud (2026-11-01: Cloud is an added place, not a replacement) ----
{ const { routesFor } = await import('../src/routing/routes.js'); const loc = routesFor(P, tool).find((q) => q.kind === 'local')!; assert.ok(loc, 'a local route');
  const silent = path.join(D, 'silent.mp4'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=24', '-t', '3', '-pix_fmt', 'yuv420p', silent]);
  const LORA: Record<string, string> = { vanish: 'clean-plate', 'day-to-night': 'day-to-night', rain: 'water-simulation', flood: 'water-simulation' };
  for (const [id, lid] of Object.entries(LORA)) { const e = fx(id); assert.ok(e.cloud && e.lora === lid && !S.isCloudOnly(e), `${id}: both places`);
    assert.equal(loc.unavailableFor?.({ types: [id] }) ?? null, null, `${id}: the local route takes it`);
    const j = await parse({ types: JSON.stringify([id]), prompt: 'a street' }); assert.ok(!j.error, j.error);
    assert.equal(j.footageFx.lora.file, LTX_LORAS[lid].file, `${id}: the local LTX-2.5 LoRA`); assert.equal(j.footageFx.cloud, undefined); assert.equal(j.cloudVideoPath, undefined, 'a clip with sound: one conformed copy');
    assert.equal(j.footageFx.modelName, `LTX-2.5 22B + ${LTX_LORAS[lid].label}`); assert.equal(modelNameForRun('footage-fx', P, { types: [id] }), `LTX-2.5 22B + ${LTX_LORAS[lid].label}`);
    assert.equal(hasPlan(J(j)), true); const gl = buildPlan(J(j)).passes[0].graph; validate(gl, `${id} local job`);
    assert.equal(gl['2'].inputs.lora_name, LTX_LORAS[lid].file); assert.equal(gl['2'].inputs.strength_model, e.strength); assert.deepEqual(gl['20'].inputs.file, { __file: j.videoPath });
    const js = await parse({ types: JSON.stringify([id]) }, { video: ['silent.mp4'] }); assert.ok(!js.error, js.error);
    assert.ok(!probe(js.videoPath).some((x: any) => x.codec_type === 'audio'), `${id}: the local copy of a silent clip is left silent (as before)`);
    assert.deepEqual(buildPlan(J(js)).passes[0].graph['20'].inputs.file, { __file: js.videoPath }, 'the local graph reads the local copy');
    assert.ok(js.cloudVideoPath && probe(js.cloudVideoPath).some((x: any) => x.codec_type === 'audio'), `${id}: Comfy Cloud gets its own copy with a silent track`); }
  assert.match(String(loc.unavailableFor?.({ types: ['restore'] })), /runs on Comfy Cloud/, 'Cloud-only effects stay off the local route'); }
ok('local unchanged for Vanish, Day to night, Rain and Flood: the local route takes them, LTX-2.5 LoRA + strength in the local graph, a silent clip stays silent locally');

// ---- 5. requirements + mock run ----
const req = R.requirementsFor(tool, P, { types: ['rain'], resolution: '448p' })!;
assert.ok(req.workflows.includes(`workflows/${S.FOOTAGE_FX_WORKFLOW}`));
const BASE = 13584703872 + 26263858182 + 1452269922 + 364866540 + 995778752; // GGUF, Gemma, video VAE, audio VAE, x2 upscaler (manifest rows)
assert.equal(req.downloadBytes, BASE + LTX_LORAS['water-simulation'].bytes, 'Files needed: the shared files + the effect\'s own LoRA (not the graph\'s default Clean Plate)');
assert.equal(R.requirementsFor(tool, P, { types: ['vanish'], resolution: '448p' })!.downloadBytes, BASE + LTX_LORAS['clean-plate'].bytes);
const { jobs } = await import('../src/jobs.js');
const job: any = { id: 'ffxjob', toolId: 'footage-fx', provider: P, status: 'queued', input: r, createdAt: Date.now() }; jobs.set(job.id, job);
await tool.run(job); assert.equal(job.status, 'done', job.error); assert.match(job.outputs[0].label, /Vanish \(sample\)/);
const out = probe(path.join(D, job.outputs[0].url.slice(7))); assert.ok(out.some((s: any) => s.codec_type === 'audio'), 'the sample keeps the clip\'s sound');
ok('requirements list the effect LoRA; the mock run makes a labelled sample with the clip\'s sound');
fs.rmSync(D, { recursive: true, force: true });
