// OpenAI Images API as a direct provider (GPT Image 2 / 2.5 Flare / 2.5 Sunburst), in-process with fake fetch (no network, no keys, no spend).
// Bodies and multipart fields vs the docs read 2026-10-23, size mapping for every aspect × resolution, price rows vs OpenAI's token formula,
// cost from usage, error mapping (org verification → friendly key_invalid), b64_json parsing, and directRun with a multipart body + Bearer header.
// Run: npx tsx test/openai-direct.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execFileSync } from 'node:child_process';
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'openai-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: DIR, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_OPENAI_BASE_URL: '' });
const O = await import('../src/providers/openai.js');
const { directRun, DIRECT_PROVIDERS } = await import('../src/providers/direct.js');
const { HOSTED_BY_ID, gptImageTokens } = await import('../src/shared/hostedPrices.js');
const { usdPerImage } = await import('../src/shared/imageCaps.js'); const { GPT_IMAGE_ASPECTS } = await import('../src/shared/gptImageSizes.js');
const ok = (m: string) => console.log('ok ' + m);
// Inpaint validates decoded source/mask pixels, not just a plausible filename/header.
const PNG = execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=white:s=4x4', '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', 'pipe:1']);
const png = (name: string) => { const p = path.join(DIR, name); fs.writeFileSync(p, PNG); return p; };
const a = png('a.png'), b = png('b.png'), m = png('m.png');
const job = (input: Record<string, any>) => ({ id: 'j1', input });
const fakeFetch = (handler: (url: string, init: any) => { status?: number; body?: any }) => { const calls: { url: string; init: any }[] = [];
  const f = (async (url: string, init: any) => { calls.push({ url, init }); const r = handler(url, init ?? {}); const st = r.status ?? 200;
    return { ok: st >= 200 && st < 300, status: st, headers: new Headers(), json: async () => r.body, text: async () => JSON.stringify(r.body ?? '') } as any; }) as any; return { f, calls }; };

