// Variants keyed by platform (2026-10-31, hardware plan item 5): in process, temp data dir, mock backend, mock hardware profiles, no network, no downloads.
// 1 auto-pick on all four platforms (Mac → the GGUF + 16-bit set, NVIDIA PC → the graph's own files, DGX Spark → inherits NVIDIA, CPU → none for big graphs)
// 2 role-based swap: DiT AND text encoder change together, so the Mac block lifts (B6); a .gguf DiT loads with UnetLoaderGGUF
// 3 labels: an unverified variant says "Should run here (not tested yet)", never "runs here"; counts keep it apart
// 4 downloads plan only the picked variant's files · 5 the GGUF loader is asked for when ComfyUI lacks it · 6 graphs with no swap stay "Needs NVIDIA".
// Run: npx tsx test/hardware-variants.test.ts
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'hwvar-')); const MD = path.join(D, 'models'); fs.mkdirSync(MD);
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'none.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', COMFY_API_KEY: '' });
delete process.env.OPENHIGGSFIELD_HW_MOCK; delete process.env.OPENHIGGSFIELD_COMFY_MODELS_DIR;
const HW = await import('../src/hardware.ts'); const R = await import('../src/hardware/requirements.ts'); const V = await import('../src/hardware/variants.ts');
const { planFiles } = await import('../src/hardware/downloads.ts'); const { getTool } = await import('../src/tools/registry.ts'); const TC = await import('../src/shared/thisComputer.ts');
const ok = (m: string) => console.log('ok ' + m);
const QWEN = 'create-image-qwen-t2i-api.json';
try {
  // ---- 1. auto-pick per platform ----
  const plat = (name: string) => { HW.setHardwareOverride(name); return V.platformOf(HW.currentHardware().profile); };
  assert.equal(plat('mac64'), 'mac-arm64'); assert.equal(plat('rtx4090'), 'nvidia-x64'); assert.equal(plat('spark'), 'nvidia-arm64'); assert.equal(plat('cpu'), 'cpu'); assert.equal(plat('unknown'), null);
  const mac = V.pickVariant(QWEN, 'mac-arm64')!; assert.ok(mac.swapped); assert.equal(mac.verified, false);
  assert.deepEqual(mac.variant!.replaces, { dit: 'qwen_image_fp8_e4m3fn.safetensors', te: 'qwen_2.5_vl_7b_fp8_scaled.safetensors' });
  assert.equal(mac.variant!.files!.dit, 'qwen-image-Q4_K_M.gguf'); assert.equal(mac.variant!.files!.te, 'qwen_2.5_vl_7b.safetensors');
  const pc = V.pickVariant(QWEN, 'nvidia-x64')!; assert.equal(pc.swapped, false); assert.equal(pc.variant!.files!.dit, 'qwen_image_fp8_e4m3fn.safetensors', 'NVIDIA PC: the graph as it is');
  const spark = V.pickVariant(QWEN, 'nvidia-arm64')!; assert.equal(spark.swapped, false); assert.deepEqual(spark.variant, pc.variant, 'Spark inherits the NVIDIA files');
  assert.equal(V.pickVariant(QWEN, 'cpu')!.variant, null, 'CPU: nothing for a 24 GB graph');
  assert.ok(V.pickVariant('image-upscale-ultrasharp-x4-api.json', 'cpu')!.variant, 'CPU: a small graph inherits its files');
  assert.equal(V.pickVariant('ltx25-ti2v-api.json', 'mac-arm64')!.swapped, false, 'a Mac-safe graph keeps its files on a Mac');
  assert.equal(V.pickVariant(QWEN, null), null, 'unknown hardware: no pick');
  ok('auto-pick: Mac → GGUF + 16-bit encoder, NVIDIA PC → graph files, Spark → inherits NVIDIA, CPU → none for big graphs, unknown → none');

  // ---- 2. role swap ----
  const g = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../../workflows', QWEN), 'utf8'));
  V.applyFileSwap(g, V.swapsFor([QWEN], 'mac-arm64')); const nodes = Object.values<any>(g);
  assert.ok(nodes.some((n) => n.class_type === 'UnetLoaderGGUF' && n.inputs.unet_name === 'qwen-image-Q4_K_M.gguf'), 'DiT → UnetLoaderGGUF');
  assert.ok(nodes.some((n) => n.class_type === 'CLIPLoader' && n.inputs.clip_name === 'qwen_2.5_vl_7b.safetensors' && n.inputs.type === 'qwen_image'), 'encoder swapped, its other inputs kept');
  assert.ok(!JSON.stringify(g).includes('fp8'), 'no fp8 file left in the Mac graph');
  const g2 = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../../workflows', QWEN), 'utf8')); assert.deepEqual(V.applyFileSwap(structuredClone(g2), V.swapsFor([QWEN], 'nvidia-x64')), g2, 'NVIDIA: graph unchanged');
  ok('role swap: DiT and encoder change together; the GGUF DiT loads with UnetLoaderGGUF; NVIDIA graphs untouched');

  // ---- 3. fit and labels ----
  const ci = getTool('create-image')!;
  HW.setHardwareOverride('mac64'); const fm = R.fitFor(ci, 'comfy-qwen-image', { types: ['generate'] });
  assert.notEqual(fm.reasonCode, 'unsupported_weights', `Qwen-Image on a Mac: ${fm.verdict}/${fm.reasonCode}`); assert.equal(fm.variant?.verified, false); assert.match(fm.reason, /^Should run here \(not tested yet\)/);
  assert.doesNotMatch(fm.reason, /^Runs well|^Fits/);
  const rm = R.requirementsFor(ci, 'comfy-qwen-image', { types: ['generate'] })!; assert.deepEqual(rm.macBlockedFiles, []); assert.ok(rm.variant?.needsNodes.includes('UnetLoaderGGUF'));
  HW.setHardwareOverride('rtx4090'); const fp = R.fitFor(ci, 'comfy-qwen-image', { types: ['generate'] }); assert.equal(fp.variant, undefined, 'NVIDIA: no variant note'); assert.doesNotMatch(fp.reason, /not tested/);
  HW.setHardwareOverride('spark'); const fs2 = R.fitFor(ci, 'comfy-qwen-image', { types: ['generate'] }); assert.equal(fs2.variant, undefined); assert.equal(fs2.verdict, 'fits', 'Spark: fits in 128 GB shared');
  HW.setHardwareOverride('mac64'); assert.equal(R.fitFor(getTool('h3-video')!, 'comfy-h3', { types: ['t2v'] }).reasonCode, 'unsupported_weights', 'H3 has no Mac variant: still Needs NVIDIA');
  const counts = TC.countLocalModels([{ models: [{ key: 'a', runsOn: [{ id: 'local', status: 'not-installed', reasonCode: 'weights_missing', here: { untested: true } }] }, { key: 'b', runsOn: [{ id: 'local', status: 'ready' }] }] }]);
  assert.equal(counts.runs, 1); assert.equal(counts.untested, 1); assert.equal(TC.localCountsText(counts), '1 of 2 local models run here · 1 should run (not tested yet)');
  ok(`labels: Mac Qwen-Image "${fm.reason.slice(0, 60)}…"; NVIDIA and Spark unchanged; H3 still needs NVIDIA; counts keep untested apart`);

  // ---- 4. downloads: only the picked files ----
  HW.setHardwareOverride('mac64'); const pm = planFiles({ downloadId: rm.downloadId }, MD).files.map((f) => f.file);
  assert.ok(pm.includes('qwen-image-Q4_K_M.gguf') && pm.includes('qwen_2.5_vl_7b.safetensors'), 'Mac: the GGUF and 16-bit files');
  assert.ok(!pm.some((f) => /fp8/.test(f)), 'Mac: no fp8 file downloaded');
  HW.setHardwareOverride('rtx4090'); const pp = planFiles({ downloadId: rm.downloadId }, MD).files.map((f) => f.file);
  assert.ok(pp.includes('qwen_image_fp8_e4m3fn.safetensors') && !pp.includes('qwen-image-Q4_K_M.gguf'), 'NVIDIA: the graph files, no GGUF');
  ok('downloads: a Mac fetches only its GGUF + 16-bit files, an NVIDIA PC only the graph\'s own');

  // ---- 5. the GGUF loader ----
  process.env.OPENHIGGSFIELD_ENFORCE_WEIGHTS = '1';
  HW.setHardwareOverride('mac64'); HW.setHardwareOverride({ ...HW.currentHardware(), comfy: { reachable: true, version: '0.43.2', cloud: false, ggufNode: false } } as any);
  const gate = R.weightsGate(ci, 'comfy-qwen-image', { types: ['generate'] });
  assert.equal(gate?.code, 'nodes_missing'); assert.ok(gate!.missingNodes!.includes('UnetLoaderGGUF'));
  delete process.env.OPENHIGGSFIELD_ENFORCE_WEIGHTS;
  ok('GGUF loader: missing on the connected ComfyUI → nodes_missing (UnetLoaderGGUF), not a failed run');
} finally { HW.setHardwareOverride(null); fs.rmSync(D, { recursive: true, force: true }); }
