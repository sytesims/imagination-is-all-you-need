// Result feed filter, data rules (2026-10-25): "deleted clips come back when I sort by Oldest". GET /api/jobs (the feed's list) never returns a
// trashed job in either order or with any filter (Show, search, project, liked, failed), paging is stable (pages join to the full list with no
// gaps or repeats, total = what is listed), ?counts=failed matches the Failed list, and ?ids= (the page's poll) marks trashed jobs with deletedAt
// so the page drops them. The client half (feedFilter liveExtras, chip count, saved filter) is in feed-filter-state.test.ts.
// Run: npx tsx test/feed-filter.e2e.ts (port 9275; temp data dir, mock backend, mock keys, no network).
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { FEED_STATUS } from '../../web/src/ui/next/feed/feedFilter.ts';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'feedfilter-')); const ok = (m: string) => console.log('ok ' + m);
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_BILLING_MODE: '' };
const PORT = testPort(9275); const B = `http://localhost:${PORT}`;
const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PATH: `/opt/homebrew/bin:${process.env.PATH}`, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_SEED_FEATURED: '0' /* counts your own results only (no Examples project) */, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'none.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_MOCK_DELAY_MS: '20', OPENHIGGSFIELD_HOSTED: '' }, stdio: 'ignore', detached: true });
const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
const post = async (u: string, b: unknown) => { const r = await fetch(B + u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return (await r.json()) as any; };
const until = async (id: string) => { for (let i = 0; i < 600; i++) { const j = await get(`/api/jobs/${id}`); if (!['queued', 'running'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 100)); } throw new Error('job did not end'); };
const clip = async (prompt: string, simulate?: string) => { const f = new FormData(); for (const [k, v] of Object.entries({ prompt, provider: 'comfy-h3', route: 'auto', seconds: '6', types: '["t2v"]', rights: '1', ...(simulate ? { simulate } : {}) })) f.set(k, v);
  const r = (await (await fetch(`${B}/api/tools/h3-video/jobs`, { method: 'POST', body: f })).json()) as any; assert.ok(r.id, JSON.stringify(r)); const j = await until(r.id); await new Promise((r2) => setTimeout(r2, 15)); return j; };
/** every page of a feed query (limit n), joined */
const all = async (q: string, n: number) => { const out: any[] = []; let cursor = ''; let total = -1; for (let i = 0; i < 50; i++) { const pg = await get(`/api/jobs?toolId=h3-video&${q}&limit=${n}&cursor=${cursor}`); total = pg.total; out.push(...pg.items); if (!pg.nextCursor) break; cursor = pg.nextCursor; } return { items: out, total }; };
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  assert.equal((await get('/api/health')).backend, 'mock');
  const proj = await post('/api/projects', { name: 'Reel' });
  // 9 clips: 6 finished, 2 failed, 1 blocked; then trash 2 finished + 1 failed, like 2 (one of them trashed), file 3 in a project (one trashed)
  const js: any[] = [];
  for (const [prompt, sim] of [['fox in snow'], ['neon city'], ['waves', 'temporary'], ['cat astronaut', 'nsfw'], ['sunrise fox'], ['old street'], ['paper boat', 'temporary'], ['forest drone'], ['candle']] as [string, string?][]) js.push(await clip(prompt, sim));
  const id = (prompt: string) => js.find((j) => j.input?.prompt === prompt)!.id as string;
  const trashed = [id('fox in snow'), id('old street'), id('paper boat')];
  await post('/api/jobs/bulk', { ids: [id('neon city'), id('fox in snow')], action: 'like' });
  await post('/api/jobs/bulk', { ids: [id('sunrise fox'), id('fox in snow'), id('candle')], action: 'project', projectId: proj.id });
  const tr = await post('/api/jobs/bulk', { ids: trashed, action: 'trash' }); assert.deepEqual([...tr.done].sort(), [...trashed].sort());

  // ---- trashed never listed: both orders, every Show, search, project, liked, any page size ----
  const queries = [`status=${FEED_STATUS}`, 'status=failed,blocked', `status=${FEED_STATUS}&liked=1`, `status=${FEED_STATUS}&q=fox`, `status=${FEED_STATUS}&project=${proj.id}`, 'status=failed,blocked&q=boat', ''];
  for (const q of queries) for (const order of ['desc', 'asc']) for (const n of [1, 2, 60]) {
    const r = await all(`${q}&order=${order}`, n); const ids = r.items.map((j) => j.id);
    for (const t of trashed) assert.ok(!ids.includes(t), `trashed ${t} listed for "${q}" ${order} limit ${n}`);
    assert.equal(new Set(ids).size, ids.length, `no repeats across pages (${q} ${order} ${n})`);
    assert.equal(r.total, ids.length, `total = what is listed (${q} ${order} ${n})`);
    assert.ok(r.items.every((j) => !j.deletedAt), 'no item carries deletedAt');
  }
  ok('trashed clips are never listed: Newest and Oldest, All / Liked / Failed, search, project, every page size; pages join with no repeats; total = listed');

  // ---- the two orders are the same set, reversed; Oldest is oldest first ----
  const nw = (await all(`status=${FEED_STATUS}&order=desc`, 2)).items.map((j) => j.id); const od = (await all(`status=${FEED_STATUS}&order=asc`, 2)).items.map((j) => j.id);
  assert.deepEqual(od, [...nw].reverse(), 'Oldest = Newest reversed'); assert.deepEqual(nw, [id('candle'), id('forest drone'), id('sunrise fox'), id('neon city')], 'the main feed: finished clips only, newest first');
  ok('Newest and Oldest list the same clips (finished ones; failed sit under Failed), in opposite order');

  // ---- counts: the toolbar numbers match what each Show lists ----
  const main = await get(`/api/jobs?toolId=h3-video&status=${FEED_STATUS}&order=asc&cursor=&counts=failed`); const failedList = await all('status=failed,blocked&order=asc', 60);
  assert.equal(main.total, 4); assert.equal(main.failed, failedList.total, '"N failed" = the Failed list'); assert.equal(main.failed, 2, 'waves (failed) + cat astronaut (blocked); the trashed failed run is left out');
  assert.equal((await get(`/api/jobs?toolId=h3-video&status=${FEED_STATUS}&cursor=`)).failed, undefined, 'failed only when asked');
  const liked = await all(`status=${FEED_STATUS}&liked=1&order=asc`, 60); assert.deepEqual(liked.items.map((j) => j.id), [id('neon city')], 'Liked: the trashed liked clip is left out');
  const inProj = await all(`status=${FEED_STATUS}&project=${proj.id}&order=asc`, 60); assert.deepEqual(inProj.items.map((j) => j.id), [id('sunrise fox'), id('candle')]);
  const counts = await get('/api/assets/counts'); assert.equal(counts.trash, 3);
  ok('"Generations · N" and "N failed" match the lists; Liked and project lists leave trashed clips out');

  // ---- the page's poll (?ids=) marks trashed jobs so the page drops them; restore brings one back in order ----
  const polled = (await get(`/api/jobs?ids=${[...trashed, id('candle')].join(',')}`)) as any[];
  for (const t of trashed) assert.ok(polled.find((j) => j.id === t)?.deletedAt, `?ids= marks ${t} as trashed`); assert.equal(polled.find((j) => j.id === id('candle'))?.deletedAt, null);
  await post('/api/jobs/bulk', { ids: [id('old street')], action: 'restore' });
  const back = (await all(`status=${FEED_STATUS}&order=asc`, 2)).items.map((j) => j.id); assert.deepEqual(back, [id('neon city'), id('sunrise fox'), id('old street'), id('forest drone'), id('candle')], 'a restored clip comes back in its place');
  ok('?ids= carries deletedAt for trashed jobs (the page drops them); a restored clip comes back in its place');
  console.log('ALL OK feed-filter');
} catch (e) { console.error(e); process.exitCode = 1; } finally { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); try { fs.rmSync(D, { recursive: true, force: true }); } catch { /* the server may still be writing */ } }
