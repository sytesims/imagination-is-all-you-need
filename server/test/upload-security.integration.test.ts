/** Keyless, isolated API integration. Run sequentially; --baseline demonstrates the original renamed-HTML flaw. */
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { testPort } from './_ports.js';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { registerUploadSecurity } from '../src/uploadSecurity.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dir = mkdtempSync(path.join(os.tmpdir(), 'upload-security-test-')); const data = path.join(dir, 'data'); mkdirSync(data);
const port = testPort(8875); const B = `http://127.0.0.1:${port}`; const baseline = process.argv.includes('--baseline');
const baseIndex = path.join(root, 'server/src/.upload-baseline.ts');
const networkGuard = path.join(dir, 'network.cjs');
writeFileSync(networkGuard, `const net=require('node:net'); const connect=net.Socket.prototype.connect; net.Socket.prototype.connect=function(...args){const a=Array.isArray(args[0])?args[0]:args;const o=typeof a[0]==='object'?a[0]:{host:typeof a[1]==='string'?a[1]:'localhost'};if(o.host&&!['localhost','127.0.0.1','::1'].includes(o.host))throw Error('Test blocks external network');return connect.apply(this,args)};`);
if (baseline) writeFileSync(baseIndex, execFileSync('git', ['show', '22defad9:server/src/index.ts'], { cwd: root }));
let log = '';
const child = spawn(process.execPath, ['--import', 'tsx', baseline ? baseIndex : 'server/src/index.ts'], { cwd: root,
  env: { PATH: process.env.PATH, HOME: dir, NODE_ENV: process.argv.includes('--development') ? 'development' : 'production', NODE_OPTIONS: `--require=${networkGuard}`, PORT: String(port), ...(baseline ? { HOST: '127.0.0.1' } : {}), OPENHIGGSFIELD_DATA_DIR: data, OPENHIGGSFIELD_ENV_FILE: '/dev/null', OPENHIGGSFIELD_FILMING_FILE: '/dev/null', OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '0', OPENHIGGSFIELD_USE_LOCAL: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.on('data', d => { log += d; }); child.stderr.on('data', d => { log += d; });
const ff = (args: string[], out: string) => { const file = path.join(dir, out); execFileSync('ffmpeg', ['-v', 'error', ...args, '-y', file]); return readFileSync(file); };
type Upload = [string, Buffer, string, string];
async function post(route: string, uploads: Upload[], fields: Record<string, string> = {}) {
  const fd = new FormData(); for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  for (const [field, bytes, name, mime] of uploads) fd.append(field, new Blob([new Uint8Array(bytes)], { type: mime }), name);
  const res = await fetch(B + route, { method: 'POST', body: fd }); return { status: res.status, body: await res.json() as any };
}
const disk = () => readdirSync(data).filter(f => !/sqlite|\.db|\.json|^\./.test(f)).sort();
try {
  for (let i = 0; i < 150; i++) { try { const h = await (await fetch(B + '/api/health')).json() as any; assert.equal(h.backend, 'mock'); break; } catch { if (i === 149) throw Error(log); await new Promise(r => setTimeout(r, 200)); } }
  const connections = await (await fetch(B + '/api/settings/providers')).json() as any; assert.equal(connections.providers.filter((p: any) => p.configured).length, 0);
  const html = Buffer.from('<!doctype html><script>document.body.textContent="active"</script>');
  const repro = await post('/api/media', [['file', html, 'attack.mp4', 'video/mp4']]);
  if (baseline) { assert.equal(repro.status, 200, JSON.stringify(repro)); const url = repro.body.items[0].url; assert.equal((await fetch(B + url)).status, 200); console.log('BEFORE: renamed HTML attack.mp4 POST /api/media=200; GET stored resource=200'); }
  else {
    assert.equal(repro.status, 400, JSON.stringify(repro)); assert.ok(!disk().some(f => f.startsWith('upl-')));
    const png = ff(['-f', 'lavfi', '-i', 'color=c=blue:s=256x256', '-frames:v', '1'], 'good.png');
    const jpg = ff(['-f', 'lavfi', '-i', 'color=c=blue:s=256x256', '-frames:v', '1'], 'good.jpg');
    const mp4 = ff(['-f', 'lavfi', '-i', 'color=c=blue:s=128x128:r=10:d=0.3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p'], 'good.mp4');
    const wav = ff(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=3.1'], 'good.wav');
    const webp = Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64');
    for (const [bytes, name, mime] of [[png, '2026-10-29 at 6.18.57 AM.png', 'image/png'], [png, 'photo.v2.png', 'image/png'], [png, 'photo.html.png', 'image/png'], [mp4, 'product.final.mp4', 'video/mp4']] as const) {
      const r = await post('/api/media', [['file', bytes, name, mime]]); assert.equal(r.status, 200, `multi-dot ${name}: ${JSON.stringify(r)}`);
      const served = await fetch(B + r.body.items[0].url); assert.equal(served.status, 200); assert.equal(served.headers.get('content-type'), mime);
      assert.equal(served.headers.get('x-content-type-options'), 'nosniff'); assert.match(served.headers.get('content-security-policy')!, /sandbox/); assert.deepEqual(Buffer.from(await served.arrayBuffer()), bytes);
      // Real job intake, deliberately invalid provider: reaches normal validation without running anything.
      const job = await post(mime === 'image/png' ? '/api/tools/create-image/jobs' : '/api/tools/finish/jobs', [[mime === 'image/png' ? 'image' : 'video', bytes, name, mime]], { provider: 'not-configured', types: 'edit', rights: '1' }); assert.equal(job.status, 400); assert.notEqual(job.body.code, 'upload_format', JSON.stringify(job));
      console.log(`multi-dot: ${name} generic upload=200, GET=200 ${mime} nosniff+sandbox`);
    }
    for (const [name, mime, bytes] of [['attack.html.mp4', 'video/mp4', html], ['attack.html.png', 'image/png', html], ['photo.png.html', 'text/html', png], ['photo.png.svg', 'image/svg+xml', png], ['photo.png.js', 'text/javascript', png]] as const) {
      const before = disk(); assert.equal((await post('/api/media', [['file', bytes, name, mime]])).status, 400);
      const job = await post('/api/tools/create-image/jobs', [['image', bytes, name, mime]], { provider: 'not-configured', types: 'edit', rights: '1' }); assert.equal(job.status, 400); assert.equal(job.body.code, 'upload_format'); assert.deepEqual(disk(), before);
    }
    console.log('multi-dot job intake: valid PNG/MP4 passed media gate before deliberate normal-validation 400; renamed active bytes/final active extensions=400 upload_format; no jobs run');
    // Every public intake rejects active/corrupt bytes before entering its handler, including missing-job routes.
    for (const [route, field] of [['/api/media', 'file'], ['/api/precheck', 'image'], ['/api/elements', 'image'], ['/api/elements/nope/images', 'image'], ['/api/me/avatar', 'file'], ['/api/jobs/nope/3d-poster', 'image'], ['/api/3d/rig', 'poster'], ['/api/jobs/nope/captions/burn', 'cue0'], ['/api/jobs/nope/stamp', 'overlay'], ['/api/brand-kits/nope/logo', 'file']] as const) {
      const before = disk(); const r = await post(route, [[field, html, 'evil.png', 'image/png']]); assert.equal(r.status, 400, `${route}: ${JSON.stringify(r)}`); assert.deepEqual(disk(), before);
    }
    for (const [bytes, name, mime, field] of [[html, 'evil.html', 'text/html', 'file'], [html, 'evil.svg', 'image/svg+xml', 'file'], [html, 'evil.html.png', 'image/png', 'file'], [png, 'evil.mp4', 'video/mp4', 'file'], [png, 'evil.png', 'text/html', 'file'], [png.subarray(0, 40), 'bad.png', 'image/png', 'file'], [Buffer.alloc(0), 'empty.png', 'image/png', 'file'], [png, 'good.png', 'image/png', 'unknown']] as Array<[Buffer, string, string, string]>) {
      const before = disk(); const r = await post('/api/media', [[field, bytes, name, mime]]); assert.equal(r.status, 400, `${name}: ${JSON.stringify(r)}`); assert.deepEqual(disk(), before);
    }
    for (const content of ['<?xml version="1.0"?><xml/>', 'alert(document.domain)', 'plain text', 'PK\u0003\u0004archive', 'MZ executable']) { const before = disk(); assert.equal((await post('/api/media', [['file', Buffer.from(content), 'renamed.png', 'image/png']])).status, 400); assert.deepEqual(disk(), before); }
    assert.equal((await post('/api/precheck', [['video', png, 'good.png', 'image/png']])).status, 400);
    assert.equal((await post('/api/precheck', [['endcard', png, 'good.png', 'image/png']])).status, 400, 'known image slot is still unknown to precheck');
    assert.equal((await post('/api/media', [['file', mp4.subarray(0, mp4.length - 8), 'cut.mp4', 'video/mp4']])).status, 400);
    const before = disk(); assert.equal((await post('/api/media', [['file', png, 'good.png', 'image/png'], ['file', html, 'bad.mp4', 'video/mp4']])).status, 400); assert.deepEqual(disk(), before, 'bad second file must not save first');
    for (const [bytes, name, mime] of [[png, 'good.png', 'image/png'], [jpg, 'good.jpg', 'image/jpeg'], [mp4, 'good.mp4', 'video/mp4'], [wav, 'good.wav', 'audio/wav']] as const) {
      const r = await post('/api/media', [['file', bytes, name, mime]]); assert.equal(r.status, 200, JSON.stringify(r)); const url = r.body.items[0].url;
      const served = await fetch(B + url); assert.equal(served.status, 200); assert.equal(served.headers.get('x-content-type-options'), 'nosniff'); assert.match(served.headers.get('content-security-policy')!, /sandbox/);
      if (name.endsWith('.mp4')) { const ranged = await fetch(B + url, { headers: { Range: 'bytes=0-15' } }); assert.equal(ranged.status, 206); assert.equal((await ranged.arrayBuffer()).byteLength, 16); }
    }
    // Avatar has no photo-resolution/blackness rule; genuine tiny WebP and black masks remain format-valid.
    assert.equal((await post('/api/me/avatar', [['file', webp, 'good.webp', 'image/webp']])).status, 200);
    const black = ff(['-f', 'lavfi', '-i', 'color=c=black:s=256x256', '-frames:v', '1'], 'black.png');
    const { validateUpload } = await import('../src/uploadSecurity.js'); await validateUpload(path.join(dir, 'black.png'), 'black.png', 'image/png', 'mask');
    await validateUpload(path.join(dir, 'good.png'), 'frame.png', 'image/png', 'firstFrame');
    for (const ext of ['mp3', 'm4a', 'aac', 'ogg', 'flac']) {
      const audio = ff(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=3.1'], `good.${ext}`);
      const r = await post('/api/media', [['file', audio, `good.${ext}`, 'application/octet-stream']]); assert.equal(r.status, 200, `${ext}: ${JSON.stringify(r)}`);
    }
    for (const ext of ['mov', 'webm', 'm4v']) {
      const video = ff(['-f', 'lavfi', '-i', 'color=c=blue:s=128x128:r=10:d=0.3', '-c:v', ext === 'webm' ? 'libvpx-vp9' : 'libx264', ...(ext === 'm4v' ? ['-f', 'mp4'] : [])], `good.${ext}`);
      const r = await post('/api/media', [['file', video, `good.${ext}`, 'application/octet-stream']]); assert.equal(r.status, 200, `${ext}: ${JSON.stringify(r)}`);
    }
    // Browser recordings: MediaRecorder WebM has no header duration (measured by decoding), Safari MP4 is fragmented; a cut WebM still fails.
    const live = ff(['-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=30', '-t', '1', '-c:v', 'libvpx-vp9', '-live', '1', '-f', 'webm'], 'live.webm');
    assert.equal(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(dir, 'live.webm')], { encoding: 'utf8' }).trim(), 'N/A', 'fixture must lack a header duration');
    const frag = ff(['-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=30', '-t', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', 'frag_keyframe+empty_moov'], 'frag.mp4');
    for (const [bytes, name, mime] of [[live, 'turntable.webm', 'video/webm;codecs=vp9'], [live, 'turntable.webm', 'video/webm'], [frag, 'turntable.mp4', 'video/mp4']] as const) {
      const r = await post('/api/tools/three-d-turntable/jobs', [['video', bytes, name, mime]], { types: '["turntable"]', seconds: '1' }); assert.equal(r.status, 200, `${name} ${mime}: ${JSON.stringify(r)}`);
      let job: any; for (let i = 0; i < 100 && !['done', 'failed'].includes(job?.status); i++) { await new Promise(r => setTimeout(r, 100)); job = await (await fetch(`${B}/api/jobs/${r.body.id}`)).json(); }
      assert.equal(job.status, 'done', `${name} saved as MP4: ${JSON.stringify(job)}`); assert.match(job.resultUrl, /-out0\.mp4$/);
    }
    for (const cut of [live.subarray(0, 3000), live.subarray(0, 600)]) { const before = disk(); const r = await post('/api/tools/three-d-turntable/jobs', [['video', cut, 'turntable.webm', 'video/webm']], { types: '["turntable"]' }); assert.equal(r.status, 400); assert.equal(r.body.code, 'upload_format'); assert.deepEqual(disk(), before); }
    console.log('upload-security: duration-less WebM + fragmented MP4 turntables accepted; truncated WebM rejected');
    writeFileSync(path.join(dir, 'recording.mjpeg'), Buffer.concat([jpg, jpg])); await validateUpload(path.join(dir, 'recording.mjpeg'), 'clay.mjpeg', 'video/x-motion-jpeg', 'streams');
    const maskSubmit = await post('/api/tools/create-image/jobs', [['refs', png, 'good.png', 'image/png'], ['mask', black, 'mask.png', 'image/png']], { provider: 'not-configured', types: 'inpaint', rights: '1' });
    assert.equal(maskSubmit.status, 400); assert.notEqual(maskSubmit.body.code, 'upload_format'); assert.notEqual(maskSubmit.body.code, 'dark');
    console.log('upload-security: format matrix, masks and frame validation passed');
    // A lower-limit instance exercises the exact same gate's truncation and malformed multipart cleanup cheaply.
    const quarantine = path.join(dir, 'quarantine'); mkdirSync(quarantine);
    const limited = Fastify(); await limited.register(multipart, { limits: { fileSize: 64, files: 2 } }); registerUploadSecurity(limited, quarantine); let handlerEntered = false;
    limited.post('/api/media', async () => { handlerEntered = true; return {}; });
    const boundary = 'security-test'; const payload = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="good.png"\r\nContent-Type: image/png\r\n\r\n`), png, Buffer.from(`\r\n--${boundary}--\r\n`)]);
    const truncated = await limited.inject({ method: 'POST', url: '/api/media', headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, payload }); assert.equal(truncated.statusCode, 400); assert.equal(handlerEntered, false);
    assert.deepEqual(readdirSync(quarantine), [], 'oversized file leaves no quarantined bytes');
    console.log('upload-security: file-size truncation rejected before handler');
    const malformed = await limited.inject({ method: 'POST', url: '/api/media', headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: payload.subarray(0, 170) }); assert.equal(malformed.statusCode, 400); assert.equal(handlerEntered, false); assert.deepEqual(readdirSync(quarantine), [], 'malformed part leaves no quarantined bytes'); await limited.close();
    const p = await post('/api/precheck', [['image', png, 'good.png', 'image/png']]); assert.equal(p.status, 200, JSON.stringify(p)); assert.ok(!disk().some(f => /^pre-/.test(f)));
    // An intentionally minimal GLB follows the dedicated exception, not generic uploads.
    const json = Buffer.from(JSON.stringify({ asset: { version: '2.0' }, meshes: [{ primitives: [] }] }).padEnd(128, ' ')); const glb = Buffer.alloc(20 + json.length); glb.write('glTF'); glb.writeUInt32LE(2, 4); glb.writeUInt32LE(glb.length, 8); glb.writeUInt32LE(json.length, 12); glb.writeUInt32LE(0x4e4f534a, 16); json.copy(glb, 20);
    const model = await post('/api/3d/upload', [['model', glb, 'model.glb', 'model/gltf-binary']]); assert.equal(model.status, 200, JSON.stringify(model)); assert.equal((await post('/api/media', [['file', glb, 'model.glb', 'model/gltf-binary']])).status, 400);
    writeFileSync(path.join(data, 'legacy.html'), html); writeFileSync(path.join(data, 'legacy.svg'), '<svg onload="alert(1)"/>');
    for (const name of ['legacy.html', 'legacy.svg', 'legacy.html?clean=1', 'legacy.svg?clean=1']) { const r = await fetch(`${B}/files/${name}`); assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'application/octet-stream'); assert.match(r.headers.get('content-disposition')!, /attachment/); assert.match(r.headers.get('content-security-policy')!, /sandbox/); }
    const addr = execFileSync('lsof', ['-nP', '-a', '-p', String(child.pid), '-iTCP', '-sTCP:LISTEN'], { encoding: 'utf8' });
    assert.match(addr, new RegExp(`127\\.0\\.0\\.1:${port}.*LISTEN`));
    console.log('AFTER: renamed HTML=400; all intake/atomicity/valid media/range/GLB/legacy defenses passed'); console.log(addr); console.log(log.match(/Server listening[^\n]*/g)?.join('\n') ?? 'listener logged by Fastify');
  }
} finally {
  child.kill('SIGTERM'); await new Promise<void>(resolve => { child.once('exit', () => resolve()); setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 5000).unref(); });
  if (baseline) rmSync(baseIndex, { force: true }); rmSync(dir, { recursive: true, force: true });
}
