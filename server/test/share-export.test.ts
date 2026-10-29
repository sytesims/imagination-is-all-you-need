// Share step 3: branded video (shareExport.ts). 5 s and 60 s testsrc clips, portrait and landscape, with and without audio, with and
// without the end card → H.264/AAC MP4 that ffprobe reads, no metadata, expected length, overlay burned in. Run: npx tsx test/share-export.test.ts
import assert from 'node:assert/strict'; import { execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'shx-')); process.env.OPENHIGGSFIELD_DATA_DIR = D;
const X = await import('../src/shareExport.js'); const lib = await import('../src/library.js');
const ff = (...a: string[]) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...a]);
const probe = (f: string) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-show_chapters', '-of', 'json', f]).toString());
const pixel = (f: string, t: number, x: number, y: number) => [...execFileSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', f, '-frames:v', '1', '-vf', `crop=2:2:${x - (x % 2)}:${y - (y % 2)}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])].slice(0, 3);
const near = (a: number[], b: number[], tol = 40) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
const ORANGE = [0xff, 0x7a, 0x1a];
try {
  const endPng = path.join(D, 'end.png'); ff('-f', 'lavfi', '-i', 'color=c=0xFF7A1A:s=1920x1080', '-frames:v', '1', endPng); const endCard = fs.readFileSync(endPng);
  const cases = [
    { name: '5s landscape, audio, end card', w: 640, h: 360, d: 5, audio: true, end: true },
    { name: '5s portrait, silent, end card', w: 360, h: 640, d: 5, audio: false, end: true },
    { name: '60s landscape, audio, end card', w: 640, h: 360, d: 60, audio: true, end: true },
    { name: '60s portrait, silent, no end card', w: 360, h: 640, d: 60, audio: false, end: false },
  ];
  for (const c of cases) {
    const t0 = Date.now(); const src = path.join(D, `src-${c.w}x${c.h}-${c.d}-${c.audio ? 'a' : 's'}.mp4`);
    ff('-f', 'lavfi', '-i', `testsrc=s=${c.w}x${c.h}:r=30:d=${c.d}`, ...(c.audio ? ['-f', 'lavfi', '-i', `sine=d=${c.d}`, '-c:a', 'aac'] : []), '-c:v', 'libx264', '-preset', 'ultrafast', '-metadata', 'title=SECRET', src);
    // overlay: transparent with an opaque orange 80×40 box at (20, 20), like the badge
    const ovPng = path.join(D, `ov-${c.w}x${c.h}.png`); ff('-f', 'lavfi', '-i', `color=c=black@0.0:s=${c.w}x${c.h}`, '-frames:v', '1', '-vf', 'format=rgba,drawbox=x=20:y=20:w=80:h=40:color=0xFF7A1A@1.0:t=fill', ovPng);
    const r = await X.brandVideo('job1', src, { overlay: fs.readFileSync(ovPng), endCard: c.end ? endCard : null, key: c.name });
    assert.equal(r.cached, false); assert.match(path.basename(r.file), /^job1-[0-9a-f]{12}\.mp4$/); assert.ok(r.file.startsWith(path.join(D, 'share-exports')));
    const p = probe(r.file); const v = p.streams.find((s: any) => s.codec_type === 'video'); const a = p.streams.find((s: any) => s.codec_type === 'audio');
    assert.equal(v.codec_name, 'h264', c.name); assert.equal(v.pix_fmt, 'yuv420p'); assert.equal(v.width, c.w); assert.equal(v.height, c.h);
    assert.ok(a, `${c.name}: has an audio track`); assert.equal(a.codec_name, 'aac');
    const want = c.d + (c.end ? X.END_CARD_S : 0); const got = Number(p.format.duration); assert.ok(Math.abs(got - want) < 0.15, `${c.name}: ${got}s, want ${want}s`);
    assert.ok(!JSON.stringify(p).includes('SECRET'), 'source tags gone'); assert.equal(p.chapters.length, 0);
    assert.deepEqual(Object.keys(p.format.tags ?? {}).filter((k) => !/^(major_brand|minor_version|compatible_brands)$/.test(k)), [], `${c.name}: no metadata`);
    assert.ok(near(pixel(r.file, 1, 60, 40), ORANGE), `${c.name}: badge burned in`);
    if (c.end) assert.ok(near(pixel(r.file, c.d + 1.2, Math.floor(c.w / 2), Math.floor(c.h / 2)), ORANGE), `${c.name}: end card shown`);
    // the original is untouched; a second call is cached
    assert.ok(JSON.stringify(probe(src)).includes('SECRET'));
    assert.equal((await X.brandVideo('job1', src, { overlay: fs.readFileSync(ovPng), endCard: c.end ? endCard : null, key: c.name })).cached, true);
    console.log(`  ${c.name}: ${got.toFixed(2)}s in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
  // wrong overlay size is refused
  await assert.rejects(X.brandVideo('job1', path.join(D, 'src-640x360-5-a.mp4'), { overlay: endCard, endCard: null, key: 'bad' }), /overlay must be a PNG of 640×360/);
  // trash removes the job's exports (and only that job's)
  fs.writeFileSync(path.join(D, 'share-exports', 'job2-aaaaaaaaaaaa.mp4'), 'x');
  lib.trash('job1'); assert.deepEqual(fs.readdirSync(path.join(D, 'share-exports')).filter((f) => !f.startsWith('.')), ['job2-aaaaaaaaaaaa.mp4']);
  console.log('ok share-export: H.264/AAC, no metadata, length (+1.5 s end card), overlay + end card burned in, cache, size check, trash cleanup');
} finally { fs.rmSync(D, { recursive: true, force: true }); }
process.exit(0);
