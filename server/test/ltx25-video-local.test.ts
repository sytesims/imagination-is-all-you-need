// LTX-2.5 22B, the free local route on Generate Video with LTX's own sound (2026-10-25). In-process, temp data dir, mock backend, no network, nothing queued.
// 1 the graphs (text, image, first + last frame) validate against a saved, trimmed ComfyUI /object_info (test/fixtures/object-info-ltx25-video.json):
//   node classes, inputs, combos, numeric steps, links point at real nodes AND at an output of the right type
// 2 the plan: frames 8n + 1 at 24 fps, both stages on the 32 grid (stage 1 = half), sound kept, mode switching, first / last frame guide indexes;
//   Loop (2026-10-26): the start frame at both ends, the repeated last frame and its sound cut (ImageFromBatch + TrimAudioDuration)
// 3 caps + parsing: t2v / i2v / flf, 2–5 s (3 s default), Draft / Sharper, sound on by default; missing start or end frame refused; free local route
// 3b Transitions: Morph on LTX-2.5 22B (2026-10-26): official FLF credit, plan, 2–5 s, end image required
// 4 requirements: the five LTX files ("Files needed / Download"), runs on Apple MPS; first Mac ETA estimate
// Run: npx tsx test/ltx25-video-local.test.ts
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'ltx25v-')); const MODELS = path.join(D, 'models'); fs.mkdirSync(MODELS);
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'none.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0',
  OPENHIGGSFIELD_HW_MOCK: JSON.stringify({ gpu: { name: 'Apple M1 Max', type: 'mps' }, ramGB: 64 }) });
delete process.env.COMFY_BASE_URL; delete process.env.OPENHIGGSFIELD_COMFY_MODELS_DIR;
const { buildPlan, hasPlan } = await import('../src/comfy/plans.js');
const { ltxVideoFrames, ltx25Size, LTX25_VIDEO } = await import('../src/comfy/ltx25Video.js');
const { VIDEO_LIMITS, durationsFor } = await import('../src/tools/h3/videoCaps.js');
const { routesFor } = await import('../src/routing/routes.js');
const { getTool } = await import('../src/tools/registry.js');
const R = await import('../src/hardware/requirements.js');
const HW = await import('../src/hardware.js');
const { getProvider } = await import('../src/providers.js');
const ok = (m: string) => console.log('ok ' + m);
const P = LTX25_VIDEO; const tool = getTool('h3-video')!;

