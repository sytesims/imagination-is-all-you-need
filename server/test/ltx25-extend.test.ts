// LTX-2.5 Extend (provider comfy-ltx25-extend on the Extend tool, 2026-10-26). In-process, temp data dir, mock backend, no network, nothing queued.
// 1 the patched image to video graph validates against a saved, trimmed /object_info of the user's ComfyUI (test/fixtures/object-info-ltx25-extend.json)
//   for 1, 9 and 17 guide frames; the guide feeds the start-frame path; colour match on the output
// 2 plan maths: render size on the 64 grid, frames G + 24 s on 8n + 1, short sources, limits
// 3 the join (real ffmpeg on synthetic clips): frame counts, the duplicated guide frames dropped, the crossfade over the overlap, sound length = picture length;
//   3b its sound: the source bit-identical to the cut (PCM out), loudness match of the new sound, no click, no hole when the source sound ends early
// 4 parseInput (conform, guide written, errors), the native plan (post extend), the mock sample run
// Run: npx tsx test/ltx25-extend.test.ts
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'ltxext-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'none.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0',
  OPENHIGGSFIELD_MOCK_DELAY_MS: '20', OPENHIGGSFIELD_HW_MOCK: JSON.stringify({ gpu: { name: 'Apple M1 Max', type: 'mps' }, ramGB: 64, ggufNode: true }) });
delete process.env.COMFY_BASE_URL; delete process.env.OPENHIGGSFIELD_COMFY_MODELS_DIR;
const X = await import('../src/comfy/ltx25Extend.js');
const { buildPlan, hasPlan } = await import('../src/comfy/plans.js');
const { getTool } = await import('../src/tools/registry.js');
const { getProvider } = await import('../src/providers.js');
const { runFfmpeg } = await import('../src/ffmpeg.js');
const ok = (m: string) => console.log('ok ' + m);
const P = X.LTX25_EXTEND; const tool = getTool('h3-extend')!;
assert.ok(tool.providers.includes(P), 'Extend offers LTX-2.5'); assert.equal(getProvider(P)?.kind, 'open-weights'); assert.equal(getProvider(P)?.name, 'LTX-2.5 22B');

