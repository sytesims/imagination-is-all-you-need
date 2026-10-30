// PB-24: Trash "Restore all" (POST /api/trash/restore-all) and "Empty trash" (POST /api/trash/empty, needs {confirm:true}).
// Own mock server :8971 on a temp data dir. Run: npx tsx test/trash-bulk.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '' };
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'trash-bulk-')); const DATA = fs.mkdtempSync(path.join(D, 'data-'));
const PORT = testPort(8971); const B = `http://localhost:${PORT}`;
const s = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: DATA, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '100', OPENHIGGSFIELD_SEED_FEATURED: '0' /* counts your own results only (no Examples project) */ },
  stdio: ['ignore', fs.openSync(path.join(D, 'srv.log'), 'a'), fs.openSync(path.join(D, 'srv.log'), 'a')], detached: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
const req = async (u: string, method: string, body?: unknown) => { const r = await fetch(B + u, { method, headers: body !== undefined ? { 'content-type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json() as any }; };
const make = async (prompt: string) => { const fd = new FormData(); fd.append('prompt', prompt); fd.append('rights', '1'); fd.append('types', '["generate"]');
  const r = await fetch(`${B}/api/tools/create-image/jobs`, { method: 'POST', body: fd }); const b = await r.json() as any; assert.equal(r.status, 200, JSON.stringify(b));
  for (let i = 0; i < 300; i++) { const j = await get(`/api/jobs/${b.id}`); if (j.status === 'done') return j; if (['failed', 'blocked', 'canceled'].includes(j.status)) throw new Error(`${b.id} ${j.status}`); await sleep(100); } throw new Error('timeout'); };
const counts = () => get('/api/assets/counts');
const ok = (m: string) => console.log('ok ' + m);
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* starting */ } await sleep(500); }
  const js = [await make('one'), await make('two'), await make('three'), await make('four')];
  // Restore all: two in Trash → both back, Trash empty, the other two untouched
  for (const j of js.slice(0, 2)) assert.equal((await req(`/api/jobs/${j.id}`, 'DELETE')).status, 200);
  assert.equal((await counts()).trash, 2);
  const r = await req('/api/trash/restore-all', 'POST', {}); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.restored, 2);
  let c = await counts(); assert.equal(c.trash, 0); assert.equal(c.all, 4);
  ok('restore-all: both trashed items are back in Assets');
  // Empty trash: refused without {confirm:true}; nothing removed
  for (const j of js.slice(0, 3)) assert.equal((await req(`/api/jobs/${j.id}`, 'DELETE')).status, 200);
  for (const body of [undefined, {}, { confirm: 'yes' }]) { const e = await req('/api/trash/empty', 'POST', body); assert.equal(e.status, 400, JSON.stringify(e.body)); }
  assert.equal((await counts()).trash, 3);
  ok('empty: refused (400) without {confirm:true}, Trash untouched');
  const outs = js.slice(0, 3).flatMap((j) => fs.readdirSync(DATA).filter((f) => f.startsWith(j.id + '-'))); assert.ok(outs.length >= 3, outs.join());
  const e = await req('/api/trash/empty', 'POST', { confirm: true }); assert.equal(e.status, 200, JSON.stringify(e.body)); assert.equal(e.body.purged, 3); assert.ok(e.body.removed.files + e.body.removed.keptShared >= 3, JSON.stringify(e.body)); /* each output is either removed or kept because something else still points at it (same rule as Delete forever) */
  c = await counts(); assert.equal(c.trash, 0); assert.equal(c.all, 1);
  for (const j of js.slice(0, 3)) assert.equal((await fetch(`${B}/api/jobs/${j.id}`)).status, 404);
  assert.equal((await fetch(`${B}/api/jobs/${js[3].id}`)).status, 200);
  assert.equal(outs.filter((f) => fs.existsSync(path.join(DATA, f))).length, e.body.removed.keptShared, 'only files still referenced elsewhere stay');
  ok(`empty: purged 3 (${e.body.removed.files} files removed, ${e.body.removed.keptShared} kept as still referenced); the item outside Trash is kept`);
  const e2 = await req('/api/trash/empty', 'POST', { confirm: true }); assert.equal(e2.body.purged, 0);
  const r2 = await req('/api/trash/restore-all', 'POST', {}); assert.equal(r2.body.restored, 0);
  ok('both are no-ops on an empty Trash');
} finally { try { process.kill(-s.pid!, 'SIGTERM'); } catch { /* gone */ } }
