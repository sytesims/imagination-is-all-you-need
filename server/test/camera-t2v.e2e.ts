// Camera Moves: start image optional only where the route really does text-to-video camera moves.
// LTX-2 (local ltx-* moves, cloud-ltx-camera) = camera-ltx-api.json with the image conditioning bypassed; Seedance 2.0 / MiniMax H3 (Comfy Router) take a prompt alone (Kling / Veo are no longer offered on Camera Moves).
// Wan 2.2 Fun Camera and the H3 camera graph stay image-only. Quote = charge without an image; image-only → 400 image_required (nothing charged).
// Run: npx tsx test/camera-t2v.e2e.ts (port 8963; temp data dir, mock backend, no keys)
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { cameraApp, cameraImageRequired, cameraTextProviders } from '../src/tools/apps.js'; import { buildPlan } from '../src/comfy/plans.js'; import { H3_CAMERA_MOVES } from '../src/tools/h3/catalog.js';
const ROOT = path.resolve(import.meta.dirname, '..'); const ok = (m: string) => console.log('ok ' + m); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'camt2v-'));
const H3 = H3_CAMERA_MOVES[0][0];
// ---- unit: rules + plans ----
assert.equal(cameraImageRequired('comfy-open', ['push-in']), true); assert.equal(cameraImageRequired('comfy-open', ['ltx-dolly-in']), false); assert.equal(cameraImageRequired('comfy-open', ['ltx-dolly-in', 'push-in']), true);
assert.equal(cameraImageRequired('cloud-ltx-camera', ['ltx-dolly-in']), false); assert.equal(cameraImageRequired('comfy-h3-camera', [H3]), true);
for (const p of ['router-seedance', 'api-minimax-h3']) assert.equal(cameraImageRequired(p, ['push-in']), false);
assert.deepEqual(cameraTextProviders(['push-in'], cameraApp.providers), ['router-seedance', 'api-minimax-h3']); assert.deepEqual(cameraTextProviders([H3], cameraApp.providers), []);
assert.deepEqual(cameraTextProviders(['ltx-dolly-in'], cameraApp.providers), ['comfy-open', 'cloud-ltx-camera']);
{ const r: any = await cameraApp.parseInput({ types: '["ltx-dolly-in"]', prompt: 'a lighthouse at dusk', provider: 'comfy-open', duration: '5' }, {}); assert.ok(!r.error, r.error); assert.equal(r.t2v, true); assert.equal(r.imagePath, undefined);
  const pl = buildPlan({ id: 'tcam', toolId: 'camera', provider: 'comfy-open', input: r } as any); const g = pl.passes[0].graph;
  assert.equal(pl.passes[0].workflow, 'camera-ltx-api.json'); assert.equal(g['98'], undefined); assert.equal(g['398'].class_type, 'EmptyImage'); assert.deepEqual(g['102'].inputs.input, ['398', 0]);
  assert.equal(g['92:107'].inputs.bypass, true); assert.equal(g['92:108'].inputs.bypass, true); assert.equal((pl.passes[0] as any).expect.t2v, true); assert.match(g['300'].inputs.lora_name, /dolly-in/);
  const r2: any = await cameraApp.parseInput({ types: '["ltx-dolly-in"]', prompt: 'x', provider: 'comfy-open' }, { image: [] as any }); void r2; }
{ const r: any = await cameraApp.parseInput({ types: '["push-in"]', prompt: 'x', provider: 'comfy-open' }, {}); assert.equal(r.code, 'image_required'); assert.deepEqual(r.textProviders, ['router-seedance', 'api-minimax-h3']); } // B6 quality order
ok('rules: Fun Camera + H3 camera need the image; LTX moves (local/cloud) + Seedance / MiniMax H3 run from text; LTX plan = camera-ltx-api.json, node 98 → EmptyImage, LTXVImgToVideoInplace bypass, LoRA kept');
// ---- server ----
const PNG = path.join(D, 'img.png'); execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720', '-frames:v', '1', PNG]);
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '' };
const PORT = testPort(8963); const B = `http://localhost:${PORT}`;
const p = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: path.join(D, 'data'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '50', OPENHIGGSFIELD_HOSTED: '', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'none.json') }, stdio: 'ignore', detached: true });
const run = async (f: Record<string, string>, image = false) => {
  const qs = new URLSearchParams({ prompt: 'a lighthouse at dusk', ...f }); if (image) qs.set('image', '1');
  const qr = await fetch(`${B}/api/tools/camera/price?${qs}`); const q = (await qr.json()) as any;
  const fd = new FormData(); for (const [k, v] of Object.entries({ rights: '1', prompt: 'a lighthouse at dusk', ...f, ...(qr.ok ? { quotedRouteId: q.routeId, quotedCredits: String(q.credits) } : {}) })) fd.append(k, v);
  if (image) fd.append('image', new Blob([fs.readFileSync(PNG)], { type: 'image/png' }), 'img.png');
  const r = await fetch(`${B}/api/tools/camera/jobs`, { method: 'POST', body: fd }); return { qs: qr.status, q, s: r.status, b: (await r.json()) as any };
};
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  const tl = (await (await fetch(`${B}/api/tools`)).json()) as any; const cam = (Array.isArray(tl) ? tl : tl.tools).find((t: any) => t.id === 'camera');
  assert.equal(cam.imageOptional, true); assert.equal(cam.app.imageOptional, true); const caps = cam.app.capabilities;
  assert.deepEqual(caps.imageRequiredByProvider, { 'comfy-open': true, 'cloud-ltx-camera': false, 'comfy-h3-camera': true, 'router-seedance': false, 'api-minimax-h3': false });
  assert.ok(caps.imageOptionalPresetsByProvider['comfy-open'].includes('ltx-dolly-in')); assert.ok(!caps.imageOptionalPresetsByProvider['comfy-open'].includes('push-in'));
  const img = cam.inputs.find((x: any) => x.name === 'image'); assert.equal(img.required, false); assert.deepEqual(img.requiredByProvider, caps.imageRequiredByProvider);
  ok('/api/tools camera: imageOptional true (top-level + app), app.capabilities.imageRequiredByProvider + imageOptionalPresetsByProvider, image input required:false + requiredByProvider');
  // LTX move, no image → local LTX text-to-video; quote = charge; runs (mock)
  { const r = await run({ types: '["ltx-dolly-in"]', duration: '5' }); assert.equal(r.qs, 200, JSON.stringify(r.q)); assert.equal(r.s, 200, JSON.stringify(r.b)); assert.equal(r.b.route, r.q.routeId); assert.equal(r.b.cost, r.q.credits); assert.equal(r.q.routeId, 'comfy-cloud:cloud-ltx-camera', 'B6: an LTX move runs on its Comfy Cloud workflow first (tier 0)');
    let j: any; for (let i = 0; i < 100; i++) { j = await (await fetch(`${B}/api/jobs/${r.b.id}`)).json(); if (['done', 'failed'].includes(j.status)) break; await new Promise((x) => setTimeout(x, 200)); }
    assert.equal(j.status, 'done', JSON.stringify(j).slice(0, 300)); assert.equal(j.input.t2v, true); assert.ok(!j.input.imageUrl); ok(`ltx-dolly-in, no image → ${r.q.routeId} ✦${r.q.credits} = charge, job done (t2v)`); }
  // pinned cloud LTX, no image → same route quoted and charged (or the same 402 with no key)
  { const r = await run({ types: '["ltx-jib-up"]', provider: 'cloud-ltx-camera', duration: '3' }); assert.ok(r.qs === 200, JSON.stringify(r.q)); assert.notEqual(r.s, 400, JSON.stringify(r.b)); if (r.s === 200) { assert.equal(r.b.route, r.q.routeId); assert.equal(r.b.cost, r.q.credits); }
    ok(`ltx-jib-up on cloud-ltx-camera, no image → quote ${r.q.routeId} ✦${r.q.credits} (runnable ${r.q.runnable}), submit ${r.s}${r.s === 200 ? ' = charge' : ` ${r.b.errorType ?? r.b.error}`}`); }
  // Wan move, no image, Auto → a text route (sponsors first, 2026-10-27: MiniMax H3 on the Comfy key), never Fun Camera; quote and submit agree
  { const r = await run({ types: '["push-in"]', duration: '5' }); assert.equal(r.qs, 200, JSON.stringify(r.q)); assert.match(r.q.routeId, /api-minimax-h3/); assert.notEqual(r.s, 400, JSON.stringify(r.b));
    if (r.s === 200) { assert.equal(r.b.route, r.q.routeId); assert.equal(r.b.cost, r.q.credits); } else assert.notEqual(r.b.error, 'route_changed');
    ok(`push-in, no image, Auto → ${r.q.routeId} ✦${r.q.credits} (runnable ${r.q.runnable}); submit ${r.s}${r.s === 200 ? ' = charge' : ` ${r.b.errorType ?? r.b.error} (no key; same route)`}`); }
  // pinned image-only route, no image → 400 on quote and submit
  { const r = await run({ types: '["push-in"]', provider: 'comfy-open', duration: '5' }); assert.equal(r.qs, 200, 'Oct 19 b2: a pinned image-only model quotes a priced input block'); assert.equal(r.q.blockedCode, 'input_blocked'); assert.equal(r.q.submitCode, 'image_required'); assert.equal(r.q.runnable, false); assert.equal(r.q.chargeable, false); assert.ok(r.q.credits != null); assert.equal(r.s, 400); assert.equal(r.b.code, 'image_required'); assert.equal(r.b.issues[0].field, 'image');
    assert.deepEqual(r.b.textProviders, ['router-seedance', 'api-minimax-h3']); ok(`push-in pinned comfy-open (Wan Fun Camera), no image → quote = priced input block (✦${r.q.credits}, chargeable:false), submit 400 image_required: "${r.b.error}"`); }
  // only image-only routes for the move (H3 camera) → 400
  { const r = await run({ types: JSON.stringify([H3]), duration: '5' }); assert.equal(r.qs, 200, JSON.stringify(r.q)); assert.equal(r.q.blockedCode, 'input_blocked'); assert.equal(r.q.blockedField, 'image'); assert.deepEqual(r.q.textProviders, []); assert.equal(r.s, 400); assert.equal(r.b.code, 'image_required'); assert.deepEqual(r.b.textProviders, []); assert.equal(r.b.refund?.charged ?? false, false);
    ok(`H3 camera move ${H3}, no image → quote = priced input block, submit 400 image_required: "${r.b.error}"`); }
  // with an image: the camera default is MiniMax H3 (sponsors first, shared/cloudDefaults.ts); quote = charge
  { const r = await run({ types: '["push-in"]', duration: '5' }, true); assert.equal(r.s, 200, JSON.stringify(r.b)); assert.equal(r.b.route, r.q.routeId); assert.equal(r.q.routeId, 'comfy-router:api-minimax-h3'); ok('push-in with an image → MiniMax H3 (the cloud default), quote = charge'); }
  console.log('ALL OK camera-t2v');
} finally { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* */ } fs.rmSync(D, { recursive: true, force: true }); }
