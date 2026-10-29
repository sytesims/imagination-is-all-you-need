// Video Upscale wiring (2026-10-26, shared/videoUpscale.ts + tools/videoUpscaleModels.ts).
// Covers: the menu order; on an Apple Silicon profile the default is Real-ESRGAN x2 and SeedVR2's local route says why it can't run (CUDA only);
// on an NVIDIA profile the SeedVR2 local route is offered; fal SeedVR2 at 1080p sends target_resolution 1080p and costs $0.25 for 5 s at 1024×576;
// the Topaz route graph (TopazVideoEnhanceV2) and its per-frame price; the FLUX Video Upscale and Crystal Router bodies; sizes per model (portrait,
// a clip already at the target, Topaz 1080p / 4K only); the local graphs against ComfyUI's /object_info (fixture read from ComfyUI 0.42.5);
// the real model name a job carries; and the per-machine speed figures.
// Run: npx tsx test/video-upscale.test.ts   (in process, mock backend, temp data dir, no keys, no network)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'vup-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'none.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', COMFY_API_KEY: '', OPENHIGGSFIELD_BFL_API_KEY: '' });
const ok = (m: string) => console.log('ok ' + m);
const { getTool } = await import('../src/tools/registry.ts');
const { routesFor } = await import('../src/routing/routes.ts');
const S = await import('../src/routing/select.ts');
const HW = await import('../src/hardware.ts');
const { toolDefaults } = await import('../src/routing/defaults.ts');
const V = await import('../src/shared/videoUpscale.ts');
const M = await import('../src/tools/videoUpscaleModels.ts');
const { buildPlan } = await import('../src/comfy/plans.ts');
const { modelNameForRun } = await import('../src/models.ts');
const { ROUTER_MODELS } = await import('../src/routing/routerModels.ts');
const { graphIssues } = await import('./_model-health.ts');
const { requirementsFor } = await import('../src/hardware/requirements.ts');
const OI = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'object-info-video-upscale.json'), 'utf8'));
const t: any = getTool('upscale'); const draft: any = getTool('app-video-upscale');
S.setLocalAvailable(true);
const job = (provider: string, o: Record<string, any> = {}) => V.vupSizing(provider, { duration: 5, types: ['precise'], scale: 2, ...o }, { maxOutput: o.maxOutput ?? '1080p', width: o.w ?? 1024, height: o.h ?? 576 });
const opt = (provider: string, routeId: string, o: Record<string, any> = {}) => S.option(t, routesFor(provider, t).find((r) => r.routeId === routeId)!, job(provider, o));

// ---- 1. one table: menu order, Draft Upscale shares it ----
assert.deepEqual(t.providers, V.VUP_ORDER); assert.deepEqual(draft.providers, V.VUP_ORDER, 'Draft Upscale lists the same models');
assert.deepEqual(t.providers.slice(0, 4), ['comfy-video-esrgan', 'comfy-video-ultrasharp', 'comfy-seedvr2', 'cloud-topaz-starlight-fast'], 'local first, then cheapest good cloud');
assert.deepEqual(t.app.videoUpscale.order, V.VUP_ORDER); assert.deepEqual(t.inputs.find((i: any) => i.name === 'maxOutput').byProvider['cloud-topaz-precise'], ['1080p', '4k']);
ok('menu order: Real-ESRGAN x2, 4x-UltraSharp, SeedVR2, Topaz Fast, then best quality; Draft Upscale shares it');

