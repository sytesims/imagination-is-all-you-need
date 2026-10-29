// Shared media hand-off (src/mediaHandoff.ts, 2026-10-26): how a local file reaches each cloud provider, against FAKE provider APIs.
// No network, fake keys, nothing spent. Per provider: the request shape of its upload, inline forms, the cache (same bytes = one upload), and the
// too-big refusal before any call (also at route level: mediaIssue, which routing/select.ts runs at quote and submit).
// Run: npx tsx test/media-handoff.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-')); const DATA = fs.mkdtempSync(path.join(D, 'data-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: DATA, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_COMFY_ROUTER_URL: 'https://comfy.test', OPENHIGGSFIELD_PUBLIC_BASE_URL: '' });
for (const k of ['COMFY_API_KEY', 'OPENHIGGSFIELD_FAL_KEY', 'FAL_KEY', 'OPENHIGGSFIELD_REPLICATE_API_TOKEN', 'REPLICATE_API_TOKEN']) delete process.env[k];
globalThis.fetch = (async (u: unknown) => { throw new Error(`network blocked in this test: ${String(u).slice(0, 80)}`); }) as typeof fetch;
const ok = (m: string) => console.log('ok ' + m);
const at = (n: string) => path.join(DATA, n);
const put = (n: string, bytes: number | Buffer) => { const p = at(n); if (typeof bytes === 'number') { fs.writeFileSync(p, Buffer.alloc(Math.min(bytes, 4096), 7)); if (bytes > 4096) fs.truncateSync(p, bytes); } else fs.writeFileSync(p, bytes); return p; };
const H = await import('../src/mediaHandoff.ts'); const ST = await import('../src/comfy/storage.ts');

type Call = { method: string; url: string; headers: Record<string, string>; body: any };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
function fakeApis() {
  const calls: Call[] = [];
  const f = (async (u: any, init: any = {}) => { const url = String(u); calls.push({ method: init.method ?? 'GET', url, headers: { ...(init.headers ?? {}) }, body: init.body });
    if (url.startsWith('https://rest.fal.ai/storage/upload/initiate')) { const b = JSON.parse(init.body); return json({ upload_url: `https://fal.put.test/${b.file_name}`, file_url: `https://v3.fal.media/files/${b.file_name}` }); }
    if (url.startsWith('https://fal.put.test/')) return new Response('', { status: 200 });
    if (url === 'https://api.replicate.com/v1/files') return json({ id: 'f1', urls: { get: 'https://api.replicate.com/v1/files/f1/download' }, expires_at: new Date(Date.now() + 24 * 3600_000).toISOString() }, 201);
    if (url === 'https://comfy.test/customers/storage') { const b = JSON.parse(init.body); return json({ upload_url: `https://storage.test/put/${b.file_name}`, download_url: `https://storage.test/get/${b.file_name}` }); }
    if (url.startsWith('https://storage.test/put/')) return new Response('', { status: 200 });
    if (url === 'https://comfy.test/proxy/seedance/virtual-library/assets') return json({ asset_id: 'asset-9' });
    if (url === 'https://comfy.test/proxy/seedance/assets/asset-9') return json({ status: 'Active' });
    return new Response('nope', { status: 404 }); }) as typeof fetch;
  H.setHandoffFetch(f); ST.setStorageFetch(f, async () => {}); return calls;
}
const reset = () => { H.clearHandoffCache(); ST.clearStorageCache(); return fakeApis(); };

const small = put('small.png', Buffer.from('tiny png bytes'));
const clip = put('clip.mp4', 2_000_000); // 2 MB: over fal's / Replicate's inline line
const huge = put('huge.mp4', 210_000_000); // sparse: 210 MB on paper, no disk used
const audio = put('voice.mp3', 300_000);

