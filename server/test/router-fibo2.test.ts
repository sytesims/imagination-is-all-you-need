// Bria FIBO 2.0 on Comfy Router (2026-10-26): one model, two Router ids.
// 1. bodies: every variant (generate in each shape at 1MP / 4MP, edit, inpaint, Structured on generate and edit) validates against the Router input schemas
//    of bria/image and bria/fibo. Router serves those schemas only with a key (GET /v2/models/bria/<m>/openapi.json answers 401), so they are written
//    out here from the docs pages that are generated from them (docs.comfy.org/development/comfy-router/models/bria/image/code and bria/fibo/code).
// 2. limits: shapes, 2K, wide shapes at 4K, 2 photos, refused before any call.
// 3. prices: Router pricing bria/image 12.0692 credits, bria/fibo 8.44 credits per image; quote = submit.
// 4. runner (fake Router, fake key): a new image posts to bria/image, an edit to bria/fibo; the result URL is saved.
// In process, mock backend, no network, no spend. Run: npx tsx test/router-fibo2.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { createRequire } from 'node:module';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'rfibo2-'));
Object.assign(process.env, { COMFY_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '', OPENHIGGSFIELD_DATA_DIR: fs.mkdtempSync(path.join(D, 'unit-')), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_COMFY_ROUTER_URL: 'http://127.0.0.1:9' });
const ok = (m: string) => console.log('ok ' + m);
const PNG = path.join(ROOT, 'samples/sample-keyframe.png');
const M = await import('../src/routing/routerModels.ts'); const { IMAGE_CAPS } = await import('../src/shared/imageCaps.ts'); const { HOSTED_BY_ID } = await import('../src/shared/pricing.ts');
const { getTool } = await import('../src/tools/registry.ts'); const { findRoute } = await import('../src/routing/routes.ts'); const { routeCredits } = await import('../src/routing/select.ts');
const { FIBO_ASPECTS } = await import('../src/shared/hostedAspects.ts'); const { GENERATE_MODELS, EDIT_MODELS, MASK_MODELS } = await import('../src/shared/imageFeatures.ts');
const { readModelOptions, FIBO_OPTIONS, fiboStructured } = await import('../src/shared/imageOptions.ts'); const { MODEL_CATALOG } = await import('../src/shared/modelCatalog.ts');
const ci = getTool('create-image')!; const S = M.ROUTER_MODELS['api-bria-fibo2'];
const body = (i: Record<string, any>) => S.body({ prompt: 'a lighthouse at dusk', seed: 7, ...i }, 0) as Promise<any>;

// ---------------- 1. bodies vs the Router input schemas ----------------
const RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '16:10', '10:16', '2:1', '1:2', '21:9', '9:21', '3:1', '1:3', '4:1', '1:4', '5:1', '1:5'];
const IMAGE_SCHEMA = { type: 'object', additionalProperties: false, properties: {
  aspect_ratio: { type: 'string', enum: RATIOS }, images: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 1 }, ip_signal: { type: 'boolean' },
  model_version: { type: 'string', enum: ['FIBO'] }, output_type: { type: 'string', enum: ['png', 'jpeg'] }, prompt: { type: 'string' }, prompt_content_moderation: { type: 'boolean' },
  resolution: { type: 'string', enum: ['1MP', '4MP'] }, seed: { type: 'integer' }, structured_prompt: { type: 'string' }, sync: { const: false },
  visual_input_content_moderation: { type: 'boolean' }, visual_output_content_moderation: { type: 'boolean' } } };
const FIBO_SCHEMA = { type: 'object', additionalProperties: false, required: ['images'], anyOf: [{ required: ['instruction'] }, { required: ['structured_instruction'] }], properties: {
  guidance_scale: { type: 'number', minimum: 3, maximum: 5 }, images: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 1 }, instruction: { type: 'string' }, ip_signal: { type: 'boolean' },
  mask: { type: 'string' }, model_version: { type: 'string' }, negative_prompt: { type: 'string' }, prompt_content_moderation: { type: 'boolean' }, seed: { type: 'integer' },
  steps_num: { type: 'integer', minimum: 20, maximum: 50 }, structured_instruction: { type: 'string' }, sync: { const: false },
  visual_input_content_moderation: { type: 'boolean' }, visual_output_content_moderation: { type: 'boolean' } } };
