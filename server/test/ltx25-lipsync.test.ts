// LTX-2.5 Talking Photo (Voice → Talking photo / Lip Sync, provider comfy-ltx25-lipsync, 2026-10-26). In-process, temp data dir, mock backend, no network, nothing queued.
// 1 the lip driver (audio/lipDriver.ts) matches scipy: butter(2, [180, 6500], 'bandpass', fs, 'sos') and sosfiltfilt values; ringmod70 keeps the edges + silence;
//   timing: −40 dBFS trim, 0.5 / 1 / 0.3 s pads shrunk to the cap, 8k + 1 frames, ≥ 49 frames, a too-long speech cut at 113 frames (4.71 s)
// 2 the graph (workflows/ltx25-a2v-api.json) validates against a saved, trimmed /object_info (test/fixtures/object-info-ltx25-a2v.json): photo and text only;
//   the speech is encoded + frozen in both stages, the soundtrack is the clean speech, the frames follow the speech, the files we already have
// 3 parsing: photo optional, speech required, silent speech refused, too-long speech cut with a warning, Draft / Sharper only, lipFix=0 for an A/B;
//   provider on the voice tool's lipsync mode, free local route with an honest time line, credit, ETA, the Lip Sync bar recipe
// Run: npx tsx test/ltx25-lipsync.test.ts
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'ltx25ls-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'none.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0',
  OPENHIGGSFIELD_HW_MOCK: JSON.stringify({ gpu: { name: 'Apple M1 Max', type: 'mps' }, ramGB: 64 }) });
delete process.env.COMFY_BASE_URL; delete process.env.OPENHIGGSFIELD_COMFY_MODELS_DIR;
const LD = await import('../src/audio/lipDriver.js');
const { buildPlan, hasPlan } = await import('../src/comfy/plans.js');
const { LTX25_LIPSYNC: P, LTX25_A2V_WORKFLOW } = await import('../src/comfy/ltx25Lipsync.js');
const { routesFor } = await import('../src/routing/routes.js');
const { getTool } = await import('../src/tools/registry.js');
const { getProvider } = await import('../src/providers.js');
const { VIDEO_BARS } = await import('../src/shared/videoBar.js');
const ok = (m: string) => console.log('ok ' + m);
const close = (a: number, b: number, eps: number, m: string) => assert.ok(Math.abs(a - b) <= eps, `${m}: ${a} vs ${b}`);