// ---- 1. graphs vs the saved /object_info ----
const OI: Record<string, any> = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'object-info-ltx25-video.json'), 'utf8'));
const isLink = (v: any) => Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && typeof v[1] === 'number';
function validate(g: Record<string, any>, label: string) {
  for (const [id, n] of Object.entries<any>(g)) {
    const spec = OI[n.class_type]; assert.ok(spec, `${label}: node ${id} class ${n.class_type} exists in ComfyUI`);
    const all = { ...(spec.input.required ?? {}), ...(spec.input.optional ?? {}) };
    for (const k of Object.keys(spec.input.required ?? {})) assert.ok(k in n.inputs, `${label}: ${n.class_type}.${k} (required) is set`);
    for (const [k, v] of Object.entries<any>(n.inputs)) {
      if (k.includes('.')) { const parent = all[k.split('.')[0]]; assert.ok(parent && /DYNAMICCOMBO/.test(String(parent[0])), `${label}: ${n.class_type}.${k} belongs to a dynamic combo`); continue; }
      const s = all[k]; assert.ok(s, `${label}: ${n.class_type}.${k} is an input ComfyUI knows`);
      const [type, o = {}] = s;
      if (isLink(v)) { const src = g[v[0]]; assert.ok(src, `${label}: ${n.class_type}.${k} links to node ${v[0]}, which is in the graph`);
        const out = OI[src.class_type].output[v[1]]; const want = Array.isArray(type) ? 'COMBO' : String(type);
        assert.ok(out === want || want.split(',').includes(out) || /MATCHTYPE/.test(want), `${label}: ${n.class_type}.${k} (${want}) ← ${src.class_type}[${v[1]}] (${out})`); continue; }
      if (v && typeof v === 'object' && '__file' in v) { assert.equal(n.class_type, 'LoadImage', `${label}: only Load Image takes an uploaded file`); continue; }
      if (Array.isArray(type)) { if (type.length) assert.ok(type.includes(v), `${label}: ${n.class_type}.${k}=${v} is one of ComfyUI's choices`); continue; }
      if (type === 'COMBO' || /DYNAMICCOMBO/.test(type)) { const opts = (o.options ?? []).map((x: any) => (typeof x === 'object' ? x.key : x)); assert.ok(opts.includes(v), `${label}: ${n.class_type}.${k}=${v} is an option`); continue; }
      const t = /FLOAT/.test(type) ? 'FLOAT' : type;
      if (t === 'INT' || t === 'FLOAT') { assert.equal(typeof v, 'number', `${label}: ${n.class_type}.${k} is a number`); if (o.min != null) assert.ok(v >= o.min, `${label}: ${k} ≥ min`); if (o.max != null) assert.ok(v <= o.max, `${label}: ${k} ≤ max`);
        if (t === 'INT' && o.step > 1) assert.equal((v - (o.min ?? 0)) % o.step, 0, `${label}: ${n.class_type}.${k}=${v} on its step ${o.step}`); continue; }
      if (t === 'BOOLEAN') { assert.equal(typeof v, 'boolean', `${label}: ${n.class_type}.${k} is a boolean`); continue; }
      if (t === 'STRING') { assert.equal(typeof v, 'string', `${label}: ${n.class_type}.${k} is text`); continue; }
      assert.fail(`${label}: ${n.class_type}.${k} is a link type (${type}) but holds a value`);
    }
  }
}
const IMG = path.join(import.meta.dirname, 'fixtures', 'ref-512.png'); const IMG2 = path.join(D, 'end.png'); fs.copyFileSync(IMG, IMG2);
const job = (input: Record<string, any>) => ({ id: 'j', toolId: 'h3-video', provider: P, input: { prompt: 'a lighthouse at dusk, waves crash, gulls cry', seed: 7, duration: 3, resolution: '448p', aspect: '16:9', ...input } });
const byClass = (g: Record<string, any>, c: string) => Object.entries<any>(g).filter(([, n]) => n.class_type === c);
const FILES = ['ltx-2.5-22b-distilled-Q4_K_M.gguf', 'gemma4-12b-with-proj-ltx-2.5-bf16.safetensors', 'ltx-2.5-video-vae-conv-bf16.safetensors', 'ltx-2.5-audio-vae-bf16.safetensors', 'ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors'];
function common(plan: any, label: string, w: number, h: number, frames: number) {
  const g = plan.passes[0].graph; validate(g, label);
  assert.equal(plan.passes.length, 1); assert.equal(plan.outKind, 'video'); assert.equal(plan.muxSourceAudio, false, `${label}: no source clip to mux`);
  const [lat] = byClass(g, 'EmptyLTXVLatentVideo'); assert.deepEqual([lat[1].inputs.width, lat[1].inputs.height, lat[1].inputs.length], [w / 2, h / 2, frames], `${label}: stage 1 at half size, ${frames} frames`);
  assert.equal(lat[1].inputs.width % 32, 0); assert.equal(lat[1].inputs.height % 32, 0); assert.equal((frames - 1) % 8, 0, `${label}: 8n + 1 frames`);
  const [aud] = byClass(g, 'LTXVEmptyLatentAudio'); assert.deepEqual([aud[1].inputs.frames_number, aud[1].inputs.frame_rate], [frames, 24], `${label}: audio latent matches the clip`);
  // sound kept: the saved video is CreateVideo(images, audio ← LTX audio VAE decode)
  const out = g[plan.passes[0].output]; assert.equal(out.class_type, 'SaveVideo'); const cv = g[out.inputs.video[0]]; assert.equal(cv.class_type, 'CreateVideo'); assert.equal(cv.inputs.fps, 24);
  assert.equal(g[cv.inputs.audio[0]].class_type, 'LTXVAudioVAEDecode', `${label}: LTX's own sound goes into the saved video`);
  assert.deepEqual(byClass(g, 'ManualSigmas').map(([, n]) => n.inputs.sigmas.split(',').length - 1).sort(), [3, 8], `${label}: 8 + 3 distilled steps`);
  assert.ok(byClass(g, 'LTXVDualCFGGuider').every(([, n]) => n.inputs.video_cfg === 1 && n.inputs.audio_cfg === 1), `${label}: CFG 1`);
  assert.equal(byClass(g, 'LTXVLatentUpsampler').length, 1, `${label}: one x2 latent upscale`);
  const loaders = [...byClass(g, 'UnetLoaderGGUF').map(([, n]) => n.inputs.unet_name), ...byClass(g, 'CLIPLoader').map(([, n]) => n.inputs.clip_name), ...byClass(g, 'VAELoader').map(([, n]) => n.inputs.vae_name), ...byClass(g, 'LatentUpscaleModelLoader').map(([, n]) => n.inputs.model_name)];
  assert.deepEqual(loaders.sort(), [...FILES].sort(), `${label}: the files we already have, nothing new`);
  assert.ok(byClass(g, 'RandomNoise').some(([, n]) => n.inputs.noise_seed === 7), `${label}: seed from the job`);
  return g;
}
assert.equal(hasPlan(job({ mode: 't2v' })), true, 'Generate Video on LTX-2.5 22B has a local plan');
assert.equal(hasPlan({ ...job({ mode: 't2v' }), toolId: 'app-ugc-ad' }), false, 'not on the Generate Video apps');
const t2v = buildPlan(job({ mode: 't2v' })); const g1 = common(t2v, 't2v', 768, 448, 73);
assert.equal(t2v.passes[0].workflow, 'ltx25-ti2v-api.json'); assert.equal(byClass(g1, 'LoadImage').length, 0, 't2v: no image nodes'); assert.equal(byClass(g1, 'LTXVImgToVideoInplace').length, 0);
assert.deepEqual(g1['377'].inputs.video_latent, ['356', 0]); assert.deepEqual(g1['340'].inputs.video_latent, ['348', 0]); assert.equal(g1['364'].inputs.text, 'a lighthouse at dusk, waves crash, gulls cry');
const i2v = buildPlan(job({ mode: 'i2v', imagePath: IMG, aspect: '9:16', resolution: '576p', duration: 5 })); const g2 = common(i2v, 'i2v', 576, 1024, 121);
assert.deepEqual(g2['395'].inputs.image, { __file: IMG }); assert.deepEqual([g2['351'].inputs.width, g2['351'].inputs.height, g2['351'].inputs.crop], [576, 1024, 'center'], 'i2v: start frame fitted to the output size');
assert.deepEqual(byClass(g2, 'LTXVImgToVideoInplace').map(([, n]) => n.inputs.strength).sort(), [0.7, 1], 'i2v: start frame on both stages (0.7, then 1.0), as the template');
const i2vAuto = buildPlan(job({ mode: 'i2v', imagePath: IMG, imageSize: { width: 1080, height: 1920 }, aspect: 'auto' })); common(i2vAuto, 'i2v auto', 448, 768, 73);
const flf = buildPlan(job({ mode: 'flf', imagePath: IMG, lastFramePath: IMG2, aspect: '1:1', duration: 2 })); const g3 = common(flf, 'flf', 512, 512, 49);
assert.equal(flf.passes[0].workflow, 'ltx25-flf-api.json'); assert.equal(flf.passes[0].output, '68');
assert.deepEqual(g3['31'].inputs.image, { __file: IMG }); assert.deepEqual(g3['39'].inputs.image, { __file: IMG2 });
const guides = byClass(g3, 'LTXVAddGuide').map(([, n]) => [g3[g3[n.inputs.image[0]].inputs.image[0]].inputs.image[0], n.inputs.frame_idx, n.inputs.strength]);
assert.deepEqual(guides.sort(), [['31', 0, 0.7], ['31', 0, 1], ['39', -1, 0.7], ['39', -1, 1]].sort(), 'flf: first frame at index 0, last frame at -1, on both stages');
assert.equal(byClass(g3, 'LTXVCropGuides').length, 2, 'flf: guides cropped before the upscale and before decode');
assert.equal(g3[g3['219'].inputs.samples[0]].class_type, 'LTXVCropGuides', 'flf: decode reads the cropped latent');
assert.throws(() => buildPlan(job({ mode: 'flf', imagePath: IMG })), /both pictures/, 'flf without the last frame is refused by the plan too');
// Loop (2026-10-26): the FLF graph, the start frame at both ends (one Load Image), the repeated last frame and its sound cut
const loopPlan = buildPlan(job({ mode: 'i2v', loop: true, imagePath: IMG, aspect: '9:16', duration: 2 })); const gl = loopPlan.passes[0].graph; validate(gl, 'loop');
assert.equal(loopPlan.passes[0].workflow, 'ltx25-flf-api.json', 'loop: runs the first + last frame graph'); assert.equal(loopPlan.passes[0].output, '68');
assert.deepEqual(byClass(gl, 'LoadImage').map(([, n]) => n.inputs.image), [{ __file: IMG }], 'loop: one start frame, uploaded once');
const lguides = byClass(gl, 'LTXVAddGuide').map(([, n]) => [n.inputs.image[0], n.inputs.frame_idx, n.inputs.strength]);
assert.deepEqual(lguides.sort(), [['199', -1, 0.7], ['199', -1, 1], ['199', 0, 0.7], ['199', 0, 1]].sort(), 'loop: the start frame guides frame 0 and the last frame, on both stages');
const [lat] = byClass(gl, 'EmptyLTXVLatentVideo'); assert.deepEqual([lat[1].inputs.width, lat[1].inputs.height, lat[1].inputs.length], [224, 384, 49], 'loop: 2 s renders 49 frames (9:16 Draft)');
const lcv = gl[gl['68'].inputs.video[0]]; const cut = gl['900']; const trim = gl[lcv.inputs.audio[0]];
assert.deepEqual([cut.class_type, cut.inputs.batch_index, cut.inputs.length, gl[cut.inputs.image[0]].class_type], ['ImageFromBatch', 0, 48, 'VAEDecodeTiled'], 'loop: the repeated last frame is dropped (48 of 49 kept)');
assert.deepEqual([trim.class_type, trim.inputs.start_index, trim.inputs.duration, gl[trim.inputs.audio[0]].class_type], ['TrimAudioDuration', 0, 2, 'LTXVAudioVAEDecode'], 'loop: LTX’s sound cut to the same 2.0 s');
assert.deepEqual([loopPlan.passes[0].expect.loop, loopPlan.passes[0].expect.framesKept], [true, 48]);
// drift fix (2026-10-26): frames 0–39 as rendered, the 8-frame tail colour-matched back to frame 0 (ramped), the last 3 crossfaded into frame 0
{ const ct = byClass(gl, 'ColorTransfer'); assert.equal(ct.length, 1); const c = ct[0][1].inputs;
  assert.deepEqual([c.method, c.source_stats, c['source_stats.target_index'], gl[c.image_target[0]].inputs.batch_index, gl[c.image_target[0]].inputs.length, gl[c.image_ref[0]].inputs.batch_index], ['reinhard_lab', 'target_frame', 7, 40, 8, 0], 'colour: the tail’s last frame matched to frame 0');
  // walk the ImageBatch chain from the saved video back to the head: 40 + 8 frames, in order
  const parts: any[] = []; let n = gl[lcv.inputs.images[0]]; while (n.class_type === 'ImageBatch') { parts.unshift(gl[n.inputs.image2[0]]); n = gl[n.inputs.image1[0]]; }
  assert.deepEqual([n.inputs.batch_index, n.inputs.length, gl[n.inputs.image[0]] === cut], [0, 40, true], 'head: frames 0–39 untouched'); assert.equal(parts.length, 8, 'then 8 tail frames');
  const colour = parts.map((p) => (p.inputs.image2[0] === '903' ? gl[p.inputs.image1[0]] : p).inputs.blend_factor); assert.deepEqual(colour, [0.13, 0.25, 0.38, 0.5, 0.63, 0.75, 0.88, 1], 'colour fix grows to 100% at the end');
  const xf = parts.filter((p) => p.inputs.image2[0] === '903').map((p) => p.inputs.blend_factor); assert.deepEqual(xf, [0.25, 0.5, 0.75], 'last 3 frames crossfade into frame 0 (≤ 4: no ghosting)');
  assert.deepEqual(loopPlan.passes[0].expect.loopFix, { tail: 8, crossfade: 3 }); }