// ---- 2. Apple Silicon vs NVIDIA ----
HW.setHardwareOverride('mac36');
const P = await import('../src/routing/prefs.ts'); const p0 = P.getPrefs();
assert.equal(toolDefaults(t).defaultProvider, 'cloud-topaz-starlight-fast', 'Use local off, no keys: the cloud default (Topaz Starlight Fast on the Comfy key, shared/cloudDefaults.ts) is kept (BH12)');
P.savePrefs({ ...p0, global: { ...p0.global, useLocal: true } });
assert.equal(toolDefaults(t).defaultProvider, 'comfy-video-esrgan', 'Apple Silicon, Use local on: default is Real-ESRGAN x2');
assert.equal(toolDefaults(draft).defaultProvider, 'comfy-video-esrgan', 'Draft Upscale too');
{ const o = opt('comfy-seedvr2', 'local:comfy-seedvr2'); assert.equal(o.available, false); assert.match(String(o.reason), /NVIDIA graphics card/); }
assert.equal(opt('comfy-video-esrgan', 'local:comfy-video-esrgan').available, true);
HW.setHardwareOverride('rtx4090'); assert.equal(toolDefaults(t).defaultProvider, 'comfy-video-esrgan', 'NVIDIA, Use local on: Real-ESRGAN x2 is still the quick default');
assert.equal(opt('comfy-seedvr2', 'local:comfy-seedvr2').available, true, 'NVIDIA: SeedVR2 3B local is offered');
assert.equal(M.seedvr2LocalBlock('cuda'), null); assert.match(String(M.seedvr2LocalBlock('mps')), /needs an NVIDIA graphics card/); assert.match(String(M.seedvr2LocalBlock(null)), /couldn’t check yours/);
HW.setHardwareOverride('mac36'); { const R = await import('../src/routing/modelRegistry.ts'); const ms = R.modelsBlock(t, []); const s3 = ms.find((m: any) => m.key === 'seedvr2-3b-video');
  const loc = s3.runsOn.find((r: any) => r.id === 'local'); assert.equal(loc.status, 'unavailable', 'Mac: SeedVR2 3B local is not a live place (the family row never says Free · Your computer)'); assert.equal(loc.reasonCode, 'unsupported_hardware'); assert.equal(loc.reason, 'Needs an NVIDIA graphics card');
  HW.setHardwareOverride('rtx4090'); assert.notEqual(R.modelsBlock(t, []).find((m: any) => m.key === 'seedvr2-3b-video').runsOn.find((r: any) => r.id === 'local').reasonCode, 'unsupported_hardware', 'NVIDIA: not refused for the hardware'); }
{ const { preflightProblems } = await import('../src/shared/preflight.ts');
  const q = { valid: false, errorType: 'validation', code: 'already_at_target', error: 'Your clip is already 1080p, so 1080p would not make it larger. Pick a bigger size.', credits: null, priceAvailable: false };
  const ps = preflightProblems({ quote: q, modelName: 'Real-ESRGAN x2' } as any); assert.deepEqual(ps.map((x: any) => x.code), ['model_cant_run'], 'a plain refusal, never "no verified price"'); }
HW.setHardwareOverride(null); P.savePrefs(p0);
ok('Apple Silicon: Real-ESRGAN x2 default, SeedVR2 local refused with a plain reason; NVIDIA: SeedVR2 local offered');

// ---- 3. fal SeedVR2: 1080p is asked for, priced at $0.25 for 5 s ----
const clip = path.join(D, 'clip.mp4'); fs.writeFileSync(clip, Buffer.from('fake'));
for (const [mo, want] of [['720p', '720p'], ['1080p', '1080p'], ['1440p', '1440p'], ['2k', '1440p'], ['4k', '2160p']]) {
  const b: any = await M.falSeedvr2Body({ maxOutput: mo, videoPath: clip }); assert.equal(b.target_resolution, want, `${mo} → ${want}`); assert.equal(b.upscale_mode, 'target'); }
assert.equal(opt('comfy-seedvr2', 'fal:fal-ai/seedvr/upscale/video').credits, 25, 'fal SeedVR2 5 s 1024×576 → 1080p = $0.25');
ok('fal SeedVR2: 1080p sends target_resolution 1080p (720p–2160p kept), 25 credits for 5 s');

// ---- 4. Topaz partner node: graph and price ----
{ const g: any = M.topazGraph('cloud-topaz-starlight-fast', { maxOutput: '1080p' }, { __type: 'core/ASSET' });
  assert.equal(g['2'].class_type, 'TopazVideoEnhanceV2'); assert.equal(g['2'].inputs.upscaler_model, 'Starlight (Astra) Fast'); assert.equal(g['2'].inputs['upscaler_model.upscaler_resolution'], 'FullHD (1080p)');
  assert.equal(g['2'].inputs.interpolation_model, 'Disabled');
  const spec = OI.TopazVideoEnhanceV2.input.required; const keys = spec.upscaler_model[1].options.map((x: any) => x.key);
  for (const [id, name] of Object.entries(V.TOPAZ_MODEL)) { assert.ok(keys.includes(name), `${name} is an upscaler_model`); const o = spec.upscaler_model[1].options.find((x: any) => x.key === name);
    assert.deepEqual(o.inputs.required.upscaler_resolution[1].options, ['FullHD (1080p)', '4K (2160p)'], `${id}: 1080p / 4K`); }
  assert.equal(M.topazGraph('cloud-topaz-precise', { maxOutput: '4k' }, {})['2'].inputs['upscaler_model.upscaler_resolution'], '4K (2160p)'); }
