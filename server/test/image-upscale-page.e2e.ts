// Upscale (2026-10-22): the image-upscale API that Create Image's Upscale workflow relies on (the old /tools/image-upscale page now redirects there).
//  - /api/tools exposes both models (Real-ESRGAN ×2/×4/×8, 4x-UltraSharp ×4) with their modes, the workflow file per factor
//    (tool.app.imageUpscale) and no fake controls (no sharpen / denoise / face / refining stage);
//  - the quote takes scale= (was 400 invalid_scale) and names the workflow that really runs; unsupported factors and the 8192 px cap → 400;
//  - submit takes scale= too, the job records the workflow, the cap is enforced (was mock-only), the old types=["x2"] form still works.
// Run: PATH=/opt/homebrew/bin:$PATH npx tsx test/image-upscale-page.e2e.ts   (own mock server :9183, temp data dir, no keys, no network)
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { imageUpscaleWorkflow, upscaleBlock, upscaleScaleOf, UPSCALE_MAX_SIDE, UPSCALE_ORDER, UPSCALE_MODELS, UPSCALE_WORKFLOWS, UPSCALE_WORKFLOW_FILES, UPSCALE_FACTORS_BY_PROVIDER, zimageWorkingMegapixels, upscaleOutMegapixels } from '../src/shared/imageUpscale.js';
import { priceOf } from '../src/shared/pricing.js';
const ROOT = path.resolve(import.meta.dirname, '..');
const ok = (m: string) => console.log('ok ' + m);

// ---------------- pure rules ----------------
assert.equal(imageUpscaleWorkflow('comfy-realesrgan', 2), 'image-upscale-x2-api.json');
assert.equal(imageUpscaleWorkflow('comfy-realesrgan', 8), 'image-upscale-x8-api.json');
assert.equal(imageUpscaleWorkflow('comfy-ultrasharp', 4), 'image-upscale-ultrasharp-x4-api.json');
assert.equal(imageUpscaleWorkflow('comfy-ultrasharp', 2), null);
assert.equal(upscaleScaleOf({ scale: '4' }), 4); assert.equal(upscaleScaleOf({ scale: 'x8' }), 8); assert.equal(upscaleScaleOf({ types: '["x2"]' }), 2); assert.equal(upscaleScaleOf({ mode: 'x4' }), 4); assert.equal(upscaleScaleOf({}), null);
assert.equal(upscaleBlock('comfy-realesrgan', 8, { width: 1024, height: 1024 }), null, '1024 × 8 = 8192: exactly at the cap is fine');
assert.equal(upscaleBlock('comfy-realesrgan', 8, { width: 1025, height: 1024 })?.code, 'output_too_large');
assert.equal(upscaleBlock('comfy-realesrgan', 16)?.code, 'unsupported_scale'); assert.equal(UPSCALE_MAX_SIDE, 8192);
ok('workflow per model and factor, scale parsing, 8192 px cap rule');

// ---------------- new models (2026-10-22): table, graphs, prices, request bodies ----------------
assert.deepEqual(UPSCALE_ORDER, ['router-seedvr2-upscale', 'cloud-topaz-bloom2' /* Comfy Cloud partner node (2026-10-27) */, 'api-crystal-upscale', 'fal-topaz-wonder', 'fal-topaz-bloom', 'fal-topaz-precision', 'fal-seedvr2-upscale', 'fal-bria-upscale', 'comfy-seedvr2-image', 'comfy-zimage-upscale', 'comfy-nomos2', 'comfy-realesrgan', 'comfy-ultrasharp']);
{ const places = UPSCALE_ORDER.map((p) => UPSCALE_MODELS[p].place).join(','); assert.match(places, /^(comfy,)+(api,)+(gpu,?)+$/, places); // Comfy → other API → Local
  for (const p of UPSCALE_ORDER) { const m = UPSCALE_MODELS[p]; assert.ok(m && m.blurb && m.price && ['Best detail', 'Fast', 'Classic'].includes(m.label), p); assert.ok(UPSCALE_FACTORS_BY_PROVIDER[p]?.length, p); }
  assert.deepEqual(UPSCALE_ORDER.filter((p) => UPSCALE_MODELS[p].label === 'Classic'), ['comfy-realesrgan', 'comfy-ultrasharp']); }
