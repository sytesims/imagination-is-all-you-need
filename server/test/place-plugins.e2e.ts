// Place plugins (plan Phase 0: services/places.ts, plugins-builtin/place-fal.ts + place-replicate.ts, boot.ts, profiles/*.yml).
// In-process: the profile reader; ctx.places register / dispose through Cordis (a place turned off hides its routes, turned on shows them again).
// E2E (own mock servers, fake keys that never leave the machine: mock backend, no ROUTING_LIVE): the desktop profile lists and quotes fal and
// Replicate as before; a profile without place-fal hides fal routes, a quote that names one says fal isn't set up, and a submit is refused
// with nothing charged. Run: npx tsx test/place-plugins.e2e.ts
import assert from 'node:assert/strict'; import { spawn, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { testPort } from './_ports.js';
import { parseProfile, readProfile } from '../src/kernel/profile.js';
const ok = (m: string) => console.log('ok ' + m);
const ROOT = path.resolve(import.meta.dirname, '..');
const ALL_PLACES = ['place-comfy-local', 'place-comfy-cloud', 'place-comfy-router', 'place-fal', 'place-replicate', 'place-direct', 'place-sample'];
const without = (id: string) => ALL_PLACES.filter((x) => x !== id);
const QWEN = 'comfy-qwen-image', FAL_QWEN = 'fal:fal-ai/qwen-image', REP_QWEN = 'replicate:qwen/qwen-image';

// ---- profiles ----
{ const p = parseProfile('# c\nname: x\nplugins:\n  - place-fal   # fal\n  # - place-replicate\n  - legacy\n', 'x.yml');
  assert.deepEqual(p, { name: 'x', plugins: ['place-fal', 'legacy'], file: 'x.yml' });
  assert.throws(() => parseProfile('plugins:\n  - Bad_Id\n'), /bad plugin id/); assert.throws(() => parseProfile('colour: red\n'), /unknown key/);
  assert.deepEqual(readProfile('desktop').plugins, [...ALL_PLACES, 'legacy']); ok('profiles: desktop lists every place plugin, then legacy; a commented line is off; bad lines refused'); }

// ---- in process: ctx.places through Cordis (no server: boot without the legacy plugin) ----
{ process.env.OPENHIGGSFIELD_FAL_KEY = 'fake-not-a-real-key';
  const { boot } = await import('../src/boot.js'); const { mount } = await import('../src/kernel/index.js');
  const { places } = await import('../src/services/places.js'); const { routesFor, findRoute } = await import('../src/routing/routes.js');
  const { option } = await import('../src/routing/select.js'); const { getTool } = await import('../src/tools/registry.js');
  const tool = getTool('create-image')!;
  assert.ok(routesFor(QWEN).some((r) => r.routeId === FAL_QWEN), 'before boot (scripts, tests): the built-in places are on');
  await assert.rejects(boot({ name: 't', plugins: ['place-fal', 'nope', 'legacy'], file: 't.yml' }, { legacy: false }), /unknown plugin "nope"/);
  await assert.rejects(boot({ name: 't', plugins: ['place-fal'], file: 't.yml' }, { legacy: false }), /needs the "legacy" plugin/);
  const ctx = await boot({ name: 't', plugins: [...without('place-fal'), 'legacy'], file: 't.yml' }, { legacy: false });
  assert.equal(places.managed, true); assert.equal(places.get('fal'), undefined); assert.equal(places.off('fal'), true); assert.equal(places.off('replicate'), false); assert.equal(places.off('local'), false);
  assert.ok(!routesFor(QWEN).some((r) => r.kind === 'fal') && routesFor(QWEN).some((r) => r.routeId === REP_QWEN), 'fal off: fal routes hidden, Replicate stays');
  const o = option(tool, findRoute(FAL_QWEN)!, {}); assert.equal(o.available, false); assert.equal(o.reasonCode, 'not_wired'); assert.equal(o.reason, 'fal isn’t set up in this app'); assert.equal(o.wired, false);
  const { default: placeFal } = await import('../src/plugins-builtin/place-fal.js');
  const fiber = ctx.plugin(placeFal as any); await fiber;
  assert.ok(places.get('fal') && routesFor(QWEN).some((r) => r.routeId === FAL_QWEN), 'mounting place-fal shows its routes again');
  assert.equal(option(tool, findRoute(FAL_QWEN)!, {}).available, true, 'and the fal route is ready (fake key, mock backend)');
  await fiber.dispose(); assert.equal(places.off('fal'), true, 'disposing place-fal hides fal again');
  void mount; ok('ctx.places: a profile without place-fal hides fal routes and says "not set up"; mount / dispose turn it on and off'); }

// ---- e2e: two mock servers, desktop profile vs no place-fal ----
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'place-plugins-')); const nofal = path.join(dir, 'nofal.yml');
fs.writeFileSync(nofal, `name: nofal\nplugins:\n${without('place-fal').map((x) => `  - ${x}\n`).join('')}  - legacy\n`);
const FAKE = { OPENHIGGSFIELD_FAL_KEY: 'fake-fal-not-real', OPENHIGGSFIELD_REPLICATE_API_TOKEN: 'fake-rep-not-real', FAL_KEY: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '', OPENHIGGSFIELD_ROUTING_LIVE: '' };
const servers: ChildProcess[] = [];
const boot = (port: number, extra: Record<string, string>) => { const p = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], { cwd: ROOT, detached: true, stdio: 'ignore',
  env: { ...process.env, ...FAKE, PORT: String(port), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_DEMO_AUTO: '0', OPENHIGGSFIELD_DATA_DIR: fs.mkdtempSync(path.join(dir, 'data-')), OPENHIGGSFIELD_ENV_FILE: path.join(dir, 'none.env'), ...extra } }); servers.push(p); return p; };