// ---- fal ----
{
  let calls = reset();
  // keyless (a sample run never sends): inline data URI, no upload
  assert.match(await H.handOff(clip, 'video', 'fal'), /^data:video\/mp4;base64,/); assert.equal(calls.length, 0);
  process.env.OPENHIGGSFIELD_FAL_KEY = 'fal-test-key';
  assert.match(await H.handOff(small, 'image', 'fal'), /^data:image\/png;base64,/, 'small files stay inline'); assert.equal(calls.length, 0);
  const u = await H.handOff(clip, 'video', 'fal');
  assert.match(u, /^https:\/\/v3\.fal\.media\/files\/[0-9a-f]{16}\.mp4$/);
  const [ini, putc] = calls; assert.equal(calls.length, 2);
  assert.equal(ini.method, 'POST'); assert.equal(ini.url, 'https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3');
  assert.equal(ini.headers.Authorization, 'Key fal-test-key'); assert.deepEqual(JSON.parse(ini.headers['X-Fal-Object-Lifecycle']), { expiration_duration_seconds: 86400 });
  assert.equal(JSON.parse(ini.body).content_type, 'video/mp4');
  assert.equal(putc.method, 'PUT'); assert.equal(putc.headers['Content-Type'], 'video/mp4'); assert.equal(putc.headers.Authorization, undefined, 'the key never goes to the signed PUT URL');
  assert.equal((putc.body as Uint8Array).length, 2_000_000);
  // cache: same bytes → same link, no new upload (also two at once)
  const [a, b] = await Promise.all([H.handOff(clip, 'video', 'fal'), H.handOff(clip, 'video', 'fal')]); assert.equal(a, u); assert.equal(b, u); assert.equal(calls.length, 2);
  // too big: refused before any call, same line from the quote-time check
  const n = calls.length; await assert.rejects(H.handOff(huge, 'video', 'fal'), /This clip is 210 MB; fal takes up to 94\.4 MB per file/); assert.equal(calls.length, n);
  assert.match(H.handOffIssue(huge, 'video', 'fal')!, /210 MB/);
  // upload refused → plain error, nothing cached
  H.setHandoffFetch((async () => new Response('no', { status: 401 })) as typeof fetch); H.clearHandoffCache();
  await assert.rejects(H.handOff(clip, 'video', 'fal'), /fal did not accept your key/);
  // the public address wins when set (no upload)
  calls = reset(); process.env.OPENHIGGSFIELD_PUBLIC_BASE_URL = 'https://me.example';
  assert.equal(await H.handOff(clip, 'video', 'fal'), 'https://me.example/files/clip.mp4'); assert.equal(calls.length, 0);
  process.env.OPENHIGGSFIELD_PUBLIC_BASE_URL = ''; delete process.env.OPENHIGGSFIELD_FAL_KEY;
  ok('fal: small inline, larger via CDN upload (initiate + PUT, lifecycle 1 day), cached by hash, 210 MB refused before any call, public address first');
}

// ---- Replicate ----
{
  const calls = reset(); process.env.REPLICATE_API_TOKEN = 'r8-test';
  assert.match(await H.handOff(small, 'image', 'replicate'), /^data:image\/png;base64,/, '≤ 256 kB inline');
  const u = await H.handOff(audio, 'audio', 'replicate'); assert.equal(u, 'https://api.replicate.com/v1/files/f1/download');
  const c = calls[0]; assert.equal(c.url, 'https://api.replicate.com/v1/files'); assert.equal(c.headers.Authorization, 'Bearer r8-test'); assert.ok(c.body instanceof FormData);
  const content = (c.body as FormData).get('content') as File; assert.equal(content.size, 300_000); assert.equal(content.type, 'audio/mpeg'); assert.equal((c.body as FormData).get('filename'), 'voice.mp3');
  // links only (reference_*_urls): even a tiny file is uploaded
  assert.match(await H.handOff(small, 'image', 'replicate', { accepts: ['url'] }), /^https:/); assert.equal(calls.length, 2);
  await H.handOff(audio, 'audio', 'replicate'); assert.equal(calls.length, 2, 'cache hit');
  delete process.env.REPLICATE_API_TOKEN; H.clearHandoffCache();
  await assert.rejects(H.handOff(small, 'image', 'replicate', { accepts: ['url'], who: 'MiniMax H3 on Replicate' }), /MiniMax H3 on Replicate takes this image as a link, uploaded with your Replicate key/);
  assert.equal(H.canLink('replicate'), false);
  ok('Replicate: ≤ 256 kB inline, else Files API (multipart content/filename/type, Bearer) → urls.get, cached; link-only fields without a token refused');
}

