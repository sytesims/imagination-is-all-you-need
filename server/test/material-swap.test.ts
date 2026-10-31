// Material Swap (2026-10-31): object photo (image 1) + material photo (image 2) on the two-image edit route. Local Qwen Image 2.1 is the default
// (its official edit template's two inputs, 470 / 475); hosted edit models that take 2+ images get their own wording (tools/apps.ts materialSwapPrompt).
// Covers: the exact prompt per model family (fields filled, blank, long), the two pictures wired into the Qwen 2.1 edit graph with <image1>/<image2>,
// the missing-picture and too-long errors, the listing (feature, recipe, defaults) and the Canvas / menu registrations.
// Run: npx tsx test/material-swap.test.ts   (in-process, temp data dir, mock backend, no network, no ComfyUI)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.OPENHIGGSFIELD_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'material-swap-')); process.env.OPENHIGGSFIELD_BACKEND = 'mock';
const ok = (m: string) => console.log('ok ' + m);
const A = await import('../src/tools/apps.ts');
const { getTool } = await import('../src/tools/registry.ts');
const P = await import('../src/comfy/plans.ts');
const { MATERIAL_SWAP_MODELS, supportsFor, workflowFor, workflowLine } = await import('../src/shared/imageFeatures.ts');
const { IMAGE_DEFAULTS } = await import('../src/shared/imageDefaults.ts');
const { imageWorkflowsPayload, validateImageWorkflows } = await import('../src/shared/workflows.ts');

// ---- the exact prompt per family ----
const V = { object: 'sofa', fromMaterial: 'grey fabric' };
const QWEN = 'Give the sofa in image 1 the material and texture from image 2 instead of its grey fabric. Keep everything else in image 1 unchanged.';
assert.equal(A.materialSwapPrompt(V, '', 'comfy-qwen21'), QWEN);
assert.equal(A.materialSwapPrompt(V, '', 'api-qwen-image'), QWEN, 'Qwen Image 3.0 (hosted): the same Qwen wording');
assert.equal(A.materialSwapPrompt(V, '', 'api-nano-banana'), 'Using image 1 and image 2, change only the material of the sofa in image 1: give it the material and texture shown in image 2 instead of its grey fabric. Keep everything else in image 1 the same, preserving the original shape, lighting and composition.');
assert.equal(A.materialSwapPrompt(V, '', 'api-gpt-image'), 'Image 1: the photo with the sofa. Image 2: the material reference. Give the sofa in image 1 the material and texture from image 2 instead of its grey fabric. Change only its material; keep everything else the same.');
assert.equal(A.materialSwapPrompt(V, '', 'api-seedream'), "Replace the grey fabric of the sofa in image 1 with the material and texture from image 2. Keep the sofa's shape, the background, the lighting and the framing of image 1 unchanged.");
// blank fields: neutral words that still read well
assert.equal(A.materialSwapPrompt({ object: '', fromMaterial: '' }, '', 'comfy-qwen21'), 'Give the main object in image 1 the material and texture from image 2 instead of its current material. Keep everything else in image 1 unchanged.');
assert.equal(A.materialSwapPrompt({}, '', 'api-seedream'), "Replace the material of the main object in image 1 with the material and texture from image 2. Keep the main object's shape, the background, the lighting and the framing of image 1 unchanged.");
// articles and trailing dots are tidied; touch-ups go before the keep clause as their own sentence
assert.equal(A.materialSwapPrompt({ object: 'The  leather bag.', fromMaterial: 'a brown leather' }, 'keep the metal buckle', 'comfy-qwen21'),
  'Give the leather bag in image 1 the material and texture from image 2 instead of its brown leather. Keep the metal buckle. Keep everything else in image 1 unchanged.');
ok('prompt per family (Qwen, Nano Banana, GPT Image, Seedream); blank fields read "the main object" / "its current material"; touch-ups before the keep clause');

