// Add logo and text (shared/logoStamp.ts + routesStamp.ts): the approved defaults, settings clean-up, the layout (position and size of the
// logo and the text for each spot, the plate, a very wide logo), the exact image composite (stamp pixels where the overlay is, the original's
// pixels everywhere else; PNG, JPEG and transparent PNG; original untouched; cached), the video copy (same length, sound kept; +1.5 s with the
// end card) and POST /api/jobs/:id/stamp end to end. Run: npx tsx test/logo-stamp.test.ts   (needs ffmpeg; no network, no model, free)
import assert from 'node:assert/strict'; import { execFileSync, spawnSync } from 'node:child_process'; import { createHash } from 'node:crypto'; import fs from 'node:fs'; import zlib from 'node:zlib'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'stamp-')); process.env.OPENHIGGSFIELD_DATA_DIR = D;
const L = await import('../src/shared/logoStamp.ts');
const S = await import('../src/routesStamp.js'); const X = await import('../src/shareExport.js'); const { jobs } = await import('../src/jobs.js');
const ok = (m: string) => console.log('ok ' + m);
const ff = (...a: string[]) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...a]);
const probe = (f: string) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', f]).toString());
const px = (f: string, x: number, y: number, fmt = 'rgb24', t?: number) => [...execFileSync('ffmpeg', ['-v', 'error', ...(t != null ? ['-ss', String(t)] : []), '-i', f, '-frames:v', '1', '-vf', t != null ? `crop=2:2:${x - (x % 2)}:${y - (y % 2)}` : `crop=1:1:${x}:${y}`, '-f', 'rawvideo', '-pix_fmt', fmt, '-'])].slice(0, fmt === 'rgba' ? 4 : 3);
const near = (a: number[], b: number[], tol: number) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
/** Mean volume (dB) of the first 2.5 s. */
const meanDb = (f: string) => { const r = spawnSync('ffmpeg', ['-v', 'info', '-t', '2.5', '-i', f, '-af', 'volumedetect', '-vn', '-f', 'null', '-'], { encoding: 'utf8' }); const m = /mean_volume:\s*(-?[\d.]+) dB/.exec(r.stderr); return m ? Number(m[1]) : -999; };
const md5 = (f: string) => createHash('md5').update(fs.readFileSync(f)).digest('hex');
const close = (a: number, b: number, m: string) => assert.ok(Math.abs(a - b) < 1e-6, `${m}: ${a} vs ${b}`);

// ---------------------------------------------------------------- defaults and settings
assert.deepEqual(L.STAMP_DEFAULTS, { spot: 'br', size: 'S', opacity: 0.9, textOn: true, text: '', endCard: false, backing: 'auto' });
assert.deepEqual(L.normStamp(null), L.STAMP_DEFAULTS); assert.deepEqual(L.normStamp({ spot: 'xx', size: 'XL', opacity: 'a', backing: 'maybe' }), L.STAMP_DEFAULTS);
assert.equal(L.normStamp({ opacity: 0.05 }).opacity, 0.3); assert.equal(L.normStamp({ opacity: 4 }).opacity, 1);
assert.equal(L.normStamp({ text: '  hi\n\tthere  ' }).text, 'hi there'); assert.equal(L.normStamp({ text: 'x'.repeat(200) }).text.length, L.STAMP_TEXT_MAX);
assert.equal(L.spotAt(0.1, 0.1), 'tl'); assert.equal(L.spotAt(0.5, 0.5), 'mc'); assert.equal(L.spotAt(0.9, 0.95), 'br'); assert.equal(L.spotAt(0.5, 0.9), 'bc');
assert.deepEqual(L.spotPart('br'), [2 / 3, 2 / 3, 1, 1]);
assert.equal(L.plateFor('auto', 0.1, 0.12), 'light'); assert.equal(L.plateFor('auto', 0.95, 0.9), 'dark'); assert.equal(L.plateFor('auto', 0.95, 0.1), null); assert.equal(L.plateFor('off', 0.1, 0.1), null); assert.equal(L.plateFor('auto', null, 0.1), null);
ok('defaults (bottom right, small, 90%, text on, end card off, auto backing) and settings clean-up');

