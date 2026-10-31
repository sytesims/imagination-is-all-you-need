// Qwen Image 2.1 Turbo (TRANSPARENCY-PLAN 4l, 2026-10-22): the official Turbo templates image_qwen_image_2_1_turbo_image_edit (ONE image)
// and image_qwen_image_2_1_turbo_t2i, converted as-is (8 steps through ManualSigmas, CFGGuider cfg 1 for both: the edit template links it to the outer value 1).
// Covers: the edit plan (one image, template settings untouched, enhancer pruned, seed on RandomNoise), a second image never reaching the
// one-input graph, the text-to-image plan, caps and feature listings (Edit Image / Relight / Camera Angles, never the two-image swaps), the
// workflow credit, the catalogue entry, and the weight files (route Ready when they exist, the Turbo file missing otherwise).
// Run: npx tsx test/qwen21-turbo-edit.test.ts   (no server, no network)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.OPENHIGGSFIELD_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qwen21-turbo-')); process.env.OPENHIGGSFIELD_BACKEND = 'mock';
const MODELS = fs.mkdtempSync(path.join(os.tmpdir(), 'qwen21-turbo-models-')); process.env.OPENHIGGSFIELD_COMFY_MODELS_DIR = MODELS;
const REPO = path.resolve(import.meta.dirname, '../..');
const P = await import('../src/comfy/plans.ts');
const { IMAGE_CAPS } = await import('../src/shared/imageCaps.ts');
const { TWO_IMAGE_MODELS, EDIT_MODELS, supportsFor, workflowFor, workflowLine, modelNameOf } = await import('../src/shared/imageFeatures.ts');
const { CATALOGUE } = await import('../src/shared/modelRank.ts');
const { ENGINE_MODEL } = await import('../src/shared/modelIds.ts');
const ok = (m: string) => console.log('ok ' + m);
const T = '/data/target.png', REF = '/data/ref.png';
const plan = (input: Record<string, unknown>, toolId = 'create-image') => P.buildPlan({ id: 'q21t', toolId, provider: 'comfy-qwen21-turbo', input: { baseTool: 'create-image', seed: 7, ...input } } as any) as any;
const of = (g: any, cls: string) => Object.entries<any>(g).filter(([, n]) => n.class_type === cls);
const tpl = JSON.parse(fs.readFileSync(path.join(REPO, 'workflows/templates/image_qwen_image_2_1_turbo_image_edit.json'), 'utf8'));
const sub = tpl.definitions.subgraphs[0]; const tw = (type: string) => sub.nodes.find((n: any) => n.type === type).widgets_values;

