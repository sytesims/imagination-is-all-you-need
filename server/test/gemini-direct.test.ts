// Google Gemini API direct provider (Nano Banana 2.1 / 2 / Pro + new 2 Lite), in-process with a fake fetch (no network, no keys, no spend).
// 1. Interactions bodies per model (text only, with references, image_size and aspect mapping); 2. response parsing (image + usage cost),
// refusals → content_blocked, error mapping; 3. prices vs ai.google.dev/gemini-api/docs/pricing (read 2026-10-23); 4. directRun with hooks.f.
// Run: npx tsx test/gemini-direct.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_GEMINI_BASE_URL: '' });
const G = await import('../src/providers/gemini.js');
const { directRun, DIRECT_PROVIDERS, directBase } = await import('../src/providers/direct.js');
const { HOSTED_BY_ID, usdToCredits } = await import('../src/shared/hostedPrices.js');
const { priceOf } = await import('../src/shared/pricing.js');
const { ALL_ASPECTS } = await import('../src/shared/imageCaps.js');
const ok = (m: string) => console.log('ok ' + m);
type M = import('../src/providers/gemini.js').GeminiImageModel;
const MODELS = Object.keys(G.GEMINI_MODELS) as M[];
const png = path.join(D, 'a.png'); fs.writeFileSync(png, Buffer.from('PNGDATA')); const jpg = path.join(D, 'b.jpg'); fs.writeFileSync(jpg, Buffer.from('JPGDATA'));
const B64 = (s: string) => Buffer.from(s).toString('base64');

// ---------------------------------------------------------------- 1. bodies
const CREATE = ['model', 'input', 'generation_config', 'response_format', 'system_instruction', 'tools', 'previous_interaction_id', 'service_tier', 'safety_settings', 'stream', 'store', 'background']; // OpenAPI CreateModelInteractionParams
const RF = ['type', 'mime_type', 'delivery', 'aspect_ratio', 'image_size']; // ImageResponseFormat
const RF_ASPECTS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9', '1:8', '8:1', '1:4', '4:1'];
for (const model of MODELS) {
  const t: any = await G.geminiImageBody(model, { types: ['generate'], prompt: 'a banana', aspect: '16:9', imageResolution: '1K', imagePath: png /* ignored on generate */ });
  for (const k of Object.keys(t)) assert.ok(CREATE.includes(k), `${model}: ${k} not in the schema`); for (const k of Object.keys(t.response_format)) assert.ok(RF.includes(k), `${model}: response_format.${k}`);
  assert.deepEqual(t, { model, input: [{ type: 'text', text: 'a banana' }], response_format: { type: 'image', aspect_ratio: '16:9', image_size: '1K' }, store: false });
  // every aspect we offer maps to one the model lists (and to itself: all of ours are on every model's list)
  for (const a of ALL_ASPECTS) { const b: any = await G.geminiImageBody(model, { prompt: 'x', aspect: a }); assert.equal(b.response_format.aspect_ratio, a, `${model} ${a}`); assert.ok(RF_ASPECTS.includes(b.response_format.aspect_ratio)); }
  assert.ok(!('aspect_ratio' in ((await G.geminiImageBody(model, { prompt: 'x', aspect: 'auto' })) as any).response_format), 'Auto: left to the model');
  // sizes: 1K / 2K / 4K where the model has them, uppercase K; Lite is 1K only
  for (const r of ['1K', '2K', '4K']) assert.equal(((await G.geminiImageBody(model, { prompt: 'x', imageResolution: r })) as any).response_format.image_size, G.GEMINI_MODELS[model].res.includes(r as any) ? r : '1K');
  // edit with refs: text first, then inline images (mime from the file), capped at 14; seed in generation_config
  const e: any = await G.geminiImageBody(model, { types: ['edit'], prompt: 'swap', refPaths: [png, jpg, ...Array(20).fill(png)], seed: 7, imageResolution: '2K' });
  assert.equal(e.input.length, 1 + 14); assert.deepEqual(e.input[1], { type: 'image', mime_type: 'image/png', data: B64('PNGDATA') }); assert.equal(e.input[2].mime_type, 'image/jpeg');
  assert.deepEqual(e.generation_config, { seed: 7 });
  assert.equal(((await G.geminiImageBody(model, { types: '["edit"]', prompt: 'x', imagePath: jpg })) as any).input.length, 2, 'edit with the photo only');
}
assert.equal(G.geminiAspect('gemini-3-pro-image', '1:4'), '9:16', 'Pro has no 1:4: nearest'); assert.equal(G.geminiAspect('gemini-nano-banana-2.1', '1:4'), '1:4'); assert.equal(G.geminiAspect('gemini-3.1-flash-lite-image', '8:1'), '21:9');
ok(`bodies: Interactions schema fields only, text + inline images (≤14), image_size 1K/2K/4K (Lite 1K), all ${ALL_ASPECTS.length} of our aspects on all ${MODELS.length} models, Auto left out, seed, store false`);

