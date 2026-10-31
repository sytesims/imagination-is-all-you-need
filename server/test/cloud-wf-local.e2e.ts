// E2E (own mock servers :8941 open-weights-only, :8942 normal, :8943 useLocal on; temp data dirs, no keys):
// B5: a cloud-* provider counts as open weights only if its graphs have no API/partner nodes → cloud-h3 (ComfyCloudMiniMaxH3*Node) is hosted.
// B1: cloud-h3-wf (workflows/cloud/h3-*-api.json, core nodes) is listed + routable in open-weights-only mode, mock-run, 2–15 s, quote = charge.
// Bug Hunter #12: localReachable vs localEnabled; local routes listed as available only when enabled / pinned / local-only, else reason local_off.
// Run: npx tsx test/cloud-wf-local.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { apiNodesIn } from '../src/apiNodes.ts';
const ROOT = path.resolve(import.meta.dirname, '..');
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '' };
const boot = (port: number, extra: Record<string, string> = {}) => spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PORT: String(port), OPENHIGGSFIELD_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'cwl-')),
  OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '150', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_USE_LOCAL: '0', ...extra }, stdio: 'ignore', detached: true });
const stop = (p: ChildProcess) => { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* gone */ } };
const api = (port: number) => { const B = `http://localhost:${port}`;
  const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
  const job = async (tool: string, f: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v); const r = await fetch(`${B}/api/tools/${tool}/jobs`, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() as any }; };
  const until = async (id: string) => { for (let i = 0; i < 300; i++) { const j = await get(`/api/jobs/${id}`); if (['done', 'failed', 'needs_decision', 'blocked', 'canceled'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 100)); } throw new Error('timeout ' + id); };
  const ready = async () => { for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) return; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); } throw new Error(`server ${port} did not start`); };
  return { get, job, until, ready }; };