assert.equal(imageUpscaleWorkflow('comfy-seedvr2-image', 4), 'image-upscale-seedvr2-3b-api.json'); assert.equal(imageUpscaleWorkflow('comfy-nomos2', 2), 'image-upscale-nomos2-x2-api.json');
assert.equal(imageUpscaleWorkflow('comfy-zimage-upscale', 2), 'image-upscale-zimage-2k-api.json'); assert.equal(imageUpscaleWorkflow('fal-topaz-wonder', 4), null, 'hosted: no local graph');
assert.equal(upscaleBlock('comfy-zimage-upscale', 2, { width: 1024, height: 1024 }), null); assert.equal(upscaleBlock('comfy-zimage-upscale', 4, { width: 1024, height: 1024 })?.code, 'output_too_large', 'Z-Image 2K: 2048 px cap');
assert.equal(upscaleBlock('comfy-seedvr2-image', 4, { width: 1025, height: 800 })?.code, 'output_too_large', 'SeedVR2 3B local: 2048 px cap');
assert.equal(zimageWorkingMegapixels({ width: 384, height: 384 }, 4), 0.5898); assert.equal(zimageWorkingMegapixels({ width: 1024, height: 1024 }, 2), 1.0486);
{ // every local graph: node wiring and the model files it loads (core nodes; LoadImage "1", SaveImage "8"); class names checked against ComfyUI 0.42.4 /object_info
  const wf = (f: string) => JSON.parse(fs.readFileSync(path.resolve(ROOT, '../workflows', f), 'utf8'));
  const CORE = new Set(['LoadImage', 'SaveImage', 'UpscaleModelLoader', 'ImageUpscaleWithModel', 'ImageScaleBy', 'ImageBlur', 'ImageSharpen', 'JoinImageWithAlpha', 'ResizeImageMaskNode', 'SeedVR2Preprocess', 'VAELoader', 'UNETLoader',
    'VAEEncodeTiled', 'SeedVR2Conditioning', 'KSampler', 'VAEDecodeTiled', 'SeedVR2PostProcessing', 'ImageScaleToTotalPixels', 'ModelSamplingAuraFlow', 'CLIPLoader', 'CLIPTextEncode', 'VAEEncode', 'VAEDecode']);
  for (const [prov, byF] of Object.entries(UPSCALE_WORKFLOWS)) for (const f of new Set(Object.values(byF))) { const g = wf(f);
    assert.equal(g['1'].class_type, 'LoadImage', f); assert.equal(g['8'].class_type, 'SaveImage', f);
    for (const [id, n] of Object.entries<any>(g)) { assert.ok(CORE.has(n.class_type), `${f} ${id}: ${n.class_type}`); for (const v of Object.values<any>(n.inputs)) if (Array.isArray(v)) assert.ok(g[v[0]], `${f} ${id}: link to missing ${v[0]}`); }
    const files = Object.values<any>(g).flatMap((n) => Object.values<any>(n.inputs)).filter((v) => typeof v === 'string' && /\.(pth|safetensors)$/.test(v)).sort();
    assert.deepEqual([...new Set(files)], [...UPSCALE_WORKFLOW_FILES[f]].sort(), `${prov} ${f}: model files`); }
  const sv = wf('image-upscale-seedvr2-3b-api.json'); assert.equal(sv['14'].inputs.unet_name, 'seedvr2_3b_fp16.safetensors'); assert.equal(sv['13'].inputs.vae_name, 'seedvr2_ema_vae_fp16.safetensors');
  assert.equal(sv['15'].class_type, 'VAEEncodeTiled'); assert.equal(sv['18'].class_type, 'VAEDecodeTiled'); assert.equal(sv['17'].inputs.steps, 1); assert.deepEqual(sv['16'].inputs, { model: ['14', 0], vae_conditioning: ['15', 0] });
  assert.deepEqual(sv['19'].inputs.original_resized_images, ['11', 0]); assert.equal(sv['11'].inputs.resize_type, 'scale by multiplier');
  const z = wf('image-upscale-zimage-2k-api.json'); assert.equal(z['24'].inputs.unet_name, 'z_image_turbo_bf16.safetensors'); assert.equal(z['31'].inputs.denoise, 0.33); assert.equal(z['31'].inputs.steps, 5); assert.equal(z['23'].inputs.scale_by, 0.5);
  const n4 = wf('image-upscale-nomos2-x4-api.json'); assert.deepEqual(n4['8'].inputs.images, ['4', 0], 'Nomos2 x4: no blur / sharpen'); const n2 = wf('image-upscale-nomos2-x2-api.json'); assert.equal(n2['5'].inputs.scale_by, 0.5);
  // the plan patches the factor (SeedVR2) and the working size (Z-Image) per job
  const { buildPlan } = await import('../src/comfy/plans.js');
  const ps = buildPlan({ id: 'x', toolId: 'image-upscale', provider: 'comfy-seedvr2-image', input: { imagePath: '/tmp/a.png', scale: 2, seed: 7 } }).passes[0];
  assert.equal(ps.workflow, 'image-upscale-seedvr2-3b-api.json'); assert.equal(ps.graph['11'].inputs['resize_type.multiplier'], 2); assert.equal(ps.graph['17'].inputs.seed, 7);
  const pz = buildPlan({ id: 'x', toolId: 'image-upscale', provider: 'comfy-zimage-upscale', input: { imagePath: '/tmp/a.png', scale: 4, sourceSize: { width: 384, height: 384 } } }).passes[0];
  assert.equal(pz.graph['20'].inputs.megapixels, 0.5898); assert.equal(pz.output, '8');
  assert.equal(buildPlan({ id: 'x', toolId: 'image-upscale', provider: 'comfy-nomos2', input: { imagePath: '/tmp/a.png', scale: 2 } }).passes[0].workflow, 'image-upscale-nomos2-x2-api.json'); }