// ---- the tool: fields, files, errors ----
const t: any = getTool('app-material-swap'); assert.ok(t, 'app-material-swap is registered');
assert.deepEqual(t.providers.map((p: any) => p.id ?? p), MATERIAL_SWAP_MODELS);
assert.equal(MATERIAL_SWAP_MODELS[0], 'comfy-qwen21', 'local Qwen Image 2.1 first');
const run = (fields: Record<string, string>, files: Record<string, string[]>) => t.parseInput({ rights: '1', ...fields }, files);
// two real (tiny) PNGs in the data dir: the base parser probes them
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC', 'base64');
fs.mkdirSync(path.join(process.env.OPENHIGGSFIELD_DATA_DIR!, 'uploads'), { recursive: true });
const OBJ = 'uploads/obj.png', MAT = 'uploads/mat.png'; for (const f of [OBJ, MAT]) fs.writeFileSync(path.join(process.env.OPENHIGGSFIELD_DATA_DIR!, f), PNG);
const r = await run({ provider: 'comfy-qwen21', object: '  sofa ', fromMaterial: 'grey   fabric' }, { image: [OBJ], material: [MAT] });
assert.ok(!('error' in r), JSON.stringify(r)); assert.equal(r.prompt, QWEN, 'spaces collapsed, prompt composed'); assert.deepEqual(r.appFields, V);
assert.equal(r.refPaths.length, 2); assert.match(r.refPaths[0], /obj\.png$/); assert.match(r.refPaths[1], /mat\.png$/); assert.equal(r.imagePath, r.refPaths[0], 'image 1 = the object');
assert.equal(r.outputLabel, 'Material swap'); assert.equal(r.insetPath, r.refPaths[1]);
{ const e = await run({ provider: 'comfy-qwen21' }, { image: [OBJ] }); assert.equal(e.issues?.[0]?.field, 'material'); assert.equal(e.issues[0].code, 'required'); assert.equal(e.error, 'Add a material.'); }
{ const e = await run({ provider: 'comfy-qwen21' }, { material: [MAT] }); assert.equal(e.issues?.[0]?.field, 'image'); assert.equal(e.error, 'Add an object.'); }
{ const e = await run({ provider: 'comfy-qwen21', object: 'x'.repeat(A.MATERIAL_TEXT_MAX + 1) }, { image: [OBJ], material: [MAT] }); assert.equal(e.issues?.[0]?.field, 'object'); assert.equal(e.issues[0].code, 'too_long'); assert.equal(e.error, 'What the object is: up to 60 characters.'); }
{ const x = await run({ provider: 'comfy-qwen21', object: 'y'.repeat(A.MATERIAL_TEXT_MAX) }, { image: [OBJ], material: [MAT] }); assert.ok(!('error' in x)); assert.ok(x.prompt.includes(`the ${'y'.repeat(60)} in image 1`)); }
{ const b = await run({ provider: 'comfy-qwen21', object: '   ', fromMaterial: '' }, { image: [OBJ], material: [MAT] }); assert.ok(b.prompt.startsWith('Give the main object in image 1')); }
{ const n = await run({ provider: 'api-nano-banana', ...V }, { image: [OBJ], material: [MAT] }); assert.ok(!('error' in n), JSON.stringify(n)); assert.equal(n.prompt, A.materialSwapPrompt(V, '', 'api-nano-banana')); }
ok('tool: object → image 1, material → image 2; missing picture, too-long words and blank words handled');

