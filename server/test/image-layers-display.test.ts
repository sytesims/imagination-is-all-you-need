// Image to layers display (2026-10-24): the composite poster, the client compositor, the layered PSD and the mock's drawn sample layers.
// Unit (in process, no network): composite ORDER (server ffmpeg poster and the shared web compositeLayers: the top layer wins where layers overlap, hidden
// layers are skipped, a cropped layer is placed at its box); the PSD written by web/src/shared/layerPsd.ts read back with the same library (ag-psd): layer
// count, names, positions, the hidden flag and pixels; the mock's sample layers (2–13 from the prompt, names, descriptions, boxes).
// E2E (own mock server :9173, temp data dir, no keys, no spend): a 13-layer and a 2-layer run carry names, descriptions and boxes and a composite poster;
// a job whose poster file is missing (as before this change) gets one from GET /api/jobs/:id/layers-poster.png on first view.
// Run: npx tsx test/image-layers-display.test.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'layers-view-'));
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '', OPENHIGGSFIELD_BILLING_MODE: '' };
const UNIT = fs.mkdtempSync(path.join(D, 'unit-')); Object.assign(process.env, NOKEYS, { OPENHIGGSFIELD_DATA_DIR: UNIT, OPENHIGGSFIELD_BACKEND: 'mock' });
const ok = (m: string) => console.log('ok ' + m);
const rgbaOf = (f: string) => { const [w, h] = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f]).toString().trim().split(',').map(Number);
  return { width: w, height: h, data: new Uint8ClampedArray(execFileSync('ffmpeg', ['-v', 'error', '-i', f, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 1 << 28 })) }; };
const at = (im: { width: number; data: ArrayLike<number> }, x: number, y: number) => Array.from({ length: 4 }, (_, c) => im.data[(y * im.width + x) * 4 + c]);