ok('new local graphs: core nodes only, wiring, model files per workflow, the plan sets the factor / working size');
{ // prices: per output MP (fal SeedVR2, Crystal), per started block (Topaz), per image (Router SeedVR2); quote = charge uses the same priceOf
  await import('../src/tools/imageUpscaleModels.js');
  const c = (provider: string, mp: number) => priceOf({ provider, outMegapixels: mp, quality: 'source' } as any).credits;
  assert.equal(c('router-seedvr2-upscale', 16.8), 1, '$0.01 per image');
  assert.equal(c('fal:topaz/upscale/image/generative', 16.78), 24, '4096² = 16.8 MP = 3 started 8 MP blocks x $0.08');
  assert.equal(c('fal:topaz/upscale/image/generative', 8), 8); assert.equal(c('fal:topaz/upscale/image/precision', 16.78), 8, 'one started 24 MP block');
  assert.equal(c('fal:clarityai/crystal-upscaler', 16.78), 27, '$0.016 x 16.78 MP = $0.268, rounded up');
  assert.equal(c('fal:topaz/upscale/image/creative', 16.78), 72, 'Bloom 2: 16.78 MP = 9 started 2 MP blocks x $0.08'); assert.equal(c('fal:topaz/upscale/image/creative', 4.19), 24, '2048² = 3 started 2 MP blocks');
  assert.equal(c('fal:bria/increase-resolution', 16.78), 4, 'Bria Increase Resolution: $0.04 per image, any size');
  assert.equal(c('fal:fal-ai/seedvr/upscale/image', 16.78), 2, '$0.001 x 16.78 MP, rounded up to whole credits'); assert.equal(c('fal:fal-ai/seedvr/upscale/image', 2.36), 1, '1-credit minimum');
  // D1 (user, 2026-10-28): no published Router price → runs on an estimate (the partner node's $0.0229 per output MP)
  { const cr = priceOf({ provider: 'api-crystal-upscale', outMegapixels: 4 } as any); assert.equal(cr.basis, 'hosted', 'Crystal on Comfy Router: runs on an estimate'); assert.equal(cr.credits, 10, '$0.0229 x 4 MP = $0.092, rounded up'); }
  assert.equal(upscaleOutMegapixels({ outputSize: { width: 1536, height: 1536 } }), 2.359296); assert.equal(upscaleOutMegapixels({ types: ['x4'] }), 16.777216, 'no size: 1024² source assumed'); }
{ // request bodies against the published schemas (fal API tabs / Comfy Router model pages, 2026-10-22); nothing is sent
  const { FAL_UPSCALE_BODIES } = await import('../src/tools/imageUpscaleModels.js'); const { ROUTER_MODELS, seedvr2Tier } = await import('../src/routing/routerModels.js');
  const img = path.join(ROOT, 'samples/sample-keyframe.png'); const i = { imagePath: img, scale: 4, types: ['x4'], sourceSize: { width: 1280, height: 720 }, seed: 5 };
  const keys = (o: object) => Object.keys(o).sort();
  const w = await FAL_UPSCALE_BODIES.wonder(i); assert.deepEqual(keys(w), ['image_url', 'model', 'output_format', 'upscale_factor']); assert.equal(w.model, 'Wonder 3.5'); assert.equal(w.upscale_factor, 4); assert.match(w.image_url, /^data:image\/png;base64,/);
  const pr = await FAL_UPSCALE_BODIES.precision(i); assert.equal(pr.model, 'Standard V2'); assert.equal(pr.output_format, 'png');
  const cr = await FAL_UPSCALE_BODIES.crystal(i); assert.deepEqual(keys(cr), ['image_url', 'output_format', 'scale_factor']); assert.equal(cr.scale_factor, 4);
  // topaz/upscale/image/creative and bria/increase-resolution schemas (fal OpenAPI, read 2026-10-22)
  const bl = await FAL_UPSCALE_BODIES.bloom(i); assert.deepEqual(keys(bl), ['image_url', 'model', 'output_format', 'upscale_factor']); assert.equal(bl.model, 'Bloom 2'); assert.equal(bl.upscale_factor, 4);
  assert.ok(['Bloom 2', 'Bloom', 'Bloom Realism'].includes(bl.model) && ['jpeg', 'png'].includes(bl.output_format));
  const br = await FAL_UPSCALE_BODIES.bria(i); assert.deepEqual(keys(br), ['desired_increase', 'image_url', 'output_type']); assert.equal(br.desired_increase, 4); assert.equal((await FAL_UPSCALE_BODIES.bria({ ...i, scale: 2, types: ['x2'] })).desired_increase, 2);
  const sv = await FAL_UPSCALE_BODIES.seedvr2(i); assert.deepEqual(keys(sv), ['image_url', 'output_format', 'seed', 'upscale_factor', 'upscale_mode']); assert.equal(sv.upscale_mode, 'factor');
  const rs = ROUTER_MODELS['router-seedvr2-upscale']; assert.equal(rs.id, 'wavespeed/seedvr2'); assert.deepEqual(rs.tools, ['image-upscale']);
  const rb: any = await rs.body(i, 0); assert.deepEqual(keys(rb), ['enable_base64_output', 'image', 'output_format', 'target_resolution']); assert.equal(rb.target_resolution, '8k', '1280 x 4 = 5120 px → 8K tier');
  assert.equal(seedvr2Tier({ scale: 2, sourceSize: { width: 1024, height: 1024 } }), '2k'); assert.equal(seedvr2Tier({ scale: 4, sourceSize: { width: 1024, height: 768 } }), '4k');
  assert.deepEqual(rs.outputs({ code: 200, data: { status: 'completed', outputs: ['https://x/y.png'] } }), [{ url: 'https://x/y.png' }]);
  const rc: any = await ROUTER_MODELS['api-crystal-upscale'].body(i, 0); assert.deepEqual(keys(rc), ['image_url', 'output_format', 'scale_factor']); assert.equal(ROUTER_MODELS['api-crystal-upscale'].id, 'fal/crystal-upscaler'); }
