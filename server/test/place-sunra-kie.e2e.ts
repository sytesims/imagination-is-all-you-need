// Sunra and kie.ai places (plugins-builtin/place-sunra.ts, place-kie.ts; providers/sunra.ts, kie.ts; routing/aggregatorRoutes.ts).
// No real API and no real key: a tiny local fake server answers with handcrafted bodies shaped like the official docs
// (https://docs.sunra.ai/multimodal/queue, /platform/file-upload, /platform/errors; https://docs.kie.ai/market/common/get-task-detail,
// /market/google/nanobanana2, /file-upload-api/upload-file-stream). Keys are fake strings that only ever reach 127.0.0.1.
// Checks: submit → poll → done (output, provider cost), a failure Sunra reports (not charged, its class), kie's 200-with-a-code bodies →
// our error classes, cancel, resume after a restart (no new submit), uploads, off by default (kie not in the desktop profile; Sunra and kie
// routes hidden without a key), each plugin reads only its own key, and quotes only once the key is set.
// Run: npx tsx test/place-sunra-kie.e2e.ts
import assert from 'node:assert/strict'; import http from 'node:http'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { testPort } from './_ports.js';
const ok = (m: string) => console.log('ok ' + m);
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'sunra-kie-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: process.env.OPENHIGGSFIELD_DATA_DIR || D, OPENHIGGSFIELD_ENV_FILE: process.env.OPENHIGGSFIELD_ENV_FILE || path.join(D, 'none.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_HOSTED_POLL_MS: '5' });
for (const k of ['OPENHIGGSFIELD_SUNRA_KEY', 'OPENHIGGSFIELD_KIE_KEY', 'OPENHIGGSFIELD_MOCK_KEYS', 'OPENHIGGSFIELD_ROUTING_LIVE']) delete process.env[k];

// ---- the fake server: records every request; each test sets the answers ----
type Req = { method: string; url: string; headers: http.IncomingHttpHeaders; body: Buffer };
const seen: Req[] = []; let answer: (r: Req) => { status?: number; json?: unknown; text?: string } = () => ({ status: 404, text: 'no' });
const PORT = testPort(9481); const BASE = `http://127.0.0.1:${PORT}`;
const srv = http.createServer((req, res) => { const chunks: Buffer[] = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => {
  const r: Req = { method: req.method!, url: req.url!, headers: req.headers, body: Buffer.concat(chunks) }; seen.push(r); const a = answer(r);
  res.writeHead(a.status ?? 200, { 'content-type': a.json !== undefined ? 'application/json' : 'text/plain' }); res.end(a.json !== undefined ? JSON.stringify(a.json) : a.text ?? ''); }); });
await new Promise<void>((ok2) => srv.listen(PORT, '127.0.0.1', ok2));
const reset = () => { seen.length = 0; };
process.env.OPENHIGGSFIELD_PLACE_SUNRA_BASE_URL = BASE; process.env.OPENHIGGSFIELD_PLACE_KIE_BASE_URL = BASE; process.env.OPENHIGGSFIELD_PLACE_KIE_UPLOAD_BASE_URL = BASE; // the plugins' settings (ctx.settings: profile → env → kv)
const jsonOf = (r: Req) => JSON.parse(r.body.toString() || '{}');

const { ANY_KEY } = await import('../src/kernel/keys.js');
const { sunraPlaceOf } = await import('../src/plugins-builtin/place-sunra.js');
const { kiePlaceOf } = await import('../src/plugins-builtin/place-kie.js');
const { PlaceError, placeErrorFields, errorClassOf } = await import('../src/services/places.js');
const { findRoute } = await import('../src/routing/routes.js');
const sunra = sunraPlaceOf(ANY_KEY, { base: () => BASE });
const kie = kiePlaceOf(ANY_KEY, { settings: () => ({ baseUrl: BASE, uploadBaseUrl: BASE }) });
const H3 = findRoute('sunra:minimax/minimax-h3')!; const NB = findRoute('sunra:google/gemini-3.1-flash-image')!; const KNB = findRoute('kie:nano-banana-2')!; const KSD = findRoute('kie:bytedance/seedance-2-5')!;
assert.ok(H3 && NB && KNB && KSD, 'the route rows exist (findRoute finds them even while hidden)');
const hooks = (o: { canceledAfter?: number } = {}) => { const ev: any = { submits: [] as any[], stages: [] as string[] }; let polls = 0;
  return { ev, h: { timeoutMs: 5000, isCanceled: () => o.canceledAfter != null && ++polls > o.canceledAfter, onSubmit: (x: any) => ev.submits.push(x), onStatus: (s: string) => ev.stages.push(s), onBusy: () => {} } }; };
