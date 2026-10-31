// E2E (own mock server :8897, temp data dir): performance filters keep full responses by default.
// ?toolId= / ?fields= on /api/tools and /api/models, brotli/gzip compression, grid thumbnails. Run: npx tsx test/payload-perf.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import http from 'node:http';
const ROOT = path.resolve(import.meta.dirname, '..'); const PORT = testPort(8897); const B = `http://localhost:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-'));
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: DATA, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '1' }, stdio: 'ignore', detached: true });
/** Raw GET (no automatic decompression): status, headers, body bytes. */
const raw = (p: string, headers: Record<string, string> = {}) => new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }>((res, rej) => {
  http.get(B + p, { headers }, (r) => { const c: Buffer[] = []; r.on('data', (d) => c.push(d)); r.on('end', () => res({ status: r.statusCode!, headers: r.headers, body: Buffer.concat(c) })); }).on('error', rej); });
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 1000)); }
  // tools: full by default, filtered on request
  const full = await raw('/api/tools'); assert.equal(full.status, 200); assert.equal(full.headers['content-encoding'], undefined, 'no encoding without accept-encoding');
  const tools = JSON.parse(full.body.toString()) as any[]; assert.ok(tools.length > 20 && tools.every((t) => Array.isArray(t.providers)), 'full tools carry providers');
  const one = await (await fetch(`${B}/api/tools?toolId=h3-video`)).json() as any[]; assert.equal(one.length, 1); const ref = tools.find((t) => t.id === 'h3-video'); // live fields (hardware fit, quotes) may move between calls: compare the shape
  assert.deepEqual(Object.keys(one[0]).sort(), Object.keys(ref).sort()); assert.deepEqual(one[0].providers.map((p: any) => p.id), ref.providers.map((p: any) => p.id));
  const two = await (await fetch(`${B}/api/tools?toolId=h3-video,audio`)).json() as any[]; assert.deepEqual(two.map((t) => t.id).sort(), ['audio', 'h3-video']);
  const slim = await (await fetch(`${B}/api/tools?fields=name,route`)).json() as any[]; assert.equal(slim.length, tools.length); assert.deepEqual(Object.keys(slim[0]).sort(), ['id', 'name', 'route']);
  // models: fields projection keeps ids and group keys
  const mf = await (await fetch(`${B}/api/models`)).json() as any; const ms = await (await fetch(`${B}/api/models?fields=hint,badges`)).json() as any;
  assert.equal(ms.groups.length, mf.groups.length); assert.deepEqual(ms.groups[0].models.map((m: any) => m.id), mf.groups[0].models.map((m: any) => m.id));
  assert.deepEqual(Object.keys(ms.groups[0].models[0]).sort(), ['badges', 'hint', 'id']); assert.ok(ms.groups[0].toolId && ms.groups[0].toolName);
  // compression: br preferred, gzip fallback, same JSON
  const br = await raw('/api/tools', { 'accept-encoding': 'gzip, br' }); assert.equal(br.headers['content-encoding'], 'br'); assert.match(String(br.headers.vary), /accept-encoding/i);
  assert.ok(br.body.length < full.body.length / 5, `br ${br.body.length} vs ${full.body.length}`);
  const zlib = await import('node:zlib'); assert.equal(JSON.parse(zlib.brotliDecompressSync(br.body).toString()).length, tools.length);
  const gz = await raw('/api/tools', { 'accept-encoding': 'gzip' }); assert.equal(gz.headers['content-encoding'], 'gzip'); assert.equal(JSON.parse(zlib.gunzipSync(gz.body).toString()).length, tools.length);
  const small = await raw('/api/health', { 'accept-encoding': 'br' }); assert.equal(small.status, 200);
  // shared /api/tools copy (toolsCache.ts): ETag + 304 while unchanged; a routing change shows on the very next read
  const tag = String(full.headers.etag); assert.match(tag, /^"t-/); assert.equal(full.headers['cache-control'], 'no-cache');
  assert.equal((await raw('/api/tools', { 'if-none-match': tag })).status, 304, 'unchanged: 304');
  const put = (on: boolean) => fetch(`${B}/api/me/routing`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ global: { mode: 'auto', allowFallback: false, useLocal: on } }) });
  const ui = await (await fetch(`${B}/api/tools`)).text(); assert.equal((await put(true)).status, 200);
  const after = await raw('/api/tools'); assert.notEqual(after.body.toString(), ui, 'a routing change rebuilds the list at once'); assert.notEqual(after.headers.etag, tag);
  assert.equal((await raw('/api/tools', { 'if-none-match': tag })).status, 200, 'the old ETag no longer matches'); await put(false);
  const pr = await (await fetch(`${B}/api/presets?toolId=camera`)).json() as any; assert.ok(pr.items.length > 0, 'presets read the shared copy');
  // grid thumbnails: a scaled JPEG of a PNG, the original when it is already small, a redirect for unknown files
  const png = path.join(DATA, 'pp-test.png'); const big = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'nullsrc=size=1600x900,geq=random(1)*255:128:128', '-frames:v', '1', png]); await new Promise((r) => big.on('close', r));
  const t = await raw(`/api/media/thumb?url=${encodeURIComponent('/files/pp-test.png')}&w=600`); assert.equal(t.status, 200); assert.equal(t.headers['content-type'], 'image/jpeg');
  assert.ok(t.body.length < fs.statSync(png).size, 'thumb is smaller');
  const sm = path.join(DATA, 'pp-small.png'); const mk = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=800x450', '-frames:v', '1', sm]); await new Promise((r) => mk.on('close', r));
  const same = await raw(`/api/media/thumb?url=${encodeURIComponent('/files/pp-small.png')}&w=960`); assert.equal(same.status, 200); assert.equal(same.body.length, fs.statSync(sm).size, 'already small: the original');
  const miss = await raw(`/api/media/thumb?url=${encodeURIComponent('/files/none.png')}&w=600`); assert.equal(miss.status, 302); assert.equal(miss.headers.location, '/files/none.png');
  const bad = await raw(`/api/media/thumb?url=${encodeURIComponent('https://example.com/x.png')}&w=600`); assert.equal(bad.status, 404);
  console.log('ALL OK payload-perf');
} finally { try { process.kill(-srv.pid!); } catch { /* */ } }