// ---- edit: the official Turbo edit template, settings untouched ----
{
  const p = plan({ mode: 'edit', prompt: 'make it winter', imagePath: T, refPaths: [T] }); const g = p.passes[0].graph;
  assert.equal(p.passes[0].workflow, 'create-image-qwen21-turbo-edit-api.json');
  const [[, enc]] = of(g, 'TextEncodeQwenImage21');
  assert.equal(g['470'].inputs.image.__file, T); assert.deepEqual(enc.inputs['images.image_1'], ['470', 0]); assert.ok(!('images.image_2' in enc.inputs), 'one image input');
  assert.equal(enc.inputs.prompt, 'make it winter'); assert.equal(enc.inputs.resolution, tw('TextEncodeQwenImage21')[2]);
  assert.equal(of(g, 'UNETLoader')[0][1].inputs.unet_name, 'qwen_image_2.1_turbo_int8_convrot.safetensors');
  assert.equal(of(g, 'CLIPLoader')[0][1].inputs.clip_name, 'qwen3vl_8b_int8_convrot.safetensors'); assert.equal(of(g, 'VAELoader')[0][1].inputs.vae_name, 'qwen_image_2.1_vae_bf16.safetensors');
  // 2026-10-31: the inner widget says 8, but the template links cfg to the subgraph input, which the outer node sets to 1 (Turbo samples at cfg 1)
  const cfgIn = sub.inputs.findIndex((x: any) => x.name === 'cfg'); const outer = tpl.nodes.find((n: any) => n.id === 459).widgets_values;
  assert.equal(sub.inputs[cfgIn].name, 'cfg'); assert.equal(outer[cfgIn], 1, 'outer cfg value is 1'); assert.equal(of(g, 'CFGGuider')[0][1].inputs.cfg, 1, 'Turbo edit samples at cfg 1');
  const sig = of(g, 'ManualSigmas')[0][1].inputs.sigmas; assert.equal(sig, tw('ManualSigmas')[0]); assert.equal(sig.split(',').length - 1, 8, '8 steps');
  assert.equal(of(g, 'KSamplerSelect')[0][1].inputs.sampler_name, 'euler'); assert.equal(of(g, 'SamplerCustomAdvanced').length, 1); assert.equal(of(g, 'KSampler').length, 0);
  assert.equal(of(g, 'RandomNoise')[0][1].inputs.noise_seed, 7);
  assert.ok(!of(g, 'TextGenerate').length && !of(g, 'BatchImagesNode').length, 'prompt enhancer pruned (template default off)');
  assert.equal(of(g, 'LoadImage').length, 1);
  ok('edit: official Turbo template (8 sigmas, CFGGuider cfg 1 as the template links it, euler), one image, seed on RandomNoise, enhancer pruned');
}
// ---- a second image never reaches the one-input graph ----
{
  const g = plan({ mode: 'edit', prompt: 'swap them', imagePath: T, refPaths: [T, REF] }).passes[0].graph;
  assert.equal(of(g, 'LoadImage').length, 1); assert.equal(g['470'].inputs.image.__file, T);
  assert.ok(!JSON.stringify(g).includes(REF)); assert.equal(of(g, 'TextEncodeQwenImage21')[0][1].inputs.prompt, 'swap them', 'no <image1>/<image2> tags');
  ok('two images sent: only the first is used (no multiref graph)');
}
// ---- text to image: the official Turbo t2i template ----
{
  const p = plan({ prompt: 'a poster', imageResolution: '1K', aspect: '16:9' }); const g = p.passes[0].graph;
  assert.equal(p.passes[0].workflow, 'create-image-qwen21-turbo-t2i-api.json');
  assert.equal(of(g, 'CFGGuider')[0][1].inputs.cfg, 1); assert.equal(of(g, 'ManualSigmas')[0][1].inputs.sigmas.split(',').length - 1, 8);
  assert.equal(of(g, 'TextEncodeQwenImage21')[0][1].inputs.prompt, 'a poster'); assert.ok(!of(g, 'LoadImage').length);
  const [, lat] = of(g, 'EmptyLatentImage')[0]; assert.ok(typeof lat.inputs.width === 'number' && lat.inputs.width > lat.inputs.height, 'aspect applied');
  ok('text to image: official Turbo t2i template (8 sigmas, cfg 1), size from the aspect');
}
// ---- caps, listings, credit, catalogue ----
assert.equal(IMAGE_CAPS['comfy-qwen21-turbo'].supports.maxRefs, 1);
assert.ok(EDIT_MODELS.includes('comfy-qwen21-turbo')); assert.ok(!TWO_IMAGE_MODELS.includes('comfy-qwen21-turbo'));
for (const f of ['edit-image', 'relight', 'camera-angles']) { const s = supportsFor(f, 'comfy-qwen21-turbo'); assert.ok(s, f); assert.equal(s!.maxImages, 1, f);
  const w = workflowFor(f, 'comfy-qwen21-turbo')!; assert.equal(w.source, 'official'); assert.equal(w.file, 'create-image-qwen21-turbo-edit-api.json');
  assert.equal(workflowLine(w), 'Official Comfy template · Qwen Image 2.1 Turbo: Image Edit', f); }
