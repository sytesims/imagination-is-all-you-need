// Oct 19 server batch 2 (DP asks #1–#4 + Bug Hunter PB re-check 5 P3s). Throwaway mock server :8994 (no keys, Use local off), temp data.
// Run: npx tsx test/server-1019b.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 's1019b-')); const B = `http://localhost:${testPort(8994)}`;
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MINIMAX_API_KEY: '', OPENHIGGSFIELD_DASHSCOPE_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '', OPENHIGGSFIELD_LUMA_API_KEY: '' };
const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, detached: true, stdio: 'ignore', env: { ...process.env, ...NOKEYS, PORT: String(testPort(8994)), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, '.env.local'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_HW_MOCK: 'rtx4090' /* 2026-10-26: SeedVR2 3B runs locally on NVIDIA only */,
  OPENHIGGSFIELD_MOCK_DELAY_MS: '100', OPENHIGGSFIELD_SEED_COMMUNITY: '0', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json') } });
const ok = (m: string) => console.log('ok ' + m);
const get = async (u: string) => { const r = await fetch(B + u); return { status: r.status, body: (await r.json()) as any }; };
const form = async (u: string, f: Record<string, string>, files: [string, string][] = []) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v); for (const [k, fp] of files) fd.append(k, new Blob([fs.readFileSync(fp)]), path.basename(fp)); const r = await fetch(B + u, { method: 'POST', body: fd }); return { status: r.status, body: (await r.json()) as any }; };
const done = async (id: string) => { let j: any; for (let i = 0; i < 300; i++) { j = (await get(`/api/jobs/${id}`)).body; if (['done', 'failed', 'blocked', 'needs_decision', 'canceled'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 100)); } return j; };
const IMG = path.join(ROOT, 'samples', 'sample-character.png'); const H3 = encodeURIComponent('["h3-push-in"]');
const MP4 = path.join(D, 'clip.mp4'); execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=854x480:rate=24', '-t', '5', '-pix_fmt', 'yuv420p', MP4]);
const XSS = '<script>alert(1)</script>';
try {
  for (let i = 0; i < 240; i++) { try { if ((await fetch(`${B}/api/config`)).ok) break; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 250)); }
  assert.equal((await get('/api/config')).body.localEnabled, false);
  // #1 + #4: local_off in the lists (runsWhenPinned + reasonDetail); a pinned quote runs locally (local_pinned); the pinned submit really runs locally
  { for (const [tool, model, extra, files] of [['upscale', 'comfy-seedvr2', '', [['video', MP4]]], ['camera', 'comfy-h3-camera', `&image=1&types=${H3}`, [['image', IMG]]]] as const) {
      const lr = (await get(`/api/routes?toolId=${tool}&modelId=${model}`)).body.routes[0].routes.find((r: any) => r.kind === 'local');
      assert.equal(lr.reasonCode, 'local_off'); assert.equal(lr.runnable, false); assert.equal(lr.runsWhenPinned, true); assert.equal(lr.pinnable, true);
      assert.equal(lr.reasonDetail, "Your computer isn’t the default while it’s off. Turn it on, or pick Your computer in Run on.");
      const q = (await get(`/api/tools/${tool}/price?provider=${model}&route=local:${model}${extra}`)).body;
      assert.equal(q.runnable, true); assert.equal(q.route, `local:${model}`); assert.equal(q.credits, 0); assert.equal(q.reasonCode, 'local_pinned'); assert.equal(q.reason, 'Runs on your computer because you picked it');
      const s = await form(`/api/tools/${tool}/jobs`, { rights: '1', provider: model, route: `local:${model}`, prompt: 'x', types: tool === 'camera' ? '["h3-push-in"]' : '["precise"]' }, files as any);
      assert.equal(s.status, 200, JSON.stringify(s.body)); assert.equal(s.body.route, `local:${model}`); assert.equal(s.body.cost, 0); const j = await done(s.body.id); assert.equal(j.status, 'done', JSON.stringify(j).slice(0, 300)); }
    const m = (await get('/api/edit-video/tools')).body.tools.find((t: any) => t.id === 'upscale'); const lr = m.models.find((x: any) => x.id === 'comfy-seedvr2').routes.find((r: any) => r.kind === 'local');
    assert.equal(lr.reasonCode, 'local_off'); assert.equal(lr.runsWhenPinned, true); assert.match(lr.reasonDetail, /^Your computer isn’t the default/);
    ok('#1/#4 Use local off: lists say local_off + runsWhenPinned:true + reasonDetail; pinned quote runnable with local_pinned; pinned submit runs locally (mock, 0 credits, done)'); }
  // #2 local-only model (upscale Real-ESRGAN x2; was comfy-open before 2026-10-26): the 'only route' exception says why it's on (menu = /api/routes = quote)
  { const m = (await get('/api/edit-video/tools')).body.tools.find((t: any) => t.id === 'upscale'); const mr = m.models.find((x: any) => x.id === 'comfy-video-esrgan').routes[0];
    const lr = (await get('/api/routes?toolId=upscale&modelId=comfy-video-esrgan')).body.routes[0].routes[0]; const q = (await get('/api/tools/upscale/price?provider=comfy-video-esrgan')).body;
    for (const r of [mr, lr]) { assert.equal(r.reasonCode, 'local_only'); assert.equal(r.runnable, true); assert.equal(r.status, 'Local only · runs on your computer'); assert.match(r.reason, /no cloud version/); }
    assert.equal(q.runnable, true); assert.equal(q.reasonCode, 'local_only'); assert.equal(q.route, 'local:comfy-video-esrgan');
    ok(`#2 upscale comfy-video-esrgan: local_only ("${lr.reason}") on menu, /api/routes and quote`); }
  // #3 a field the tool ignores (or a value outside its list) → 400 invalid_<field>; absent → fine
  { const a = await get('/api/tools/app-video-upscale/price?resolution=8k'); assert.equal(a.status, 400); assert.equal(a.body.code, 'invalid_resolution');
    const sl = await get('/api/tools/soul/price?resolution=720p'); assert.equal(sl.status, 400); assert.equal(sl.body.code, 'invalid_resolution'); assert.deepEqual(sl.body.allowed, []);
    assert.equal((await get('/api/tools/soul/price?quality=high')).body.code, 'invalid_quality'); assert.equal((await get('/api/tools/soul/price')).status, 200); assert.equal((await get('/api/tools/app-video-upscale/price')).status, 200);
    const s = await form('/api/tools/app-video-upscale/jobs', { rights: '1', resolution: '8k' }, [['video', MP4]]); assert.equal(s.status, 400); assert.equal(s.body.code, 'invalid_resolution'); assert.equal(s.body.refund.charged, false);
    ok('#3 ignored/out-of-list fields rejected (app-video-upscale resolution=8k, soul resolution/quality → allowed []), absent fields accepted'); }
  // #5 width/height
  { for (const qs of ['width=99999999&height=720', 'width=1280&height=0', 'width=12.5&height=720', 'width=abc&height=720', 'width=1280&height=-5']) { const r = await get(`/api/tools/upscale/price?${qs}`); assert.equal(r.status, 400, qs); assert.equal(r.body.code, 'invalid_size', qs); assert.equal(r.body.min, 16); assert.equal(r.body.max, 16384); }
    assert.equal((await get('/api/tools/upscale/price?width=1280&height=720')).status, 200);
    const s = await form('/api/tools/upscale/jobs', { rights: '1', types: '["precise"]', width: '99999999', height: '720' }, [['video', MP4]]); assert.equal(s.status, 400); assert.equal(s.body.code, 'invalid_size');
    ok('#5 width/height must be whole pixels 16..16384 on quote + submit → 400 invalid_size'); }
  // #6 types / mode allowlisted, never echoed (quote, submit, upscale result action)
  { const enc = encodeURIComponent(XSS);
    for (const u of [`/api/tools/upscale/price?types=${enc}`, `/api/tools/h3-video/price?types=text-to-video`, `/api/tools/create-image/price?mode=${enc}`, `/api/tools/camera/price?types=${encodeURIComponent('["nope"]')}`]) { const r = await get(u); assert.equal(r.status, 400, u); assert.match(r.body.code, /^invalid_(type|mode)$/); assert.ok(!r.body.error.includes('<script') && !r.body.error.includes('nope') && !r.body.error.includes('text-to-video'), r.body.error); }
    assert.equal((await get(`/api/tools/create-image/price?mode=${enc}`)).body.code, 'invalid_mode');
    assert.equal((await get('/api/tools/camera/price?types=%5B%22pan-l%22%5D&image=1')).status, 200, 'camera alias still accepted');
    const s = await form('/api/tools/create-image/jobs', { rights: '1', prompt: 'x', types: JSON.stringify([XSS]) }); assert.equal(s.status, 400); assert.equal(s.body.code, 'invalid_type'); assert.ok(!JSON.stringify(s.body).includes('<script'));
    const cam = await form('/api/tools/camera/jobs', { rights: '1', provider: 'comfy-h3-camera', route: 'local:comfy-h3-camera', types: '["h3-push-in"]', prompt: 'x' }, [['image', IMG]]); const cj = await done(cam.body.id); assert.equal(cj.status, 'done');
    const ua = await fetch(`${B}/api/jobs/${cam.body.id}/upscale`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: XSS }) }); const ub = await ua.json() as any;
    assert.equal(ua.status, 400, JSON.stringify(ub)); assert.equal(ub.code, 'invalid_mode'); assert.ok(!JSON.stringify(ub).includes('<script'));
    ok('#6 unknown types/mode → 400 invalid_type / invalid_mode on quote, submit and the upscale result action; value never echoed; camera aliases still accepted'); }
  // #7 Camera H3 move without an image: priced input block on the quote, 400 image_required on submit
  { const q = await get(`/api/tools/camera/price?provider=comfy-h3-camera&types=${H3}`); assert.equal(q.status, 200);
    assert.equal(q.body.runnable, false); assert.equal(q.body.chargeable, false); assert.equal(q.body.blockedCode, 'input_blocked'); assert.equal(q.body.reasonCode, 'input_blocked'); assert.equal(q.body.priceAvailable, true); assert.ok(q.body.listCredits > 0); assert.match(q.body.blockedReason, /^Add a start image/); assert.equal(q.body.unavailableReason, undefined); assert.equal(q.body.submitCode, 'image_required');
    const s = await form('/api/tools/camera/jobs', { rights: '1', provider: 'comfy-h3-camera', types: '["h3-push-in"]', prompt: 'x' }); assert.equal(s.status, 400); assert.equal(s.body.code, 'image_required');
    ok(`#7 H3 camera, no image: quote = input block (list ${q.body.listCredits}, chargeable:false, "${q.body.blockedReason}"), submit 400 image_required`); }
  // #8 a failed 0-credit local attempt never says credits went back
  { const s = await form('/api/tools/upscale/jobs', { rights: '1', types: '["precise"]', provider: 'comfy-seedvr2', route: 'local:comfy-seedvr2', allowFallback: '0', simulate: 'temporary' }, [['video', MP4]]); assert.equal(s.status, 200, JSON.stringify(s.body));
    const j = await done(s.body.id); assert.equal(j.status, 'failed'); const txt = JSON.stringify([j.error, j.routeAttempts, j.warnings]);
    assert.ok(!/went back to your (app )?balance/i.test(txt), txt); assert.equal(j.cost ?? 0, 0);
    ok(`#8 failed 0-credit local attempt: "${j.routeAttempts?.[0]?.error}" (no credits-back sentence)`); }
  // #9 quality message: human labels for the quality values only; resolution aliases still accepted; allowed = machine values
  { const r = await get('/api/tools/create-image/price?quality=ultra'); assert.equal(r.status, 400); assert.equal(r.body.error, "Quality ultra isn't supported here. Pick Low, Medium or High."); assert.deepEqual(r.body.allowed, ['low', 'med', 'high']); assert.deepEqual(r.body.allowedLabels, ['Low', 'Medium', 'High']);
    assert.equal((await get('/api/tools/create-image/price?quality=720p')).status, 200); assert.equal((await get('/api/tools/create-image/price?quality=MED')).status, 200);
    ok('#9 create-image quality: "Pick Low, Medium or High.", allowed [low, med, high] + allowedLabels; 720p alias accepted'); }
  console.log('ALL OK server-1019b');
} finally { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* gone */ } await new Promise((r) => setTimeout(r, 600)); try { fs.rmSync(D, { recursive: true, force: true }); } catch { /* still writing */ } }
