// Fit to model (2026-10-26): shared/videoFit.ts (limits + plan maths) and videoFit.ts (ffmpeg fit + crop-back). In process, no server, no network.
//  1. limits: Kling edit / Seedance edit rows come from cloudSwap + renderModels (one source), Render narrows by tool, unknown models → null.
//  2. plans: 1280×536 and 1720×720 (2.39:1) on Kling, pad and crop; 9:16 small; 4K; too long; too short; 120 fps; WebM on Topaz; Fit off; Seedance shape range.
//  3. crop-back maths: the result at another size of the padded frame maps back to the clip's framing; a result of another shape is left alone.
//  4. ffmpeg: a 1280×536 clip with sound is padded to 1280×720 (black bars), a fake 16:9 result is cropped back to 1280×536, sound and length kept.
// Run: npx tsx test/video-fit.test.ts
import assert from 'node:assert/strict'; import { execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'videofit-')); Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock' });
const ok = (m: string) => console.log('ok ' + m);
const VF = await import('../src/shared/videoFit.ts'); const CS = await import('../src/shared/cloudSwap.ts');
const plan = (w: number, h: number, o: Record<string, any> = {}, tool = 'object-swap', prov = 'router-kling-edit') => VF.videoFitFor(tool, prov, { width: w, height: h, duration: 8, ...o })!;

// ---------------- 1. limits ----------------
{
  const k = VF.videoInputLimits('object-swap', 'router-kling-edit')!;
  assert.equal(k.minSide, 720); assert.equal(k.maxSide, 2160); assert.deepEqual(k.fps, [24, 60]); assert.equal(k.minSec, CS.CLOUD_SWAP_MODELS['router-kling-edit'].minTotalSec); assert.equal(k.maxSec, 30);
  assert.deepEqual(k.output, { snap: ['16:9', '9:16', '1:1'] }); assert.match(k.source, /KlingOmniProEditVideoNode/);
  const kr = VF.videoInputLimits('make-it-real', 'router-kling-edit')!; assert.equal(kr.maxSec, 10, 'Render: one request, 3–10 s'); assert.equal(kr.minSec, 3);
  const s = VF.videoInputLimits('motion-transfer', 'router-seedance-25-edit')!; assert.deepEqual(s.aspect, [0.4, 2.5]); assert.equal(s.output, 'unknown', 'generation framing is not source-preserving'); assert.equal(s.minPixels, 409_600);
  assert.equal(VF.videoInputLimits('object-swap', 'comfy-open'), null, 'local: no row (parseCommon keeps its floor)'); assert.equal(VF.videoFitFor('object-swap', 'router-kling-edit', { duration: 8 }), null, 'no size yet: no plan');
  for (const [id, row] of Object.entries(VF.VIDEO_INPUT_LIMITS)) { assert.ok(row.source.length > 10, `${id} names its source`); assert.ok(row.name, id); }
  ok('limits: Kling / Seedance edit from cloudSwap + renderModels, Render narrows by tool, every row names its source');
}