ok('prices per model (per image, per MP, per started block) and request bodies match the published schemas');

// Examples popup (web): five real runs, every referenced file shipped, each web-sized, all together small
{ const { UPSCALE_EXAMPLES, UPSCALE_EXAMPLES_DIR } = await import('../../web/src/tools/imageApps/upscaleExamplesData.ts');
  assert.equal(UPSCALE_EXAMPLES.length, 5); let total = 0;
  for (const e of UPSCALE_EXAMPLES) for (const f of [e.source, e.sourceCrop, e.runs.realesrgan.full, e.runs.realesrgan.crop, e.runs.ultrasharp.full, e.runs.ultrasharp.crop]) {
    const p = path.resolve(ROOT, '../web/public', UPSCALE_EXAMPLES_DIR.replace(/^\//, ''), f); assert.ok(fs.existsSync(p), f); const b = fs.statSync(p).size; assert.ok(b <= 300_000, `${f}: ${b} B`); total += b; }
  for (const e of UPSCALE_EXAMPLES) for (const r of Object.values(e.runs) as any[]) assert.ok(r.seconds > 0 && r.bytes > 0, `${e.id}: measured time and size`);
  assert.ok(total <= 4_400_000, `examples total ${total} B`); }
ok('upscale examples: 5 real runs, files present and web-sized');

// ---------------- API ----------------
const PORT = testPort(9183); const B = `http://localhost:${PORT}`; const D = fs.mkdtempSync(path.join(os.tmpdir(), 'imgup-'));
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_BILLING_MODE: '' };
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PATH: `/opt/homebrew/bin:${process.env.PATH}`, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'none.env'),
  OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_ROUTING_LIVE: '', OPENHIGGSFIELD_MOCK_DELAY_MS: '100', OPENHIGGSFIELD_HOSTED: '' }, stdio: 'ignore', detached: true });