// ---------------------------------------------------------------- 1. bodies
{ const spec = O.openaiSpec('gpt-image-2.5-flare');
  const g = await spec.build(job({ types: ['generate'], prompt: 'otter', hostedPrompt: 'an otter', tier: 'med', imageResolution: '2K', aspect: '16:9', refPaths: [a] }));
  assert.equal(g.url, 'https://api.openai.com/v1/images/generations'); assert.equal(g.form, undefined);
  assert.deepEqual(g.body, { model: 'gpt-image-2.5-flare', prompt: 'an otter', n: 1, quality: 'medium', size: '2048x1152', output_format: 'png' }, 'generate ignores refs on a prompt-only job');
  assert.equal((await spec.build(job({ prompt: 'x', tier: 'low' }))).body!.size, '1024x1024', 'no aspect → 1:1 (never auto: the size and price would be unknown)');
  await assert.rejects(spec.build(job({ prompt: 'x', aspect: '5:7' })), /Aspect 5:7 isn't supported/, 'off-list shape refused, not snapped');
  assert.equal((await spec.build(job({ prompt: 'x', quality: 'high', aspect: '1:1' }))).body!.quality, 'high');
  const e = await spec.build(job({ types: ['edit'], prompt: 'swap', tier: 'low', aspect: '3:4', refPaths: [a, b], maskPath: m }));
  assert.equal(e.url, 'https://api.openai.com/v1/images/edits'); assert.ok(e.form instanceof FormData); assert.equal(e.body, undefined);
  const keys = [...e.form!.keys()]; assert.deepEqual([...new Set(keys)].sort(), ['image[]', 'model', 'n', 'output_format', 'prompt', 'quality', 'size'].sort(), 'no mask on a plain edit');
  assert.equal(e.form!.getAll('image[]').length, 2); assert.equal(e.form!.get('model'), 'gpt-image-2.5-flare'); assert.equal(e.form!.get('quality'), 'low'); assert.equal(e.form!.get('n'), '1');
  assert.equal((e.form!.getAll('image[]')[0] as File).name, 'a.png'); assert.equal((e.form!.getAll('image[]')[0] as File).type, 'image/png');
  const ip = await spec.build(job({ types: ['inpaint'], prompt: 'fill', refPaths: [a, b], maskPath: m, imageResolution: '1K', aspect: '1:1' }));
  assert.ok(ip.form!.has('mask')); assert.equal((ip.form!.get('mask') as File).type, 'image/png'); assert.equal(ip.form!.get('size'), '1024x1024');
  const many = await spec.build(job({ types: ['edit'], prompt: 'x', refPaths: Array(20).fill(a) })); assert.equal(many.form!.getAll('image[]').length, 16, '≤16 images');
  const one = await spec.build(job({ types: ['edit'], prompt: 'x', imagePath: b })); assert.equal(one.form!.getAll('image[]').length, 1);
  ok('bodies: generate JSON {model, prompt, n, quality low|medium|high, size, output_format png}; edit multipart image[] ×N (≤16), mask only on inpaint'); }

// ---------------------------------------------------------------- 2. sizes
{ const R = O.OPENAI_SIZE_RULES;
  for (const res of ['1K', '2K', '4K'] as const) for (const asp of GPT_IMAGE_ASPECTS) { const { width: w, height: h } = O.openaiSize(asp, res)!; const t = `${asp} ${res} → ${w}x${h}`;
    assert.ok(w % 16 === 0 && h % 16 === 0, `${t}: ×16`); assert.ok(Math.max(w, h) / Math.min(w, h) <= 3, `${t}: ratio`); assert.ok(Math.max(w, h) <= R.maxEdge, `${t}: edge`);
    assert.ok(w * h >= R.minPixels && w * h <= R.maxPixels, `${t}: pixels ${w * h}`); const [x, y] = asp.split(':').map(Number); assert.equal(w * y, h * x, `${t}: exactly the aspect`); }
  for (const asp of ['1:3', '3:1', '5:1', '5:7']) assert.equal(O.openaiSize(asp, '1K'), null, `${asp}: not offered (refused, never snapped)`);
  assert.deepEqual(O.openaiSize('1:1', '1K'), { width: 1024, height: 1024 }); assert.deepEqual(O.openaiSize('16:9', '4K'), { width: 3840, height: 2160 }); assert.deepEqual(O.openaiSize('1:1', '4K'), { width: 2880, height: 2880 });
  assert.equal(O.openaiSizeField('auto', '2K'), '2048x2048', '2K / 4K with no aspect: square');
  ok('sizes: the shared table (shared/gptImageSizes.ts): every shape × 1K/2K/4K is ×16, ≤3:1, ≤3840, 655,360–8,294,400 px and exactly its shape; others refused'); }

// ---------------------------------------------------------------- 3. prices
{ assert.equal(O.OPENAI_PRICES.length, 3);
  for (const p of O.OPENAI_PRICES) { assert.equal(HOSTED_BY_ID[p.providerId], p, 'registered'); assert.equal(p.unit, 'image'); assert.equal(p.checkedAt, '2026-10-23');
    const f = p.providerId.endsWith('gpt-image-2') ? 'gpt-image-2' : 'gpt-image-2.5';
    for (const t of ['low', 'med', 'high'] as const) for (const r of ['1K', '2K', '4K'] as const) { const q = t === 'med' ? 'medium' : t;
      const worst = Math.max(...O.sizesFor(r).map((s) => gptImageTokens(f, q, s.width, s.height)));
      const want = Math.round((worst * 30 / 1e6 + 0.0025) * 1e5) / 1e5; assert.equal(p.usdByTierRes![`${t}:${r}`], want, `${p.providerId} ${t}:${r}`);
      assert.equal(usdPerImage(p.providerId, t, r), want, 'usdPerImage reads the row (quote = charge)');
      for (const asp of GPT_IMAGE_ASPECTS) { const s = O.openaiSize(asp, r)!; assert.ok(gptImageTokens(f, q, s.width, s.height) * 30 / 1e6 <= want, 'never under-quotes output'); } }
    assert.ok(p.refImages && p.refImages.estimated && p.refImages.usd > 0.009 && p.refImages.usd < 0.011); }
  // OpenAI's own published 1024² figures for gpt-image-2 (low $0.006 / medium $0.053 / high $0.211) sit inside the 1K row
  const g2 = HOSTED_BY_ID['direct:openai/gpt-image-2']; assert.ok(Math.abs(g2.usdByTierRes!['low:1K'] - 0.0025 - 0.006) < 0.0005); assert.ok(Math.abs(g2.usdByTierRes!['high:1K'] - 0.0025 - 0.211) < 0.001);
  ok('prices: usdByTierRes = worst-case output tokens × $30/1M + 500 text tokens, every tier × 1K/2K/4K; refs ~1,219 tokens × $8/1M'); }

// ---------------------------------------------------------------- 4. cost + parsing + errors
{ const c = O.openaiCost({ usage: { input_tokens: 1300, input_tokens_details: { text_tokens: 100, image_tokens: 1200 }, output_tokens: 1756, total_tokens: 3056 } })!;
  assert.equal(c.usd, Math.round((100 * 5 + 1200 * 8 + 1756 * 30) / 1e6 * 1e6) / 1e6); assert.equal(c.units, 1756); assert.equal(c.unitLabel, 'tokens'); assert.equal(c.settled, true); assert.equal(c.source, 'openai:usage');
  assert.equal(O.openaiCost({ data: [] }), null);
  assert.deepEqual(O.parseOpenaiImages({ data: [{ b64_json: 'QUJD' }, { url: 'x' }], output_format: 'png' }).outputs, [{ b64: 'QUJD', mime: 'image/png' }]);
  const E = (s: number, j: any) => O.openaiError(s, j, JSON.stringify(j));
  assert.equal(E(401, { error: { message: 'Incorrect API key provided', code: 'invalid_api_key' } }).reasonCode, 'key_invalid');
  const v = E(403, { error: { message: 'Your organization must be verified to use the model `gpt-image-2`.', type: 'invalid_request_error' } });
  assert.equal(v.reasonCode, 'key_invalid'); assert.match(v.message, /verified organization.*platform\.openai\.com\/settings\/organization\/general/);
  assert.equal(E(400, { error: { message: 'Organization verification required' } }).message, O.OPENAI_VERIFY_MESSAGE);
  assert.equal(E(403, { error: { message: 'Country, region, or territory not supported' } }).reasonCode, 'key_invalid');
  for (const code of ['insufficient_quota', 'billing_hard_limit_reached', 'credit_balance_exhausted', 'organization_spend_limit_exceeded', 'project_spend_limit_exceeded'])
    assert.equal(E(429, { error: { code, message: 'x' } }).reasonCode, 'provider_credits', code);
  assert.equal(E(429, { error: { type: 'insufficient_quota', code: null, message: 'quota' } }).reasonCode, 'provider_credits');
  assert.equal(E(429, { error: { code: 'rate_limit_exceeded', message: 'slow' } }).reasonCode, 'queue_full'); assert.ok(E(429, {}).temporary);
  assert.equal(E(400, { error: { code: 'moderation_blocked', message: 'Your request was rejected by the safety system.' } }).reasonCode, 'content_blocked');
  assert.equal(E(400, { error: { code: 'content_policy_violation', message: 'x' } }).reasonCode, 'content_blocked');
  assert.equal(E(400, { error: { message: 'Your request was rejected as a result of our safety system.' } }).reasonCode, 'content_blocked');
  assert.equal(E(400, { error: { code: 'invalid_value', param: 'size', message: 'bad size' } }).reasonCode, 'input_invalid');
  assert.equal(E(500, {}).reasonCode, 'provider_error'); assert.equal(E(503, { error: { code: 'server_is_overloaded' } }).reasonCode, 'provider_error'); assert.ok(E(503, {}).temporary);
  ok('cost from usage ($5 text / $8 image in / $30 out per 1M), b64_json outputs, errors: 401/403 key, org verification friendly, 429 billing vs busy, 400 moderation vs input, 5xx'); }

// ---------------------------------------------------------------- 5. directRun (sync, multipart, Bearer)
{ assert.equal(DIRECT_PROVIDERS.openai.defaultBase, 'https://api.openai.com');
  const { f, calls } = fakeFetch(() => ({ body: { created: 1, data: [{ b64_json: 'UE5H' }], output_format: 'png', usage: { input_tokens: 1250, input_tokens_details: { text_tokens: 50, image_tokens: 1200 }, output_tokens: 196 } } }));
  const spec = O.openaiSpec('gpt-image-2.5-sunburst'); const input = { types: ['inpaint'], prompt: 'fill', refPaths: [a], maskPath: m, tier: 'low', aspect: '1:1' }; const costs: any[] = [];
  const r = await directRun(spec, await spec.build(job(input)), 'sk-test', { f, job: job(input), onCost: (c) => costs.push(c) });
  assert.deepEqual(r.outputs, [{ b64: 'UE5H', mime: 'image/png' }]); assert.equal(calls.length, 1);
  const { url, init } = calls[0]; assert.equal(url, 'https://api.openai.com/v1/images/edits'); assert.equal(init.method, 'POST');
  assert.equal(init.headers.Authorization, 'Bearer sk-test'); assert.equal(init.headers['Content-Type'], undefined, 'fetch sets the multipart boundary itself');
  assert.ok(init.body instanceof FormData); assert.ok(init.body.has('mask')); assert.equal(init.body.getAll('image[]').length, 1); assert.ok(!url.includes('sk-test'));
  assert.equal(costs[0].source, 'openai:usage'); assert.equal(costs[0].units, 196);
  const g = fakeFetch(() => ({ body: { data: [{ b64_json: 'QQ==' }] } })); const gi = { prompt: 'x', aspect: '9:16', imageResolution: '4K' };
  await directRun(O.openaiSpec('gpt-image-2'), await O.openaiSpec('gpt-image-2').build(job(gi)), 'k', { f: g.f });
  assert.equal(g.calls[0].init.headers['Content-Type'], 'application/json'); assert.deepEqual(JSON.parse(g.calls[0].init.body), { model: 'gpt-image-2', prompt: 'x', n: 1, quality: 'medium', size: '2160x3840', output_format: 'png' });
  const bad = fakeFetch(() => ({ status: 403, body: { error: { message: 'Your organization must be verified to generate images.' } } }));
  await assert.rejects(directRun(spec, await spec.build(job({ prompt: 'x' })), 'k', { f: bad.f }), (e: any) => e.reasonCode === 'key_invalid' && e.message === O.OPENAI_VERIFY_MESSAGE);
  ok('directRun: one sync call, multipart edit with Bearer and no JSON content-type, JSON generate, cost recorded from usage, org verification surfaced'); }

// ---------------------------------------------------------------- 6. routes
{ assert.deepEqual(Object.keys(O.OPENAI_ROUTES).sort(), ['api-gpt-image', 'api-gpt-image-25-flare', 'api-gpt-image-25-sunburst']);
  for (const [engine, [r]] of Object.entries(O.OPENAI_ROUTES)) { assert.equal(r.modelId, engine); assert.equal(r.kind, 'direct'); assert.equal(r.vendor, 'openai'); assert.equal(r.priceRef, r.routeId);
    assert.match(r.routeId, /^direct:openai\/gpt-image-2(\.5-(flare|sunburst))?$/); assert.equal(r.envKey, 'OPENHIGGSFIELD_OPENAI_API_KEY'); assert.ok(HOSTED_BY_ID[r.priceRef!]); assert.equal(r.direct!.mode, 'sync'); assert.ok(r.direct!.perOutput);
    assert.deepEqual(r.modes, ['generate', 'edit', 'inpaint']); assert.equal((r.caps as any).maxRefs, 16); assert.equal((r.caps as any).mask, true); }
  const u = O.OPENAI_ROUTES['api-gpt-image'][0].unavailableFor!;
  assert.equal(u({ types: ['generate'], prompt: 'x', imageResolution: '4K' }), null); assert.match(u({ types: ['edit'], refPaths: Array(17).fill(a) })!, /up to 16/);
  assert.match(u({ types: ['edit'] })!, /at least one image/); assert.match(u({ types: ['inpaint'], refPaths: [a] })!, /mask/); assert.match(u({ imageResolution: '8K' })!, /1K \/ 2K \/ 4K/);
  assert.equal(O.OPENAI_ROUTES['api-gpt-image'][0].refsPriced!({ types: ['edit'], refPaths: [a, b] }), 2); assert.equal(O.OPENAI_ROUTES['api-gpt-image'][0].refsPriced!({ types: ['generate'], refPaths: [a] }), 0);
  ok('routes: one direct:openai/<model> route per engine (generate / edit / inpaint), price row, ≤16 refs, mask needs an image'); }
fs.rmSync(DIR, { recursive: true, force: true });
console.log('ALL OK');