for (const f of ['face-swap', 'person-swap']) assert.equal(supportsFor(f, 'comfy-qwen21-turbo'), null, `${f}: not listed (needs 2 images)`);
assert.equal(workflowLine(workflowFor('create-image', 'comfy-qwen21-turbo')), 'Official Comfy template · Qwen Image 2.1 Turbo: Text to Image');
assert.equal(modelNameOf('comfy-qwen21-turbo', 'edit'), 'Qwen Image 2.1 Turbo');
const c = CATALOGUE['qwen-image-2.1-turbo']; assert.equal(ENGINE_MODEL['comfy-qwen21-turbo'], 'qwen-image-2.1-turbo');
assert.equal(c.displayName, 'Qwen Image 2.1 Turbo'); assert.equal(c.home, 'gpu'); assert.equal(c.variantOf, 'qwen-image-2.1'); assert.equal(c.rank, CATALOGUE['qwen-image-2.1'].rank + 1);
ok('caps 1 image; Edit Image / Relight / Camera Angles list it, Face Swap / Person Swap do not; credit "Official Comfy template · Qwen Image 2.1 Turbo: Image Edit"; catalogue right after Qwen Image 2.1');
// ---- weights: Ready when the files exist ----
{
  await import('../src/tools/registry.js'); const { getTool } = await import('../src/tools/registry.js'); const R = await import('../src/hardware/requirements.js');
  const tool = getTool('create-image')!; const input = { types: ['edit'] };
  const req0 = R.requirementsFor(tool, 'comfy-qwen21-turbo', input)!;
  assert.deepEqual(req0.workflows, ['workflows/create-image-qwen21-turbo-edit-api.json']);
  const files = req0.missingFiles!.map((f) => `${f.folder}/${f.file}`).sort();
  assert.deepEqual(files, ['diffusion_models/qwen_image_2.1_turbo_int8_convrot.safetensors', 'text_encoders/qwen3.5_9b_qwen_image_2.1_pe_i2i.int8_convrot.safetensors',
    'text_encoders/qwen3vl_8b_int8_convrot.safetensors', 'vae/qwen_image_2.1_vae_bf16.safetensors']);
  assert.equal(req0.missingFiles!.find((f) => /turbo/.test(f.file))!.bytes, 7256787829);
  for (const m of req0.missingFiles!) { const f = path.join(MODELS, m.folder, m.file); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, ''); fs.truncateSync(f, m.bytes ?? 0); } // sparse stand-ins at the known size: a smaller file counts as still downloading (Render, 2026-10-24)
  await new Promise((r) => setTimeout(r, 10)); const req1 = R.requirementsFor(tool, 'comfy-qwen21-turbo', { ...input, n: '1' })!;
  assert.deepEqual(req1.missingFiles, [], 'all files on disk → nothing missing (Ready)');
  ok('weights: turbo int8 (7.26 GB) + qwen3vl 8B + pe_i2i + VAE; nothing missing once they exist (Ready)');
}
// ---- Relight recipe on the Qwen edit models: the new light named first, a clear change asked for, only identity / pose / clothes / framing locked ----
{
  const { APP_GALLERY, RELIGHT_CHANGE, RELIGHT_KEEP } = await import('../src/tools/apps.ts'); const a = APP_GALLERY.find((x) => x.id === 'relight')!;
  const v = { direction: 'left', lightQuality: 'hard', brightness: '80', color: '#FFB347', lightX: '', lightY: '' }; const has = () => true;
  for (const provider of ['comfy-qwen21-turbo', 'comfy-qwen21', 'comfy-qwen-image']) {
    const s = a.compose!(v, { prompt: 'deep orange sky', has, provider });
    assert.equal(s, `Relight the scene: bright golden light, light from the left side of the frame; hard direct light, crisp shadows; deep orange sky; ${RELIGHT_CHANGE}; ${RELIGHT_KEEP}`, provider);
    assert.ok(!/unchanged|exactly/.test(s), 'no lock on the light');
  }
  assert.match(a.compose!(v, { prompt: '', has, provider: 'api-nano-banana' }), /^Keep the same person.* Relight this photo\. The main light is bright golden, coming from the left side of the frame\./, 'Nano Banana: its own sentence wording');
  assert.match(a.compose!(v, { prompt: '', has, provider: 'comfy-klein4b' }), /^relight the scene; .*clearly visible across the whole image; keep the subject, pose and composition unchanged$/, 'FLUX-type: the old order plus a visible-change line');
  ok('Relight on Qwen edit models: light first, clear change of light/shadows/colour, identity + pose + clothes + framing kept');
}