const loop5 = buildPlan(job({ mode: 'i2v', loop: true, imagePath: IMG, resolution: '576p', duration: 5 })).passes[0].graph; validate(loop5, 'loop 5 s Sharper');
assert.deepEqual([loop5['900'].inputs.length, loop5['901'].inputs.duration, loop5['902'].inputs.length, loop5['904'].inputs.batch_index], [120, 5, 112, 112], 'loop: 5 s = 120 kept frames, 5.0 s of sound, tail 112–119');
assert.equal(buildPlan(job({ mode: 'i2v', imagePath: IMG })).passes[0].workflow, 'ltx25-ti2v-api.json', 'loop off: image to video unchanged');
assert.equal(byClass(buildPlan(job({ mode: 'flf', imagePath: IMG, lastFramePath: IMG2 })).passes[0].graph, 'ImageFromBatch').length, 0, 'plain first + last frame keeps every frame');
ok('graphs: t2v, i2v (+ auto aspect), flf, loop validate against the saved /object_info; frames 8n + 1, 32 grid, sound kept, guide indexes; loop cuts the repeated frame + sound');
assert.deepEqual([2, 3, 4, 5].map(ltxVideoFrames), [49, 73, 97, 121]);
for (const [res, a, w, h] of [['448p', '16:9', 768, 448], ['448p', '9:16', 448, 768], ['448p', '1:1', 512, 512], ['576p', '16:9', 1024, 576], ['576p', '9:16', 576, 1024], ['576p', '1:1', 768, 768]] as const) {
  const s = ltx25Size(res, a); assert.deepEqual([s.width, s.height], [w, h]); assert.equal(s.stage1.width % 32, 0); assert.equal(s.stage1.height % 32, 0); }
