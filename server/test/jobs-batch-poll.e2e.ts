// One poll for every followed job (2026-10-25 UI lag fix), end to end (own mock server on :8953, temp data dir, no keys):
//  1  GET /api/jobs?ids=a,b answers those jobs only, in the asked order, each exactly as GET /api/jobs/:id answers it (spend included)
//  2  unknown ids are left out; duplicates count once; an empty list answers []
//  3  more than 100 ids → 400 on the ids field
// Run: npx tsx test/jobs-batch-poll.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const PORT = testPort(8953); const B = `http://localhost:${PORT}`; const ok = (m: string) => console.log('ok ' + m);
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '' };
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'jobs-ids-'));
const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'none.env'),
  OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '200', OPENHIGGSFIELD_USE_LOCAL: '0' }, stdio: 'ignore', detached: true });
const get = async (u: string) => { const r = await fetch(B + u); return { status: r.status, body: (await r.json()) as any }; };
const job = async (prompt: string) => { const fd = new FormData(); fd.append('prompt', prompt); fd.append('types', '["generate"]'); const r = await fetch(`${B}/api/tools/create-image/jobs`, { method: 'POST', body: fd }); const b = await r.json() as any; assert.equal(r.status, 200, JSON.stringify(b)); return b; };
const until = async (id: string) => { for (let i = 0; i < 200; i++) { const j = (await get(`/api/jobs/${id}`)).body; if (!['queued', 'running'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 100)); } throw new Error('timeout ' + id); };
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 500)); }
  const a = await job('a red kite over hills'); const b = await job('a lighthouse at dusk'); await until(a.id); await until(b.id);
  const r = await get(`/api/jobs?ids=${b.id},${a.id}`); assert.equal(r.status, 200); assert.ok(Array.isArray(r.body), 'a plain array');
  assert.deepEqual(r.body.map((j: any) => j.id), [b.id, a.id], 'the asked order');
  for (const j of r.body) { const one = (await get(`/api/jobs/${j.id}`)).body; assert.deepEqual(j, one, `${j.id} as GET /api/jobs/:id answers it`); assert.ok('spend' in j, 'spend included'); }
  ok('1: GET /api/jobs?ids= answers those jobs, in order, each the same as GET /api/jobs/:id (spend included)');
  const r2 = await get(`/api/jobs?ids=${a.id},nope0000,${a.id}`); assert.deepEqual(r2.body.map((j: any) => j.id), [a.id], 'unknown left out, duplicate once');
  assert.deepEqual((await get('/api/jobs?ids=')).body, [], 'empty list → []');
  ok('2: unknown ids left out, duplicates once, empty → []');
  const many = Array.from({ length: 101 }, (_, i) => `x${i}`).join(','); const r3 = await get(`/api/jobs?ids=${many}`);
  assert.equal(r3.status, 400); assert.equal(r3.body.issues[0].field, 'ids');
  ok('3: more than 100 ids → 400 (ids)');
  console.log('ALL OK jobs-batch-poll');
} finally { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* gone */ } }
