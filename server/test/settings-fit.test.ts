// Picking a model adapts the settings (2026-10-27, shared/settingsFit.ts): the pure rule the model menu, the batch quote and MCP share.
// 1. fitSettings on real caps: LTX-2.5 Pro (Router: 6/8/10 s, 720p/1080p), LTX-2.5 Fast (Comfy partner node), LTX-2.5 22B (2–5 s, Draft/Sharper),
//    MiniMax H3 (Router 768p/2K vs our workflow 768p/480p), Seedance 2.0, Veo 3.1 (1080p = 8 s only), Wan 2.2 5B (no sound), Nano Banana, FLUX 3;
// 2. edge cases: one fixed length, no sound, forced sound, pinned fields never move, nothing to change = no note;
// 3. the bar's note and the row's hover in plain words; 4. needOf: the specific reason (and action) for a job no setting can fix.
// Run: npx tsx test/settings-fit.test.ts   (pure, no server)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'setfit-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'env'), OPENHIGGSFIELD_BACKEND: 'mock' });
const { fitSettings, fitLength, fitResolution, fitAspect, fitNote, fitHint, needOf, videoFitCaps, imageFitCaps, changesBetween } = await import('../src/shared/settingsFit.ts');
const { VIDEO_LIMITS, ROUTE_LIMITS } = await import('../src/tools/h3/videoCaps.ts');
const { capsFor } = await import('../src/shared/imageCaps.ts');
const ok = (m: string) => console.log('ok ' + m);
const V = (id: string, route?: string) => videoFitCaps({ ...VIDEO_LIMITS[id], ...(route ? ROUTE_LIMITS[route] ?? {} : {}) });
const T2V15 = { duration: '15', resolution: '768p', aspect: 'auto', audio: '1' };

// ---- 1. the bug report: text to video at 15 s ----
{ const f = fitSettings(V('router-ltx-25-pro'), T2V15);
  assert.equal(f.values.duration, '10'); assert.equal(f.values.resolution, '720p'); assert.equal(f.values.aspect, 'auto'); assert.equal(f.values.audio, '1');
  assert.deepEqual(f.changes.map((c) => [c.field, c.to, c.why]), [['resolution', '720p', 'highest'], ['duration', '10', 'longest']]);
  assert.equal(fitNote(f.changes, 'LTX-2.5 Pro'), 'Set to 720p and 10 s for LTX-2.5 Pro.');
  assert.equal(fitNote(f.changes.filter((c) => c.field === 'duration'), 'LTX-2.5 Pro'), 'Length set to 10 s, the longest LTX-2.5 Pro makes.');
  assert.equal(fitHint(f.changes), 'Will use 720p, 10 s'); ok('LTX-2.5 Pro (Router): 15 s → 10 s, 768p → 720p, with the note'); }
{ const f = fitSettings(V('cloud-ltx25-fast-api'), T2V15); assert.equal(f.values.duration, '14'); assert.equal(f.values.resolution, '720p'); ok('LTX-2.5 Fast (Comfy node): 15 s → 14 s'); }
{ const f = fitSettings(V('comfy-ltx25-video', 'comfy-cloud:cloud-ltx25-video'), T2V15); assert.equal(f.values.duration, '5'); assert.equal(f.values.resolution, '720p');
  const loc = fitSettings(V('comfy-ltx25-video', 'local:comfy-ltx25-video'), T2V15); assert.equal(loc.values.resolution, '576p'); assert.equal(loc.values.duration, '5');
  assert.equal(fitNote(loc.changes, 'LTX-2.5 22B'), 'Set to Sharper and 5 s for LTX-2.5 22B.'); ok('LTX-2.5 22B: ≤ 5 s; Comfy Cloud 720p, local Sharper'); }
{ const wf = fitSettings(V('cloud-h3-wf'), { ...T2V15, resolution: '480p' }); assert.equal(wf.values.resolution, '480p'); assert.equal(wf.values.duration, '10');
  const router = fitSettings(V('api-minimax-h3'), { ...T2V15, resolution: '480p' }); assert.equal(router.values.resolution, '768p'); assert.equal(router.changes[0].why, 'lowest');
  assert.equal(fitNote(router.changes, 'MiniMax H3'), 'Resolution set to 768p, the lowest MiniMax H3 makes.');
  assert.equal(fitSettings(V('comfy-h3'), T2V15).changes.length, 0); ok('MiniMax H3: 480p kept on our workflow, 768p on the Router service; 15 s fits H3'); }
{ const f = fitSettings(V('router-seedance'), { ...T2V15, resolution: '4K', aspect: '2.4:1' }); assert.equal(f.values.resolution, '1080p'); assert.equal(f.values.aspect, '21:9'); assert.equal(f.values.duration, '15');
  ok('Seedance 2.0: 4K → 1080p (highest), 2.4:1 → 21:9 (closest)'); }
{ const f = fitSettings(V('router-veo'), { duration: '6', resolution: '1080p', aspect: '1:1', audio: '1' }); assert.equal(f.values.duration, '8'); assert.equal(f.values.aspect, '16:9');
  assert.equal(f.changes.find((c) => c.field === 'duration')?.why, 'only'); ok('Veo 3.1: 1080p makes 8 s only; 1:1 → 16:9'); }
{ const f = fitSettings(V('router-flux3-video'), { ...T2V15, duration: '30', resolution: '4K' }); assert.equal(f.values.duration, '20');
  assert.equal(f.values.resolution, '4K', 'wrong-block fix W6 (2026-10-28): the Router takes hd / fhd / qhd / uhd (comfy-docs flux-3-video/code.md), so 4K stays'); ok('FLUX 3 Video: 30 s → 20 s, 4K kept'); }