const cr = (p: string, o: Record<string, any> = {}) => opt(p, `comfy-cloud:${p}`, o).credits;
assert.deepEqual([cr('cloud-topaz-starlight-fast'), cr('cloud-topaz-precise'), cr('cloud-topaz-astra2'), cr('cloud-topaz-creative')], [25, 40, 98, 128], 'Topaz 5 s at 1080p: $0.25 / $0.40 / $0.98 / $1.28');
assert.equal(cr('cloud-topaz-precise', { maxOutput: '4k', duration: 10 }), 176, 'Topaz Precise 2.5, 10 s at 4K = 1.54 credits × 240 frames / 211 = $1.76');
assert.equal(opt('cloud-topaz-precise', 'comfy-cloud:cloud-topaz-precise', { maxOutput: '720p' }).reason, 'Topaz Starlight Precise 2.5 makes 1080p or 4K only');
ok('Topaz: TopazVideoEnhanceV2 graph matches /object_info; per-frame prices; 720p refused');

// ---- 5. Router bodies: FLUX Video Upscale and Crystal ----
{ const b: any = await M.routerFluxUpscaleBody({ videoPath: clip, scale: 2, types: ['creative'], prompt: 'keep the text sharp' });
  assert.deepEqual(Object.keys(b).sort(), ['creativity', 'input_video', 'prompt', 'upscale_factor']); assert.equal(b.creativity, 1); assert.equal(b.upscale_factor, 2);
  assert.equal((await M.routerFluxUpscaleBody({ videoPath: clip, scale: 3, types: ['precise'] }) as any).creativity, 0);
  assert.equal(ROUTER_MODELS['direct-flux3-upscale'].id, 'bfl/video-upscale-v1'); assert.equal(ROUTER_MODELS['router-crystal-video'].id, 'fal/crystal-video-upscaler'); }
{ const o = opt('direct-flux3-upscale', 'comfy-router:direct-flux3-upscale'); assert.equal(o.estimatedPrice, true, 'GPU-second billed: an estimate'); assert.equal(o.credits, 104);
  assert.match(String(opt('direct-flux3-upscale', 'comfy-router:direct-flux3-upscale', { duration: 25 }).reason), /up to 20 s/); }
{ const c = opt('router-crystal-video', 'comfy-router:router-crystal-video'); assert.ok(typeof c.credits === 'number' && c.credits > 0, `Crystal runs on an estimate (D1): ${c.credits}`); assert.equal(c.estimatedPrice, true); assert.notEqual(c.reason, 'Off until we can show you its exact price'); }
ok('Router: FLUX Video Upscale body (creativity 0 / 1) priced as an estimate; Crystal (no published price) runs on an estimate');

// ---- 6. sizes: portrait, already at the target, scale models ----
assert.deepEqual(job('comfy-video-esrgan', { w: 576, h: 1024 }).outputSize, { width: 1080, height: 1920 }, 'portrait 576×1024 → 1080×1920');
assert.deepEqual(job('cloud-topaz-starlight-fast', { w: 576, h: 1024 }).outputSize, { width: 1080, height: 1920 });
assert.deepEqual(job('comfy-video-esrgan', { maxOutput: '4k' }).outputSize, { width: 3840, height: 2160 });
// 2026-10-28: a size that would not make the clip larger is never refused: it moves up to the next size the model makes, with a note
{ const j = job('comfy-video-esrgan', { w: 1920, h: 1080 }); assert.equal(V.vupBlock('comfy-video-esrgan', j), null, 'a 1080p clip at 1080p runs');
  assert.equal(j.maxOutput, '1440p'); assert.equal(j.resolution, '1440p'); assert.deepEqual(j.outputSize, { width: 2560, height: 1440 }); assert.deepEqual(j.targetAdjusted, { from: '1080p', to: '1440p' });
  assert.match(j.adjustNote, /already 1080p, so it is upscaled to 1440p instead of 1080p/);
  const tz = job('cloud-topaz-starlight-fast', { w: 1920, h: 1080 }); assert.equal(tz.maxOutput, '4k', 'Topaz (1080p / 4K only) → 4K'); assert.equal(V.vupBlock('cloud-topaz-starlight-fast', tz), null);
  const big = job('cloud-topaz-starlight-fast', { w: 3840, h: 2160, maxOutput: '4k' }); assert.equal(big.sameSize, true); assert.equal(V.vupBlock('cloud-topaz-starlight-fast', big), null, 'nothing larger: runs at its size');
  assert.match(big.adjustNote, /as large as Topaz Starlight Fast makes: it is re-sharpened at the same size/); assert.deepEqual(big.outputSize, { width: 3840, height: 2160 });
  const fx = job('direct-flux3-upscale', { w: 1920, h: 1080 }); assert.equal(fx.maxOutput, '4k', 'FLUX (1.5× minimum) → the first size at least 1.5× the clip'); assert.equal(V.vupBlock('direct-flux3-upscale', fx), null);
  const fx4 = job('direct-flux3-upscale', { w: 3840, h: 2160, maxOutput: '4k' }); assert.match(String(V.vupBlock('direct-flux3-upscale', fx4)), /enlarges at least 1\.5×.*Real-ESRGAN x2 to re-sharpen it/, 'FLUX can\u2019t run at its size: the reason names a model that can');
  const ok720 = job('comfy-video-esrgan', { w: 1280, h: 720 }); assert.equal(ok720.maxOutput, '1080p'); assert.equal(ok720.adjustNote, undefined, 'a size that enlarges: no note'); }
