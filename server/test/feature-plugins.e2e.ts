// Feature plugins (plan Phase 5: plugins-builtin/features.ts, kernel/http.ts group, eta-learning, webhooks, route add-ons).
//  - Every route group is its own plugin and every route records it; the openapi list is the routes that are on.
//  - A feature turned off: its routes answer exactly like an unknown route (404 not_found), the other features keep answering.
//  - workflow-folders off: /api/plugins still answers (lists none), as #191 promised.
//  - ETA learning and webhooks run on job/settled through their plugins; off = they stop.
//  - Route add-ons: an add-on whose plugin is off adds nothing to the route price.
// Run: npx tsx test/feature-plugins.e2e.ts (the real server in this process on its own port; temp data dir, mock backend, no key, nothing is
// sent anywhere).
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { testPort } from './_ports.js';
const ok = (m: string) => console.log('ok ' + m);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'feature-plugins-')); const PORT = testPort(9487); const B = `http://127.0.0.1:${PORT}`;
fs.writeFileSync(path.join(dir, 'none.env'), '');
Object.assign(process.env, { OPENHIGGSFIELD_PROFILE: '', OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_DATA_DIR: path.join(dir, 'data'), OPENHIGGSFIELD_ENV_FILE: path.join(dir, 'none.env'),
  OPENHIGGSFIELD_FILMING_FILE: path.join(dir, 'no-filming.json'), OPENHIGGSFIELD_COMFY_DETECT_URLS: 'http://127.0.0.1:9', OPENHIGGSFIELD_DEMO_AUTO: '0', OPENHIGGSFIELD_MOCK_DELAY_MS: '50',
  OPENHIGGSFIELD_SEED_FEATURED: '0', OPENHIGGSFIELD_HOSTED: '', OPENHIGGSFIELD_ETA_LEARN_MOCK: '1', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_USE_LOCAL: '1', PORT: String(PORT) });
for (const k of Object.keys(process.env)) if (/_KEY$|TOKEN/.test(k)) delete process.env[k];

const { boot } = await import('../src/boot.js'); await boot();
const { mounted } = await import('../src/kernel/index.js'); const { currentHttp } = await import('../src/kernel/http.js'); const http = currentHttp();
const { FEATURE_IDS } = await import('../src/plugins-builtin/features.js');
const off = async (name: string) => { const m = mounted.filter((x) => x.name === name).at(-1); assert.ok(m, `${name} mounted`); await m!.fiber.dispose(); };
const get = async (u: string) => { const r = await fetch(B + u); return { status: r.status, body: (await r.json().catch(() => null)) as any }; };
const unknownLike = (r: { status: number; body: any }, m: string, u: string) => r.status === 404 && r.body?.errorType === 'not_found' && r.body?.error === `No API route ${m} ${u}`;

