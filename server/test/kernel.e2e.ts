// Kernel (plan Phase 1: kernel/http.ts, settings.ts, keys.ts, db.ts, dump.ts; boot.ts, plugins-builtin/legacy.ts).
//  - ctx.http: hook stages run security → normal → final whatever order they were added in; a security refusal stops the rest; a plugin's
//    route answers like an unknown route once the plugin is disposed; no route after listen.
//  - ctx.settings: the env is read once (later changes don't count); profile → env → kv; filming mode applies before the first read.
//  - ctx.keys: a plugin reads only the keys it declared; fal/Replicate routes only name keys their place plugins declare.
//  - ctx.db: plugin tables are <plugin>_*.
//  - --dump-config: plugins, routes per plugin, settings; no key value anywhere; your data folder untouched.
//  - legacy: boots the real server in this process; disposing the plugin closes it.
// Run: npx tsx test/kernel.e2e.ts
import assert from 'node:assert/strict'; import { execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { z } from 'zod';
import { testPort } from './_ports.js';
const ok = (m: string) => console.log('ok ' + m);
const ROOT = path.resolve(import.meta.dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kernel-'));

// Env for this process, set before anything reads it (the settings snapshot is taken on first read).
const profileFile = path.join(dir, 'k.yml');
fs.writeFileSync(profileFile, 'name: k\nplugins:\n  - place-comfy-local\n  - place-comfy-cloud\n  - place-comfy-router\n  - place-fal\n  - place-replicate\n  - place-direct\n  - place-sample\n  - legacy\nconfig:\n  kernel:\n    resultTtlDays: 0\n  t-plug:\n    pollMs: 100\n    label: from-profile\n    fast: true\n');
Object.assign(process.env, { OPENHIGGSFIELD_PROFILE: profileFile, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_DATA_DIR: path.join(dir, 'data'), OPENHIGGSFIELD_ENV_FILE: path.join(dir, 'none.env'),
  OPENHIGGSFIELD_FILMING_FILE: path.join(dir, 'no-filming.json'), OPENHIGGSFIELD_COMFY_DETECT_URLS: 'http://127.0.0.1:9', OPENHIGGSFIELD_DEMO_AUTO: '0',
  OPENHIGGSFIELD_T_PLUG_POLL_MS: '250', OPENHIGGSFIELD_FAL_KEY: 'fake-fal-kernel-test', PORT: String(testPort(9481)) });

// ---- profile config blocks ----
{ const { parseProfile } = await import('../src/kernel/profile.js');
  assert.deepEqual(parseProfile(fs.readFileSync(profileFile, 'utf8'), 'k.yml').config, { kernel: { resultTtlDays: 0 }, 't-plug': { pollMs: 100, label: 'from-profile', fast: true } });
  assert.throws(() => parseProfile('config:\n  x:\n  - a\n'), /can't read/); ok('profile: config blocks per plugin (scalars)'); }

// ---- ctx.settings: read once, profile → env → kv ----
{ const S = await import('../src/kernel/settings.js');
  const k = S.bootSettings(); assert.equal(k.backend, 'mock'); assert.equal(k.dataDir, path.join(dir, 'data')); assert.equal(k.port, testPort(9481)); assert.equal(k.profile, 'k');
  process.env.OPENHIGGSFIELD_BACKEND = 'comfy'; process.env.OPENHIGGSFIELD_T_PLUG_POLL_MS = '999';
  const { config, DATA_DIR } = await import('../src/config.js');
  assert.equal(S.bootSettings().backend, 'mock'); assert.equal(config.backend, 'mock'); assert.equal(DATA_DIR, path.join(dir, 'data')); assert.equal(S.envReads, 1, 'the env is read once');
  process.env.OPENHIGGSFIELD_BACKEND = 'mock';
  const schema = z.object({ pollMs: z.number(), label: z.string(), fast: z.boolean(), retries: z.number().default(3) });
  assert.deepEqual(S.pluginSettings('t-plug', schema), { pollMs: 250, label: 'from-profile', fast: true, retries: 3 }, 'env (as read at boot) wins over the profile');
  S.setSettingsKv((key) => (key === 'settings.t-plug' ? { label: 'saved-in-app' } : null));
  assert.equal(S.pluginSettings('t-plug', schema).label, 'saved-in-app', 'kv wins over env and profile'); S.setSettingsKv(null);
  assert.throws(() => S.pluginSettings('t-plug', z.object({ pollMs: z.string() })), /settings for t-plug: pollMs/);
  assert.equal(S.envNameOf('place-fal', 'pollMs'), 'OPENHIGGSFIELD_PLACE_FAL_POLL_MS');
  assert.ok(!Object.keys(S.snapshot().env).some((x) => /KEY|TOKEN/.test(x)), 'no key in the settings snapshot');
  ok('ctx.settings: env read once (later changes ignored), profile → env → kv, zod-checked, no keys in the snapshot'); }

// ---- filming mode applies before the first settings read (own process: the filming file must exist before env.ts loads) ----
{ const scratch = path.join(dir, 'film-scratch'); const state = path.join(dir, 'filming.json');
  fs.writeFileSync(state, JSON.stringify({ on: true, dataDir: scratch, since: '2026-11-06T00:00:00Z' }));
  const out = execFileSync(process.execPath, ['--import', 'tsx', '-e', "const S = await import('./src/kernel/settings.ts'); const C = await import('./src/config.ts'); console.log('R' + JSON.stringify({ dataDir: C.DATA_DIR, k: S.bootSettings(), key: !!process.env.COMFY_API_KEY, reads: S.envReads, names: Object.keys(S.snapshot().env) })); process.exit(0);"],
    { cwd: ROOT, env: { ...process.env, OPENHIGGSFIELD_FILMING_FILE: state, OPENHIGGSFIELD_DATA_DIR: path.join(dir, 'real-data'), COMFY_API_KEY: 'fake-comfy-from-shell', OPENHIGGSFIELD_PROFILE: '' } }).toString();
  const r = JSON.parse(out.split('\n').find((l) => l.startsWith('R'))!.slice(1));
  assert.equal(r.dataDir, scratch); assert.equal(r.k.dataDir, scratch); assert.equal(r.k.filming, true); assert.equal(r.key, false, 'shell keys dropped before the read');
  assert.equal(r.k.envFile, path.join(scratch, '.env.local')); assert.equal(r.reads, 1); assert.ok(!fs.existsSync(path.join(dir, 'real-data')), 'the real data dir is never opened');
  ok('filming mode: applied before the settings snapshot (scratch data dir, scratch env file, shell keys ignored)'); }

// ---- ctx.http: stage order, refusal, route switches ----
{ const { Http, HttpService } = await import('../src/kernel/http.js'); const { createRoot, mount, definePlugin } = await import('../src/kernel/index.js');
  const h = new Http((await import('fastify')).default()); const seen: string[] = [];
  const mark = (n: string) => async () => { seen.push(n); };
  h.hook('onRequest', mark('final-1'), { stage: 'final' }); h.hook('onRequest', mark('normal-1')); h.app.addHook('onRequest', mark('direct'));
  h.hook('onRequest', mark('security-1'), { stage: 'security' }); h.hook('onRequest', mark('normal-2'), { stage: 'normal' });
  h.hook('onRequest', async (req, reply) => { if (req.url === '/blocked') return reply.code(403).send({ error: 'no' }); }, { stage: 'security' });
  h.hook('onSend', async (_q, _r, p) => `${p}+normal`); h.hook('onSend', async (_q, _r, p) => `${p}+final`, { stage: 'final' }); h.hook('onSend', async (_q, _r, p) => `${p}+security`, { stage: 'security' });
  h.app.get('/x', async (_q, reply) => reply.type('text/plain').send('x')); h.app.get('/blocked', async () => 'never');
  assert.throws(() => h.hook('onRequest', mark('?'), { stage: 'first' as any }), /unknown stage/);
  await h.ready();
  const r = await h.app.inject({ url: '/x' }); assert.equal(r.body, 'x+security+normal+final');
  assert.deepEqual(seen, ['security-1', 'normal-1', 'normal-2', 'direct', 'final-1'], 'security first, final last, whatever the order they were added in');
  seen.length = 0; const b = await h.app.inject({ url: '/blocked' }); assert.equal(b.statusCode, 403); assert.deepEqual(seen, ['security-1'], 'a security refusal stops every later hook');
  assert.throws(() => h.route({ method: 'GET', url: '/late', handler: async () => 1 }), /added at boot/);
  ok('ctx.http: hook stages security → normal (incl. plain app.addHook) → final, payloads chained, a refusal stops the rest');

  const root = createRoot(); await mount(root, HttpService); const http = (root as any).http.server as InstanceType<typeof Http>;
  http.app.setNotFoundHandler((req, reply) => reply.code(404).send({ error: `No API route ${req.method} ${req.url}`, errorType: 'not_found' }));
  const plug = definePlugin({ name: 't-routes', inject: ['http'], apply(ctx) { ctx.http.route({ method: 'GET', url: '/api/t-routes/ping', handler: async () => ({ pong: true }) }); } });
  const fiber = root.plugin(plug as any); await fiber;
  await http.ready();
  assert.deepEqual((await http.app.inject({ url: '/api/t-routes/ping' })).json(), { pong: true });
  assert.ok(http.routesBy()['t-routes'].includes('GET /api/t-routes/ping'));
  await fiber.dispose();
  const off = await http.app.inject({ url: '/api/t-routes/ping' }); assert.equal(off.statusCode, 404); assert.deepEqual(off.json(), { error: 'No API route GET /api/t-routes/ping', errorType: 'not_found' }, 'answers like an unknown route');
  assert.ok(http.routesBy()['t-routes'].includes('GET /api/t-routes/ping (off)'));
  http.setActive('t-routes', true); assert.equal((await http.app.inject({ url: '/api/t-routes/ping' })).statusCode, 200, 'and on again');
  await http.close(); ok('ctx.http: a plugin\'s routes are owned by it; disposing it turns them into 404 not_found (plan R2)'); }

// ---- ctx.keys: only declared keys ----
{ const { createRoot, mount, definePlugin } = await import('../src/kernel/index.js'); const { KeysService, KeyNotDeclared } = await import('../src/kernel/keys.js');
  const root = createRoot(); await mount(root, KeysService); const got: Record<string, unknown> = {};
  const nosy = definePlugin({ name: 't-nosy', inject: ['keys'], apply(ctx) { try { got.nosy = ctx.keys.get('OPENHIGGSFIELD_FAL_KEY'); } catch (e) { got.nosy = e; } } });
  const falish = definePlugin({ name: 't-falish', inject: ['keys'], keys: ['OPENHIGGSFIELD_FAL_KEY', 'FAL_KEY'], apply(ctx) { got.falish = ctx.keys.value({ envKey: 'OPENHIGGSFIELD_FAL_KEY', envAliases: ['FAL_KEY'] }); got.ready = ctx.keys.configured({ envKey: 'OPENHIGGSFIELD_FAL_KEY', envAliases: ['FAL_KEY'] });
    try { ctx.keys.configured({ envKey: 'COMFY_API_KEY', envAliases: [] }); } catch (e) { got.other = e; } } });
  await mount(root, nosy); await mount(root, falish);
  assert.ok(got.nosy instanceof KeyNotDeclared && /t-nosy" did not declare OPENHIGGSFIELD_FAL_KEY/.test((got.nosy as Error).message), 'a plugin without the key can\'t read it');
  assert.ok(!(got.nosy as Error).message.includes('fake-fal-kernel-test'), 'the refusal never shows the value');
  assert.equal(got.falish, 'fake-fal-kernel-test'); assert.equal(got.ready, true); assert.ok(got.other instanceof KeyNotDeclared, 'nor any other key');
  const { allRoutesFor } = await import('../src/routing/routes.js'); const { listTools } = await import('../src/tools/registry.js');
  const seenR = new Map<string, any>(); for (const t of listTools()) for (const id of t.providers) for (const r of allRoutesFor(id, t)) seenR.set(r.routeId, r); const allRoutes = [...seenR.values()];
  const { default: pf } = await import('../src/plugins-builtin/place-fal.js'); const { default: pr } = await import('../src/plugins-builtin/place-replicate.js');
  for (const r of allRoutes.filter((x) => x.kind === 'fal' || x.kind === 'replicate')) { const decl = (r.kind === 'fal' ? pf : pr).keys as string[];
    for (const k of [r.envKey, ...(r.envAliases ?? [])].filter(Boolean)) assert.ok(decl.includes(k), `${r.routeId}: ${k} is declared by its place plugin`); }
  ok(`ctx.keys: undeclared keys refused (KeyNotDeclared), declared ones read; ${allRoutes.filter((x) => x.kind === 'fal' || x.kind === 'replicate').length} fal/Replicate routes only name declared keys`); }

// ---- ctx.db: plugin tables ----
{ const { tableName, DbService } = await import('../src/kernel/db.js'); const { createRoot, mount, definePlugin } = await import('../src/kernel/index.js');
  assert.equal(tableName('place-fal', 'requests'), 'place_fal_requests'); assert.throws(() => tableName('p', 'x; drop table jobs'), /bad table name/);
  const root = createRoot(); await mount(root, DbService); const got: Record<string, unknown> = {};
  await mount(root, definePlugin({ name: 't-db', inject: ['db'], apply(ctx) { const t = ctx.db.ensureTable('notes'); ctx.db.prepare(`INSERT INTO ${t} (id, data) VALUES (?, ?)`).run('a', '{}');
    got.n = (ctx.db.prepare(`SELECT count(*) AS n FROM ${t}`).get() as any).n; try { ctx.db.prepare('SELECT * FROM jobs'); } catch (e) { got.err = String(e); }
    ctx.db.kv.set('x', 1); got.kv = ctx.db.kv.get('x', 0); } }));
  assert.equal(got.n, 1); assert.match(String(got.err), /only use its own tables \(t_db_\*\), not jobs/); assert.equal(got.kv, 1);
  ok('ctx.db: plugin tables are <plugin>_*; the app\'s own tables are out of reach; kv per plugin'); }

// ---- --dump-config: no secrets, data folder untouched ----
{ const data = path.join(dir, 'dump-data'); const FAKE = { OPENHIGGSFIELD_FAL_KEY: 'fake-dump-fal-secret', COMFY_API_KEY: 'comfyui-fake-dump-secret', OPENHIGGSFIELD_HF_TOKEN: 'hf_fakedumpsecret', OPENHIGGSFIELD_BFL_API_KEY: 'fake-bfl-dump-secret' };
  const out = execFileSync(process.execPath, ['--import', 'tsx', 'src/index.ts', '--dump-config'], { cwd: ROOT, env: { ...process.env, ...FAKE, OPENHIGGSFIELD_DATA_DIR: data, OPENHIGGSFIELD_PROFILE: '' }, maxBuffer: 64 << 20 }).toString();
  for (const v of Object.values(FAKE)) assert.ok(!out.includes(v), 'no key value in the dump');
  const d = JSON.parse(out); assert.equal(d.profile.name, 'desktop'); assert.equal(d.settings.dataDir, data); assert.ok(!fs.existsSync(data), 'the data folder is never opened');
  assert.deepEqual(d.plugins.filter((p: any) => !/kernel service/.test(p.id)).map((p: any) => [p.id, p.state]), [...['place-comfy-local', 'place-comfy-cloud', 'place-comfy-router', 'place-fal', 'place-replicate', 'place-sunra', 'place-direct', 'place-sample'].map((id) => [id, 'active']), ['legacy', 'active']]);
  assert.ok(d.routes.legacy.includes('GET /api/health') && d.routes.legacy.length > 400, 'routes per plugin');
  assert.deepEqual(d.hooks.find((x: any) => x.owner === 'local-only'), { name: 'onRequest', stage: 'security', owner: 'local-only' });
  assert.equal(d.keys.find((k: any) => k.name === 'COMFY_API_KEY').set, true);
  const e = execFileSync(process.execPath, ['--import', 'tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...FAKE, OPENHIGGSFIELD_DUMP_CONFIG: '1', OPENHIGGSFIELD_DATA_DIR: data, OPENHIGGSFIELD_PROFILE: '' }, maxBuffer: 64 << 20 }).toString();
  assert.equal(JSON.parse(e).profile.name, 'desktop', 'OPENHIGGSFIELD_DUMP_CONFIG=1 works too');
  ok('--dump-config: profile, settings, plugins with state, routes per plugin, hook stages; no key value; data folder untouched'); }

// ---- legacy: the real server in this process; disposing the plugin closes it ----
{ const { boot } = await import('../src/boot.js'); const { mounted } = await import('../src/kernel/index.js');
  const ctx = await boot(); const B = `http://127.0.0.1:${testPort(9481)}`;
  const h = await (await fetch(`${B}/api/health`)).json() as any; assert.equal(h.backend, 'mock');
  assert.equal((await fetch(`${B}/api/health`, { headers: { origin: 'https://evil.example' } })).status, 403, 'local-only still first');
  const http = (ctx as any).http.server; assert.ok(http.routesBy().legacy.length > 400);
  const legacy = mounted.filter((m) => m.name === 'legacy').at(-1)!; await legacy.fiber.dispose();
  await assert.rejects(fetch(`${B}/api/health`), 'the port is closed'); assert.equal(http.listening, false);
  ok('legacy: serves through ctx.http; disposing the plugin closes the server'); }

fs.rmSync(dir, { recursive: true, force: true });
process.exit(0); // the queue's timers keep the loop alive