const get = async (u: string) => { const r = await fetch(B + u); return { status: r.status, body: await r.json().catch(() => null) as any }; };
const PNG = fs.readFileSync(path.join(ROOT, 'samples/sample-keyframe.png')); // 1280×720
const job = async (f: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v); fd.append('image', new Blob([PNG], { type: 'image/png' }), 'src.png');
  const r = await fetch(`${B}/api/tools/image-upscale/jobs`, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() as any }; };
const until = async (id: string) => { for (let i = 0; i < 300; i++) { const j = (await get(`/api/jobs/${id}`)).body; if (['done', 'failed', 'blocked', 'canceled'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 100)); } throw new Error('timeout'); };
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  const tools = (await get('/api/tools')).body as any[]; const t = tools.find((x) => x.id === 'image-upscale');
  assert.equal(t.route, '/tools/image-upscale');
  const prov = Object.fromEntries(t.providers.map((p: any) => [p.id, p]));
  assert.deepEqual(prov['comfy-realesrgan'].modes, ['x2', 'x4', 'x8']); assert.deepEqual(prov['comfy-ultrasharp'].modes, ['x4']);
  assert.deepEqual(t.providers.map((p: any) => p.id), UPSCALE_ORDER, 'menu order'); assert.deepEqual(prov['comfy-seedvr2-image'].modes, ['x2', 'x4']);
  assert.ok(prov['fal-topaz-wonder'].routes.some((r: any) => r.routeId === 'fal:topaz/upscale/image/generative')); assert.ok(prov['router-seedvr2-upscale'].routes.some((r: any) => r.routeId === 'comfy-router:router-seedvr2-upscale'));
  assert.equal(prov['comfy-seedvr2-image'].workflow?.source, 'official'); assert.match(prov['comfy-seedvr2-image'].workflow?.url ?? '', /utility_seedvr2_3b_int8_upscale_image/);
  assert.ok(prov['comfy-ultrasharp'].routes?.some((r: any) => r.routeId === 'local:comfy-ultrasharp'), 'UltraSharp has its local route');
  const iu = t.app.imageUpscale; assert.equal(iu.maxSide, 8192); assert.deepEqual(iu.factors, [2, 4, 8, 16]);
  assert.deepEqual(iu.factorsByProvider, UPSCALE_FACTORS_BY_PROVIDER); assert.equal(iu.maxSideByProvider['comfy-zimage-upscale'], 2048); assert.equal(iu.models['comfy-nomos2'].label, 'Fast');
  assert.equal(iu.workflows['comfy-seedvr2-image']['4'], 'image-upscale-seedvr2-3b-api.json'); assert.deepEqual(iu.modelFiles['image-upscale-seedvr2-3b-api.json'], ['seedvr2_3b_fp16.safetensors', 'seedvr2_ema_vae_fp16.safetensors']);
  assert.equal(iu.workflows['comfy-realesrgan']['2'], 'image-upscale-x2-api.json'); assert.equal(iu.workflows['comfy-ultrasharp']['4'], 'image-upscale-ultrasharp-x4-api.json');
  assert.deepEqual(iu.modelFiles['image-upscale-x8-api.json'], ['RealESRGAN_x4plus.pth', 'RealESRGAN_x2plus.pth']);
  for (const f of ['sharpen', 'denoise', 'face']) assert.ok(!t.inputs.some((i: any) => i.name === f), `no ${f} input`);
  assert.ok(!JSON.stringify(t.stages).includes('denoise'), 'no "Sharpen / denoise / faces" stage');
  assert.deepEqual(t.allowed.scale, ['2', '4', '8']);
  const models = (await get('/api/models?toolId=image-upscale')).body.groups.flatMap((g: any) => g.models).map((m: any) => m.id);
  assert.ok(['comfy-realesrgan', 'comfy-ultrasharp', 'comfy-seedvr2-image', 'comfy-nomos2', 'fal-topaz-wonder'].every((x) => models.includes(x)), models.join(','));
  ok('/api/tools: Real-ESRGAN (×2/×4/×8) and 4x-UltraSharp (×4) exposed, workflow per factor, no fake controls, scale allowlisted');

  // quote
  const q4 = await get('/api/tools/image-upscale/price?scale=4&provider=comfy-realesrgan'); assert.equal(q4.status, 200, JSON.stringify(q4.body));
  assert.equal(q4.body.scale, 4); assert.equal(q4.body.workflow, 'image-upscale-x4-api.json'); assert.equal(typeof q4.body.credits, 'number');
  const q2 = await get('/api/tools/image-upscale/price?scale=2&provider=comfy-realesrgan'); assert.equal(q2.status, 200); assert.equal(q2.body.workflow, 'image-upscale-x2-api.json', 'the x2 file, not always the x4 one');
  for (const [pv, k, wfile] of [['comfy-seedvr2-image', 4, 'image-upscale-seedvr2-3b-api.json'], ['comfy-nomos2', 2, 'image-upscale-nomos2-x2-api.json'], ['comfy-zimage-upscale', 2, 'image-upscale-zimage-2k-api.json'], ['fal-topaz-wonder', 4, null]] as const) {
    const q = await get(`/api/tools/image-upscale/price?scale=${k}&provider=${pv}`); assert.equal(q.status, 200, `${pv}: ${JSON.stringify(q.body)}`); assert.equal(q.body.workflow, wfile, pv); }
  const qt = await get('/api/tools/image-upscale/price?scale=4&provider=fal-topaz-wonder&width=1024&height=1024'); assert.match(JSON.stringify(qt.body.breakdown), /List price ≈ \$0\.24\./, `Topaz 4096² = 3 started 8 MP blocks: ${JSON.stringify(qt.body).slice(0, 400)}`);
  const qf = await get('/api/tools/image-upscale/price?scale=2&provider=fal-seedvr2-upscale&width=1024&height=1024'); assert.match(JSON.stringify(qf.body.breakdown), /List price ≈ \$0\.01\./);
  const qz = await get('/api/tools/image-upscale/price?scale=4&provider=comfy-zimage-upscale&width=1024&height=1024'); assert.equal(qz.status, 400); assert.equal(qz.body.code, 'output_too_large');
  const qs = await get('/api/tools/image-upscale/price?scale=4&provider=comfy-ultrasharp'); assert.equal(qs.status, 200); assert.equal(qs.body.workflow, 'image-upscale-ultrasharp-x4-api.json');
  const qw = await get('/api/tools/image-upscale/price?scale=4&provider=comfy-realesrgan&width=1280&height=720'); assert.deepEqual(qw.body.outputSize, { width: 5120, height: 2880 }); assert.deepEqual(qw.body.sourceSize, { width: 1280, height: 720 });
  const qbig = await get('/api/tools/image-upscale/price?scale=8&provider=comfy-realesrgan&width=1280&height=720'); assert.equal(qbig.status, 400); assert.equal(qbig.body.code, 'output_too_large');
  const qus = await get('/api/tools/image-upscale/price?scale=2&provider=comfy-ultrasharp'); assert.equal(qus.status, 400); assert.equal(qus.body.code, 'unsupported_scale'); assert.deepEqual(qus.body.allowed, ['4']);
  const q16 = await get('/api/tools/image-upscale/price?scale=16'); assert.equal(q16.status, 400);
  const qold = await get('/api/tools/image-upscale/price?types=x8&provider=comfy-realesrgan'); assert.equal(qold.status, 200); assert.equal(qold.body.workflow, 'image-upscale-x8-api.json');
  ok('quote: scale= accepted (was invalid_scale), names the workflow per factor, output size, unsupported factor and 8192 px cap → 400, types= still works');

  // submit
  const a = await job({ scale: '4', provider: 'comfy-realesrgan', rights: '1' }); assert.equal(a.status, 200, JSON.stringify(a.body));
  let ja = await until(a.body.id); assert.equal(ja.status, 'done'); for (let i = 0; i < 20 && ja.outputs[0].width !== 5120; i++) { await new Promise((r) => setTimeout(r, 150)); ja = (await get(`/api/jobs/${a.body.id}`)).body; } assert.equal(ja.input.scale, 4); assert.equal(ja.input.workflow, 'image-upscale-x4-api.json'); assert.deepEqual(ja.input.outputSize, { width: 5120, height: 2880 }); assert.equal(ja.outputs[0].width, 5120, 'the output metadata names the upscaled size');
  const b = await job({ types: '["x2"]', provider: 'comfy-realesrgan', rights: '1', sharpen: '1', face: 'gfpgan' }); assert.equal(b.status, 200, 'old fields are ignored, not refused'); const jb = await until(b.body.id); assert.equal(jb.input.workflow, 'image-upscale-x2-api.json');
  const c = await job({ scale: '8', provider: 'comfy-realesrgan', rights: '1' }); assert.equal(c.status, 400); assert.equal(c.body.code, 'output_too_large');
  const d = await job({ scale: '2', types: '["x4"]', rights: '1' }); assert.equal(d.status, 400);
  const e = await job({ scale: '2', provider: 'comfy-ultrasharp', rights: '1' }); assert.equal(e.status, 400);
  const n = await job({ scale: '2', provider: 'comfy-nomos2', rights: '1' }); assert.equal(n.status, 200, JSON.stringify(n.body)); const jn = await until(n.body.id); assert.equal(jn.input.workflow, 'image-upscale-nomos2-x2-api.json');
  const h = await job({ scale: '4', provider: 'fal-topaz-wonder', rights: '1' }); assert.ok([200, 402].includes(h.status), JSON.stringify(h.body)); if (h.status === 200) { const jh = await until(h.body.id); assert.equal(jh.input.workflow, null, 'hosted: no local graph'); }
  ok('submit: scale= works, the job names its workflow, the 8192 px cap is enforced (not just in mock), old types=/sharpen= requests still run');
  // Unified Create (2026-10-22): Upscale is a workflow in Create Image's bar; /tools/image-upscale redirects there; jobs, Recreate and prefill unchanged
  const wf = (await get('/api/image-workflows')).body.workflows.find((w: any) => w.id === 'upscale');
  assert.equal(wf.status, 'ready'); assert.equal(wf.runner.toolId, 'image-upscale'); assert.deepEqual(wf.slots.map((s: any) => s.sendsAs), ['image']);
  assert.deepEqual(wf.controls[0].options.map((o: any) => Number(o.value)), iu.factors, 'the Scale chip lists every factor the page did (×16 disabled by the bar)');
  assert.deepEqual(wf.models.upscale, t.providers.map((p: any) => p.id), 'the model chip keeps the page order');
  const { IMAGE_REDIRECTS } = await import('../src/shared/imageFeatures.ts'); assert.equal(IMAGE_REDIRECTS['/tools/image-upscale'], '/image?workflow=upscale');
  assert.ok(!fs.existsSync(path.resolve(ROOT, '../web/src/tools/imageApps/ImageUpscaleTool.tsx')), 'the old page is gone');
  const pf = (await get(`/api/jobs/${a.body.id}/prefill?action=recreate`)).body; assert.equal(pf.form.scale, '4'); assert.equal(pf.form.provider, 'comfy-realesrgan'); assert.ok(pf.files.image?.[0], 'Recreate brings the photo back');
  ok('Upscale workflow in the bar: same factors and models as the page, old route redirects, old jobs Recreate with photo, model and factor');
} finally { try { process.kill(-srv.pid!); } catch { /* */ } fs.rmSync(D, { recursive: true, force: true }); }
