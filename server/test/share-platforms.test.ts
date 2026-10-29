// Share sheet v3 (2026-10-24): Instagram / TikTok formats and sizes, captions without hashtags, Image to layers shares the composite, and the
// server's reframed and still → video exports.
// Unit: web/src/shared/sharePlatforms.ts (formats per destination and kind, frame sizes, fit math, captions and their limits, shareMedia picks the
// composite for a layered job); shareExport.ts (a 640×360 video reframed to 9:16 fit and 4:5 fill; a still → 6 s 9:16 clip with an end card;
// a recorded clip → H.264/AAC MP4); no "#OpenSourceHiggsfield" left in any share source file.
// E2E (own mock server :9174, temp data dir, no keys, no spend): a 13-layer job's /share/info names the composite and the count and has no hashtag;
// its /s/<token> page shows the composite and the layers .zip link, not the plate alone; the server card is drawn from the composite.
// Run: npx tsx test/share-platforms.test.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { execFileSync, spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'share-plat-'));
const UNIT = fs.mkdtempSync(path.join(D, 'unit-')); process.env.OPENHIGGSFIELD_DATA_DIR = UNIT;
const ok = (m: string) => console.log('ok ' + m);
const P = await import('../../web/src/shared/sharePlatforms.ts');
const X = await import('../src/shareExport.ts');

