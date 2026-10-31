// Model files that don't run on a Mac, 2026-10-25 (hardware/macWeights.ts). In-process, temp data dir, mock backend, no network.
// Covers: the file-name rule (fp8 / nvfp4 / w4a8 blocked, int8_convrot / bf16 / fp16 not); the fit on an Apple Silicon profile (blocked
// models → too_heavy / unsupported_weights with the plain reason, Mac-safe local models unchanged); a model mixing bf16 and fp8 files;
// the same models on an NVIDIA card and CPU-only (no Mac reason); the route option (plain reason, never Auto-picked) and the row status words.
// Run: npx tsx test/mac-weights.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'macw-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_ENV_FILE: path.join(D, 'env'), OPENHIGGSFIELD_LOCAL_AVAILABLE: '1' });
delete process.env.OPENHIGGSFIELD_HW_MOCK; delete process.env.OPENHIGGSFIELD_COMFY_MODELS_DIR;
const { macBlockedFiles, macBlockedKind, MAC_WEIGHTS_REASON } = await import('../src/hardware/macWeights.ts');
const HW = await import('../src/hardware.ts'); const R = await import('../src/hardware/requirements.ts');
const { getTool } = await import('../src/tools/registry.ts'); const { routesFor } = await import('../src/routing/routes.ts'); const { option } = await import('../src/routing/select.ts');
const { rowStatusOf } = await import('../src/routing/modelRegistry.ts');
const ok = (m: string) => console.log('ok ' + m);
try {
  // ---- 1. the rule, by file name ----
  for (const f of ['qwen_image_fp8_e4m3fn.safetensors', 'flux2_dev_fp8mixed.safetensors', 'drama3_fp8experts_bf16.safetensors', 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors', 'qwen3.5_9b_w4a8_gptq.safetensors', 'qwen3.5_9b_flux3_prompt_upsampler_w4a8.safetensors', 'minimax_h3_fl2va_pruned_w6a8.safetensors'])
    assert.ok(macBlockedKind(f), `${f} is blocked`);
  for (const f of ['qwen_image_2.1_int8_convrot.safetensors', 'yue2_3b_int8_convrot.safetensors', 'z_image_turbo_bf16.safetensors', 'flux-2-klein-4b.safetensors', 'wan2.2_ti2v_5B_fp16.safetensors', 'minimax_music3_dit_fp16.safetensors', 'flux2-vae_small.safetensors', 'ltx-2.5-22b-distilled-Q4_K_M.gguf'])
    assert.equal(macBlockedKind(f), null, `${f} runs on a Mac`);
  assert.deepEqual(macBlockedFiles(['a_bf16.safetensors', 'b_fp8_scaled.safetensors', 'b_fp8_scaled.safetensors']), ['b_fp8_scaled.safetensors'], 'mixed list: only the fp8 file, once');
  ok('rule: fp8 / nvfp4 / wNaM blocked; int8_convrot, bf16, fp16, GGUF not');

  // ---- 2. fit on Apple Silicon ----
  const BLOCKED: [string, string, any][] = [['create-image', 'comfy-flux2dev', {}], ['create-image', 'comfy-moss-image', {}], ['create-image', 'comfy-moss-image-base', {}],
    ['h3-video', 'comfy-h3', { types: ['t2v'] }], ['audio', 'comfy-drama3', {}] /* bf16 + fp8 experts in one file */];
  const SAFE: [string, string, any][] = [['create-image', 'comfy-qwen21', {}], ['create-image', 'comfy-qwen21-turbo', {}], ['create-image', 'comfy-zimage-turbo', { types: ['generate'] }], ['create-image', 'comfy-klein4b', {}], ['create-image', 'comfy-flux3-klein', {}] /* 2026-10-27: int8_convrot upsampler */,
    ['h3-video', 'comfy-wan22-5b', { types: ['t2v'] }], ['audio', 'comfy-yue2', {}], ['audio', 'comfy-minimax-music3', {}]];
  HW.setHardwareOverride('mac36');
  { const f = R.fitFor(getTool('create-image')!, 'comfy-qwen-image', {}); assert.equal(f.verdict, 'slow', 'Qwen-Image on a Mac: through its Mac variant (2026-10-31)'); assert.equal(f.variant?.verified, false); }
  for (const [t, p, i] of BLOCKED) { const f = R.fitFor(getTool(t)!, p, i); assert.equal(`${f.verdict}/${f.reasonCode}`, 'too_heavy/unsupported_weights', `mac: ${p}`); assert.equal(f.reason, `${MAC_WEIGHTS_REASON}.`); assert.ok(f.enforced);
    const q = R.requirementsFor(getTool(t)!, p, i)!; assert.ok(q.macBlockedFiles.length > 0, `${p} names its files`); assert.equal(q.mps, 'red'); }
  for (const [t, p, i] of SAFE) { const f = R.fitFor(getTool(t)!, p, i); assert.notEqual(f.reasonCode, 'unsupported_weights', `mac: ${p} stays available (${f.verdict}/${f.reasonCode})`); assert.notEqual(f.verdict, 'too_heavy', `mac: ${p}`);
    assert.deepEqual(R.requirementsFor(getTool(t)!, p, i)!.macBlockedFiles, [], `${p}: no blocked files`); }
  assert.deepEqual(R.requirementsFor(getTool('audio')!, 'comfy-drama3', {})!.macBlockedFiles, ['drama3_fp8experts_bf16.safetensors']);
  ok('mac36: Qwen-Image, FLUX.2 dev, MOSS-Image, MiniMax H3, Drama 3 blocked; Qwen 2.1 / Turbo, Z-Image Turbo, Klein 4B, FLUX 3 Klein, Wan 2.2 5B, YuE2, MiniMax Music 3 not');

  // ---- 3. route option: plain reason, never available; the hosted routes of the same model are untouched ----
  { const t = getTool('h3-video')!; const rs = routesFor('comfy-h3', t); const loc = rs.find((r) => r.kind === 'local')!; const o = option(t, loc, { types: ['t2v'] });
    assert.equal(o.available, false); assert.equal(o.reasonCode, 'too_heavy'); assert.equal(o.reason, MAC_WEIGHTS_REASON);
    const cloud = rs.filter((r) => r.kind !== 'local' && !r.comingSoon).map((r) => option(t, r, { types: ['t2v'] }));
    assert.ok(cloud.length && cloud.every((c) => c.reason !== MAC_WEIGHTS_REASON && c.reasonCode !== 'too_heavy'), 'hosted H3 routes keep their own status'); }
  ok('option: the Mac reason on the local route only');

  // ---- 4. other hardware unchanged ----
  for (const prof of ['rtx4090', 'mid16', 'cpu', 'none']) { HW.setHardwareOverride(prof);
    for (const [t, p, i] of [...BLOCKED, ...SAFE]) { const f = R.fitFor(getTool(t)!, p, i); assert.notEqual(f.reasonCode, 'unsupported_weights', `${prof}: ${p}`); assert.notEqual(f.reason, `${MAC_WEIGHTS_REASON}.`); } }
  HW.setHardwareOverride('rtx4090'); assert.notEqual(R.fitFor(getTool('create-image')!, 'comfy-qwen-image', {}).verdict, 'too_heavy', 'NVIDIA: fp8 Qwen-Image runs on a 24 GB card');
  HW.setHardwareOverride('cpu'); assert.equal(R.fitFor(getTool('audio')!, 'comfy-drama3', {}).reasonCode, 'no_gpu', 'CPU-only: the old no_gpu reason');
  ok('rtx4090 / mid16 / cpu / none: no Mac reason anywhere');

  // ---- 5. row status words (models[].rowStatus) ----
  const mac = { id: 'local', status: 'unavailable', reasonCode: 'unsupported_weights' };
  assert.deepEqual(rowStatusOf({ preselect: null, runsOn: [mac], setup: [] }).text, MAC_WEIGHTS_REASON, 'local-only model');
  assert.equal(rowStatusOf({ preselect: null, runsOn: [mac, { id: 'fal', status: 'needs-key' }], setup: [{ runOn: 'fal', label: 'fal', action: { kind: 'add_key', text: 'Add a fal key' }, credits: 5 }] }).kind, 'add_key', 'a hosted route still offers its key');
  assert.equal(rowStatusOf({ preselect: null, runsOn: [{ id: 'local', status: 'unavailable', reasonCode: null }], setup: [] }).text, 'Not available here');
  ok('rowStatus: "Doesn\'t run on a Mac" with no Download; a hosted route still offers Add key');
} finally { HW.setHardwareOverride(null); fs.rmSync(D, { recursive: true, force: true }); }
console.log('mac-weights: all checks passed');