// ---- 1. graph vs the saved /object_info ----
const OI: Record<string, any> = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'object-info-ltx25-extend.json'), 'utf8'));
const isLink = (v: any) => Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && typeof v[1] === 'number';
function validate(g: Record<string, any>, label: string) {
  for (const [id, n] of Object.entries<any>(g)) {
    const spec = OI[n.class_type]; assert.ok(spec, `${label}: node ${id} class ${n.class_type} exists in ComfyUI`);
    const all = { ...(spec.input.required ?? {}), ...(spec.input.optional ?? {}) };
    for (const k of Object.keys(spec.input.required ?? {})) assert.ok(k in n.inputs, `${label}: ${n.class_type}.${k} (required) is set`);
    for (const [k, v] of Object.entries<any>(n.inputs)) {
      if (k.includes('.')) { const [pk, sub] = k.split('.'); const parent = all[pk]; assert.ok(parent && /DYNAMICCOMBO/.test(String(parent[0])), `${label}: ${n.class_type}.${k} belongs to a dynamic combo`);
        const opt = parent[1].options.find((o: any) => o.key === n.inputs[pk]); assert.ok(opt?.inputs?.required?.[sub], `${label}: ${k} is an input of ${n.inputs[pk]}`); continue; }
      const s = all[k]; assert.ok(s, `${label}: ${n.class_type}.${k} is an input ComfyUI knows`);
      if (isLink(v)) { assert.ok(g[v[0]], `${label}: ${n.class_type}.${k} links to node ${v[0]}`);
        const outT = OI[g[v[0]].class_type].output[v[1]]; const inT = String(s[0]); assert.ok(outT != null, `${label}: ${v[0]} has output ${v[1]}`);
        if (!/MATCHTYPE|\*/.test(inT) && !Array.isArray(s[0])) assert.ok(inT.split(',').includes(outT), `${label}: ${n.class_type}.${k} (${inT}) takes ${g[v[0]].class_type}[${v[1]}] (${outT})`); continue; }
      if (v && typeof v === 'object' && '__file' in v) { assert.ok(['LoadImage', 'LoadVideo'].includes(n.class_type), `${label}: only Load Image / Load Video take a file`); continue; }
      const [type, o = {}] = s;
      if (Array.isArray(type)) continue; // file lists trimmed from the fixture
      if (type === 'COMBO' || /DYNAMICCOMBO/.test(type)) { const opts = (o.options ?? []).map((x: any) => (typeof x === 'object' ? x.key : x)); if (opts.length) assert.ok(opts.includes(v), `${label}: ${n.class_type}.${k}=${v} is an option`); continue; }
      if (/^(INT|FLOAT)/.test(type)) { assert.equal(typeof v, 'number', `${label}: ${n.class_type}.${k} is a number`); if (o.min != null) assert.ok(v >= o.min, `${label}: ${k} ≥ min`); if (o.max != null) assert.ok(v <= o.max, `${label}: ${k} ≤ max`); continue; }
      if (type === 'STRING') { assert.equal(typeof v, 'string'); continue; }
      if (type === 'BOOLEAN') { assert.equal(typeof v, 'boolean'); continue; }
      assert.fail(`${label}: ${n.class_type}.${k} is a link type (${type}) but holds a value`);
    }
  }
}
const wf = () => JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', '..', 'workflows', X.LTX25_EXTEND_WORKFLOW), 'utf8'));
for (const G of [1, 9, 17]) {
  const plan = X.extendPlan({ width: 768, height: 448, frames: 48 }, { seconds: 2, guideFrames: G }) as any; assert.ok(!('error' in plan));
  const { graph: g, output, expect } = X.patchLtx25Extend(wf(), { prompt: 'p', seed: 7, plan, guide: { __file: G === 1 ? '/x/g.png' : '/x/g.mp4' } });
  validate(g, `G=${G}`); assert.equal(output, '75');
  assert.equal(g['356'].inputs.length, G + 48, 'latent length = guide + 24 × seconds'); assert.equal((g['356'].inputs.length - 1) % 8, 0, '8n + 1');
  assert.equal(g['366'].inputs.frames_number, G + 48, 'audio latent the same length');
  assert.deepEqual([g['356'].inputs.width, g['356'].inputs.height], [384, 224]); assert.deepEqual([g['351'].inputs.width, g['351'].inputs.height], [768, 448]);
  if (G === 1) { assert.deepEqual(g['395'].inputs.image, { __file: '/x/g.png' }); assert.ok(!g['960']); }
  else { assert.ok(!g['395']); assert.deepEqual(g['960'].inputs.file, { __file: '/x/g.mp4' }); assert.deepEqual(g['351'].inputs.image, ['961', 0], 'the guide clip goes where the start frame went'); }
  for (const id of ['349', '357']) assert.deepEqual(g[id].inputs.image, ['350', 0], 'both stages put the guide in place');
  assert.equal(g['963'].inputs['source_stats.target_index'], G - 1); assert.equal(g['962'].inputs.batch_index, G - 1); assert.deepEqual(g['370'].inputs.images, ['963', 0], 'colour-matched frames are saved');
  assert.equal(expect.framesAdded, 48); assert.equal(expect.guideFrames, G);
}
ok('graph validates against /object_info for 1, 9 and 17 guide frames; guide on both stages; colour match on the output');