assert.deepEqual([ltx25Size('nope', undefined).width, ltx25Size('nope', undefined).height], [768, 448], 'unknown size → Draft 16:9');
ok('sizes: Draft / Sharper × 16:9 / 9:16 / 1:1, stage 1 on the 32 grid; frames 2–5 s = 49 / 73 / 97 / 121');

// ---- 3. caps + parsing ----
const L = VIDEO_LIMITS[P]; assert.ok(L, 'LTX-2.5 22B has a caps row');
assert.deepEqual(L.durations, [2, 3, 4, 5]); assert.equal(L.defaultSeconds, 3); assert.deepEqual(L.resolutions, ['448p', '576p', '720p', 'dfr'] /* 720p: the Comfy Cloud place only (2026-10-27); DFR (2026-10-29): Comfy Cloud, or local with its files */); assert.deepEqual(L.resolutionLabels, { '448p': 'Draft', '576p': 'Sharper', '720p': '720p', dfr: 'DFR' });
assert.equal(L.audio.supported, true); assert.equal(L.audio.default, true);
assert.equal((tool as any).app.videoLimits[P].quality, false, 'no Fast / Best toggle: fixed 8 + 3 steps'); assert.equal((tool as any).app.videoLimits['comfy-wan22-5b'].quality, undefined, 'Wan keeps its toggle'); assert.deepEqual(durationsFor('h3-video', P), [2, 3, 4, 5]);
assert.ok(tool.providers.includes(P), 'Generate Video offers it'); assert.deepEqual((tool as any).app.providerModes[P], ['t2v', 'i2v', 'flf']);
const routes = routesFor(P, tool); assert.deepEqual(routes.map((r) => r.routeId), [`local:${P}`, 'comfy-cloud:cloud-ltx25-video'], 'local + its Comfy Cloud twin (2026-10-27)'); const r0 = routes[0];
assert.equal(r0.routeId, `local:${P}`); assert.equal(r0.kind, 'local'); assert.equal(r0.priceRef, null, 'free');
assert.equal((r0.caps as any).audio, true); assert.deepEqual((r0.caps as any).resolutions, ['448p', '576p', 'dfr'] /* DFR: local when its files are here (2026-10-29) */); assert.match(String((r0.caps as any).note), /19 minutes/, 'honest speed line');
assert.equal(getProvider(P)?.kind, 'open-weights'); assert.deepEqual(getProvider(P)?.licenseParts, ['ltx-2x-community', 'apache-2.0']);
const parse = (f: Record<string, string>, files: Record<string, string[]> = {}) => tool.parseInput({ provider: P, prompt: 'waves crash on rocks', types: '["t2v"]', ...f }, files);
const okp: any = await parse({}); assert.ok(!('error' in okp), JSON.stringify(okp));
assert.deepEqual([okp.duration, okp.resolution, okp.frames, okp.fps, okp.audio], [3, '448p', 73, 24, true], 'defaults: 3 s Draft, 73 frames, sound on');
assert.notEqual(okp.keepAudio, false, 'never keepAudio:false (runNative would strip LTX’s sound)');
const p5: any = await parse({ duration: '5', resolution: '576p', aspect: '9:16' }); assert.equal(p5.frames, 121); assert.equal(p5.resolution, '576p');
const bad6: any = await parse({ duration: '6' }); assert.ok(!('error' in bad6) && bad6.duration !== 6 && (bad6.adjustNotes ?? []).some((n: string) => new RegExp(`Made at ${bad6.duration} s, the closest length`).test(n)), `6 s is made at the nearest length with a note (D5): ${JSON.stringify(bad6).slice(0, 300)}`);
const bad4k: any = await parse({ resolution: '1080p' }); assert.ok(!('error' in bad4k) && ['448p', '576p', '720p'].includes(bad4k.resolution) && (bad4k.adjustNotes ?? []).some((n: string) => /closest size/.test(n)), `1080p (not offered) is made at the nearest size this model offers (720p on the Comfy Cloud twin), with a note (D5): ${JSON.stringify(bad4k).slice(0, 200)}`);
const noImg: any = await parse({ types: '["i2v"]' }); assert.match(String(noImg.error), /needs an image/, 'image to video without a start frame is refused');
fs.copyFileSync(IMG, path.join(D, 'last.png'));
const noFirst: any = await parse({ types: '["flf"]' }, { lastFrame: ['last.png'] }); assert.match(String(noFirst.error), /needs an image/, 'last frame without a first frame is refused');
const off: any = await parse({ audio: '0' }); assert.equal(off.audio, false); assert.equal(off.audioOff, 'strip', 'Sound off = removed in our final encode');
fs.copyFileSync(IMG, path.join(D, 'start.png'));
assert.equal((tool as any).app.videoLimits[P].loop, true, 'the bar shows Loop for LTX-2.5 22B'); assert.equal((tool as any).app.videoLimits['comfy-wan22-5b'].loop, undefined, 'not for Wan');
const lp: any = await parse({ types: '["i2v"]', loop: '1', duration: '2' }, { image: ['start.png'] }); assert.ok(!('error' in lp), JSON.stringify(lp));
assert.deepEqual([lp.loop, lp.mode, lp.frames], [true, 'i2v', 48], 'loop: image to video + loop, 48 frames kept');
assert.match(lp.finalPrompt, /^animate the image\. waves crash on rocks\. Seamless loop: .*returns to exactly where it began/, 'loop: the prompt asks for motion that comes back');
const lpOff: any = await parse({ types: '["i2v"]', loop: '0' }, { image: ['start.png'] }); assert.equal(lpOff.loop, undefined); assert.doesNotMatch(lpOff.finalPrompt, /Seamless loop/, 'loop off: nothing added');
const lpNoImg: any = await parse({ loop: '1' }); assert.equal(lpNoImg.issues?.[0]?.field, 'loop'); assert.match(lpNoImg.error, /needs a start frame/, 'loop without a photo is refused');
const lpFlf: any = await parse({ types: '["flf"]', loop: '1' }, { image: ['start.png'], lastFrame: ['last.png'] }); assert.match(String(lpFlf.error), /remove the end frame/, 'loop with an end frame is refused');
const lpWan: any = await tool.parseInput({ provider: 'comfy-wan22-5b', prompt: 'x', types: '["i2v"]', loop: '1' }, { image: ['start.png'] }); assert.match(String(lpWan.error), /LTX-2\.5 22B/, 'loop on another model is refused (nothing runs)');
ok('caps + parsing: t2v / i2v / flf, 2–5 s (3 s default), Draft / Sharper, sound on; no start frame / last without first refused; free local route; Loop on / off / refused');