// ---- the graph: both pictures in the Qwen 2.1 edit template, the prompt tagged <image1>/<image2> ----
{
  const p = P.buildPlan({ id: 'ms1', toolId: 'app-material-swap', provider: 'comfy-qwen21', input: { ...r, seed: 7 } } as any) as any;
  assert.equal(p.passes.length, 1); const pass = p.passes[0]; const g = pass.graph;
  assert.equal(pass.workflow, 'create-image-qwen21-edit-api.json'); assert.equal(pass.expect.refs, 2);
  assert.equal(g['470'].class_type, 'LoadImage'); assert.match(g['470'].inputs.image.__file, /obj\.png$/, '470 = the object');
  assert.equal(g['475'].class_type, 'LoadImage'); assert.match(g['475'].inputs.image.__file, /mat\.png$/, '475 = the material');
  const [, e] = Object.entries<any>(g).find(([, n]) => n.class_type === 'TextEncodeQwenImage21')!;
  assert.deepEqual(e.inputs['images.image_1'], ['470', 0]); assert.deepEqual(e.inputs['images.image_2'], ['475', 0]);
  assert.equal(e.inputs.prompt, 'Give the sofa in <image1> the material and texture from <image2> instead of its grey fabric. Keep everything else in <image1> unchanged.');
  assert.ok(!Object.values<any>(g).some((n) => /Lora|TextGenerate/.test(n.class_type)), 'no LoRA, no prompt enhancer');
  const ks = Object.values<any>(g).find((n) => n.class_type === 'KSampler'); assert.equal(ks.inputs.steps, 25); assert.equal(ks.inputs.cfg, 1); assert.equal(ks.inputs.seed, 7);
  ok('graph: official Qwen 2.1 edit template, 470 = object, 475 = material → images.image_1 / image_2, exact tagged prompt, template sampler');
}

// ---- listing: feature, credit, defaults, recipe ----
{
  const s = supportsFor('material-swap', 'comfy-qwen21')!; assert.equal(s.minImages, 2); assert.equal(s.maxImages, 2);
  for (const p of MATERIAL_SWAP_MODELS) assert.ok(supportsFor('material-swap', p)!.maxImages === 2, p);
  assert.equal(workflowLine(workflowFor('material-swap', 'comfy-qwen21')), 'Official Comfy template · Qwen Image 2.1: Image Edit');
  assert.equal(IMAGE_DEFAULTS['material-swap'].local, 'comfy-qwen21');
  assert.deepEqual(validateImageWorkflows(getTool as any), []);
  const w: any = imageWorkflowsPayload(getTool as any).workflows.find((x: any) => x.id === 'material-swap');
  assert.equal(w.status, 'ready'); assert.equal(w.generateLabel, 'Swap material'); assert.equal(w.needs, '2 photos'); assert.equal(w.runner.toolId, 'app-material-swap');
  assert.deepEqual(w.slots.map((x: any) => [x.label, x.sendsAs, x.required, x.missing]), [['Object', 'image', true, 'Add an object photo'], ['Material', 'material', true, 'Add a material photo']]);
  assert.deepEqual(w.controls.map((c: any) => [c.field, c.kind, c.optional, c.maxLength]), [['object', 'text', true, 60], ['fromMaterial', 'text', true, 60]]);
  assert.deepEqual(w.models.edit, MATERIAL_SWAP_MODELS);
  ok('listing: 2 photos, Object + Material slots, two optional 60-character fields, models in order (Qwen 2.1 first), official template credit');
}

