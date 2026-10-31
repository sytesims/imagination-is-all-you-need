// "This computer" (2026-10-31, hardware plan B1–B3, B5, B8): fixed sample inputs, in process, temp data dir, mock backend, no network.
// 1 machine labels per platform: Apple Silicon (chip name, usable memory never called VRAM, honest tier sentence), NVIDIA (name + VRAM, tier by VRAM),
//   DGX Spark (GB10 name, compute capability 12.1, or an ARM64 Linux GPU with no memory of its own → unified memory) · 2 unique local model counts
//   (a model under several tools counts once; unsupported_weights / unsupported_hardware = need NVIDIA) · 3 one learned-timing key per computer, with
//   the old keys merged on read (samples, step rows and rates; another computer's rows stay apart) · 4 the live reading (vm_stat parse, GET shape).
// Run: npx tsx test/this-computer.test.ts
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'thiscomp-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'none.env'), OPENHIGGSFIELD_BACKEND: 'mock', COMFY_API_KEY: '' });
delete process.env.OPENHIGGSFIELD_HW_MOCK; delete process.env.COMFY_BASE_URL;
const MP = await import('../src/hardware/machineProfile.ts'); const HW = await import('../src/hardware.ts'); const TC = await import('../src/shared/thisComputer.ts');
const { put, setKv } = await import('../src/db.ts');
const ok = (m: string) => console.log('ok ' + m); const GiB = 2 ** 30;

// ---- 1. labels per platform ----
{ const mac = MP.classifyMachine({ seen: true, platform: 'darwin', arch: 'arm64', ramBytes: 64 * GiB, cpuModel: 'Apple M1 Max', gpu: { name: 'mps', type: 'mps', vramTotalBytes: null } });
  assert.equal(mac.id, 'apple-silicon'); assert.equal(mac.label, 'Apple M1 Max · 64 GB', 'the chip name, never "mps"'); assert.equal(mac.usableGB, 48); assert.equal(mac.unifiedMemory, true);
  assert.equal(TC.machineLabel(mac), 'Apple M1 Max · 64 GB'); assert.equal(TC.usableText(mac), 'about 48 GB usable for models'); assert.doesNotMatch(TC.usableText(mac), /VRAM/);
  assert.equal(HW.tierLabelOf(HW.tierOf(48), mac), 'Runs most local models; fp8-only ones need NVIDIA', 'Apple Silicon: never "every local model"');
  // ComfyUI's own device name when the host can't be asked (remote ComfyUI): an Apple chip name is kept, "mps" is not
  assert.equal(MP.classifyMachine({ seen: true, ramBytes: 36 * GiB, gpu: { name: 'Apple M3 Max', type: 'mps', vramTotalBytes: null } }).label, 'Apple M3 Max · 36 GB');
  assert.equal(MP.classifyMachine({ seen: true, ramBytes: 36 * GiB, gpu: { name: 'mps', type: 'mps', vramTotalBytes: null } }).label, 'Apple Silicon · 36 GB'); }
{ const nv = MP.classifyMachine(MP.inputFromNvidiaSmi('NVIDIA GeForce RTX 4090, 24564, 23000, 8.9', { platform: 'linux', arch: 'x64', ramBytes: 64 * GiB }));
  assert.equal(nv.id, 'nvidia'); assert.equal(nv.label, 'NVIDIA GeForce RTX 4090 · 24 GB'); assert.equal(nv.unifiedMemory, false); assert.equal(TC.usableText(nv), '24 GB graphics memory');
  assert.equal(HW.tierLabelOf('all', nv), 'Runs the big local models too (some slowly)', 'NVIDIA: by VRAM, never "every"'); assert.equal(HW.tierLabelOf('most', nv), 'Runs most local models');
  const small = MP.classifyMachine({ seen: true, platform: 'win32', arch: 'x64', ramBytes: 16 * GiB, gpu: { name: 'cuda:0 NVIDIA GeForce RTX 4050 Laptop GPU : cudaMallocAsync', type: 'cuda', vramTotalBytes: 6 * GiB } });
  assert.equal(small.label, 'NVIDIA GeForce RTX 4050 Laptop GPU · 6 GB', 'ComfyUI device name cleaned'); assert.equal(HW.tierLabelOf(HW.tierOf(6), small), 'Runs the light local models (upscalers, cut-outs, voice and audio)'); }
{ const host = { platform: 'linux', arch: 'arm64', ramBytes: 128 * GiB };
  const byName = MP.classifyMachine(MP.inputFromNvidiaSmi('NVIDIA GB10, [N/A], [N/A], 12.1', host));
  const byCap = MP.classifyMachine({ seen: true, ...host, computeCap: '12.1', gpu: { name: 'NVIDIA Graphics Device', type: 'cuda', vramTotalBytes: null } });
  const byArch = MP.classifyMachine({ seen: true, ...host, gpu: { name: 'NVIDIA Graphics Device', type: 'cuda', vramTotalBytes: null } });
  for (const [why, p] of [['GB10 name', byName], ['compute capability 12.1', byCap], ['ARM64 Linux, no memory of its own', byArch]] as const) {
    assert.equal(p.id, 'dgx-spark', `Spark by ${why}`); assert.equal(p.unifiedMemory, true, `${why}: unified`); assert.equal(p.usableGB, 128, `${why}: system memory is the usable memory`);
    assert.equal(TC.usableText(p), 'about 128 GB usable for models (shared memory)'); }
  // an ARM64 Linux server card that reports its own memory (e.g. GH200) stays NVIDIA
  assert.equal(MP.classifyMachine({ seen: true, ...host, gpu: { name: 'NVIDIA GH200 480GB', type: 'cuda', vramTotalBytes: 96 * GiB } }).id, 'nvidia'); }
{ const un = MP.classifyMachine({ seen: false }); assert.equal(TC.machineLabel(un), ''); assert.equal(TC.usableText(un), ''); assert.equal(HW.tierLabelOf('unknown', un), "Couldn't check the hardware, so nothing is blocked"); }
ok('labels: Apple Silicon (chip name, "usable for models", fp8 sentence), NVIDIA (name + VRAM, tier by VRAM), DGX Spark by name / 12.1 / ARM64 (unified), unknown');

