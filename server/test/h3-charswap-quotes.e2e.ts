// H3 Character Swap, every quote caller over HTTP (2026-11-03), one mock server, fake Comfy key, no network:
//  (a) no clip, (b) clip + character but no who, (c) who set, (d) no key. What each caller gets:
//  - Generate / Run on chip / GenStatus / Canvas card: GET /api/tools/object-swap/price
//  - MCP quote: GET /api/models/quote · model picker rows + detail card: POST /api/models/quotes · option prices: POST price-variants
//  - "See what to fix" for agents / MCP: GET /api/tools/object-swap/preflight · the listing's pre-selection: GET /api/tools
//  (b) is an input step: priced on Comfy Cloud (inputStep), the who reason once, never "needs a key" / "no verified price" / "Pick model…".
// Run: npx tsx test/h3-charswap-quotes.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const boot = (port: number, key: string) => spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, detached: true, stdio: 'ignore', env: { ...process.env, PORT: String(port), OPENHIGGSFIELD_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'h3q-')),
  OPENHIGGSFIELD_ENV_FILE: path.join(os.tmpdir(), 'h3q-none.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_DEMO_AUTO: '0', OPENHIGGSFIELD_API_PROXY: 'http://127.0.0.1:9', COMFY_URL: 'http://127.0.0.1:9',
  COMFY_API_KEY: key, OPENHIGGSFIELD_COMFY_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_USE_LOCAL: '' } });
const stop = (p: ChildProcess) => { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* gone */ } };
const ok = (m: string) => console.log('ok ' + m);
const P1 = testPort(8971), P2 = testPort(8972); const S1 = boot(P1, 'fake-h3q-key'), S2 = boot(P2, '');
try {
  const api = (port: number) => { const B = `http://localhost:${port}`;
    return { get: async (u: string) => (await fetch(B + u)).json() as Promise<any>, post: async (u: string, b: unknown) => (await fetch(B + u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })).json() as Promise<any>,
      ready: async () => { for (let i = 0; i < 160; i++) { try { if ((await fetch(`${B}/api/health`)).ok) return; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); } throw new Error(`server ${port} did not start`); } }; };
  const a = api(P1), n = api(P2); await Promise.all([a.ready(), n.ready()]);
  const M = 'minimax-h3-character-swap'; const qs = (o: Record<string, string>) => new URLSearchParams(o).toString();
  const sc = { a: { swapType: 'person' }, b: { seconds: '6', resolution: '480p', swapType: 'person', target: '' }, c: { seconds: '6', resolution: '480p', swapType: 'person', target: 'the man on the left' } } as const;
  const all = async (s: ReturnType<typeof api>, p: Record<string, string>) => ({
    price: await s.get(`/api/tools/object-swap/price?${qs({ provider: 'comfy-h3-charswap', ...p })}`), mcp: await s.get(`/api/models/quote?${qs({ toolId: 'object-swap', model: M, ...p })}`),
    row: (await s.post('/api/models/quotes', { toolId: 'object-swap', params: p, models: [M] })).quotes?.[M],
    vars: (await s.post('/api/tools/object-swap/price-variants', { params: { provider: 'comfy-h3-charswap', ...p }, variants: { r480: { resolution: '480p' }, r720: { resolution: '720p' } } })).variants,
    pf: await s.get(`/api/tools/object-swap/preflight?${qs({ provider: 'comfy-h3-charswap', ...p })}`) });
  // (b) no who: every caller priced on Comfy Cloud, an input step
  const b = await all(a, sc.b);
  for (const [k, q] of Object.entries({ price: b.price, mcp: b.mcp, row: b.row, r480: b.vars.r480 })) {
    assert.equal(q.runOn ?? 'comfy-cloud', 'comfy-cloud', k); assert.equal(q.inputStep, true, `${k}: an input step`); assert.equal(q.credits, 21, `${k}: $0.21 for 6 s at 480p`); assert.notEqual(q.needsKey, true, k); assert.equal(q.runnable, false, k); }
  assert.equal(b.vars.r720.credits, 37, '768p · sharpest priced');
  assert.deepEqual(b.pf.problems.map((x: any) => [x.code, x.stage]), [['input_problem', 'inputs']], 'once, as an input'); assert.notEqual(b.pf.problems[0].fix.kind, 'pick-model');
  assert.ok(!b.pf.problems.some((x: any) => /verified price|key/i.test(x.message)));
  // (c) who set: runs, same price; (a) no clip: the listing's default job, runnable
  const c = await all(a, sc.c); for (const q of [c.price, c.mcp, c.row]) { assert.equal(q.runnable, true); assert.equal(q.credits, 21); assert.equal(q.inputStep, undefined); } assert.deepEqual(c.pf.problems, []);
  const a0 = await all(a, sc.a); assert.equal(a0.price.runnable, true); assert.equal(a0.price.runOn, 'comfy-cloud');
  const lst = (await a.get('/api/tools')).find((t: any) => t.id === 'object-swap').models.find((m: any) => m.key === M); assert.equal(lst.preselect?.runOn, 'comfy-cloud');
  // (d) no key: still a key / setup answer, never an input step
  const d = await all(n, sc.b); assert.notEqual(d.price.inputStep, true); assert.notEqual(d.row?.inputStep, true); assert.ok(d.price.runnable === false);
  ok('no who: price, MCP quote, picker row, option prices = Comfy Cloud $0.21 / $0.37 as an input step; preflight lists it once (inputs, Open); who set runs at the same price; no key stays a key answer');
} finally { stop(S1); stop(S2); }
console.log('ALL OK h3-charswap-quotes');