// ---- Comfy Router ----
{
  const calls = reset();
  assert.match(await H.handOff(small, 'image', 'comfy-router'), /^data:image\/png;base64,/);
  assert.equal(await H.handOff(small, 'image', 'comfy-router', { accepts: ['base64'] }), Buffer.from('tiny png bytes').toString('base64'));
  await assert.rejects(H.handOff(clip, 'video', 'comfy-router', { accepts: ['url'], who: 'Kling 3.0 Omni Edit on Comfy Router' }), /Kling 3\.0 Omni Edit on Comfy Router takes this clip as a link, uploaded with your Comfy key/);
  process.env.COMFY_API_KEY = 'comfy-test-key';
  const u = await H.handOff(clip, 'video', 'comfy-router', { accepts: ['url'] }); assert.match(u, /^https:\/\/storage\.test\/get\/.+\.mp4$/);
  assert.equal(calls[0].headers['X-API-KEY'], 'comfy-test-key'); assert.equal(calls[1].method, 'PUT');
  assert.equal(await H.handOff(clip, 'video', 'comfy-router', { accepts: ['url'] }), u); assert.equal(calls.length, 2, 'cache hit');
  assert.equal(await H.handOff(clip, 'video', 'comfy-router', { accepts: ['url'], seedanceAsset: true }), 'asset://asset-9');
  // a video field that takes either: a link (an inline clip came back invalid_input on Kling)
  assert.match(await H.handOff(clip, 'video', 'comfy-router'), /^https:\/\/storage\.test\//);
  // inline-only field over the Router body cap
  const big = put('big.mov', 80_000_000); await assert.rejects(H.handOff(big, 'video', 'comfy-router', { accepts: ['base64'], who: 'FLUX Video Upscale' }), /This clip is 80 MB; FLUX Video Upscale takes up to 75 MB/);
  delete process.env.COMFY_API_KEY;
  ok('Comfy Router: inline data URI / base64, link via Comfy storage (X-API-KEY, signed PUT) cached, Seedance asset://, no key → plain refusal, 80 MB inline refused');
}

// ---- BytePlus, BFL, Google, OpenAI ----
{
  const calls = reset();
  assert.match(await H.handOff(small, 'image', 'byteplus'), /^data:image\/png;base64,/);
  await assert.rejects(H.handOff(clip, 'video', 'byteplus', { who: 'BytePlus ModelArk' }), /BytePlus ModelArk takes this clip as a link, uploaded with your Comfy key/);
  process.env.COMFY_API_KEY = 'comfy-test-key'; assert.match(await H.handOff(clip, 'video', 'byteplus'), /^https:\/\/storage\.test\/get\//, 'a public Comfy storage link'); delete process.env.COMFY_API_KEY;
  const bigImg = put('big.png', 31_000_000); assert.match(H.handOffIssue(bigImg, 'image', 'byteplus')!, /31 MB; BytePlus ModelArk takes up to 30 MB/);
  assert.equal(await H.handOff(small, 'image', 'bfl'), Buffer.from('tiny png bytes').toString('base64'));
  const g = put('g.png', 21_000_000); await assert.rejects(H.handOff(g, 'image', 'google'), /21 MB; Google Gemini takes up to 20 MB/);
  const o = put('o.png', 51_000_000); await assert.rejects(H.handOffBytes(o, 'image', 'openai'), /51 MB; OpenAI takes up to 50 MB/);
  assert.deepEqual(await H.handOffBytes(small, 'image', 'openai'), Buffer.from('tiny png bytes'));
  await assert.rejects(H.handOff(at('gone.png'), 'image', 'fal'), /missing on the server/);
  assert.equal(calls.length, 2);
  ok('BytePlus (images inline ≤ 30 MB, video only as a link), BFL base64, Gemini ≤ 20 MB, OpenAI bytes ≤ 50 MB, missing file');
}

// ---- route level (quote / submit) ----
{
  reset(); process.env.OPENHIGGSFIELD_FAL_KEY = 'fal-test-key';
  assert.equal(H.providerOfRoute({ kind: 'fal' }), 'fal'); assert.equal(H.providerOfRoute({ kind: 'direct', direct: { provider: 'google' } }), 'google'); assert.equal(H.providerOfRoute({ kind: 'local' }), null);
  assert.match(H.mediaIssue({ kind: 'fal' }, { videoPath: huge })!, /This clip is 210 MB; fal takes up to/);
  assert.equal(H.mediaIssue({ kind: 'fal' }, { videoPath: clip, refPaths: [small] }), null);
  assert.equal(H.mediaIssue({ kind: 'local' }, { videoPath: huge }), null, 'local graphs read the file themselves');
  assert.equal(H.mediaIssue({ kind: 'fal' }, { videoPath: 'clip.mp4' }), null, 'relative names resolve in the data dir');
  delete process.env.OPENHIGGSFIELD_FAL_KEY;
  ok('mediaIssue: the same too-big line for a route, null for fine jobs and local graphs');
}

// ---- every runner uses it: no file is encoded inline outside the hand-off ----
{
  const SRC = path.join(path.dirname(new URL(import.meta.url).pathname), '../src');
  const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.ts$/.test(e.name) ? [path.join(d, e.name)] : []));
  const bad: string[] = [];
  for (const f of walk(SRC)) { const rel = path.relative(SRC, f); if (rel === 'mediaHandoff.ts') continue; const t = fs.readFileSync(f, 'utf8');
    if (/\.toString\(\s*['"]base64['"]\s*\)|;base64,\$\{/.test(t)) bad.push(rel); }
  assert.deepEqual(bad, [], `these modules encode files inline themselves; use handOff() from src/mediaHandoff.ts:\n${bad.join('\n')}`);
  ok('no module outside mediaHandoff.ts encodes a file inline');
}
process.exit(0);