const sunraStatus = (id: string, s: Record<string, unknown>) => ({ status: 'IN_PROGRESS', response_url: `${BASE}/v1/queue/requests/${id}`, status_url: `${BASE}/v1/queue/requests/${id}/status`, cancel_url: `${BASE}/v1/queue/requests/${id}/cancel`, logs: {}, metrics: {}, ...s });

try {
  // ---- Sunra: submit → poll → done ----
  { reset(); let n = 0;
    answer = (r) => {
      if (r.method === 'POST' && r.url === '/v1/queue/minimax/minimax-h3/text-to-video') return { json: { request_id: 'pd_ok1', response_url: 'https://elsewhere.example/x', status_url: 'https://elsewhere.example/s', cancel_url: 'https://elsewhere.example/c' } };
      if (r.url === '/v1/queue/requests/pd_ok1/status') { n++; return { json: n === 1 ? sunraStatus('pd_ok1', { status: 'IN_QUEUE', queue_position: 2 }) : n === 2 ? sunraStatus('pd_ok1', {})
        : sunraStatus('pd_ok1', { status: 'COMPLETED', success: true, error: null, billing: { status: 'paid', usage: '5', unit_amount: '0.08', amount: '0.4', currency: 'USD' } }) }; }
      if (r.url === '/v1/queue/requests/pd_ok1') return { json: { video: { url: 'https://assets.sunra.ai/out/pd_ok1.mp4', content_type: 'video/mp4' } } };
      return { status: 404, text: 'no' }; };
    const { ev, h } = hooks();
    const out = await sunra.run!({ route: H3, body: { __sunraEndpoint: 'text-to-video', prompt: 'a fox', duration: 5, resolution: '768P' }, key: 'fake-sunra-not-real', requestId: 'j1-a1', resume: null }, h);
    assert.equal(out.url, 'https://assets.sunra.ai/out/pd_ok1.mp4'); assert.deepEqual(out.outputs, [{ kind: 'video', url: out.url }]);
    assert.deepEqual(out.cost, { usd: 0.4, source: 'provider' }, 'billing.amount from the status: information only');
    const sub = seen[0]; assert.equal(sub.headers.authorization, 'Key fake-sunra-not-real'); assert.deepEqual(jsonOf(sub), { prompt: 'a fox', duration: 5, resolution: '768P' }, 'the endpoint marker is never sent');
    assert.ok(seen.every((r) => r.url.startsWith('/v1/')), 'status and result are read on the base URL, never on a host the answer names');
    assert.equal(ev.submits.length, 1); assert.deepEqual(ev.submits[0], { kind: 'sunra', id: 'pd_ok1', statusUrl: `${BASE}/v1/queue/requests/pd_ok1/status`, responseUrl: `${BASE}/v1/queue/requests/pd_ok1`, cancelUrl: `${BASE}/v1/queue/requests/pd_ok1/cancel` });
    assert.deepEqual(ev.stages.slice(0, 2), ['submitted', 'rendering']);
    assert.equal(await out.refresh(), out.url, 'refresh asks for the result again');
    ok('Sunra: submit → IN_QUEUE → IN_PROGRESS → COMPLETED → result; provider cost kept; key only on the base URL'); }

  // ---- Sunra: a failure it reports (not charged) and request errors ----
  { reset();
    answer = (r) => r.method === 'POST' ? { json: { request_id: 'pd_bad' } } : r.url.endsWith('/status') ? { json: sunraStatus('pd_bad', { status: 'COMPLETED', success: false, error: { code: 'unsafe_content', reason: 'moderation_blocked', retryable: false, message: 'suppressed' } }) } : { status: 404, text: '' };
    const e = await sunra.run!({ route: H3, body: { __sunraEndpoint: 'text-to-video', prompt: 'x' }, key: 'k-fake', requestId: 'j2', resume: null }, hooks().h).catch((x) => x);
    assert.ok(e instanceof PlaceError); assert.equal(e.cls, 'moderation'); assert.equal(e.temporary, false);
    const job: any = { ...placeErrorFields(e) }; assert.equal(errorClassOf(job), 'moderation', 'the job fields read back as the same class');
    assert.equal(sunra.failedNotCharged!(job, H3, errorClassOf(job)), true, 'Sunra: failed predictions are not charged');
    assert.equal(sunra.failedNotCharged!(job, H3, 'unknown'), false, 'a timeout / lost contact is not a reported failure');
    for (const [status, code, cls] of [[412, 'INSUFFICIENT_CREDIT', 'out_of_credit'], [402, 'PREDICTION_CREDITS_ERROR', 'out_of_credit'], [413, 'payload_too_large', 'bad_input'], [503, 'x', 'provider_down'], [401, 'INVALID_CREDENTIALS', 'unknown']] as const) {
      answer = () => ({ status, json: { error: { type: 'x', code, message: 'm' } } });
      const x = await sunra.run!({ route: H3, body: { __sunraEndpoint: 'text-to-video', prompt: 'x' }, key: 'k-fake', requestId: 'j3', resume: null }, hooks().h).catch((y) => y);
      assert.ok(x instanceof PlaceError, `${status} → PlaceError`); assert.equal(x.cls, cls, `${status} ${code} → ${cls}`); }
    assert.equal(placeErrorFields(new PlaceError('x', 'out_of_credit'))!.errorType, 'credits');
    ok('Sunra: a reported failure → its class (moderation, not charged); 412 / 402 credit, 413 input, 5xx down, 401 key'); }

  // ---- Sunra: cancel and resume ----
  { reset();
    answer = (r) => r.method === 'POST' ? { json: { request_id: 'pd_c' } } : r.method === 'PUT' ? { json: {} } : { json: sunraStatus('pd_c', { status: 'IN_QUEUE', queue_position: 0 }) };
    const e = await sunra.run!({ route: H3, body: { __sunraEndpoint: 'text-to-video', prompt: 'x' }, key: 'k-fake', requestId: 'j4', resume: null }, hooks({ canceledAfter: 1 }).h).catch((x) => x);
    assert.equal(e.message, 'canceled'); assert.ok(seen.some((r) => r.method === 'PUT' && r.url === '/v1/queue/requests/pd_c/cancel'), 'Sunra was asked to cancel');
    process.env.OPENHIGGSFIELD_SUNRA_KEY = 'fake-sunra-not-real';
    assert.equal(await sunra.cancel!({ kind: 'sunra', id: 'pd_c', routeId: H3.routeId, attempt: 1, output: 0, outputs: 1, at: 0 } as any, { routeId: H3.routeId, envKey: H3.envKey, envAliases: [] }, fetch), true, 'cancel from Cancel / an orphan');
    answer = () => ({ status: 409, json: { error: { code: 'QUEUE_ITEM_CANNOT_BE_CANCELED' } } });
    assert.equal(await sunra.cancel!({ kind: 'sunra', id: 'pd_c' } as any, { routeId: H3.routeId, envKey: H3.envKey, envAliases: [] }, fetch), false, 'already running: not confirmed');
    delete process.env.OPENHIGGSFIELD_SUNRA_KEY;
    reset(); answer = (r) => r.url.endsWith('/status') ? { json: sunraStatus('pd_old', { status: 'COMPLETED', success: true, error: null }) } : r.url === '/v1/queue/requests/pd_old' ? { json: { images: [{ url: 'https://assets.sunra.ai/i.png' }] } } : { status: 500, text: 'no submit expected' };
    const handle = { kind: 'sunra' as const, id: 'pd_old', routeId: NB.routeId, attempt: 1, output: 0, outputs: 1, at: 0, statusUrl: 'x', responseUrl: 'y', cancelUrl: 'z', resuming: true };
    assert.equal(sunra.resume!(handle), true);
    const out = await sunra.run!({ route: NB, body: {}, key: 'k-fake', requestId: 'j5', resume: handle }, hooks().h);
    assert.equal(out.url, 'https://assets.sunra.ai/i.png'); assert.ok(!seen.some((r) => r.method === 'POST'), 'a resumed request is only polled, never sent again');
    ok('Sunra: Cancel asks Sunra (PUT …/cancel; 409 = not confirmed); a restart polls the stored request without a new submit'); }

  // ---- Sunra: pre-signed upload ----
  { reset(); const f = path.join(D, 'frame.png'); fs.writeFileSync(f, Buffer.from([137, 80, 78, 71, 1, 2, 3]));
    answer = (r) => r.url === '/v1/storage/upload/initiate' ? { status: 201, json: { upload_url: `${BASE}/presigned/abc.png?X-Amz-Signature=s`, file_url: 'https://assets.sunra.ai/uploads/abc.png' } } : r.url.startsWith('/presigned/') ? { text: '' } : { status: 404, text: '' };
    await assert.rejects(sunra.upload!(f, 'image'), /add your Sunra key/, 'no key: nothing is sent');
    process.env.OPENHIGGSFIELD_SUNRA_KEY = 'fake-sunra-not-real';
    assert.equal(await sunra.upload!(f, 'image'), 'https://assets.sunra.ai/uploads/abc.png');
    const [ini, put] = seen; assert.deepEqual(jsonOf(ini), { file_name: 'upload.png', content_type: 'image/png' }); assert.equal(ini.headers.authorization, 'Key fake-sunra-not-real');
    assert.equal(put.method, 'PUT'); assert.equal(put.headers['content-type'], 'image/png', 'the PUT repeats the signed content type'); assert.equal(put.headers.authorization, undefined, 'no key on the pre-signed PUT');
    assert.equal(put.body.length, 7); delete process.env.OPENHIGGSFIELD_SUNRA_KEY;
    ok('Sunra: upload = initiate (with the key) → PUT bytes to the pre-signed URL (no key) → file_url'); }

  // ---- kie.ai: createTask → recordInfo → success ----
  { reset(); let n = 0;
    answer = (r) => {
      if (r.method === 'POST' && r.url === '/api/v1/jobs/createTask') return { json: { code: 200, msg: 'success', data: { taskId: 'task_1' } } };
      if (r.url === '/api/v1/jobs/recordInfo?taskId=task_1') { n++; return { json: { code: 200, msg: 'success', data: n === 1 ? { taskId: 'task_1', state: 'queuing' } : n === 2 ? { taskId: 'task_1', state: 'generating' }
        : { taskId: 'task_1', model: 'nano-banana-2', state: 'success', resultJson: '{"resultUrls":["https://tempfile.example/out.png"]}', failCode: '', failMsg: '', costTime: 9, creditsConsumed: 8 } } }; }
      return { status: 404, text: '' }; };
    const { ev, h } = hooks();
    const out = await kie.run!({ route: KNB, body: { prompt: 'a cat', resolution: '1K', aspect_ratio: 'auto', output_format: 'png' }, key: 'fake-kie-not-real', requestId: 'k1', resume: null }, h);
    assert.equal(out.url, 'https://tempfile.example/out.png'); assert.deepEqual(out.cost, { usd: 0.04, source: 'provider' }, '8 credits = $0.04');
    assert.deepEqual(jsonOf(seen[0]), { model: 'nano-banana-2', input: { prompt: 'a cat', resolution: '1K', aspect_ratio: 'auto', output_format: 'png' } }); assert.equal(seen[0].headers.authorization, 'Bearer fake-kie-not-real');
    assert.equal(ev.submits[0].kind, 'kie'); assert.equal(ev.submits[0].id, 'task_1'); assert.ok(ev.stages.includes('rendering'));
    ok('kie.ai: createTask {model, input} → recordInfo queuing / generating / success → resultJson.resultUrls; creditsConsumed as cost'); }

  // ---- kie.ai: errors as HTTP 200 with a code ----
  { const cases: [unknown, string][] = [[{ code: 402, msg: 'Insufficient credits' }, 'out_of_credit'], [{ code: 422, msg: 'bad aspect' }, 'bad_input'], [{ code: 455, msg: 'maintenance' }, 'provider_down'], [{ code: 505, msg: 'disabled' }, 'provider_down'], [{ code: 401, msg: 'bad key' }, 'unknown']];
    for (const [body, cls] of cases) { answer = () => ({ status: 200, json: body });
      const e = await kie.run!({ route: KNB, body: { prompt: 'x' }, key: 'k-fake', requestId: 'k2', resume: null }, hooks().h).catch((x) => x);
      assert.ok(e instanceof PlaceError, `${JSON.stringify(body)} → PlaceError`); assert.equal(e.cls, cls, `code ${(body as any).code} → ${cls}`); }
    for (const [data, cls] of [[{ state: 'fail', failCode: '400', failMsg: 'Your content is flagged as sensitive' }, 'moderation'], [{ state: 'fail', failCode: '422', failMsg: 'image too small' }, 'bad_input'], [{ state: 'fail', failCode: '500', failMsg: 'internal' }, 'provider_down']] as const) {
      answer = (r) => r.method === 'POST' ? { json: { code: 200, data: { taskId: 't' } } } : { json: { code: 200, msg: 'success', data: { taskId: 't', creditsConsumed: 0, ...data } } };
      const e = await kie.run!({ route: KNB, body: { prompt: 'x' }, key: 'k-fake', requestId: 'k3', resume: null }, hooks().h).catch((x) => x);
      assert.ok(e instanceof PlaceError); assert.equal(e.cls, cls, `${data.failMsg} → ${cls}`);
      const job: any = { ...placeErrorFields(e) }; assert.equal(errorClassOf(job), cls); assert.equal(kie.failedNotCharged!(job, KNB, errorClassOf(job)), true, 'failed tasks consume no credits'); }
    let n = 0; answer = (r) => r.method === 'POST' ? { json: { code: 200, data: { taskId: 't9' } } } : (++n === 1 ? { json: { code: 500, msg: 'server error' } } : { json: { code: 200, data: { state: 'success', resultJson: '{"resultUrls":["https://x.example/a.mp4"]}' } } });
    const out = await kie.run!({ route: KSD, body: { prompt: 'x' }, key: 'k-fake', requestId: 'k4', resume: null }, hooks().h);
    assert.equal(out.url, 'https://x.example/a.mp4', 'a 500 body while polling is a blip: polling goes on');
    ok('kie.ai: 200-with-a-code bodies → out_of_credit / bad_input / provider_down / unknown; failed tasks → moderation / bad_input / provider_down, not charged'); }

  // ---- kie.ai: no cancel call, resume, multipart upload ----
  { assert.equal(kie.cancel, undefined, 'kie.ai has no cancel call (Cancel stops our polling only)');
    reset(); answer = (r) => r.method === 'POST' ? { status: 500, text: 'no submit expected' } : { json: { code: 200, data: { taskId: 'old', state: 'success', resultJson: '{"resultUrls":["https://x.example/r.png"]}' } } };
    const out = await kie.run!({ route: KNB, body: {}, key: 'k-fake', requestId: 'k5', resume: { kind: 'kie', id: 'old' } as any }, hooks().h);
    assert.equal(out.url, 'https://x.example/r.png'); assert.ok(!seen.some((r) => r.method === 'POST')); assert.equal(seen[0].url, '/api/v1/jobs/recordInfo?taskId=old');
    reset(); const f = path.join(D, 'ref.jpg'); fs.writeFileSync(f, Buffer.from([255, 216, 255, 0]));
    answer = (r) => r.url === '/api/file-stream-upload' ? { json: { success: true, code: 200, msg: 'File uploaded successfully', data: { fileName: 'a.jpg', filePath: 'iiayn/a.jpg', downloadUrl: 'https://tempfile.example/iiayn/a.jpg', fileSize: 4, mimeType: 'image/jpeg' } } } : { status: 404, text: '' };
    process.env.OPENHIGGSFIELD_KIE_KEY = 'fake-kie-not-real';
    assert.equal(await kie.upload!(f, 'image'), 'https://tempfile.example/iiayn/a.jpg');
    assert.match(String(seen[0].headers['content-type']), /^multipart\/form-data; boundary=/); assert.equal(seen[0].headers.authorization, 'Bearer fake-kie-not-real');
    assert.ok(seen[0].body.includes(Buffer.from('name="uploadPath"')) && seen[0].body.includes(Buffer.from('name="file"')));
    delete process.env.OPENHIGGSFIELD_KIE_KEY;
    ok('kie.ai: no cancel call; a restart polls the stored task id; multipart upload → downloadUrl'); }

  // ---- request bodies (routing/routeRequest.ts → aggregatorRoutes.ts): the documented fields, files through the place's own upload ----
  { const { routeRequest } = await import('../src/routing/routeRequest.js'); await import('../src/services/placesBuiltin.js'); // the built-in places (Sunra), as scripts get them
    const { places } = await import('../src/services/places.js'); const offKie = places.register(kiePlaceOf(ANY_KEY)); // kie.ai only for this block (it isn't built in)
    const img = path.join(D, 'first.png'); fs.writeFileSync(img, Buffer.from([137, 80, 78, 71]));
    answer = (r) => r.url === '/v1/storage/upload/initiate' ? { status: 201, json: { upload_url: `${BASE}/presigned/f.png`, file_url: 'https://assets.sunra.ai/uploads/f.png' } } : r.url === '/api/file-stream-upload' ? { json: { code: 200, data: { downloadUrl: 'https://tempfile.example/f.png' } } } : { text: '' };
    process.env.OPENHIGGSFIELD_SUNRA_KEY = 'fake-sunra-not-real'; process.env.OPENHIGGSFIELD_KIE_KEY = 'fake-kie-not-real';
    const job = (provider: string, input: Record<string, unknown>) => ({ id: 'jb', toolId: 'h3-video', provider, input: { prompt: 'a red kite', ...input } });
    const h3 = (await routeRequest(job('comfy-h3', { mode: 'i2v', imagePath: img, duration: 6, resolution: '480p' }), H3)).body;
    assert.deepEqual(h3, { __sunraEndpoint: 'image-to-video', prompt: 'a red kite', start_image: 'https://assets.sunra.ai/uploads/f.png', duration: 6, resolution: '480P' });
    const sd = (await routeRequest(job('router-seedance-25', { mode: 't2v', duration: 40, resolution: '1080p', aspect: '9:16', audio: false }), findRoute('sunra:bytedance/seedance-2.5')!)).body;
    assert.deepEqual(sd, { __sunraEndpoint: 'text-to-video', prompt: 'a red kite', resolution: '1080p', duration: 30, generate_audio: false, ratio: '9:16' }, 'length clamped to the model’s 4–30 s');
    const gpt = (await routeRequest({ ...job('api-gpt-image-25-flare', { types: ['generate'], aspect: '3:2', imageResolution: '1K', tier: 'high' }), toolId: 'create-image' }, findRoute('sunra:openai/gpt-image-2.5-flare')!)).body;
    assert.equal(gpt.__sunraEndpoint, 'text-to-image'); assert.equal(gpt.quality, 'high'); assert.ok(gpt.width > gpt.height && gpt.n === 1);
    const nb = (await routeRequest({ ...job('api-nano-banana', { types: ['edit'], refPaths: [img], imageResolution: '2K' }), toolId: 'create-image' }, NB)).body;
    assert.equal(nb.__sunraEndpoint, 'image-editing'); assert.deepEqual(nb.images, ['https://assets.sunra.ai/uploads/f.png']); assert.equal(nb.resolution, '2K');
    const ks = (await routeRequest(job('router-seedance-25', { mode: 'flf', imagePath: img, lastFramePath: img, duration: 5, resolution: '720p' }), KSD)).body;
    assert.equal(ks.first_frame_url, 'https://tempfile.example/f.png'); assert.equal(ks.last_frame_url, 'https://tempfile.example/f.png'); assert.equal(ks.aspect_ratio, 'adaptive');
    assert.equal(findRoute('sunra:bytedance/seedance-2.5')!.unavailableFor!({ mode: 'r2v', refVideoPaths: ['a.mp4'] }) != null, true, 'reference clips are refused up front (never a silent drop)');
    delete process.env.OPENHIGGSFIELD_SUNRA_KEY; delete process.env.OPENHIGGSFIELD_KIE_KEY; offKie();
    ok('request bodies: H3 / Seedance / GPT Image / Nano Banana on Sunra and Seedance on kie.ai carry the documented fields; files go through each place’s upload'); }

  // ---- off by default, hidden without a key, quotes only with the key ----
  { const { readProfile } = await import('../src/kernel/profile.js'); const { places } = await import('../src/services/places.js'); const { routesFor } = await import('../src/routing/routes.js');
    const { option } = await import('../src/routing/select.js'); const { getTool } = await import('../src/tools/registry.js');
    const plugins = readProfile('desktop').plugins; assert.ok(plugins.includes('place-sunra'), 'Sunra is built in'); assert.ok(!plugins.includes('place-kie'), 'kie.ai is not in the desktop profile');
    const kinds = (m: string, t?: string) => routesFor(m, t ?? null).map((r) => r.kind);
    assert.equal(places.off('kie'), true, 'kie is off without its plugin, even without booting'); assert.equal(places.off('sunra'), false);
    for (const m of ['api-nano-banana', 'api-gpt-image-25-flare']) assert.ok(!kinds(m).includes('sunra') && !kinds(m).includes('kie'), `${m}: no Sunra / kie route without a key`);
    assert.ok(!kinds('router-seedance-25', 'h3-video').includes('sunra') && !kinds('comfy-h3', 'h3-video').includes('sunra'));
    const tool = getTool('create-image')!; const o0 = option(tool, NB, { types: ['generate'] }); assert.equal(o0.configured, false); assert.equal(o0.available, false, 'no quote for Sunra without its key');
    process.env.OPENHIGGSFIELD_SUNRA_KEY = 'fake-sunra-not-real'; process.env.OPENHIGGSFIELD_KIE_KEY = 'fake-kie-not-real';
    for (const m of ['api-nano-banana', 'api-gpt-image-25-flare']) assert.ok(kinds(m).includes('sunra'), `${m}: Sunra listed once its key is set`);
    assert.ok(kinds('router-seedance-25', 'h3-video').includes('sunra') && kinds('router-seedance-20-fast', 'h3-video').includes('sunra') && kinds('comfy-h3', 'h3-video').includes('sunra'));
    assert.ok(!kinds('api-nano-banana').includes('kie'), 'kie.ai stays off with a key: its plugin is not in the profile');
    const o1 = option(tool, NB, { types: ['generate'], imageResolution: '1K' }); assert.equal(o1.configured, true); assert.equal(o1.available, true); assert.equal(o1.credits, 7, 'Nano Banana 2 1K on Sunra: $0.067 → 7 credits');
    assert.equal(option(tool, NB, { types: ['generate'], imageResolution: '4K' }).credits, 15);
    // boot: the desktop places + place-kie (the user added it); each plugin reads only its own key
    const { boot } = await import('../src/boot.js');
    await boot({ name: 't', plugins: [...plugins.filter((x) => x !== 'legacy'), 'place-kie', 'legacy'], file: 't.yml' }, { legacy: false });
    assert.ok(kinds('api-nano-banana').includes('kie') && kinds('router-seedance-25', 'h3-video').includes('kie'), 'with place-kie in the profile and its key: kie.ai routes listed');
    assert.equal(routesFor('api-nano-banana').find((r) => r.kind === 'kie')!.label, 'Nano Banana 2 via kie.ai · reseller, may change without notice');
    const { KeyNotDeclared, declaredKeys } = await import('../src/kernel/keys.js');
    assert.deepEqual(declaredKeys('place-sunra'), ['OPENHIGGSFIELD_SUNRA_KEY']); assert.deepEqual(declaredKeys('place-kie'), ['OPENHIGGSFIELD_KIE_KEY']);
    const S = places.get('sunra')!, K = places.get('kie')!;
    assert.equal(S.key(H3), 'fake-sunra-not-real'); assert.equal(K.key(KNB), 'fake-kie-not-real');
    assert.throws(() => S.key({ envKey: 'OPENHIGGSFIELD_KIE_KEY', envAliases: [] }), KeyNotDeclared, 'place-sunra can’t read the kie key');
    assert.throws(() => K.key({ envKey: 'OPENHIGGSFIELD_SUNRA_KEY', envAliases: [] }), KeyNotDeclared, 'place-kie can’t read the Sunra key');
    assert.throws(() => S.key({ envKey: 'OPENHIGGSFIELD_FAL_KEY', envAliases: [] }), KeyNotDeclared, 'nor any other key');
    delete process.env.OPENHIGGSFIELD_SUNRA_KEY; delete process.env.OPENHIGGSFIELD_KIE_KEY;
    assert.ok(!kinds('api-nano-banana').includes('sunra') && !kinds('api-nano-banana').includes('kie'), 'key removed: hidden again');
    ok('off by default: kie.ai not in the desktop profile; Sunra and kie routes hidden and unquoted without a key; each plugin reads only its own key'); }
} finally { srv.close(); }
process.exit(0);