// ---------------------------------------------------------------- 2. parsing, cost, errors
const answer = (over: Record<string, any> = {}) => ({ id: 'v1_abc', status: 'completed',
  steps: [{ type: 'thought', summary: [{ type: 'image', data: 'THOUGHT', mime_type: 'image/jpeg' }] }, { type: 'model_output', content: [{ type: 'text', text: 'Here it is' }, { type: 'image', data: 'IMG1', mime_type: 'image/jpeg' }] }],
  usage: { total_input_tokens: 1000, total_output_tokens: 1130, output_tokens_by_modality: [{ modality: 'image', tokens: 1120 }, { modality: 'text', tokens: 10 }], total_thought_tokens: 200, total_tokens: 2330 }, ...over });
{ const p = G.parseGeminiInteraction(answer()); assert.deepEqual(p.outputs, [{ b64: 'IMG1', mime: 'image/jpeg' }], 'model output image, not the thought image'); assert.equal(p.id, 'v1_abc');
  const c = G.geminiCost('gemini-3.1-flash-image', answer())!; // 1120 × $60 + (10 + 200) × $3 + 1000 × $0.50, per 1M
  assert.equal(c.usd, Math.round((1120 * 60 + 210 * 3 + 1000 * 0.5) / 1e6 * 1e6) / 1e6); assert.equal(c.units, 1120); assert.equal(c.settled, true); assert.equal(c.source, 'gemini:usage');
  assert.equal(G.geminiCost('gemini-3-pro-image', { usage: { total_input_tokens: 0, total_output_tokens: 2000, output_tokens_by_modality: [{ modality: 'image', tokens: 2000 }] } })!.usd, 0.24, 'Pro 4K: 2,000 tokens × $120 / 1M');
  assert.equal(G.geminiCost('gemini-nano-banana-2.1', { usage: {} }), null);
  ok('parse: last model_output image (thought images skipped), id; cost = image tokens × image rate + text/thinking + input tokens (settled, gemini:usage)'); }
{ const blocked = (j: any) => { try { G.geminiSpec('gemini-3.1-flash-image').sync!(j); return 'none'; } catch (e: any) { return e.reasonCode; } };
  assert.equal(blocked(answer({ steps: [{ type: 'model_output', content: [{ type: 'text', text: 'I can\'t make that' }] }] })), 'content_blocked', 'no image → content_blocked');
  assert.equal(blocked(answer({ status: 'incomplete', steps: [] })), 'content_blocked');
  for (const code of ['image_safety', 'image_prohibited_content', 'safety', 'prohibited_content', 'no_image']) assert.equal(G.geminiBodyError({ status: 'failed', errors: [{ code, message: 'x' }] })!.reasonCode, 'content_blocked', code);
  assert.equal(G.geminiBodyError({ status: 'failed', errors: [{ code: 'api_error' }] })!.reasonCode, 'provider_error'); assert.equal(G.geminiBodyError(answer()), null);
  const h = (s: number, j: any) => G.geminiHttpError(s, j, JSON.stringify(j)).reasonCode;
  assert.equal(h(400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } }), 'key_invalid');
  assert.equal(h(401, { error: { code: 'authentication', message: 'bad key' } }), 'key_invalid'); assert.equal(h(403, { error: { code: 403, status: 'PERMISSION_DENIED', message: 'no' } }), 'key_invalid');
  assert.equal(h(429, { error: { code: 'rate_limit_exceeded', message: 'slow down' } }), 'queue_full'); assert.equal(h(429, { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Resource has been exhausted' } }), 'queue_full');
  const free = G.geminiHttpError(429, { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded for metric: generate_content_free_tier_requests, limit: 0' } }, '');
  assert.equal(free.reasonCode, 'provider_credits'); assert.match(free.message, /no free tier: turn on billing/);
  assert.equal(h(402, { error: { code: 'payment_required', message: 'depleted' } }), 'provider_credits');
  assert.equal(h(400, { error: { code: 400, status: 'INVALID_ARGUMENT', message: 'bad aspect' } }), 'input_invalid'); assert.equal(h(400, { error: { code: 'invalid_request', message: 'x' } }), 'input_invalid');
  const bill = G.geminiHttpError(400, { error: { code: 'failed_precondition', message: 'Billing is disabled for this project' } }, ''); assert.equal(bill.reasonCode, 'provider_credits'); assert.match(bill.message, /Turn on billing/);
  const reg = G.geminiHttpError(400, { error: { code: 400, status: 'FAILED_PRECONDITION', message: 'User location is not supported for the API use.' } }, ''); assert.equal(reg.reasonCode, 'input_invalid'); assert.match(reg.message, /region/);
  assert.equal(h(404, { error: { code: 'model_not_found', message: 'x' } }), 'input_invalid'); assert.equal(h(400, { error: { code: 'image_safety', message: 'x' } }), 'content_blocked');
  for (const s of [500, 503, 504]) assert.equal(h(s, { error: { code: 'service_unavailable' } }), 'provider_error');
  ok('refusals (no image, incomplete, blocked codes) → content_blocked; HTTP: API_KEY_INVALID / 401 / 403 → key, 429 → busy (free-tier / billing text → credits), 402 → credits, 400 → input (billing → credits, region → input with a plain line), 5xx → provider'); }

// ---------------------------------------------------------------- 3. routes and prices
{ // Google's per-image price + 2,000 thinking tokens at the text rate + 2,500 prompt tokens at the input rate (Gemini 3 image models always think)
  const al = (text: number, input: number) => (2000 * text + 2500 * input) / 1e6; const r5 = (x: number) => Math.round(x * 1e5) / 1e5;
  const want: Record<string, Partial<Record<'1K' | '2K' | '4K', number>>> = {
    'direct:google/gemini-nano-banana-2.1': { '1K': r5(0.0336 + al(7.5, 1.5)), '2K': r5(0.0504 + al(7.5, 1.5)), '4K': r5(0.113 + al(7.5, 1.5)) },
    'direct:google/gemini-3.1-flash-image': { '1K': r5(0.067 + al(3, 0.5)), '2K': r5(0.101 + al(3, 0.5)), '4K': r5(0.151 + al(3, 0.5)) },
    'direct:google/gemini-3-pro-image': { '1K': r5(0.134 + al(12, 2)), '2K': r5(0.134 + al(12, 2)), '4K': r5(0.24 + al(12, 2)) }, 'direct-gemini-nb2-lite': { '1K': r5(0.0336 + al(1.5, 0.25)) } };
  for (const p of G.GEMINI_PRICES) { assert.deepEqual(p.usdByResolution, want[p.providerId], p.providerId); assert.equal(p.sourceUrl, 'https://ai.google.dev/gemini-api/docs/pricing'); assert.equal(p.checkedAt, '2026-10-23'); assert.equal(HOSTED_BY_ID[p.providerId], p, 'registered'); }
  assert.equal(G.GEMINI_PRICES.length, 4); assert.equal(HOSTED_BY_ID['direct:google/gemini-3-pro-image'].refImages!.usd, 0.0011);
  const cr = (id: string, res: string, refs = 0, n = 1) => priceOf({ provider: id, imageRes: res, refImages: refs, count: n } as any).credits;
  // every hosted row rounds UP per request (usdToCredits), so a quote is never below the real cost
  assert.deepEqual(['1K', '2K', '4K'].map((r) => cr('direct:google/gemini-nano-banana-2.1', r)), [6, 7, 14]); assert.deepEqual(['1K', '2K', '4K'].map((r) => cr('direct:google/gemini-3.1-flash-image', r)), [8, 11, 16]);
  assert.deepEqual(['1K', '2K', '4K'].map((r) => cr('direct:google/gemini-3-pro-image', r)), [17, 17, 27]); assert.equal(cr('direct-gemini-nb2-lite', '1K', 0, 3), 12);
  for (const [id, byRes] of Object.entries(want)) for (const [r, usd] of Object.entries(byRes)) assert.equal(cr(id, r), usdToCredits(usd!), `${id} ${r}: ceil(${usd} × 100)`);
  assert.equal(cr('direct:google/gemini-3-pro-image', '1K', 14), usdToCredits(want['direct:google/gemini-3-pro-image']['1K']! + 14 * 0.0011), 'Pro: 14 refs × $0.0011 on top');
  // routes
  for (const [engine, rs] of Object.entries(G.GEMINI_ROUTES)) for (const r of rs) {
    assert.equal(r.modelId, engine); assert.equal(r.kind, 'direct'); assert.equal(r.vendor, 'google'); assert.equal(r.envKey, 'OPENHIGGSFIELD_GEMINI_API_KEY'); assert.equal(r.priceRef, r.routeId); assert.ok(HOSTED_BY_ID[r.priceRef!]);
    assert.match(r.routeId, /^direct:google\/gemini-/); assert.deepEqual(r.modes, ['generate', 'edit']); assert.match(r.label, /via Gemini API$/); assert.equal(r.direct!.provider, 'google'); assert.equal(r.checkedAt, '2026-10-23');
    assert.match(r.unavailableFor!({ types: ['inpaint'], imagePath: png })!, /no mask/); assert.match(r.unavailableFor!({ types: ['edit'], refPaths: Array(15).fill(png) })!, /up to 14/); assert.match(r.unavailableFor!({ types: ['edit'] })!, /at least one/);
    assert.equal(r.unavailableFor!({ types: ['generate'], imageResolution: '4K' }), null); assert.equal(r.unavailableFor!({ types: ['edit'], refPaths: Array(14).fill(png), imageResolution: '2K' }), null); }
  assert.deepEqual(Object.keys(G.GEMINI_ROUTES).sort(), ['api-nano-banana', 'api-nano-banana-21', 'api-nano-banana-pro']);
  const lite = G.GEMINI_NATIVE['direct-gemini-nb2-lite']; assert.equal(lite.vendor, 'google'); assert.equal(lite.direct!.provider, 'google'); assert.deepEqual((lite.caps as any).resolutions, ['1K']);
  assert.match(lite.unavailableFor!({ types: ['generate'], imageResolution: '2K' })!, /1K/); assert.equal(lite.unavailableFor!({ types: ['generate'], imageResolution: '1K' }), null);
  ok('prices = the pricing page + the thinking / prompt allowance (rounded up: 2.1 6/7/14 credits, NB2 8/11/16, Pro 17/17/27 + $0.0011 per input image, Lite 4); routes: direct:google/<model>, vendor google, generate + edit, ≤14 refs, no inpaint, Lite 1K only'); }

// ---------------------------------------------------------------- 4. directRun with a fake fetch
{ const calls: { url: string; init: any }[] = [];
  const fake = (status: number, body: any) => (async (url: string, init: any) => { calls.push({ url, init }); return { ok: status < 300, status, headers: new Headers(), json: async () => body, text: async () => JSON.stringify(body) } as any; }) as any;
  const spec = G.geminiSpec('gemini-nano-banana-2.1'); const job = { id: 'j', input: { types: ['edit'], prompt: 'hat', imagePath: png, aspect: '9:16', imageResolution: '2K' } }; const costs: any[] = []; const ids: string[] = [];
  const r = await directRun(spec, await spec.build(job), 'SECRETKEY', { f: fake(200, answer()), job, onCost: (c) => costs.push(c), onSubmit: (id) => ids.push(id) });
  assert.deepEqual(r.outputs, [{ b64: 'IMG1', mime: 'image/jpeg' }]); assert.deepEqual(ids, ['v1_abc']);
  assert.equal(calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/interactions'); assert.ok(!calls[0].url.includes('SECRETKEY') && !calls[0].url.includes('key='), 'key never in the URL');
  assert.equal(calls[0].init.headers['x-goog-api-key'], 'SECRETKEY'); assert.equal(calls[0].init.method, 'POST');
  const sent = JSON.parse(calls[0].init.body); assert.equal(sent.model, 'gemini-nano-banana-2.1'); assert.deepEqual(sent.response_format, { type: 'image', aspect_ratio: '9:16', image_size: '2K' }); assert.equal(sent.input[1].data, B64('PNGDATA'));
  assert.equal(costs.length, 1); assert.equal(costs[0].source, 'gemini:usage'); assert.equal(costs[0].usd, Math.round((1120 * 30 + 210 * 7.5 + 1000 * 1.5) / 1e6 * 1e6) / 1e6);
  await assert.rejects(directRun(spec, await spec.build(job), 'k', { f: fake(429, { error: { code: 'quota_exceeded', message: 'free tier limit: 0' } }) }), (e: any) => e.reasonCode === 'provider_credits' && /^Gemini 429/.test(e.message));
  await assert.rejects(directRun(spec, await spec.build(job), 'k', { f: fake(200, { id: 'x', status: 'failed', errors: [{ code: 'image_safety', message: 'blocked' }] }) }), (e: any) => e.reasonCode === 'content_blocked');
  await assert.rejects(directRun(spec, await spec.build(job), 'k', { f: fake(200, { id: 'x', status: 'completed', steps: [] }) }), (e: any) => e.reasonCode === 'content_blocked');
  assert.equal(DIRECT_PROVIDERS.google.name, 'Google Gemini API'); process.env.OPENHIGGSFIELD_GEMINI_BASE_URL = 'https://proxy.invalid'; assert.equal(directBase('google'), 'https://proxy.invalid');
  const p2: any[] = []; await directRun(spec, await spec.build(job), 'k', { f: (async (u: string, i: any) => { p2.push(u); return fake(200, answer())(u, i); }) as any }); assert.equal(p2[0], 'https://proxy.invalid/v1beta/interactions'); process.env.OPENHIGGSFIELD_GEMINI_BASE_URL = '';
  ok('directRun (sync): one POST to /v1beta/interactions, x-goog-api-key header only, base64 out, cost from usage; 429 free tier → credits, failed + image_safety / empty → content_blocked; GEMINI_BASE_URL swaps the host'); }
fs.rmSync(D, { recursive: true, force: true });
console.log('ALL OK gemini-direct');
