// BUG-HUNT-9 PB items. (e) localFree only when every enabled route is local. (b) Settings label 'Comfy Cloud (one key)'. (a) Camera Moves LTX presets: model named LTX-2 (job.modelName, /api/routes with the preset), presets grouped 'LTX camera'.
// Run: npx tsx test/bh9.e2e.ts (port 8979; temp data dir).
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'bh9-')); const ok = (m: string) => console.log('ok ' + m);
const PORT = testPort(8979); const B = `http://localhost:${PORT}`;
const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_HOSTED: '', OPENHIGGSFIELD_MOCK_DELAY_MS: '100', OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '', OPENHIGGSFIELD_MINIMAX_API_KEY: '', OPENHIGGSFIELD_DASHSCOPE_API_KEY: '' }, stdio: 'ignore', detached: true });
const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
const post = async (u: string, f: Record<string, string>, files: [string, string][] = []) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v);
  for (const [k, fp] of files) fd.append(k, new Blob([fs.readFileSync(fp)], { type: 'image/png' }), path.basename(fp)); const r = await fetch(B + u, { method: 'POST', body: fd }); return { status: r.status, body: (await r.json()) as any }; };
const REF = path.join(D, 'key-1280.png'); (await import('node:child_process')).execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720', '-frames:v', '1', REF]);
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  // ---- (a) LTX camera ----
  const tools = await get('/api/tools'); const cam = tools.find((t: any) => t.id === 'camera'); const ltx = cam.presets.filter((x: any) => /^ltx-/.test(x.id));
  assert.ok(ltx.length >= 2, 'ltx presets'); for (const x of ltx) assert.equal(x.category, 'LTX camera', `${x.id} category ${x.category}`);
  const rl = (await get('/api/routes?toolId=camera&modelId=comfy-open&types=%5B%22ltx-dolly-in%22%5D')).routes[0]; assert.equal(rl.displayName, 'LTX-2 19B');
  assert.equal(rl.routes.find((r: any) => r.kind === 'local').displayName, 'Your computer · LTX-2 19B');
  const rw = (await get('/api/routes?toolId=camera&modelId=comfy-open&types=%5B%22orbit%22%5D')).routes[0]; assert.equal(rw.displayName, 'Wan 2.2 Fun Camera 14B');
  const j = await post('/api/tools/camera/jobs', { types: '["ltx-dolly-in"]', provider: 'comfy-open', rights: '1', duration: '3' }, [['image', REF]]); assert.equal(j.status, 200, JSON.stringify(j.body));
  const jd = await get(`/api/jobs/${j.body.id}`); assert.equal(jd.modelName, 'LTX-2 19B', JSON.stringify(jd).slice(0, 300)); assert.equal(jd.model, 'LTX-2 19B');
  const j2 = await post('/api/tools/camera/jobs', { types: '["orbit"]', provider: 'comfy-open', rights: '1', duration: '3' }, [['image', REF]]); assert.equal(j2.status, 200); { const j2d = await get(`/api/jobs/${j2.body.id}`); assert.equal(j2d.modelName, 'Wan 2.2 Fun Camera 14B'); /* BH10 P1-4: always the engine that ran */ assert.equal(j2d.model, 'Wan 2.2 Fun Camera 14B'); }
  ok(`(a) ${ltx.length} LTX presets in 'LTX camera'; ltx-dolly-in job modelName LTX-2 19B; /api/routes?types=ltx-… → LTX-2 19B, orbit → Wan 2.2 Fun Camera 14B`);
  // ---- (b) settings label ----
  { const sp = (await get('/api/settings/providers')).providers as any[]; const c = sp.find((x) => x.id === 'comfy'); assert.equal(c.name, 'Comfy Cloud (one key)'); assert.equal(c.openWeights, false); ok('(b) settings provider comfy = "Comfy Cloud (one key)"'); }
  // ---- (e) truthful localFree ----
  { const u0 = await get('/api/usage'); assert.equal(u0.localFree, true); assert.deepEqual(u0.cloudEnabled, []); assert.equal((await get('/api/config')).localFree, true); assert.equal((await get('/api/me')).localFree, true);
    await fetch(`${B}/api/me/routing`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ global: { mockKeys: true } }) });
    const u1 = await get('/api/usage'); assert.equal(u1.localFree, false); assert.equal(u1.hidden, false); assert.equal(typeof u1.balance, 'number'); assert.ok(u1.cloudEnabled.length > 0, JSON.stringify(u1.cloudEnabled));
    assert.equal(u1.balanceSource, 'credits ledger (1 credit = $0.01)'); assert.equal(u1.cloudBalance, null); assert.ok('cloudBalanceNote' in u1);
    const c1 = await get('/api/config'); assert.equal(c1.localFree, false); assert.deepEqual(c1.cloudEnabled, u1.cloudEnabled); assert.equal((await get('/api/me')).localFree, false);
    assert.equal((await get('/api/tools')).find((t: any) => t.id === 'h3-video').localFree, false);
    await fetch(`${B}/api/me/routing`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ global: { mockKeys: false } }) });
    assert.equal((await get('/api/usage')).localFree, true);
    ok(`(e) no keys → localFree true (usage hidden); keys on → localFree false on /api/usage, /api/config, /api/me, /api/tools; usage balance ${u1.balance}, cloudEnabled ${JSON.stringify(u1.cloudEnabled)}`); }
  console.log('ALL OK bh9');
} finally { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* */ } fs.rmSync(D, { recursive: true, force: true }); }
