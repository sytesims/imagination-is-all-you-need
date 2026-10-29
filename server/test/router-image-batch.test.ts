// Comfy Router image batch (2026-10-25): GPT Image 1.5, Seedream 4.5, Grok Imagine Image Pro, and Comfy Router as a second Run on place of
// Nano Banana 2 Lite (native route: the Gemini API).
// 1. schemas: every request body variant (generate, edit with 1 / max photos, Match photo, inpaint, each resolution and shape) validates against the
//    model's optional official Router input schema (<provider>__<model>.json, ajv 2020, strict off, formats off), from MODEL_HEALTH_SCHEMAS /
//    ROUTER_SCHEMAS_DIR or the generic user cache. That additional check skips explicitly when absent; body/cap/price assertions always run.
// 2. limits: shapes, resolutions (4K where unsupported, 1K on Seedream 4.5), 0 / 1 / max / max + 1 photos, masks, refused before any call.
// 3. prices: Router / partner pricing figures (docs.comfy.org/development/comfy-router/pricing, …/tutorials/partner-nodes/pricing, read 2026-10-25),
//    per-reference fees counted from what the body sends; quote = submit (routeCredits on the same input the run is charged on).
// In process, mock backend, no keys, no network. Run: npx tsx test/router-image-batch.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { createRequire } from 'node:module';
import { ROUTER_SCHEMA_DIR } from './_model-health.js';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'rimgbatch-'));
Object.assign(process.env, { COMFY_API_KEY: '', OPENHIGGSFIELD_GEMINI_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '', OPENHIGGSFIELD_DATA_DIR: fs.mkdtempSync(path.join(D, 'unit-')), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_COMFY_ROUTER_URL: 'http://127.0.0.1:9' });
const ok = (m: string) => console.log('ok ' + m);
const PNG = path.join(ROOT, 'samples/sample-keyframe.png'); const refs = (n: number) => Array.from({ length: n }, () => PNG);

const M = await import('../src/routing/routerModels.ts'); const { IMAGE_CAPS, usdPerImage, checkImageCaps } = await import('../src/shared/imageCaps.ts');
const { HOSTED_BY_ID, gptImageUsd, gptImageQuote, GPT15_TOKENS, promptBytesOf } = await import('../src/shared/pricing.ts');
const { getTool } = await import('../src/tools/registry.ts'); const { findRoute, routesFor } = await import('../src/routing/routes.ts'); const { routeCredits } = await import('../src/routing/select.ts');
const RR = await import('../src/routing/routerRun.ts'); const { GENERATE_MODELS, EDIT_MODELS, MASK_MODELS, modelNameOf } = await import('../src/shared/imageFeatures.ts');
const { ROUTER_SIZE_TABLE } = await import('../src/shared/routerImageSizes.ts'); const { GROK_IMAGE_ASPECTS } = await import('../src/shared/hostedAspects.ts'); const { GEMINI_ASPECTS_10 } = await import('../src/shared/imageCaps.ts');
const ci = getTool('create-image')!;
const R = M.ROUTER_MODELS; const body = (id: string, i: Record<string, any>) => R[id].body(i, 0) as Promise<any>;