// ---------------- formats and sizes ----------------
{
  assert.deepEqual(P.FRAME_PX['4:5'], [1080, 1350]); assert.deepEqual(P.FRAME_PX['1:1'], [1080, 1080]); assert.deepEqual(P.FRAME_PX['9:16'], [1080, 1920]);
  for (const [W, H] of Object.values(P.FRAME_PX)) assert.ok(W % 2 === 0 && H % 2 === 0 && W <= 1440, 'even sides, Instagram width ≤ 1440');
  const ig = P.formatsFor('instagram', 'image'); assert.deepEqual(ig.map((f) => [f.frame, f.as]), [['4:5', 'image'], ['1:1', 'image'], ['9:16', 'video']], 'Instagram image: 4:5 and 1:1 posts, a 9:16 Reel');
  assert.deepEqual(P.formatsFor('instagram', 'video').map((f) => [f.frame, f.as]), [['9:16', 'video'], ['4:5', 'video']], 'Instagram video: Reel first');
  assert.deepEqual(P.formatsFor('tiktok', 'video').map((f) => [f.frame, f.as]), [['9:16', 'video']], 'TikTok video: 9:16');
  assert.deepEqual(P.formatsFor('tiktok', 'image').map((f) => [f.frame, f.as]), [['9:16', 'video'], ['9:16', 'image']], 'TikTok image: a 9:16 video first, a 9:16 photo too');
  assert.ok(P.formatsFor('tiktok', 'image', { layers: true }).some((f) => f.explode && f.frame === '9:16' && f.as === 'video'), 'layers get the layers video');
  assert.ok(!P.formatsFor('instagram', 'video', { layers: true }).some((f) => f.explode), 'no layers video for a video result');
  for (const k of ['image', 'video', 'audio', '3d'] as const) assert.deepEqual(P.formatsFor('x', k).map((f) => f.frame), ['original'], `X: original (${k})`);
  assert.equal(P.destOk('instagram', 'audio'), false); assert.equal(P.destOk('tiktok', '3d'), false); assert.equal(P.destOk('download', 'audio'), true); assert.equal(P.destOk('x', '3d'), true);
  // every picture stays inside its frame when fitted, and covers it when filled
  for (const [sw, sh] of [[600, 2400], [3200, 600], [1280, 720], [1080, 1350]]) for (const f of ['4:5', '1:1', '9:16'] as const) {
    const [W, H] = P.FRAME_PX[f]; const a = P.fitRect(sw, sh, W, H, 'fit'), b = P.fitRect(sw, sh, W, H, 'fill');
    assert.ok(a.w <= W + 1e-6 && a.h <= H + 1e-6 && a.x >= -1e-6 && a.y >= -1e-6 && (Math.abs(a.w - W) < 1e-6 || Math.abs(a.h - H) < 1e-6), `fit ${sw}×${sh} in ${f}`);
    assert.ok(b.w >= W - 1e-6 && b.h >= H - 1e-6, `fill ${sw}×${sh} covers ${f}`);
  }
  assert.equal(P.sameShape(1080, 1350, '4:5'), true); assert.equal(P.sameShape(1280, 720, '9:16'), false); assert.deepEqual(P.outSize(1280, 720, '9:16'), [1080, 1920]); assert.deepEqual(P.outSize(1280, 720, 'original'), [1280, 720]);
  assert.equal(P.PLATFORMS.instagram.upload, 'https://www.instagram.com/'); assert.equal(P.PLATFORMS.tiktok.upload, 'https://www.tiktok.com/upload');
  assert.equal(P.PLATFORMS.instagram.imageMaxBytes, 8e6); assert.equal(P.PLATFORMS.instagram.videoMaxBytes, 300e6); assert.equal(P.PLATFORMS.tiktok.imageMaxBytes, 20e6);
  ok('formats: Instagram 4:5 / 1:1 posts and 9:16 Reels, TikTok 9:16, layers video for layered images; fit / fill geometry; limits');
}
// ---------------- captions: ours, within limits; the only tag is #ImaginationIsAllYouNeed on X, when asked (2026-10-25) ----------------
{
  const long = 'A lone lighthouse keeper in a yellow raincoat stands on black basalt rocks at golden hour, '.repeat(40);
  const bases = [P.captionOf({ featureId: 'relight', model: 'FLUX.2 klein', kind: 'image' }), P.captionOf({ featureId: null, model: null, kind: 'video' }), P.captionOf({ featureId: null, model: 'MiniMax Music 3', kind: 'audio' }),
    P.captionOf({ featureId: null, model: 'Tripo 3.1', kind: '3d' }), P.captionOf({ featureId: 'image-layers', model: 'Seedream 5.0 Flash', kind: 'image', layers: 13 })];
  assert.equal(bases[0], 'Relit this with FLUX.2 klein in Imagination Is All You Need (open source)');
  assert.equal(bases[4], 'Split this into 13 layers with Seedream 5.0 Flash in Imagination Is All You Need (open source)');
  for (const base of bases) for (const dest of ['x', 'instagram', 'tiktok', 'system', 'link', 'download'] as const) for (const prompt of [null, 'a mug', long]) for (const tag of [false, true]) {
    const t = P.captionFor(dest, { base, prompt, link: 'https://example.com/s/abc', repo: 'https://github.com/sytesims/imagination-is-all-you-need', tag });
    if (tag && dest === 'x') assert.ok(t.endsWith(' #ImaginationIsAllYouNeed') && t.split('#').length === 2, `X with the tag: ends with the one tag (${t.slice(-40)})`);
    else assert.ok(!t.includes('#'), `no hashtag: ${dest}`); assert.ok(!/OpenSourceHiggsfield/i.test(t)); assert.ok(t.startsWith(base));
    if (dest === 'x') assert.ok(P.xLength(t) <= 280, `X fits 280 with the link (${P.xLength(t)})`);
    if (dest === 'instagram' || dest === 'tiktok') { assert.ok([...t].length <= 2200, `${dest} ≤ 2200`); assert.ok(t.endsWith('github.com/sytesims/imagination-is-all-you-need'), `${dest} ends with the repo`); }
  }
  assert.ok(P.captionFor('x', { base: bases[0], prompt: long, repo: 'r' }).includes('…'), 'a long prompt is cut with an ellipsis');
  // and nowhere in the share code
  const files = ['web/src/shared/ShareSheet.tsx', 'web/src/shared/shareBrand.ts', 'web/src/shared/shareCard.ts', 'web/src/shared/sharePrefs.ts', 'web/src/shared/sharePlatforms.ts', 'web/src/shared/shareFrame.ts', 'server/src/routesShare.ts', 'server/src/shareCard.ts', 'server/src/shareExport.ts'];
  for (const f of files) assert.ok(!/OpenSourceHiggsfield/i.test(fs.readFileSync(path.join(ROOT, '..', f), 'utf8').replace(/#OpenSourceHiggsfield out on purpose/g, '')), `${f}: no old hashtag`);
  ok('captions: our own line, no old hashtag anywhere, #ImaginationIsAllYouNeed only on X with the switch, X ≤ 280 with the link, Instagram / TikTok ≤ 2,200, long prompts cut');
}
// ---------------- what is shared ----------------
{
  const outs = Array.from({ length: 13 }, (_, k) => ({ url: `/files/j-out${k}.png` }));
  const lay = P.shareMedia({ input: { layers: true }, outputs: outs, layersPosterUrl: '/files/j-layers.png' }, 0)!;
  assert.deepEqual(lay, { url: '/files/j-layers.png', kind: 'image', layers: 13 }, 'layers: the composite, not output 0 (the plate)');
  assert.equal(P.shareMedia({ input: { layers: true }, outputs: outs, layersPosterUrl: '/files/j-layers.png' }, 5)!.url, '/files/j-layers.png', 'whatever output the viewer was on');
  assert.equal(P.shareMedia({ input: { layers: true }, outputs: outs }, 0)!.url, '/files/j-out12.png', 'no poster yet: the top layer, never the plate');
  assert.deepEqual(P.shareMedia({ input: {}, outputs: [{ url: '/files/a.png' }, { url: '/files/b.png' }] }, 1), { url: '/files/b.png', kind: 'image', layers: 0 });
  assert.equal(P.shareMedia({ outputs: [{ url: '/files/m.glb' }] })!.kind, '3d'); assert.equal(P.shareMedia({ outputs: [{ url: '/files/a.m4a' }] })!.kind, 'audio');
  assert.equal(P.shareMedia({ outputs: [] }), null);
  ok('shareMedia: a layered job shares its composite (or the top layer), others the picked output; 3D and audio kinds');
}
// ---------------- server exports ----------------
const ff = (...a: string[]) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...a]);
const probe = (f: string) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', f]).toString());
const pixel = (f: string, t: number, x: number, y: number) => [...execFileSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', f, '-frames:v', '1', '-vf', `crop=2:2:${x}:${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])].slice(0, 3);
const near = (a: number[], b: number[], tol = 40) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
{
  const src = path.join(UNIT, 'src.mp4'); ff('-f', 'lavfi', '-i', 'color=c=0x00C000:s=640x360:r=30:d=3', '-c:v', 'libx264', '-preset', 'ultrafast', src);
  // 9:16 fit: the green video sits in the middle band, the blurred copy above and below is darker; the overlay (an orange box at the frame's top-left) is burned in
  const ov = path.join(UNIT, 'ov.png'); ff('-f', 'lavfi', '-i', 'color=c=black@0.0:s=1080x1920,format=rgba,drawbox=x=0:y=0:w=80:h=80:color=0xFF7A1A@1.0:t=fill:replace=1', '-frames:v', '1', ov); // transparent but for the box
  const r = await X.brandVideo('jv', src, { overlay: fs.readFileSync(ov), endCard: null, key: 'fit', frame: X.frameOf('9:16', 'fit') });
  const p = probe(r.file); const v = p.streams.find((s: any) => s.codec_type === 'video');
  assert.equal(v.width, 1080); assert.equal(v.height, 1920); assert.equal(v.codec_name, 'h264'); assert.ok(p.streams.some((s: any) => s.codec_type === 'audio' && s.codec_name === 'aac'), 'AAC track (silent)');
  const mid = pixel(r.file, 1, 540, 960), top = pixel(r.file, 1, 540, 300); assert.ok(near(mid, [0, 192, 0]), `video in the middle ${mid}`); assert.ok(top[1] < mid[1] - 20, `backdrop darker ${top} vs ${mid}`);
  assert.ok(near(pixel(r.file, 1, 20, 20), [0xff, 0x7a, 0x1a]), 'overlay at the frame size');
  // 4:5 fill: green edge to edge; a video-size overlay is refused for a frame
  const r2 = await X.brandVideo('jv', src, { overlay: fs.readFileSync(path.join(UNIT, 'ov.png')), endCard: null, key: 'fill', frame: X.frameOf('4:5', 'fill') }).catch((e) => e);
  assert.match(String(r2?.message), /overlay must be a PNG of 1080×1350/);
  const ov45 = path.join(UNIT, 'ov45.png'); ff('-f', 'lavfi', '-i', 'color=c=black@0.0:s=1080x1350,format=rgba', '-frames:v', '1', ov45);
  const r3 = await X.brandVideo('jv', src, { overlay: fs.readFileSync(ov45), endCard: null, key: 'fill', frame: X.frameOf('4:5', 'fill') }); const v3 = probe(r3.file).streams.find((s: any) => s.codec_type === 'video');
  assert.equal(`${v3.width}×${v3.height}`, '1080×1350'); assert.ok(near(pixel(r3.file, 1, 20, 20), [0, 192, 0]) && near(pixel(r3.file, 1, 1050, 1320), [0, 192, 0]), 'fill covers the frame');
  // a still → 6 s 9:16 clip + 1.5 s end card
  const still = path.join(UNIT, 'still.png'); ff('-f', 'lavfi', '-i', 'color=c=0x2040FF:s=1080x1920', '-frames:v', '1', still);
  const end = path.join(UNIT, 'end.png'); ff('-f', 'lavfi', '-i', 'color=c=0xFF7A1A:s=1080x1920', '-frames:v', '1', end);
  const c = await X.makeClip('js', { media: fs.readFileSync(still), kind: 'still', ext: 'png', endCard: fs.readFileSync(end), secs: 6, W: 1080, H: 1920 });
  const pc = probe(c.file); const vc = pc.streams.find((s: any) => s.codec_type === 'video');
  assert.equal(`${vc.width}×${vc.height}`, '1080×1920'); assert.ok(Math.abs(Number(pc.format.duration) - 7.5) < 0.2, `6 s + end card (${pc.format.duration})`);
  assert.ok(near(pixel(c.file, 3, 540, 960), [0x20, 0x40, 0xff]), 'the still'); assert.ok(near(pixel(c.file, 7.2, 540, 960), [0xff, 0x7a, 0x1a]), 'the end card');
  assert.equal((await X.makeClip('js', { media: fs.readFileSync(still), kind: 'still', ext: 'png', endCard: fs.readFileSync(end), secs: 6, W: 1080, H: 1920 })).cached, true, 'cached');
  // a recorded clip (WebM, as MediaRecorder makes) → MP4 H.264
  const webm = path.join(UNIT, 'rec.webm'); ff('-f', 'lavfi', '-i', 'testsrc=s=1080x1920:r=30:d=2', '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-b:v', '1M', webm);
  const w = await X.makeClip('jw', { media: fs.readFileSync(webm), kind: 'clip', ext: 'webm', endCard: null, secs: 6, W: 1080, H: 1920 }); const pw = probe(w.file);
  assert.equal(pw.streams.find((s: any) => s.codec_type === 'video').codec_name, 'h264'); assert.ok(Math.abs(Number(pw.format.duration) - 2) < 0.2, 'clip keeps its length');
  ok('server: video reframed to 9:16 fit (blurred backdrop) and 4:5 fill, overlay at the frame size; still → 6 s clip + end card; WebM recording → H.264 MP4');
}

// ---------------- e2e: Image to layers through the share routes ----------------
const PORT = testPort(9174); const B = `http://localhost:${PORT}`; const DATA = fs.mkdtempSync(path.join(D, 'srv-'));
const PHOTO = path.join(D, 'photo.png'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=gray:s=1200x800', '-frames:v', '1', PHOTO]);
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_BILLING_MODE: '' };
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: DATA, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'env.local'), OPENHIGGSFIELD_BACKEND: 'mock',
  OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_MOCK_DELAY_MS: '100', OPENHIGGSFIELD_COMFY_ROUTER_URL: '' }, stdio: ['ignore', 'ignore', 'pipe'], detached: true });