// ---- 3b. Transitions: Morph on LTX-2.5 22B (2026-10-26): the same FLF graph, credited to the official template video_ltx2_5_flf2v ----
{ const tr: any = getTool('app-transition')!; const { appWorkflowFor } = await import('../src/shared/appWorkflows.js');
  assert.ok(tr.providers.includes(P), 'Transitions offers LTX-2.5 22B'); assert.equal(tr.providers[0], 'comfy-h3', 'MiniMax H3 stays first');
  assert.ok(!getTool('app-ugc-ad')!.providers.includes(P), 'not on UGC Ad (15 s, no first + last frame)');
  assert.deepEqual(tr.app.videoLimits[P].durations, [2, 3, 4, 5]); assert.deepEqual(tr.app.resolutionsByProvider[P], ['448p', '576p', '720p', 'dfr']);
  const w = appWorkflowFor('app-transition', P)!; assert.deepEqual([w.source, w.file, w.url], ['official', 'ltx25-flf-api.json', 'https://github.com/Comfy-Org/workflow_templates/blob/main/templates/video_ltx2_5_flf2v.json'], 'credited to the official FLF template');
  fs.copyFileSync(IMG, path.join(D, 'from.png')); fs.copyFileSync(IMG, path.join(D, 'to.png'));
  const tp = (f: Record<string, string>, files: Record<string, string[]> = { image: ['from.png'], lastFrame: ['to.png'] }) => tr.parseInput({ provider: P, transition: 'morph', resolution: '448p', seed: '7', ...f }, files);
  const m: any = await tp({ duration: '2' }); assert.ok(!('error' in m), JSON.stringify(m));
  assert.deepEqual([m.mode, m.frames, m.audio, m.resolution], ['flf', 49, true, '448p'], 'morph: first + last frame, 2 s = 49 frames, with sound, Draft');
  assert.match(m.finalPrompt, /seamless transition.*morphs/, 'the transition type goes into the prompt');
  const mj = { id: 'm', toolId: 'app-transition', provider: P, input: m }; assert.equal(hasPlan(mj), true, 'Transitions on LTX-2.5 22B has a local plan');
  const mp = buildPlan(mj); const gm = common(mp, 'morph (Auto follows the square start image)', 512, 512, 49); assert.equal(mp.passes[0].workflow, 'ltx25-flf-api.json');
  assert.deepEqual([gm['31'].inputs.image, gm['39'].inputs.image], [{ __file: path.join(D, 'from.png') }, { __file: path.join(D, 'to.png') }], 'start image first, end image last');
  assert.equal(byClass(gm, 'ImageFromBatch').length, 0, 'morph keeps every frame (no loop cut)');
  const m5: any = await tp({ duration: '5', resolution: '576p', aspect: '9:16' }); common(buildPlan({ ...mj, input: m5 }), 'morph 5 s Sharper 9:16', 576, 1024, 121);
  const noEnd: any = await tp({}, { image: ['from.png'] }); assert.match(String(noEnd.error), /end image/i, 'missing end image refused');
  const m6: any = await tp({ duration: '6' }); assert.ok(!('error' in m6) && m6.duration !== 6 && (m6.adjustNotes ?? []).some((n: string) => /Made at \d+ s, the closest length/.test(n)), `6 s on LTX is made at the nearest length, with a note (D5): ${JSON.stringify(m6).slice(0, 200)}`);
  const rq = R.requirementsFor(tr, P, { mode: 'flf', resolution: '448p', duration: 2, types: ['flf'] })!; assert.ok(rq.workflows.includes('workflows/ltx25-flf-api.json'));
  const fitT = R.fitFor(tr, P, { mode: 'flf', resolution: '448p', duration: 2, types: ['flf'] }, HW.currentHardware(), rq); assert.equal(fitT.eta.estimateSeconds, 456, 'honest Mac time: 2 s Draft ≈ 8 min');
  assert.equal(routesFor(P, tr)[0].priceRef, null, 'free'); }