// ---------------- 1. bodies vs the official schemas ----------------
const SCHEMAS = ROUTER_SCHEMA_DIR;
const FILES: Record<string, string> = { 'api-gpt-image-15': 'openai__gpt-image-1.5', 'api-seedream-45': 'byteplus__seedream-4-5-251128', 'direct-gemini-nb2-lite': 'vertexai__gemini-3.1-flash-lite-image', 'api-grok-image-pro': 'xai__grok-imagine-image-pro' };
const ID: Record<string, string> = { 'api-gpt-image-15': 'openai/gpt-image-1.5', 'api-seedream-45': 'byteplus/seedream-4-5-251128', 'direct-gemini-nb2-lite': 'vertexai/gemini-3.1-flash-lite-image', 'api-grok-image-pro': 'xai/grok-imagine-image-pro' };
const variants: Record<string, [string, Record<string, any>][]> = Object.fromEntries(Object.keys(FILES).map((k) => [k, []]));
const add = (id: string, what: string, i: Record<string, any>) => variants[id].push([what, { prompt: 'a red fox in snow', seed: 7, ...i }]);
for (const a of ['1:1', '2:3', '3:2']) for (const quality of ['low', 'med', 'high']) add('api-gpt-image-15', `generate ${a} ${quality}`, { types: ['generate'], aspect: a, imageResolution: '1K', quality });
add('api-gpt-image-15', 'edit 1 photo', { types: ['edit'], aspect: '2:3', imageResolution: '1K', refPaths: refs(1) }); add('api-gpt-image-15', 'edit 16 photos', { types: ['edit'], aspect: '3:2', imageResolution: '1K', quality: 'high', refPaths: refs(16) });
add('api-gpt-image-15', 'inpaint', { types: ['inpaint'], aspect: '1:1', imageResolution: '1K', refPaths: refs(1), maskPath: PNG });
for (const res of ['2K', '4K']) for (const a of Object.keys(ROUTER_SIZE_TABLE['api-seedream-45'][res as '2K']!)) add('api-seedream-45', `generate ${a} ${res}`, { types: ['generate'], aspect: a, imageResolution: res });
add('api-seedream-45', 'edit 1 photo 2K', { types: ['edit'], aspect: '4:5', imageResolution: '2K', refPaths: refs(1) }); add('api-seedream-45', 'edit 14 photos 4K', { types: ['edit'], aspect: '16:9', imageResolution: '4K', refPaths: refs(14) });
add('api-seedream-45', 'edit Match photo', { types: ['edit'], aspect: 'auto', aspectAuto: true, imageResolution: '2K', refPaths: refs(1) }); add('api-seedream-45', 'no resolution (= 2K)', { types: ['generate'], aspect: '1:1' });
for (const a of GEMINI_ASPECTS_10) add('direct-gemini-nb2-lite', `generate ${a}`, { types: ['generate'], aspect: a, imageResolution: '1K' });
add('direct-gemini-nb2-lite', 'edit 1 photo', { types: ['edit'], aspect: '3:4', imageResolution: '1K', refPaths: refs(1) }); add('direct-gemini-nb2-lite', 'edit 14 photos', { types: ['edit'], aspect: '16:9', imageResolution: '1K', refPaths: refs(14) });
add('direct-gemini-nb2-lite', 'edit Match photo', { types: ['edit'], aspect: 'auto', aspectAuto: true, imageResolution: '1K', refPaths: refs(1) });
for (const res of ['1K', '2K']) for (const a of [...GROK_IMAGE_ASPECTS, 'auto']) add('api-grok-image-pro', `generate ${a} ${res}`, { types: ['generate'], aspect: a, imageResolution: res, quality: 'high' });
const bodies: Record<string, [string, any][]> = {};
for (const [id, vs] of Object.entries(variants)) { bodies[id] = []; for (const [what, i] of vs) { assert.equal(R[id].block!(i), null, `${id} ${what}: not blocked`); bodies[id].push([what, await body(id, i)]); } }
const req = createRequire(import.meta.url); const ajvPath = path.resolve(ROOT, '../node_modules/ajv/dist/2020.js');
const have = Object.values(FILES).every((f) => fs.existsSync(path.join(SCHEMAS, `${f}.json`))) && fs.existsSync(ajvPath);
if (!have) console.log(`skip schema validation: ${SCHEMAS} or ajv not found (the schemas are downloaded separately)`);
else { const Ajv2020 = req(ajvPath).default; const ajv = new Ajv2020({ strict: false, validateFormats: false, allErrors: true }); let n = 0;
  for (const [id, f] of Object.entries(FILES)) {
    const doc = JSON.parse(fs.readFileSync(path.join(SCHEMAS, `${f}.json`), 'utf8')); delete doc.openapi; doc.$id = `rs-${f}`; ajv.addSchema(doc);
    const p = Object.keys(doc.paths); assert.deepEqual(p, [`/v2/models/${ID[id]}`], `${id}: the schema is for ${R[id].id}`); assert.equal(R[id].id, ID[id]);
    const v = ajv.compile({ $ref: `rs-${f}#/paths/${p[0].replace(/~/g, '~0').replace(/\//g, '~1')}/post/requestBody/content/application~1json/schema` });
    for (const [what, b] of bodies[id]) { assert.ok(v(b), `${id} ${what}: ${JSON.stringify(v.errors)}`); n++; }
    // the schema itself refuses what we never send: proves the check bites
    if (id === 'api-grok-image-pro') { assert.equal(v({ ...bodies[id][0][1], resolution: '4k' }), false); assert.equal(v({ ...bodies[id][0][1], aspect_ratio: '21:9' }), false); }
    if (id === 'api-seedream-45') assert.equal(v({ ...bodies[id][0][1], image: refs(15).map(() => 'data:image/png;base64,AA==') }), false, '15 images refused by the schema');
    if (id === 'api-gpt-image-15') assert.equal(v({ ...bodies[id][0][1], quality: 'ultra' }), false);
  }
  ok(`schemas: ${n} body variants valid against the official Router input schemas (GPT Image 1.5, Seedream 4.5, Nano Banana 2 Lite, Grok Imagine Image Pro)`); }

