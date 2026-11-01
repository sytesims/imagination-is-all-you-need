// Qwen Image 2.1 edit with two images (image grid finding 4, 2026-10-22): the official template image_qwen_image_2_1_image_edit has two
// LoadImage inputs (470 → TextEncodeQwenImage21 images.image_1, 475 → images.image_2).
// Covers: one image (2nd input dropped), two images (both in the right nodes, prompt tags <image1>/<image2>), the prompt enhancer
// pruned (template default off), Face Swap / Person Swap listing and caps (2 images), and the template's sampler settings kept.
// Run: npx tsx test/qwen21-edit.test.ts   (no server, no network)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.OPENHIGGSFIELD_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qwen21-edit-')); process.env.OPENHIGGSFIELD_BACKEND = 'mock';
const P = await import('../src/comfy/plans.ts');
const { IMAGE_CAPS } = await import('../src/shared/imageCaps.ts');
const { TWO_IMAGE_MODELS, supportsFor, workflowFor, workflowLine } = await import('../src/shared/imageFeatures.ts');
const ok = (m: string) => console.log('ok ' + m);
const T = '/data/target.png', FACE = '/data/face.png';
const plan = (toolId: string, input: Record<string, unknown>) => P.buildPlan({ id: 'q21', toolId, provider: 'comfy-qwen21', input: { baseTool: 'create-image', mode: 'edit', seed: 7, ...input } } as any) as any;
const enc = (g: any) => Object.entries<any>(g).find(([, n]) => n.class_type === 'TextEncodeQwenImage21')!;
const fileOf = (g: any, id: string) => g[id]?.inputs?.image?.__file;

