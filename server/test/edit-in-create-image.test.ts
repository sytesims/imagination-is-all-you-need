// Edit inside Create Image (image audit 01, 2026-10-22): the fixes for a first-time user's edit.
// Covers: 1 small photos accepted on image tools (the 854×480 floor stays a video rule); 2 "@image2" valid with two images;
// 3 the edit graph honours 1K / 2K and Auto (= the photo's shape) or a picked aspect, per model (imageCaps `edit`);
// 4 "@image2" becomes the Qwen 2.1 tag <image2> (no stray "@"), plain "image 2" for the other models; 6 removing an image renumbers mentions and keeps the removed one's visible as "@image?" (QA #10);
// 13 no "edit the image as described." prefix on edit prompts; Nano Banana 2 1K / 2K / 4K priced per size.
// Run: npx tsx test/edit-in-create-image.test.ts   (no server, no network; ffprobe for the parseInput part)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-in-ci-'));
process.env.OPENHIGGSFIELD_DATA_DIR = DATA; process.env.OPENHIGGSFIELD_BACKEND = 'mock';
const P = await import('../src/comfy/plans.ts');
const { IMAGE_CAPS, checkImageCaps, creditsPerImage } = await import('../src/shared/imageCaps.ts');
const { supportsFor, minPhotoPixelsFor } = await import('../src/shared/imageFeatures.ts');
const { validateMentions, removeImageMention } = await import('../src/shared/mentions.ts');
const ok = (m: string) => console.log('ok ' + m);
const T = '/data/target.png', R2 = '/data/ref.png';
const plan = (provider: string, input: Record<string, unknown>) => P.buildPlan({ id: 'e1', toolId: 'create-image', provider, input: { baseTool: 'create-image', mode: 'edit', seed: 3, prompt: 'make it winter', imagePath: T, refPaths: [T], ...input } } as any) as any;
const byClass = (g: any, re: RegExp) => Object.entries<any>(g).filter(([, n]) => re.test(n.class_type));