ok('Transitions: Morph on LTX-2.5 22B (official FLF template credit, 2–5 s, Draft / Sharper, with sound, end image required, ~8 min for 2 s)');

// ---- 4. requirements + Mac ----
const req = R.requirementsFor(tool, P, { mode: 't2v', resolution: '448p', duration: 3, types: ['t2v'] })!;
assert.deepEqual(req.workflows.sort(), ['workflows/ltx25-flf-api.json', 'workflows/ltx25-ti2v-api.json']);
assert.equal(req.downloadBytes, 13584703872 + 26263858182 + 1452269922 + 364866540 + 995778752, 'the five LTX files');
assert.notEqual(req.mps, 'red', 'runs on Apple MPS (GGUF + bf16)'); assert.equal(req.downloadable, true);
process.env.OPENHIGGSFIELD_COMFY_MODELS_DIR = MODELS; R.clearRequirementsCache();
const req2 = R.requirementsFor(tool, P, { mode: 'i2v', resolution: '448p', duration: 3, types: ['i2v'] })!;
assert.deepEqual(req2.missingFiles!.map((f) => f.file).sort(), [...FILES].sort(), 'missing files → Files needed lists the five files'); assert.equal(req2.missingBytesSource, 'checked');
const hw = HW.currentHardware(); const in5 = { mode: 't2v', resolution: '448p', duration: 5, types: ['t2v'] }; const fit = R.fitFor(tool, P, in5, hw, R.requirementsFor(tool, P, in5, hw));
assert.equal(fit.eta.estimateSeconds, 1140, 'first Mac estimate: 5 s Draft ≈ 19 min');
{ const FV = await import('../src/routing/fitView.js'); const inp = { mode: 't2v', resolution: '448p', duration: 3, types: ['t2v'] };
  const hb: any = FV.hwBlock(tool, P, inp); assert.equal(hb.fit.verdict, 'slow', 'slow on a Mac'); assert.equal(hb.fit.alternativeReason, 'weights_missing', 'missing files say "needs download" (like Wan), not slow');
  assert.ok(hb.fit.missingBytes > 4e10); assert.equal(hb.fit.downloadId, P);
  assert.equal(FV.alternativeReason({ verdict: 'too_heavy' }, { missingBytes: 1, missingBytesSource: 'checked' }), 'too_heavy', 'too heavy still wins: a download wouldn’t help');
  assert.equal(FV.alternativeReason({ verdict: 'slow' }, { missingBytes: 0, missingBytesSource: 'checked' }), 'slow', 'files present → slow'); }
ok('requirements: five LTX files (Files needed / Download), not blocked on a Mac, first ETA 19 min for 5 s Draft');