// ---- 1. lip driver ----
{ const sos = LD.butterBandpassSos(180, 6500, 48000); // scipy 1.18.1: butter(2, [180, 6500], btype='bandpass', fs=48000, output='sos')
  const want = [[0.10625589984201027, 0.21251179968402054, 0.10625589984201027, 1, -0.8928937174061543, 0.32601139850994754], [1, -2, 1, 1, -1.9667459879563027, 0.9673203077482855]];
  sos.forEach((s, i) => s.forEach((v, j) => close(v, want[i][j], 1e-12, `sos[${i}][${j}]`)));
  const s44 = LD.butterBandpassSos(180, 6500, 44100); close(s44[0][0], 0.12185265652369545, 1e-12, 'sos 44.1 kHz gain'); close(s44[1][4], -1.9638007290882415, 1e-12, 'sos 44.1 kHz a1');
  const x = new Float64Array(2400).map((_, n) => 0.3 * Math.sin(2 * Math.PI * 440 * n / 48000) + 0.2 * Math.sin(2 * Math.PI * 50 * n / 48000));
  const y = LD.sosfiltfilt(sos, x); const ref: [number, number][] = [[0, 0.04064399], [1, 0.056464222], [100, -0.153960212], [1200, 0.001074304], [2399, -0.104232689]];
  for (const [i, v] of ref) close(y[i], v, 2e-9, `sosfiltfilt y[${i}] (scipy, odd padding)`);
  ok('lip driver: band-pass coefficients and sosfiltfilt match scipy');
}
const SR = 48000;
const speech = (lead: number, talk: number, tail: number) => { const n = Math.round((lead + talk + tail) * SR); const x = new Float64Array(n);
  for (let i = Math.round(lead * SR); i < Math.round((lead + talk) * SR); i++) x[i] = 0.4 * Math.sin(2 * Math.PI * 180 * i / SR) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 4 * i / SR)); return x; };
{ const x = speech(0.3, 2, 0.4); const t = LD.lipTiming(x, SR);
  close(t.trimmedLeading, 0.3 - 0.02, 0.002, 'leading silence trimmed, 20 ms kept'); close(t.speechSeconds, 2 + 0.04, 0.003, 'speech kept with 20 ms each side');
  assert.deepEqual([t.before, t.after, t.margin], [0.5, 1, 0.3], 'room for the full pads'); assert.equal((t.frames - 1) % 8, 0, '8k + 1 frames');
  assert.equal(t.frames, 1 + 8 * Math.ceil(((2.04 + 1.8) * 24 - 1) / 8), 'frames = ceil((speech + pads) · 24) on the 8k + 1 grid'); close(t.audioSeconds, (t.frames - 1) / 24, 1e-3, 'audio latent length (8k + 1e-4) / 24');
  const placed = LD.placeAudio(x, t); close(placed.length / SR, t.seconds, 2 / SR + 1e-9, 'placed clip = frames / 24');
  assert.equal(placed[Math.round(0.49 * SR)], 0, 'silence before the speech'); assert.ok(Math.abs(placed[Math.round(0.6 * SR)]) > 0, 'speech starts after 0.5 s');
  const drv = LD.ringmod70Driver(x, SR); const act = LD.activeRange(x)!; let peak = 0; for (let i = act[0] + 1; i < act[1]; i++) peak = Math.max(peak, Math.abs(drv[i]));
  close(peak, 0.95, 0.01, 'driver peak normalised to 0.95'); assert.equal(drv[10], 0, 'digital silence stays silent'); assert.equal(drv[act[0]], x[act[0]], 'original sample at the first −40 dBFS crossing');
  assert.notEqual(drv[act[0] + 2000], x[act[0] + 2000], 'speech is processed');
  const shortT = LD.lipTiming(speech(0, 0.2, 0), SR); assert.equal(shortT.frames, 49, 'a tiny clip still makes 49 frames (2 s)');
  const fit = LD.lipTiming(speech(0, 3.5, 0), SR); assert.ok(fit.frames <= 113 && !fit.cappedFrom, '3.5 s fits: pads shrink first'); assert.equal(fit.margin, 0, 'margin goes first'); assert.ok(fit.before === 0.5, 'before kept as long as possible');
  const long = LD.lipTiming(speech(0, 7, 0), SR); assert.equal(long.frames, 113, 'too long: the 113-frame cap'); close(long.cappedFrom!, 7, 0.01, 'remembers the original length'); close(long.speechSeconds, 113 / 24, 1e-3, 'speech cut at 4.71 s');
  assert.deepEqual([long.before, long.after, long.margin], [0, 0, 0], 'no pads left when cut');
  assert.throws(() => LD.lipTiming(new Float64Array(48000), SR), /No speech/, 'silence refused');
  ok('lip driver: ringmod70 edges + silence, timing pads / cap / minimum, 8k + 1 frames');
}

