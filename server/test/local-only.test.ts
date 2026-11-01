// Security (2026-11-01): Host / Origin checks, CORS, /files/ media only, ComfyUI address and where keys go.
// fastify.inject, no ports. Run: npx tsx test/local-only.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'local-only-')); process.env.OPENHIGGSFIELD_DATA_DIR = D;
delete process.env.OPENHIGGSFIELD_ALLOWED_HOSTS; delete process.env.OPENHIGGSFIELD_ALLOWED_ORIGINS; delete process.env.OPENHIGGSFIELD_PUBLIC_URL; delete process.env.OPENHIGGSFIELD_PUBLIC_BASE_URL;
const Fastify = (await import('fastify')).default; const cors = (await import('@fastify/cors')).default; const fstatic = (await import('@fastify/static')).default;
const L = await import('../src/security/localOnly.js'); const K = await import('../src/security/keyHosts.js');
const { registerCleanFiles } = await import('../src/cleanMedia.js');
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a5f0a9f20000000049454e44ae426082', 'hex');
fs.writeFileSync(path.join(D, 'abc-out0.png'), PNG); fs.writeFileSync(path.join(D, 'openhiggsfield.db'), 'SQLITE'); fs.writeFileSync(path.join(D, 'openhiggsfield.db-wal'), 'WAL');
fs.writeFileSync(path.join(D, '.env.local'), 'COMFY_API_KEY=x'); fs.writeFileSync(path.join(D, 'up-1.json'), '{}'); fs.writeFileSync(path.join(D, 'server.log'), 'log');
fs.mkdirSync(path.join(D, 'thumbs')); fs.writeFileSync(path.join(D, 'thumbs', 'g1.png'), PNG); fs.writeFileSync(path.join(D, 'thumbs', 'g1.orig'), '');
fs.mkdirSync(path.join(D, 'brand-fonts', 'k1'), { recursive: true }); fs.writeFileSync(path.join(D, 'brand-fonts', 'k1', 'a.woff2'), 'font'); fs.writeFileSync(path.join(D, 'brand-k1-logo.svg'), '<svg/>');
fs.mkdirSync(path.join(D, '.peek')); fs.writeFileSync(path.join(D, '.peek', 'p.png'), PNG); fs.writeFileSync(path.join(D, 'outside.png'), PNG);

