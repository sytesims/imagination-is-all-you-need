// Fit check before a heavy local run (2026-10-31, hardware plan item 4): fixed sample readings, in process, temp data dir, mock backend, no network.
// 1 which free memory counts per platform (Mac and DGX Spark: system memory, shared; an NVIDIA card: its own free memory; never the GB10's cudaMemGetInfo)
// 2 the warning (only for models of 8 GB and up, only when short; a block only on shared memory, M1 2026-11-02) · 3 the run menu's mini line (learned time, first run)
// 4 a heavy model that fits still carries its cloud route, so the warning can offer it.
// Run: npx tsx test/hardware-fitcheck.test.ts
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'fitcheck-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'none.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', COMFY_API_KEY: '' });
delete process.env.OPENHIGGSFIELD_HW_MOCK;
const MP = await import('../src/hardware/machineProfile.ts'); const TC = await import('../src/shared/thisComputer.ts');
const ok = (m: string) => console.log('ok ' + m); const GiB = 2 ** 30;
const fx = (n: string) => JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/machines', `${n}.json`), 'utf8'));
const profileOf = (n: string) => { const f = fx(n); return MP.classifyMachine({ ...MP.inputFromSystemStats(f.system_stats, f.host), ramBytes: f.host.ramBytes, computeCap: MP.parseNvidiaSmi(f.nvidia_smi ?? '')[0]?.computeCap ?? null }); };
const live = (ramFreeGB: number, vram: [number, number] | null = null) => ({ ram: { totalBytes: 128 * GiB, freeBytes: ramFreeGB * GiB }, vram: vram ? { totalBytes: vram[0] * GiB, freeBytes: vram[1] * GiB } : null });
try {
  const mac = profileOf('mac-m1-max'), pc = profileOf('win-rtx4090'), spark = profileOf('dgx-spark');
  assert.equal(mac.id, 'apple-silicon'); assert.equal(pc.id, 'nvidia'); assert.equal(spark.id, 'dgx-spark');
  // ---- 1. which memory ----
  assert.equal(TC.freeForModelsGB(mac, live(13)), 13, 'Mac: free system memory (shared)');
  assert.equal(TC.freeForModelsGB(spark, live(77, [128, 2])), 77, 'Spark: free system memory (MemAvailable), not the GPU reading');
  assert.equal(TC.freeForModelsGB(pc, live(40, [24, 6])), 6, 'NVIDIA card: its own free graphics memory');
  assert.equal(TC.freeForModelsGB(pc, live(40, null)), null, 'NVIDIA card without a reading: nothing to say');
  assert.equal(TC.freeForModelsGB(null, live(13)), null, 'unknown hardware: nothing to say');
  ok('free memory: Mac and Spark read system memory (shared), an NVIDIA card its own; unknown → none');

  // ---- 2. the warning ----
  const m = TC.memoryCheck(24, mac, live(13)); assert.ok(m?.short); assert.match(m!.text, /needs about 24 GB and 13 GB is free/); assert.doesNotMatch(m!.text, /still runs|more slowly/, 'M1: never "still runs" on shared memory');
  assert.equal(m!.block, true, 'M1: shared memory and short = it waits for a yes (it can freeze the computer)'); assert.match(m!.text, /can freeze your computer/);
  { const g = TC.memoryCheck(20, pc, live(60, [24, 6])); assert.equal(g?.block, false, 'a graphics card: said, never blocked'); assert.doesNotMatch(g!.text, /still runs/); };
  assert.equal(TC.memoryCheck(24, mac, live(40))?.short, false, 'enough free: no warning');
  assert.equal(TC.memoryCheck(6, mac, live(2)), null, 'small model: no check');
  assert.equal(TC.memoryCheck(null, mac, live(2)), null, 'unknown need: no check');
  assert.equal(TC.memoryCheck(40, spark, live(77, [128, 2]))?.short, false, 'Spark: 77 GB free is enough for 40 GB (the low GPU reading is ignored)');
  assert.equal(TC.memoryCheck(20, pc, live(60, [24, 6]))?.short, true, 'NVIDIA: 6 GB free on the card for a 20 GB model');
  assert.equal(TC.memoryCheck(20, mac, live(0.3))?.text.includes('0.3 GB is free'), true, 'very low free memory: said as it is');
  ok('warning: only for 8 GB+ models when short now; blocks only on shared memory (M1); Spark judged by shared memory');

  // ---- 3. mini line ----
  assert.equal(TC.hereLine({ name: 'Apple M1 Max · 64 GB', freeGB: 13, etaSeconds: 253, etaSource: 'learned', samples: 5 }), 'Apple M1 Max · 64 GB · 13 GB free now · about 4 min (your last 5 runs)');
  assert.equal(TC.hereLine({ name: null, freeGB: null, etaSeconds: null, etaSource: 'first_run', samples: 0 }), 'This computer · first run: time unknown');
  assert.equal(TC.hereLine({ name: 'NVIDIA GeForce RTX 4090 · 24 GB', etaSeconds: 30, etaSource: 'reported' }), 'NVIDIA GeForce RTX 4090 · 24 GB · about 30 s');
  ok('mini line: name · free now · learned time (or first run)');

  // ---- 4. heavy fits keep a cloud route ----
  const HW = await import('../src/hardware.ts'); const FV = await import('../src/routing/fitView.ts'); const { getTool } = await import('../src/tools/registry.ts');
  HW.setHardwareOverride('rtx4090'); const t = getTool('create-image')!;
  const f = FV.withAlternative(t, 'comfy-zimage-turbo', { types: ['generate'] }, { verdict: 'fits', reasonCode: 'fits', recommendedVramGB: 14.2 } as any);
  assert.equal(f.alternativeReason, null, 'a fit is no reason to switch'); assert.ok(f.alternative === null || typeof f.alternative.providerId === 'string');
  const small = FV.withAlternative(t, 'comfy-klein4b', {}, { verdict: 'fits', reasonCode: 'fits', recommendedVramGB: 4 } as any); assert.equal(small.alternative, null, 'small model: no alternative looked up');
  HW.setHardwareOverride(null);
  ok('heavy fits: alternative looked up (reason stays null); small fits: none');
} finally { fs.rmSync(D, { recursive: true, force: true }); }
