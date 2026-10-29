// Image to layers (2026-10-24): Seedream 5.0 layer separation on Comfy Router (shared/imageLayers.ts, routing/routerModels.ts, tools/apps.ts app-image-layers).
// Unit (in process, fake Router, fake key, no network, no spend): the registry (recipe, models, sizes, default, local listing), prices (credits per run from the
// Router table), the request body (layer_decomposition, one photo, size, no prompt of ours), the multi-output result (base first, z_index order, names, boxes;
// each layer put on a base-sized transparent canvas), the zip names.
// E2E (own mock server :9172, temp data dir, no keys): quote = charge for Flash and Pro at 1K / 2K, the sample run makes several transparent PNG layers,
// the job ZIP lists them by name, a photo under 512 px is refused (400, nothing charged), the local model is listed as needing a download.
// Run: npx tsx test/image-layers.test.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'layers-'));
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '', OPENHIGGSFIELD_BILLING_MODE: '' };
const ok = (m: string) => console.log('ok ' + m);
const UNIT_DATA = fs.mkdtempSync(path.join(D, 'unit-'));
Object.assign(process.env, NOKEYS, { OPENHIGGSFIELD_DATA_DIR: UNIT_DATA, OPENHIGGSFIELD_BACKEND: 'mock' });
const png = (name: string, size: string, color = 'blue') => { const f = path.join(D, name); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${color}:s=${size}`, '-frames:v', '1', f]); return f; };
const PHOTO = png('photo.png', '1200x800'); const SMALL = png('small.png', '400x300');
const size = (f: string) => execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height,pix_fmt', '-of', 'csv=p=0', f]).toString().trim();

// ---------------- unit ----------------
const L = await import('../src/shared/imageLayers.ts'); const W = await import('../src/shared/workflows.ts'); const H = await import('../src/shared/hostedPrices.ts');
const P = await import('../src/shared/pricing.ts'); const M = await import('../src/routing/routerModels.ts');
{
  assert.deepEqual(L.LAYER_MODELS, ['api-seedream-layers-flash', 'api-seedream-layers-pro', 'comfy-qwen-image-layered'], 'Flash default, then Pro, then the local model');
  assert.ok(W.WORKFLOW_IDS.includes('image-layers'));
  // prices: one flat price per run from the Router table (211 Comfy credits = $1), by size on Pro; quote credits = usd / $0.01 rounded UP (2026-10-24, hostedPrices usdToCredits; Math.round quoted Pro 1K at ✦3 = $0.03, under Comfy's $0.0322)
  const fl = H.HOSTED_BY_ID['api-seedream-layers-flash'], pr = H.HOSTED_BY_ID['api-seedream-layers-pro'];
  assert.equal(fl.unit, 'run'); assert.equal(fl.usd, Math.round(17 * 5.4311 / 211 * 1e5) / 1e5); assert.equal(pr.usdByResolution!['1K'], Math.round(17 * 6.7889 / 211 * 1e5) / 1e5); assert.equal(pr.usdByResolution!['2K'], Math.round(17 * 13.5778 / 211 * 1e5) / 1e5);
  // billed per output image (2026-10-24): a real Flash run returned 13 layers and was charged 13 × 5.4311 = 70.6 credits ($0.3346); the worst-case quote covers it
  assert.ok(13 * 5.4311 / 211 <= fl.usd, 'a real 13-layer Flash bill stays under the quote'); assert.ok(fl.upTo && pr.upTo, "layers quotes are '≈ up to'");
  const q = (provider: string, imageRes: string) => P.priceOf({ toolId: 'app-image-layers', provider, imageRes, count: 1 }).credits;
  assert.equal(q('api-seedream-layers-flash', '1K'), 44); assert.equal(q('api-seedream-layers-flash', '2K'), 44); assert.equal(q('api-seedream-layers-pro', '1K'), 55); assert.equal(q('api-seedream-layers-pro', '2K'), 110);
  for (const [p, res] of [['api-seedream-layers-flash', '1K'], ['api-seedream-layers-pro', '1K'], ['api-seedream-layers-pro', '2K']] as const) {
    const usd = (H.HOSTED_BY_ID[p].usdByResolution as any)[res] as number; assert.ok(usd <= q(p, res) / 100, `${p} ${res}: the Router price never exceeds the quote (the runner's gate: quote + $0.002)`); }
  { const { CATALOGUE } = await import('../src/shared/modelRank.ts'); assert.ok(String((CATALOGUE as any)['qwen-image-layered'].tagline ?? JSON.stringify((CATALOGUE as any)['qwen-image-layered'])).includes(`Needs download (${L.QWEN_LAYERED_GB})`), 'the menu line names the download size'); }
  ok('registry + prices: billed per output image, quoted for up to 17 (Flash ✦44, Pro ✦55 at 1K / ✦110 at 2K), ≈ up to');
  // request body: the Seedream schema in layer mode
  const b = await M.ROUTER_MODELS['api-seedream-layers-flash'].body({ types: ['edit'], imagePath: PHOTO, refPaths: [PHOTO], imageResolution: '2K', appPrompt: '', prompt: L.LAYERS_NO_PROMPT, seed: 7 }, 0) as any;
  assert.equal(b.layer_decomposition, true); assert.equal(b.size, '2K'); assert.equal(b.watermark, false); assert.equal(b.output_format, 'png'); assert.equal(b.response_format, 'url'); assert.equal(b.seed, 7);
  assert.match(b.image, /^data:image\/png;base64,/); assert.equal(b.prompt, undefined, 'no prompt of ours: the model finds the elements itself');
  for (const k of ['sequential_image_generation', 'sequential_image_generation_options', 'stream', 'tools']) assert.ok(!(k in b), `${k} is refused in layer mode`);
  const bp = await M.ROUTER_MODELS['api-seedream-layers-pro'].body({ types: ['edit'], refPaths: [PHOTO], imageResolution: '1K', appPrompt: 'the cat, the title' }, 0) as any;
  assert.equal(bp.prompt, 'the cat, the title'); assert.equal(bp.size, '1K');
  assert.equal(M.ROUTER_MODELS['api-seedream-layers-pro'].id, 'byteplus/seedream-5-0-pro-260628'); assert.equal(M.ROUTER_MODELS['api-seedream-layers-flash'].id, 'byteplus/seedream-5-0-flash-260915');
  assert.match(String(M.ROUTER_MODELS['api-seedream-layers-flash'].block!({ types: ['edit'], refPaths: [PHOTO, PHOTO] })), /takes up to 1 reference image; you added 2/); assert.equal(M.ROUTER_MODELS['api-seedream-layers-flash'].block!({ types: ['edit'] }), null, 'no photo yet must not block the route (the menu lists it; the app requires the photo at submit)');
  // outputs: base first, then layers by z_index (whatever order they arrive in), named by the model, boxes kept
  const outs = M.ROUTER_MODELS['api-seedream-layers-flash'].outputs({ data: [{ url: 'https://cdn.test/2.png', z_index: 2, name: 'title text', bounding_box: { absolute: [100, 50, 1100, 150] } },
    { url: 'https://cdn.test/0.png', z_index: 0 }, { url: 'https://cdn.test/1.png', z_index: 1, name: 'cat', bounding_box: { absolute: [300, 200, 900, 780] } }] }) as any[];
  assert.deepEqual(outs.map((o) => [o.url, o.label, o.box ?? null]), [['https://cdn.test/0.png', 'Background', null], ['https://cdn.test/1.png', 'Cat', [300, 200, 900, 780]], ['https://cdn.test/2.png', 'Title text', [100, 50, 1100, 150]]]);
  assert.deepEqual(M.ROUTER_MODELS['api-seedream-layers-flash'].outputs({ error: { code: 'OutputImageSensitiveContentDetected', message: 'blocked' } }), { refused: 'blocked' });
  ok('request body: layer_decomposition true, one photo inline, size 1K / 2K, watermark off, only the user\'s words; outputs base → layers by z_index with names and boxes');
}
// the runner: one Router call, every output kept, layers placed on the base's canvas, the accepted quote checked against the estimate
{
  process.env.COMFY_API_KEY = 'test-not-a-real-key'; process.env.OPENHIGGSFIELD_COMFY_ROUTER_URL = 'https://router.test';
  const BASE = fs.readFileSync(png('base.png', '1200x800', 'gray')); const LAYER = fs.readFileSync((() => { const f = path.join(D, 'layer.png'); execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red@0.8:s=300x290', '-vf', 'format=rgba', '-frames:v', '1', f]); return f; })());
  const RR = await import('../src/routing/routerRun.ts'); const { findRoute } = await import('../src/routing/routes.ts'); await import('../src/tools/registry.ts');
  const posts: any[] = []; const h = { request_id: 'req-1', status: 'IN_QUEUE', status_url: 'https://router.test/v2/models/x/requests/req-1/status', response_url: 'https://router.test/v2/models/x/requests/req-1', cancel_url: 'https://router.test/v2/models/x/requests/req-1/cancel' };
  RR.setRouterFetch((async (u: any, init: any = {}) => { const url = String(u);
    if (url.endsWith('/estimate')) return new Response(JSON.stringify({ source: 'exact', amount: '0.02574', credits: 5.4311 }), { status: 200, headers: { 'content-type': 'application/json' } });
    if (init.method === 'POST') { posts.push({ url, body: JSON.parse(init.body) }); return new Response(JSON.stringify(h), { status: 201, headers: { 'content-type': 'application/json' } }); }
    if (url.endsWith('/status')) return new Response(JSON.stringify({ ...h, status: 'COMPLETED' }), { status: 200, headers: { 'content-type': 'application/json' } });
    if (url === h.response_url) return new Response(JSON.stringify({ data: [{ url: 'https://cdn.test/base.png', z_index: 0 }, { url: 'https://cdn.test/l1.png', z_index: 1, name: 'red card', bounding_box: { absolute: [600, 400, 900, 690] } }, { url: 'https://cdn.test/l2.png', z_index: 2, name: 'title' }] }), { status: 200, headers: { 'content-type': 'application/json', 'x-comfy-credits-used': '5.4311' } });
    return new Response(url.endsWith('base.png') ? BASE : LAYER, { status: 200, headers: { 'content-type': 'image/png' } }); }) as any, async () => {});
  const r = findRoute('comfy-router:api-seedream-layers-flash')!; assert.ok(r, 'the Router route exists');
  const job: any = { id: 'lay1', toolId: 'app-image-layers', provider: 'api-seedream-layers-flash', status: 'running', input: { types: ['edit'], refPaths: [PHOTO], imagePath: PHOTO, imageResolution: '1K', appPrompt: '', layers: true }, outputs: [], cost: 3, routing: { prices: { [r.routeId]: 3 } } };
  await RR.runRouter(job, r, { n: 1 } as any, 60_000);
  assert.equal(job.status, 'done'); assert.equal(posts.length, 1, 'one Router call for every layer'); assert.equal(posts[0].body.layer_decomposition, true);
  assert.deepEqual(job.outputs.map((o: any) => o.label), ['Background', 'Red card', 'Title']);
  const f1 = path.join(UNIT_DATA, path.basename(job.outputs[1].url)); assert.equal(size(f1), '1200,800,rgba', 'a boxed layer sits on a transparent canvas the base\'s size');
  assert.equal(job.actualCost.units, 5.4311); assert.ok(job.actualCost.usd <= job.cost / 100, 'the Comfy bill stays under the charge');
  RR.setRouterFetch(null); delete process.env.COMFY_API_KEY;
  ok('runner: one call → base + 2 layers saved, named, a boxed layer placed on a 1200×800 transparent canvas; 5.4311 Comfy credits ($0.0257) ≤ ✦3');
}

// ---------------- e2e (mock server, no keys) ----------------
const PORT = testPort(9172); const B = `http://localhost:${PORT}`; const DATA = fs.mkdtempSync(path.join(D, 'srv-'));
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: DATA, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'env.local'), OPENHIGGSFIELD_BACKEND: 'mock',
  OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_MOCK_DELAY_MS: '100', OPENHIGGSFIELD_COMFY_ROUTER_URL: '' }, stdio: ['ignore', 'ignore', 'pipe'], detached: true });
