// Comfy Router failures explain themselves (2026-10-26, H3 Extend · via last frame failed with a bare provider_error and no reason kept).
// 1. A queued request that ends COMPLETED with an error_type: the runner reads the result URL once (GET) for the error body, keeps the status bucket,
//    and carries detail / upstream_detail / X-Comfy-Upstream-Status as RouterError.provider, sanitised.
// 2. A failed read of that body falls back to the bucket alone (never a different reason, never a throw of its own).
// 3. sanitizeProviderText strips data URIs, signed-link queries, local paths and key-like strings.
// 4. Synchronous / submit error bodies (fail()) carry the same provider info.
// In process, fake fetch, no network, no spend. Run: npx tsx test/router-provider-error.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
Object.assign(process.env, { COMFY_API_KEY: '', OPENHIGGSFIELD_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'rperr-')), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_COMFY_ROUTER_URL: 'http://router.test' });
const { ComfyRouter, RouterError, sanitizeProviderText, providerSaid, routerErrorFor } = await import('../src/comfyRouter.ts');
const ok = (m: string) => console.log('ok ' + m);
const BASE = 'http://router.test'; const RID = 'a4d5f6b6-40c6-4bdd-9468-4da1c64c965a';
const json = (status: number, b: unknown, h: Record<string, string> = {}) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json', ...h } });
function fakeRouter(collect: () => Response | Promise<Response>) {
  const seen: string[] = [];
  const f = (async (u: any, init?: any) => { const url = String(u); seen.push(`${init?.method ?? 'GET'} ${url}`);
    if (url.includes('/requests?') || url.endsWith('/requests')) return json(201, { request_id: RID, status_url: `${BASE}/v2/models/minimax/minimax-h3/requests/${RID}/status`, response_url: `${BASE}/v2/models/minimax/minimax-h3/requests/${RID}`, cancel_url: `${BASE}/v2/models/minimax/minimax-h3/requests/${RID}/cancel` });
    if (url.endsWith('/status')) return json(200, { request_id: RID, status: 'COMPLETED', error_type: 'provider_error' });
    if (url.endsWith(RID)) return collect();
    throw new Error('unexpected ' + url); }) as typeof fetch;
  return { c: new ComfyRouter('test-key', f, BASE, async () => {}), seen };
}
const run = async (c: InstanceType<typeof ComfyRouter>) => { try { await c.runQueued('minimax/minimax-h3', { content: [] }, 'idem', { timeoutMs: 5000 }); } catch (e) { return e as InstanceType<typeof RouterError>; } throw new Error('expected a failure'); };

// ---------------- 1. failed queued request: the error body is read and kept ----------------
{
  const { c, seen } = fakeRouter(() => json(502, { error_type: 'provider_error', detail: 'MiniMax returned an error: first_frame could not be decoded (see https://cdn.example/x.png?X-Amz-Signature=abc123)' }, { 'x-comfy-error-type': 'provider_error', 'x-comfy-upstream-status': '500', 'x-comfy-request-id': RID }));
  const e = await run(c);
  assert.ok(e instanceof RouterError); assert.equal(e.reasonCode, 'provider_error', 'the status bucket stays the reason'); assert.equal(e.temporary, true);
  assert.ok(seen.some((s) => s === `GET ${BASE}/v2/models/minimax/minimax-h3/requests/${RID}`), 'the result URL is read once for the error body');
  assert.equal(e.provider?.upstreamStatus, 500); assert.equal(e.provider?.errorType, 'provider_error'); assert.equal(e.provider?.requestId, RID);
  assert.match(e.provider!.detail!, /first_frame could not be decoded/); assert.ok(!e.provider!.detail!.includes('Signature'), 'signed-link query stripped');
  assert.match(e.detail ?? '', /upstream 500/); assert.match(providerSaid(e.provider)!, /could not be decoded/);
  ok('COMPLETED + provider_error → result URL read; detail, upstream status and request id kept (sanitised)');
}
{ // upstream_detail (provider 4xx refusal) is kept beside detail
  const { c } = fakeRouter(() => json(400, { error_type: 'invalid_input', detail: 'the provider rejected the request', upstream_detail: 'image aspect ratio out of range' }, { 'x-comfy-upstream-status': '400' }));
  const e = await run(c); assert.equal(e.reasonCode, 'provider_error'); assert.equal(e.provider?.upstreamDetail, 'image aspect ratio out of range');
  assert.equal(providerSaid(e.provider), 'the provider rejected the request (provider: image aspect ratio out of range)');
  ok('upstream_detail kept and shown after detail');
}
// ---------------- 2. the read fails → the bucket alone ----------------
for (const [why, collect] of [['network error', () => { throw new Error('ECONNRESET'); }], ['HTML body', () => new Response('<html>oops</html>', { status: 500 })], ['200 result', () => json(200, { task: {} })], ['202 not ready', () => json(202, { status: 'IN_PROGRESS' })]] as const) {
  const { c } = fakeRouter(collect as any); const e = await run(c);
  assert.equal(e.reasonCode, 'provider_error', why); assert.equal(e.provider, null, `${why}: nothing invented`); assert.equal(e.requestId, RID);
  ok(`read fails (${why}) → provider_error with no provider text`);
}
// ---------------- 3. sanitising ----------------
{
  const s = sanitizeProviderText('bad image data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA== at /Users/someone/app/server/data/x-lastframe.png key sk-abcdefghijklmnopqrstuv token 0123456789abcdef0123456789abcdef0123456789abcdef')!;
  assert.ok(!/iVBOR|Users|someone|sk-abc|0123456789abcdef0123/.test(s), s); assert.match(s, /data:…/); assert.match(s, /\[redacted\]/);
  assert.equal(sanitizeProviderText('x'.repeat(2000))!.length, 500); assert.equal(sanitizeProviderText(''), null); assert.equal(sanitizeProviderText(null), null);
  assert.equal(sanitizeProviderText('MiniMax: task failed, code 1027 (video generation failed).'), 'MiniMax: task failed, code 1027 (video generation failed).', 'plain provider text unchanged');
  ok('sanitise: data URIs, local paths, key-like strings removed; capped; plain text unchanged');
}
// ---------------- 4. direct error responses (submit / run / collect) ----------------
{
  const e = routerErrorFor(502, 'provider_error', JSON.stringify({ error_type: 'provider_error', detail: 'upstream returned 500' }), 'run', RID, new Headers({ 'x-comfy-upstream-status': '500' }));
  assert.equal(e.reasonCode, 'provider_error'); assert.equal(e.provider?.detail, 'upstream returned 500'); assert.equal(e.provider?.upstreamStatus, 500); assert.equal(e.provider?.httpStatus, 502);
  const v = routerErrorFor(422, 'invalid_input', JSON.stringify({ detail: [{ loc: ['body', 'duration'], msg: 'must be ≥ 4', type: 'value_error' }] }), 'submit');
  assert.equal(v.reasonCode, 'input_invalid'); assert.match(v.message, /duration: must be ≥ 4/); assert.equal(v.provider?.detail, 'duration: must be ≥ 4');
  assert.equal(routerErrorFor(500, null, '').provider, null, 'no body → no provider info');
  ok('direct error responses carry the same provider info; validation messages unchanged');
}
console.log('router-provider-error: all ok');
