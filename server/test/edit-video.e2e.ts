// E2E (own mock server, port 8841): Edit Video tools: menu, routes, prices (quote = charge), cloud-first, 402 no_provider, local 0, refund on failure.
// Run: npx tsx test/edit-video.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
let PORT = testPort(8841), B = `http://localhost:${PORT}`; const D = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-'));
const start = (port: number, fal: string) => spawn('npx', ['tsx', 'src/index.ts'], { cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env, PORT: String(port), OPENHIGGSFIELD_DATA_DIR: fs.mkdtempSync(path.join(D, 'd-')), OPENHIGGSFIELD_BILLING_MODE: 'team', OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_DEMO_AUTO: '0' /* keyless = no_provider (real-mode rules) */, OPENHIGGSFIELD_FAL_KEY: fal, FAL_KEY: '', OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_MAX_QUEUED: '200', ...(fal ? { OPENHIGGSFIELD_ROUTING_FAIL: 'fal:fal-ai/luma-dream-machine/ray-2-flash/reframe' } : {}) }, stdio: 'ignore', detached: true });
const up = async () => { for (let i = 0; i < 60; i++) { try { if ((await fetch(`${B}/api/health`)).ok) return; } catch { /* */ } await new Promise((r) => setTimeout(r, 1000)); } };
const srv = start(testPort(8841), ''); const srv2 = start(testPort(8842), 'mock-test');
const get = async (u: string) => (await fetch(B + u)).json();
const bal = async () => (await get('/api/ledger')).balance;
const routing = (g: Record<string, unknown>) => fetch(`${B}/api/me/routing`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ global: { mode: 'auto', allowFallback: true, ...g } }) });
const post = async (tool: string, f: Record<string, string>, video: string) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v); fd.append('video', new Blob([fs.readFileSync(video)]), 'v.mp4'); const r = await fetch(`${B}/api/tools/${tool}/jobs`, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() }; };
const wait = async (id: string) => { for (let i = 0; i < 400; i++) { const j = await get(`/api/jobs/${id}`); if (['done', 'failed', 'blocked', 'canceled', 'needs_decision'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 300)); } throw new Error('timeout'); };
try {
  await up();
  const mp4 = path.join(D, 'v.mp4'); execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=960x540:rate=24', '-f', 'lavfi', '-i', 'sine=d=5', '-t', '5', '-pix_fmt', 'yuv420p', '-shortest', mp4]);
  const short = path.join(D, 's.mp4'); execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=960x540:rate=24', '-t', '2', '-pix_fmt', 'yuv420p', short]);
  // menu
  const menu = await get('/api/edit-video/tools?seconds=5');
  assert.deepEqual(menu.tools.map((t: any) => t.id), ['h3-extend', 'reframe', 'upscale', 'remove-bg', 'sdr-hdr', 'fps-boost', 'depth-map', 'reshoot', 'prompt-edit']);
  const by = Object.fromEntries(menu.tools.map((t: any) => [t.id, t])); const rt = (tool: string, id: string) => by[tool].models.flatMap((m: any) => m.routes).find((r: any) => r.routeId === id);
  assert.equal(rt('reframe', 'fal:fal-ai/luma-dream-machine/ray-2/reframe').listCredits, 100); assert.equal(rt('reframe', 'fal:fal-ai/luma-dream-machine/ray-2-flash/reframe').listCredits, 30); assert.equal(rt('reframe', 'fal:fal-ai/luma-dream-machine/ray-2-flash/reframe').credits, 30); assert.equal(rt('reframe', 'fal:fal-ai/luma-dream-machine/ray-2-flash/reframe').chargeable, false); assert.ok(rt('reframe', 'fal:fal-ai/luma-dream-machine/ray-2-flash/reframe').blockedReason); // Oct 19 #8: Flash can't run a high-quality job = an input block → real price, chargeable:false, blockedReason
  assert.equal(rt('remove-bg', 'fal:bria/video/background-removal').listCredits, 70); assert.equal(rt('remove-bg', 'local:comfy-birefnet-video').listCredits, 0); assert.equal(rt('remove-bg', 'local:comfy-birefnet-video').reasonCode, 'local_off'); assert.equal(rt('remove-bg', 'local:comfy-birefnet-video').runnable, false); /* Oct 19 #3: Use local off → not runnable, credits null */
  assert.ok(rt('fps-boost', 'fal:fal-ai/rife/video').credits > 0, 'RIFE runs on an estimate (run policy D1, 2026-10-28), not unpriced');
  assert.equal(by.upscale.defaultModel, 'cloud-topaz-starlight-fast'); // 2132e53e: cloud-first defaults assert.ok(rt('upscale', 'direct:direct-flux3-upscale')); assert.ok(!by.upscale.models.find((m: any) => m.id === 'comfy-seedvr2').routes.some((r: any) => /bfl|flux-3/.test(r.routeId)), 'FLUX 3 Upscaler is its own card, not a SeedVR2 route'); assert.ok(rt('upscale', 'fal:fal-ai/seedvr/upscale/video'));
  assert.equal(by['h3-extend'].existed, true); assert.equal(by.reframe.existed, false); assert.ok(by['h3-extend'].inputs.some((i: any) => i.name === 'direction'));
  console.log('ok menu: 9 tools (legacy two-person swap unlisted), routes + official prices (Reframe 100/30, Bria 70 for 5 s, RIFE unpriced)');
  // no keys, no useLocal → 402 no_provider, nothing charged (a local-only model counts as a local pin → local, 0)
  await routing({ useLocal: false, mockKeys: false });
  for (const [tool, f] of [['remove-bg', { types: '["green"]' }], ['reframe', { types: '["9:16"]' }], ['depth-map', { types: '["grey"]' }]] as const) {
    const b0 = await bal(); const r = await post(tool, { ...f, rights: '1' }, mp4);
    if (r.status === 200) { assert.match(r.body.route, /^local:/, `${tool} ${JSON.stringify(r.body)}`); assert.equal(r.body.cost, 0); } // local-only model = a local pin (rule 07:52): runs locally at 0
    else assert.equal(r.status, 402, `${tool} ${JSON.stringify(r.body)}`);
    assert.equal(await bal(), b0); }
  { const r = await post('upscale', { types: '["precise"]', rights: '1' }, mp4); assert.equal(r.status, 402, JSON.stringify(r.body)); }
  console.log('ok no keys → 402 no_provider (incl. upscale default), 0 charged');
  // useLocal → local route, 0 credits
  await routing({ useLocal: true, mockKeys: false });
  for (const [tool, f] of [['remove-bg', { types: '["transparent"]' }], ['fps-boost', { types: '["60"]' }], ['depth-map', { types: '["grey"]' }], ['sdr-hdr', { types: '["hdr10"]' }]] as const) {
    const b0 = await bal(); const r = await post(tool, { ...f, rights: '1' }, mp4); assert.equal(r.status, 200, `${tool} ${JSON.stringify(r.body)}`); const j = await wait(r.body.id ?? r.body.jobId); assert.equal(j.status, 'done', tool); assert.equal(await bal(), b0, `${tool} local = 0`); }
  for (const [tool, f] of [['fps-boost', { targetFps: '48' }], ['depth', { format: 'inverted' }], ['hdr', { strength: '0.8' }]] as const) { const r = await post(tool, { ...f, rights: '1' }, mp4); assert.equal(r.status, 200, `${tool} ${JSON.stringify(r.body)}`); }
  { const r = await post('fps-boost', { targetFps: '120', rights: '1' }, mp4); assert.equal(r.status, 400); const h = await post('hdr', { strength: '3', rights: '1' }, mp4); assert.equal(h.status, 400); assert.equal(h.body.issues?.[0]?.field, 'strength'); }
  { const b0 = await bal(); const r = await post('upscale', { types: '["precise"]', rights: '1' }, mp4); assert.equal(r.status, 200, JSON.stringify(r.body)); const j = await wait(r.body.id ?? r.body.jobId); assert.equal(j.route, 'local:comfy-video-esrgan'); assert.equal(j.modelName ?? j.model, 'Real-ESRGAN x2'); assert.equal(await bal(), b0); console.log('ok upscale default + useLocal → local Real-ESRGAN x2 (2026-10-26: SeedVR2 local is NVIDIA-only), 0 credits'); }
  console.log('ok useLocal → local routes, 0 credits, done');
  // server 2 (fal key set, mock backend): cloud first
  PORT = testPort(8842); B = `http://localhost:${PORT}`; await up(); // auto = cheapest keyed cloud route; quote = charge
  await routing({ useLocal: false, mockKeys: true });
  // cloud-first (2132e53e, 1cf41624): Remove BG starts on BiRefNet (25 for 5 s), Reframe on Ray 3.2 Edit (60 for 5 s), both via the Comfy key
  for (const [tool, f, q, want, via] of [['remove-bg', { types: '["green"]' }, 'mode=green', 25, 'comfy-router:'], ['reframe', { types: '["9:16"]', quality: 'high' }, 'mode=9:16&quality=high', 60, 'comfy-router:']] as const) {
    const b0 = await bal(); const r = await post(tool, { ...f, rights: '1' }, mp4); assert.equal(r.status, 200, `${tool} ${JSON.stringify(r.body)}`); const charged = b0 - (await bal()); assert.equal(charged, want, `${tool} ${JSON.stringify(f)}`);
    const j = await wait(r.body.id ?? r.body.jobId); assert.equal(j.status, 'done'); assert.ok(String(j.route).startsWith(via), j.route); console.log(`ok ${tool} ${JSON.stringify(f)} → ${j.route} charged ${charged}`); }
  // with the Comfy key the Luma reframe card quotes its Comfy Router route (Ray 3.2: 540p fast / 720p high per s)
  for (const [q, want] of [['fast', 30], ['high', 60]] as const) { const pr = await get(`/api/tools/reframe/price?provider=direct-luma-reframe&seconds=5&mode=9:16&quality=${q}`); assert.equal(pr.credits, want, JSON.stringify(pr)); }
  { const pr = await get('/api/tools/remove-bg/price?provider=comfy-birefnet-video&seconds=5&mode=green'); assert.equal(pr.credits, 25, JSON.stringify(pr)); }
  console.log('ok quotes = charges (reframe fast 30 / high 60, remove-bg 25)');
  // refund on failure: the Comfy Router default (Ray 3.2, 30 at 540p fast) forced to fail (simulateRouteFail), its fallback Ray 2 Flash too
  //  (OPENHIGGSFIELD_ROUTING_FAIL), Ray 2 can't take quality=fast → no more fallback → refund
  { const b0 = await bal(); const r = await post('reframe', { types: '["9:16"]', quality: 'fast', rights: '1', simulateRouteFail: 'comfy-router:auto-reframe' }, mp4); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(b0 - (await bal()), 30, 'charged 30 at submit');
    const j = await wait(r.body.id ?? r.body.jobId); assert.equal(j.status, 'failed', j.status); assert.equal(await bal(), b0, 'refunded');
    // credits back live in structured fields only: refund.amount + creditsBack {credits, attempts}; the message has no credits sentence
    { assert.ok(j.creditsBack.attempts >= 1); assert.equal(j.creditsBack?.credits, 30 * j.creditsBack.attempts, `every attempt refunded in full (run policy D4 may try a same-price place) ${JSON.stringify(j.creditsBack)}`); assert.equal(j.refund?.amount, j.creditsBack.credits); assert.doesNotMatch(j.error, /refunded|back to your (app )?balance|Each failed attempt/i, j.error); }
    console.log(`ok reframe fast: charged 30, route failed → 30 back to the balance (creditsBack ${JSON.stringify(j.creditsBack)}; error "${j.error}")`); }
  // validation: too-short clip, bad direction
  { const r = await post('remove-bg', { types: '["green"]', rights: '1' }, short); assert.equal(r.status, 400); }
  { const r = await post('h3-extend', { direction: 'backwards', prompt: 'x', rights: '1' }, mp4); assert.equal(r.status, 400, JSON.stringify(r.body)); assert.equal(r.body.issues?.[0]?.field, 'direction'); }
  for (const [f, field] of [[{ elements: '["@hero"]' }, 'elements'], [{ bitrate: 'ultra' }, 'bitrate']] as const) { const r = await post('h3-extend', { prompt: 'x', rights: '1', ...f }, mp4); assert.equal(r.status, 400, JSON.stringify(r.body)); assert.equal(r.body.issues?.[0]?.field, field); }
  // 2026-10-26: LTX-2.5 extends forward only: backward is refused there with the direction field, and is MiniMax H3's (pinned here). With the
  //  Comfy key the cloud default is MiniMax H3 (2132e53e / a8a55732), so the LTX card is pinned to test its refusal
  { const l = await post('h3-extend', { prompt: 'x', rights: '1', direction: 'backward', provider: 'comfy-ltx25-extend' }, mp4); assert.equal(l.status, 400, JSON.stringify(l.body)); assert.equal(l.body.issues?.[0]?.field, 'direction'); }
  { const r = await post('h3-extend', { prompt: 'x', rights: '1', direction: 'backward', provider: 'comfy-h3-extend' }, mp4); assert.notEqual(r.status, 400, JSON.stringify(r.body)); assert.ok((r.body.warnings ?? []).some((w: string) => /silent/.test(w)), 'backward warns it is silent'); }
  console.log('ok validation (2 s clip, bad direction, elements/bitrate → 400; backward accepted as a reversed lead-in, silent)');
  // DP param names: aspect, targetFps, format, strength (+ hdr/depth aliases)
  for (const [tool, f] of [['reframe', { aspect: '9:16', quality: 'fast' }], ['remove-bg', { types: '["green"]' }]] as const) { const r = await post(tool, { ...f, rights: '1' }, mp4); assert.equal(r.status, 200, `${tool} ${JSON.stringify(r.body)}`); }
  { const r = await post('reframe', { aspect: '5:4', rights: '1' }, mp4); assert.equal(r.status, 400); assert.equal(r.body.issues?.[0]?.field, 'aspect'); }
  console.log('ok aspect param → reframe; bad aspect → 400');
  // maxOutput enforced: above 4K → 400 (job + every model)
  for (const m of ['8k', '16k']) { const r = await post('upscale', { types: '["precise"]', maxOutput: m, rights: '1' }, mp4); assert.equal(r.status, 400, m); assert.equal(r.body.issues?.[0]?.field, 'maxOutput'); }
  // the default (Topaz Starlight Fast) makes 1080p / 4K only: 2k is refused on the field, nothing charged; SeedVR2 (pinned) takes it
  { const r = await post('upscale', { types: '["precise"]', maxOutput: '2k', rights: '1' }, mp4); assert.equal(r.status, 400, JSON.stringify(r.body)); assert.equal(r.body.issues?.[0]?.field, 'maxOutput'); assert.equal(r.body.refund?.charged, false); }
  { const r = await post('upscale', { types: '["precise"]', maxOutput: '2k', rights: '1', provider: 'comfy-seedvr2' }, mp4); assert.equal(r.status, 200, JSON.stringify(r.body)); const j = await wait(r.body.id ?? r.body.jobId); assert.equal(j.status, 'done'); console.log(`ok maxOutput 8k/16k → 400; 2k on Topaz → 400; 2k on SeedVR2 → ${j.route}`); assert.equal(j.route, 'fal:fal-ai/seedvr/upscale/video'); }
  // upscale 2K target is accepted by the BFL default
  { const r = await fetch(`${B}/api/tools/upscale/price?seconds=5&mode=precise&width=1280&height=720&scale=2`); assert.equal(r.status, 200); const p = await r.json(); assert.ok(p.credits > 0, JSON.stringify(p)); console.log(`ok upscale quote (default model, 5 s 720p×2) = ${p.credits} via ${p.route}`); }
  console.log('edit-video e2e: all ok');
} finally { for (const p of [srv, srv2]) try { process.kill(-p.pid!); } catch { /* */ } }