assert.deepEqual(FIBO_ASPECTS, RATIOS, 'our shape list = the bria/image aspect_ratio values');
const variants: [string, Record<string, any>, 'image' | 'fibo'][] = [];
for (const a of FIBO_ASPECTS) variants.push([`generate ${a} 1K`, { types: ['generate'], aspect: a, imageResolution: '1K' }, 'image']);
for (const a of FIBO_ASPECTS.slice(0, 9)) variants.push([`generate ${a} 4K`, { types: ['generate'], aspect: a, imageResolution: '4K' }, 'image']);
variants.push(['generate, no size', { types: ['generate'], aspect: '1:1' }, 'image']);
variants.push(['generate Structured', { types: ['generate'], aspect: '16:9', imageResolution: '1K', options: { structured: true, camera: 'low angle, 35 mm', lighting: 'blue hour' } }, 'image']);
variants.push(['edit 1 photo', { types: ['edit'], aspect: 'auto', aspectAuto: true, refPaths: [PNG], imagePath: PNG }, 'fibo']);
variants.push(['edit Structured', { types: ['edit'], refPaths: [PNG], options: { structured: true, subject: 'a red lighthouse', style: 'film photo' } }, 'fibo']);
variants.push(['inpaint', { types: ['inpaint'], refPaths: [PNG], maskPath: PNG }, 'fibo']);
const bodies: [string, any, 'image' | 'fibo', string][] = [];
for (const [what, i, want] of variants) { assert.equal(S.block!(i), null, `${what}: not blocked`); const rid = S.idFor!(i); assert.equal(rid, `bria/${want}`, `${what}: calls bria/${want}`); bodies.push([what, await body(i), want, rid]); }
{ const req = createRequire(import.meta.url); const Ajv = req(path.resolve(ROOT, '../node_modules/ajv/dist/2020.js')).default; const ajv = new Ajv({ strict: false, allErrors: true });
  const v = { image: ajv.compile(IMAGE_SCHEMA), fibo: ajv.compile(FIBO_SCHEMA) };
  for (const [what, b, want] of bodies) assert.ok(v[want](b), `${what}: ${JSON.stringify(v[want].errors)}`);
  assert.equal(v.image({ prompt: 'x', aspect_ratio: '7:5' }), false, 'the schema bites'); assert.equal(v.fibo({ images: ['AA'] }), false, 'an edit needs an instruction');
  ok(`schemas: ${bodies.length} body variants valid (bria/image: 21 shapes at 1MP, 9 at 4MP, Structured; bria/fibo: edit, Structured edit, mask)`); }