// ---- 2. unique local model counts ----
{ const L = (status: string, reasonCode: string | null = null, action: any = null) => ({ id: 'local', status, reasonCode, action });
  const model = (key: string, local: any) => ({ key, runsOn: [{ id: 'comfy-cloud', status: 'ready' }, local] });
  const tools = [
    { models: [model('a', L('ready')), model('b', L('not-installed', 'weights_missing', { kind: 'download' })), model('c', L('unavailable', 'unsupported_weights')), model('soon', L('coming-soon'))] },
    { models: [model('a', L('ready')), model('c', L('unavailable', 'unsupported_weights')), model('d', L('unavailable', 'unsupported_hardware')), model('e', L('not-installed', 'too_heavy')), { key: 'cloud-only', runsOn: [{ id: 'fal', status: 'ready' }] }] },
    { models: [model('f', L('not-installed', 'nodes_missing', { kind: 'install_node' })), model('g', L('off', 'local_off'))] },
  ];
  const c = TC.countLocalModels(tools);
  assert.deepEqual(c, { total: 7, runs: 4, ready: 1, download: 1, setUp: 1, needsNvidia: 2, tooBig: 1, untested: 0 }, 'unique models: a and c listed twice count once; coming-soon and cloud-only are not local models');
  assert.equal(TC.localCountsText(c), '4 of 7 local models run here · 2 need NVIDIA · 1 too big'); assert.equal(TC.localReadyText(c), '1 ready, 1 to download, 1 need a node pack');
  assert.equal(TC.localCountsText(TC.countLocalModels([])), '', 'no local models → no line');
  // the shape of this computer's audit (2026-10-31): 25 ready, 11 to download, 21 need NVIDIA → the line the plan expects
  const many = [{ models: [...Array.from({ length: 25 }, (_, i) => model(`r${i}`, L('ready'))), ...Array.from({ length: 11 }, (_, i) => model(`d${i}`, L('not-installed', 'weights_missing'))), ...Array.from({ length: 21 }, (_, i) => model(`n${i}`, L('unavailable', 'unsupported_weights')))] }];
  assert.equal(TC.localCountsText(TC.countLocalModels(many)), '36 of 57 local models run here · 21 need NVIDIA'); }
ok('counts: unique local models, ready, to download, a node pack to add or Local switched off all run here; unsupported weights / hardware need NVIDIA; too heavy is too big');

