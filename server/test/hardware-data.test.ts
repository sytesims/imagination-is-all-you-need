// Hardware plan item 2 (2026-10-31): the model manifest data. In-process, temp data dir, mock backend, no network.
// Covers: B4 the soul look LoRAs listed per base (soul-zit no longer carries InfiniteYou's fp8 InfuseNet, so OpenSoul runs on a Mac; soul-ref-infiniteyou
// stays NVIDIA-only), B7 the seven graphs in the workflows table (Chatterbox / F5-TTS get a memory estimate, so their fit is checked), and the LoRA base field.
// Run: npx tsx test/hardware-data.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'hwdata-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_ENV_FILE: path.join(D, 'env'), OPENHIGGSFIELD_LOCAL_AVAILABLE: '1' });
delete process.env.OPENHIGGSFIELD_HW_MOCK; delete process.env.OPENHIGGSFIELD_COMFY_MODELS_DIR;
const HW = await import('../src/hardware.ts'); const R = await import('../src/hardware/requirements.ts');
const { weightsForWorkflows } = await import('../src/modelWeights.ts'); const { getTool } = await import('../src/tools/registry.ts');
const ok = (m: string) => console.log('ok ' + m);
try {
  const man = R.manifest();
  // ---- B7: every graph a local route runs is in the workflows table ----
  for (const w of ['ltx25-a2v', 'voice-chatterbox-tts', 'voice-chatterbox-vc', 'voice-f5tts', 'create-image-qwen-edit2509-multiref', 'shots-qwen-edit2509-angles', 'camera-ltx-flf'])
    assert.ok(man.workflows[`workflows/${w}-api.json`]?.vram_est_gb, `${w} has a memory estimate`);
  assert.ok(!Object.keys(man.workflows).some((k) => k.includes('*') || k.endsWith(')')), 'no glob or "(preset LoRA)" rows in the workflows table');
  HW.setHardwareOverride('rtx4090');
  for (const p of ['comfy-chatterbox', 'comfy-f5tts']) { const f = R.fitFor(getTool('audio')!, p, {}); assert.notEqual(f.reasonCode, 'requirements_unknown', p); assert.equal(f.verdict, 'fits', p); }
  ok('B7: the 7 graphs are in the table; Chatterbox and F5-TTS are checked (fits), not "requirements unknown"');

  // ---- B4: look LoRAs per base ----
  const files = (w: string) => weightsForWorkflows([w]).map((x) => x.file);
  assert.ok(!files('soul-zit-api.json').some((f) => /infusenet|fp8/.test(f)), 'soul-zit: no fp8 file');
  assert.ok(files('soul-zit-api.json').includes('50sNoirZ.safetensors'), 'soul-zit: its own Z-Image look LoRA');
  assert.ok(!files('soul-zit-api.json').includes('d1rectflash.safetensors'), 'soul-zit: no FLUX look LoRA');
  assert.ok(files('soul-ref-infiniteyou-api.json').includes('sim_stage1/infusenet_sim_fp8e4m3fn.safetensors'), 'InfiniteYou keeps its InfuseNet');
  assert.ok(files('soul-flux1dev-api.json').includes('d1rectflash.safetensors') && !files('soul-flux1dev-api.json').includes('50sNoirZ.safetensors'), 'FLUX graph: FLUX looks only');
  HW.setHardwareOverride('mac36');
  const soul = getTool('soul')!;
  const zit = R.requirementsFor(soul, 'comfy-soul', {}); assert.ok(zit, 'soul requirements');
  const wf = R.jobWorkflows(soul, 'comfy-soul', {}); assert.ok(wf.includes('soul-zit-api.json'));
  const f = R.fitFor(soul, 'comfy-soul', {}); assert.notEqual(f.reasonCode, 'unsupported_weights', `OpenSoul on a Mac: ${f.verdict}/${f.reasonCode}`);
  assert.equal(R.fitFor(soul, 'comfy-soul', { preset: 'retro-bw' }).reasonCode !== 'unsupported_weights', true, 'a Z-Image look runs on a Mac');
  assert.deepEqual(R.jobWorkflows(soul, 'comfy-soul', { preset: 'subtle-flash' }), ['soul-flux1dev-api.json'], 'a FLUX look is judged by its own graph');
  assert.equal(R.fitFor(soul, 'comfy-soul', { preset: 'subtle-flash' }).variant?.verified, false, 'a FLUX look on a Mac: only through its untested GGUF variant (item 5)');
  assert.equal(R.fitFor(soul, 'comfy-soul', { preset: 'y2k-street' }).reasonCode, 'unsupported_weights', 'a Qwen 2512 look needs NVIDIA on a Mac (no Mac files for it)');
  assert.equal(R.fitFor(soul, 'comfy-soul', { refPaths: ['a.png'], engine: 'infiniteyou' }).reasonCode, 'unsupported_weights', 'InfiniteYou needs NVIDIA on a Mac');
  ok(`B4: soul-zit carries only Z-Image looks (no fp8); OpenSoul on a Mac is ${f.verdict}/${f.reasonCode}, not "Needs NVIDIA"`);

  // ---- LoRA base field ----
  const row = (file: string) => man.models.find((m) => m.file === file) as any;
  assert.equal(row('50sNoirZ.safetensors').base, 'z-image-turbo'); assert.equal(row('d1rectflash.safetensors').base, 'flux1-dev');
  assert.equal(row('ltx-2.5-22b-ic-lora-clean-plate-1.0.safetensors').base, 'ltx-2.5-22b'); assert.equal(row('Qwen-Edit-2509-Multiple-angles.safetensors').base, 'qwen-image-edit-2509');
  for (const m of man.models as any[]) if (m.input?.includes('lora_name')) assert.ok('base' in m, `${m.file} has a base field`);
  assert.equal(weightsForWorkflows(['soul-zit-api.json']).find((x) => x.file === '50sNoirZ.safetensors')?.base, 'z-image-turbo', 'the base reaches the weights list');
  ok('LoRA base: every LoRA row has one (soul looks from their preset, others from their graph\'s DiT)');
} finally { HW.setHardwareOverride(null); fs.rmSync(D, { recursive: true, force: true }); }
