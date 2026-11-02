// Video posters never black (2026-11-02): GET /api/media/poster (outputMeta.ts renderPoster) takes a representative frame, not frame 0,
// so a clip that fades in (or a turntable that starts dark) still gets a picture; the cache is versioned (v2) so old frame-0 posters
// re-render; and every shared video tile (server/src/shared/videoPoster.ts) gets a poster.
// Run: npx tsx test/video-poster.test.ts   (ffmpeg, own temp data dir, no server)
import assert from 'node:assert/strict'; import { execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'poster-')); process.env.OPENHIGGSFIELD_DATA_DIR = D;
const ok = (m: string) => console.log('ok ' + m);
const { renderPoster, posterTimes, POSTER_MIN_LUMA } = await import('../src/outputMeta.ts');
const { gridThumb } = await import('../src/gridThumbs.ts');
const { meanLuma } = await import('../src/ffmpeg.ts');
const V = await import('../src/shared/videoPoster.ts');

const clip = (name: string, parts: string[]) => { const f = path.join(D, name);
  execFileSync('ffmpeg', ['-y', '-v', 'error', ...parts.flatMap((c) => ['-f', 'lavfi', '-i', `color=${c}:s=160x90:r=24:d=1`]), '-filter_complex', `${parts.map((_, i) => `[${i}:v]`).join('')}concat=n=${parts.length}:v=1:a=0`, '-pix_fmt', 'yuv420p', f]); return `/files/${name}`; };

// ---- frame choice ----
assert.deepEqual(posterTimes(2), [0.5, 1, 1.5]); assert.deepEqual(posterTimes(10), [1, 5, 7.5], '~1 s in, at most 25%'); assert.deepEqual(posterTimes(0), [0], 'unknown length: the first frame');
const fade = clip('fade.mp4', ['black', 'red']); const p = await renderPoster(fade);
assert.ok(p && fs.existsSync(p), 'a poster file'); assert.ok(await meanLuma(p) >= POSTER_MIN_LUMA, `1 s black + 1 s red: a coloured frame, not black (luma ${await meanLuma(p)})`);
assert.match(path.basename(p), /^v2-/, 'cache key is versioned: posters made from frame 0 (no prefix) are not reused');
assert.equal(await renderPoster(fade), p, 'cached'); const st = fs.statSync(p).mtimeMs; await renderPoster(fade); assert.equal(fs.statSync(p).mtimeMs, st, 'not rendered twice');
const bright = clip('bright.mp4', ['blue', 'green']); const pb = await renderPoster(bright); assert.ok(pb && await meanLuma(pb) >= POSTER_MIN_LUMA, 'a bright clip: its early frame');
const dark = clip('dark.mp4', ['black', 'black']); const pd = await renderPoster(dark); assert.ok(pd && fs.existsSync(pd), 'an all-black clip still gets a poster (the brightest try)');
assert.equal(await renderPoster('/files/nope.mp4'), null); assert.equal(await renderPoster('https://x.test/v.mp4'), null);
const [a, b] = await Promise.all([renderPoster(clip('twice.mp4', ['black', 'white'])), renderPoster('/files/twice.mp4')]); assert.equal(a, b, 'concurrent requests share one render');
ok('poster: a non-black frame ~1 s in (25% of short clips), versioned cache, all-dark and missing clips handled');

// ---- grid thumb of the versioned poster URL ----
const th = await gridThumb(V.posterRoute(fade), 160); assert.ok(th && fs.existsSync(th), 'the &v= poster URL scales as a grid thumb'); assert.ok(await meanLuma(th) >= POSTER_MIN_LUMA, 'the thumb is the same coloured frame');
ok('grid thumbs read the versioned poster URL');

// ---- shared tile helper ----
assert.equal(V.posterRoute('/files/a.mp4'), `/api/media/poster?url=%2Ffiles%2Fa.mp4&v=${V.POSTER_V}`);
assert.equal(V.videoPoster('/files/a.mp4'), V.posterRoute('/files/a.mp4'), 'no stored poster: the poster route');
assert.equal(V.videoPoster('/samples/a.webm'), V.posterRoute('/samples/a.webm'));
assert.equal(V.videoPoster('/files/a.mp4', '/files/a.jpg'), '/files/a.jpg', 'a stored poster wins');
assert.equal(V.videoPoster('/files/a.mp4', '/api/media/poster?url=%2Ffiles%2Fa.mp4'), V.posterRoute('/files/a.mp4'), 'an old (frame-0) poster URL is upgraded');
assert.equal(V.videoPoster('https://x.test/v.mp4'), undefined, 'remote clip: no route'); assert.equal(V.videoPoster(null), undefined);
const WEB = path.resolve(import.meta.dirname, '../../web/src'); const src = (f: string) => fs.readFileSync(path.join(WEB, f), 'utf8');
assert.match(src('shared/ResultCard.tsx'), /const still = videoPoster\(url, poster\)/, 'ResultCard: every video gets a poster');
assert.match(src('ui/next/feed/feedMedia.ts'), /poster: videoPoster\(url, o\?\.posterUrl\) \?\? posterRoute\(url\)/, 'feed cards (Image/Video/Audio/Assets): always a poster');
assert.match(src('ui/three/feed3d.ts'), /videoPoster\(j\.outputs/, '3D cards use the shared helper');
assert.match(src('ui/three/ThreeDStudio.tsx'), /className="t3-tt" src=\{tt\} poster=\{ttPoster\}/, "the 3D model card's hover turntable has a poster");
ok('shared tiles: always a poster (stored, else the versioned route)');
fs.rmSync(D, { recursive: true, force: true });
