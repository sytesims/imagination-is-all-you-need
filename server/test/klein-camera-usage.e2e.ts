// E2E (own mock server, temp data dir, port 8847): FLUX 3 Klein quote flags follow the route; Camera single move; /api/usage reconciles.
// Run: npx tsx test/klein-camera-usage.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const PORT = testPort(8847), B = `http://localhost:${PORT}`, D = fs.mkdtempSync(path.join(os.tmpdir(), 'kcu-'));
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BILLING_MODE: 'team', OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_DEMO_AUTO: '0' /* keyless = no_provider (real-mode rules) */, OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', COMFY_API_KEY: '' }, stdio: 'ignore', detached: true });
const get = async (u: string) => (await fetch(B + u)).json();
const routing = (g: any) => fetch(`${B}/api/me/routing`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ global: g }) }); // own test server only
const post = async (tool: string, f: Record<string, string>, files: [string, string][] = []) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v); for (const [k, p] of files) fd.append(k, new Blob([fs.readFileSync(p)]), path.basename(p)); const r = await fetch(`${B}/api/tools/${tool}/jobs`, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() }; };
const wait = async (id: string) => { for (let i = 0; i < 600; i++) { const j = await get(`/api/jobs/${id}`); if (['done', 'failed', 'blocked', 'canceled'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 200)); } throw new Error('timeout'); };
try {
  for (let i = 0; i < 90; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 1000)); }
  const Q = '/api/tools/create-image/price?provider=comfy-flux3-klein&types=%5B%22generate%22%5D';
  // Klein: useLocal on → local route, free; off → cloud first (BFL), not flagged local/free
  await routing({ mode: 'auto', allowFallback: false, useLocal: true });
  { const q = await get(Q); assert.equal(q.route, 'local:comfy-flux3-klein'); assert.equal(q.routeKind, 'local'); assert.equal(q.credits, 0); assert.equal(q.free, true); assert.equal(q.local, true); assert.equal(q.needsKey, false); assert.equal(q.runnable, true); }
  await routing({ mode: 'auto', allowFallback: false, useLocal: false });
  { const q0 = await get(Q); assert.equal(q0.runnable, false); assert.equal(q0.runOn, null, 'Run on (2026-10-22, 4k 5b-1): nothing ready → nothing pre-selected');
    { const gpu = q0.setupOptions.find((x: any) => x.runOn === 'local'); assert.equal(q0.setupOptions.at(-1), gpu, 'Local is the last setup option'); assert.equal(gpu.action, 'turn_on'); assert.equal(gpu.actionText, 'Turn on'); assert.equal(q0.setup?.action, q0.setupOptions[0].action); }
    const q = await get(Q + '&model=flux-3-klein&runOn=bfl'); assert.notEqual(q.routeKind, 'local'); assert.equal(q.local, false); assert.equal(q.free, false); assert.equal(q.basis, 'hosted'); assert.ok(q.credits > 0); assert.ok(!/runs locally/.test(JSON.stringify(q.breakdown)), JSON.stringify(q.breakdown)); assert.equal(q.needsKey, true); assert.equal(q.noProvider.localAvailable, true);
    console.log(`ok Klein useLocal on → local:comfy-flux3-klein 0 cr; off → nothing pre-selected, Local "Turn on" listed last; picked BFL → ${q.route} ${q.credits} cr, local=false free=false (${q.breakdown[0].label})`); }
  // Camera: single move
  { const t = (await get('/api/tools')).find((x: any) => x.id === 'camera'); assert.equal(t.app.mix, 1); assert.equal(t.inputs.find((i: any) => i.name === 'types').max, 1); assert.ok(!/Mix up to/i.test(t.description), t.description);
    const key = path.join(D, 'key.png'); execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=1280x720', '-frames:v', '1', key]);
    await routing({ mode: 'auto', allowFallback: true, useLocal: true, mockKeys: true });
    const two = await post('camera', { rights: '1', types: '["orbit","push-in"]' }, [['image', key]]); assert.equal(two.status, 400, JSON.stringify(two.body));
    const one = await post('camera', { rights: '1', types: '["orbit"]' }, [['image', key]]); assert.equal(one.status, 200, JSON.stringify(one.body)); await wait(one.body.id);
    console.log(`ok camera mix=1, types.max=1, two moves → 400 (${two.body.error}); "${t.description}"`); }
  // Usage reconciles (charged + refunded hosted runs on mock keys)
  { const ok = await post('create-image', { rights: '1', types: '["generate"]', prompt: 'a fox', provider: 'api-flux2' }); assert.equal(ok.status, 200, JSON.stringify(ok.body)); await wait(ok.body.id);
    const bad = await post('create-image', { rights: '1', types: '["generate"]', prompt: 'a fox [mockfail]', provider: 'api-flux2', simulate: 'temporary' }); assert.equal(bad.status, 200, JSON.stringify(bad.body)); await wait(bad.body.id); }
  { const u = await get('/api/usage?limit=1'); const t = u.totals; assert.ok(t && t.charged > 0 && t.refunded > 0, JSON.stringify(t)); { assert.equal(u.reconciles, true); assert.equal(t.granted - t.charged + t.refunded - t.expired, u.balance); assert.deepEqual(t.discrepancies, []); }
    console.log(`ok /api/usage reconciles=${u.reconciles ?? '(hidden: nothing charged)'} ${t ? `${t.granted} − ${t.charged} + ${t.refunded} − ${t.expired} = ${u.balance}` : ''}`); }
  console.log('ALL OK klein-camera-usage');
} finally { try { process.kill(-srv.pid!); } catch { /* */ } }