// ---------------- 2. what each body sends, limits, refusals ----------------
{ const [, g] = bodies['api-gpt-image-15'].find(([w]) => w === 'generate 2:3 high')!; assert.deepEqual(g, { prompt: 'a red fox in snow', quality: 'high', size: '1024x1536', n: 1, output_format: 'png' });
  const [, e] = bodies['api-gpt-image-15'].find(([w]) => w === 'edit 16 photos')!; assert.equal(e.image.length, 16); assert.equal(e.size, '1536x1024');
  const [, m] = bodies['api-gpt-image-15'].find(([w]) => w === 'inpaint')!; assert.ok(m.mask && m.image.length === 1, 'inpaint: image + mask');
  assert.match(String(R['api-gpt-image-15'].block!({ types: ['generate'], aspect: '16:9', imageResolution: '1K' })), /Aspect 16:9 isn't supported by this model \(1:1, 2:3, 3:2\)/);
  assert.match(String(R['api-gpt-image-15'].block!({ types: ['generate'], aspect: '1:1', imageResolution: '2K' })), /Resolution 2K isn't offered by this model \(1K\)/);
  await assert.rejects(body('api-gpt-image-15', { types: ['generate'], aspect: '1:1', imageResolution: '4K' }), /Resolution 4K/);
  assert.match(String(R['api-gpt-image-15'].block!({ types: ['edit'], aspect: '1:1', refPaths: refs(17) })), /up to 16 reference images; you added 17/);
  const c = IMAGE_CAPS['api-gpt-image-15']; assert.deepEqual([c.aspects, c.resolutions, c.qualityTiers, c.supports.maxRefs, c.supports.draw, c.allowAuto], [['1:1', '2:3', '3:2'], ['1K'], ['low', 'med', 'high'], 16, true, false]);
  ok('GPT Image 1.5: 1:1 / 2:3 / 3:2 at 1K as 1024x1024 / 1024x1536 / 1536x1024, low / medium / high, edit 1–16 photos, mask; 16:9, 2K, 4K and 17 photos refused'); }
{ const sz = (w: string) => bodies['api-seedream-45'].find(([x]) => x === w)![1];
  assert.equal(sz('generate 1:1 2K').size, '2048x2048'); assert.equal(sz('generate 1:1 4K').size, '4096x4096'); assert.equal(sz('no resolution (= 2K)').size, '2048x2048');
  for (const [w, b] of bodies['api-seedream-45']) { const [x, y] = b.size.split('x').map(Number); assert.ok(x * y >= 3_686_400 && x * y <= 16_777_216, `${w}: ${b.size} inside 2560x1440 … 4096²`);
    assert.equal(b.sequential_image_generation, 'disabled'); assert.equal(b.output_format, undefined, 'output_format is 5.0 only'); assert.equal(b.watermark, false); }
  assert.equal(sz('edit 14 photos 4K').image.length, 14);
  const [mw, mh] = sz('edit Match photo').size.split('x').map(Number); const { imageDimsOfFile } = await import('../src/imageDims.ts'); const d = imageDimsOfFile(PNG)!; assert.ok(Math.abs(mw / mh / (d.width / d.height) - 1) < 0.01, 'Match photo keeps the photo shape');
  assert.match(String(R['api-seedream-45'].block!({ types: ['generate'], aspect: '1:1', imageResolution: '1K' })), /Resolution 1K isn't offered by this model \(2K, 4K\)/);
  assert.match(String(R['api-seedream-45'].block!({ types: ['edit'], aspect: '1:1', imageResolution: '2K', refPaths: refs(15) })), /up to 14 reference images; you added 15/);
  assert.match(String(R['api-seedream-45'].block!({ types: ['inpaint'], aspect: '1:1', imageResolution: '2K', refPaths: refs(1), maskPath: PNG })), /doesn't take a mask/);
  const c = IMAGE_CAPS['api-seedream-45']; assert.deepEqual([c.resolutions, c.defaultResolution, c.supports.maxRefs, c.supports.draw, c.edit?.allowAuto], [['2K', '4K'], '2K', 14, false, true]);
  ok('Seedream 4.5: exact WxH at 2K / 4K (2048² / 4096² square), sequential off, edit 1–14 photos, Match photo; 1K, 15 photos and masks refused'); }
{ const nb = (w: string) => bodies['direct-gemini-nb2-lite'].find(([x]) => x === w)![1];
  assert.deepEqual(nb('generate 21:9').generationConfig.imageConfig, { imageSize: '1K', aspectRatio: '21:9' }); assert.equal(nb('edit Match photo').generationConfig.imageConfig.aspectRatio, undefined, 'Match photo: aspect left out');
  assert.equal(nb('edit 14 photos').contents[0].parts.filter((p: any) => p.inlineData).length, 14);
  assert.match(String(R['direct-gemini-nb2-lite'].block!({ types: ['generate'], aspect: '1:1', imageResolution: '2K' })), /makes 1K images/); await assert.rejects(body('direct-gemini-nb2-lite', { types: ['generate'], aspect: '1:1', imageResolution: '4K' }), /1K/);
  assert.match(String(R['direct-gemini-nb2-lite'].block!({ types: ['generate'], aspect: '1:4', imageResolution: '1K' })), /Aspect 1:4 isn't supported/);
  assert.match(String(R['direct-gemini-nb2-lite'].block!({ types: ['edit'], imageResolution: '1K', refPaths: refs(15) })), /up to 14/); assert.match(String(R['direct-gemini-nb2-lite'].block!({ types: ['inpaint'], refPaths: refs(1), maskPath: PNG })), /doesn't take a mask/);
  ok('Nano Banana 2 Lite on Router: 1K only, 10 shapes, Match photo leaves the aspect out, 1–14 photos; 2K / 4K, 1:4, 15 photos and masks refused'); }
{ const g = bodies['api-grok-image-pro'].find(([x]) => x === 'generate 19.5:9 2K')![1]; assert.deepEqual(g, { prompt: 'a red fox in snow', n: 1, response_format: 'url', resolution: '2k', aspect_ratio: '19.5:9' });
  assert.equal(bodies['api-grok-image-pro'].find(([x]) => x === 'generate auto 1K')![1].aspect_ratio, 'auto'); assert.ok(bodies['api-grok-image-pro'].every(([, b]) => b.quality === undefined && b.image === undefined), 'no quality, no image');
  assert.match(String(R['api-grok-image-pro'].block!({ types: ['generate'], aspect: '1:1', imageResolution: '4K' })), /Resolution 4K isn't offered by this model \(1K, 2K\)/);
  await assert.rejects(body('api-grok-image-pro', { types: ['generate'], aspect: '1:1', imageResolution: '4K' }), /Resolution 4K/);
  assert.match(String(R['api-grok-image-pro'].block!({ types: ['edit'], refPaths: refs(1) })), /prompt only/);
  const c = IMAGE_CAPS['api-grok-image-pro']; assert.deepEqual([c.supports.refs, c.supports.maxRefs, c.qualityTiers, c.resolutions, c.allowAuto], [false, 0, [], ['1K', '2K'], true]);
  assert.ok(!EDIT_MODELS.includes('api-grok-image-pro') && GENERATE_MODELS.includes('api-grok-image-pro'), 'no photo button: not an edit model');
  ok('Grok Imagine Image Pro: prompt only (no photo button), 13 shapes + Auto at 1K / 2K, no quality field; 4K and photos refused'); }
// carry-over: a 16:9 pick switching to GPT Image 1.5 (no 16:9) is refused by the caps, never sent as another size; checkImageCaps fills each model's default resolution
{ const g: any = checkImageCaps('api-gpt-image-15', { aspect: '16:9' }); assert.ok(g.ok && g.aspect !== '16:9' && /closest shape/.test(g.notes?.[0]), `D5: snapped to the closest shape: ${JSON.stringify(g)}`); assert.equal((checkImageCaps('api-seedream-45', { aspect: '1:1' }) as any).imageResolution, '2K');
  assert.equal((checkImageCaps('api-seedream-45', { aspect: '1:1', imageResolution: '1K' }) as any).imageResolution, '2K'); assert.equal((checkImageCaps('api-grok-image-pro', { aspect: '1:1', imageResolution: '4K' }) as any).imageResolution, '2K');
  assert.equal((checkImageCaps('direct-gemini-nb2-lite', { aspect: '1:1', imageResolution: '2K' }) as any).imageResolution, '1K'); assert.equal((checkImageCaps('api-grok-image-pro', { aspect: '1:1', refs: 1, mode: 'edit' }) as any).ok, false);
  ok('caps: unsupported shapes and sizes snap to the nearest (D5), photos a model can\'t take are refused before a quote; Seedream 4.5 defaults to 2K'); }
// menus and names
for (const id of ['api-gpt-image-15', 'api-seedream-45', 'api-grok-image-pro', 'direct-gemini-nb2-lite']) { assert.ok(GENERATE_MODELS.includes(id), `${id}: in the Image menu`); assert.ok(modelNameOf(id), `${id}: a model name`); }
assert.ok(MASK_MODELS.includes('api-gpt-image-15') && !MASK_MODELS.includes('api-seedream-45'));
ok(`menus: ${['api-gpt-image-15', 'api-seedream-45', 'api-grok-image-pro', 'direct-gemini-nb2-lite'].map((id) => modelNameOf(id)).join(', ')} in Create Image; GPT Image 1.5 in Brush Edit`);

// ---------------- 3. prices (quote = submit: routeCredits on the job input) ----------------
const CR = 211; const appCredits = (usd: number) => Math.ceil(Math.round(usd * 100 * 1e6) / 1e6); const c5 = (comfy: number) => Math.round((comfy / CR) * 1e5) / 1e5;
const img = (o: Record<string, any>) => ({ outKind: 'image', n: 1, prompt: 'a red fox', aspect: '1:1', ...o });
{ // GPT Image 1.5: OpenAI's fixed token table × Comfy's 6752 / 1M, + prompt text at 1055 / 1M, × 1.2 or + 1 credit, rounded up; refs at 1688 / 1M
  assert.deepEqual(GPT15_TOKENS.medium, { '1024x1024': 1056, '1024x1536': 1584, '1536x1024': 1568 });
  for (const tier of ['low', 'med', 'high'] as const) { const q = gptImageQuote('gpt-image-1.5', tier, '1K', '2:3', 500); const out = GPT15_TOKENS[tier === 'med' ? 'medium' : tier]['1024x1536'];
    assert.equal(q.outTokens, out + 8); const base = ((out + 8) * 6752 + (100 + 200) * 1055) / 1e6; assert.ok(Math.abs(q.comfyCredits - Math.max(base * 1.2, base + 1)) < 1e-9, `${tier}: ${q.comfyCredits}`);
    assert.equal(usdPerImage('api-gpt-image-15', tier, '1K'), gptImageUsd('gpt-image-1.5', tier, '1K'), `${tier}: menu figure = the costliest shape`); }
  assert.equal(usdPerImage('api-gpt-image-15', 'med', '2K'), null, 'no 2K price');
  const r = findRoute('comfy-router:api-gpt-image-15')!; const g = routeCredits(ci, r, img({ tier: 'med', imageResolution: '1K' }))!;
  assert.equal(g, appCredits(gptImageUsd('gpt-image-1.5', 'med', '1K', '1:1', promptBytesOf('a red fox'))));
  const e = routeCredits(ci, r, img({ tier: 'med', imageResolution: '1K', types: ['edit'], imagePath: PNG, refPaths: refs(3) }))!;
  assert.equal(e, appCredits(gptImageUsd('gpt-image-1.5', 'med', '1K', '1:1', promptBytesOf('a red fox')) + 3 * HOSTED_BY_ID['api-gpt-image-15'].refImages!.usd));
  assert.ok(RR.TOKEN_BILLED.has('api-gpt-image-15') && RR.QUOTE_HAS_ALLOWANCE.has('api-gpt-image-15'));
  ok(`GPT Image 1.5: medium 1:1 ${g} credits, with 3 photos ${e} (token quote with headroom, refs at 1688 / 1M)`); }
{ // Seedream 4.5: 8.44 per image at 2K and 4K, + 0.633 per input image
  const r = findRoute('comfy-router:api-seedream-45')!; const at = (res: string, n: number) => routeCredits(ci, r, img({ imageResolution: res, ...(n ? { types: ['edit'], imagePath: PNG, refPaths: refs(n) } : {}) }))!;
  assert.equal(usdPerImage('api-seedream-45', null, '2K'), c5(8.44)); assert.equal(usdPerImage('api-seedream-45', null, '4K'), c5(8.44)); assert.equal(routeCredits(ci, r, img({})), 4, 'a bare quote (no size) = the 2K job');
  assert.equal(at('2K', 0), appCredits(c5(8.44))); assert.equal(at('4K', 0), 4); assert.equal(at('2K', 1), appCredits(c5(8.44) + c5(0.633))); assert.equal(at('4K', 14), appCredits(c5(8.44) + 14 * c5(0.633)));
  ok(`Seedream 4.5: ${at('2K', 0)} credits at 2K and 4K; 1 photo ${at('2K', 1)}, 14 photos ${at('4K', 14)}`); }
{ // Grok Imagine Image Pro: 14.77 per image at any size (partner page); no reference fee (no photos)
  const r = findRoute('comfy-router:api-grok-image-pro')!; const a = routeCredits(ci, r, img({ imageResolution: '1K' })); const b = routeCredits(ci, r, img({ imageResolution: '2K', aspect: '9:20' }));
  assert.equal(a, appCredits(c5(14.77))); assert.equal(b, a); assert.equal(a, 7); assert.equal(HOSTED_BY_ID['api-grok-image-pro'].refImages, undefined);
  ok(`Grok Imagine Image Pro: ${a} credits at 1K and 2K`); }
{ // Nano Banana 2 Lite: its Gemini API route keeps its price; the Router place prices from its own row (7596 / 379.8 / 63.3 per 1M + the thinking / prompt allowance)
  const rs = routesFor('direct-gemini-nb2-lite', ci); const ids = rs.map((x) => x.routeId); assert.deepEqual(ids, ['direct:direct-gemini-nb2-lite', 'comfy-router:direct-gemini-nb2-lite']);
  const r = rs[1]; assert.equal(r.kind, 'comfy-router'); assert.equal(r.modelId, 'direct-gemini-nb2-lite'); assert.equal(r.priceRef, 'comfy-router:direct-gemini-nb2-lite'); assert.match(r.endpoint, /\/v2\/models\/vertexai\/gemini-3\.1-flash-lite-image\/requests/);
  assert.equal((r.caps as any).maxRefs, 14); assert.deepEqual((r.caps as any).resolutions, ['1K']); assert.equal(M.routerModelOfRoute(r.routeId)!.id, 'vertexai/gemini-3.1-flash-lite-image');
  const one = (7596 * 1120 + 379.8 * 2000 + 63.3 * 2500) / 1e6; const ref = 63.3 * 1120 / 1e6;
  assert.equal(HOSTED_BY_ID[r.priceRef!].usd, c5(one)); const g = routeCredits(ci, r, img({ imageResolution: '1K' }))!; const e = routeCredits(ci, r, img({ imageResolution: '1K', types: ['edit'], imagePath: PNG, refPaths: refs(14) }))!;
  assert.equal(g, appCredits(c5(one))); assert.equal(e, appCredits(c5(one) + 14 * c5(ref)));
  assert.equal(routeCredits(ci, rs[0], img({ imageResolution: '1K' })), 4, 'Gemini API route unchanged');
  assert.ok(RR.TOKEN_BILLED.has('direct-gemini-nb2-lite') && RR.QUOTE_HAS_ALLOWANCE.has('direct-gemini-nb2-lite'));
  // keyless: no refusal (sample runs stay); with a Comfy key the Router block applies before anything is charged
  assert.equal(r.unavailableFor!({ imageResolution: '2K' }), null); process.env.COMFY_API_KEY = 'test-key';
  try { assert.match(String(r.unavailableFor!({ types: ['generate'], aspect: '1:1', imageResolution: '2K' })), /1K/); assert.equal(r.unavailableFor!({ types: ['generate'], aspect: '1:1', imageResolution: '1K' }), null); } finally { process.env.COMFY_API_KEY = ''; }
  ok(`Nano Banana 2 Lite: Run on = Gemini API (4 credits) or Comfy Router (${g}; 14 photos ${e}); with a Comfy key a 2K job is refused up front`); }
fs.rmSync(D, { recursive: true, force: true });
console.log('router-image-batch: all passed');