try {
  // ---- every feature is a plugin with its own routes; the openapi list is the routes that are on ----
  const by = http.routesBy();
  for (const id of FEATURE_IDS.filter((x) => x !== 'web-static')) assert.ok(by[id]?.length, `${id} owns routes`);
  for (const r of ['GET /api/captions/status', 'GET /api/canvas/agent/starters', 'GET /api/hub/items', 'GET /api/films', 'GET /api/openapi.json']) assert.ok(Object.values(by).flat().includes(r), r);
  assert.ok(by['canvas-demo'].includes('POST /api/canvas/boards/:id/agent/demo') && !by['canvas-agent'].includes('POST /api/canvas/boards/:id/agent/demo'));
  assert.ok(by['workflow-folders'].includes('GET /api/plugins') && by['workflow-folders'].includes('POST /api/workflows/import'));
  assert.ok(!(by.legacy ?? []).some((r) => /\/api\/(captions|films|hub|canvas|brand-kits|hardware|export)\b/.test(r)), 'legacy keeps none of the moved groups');
  ok(`${FEATURE_IDS.length} feature plugins, each owns its routes (legacy keeps ${by.legacy.length})`);

  // ---- on: their routes answer ----
  for (const u of ['/api/captions/status', '/api/hub/items', '/api/films', '/api/canvas/agent/starters', '/api/settings/open-models', '/api/hardware']) assert.equal((await get(u)).status, 200, u);
  const spec0 = (await get('/api/openapi.json')).body; assert.ok(spec0.paths['/api/captions/status']?.get);

  // ---- off, one at a time: routes like an unknown route, the others fine ----
  await off('captions');
  assert.ok(unknownLike(await get('/api/captions/status'), 'GET', '/api/captions/status'));
  const burn = await fetch(`${B}/api/jobs/x1/captions/burn`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.ok(unknownLike({ status: burn.status, body: await burn.json() }, 'POST', '/api/jobs/x1/captions/burn'));
  assert.equal((await get('/api/hub/items')).status, 200); assert.equal((await get('/api/films')).status, 200); assert.equal((await get('/api/health')).status, 200);
  assert.ok(!(await get('/api/openapi.json')).body.paths['/api/captions/status'], 'openapi lists only the routes that are on');
  assert.ok(http.routesBy().captions.every((r) => r.endsWith('(off)')));
  ok('captions off: its routes answer 404 not_found like an unknown route (GET and POST), gone from openapi; hub, film, health fine');

  await off('canvas-demo'); assert.ok(unknownLike(await get('/api/canvas/agent/starters'), 'GET', '/api/canvas/agent/starters'));
  assert.equal((await get('/api/canvas/agent/presence')).status, 200); assert.equal((await get('/api/canvas/boards')).status, 200);
  ok('canvas-demo off: the starter chips and demo routes go; the agent bridge and the boards stay');

  // open-models off: its quote check (a hook) does nothing any more, its routes go
  await off('open-models'); assert.ok(unknownLike(await get('/api/settings/open-models'), 'GET', '/api/settings/open-models'));
  assert.equal((await get('/api/tools/create-image/price?provider=comfy-flux3-klein')).status, 200);
  ok('open-models off: its settings routes go and its quote hook is inert; quotes still answer');

  // ---- workflow-folders off: the routes stay and say so (#191) ----
  await off('workflow-folders'); const pl = await get('/api/plugins'); assert.equal(pl.status, 200); assert.deepEqual(pl.body, []);
  ok('workflow-folders off: GET /api/plugins answers [] (kept on, as #191 promised)');

  // ---- ETA learning and webhooks on job/settled ----
  const W = await import('../src/plugins-builtin/webhooks.js'); const sent: string[] = []; W.setWebhookSink(async (id) => { sent.push(id); });
  const run = async () => { const f = new FormData(); for (const [k, v] of Object.entries({ prompt: 'a calm lake', rights: '1', types: '["generate"]', provider: 'comfy-flux3-klein', route: 'local:comfy-flux3-klein' })) f.set(k, v);
    const r = await fetch(`${B}/api/tools/create-image/jobs`, { method: 'POST', body: f }); const j: any = await r.json(); assert.equal(r.status, 200, JSON.stringify(j));
    for (let i = 0; i < 300; i++) { const s = (await get(`/api/jobs/${j.id}`)).body; if (!['queued', 'running'].includes(s.status)) break; await new Promise((x) => setTimeout(x, 50)); }
    await new Promise((x) => setTimeout(x, 300)); return j.id as string; };
  const learned = async () => (await get('/api/eta/learned')).body.samples as number;
  const n0 = await learned(); const id1 = await run();
  assert.equal(await learned(), n0 + 1, 'eta-learning: a done run adds one sample'); assert.ok(sent.includes(id1), 'webhooks: job/settled reached the webhook sender');
  await off('eta-learning'); await off('webhooks'); const id2 = await run();
  assert.equal(await learned(), n0 + 1, 'eta-learning off: nothing new is learned'); assert.ok(!sent.includes(id2), 'webhooks off: no send on job/settled');
  ok('job/settled: eta-learning adds a sample and webhooks sends; both off → neither');

  // ---- route add-ons: priced only while their plugin is on ----
  { const A = await import('../src/services/routeAddOns.js'); const r = { addOns: ['soul-cloud-upscale'] };
    assert.equal(A.addOnCredits(r, { upscale: 'x2' }), 1); await off('studio-image'); assert.equal(A.addOnCredits(r, { upscale: 'x2' }), 0);
    ok('route add-on soul-cloud-upscale: 1 credit while studio-image is on, nothing once it is off'); }
} finally {
  await mounted.filter((m) => m.name === 'legacy').at(-1)?.fiber.dispose();
  fs.rmSync(dir, { recursive: true, force: true });
}
process.exit(0);
