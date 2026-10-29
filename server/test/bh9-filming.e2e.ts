// BH9 (c)(c2)(f) e2e: filming mode + the bad-key Comfy Cloud run. Own server :8980 (mock backend, temp dirs) and a local stub
// "Comfy Cloud" on :8981 that answers 401 to everything (no network, no spend). Also: `npm run filming -- on|off|status` round trip on a temp state file.
// Run: npx tsx test/bh9-filming.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync } from 'node:child_process'; import fs from 'node:fs'; import http from 'node:http'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'bh9f-')); const ok = (m: string) => console.log('ok ' + m);
const REAL = path.join(D, 'real-data'); fs.mkdirSync(REAL); fs.writeFileSync(path.join(REAL, 'keep.txt'), 'real');
const STATE = path.join(D, 'filming', 'state.json'); const PORT = testPort(8980); const B = `http://localhost:${PORT}`;
const seen: { path: string; auth: string }[] = [];
const stub = http.createServer((q, r) => { seen.push({ path: q.url ?? '', auth: String(q.headers.authorization ?? '') }); q.resume(); r.writeHead(401, { 'content-type': 'application/json' }); r.end(JSON.stringify({ error: { code: 'unauthorized', message: 'invalid api key' } })); });
await new Promise<void>((ok) => stub.listen(testPort(8981), '127.0.0.1', ok));
const script = (...a: string[]) => execFileSync('npx', ['tsx', 'scripts/filming-mode.ts', ...a], { cwd: ROOT, env: { ...process.env, OPENHIGGSFIELD_FILMING_FILE: STATE, OPENHIGGSFIELD_DATA_DIR: REAL, FILMING_NO_RESTART: '1', FILMING_NO_PREFLIGHT: '1' } }).toString();
let p: ReturnType<typeof spawn> | null = null;
try {
  // script round trip
  assert.match(script('status'), /filming: OFF/);
  const on = script('on', '--no-seed'); /* seeded on: test/filming-seed.e2e.ts */ assert.match(on, /filming: ON/); const st = JSON.parse(fs.readFileSync(STATE, 'utf8')); assert.equal(st.on, true); assert.ok(fs.existsSync(st.dataDir) && fs.readdirSync(st.dataDir).length === 0, 'new empty scratch dir');
  assert.notEqual(path.resolve(st.dataDir), REAL); assert.equal(st.realDataDir, REAL); assert.match(script('on'), /already ON/); assert.equal(JSON.parse(fs.readFileSync(STATE, 'utf8')).dataDir, st.dataDir, 'second on keeps the same scratch dir');
  assert.match(script('status'), /filming: ON/);
  ok('npm run filming -- on --no-seed: new empty scratch dir (not the real one), state file written; on again = same dir; status ON');
  fs.writeFileSync(path.join(st.dataDir, '.env.local'), 'COMFY_API_KEY=comfyui-obviously-invalid-test-key\n');
  p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, detached: true, stdio: 'ignore', env: { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_FILMING_FILE: STATE, OPENHIGGSFIELD_DATA_DIR: REAL, OPENHIGGSFIELD_BILLING_MODE: 'team', OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '100',
    OPENHIGGSFIELD_COMFY_CLOUD_URL: `http://127.0.0.1:${testPort(8981)}`, OPENHIGGSFIELD_COMFY_CLOUD_POLL_MS: '50', OPENHIGGSFIELD_FAL_KEY: 'shell-fal-key-should-be-ignored', COMFY_API_KEY: 'shell-comfy-key-should-be-ignored', OPENHIGGSFIELD_MOCK_KEYS: '1',
    OPENHIGGSFIELD_ALLOW_UNMEASURED_CLOUD: '1' /* the bad-key run must reach the 401 stub; the 'price not measured' gate (2026-10-24) has its own tests */ } });
  const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  const cfg = await get('/api/config'); assert.equal(cfg.filming.on, true); assert.equal(cfg.notificationPrompts, false); assert.equal(cfg.filming.notificationPrompts, false); assert.equal(cfg.filming.fallbackOffers, false); assert.equal(cfg.openWeightsOnly, true);
  assert.ok(fs.existsSync(path.join(st.dataDir, 'openhiggsfield.db')) || fs.readdirSync(st.dataDir).some((f) => /\.db$/.test(f)), 'db in the scratch dir'); assert.deepEqual(fs.readdirSync(REAL), ['keep.txt'], 'real data dir untouched');
  const sp = (await get('/api/settings/providers')).providers as any[]; assert.equal(sp.find((x) => x.id === 'fal').configured, false, 'shell fal key ignored'); assert.equal(sp.find((x) => x.id === 'comfy').configured, true, 'scratch .env.local comfy key');
  const hv = (await get('/api/models?toolId=h3-video')).groups.flatMap((g: any) => g.models).map((m: any) => m.id); for (const h of ['cloud-h3', 'api-minimax-h3', 'router-kling', 'router-veo', 'router-seedance']) assert.ok(!hv.includes(h), `${h} hidden`); assert.ok(hv.includes('cloud-h3-wf'));
  const ci = (await get('/api/models?toolId=create-image')).groups.flatMap((g: any) => g.models); assert.ok(!ci.some((m: any) => /nano banana/i.test(m.name ?? '')), 'Nano Banana hidden');
  ok(`filming server: /api/config filming {on, notificationPrompts:false, fallbackOffers:false}; db in scratch dir, real dir untouched; OW-only (H3 API nodes/partner, Kling, Veo, Seedance, Nano Banana hidden; cloud-h3-wf kept); shell keys ignored, scratch key used`);
  // bad key run: auto mode then pinned no-fallback mode
  const bal0 = (await get('/api/ledger')).balance;
  for (const pin of [false, true]) {
    if (pin) await fetch(`${B}/api/me/routing`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ global: { mode: 'comfy-cloud:cloud-h3-wf', allowFallback: false } }) });
    const fd = new FormData(); for (const [k, v] of Object.entries({ prompt: 'a paper boat drifting', types: '["t2v"]', provider: 'cloud-h3-wf', seconds: '5' })) fd.append(k, v);
    const r = await fetch(`${B}/api/tools/h3-video/jobs`, { method: 'POST', body: fd }); const j = await r.json() as any; assert.equal(r.status, 200, JSON.stringify(j)); assert.equal(j.cost, 40, 'charged the quote'); assert.equal(j.demo ?? false, false);
    let d: any; for (let i = 0; i < 200; i++) { d = await get(`/api/jobs/${j.id}`); if (['done', 'failed', 'needs_decision'].includes(d.status)) break; await new Promise((ok) => setTimeout(ok, 100)); }
    assert.equal(d.status, 'failed', JSON.stringify(d).slice(0, 400)); assert.equal(d.reasonCode, 'key_invalid'); assert.match(d.error, /^Comfy Cloud failed: the API key was not accepted \(it is missing, wrong or revoked\)/); assert.ok(!/obviously-invalid/.test(JSON.stringify(d)), 'key never echoed');
    assert.deepEqual(d.alternatives ?? [], [], 'no Use … alternatives'); assert.equal(d.refund?.refunded, true); assert.equal(d.refund?.amount, j.cost, 'full refund of the charge');
    ok(`${pin ? 'pinned, fallback off' : 'auto'}: bad key → failed, reasonCode key_invalid, "${d.error}", refund ✦${d.refund.amount}, no alternatives, no needs_decision`);
  }
  const bal1 = (await get('/api/ledger')).balance; assert.equal(bal1, bal0, 'balance back to where it was');
  assert.ok(seen.length >= 2 && seen.every((s) => s.auth === 'Bearer comfyui-obviously-invalid-test-key') && seen.every((s) => s.path === '/api/v2/jobs'), JSON.stringify(seen.map((s) => s.path)));
  ok(`balance ${bal0} → ${bal1}; stub saw ${seen.length} submits (POST /api/v2/jobs, 1 per job, scratch key only)`);
  // off
  const off = script('off'); assert.match(off, /filming: OFF/); const s2 = JSON.parse(fs.readFileSync(STATE, 'utf8')); assert.equal(s2.on, false); assert.equal(s2.lastDataDir, st.dataDir); assert.ok(fs.existsSync(st.dataDir), 'scratch kept'); assert.deepEqual(fs.readdirSync(REAL), ['keep.txt']);
  assert.match(script('status'), /filming: OFF/); assert.match(script('off'), /already OFF/);
  ok('npm run filming -- off: state on:false, scratch dir kept, real data dir untouched');
  console.log('ALL OK bh9-filming');
} finally { try { if (p) process.kill(-p.pid!, 'SIGTERM'); } catch { /* */ } stub.close(); fs.rmSync(D, { recursive: true, force: true }); }
