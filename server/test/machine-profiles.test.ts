// Setup step 2: machine classes (hardware/machineProfile.ts) against recorded / SIMULATED machines in test/fixtures/machines/*.json
// (Windows + RTX 4090, Linux + RTX 3060 12 GB, RTX 5090, DGX Spark, Mac M1 Max, CPU only). The non-Mac ones are reconstructed from public specs,
// not run on that hardware. Checks: the class, VRAM tier, weight support, Comfy kind; the same answer from nvidia-smi; the host probe on GB10
// ([N/A] memory → unified); and a few fit verdicts per machine through the real hardware.ts + requirements.ts path.
// Run: npx tsx test/machine-profiles.test.ts
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'mprof-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0' });
delete process.env.OPENHIGGSFIELD_HW_MOCK; delete process.env.COMFY_BASE_URL; delete process.env.OPENHIGGSFIELD_COMFY_MODELS_DIR;
const MP = await import('../src/hardware/machineProfile.js'); const HW = await import('../src/hardware.js'); const R = await import('../src/hardware/requirements.js');
const CI = await import('../src/hardware/comfyInstall.js'); const { getTool } = await import('../src/tools/registry.js'); const { config } = await import('../src/config.js');
const ok = (m: string) => console.log('ok ' + m);
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/machines');
const FX: Record<string, any> = Object.fromEntries(fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => [f.replace(/\.json$/, ''), JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'))]));
assert.deepEqual(Object.keys(FX).sort(), ['cpu-only', 'dgx-spark', 'linux-rtx3060-12gb', 'mac-m1-max', 'win-rtx4090', 'win-rtx5090']);

// ---- 1. classification from /system_stats and from nvidia-smi ----
for (const [k, f] of Object.entries(FX)) { const e = f.expect; const cap = f.nvidia_smi ? MP.parseNvidiaSmi(f.nvidia_smi)[0].computeCap : null;
  const p = MP.classifyMachine(MP.inputFromSystemStats(f.system_stats, { ...f.host, computeCap: cap }));
  assert.equal(p.id, e.id, `${k} class`); assert.equal(p.backend, e.backend, `${k} backend`); assert.equal(p.vramClass, e.vramClass, `${k} vram class`);
  assert.equal(p.weights.fp8, e.fp8, `${k} fp8`); assert.equal(p.weights.nvfp4, e.nvfp4, `${k} nvfp4`); if (e.usableGB) assert.equal(p.usableGB, e.usableGB, `${k} usable`); if (e.unified) assert.equal(p.unifiedMemory, true);
  assert.equal(CI.comfyKindOf(f.system_stats), e.comfyKind, `${k} comfy kind`); assert.ok(p.label.length > 3 && !/undefined|null/.test(p.label), `${k} label "${p.label}"`);
  if (f.nvidia_smi) { const q = MP.classifyMachine(MP.inputFromNvidiaSmi(f.nvidia_smi, f.host)); assert.equal(q.id, e.id, `${k} via nvidia-smi`); assert.equal(q.vramClass, e.vramClass, `${k} nvidia-smi vram class`); } }
// without compute_cap (older drivers) the names still classify; GB10 by name, Blackwell by name
assert.equal(MP.classifyMachine(MP.inputFromNvidiaSmi('NVIDIA GeForce RTX 5070 Ti, 16303, 15000', { platform: 'linux', arch: 'x64' })).id, 'nvidia-blackwell');
assert.equal(MP.classifyMachine(MP.inputFromNvidiaSmi('NVIDIA GB10, [N/A], [N/A]', { platform: 'linux', arch: 'arm64', ramBytes: 128e9 })).usableGB, 119.2, 'GB10 with no memory figure → system memory');
assert.deepEqual(['8', '12', '16', '24', '32+', '<8'].map((c, i) => MP.vramClassOf([8, 12, 16, 24, 32, 6][i] - 0.3)), ['8', '12', '16', '24', '32+', '<8'], 'cards report a little under their size');
assert.equal(MP.classifyMachine({ seen: true, gpu: { name: 'cuda:0 AMD Radeon RX 7900 XTX : native', type: 'cuda', vramTotalBytes: 24 * 2 ** 30 } }).id, 'amd-rocm', 'ROCm reports type cuda: AMD by name');
assert.equal(MP.classifyMachine({ seen: false }).id, 'unknown');
ok('1 classes: ' + Object.entries(FX).map(([k, f]) => `${k} → ${f.expect.id}${f.expect.vramClass ? ` (${f.expect.vramClass} GB class)` : ''}`).join(', '));

// ---- 2. host probe: nvidia-smi on GB10 has no memory figure ----
{ const gb10 = HW.probeHost(((cmd: string) => { if (cmd === 'nvidia-smi') return Buffer.from('NVIDIA GB10, [N/A], [N/A]\n'); throw new Error('no'); }) as any);
  assert.equal(gb10.gpu?.unifiedMemory, true); assert.equal(gb10.gpu?.vramTotalGB, null); assert.equal(HW.effectiveVram(gb10.gpu, 128e9), Math.round(128e9 / 2 ** 30 * 100) / 100, 'unified: system memory stands in for VRAM');
  const g4090 = HW.probeHost(((cmd: string) => { if (cmd === 'nvidia-smi') return Buffer.from('NVIDIA GeForce RTX 4090, 24564, 23000\n'); throw new Error('no'); }) as any); assert.equal(g4090.gpu?.vramTotalGB, 23.99); assert.equal(g4090.gpu?.unifiedMemory, false); }
ok('2 host probe: GB10 [N/A] → unified, effective VRAM = system memory; RTX 4090 unchanged');

// ---- 3. fit verdicts per machine (the real hardware.ts → requirements.ts path) ----
const CASES: [string, string, any][] = [['image-upscale', 'comfy-realesrgan', {}], ['create-image', 'comfy-zimage', { types: ['generate'] }], ['h3-video', 'comfy-h3', { types: ['t2v'] }], ['reshoot', 'comfy-funcamera', {}], ['audio', 'comfy-drama3', {}]];
const EXPECT: Record<string, string[]> = {
  'win-rtx4090': ['fits/fits', 'fits/fits', 'slow/offload', 'fits/fits', 'too_heavy/not_enough_vram'],
  'linux-rtx3060-12gb': ['fits/fits', 'slow/offload', 'too_heavy/not_enough_vram', 'slow/offload', 'too_heavy/not_enough_vram'],
  'win-rtx5090': ['fits/fits', 'fits/fits', 'fits/fits' /* 32 GB holds H3 */, 'fits/fits', 'too_heavy/not_enough_vram'],
  'dgx-spark': ['fits/fits', 'fits/fits', 'fits/fits', 'fits/fits', 'fits/fits'], // ~120 GB unified: everything fits (slower than a desktop card)
  'mac-m1-max': ['fits/fits', 'slow/mps', 'too_heavy/unsupported_weights', 'too_heavy/unsupported_weights', 'too_heavy/unsupported_weights'],
  'cpu-only': ['slow/cpu', 'too_heavy/no_gpu', 'too_heavy/no_gpu', 'too_heavy/no_gpu', 'too_heavy/no_gpu'],
};
config.comfyBaseUrl = ''; const table: string[] = [];
for (const [k, f] of Object.entries(FX)) { const s = HW.parseSystemStats(f.system_stats);
  HW.setHardwareOverride({ source: 'comfyui-system_stats', gpu: s.gpu, ram: { totalBytes: s.ramTotal, freeBytes: s.ramFree, totalGB: s.ramTotal ? s.ramTotal / 2 ** 30 : null } } as any); const hw = HW.currentHardware();
  assert.equal(hw.profile.id, f.expect.id, `${k}: Hardware.profile`); assert.equal(hw.tier, f.expect.tier, `${k}: tier`);
  const got = CASES.map(([t, p, i]) => { const v = R.fitFor(getTool(t)!, p, i, hw); return `${v.verdict}/${v.reasonCode === 'not_enough_disk' ? v.hardwareReasonCode : v.reasonCode}`; });
  table.push(`${k.padEnd(19)} ${got.join(' · ')}`);
  EXPECT[k].forEach((w, i) => assert.equal(got[i], w, `${k} ${CASES[i][0]}/${CASES[i][1]}`)); }
HW.setHardwareOverride(null);
ok('3 fit verdicts (' + CASES.map((c) => c[1]).join(', ') + '):\n   ' + table.join('\n   '));