let stderr = ''; srv.stderr!.on('data', (b) => { stderr += String(b); });
const get = async (u: string) => { const r = await fetch(B + u); return { status: r.status, body: await r.json() as any }; };
const submit = async (f: Record<string, string>, file: string) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v); fd.append('image', new Blob([fs.readFileSync(file)], { type: 'image/png' }), 'photo.png');
  const r = await fetch(`${B}/api/tools/app-image-layers/jobs`, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() as any }; };
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  assert.ok(!/\[image-workflows\]/.test(stderr), `boot validation is clean: ${stderr.match(/\[image-workflows\][\s\S]*/)?.[0]}`);
  const w = (await get('/api/image-workflows')).body.workflows.find((x: any) => x.id === 'image-layers');
  assert.equal(w.name, 'Image to layers'); assert.equal(w.icon, 'layers'); assert.equal(w.runner.toolId, 'app-image-layers'); assert.deepEqual(w.slots.map((s: any) => [s.name, s.required]), [['image', true]]);
  assert.deepEqual(w.controls.map((c: any) => [c.field, c.options.map((o: any) => o.value), c.default]), [['imageResolution', ['1K', '2K'], '1K']]);
  assert.deepEqual(w.models.edit, L.LAYER_MODELS); assert.equal(w.defaults.hosted, 'api-seedream-layers-flash'); assert.equal(w.source.kind, 'official');
  assert.deepEqual(Object.values(w.modelInfo).map((m: any) => m.name), ['Seedream 5.0 Flash', 'Seedream 5.0 Pro', 'Qwen-Image-Layered']);
  const lq = (await get('/api/tools/app-image-layers/price?provider=comfy-qwen-image-layered&image=1&types=edit&imageResolution=1K')).body;
  assert.equal(lq.runnable, false); assert.equal(lq.reason, L.QWEN_LAYERED_NEEDS); assert.match(lq.reason, /Needs download \(30\.1 GB, 3 files\)/);
  ok(`workflow: Image to layers (photo slot, Size 1K / 2K, Flash default); local Qwen-Image-Layered listed: "${lq.reason}"`);
  let jobId = '';
  for (const [provider, res, want] of [['api-seedream-layers-flash', '1K', 44], ['api-seedream-layers-pro', '1K', 55], ['api-seedream-layers-pro', '2K', 110]] as const) {
    const quote = (await get(`/api/tools/app-image-layers/price?provider=${provider}&image=1&types=edit&imageResolution=${res}`)).body; const credits = quote.credits ?? quote.listCredits;
    assert.equal(credits, want, `${provider} ${res} quote`); assert.equal(quote.route, `comfy-router:${provider}`);
    const s = await submit({ provider, imageResolution: res, rights: '1', prompt: '', ...(jobId ? {} : { seed: '7' }) /* seed 7 → all 13 sample layers, so the ZIP check always meets the long sparkles name */ }, PHOTO); assert.equal(s.status, 200, JSON.stringify(s.body).slice(0, 300));
    assert.equal(s.body.cost, credits, `${provider} ${res}: quote ✦${credits} = charge ✦${s.body.cost}`); jobId ||= s.body.id;
    ok(`${provider} ${res}: quote ✦${credits} = charge ✦${s.body.cost}`);
  }
  let job: any = null; for (let i = 0; i < 80; i++) { job = (await get(`/api/jobs/${jobId}`)).body; if (job.status === 'done' || job.status === 'failed') break; await new Promise((r) => setTimeout(r, 250)); }
  assert.equal(job.status, 'done', job.error); assert.equal(job.input.layers, true); assert.equal(job.input.imageResolution, '1K'); assert.equal(job.input.prompt, L.LAYERS_NO_PROMPT);
  assert.ok(job.outputs.length >= 6 && job.outputs.length <= 13, `${job.outputs.length} sample layers (6–13 by seed without "N layers" in the prompt)`); assert.equal(job.outputs[0].label, 'Background');
  for (const o of job.outputs) assert.match(size(path.join(DATA, path.basename(o.url))), /,rgba$/, `${o.label} is a PNG with alpha`);
  const z = await fetch(`${B}/api/jobs/${jobId}/download.zip`); assert.equal(z.status, 200); const zb = Buffer.from(await z.arrayBuffer());
  const names: string[] = []; for (let i = 0; i < zb.length - 46; i++) if (zb.readUInt32LE(i) === 0x02014b50) names.push(zb.subarray(i + 46, i + 46 + zb.readUInt16LE(i + 28)).toString());
  // ZIP names follow routesEdge.ts: slug, trimmed hyphens, at most 40 characters. The sample's 13th layer (sparkles, a long name on purpose) only
  // shows up when the seed makes 13 layers (seed 7 above), so the cut is always checked.
  assert.equal(job.outputs.length, 13, 'seed 7 → 13 sample layers'); const slug = (l: string) => l.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'layer';
  assert.deepEqual(names, [...job.outputs.map((o: any, k: number) => `${String(k + 1).padStart(2, '0')}-${slug(o.label)}.png`), 'settings.json']);
  for (const n of names) assert.ok(n.length <= 3 + 40 + 4 || n === 'settings.json', `${n}: layer names are cut at 40 characters`);
  ok(`sample run: ${job.outputs.map((o: any) => o.label).join(' · ')} (PNG with alpha); ZIP ${names.join(', ')}`);
  const small = await submit({ provider: 'api-seedream-layers-flash', rights: '1' }, SMALL); assert.equal(small.status, 400); assert.equal(small.body.issues?.[0]?.code, 'photo_too_small');
  ok(`a 400×300 photo is refused before anything is charged: "${small.body.error}"`);
  console.log('PASS image-layers');
} finally { try { process.kill(-srv.pid!, 'SIGTERM'); } catch { /* gone */ } fs.rmSync(D, { recursive: true, force: true }); }