// ---------------- 2. plans ----------------
{
  // 1280×536 (2.39:1, 536 px tall): Keep everything pads to 1280×720 (the bars make it 720 tall: no upscale), crop-back on
  const a = plan(1280, 536); assert.equal(a.ok, true); assert.equal(a.changed, true); assert.deepEqual(a.frame, { width: 1280, height: 720 }); assert.deepEqual(a.content, { x: 0, y: 92, width: 1280, height: 536 });
  assert.equal(a.restore, true); assert.equal(a.note, 'Adjusted for Kling: padded to 16:9, full frame kept'); assert.equal(a.source.aspect, '2.39:1');
  assert.match(a.reason!, /^Kling needs the clip at least 720 px tall; yours is 536 px\. Kling makes 16:9, 9:16 or 1:1 videos; yours is 2\.39:1\. Fix: pad to 16:9 and crop the result back \(free\)$/);
  // Crop to fill: 952×536 of the middle, enlarged to 1280×720
  const c = plan(1280, 536, { fit: 'crop' }); assert.deepEqual(c.crop, { x: 164, y: 0, width: 952, height: 536 }); assert.deepEqual(c.frame, { width: 1280, height: 720 }); assert.equal(c.restore, false);
  assert.equal(c.note, 'Adjusted for Kling: cropped to 16:9, enlarged to 720p'); assert.match(c.reason!, /Fix: crop to 16:9, enlarge to 720p \(free\)/);
  // 1720×720 (2.39:1): the size fits, the shape doesn't (it came back 1280×720 with the sides cut): pad to 1720×968
  const b = plan(1720, 720); assert.deepEqual(b.frame, { width: 1720, height: 968 }); assert.deepEqual(b.content, { x: 0, y: 124, width: 1720, height: 720 }); assert.equal(b.problems.length, 1); assert.equal(b.aspect.choice, true); assert.equal(b.aspect.target, '16:9');
  const bc = plan(1720, 720, { fit: 'crop' }); assert.deepEqual(bc.crop, { x: 220, y: 0, width: 1280, height: 720 }); assert.equal(bc.note, 'Adjusted for Kling: cropped to 16:9');
  // 9:16 at 540×960: a Kling shape; only enlarged (no choice offered)
  const t = plan(540, 960); assert.equal(t.aspect.choice, false); assert.deepEqual(t.frame, { width: 720, height: 1280 }); assert.equal(t.note, 'Adjusted for Kling: enlarged to 720p'); assert.match(t.reason!, /at least 720 px wide; yours is 540 px/);
  assert.equal(plan(1080, 1920).changed, false, '1080×1920 fits as is'); assert.equal(plan(1920, 1080).reason, null);
  // 4K: down to Kling's 2160 px side
  const u = plan(3840, 2160); assert.deepEqual(u.frame, { width: 2160, height: 1214 }); assert.match(u.note!, /reduced to 2160×1214/); assert.ok(u.frame.width <= 2160 && u.frame.height >= 720);
  // too long → trimmed to the first 30 s; too short → refused (no free fix)
  const l = plan(1280, 720, { duration: 40 }); assert.equal(l.trimTo, 30); assert.equal(l.note, 'Adjusted for Kling: trimmed to 30 s');
  assert.equal(VF.videoFitFor('make-it-real', 'router-kling-edit', { width: 1280, height: 720, clipSeconds: 12 })!.trimTo, 10, 'Render: 10 s');
  const sh = plan(1280, 720, { duration: 2.5 }); assert.equal(sh.ok, false); assert.equal(sh.blocked, 'Kling needs at least 4 s of clip; yours is 2.5 s. Use a longer clip.');
  assert.equal(VF.videoFitBlock('object-swap', 'router-kling-edit', { width: 1280, height: 720, duration: 2.5 }), sh.blocked);
  // fps and container
  const f = plan(1920, 1080, { fps: 120 }); assert.equal(f.fps, 60); assert.match(f.note!, /set to 60 fps/); assert.equal(plan(1920, 1080, { fps: 15 }).fps, 24);
  const w = VF.videoFitFor('upscale', 'cloud-topaz-precise', { width: 1280, height: 720, duration: 8, videoFormat: 'webm' })!; assert.equal(w.toMp4, true); assert.match(w.note!, /converted to MP4/);
  // an upscaler never shrinks a clip: a too-big source is refused with the limit
  const bf = VF.videoFitFor('upscale', 'direct-flux3-upscale', { width: 3840, height: 2160, duration: 8 })!; assert.equal(bf.ok, false); assert.match(bf.blocked!, /up to 2560×1440; yours is 3840×2160/);
  // Fit off: the same problems refuse the run
  const off = plan(1280, 536, { fit: 'off' }); assert.equal(off.ok, false); assert.match(off.blocked!, /536 px.*Turn on Fit to model/); assert.equal(off.changed, false);
  // Seedance edit keeps the clip's shape (0.4–2.5): a 3.2:1 clip is padded to 2.5:1; a small one enlarged into the pixel budget
  const sd = VF.videoFitFor('object-swap', 'router-seedance-25-edit', { width: 1920, height: 600, duration: 8 })!; assert.deepEqual(sd.frame, { width: 1920, height: 768 }); assert.equal(sd.restore, true);
  const sd2 = VF.videoFitFor('object-swap', 'router-seedance-25-edit', { width: 640, height: 360, duration: 8 })!; assert.ok(sd2.frame.width * sd2.frame.height >= 409_600); assert.equal(sd2.aspect.choice, false);
  assert.equal(VF.videoFitFor('object-swap', 'router-seedance-25-edit', { width: 1720, height: 720, duration: 8 })!.changed, false, '2.39:1 is inside 0.4–2.5: Seedance keeps it');
  for (const [w0, h0] of [[1280, 536], [1720, 720], [540, 960], [3840, 2160], [1000, 1000], [2400, 600], [600, 2400]]) for (const m of ['pad', 'crop']) {
    const p = plan(w0, h0, { fit: m }); assert.ok(p.frame.width % 2 === 0 && p.frame.height % 2 === 0, 'even frame'); if (p.ok) { assert.ok(Math.min(p.frame.width, p.frame.height) >= 720 && Math.max(p.frame.width, p.frame.height) <= 2160, `${w0}×${h0} ${m} → ${p.frame.width}×${p.frame.height}`);
      assert.ok(['16:9', '9:16', '1:1'].some((a) => Math.abs(Math.log((p.frame.width / p.frame.height) / VF.ratioOf(a))) < 0.02), `${w0}×${h0} ${m}: a Kling shape`); } }
  ok('plans: 536 px + 2.39:1 (pad 1280×720 / crop 952×536 → 720p), 1720×720 (pad 1720×968), 9:16 enlarged, 4K reduced, 40 s trimmed, 2.5 s refused, 120 fps, WebM, Fit off, Seedance shape range');
}