const api = (port: number) => { const B = `http://127.0.0.1:${port}`;
  const get = async (u: string) => { const r = await fetch(B + u); return { status: r.status, body: (await r.json()) as any }; };
  const job = async (f: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries({ prompt: 'a red bicycle', types: '["generate"]', ...f })) fd.append(k, v); const r = await fetch(`${B}/api/tools/create-image/jobs`, { method: 'POST', body: fd }); return { status: r.status, body: (await r.json()) as any }; };
  const ready = async () => { for (let i = 0; i < 240; i++) { try { if ((await fetch(`${B}/api/health`)).ok) return; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 250)); } throw new Error(`server ${port} did not start`); };
  return { get, job, ready }; };
const routeIds = (body: any) => (body.routes as any[]).flatMap((m) => m.routes.map((r: any) => r.routeId as string));
try {
  const pD = testPort(9471), pN = testPort(9472); boot(pD, {}); boot(pN, { OPENHIGGSFIELD_PROFILE: nofal }); const D = api(pD), N = api(pN); await Promise.all([D.ready(), N.ready()]);
  assert.equal((await D.get('/api/health')).body.backend, 'mock'); assert.equal((await N.get('/api/health')).body.backend, 'mock');
  // desktop: fal and Replicate listed and quoted as on main
  const dR = await D.get('/api/routes?toolId=create-image'); const nR = await N.get('/api/routes?toolId=create-image');
  assert.ok(routeIds(dR.body).includes(FAL_QWEN) && routeIds(dR.body).includes(REP_QWEN), 'desktop lists fal + Replicate');
  const dq = await D.get(`/api/models/quote?model=${QWEN}&route=${FAL_QWEN}`); assert.equal(dq.body.valid, true); assert.equal(dq.body.routeId, FAL_QWEN); assert.equal(dq.body.credits, 2); assert.equal(dq.body.runnable, true);
  ok('desktop profile: fal + Replicate routes listed; a fal quote is priced and runnable');
  // no place-fal: hidden, "not set up", refused
  assert.ok(!routeIds(nR.body).some((id) => id.startsWith('fal:')) && routeIds(nR.body).includes(REP_QWEN), 'no fal routes listed; Replicate stays');
  assert.deepEqual(routeIds(nR.body), routeIds(dR.body).filter((id) => !id.startsWith('fal:')), 'the only change: the fal routes are gone');
  const nq = await N.get(`/api/models/quote?model=${QWEN}&route=${FAL_QWEN}`); assert.equal(nq.body.valid, false); assert.equal(nq.body.runnable, false); assert.equal(nq.body.credits, null);
  assert.match(nq.body.reason, /^fal isn’t set up in this app/); assert.equal(nq.body.noProvider?.code, 'place_off');
  const auto = await N.get(`/api/models/quote?model=${QWEN}`); assert.equal(auto.body.routeKind, 'replicate', 'Auto picks the next place (Replicate)');
  const only = await N.get('/api/models/quote?model=fal-object-removal'); assert.equal(only.body.runnable, false); assert.match(only.body.reason, /fal isn’t set up in this app/);
  const before = (await N.get('/api/ledger')).body.entries?.length ?? 0;
  const sub = await N.job({ provider: QWEN, route: FAL_QWEN }); assert.equal(sub.status, 409); assert.equal(sub.body.code, 'place_off'); assert.match(sub.body.error, /Nothing was charged/);
  assert.equal((await N.get('/api/ledger')).body.entries?.length ?? 0, before, 'nothing charged');
  ok('profile without place-fal: fal routes hidden, quotes say fal isn’t set up, a fal submit is refused (409 place_off) and nothing is charged');
} finally { for (const p of servers) { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* gone */ } } }