const ML = await import('../src/tools/mockLayers.ts'); const LP = await import('../src/layerPoster.ts');
const C = await import('../../web/src/shared/layerCompose.ts'); const PSD = await import('../../web/src/shared/layerPsd.ts'); const AG = await import('ag-psd');
// reading layer pixels needs ImageData; node has no canvas, so plain RGBA buffers stand in (the writer needs none)
AG.initializeCanvas((() => { throw new Error('no canvas in tests'); }) as any, ((w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) })) as any);
// three test layers on 200 × 100: red full plate, green square (40..120, 20..80), blue square (80..160, 40..90) as a CROPPED 80 × 50 file with a box
const sq = (w: number, h: number, c: number[], box?: number[]) => { const d = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!box || (x >= box[0] && x < box[2] && y >= box[1] && y < box[3])) d.set([...c, 255], (y * w + x) * 4); return { width: w, height: h, data: d }; };
const RED = sq(200, 100, [255, 0, 0]), GREEN = sq(200, 100, [0, 255, 0], [40, 20, 120, 80]), BLUE = sq(80, 50, [0, 0, 255]);
{
  const files = [['red', RED], ['green', GREEN], ['blue', BLUE]].map(([n, im]: any) => { const f = path.join(UNIT, `t-out-${n}.png`); fs.writeFileSync(f, ML.encodePng(im.data, im.width, im.height)); return f; });
  const job: any = { id: 'order1', status: 'done', input: { layers: true }, outputs: [{ label: 'Background', url: `/files/${path.basename(files[0])}` }, { label: 'Green', url: `/files/${path.basename(files[1])}` }, { label: 'Blue', url: `/files/${path.basename(files[2])}`, box: [80, 40, 160, 90] }] };
  const url = await LP.writeLayerPoster(job); assert.equal(url, '/files/order1-layers.png'); assert.equal(job.layersPoster, url); assert.equal(LP.layersPosterUrl(job), url);
  const p = rgbaOf(path.join(UNIT, 'order1-layers.png')); assert.equal(p.width, 200); assert.equal(p.height, 100);
  assert.deepEqual(at(p, 5, 5), [255, 0, 0, 255], 'only the base'); assert.deepEqual(at(p, 50, 30), [0, 255, 0, 255], 'green over red'); assert.deepEqual(at(p, 100, 60), [0, 0, 255, 255], 'blue (top) wins where all three overlap');
  assert.deepEqual(at(p, 150, 85), [0, 0, 255, 255], 'the cropped layer sits at its box'); assert.deepEqual(at(p, 170, 85), [255, 0, 0, 255], 'and nowhere else');
  ok('server poster: layers composited bottom → top (blue over green over red), a cropped layer placed at its box');
  // the shared web compositor: same order; hidden layers skipped; semi-transparent pixels blend
  const placed = [{ image: RED }, { image: GREEN }, { image: BLUE, left: 80, top: 40 }];
  const c = C.compositeLayers(placed, 200, 100); assert.deepEqual(at(c, 100, 60), [0, 0, 255, 255]); assert.deepEqual(at(c, 50, 30), [0, 255, 0, 255]); assert.deepEqual(at(c, 150, 85), [0, 0, 255, 255]);
  const h = C.compositeLayers(placed, 200, 100, new Set([2])); assert.deepEqual(at(h, 100, 60), [0, 255, 0, 255], 'top hidden → green shows'); assert.deepEqual(at(C.compositeLayers(placed, 200, 100, new Set([0, 1, 2])), 0, 0), [0, 0, 0, 0], 'all hidden → transparent');
  const half = { width: 1, height: 1, data: new Uint8ClampedArray([0, 0, 255, 128]) }; const m = C.compositeLayers([{ image: sq(1, 1, [255, 0, 0]) }, { image: half }], 1, 1); assert.ok(Math.abs(m.data[0] - 127) <= 1 && Math.abs(m.data[2] - 128) <= 1 && m.data[3] === 255, `half blue over red blends: ${Array.from(m.data)}`);
  assert.deepEqual(C.alphaBounds(GREEN), [40, 20, 120, 80]); assert.equal(C.alphaBounds(sq(4, 4, [0, 0, 0], [0, 0, 0, 0])), null); assert.deepEqual(C.boxPercent([40, 20, 120, 80], 200, 100), { left: '20%', top: '20%', width: '40%', height: '60%' });
  ok('web compositeLayers: same order, hidden layers skipped, alpha blends; alphaBounds / boxPercent');
  // PSD read-back with the same library
  const bytes = PSD.buildLayeredPsd([{ name: 'Background', image: RED }, { name: 'Green square', image: GREEN, hidden: true }, { name: 'Blue (cropped)', image: { ...sq(200, 100, [0, 0, 255], [80, 40, 160, 90]) } }], 200, 100);
  const psd = AG.readPsd(Buffer.from(bytes), { useImageData: true, skipThumbnail: true });
  assert.equal(psd.width, 200); assert.equal(psd.height, 100); assert.equal(psd.children!.length, 3);
  assert.deepEqual(psd.children!.map((l) => l.name), ['Background', 'Green square', 'Blue (cropped)'], 'bottom first, named');
  assert.deepEqual(psd.children!.map((l) => [l.left, l.top, l.right, l.bottom]), [[0, 0, 200, 100], [40, 20, 120, 80], [80, 40, 160, 90]], 'each layer at its position, cut to its pixels');
  assert.deepEqual(psd.children!.map((l) => !!l.hidden), [false, true, false], 'hidden layers stay hidden');
  assert.deepEqual(at(psd.children![2].imageData!, 0, 0), [0, 0, 255, 255]); assert.deepEqual(at(psd.imageData!, 100, 60), [0, 0, 255, 255], 'the composite preview');
  ok(`PSD (${bytes.length} bytes) read back with ag-psd: 3 named layers bottom first, positions [0,0]/[40,20]/[80,40], hidden flag kept, pixels intact`);
}
// the mock's drawn layers: the count rule, names, descriptions, boxes, and a 13-layer PSD
{
  assert.equal(ML.mockLayerCount('give me 13 layers', 1), 13); assert.equal(ML.mockLayerCount('2 layers please', 1), 2); assert.equal(ML.mockLayerCount('40 layers', 1), 13); assert.equal(ML.mockLayerCount('1 layer', 1), 2);
  for (let s = 0; s < 20; s++) { const n = ML.mockLayerCount('', s); assert.ok(n >= 6 && n <= 13); }
  const n = 13; const ls = Array.from({ length: n }, (_, k) => ML.mockLayer(k, n, 640, 480)); assert.equal(new Set(ls.map((l) => l.name)).size, n, 'unique names');
  assert.equal(ls[0].name, 'Background'); assert.deepEqual(ls[0].box, [0, 0, 640, 480]); assert.ok(ls.every((l) => l.description.length > 10 && l.box), 'every layer has a description and a box');
  assert.ok(ls.some((l) => l.name.length > 40), 'one long name on purpose'); assert.equal(new Set(ls.map((l) => String(l.box))).size, n, 'different boxes');
  assert.deepEqual(ML.mockLayerNames(2), ['Background', 'left pup']);
  const imgs = ls.map((l, k) => { const f = path.join(UNIT, `m${k}.png`); fs.writeFileSync(f, l.png); return rgbaOf(f); });
  const psd = AG.readPsd(Buffer.from(PSD.buildLayeredPsd(imgs.map((image, k) => ({ name: ls[k].name, image })), 640, 480)), { skipLayerImageData: true, skipCompositeImageData: true, skipThumbnail: true });
  assert.deepEqual(psd.children!.map((l) => l.name), ls.map((l) => l.name.slice(0, 255))); assert.deepEqual(psd.children!.map((l) => [l.left, l.top, l.right, l.bottom]), ls.map((l) => l.box));
  ok(`mock layers: 2–13 from the prompt (6–13 by seed), unique names + descriptions + boxes; a 13-layer PSD reads back with every name and box`);
}

