// Media check timeout (2026-11-01 review F14): when ffprobe / ffmpeg runs out of time, the upload gets its own plain message (503), never
// "Unsupported or damaged media". A real damaged file still gets the damaged-media answer.
// Run: npx tsx test/upload-check-timeout.test.ts   (temp files, no network, no server port; skipped without ffmpeg)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const ok = (m: string) => console.log('ok ' + m);
try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); } catch { console.log('skip: no ffmpeg'); process.exit(0); }
const Fastify = (await import('fastify')).default; const multipart = (await import('@fastify/multipart')).default;
const { validateUpload, registerUploadSecurity, mediaCheck } = await import('../src/uploadSecurity.ts');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-check-timeout-'));
const png = path.join(dir, 'a.png'); execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=orange:s=32x32', '-frames:v', '1', '-y', png]);
const TIMEOUT = 'Checking this file took too long. Try again, or try a smaller file.';

// the validator itself
assert.equal((await validateUpload(png, 'a.png', 'image/png', 'image')).ext, '.png', 'a good file passes');
mediaCheck.timeoutMs = 1;
await assert.rejects(validateUpload(png, 'a.png', 'image/png', 'image'), (e: any) => e.code === 'upload_timeout' && e.statusCode === 503 && e.message === TIMEOUT && !/damaged/i.test(e.message));
ok('a check that runs out of time says so, not "damaged"');

// through the upload hook
const app = Fastify(); await app.register(multipart); registerUploadSecurity(app, dir);
app.post('/api/media', async () => ({ ok: true })); await app.ready();
const send = async (bytes: Buffer, name: string) => {
  const b = '----t' + Date.now(); const payload = Buffer.concat([Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: image/png\r\n\r\n`), bytes, Buffer.from(`\r\n--${b}--\r\n`)]);
  const r = await app.inject({ method: 'POST', url: '/api/media', payload, headers: { 'content-type': `multipart/form-data; boundary=${b}` } }); return { status: r.statusCode, body: JSON.parse(r.body) };
};
const slow = await send(fs.readFileSync(png), 'a.png');
assert.equal(slow.status, 503); assert.equal(slow.body.code, 'upload_timeout'); assert.equal(slow.body.error, TIMEOUT); assert.ok(!/damaged/i.test(JSON.stringify(slow.body)));
mediaCheck.timeoutMs = 30000;
assert.equal((await send(fs.readFileSync(png), 'a.png')).status, 200, 'with time to check, the same file goes through');
const broken = await send(Buffer.concat([fs.readFileSync(png).subarray(0, 40), Buffer.alloc(40)]), 'b.png');
assert.equal(broken.status, 400); assert.equal(broken.body.code, 'upload_format'); assert.match(broken.body.error, /damaged/);
ok('upload hook: 503 with the plain timeout message; a broken file is still "damaged"');
await app.close(); fs.rmSync(dir, { recursive: true, force: true });