// ---- 2. plan maths ----
const pl = (w: number, h: number, frames: number, ask: any = {}) => X.extendPlan({ width: w, height: h, frames }, ask) as any;
assert.deepEqual(X.extendGenSize({ width: 768, height: 448 }, '448p'), { width: 768, height: 448, stage1: { width: 384, height: 224 } });
assert.deepEqual(X.extendGenSize({ width: 448, height: 768 }, '448p').width, 448);
{ const s = X.extendGenSize({ width: 1920, height: 1080 }, '576p'); assert.deepEqual([s.width, s.height], [1024, 576]); }
{ const s = X.extendGenSize({ width: 1280, height: 720 }, '448p'); assert.equal(s.width % 64, 0); assert.equal(s.height % 64, 0); assert.equal(s.stage1.height % 32, 0); }
{ const s = X.extendGenSize({ width: 512, height: 288 }, '576p'); assert.ok(s.width <= 512, 'never above the source'); }
for (const sec of [2, 3, 4, 5]) for (const G of [1, 9, 17]) { const f = X.extendFrames(sec, G); assert.equal((f.total - 1) % 8, 0, `${sec}s G${G} on 8n+1`); assert.equal(f.added, sec * 24); }
{ const p = pl(768, 448, 48); assert.equal(p.seconds, 2); assert.equal(p.guideFrames, 9); assert.equal(p.crossfade, 4); assert.equal(p.out.frames, 96); assert.equal(p.out.seconds, 4); assert.equal(p.resolution, '448p'); }
{ const p = pl(768, 448, 5); assert.equal(p.guideFrames, 1, 'a 5-frame source falls back to its last frame'); assert.equal(p.crossfade, 0); }
{ const p = pl(768, 448, 12, { guideFrames: 17 }); assert.equal(p.guideFrames, 9); }
{ const p = pl(768, 448, 48, { guideFrames: 1, crossfade: 4 }); assert.equal(p.crossfade, 0, 'no overlap with one frame'); }
{ const p = pl(641, 361, 48); assert.deepEqual([p.out.width, p.out.height], [640, 360], 'even output size'); }
assert.equal(pl(768, 448, 48, { seconds: 7 }).field, 'extendSeconds'); assert.equal(pl(768, 448, 48, { resolution: '768p' }).field, 'resolution');
assert.equal(pl(768, 448, 48, { guideFrames: 5 }).field, 'guideFrames'); assert.equal(pl(768, 448, 48, { crossfade: 9 }).field, 'crossfade');
assert.equal(pl(768, 448, 24 * 58, { seconds: 3 }).field, 'video', '60 s total cap'); assert.ok(!('error' in pl(768, 448, 24 * 58, { seconds: 2 })));
assert.equal(X.extendPrompt(''), X.LTX25_EXTEND_DEFAULT_PROMPT); assert.equal(X.extendPrompt('  she  turns '), 'she turns');
ok('plan maths: 64-grid render size, G + 24 s frames on 8n + 1, short-source fallback, limits, default prompt');