// ---- 5. shared LTX LoRA slot (2026-10-26): withLtxLoras + shared/ltxLoras.ts ----
{ const { withLtxLoras, LTX25_TI2V_WORKFLOW, LTX25_FLF_WORKFLOW } = await import('../src/comfy/ltx25Video.js');
  const LL = await import('../src/shared/ltxLoras.js'); const { ltxLoraList } = await import('../src/routesLtxLoras.js');
  const raw = (f: string) => JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', '..', 'workflows', f), 'utf8'));
  for (const [wf, unet] of [[LTX25_TI2V_WORKFLOW, '384'], [LTX25_FLF_WORKFLOW, '230']] as const) {
    const before = raw(wf); assert.deepEqual(withLtxLoras(raw(wf), []), before, `${wf}: no LoRA = graph untouched`);
    const g = withLtxLoras(raw(wf), [{ file: 'ltx-2.5-xpldv_v5-lora.safetensors', strength: 0.5 }, { file: 'ltx-2.5-22b-ic-lora-layout-to-render-1.0.safetensors', strength: 0.3 }]); validate(g, `${wf} + 2 LoRAs`);
    assert.deepEqual([g['950'].inputs.model, g['950'].inputs.strength_model, g['951'].inputs.model], [[unet, 0], 0.5, ['950', 0]], `${wf}: LoRAs chained after the GGUF loader`);
    const users = Object.entries<any>(g).filter(([id]) => !['950', '951'].includes(id)).flatMap(([, n]) => Object.values<any>(n.inputs).filter((v) => isLink(v) && g[v[0]].class_type !== 'LoraLoaderModelOnly' && OI[g[v[0]].class_type].output[v[1]] === 'MODEL'));
    assert.deepEqual(users, [], `${wf}: every model input reads the last LoRA`);
    assert.equal(byClass(g, 'LTXVDualCFGGuider').filter(([, n]) => n.inputs.model[0] === '951').length, 2, `${wf}: both stages use the LoRA`); }
  assert.throws(() => withLtxLoras({ '1': { class_type: 'VAELoader', inputs: {} } }, [{ file: 'x', strength: 1 }]), /UnetLoaderGGUF/);
  assert.deepEqual(LL.ltxLorasForJob('h3-video', P, { mode: 'i2v' }), [], 'plain Generate Video loads no LoRA');
  assert.deepEqual(byClass(buildPlan(job({ mode: 'i2v', imagePath: IMG })).passes[0].graph, 'LoraLoaderModelOnly'), [], 'Generate Video graph unchanged');
  assert.deepEqual([LL.LTX_LORAS.xpldv.strengths, Object.keys(LL.LTX_LORAS)], [{ i2v: 0.5, flf: 0.7 }, ['xpldv', 'clean-plate', 'day-to-night', 'water-simulation', 'alpha-gen']], 'author strengths; XPLDV + the four Footage Effects IC-LoRAs registered');
  assert.equal(LL.ltxLoraUse('xpldv', 't2v'), null, 'no strength for a mode = not offered');
  assert.match(LL.ltxLoraPrompt('xpldv', 'a red sneaker.'), /^A red sneaker separates into an ordered exploded view\. /, 'trigger right after the object');
  assert.match(LL.ltxLoraPrompt('xpldv', ''), /^The object separates into an ordered exploded view\. /);
  const by = () => Object.fromEntries(ltxLoraList(MODELS).map((x) => [x.id, x]));
  assert.deepEqual([by().xpldv.state, by().xpldv.needsDownload, by().xpldv.download], ['missing', true, 'app'], 'xpldv: not on disk → needs download');
  fs.mkdirSync(path.join(MODELS, 'loras'), { recursive: true }); fs.writeFileSync(path.join(MODELS, 'loras', 'ltx-2.5-xpldv_v5-lora.safetensors'), Buffer.alloc(1024));
  assert.deepEqual([by().xpldv.state, by().xpldv.needsDownload], ['downloading', true], 'xpldv: smaller than its size → still downloading');
  assert.equal(ltxLoraList(null)[0].state, 'unknown', 'no models folder → unknown');
  fs.rmSync(path.join(MODELS, 'loras'), { recursive: true }); }
ok('LoRA slot: withLtxLoras chains LoraLoaderModelOnly after the GGUF loader on ti2v + flf (validated); registry (xpldv), file states');

