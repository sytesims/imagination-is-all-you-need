// The Plugins page (plan step 7: kernel/switchboard.ts, routesPlugins.ts).
//  - GET /api/plugins lists what we ship with plain names, groups and states; the edition's start-off ones are off; kie.ai and RunPod wait to be installed.
//  - The spend guard and the app itself can't be turned off (400).
//  - Turning off Canvas names what else goes off (409 confirm), then does it live; turning Canvas agent on brings Canvas back (same routes).
//  - Restart-only plugins (webhooks) and route plugins that weren't running at start (comfy-deploy) say "after a restart".
//  - Install kie.ai / RunPod: they need their key (RunPod: and its Endpoint ID).
//  - A plugin that isn't ours is refused (never loaded or run; Turn on answers 403); safe mode shows it paused and keeps ours on.
//  - Choices survive a restart (a second server on the same data dir); /api/ui follows them.
//  - The old workflow folder list lives at /api/workflow-folders; the web's Your workflows page at /workflows/yours.
// Run: npm test -- --only "plugins-ui" --jobs 1 (or npx tsx test/plugins-ui.e2e.ts). Temp data dir, mock backend, no key, nothing sent anywhere.
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { spawn } from 'node:child_process';
import { testPort } from './_ports.js';
const ok = (m: string) => console.log('ok ' + m);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugins-ui-')); const PORT = testPort(9611); const B = `http://127.0.0.1:${PORT}`;
fs.writeFileSync(path.join(dir, 'none.env'), '');
Object.assign(process.env, { OPENHIGGSFIELD_PROFILE: '', OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_DATA_DIR: path.join(dir, 'data'), OPENHIGGSFIELD_ENV_FILE: path.join(dir, 'none.env'),
  OPENHIGGSFIELD_FILMING_FILE: path.join(dir, 'no-filming.json'), OPENHIGGSFIELD_COMFY_DETECT_URLS: 'http://127.0.0.1:9', OPENHIGGSFIELD_DEMO_AUTO: '0', OPENHIGGSFIELD_SEED_FEATURED: '0',
  OPENHIGGSFIELD_HOSTED: '', OPENHIGGSFIELD_MOCK_KEYS: '', PORT: String(PORT) });
delete process.env.OPENHIGGSFIELD_PLUGIN_CHOICES; // this test is about the choices (the runner sets "ignore" for every other test)
for (const k of Object.keys(process.env)) if (/_KEY$|TOKEN/.test(k)) delete process.env[k];

const SB = await import('../src/kernel/switchboard.js');
const live = { outside: false, loaded: 0, key: undefined as unknown };
SB.registerOutsidePlugin('fake-outside', { name: 'Pixel theme', description: 'Someone else’s plugin', load: async () => { live.loaded++; return { default: { name: 'fake-outside', keys: ['OPENHIGGSFIELD_FAL_KEY'], apply(ctx: any) { try { live.key = ctx.keys.get('OPENHIGGSFIELD_FAL_KEY'); } catch { /* */ } ctx.effect(() => { live.outside = true; return () => { live.outside = false; }; }); } } }; } });
SB.registerOutsidePlugin('fake-broken', { name: 'Broken one', description: 'Throws while it starts', load: async () => ({ default: { name: 'fake-broken', apply() { live.loaded++; throw new Error('The speech model isn’t on this computer yet.'); } } }) });
const { boot } = await import('../src/boot.js'); await boot();

const get = async (u: string, base = B) => { const r = await fetch(base + u); return { status: r.status, body: (await r.json().catch(() => null)) as any }; };
const send = async (method: string, u: string, b: unknown, base = B) => { const r = await fetch(base + u, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, body: (await r.json().catch(() => null)) as any }; };
const list = async (base = B) => (await get('/api/plugins', base)).body;
const row = async (id: string, base = B) => (await list(base)).plugins.find((p: any) => p.id === id);
const ui = async (base = B) => (await get('/api/ui', base)).body.on as string[];