// ---------------------------------------------------------------- layout
const tw = (n: number) => (px2: number) => n * px2 / 17; // text 120 px wide at 17 px
{ // 1000 × 600, logo 200 × 100, small, bottom right, no plate: S 600, logo 48 tall (8%), margin 27, font 17, gap 7.2
  const l = L.stampLayout(1000, 600, { spot: 'br', size: 'S' }, { w: 200, h: 100 }, tw(120), false);
  assert.equal(l.S, 600); assert.equal(l.margin, 27); close(l.logoH, 48, 'logo height'); assert.equal(l.fontPx, 17);
  close(l.logo!.w, 96, 'logo w'); close(l.logo!.h, 48, 'logo h'); close(l.text!.w, 120, 'text w'); close(l.text!.h, 21.25, 'text h');
  close(l.box.x, 1000 - 27 - 120, 'box x'); close(l.box.y + l.box.h, 600 - 27, 'box bottom at the margin');
  close(l.logo!.x + l.logo!.w, 1000 - 27, 'logo right edge at the margin'); close(l.text!.x + l.text!.w, 1000 - 27, 'text right edge'); assert.equal(l.text!.align, 'right');
  close(l.text!.y, l.logo!.y + 48 + 7.2, 'text under the logo'); assert.equal(l.plate, null);
}
{ // top left, medium, with the plate: the plate's corner sits at the margin, the logo inset by the plate padding
  const l = L.stampLayout(800, 800, { spot: 'tl', size: 'M' }, { w: 100, h: 100 }, () => 0, true);
  close(l.logoH, 96, 'M = 12%'); assert.equal(l.text, null); close(l.plate!.x, 36, 'plate x'); close(l.plate!.y, 36, 'plate y');
  close(l.logo!.x, 36 + 96 * 0.18, 'logo inset x'); close(l.plate!.w, 96 + 2 * 96 * 0.18, 'plate w'); close(l.plate!.r, 96 * 0.22, 'plate radius');
}
{ // centre spot, large; a very wide logo is capped at 60% of the width
  const l = L.stampLayout(1000, 500, { spot: 'mc', size: 'L' }, { w: 2000, h: 100 }, () => 0, false);
  close(l.logo!.w, 600, 'wide logo capped'); close(l.logo!.x, 200, 'centred'); close(l.logo!.y + l.logo!.h / 2, 250, 'middle');
}
{ // text only (a brand with no logo)
  const l = L.stampLayout(600, 600, { spot: 'bc', size: 'S' }, null, tw(90), false); assert.equal(l.logo, null); assert.equal(l.text!.align, 'center'); close(l.text!.x + l.text!.w / 2, 300, 'centred text');
}
{ const e = L.endCardLayout(1920, 1080, { w: 300, h: 100 }, tw(170)); close(e.logo!.h, 1080 * 0.22, 'end card logo'); close(e.logo!.x + e.logo!.w / 2, 960, 'centred'); assert.ok(e.text!.y > e.logo!.y + e.logo!.h); }
ok('layout: position and size for corners, centre, plate, wide logo, text only, end card');