// ---- 6. Photo FX → Exploded view on LTX-2.5 22B + XPLDV LoRA (2026-10-26) ----
{ const fx: any = getTool('photo-fx')!; const { appWorkflowFor } = await import('../src/shared/appWorkflows.js');
  const pre = fx.presets.find((x: any) => x.id === 'exploded-view'); assert.ok(pre, 'Photo FX lists Exploded view');
  assert.deepEqual([pre.providers, pre.modelName, pre.lora.file], [[P], 'LTX-2.5 22B + XPLDV LoRA', 'ltx-2.5-xpldv_v5-lora.safetensors'], 'runs on LTX-2.5 22B only, real model + LoRA named');
  assert.ok(fx.providers.includes(P)); assert.deepEqual(fx.app.durationsByProvider[P], [2, 3, 4, 5]); assert.equal(fx.app.defaultDurationByProvider[P], 5, '5 s default (XPLDV trained at 121 frames)');
  assert.deepEqual(fx.app.resolutionsByProvider[P], ['448p', '576p']); assert.equal(appWorkflowFor('photo-fx', P)!.file, 'ltx25-ti2v-api.json', 'credited to the official LTX-2.5 i2v template');
  const { spawnSync } = await import('node:child_process'); spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', IMG, '-vf', 'scale=1024:1024', path.join(D, 'shoe.png')]); // Photo FX needs ≥ 409,600 px
  const fp = (f: Record<string, string>) => fx.parseInput({ provider: P, types: '["exploded-view"]', seed: '7', ...f }, { image: ['shoe.png'] });
  const x: any = await fp({ prompt: 'a red running shoe', aspect: '16:9' }); assert.ok(!('error' in x), JSON.stringify(x));
  assert.deepEqual([x.duration, x.resolution], [5, '448p'], 'defaults: 5 s Draft');
  assert.match(x.finalPrompt, /^A red running shoe separates into an ordered exploded view\. /, 'XPLDV wording: the object, then the trigger');
  const xj = { id: 'x', toolId: 'photo-fx', provider: P, input: x }; assert.equal(hasPlan(xj), true, 'Photo FX on LTX-2.5 has a local plan');
  const xp = buildPlan(xj); const gx = common(xp, 'exploded view 5 s Draft', 768, 448, 121); assert.equal(xp.passes[0].workflow, 'ltx25-ti2v-api.json');
  assert.deepEqual(byClass(gx, 'LoraLoaderModelOnly').map(([, n]) => [n.inputs.lora_name, n.inputs.strength_model]), [['ltx-2.5-xpldv_v5-lora.safetensors', 0.5]], 'XPLDV at 0.5 (start frame)');
  assert.equal(gx['341'].inputs.sampler_name, 'euler', 'stage 2 euler (author graph)'); assert.equal(gx['352'].inputs.sampler_name, 'euler_ancestral', 'stage 1 euler_a');
  assert.deepEqual(byClass(gx, 'LTXVImgToVideoInplace').map(([, n]) => n.inputs.strength).sort(), [0.7, 1], 'image guide 0.7 then 1.0');
  assert.deepEqual(xp.passes[0].expect.loras, [{ id: 'xpldv', file: 'ltx-2.5-xpldv_v5-lora.safetensors', strength: 0.5 }]);
  const x2: any = await fp({ duration: '2', resolution: '576p' }); assert.match(x2.finalPrompt, /^The object separates into an ordered exploded view\./, 'no prompt → "The object"');
  common(buildPlan({ ...xj, input: x2 }), 'exploded view 2 s Sharper (Auto follows the square photo)', 768, 768, 49);
  const bad: any = await fp({ resolution: '720p' }); assert.equal(bad.issues?.[0]?.field, 'resolution', 'only Draft / Sharper on LTX');
  const wan: any = await fx.parseInput({ provider: 'comfy-open', types: '["exploded-view"]' }, { image: ['shoe.png'] });
  assert.equal(wan.code, 'unsupported'); assert.match(wan.error, /isn't available on Wan 2\.2 I2V 14B\. It runs on LTX-2\.5 22B\./, 'Wan refuses it, naming the right model');
  const other: any = await fx.parseInput({ provider: P, types: '["float"]', prompt: 'slowly' }, { image: ['shoe.png'] });
  const go = buildPlan({ ...xj, input: other }).passes[0].graph; assert.equal(byClass(go, 'LoraLoaderModelOnly').length, 0, 'other effects on LTX: no LoRA'); assert.match(go['364'].inputs.text, /^the subject slowly floats upward/);
  assert.equal(buildPlan({ ...xj, provider: 'comfy-open', input: { ...other } }).passes[0].workflow, 'photo-fx-api.json', 'Wan Photo FX unchanged');
  process.env.OPENHIGGSFIELD_COMFY_MODELS_DIR = MODELS; R.clearRequirementsCache();
  const rq = R.requirementsFor(fx, P, { types: ['exploded-view'], resolution: '448p', duration: 5 })!;
  assert.ok(rq.missingFiles!.some((f) => f.file === 'ltx-2.5-xpldv_v5-lora.safetensors'), 'the LoRA is in Files needed (download)');
  assert.ok(!R.requirementsFor(fx, P, { types: ['float'], resolution: '448p', duration: 5 })!.missingFiles!.some((f) => /xpldv/.test(f.file)), 'not for other effects');
  const hw2 = HW.currentHardware(); const e5 = R.fitFor(fx, P, { types: ['exploded-view'], resolution: '448p', duration: 5 }, hw2, rq); const e2 = R.fitFor(fx, P, { types: ['exploded-view'], resolution: '448p', duration: 2 }, hw2);
  assert.deepEqual([e5.eta.estimateSeconds, e2.eta.estimateSeconds], [1140, 456], 'honest Mac time: 5 s ≈ 19 min, 2 s ≈ 8 min (Draft)');
  assert.equal(routesFor(P, fx)[0].priceRef, null, 'free'); }
ok('Photo FX Exploded view: LTX-2.5 22B + XPLDV 0.5, stage 2 euler, XPLDV prompt, 2–5 s Draft / Sharper, LoRA in Files needed, ~19 min for 5 s; Wan refuses it');
console.log('ltx25-video-local: all passed');
process.exit(0);
