// Other providers hidden while Comfy covers them (2026-10-27, routing/hiddenPlaces.ts). In-process, no network, no keys.
//  1 a fal / Replicate / lab place is hidden when the model runs on Comfy or this computer; KEEP places, pins and the only ready place stay
//  2 Show other providers (global.showOtherProviders) brings every place back; the PUT validates it
//  3 hiding never touches routing: the hidden place's routes still resolve (saved choices, Recreate, the API)
// Run: npx tsx test/hidden-places.test.ts
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'hidden-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0' });
for (const k of ['COMFY_API_KEY', 'OPENHIGGSFIELD_FAL_KEY', 'FAL_KEY']) delete process.env[k];
globalThis.fetch = (async (u: unknown) => { throw new Error(`network blocked in this test: ${String(u).slice(0, 80)}`); }) as typeof fetch;
const ok = (m: string) => console.log('ok ' + m);
const H = await import('../src/routing/hiddenPlaces.ts');
const { getPrefs, savePrefs } = await import('../src/routing/prefs.ts');
const { findRoute } = await import('../src/routing/routes.ts');
await import('../src/tools/registry.ts');

try {
  const row = (id: string, status = 'sample') => ({ id, status });
  { const v = H.visiblePlaces('create-image', 'nano-banana-2', [row('comfy-cloud'), row('fal'), row('replicate'), row('google')], false);
    assert.deepEqual(v.shown.map((r) => r.id), ['comfy-cloud']); assert.deepEqual(v.hidden.map((h) => h.id), ['fal', 'replicate', 'google']); assert.equal(v.hidden[0].coveredBy, 'comfy-cloud');
    assert.deepEqual(H.visiblePlaces('create-image', 'qwen-image', [row('local', 'not-installed'), row('fal')], false).shown.map((r) => r.id), ['local'], 'your computer covers it');
    assert.deepEqual(H.visiblePlaces('app-remove-bg', 'ideogram-remove-background', [row('fal')], false).shown.map((r) => r.id), ['fal'], 'the only place stays');
    assert.deepEqual(H.visiblePlaces('h3-video', 'flux-3-video', [row('comfy-cloud'), row('bfl')], false).shown.map((r) => r.id), ['comfy-cloud', 'bfl'], 'KEEP: 4K on BFL');
    assert.deepEqual(H.visiblePlaces('x', 'm', [row('comfy-cloud', 'coming-soon'), row('fal')], false).shown.map((r) => r.id), ['comfy-cloud', 'fal'], 'a Comfy place that does not run covers nothing');
    assert.deepEqual(H.visiblePlaces('x', 'm', [row('comfy-cloud', 'needs-key'), row('fal', 'ready')], false, 'fal').shown.map((r) => r.id), ['comfy-cloud', 'fal'], 'your fal key keeps working: the pre-selected place stays');
    assert.deepEqual(H.visiblePlaces('x', 'm', [row('comfy-cloud', 'ready'), row('fal', 'ready')], false, 'comfy-cloud').shown.map((r) => r.id), ['comfy-cloud'], 'both ready: Comfy is enough');
    savePrefs({ ...getPrefs(), perTool: { 'create-image': { 'flux-2-pro': { runOn: 'replicate' } } } });
    assert.deepEqual(H.visiblePlaces('create-image', 'flux-2-pro', [row('comfy-cloud'), row('fal'), row('replicate')], false).shown.map((r) => r.id), ['comfy-cloud', 'replicate'], 'your choice stays');
    ok('hidden when Comfy or your computer covers it; the only place, KEEP places, your choice and the one ready place stay'); }
  { assert.equal(H.showOtherProviders(), false, 'off by default');
    savePrefs({ ...getPrefs(), global: { ...getPrefs().global, showOtherProviders: true } }); assert.equal(H.showOtherProviders(), true);
    assert.deepEqual(H.visiblePlaces('create-image', 'nano-banana-2', [row('comfy-cloud'), row('fal')]).shown.map((r) => r.id), ['comfy-cloud', 'fal'], 'Show other providers: everything');
    const Fastify = (await import('fastify')).default; const app = Fastify(); (await import('../src/routing/http.ts')).registerRouting(app); await app.ready();
    const bad = await app.inject({ method: 'PUT', url: '/api/me/routing', payload: { global: { showOtherProviders: 'yes' } } }); assert.equal(bad.statusCode, 400);
    const put = await app.inject({ method: 'PUT', url: '/api/me/routing', payload: { global: { showOtherProviders: false } } }); assert.equal(put.statusCode, 200, put.body); assert.equal(H.showOtherProviders(), false);
    const got = await app.inject({ url: '/api/me/routing' }); assert.equal(got.json().global.showOtherProviders, false);
    await app.close(); ok('Show other providers: saved in routing prefs (validated), brings every place back'); }
  { assert.ok(findRoute('fal:fal-ai/bria/background/remove'), 'a hidden fal route still resolves'); assert.ok(findRoute('replicate:google/nano-banana-2'));
    ok('routing untouched: hidden routes still resolve for saved choices, Recreate and the API'); }
} finally { fs.rmSync(D, { recursive: true, force: true }); }
console.log('hidden-places: all ok');