const app = Fastify(); L.registerLocalOnly(app); await app.register(cors, { origin: L.corsOrigin, exposedHeaders: ['Idempotent-Replayed'] });
registerCleanFiles(app); await app.register(fstatic, { root: D, prefix: '/files/' });
app.get('/api/health', async () => ({ ok: true })); app.post('/api/tools/x/jobs', async () => ({ id: 'j1' }));
const go = (url: string, headers: Record<string, string> = {}, method: 'GET' | 'POST' | 'OPTIONS' | 'HEAD' = 'GET') => app.inject({ method, url, headers: { host: '127.0.0.1:8787', ...headers }, ...(method === 'POST' ? { payload: {} } : {}) });
try {
  // evil Origin → 403 everywhere, any method
  for (const [u, m] of [['/api/health', 'GET'], ['/api/tools/x/jobs', 'POST'], ['/files/abc-out0.png', 'GET'], ['/api/tools/x/jobs', 'OPTIONS']] as const) {
    const r = await go(u, { origin: 'https://evil.example', 'access-control-request-method': 'POST' }, m);
    assert.equal(r.statusCode, 403, `${m} ${u} evil origin`); assert.equal(r.headers['access-control-allow-origin'], undefined); assert.equal(r.json().code, 'origin_not_allowed');
  }
  assert.equal((await go('/api/health', { origin: 'null' })).statusCode, 403, 'opaque origin (sandboxed iframe)');
  assert.equal((await go('/api/health', { origin: 'http://0.0.0.0:5174' })).statusCode, 403, '0.0.0.0 origin');
  // cross-site fetch without Origin (no-cors <img>) → 403; a clicked link (navigate) still opens
  assert.equal((await go('/files/abc-out0.png', { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'no-cors' })).statusCode, 403);
  assert.equal((await go('/api/health', { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate' })).statusCode, 200);
  assert.equal((await go('/api/tools/x/jobs', { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate' }, 'POST')).statusCode, 403, 'cross-site POST navigation');
  // DNS rebinding Host → 403
  for (const h of ['evil.example', 'evil.example:8787', 'localhost.evil.example', '127.0.0.1.nip.io:8787']) { const r = await go('/api/health', { host: h }); assert.equal(r.statusCode, 403, h); assert.equal(r.json().code, 'host_not_allowed'); }
  // loopback origins on any port → 200 with CORS reflecting them
  for (const o of ['http://localhost:5174', 'http://127.0.0.1:5202', 'http://[::1]:3000', 'https://app.localhost', 'http://localhost']) {
    const r = await go('/api/health', { origin: o }); assert.equal(r.statusCode, 200, o); assert.equal(r.headers['access-control-allow-origin'], o, `cors ${o}`); assert.match(String(r.headers['access-control-expose-headers']), /Idempotent-Replayed/);
    const p = await go('/api/tools/x/jobs', { origin: o, 'access-control-request-method': 'POST' }, 'OPTIONS'); assert.equal(p.statusCode, 204, `preflight ${o}`); assert.equal(p.headers['access-control-allow-origin'], o);
  }
  // loopback Hosts (Vite proxy forwards the browser's localhost:5174), IP literals, no Origin (curl, MCP) → 200
  for (const h of ['localhost:5174', '127.0.0.1:8787', '[::1]:8787', 'imagination.localhost:5174', '192.168.1.20:5174', '[fd7a:115c::1]:5174']) assert.equal((await go('/api/health', { host: h })).statusCode, 200, h);
  // the page's own origin (LAN by IP): same-origin passes; a different LAN origin does not
  assert.equal((await go('/api/tools/x/jobs', { host: '192.168.1.20:5174', origin: 'http://192.168.1.20:5174' }, 'POST')).statusCode, 200);
  assert.equal((await go('/api/tools/x/jobs', { host: '192.168.1.20:5174', origin: 'http://192.168.1.99:5174' }, 'POST')).statusCode, 403);
  // env allowlist
  assert.equal((await go('/api/health', { host: 'mymac.local:5174' })).statusCode, 403);
  process.env.OPENHIGGSFIELD_ALLOWED_HOSTS = 'mymac.local, studio.example.com:8443';
  assert.equal((await go('/api/health', { host: 'mymac.local:5174' })).statusCode, 200, 'allowed host, any port');
  assert.equal((await go('/api/tools/x/jobs', { host: 'mymac.local:5174', origin: 'http://mymac.local:5174' }, 'POST')).statusCode, 200, 'page from an allowed host');
  assert.equal((await go('/api/health', { host: 'studio.example.com:8443' })).statusCode, 200); assert.equal((await go('/api/health', { host: 'studio.example.com' })).statusCode, 403, 'port pinned');
  delete process.env.OPENHIGGSFIELD_ALLOWED_HOSTS;
  process.env.OPENHIGGSFIELD_ALLOWED_ORIGINS = 'https://tools.example.com/';
  const ok = await go('/api/health', { origin: 'https://tools.example.com' }); assert.equal(ok.statusCode, 200); assert.equal(ok.headers['access-control-allow-origin'], 'https://tools.example.com');
  assert.equal((await go('/api/health', { origin: 'http://tools.example.com' })).statusCode, 403, 'scheme matters');
  delete process.env.OPENHIGGSFIELD_ALLOWED_ORIGINS;
  process.env.OPENHIGGSFIELD_PUBLIC_URL = 'https://share.example.com'; assert.equal((await go('/files/abc-out0.png', { host: 'share.example.com' })).statusCode, 200, 'public share host'); delete process.env.OPENHIGGSFIELD_PUBLIC_URL;

  // /files: media only
  const img = await go('/files/abc-out0.png'); assert.equal(img.statusCode, 200); assert.ok(img.rawPayload.equals(PNG));
  for (const u of ['/files/thumbs/g1.png', '/files/brand-fonts/k1/a.woff2', '/files/brand-k1-logo.svg']) assert.equal((await go(u)).statusCode, 200, u);
  for (const u of ['/files/openhiggsfield.db', '/files/openhiggsfield.db-wal', '/files/.env.local', '/files/%2eenv.local', '/files/up-1.json', '/files/server.log', '/files/thumbs/g1.orig', '/files/.peek/p.png',
    '/files/%2e%2e/outside.png', '/files/thumbs/%2e%2e/openhiggsfield.db', '/files/thumbs%2f..%2fopenhiggsfield.db', '/files/%E0.png', '/files/openhiggsfield.db?clean=1', '/files/.env.local?clean=1', '/files/x.svg', '/files/a.woff2', '/files/']) {
    const r = await go(u); assert.ok(r.statusCode === 404 || (u === '/files/%E0.png' && r.statusCode === 400), `${u} → ${r.statusCode}`); assert.ok(!r.body.includes('SQLITE') && !r.body.includes('COMFY_API_KEY'), `no secret in ${u}`);
  }
  const clean = await go('/files/abc-out0.png?clean=1'); assert.equal(clean.statusCode, 200, '?clean=1 still works'); assert.equal(clean.headers['x-clean'], '1');

  // ComfyUI address from the browser
  for (const u of ['http://127.0.0.1:8188', 'http://localhost:8000', 'http://192.168.1.20:8188', 'http://10.0.0.5:8188', 'http://172.20.1.1:8188', 'http://100.101.102.103:8188', 'http://[fd7a:115c:a1e0::1]:8188', 'http://gpu-box.local:8188', 'http://gpubox:8188', 'https://cloud.comfy.org'])
    assert.ok(K.comfyAddressAllowed(u), u);
  for (const u of ['https://evil.example', 'http://8.8.8.8:8188', 'http://172.32.0.1:8188', 'http://100.128.0.1:8188', 'http://box.ts.net:8188', 'https://comfy.org.evil.example', 'http://[2001:db8::1]:8188']) assert.ok(!K.comfyAddressAllowed(u), u);
  process.env.OPENHIGGSFIELD_ALLOWED_HOSTS = 'gpu.example.com'; assert.ok(K.comfyAddressAllowed('https://gpu.example.com:8443')); delete process.env.OPENHIGGSFIELD_ALLOWED_HOSTS;

  // the Comfy key goes only to Comfy's own hosts
  assert.deepEqual(K.comfyAuthFor('https://cloud.comfy.org', 'k'), { Authorization: 'Bearer k' });
  assert.deepEqual(K.comfyAuthFor('https://abc.run.comfy.app', 'k'), { Authorization: 'Bearer k' });
  for (const b of ['http://127.0.0.1:8188', 'http://192.168.1.20:8188', 'https://evil.example', 'http://cloud.comfy.org', 'https://cloud.comfy.org.evil.example', 'https://evilcomfy.org', '']) assert.deepEqual(K.comfyAuthFor(b, 'k'), {}, b);
  assert.deepEqual(K.comfyAuthFor('https://cloud.comfy.org', ''), {});
  assert.equal(K.replicateAuthFor('https://replicate.delivery/x/out.png', 'r'), 'Bearer r'); assert.equal(K.replicateAuthFor('https://api.replicate.com/v1/files/x', 'r'), 'Bearer r');
  assert.equal(K.replicateAuthFor('https://cdn.evil.example/out.png', 'r'), undefined); assert.equal(K.replicateAuthFor('http://replicate.delivery/x.png', 'r'), undefined);
  console.log('ok local-only');
} finally { await app.close(); fs.rmSync(D, { recursive: true, force: true }); }
