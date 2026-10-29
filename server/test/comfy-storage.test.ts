// Comfy storage upload (comfy/storage.ts, 2026-10-26): the official partner-node flow (comfy_api_nodes/util/upload_helpers.py + nodes_bytedance.py),
// against a FAKE Comfy API: no network, fake key, nothing spent.
//  1. upload: POST /customers/storage {file_name <uuid>.<ext>, content_type} with X-API-KEY → PUT the exact bytes to upload_url with the mime and NO key → download_url.
//  2. cache by content hash (same bytes = one upload, also two at once), retries (PUT 503 ×2 then 200; POST 500 ×4 = upload_failed), 401 / 402 / no key /
//     a non-https answer → plain RouterErrors; the key never leaves the Comfy base.
//  3. Seedance asset: virtual-library POST {url, hash = sha256 of the bytes, asset_type Video}, polled until Active → asset://<id>; Failed → refused.
//  4. URL substitution in real bodies: Seedance 2.0 reference video → asset:// (OPENHIGGSFIELD_SEEDANCE_ASSETS=0 → the storage link); bodies schema-valid.
//  5. runRouter: a Router 422 at submit → "nothing was charged" (chargeNote not_charged); invalid_input on a COMPLETED request → unconfirmed; an upload
//     failure → upload_failed with no Router call.
// Run: npx tsx test/comfy-storage.test.ts
import assert from 'node:assert/strict'; import { execFileSync } from 'node:child_process'; import { createHash } from 'node:crypto'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { createRequire } from 'node:module';
import { ROUTER_SCHEMA_DIR } from './_model-health.js';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'comfystorage-')); const DATA = fs.mkdtempSync(path.join(D, 'data-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: DATA, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_COMFY_ROUTER_URL: 'https://comfy.test', COMFY_API_KEY: 'test-not-a-real-key', OPENHIGGSFIELD_PUBLIC_BASE_URL: '', OPENHIGGSFIELD_MOCK_KEYS: '' });
const ok = (m: string) => console.log('ok ' + m);
const at = (n: string) => path.join(DATA, n);
const ff = (args: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args]);
ff(['-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=24', '-t', '3', '-pix_fmt', 'yuv420p', at('v3.mp4')]); ff(['-f', 'lavfi', '-i', 'color=c=blue:s=512x512', '-frames:v', '1', at('ref.png')]);
fs.writeFileSync(at('a.bin.mp4'), Buffer.from('not really a video')); fs.writeFileSync(at('b.mp4'), Buffer.from('another file'));
const ST = await import('../src/comfy/storage.ts'); const { RouterError } = await import('../src/comfyRouter.ts');
type Call = { method: string; url: string; headers: Record<string, string>; body: any };
const json = (o: unknown, status = 200, h: Record<string, string> = {}) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', ...h } });
/** A fake Comfy API. `plan` overrides answers per step. */
function fake(plan: { post?: (n: number) => Response | null; put?: (n: number) => Response | null; asset?: (n: number) => Response | null; status?: (n: number) => Response | null; other?: (c: Call) => Response | null } = {}) {
  const calls: Call[] = []; let posts = 0, puts = 0, assets = 0, polls = 0;
  const f = (async (u: any, init: any = {}) => { const url = String(u); const c: Call = { method: init.method ?? 'GET', url, headers: { ...(init.headers ?? {}) }, body: init.body }; calls.push(c);
    if (url === 'https://comfy.test/customers/storage' && c.method === 'POST') { const r = (posts++, plan.post?.(posts)); if (r) return r; const b = JSON.parse(init.body); return json({ upload_url: `https://storage.googleapis.test/put/${b.file_name}?X-Goog-Signature=s`, download_url: `https://storage.googleapis.test/get/${b.file_name}?X-Goog-Signature=d` }); }
    if (url.startsWith('https://storage.googleapis.test/put/') && c.method === 'PUT') { const r = (puts++, plan.put?.(puts)); if (r) return r; return new Response('', { status: 200 }); }
    if (url === 'https://comfy.test/proxy/seedance/virtual-library/assets') { const r = (assets++, plan.asset?.(assets)); if (r) return r; return json({ asset_id: `as_${assets}` }); }
    const m = url.match(/^https:\/\/comfy\.test\/proxy\/seedance\/assets\/(as_\d+)$/); if (m) { const r = (polls++, plan.status?.(polls)); if (r) return r; return json({ id: m[1], asset_type: 'Video', group_id: 'virtual-library', status: 'Active' }); }
    const o = plan.other?.(c); if (o) return o;
    return new Response('nope', { status: 404 }); }) as typeof fetch;
  return { f, calls };
}
const sleeps: number[] = []; const sleep = async (ms: number) => { sleeps.push(ms); };
const use = (x: ReturnType<typeof fake>) => { ST.setStorageFetch(x.f, sleep); ST.clearStorageCache(); sleeps.length = 0; return x; };

// ---------------- 1. the upload flow ----------------
{
  const x = use(fake()); const url = await ST.uploadToComfyStorage(at('v3.mp4'), 'video/mp4');
  assert.equal(x.calls.length, 2); const [post, put] = x.calls;
  assert.equal(post.method, 'POST'); assert.equal(post.url, 'https://comfy.test/customers/storage'); assert.equal(post.headers['X-API-KEY'], 'test-not-a-real-key');
  const pb = JSON.parse(post.body); assert.match(pb.file_name, /^[0-9a-f-]{36}\.mp4$/); assert.equal(pb.content_type, 'video/mp4'); assert.deepEqual(Object.keys(pb).sort(), ['content_type', 'file_name']);
  assert.equal(put.method, 'PUT'); assert.equal(put.headers['Content-Type'], 'video/mp4'); assert.equal(put.headers['X-API-KEY'], undefined, 'no key on the signed URL');
  assert.ok(Buffer.from(put.body as Uint8Array).equals(fs.readFileSync(at('v3.mp4'))), 'the exact bytes');
  assert.equal(url, `https://storage.googleapis.test/get/${pb.file_name}?X-Goog-Signature=d`);
  // mime from the extension; an image
  const y = use(fake()); await ST.uploadToComfyStorage(at('ref.png')); assert.equal(JSON.parse(y.calls[0].body).content_type, 'image/png'); assert.equal(y.calls[1].headers['Content-Type'], 'image/png');
  ok('upload: POST /customers/storage {file_name uuid.ext, content_type} with the key → PUT the exact bytes (mime, no key) → download_url');
}
// ---------------- 2. cache, retries, errors ----------------
{
  const x = use(fake()); const a = await ST.uploadToComfyStorage(at('v3.mp4')); const b = await ST.uploadToComfyStorage(at('v3.mp4'));
  assert.equal(a, b); assert.equal(x.calls.length, 2, 'same bytes: one upload');
  fs.copyFileSync(at('v3.mp4'), at('copy.mp4')); assert.equal(await ST.uploadToComfyStorage(at('copy.mp4')), a, 'same content under another name: cached by hash');
  await ST.uploadToComfyStorage(at('b.mp4')); assert.equal(x.calls.length, 4, 'other bytes: a new upload');
  const y = use(fake()); const [p, q] = await Promise.all([ST.uploadToComfyStorage(at('v3.mp4')), ST.uploadToComfyStorage(at('v3.mp4'))]); assert.equal(p, q); assert.equal(y.calls.length, 2, 'two at once share one upload');
  // PUT 503 twice then 200: retried with 1 s, 2 s backoff
  const z = use(fake({ put: (n) => (n <= 2 ? new Response('busy', { status: 503 }) : null) })); await ST.uploadToComfyStorage(at('v3.mp4'));
  assert.equal(z.calls.filter((c) => c.method === 'PUT').length, 3); assert.deepEqual(sleeps, [1000, 2000]);
  // POST 500 four times: 3 retries then upload_failed (temporary)
  use(fake({ post: () => new Response('down', { status: 500 }) }));
  const e1: any = await ST.uploadToComfyStorage(at('v3.mp4')).then(() => null, (e) => e); assert.ok(e1 instanceof RouterError); assert.equal(e1.reasonCode, 'upload_failed'); assert.equal(e1.temporary, true); assert.match(e1.message, /HTTP 500/);
  assert.deepEqual(sleeps, [1000, 2000, 4000]);
  // PUT 403 (a signature problem): no retry, upload_failed
  const w = use(fake({ put: () => new Response('denied', { status: 403 }) })); const e1b: any = await ST.uploadToComfyStorage(at('v3.mp4')).then(() => null, (e) => e);
  assert.equal(e1b.reasonCode, 'upload_failed'); assert.equal(w.calls.filter((c) => c.method === 'PUT').length, 1);
  // 401 / 402 → key / credits; a failed upload is not cached
  use(fake({ post: () => json({ detail: 'bad key' }, 401) })); const e2: any = await ST.uploadToComfyStorage(at('v3.mp4')).then(() => null, (e) => e); assert.equal(e2.reasonCode, 'key_invalid'); assert.match(e2.message, /key was not accepted/);
  use(fake({ post: () => json({ detail: 'no credits' }, 402) })); const e3: any = await ST.uploadToComfyStorage(at('v3.mp4')).then(() => null, (e) => e); assert.equal(e3.reasonCode, 'cloud_credits');
  // an answer without https links
  use(fake({ post: () => json({ upload_url: 'http://x.test/put', download_url: 'ftp://x' }) })); const e4: any = await ST.uploadToComfyStorage(at('v3.mp4')).then(() => null, (e) => e); assert.equal(e4.reasonCode, 'upload_failed'); assert.match(e4.message, /unexpected answer/);
  // network errors: retried, then a plain message
  ST.setStorageFetch((async () => { throw new TypeError('fetch failed'); }) as typeof fetch, sleep); ST.clearStorageCache();
  const e5: any = await ST.uploadToComfyStorage(at('v3.mp4')).then(() => null, (e) => e); assert.equal(e5.reasonCode, 'upload_failed'); assert.match(e5.message, /could not be reached/);
  // no key: refused before any call
  const v = use(fake()); process.env.COMFY_API_KEY = ''; const e6: any = await ST.uploadToComfyStorage(at('v3.mp4')).then(() => null, (e) => e); process.env.COMFY_API_KEY = 'test-not-a-real-key';
  assert.equal(e6.reasonCode, 'key_invalid'); assert.match(e6.message, /needs your Comfy key/); assert.equal(v.calls.length, 0);
  // the key goes only to the Comfy base
  const u = use(fake()); await ST.uploadToComfyStorage(at('v3.mp4')); for (const c of u.calls) if (c.headers['X-API-KEY']) assert.equal(new URL(c.url).origin, 'https://comfy.test');
  ok('cache by content hash (also concurrent), retries 503 / 500 / network (1 s, ×2, 3 retries), 401 / 402 / 403 / bad answer / no key → plain errors; the key only goes to the Comfy base');
}
// ---------------- 3. Seedance asset ----------------
{
  const x = use(fake({ status: (n) => (n < 3 ? json({ id: 'as_1', asset_type: 'Video', group_id: 'virtual-library', status: 'Processing' }) : null) }));
  const id = await ST.uploadSeedanceAsset(at('v3.mp4')); assert.equal(id, 'asset://as_1');
  const reg = x.calls.find((c) => c.url.endsWith('/virtual-library/assets'))!; const rb = JSON.parse(reg.body);
  assert.equal(reg.method, 'POST'); assert.equal(reg.headers['X-API-KEY'], 'test-not-a-real-key');
  assert.match(rb.url, /^https:\/\/storage\.googleapis\.test\/get\//); assert.equal(rb.hash, createHash('sha256').update(fs.readFileSync(at('v3.mp4'))).digest('hex')); assert.equal(rb.asset_type, 'Video');
  assert.equal(x.calls.filter((c) => /\/proxy\/seedance\/assets\//.test(c.url)).length, 3, 'polled until Active'); assert.deepEqual(sleeps, [5000, 5000]);
  assert.equal(await ST.uploadSeedanceAsset(at('v3.mp4')), id); assert.equal(x.calls.length, 6, 'cached');
  use(fake({ status: () => json({ id: 'as_1', asset_type: 'Video', group_id: 'virtual-library', status: 'Failed', error: { code: 'x', message: 'face check failed' } }) }));
  const e: any = await ST.uploadSeedanceAsset(at('v3.mp4')).then(() => null, (er) => er); assert.equal(e.reasonCode, 'upload_failed'); assert.match(e.message, /Seedance refused your clip \(face check failed\)/);
  ok('Seedance asset: virtual-library POST {url, sha256 hash, Video} → polled every 5 s until Active → asset://<id> (cached); Failed → plain refusal');
}
// ---------------- 4. URL substitution in real bodies + schemas ----------------
const M = await import('../src/routing/routerModels.ts');
{
  const SD = M.ROUTER_MODELS['router-seedance'];
  const job = { mode: 'r2v', types: ['r2v'], prompt: 'the dancer moves like Video 1', duration: 5, resolution: '720p', aspect: 'auto', refPaths: [at('ref.png')], refVideoPaths: [at('v3.mp4')], refVideoSecondsEach: [3], refVideoSeconds: 3 };
  use(fake()); assert.equal(SD.block!(job), null, 'with the key: no public address needed');
  const b: any = await SD.body(job, 0); const v = b.content.find((c: any) => c.role === 'reference_video'); assert.equal(v.video_url.url, 'asset://as_1');
  assert.match(b.content.find((c: any) => c.role === 'reference_image').image_url.url, /^data:image\/png;base64,/, 'images stay inline (the schema allows it)');
  process.env.OPENHIGGSFIELD_SEEDANCE_ASSETS = '0'; use(fake()); const b2: any = await SD.body(job, 0); delete process.env.OPENHIGGSFIELD_SEEDANCE_ASSETS;
  assert.match(b2.content.find((c: any) => c.role === 'reference_video').video_url.url, /^https:\/\/storage\.googleapis\.test\/get\/.*\.mp4\?/);
  assert.match(await M.mediaLink(at('v3.mp4'), 'X'), /^https:\/\/storage\.googleapis\.test\/get\//, 'mediaLink: the plain storage link');
  const SCHEMAS = ROUTER_SCHEMA_DIR; const req = createRequire(import.meta.url); let Ajv: any = null; try { Ajv = req('ajv/dist/2020.js').default ?? req('ajv/dist/2020.js'); } catch { /* none */ }
  const f = path.join(SCHEMAS, 'byteplus__dreamina-seedance-2-0-260128.json');
  if (Ajv && fs.existsSync(f)) { const doc = JSON.parse(fs.readFileSync(f, 'utf8')); delete doc.openapi; const ajv = new Ajv({ strict: false, validateFormats: false, allErrors: true }); ajv.addSchema({ ...doc, $id: 'sd20' });
    const p = Object.keys(doc.paths).find((x) => doc.paths[x]?.post?.requestBody)!; const validate = ajv.compile({ $ref: `sd20#/paths/${p.replace(/~/g, '~0').replace(/\//g, '~1')}/post/requestBody/content/application~1json/schema` });
    for (const body of [b, b2]) assert.ok(validate(body), JSON.stringify(validate.errors)?.slice(0, 400)); ok('bodies: Seedance 2.0 reference video → asset:// (or the storage link with OPENHIGGSFIELD_SEEDANCE_ASSETS=0); both schema-valid'); }
  else ok('bodies: Seedance 2.0 reference video → asset:// / storage link (schema check skipped: cached schema or ajv absent)');
}
// ---------------- 5. runRouter: validation (not billed) vs rejected after dispatch (unconfirmed), upload failure ----------------
{
  const RR = await import('../src/routing/routerRun.ts'); const { findRoute } = await import('../src/routing/routes.ts');
  const r = findRoute('comfy-router:router-seedance')!; const base = 'https://comfy.test/v2/models/byteplus/x';
  const job = (id: string) => ({ id, toolId: 'h3-video', status: 'running', input: { mode: 'r2v', types: ['r2v'], prompt: 'p', duration: 5, resolution: '720p', aspect: 'auto', refPaths: [at('ref.png')], refVideoPaths: [at('v3.mp4')], refVideoSecondsEach: [3], refVideoSeconds: 3 }, cost: 500, routing: { prices: { [r.routeId]: 500 } } } as any);
  const est = (c: Call) => (c.url.endsWith('/estimate') ? json({ source: 'exact', amount: '1.00' }) : null);
  // 422 at submit
  let x = fake({ other: (c) => est(c) ?? (c.url.includes('/requests?') ? json({ detail: [{ loc: ['body', 'content', 1], msg: 'unsupported url' }] }, 422, { 'x-comfy-error-type': 'invalid_input' }) : null) });
  RR.setRouterFetch(x.f, sleep); ST.clearStorageCache(); const j1 = job('j_422');
  const e1: any = await RR.runRouter(j1, r, { n: 1 } as any, 5000).then(() => null, (e) => e);
  assert.equal(j1.reasonCode, 'input_invalid'); assert.equal(j1.chargeNote, 'not_charged'); assert.match(e1.message, /unsupported url.*nothing was charged/);
  // invalid_input on a completed (dispatched) request
  x = fake({ other: (c) => est(c) ?? (c.url.includes('/requests?') ? json({ request_id: 'rq1', status_url: `${base}/requests/rq1/status`, response_url: `${base}/requests/rq1`, cancel_url: `${base}/requests/rq1/cancel` }, 201)
    : c.url.endsWith('/status') ? json({ status: 'COMPLETED', error_type: 'invalid_input' }) : null) });
  RR.setRouterFetch(x.f, sleep); ST.clearStorageCache(); const j2 = job('j_after');
  const e2: any = await RR.runRouter(j2, r, { n: 1 } as any, 5000).then(() => null, (e) => e);
  assert.equal(j2.chargeNote, 'unconfirmed'); assert.match(e2.message, /unconfirmed/); assert.deepEqual(j2.requestIds, ['rq1']);
  // upload failure: no estimate, no submit
  x = fake({ post: () => new Response('down', { status: 500 }) }); RR.setRouterFetch(x.f, sleep); ST.clearStorageCache(); const j3 = job('j_up');
  const e3: any = await RR.runRouter(j3, r, { n: 1 } as any, 5000).then(() => null, (e) => e);
  assert.equal(j3.reasonCode, 'upload_failed'); assert.match(e3.message, /Comfy storage/); assert.equal(x.calls.filter((c) => c.url.includes('/v2/models/')).length, 0, 'nothing sent to the model');
  const { REASONS, chargeOf } = await import('../../web/src/shared/failureReasons.ts');
  assert.equal(chargeOf({ route: r.routeId, chargeNote: 'not_charged' } as any, REASONS.input_invalid, { ownAccounts: true, providerRule: 'may-charge', providerName: 'Comfy' }), 'Nothing was charged.');
  assert.match(chargeOf({ route: r.routeId, chargeNote: 'unconfirmed' } as any, REASONS.input_invalid, { ownAccounts: true, providerRule: 'may-charge', providerName: 'Comfy' }), /Comfy may still bill.*unconfirmed/);
  assert.equal(chargeOf({ route: r.routeId, reasonCode: 'upload_failed' } as any, REASONS.upload_failed, { ownAccounts: true, providerRule: 'may-charge', providerName: 'Comfy' }), 'Nothing was charged.');
  RR.setRouterFetch(null);
  ok('runRouter: Router 422 at submit → "nothing was charged" (not_charged); invalid_input after dispatch → may bill, estimate unconfirmed; upload failure → upload_failed, zero model calls');
}
console.log('comfy-storage: all ok');
process.exit(0);
