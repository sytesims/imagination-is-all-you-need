// A video's frame as a still (videoFrame.ts, 2026-10-26). In process, no server: a clip whose every frame has its own grey level
// (frame n = luma 20 + 8n) proves which frame came out. Checks: last = frame N-1 (frame count check), first = frame 0, at=<sec> = the first
// frame shown at or after that time, past the end = the last frame, full size for odd and portrait sizes, no metadata in the PNG,
// parseFrameAt, mediaFileOf (no paths outside the served folders), and LTX Extend's exact-last-frame guide uses the same args.
// Run: npx tsx test/video-frame.test.ts
import assert from 'node:assert/strict'; import { execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'vframe-')); process.env.OPENHIGGSFIELD_DATA_DIR = path.join(D, 'data'); fs.mkdirSync(process.env.OPENHIGGSFIELD_DATA_DIR);
const VF = await import('../src/videoFrame.ts'); const FF = await import('../src/ffmpeg.ts'); const LTX = await import('../src/comfy/ltx25Extend.ts');
const ok = (m: string) => console.log('ok ' + m);
const N = 25, FPS = 10; const lum = (n: number) => 20 + 8 * n; // inside the 16–235 video range
/** A clip of N frames at FPS, frame n a flat grey of luma lum(n) (lossless, so the level survives), with a title tag to strip. */
function clip(file: string, w: number, h: number, ext = 'mp4') {
  const enc = ext === 'webm' ? ['-c:v', 'libvpx-vp9', '-lossless', '1'] : ['-c:v', 'libx264', '-qp', '0', '-pix_fmt', 'yuv420p'];
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `nullsrc=s=${w}x${h}:r=${FPS}:d=${N / FPS},format=yuv420p,geq=lum='20+8*N':cb=128:cr=128`, '-frames:v', String(N), ...enc, '-metadata', 'title=secret-title', '-metadata', 'comment=private', file]);
  return file;
}
const probeTags = (f: string) => execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format_tags:stream_tags', '-of', 'json', f]).toString();
const near = (a: number, b: number, m: string) => assert.ok(Math.abs(a - b) <= 2, `${m}: luma ${a.toFixed(1)}, want ${b}`);

// parseFrameAt / frameKey
assert.deepEqual(VF.parseFrameAt('last'), { kind: 'last' }); assert.deepEqual(VF.parseFrameAt('FIRST'), { kind: 'first' }); assert.deepEqual(VF.parseFrameAt(0), { kind: 'first' });
assert.deepEqual(VF.parseFrameAt('1.5'), { kind: 'time', t: 1.5 }); for (const b of ['', null, -1, 'abc', 'NaN', Infinity]) assert.ok('error' in VF.parseFrameAt(b), `rejects ${b}`);
assert.equal(VF.frameKey({ kind: 'time', t: 1 }), '1000'); assert.equal(VF.frameKey({ kind: 'last' }), 'last');
ok('parseFrameAt: first | last | seconds ≥ 0; bad values rejected');

// exact frames on a landscape clip
const src = clip(path.join(D, 'grey.mp4'), 320, 180);
assert.equal(await FF.countFrames(src), N, 'fixture frame count');
{ const out = path.join(D, 'last.png'); const r: any = await VF.extractFrame(src, out, { kind: 'last' }); assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.frames, N, 'counted every frame'); assert.equal(r.index, N - 1, 'took frame N-1'); near(await FF.meanLuma(out), lum(N - 1), 'last frame');
  assert.equal(r.width, 320); assert.equal(r.height, 180); ok(`last: frame ${r.index} of ${r.frames} (luma ${lum(N - 1)}), 320×180`); }
{ const out = path.join(D, 'first.png'); const r: any = await VF.extractFrame(src, out, { kind: 'first' }); assert.ok(r.ok); assert.equal(r.index, 0); near(await FF.meanLuma(out), lum(0), 'first frame'); ok('first: frame 0'); }
for (const [t, n] of [[1.3, 13], [1.25, 13], [0.5, 5], [2.4, 24]] as const) {
  const out = path.join(D, `t${t}.png`); const r: any = await VF.extractFrame(src, out, { kind: 'time', t }); assert.ok(r.ok, JSON.stringify(r)); near(await FF.meanLuma(out), lum(n), `at=${t}`);
}
ok('at=<sec>: 1.3 → frame 13, 1.25 → 13 (first shown at or after), 0.5 → 5, 2.4 → 24');
{ const out = path.join(D, 'past.png'); const r: any = await VF.extractFrame(src, out, { kind: 'time', t: 99 }); assert.ok(r.ok); assert.equal(r.index, N - 1); near(await FF.meanLuma(out), lum(N - 1), 'past the end'); ok('at past the end → the last frame'); }

