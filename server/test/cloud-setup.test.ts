// One-time Comfy Cloud setup (2026-10-27, comfy/cloudSetup.ts, GET /api/comfy-cloud/setup). FAKE fetches only (no network, no real key, no spend).
//  1 the list: Character Swap LoRA, Layout to Render LoRA, FastH3 checkpoint, CrossView deployment; each with what it unlocks, a link and steps
//  2 a refused run says the SAME steps as the card (one builder), with reasonCode cloud_import_missing
//  3 the free check: GET only; present → ready, missing → Not yet, no key → no_key; without ?check=1 nothing is fetched
// Run: npx tsx test/cloud-setup.test.ts
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'csetup-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0' });
for (const k of ['COMFY_API_KEY', 'COMFY_CLOUD_URL', 'COMFY_DEPLOY_URL', 'COMFY_RUNNER_URL', 'COMFY_CLOUD_CHARSWAP_LORA', 'COMFY_CLOUD_LAYOUT_LORA']) delete process.env[k];
globalThis.fetch = (async (u: unknown) => { throw new Error(`network blocked in this test: ${String(u).slice(0, 80)}`); }) as typeof fetch;
const ok = (m: string) => console.log('ok ' + m);
const S = await import('../src/comfy/cloudSetup.ts');
const { CHARSWAP_LORA_MISSING, CHARSWAP_LORA_STEPS } = await import('../src/comfy/h3CharSwapCloud.ts');
const { LAYOUT_LORA_MISSING } = await import('../src/comfy/ltx25LayoutCloud.ts');
const { H3F_MISSING, H3F_IMPORTED } = await import('../src/comfy/h3FastCloud.ts');
const { PIKA_MISSING, PIKA_IMPORTED, PIKA_IMPORT_STEPS } = await import('../src/comfy/pikaH3Flex.ts');
const { setCloudFetch } = await import('../src/routing/cloudRun.ts');

try {
  // ---- 1. the list ----
  assert.deepEqual(S.CLOUD_SETUP.map((x) => x.id), ['charswap', 'layout', 'h3fast', 'pika', 'crossview']);
  for (const x of S.CLOUD_SETUP) { assert.ok(x.unlocks.length > 20 && x.steps.length >= 3, x.id); assert.match(x.link, /^https:\/\//); assert.ok(!/\bMac\b/.test(x.unlocks + x.steps.join(' ')), 'brand voice: no "Mac"'); }
  assert.match(S.CLOUD_SETUP[0].link, /huggingface\.co\/akatz-ai\/MiniMax-H3-Character-Swap-LoRA/); assert.match(S.CLOUD_SETUP[2].link, /FastVideo-FastH3-Comfy/);
  assert.match(S.CLOUD_SETUP[1].steps[0], /Accept the licence/, 'gated repo: the licence first');
  ok('list: 4 imports + CrossView deployment, each with what it unlocks, a link and steps (gated licence first for Layout to Render)');

  // ---- 2. the same steps in a refused run ----
  for (const [msg, x] of [[CHARSWAP_LORA_MISSING, S.CLOUD_SETUP[0]], [LAYOUT_LORA_MISSING, S.CLOUD_SETUP[1]], [H3F_MISSING, S.CLOUD_SETUP[2]], [PIKA_MISSING, S.CLOUD_SETUP[3]]] as const) {
    for (const st of x.steps) assert.ok(msg.includes(st), `${x.id}: "${st}" is in the run's message`); assert.match(msg, /one-time setup/); assert.match(msg, /Nothing was sent or charged$/); }
  assert.deepEqual(S.CLOUD_SETUP[0].steps, CHARSWAP_LORA_STEPS); assert.deepEqual(S.CLOUD_SETUP[3].steps, PIKA_IMPORT_STEPS); assert.match(H3F_MISSING, new RegExp(H3F_IMPORTED.replace(/\./g, '\\.')));
  const cw = fs.readFileSync(path.resolve(import.meta.dirname, '../src/comfy/cloudWorkflows.ts'), 'utf8'); assert.equal((cw.match(/reasonCode: 'cloud_import_missing'/g) ?? []).length, 3, 'one reason code for the three imports');
  ok('a refused run names the same numbered steps as the card, reasonCode cloud_import_missing');

  // ---- 3. the free check ----
  const calls: { url: string; method: string }[] = [];
  const asset = (name: string) => ({ assets: [{ name, loader_path: name, file_path: name, is_immutable: false }] });
  const fake = (have: string[]) => async (p: string) => { calls.push({ url: p, method: 'GET' });
    if (p.startsWith('/api/assets')) { const stem = decodeURIComponent(/name_contains=([^&]+)/.exec(p)?.[1] ?? ''); const n = have.find((h) => h.includes(stem)); return new Response(JSON.stringify(n ? asset(n) : { assets: [] }), { status: 200 }); }
    if (p === '/api/object_info') return new Response(JSON.stringify({ LoraLoaderModelOnly: { input: { required: { lora_name: [['other.safetensors']] } } }, UNETLoader: { input: { required: { unet_name: [['other.safetensors']] } } } }), { status: 200 });
    return new Response('{}', { status: 404 }); };
  { const r = await S.checkCloudSetup(fake(['akatz-ai__MiniMax-H3-Character-Swap-LoRA__h3_character_swap_v1.5.safetensors', H3F_IMPORTED, PIKA_IMPORTED]), async () => ({ connected: true, recipes: [] }));
    assert.equal(r.charswap.state, 'ready'); assert.equal(r.h3fast.state, 'ready'); assert.equal(r.layout.state, 'missing'); assert.equal(r.pika.state, 'ready', 'Pika LoRA imported'); assert.equal(r.crossview.state, 'missing', 'no deployment set');
    assert.ok(calls.every((c) => c.method === 'GET')); }
  { const r = await S.checkCloudSetup(fake([]), async () => ({ connected: true, recipes: [] })); assert.equal(r.pika.state, 'missing', 'Pika LoRA not in the library: missing'); assert.equal(r.h3fast.state, 'missing'); }
  { const r = await S.checkCloudSetup(null); assert.equal(r.charswap.state, 'no_key'); assert.equal(r.layout.state, 'no_key'); }
  { const Fastify = (await import('fastify')).default; const app = Fastify(); (await import('../src/routesComfyDeploy.ts')).registerComfyDeploy(app); await app.ready();
    let fetched = 0; setCloudFetch((async () => { fetched++; return new Response('{}', { status: 500 }); }) as typeof fetch);
    const a = (await app.inject({ url: '/api/comfy-cloud/setup' })).json(); assert.equal(a.items.length, 5); assert.equal(a.checkedAt, null); assert.equal(fetched, 0, 'no check: nothing fetched');
    assert.equal(a.items[0].state, 'not_checked'); assert.equal(a.items[4].state, 'missing');
    const b = (await app.inject({ url: '/api/comfy-cloud/setup?check=1' })).json(); assert.ok(b.checkedAt); assert.equal(b.items[0].state, 'no_key', 'no key: says so');
    await app.close(); }
  ok('free check: GET only; present → Ready, missing → Not yet, no key → asks for the key; without ?check=1 nothing is fetched');
} finally { setCloudFetch(null); fs.rmSync(D, { recursive: true, force: true }); }
console.log('cloud-setup: all ok');