// ---------------- 2. what each body sends, limits ----------------
{ const g = bodies.find(([w]) => w === 'generate 21:9 1K')![1]; assert.deepEqual(g, { prompt: 'a lighthouse at dusk', aspect_ratio: '21:9', resolution: '1MP', seed: 7, output_type: 'png' });
  assert.equal(bodies.find(([w]) => w === 'generate 16:9 4K')![1].resolution, '4MP'); assert.equal(bodies.find(([w]) => w === 'generate, no size')![1].resolution, '1MP');
  const e = bodies.find(([w]) => w === 'edit 1 photo')![1]; assert.deepEqual(Object.keys(e).sort(), ['images', 'instruction', 'seed']); assert.equal(e.instruction, 'a lighthouse at dusk');
  assert.equal(e.images[0], fs.readFileSync(PNG).toString('base64'), 'plain base64, like the docs example'); assert.equal(e.aspect_ratio, undefined, 'an edit keeps the photo shape');
  const m = bodies.find(([w]) => w === 'inpaint')![1]; assert.ok(m.mask && m.images.length === 1);
  const sg = bodies.find(([w]) => w === 'generate Structured')![1]; assert.equal(sg.prompt, undefined, 'exactly one of prompt / structured_prompt'); const j = JSON.parse(sg.structured_prompt);
  assert.equal(j.short_description, 'a lighthouse at dusk', 'Subject left empty = the prompt'); assert.equal(j.photographic_characteristics.camera_angle, 'low angle, 35 mm'); assert.equal(j.lighting.conditions, 'blue hour');
  for (const k of ['short_description', 'objects', 'background_setting', 'lighting', 'aesthetics', 'photographic_characteristics', 'style_medium', 'text_render', 'context', 'artistic_style']) assert.ok(k in j, `VGL field ${k}`);
  const se = bodies.find(([w]) => w === 'edit Structured')![1]; assert.equal(se.instruction, undefined); const je = JSON.parse(se.structured_instruction);
  assert.equal(je.short_description, 'a red lighthouse'); assert.equal(je.edit_instruction, 'a lighthouse at dusk'); assert.equal(je.artistic_style, 'film photo');
  assert.equal(fiboStructured('x', { structured: false, subject: 'y' }, false), null, 'Structured off: the fields are not sent');
  assert.match(String(S.block!({ types: ['generate'], aspect: '7:5', imageResolution: '1K' })), /Aspect 7:5 isn't one of FIBO 2.0's shapes/);
  assert.match(String(S.block!({ types: ['generate'], aspect: '1:1', imageResolution: '2K' })), /Resolution 2K isn't offered by this model \(1K, 4K\)/);
  assert.match(String(S.block!({ types: ['generate'], aspect: '21:9', imageResolution: '4K' })), /runs at 1K only/);
  await assert.rejects(body({ types: ['generate'], aspect: '5:1', imageResolution: '4K' }), /runs at 1K only/);
  assert.match(String(S.block!({ types: ['edit'], refPaths: [PNG, PNG] })), /takes up to 1 reference image; you added 2/);
  ok('bodies: generate = prompt + aspect_ratio + 1MP/4MP + seed; edit = one base64 photo + instruction (+ mask); Structured sends the VGL caption instead; 7:5, 2K, wide at 4K and 2 photos refused'); }
{ const c = IMAGE_CAPS['api-bria-fibo2']; assert.deepEqual([c.aspects.length, c.resolutions, c.supports.maxRefs, c.supports.draw, c.edit?.aspects, c.options?.label], [21, ['1K', '4K'], 1, true, [], 'Structured prompt']);
  assert.ok(GENERATE_MODELS.includes('api-bria-fibo2') && EDIT_MODELS.includes('api-bria-fibo2') && MASK_MODELS.includes('api-bria-fibo2'));
  assert.equal(MODEL_CATALOG['api-bria-fibo2'].name, 'FIBO 2.0');
  const r = readModelOptions(FIBO_OPTIONS, { opt_structured: '1', opt_subject: 'a fox', opt_camera: 'x'.repeat(301) }); assert.equal(r.ok, false, 'text options are capped at 300 characters');
  const r2 = readModelOptions(FIBO_OPTIONS, { opt_structured: '1', opt_subject: 'a fox' }); assert.deepEqual(r2, { ok: true, values: { structured: true, subject: 'a fox' } });
  ok('caps: 21 shapes, 1K / 4K, one photo + Brush Edit, edits keep the photo shape, Structured prompt options (text capped at 300)'); }

// ---------------- 3. prices ----------------
const CR = 211; const c5 = (comfy: number) => Math.round((comfy / CR) * 1e5) / 1e5; const appCredits = (usd: number) => Math.ceil(Math.round(usd * 100 * 1e6) / 1e6);
const img = (o: Record<string, any>) => ({ outKind: 'image', n: 1, prompt: 'a lighthouse', aspect: '1:1', imageResolution: '1K', ...o });
{ const h = HOSTED_BY_ID['api-bria-fibo2']; assert.equal(h.usdByMode!.generate, c5(12.0692)); assert.equal(h.usdByMode!.edit, c5(8.44)); assert.equal(c5(8.44), 0.04);
  const r = findRoute('comfy-router:api-bria-fibo2')!; assert.equal((r.caps as any).routerModel, 'bria/image'); assert.equal((r.caps as any).routerEditModel, 'bria/fibo');
  const g = routeCredits(ci, r, img({})); const g4 = routeCredits(ci, r, img({ imageResolution: '4K' })); const e = routeCredits(ci, r, img({ types: ['edit'], mode: 'edit', imagePath: PNG, refPaths: [PNG] }));
  const p = routeCredits(ci, r, img({ types: ['inpaint'], mode: 'inpaint', imagePath: PNG, refPaths: [PNG] }));
  assert.equal(g, appCredits(c5(12.0692))); assert.equal(g, 6); assert.equal(g4, 6); assert.equal(e, 4); assert.equal(p, 4);
  ok(`prices: new image ${g} credits ($0.0572) at 1K and 4K, edit / Brush Edit ${e} credits ($0.04)`); }

// ---------------- 4. runner on a fake Router ----------------
{ process.env.COMFY_API_KEY = 'test-not-a-real-key'; process.env.OPENHIGGSFIELD_COMFY_ROUTER_URL = 'https://router.test';
  const RR = await import('../src/routing/routerRun.ts'); const OUT = fs.readFileSync(PNG); const posts: { url: string; body: any }[] = []; const est: string[] = [];
  const h = (m: string) => ({ request_id: 'req-1', status: 'IN_QUEUE', status_url: `https://router.test/v2/models/${m}/requests/req-1/status`, response_url: `https://router.test/v2/models/${m}/requests/req-1`, cancel_url: `https://router.test/v2/models/${m}/requests/req-1/cancel` });
  const J = (x: unknown, extra: Record<string, string> = {}) => new Response(JSON.stringify(x), { status: 200, headers: { 'content-type': 'application/json', ...extra } });
  let price = '0.04';
  RR.setRouterFetch((async (u: any, init: any = {}) => { const url = String(u); const m = url.match(/models\/(bria\/[a-z]+)/)?.[1] ?? 'x';
    if (url.endsWith('/estimate')) { est.push(m); return J({ source: 'exact', amount: price }); }
    if (init.method === 'POST') { posts.push({ url, body: JSON.parse(init.body) }); return new Response(JSON.stringify(h(m)), { status: 201, headers: { 'content-type': 'application/json' } }); }
    if (url.endsWith('/status')) return J({ ...h(m), status: 'COMPLETED' });
    if (url.endsWith('/requests/req-1')) return J({ request_id: 'b1', status: 'COMPLETED', result: { image_url: 'https://cdn.test/fibo.png', seed: 7, structured_prompt: '{}' } }, { 'x-comfy-credits-used': m === 'bria/fibo' ? '8.44' : '12.0692' });
    return new Response(OUT, { status: 200, headers: { 'content-type': 'image/png' } }); }) as any, async () => {});
  const r = findRoute('comfy-router:api-bria-fibo2')!;
  const edit: any = { id: 'fe1', toolId: 'create-image', provider: 'api-bria-fibo2', status: 'running', input: { types: ['edit'], refPaths: [PNG], imagePath: PNG, prompt: 'make it night', n: 1 }, outputs: [], cost: 4, routing: { prices: { [r.routeId]: 4 } } };
  await RR.runRouter(edit, r, { n: 1 } as any, 60_000);
  assert.equal(edit.status, 'done', edit.error); assert.equal(posts.length, 1); assert.match(posts[0].url, /\/v2\/models\/bria\/fibo\/requests/); assert.deepEqual(est, ['bria/fibo']); assert.equal(posts[0].body.instruction, 'make it night');
  assert.equal(edit.outputs.length, 1); assert.equal((edit as any).routerRequest.model, 'bria/fibo');
  price = '0.0572'; posts.length = 0; est.length = 0;
  const gen: any = { id: 'fg1', toolId: 'create-image', provider: 'api-bria-fibo2', status: 'running', input: { types: ['generate'], prompt: 'a lighthouse', aspect: '16:9', imageResolution: '1K', n: 1 }, outputs: [], cost: 6, routing: { prices: { [r.routeId]: 6 } } };
  await RR.runRouter(gen, r, { n: 1 } as any, 60_000);
  assert.equal(gen.status, 'done', gen.error); assert.match(posts[0].url, /\/v2\/models\/bria\/image\/requests/); assert.deepEqual(est, ['bria/image']); assert.equal(posts[0].body.aspect_ratio, '16:9');
  assert.deepEqual(S.outputs({ status: 'ERROR', error: { code: 422, message: 'moderation' } }), { refused: 'moderation' });
  RR.setRouterFetch(null); process.env.COMFY_API_KEY = '';
  ok('runner: an edit posts to bria/fibo (estimate $0.04 within the ✦4 quote), a new image to bria/image; result saved; Bria ERROR = refused'); }
fs.rmSync(D, { recursive: true, force: true });
console.log('PASS router-fibo2');