// ---- 3. learned timings: one key per computer, old keys merged on read ----
{ HW.setHardwareOverride({ source: 'comfyui-system_stats', gpu: { name: 'mps', type: 'mps', count: 1, vramTotalBytes: null, vramFreeBytes: null, vramTotalGB: null, unifiedMemory: true }, ram: { totalBytes: 64 * GiB, freeBytes: 20 * GiB, totalGB: 64 },
    profile: MP.classifyMachine({ seen: true, platform: 'darwin', arch: 'arm64', ramBytes: 64 * GiB, cpuModel: 'Apple M1 Max', gpu: { name: 'mps', type: 'mps', vramTotalBytes: null } }) } as any);
  const hw = HW.currentHardware(); const key = HW.hwKeyOf(hw);
  assert.equal(key, 'apple-silicon|Apple M1 Max|64', 'class, chip and memory'); assert.equal(HW.legacyHwKey(hw), 'mps|mps|48');
  // the same computer read by the host probe ("Apple Silicon") gets the same key
  assert.equal(HW.hwKeyOf({ ...hw, gpu: { ...hw.gpu!, name: 'Apple Silicon' } }), key, 'one key whichever probe answered');
  assert.equal(HW.isLegacyKeyOf('mps|mps|48', hw), true); assert.equal(HW.isLegacyKeyOf('mps|Apple Silicon|48', hw), true);
  assert.equal(HW.isLegacyKeyOf('mps|mps|27', hw), false, 'another Apple computer (36 GB) stays apart'); assert.equal(HW.isLegacyKeyOf('cuda|NVIDIA GeForce RTX 4090|23.99', hw), false); assert.equal(HW.isLegacyKeyOf('cloud', hw), false);
  // NVIDIA: the old key had ComfyUI's raw device name; the clean name matches
  const nvHw: any = { gpu: { name: 'cuda:0 NVIDIA GeForce RTX 4090 : cudaMallocAsync', type: 'cuda', vramTotalGB: 23.99 }, tier: 'all', effectiveVramGB: 23.99 };
  assert.equal(HW.isLegacyKeyOf('cuda|NVIDIA GeForce RTX 4090|23.99', nvHw), true); assert.equal(HW.isLegacyKeyOf('cuda|NVIDIA GeForce RTX 4080|23.99', nvHw), false);

  // rows written before the fix, under both old keys, plus another computer's: written straight to the tables (as an old database has them)
  const K = 'create-image|local:comfy-zit|img-1MP|image'; let n = 0;
  const sample = (hwKey: string, renderSec: number) => { const id = `old${n++}`; put('eta_samples', id, { id, key: K, hwKey, renderSec, downloadSec: 0, loadSec: 0, bytesDownloaded: 0, bytesLoaded: 0, units: 1, at: 1_000 + n }); };
  sample('mps|mps|48', 160); sample('mps|mps|48', 170); sample('mps|Apple Silicon|48', 165); sample('mps|Apple Silicon|48', 168); sample('mps|mps|27', 400);
  const step = (hwKey: string) => { const id = `st-old${n++}`; put('eta_steps', id, { id, key: 'k', baseKey: 'b', hwKey, modelsSig: 's', label: 'zit', toolId: 'create-image', steps: 8, graphSteps: 8, units: 1, postUnits: 1, loadSec: 10, loadKind: 'cold', sampleSec: 150, postSec: 5, totalSec: 165, at: 2_000 + n, factors: {} }); };
  step('mps|mps|48'); step('mps|Apple Silicon|48'); step('mps|mps|27');
  setKv('eta.rates', { 'mps|mps|48': { download: [10e6], load: [] }, 'mps|Apple Silicon|48': { download: [30e6], load: [] }, 'mps|mps|27': { download: [99e6], load: [] } });
  const L = await import('../src/etaLearn.ts'); const S = await import('../src/stepEta.ts');
  const got = L.learned(K, key); assert.equal(got.n, 4, 'both old keys of this computer count, the 36 GB one does not'); assert.equal(got.perUnit, 166.5);
  assert.equal(L.learned(K, 'mps|mps|27').n, 1, 'another computer keeps its own rows');
  assert.equal(S.stepRows().filter((r) => r.hwKey === key).length, 2, 'step rows merged too');
  assert.equal(L.rateOf(key, 'download').bps, 20e6, 'download rates merged (median of 10 and 30 MB/s)'); assert.equal(L.rateOf(key, 'download').source, 'learned');
  // a new sample lands under the new key and joins the same group
  L.addSample({ key: K, hwKey: HW.hwKeyOf(), renderSec: 167, downloadSec: 0, loadSec: 0, bytesDownloaded: 0, bytesLoaded: 0, units: 1 }); assert.equal(L.learned(K, key).n, 5);
  assert.ok(L.learnedSummary().groups.some((g) => g.hwKey === key && g.samples === 5), 'the summary shows one group for this computer');
  HW.setHardwareOverride(null); }
ok('learned timings: one key per computer (class|chip|memory); old "mps|mps|48" and "mps|Apple Silicon|48" rows, step rows and rates merge on read; other computers stay apart');

// ---- 4. live reading ----
{ const out = 'Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPages free:                               1000.\nPages active:                            5000.\nPages inactive:                           3000.\nPages speculative:                         500.\nPages wired down:                         2000.\nPages purgeable:                           100.\n';
  assert.equal(HW.parseVmStat(out), (1000 + 3000 + 500) * 16384, 'available = free + inactive + speculative'); assert.equal(HW.parseVmStat('nonsense'), null);
  assert.equal(HW.parseMemAvailable('MemTotal:       131072000 kB\nMemFree:          2000000 kB\nMemAvailable:    90000000 kB\n'), 90000000 * 1024, 'Linux: MemAvailable, not MemFree'); assert.equal(HW.parseMemAvailable('MemFree: 5 kB\n'), null);
  const v = await HW.liveReading(); assert.ok(v.ram.totalBytes > 0 && v.ram.freeBytes >= 0 && v.ram.freeBytes <= v.ram.totalBytes, 'host memory read');
  assert.ok(['comfyui', 'vm_stat', 'meminfo', 'os'].includes(v.ram.source), v.ram.source); assert.equal(v.comfy.reachable, null, 'no ComfyUI address → not asked'); assert.ok(v.disk && 'freeBytes' in v.disk);
  assert.equal(await HW.liveReading(), v, 'at most one reading per 2 s'); }
ok('live reading: vm_stat and /proc/meminfo parse, host memory without ComfyUI, disk, cached 2 s');
console.log('this-computer: all passed');