// ---- 3. the join ----
const T = (n: string) => path.join(D, n);
const ff = (args: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args]);
const frames = (f: string) => Number(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', f]).toString().trim());
const adur = (f: string) => { const o = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=duration', '-of', 'csv=p=0', f]).toString().trim(); return o ? Number(o) : 0; };
const size = (f: string) => execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f]).toString().trim();
const px = (f: string, n: number) => [...execFileSync('ffmpeg', ['-v', 'error', '-i', f, '-vf', `select=eq(n\\,${n}),scale=1:1`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])];
const near = (a: number[], b: number[], tol = 30) => a.every((x, i) => Math.abs(x - b[i]) <= tol);
const RED = [254, 0, 0], GREEN = [0, 128, 0], BLUE = [0, 0, 254];
// source: 48 red frames (2 s) with a 440 Hz tone; generated: G guide copies in green, then blue new footage, 880 Hz tone
ff(['-f', 'lavfi', '-i', 'color=red:s=768x448:r=24', '-f', 'lavfi', '-i', 'sine=f=440:r=48000', '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', T('src.mp4')]);
const mkGen = (G: number, out: string, audio = true, s = '768x448') => ff(['-f', 'lavfi', '-i', `color=green:s=${s}:r=24:d=${G / 24}`, '-f', 'lavfi', '-i', `color=blue:s=${s}:r=24:d=2`, ...(audio ? ['-f', 'lavfi', '-i', 'sine=f=880:r=48000'] : []),
  '-filter_complex', '[0:v][1:v]concat=n=2:v=1[v]', '-map', '[v]', ...(audio ? ['-map', '2:a', '-c:a', 'aac'] : []), '-frames:v', String(G + 48), '-t', String((G + 48) / 24), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', out]);
mkGen(9, T('gen9.mp4')); mkGen(1, T('gen1.mp4')); mkGen(9, T('gen9-silent.mp4'), false); mkGen(9, T('gen9-small.mp4'), true, '512x320');
assert.equal(frames(T('gen9.mp4')), 57);
{ const p = pl(768, 448, 48); const r = await X.joinExtension(T('src.mp4'), T('gen9.mp4'), T('j9.mp4'), p, { audio: true });
  assert.equal(r.frames, 96); assert.equal(frames(T('j9.mp4')), 96, '48 source + 48 new frames: the 9 guide copies are dropped');
  assert.ok(Math.abs(adur(T('j9.mp4')) - 4) < 0.03, `sound = picture (${adur(T('j9.mp4'))} s)`);
  assert.ok(near(px(T('j9.mp4'), 43), RED), 'source untouched before the crossfade');
  const mid = px(T('j9.mp4'), 45); assert.ok(!near(mid, RED) && !near(mid, GREEN), 'frames 44–47 crossfade source → generated copies');
  assert.ok(near(px(T('j9.mp4'), 48), BLUE), 'frame N is the first NEW frame, not a repeat of the last one'); }
{ const p = pl(768, 448, 48, { guideFrames: 1 }); await X.joinExtension(T('src.mp4'), T('gen1.mp4'), T('j1.mp4'), p, { audio: true });
  assert.equal(frames(T('j1.mp4')), 96, 'G = 1: N + T − 1'); assert.ok(near(px(T('j1.mp4'), 47), RED), 'the last source frame stays'); assert.ok(near(px(T('j1.mp4'), 48), BLUE), 'the generated copy of it is dropped');
  assert.ok(Math.abs(adur(T('j1.mp4')) - 4) < 0.03); }
{ const p = pl(768, 448, 48, { crossfade: 0 }); await X.joinExtension(T('src.mp4'), T('gen9.mp4'), T('j0.mp4'), p, { audio: true });
  assert.equal(frames(T('j0.mp4')), 96); assert.ok(near(px(T('j0.mp4'), 47), RED), 'no crossfade: a straight cut'); }
{ const p = pl(768, 448, 48); await X.joinExtension(T('src.mp4'), T('gen9-silent.mp4'), T('js.mp4'), p, { audio: true }); assert.ok(Math.abs(adur(T('js.mp4')) - 4) < 0.03, 'a silent clip still gives a full-length track'); }
{ const p = pl(768, 448, 48); await X.joinExtension(T('src.mp4'), T('gen9.mp4'), T('jn.mp4'), p, { audio: false }); assert.equal(adur(T('jn.mp4')), 0, 'Sound off: no track'); }
ff(['-i', T('src.mp4'), '-vf', 'scale=640:360', '-c:a', 'copy', T('src640.mp4')]);
{ const p = pl(640, 360, 48); await X.joinExtension(T('src640.mp4'), T('gen9-small.mp4'), T('jsz.mp4'), p, { audio: true }); assert.equal(size(T('jsz.mp4')), '640,360', 'the extension is scaled to the source size'); assert.equal(frames(T('jsz.mp4')), 96); }
ok('join: N + 24 s frames, duplicated frames dropped, crossfade over the overlap only, sound length = picture length, Sound off, sizes');

// ---- 3b. the join's sound (2026-10-27: the painter clip's new seconds came out 4–8 dB louder than the source and the old 0.1 s blend sat before the cut) ----
{ const G = X.extendAudioGainDb, L = (rmsDb: number, peakDb = rmsDb + 10) => ({ rmsDb, peakDb });
  assert.equal(G({ tail: L(-20), whole: L(-15), gen: L(-12) }), -8, 'match the tail: −20 − (−12)');
  assert.equal(G({ tail: L(-80), whole: L(-18), gen: L(-12) }), -6, 'near-silent tail: match the whole source');
  assert.equal(G({ tail: L(-Infinity, -Infinity), whole: L(-Infinity, -Infinity), gen: L(-12) }), 0, 'silent source (an added silent track): no change');
  assert.equal(G({ tail: L(-20), whole: L(-20), gen: L(-Infinity, -Infinity) }), 0, 'silent new sound: no change');
  assert.equal(G({ tail: L(-20), gen: null }), 0, 'unmeasured: no change');
  assert.equal(G({ tail: L(-59), gen: L(-5, -1) }), -30, 'never more than −30 dB'); assert.equal(G({ tail: L(-10, -9), gen: L(-40, -38) }), 12, 'never more than +12 dB');
  assert.equal(G({ tail: L(-10, -2), gen: L(-20, -3) }), 2, 'peak-safe: +10 dB wanted, the new peak −3 dBFS allows +2');
  assert.deepEqual(X.parseAudioLevel('[Parsed_astats_3 @ 0x1] Overall\n[Parsed_astats_3 @ 0x1] RMS level dB: -18.250000\n[Parsed_astats_3 @ 0x1] Peak level dB: -2.5'), { rmsDb: -18.25, peakDb: -2.5 });
  assert.deepEqual(X.parseAudioLevel('RMS level dB: -inf\nPeak level dB: -inf'), { rmsDb: -Infinity, peakDb: -Infinity }); assert.equal(X.parseAudioLevel('no audio'), null);
  const fc = (o: any) => { const a = X.joinArgs({ source: 's', gen: 'g', out: 'o', N: 48, T: 57, G: 9, X: 4, audioXfade: 0.02, width: 768, height: 448, audio: true, genHasAudio: true, ...o }); return a[a.indexOf('-filter_complex') + 1]; };
  const f = fc({ audioGainDb: -6.5 }); const src = f.split(';').filter((s: string) => s.startsWith('[0:a]') || s.startsWith('[s1]') || s.startsWith('[s0]'));
  assert.ok(src.length === 3 && !src.some((s: string) => /volume|afade|acrossfade|loudnorm|dynaudnorm/.test(s)), 'no gain or fade on the source before the cut');
  assert.match(f, /atrim=start=0\.375:end=2\.375,asetpts=PTS-STARTPTS,volume=-6\.50dB\[a1\]/, 'the gain is on the new sound only, which starts at the model\'s cut (G / 24 s)');
  assert.match(f, /areverse\[sm\]/); assert.match(f, /acrossfade=d=0\.02:c1=qsin:c2=qsin/); assert.ok(!/volume/.test(fc({ audioGainDb: 0 })), 'no gain filter at 0 dB');
  assert.match(fc({ audioXfade: 0 }), /\[a0\]\[a1\]concat=n=2/, 'no de-click asked: a straight cut'); }
{ // real ffmpeg: stereo source (2 s, 440 / 660 Hz at −26 dBFS), model clip 12 dB louder (880 Hz); lossless PCM out so samples can be compared
  ff(['-f', 'lavfi', '-i', 'color=red:s=320x192:r=24:d=2', '-f', 'lavfi', '-i', "aevalsrc='0.05*sin(2*PI*440*t)|0.05*sin(2*PI*660*t)':s=48000:d=2", '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', T('qsrc.mp4')]);
  ff(['-f', 'lavfi', '-i', 'color=blue:s=320x192:r=24:d=2.375', '-f', 'lavfi', '-i', "aevalsrc='0.2*sin(2*PI*880*t)|0.2*sin(2*PI*880*t)':s=48000:d=2.375", '-frames:v', '57', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', T('qgen.mp4')]);
  const pcm = (f: string, ss = 0, t = 0) => { const b = execFileSync('ffmpeg', ['-v', 'error', '-i', f, ...(ss ? ['-ss', String(ss)] : []), ...(t ? ['-t', String(t)] : []), '-vn', '-f', 'f32le', '-ac', '2', '-ar', '48000', '-'], { maxBuffer: 1 << 26 }); return new Float32Array(b.buffer, b.byteOffset, b.length / 4); };
  const rmsDb = (x: Float32Array) => { let s = 0; for (const v of x) s += v * v; return 10 * Math.log10(s / x.length); };
  const p = pl(320, 192, 48); const r = await X.joinExtension(T('qsrc.mp4'), T('qgen.mp4'), T('qj.mov'), p, { audio: true, audioCodec: 'pcm_f32le' });
  assert.ok(r.audioGainDb < -10 && r.audioGainDb > -14, `about −12 dB of gain on the new sound (${r.audioGainDb})`);
  const a = pcm(T('qsrc.mp4')), b = pcm(T('qj.mov')); const cut = 2 * 48000 * 2 /* samples × channels at the cut */;
  assert.ok(b.length >= cut + 1.9 * 48000 * 2, 'sound runs past the cut');
  let same = 0; for (let k = 0; k < Math.min(cut, a.length); k++) if (a[k] === b[k]) same++; assert.equal(same, Math.min(cut, a.length), `the source's samples are bit-identical up to the cut (${same} of ${Math.min(cut, a.length)})`);
  const newPart = b.subarray(cut + 0.05 * 96000, cut + 1.95 * 96000), tail = a.subarray(Math.max(0, cut - 2 * 96000), cut);
  assert.ok(Math.abs(rmsDb(newPart) - rmsDb(tail)) < 1, `new sound matched to the source's last 2 s (${rmsDb(newPart).toFixed(1)} vs ${rmsDb(tail).toFixed(1)} dB)`);
  let peak = 0; for (const v of b) peak = Math.max(peak, Math.abs(v)); assert.ok(peak < 0.9, `no clipping (peak ${peak.toFixed(3)})`);
  let jump = 0; for (let k = cut - 20; k < cut + 20; k += 2) jump = Math.max(jump, Math.abs(b[k + 2] - b[k])); assert.ok(jump < 0.03, `no click at the cut (largest step ${jump.toFixed(4)})`);
  const off = await X.joinExtension(T('qsrc.mp4'), T('qgen.mp4'), T('qj0.mov'), p, { audio: true, audioCodec: 'pcm_f32le', matchLoudness: false }); assert.equal(off.audioGainDb, 0);
  assert.ok(rmsDb(pcm(T('qj0.mov')).subarray(cut + 0.05 * 96000, cut + 1.95 * 96000)) - rmsDb(tail) > 10, 'matchLoudness: false keeps the model level');
  const quiet = await X.joinExtension(T('qsrc.mp4'), T('gen9-silent.mp4'), T('qjs.mov'), p, { audio: true, audioCodec: 'pcm_f32le' }); assert.equal(quiet.audioGainDb, 0, 'a silent model clip: no gain');
  // the source's sound stops 40 ms before its picture (AAC often ends ~30 ms early; the painter clip: 10.01 s of sound, 10.04 s of picture):
  // the new sound starts where the source's sound ends, so there is no hole at the edit (the live join left a −85 dB gap there)
  ff(['-f', 'lavfi', '-i', 'color=red:s=320x192:r=24:d=2', '-f', 'lavfi', '-i', "aevalsrc='0.05*sin(2*PI*440*t)|0.05*sin(2*PI*660*t)':s=48000:d=1.96", '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'pcm_s16le', T('qshort.mov')]);
  await X.joinExtension(T('qshort.mov'), T('qgen.mp4'), T('qjh.mov'), p, { audio: true, audioCodec: 'pcm_f32le' }); const h = pcm(T('qjh.mov'));
  let hole = 0; for (let k = Math.round(1.9 * 48000) * 2; k < Math.round(2.1 * 48000) * 2; k += 480) hole = Math.max(hole, rmsDb(h.subarray(k, k + 480)) < -45 ? 1 : 0); assert.equal(hole, 0, 'no silent 5 ms window around the edit');
  assert.ok(Math.abs(h.length / 2 / 48000 - 4) < 0.03, 'still as long as the picture'); }
ok('join sound: source bit-identical to the cut, mirrored 20 ms de-click after it, new sound loudness-matched to the source\'s last 2 s (peak-safe, ±30/+12 dB), silent sides left alone');

// ---- 4. parseInput, plan, mock run ----
ff(['-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=30', '-f', 'lavfi', '-i', 'sine=f=300:r=44100', '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', T('in.mp4')]);
ff(['-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=24', '-frames:v', '5', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', T('tiny.mp4')]);
fs.writeFileSync(T('photo.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
const parse = (fields: Record<string, string>, video = 'in.mp4') => tool.parseInput({ provider: P, ...fields }, { video: [video] }) as Promise<any>;
const r = await parse({ extendSeconds: '2', prompt: 'the dog jumps' });
assert.ok(!r.error, JSON.stringify(r.issues)); assert.equal(r.ltxExtend.plan.source.frames, 48, 'a 2 s 30 fps clip conformed to 24 fps = 48 frames'); assert.equal(r.mode, 'extend');
assert.ok(r.finalPrompt.startsWith('the dog jumps'), 'the user\'s words lead'); assert.equal(r.duration, 2); assert.equal(r.resolution, '448p'); assert.ok(r.ownLimits, 'H3 4–30 s rule skipped');
assert.equal(frames(r.ltxExtend.guidePath), 9, 'guide = the last 9 frames'); assert.equal(frames(r.videoPath), 48); assert.ok(adur(r.videoPath) > 1.9, 'source sound kept'); assert.equal(r.compareUrl, r.videoUrl);
assert.ok(r.ltxExtend.plan.gen.width <= 640);
{ const t = await parse({}, 'tiny.mp4'); assert.ok(!t.error); assert.equal(t.ltxExtend.plan.guideFrames, 1); assert.ok(/\.png$/.test(t.ltxExtend.guidePath)); assert.ok(t.warnings.some((w: string) => /only 5 frames/.test(w))); assert.ok(adur(t.videoPath) > 0, 'a silent source gets a silent track'); assert.equal(t.finalPrompt.split('.')[0], X.LTX25_EXTEND_DEFAULT_PROMPT.split('.')[0], 'no prompt → continue the same action'); }
assert.equal((await parse({ extendSeconds: '10' })).issues[0].field, 'extendSeconds');
assert.equal((await parse({ resolution: '768p' })).issues[0].field, 'resolution');
assert.equal((await parse({ direction: 'backward' })).issues[0].code, 'unsupported');
assert.equal((await parse({}, 'photo.png')).issues[0].code, 'format');
assert.equal((await tool.parseInput({ provider: P }, {}) as any).issues[0].code, 'required');
ok('parseInput: conform (24 fps, sound), 9-frame guide, short-clip fallback, errors');

const job: any = { id: 'job-ext-1', toolId: 'h3-extend', provider: P, input: r, status: 'queued' };
assert.ok(hasPlan(job)); const plan = buildPlan(job);
assert.equal(plan.post.kind, 'extend'); assert.equal(plan.passes.length, 1); assert.equal(plan.passes[0].workflow, 'ltx25-ti2v-api.json'); assert.equal(plan.muxSourceAudio, false);
assert.deepEqual(plan.passes[0].graph['960'].inputs.file, { __file: r.ltxExtend.guidePath }); assert.match((plan.post as any).label, /^\+2 s \(4\.0 s total\)$/);
validate(plan.passes[0].graph, 'built plan');
assert.ok(!hasPlan({ ...job, input: { ...r, ltxExtend: undefined } }), 'no plan without the prepared guide');
assert.equal(buildPlan({ ...job, provider: 'comfy-h3-extend', input: { ...r, extendSeconds: 5, resolution: '768p', sourceSeconds: 2 } } as any).passes[0].workflow, 'h3-extend-api.json', 'H3 Extend keeps its own graph');
ok('native plan: one ti2v pass + post extend; H3 Extend unchanged');

await tool.run(job as any);
assert.equal(job.status, 'done', job.error); const outF = path.join(D, path.basename(job.outputs[0].url));
assert.equal(frames(outF), 48 + 48, 'sample: source + 48 new frames'); assert.ok(Math.abs(adur(outF) - 96 / 24) < 0.05, 'sample sound = picture'); assert.match(job.outputs[0].label, /sample/);
ok('mock run: a labelled sample joined with the real join');
void runFfmpeg;
console.log('ltx25-extend: all passed');
