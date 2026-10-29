// Favourites, save and read back (2026-10-26 bug: heart a clip in the viewer, close, open it again: the heart was empty).
// Own mock server, temp data dir, no keys:
//  1  server: POST /api/jobs/:id/favourite {on} saves; GET /api/jobs/:id, GET /api/jobs?liked=1 and GET /api/assets?section=favourites read it back
//     (local and cloud runs alike); {on:false} takes it out again; it survives a server restart (SQLite job_meta).
//  2  client store (web/src/shared/favourites.ts), the one source every heart reads: after a save, a stale cached job object
//     (favourite:false, what the feed held) still shows the heart filled; a rapid double click ends on the last click on the server;
//     a failed save rolls back to the last saved value and says so; noteFavourites (bulk Like) updates every heart.
// Run: npx tsx test/favourites.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const PORT = testPort(9291); const B = `http://localhost:${PORT}`; const ok = (m: string) => console.log('ok ' + m);
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '' };
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'fav-'));
const boot = () => spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PATH: `/opt/homebrew/bin:${process.env.PATH}`, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'none.env'),
  OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '200', OPENHIGGSFIELD_MOCK_KEYS: '1' }, stdio: 'ignore', detached: true });
const stop = async (c: ChildProcess) => { try { process.kill(-c.pid!, 'SIGTERM'); } catch { /* gone */ } for (let i = 0; i < 50; i++) { try { await fetch(`${B}/api/health`); } catch { return; } await new Promise((r) => setTimeout(r, 100)); } };
const up = async () => { for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) return; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 500)); } throw new Error('server did not start'); };
const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
const post = async (u: string, body: unknown) => { const r = await fetch(B + u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); assert.equal(r.status, 200); return r.json() as any; };
const job = async (tool: string, f: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v); const r = await fetch(`${B}/api/tools/${tool}/jobs`, { method: 'POST', body: fd }); const b = await r.json() as any; assert.equal(r.status, 200, JSON.stringify(b)); return b; };
const until = async (id: string) => { for (let i = 0; i < 200; i++) { const j = await get(`/api/jobs/${id}`); if (!['queued', 'running'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 100)); } throw new Error('timeout ' + id); };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

let p = boot();
try {
  await up();
  const v = await job('h3-video', { prompt: 'Top-down game scene: the small round slime monster bounces gently', types: '["t2v"]', rights: '1' }); const vj = await until(v.id);
  const im = await job('create-image', { prompt: 'a red kite', types: '["generate"]', rights: '1' }); await until(im.id);
  assert.equal(vj.status, 'done'); assert.equal(vj.favourite, false);

  // 1 server
  const saved = await post(`/api/jobs/${v.id}/favourite`, { on: true }); assert.equal(saved.favourite, true, 'the POST answer carries the new value');
  assert.equal((await get(`/api/jobs/${v.id}`)).favourite, true, 'GET /api/jobs/:id reads it back');
  const liked = await get('/api/jobs?liked=1&limit=50&cursor='); assert.deepEqual(liked.items.map((j: any) => j.id), [v.id], 'the Liked filter lists it');
  const feed = await get('/api/jobs?toolId=h3-video&limit=50&cursor='); assert.equal(feed.items.find((j: any) => j.id === v.id)?.favourite, true, 'the feed page carries favourite');
  assert.deepEqual((await get('/api/assets?section=favourites')).map((j: any) => j.id), [v.id], 'Assets › Favourites lists it');
  await post(`/api/jobs/${im.id}/favourite`, { on: true });
  await stop(p); p = boot(); await up();
  assert.equal((await get(`/api/jobs/${v.id}`)).favourite, true, 'still a favourite after a server restart');
  assert.equal((await get(`/api/jobs/${im.id}`)).favourite, true);
  await post(`/api/jobs/${im.id}/favourite`, { on: false }); assert.equal((await get(`/api/jobs/${im.id}`)).favourite, false, 'off reads back off');
  assert.deepEqual((await get('/api/assets?section=favourites')).map((j: any) => j.id), [v.id]);
  assert.equal((await fetch(`${B}/api/jobs/nope/favourite`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"on":true}' })).status, 404);
  ok('server: favourite saves, reads back from the job, the feed page, Liked and Assets › Favourites, survives a restart, and turns off');

  // 2 client store (the page's fetch is relative: point it at this server)
  const realFetch = globalThis.fetch; let failNext = 0;
  globalThis.fetch = ((u: any, o?: any) => { const url = typeof u === 'string' && u.startsWith('/') ? B + u : u;
    if (failNext > 0 && String(url).includes('/favourite')) { failNext--; return Promise.resolve(new Response(JSON.stringify({ error: 'server is down' }), { status: 500, headers: { 'content-type': 'application/json' } })); }
    return realFetch(url, o); }) as typeof fetch;
  const S = await import('../../web/src/shared/favourites.ts');
  const toasts: [string, string | undefined][] = []; const toast = (m: string, k?: any) => { toasts.push([m, k]); };
  const stale = { id: im.id, favourite: false }; /* what the feed's cached list still holds */
  const pr = S.toggleFavourite(stale, toast); assert.equal(S.favOf(stale), true, 'optimistic: the heart fills before the server answers');
  assert.equal(await pr, true); assert.equal((await get(`/api/jobs/${im.id}`)).favourite, true, 'saved on the server');
  assert.equal(S.favOf(stale), true, 'reopening with the stale cached job still shows it filled (the bug)');
  assert.equal(S.favOf({ id: im.id, favourite: false }), true, 'a fresh stale copy too');
  assert.deepEqual(toasts.pop(), ['Added to Favourites', undefined]);
  // rapid double click: on → off, one request at a time, ends off
  const a = S.toggleFavourite(stale, toast); const b = S.toggleFavourite(stale, toast); assert.equal(S.favOf(stale), true, 'two clicks from filled: filled→empty→filled shows the last click');
  await Promise.all([a, b]); assert.equal((await get(`/api/jobs/${im.id}`)).favourite, true, 'the server ends on the last click'); assert.equal(toasts.length, 1, 'one toast for the burst');
  toasts.length = 0;
  // failure: rolls back to the last saved value with a message
  failNext = 1; const f = S.saveFavourite(stale, false, toast); assert.equal(S.favOf(stale), false, 'optimistic off');
  assert.equal(await f, false); assert.equal(S.favOf(stale), true, 'rolled back'); assert.equal((await get(`/api/jobs/${im.id}`)).favourite, true);
  assert.match(toasts[0][0], /Couldn’t update Favourites: server is down/); assert.equal(toasts[0][1], 'error');
  // a bulk change the server already made
  S.noteFavourites([v.id], false); assert.equal(S.favOf({ id: v.id, favourite: true }), false, 'bulk Like / Unlike shows in every heart');
  // a job the store never saw reads the job's own value
  assert.equal(S.favOf({ id: 'other', favourite: true }), true); assert.equal(S.favOf(null), false);
  globalThis.fetch = realFetch;
  ok('client store: optimistic, read back over a stale cached job, rapid clicks end on the last one, a failed save rolls back with a message');
} finally { await stop(p); fs.rmSync(D, { recursive: true, force: true }); }
process.exit(0);
