// Idempotency on job-creating endpoints (Oct 18, agreed with DP): Idempotency-Key header or clientJobId alias, 24 h window, replay = the original response
// with no second job / hold / charge, a different request with the same key → 409. Throwaway mock server :8990 (DEMO_AUTO=0, local route), temp data.
// Run: npx tsx test/idempotency-1018.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import Fastify from 'fastify';
import { IDEMPOTENCY_WINDOW_MS } from '../src/idempotency.js'; import { registerJsonErrors } from '../src/jsonErrors.js';
const CONFLICT = { error: 'idempotency_conflict', code: 'idempotency_conflict', message: 'This request was already sent with different details. Start a new one.' };
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'idem-')); const B = `http://localhost:${testPort(8990)}`;
const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, detached: true, stdio: 'ignore', env: { ...process.env, PORT: String(testPort(8990)), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, '.env.local'), OPENHIGGSFIELD_BACKEND: 'mock',
  OPENHIGGSFIELD_MOCK_DELAY_MS: '100', OPENHIGGSFIELD_SEED_COMMUNITY: '0', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_MOCK_KEYS: '1' } });
const ok = (m: string) => console.log('ok ' + m);
const get = async (u: string) => (await fetch(B + u)).json() as Promise<any>;
const form = async (u: string, f: Record<string, string>, headers: Record<string, string> = {}) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v); const r = await fetch(B + u, { method: 'POST', body: fd, headers: { Origin: 'http://localhost:5173', ...headers } }); return { status: r.status, body: (await r.json()) as any, replayed: r.headers.get('idempotent-replayed'), expose: r.headers.get('access-control-expose-headers') }; };
const json = async (u: string, b: any, headers: Record<string, string> = {}) => { const r = await fetch(B + u, { method: 'POST', body: JSON.stringify(b ?? {}), headers: { 'content-type': 'application/json', ...headers } }); return { status: r.status, body: (await r.json()) as any, replayed: r.headers.get('idempotent-replayed') }; };
const done = async (id: string) => { for (let i = 0; i < 150; i++) { const j = await get(`/api/jobs/${id}`); if (['done', 'failed', 'blocked'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 200)); } throw new Error('timeout'); };
const count = async () => { const j = await get('/api/jobs?limit=500'); return (Array.isArray(j) ? j : j.items ?? j.jobs ?? []).length; };
try {
  for (let i = 0; i < 240; i++) { try { if ((await fetch(`${B}/api/config`)).ok) break; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 250)); }
  assert.equal(IDEMPOTENCY_WINDOW_MS, 24 * 3600_000); ok('window = 24 h');
  const F = { rights: '1', types: '["generate"]', prompt: 'a red fox, idem', provider: 'api-flux2' }; const H = { 'Idempotency-Key': 'k-1' };
  const b0 = (await get('/api/ledger')).balance ?? (await get('/api/config')).balance; const n0 = await count();
  const a = await form('/api/tools/create-image/jobs', F, H); assert.equal(a.status, 200, JSON.stringify(a.body)); const b1 = (await get('/api/ledger')).balance ?? (await get('/api/config')).balance;
  const r = await form('/api/tools/create-image/jobs', F, H); assert.equal(r.status, 200); assert.equal(r.body.idempotentReplay, true); assert.equal(r.body.id, a.body.id);
  const { idempotentReplay: _x, ...rest } = r.body; assert.deepEqual(rest, a.body, 'replay = the original response');
  assert.equal(a.replayed, null, 'first response: no replay header'); assert.equal(r.replayed, 'true', 'replay header Idempotent-Replayed: true'); assert.match(String(r.expose), /Idempotent-Replayed/i, 'exposed via CORS');
  assert.equal((await get('/api/ledger')).balance ?? (await get('/api/config')).balance, b1, 'no second hold or charge'); assert.equal(await count(), n0 + 1, 'one job');
  ok(`Idempotency-Key replay → original response + header Idempotent-Replayed: true (CORS-exposed) (job ${a.body.id}, cost ${a.body.cost}), balance ${b0} → ${b1} once, one job`);
  const c = await form('/api/tools/create-image/jobs', { ...F, prompt: 'a blue fox' }, H); assert.equal(c.status, 409); assert.deepEqual(c.body, CONFLICT, 'exact 409 body'); assert.equal(c.replayed, null); assert.equal(await count(), n0 + 1);
  const c2 = await form('/api/tools/soul/jobs', F, H); assert.equal(c2.status, 409, 'same key on another endpoint = a different request');
  ok('same key + different body (or endpoint) → 409 exactly ' + JSON.stringify(CONFLICT) + ', nothing created');
  const d = await form('/api/tools/create-image/jobs', { ...F, prompt: 'cat', clientJobId: 'cj-1' }); assert.equal(d.status, 200);
  const d2 = await form('/api/tools/create-image/jobs', { ...F, prompt: 'cat' }, { 'Idempotency-Key': 'cj-1' }); assert.equal(d2.body.idempotentReplay, true); assert.equal(d2.replayed, 'true'); assert.equal(d.replayed, null); assert.equal(d2.body.id, d.body.id);
  const d3 = await form('/api/tools/create-image/jobs', { ...F, prompt: 'cat', clientJobId: 'cj-1' }); assert.equal(d3.body.id, d.body.id);
  ok('clientJobId (multipart field) is an alias of Idempotency-Key');
  const par = await Promise.all([1, 2, 3].map(() => form('/api/tools/create-image/jobs', { ...F, prompt: 'dog' }, { 'Idempotency-Key': 'k-par' }))); assert.equal(new Set(par.map((x) => x.body.id)).size, 1); assert.equal(par.filter((x) => x.body.idempotentReplay).length, 2);
  ok('3 concurrent duplicates → one job');
  const bad = await form('/api/tools/create-image/jobs', { ...F, rights: '' , types: '["nope"]' }, { 'Idempotency-Key': 'k-bad' }); assert.ok(bad.status >= 400 && bad.status < 500);
  const good = await form('/api/tools/create-image/jobs', { ...F, prompt: 'owl' }, { 'Idempotency-Key': 'k-bad' }); assert.equal(good.status, 200, 'a refused request is not remembered: fix and resend with the same key');
  ok('a 4xx is not remembered (same key works once the request is fixed)');
  // retry (JSON route) with a key: one retry job, replay, mismatch 409
  const f = await form('/api/tools/create-image/jobs', { ...F, prompt: 'fail me', simulate: 'temporary' }); const fj = await done(f.body.id); assert.ok(['failed', 'blocked'].includes(fj.status), fj.status);
  const rt = await json(`/api/jobs/${f.body.id}/retry`, {}, { 'Idempotency-Key': 'k-rt' }); assert.equal(rt.status, 200, JSON.stringify(rt.body)); const rt2 = await json(`/api/jobs/${f.body.id}/retry`, {}, { 'Idempotency-Key': 'k-rt' });
  assert.equal(rt2.body.id, rt.body.id); assert.equal(rt2.body.idempotentReplay, true); assert.equal(rt2.replayed, 'true'); assert.equal(rt.replayed, null); const { idempotentReplay: _y, ...rr } = rt2.body; assert.deepEqual(rr, rt.body);
  const rt3 = await json(`/api/jobs/${a.body.id}/retry`, {}, { 'Idempotency-Key': 'k-rt' }); assert.equal(rt3.status, 409); assert.deepEqual(rt3.body, CONFLICT);
  const rt4 = await json(`/api/jobs/${f.body.id}/retry`, { clientJobId: 'k-rt' }); assert.equal(rt4.body.id, rt.body.id);
  ok('retry: Idempotency-Key / JSON clientJobId replay the original retry response; the key on another job → 409');
  // edit (per-job, JSON): replay = the original edit response, one new job; same key on another source job → 409
  { const src = await done(a.body.id); assert.equal(src.status, 'done'); const n1 = await count(); const bal1 = (await get('/api/ledger')).balance;
    const e1 = await json(`/api/jobs/${a.body.id}/edit`, { tool: 'image-upscale', params: { rights: '1', types: ['x2'] } }, { 'Idempotency-Key': 'k-ed' }); assert.equal(e1.status, 200, JSON.stringify(e1.body)); assert.equal(e1.body.editOf, a.body.id);
    const bal2 = (await get('/api/ledger')).balance;
    const e2 = await json(`/api/jobs/${a.body.id}/edit`, { tool: 'image-upscale', params: { rights: '1', types: ['x2'] } }, { 'Idempotency-Key': 'k-ed' }); assert.equal(e2.body.idempotentReplay, true); assert.equal(e2.replayed, 'true'); assert.equal(e1.replayed, null); assert.equal(e2.body.id, e1.body.id);
    const { idempotentReplay: _z, ...er } = e2.body; assert.deepEqual(er, e1.body); assert.equal(await count(), n1 + 1); assert.equal((await get('/api/ledger')).balance, bal2);
    const e3 = await json(`/api/jobs/${d.body.id}/edit`, { tool: 'image-upscale', params: { rights: '1', types: ['x2'] } }, { 'Idempotency-Key': 'k-ed' }); assert.equal(e3.status, 409); assert.deepEqual(e3.body, CONFLICT);
    ok(`edit: replay → original response (job ${e1.body.id}, balance ${bal1} → ${bal2} once); same key on another job → 409`); }
  // retry failed groups (retry?failedOnly=1) is a different request from a plain retry with the same key
  { const x = await json(`/api/jobs/${f.body.id}/retry?failedOnly=1`, {}, { 'Idempotency-Key': 'k-rt' }); assert.equal(x.status, 409); assert.deepEqual(x.body, CONFLICT); ok('retry?failedOnly=1 with the plain-retry key → 409'); }
  // every 5xx carries a JSON body (DP retries only empty-body 500s)
  { const m = Fastify(); registerJsonErrors(m); m.get('/empty', async (_q, r) => r.code(500).send()); m.get('/throw', async () => { throw new Error('boom secret detail'); }); m.get('/text', async (_q, r) => r.code(503).type('text/plain').send('down'));
    m.get('/json', async (_q, r) => r.code(500).send({ error: 'x', errorType: 'server' })); m.get('/bad', async () => { const e: any = new Error('nope'); e.statusCode = 400; throw e; });
    for (const [u, st] of [['/empty', 500], ['/throw', 500], ['/text', 503]] as const) { const r = await m.inject({ url: u }); assert.equal(r.statusCode, st); assert.match(String(r.headers['content-type']), /json/); const b = r.json(); assert.equal(b.code, 'server_error'); assert.ok(b.message); assert.ok(!r.body.includes('secret')); }
    assert.deepEqual((await m.inject({ url: '/json' })).json(), { error: 'x', errorType: 'server' }); const bad = await m.inject({ url: '/bad' }); assert.equal(bad.statusCode, 400); assert.equal(bad.json().message, 'nope'); await m.close();
    ok('5xx bodies: empty / thrown / text → JSON {error:server_error, code, message}; JSON 5xx untouched; 4xx keep the default shape'); }
  console.log('ALL OK idempotency-1018');
} finally { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* gone */ } await new Promise((r) => setTimeout(r, 500)); try { fs.rmSync(D, { recursive: true, force: true }); } catch { /* still writing */ } }