assert.equal(V.vupBlock('comfy-video-esrgan', job('comfy-video-esrgan', { w: 1920, h: 1080, maxOutput: '4k' })), null);
assert.deepEqual(job('direct-flux3-upscale', { w: 1280, h: 720, scale: 3, maxOutput: '1080p' }).outputSize, { width: 1920, height: 1080 }, 'scale models: capped at the target');
assert.equal(V.vupMode('cloud-topaz-astra2', ['precise']), 'precise', 'never swapped'); assert.equal(V.vupBlock('cloud-topaz-astra2', { types: ['precise'] }), null, 'Astra 2 runs on the bar default');
assert.match(String(V.vupBlock('comfy-seedvr2', { types: ['creative'] })), /no Creative mode/, 'Precise-only models refuse Creative (never swapped)');
assert.match(String(V.vupBlock('comfy-video-esrgan', { types: ['smooth60'] })), /no 60 fps mode/);
ok('sizes: portrait keeps its shape, a clip already at the size moves up to the next size (or runs at its size) with a note, scale models cap at the size; 60 fps refused (FPS Boost does it)');

// ---- 7. local graphs vs /object_info, real model name, missing model file ----
for (const [p, file] of [['comfy-video-esrgan', 'RealESRGAN_x2plus.pth'], ['comfy-video-ultrasharp', '4x-UltraSharp.pth'], ['comfy-seedvr2', null]] as const) {
  const j: any = { id: 'j1', toolId: 'upscale', provider: p, input: job(p, { videoPath: clip, maxOutput: '1440p', seed: 7 }) };
  const plan = buildPlan(j); const g = plan.passes[0].graph; const { errors } = graphIssues(g, OI); assert.deepEqual(errors, [], `${p}: graph valid`);
  assert.equal(g['15:5'].inputs['resize_type.shorter_size'], 1440); assert.equal(g['15:5'].inputs.resize_type, 'scale shorter dimension');
  if (file) assert.equal(g['15:2'].inputs.model_name, file); assert.equal(plan.muxSourceAudio, true, 'source audio kept');
  if (p !== 'comfy-seedvr2') assert.equal(modelNameForRun('upscale', p, j.input), V.VUP_MODELS[p].name);
}
assert.equal(modelNameForRun('upscale', 'comfy-video-esrgan'), 'Real-ESRGAN x2'); assert.equal(modelNameForRun('app-video-upscale', 'comfy-video-ultrasharp'), '4x-UltraSharp');
{ const r = requirementsFor(t, 'comfy-video-esrgan', { duration: 5, resolution: '1080p' }); assert.ok(r, 'requirements'); assert.ok(r!.workflows.includes('workflows/upscale-esrgan-api.json'));
  assert.equal(r!.secondsPerTier.mac?.seconds, 265, 'M1 Max: 53 s per clip second × 5 s'); assert.equal(r!.secondsPerTier.mac?.source, 'cited');
  assert.equal(requirementsFor(t, 'comfy-video-ultrasharp', { duration: 5, resolution: '1080p' })!.secondsPerTier.mac?.seconds, 785); }
ok('local graphs valid against /object_info (Real-ESRGAN x2, 4x-UltraSharp, SeedVR2 3B native); jobs carry the real model name; Mac speed 53 / 157 s per clip second');

// ---- 8. submit: the size rule and the refusals (parse) ----
{ const p = await t.parseInput({ types: '["precise"]', provider: 'cloud-topaz-starlight-fast', maxOutput: '720p' }, { video: [] }); assert.ok('error' in p); }
ok('submit checks run before the file is read');
console.log('video-upscale: all ok');
process.exit(0);