const get = async (u: string) => { const r = await fetch(B + u); return { status: r.status, body: await r.json() as any }; };
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  const fd = new FormData(); for (const [k, v] of Object.entries({ provider: 'api-seedream-layers-flash', imageResolution: '1K', rights: '1', prompt: 'split into 13 layers' })) fd.append(k, v);
  fd.append('image', new Blob([fs.readFileSync(PHOTO)], { type: 'image/png' }), 'photo.png');
  const sub = await (await fetch(`${B}/api/tools/app-image-layers/jobs`, { method: 'POST', body: fd })).json() as any; assert.ok(sub.id, JSON.stringify(sub).slice(0, 200));
  let j: any = null; for (let i = 0; i < 120; i++) { j = (await get(`/api/jobs/${sub.id}`)).body; if (['done', 'failed', 'blocked'].includes(j.status)) break; await new Promise((r) => setTimeout(r, 250)); }
  assert.equal(j.status, 'done'); assert.equal(j.outputs.length, 13);
  const info = (await get(`/api/jobs/${j.id}/share/info`)).body; assert.equal(info.layers, 13); assert.equal(info.layersPosterUrl, `/files/${j.id}-layers.png`); assert.ok(!('hashtag' in info), 'no hashtag field');
  assert.ok(!JSON.stringify(info).includes('OpenSourceHiggsfield'));
  assert.equal(P.shareMedia(j, 0)!.url, `/files/${j.id}-layers.png`, 'the sheet shares the composite');
  const sh = (await (await fetch(`${B}/api/jobs/${j.id}/share`, { method: 'POST' })).json()) as any; const tok = sh.token; assert.ok(tok);
  const html = await (await fetch(`${B}/s/${tok}`)).text();
  assert.ok(html.includes(`/files/${j.id}-layers.png?clean=1`), 'the link page shows the composite (clean copy)'); assert.ok(html.includes('13 layers, stacked'));
  assert.ok(html.includes(`/api/share/${tok}/download.zip`) && html.includes('Download all 13 layers (.zip)'), 'and the layers .zip');
  assert.ok(!/OpenSourceHiggsfield/.test(html), 'no hashtag on the page');
  const zr = await fetch(`${B}/api/share/${tok}/download.zip`); assert.equal(zr.status, 200); assert.equal(zr.headers.get('content-type'), 'application/zip');
  // the server card is drawn from the composite: the mock's composite has a brown box in the middle, the plate is only sky
  const card = Buffer.from(await (await fetch(`${B}/s/${tok}/card.png`)).arrayBuffer()); const cf = path.join(D, 'card.png'); fs.writeFileSync(cf, card);
  const plate = path.join(DATA, `${j.id}-out0.png`); const comp = path.join(DATA, `${j.id}-layers.png`);
  const rgb = (f: string, w: number, h: number, x: number, y: number) => [...execFileSync('ffmpeg', ['-v', 'error', '-i', f, '-vf', `scale=${w}:${h},crop=1:1:${x}:${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])];
  const diffs = (f: string) => { let plateD = 0, compD = 0; for (const [fx, fy] of [[0.5, 0.62], [0.45, 0.7], [0.55, 0.66], [0.3, 0.85]]) {
    // the card's media box: 1104 × 470 at y 40, centred; the 1024 × 682 picture fits by height
    const h = 470, w = Math.round(1024 * h / 682); const cx = Math.round((1200 - w) / 2 + fx * w), cy = Math.round(40 + fy * h);
    const c = rgb(f, 1200, 630, cx, cy); const pl = rgb(plate, 1024, 682, Math.round(fx * 1024), Math.round(fy * 682)); const co = rgb(comp, 1024, 682, Math.round(fx * 1024), Math.round(fy * 682));
    plateD += c.reduce((a, v, i) => a + Math.abs(v - pl[i]), 0); compD += c.reduce((a, v, i) => a + Math.abs(v - co[i]), 0); } return { plateD, compD }; };
  const d = diffs(cf); assert.ok(d.compD < d.plateD, `card matches the composite (${d.compD}) better than the plate (${d.plateD})`);
  ok('e2e: a 13-layer job: /share/info names the composite and 13 layers (no hashtag); /s/<token> shows the composite, the layers and the .zip; the server card is the composite');
} finally { try { process.kill(-srv.pid!, 'SIGTERM'); } catch { /* */ } fs.rmSync(D, { recursive: true, force: true }); }
console.log('share-platforms: all passed');