// metadata stripped, deterministic bytes
{ assert.match(probeTags(src), /secret-title/, 'fixture carries a title tag');
  const a = path.join(D, 'last.png'); const b = path.join(D, 'last2.png'); await VF.extractFrame(src, b, { kind: 'last' });
  assert.doesNotMatch(probeTags(a), /secret-title|private|encoder|Lavc/i, 'no tags in the PNG'); assert.doesNotMatch(fs.readFileSync(a).toString('latin1'), /tEXt|iTXt|zTXt|secret-title|Lavc/, 'no text chunks');
  assert.ok(fs.readFileSync(a).equals(fs.readFileSync(b)), 'same frame → same bytes'); ok('PNG has no metadata (no tags, no text chunks) and is byte-identical on a second grab'); }

// odd + portrait sizes and webm keep full resolution
for (const [w, h, ext] of [[180, 320, 'mp4'], [255, 143, 'webm']] as const) {
  const s = clip(path.join(D, `p${w}.${ext}`), w, h, ext); const out = path.join(D, `p${w}.png`); const r: any = await VF.extractFrame(s, out, { kind: 'last' });
  assert.ok(r.ok, JSON.stringify(r)); const sz = await FF.videoSize(out); const vs = await FF.videoSize(s);
  assert.deepEqual(sz, vs, `${ext} ${w}×${h}: frame size = clip size`); assert.equal(r.index, N - 1); near(await FF.meanLuma(out), lum(N - 1), `${ext} last`);
}
ok('portrait 180×320 mp4 and odd-sized webm: the frame is the clip\'s own size');

// missing file, no frames
{ const r: any = await VF.extractFrame(path.join(D, 'nope.mp4'), path.join(D, 'x.png'), { kind: 'last' }); assert.equal(r.ok, false); assert.equal(r.code, 'missing');
  const bad = path.join(D, 'bad.mp4'); fs.writeFileSync(bad, 'not a video'); const r2: any = await VF.extractFrame(bad, path.join(D, 'y.png'), { kind: 'last' }); assert.equal(r2.ok, false);
  assert.equal(fs.readdirSync(D).filter((f) => /\.png\.\w+\.png$/.test(f)).length, 0, 'no temp files left'); ok('missing / unreadable video → a plain error, no temp files'); }

// mediaFileOf: served folders only
{
  assert.ok(VF.mediaFileOf('/files/a.mp4')?.endsWith(`${path.sep}a.mp4`)); assert.ok(VF.mediaFileOf('/samples/sample-take.mp4')?.endsWith('sample-take.mp4'));
  for (const u of ['/files/../etc/passwd', '/files/%2e%2e/x.mp4', 'https://example.com/a.mp4', '/etc/passwd', '', null, '/files/a\0.mp4']) assert.equal(VF.mediaFileOf(u), null, `rejects ${u}`);
  ok('mediaFileOf: /files, /samples, /showcase only; no .., no remote URLs'); }

// LTX Extend's exact last frame (G = 1) is the shared grab
assert.deepEqual(LTX.guideArgs('/c.mp4', '/g.png', 57, 1), VF.frameIndexArgs('/c.mp4', '/g.png', 56)); assert.equal(LTX.countFrames, FF.countFrames);
ok('LTX Extend guide (G=1) = frameIndexArgs(N-1); countFrames is the one shared helper');
fs.rmSync(D, { recursive: true, force: true });