// ---- 1b. images: Nano Banana and FLUX 3 ----
{ const nb = imageFitCaps(capsFor('api-nano-banana-21') as any)!; const f = fitSettings(nb, { aspect: '2.4:1', resolution: '8K' });
  assert.ok(nb.aspects!.includes(f.values.aspect!)); assert.ok(nb.resolutions!.includes(f.values.resolution!)); assert.equal(f.changes.find((c) => c.field === 'resolution')?.why, 'highest');
  const auto = fitSettings(nb, { aspect: 'auto', resolution: '1K' }); const def = (capsFor('api-nano-banana-21') as any).defaultAspect ?? nb.aspects![0];
  assert.deepEqual(auto.changes.map((c) => [c.field, c.to]), [['aspect', def]]); assert.equal(fitNote(auto.changes, 'Nano Banana 2.1'), `Aspect set to ${def} for Nano Banana 2.1.`);
  ok(`Nano Banana: 2.4:1 → ${f.values.aspect}, 8K → ${f.values.resolution}; no Auto → its default ${def}`); }
{ const fx = imageFitCaps(capsFor('api-flux3-image') as any)!; const f = fitSettings(fx, { aspect: '16:9', resolution: '3K' }); assert.equal(f.values.resolution, '2K'); assert.equal(f.changes[0].why, 'highest');
  ok('FLUX 3: 3K → 2K (highest up to yours)'); }

// ---- 2. edge cases ----
{ assert.deepEqual(fitLength([8], 15), { to: 8, why: 'only' }); assert.equal(fitNote([{ field: 'duration', from: '15', to: '8', why: 'only' }], 'X'), 'Length set to 8 s, the only length X makes.');
  assert.deepEqual(fitLength([6, 8, 10], 4), { to: 6, why: 'shortest' }); assert.deepEqual(fitLength([6, 8, 10], 7), { to: 6, why: 'longest' }); assert.equal(fitLength([6, 8, 10], 8), null);
  ok('one fixed length; shorter than the shortest; between two lengths = the longer-not-over'); }
{ const silent = fitSettings(V('comfy-wan22-5b'), T2V15); assert.equal(silent.values.audio, '0'); assert.equal(fitNote(silent.changes.filter((c) => c.field === 'audio'), 'Wan 2.2 5B'), 'Sound off: Wan 2.2 5B makes clips without sound.');
  const forced = fitSettings({ audio: { supported: true, toggle: false, default: true } }, { audio: '0' }); assert.equal(forced.values.audio, '1'); assert.equal(fitNote(forced.changes, 'M'), 'Sound on: M always adds sound.');
  ok('no sound → off with its note; forced sound → on with its note'); }
{ const f = fitSettings(V('router-ltx-25-pro'), T2V15, { pinned: ['duration', 'resolution'] }); assert.equal(f.values.duration, '15'); assert.equal(f.values.resolution, '768p'); assert.equal(f.changes.length, 0);
  ok('pinned fields (an API caller\'s exact settings) never move'); }
{ assert.equal(fitNote([], 'X'), ''); assert.equal(fitHint([]), ''); assert.equal(fitSettings(null, T2V15).changes.length, 0); assert.equal(fitResolution(['720p'], '720P'), null); assert.equal(fitAspect(['auto', '16:9'], 'AUTO'), null);
  ok('no caps / nothing to change = no note; case-insensitive matches'); }
{ const ch = changesBetween({ duration: '15', resolution: '768p', audio: '1' }, { duration: '10', resolution: '1080p', audio: '0' }, { durations: [6, 8, 10], resolutions: ['720p', '1080p'], audio: { supported: true, toggle: true, default: false } });
  assert.deepEqual(ch.map((c) => c.why), ['longest', 'lowest', 'default']); assert.equal(fitNote([ch[2]], 'Veo 3.1'), 'Sound off, how Veo 3.1 starts.'); ok('changesBetween names why each moved (Veo starts with sound off)'); }

// ---- 4. impossible rows: the specific reason ----
{ const n = needOf("Comfy Cloud can't run this job. This route only does image to video or first and last frame.")!; assert.equal(n.short, 'Needs a start image'); assert.equal(n.action, 'add-image');
  assert.equal(needOf('This route only does first and last frame.')!.short, 'Needs 2 images'); assert.equal(needOf('Needs a video to work on.')!.short, 'Needs a video');
  assert.equal(needOf('This route only does text to video, image to video or first and last frame.'), null); assert.equal(needOf('Price not measured yet'), null); assert.equal(needOf(''), null);
  assert.equal(needOf('Add a start image: Wan 2.2 Fun Camera is image-to-video only. Without an image, pick an LTX move.')!.action, 'add-image', 'Camera Moves: "Add a start image: …"');
  ok('needOf: start image / 2 images / video; text-capable routes and other reasons are not needs'); }
console.log('settings-fit: all ok');
