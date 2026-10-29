/** E2E (own mock servers, ports 8985/8986): ONE duration rule on Camera Moves + Photo FX (quote = submit), and fallbackOffers decided by its own flag.
 *  - app.durationsByProvider / defaultDurationByProvider; /api/tools providers[].durations; /api/routes durations
 *  - unsupported length → snapped to the nearest allowed one with a note on BOTH quote and submit (D5, 2026-10-28); quote = charge
 *  - job length = quoted length; no length → same default on quote and submit; cost = quote
 *  - OPENHIGGSFIELD_FALLBACK_OFFERS=0 (no filming mode): /api/config fallbackOffers:false; a pinned route failure is never needs_decision */
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const boot = (port: number, extra: Record<string, string> = {}) => { const D = fs.mkdtempSync(path.join(os.tmpdir(), 'dur-'));
  return spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, PORT: String(port), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '100', OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_HOSTED: '',
    OPENHIGGSFIELD_ENV_FILE: path.join(D, '.env.local'), OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'no-filming.json'), OPENHIGGSFIELD_LOCAL_AVAILABLE: '1',
    OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', ...extra }, stdio: 'ignore', detached: true }); };
const stop = (p: ChildProcess) => { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* gone */ } };
const api = (port: number) => { const B = `http://localhost:${port}`;
  const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
  const raw = async (u: string) => { const r = await fetch(B + u); return { status: r.status, body: await r.json() as any }; };
  const ready = async () => { for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) return; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); } throw new Error(`server ${port} did not start`); };
  const post = async (tool: string, f: Record<string, string>, files: [string, string][] = []) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v);
    for (const [k, p] of files) fd.append(k, new Blob([fs.readFileSync(p)], { type: 'image/png' }), path.basename(p));
    const r = await fetch(`${B}/api/tools/${tool}/jobs`, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() as any }; };
  const until = async (id: string) => { for (let i = 0; i < 600; i++) { const j = await get(`/api/jobs/${id}`); if (['done', 'failed', 'needs_decision', 'blocked', 'canceled'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 100)); } throw new Error('timeout ' + id); };
  return { get, raw, ready, post, until };
};
const png = path.join(os.tmpdir(), `dur-key-${process.pid}.png`);
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=1', '-frames:v', '1', png]);
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, k) => a + k);
const H3 = range(4, 15); // MiniMax H3 on Comfy Router: 4–15 s (the Router's duration field takes 4 to 15, comfy-docs minimax-h3/code.md; 2026-10-28)
const p1 = boot(testPort(8985)); const p2 = boot(testPort(8986), { OPENHIGGSFIELD_FALLBACK_OFFERS: '0', OPENHIGGSFIELD_FAL_KEY: 'test-not-a-key', OPENHIGGSFIELD_REPLICATE_API_TOKEN: 'test-not-a-key' });
try {
  const a = api(testPort(8985)); await a.ready();
  const tools = await a.get('/api/tools'); const cam = tools.find((t: any) => t.id === 'camera'); const fx = tools.find((t: any) => t.id === 'photo-fx');
  const want: Record<string, number[]> = { 'comfy-open': [3, 5], 'cloud-ltx-camera': [3, 5], 'comfy-h3-camera': [3, 5], 'router-seedance': range(4, 15), 'api-minimax-h3': H3 }; // Kling / Veo no longer offered on Camera Moves
  assert.deepEqual(cam.app.durationsByProvider, want); assert.deepEqual(cam.app.defaultDurationByProvider, { 'comfy-open': 5, 'cloud-ltx-camera': 5, 'comfy-h3-camera': 5, 'router-seedance': 5, 'api-minimax-h3': 5 });
  for (const p of cam.providers) assert.deepEqual(p.durations, want[p.id], `/api/tools camera providers[${p.id}].durations`);
  assert.deepEqual(fx.app.durationsByProvider['comfy-open'], [5]); assert.deepEqual(fx.app.durationsByProvider['api-minimax-h3'], H3); assert.equal(fx.app.defaultDurationByProvider['api-minimax-h3'], 5);
  { const rv = await a.get('/api/routes?toolId=camera&modelId=api-minimax-h3'); const m = rv.routes.find((x: any) => x.modelId === 'api-minimax-h3'); assert.deepEqual(m.durations, H3); for (const o of m.routes) assert.deepEqual(o.durations, H3); }
  console.log('ok listing: camera durationsByProvider', JSON.stringify(cam.app.durationsByProvider));
  const preset = (prov: string) => cam.presets.find((p: any) => !p.providers || p.providers.includes(prov))!.id;
  const bal = async () => (await a.get('/api/ledger')).balance as number;
  // D5 (user, 2026-10-28) + the wrong-block fix: an unsupported length snaps to the nearest allowed one with a note (camera moves under 4 s on H3 are made at 4 s); quote = charge
  for (const [tool, prov, d, to] of [['camera', 'api-minimax-h3', '3', 4], ['camera', 'api-minimax-h3', '16', 15], ['camera', 'comfy-open', '4', 5], ['photo-fx', 'api-minimax-h3', '3', 4]] as const) {
    const tp = tool === 'camera' ? preset(prov) : fx.presets[0].id;
    const q = await a.raw(`/api/tools/${tool}/price?provider=${prov}&duration=${d}&types=${encodeURIComponent(JSON.stringify([tp]))}&image=1`);
    assert.equal(q.status, 200, `${tool} ${prov} ${d}s quote ${JSON.stringify(q.body)}`);
    const s = await a.post(tool, { provider: prov, duration: d, types: JSON.stringify([tp]), rights: '1' }, [['image', png]]);
    assert.equal(s.status, 200, `${tool} ${prov} ${d}s submit ${JSON.stringify(s.body)}`); const j = await a.get(`/api/jobs/${s.body.id}`);
    assert.equal(j.input.duration, to, `${tool} ${prov} ${d}s made at ${to}s`); assert.ok((s.body.warnings ?? []).some((w: string) => new RegExp(`Made at ${to} s, the closest length`).test(w)), JSON.stringify(s.body.warnings));
    assert.equal(s.body.cost, q.body.credits, `${tool} ${prov} ${d}s: quote = charge`);
  }
  console.log('ok unsupported length snaps with a note on quote AND submit (camera MiniMax H3 3→4 / 16→15 s, camera LTX/Fun 4→5 s, Photo FX MiniMax H3 3→4 s), quote = charge');
  for (const [prov, d] of [['api-minimax-h3', '4'], ['api-minimax-h3', '6'], ['api-minimax-h3', ''], ['router-seedance', '4'], ['router-seedance', '12'], ['comfy-open', '3'], ['comfy-open', '']] as const) {
    const tp = preset(prov); const qs = `provider=${prov}${d ? `&duration=${d}` : ''}&types=${encodeURIComponent(JSON.stringify([tp]))}&image=1`; // image=1: the job carries a start image (Oct 18: a chosen image-only model quotes 400 image_required without it, as submit)
    const q = await a.get(`/api/tools/camera/price?${qs}`); const s = await a.post('camera', { provider: prov, types: JSON.stringify([tp]), rights: '1', ...(d ? { duration: d } : {}) }, [['image', png]]);
    assert.equal(s.status, 200, JSON.stringify(s.body)); const j = await a.get(`/api/jobs/${s.body.id}`);
    assert.equal(j.input.duration, d ? Number(d) : cam.app.defaultDurationByProvider[prov], `${prov} job length`); assert.equal(s.body.cost, q.credits, `${prov} ${d || 'default'} s: quote ${q.credits} = charge ${s.body.cost}`);
  }
  console.log('ok camera: job length = quoted length, quote = charge (MiniMax H3 4 s / 6 s / default 5 s, Seedance 4 s / 12 s, local 3 s / default 5 s)');
  // fallbackOffers: the flag decides, without filming mode
  const b = api(testPort(8986)); await b.ready();
  const cfg = await b.get('/api/config'); assert.equal(cfg.filming.on, false); assert.equal(cfg.fallbackOffers, false); assert.equal(cfg.filming.fallbackOffers, false); assert.equal(cfg.notificationPrompts, true);
  { const c1 = await a.get('/api/config'); assert.equal(c1.fallbackOffers, true); }
  const QWEN = 'comfy-qwen-image', FAL = 'fal:fal-ai/qwen-image';
  const s = await b.post('create-image', { prompt: 'a lighthouse at dusk', types: '["generate"]', provider: QWEN, route: FAL, allowFallback: '0', simulateRouteFail: FAL });
  assert.equal(s.status, 200, JSON.stringify(s.body)); const j = await b.until(s.body.id);
  assert.equal(j.status, 'failed', `fallbackOffers:false → plain failure, never needs_decision (${j.status})`); assert.deepEqual(j.alternatives ?? [], []);
  console.log(`ok fallbackOffers:false (OPENHIGGSFIELD_FALLBACK_OFFERS=0, filming off) → ${j.status}, no alternatives, creditsBack ${JSON.stringify(j.creditsBack)}`);
  console.log('ALL OK durations-camera');
} finally { stop(p1); stop(p2); try { fs.rmSync(png); } catch { /* */ } }
