// FLUX.2 [klein] 4B weights (2026-10-22): both local graphs load the bf16 DISTILLED file (Mac-safe: MPS has no float8; the base file is slow)
// with the distilled template's settings (4 steps, cfg 1); the manifest lists that file for both and no longer the base / fp8 files;
// the fp8 file stays only as an NVIDIA-only lighter variant; the FLUX.2 VAE's licence note is listed. Run: npx tsx test/klein4b-weights.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
process.env.OPENHIGGSFIELD_DATA_DIR ||= fs.mkdtempSync(path.join(os.tmpdir(), 'klein4b-'));
const REPO = path.resolve(import.meta.dirname, '../..'); const W = (f: string) => JSON.parse(fs.readFileSync(path.join(REPO, 'workflows', f), 'utf8'));
for (const f of ['create-image-klein4b-t2i-api.json', 'create-image-klein4b-edit-api.json']) {
  const g = W(f); const of = (c: string) => Object.values<any>(g).filter((n) => n.class_type === c);
  assert.deepEqual(of('UNETLoader').map((n) => n.inputs.unet_name), ['flux-2-klein-4b.safetensors'], `${f}: distilled bf16 file`);
  assert.deepEqual(of('Flux2Scheduler').map((n) => n.inputs.steps), [4], `${f}: 4 steps`); assert.deepEqual(of('CFGGuider').map((n) => n.inputs.cfg), [1], `${f}: cfg 1`);
}
const man = JSON.parse(fs.readFileSync(path.join(REPO, 'readiness/manifest/models.json'), 'utf8'));
const m = man.models.find((x: any) => x.file === 'flux-2-klein-4b.safetensors'); assert.ok(m, 'manifest lists the distilled file'); assert.equal(m.size, 7751105712); assert.match(m.url, /flux-2-klein-4b\.safetensors$/);
assert.deepEqual([...m.workflows].sort(), ['workflows/create-image-klein4b-edit-api.json', 'workflows/create-image-klein4b-t2i-api.json']);
assert.ok(!man.models.some((x: any) => /flux-2-klein-(base-4b|4b-fp8)\.safetensors/.test(x.file)), 'no base / fp8 file in the download plan');
for (const k of ['workflows/create-image-klein4b-t2i-api.json', 'workflows/create-image-klein4b-edit-api.json']) assert.equal(man.workflows[k].mps, 'green', `${k}: Mac-safe`);
const { VARIANTS } = await import('../src/hardware/requirements.js');
const v = VARIANTS.find((x: any) => x.id === 'klein4b-fp8'); assert.ok(v); assert.equal(v!.replaces, 'flux-2-klein-4b.safetensors'); assert.match(String(v!.note), /NVIDIA only/);
await import('../src/tools/registry.js'); const { LICENSE_COMPONENTS } = await import('../src/licenses.js');
assert.ok(LICENSE_COMPONENTS['create-image'].some((c) => /flux2-vae/.test(c.model) && /FLUX\.1 \[dev\] Non-Commercial/.test(c.license)), 'the VAE licence note is listed');
console.log('ok klein 4B: distilled bf16 file (4 steps, cfg 1) in both graphs, manifest + Mac green, fp8 = NVIDIA-only variant, VAE licence note listed');