// ---------------- e2e ----------------
const PORT = testPort(9173); const B = `http://localhost:${PORT}`; const DATA = fs.mkdtempSync(path.join(D, 'srv-'));
const PHOTO = path.join(D, 'photo.png'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=gray:s=1200x800', '-frames:v', '1', PHOTO]);
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: DATA, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'env.local'), OPENHIGGSFIELD_BACKEND: 'mock',
  OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_MOCK_DELAY_MS: '100', OPENHIGGSFIELD_COMFY_ROUTER_URL: '' }, stdio: ['ignore', 'ignore', 'pipe'], detached: true });
const get = async (u: string) => { const r = await fetch(B + u); return { status: r.status, body: await r.json() as any }; };
const submit = async (prompt: string) => { const fd = new FormData(); for (const [k, v] of Object.entries({ provider: 'api-seedream-layers-flash', imageResolution: '1K', rights: '1', prompt })) fd.append(k, v);
  fd.append('image', new Blob([fs.readFileSync(PHOTO)], { type: 'image/png' }), 'photo.png'); const r = await fetch(`${B}/api/tools/app-image-layers/jobs`, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() as any }; };
const done = async (id: string) => { let j: any = null; for (let i = 0; i < 120; i++) { j = (await get(`/api/jobs/${id}`)).body; if (['done', 'failed', 'blocked'].includes(j.status)) break; await new Promise((r) => setTimeout(r, 250)); } return j; };
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  const a = await submit('13 layers'); assert.equal(a.status, 200, JSON.stringify(a.body).slice(0, 300)); const b = await submit('2 layers'); const f = await submit('[mockfail]');
  const ja = await done(a.body.id), jb = await done(b.body.id), jf = await done(f.body.id);
  assert.equal(ja.status, 'done', ja.error); assert.equal(ja.outputs.length, 13); assert.equal(ja.outputs[0].label, 'Background'); assert.ok(ja.outputs.slice(1).every((o: any) => Array.isArray(o.box) && o.box.length === 4 && o.description), 'boxes + descriptions');
  assert.equal(ja.layersPosterUrl, `/files/${ja.id}-layers.png`); const pa = rgbaOf(path.join(DATA, `${ja.id}-layers.png`)); assert.equal(`${pa.width}x${pa.height}`, '1024x682', 'the poster is the picture\'s size');
  assert.deepEqual(at(pa, 3, 3).slice(3), [255], 'opaque composite');
  assert.equal(jb.outputs.length, 2); assert.deepEqual(jb.outputs.map((o: any) => o.label), ['Background', 'Left pup']); assert.ok(jb.layersPosterUrl);
  assert.equal(jf.status, 'failed'); assert.equal(jf.layersPosterUrl, null, 'a failed job has no poster');
  ok(`13-layer run (${ja.outputs.map((o: any) => o.label).slice(0, 4).join(', ')}…) and 2-layer run: names, descriptions, boxes, poster ${ja.layersPosterUrl}; failed run: no poster`);
  // an older job (no poster file yet): the lazy route makes it once
  fs.rmSync(path.join(DATA, `${jb.id}-layers.png`)); const old = (await get(`/api/jobs/${jb.id}`)).body; assert.equal(old.layersPosterUrl, `/api/jobs/${jb.id}/layers-poster.png`);
  const r = await fetch(B + old.layersPosterUrl, { redirect: 'manual' }); assert.equal(r.status, 302); assert.equal(r.headers.get('location'), `/files/${jb.id}-layers.png`); assert.ok(fs.existsSync(path.join(DATA, `${jb.id}-layers.png`)));
  assert.equal((await get(`/api/jobs/${jb.id}`)).body.layersPosterUrl, `/files/${jb.id}-layers.png`); assert.equal((await fetch(`${B}/api/jobs/${jf.id}/layers-poster.png`)).status, 404);
  ok('an older job without a poster: layersPosterUrl is the lazy route → 302 to the new file, then the file itself; 404 for a non-layered / failed job');
  console.log('PASS image-layers-display');
} finally { try { process.kill(-srv.pid!, 'SIGTERM'); } catch { /* gone */ } fs.rmSync(D, { recursive: true, force: true }); }