// ---- 2. graph ----
const OI: Record<string, any> = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'object-info-ltx25-a2v.json'), 'utf8'));
const isLink = (v: any) => Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && typeof v[1] === 'number';
function validate(g: Record<string, any>, label: string) {
  for (const [id, n] of Object.entries<any>(g)) {
    const spec = OI[n.class_type]; assert.ok(spec, `${label}: node ${id} class ${n.class_type} exists in ComfyUI`);
    const all = { ...(spec.input.required ?? {}), ...(spec.input.optional ?? {}) };
    for (const k of Object.keys(spec.input.required ?? {})) assert.ok(k in n.inputs, `${label}: ${n.class_type}.${k} (required) is set`);
    for (const [k, v] of Object.entries<any>(n.inputs)) {
      if (k.includes('.')) continue;
      const s = all[k]; assert.ok(s, `${label}: ${n.class_type}.${k} is an input ComfyUI knows`); const [type, o = {}] = s;
      if (isLink(v)) { const src = g[v[0]]; assert.ok(src, `${label}: ${n.class_type}.${k} links to node ${v[0]}`); const out = OI[src.class_type].output[v[1]]; const want = Array.isArray(type) ? 'COMBO' : String(type);
        assert.ok(out === want || want.split(',').includes(out), `${label}: ${n.class_type}.${k} (${want}) ← ${src.class_type}[${v[1]}] (${out})`); continue; }
      if (v && typeof v === 'object' && '__file' in v) { assert.ok(['LoadImage', 'LoadAudio'].includes(n.class_type), `${label}: only Load Image / Load Audio take an uploaded file`); continue; }
      if (Array.isArray(type)) { if (type.length) assert.ok(type.includes(v), `${label}: ${n.class_type}.${k}=${v} is a choice`); continue; }
      if (/DYNAMICCOMBO/.test(String(type))) { const opts = (o.options ?? []).map((x: any) => (typeof x === 'object' ? x.key : x)); assert.ok(opts.includes(v), `${label}: ${n.class_type}.${k}=${v} is an option`); continue; }
      if (type === 'COMBO') { const opts = o.options ?? []; if (opts.length) assert.ok(opts.includes(v), `${label}: ${n.class_type}.${k}=${v} is an option`); continue; }
      if (type === 'INT' || type === 'FLOAT') { assert.equal(typeof v, 'number', `${label}: ${n.class_type}.${k} is a number`); if (o.min != null) assert.ok(v >= o.min); if (o.max != null) assert.ok(v <= o.max, `${label}: ${n.class_type}.${k} ≤ max`);
        if (type === 'INT' && o.step > 1) assert.equal((v - (o.min ?? 0)) % o.step, 0, `${label}: ${n.class_type}.${k}=${v} on its step ${o.step}`); continue; }
      if (type === 'BOOLEAN') { assert.equal(typeof v, 'boolean'); continue; }
      if (type === 'STRING') { assert.equal(typeof v, 'string'); continue; }
      assert.fail(`${label}: ${n.class_type}.${k} is a link type (${type}) but holds a value`);
    }
  }
}
const byClass = (g: Record<string, any>, c: string) => Object.entries<any>(g).filter(([, n]) => n.class_type === c);
const FILES = ['ltx-2.5-22b-distilled-Q4_K_M.gguf', 'gemma4-12b-with-proj-ltx-2.5-bf16.safetensors', 'ltx-2.5-video-vae-conv-bf16.safetensors', 'ltx-2.5-audio-vae-bf16.safetensors', 'ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors'];
const IMG = path.join(import.meta.dirname, 'fixtures', 'ref-512.png');
const lipIn = (x: Record<string, any> = {}) => ({ mode: 'lipsync', types: ['lipsync'], prompt: '', seed: 7, resolution: '448p', lipDriverPath: '/d/drv.wav', lipCleanPath: '/d/clean.wav', lip: { frames: 73, audioSeconds: (72 + 1e-4) / 24 }, ...x });
const job = (input: Record<string, any>) => ({ id: 'j', toolId: 'voice', provider: P, input });
function check(plan: any, label: string, w: number, h: number, frames: number) {
  const g = plan.passes[0].graph; validate(g, label); assert.equal(plan.passes[0].workflow, LTX25_A2V_WORKFLOW); assert.equal(plan.muxSourceAudio, false);
  const [lat] = byClass(g, 'EmptyLTXVLatentVideo'); assert.deepEqual([lat[1].inputs.width, lat[1].inputs.height, lat[1].inputs.length], [w / 2, h / 2, frames], `${label}: stage 1 half size, frames from the speech`);
  assert.equal(byClass(g, 'LTXVEmptyLatentAudio').length, 0, `${label}: no empty audio latent`); assert.equal(byClass(g, 'LTXVAudioVAEDecode').length, 0, `${label}: the sound is never decoded back`);
  const frozen = byClass(g, 'SetLatentNoiseMask'); assert.equal(frozen.length, 1); const fz = frozen[0][0];
  assert.equal(g[g[fz].inputs.mask[0]].inputs.value, 0, `${label}: zero noise mask`); assert.equal(g[g[fz].inputs.samples[0]].class_type, 'LTXVAudioVAEEncode');
  const concats = byClass(g, 'LTXVConcatAVLatent'); assert.equal(concats.length, 2); assert.ok(concats.every(([, n]) => n.inputs.audio_latent[0] === fz), `${label}: frozen speech in both stages`);
  const enc = g[g[fz].inputs.samples[0]]; const trim = g[enc.inputs.audio[0]]; assert.equal(trim.class_type, 'TrimAudioDuration'); assert.deepEqual(g[trim.inputs.audio[0]].inputs.audio, { __file: '/d/drv.wav' }, `${label}: the driver conditions the model`);
  close(trim.inputs.duration, (frames - 1 + 1e-4) / 24, 1e-6, `${label}: audio trimmed to (8k + 1e-4) / 24`);
  const cv = g[g['75'].inputs.video[0]]; assert.equal(cv.class_type, 'CreateVideo'); assert.equal(cv.inputs.fps, 24); assert.deepEqual(g[cv.inputs.audio[0]].inputs.audio, { __file: '/d/clean.wav' }, `${label}: the soundtrack is the clean speech`);
  const loaders = [...byClass(g, 'UnetLoaderGGUF').map(([, n]) => n.inputs.unet_name), ...byClass(g, 'CLIPLoader').map(([, n]) => n.inputs.clip_name), ...byClass(g, 'VAELoader').map(([, n]) => n.inputs.vae_name), ...byClass(g, 'LatentUpscaleModelLoader').map(([, n]) => n.inputs.model_name)];
  assert.deepEqual(loaders.sort(), [...FILES].sort(), `${label}: no new files`);
  assert.deepEqual(byClass(g, 'ManualSigmas').map(([, n]) => n.inputs.sigmas.split(',').length - 1).sort(), [3, 8], `${label}: 8 + 3 steps`);
  assert.ok(byClass(g, 'RandomNoise').some(([, n]) => n.inputs.noise_seed === 7));
  return g;
}
assert.equal(hasPlan(job(lipIn())), true, 'Talking photo on LTX-2.5 has a local plan'); assert.equal(hasPlan(job(lipIn({ lipDriverPath: undefined }))), false, 'no plan without the prepared speech');
const gP = check(buildPlan(job(lipIn({ imagePath: IMG, imageSize: { width: 1080, height: 1920 } }))), 'photo (portrait → 9:16 Draft)', 448, 768, 73);
assert.deepEqual(gP['395'].inputs.image, { __file: IMG }); assert.deepEqual(byClass(gP, 'LTXVImgToVideoInplace').map(([, n]) => n.inputs.strength).sort(), [0.7, 1], 'photo on both stages');
assert.match(gP['364'].inputs.text, /lip and jaw movements/, 'visual-only default prompt'); assert.doesNotMatch(gP['364'].inputs.text, /"/, 'no quoted dialogue');
const gT = check(buildPlan(job(lipIn({ prompt: 'A woman with red hair in a "sunny" park', resolution: '576p', lip: { frames: 113, audioSeconds: (112 + 1e-4) / 24 } }))), 'text only (9:16 Sharper, 113 frames)', 576, 1024, 113);
assert.equal(byClass(gT, 'LoadImage').length, 0, 'text only: no image nodes'); assert.deepEqual(gT['377'].inputs.video_latent, ['356', 0]);
assert.match(gT['364'].inputs.text, /^A woman with red hair in a sunny park\. The person speaks/, 'the prompt leads, quotes dropped');
check(buildPlan(job(lipIn({ imagePath: IMG, aspect: '1:1' }))), 'square', 512, 512, 73);
assert.throws(() => buildPlan(job(lipIn({ lip: { frames: 72 } }))), /not prepared/, 'a frame count off the 8k + 1 grid is refused');
ok('graph: photo / text only / square validate; speech frozen in both stages, driver conditions, clean speech is the soundtrack, no new files');

// ---- 3. parsing, routes, UI ----
const tool: any = getTool('voice')!; assert.ok(tool.providers.includes(P)); assert.deepEqual(tool.app.providerModes[P], ['lipsync']);
const ff = (args: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args]);
ff(['-f', 'lavfi', '-i', 'sine=frequency=220:duration=2', '-af', 'adelay=300|300,apad=pad_dur=0.4,volume=0.5', '-ac', '2', '-ar', '44100', path.join(D, 'speech.wav')]);
ff(['-f', 'lavfi', '-i', 'sine=frequency=220:duration=8', '-af', 'volume=0.5', path.join(D, 'long.mp3')]);
ff(['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', '2', path.join(D, 'silent.wav')]);
fs.copyFileSync(IMG, path.join(D, 'face.png'));
const parse = (f: Record<string, string>, files: Record<string, string[]>) => tool.parseInput({ provider: P, types: '["lipsync"]', ...f }, files);
const a: any = await parse({}, { image: ['face.png'], speech: ['speech.wav'] }); assert.ok(!('error' in a), JSON.stringify(a));
assert.equal(a.mode, 'lipsync'); assert.equal(a.resolution, '448p'); assert.equal((a.frames - 1) % 8, 0); assert.ok(a.frames >= 49 && a.frames <= 113); assert.equal(a.lipFix, true); assert.deepEqual(a.warnings, []);
assert.ok(fs.existsSync(a.lipDriverPath) && fs.existsSync(a.lipCleanPath), 'driver + soundtrack written'); assert.ok(a.lipDriverPath.startsWith(D));
const wavSec = (f: string) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
close(wavSec(a.lipCleanPath), a.frames / 24, 0.002, 'soundtrack = the clip length'); close(wavSec(a.lipDriverPath), a.frames / 24, 0.002, 'driver = the clip length');
const again: any = await parse({}, { image: ['face.png'], speech: ['speech.wav'] }); assert.equal(again.lipDriverPath, a.lipDriverPath, 'same clip → same files');
const ab: any = await parse({ lipFix: '0' }, { speech: ['speech.wav'] }); assert.equal(ab.lipFix, false); assert.notEqual(ab.lipDriverPath, a.lipDriverPath, 'fix off: its own driver (plain speech)');
assert.equal(ab.imagePath, undefined, 'text only: no photo needed');
const pj = buildPlan(job(a)); assert.equal(pj.passes[0].expect.frames, a.frames);
const long: any = await parse({ resolution: '576p' }, { speech: ['long.mp3'] }); assert.ok(!('error' in long)); assert.equal(long.frames, 113); assert.match(long.warnings[0], /only the first 4\.7 s are used/);
const sil: any = await parse({}, { speech: ['silent.wav'] }); assert.equal(sil.issues?.[0]?.code, 'no_speech');
const noSp: any = await parse({}, { image: ['face.png'] }); assert.equal(noSp.issues?.[0]?.field, 'speech');
const badRes: any = await parse({ resolution: '720p' }, { speech: ['speech.wav'] }); assert.equal(badRes.issues?.[0]?.field, 'resolution');
const h3NoImg: any = await tool.parseInput({ provider: 'comfy-h3-lipsync', types: '["lipsync"]' }, { speech: ['speech.wav'] }); assert.equal(h3NoImg.issues?.[0]?.field, 'image', 'H3 still needs the portrait');
assert.deepEqual(tool.inputs.find((i: any) => i.name === 'image').requiredByProvider, { 'comfy-h3-lipsync': true, [P]: false, 'cloud-infinitetalk': true /* InfiniteTalk · Comfy Cloud (2026-10-27) */ });
ok('parsing: photo optional, speech prepared + reused, lipFix A/B, too long cut with a warning, silent / missing speech and wrong size refused; H3 unchanged');
const rs = routesFor(P, tool); assert.equal(rs.length, 1); assert.equal(rs[0].kind, 'local'); assert.equal(rs[0].priceRef, null, 'free');
assert.match(String((rs[0].caps as any).note), /8 minutes/, 'honest time line'); assert.equal(getProvider(P)?.kind, 'open-weights');
const { appWorkflowFor } = await import('../src/shared/appWorkflows.js'); const w = appWorkflowFor('voice', P)!; assert.equal(w.file, LTX25_A2V_WORKFLOW); assert.match(w.url!, /LTX-2\.5_A2V_Two_Stage_Distilled/); assert.match(w.author, /sducly/);
const { etaFor } = await import('../src/timing.js'); assert.ok((etaFor(tool, { providerId: P }).eta.byGpu as any).mseries?.['448p'] > 0, 'a Mac ETA anchor');
const bar = VIDEO_BARS['lip-sync']; assert.equal(bar.slots.find((s) => s.name === 'image')!.required, 'by-model'); assert.equal(bar.prompt.mode, 'optional');
assert.deepEqual(bar.controls.find((c) => c.field === 'resolution')!.providers, [P]);
ok('route: local + free with the time line; credit to Lightricks A2V + QuokkaiLab; ETA; Lip Sync bar: photo by model, optional prompt, Draft / Sharper on LTX');