// ---- memory: the need grows with the reference pictures; the default place follows it (2026-10-31) ----
{
  const HW = await import('../src/hardware.ts'); const R = await import('../src/hardware/requirements.ts');
  const { toolDefaults } = await import('../src/routing/defaults.ts'); const { setLocalAvailable } = await import('../src/routing/select.ts'); const PR = await import('../src/routing/prefs.ts');
  const ms = getTool('app-material-swap')!; const ci = getTool('create-image')!; const EDIT = 'create-image-qwen21-edit-api.json';
  assert.deepEqual(R.refSlots(EDIT), { encoder: 'TextEncodeQwenImage21', mp: [1, 1] }, 'the official edit graph: two slots at resolution 1024 = 1 MP each');
  assert.deepEqual(R.refSlots('create-image-qwen21-personswap-api.json')!.mp, [2, 0.59], 'resolution 0: the scale nodes in front of the encoder');
  assert.equal(R.refSlots('create-image-qwen21-t2i-api.json')?.mp.length ?? 0, 0, 'text to image: no reference term');
  const need = (prof: string, tool: any, input: Record<string, any>) => { HW.setHardwareOverride(prof); R.clearRequirementsCache(); return { r: R.requirementsFor(tool, 'comfy-qwen21', input)!, f: R.fitFor(tool, 'comfy-qwen21', input) }; };
  const base = R.wfVram(EDIT)!.recommendedVramGB;
  const two = need('mac64', ms, { types: ['edit'] }); // the listing's input has no files yet: Material Swap's two pictures are assumed
  assert.equal(R.refMemoryGB(ms, EDIT, { types: ['edit'] }), 64); assert.equal(two.r.recommendedVramGB, Math.round((base + 64) * 10) / 10, 'Mac: base + 2 × 32 GB (measured 70–79 GB)');
  assert.ok(two.r.recommendedVramGB >= 70 && two.r.recommendedVramGB <= 79, `in the measured range (${two.r.recommendedVramGB})`);
  assert.equal(two.f.verdict, 'too_heavy', `64 GB Mac: two pictures are too heavy (${two.f.reason})`);
  const one = need('mac64', ci, { mode: 'edit', types: ['edit'], imagePath: '/x.png' });
  assert.equal(one.r.recommendedVramGB, Math.round((base + 32) * 10) / 10); assert.notEqual(one.f.verdict, 'too_heavy', 'one 1024 picture still runs on the 64 GB Mac (measured)');
  assert.equal(need('mac64', ci, { mode: 'edit', types: ['edit'], imagePath: '/x.png', imageResolution: '2K' }).r.recommendedVramGB, Math.round((base + 128) * 10) / 10, 'Edit Image 2K: 4 MP reference');
  assert.notEqual(need('mac256', ms, { types: ['edit'] }).f.verdict, 'too_heavy', '256 GB Mac: two pictures fit');
  const nv = need('rtx4090', ms, { types: ['edit'], refPaths: ['/a.png', '/b.png'] }); assert.equal(nv.r.recommendedVramGB, Math.round((base + 4.4) * 10) / 10, 'NVIDIA: the prefix cache only (2.2 GB per MP)'); assert.equal(nv.f.verdict, 'fits');
  ok('memory: base + 32 GB per reference megapixel on a Mac (2.2 elsewhere), from the graph\'s own sizes; 64 GB Mac too heavy for two pictures, one still runs; 256 GB fits');
  // default place: Use local on → local where it fits, else the cloud default (local stays selectable with the too-heavy warning)
  PR.savePrefs({ ...PR.getPrefs(), global: { ...PR.getPrefs().global, useLocal: true } }); setLocalAvailable(true);
  for (const [prof, want] of [['mac256', 'comfy-qwen21'], ['mac64', 'api-qwen-image']] as const) {
    HW.setHardwareOverride(prof); R.clearRequirementsCache(); const d = toolDefaults(ms);
    assert.equal(d.defaultProvider, want, `${prof}: default ${d.defaultProvider} (${d.defaultFallback?.note ?? ''})`);
    if (prof === 'mac64') { const q = d.models.find((m) => m.id === 'comfy-qwen21')!; assert.equal(q.reasonCode, 'too_heavy'); assert.equal(q.fit?.verdict, 'too_heavy'); }
  }
  HW.setHardwareOverride(null); setLocalAvailable(null as any);
  ok('default place: 256 GB Mac → local Qwen Image 2.1 (free); 64 GB Mac → the cloud default, local listed as too heavy');
}

// ---- Qwen Image 2.1 Turbo edit samples at cfg 1 (the template links CFGGuider's cfg to the outer value 1) ----
{
  const g = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../workflows/create-image-qwen21-turbo-edit-api.json'), 'utf8'));
  assert.equal(g['459:507'].class_type, 'CFGGuider'); assert.equal(g['459:507'].inputs.cfg, 1);
  ok('Turbo edit: CFGGuider 459:507 cfg 1');
}
