// Weights gate safety net (in-process, temp dirs, no network): files a workflow's core loader nodes name count as needed even when the
// manifest has no row for them (MOSS-Image had none, so it listed as ready and ComfyUI refused the prompt). Folder aliases count
// (clip/ for text_encoders, unet/ for diffusion_models). Run: tsx test/weights-loaders.test.ts
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'wlu-'));
const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'wlu-models-a-'));
const full = fs.mkdtempSync(path.join(os.tmpdir(), 'wlu-models-b-'));
// full size (sparse files, nothing written): since 2026-10-25 the manifest knows these sizes, and a short file counts as still downloading
for (const [dir, file, bytes] of [['diffusion_models', 'moss_image_sft_int8_convrot.safetensors', 5413698958], ['clip', 'qwen3.5_9b_w4a8_gptq.safetensors', 7343591088], ['vae', 'flux2-vae_small.safetensors', 249521340]] as const) {
  fs.mkdirSync(path.join(full, dir), { recursive: true }); fs.writeFileSync(path.join(full, dir, file), ''); fs.truncateSync(path.join(full, dir, file), bytes);
}
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'comfy', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0', OPENHIGGSFIELD_COMFY_MODELS_DIR: empty });
delete process.env.COMFY_BASE_URL;
const { getTool } = await import('../src/tools/registry.js');
const R0 = await import('../src/hardware/requirements.js'); const { currentHardware } = await import('../src/hardware.js');
// hermetic disk: the gate checks free space before 'weights_missing' (13 GB of MOSS files > a CI runner's free disk gave not_enough_disk)
const hw = () => { const h = currentHardware(); return { ...h, disk: { ...h.disk, freeBytes: 1e12 } }; };
const R = { weightsGate: (t: any, p: string, i: any) => R0.weightsGate(t, p, i, hw()) };
const tool = getTool('create-image')!;
const inp = { types: ['generate'] };

let g = R.weightsGate(tool, 'comfy-moss-image', inp);
assert.ok(g, 'MOSS-Image is gated when its files are not in the models folder');
assert.equal(g!.code, 'weights_missing');
assert.ok(g!.missingFiles.some((f) => f.file === 'qwen3.5_9b_w4a8_gptq.safetensors' && f.folder === 'text_encoders'), 'the text encoder is listed');
// 2026-10-25: MOSS-Image now has manifest rows (Comfy-Org/MOSS-Image, sizes from HEAD), so its files are a one-click download
assert.equal(g!.downloadable, true, 'every file has a known URL'); assert.ok(g!.missingFiles.every((f) => f.url && f.bytes), 'URL and size on each file');

process.env.OPENHIGGSFIELD_COMFY_MODELS_DIR = full;
g = R.weightsGate(tool, 'comfy-moss-image', inp);
assert.equal(g, null, 'with the files present (text encoder under the clip/ alias) nothing is missing');
// custom nodes: a workflow node class the local ComfyUI doesn't have gates the route (nodes_missing); unknown list = no gate
const N = await import('../src/comfyNodes.js');
const all = N.workflowNodeClasses('create-image-moss-image-api.json');
assert.ok(all.includes('UNETLoader'));
N.setComfyNodes(all.filter((n) => n !== 'UNETLoader'));
g = R.weightsGate(tool, 'comfy-moss-image', inp);
assert.equal(g?.code, 'nodes_missing'); assert.deepEqual(g?.missingNodes, ['UNETLoader']); assert.match(g!.message, /UNETLoader/);
N.setComfyNodes(all); assert.equal(R.weightsGate(tool, 'comfy-moss-image', inp), null, 'all nodes present');
N.setComfyNodes(null); assert.equal(R.weightsGate(tool, 'comfy-moss-image', inp), null, 'unknown node list never blocks');
assert.ok(N.workflowNodeClasses('plugins/cutout/workflow.json').includes('LoadRembgByBiRefNetModel'), 'plugin workflows are read from the repo root');
console.log('weights-loaders.test: all passed');
