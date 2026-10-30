// E2E (own mock servers :8871, :8872 with OPENHIGGSFIELD_CANCEL_IN_PROCESSING=1): cancel-in-processing, /api/dev/balance, Reframe Auto, Extend without prompt,
// camera trending as camera presets, Photo FX previews, no moderation cooldown. Run: npx tsx test/dp-batch.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const start = (port: number, env: Record<string, string> = {}) => { const D = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-')); return spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, PORT: String(port), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BILLING_MODE: 'team', OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_DEMO_AUTO: '0' /* keyless = no_provider (real-mode rules) */, ...env }, stdio: 'ignore', detached: true }); };
const s1 = start(testPort(8871), { OPENHIGGSFIELD_FAL_KEY: 'test-not-live' /* mock backend never calls fal */ }), s2 = start(testPort(8872), { OPENHIGGSFIELD_CANCEL_IN_PROCESSING: '1' });
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'dpf-')); const mp4 = path.join(T, 'a.mp4'), png = path.join(T, 'r.png'), key = path.join(T, 'k.png');
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=854x480:rate=24', '-f', 'lavfi', '-i', 'sine=d=6', '-t', '6', '-pix_fmt', 'yuv420p', '-shortest', mp4]);
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=512x512', '-frames:v', '1', png]); execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=1280x720', '-frames:v', '1', key]);
const api = (B: string) => ({
  get: async (u: string) => (await fetch(B + u)).json(),
  js: async (m: string, u: string, b: unknown) => { const r = await fetch(B + u, { method: m, headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, body: await r.json() }; },
  post: async (tool: string, f: Record<string, string>, files: [string, string][] = []) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v); for (const [k, p] of files) fd.append(k, new Blob([fs.readFileSync(p)]), path.basename(p)); const r = await fetch(`${B}/api/tools/${tool}/jobs`, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() }; },
});
const up = async (B: string) => { for (let i = 0; i < 60; i++) { try { if ((await fetch(`${B}/api/health`)).ok) return; } catch { /* */ } await new Promise((r) => setTimeout(r, 1000)); } throw new Error('server down'); };
const until = async (a: ReturnType<typeof api>, id: string, ok: (j: any) => boolean) => { for (let i = 0; i < 400; i++) { const j = await a.get(`/api/jobs/${id}`); if (ok(j)) return j; await new Promise((r) => setTimeout(r, 100)); } throw new Error('timeout'); };
const R = { rights: '1' };
try {
  await up(`http://localhost:${testPort(8871)}`); await up(`http://localhost:${testPort(8872)}`); const a = api(`http://localhost:${testPort(8871)}`), b = api(`http://localhost:${testPort(8872)}`);
  for (const x of [a, b]) await x.js('PUT', '/api/me/routing', { global: { mode: 'auto', allowFallback: true, useLocal: true, mockKeys: true } });
  // cancel while processing (single group)
  { const j = await a.post('object-swap', { ...R, prompt: 'x', route: 'local:comfy-open' }, [['video', mp4], ['refs', png]]); await until(a, j.body.id, (x) => x.status === 'running');
    const c = await fetch(`http://localhost:${testPort(8871)}/api/jobs/${j.body.id}/cancel`, { method: 'POST' }); const cb = await c.json(); assert.equal(c.status, 409); assert.equal(cb.code, 'cannot_cancel_processing');
    const end = await until(a, j.body.id, (x) => ['done', 'failed'].includes(x.status)); assert.equal(end.status, 'done'); console.log('ok cancel while processing → 409 cannot_cancel_processing (job finishes)'); }
  { await b.js('PUT', '/api/me/routing', { global: { mode: 'auto', allowFallback: true, useLocal: false, mockKeys: true } }); await b.js('POST', '/api/dev/balance', { credits: 5000 });
    const j = await b.post('object-swap', { ...R, prompt: 'x', provider: 'router-seedance' }, [['video', mp4], ['refs', png]]); assert.equal(j.status, 200, JSON.stringify(j.body)); assert.ok(j.body.cost > 0);
    const bal0 = (await b.get('/api/ledger')).balance; await until(b, j.body.id, (x) => x.status === 'running');
    const c = await fetch(`http://localhost:${testPort(8872)}/api/jobs/${j.body.id}/cancel`, { method: 'POST' }); assert.equal(c.status, 200);
    const end = await until(b, j.body.id, (x) => x.status === 'canceled' && x.refund); await new Promise((r) => setTimeout(r, 6000)); const after = await b.get(`/api/jobs/${j.body.id}`);
    assert.equal(after.status, 'canceled'); assert.equal(after.outputs.length, 0); assert.equal((await b.get('/api/ledger')).balance, bal0 + j.body.cost, 'refunded in full'); console.log(`ok CANCEL_IN_PROCESSING=1: real cancel, refund ${j.body.cost}, runner result discarded`); void end; }
  // dev balance + 402 affordable groups
  { const s = await a.js('POST', '/api/dev/balance', { credits: 7 }); assert.equal(s.status, 200); assert.equal(s.body.balance, 7); assert.equal((await a.get('/api/ledger')).balance, 7);
    assert.equal((await a.js('POST', '/api/dev/balance', { credits: -1 })).status, 400);
    await a.js('PUT', '/api/me/routing', { global: { mode: 'auto', allowFallback: true, useLocal: false, mockKeys: true } });
    const q = await a.get('/api/tools/object-swap/price?provider=router-seedance&seconds=6&resolution=720p'); await a.js('POST', '/api/dev/balance', { credits: q.credits + 1 });
    const j = await a.post('object-swap', { ...R, prompt: 'x', provider: 'router-seedance', count: '2' }, [['video', mp4], ['refs', png]]); assert.equal(j.status, 402, JSON.stringify(j.body).slice(0, 200)); assert.equal(j.body.affordableGroups, 1);
    await a.js('PUT', '/api/me/routing', { global: { mode: 'auto', allowFallback: true, useLocal: true, mockKeys: true } }); await a.js('POST', '/api/dev/balance', { credits: 100000 });
    console.log(`ok POST /api/dev/balance (mock) + 402 affordableGroups=1 at balance ${q.credits + 1}`); }
  // Reframe: default Auto
  { const t = (await a.get('/api/tools')).find((x: any) => x.id === 'reframe'); assert.equal(t.providers[0]?.id ?? t.providers[0], 'auto-reframe');
    await b.js('PUT', '/api/me/routing', { global: { mode: 'auto', allowFallback: true, useLocal: true, mockKeys: false } }); // no key at all (Reframe runs on Comfy Router since 2026-10-27; mockKeys would fake that key)
    const no = await b.post('reframe', { ...R, types: '["9:16"]' }, [['video', mp4]]); assert.equal(no.status, 402); assert.ok(no.body.needsKey || /key/i.test(no.body.error), JSON.stringify(no.body).slice(0, 200));
    await a.js('PUT', '/api/me/routing', { global: { mode: 'auto', allowFallback: true, useLocal: false, mockKeys: true } });
    { const j = await a.post('reframe', { ...R, types: '["9:16"]' }, [['video', mp4]]); assert.equal(j.status, 200, JSON.stringify(j.body).slice(0, 200)); assert.equal(j.body.route, 'comfy-router:auto-reframe', 'Auto: Comfy Router (Luma Ray 3.2) first since 2026-10-27'); }
    for (const [q, slug] of [['high', 'ray-2/reframe'], ['fast', 'ray-2-flash/reframe']]) { const j = await a.post('reframe', { ...R, types: '["9:16"]', quality: q, runOn: 'fal' }, [['video', mp4]]); assert.equal(j.status, 200, JSON.stringify(j.body).slice(0, 200)); assert.ok(String(j.body.route).endsWith(slug), `${q} → ${j.body.route}`); }
    await a.js('PUT', '/api/me/routing', { global: { mode: 'auto', allowFallback: true, useLocal: true, mockKeys: true } }); console.log('ok reframe default auto-reframe: no key 402, Auto → Comfy Router; on fal high → Ray 2, fast → Ray 2 Flash'); }
  // Extend without prompt
  { const j = await a.post('h3-extend', { ...R, extendSeconds: '5' }, [['video', mp4]]); assert.equal(j.status, 200, JSON.stringify(j.body).slice(0, 200)); const jj = await a.get(`/api/jobs/${j.body.id}`); assert.equal(jj.input.promptDefaulted, true); assert.ok(jj.input.prompt.length > 10); console.log('ok extend: prompt optional (neutral default sent; fal requires prompt)'); }
  // Camera trending = camera presets
  { const j = await a.post('camera', { ...R, types: '["eye-push"]', route: 'local:comfy-open' }, [['image', key]]); assert.equal(j.status, 200, JSON.stringify(j.body).slice(0, 300)); await until(a, j.body.id, (x) => x.status === 'done');
    const t = await a.get('/api/presets?toolId=camera&category=trending'); assert.ok(t.items.length >= 1 && t.items[0].id === 'eye-push' && t.items[0].uses >= 1 && t.items[0].providers);
    assert.ok(t.categories.includes('trending') && t.categories.includes('new'));
    const c = await a.get('/api/camera/categories'); assert.equal(c.trending[0].kind, 'camera-preset'); assert.equal(c.trending[0].presetId, 'eye-push'); assert.ok(!('videoPreset' in c.trending[0]));
    console.log('ok camera trending: real camera presets (category=trending, kind camera-preset, no videoPreset)'); }
  // Photo FX previews
  { const fx = (await a.get('/api/tools')).find((x: any) => x.id === 'photo-fx'); for (const p of fx.presets) assert.ok(p.standIn ? p.previewWebm === null : p.previewWebm && fs.existsSync(path.join(ROOT, 'samples', p.previewWebm.split('/samples/')[1])), p.id); /* stand-in effects: no loop yet (never a 404) */ console.log(`ok photo-fx previewWebm on ${fx.presets.length} presets`); }
  // moderation cooldown removed (no policing layer): no moderation block in /api/health
  { const q = await a.get('/api/health'); assert.ok(!('moderation' in q), JSON.stringify(q).slice(0, 300)); console.log('ok /api/health has no moderation/cooldown block'); }
  console.log('ALL OK dp-batch');
} finally { for (const s of [s1, s2]) try { process.kill(-s.pid!); } catch { /* */ } }