const ok = (m: string) => console.log('ok ' + m);
const ids = (t: any) => (t.providers ?? []).map((p: any) => p.id ?? p);
const O = boot(testPort(8941), { OPENHIGGSFIELD_OPEN_WEIGHTS_ONLY: '1' }), N = boot(testPort(8942)), L = boot(testPort(8943), { OPENHIGGSFIELD_USE_LOCAL: '1' });
try {
  const o = api(testPort(8941)), n = api(testPort(8942)), l = api(testPort(8943)); await Promise.all([o.ready(), n.ready(), l.ready()]);
  // B5 static
  assert.deepEqual(apiNodesIn('h3-cloud-t2v-api.json'), ['ComfyCloudMiniMaxH3TextToVideoNode']); assert.deepEqual(apiNodesIn('cloud/h3-t2v-api.json'), []); assert.deepEqual(apiNodesIn('cloud/h3-i2v-api.json'), []);
  ok('B5: API-node scan: h3-cloud-*.json uses ComfyCloudMiniMaxH3*Node; workflows/cloud/h3-*.json has none');
  // OW-only: cloud-h3-wf shown, API-node cloud-h3 hidden
  const hvO = (await o.get('/api/tools')).find((t: any) => t.id === 'h3-video'); assert.ok(ids(hvO).includes('cloud-h3-wf'), JSON.stringify(ids(hvO))); assert.ok(!ids(hvO).includes('cloud-h3'), 'cloud-h3 hidden in OW');
  const mO = (await o.get('/api/models?toolId=h3-video')).groups.flatMap((g: any) => g.models).map((m: any) => m.id); assert.ok(mO.includes('cloud-h3-wf') && !mO.includes('cloud-h3'), JSON.stringify(mO));
  const rw = (await o.get('/api/routes?toolId=h3-video&modelId=cloud-h3-wf')).routes[0].routes.find((x: any) => x.kind === 'comfy-cloud'); assert.equal(rw.routeId, 'comfy-cloud:cloud-h3-wf'); assert.notEqual(rw.reason, 'open-weights-only mode');
  const bad = await o.job('h3-video', { prompt: 'x', types: '["t2v"]', provider: 'cloud-h3' }); assert.equal(bad.status, 400, 'cloud-h3 refused in OW'); assert.match(JSON.stringify(bad.body), /open-weights-only|not supported|hosted/);
  ok('OW-only: cloud-h3-wf listed on /api/tools + /api/models with comfy-cloud route not blocked; cloud-h3 (API nodes) hidden and refused');
  // DP 6d: 5 s / 10 s only (40 / 80 credits at 768p; 480p has its own GPU-time rate since 2026-10-27, hostedPrices usdByQuality: 15 / 30), quote = charge, mock run
  for (const [sec, want, want480] of [[5, 40, 15], [10, 80, 30]] as const) {
    const q = await o.get(`/api/models/quote?model=cloud-h3-wf&toolId=h3-video&seconds=${sec}`); assert.equal(q.valid, true, `${sec}s ${q.reason ?? q.error}`); assert.equal(q.route, 'comfy-cloud:cloud-h3-wf'); assert.equal(q.demo ? q.listCredits : q.credits, want, `${sec}s = ${want}`); if (q.demo) assert.equal(q.credits, 0, 'demo preview is free');
    const q480 = await o.get(`/api/models/quote?model=cloud-h3-wf&toolId=h3-video&seconds=${sec}&resolution=480p`); assert.equal(q480.demo ? q480.listCredits : q480.credits, want480, `${sec}s 480p = ${want480}`);
    const j = await o.job('h3-video', { prompt: 'a paper boat drifting', types: '["t2v"]', provider: 'cloud-h3-wf', seconds: String(sec) }); assert.equal(j.status, 200, JSON.stringify(j.body)); assert.equal(j.body.cost, q.credits, `${sec}s quote = charge`);
    if (sec === 5) { const d = await o.until(j.body.id); assert.equal(d.status, 'done'); assert.match(JSON.stringify(d.attribution ?? ''), /MiniMax H3/); }
  }
  // D5 (2026-10-28): any other length is made at the nearest offered one, with a note; quote = charge at that length (never a 120-credit 15 s job)
  for (const [sec, to] of [[2, 5], [6, 5], [8, 10], [15, 10], [16, 10]] as const) { const q = await o.get(`/api/models/quote?model=cloud-h3-wf&toolId=h3-video&seconds=${sec}`);
    assert.equal(q.valid, true, `${sec}s quote snaps`); assert.equal(q.demo ? q.listCredits : q.credits, to === 5 ? 40 : 80, `${sec}s quoted at ${to}s`);
    const j = await o.job('h3-video', { prompt: 'x', types: '["t2v"]', provider: 'cloud-h3-wf', seconds: String(sec) }); assert.equal(j.status, 200, JSON.stringify(j.body)); assert.equal(j.body.cost, q.credits, `${sec}s quote = charge`);
    assert.ok((j.body.warnings ?? []).some((w: string) => w.includes(`Made at ${to} s`)), JSON.stringify(j.body.warnings)); await o.until(j.body.id); }
  { const dq = await o.get('/api/models/quote?model=cloud-h3-wf&toolId=h3-video'); assert.equal(dq.demo ? dq.listCredits : dq.credits, 40, 'default 5 s = 40');
    const vl = (await o.get('/api/models?toolId=h3-video')).groups.flatMap((g: any) => g.models).find((m: any) => m.id === 'cloud-h3-wf').videoLimits;
    assert.deepEqual(vl.resolutions, ['768p', '480p']); assert.deepEqual(vl.durations, [5, 10]); assert.equal(vl.minSeconds, 5); assert.equal(vl.maxSeconds, 10); assert.deepEqual(vl.duration, { min: 5, max: 10, step: 5, values: [5, 10] }); }
  ok('6d: cloud-h3-wf 5 s = 40, 10 s = 80 at 768p (15 / 30 at 480p), quote = charge, default 5 s; 2/6/8/15/16 s snap to 5 or 10 s with a note');
  const hvN = (await n.get('/api/tools')).find((t: any) => t.id === 'h3-video'); assert.ok(ids(hvN).includes('cloud-h3') && ids(hvN).includes('cloud-h3-wf')); ok('normal mode: both cloud-h3 and cloud-h3-wf listed');
  // #12 local state
  const cN = await n.get('/api/config'); assert.deepEqual(cN.local, { reachable: true, enabled: false, status: 'off', statusText: 'Reachable, but off' }); assert.equal(cN.localReachable, true); assert.equal(cN.localEnabled, false);
  const cL = await l.get('/api/config'); assert.deepEqual(cL.local, { reachable: true, enabled: true, status: 'on', statusText: 'Reachable and on' });
  const lrN = (await n.get('/api/routes?toolId=create-image&modelId=comfy-zimage-turbo')).routes[0].routes.find((x: any) => x.kind === 'local');
  assert.equal(lrN.available, false); assert.equal(lrN.reasonCode, 'local_off'); assert.equal(lrN.reason, 'Turn on Your computer in Settings to run this here'); assert.equal(lrN.status, 'Reachable, but off'); assert.equal(lrN.pinnable, true);
  const lrL = (await l.get('/api/routes?toolId=create-image&modelId=comfy-zimage-turbo')).routes[0].routes.find((x: any) => x.kind === 'local'); assert.equal(lrL.available, true); assert.equal(lrL.status, 'Reachable and on');
  const pin = await n.job('create-image', { prompt: 'a mug', types: '["generate"]', provider: 'comfy-zimage-turbo', route: 'local:comfy-zimage-turbo' }); assert.equal(pin.status, 200, JSON.stringify(pin.body)); assert.equal(pin.body.cost, 0, 'a pinned local route still runs at 0 with Use local off');
  const lo = (await n.get('/api/routes?toolId=sdr-hdr')).routes[0].routes.find((x: any) => x.kind === 'local'); if (lo) assert.equal(lo.available, true, 'local-only model stays available');
  ok('#12: /api/config local {reachable, enabled, status, statusText}; local routes local_off ("Reachable, but off", pinnable) unless Use local is on / pinned / local-only; request pin runs at 0');
  // BUG-HUNT-1 #7: Recreate on Upscale prices the restored route (a local job that cost 0 quotes 0), and submit runs that route
  // 9514e308 (2026-10-26): local SeedVR2 runs on NVIDIA only, so on this test server (hardware unread) it is refused in plain words, nothing charged;
  // the Recreate check runs on the local route every computer has, Real-ESRGAN x2 (959c88cc: the local default on a Mac)
  const upPost = async (provider: string) => { const fd = new FormData(); for (const [k, v] of Object.entries({ types: '["precise"]', provider, route: `local:${provider}` })) fd.append(k, v);
    fd.append('video', new Blob([fs.readFileSync(path.join(ROOT, 'samples/sample-pattern.mp4'))], { type: 'video/mp4' }), 'clip.mp4');
    const r = await fetch(`http://localhost:${testPort(8942)}/api/tools/upscale/jobs`, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() as any }; };
  { const s = await upPost('comfy-seedvr2'); assert.equal(s.status, 409, JSON.stringify(s.body).slice(0, 300)); assert.equal(s.body.code, 'route_not_runnable'); assert.match(s.body.reason, /graphics card/); assert.equal(s.body.charged, false);
    ok('#7a: local SeedVR2 on a computer without a readable NVIDIA GPU: 409 with the plain reason, nothing charged'); }
  { const LR = 'local:comfy-video-esrgan'; const s0 = await upPost('comfy-video-esrgan'); const up = s0.body; assert.equal(s0.status, 200, JSON.stringify(up)); assert.equal(up.cost, 0);
    const done = await n.until(up.id); assert.equal(done.status, 'done', JSON.stringify(done.error));
    const pf = await n.get(`/api/jobs/${up.id}/prefill?action=recreate`); assert.equal(pf.form.route, LR); assert.equal(pf.price.route, LR); assert.equal(pf.price.credits, 0); assert.equal(pf.routeId, LR);
    const dflt = await n.get('/api/tools/upscale/price'); assert.ok((dflt.demo ? dflt.listCredits : dflt.credits) > 0, 'the default (cloud) route would cost credits');
    const re = await n.job('upscale', { ...pf.form, ...(pf.submit ?? {}) }); assert.equal(re.status, 200, JSON.stringify(re.body)); assert.equal(re.body.cost, pf.price.credits, 'recreate charge = recreate quote');
    ok(`#7: local upscale recreate → form.route + price.route ${LR}, 0 cr (default route ${dflt.credits} cr); resubmit charged 0`); }
  console.log('PASS cloud-wf-local');
} finally { stop(O); stop(N); stop(L); }