// ---------------------------------------------------------------- image composite
const ORANGE = [0xff, 0x7a, 0x1a], BLUE = [0x20, 0x40, 0xc0];
/** A PNG from a pixel function (our own tiny encoder; RGBA, or RGB when `rgb`). */
function png(w: number, h: number, f: (x: number, y: number) => number[], rgb = false): Buffer {
  const n = rgb ? 3 : 4; const raw = Buffer.alloc((w * n + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(f(x, y).slice(0, n), y * (w * n + 1) + 1 + x * n);
  const chunk = (t: string, d: Buffer) => { const td = Buffer.concat([Buffer.from(t, 'latin1'), d]); const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = rgb ? 2 : 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
/** The overlay: transparent, an opaque orange 40×30 box near the bottom right, a 50% orange 20×20 box at (10, 10). */
const inBox = (x: number, y: number, w: number, h: number) => x >= w - 70 && x < w - 30 && y >= h - 50 && y < h - 20;
const inHalf = (x: number, y: number) => x >= 10 && x < 30 && y >= 10 && y < 30;
const ov = (w: number, h: number, _name: string) => png(w, h, (x, y) => inBox(x, y, w, h) ? [...ORANGE, 255] : inHalf(x, y) ? [...ORANGE, 128] : [0, 0, 0, 0]);
const gradient = (x: number, y: number) => [(x * 7) & 255, (y * 5) & 255, (x * y) & 255];
const rgbOf = (f: string) => execFileSync('ffmpeg', ['-v', 'error', '-i', f, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
{
  const src = path.join(D, 'grad.png'); fs.writeFileSync(src, png(320, 200, gradient, true)); const before = md5(src);
  const r = await S.stampImage('img1', src, ov(320, 200, 'ov320.png')); assert.equal(r.cached, false); assert.match(path.basename(r.file), /^img1-[0-9a-f]{12}\.png$/); assert.ok(r.file.startsWith(path.join(D, 'stamps')));
  const p = probe(r.file).streams[0]; assert.equal(p.width, 320); assert.equal(p.height, 200);
  assert.deepEqual(px(r.file, 270, 170), ORANGE, 'stamp pixels exactly');   { const a = rgbOf(src), b = rgbOf(r.file); let diff = 0; for (let y = 0; y < 200; y++) for (let x = 0; x < 320; x++) { if (inBox(x, y, 320, 200) || inHalf(x, y)) continue; const i = (y * 320 + x) * 3; if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) diff++; }
    assert.equal(diff, 0, 'every pixel outside the stamp is the original\'s, exactly'); }
  assert.ok(near(px(r.file, 20, 20), gradient(20, 20).map((b, i) => Math.round((b * 127 + ORANGE[i] * 128) / 255)), 2), 'half-opacity blends 50/50');
  assert.equal(md5(src), before, 'original untouched'); assert.equal((await S.stampImage('img1', src, ov(320, 200, 'ov320.png'))).cached, true);
  await assert.rejects(S.stampImage('img1', src, ov(100, 100, 'ov100.png')), /overlay must be a PNG of 320×200/);
  // JPEG stays JPEG
  const jpg = path.join(D, 'blue.jpg'); ff('-f', 'lavfi', '-i', 'color=c=0x2040C0:s=320x200', '-frames:v', '1', '-q:v', '2', jpg);
  const rj = await S.stampImage('img2', jpg, ov(320, 200, 'ov320.png')); assert.match(rj.file, /\.jpg$/); assert.ok(near(px(rj.file, 270, 170), ORANGE, 12)); assert.ok(near(px(rj.file, 5, 5), BLUE, 12));
  // a transparent PNG keeps its transparency outside the stamp
  const clear = path.join(D, 'clear.png'); fs.writeFileSync(clear, png(320, 200, () => [0, 0, 0, 0]));
  const ra = await S.stampImage('img3', clear, ov(320, 200, 'ov320.png')); assert.equal(px(ra.file, 5, 5, 'rgba')[3], 0, 'still transparent'); assert.deepEqual(px(ra.file, 270, 170, 'rgba'), [...ORANGE, 255]);
}
ok('image composite: exact stamp and original pixels, 50% blend, JPEG, transparency, cached, wrong size refused, original untouched');

// ---------------------------------------------------------------- video copy
{
  const src = path.join(D, 'clip.mp4'); ff('-f', 'lavfi', '-i', 'testsrc=s=320x200:r=30:d=3', '-f', 'lavfi', '-i', 'sine=d=3', '-c:a', 'aac', '-c:v', 'libx264', '-preset', 'ultrafast', '-shortest', src); const before = md5(src);
  const end = path.join(D, 'end.png'); ff('-f', 'lavfi', '-i', 'color=c=0x2040C0:s=320x200', '-frames:v', '1', end);
  for (const withEnd of [false, true]) {
    const r = await X.brandVideo('vid1', src, { overlay: ov(320, 200, 'ov320.png'), endCard: withEnd ? fs.readFileSync(end) : null, key: JSON.stringify({ stamp: withEnd }), dir: S.STAMP_DIR(), endColor: '0x2040C0' });
    assert.ok(r.file.startsWith(path.join(D, 'stamps')));
    const p = probe(r.file); const a = p.streams.find((s: any) => s.codec_type === 'audio'); assert.ok(a, 'sound kept'); assert.equal(a.codec_name, 'aac');
    const got = Number(p.format.duration), want = 3 + (withEnd ? X.END_CARD_S : 0); assert.ok(Math.abs(got - want) < 0.15, `duration ${got}, want ${want}`);
    assert.ok(meanDb(r.file) > -40, 'the clip\'s own sound (a tone), not silence');
    assert.ok(near(px(r.file, 270, 170, 'rgb24', 1), ORANGE, 40), 'logo burned in');
    if (withEnd) assert.ok(near(px(r.file, 160, 100, 'rgb24', 3 + 1.2), BLUE, 40), 'end card shown');
  }
  assert.equal(md5(src), before, 'original untouched');
}
ok('video copy: same length with sound, +1.5 s with the end card, logo burned in, original untouched');

// ---------------------------------------------------------------- the route
{
  const Fastify = (await import('fastify')).default; const multipart = (await import('@fastify/multipart')).default;
  const app = Fastify(); await app.register(multipart); S.registerStamp(app); await app.ready();
  const src = path.join(D, 'job9-out0.png'); fs.writeFileSync(src, png(320, 200, gradient, true));
  jobs.set('job9', { id: 'job9', status: 'done', toolId: 'create-image', outputs: [{ label: 'Result', url: '/files/job9-out0.png' }], resultUrl: '/files/job9-out0.png', input: {}, createdAt: new Date().toISOString() } as any);
  const send = async (fields: Record<string, string>, files: Record<string, Buffer>, id = 'job9') => {
    const fd = new FormData(); for (const [k, v] of Object.entries(fields)) fd.append(k, v); for (const [k, b] of Object.entries(files)) fd.append(k, new Blob([b], { type: 'image/png' }), `${k}.png`);
    const req = new Request('http://x/', { method: 'POST', body: fd }); const body = Buffer.from(await req.arrayBuffer());
    return app.inject({ method: 'POST', url: `/api/jobs/${id}/stamp`, headers: { 'content-type': req.headers.get('content-type')! }, payload: body });
  };
  const r = await send({ out: '0', settings: JSON.stringify({ spot: 'br' }) }, { overlay: ov(320, 200, 'ov320.png') }); assert.equal(r.statusCode, 200, r.body);
  const b = r.json(); assert.equal(b.kind, 'image'); assert.match(b.url, /^\/files\/stamps\/job9-[0-9a-f]{12}\.png$/); assert.equal(b.width, 320);
  assert.deepEqual(px(path.join(D, b.url.replace('/files/', '')), 270, 170), ORANGE);
  assert.equal((await send({ out: '3' }, { overlay: ov(320, 200, 'ov320.png') })).statusCode, 400, 'bad output index');
  assert.equal((await send({}, {})).statusCode, 400, 'no overlay');
  assert.equal((await send({}, { overlay: ov(320, 200, 'ov320.png') }, 'nope')).statusCode, 404);
  // trash takes the stamped copies with it
  S.dropStamps('job9'); assert.ok(!fs.readdirSync(S.STAMP_DIR()).some((f) => f.startsWith('job9-')));
  jobs.delete('job9'); await app.close();
}
ok('POST /api/jobs/:id/stamp: image copy at /files/stamps/…, bad index, no overlay, unknown job; dropStamps');
fs.rmSync(D, { recursive: true, force: true });
