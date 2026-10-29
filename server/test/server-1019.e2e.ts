// Oct 19 server batch (DP + Bug Hunter PB re-check 4). Throwaway mock server :8993 (no keys, Use local off), temp data.
// Run: npx tsx test/server-1019.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 's1019-')); const B = `http://localhost:${testPort(8993)}`;
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MINIMAX_API_KEY: '', OPENHIGGSFIELD_DASHSCOPE_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '', OPENHIGGSFIELD_LUMA_API_KEY: '' };
const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, detached: true, stdio: 'ignore', env: { ...process.env, ...NOKEYS, PORT: String(testPort(8993)), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, '.env.local'), OPENHIGGSFIELD_BACKEND: 'mock',
  OPENHIGGSFIELD_MOCK_DELAY_MS: '100', OPENHIGGSFIELD_SEED_COMMUNITY: '0', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json') } });
const ok = (m: string) => console.log('ok ' + m);
const get = async (u: string) => { const r = await fetch(B + u); return { status: r.status, body: (await r.json()) as any }; };
const form = async (u: string, f: Record<string, string>, files: [string, string][] = []) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v); for (const [k, fp] of files) fd.append(k, new Blob([fs.readFileSync(fp)]), path.basename(fp)); const r = await fetch(B + u, { method: 'POST', body: fd }); return { status: r.status, body: (await r.json()) as any }; };
const IMG = path.join(ROOT, 'samples', 'sample-character.png'); const H3 = encodeURIComponent('["h3-push-in"]');
try {
  for (let i = 0; i < 240; i++) { try { if ((await fetch(`${B}/api/config`)).ok) break; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 250)); }
  // #1 Upscale: a real clip size → sourceSize/outputSize/scale, size not estimated
  { const q = (await get('/api/tools/upscale/price?width=1280&height=720&seconds=5')).body;
    assert.deepEqual(q.sourceSize, { width: 1280, height: 720 }); assert.equal(q.sourceResolution, '720p'); assert.equal(q.scale, 2); assert.deepEqual(q.outputSize, { width: 1920, height: 1080 }); /* 2026-10-26: the default size is 1080p (shared/videoUpscale.ts) */ assert.equal(q.sizeEstimated, false); assert.equal(q.estimated, false);
    const a = (await get('/api/tools/upscale/price?seconds=5')).body; assert.equal(a.sizeEstimated, true); assert.ok(a.assumedSize);
    const v = (await get('/api/tools/app-video-upscale/price?width=640&height=360&seconds=4')).body; assert.deepEqual(v.sourceSize, { width: 640, height: 360 }); assert.equal(v.sizeEstimated, false);
    ok(`#1 upscale width/height → sourceSize 1280×720, scale 2, outputSize ${q.outputSize.width}×${q.outputSize.height}, sizeEstimated:false (no size → true)`); }
  // #2 H3 Camera Motion: route line = quote = job; a pinned local route stays local
  { const v = (await get('/api/routes?toolId=camera&modelId=comfy-h3-camera')).body.routes[0]; const q = (await get(`/api/tools/camera/price?provider=comfy-h3-camera&image=1&types=${H3}`)).body;
    assert.equal(v.defaultRoute, q.route); assert.equal(v.via.text, 'Sample'); const lr = v.routes.find((r: any) => r.kind === 'local'); assert.equal(lr.runnable, false); assert.equal(lr.reasonCode, 'local_off');
    const fr = v.routes.find((r: any) => r.routeId === q.route); assert.equal(fr.listCredits, q.listCredits, 'listing price = quote price');
    const j = await form('/api/tools/camera/jobs', { rights: '1', provider: 'comfy-h3-camera', types: '["h3-push-in"]', prompt: 'x' }, [['image', IMG]]); assert.equal(j.status, 200, JSON.stringify(j.body)); assert.equal(j.body.route, q.route); assert.equal(j.body.demo, true);
    const jj = (await get(`/api/jobs/${j.body.id}`)).body; assert.equal(jj.demoNotice.routeId, q.route, 'the demo preview names the route that ran');
    const pq = (await get(`/api/tools/camera/price?provider=comfy-h3-camera&image=1&types=${H3}&route=local:comfy-h3-camera`)).body; assert.equal(pq.route, 'local:comfy-h3-camera'); assert.equal(pq.demo, false);
    const pj = await form('/api/tools/camera/jobs', { rights: '1', provider: 'comfy-h3-camera', types: '["h3-push-in"]', prompt: 'x', route: 'local:comfy-h3-camera', allowFallback: '1' }, [['image', IMG]]);
    assert.equal(pj.body.route, 'local:comfy-h3-camera'); assert.deepEqual(pj.body.routing.order, ['local:comfy-h3-camera'], 'no demo fallback after a pinned local route');
    ok(`#2 H3 Camera Motion (Use local off): route line, quote and job all ${q.route} (demo, list ${q.listCredits}); local route local_off; pinned local stays local, no fal fallback`); }
  // #3 + #4 + #6 Edit Video menu = /api/routes = quote (Upscale SeedVR2)
  { const m = (await get('/api/edit-video/tools')).body.tools.find((t: any) => t.id === 'upscale'); const rv = (await get('/api/routes?toolId=upscale&modelId=comfy-seedvr2')).body.routes[0]; const q = (await get('/api/tools/upscale/price')).body;
    const mm = m.models.find((x: any) => x.id === 'comfy-seedvr2');
    for (const r of mm.routes) { const l = rv.routes.find((x: any) => x.routeId === r.routeId); assert.equal(r.available, l.available, r.routeId); assert.equal(r.runnable, l.runnable, r.routeId); assert.equal(r.demo, l.demo, r.routeId); assert.equal(r.reasonCode, l.reasonCode ?? null, r.routeId); assert.equal(r.reason, l.reason ?? null, r.routeId); }
    const loc = mm.routes.find((r: any) => r.kind === 'local'); assert.equal(loc.runnable, false); /* 2026-10-26: SeedVR2 3B locally is NVIDIA-only; this test machine's GPU is unknown, so that is the reason shown */ assert.equal(loc.reasonCode, 'input_blocked'); assert.match(loc.reason, /NVIDIA graphics card/); assert.ok(!/Free · local/.test(loc.priceLine));
    assert.equal(q.route, mm.routes.find((r: any) => r.runnable).routeId, 'quote = the runnable route of the menu');
    const demo = mm.routes.find((r: any) => r.demo); assert.match(demo.reason, /^You’ll get a free sample\. Real runs need a fal key/); assert.equal(demo.keyNeededForRealRuns, true); assert.ok(!/^Add a /.test(demo.reason));
    const all = (await get('/api/routes')).body.routes.flatMap((x: any) => x.routes); assert.ok(all.filter((r: any) => r.reasonCode === 'local_off').length >= 8); assert.ok(all.every((r: any) => r.reason !== 'local_off'), 'no raw local_off reason');
    assert.ok(all.filter((r: any) => r.demo).every((r: any) => /^You’ll get a free sample|isn’t ready in this app yet/.test(r.reason)));
    ok(`#3/#4/#6 Upscale SeedVR2: menu = /api/routes (local_off, plain reason, not runnable); quote runs ${q.route}; demo reasons say free preview + key for real runs`); }
  // #5 Translate: unknown code rejected, not echoed
  { const r = await get('/api/tools/app-translate-video/price?language=xx'); assert.equal(r.status, 400); assert.equal(r.body.code, 'invalid_language'); assert.ok(!/\bxx\b/.test(r.body.error));
    const s = await form('/api/tools/voice/jobs', { rights: '1', types: '["translate"]', language: 'qq', prompt: 'x' }); assert.equal(s.status, 400); assert.equal(s.body.code, 'invalid_language');
    ok('#5 unknown translate language → 400 invalid_language (quote + submit), code not echoed'); }
  // #7 enum params
  { const n = await get('/api/tools/create-image/price?resolution=%00'); assert.equal(n.status, 400); assert.equal(n.body.code, 'invalid_resolution'); assert.ok(!n.body.error.includes('\u0000'));
    assert.equal((await get('/api/tools/camera/price?aspect=7:7')).body.code, 'unsupported_aspect'); assert.equal((await get('/api/tools/upscale/price?scale=9')).body.code, 'invalid_scale'); assert.equal((await get('/api/tools/create-image/price?quality=ultra')).body.code, 'invalid_quality');
    assert.equal((await get('/api/tools/h3-video/price?provider=api-minimax-h3&quality=2k')).status, 200, 'quality=<resolution> alias + case'); assert.equal((await get('/api/tools/create-image/price?aspect=16:9&quality=HIGH&resolution=1080p&provider=api-ideogram')).status, 200); /* a model with quality tiers: the keyless default (Nano Banana 2.1) has none, so quality=HIGH is a 400 there on quote and submit alike (quote-submit-agree.e2e) */
    const s = await form('/api/tools/create-image/jobs', { rights: '1', types: '["generate"]', prompt: 'x', resolution: '9000p' }); assert.equal(s.status, 400); assert.equal(s.body.code, 'invalid_resolution'); assert.equal(s.body.refund.charged, false);
    ok('#7 resolution/aspect/quality/scale allowlists on quote + submit → 400 invalid_<field>; NUL never echoed; aliases still accepted'); }
  // #8 input block: real price, chargeable:false, blockedReason, no priceAvailable:false
  { const q = (await get('/api/tools/h3-video/price?provider=comfy-h3&route=fal:minimax/h3/text-to-video&duration=6&resolution=768p')).body;
    assert.equal(q.runnable, false); assert.equal(q.reasonCode, 'input_blocked'); assert.ok(q.credits > 0); assert.equal(q.credits, q.listCredits); assert.equal(q.priceAvailable, true); assert.equal(q.chargeable, false);
    assert.match(q.blockedReason, /only does text to video/); assert.equal(q.unavailableReason, undefined); assert.ok(!/unavailable/i.test(q.priceLine));
    const nw = (await get('/api/tools/upscale/price?model=direct-flux3-upscale&route=fal:pending/flux-3-upscaler')).body; if (nw.runnable === false && nw.reasonCode !== 'input_blocked') assert.equal(nw.blockedReason, undefined);
    ok(`#8 input block → credits ${q.credits} (= listCredits), priceAvailable:true, chargeable:false, blockedReason "${q.blockedReason}"`); }
  console.log('ALL OK server-1019');
} finally { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* gone */ } await new Promise((r) => setTimeout(r, 600)); try { fs.rmSync(D, { recursive: true, force: true }); } catch { /* still writing */ } }
