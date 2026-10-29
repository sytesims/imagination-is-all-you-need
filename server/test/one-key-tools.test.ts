// One key runs everything (2026-10-27): the photo and clip tools that ran on fal only get Comfy Router places (routing/routerModels.ts,
// tools/imageFalApps.ts, tools/editVideo/index.ts). FAKE fetches only (no network, no real key, no spend).
//  1 bodies: every Router body only uses fields its schema declares (docs.comfy.org/development/comfy-router/models/<id>/code), required fields are there,
//    sync is never sent, images go as plain base64, the clip goes as a link (Bria video) or inline base64 (Ray 3.2)
//  2 routes: each card lists Comfy Router first, then fal; Virtual Try-On has a Comfy card; Photo Looks stays on fal (no Comfy option)
//  3 prices: rows from the Router pricing page; the REAL quote endpoint = the charge, on the Comfy place
// Run: npx tsx test/one-key-tools.test.ts
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'onekey-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0' });
for (const k of ['COMFY_API_KEY', 'OPENHIGGSFIELD_FAL_KEY', 'FAL_KEY', 'OPENHIGGSFIELD_PUBLIC_BASE_URL']) delete process.env[k];
globalThis.fetch = (async (u: unknown) => { throw new Error(`network blocked in this test: ${String(u).slice(0, 80)}`); }) as typeof fetch;
const ok = (m: string) => console.log('ok ' + m);
const ff = (args: string[]) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args]);
const PIC = path.join(D, 'p.png'); ff(['-f', 'lavfi', '-i', 'testsrc=size=640x480', '-frames:v', '1', PIC]);
const MASK = path.join(D, 'm.png'); ff(['-f', 'lavfi', '-i', 'color=white:size=640x480', '-frames:v', '1', MASK]);
const CLIP = path.join(D, 'c.mp4'); ff(['-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=24', '-t', '5', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', CLIP]);
const { ROUTER_MODELS } = await import('../src/routing/routerModels.ts');
const { setClipUploader } = await import('../src/routing/renderUpload.ts');
const { getTool } = await import('../src/tools/registry.ts');
const { routesFor, findRoute } = await import('../src/routing/routes.ts');
const { HOSTED_BY_ID } = await import('../src/shared/hostedPrices.ts');
const { REMOVE_BG_MODELS, EXPAND_MODELS, ERASE_MODELS, TRYON_MODELS } = await import('../src/shared/imageFeatures.ts');

try {
  // ---- 1. bodies vs schemas ----
  type S = { keys: string[]; required: string[]; b64: string[] };
  const SCHEMA: Record<string, S> = {
    'fal-bria-rmbg': { keys: ['image', 'preserve_alpha', 'visual_input_content_moderation', 'visual_output_content_moderation'], required: ['image'], b64: ['image'] },
    'fal-bria-expand': { keys: ['aspect_ratio', 'canvas_size', 'image', 'negative_prompt', 'original_image_location', 'original_image_size', 'preserve_alpha', 'prompt', 'prompt_content_moderation', 'seed', 'visual_input_content_moderation', 'visual_output_content_moderation'], required: ['image'], b64: ['image'] },
    'fal-bria-eraser': { keys: ['image', 'mask', 'mask_type', 'preserve_alpha', 'visual_input_content_moderation', 'visual_output_content_moderation'], required: ['image', 'mask'], b64: ['image', 'mask'] },
    'router-bria-tryon': { keys: ['aspect_ratio', 'garment_images', 'instruction', 'output_type', 'person_image', 'seed', 'visual_output_content_moderation'], required: ['person_image', 'garment_images'], b64: ['person_image'] },
    'comfy-birefnet-video': { keys: ['background_color', 'output_container_and_codec', 'preserve_audio', 'video'], required: ['video'], b64: [] },
    'direct-luma-reframe': { keys: ['aspect_ratio', 'image_ref', 'model', 'output_format', 'prompt', 'source', 'style', 'type', 'video'], required: ['prompt'], b64: [] },
  };
  const IN: Record<string, any> = {
    'fal-bria-rmbg': { types: ['edit'], imagePath: PIC, refPaths: [PIC] },
    'fal-bria-expand': { types: ['edit'], imagePath: PIC, refPaths: [PIC], appPrompt: 'a sunny beach!', seed: 3, expand: { canvas: [1280, 960], original: [640, 480], location: [320, 240] } },
    'fal-bria-eraser': { types: ['inpaint'], imagePath: PIC, refPaths: [PIC], maskPath: MASK },
    'router-bria-tryon': { types: ['edit'], imagePath: PIC, refPaths: [PIC, PIC] },
    'comfy-birefnet-video': { videoPath: CLIP, types: ['transparent'], duration: 5 },
    'direct-luma-reframe': { videoPath: CLIP, types: ['9:16'], duration: 5, fields: { quality: 'fast' } },
  };
  setClipUploader(async () => 'https://storage.test/clip.mp4');
  for (const [id, s] of Object.entries(SCHEMA)) { const spec = ROUTER_MODELS[id]; assert.ok(spec, id); assert.equal(spec.block?.(IN[id]) ?? null, null, `${id} takes the job`);
    const body: Record<string, any> = await spec.body(IN[id], 0);
    for (const k of Object.keys(body)) assert.ok(s.keys.includes(k), `${id}: field ${k} is not in the ${spec.id} schema`); for (const k of s.required) assert.ok(body[k] != null, `${id}: required ${k}`);
    assert.ok(!('sync' in body), 'sync never sent'); for (const k of s.b64) assert.match(String(body[k]), /^[A-Za-z0-9+/]{1000}/, `${id}: ${k} plain base64`); }
  { const v: any = await ROUTER_MODELS['comfy-birefnet-video'].body(IN['comfy-birefnet-video'], 0); assert.deepEqual(v, { video: 'https://storage.test/clip.mp4', background_color: 'Transparent', preserve_audio: true, output_container_and_codec: 'webm_vp9' });
    const g: any = await ROUTER_MODELS['comfy-birefnet-video'].body({ ...IN['comfy-birefnet-video'], types: ['green'] }, 0); assert.equal(g.output_container_and_codec, 'mp4_h264');
    const r: any = await ROUTER_MODELS['direct-luma-reframe'].body(IN['direct-luma-reframe'], 0); assert.equal(r.type, 'video_reframe'); assert.equal(r.aspect_ratio, '9:16'); assert.deepEqual(r.video, { resolution: '540p' }); assert.equal(r.source.media_type, 'video/mp4');
    const e: any = await ROUTER_MODELS['fal-bria-expand'].body(IN['fal-bria-expand'], 0); assert.equal(e.prompt, 'a sunny beach'); assert.deepEqual(e.canvas_size, [1280, 960]);
    assert.match(String(ROUTER_MODELS['direct-luma-reframe'].block!({ duration: 12 })), /up to 10 s/); assert.match(String(ROUTER_MODELS['direct-luma-reframe'].block!({ duration: 5, types: ['9:21'] })), /16:9/);
    assert.match(String(ROUTER_MODELS['comfy-birefnet-video'].block!({ duration: 61 })), /60 s/); assert.match(String(ROUTER_MODELS['router-bria-tryon'].block!({ types: ['edit'], refPaths: [PIC] })), /clothing photo/);
    assert.deepEqual(ROUTER_MODELS['comfy-birefnet-video'].outputs({ status: 'COMPLETED', result: { video_url: 'https://x/v.webm' } }), [{ url: 'https://x/v.webm' }]);
    assert.ok('refused' in (ROUTER_MODELS['fal-bria-rmbg'].outputs({ status: 'ERROR', error: { message: 'moderated' } }) as any)); }
  ok('bodies: every field is in its Router schema; sync never sent; images plain base64; the Bria clip as a link, Ray 3.2 inline');

  // ---- 2. routes ----
  { const first = (id: string, tool: string) => routesFor(id, getTool(tool) ?? tool).map((r) => r.routeId);
    assert.deepEqual(first('fal-bria-rmbg', 'app-remove-bg'), ['direct:fal-bria-rmbg', 'comfy-router:fal-bria-rmbg', 'fal:fal-ai/bria/background/remove']);
    assert.deepEqual(first('fal-bria-expand', 'app-expand').slice(1), ['comfy-router:fal-bria-expand', 'fal:fal-ai/bria/expand']);
    assert.deepEqual(first('fal-bria-eraser', 'app-erase').slice(1), ['comfy-router:fal-bria-eraser', 'fal:fal-ai/bria/eraser']);
    assert.deepEqual(first('router-bria-tryon', 'app-try-on'), ['comfy-router:router-bria-tryon']);
    assert.deepEqual(first('comfy-birefnet-video', 'remove-bg'), ['local:comfy-birefnet-video', 'comfy-router:comfy-birefnet-video', 'fal:bria/video/background-removal']);
    assert.deepEqual(first('auto-reframe', 'reframe').slice(1, 2), ['comfy-router:auto-reframe']);
    for (const l of [REMOVE_BG_MODELS, EXPAND_MODELS, ERASE_MODELS]) assert.ok(l[0].startsWith('fal-bria'), 'the Bria card (with its Comfy place) stays first');
    assert.ok(TRYON_MODELS.includes('router-bria-tryon'));
    ok('routes: Comfy Router before fal on the Bria cards, Remove Background (video) and Reframe; Bria Virtual Try-On is a Comfy card'); }

  // ---- 3. prices: quote endpoint = charge ----
  const { routeCredits, routeInput } = await import('../src/routing/select.ts');
  const Fastify = (await import('fastify')).default; const app = Fastify(); (await import('../src/routesBatch1.ts')).registerBatch1(app); (await import('../src/routing/http.ts')).registerRouting(app); await app.ready();
  const seen: Record<string, string> = {};
  const quote = async (tool: string, q: Record<string, string>, route: string, expectCredits: number) => {
    const r = await app.inject({ url: `/api/tools/${tool}/price?${new URLSearchParams(q)}` }); assert.equal(r.statusCode, 200, r.body.slice(0, 300)); const b = r.json();
    assert.equal(b.route, route, `${tool}: ${JSON.stringify(b).slice(0, 300)}`); const quoted = b.listCredits ?? b.credits; assert.equal(quoted, expectCredits, `${tool} ${JSON.stringify(q)}: ${quoted} credits`);
    const charge = routeCredits(getTool(tool)!, findRoute(route)!, routeInput(getTool(tool)!, { ...q, duration: Number(q.duration) || undefined, resolution: q.quality ?? q.resolution, types: q.types ? JSON.parse(q.types) : undefined, fields: q.quality ? { quality: q.quality } : undefined }));
    assert.equal(charge, quoted, `${tool}: quote ${quoted} = charge ${charge}`); seen[`${tool} ${q.quality ?? ''}`] = `$${(quoted / 100).toFixed(2)}`; };
  await quote('app-remove-bg', { provider: 'fal-bria-rmbg', types: '["edit"]', image: '1' }, 'comfy-router:fal-bria-rmbg', 2);
  await quote('app-expand', { provider: 'fal-bria-expand', types: '["edit"]', image: '1' }, 'comfy-router:fal-bria-expand', 3);
  await quote('app-erase', { provider: 'fal-bria-eraser', types: '["inpaint"]', image: '1' }, 'comfy-router:fal-bria-eraser', 3);
  await quote('app-try-on', { provider: 'router-bria-tryon', types: '["edit"]', image: '1' }, 'comfy-router:router-bria-tryon', 6);
  await quote('remove-bg', { provider: 'comfy-birefnet-video', runOn: 'comfy-cloud', types: '["transparent"]', duration: '5' }, 'comfy-router:comfy-birefnet-video', 25);
  await quote('reframe', { provider: 'auto-reframe', types: '["9:16"]', duration: '5', quality: 'high' }, 'comfy-router:auto-reframe', 60);
  await quote('reframe', { provider: 'auto-reframe', types: '["9:16"]', duration: '5', quality: 'fast' }, 'comfy-router:auto-reframe', 30);
  assert.equal(HOSTED_BY_ID['comfy-router:fal-bria-rmbg'].usd, 0.018); assert.equal(HOSTED_BY_ID['router-bria-tryon'].usd, 0.0572);
  await app.close(); ok(`quote endpoint = charge on the Comfy place: ${JSON.stringify(seen)}`);
} finally { setClipUploader(null); fs.rmSync(D, { recursive: true, force: true }); }
console.log('one-key-tools: all ok');