// ---- 1: the 854×480 floor is a video rule ----
{
  const FLOOR = 409_600;
  for (const t of ['create-image', 'image-upscale', 'app-relight', 'app-face-swap', 'app-person-swap', 'app-character-sheet']) assert.equal(minPhotoPixelsFor(t, FLOOR), 0, t);
  for (const t of ['h3-video', 'camera', 'photo-fx']) assert.equal(minPhotoPixelsFor(t, FLOOR), FLOOR, t);
  assert.ok(540 * 720 < FLOOR, 'the app\'s own 540×720 examples are under the video floor');
  ok('1: image tools take the 540×720 example photos; video start frames keep the 854×480 floor');
}
// ---- 2: two attached images → @image1 and @image2 are valid (the composer counts 1 + extra refs) ----
{
  assert.equal(validateMentions('put @image2 in @image1', { images: 2, videos: 0 }).ok, true);
  assert.equal(validateMentions('put @image2 in @image1', { images: 1, videos: 0 }).ok, false, 'one image: @image2 points nowhere');
  ok('2: "@image2" is valid with two images, refused with one');
}
// ---- 3: edit graph size ----
{
  // Qwen Image 2.1 (and Turbo): encoder resolution from 1K / 2K; Auto keeps the encoder's own latent (the photo's shape)
  for (const prov of ['comfy-qwen21', 'comfy-qwen21-turbo']) {
    const a = plan(prov, { imageResolution: '2K', aspect: '1:1', aspectAuto: true }); const g = a.passes[0].graph;
    const [[eid, enc]] = byClass(g, /^TextEncodeQwenImage21$/); assert.equal(enc.inputs.resolution, 2048, prov);
    const sw = Object.values<any>(g).find((n) => n.class_type === 'ComfySwitchNode' && Array.isArray(n.inputs.on_false) && n.inputs.on_false[0] === eid);
    assert.equal(sw.inputs.switch, false, `${prov}: Auto → latent from the encoder (the photo's shape)`); assert.equal(a.passes[0].expect.editSize.followsPhoto, true);
    const one = plan(prov, { imageResolution: '1K', aspect: '1:1', aspectAuto: true }).passes[0].graph; assert.equal(byClass(one, /^TextEncodeQwenImage21$/)[0][1].inputs.resolution, 1024);
    // a picked aspect: the template's EmptyLatentImage at that shape (multiples of 32), switch on
    const w = plan(prov, { imageResolution: '1K', aspect: '16:9', aspectAuto: false }); const gw = w.passes[0].graph;
    const [[eid2]] = byClass(gw, /^TextEncodeQwenImage21$/); const sw2 = Object.values<any>(gw).find((n) => n.class_type === 'ComfySwitchNode' && Array.isArray(n.inputs.on_false) && n.inputs.on_false[0] === eid2);
    assert.equal(sw2.inputs.switch, true); const lat = gw[sw2.inputs.on_true[0]]; assert.equal(lat.class_type, 'EmptyLatentImage');
    assert.deepEqual([lat.inputs.width, lat.inputs.height], [1024, 576], prov); assert.equal(lat.inputs.width % 32, 0); assert.equal(lat.inputs.height % 32, 0);
    assert.deepEqual([w.passes[0].expect.editSize.width, w.passes[0].expect.editSize.height], [1024, 576]);
    const v2 = plan(prov, { imageResolution: '2K', aspect: '9:16', aspectAuto: false }).passes[0].graph; const l2 = Object.values<any>(v2).find((n) => n.class_type === 'EmptyLatentImage');
    assert.deepEqual([l2.inputs.width, l2.inputs.height], [1152, 2048]);
  }
  // older jobs (no aspectAuto) and Face Swap keep the template as it was
  assert.equal(byClass(plan('comfy-qwen21', {}).passes[0].graph, /^TextEncodeQwenImage21$/)[0][1].inputs.resolution, 1024);
  // FLUX 3 Klein: ReferenceMultiLatent megapixels 1 / 4 / 16 (the first photo's shape); FLUX.2 klein 4B / dev: ImageScaleToTotalPixels 1 / 4 MP
  for (const [res, mp] of [['1K', 1], ['2K', 4], ['4K', 16]] as const) { const g = plan('comfy-flux3-klein', { imageResolution: res, aspect: '1:1', aspectAuto: true }).passes[0].graph;
    assert.equal(byClass(g, /^ReferenceMultiLatent$/)[0][1].inputs['resolution.megapixels'], mp, res); }
  for (const prov of ['comfy-klein4b', 'comfy-flux2dev']) { const g = plan(prov, { imageResolution: '2K', aspect: '1:1', aspectAuto: true }).passes[0].graph;
    for (const [, n] of byClass(g, /^ImageScaleToTotalPixels$/)) assert.equal(n.inputs.megapixels, 4, prov); assert.ok(byClass(g, /^ImageScaleToTotalPixels$/).length, prov); }
  // caps: what an edit honours per model (the composer shows only these; the quote and submit snap the rest, D5)
  assert.deepEqual(supportsFor('edit-image', 'comfy-qwen21')!.resolutions, ['1K', '2K']); assert.equal(supportsFor('edit-image', 'comfy-qwen21')!.aspects.length, 8);
  assert.deepEqual(supportsFor('edit-image', 'comfy-qwen-image')!.aspects, [], 'Qwen-Image-Edit-2509 follows the photo'); assert.deepEqual(supportsFor('edit-image', 'comfy-qwen-image')!.resolutions, ['1K']);
  assert.deepEqual(supportsFor('create-image', 'comfy-qwen-image')!.resolutions, ['1K', '2K'], 'text-to-image unchanged');
  // D5 (user, 2026-10-28): not refused; the photo's shape and the nearest size (1K), each with a note
  const snap = checkImageCaps('comfy-qwen-image', { aspect: '16:9', imageResolution: '2K', mode: 'edit', refs: 1 }); assert.equal(snap.ok, true);
  assert.equal(snap.ok && snap.imageResolution, '1K'); assert.equal(snap.ok && snap.notes?.length, 2, JSON.stringify(snap));
  assert.match(String(snap.ok && snap.notes?.[0]), /photo's shape/); assert.match(String(snap.ok && snap.notes?.[1]), /Made at 1K, the closest size/);
  assert.equal(checkImageCaps('comfy-qwen-image', { aspect: 'auto', mode: 'edit', refs: 1 }).ok, true);
  assert.equal(checkImageCaps('comfy-qwen-image', { aspect: '16:9', imageResolution: '2K', mode: 'generate' }).ok, true);
  assert.equal(checkImageCaps('comfy-qwen21', { aspect: '16:9', imageResolution: '2K', mode: 'edit', refs: 2 }).ok, true);
  for (const id of ['comfy-qwen21', 'comfy-qwen21-turbo', 'comfy-qwen-image', 'comfy-flux3-klein', 'comfy-klein4b', 'comfy-flux2dev']) assert.ok(IMAGE_CAPS[id].edit, `${id}: edit truth declared`);
  ok('3: Qwen 2.1 edit: resolution 1024 / 2048, Auto = the photo\'s shape, 16:9 → 1024×576 latent; Klein 1/4/16 MP; klein 4B / dev 4 MP at 2K; Qwen-Image-Edit follows the photo at 1K');
}
// ---- 4: @image mentions → the model's tag format ----
{
  assert.equal(P.qwen21ImageTags('put @image2 into @image1'), 'put <image2> into <image1>');
  assert.equal(P.qwen21ImageTags('the woman from image 2'), 'the woman from <image2>');
  const two = plan('comfy-qwen21', { prompt: 'put the jacket from @image2 on the person in @image1', refPaths: [T, R2] }).passes[0].graph;
  assert.equal(byClass(two, /^TextEncodeQwenImage21$/)[0][1].inputs.prompt, 'put the jacket from <image2> on the person in <image1>');
  const single = plan('comfy-qwen21', { prompt: 'make @image1 snowy' }).passes[0].graph;
  assert.equal(byClass(single, /^TextEncodeQwenImage21$/)[0][1].inputs.prompt, 'make <image1> snowy');
  ok('4: "@image2" → <image2> for Qwen Image 2.1 (one or two images), no stray "@"');
}
// ---- 6: removing an attached image ----
{
  /* QA #10: no word is deleted ("Put the person from into the forest of" was the bug); the removed photo's mention stays, marked */
  assert.equal(removeImageMention('put @image2 into @image1', 2), 'put @image? into @image1');
  assert.equal(removeImageMention('put @image3 next to @image2 in @image1', 2), 'put @image2 next to @image? in @image1');
  assert.equal(removeImageMention('@image1 with the hat from @image2', 1), '@image? with the hat from @image1');
  assert.equal(removeImageMention('the hat from @image2.', 2), 'the hat from @image?.');
  assert.equal(removeImageMention('no mentions here', 2), 'no mentions here');
  const v = validateMentions(removeImageMention('put @image2 into @image1', 2), { images: 1, videos: 0 });
  assert.equal(v.ok, false, 'the broken mention is flagged, not silently sent'); assert.equal(v.issues[0].code, 'stale'); assert.match(v.issues[0].message, /photo you removed/);
  ok('6: removing image 2 marks its mentions "@image?" (flagged); removing image 1 moves @image2 to @image1');
}
// ---- 13 + 4 (hosted): parseInput: no edit prefix; "@image2" → "image 2" for every model; aspectAuto recorded ----
{
  const { getTool } = await import('../src/tools/registry.ts'); const t = getTool('create-image')!;
  const src = path.resolve(import.meta.dirname, '..', '..', 'web', 'public', 'examples', 'ex-alley.jpg'); for (const f of ['a.jpg', 'b.jpg']) fs.copyFileSync(src, path.join(DATA, f));
  const inp: any = await t.parseInput({ types: '["edit"]', provider: 'comfy-qwen21', prompt: 'put the coat from @image2 on @image1', aspect: 'auto', imageResolution: '2K', enhance: '0' } as any, { image: ['a.jpg'], refs: ['b.jpg'] } as any);
  assert.ok(!('error' in inp), JSON.stringify(inp).slice(0, 300));
  assert.equal(inp.prompt, 'put the coat from @image2 on @image1', 'the prompt as typed is kept');
  assert.equal(inp.finalPrompt, 'put the coat from image 2 on image 1', 'no "edit the image as described." prefix; mentions as plain words');
  assert.equal(inp.aspectAuto, true); assert.equal(inp.imageResolution, '2K');
  const nb: any = await t.parseInput({ types: '["edit"]', provider: 'api-nano-banana', prompt: 'the hat from @image2', aspect: '16:9', imageResolution: '4K', enhance: '0' } as any, { image: ['a.jpg'], refs: ['b.jpg'] } as any);
  assert.equal(nb.finalPrompt, 'the hat from image 2'); assert.equal(nb.aspectAuto, false); assert.equal(nb.imageResolution, '4K');
  const gen: any = await t.parseInput({ types: '["generate"]', provider: 'api-nano-banana', prompt: 'a red fox', aspect: '16:9' } as any, {} as any);
  assert.equal(gen.finalPrompt, 'a red fox'); assert.ok(!('aspectAuto' in gen));
  ok('13: edit prompts carry no mode prefix (Details and the enhancer see what you wrote); hosted models get "image 2"');
}
// ---- 5: Nano Banana 2 takes 1K / 2K / 4K (Router imageConfig.imageSize), priced per size ----
{
  assert.deepEqual(IMAGE_CAPS['api-nano-banana'].resolutions, ['1K', '2K', '4K']);
  const [a, b, c] = (['1K', '2K', '4K'] as const).map((r) => creditsPerImage('api-nano-banana', null, r)!); assert.ok(a < b && b < c, `${a} ${b} ${c}`);
  ok(`5: Nano Banana 2 1K / 2K / 4K = ${a} / ${b} / ${c} credits per image`);
}
console.log('all edit-in-create-image checks passed');