// ---- one image: the template's 2nd input is dropped, nothing of the sample file ships ----
{
  const p = plan('create-image', { prompt: 'make it winter', imagePath: T, refPaths: [T] }); const g = p.passes[0].graph; const [, e] = enc(g);
  assert.equal(p.passes[0].workflow, 'create-image-qwen21-edit-api.json');
  assert.equal(fileOf(g, '470'), T); assert.ok(!g['475'], 'unused 2nd input dropped'); assert.deepEqual(e.inputs['images.image_1'], ['470', 0]); assert.ok(!('images.image_2' in e.inputs));
  assert.equal(e.inputs.prompt, 'make it winter', 'single image: prompt unchanged');
  assert.ok(!Object.values<any>(g).some((n) => n.class_type === 'LoadImage' && typeof n.inputs.image === 'string'), 'no template sample file names');
  ok('one image: 470 = the image, 475 dropped');
}
// ---- two images (Edit Image with a reference): 470 = image to edit, 475 = reference; prompt names the encoder's tags ----
{
  const p = plan('create-image', { prompt: 'Put the woman from image 2 in place of the person in image 1, same pose and lighting.', imagePath: T, refPaths: [T, FACE] });
  const g = p.passes[0].graph; const [, e] = enc(g);
  assert.equal(p.passes[0].workflow, 'create-image-qwen21-edit-api.json'); assert.equal(p.passes[0].expect.refs, 2);
  assert.equal(fileOf(g, '470'), T); assert.equal(fileOf(g, '475'), FACE);
  assert.deepEqual(e.inputs['images.image_1'], ['470', 0]); assert.deepEqual(e.inputs['images.image_2'], ['475', 0]); assert.deepEqual(e.inputs.vae, ['459:454', 0], 'references go in as VAE latents too');
  assert.equal(e.inputs.prompt, 'Put the woman from <image2> in place of the person in <image1>, same pose and lighting.');
  // the template's sampler, untouched: 25 steps, cfg 1, euler / simple; latent from the encoder (image 1's size)
  const ks = Object.values<any>(g).find((n) => n.class_type === 'KSampler'); assert.equal(ks.inputs.steps, 25); assert.equal(ks.inputs.cfg, 1); assert.equal(ks.inputs.sampler_name, 'euler'); assert.equal(ks.inputs.scheduler, 'simple'); assert.equal(ks.inputs.seed, 7);
  assert.equal(e.inputs.resolution, 1024);
  ok('two images: 470 = image to edit, 475 = reference → images.image_1 / image_2, prompt tagged');
}
// ---- the template's Qwen 3.5 prompt enhancer is off by default (switch false): its branch is pruned, so the 9B LLM never loads ----
{
  const g = plan('create-image', { prompt: 'swap them', imagePath: T, refPaths: [T, FACE] }).passes[0].graph;
  assert.ok(!Object.values<any>(g).some((n) => ['TextGenerate', 'BatchImagesNode'].includes(n.class_type)), 'enhancer branch pruned');
  ok('enhancer off (template default): TextGenerate / BatchImagesNode pruned');
}
// ---- Face Swap / Person Swap: the BFS LoRA graphs (comfy/bfsSwap.ts), as the creator's Qwen Image 2.1 guides say ----
{
  const { BFS_HEAD_PROMPT, BFS_BODY_PROMPT } = await import('../src/comfy/bfsSwap.ts');
  const COMPOSED = 'Replace the face of the person in image 1 with the face of the person in image 2; keep image 1\'s pose';
  const cases = [
    { tool: 'app-face-swap', wf: 'create-image-qwen21-faceswap-api.json', lora: 'bfs_head_v1.1_qwen_2.1.safetensors', prompt: BFS_HEAD_PROMPT, scaled: false },
    { tool: 'app-person-swap', wf: 'create-image-qwen21-personswap-api.json', lora: 'bfs_body_swap_v1.0_qwen_2.1.safetensors', prompt: BFS_BODY_PROMPT, scaled: true },
  ];
  for (const c of cases) {
    const p = plan(c.tool, { prompt: COMPOSED, appPrompt: '', imagePath: T, refPaths: [T, FACE] }); const g = p.passes[0].graph; const [, e] = enc(g);
    assert.equal(p.passes[0].workflow, c.wf, c.tool);
    // LoRA: one LoraLoaderModelOnly, strength 1.0, on the Qwen 2.1 UNET, feeding the cache → KSampler
    const loras = Object.entries<any>(g).filter(([, n]) => n.class_type === 'LoraLoaderModelOnly'); assert.equal(loras.length, 1, c.tool);
    const [lid, l] = loras[0]; assert.equal(l.inputs.lora_name, c.lora); assert.equal(l.inputs.strength_model, 1);
    assert.equal(g[l.inputs.model[0]].class_type, 'UNETLoader'); assert.equal(g[l.inputs.model[0]].inputs.unet_name, 'qwen_image_2.1_int8_convrot.safetensors');
    const ks = Object.values<any>(g).find((n) => n.class_type === 'KSampler'); const cache = g[ks.inputs.model[0]];
    assert.equal(cache.class_type, 'QwenImage21Cache'); assert.deepEqual(cache.inputs.model, [lid, 0]);
    assert.equal(ks.inputs.steps, 25); assert.equal(ks.inputs.cfg, 1); assert.equal(ks.inputs.sampler_name, 'euler'); assert.equal(ks.inputs.scheduler, 'simple'); assert.equal(ks.inputs.seed, 7);
    // image order: target → image_1, face/person → image_2 (Person Swap through the guide's scale nodes)
    assert.equal(fileOf(g, '470'), T); assert.equal(fileOf(g, '475'), FACE);
    const src = (k: string) => { const id = e.inputs[k][0]; return g[id].class_type === 'ImageScaleToTotalPixels' ? { mp: g[id].inputs.megapixels, from: g[id].inputs.image[0] } : { mp: null, from: id }; };
    assert.equal(src('images.image_1').from, '470'); assert.equal(src('images.image_2').from, '475');
    if (c.scaled) { assert.equal(src('images.image_1').mp, 2); assert.equal(src('images.image_2').mp, 0.59); assert.equal(e.inputs.resolution, 0); }
    else { assert.equal(src('images.image_1').mp, null); assert.equal(e.inputs.resolution, 1024); }
    assert.deepEqual(ks.inputs.latent_image && g[ks.inputs.latent_image[0]].inputs.on_false, [enc(g)[0], 2], 'latent from the encoder (scene size)');
    // prompt: the guide's template verbatim (our generic swap wording is not sent); no prompt enhancer in the graph
    assert.equal(e.inputs.prompt, c.prompt); assert.equal(p.passes[0].expect.lora, c.lora); assert.equal(p.passes[0].expect.loraStrength, 1);
    assert.ok(!Object.values<any>(g).some((n) => ['TextGenerate', 'BatchImagesNode'].includes(n.class_type)));
    // touch-ups follow the template, with the encoder's tags
    const t = plan(c.tool, { prompt: COMPOSED, appPrompt: 'keep the earrings from image 2', imagePath: T, refPaths: [T, FACE] }).passes[0].graph;
    assert.equal(enc(t)[1].inputs.prompt, `${c.prompt}. keep the earrings from <image2>`);
  }
  // the workflow files carry the same template (shown when someone opens the graph)
  for (const c of cases) assert.equal(enc(JSON.parse(fs.readFileSync(path.join('..', 'workflows', c.wf), 'utf8')))[1].inputs.prompt, c.prompt);
  ok('Face Swap / Person Swap: BFS head / body LoRA at 1.0, target → image_1, face/person → image_2, guide prompt (+ touch-ups); Person Swap 2 MP / 0.59 MP, resolution 0');
}
// ---- plain Edit Image (and Create Image) on Qwen 2.1: no LoRA anywhere ----
for (const [tool, input] of [['create-image', { prompt: 'Put image 2 in image 1', imagePath: T, refPaths: [T, FACE] }], ['create-image', { prompt: 'make it winter', imagePath: T, refPaths: [T] }]] as const) {
  const p = plan(tool, input as any); assert.equal(p.passes[0].workflow, 'create-image-qwen21-edit-api.json', tool);
  assert.ok(!Object.values<any>(p.passes[0].graph).some((n) => /Lora/.test(n.class_type)), `${tool}: no LoRA`); assert.ok(!('lora' in p.passes[0].expect));
}
ok('plain Edit Image on Qwen 2.1: official edit template, no LoRA');
// ---- Character Sheet with a photo (Oct 22): the same official edit template, one image, our composed prompt untouched, no LoRA ----
{
  const { characterSheetPrompt } = await import('../src/tools/apps.ts');
  const pr = characterSheetPrompt('', true);
  assert.match(pr, /^Character reference sheet of the person in image 1: one image split into three equal vertical panels.*Left panel: full-body front view.*Centre panel: full-body back view.*Right panel: tight close-up of the face and shoulders.*neutral grey seamless studio backdrop.*5600K.*Keep exactly one identical person in all three views.*accessories from image 1; feet visible in both full-body panels; no extra people, no text, no props, no cropping of the body/);
  const p = plan('app-character-sheet', { prompt: pr, appId: 'character-sheet', imagePath: T, refPaths: [T], aspect: '4:3', imageResolution: '1K' }); const g = p.passes[0].graph; const [eid, e] = enc(g);
  assert.equal(p.passes[0].workflow, 'create-image-qwen21-edit-api.json'); assert.equal(fileOf(g, '470'), T); assert.ok(!g['475']); assert.equal(e.inputs.prompt, pr.replaceAll('image 1', '<image1>') /* 2026-11-01: the photo is named, so Qwen 2.1 reads its own tag */);
  // landscape output: the template's own switch takes the EmptyLatentImage (4:3 at ~1 MP) instead of the photo-sized latent
  const ks = Object.values<any>(g).find((n) => n.class_type === 'KSampler'); const sw = g[ks.inputs.latent_image[0]];
  assert.equal(sw.class_type, 'ComfySwitchNode'); assert.equal(sw.inputs.switch, true); assert.deepEqual(sw.inputs.on_false, [eid, 2]);
  const lat = g[sw.inputs.on_true[0]]; assert.equal(lat.class_type, 'EmptyLatentImage'); assert.equal(lat.inputs.width, 1184); assert.equal(lat.inputs.height, 880);
  assert.equal(p.passes[0].expect.width, 1184); assert.equal(p.passes[0].expect.height, 880);
  // plain Edit Image keeps following the photo's size
  const ge = plan('create-image', { prompt: 'make it winter', imagePath: T, refPaths: [T], aspect: '4:3', imageResolution: '1K' }).passes[0].graph; const kse = Object.values<any>(ge).find((n) => n.class_type === 'KSampler');
  assert.equal(ge[kse.inputs.latent_image[0]].inputs.switch, false);
  assert.ok(!Object.values<any>(g).some((n) => /Lora/.test(n.class_type)));
  const s = supportsFor('character-sheet', 'comfy-qwen21')!; assert.equal(s.minImages, 0); assert.equal(s.maxImages, 1);
  assert.equal(supportsFor('character-sheet', 'comfy-zimage-turbo')!.maxImages, 0, 'a text-to-image-only model takes no photo');
  ok('Character Sheet + photo on Qwen 2.1: official edit template, one image, three-panel prompt as composed, 4:3 output via the template latent switch; photo optional (0–1), none on text-only models');
}
// ---- weights: the swap routes need the LoRA (Ready only when present); Edit Image does not ----
{
  const { weightsForWorkflows } = await import('../src/modelWeights.ts'); const { providerWorkflows, getProvider } = await import('../src/providers.ts'); const { getTool } = await import('../src/tools/registry.ts');
  const q = getProvider('comfy-qwen21')!;
  const files = (toolId: string) => weightsForWorkflows(providerWorkflows(getTool(toolId)! as any, q)).map((w) => `${w.folder}/${w.file}:${w.sizeBytes}`);
  assert.ok(files('app-face-swap').includes('loras/bfs_head_v1.1_qwen_2.1.safetensors:260096144'), files('app-face-swap').join());
  assert.ok(files('app-person-swap').includes('loras/bfs_body_swap_v1.0_qwen_2.1.safetensors:209753576'), files('app-person-swap').join());
  for (const t of ['app-face-swap', 'app-person-swap']) assert.ok(files(t).includes('diffusion_models/qwen_image_2.1_int8_convrot.safetensors:7256783064'));
  assert.ok(!files('create-image').some((f) => /bfs_/.test(f)), 'Create Image / Edit Image: no BFS LoRA');
  // Ready only when the LoRA is on disk: a scratch models folder with the Qwen 2.1 stack (sparse stand-in files), then + the LoRA
  const { requirementsFor, clearRequirementsCache } = await import('../src/hardware/requirements.ts');
  const md = fs.mkdtempSync(path.join(os.tmpdir(), 'qwen21-models-')); process.env.OPENHIGGSFIELD_COMFY_MODELS_DIR = md;
  // stand-ins are sparse files at each file's known size (no real disk use): since Render (2026-10-24) a file smaller than its known size is still downloading, never ready
  const sizes = new Map<string, number>(); for (const t of ['app-face-swap', 'app-person-swap']) { clearRequirementsCache(); for (const f of requirementsFor(getTool(t)! as any, 'comfy-qwen21', { types: ['edit'] })!.missingFiles!) sizes.set(f.file, f.bytes ?? 0); }
  const standIn = (p: string) => { fs.writeFileSync(p, ''); fs.truncateSync(p, sizes.get(path.basename(p)) ?? 0); };
  for (const [d, f] of [['diffusion_models', 'qwen_image_2.1_int8_convrot.safetensors'], ['text_encoders', 'qwen3vl_8b_int8_convrot.safetensors'], ['vae', 'qwen_image_2.1_vae_bf16.safetensors']]) { fs.mkdirSync(path.join(md, d), { recursive: true }); standIn(path.join(md, d, f)); }
  const miss = (t: string) => { clearRequirementsCache(); return requirementsFor(getTool(t)! as any, 'comfy-qwen21', { types: ['edit'] })!.missingFiles!.map((f) => f.file); };
  assert.deepEqual(miss('app-face-swap'), ['bfs_head_v1.1_qwen_2.1.safetensors']); assert.deepEqual(miss('app-person-swap'), ['bfs_body_swap_v1.0_qwen_2.1.safetensors', 'bfs_head_v1.1_qwen_2.1.safetensors'] /* 2026-11-01: the card also offers the head swap "Keep the photo's outfit" runs */);
  fs.mkdirSync(path.join(md, 'loras')); standIn(path.join(md, 'loras', 'bfs_head_v1.1_qwen_2.1.safetensors'));
  assert.deepEqual(miss('app-face-swap'), []); assert.deepEqual(miss('app-person-swap'), ['bfs_body_swap_v1.0_qwen_2.1.safetensors']);
  delete process.env.OPENHIGGSFIELD_COMFY_MODELS_DIR; clearRequirementsCache();
  ok('weights: Face Swap needs the BFS head LoRA (260,096,144 B), Person Swap the body LoRA (209,753,576 B) plus the head one for keep-outfit; Edit Image neither; missing until the file is on disk');
}
// ---- caps and listings ----
assert.equal(IMAGE_CAPS['comfy-qwen21'].supports.maxRefs, 2);
assert.ok(TWO_IMAGE_MODELS.includes('comfy-qwen21'));
for (const f of ['face-swap', 'person-swap']) { const s = supportsFor(f, 'comfy-qwen21')!; assert.equal(s.maxImages, 2); assert.equal(s.minImages, 2);
  const w = workflowFor(f, 'comfy-qwen21')!; assert.equal(w.source, 'community'); assert.equal(w.file, f === 'face-swap' ? 'create-image-qwen21-faceswap-api.json' : 'create-image-qwen21-personswap-api.json');
  assert.equal(w.url, 'https://huggingface.co/Alissonerdx/BFS-Best-Face-Swap'); assert.equal(workflowLine(w), 'Community · BFS Best Face Swap by Alissonerdx'); }
assert.equal(workflowFor('edit-image', 'comfy-qwen21')!.source, 'official');
assert.equal(supportsFor('edit-image', 'comfy-qwen21')!.maxImages, 2);
ok('caps: Images up to 2; Face Swap / Person Swap list Qwen Image 2.1, credited to Community · BFS Best Face Swap by Alissonerdx; Edit Image to the official template');