// ---------------- 3. crop-back maths ----------------
{
  const a = plan(1280, 536); assert.deepEqual(VF.restoreRect(1280, 720, a), { x: 0, y: 92, width: 1280, height: 536 }); assert.deepEqual(VF.restoreRect(1920, 1080, a), { x: 0, y: 138, width: 1920, height: 804 }, '1080p result');
  const b = plan(1720, 720); const r = VF.restoreRect(1280, 720, b)!; assert.deepEqual(r, { x: 0, y: 92, width: 1280, height: 536 }); assert.ok(Math.abs(r.width / r.height - 1720 / 720) < 0.01, 'back to 2.39:1');
  assert.equal(VF.restoreRect(720, 1280, a), null, 'another shape: left alone'); assert.equal(VF.restoreRect(1280, 720, plan(1280, 536, { fit: 'crop' })), null, 'crop: nothing to undo');
  ok('crop-back: 1280×720 / 1920×1080 results map back to 2.39:1; another shape or a crop is left alone');
}

// ---------------- 4. ffmpeg: fit and crop back ----------------
{
  const S = await import('../src/videoFit.ts');
  const at = (n: string) => path.join(D, n); const ff = (a: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a]);
  const pr = (f: string) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', f]).toString());
  const vs = (f: string) => pr(f).streams.find((s: any) => s.codec_type === 'video'); const dur = (f: string) => Number(pr(f).format.duration); const aud = (f: string) => pr(f).streams.some((s: any) => s.codec_type === 'audio');
  ff(['-f', 'lavfi', '-i', 'testsrc2=size=1280x536:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', '-t', '4', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', at('w.mp4')]);
  const a = plan(1280, 536, { duration: 4 }); await S.applyFit(at('w.mp4'), a, at('w-fit.mp4'));
  assert.deepEqual([vs(at('w-fit.mp4')).width, vs(at('w-fit.mp4')).height], [1280, 720]); assert.ok(aud(at('w-fit.mp4')), 'sound kept');
  // the bars are black: the top rows average near 0
  const top = execFileSync('ffmpeg', ['-v', 'error', '-i', at('w-fit.mp4'), '-frames:v', '1', '-vf', 'crop=1280:80:0:0,format=gray,scale=1:1', '-f', 'rawvideo', '-']); assert.ok(top[0] < 20, `black bar, got ${top[0]}`);
  // a "model result" of the padded frame at 1080p, with its own sound: cropped back in place to the clip's framing
  ff(['-i', at('w-fit.mp4'), '-vf', 'scale=1920:1080', '-c:a', 'copy', at('result.mp4')]); const before = dur(at('result.mp4'));
  assert.equal(await S.restoreFile(at('result.mp4'), a), true); const v = vs(at('result.mp4'));
  assert.deepEqual([v.width, v.height], [1920, 804]); assert.ok(Math.abs(v.width / v.height - 1280 / 536) < 0.01); assert.ok(aud(at('result.mp4'))); assert.ok(Math.abs(dur(at('result.mp4')) - before) < 0.1, 'same length (sound in sync)');
  assert.equal(await S.restoreFile(at('w.mp4'), a), false, 'a 2.39:1 file is not the padded shape: untouched');
  const c = plan(1280, 536, { duration: 4, fit: 'crop' }); await S.applyFit(at('w.mp4'), c, at('w-crop.mp4')); assert.deepEqual([vs(at('w-crop.mp4')).width, vs(at('w-crop.mp4')).height], [1280, 720]);
  const t = plan(1280, 536, { duration: 2.5 }); assert.equal(t.ok, false);
  const l = VF.planVideoFit({ width: 1280, height: 536, seconds: 4 }, { ...VF.videoInputLimits('object-swap', 'router-kling-edit')!, maxSec: 2 }); await S.applyFit(at('w.mp4'), l, at('w-trim.mp4')); assert.ok(Math.abs(dur(at('w-trim.mp4')) - 2) < 0.15, 'trimmed');
  ok('ffmpeg: 1280×536 + sound → 1280×720 with black bars; a 1080p result cropped back to 1920×804 (2.39:1), same length, sound kept; crop mode; trim');
}
fs.rmSync(D, { recursive: true, force: true });
console.log('ALL OK video-fit');
