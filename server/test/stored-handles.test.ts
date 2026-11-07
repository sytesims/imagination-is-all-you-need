// Stored provider handles (security review 2026-11-07, F3 backup path).
//  - A job.remote whose URLs are off the provider's hosts can't be picked up, collected or cancelled (fal, the labs, Comfy Router), so the
//    key is never sent there; good handles still can.
//  - After a backup is applied, its job.remote URL fields, the webhooks and the addresses in saved plugin settings are cleared (counts
//    returned); ids and everything else stay.
// Run: npx tsx test/stored-handles.test.ts (in process, temp data dir, no network, fake keys only).
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ok = (m: string) => console.log('ok ' + m);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stored-handles-'));
Object.assign(process.env, { OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_DATA_DIR: dir, OPENHIGGSFIELD_ENV_FILE: path.join(dir, 'none.env'), OPENHIGGSFIELD_COMFY_DETECT_URLS: 'http://127.0.0.1:9',
  OPENHIGGSFIELD_FAL_KEY: 'fake-fal-stored', COMFY_API_KEY: 'fake-comfy-stored', OPENHIGGSFIELD_BFL_API_KEY: 'fake-bfl-stored' });
delete process.env.OPENHIGGSFIELD_COMFY_ROUTER_URL; delete process.env.OPENHIGGSFIELD_BFL_BASE_URL;

await import('../src/services/placesBuiltin.js');
const { canPickUp, cancelRemote, setReattachFetch } = await import('../src/routing/reattach.js');
const base = { attempt: 1, output: 0, outputs: 1, at: Date.now() };
const fal = (u: string) => ({ ...base, kind: 'fal' as const, routeId: 'fal:x', id: 'r1', statusUrl: `${u}/requests/r1/status`, responseUrl: `${u}/requests/r1`, cancelUrl: `${u}/requests/r1/cancel` });
const router = (u: string) => ({ ...base, kind: 'router' as const, routeId: 'comfy-router:x', id: 'r2', statusUrl: `${u}/status`, responseUrl: `${u}/r`, cancelUrl: `${u}/cancel` });
const lab = (u: string, model = 'bfl') => ({ ...base, kind: 'direct' as const, routeId: 'direct:x', id: 'r3', pollUrl: u, model });

// ---- pick-up / Retry download ----
{ assert.equal(canPickUp(fal('https://queue.fal.run/fal-ai/x')), true);
  assert.equal(canPickUp(fal('https://evil.example/fal-ai/x')), false);
  assert.equal(canPickUp({ ...fal('https://queue.fal.run/fal-ai/x'), cancelUrl: 'https://evil.example/c' }), false, 'one bad URL is enough');
  assert.equal(canPickUp(router('https://api.comfy.org/v2/models/a/b/requests/r2')), true);
  assert.equal(canPickUp(router('https://evil.example/v2')), false);
  assert.equal(canPickUp(router('https://cloud.comfy.org/v2')), false, 'Router handles stay on the Router base itself');
  assert.equal(canPickUp(lab('https://api.us1.bfl.ai/v1/get_result?id=1')), true);
  assert.equal(canPickUp(lab('https://evil.example/v1/get_result?id=1')), false);
  assert.equal(canPickUp(lab('https://api.bfl.ai/v1/get_result?id=1', 'minimax')), false, 'another lab’s host');
  assert.equal(canPickUp(lab('http://api.bfl.ai/v1/get_result?id=1')), false, 'never plain http');
  ok('pick-up and Retry download: only handles on the provider’s own hosts (fal, Router base, the lab’s hosts)'); }

// ---- cancel ----
{ const sent: string[] = []; setReattachFetch((async (u: any) => { sent.push(String(u)); return new Response('{}', { status: 202 }); }) as typeof fetch);
  const { allRoutesFor } = await import('../src/routing/routes.js'); const { listTools } = await import('../src/tools/registry.js');
  const routes = listTools().flatMap((t) => t.providers.flatMap((id: string) => allRoutesFor(id, t)));
  const falRoute = routes.find((r) => r.kind === 'fal'); const routerRoute = routes.find((r) => r.kind === 'comfy-router');
  assert.ok(falRoute && routerRoute, 'a fal and a Router route exist');
  assert.equal(await cancelRemote({ ...fal('https://evil.example/x'), routeId: falRoute!.routeId }), null);
  assert.equal(await cancelRemote({ ...router('https://evil.example/x'), routeId: routerRoute!.routeId }), false);
  assert.deepEqual(sent, [], 'nothing sent to the other host');
  assert.equal(await cancelRemote({ ...fal('https://queue.fal.run/fal-ai/x'), routeId: falRoute!.routeId }), true); assert.deepEqual(sent, ['https://queue.fal.run/fal-ai/x/requests/r1/cancel']);
  setReattachFetch(null);
  ok('cancel: a stored cancel URL off the provider’s hosts is never called; fal’s own still is'); }

// ---- backup import scrub ----
{ const Database = (await import('better-sqlite3')).default; const { scrubImportedLibrary } = await import('../src/security/importScrub.js');
  const db = new Database(':memory:'); for (const t of ['jobs', 'kv']) db.exec(`CREATE TABLE ${t} (id TEXT PRIMARY KEY, data TEXT NOT NULL)`);
  const put = (t: string, id: string, v: unknown) => db.prepare(`INSERT INTO ${t} (id, data) VALUES (?, ?)`).run(id, JSON.stringify(v));
  put('jobs', 'j1', { id: 'j1', status: 'running', remote: fal('https://evil.example/x') }); put('jobs', 'j2', { id: 'j2', status: 'done', remote: null });
  put('jobs', 'j3', { id: 'j3', status: 'failed', remote: lab('https://evil.example/p') }); put('jobs', 'j4', { id: 'j4', status: 'failed', remote: { ...base, kind: 'replicate', routeId: 'replicate:x', id: 'p1' } });
  put('kv', 'webhooks', { j1: { url: 'https://evil.example/hook', sent: [] } }); put('kv', 'settings.place-kie', { baseUrl: 'https://evil.example', uploadBaseUrl: 'https://evil.example/u', pollMs: 5 });
  put('kv', 'settings.place-runpod', { endpointId: 'abc' }); put('kv', 'plugins.choices', { on: {}, safeMode: false });
  const s = scrubImportedLibrary(db); assert.deepEqual(s, { jobs: 2, webhooks: true, settings: 1 });
  const row = (t: string, id: string) => { const r = db.prepare(`SELECT data FROM ${t} WHERE id = ?`).get(id) as { data: string } | undefined; return r ? JSON.parse(r.data) : undefined; };
  assert.deepEqual(row('jobs', 'j1').remote, { ...base, kind: 'fal', routeId: 'fal:x', id: 'r1' }, 'the id stays, the URLs go');
  assert.equal(row('jobs', 'j3').remote.pollUrl, undefined); assert.equal(row('jobs', 'j4').remote.id, 'p1');
  assert.equal(row('kv', 'webhooks'), undefined); assert.deepEqual(row('kv', 'settings.place-kie'), { pollMs: 5 }); assert.deepEqual(row('kv', 'settings.place-runpod'), { endpointId: 'abc' });
  assert.deepEqual(row('kv', 'plugins.choices'), { on: {}, safeMode: false });
  assert.equal(canPickUp(row('jobs', 'j1').remote), false, 'an imported run is not picked up');
  ok('backup import: job.remote URLs, webhooks and plugin base URLs cleared; ids and other settings kept'); }