try {
  // ---- the list ----
  const l = await list();
  assert.equal(l.edition.name, 'Desktop edition'); assert.equal(l.safeMode, false);
  const by = Object.fromEntries(l.plugins.map((p: any) => [p.id, p]));
  for (const id of ['legacy', 'web-static']) assert.ok(!by[id], `${id} is the app, not a switch`);
  assert.equal(by.edge.name, 'Job list'); assert.equal(by['place-direct'].name, 'Direct from the maker');
  assert.deepEqual([by.canvas.group, by['place-fal'].group, by['studio-image'].group, by['spend-cap'].group], ['features', 'places', 'studios', 'money']);
  assert.equal(by.canvas.state, 'on'); assert.equal(by.canvas.source, 'ours'); assert.deepEqual(by.canvas.neededBy, ['canvas-agent', 'canvas-demo']);
  for (const id of ['canvas-demo', 'comfy-deploy', 'webhooks', 'billing-team-mode', 'hosted-grant']) assert.equal(by[id].state, 'off', `${id} starts off`);
  for (const id of ['place-kie', 'place-runpod']) { assert.equal(by[id].state, 'not-installed'); assert.equal(by[id].installable, true); }
  assert.equal(by['place-fal'].state, 'needs-key'); assert.deepEqual(by['place-fal'].key, { connection: 'fal', label: 'fal key', set: false });
  assert.ok(!(await ui()).includes('canvas-demo') && (await ui()).includes('canvas'));
  ok(`GET /api/plugins: ${l.plugins.length} rows, plain names and groups; start-off ones off; kie.ai and RunPod ready to install; fal needs its key`);

  // ---- the spend guard and the app itself ----
  assert.equal(by['spend-guard'].core, true); assert.equal(by['spend-guard'].canTurnOff, false); assert.equal(by['spend-guard'].state, 'on');
  const sg = await send('POST', '/api/plugins/spend-guard', { on: false }); assert.equal(sg.status, 400); assert.equal(sg.body.code, 'always_on'); assert.match(sg.body.error, /always on/);
  for (const id of ['legacy', 'spend', 'web-static']) assert.equal((await send('POST', `/api/plugins/${id}`, { on: false })).status, 400, id);
  assert.equal((await send('POST', '/api/plugins/nope', { on: false })).status, 404); assert.equal((await send('POST', '/api/plugins/canvas', { on: 'no' })).status, 400);
  assert.equal((await get('/api/health')).status, 200);
  ok('the spend guard, the kernel and the app refuse to turn off (400 always_on); unknown 404; bad body 400');

  // ---- Canvas off: confirm names what else goes off, then it is live ----
  assert.equal((await get('/api/canvas/boards')).status, 200);
  const c1 = await send('POST', '/api/plugins/canvas', { on: false }); assert.equal(c1.status, 409); assert.equal(c1.body.code, 'confirm');
  assert.deepEqual(c1.body.alsoOff.map((x: any) => x.id), ['canvas-agent'], 'canvas-demo is already off');
  assert.equal((await get('/api/canvas/boards')).status, 200, 'nothing changed before the OK');
  const c2 = await send('POST', '/api/plugins/canvas', { on: false, confirm: true }); assert.equal(c2.status, 200); assert.deepEqual(c2.body.changed, ['canvas-agent', 'canvas']);
  assert.equal((await get('/api/canvas/boards')).status, 404); assert.equal((await get('/api/canvas/agent/presence')).status, 404);
  assert.ok(!(await ui()).includes('canvas') && !(await ui()).includes('canvas-agent'));
  assert.equal((await row('canvas')).state, 'off'); assert.equal((await row('canvas-agent')).state, 'off');
  const a1 = await send('POST', '/api/plugins/canvas-agent', { on: true }); assert.equal(a1.status, 409); assert.deepEqual(a1.body.alsoOn.map((x: any) => x.id), ['canvas']);
  const a2 = await send('POST', '/api/plugins/canvas-agent', { on: true, confirm: true }); assert.equal(a2.status, 200); assert.deepEqual(a2.body.restartNeeded, []);
  assert.equal((await get('/api/canvas/boards')).status, 200); assert.equal((await get('/api/canvas/agent/presence')).status, 200);
  assert.equal((await row('canvas')).state, 'on'); assert.ok((await ui()).includes('canvas'));
  ok('Canvas off: 409 names Canvas agent, then both go live (routes 404, /api/ui drops them); Canvas agent on brings Canvas back with the same routes');

  // ---- after a restart ----
  const w = await send('POST', '/api/plugins/webhooks', { on: true }); assert.deepEqual(w.body.restartNeeded, ['webhooks']);
  const wr = await row('webhooks'); assert.equal(wr.restartNeeded, true); assert.equal(wr.wanted, true); assert.equal(wr.reason, 'Turns on after a restart');
  const cd = await send('POST', '/api/plugins/comfy-deploy', { on: true }); assert.deepEqual(cd.body.restartNeeded, ['comfy-deploy'], 'its routes were never added');
  assert.equal((await get('/api/comfy-deploy')).status, 404);
  const bt = await send('POST', '/api/plugins/billing-team-mode', { on: true }); assert.deepEqual(bt.body.restartNeeded, []); assert.equal((await row('billing-team-mode')).state, 'on');
  assert.equal((await list()).restartNeeded, true);
  ok('webhooks (restart-only) and comfy-deploy (routes not there at start) say "after a restart"; team billing (no routes) is on at once');

  // ---- a feature on at start, off and on again: live both ways (same routes) ----
  await send('POST', '/api/plugins/captions', { on: false }); assert.equal((await get('/api/captions/status')).status, 404);
  await send('POST', '/api/plugins/captions', { on: true }); assert.equal((await get('/api/captions/status')).status, 200); assert.equal((await row('captions')).restartNeeded, false);
  await send('POST', '/api/plugins/studio-audio', { on: false }); assert.ok(!(await get('/api/tools')).body.some((t: any) => t.id === 'audio' || t.id === 'voice'));
  await send('POST', '/api/plugins/studio-audio', { on: true }); assert.ok((await get('/api/tools')).body.some((t: any) => t.id === 'voice'));
  ok('captions and the Audio studio go off and come back live');

  // ---- install kie.ai and RunPod ----
  assert.equal((await send('POST', '/api/plugins/canvas/install', {})).status, 400);
  const k = await send('POST', '/api/plugins/place-kie/install', {}); assert.equal(k.status, 200); assert.equal(k.body.plugin.installed, true); assert.equal(k.body.plugin.state, 'needs-key'); assert.equal(k.body.plugin.key.connection, 'kie');
  const rp = await send('POST', '/api/plugins/place-runpod/install', {}); assert.equal(rp.body.plugin.state, 'needs-key'); assert.match(rp.body.plugin.reason, /RunPod key and Endpoint ID/);
  assert.deepEqual(rp.body.plugin.settings, [{ label: 'Endpoint ID', to: '/settings#conn-runpod' }]);
  assert.ok((await ui()).includes('place-kie') && (await ui()).includes('place-runpod'));
  ok('kie.ai and RunPod install (nothing downloaded) and then need their key; RunPod also its Endpoint ID');

  // ---- plugins that aren't ours: refused for now; safe mode ----
  const fo = await row('fake-outside'); assert.equal(fo.source, 'community'); assert.equal(fo.state, 'off'); assert.equal(fo.reason, SB.OUTSIDE_REFUSED);
  assert.equal(live.outside, false); assert.equal(live.loaded, 0, 'never loaded, so none of its code ran'); assert.equal(live.key, undefined, 'it read no key');
  const on = await send('POST', '/api/plugins/fake-outside', { on: true }); assert.equal(on.status, 403); assert.equal(on.body.code, 'outside_refused'); assert.equal(live.loaded, 0);
  assert.equal((await row('fake-broken')).state, 'off'); assert.equal((await get('/api/health')).status, 200);
  assert.equal((await send('PUT', '/api/settings/safe-mode', { on: true })).status, 200);
  assert.equal((await row('fake-outside')).state, 'paused'); assert.equal((await row('fake-outside')).reason, 'Paused by safe mode');
  assert.equal((await row('canvas')).state, 'on'); assert.equal((await list()).safeMode, true); assert.equal((await get('/api/ui')).body.safeMode, true);
  await send('PUT', '/api/settings/safe-mode', { on: false }); assert.equal(live.outside, false); assert.equal(live.loaded, 0, 'safe mode off still starts nothing of theirs');
  assert.ok(!(await ui()).includes('fake-outside')); assert.equal((await send('POST', '/api/plugins/fake-outside', { on: false })).status, 200);
  ok('plugins that are not ours are refused (never loaded, no key read, Turn on 403); safe mode shows them paused and keeps ours on');

  // ---- the old list moved ----
  const wf = await get('/api/workflow-folders'); assert.equal(wf.status, 200); assert.ok(Array.isArray(wf.body));
  const router = fs.readFileSync(path.resolve(import.meta.dirname, '../../web/src/platform/router.tsx'), 'utf8');
  assert.match(router, /'\/workflows\/yours': \['Your workflows'/); assert.match(router, /'\/plugins': \['Plugins'/);
  for (const f of ['web/src/ui/Shell.tsx', 'web/src/shared/footerLinks.ts', 'web/src/ui/PluginResults.tsx', 'web/src/ui/pages/Workflows.tsx'])
    assert.ok(!/['"]\/plugins['"][^\n]{0,80}Your workflows/.test(fs.readFileSync(path.resolve(import.meta.dirname, '../..', f), 'utf8')), `${f}: Your workflows links go to /workflows/yours`);
  ok('the folder list is GET /api/workflow-folders; the web has /plugins (Plugins) and /workflows/yours (Your workflows)');
} catch (e) { console.error(e); process.exit(1); } // (closing the server ends the process: fail before that)
const { currentHttp } = await import('../src/kernel/http.js'); currentHttp().app.server.close();

// ---- choices survive a restart: two servers in turn on one data dir ----
const D2 = fs.mkdtempSync(path.join(os.tmpdir(), 'plugins-ui-2-')); const P2 = testPort(9612); const B2 = `http://127.0.0.1:${P2}`;
const env2 = { ...process.env, PORT: String(P2), OPENHIGGSFIELD_DATA_DIR: path.join(D2, 'data') } as Record<string, string>;
const startSrv = () => spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], { cwd: path.resolve(import.meta.dirname, '..'), env: env2, stdio: 'ignore', detached: true });
const up = async () => { for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B2}/api/health`)).ok) return; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 500)); } throw new Error('no server'); };
const down = async (p: ReturnType<typeof spawn>) => { try { process.kill(-p.pid!); } catch { /* gone */ } for (let i = 0; i < 40; i++) { try { await fetch(`${B2}/api/health`); } catch { return; } await new Promise((r) => setTimeout(r, 250)); } };
let srv = startSrv();
try {
  await up();
  assert.equal((await send('POST', '/api/plugins/canvas', { on: false, confirm: true }, B2)).status, 200);
  assert.equal((await send('POST', '/api/plugins/place-kie/install', {}, B2)).status, 200);
  assert.equal((await send('POST', '/api/plugins/comfy-deploy', { on: true }, B2)).status, 200);
  await down(srv); srv = startSrv(); await up();
  const on = await ui(B2);
  assert.ok(!on.includes('canvas') && !on.includes('canvas-agent'), 'Canvas stays off'); assert.ok(on.includes('place-kie'), 'kie.ai stays installed'); assert.ok(on.includes('comfy-deploy'), 'comfy-deploy started this time');
  assert.equal((await get('/api/canvas/boards', B2)).status, 404); assert.equal((await row('comfy-deploy', B2)).restartNeeded, false);
  assert.equal((await get('/api/comfy-deploy', B2)).status, 200);
  ok('after a restart: Canvas still off (404), kie.ai still installed, comfy-deploy now running');
} finally { await down(srv); fs.rmSync(D2, { recursive: true, force: true }); fs.rmSync(dir, { recursive: true, force: true }); }
process.exit(0);
