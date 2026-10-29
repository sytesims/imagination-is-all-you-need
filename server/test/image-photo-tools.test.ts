// Photo tools in Create Image's bar (2026-10-23): Remove Background, Expand, Erase Object, Virtual Try-On on fal (tools/imageFalApps.ts).
// Pure, no server, no network: every fal request body only uses fields its published OpenAPI schema declares (field lists copied from
// fal.ai/api/openapi/queue/openapi.json?endpoint_id=<slug>, read 2026-10-23), required fields are there, enums hold; the images go inline;
// the prices are the published ones (credits = the quote = the charge, test/image-workflows.test.ts runs the e2e parity);
// the Expand geometry and the block rules (shared/imagePhotoTools.ts) the bar and the server share.
// Run: npx tsx test/image-photo-tools.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'photo-tools-')), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '' });
const ok = (m: string) => console.log('ok ' + m);
const PNG = path.join(ROOT, 'samples/sample-keyframe.png'); const FACE = path.join(ROOT, 'samples/sample-character.png');

const { FAL_PHOTO_BODIES, FAL_PHOTO_ROUTES, FAL_PHOTO_PRICES, PHOTO_TOOL_MODELS } = await import('../src/tools/imageFalApps.ts');
const { HOSTED_BY_ID } = await import('../src/shared/hostedPrices.ts');
await import('../src/routing/routePrices.ts');
const { priceOf } = await import('../src/shared/pricing.ts');
const { IMAGE_CAPS } = await import('../src/shared/imageCaps.ts');
const { featureById, modelNameOf, workflowFor, REMOVE_BG_MODELS, EXPAND_MODELS, ERASE_MODELS, TRYON_MODELS, GENERATE_MODELS, EDIT_MODELS, MASK_MODELS } = await import('../src/shared/imageFeatures.ts');
const { expandCanvas, expandBlock, photoBlock, eraseMaskBlock, EXPAND_ASPECTS, IDEOGRAM_REFRAME_SIZES, EXPAND_MAX_AREA } = await import('../src/shared/imagePhotoTools.ts');

// ---------------- 1. bodies vs schemas ----------------
type S = { keys: string[]; required: string[]; enums?: Record<string, string[]>; images: string[] };
const SCHEMA: Record<string, S> = {
  'fal-ai/bria/background/remove': { keys: ['prompt', 'sync_mode', 'image_url'], required: ['image_url'], images: ['image_url'] },
  'fal-ai/ideogram/remove-background': { keys: ['image_url', 'sync_mode'], required: ['image_url'], images: ['image_url'] },
  'fal-ai/bria/expand': { keys: ['negative_prompt', 'aspect_ratio', 'original_image_location', 'image_url', 'original_image_size', 'prompt', 'sync_mode', 'canvas_size', 'seed'], required: ['image_url', 'canvas_size'], images: ['image_url'] },
  'fal-ai/ideogram/v3/reframe': { keys: ['style_preset', 'rendering_speed', 'image_urls', 'seed', 'image_size', 'image_url', 'num_images', 'sync_mode', 'style', 'style_codes', 'color_palette'], required: ['image_url', 'image_size'],
    enums: { rendering_speed: ['TURBO', 'BALANCED', 'QUALITY'] }, images: ['image_url'] },
  'fal-ai/bria/eraser': { keys: ['image_url', 'mask_type', 'mask_url', 'sync_mode', 'preserve_alpha'], required: ['image_url', 'mask_url'], enums: { mask_type: ['manual', 'automatic'] }, images: ['image_url', 'mask_url'] },
  'fal-ai/object-removal/mask': { keys: ['model', 'mask_url', 'image_url', 'mask_expansion'], required: ['image_url', 'mask_url'], enums: { model: ['low_quality', 'medium_quality', 'high_quality', 'best_quality'] }, images: ['image_url', 'mask_url'] },
  'fal-ai/fashn/tryon/v1.6': { keys: ['seed', 'moderation_level', 'output_format', 'segmentation_free', 'garment_image', 'enable_safety_checker', 'garment_photo_type', 'num_samples', 'sync_mode', 'category', 'model_image', 'mode'],
    required: ['model_image', 'garment_image'], enums: { output_format: ['png', 'jpeg'], garment_photo_type: ['auto', 'model', 'flat-lay'], category: ['tops', 'bottoms', 'one-pieces', 'auto'], mode: ['performance', 'balanced', 'quality'] }, images: ['model_image', 'garment_image'] },
};
const check = (name: string, body: Record<string, any>, s: S) => {
  for (const k of Object.keys(body)) assert.ok(s.keys.includes(k), `${name}: field ${k} is not in the schema`);
  for (const k of s.required) assert.ok(body[k] != null, `${name}: required ${k} missing`);
  for (const [k, vals] of Object.entries(s.enums ?? {})) if (body[k] != null) assert.ok(vals.includes(body[k]), `${name}: ${k}=${body[k]} not in ${vals.join('/')}`);
  for (const k of s.images) assert.match(String(body[k]), /^data:image\/png;base64,.{1000}/, `${name}: ${k} goes inline`);
};
assert.deepEqual(FAL_PHOTO_ROUTES.map((r) => r.endpoint).sort(), Object.keys(SCHEMA).sort(), 'one route per schema');
const src = { width: 1280, height: 720 };
const job = (extra: Record<string, any>) => ({ id: 'j1', input: { types: ['edit'], imagePath: PNG, refPaths: [PNG], seed: 7, ...extra } });
for (const r of FAL_PHOTO_ROUTES) {
  const s = SCHEMA[r.endpoint]; const inputs: Record<string, any>[] =
    r.endpoint === 'fal-ai/bria/expand' ? EXPAND_ASPECTS.filter((a) => !expandBlock(src, a)).map((a) => ({ target: a, expand: expandCanvas(src, a), appPrompt: a === '1:1' ? 'a sunny beach, waves!' : '' }))
    : r.endpoint === 'fal-ai/ideogram/v3/reframe' ? EXPAND_ASPECTS.map((a) => ({ target: a }))
    : r.endpoint.includes('eraser') || r.endpoint.includes('object-removal') ? [{ types: ['inpaint'], maskPath: PNG }]
    : r.endpoint.includes('fashn') ? [{ refPaths: [PNG, FACE], category: 'tops', garmentPhoto: 'flat-lay' }, { refPaths: [PNG, FACE], category: 'auto', garmentPhoto: 'auto' }] : [{}];
  for (const x of inputs) { const b = await r.request!(job(x)); check(`${r.modelId} ${JSON.stringify(x).slice(0, 60)}`, b, s);
    if (r.endpoint === 'fal-ai/bria/expand') { const [w, h] = b.canvas_size as number[]; assert.ok(Number.isInteger(w) && Number.isInteger(h) && w * h <= EXPAND_MAX_AREA, 'canvas under 5000×5000');
      assert.ok(!('aspect_ratio' in b), 'aspect_ratio left out (it would override the size and place)'); if (x.target === '1:1') assert.equal(b.prompt, 'a sunny beach, waves'); else assert.ok(!('prompt' in b), 'empty prompt left out'); }
    if (r.endpoint === 'fal-ai/ideogram/v3/reframe') { assert.equal(b.rendering_speed, 'BALANCED', 'the speed we price'); assert.deepEqual(b.image_size, IDEOGRAM_REFRAME_SIZES[x.target]); }
    if (r.endpoint === 'fal-ai/object-removal/mask') { assert.equal(b.model, 'best_quality', 'the quality we price'); assert.ok(b.mask_expansion >= 0 && b.mask_expansion <= 50); }
    if (r.endpoint === 'fal-ai/fashn/tryon/v1.6') { assert.equal(b.num_samples, 1, 'one sample = one charge'); assert.notEqual(b.model_image, b.garment_image, 'person and garment are different images'); }
    if (r.endpoint === 'fal-ai/bria/background/remove') assert.ok(!('prompt' in b), 'no prompt: the $0.018 price, not $0.03'); }
  assert.equal(r.kind, 'fal'); assert.equal(r.priceRef, `fal:${r.endpoint}`); assert.ok(r.eachImage, 'one request per image');
}
for (const [w, sz] of Object.entries(IDEOGRAM_REFRAME_SIZES)) { const [a, b] = w.split(':').map(Number); assert.ok(Math.abs(sz.width / sz.height - a / b) < 0.03, `${w}: Ideogram size keeps the shape`); assert.ok(sz.width <= 14142 && sz.height <= 14142); }
ok(`${FAL_PHOTO_ROUTES.length} fal photo-tool routes follow their schemas (images inline, what we price is what we send)`);

// ---------------- 2. prices ----------------
const cr = (ref: string) => priceOf({ toolId: 'app-remove-bg', rates: {}, quality: '720p', provider: ref } as any).credits;
const want: Record<string, [number, number]> = { 'fal-ai/bria/background/remove': [0.018, 2], 'fal-ai/ideogram/remove-background': [0.01, 1], 'fal-ai/bria/expand': [0.04, 4], 'fal-ai/ideogram/v3/reframe': [0.06, 6],
  'fal-ai/bria/eraser': [0.04, 4], 'fal-ai/object-removal/mask': [0.024, 3 /* rounded up per request */], 'fal-ai/fashn/tryon/v1.6': [0.075, 8] };
for (const [slug, [usd, credits]] of Object.entries(want)) { const p = HOSTED_BY_ID[`fal:${slug}`]; assert.ok(p, slug); assert.equal(p.usd, usd, `${slug}: published $${usd}`); assert.equal(p.estimated, false);
  assert.equal(p.sourceUrl, `https://fal.ai/models/${slug}`); assert.equal(cr(`fal:${slug}`), credits, `${slug}: ${credits} credits`); }
assert.equal(FAL_PHOTO_PRICES.length, 7);
ok('published prices: Bria RMBG 2.0 $0.018, Ideogram Remove Background $0.01, Bria Expand $0.04, Ideogram 3.0 Reframe $0.06 (BALANCED), Bria Eraser $0.04, fal Object Removal $0.024 (best), FASHN v1.6 $0.075');

// ---------------- 3. features, names, credits ----------------
assert.deepEqual([REMOVE_BG_MODELS, EXPAND_MODELS, ERASE_MODELS, TRYON_MODELS], Object.values(PHOTO_TOOL_MODELS).map((x) => [...x]));
for (const [f, ms] of [['remove-bg', REMOVE_BG_MODELS], ['expand', EXPAND_MODELS], ['erase', ERASE_MODELS], ['try-on', TRYON_MODELS]] as const) {
  assert.deepEqual(featureById(f)!.providers, ms); assert.equal(featureById(f)!.toolId, `app-${f}`); assert.ok(featureById(f)!.inMenu, `${f} in the Image menu`);
  for (const p of ms) { assert.ok(IMAGE_CAPS[p], `${p}: caps`); assert.ok(modelNameOf(p, featureById(f)!.mode), `${p}: a real model name`); const w = workflowFor(f, p)!; assert.ok(w?.url?.startsWith('https://'), `${p}: credit link`);
    assert.ok(!GENERATE_MODELS.includes(p) && !EDIT_MODELS.includes(p) && !MASK_MODELS.includes(p), `${p}: not a Create Image / Brush Edit model`); }
}
assert.equal(workflowFor('remove-bg', 'fal-bria-rmbg')!.source, 'official'); assert.equal(workflowFor('expand', 'fal-bria-expand')!.source, 'official'); assert.equal(workflowFor('erase', 'fal-bria-eraser')!.source, 'official');
assert.equal(workflowFor('try-on', 'fal-fashn-tryon')!.source, 'ours'); assert.equal(IMAGE_CAPS['fal-fashn-tryon'].supports.maxRefs, 2, 'person + garment');
ok('four features, each model with its real name, caps and a linked credit (Bria: official Comfy partner templates; the rest: our fal request)');

// ---------------- 4. shared rules (bar = server) ----------------
assert.deepEqual(expandCanvas(src, '9:16'), { canvas: [1280, 2276], original: [1280, 720], location: [0, 778], scale: 1 });
assert.deepEqual(expandCanvas(src, '1:1').canvas, [1280, 1280]);
{ const big = expandCanvas({ width: 6000, height: 4000 }, '9:16'); assert.ok(big.canvas[0] * big.canvas[1] <= EXPAND_MAX_AREA && big.scale < 1, 'a large photo is scaled to fit Bria\'s canvas limit');
  assert.ok(Math.abs(big.canvas[0] / big.canvas[1] - 9 / 16) < 0.01 && Math.abs(big.original[0] / big.original[1] - 1.5) < 0.01, 'shapes kept when scaled'); }
assert.equal(expandBlock(src, '16:9')?.code, 'same_aspect'); assert.match(expandBlock(src, '16:9')!.message, /already 16:9/);
assert.equal(expandBlock({ width: 2400, height: 360 }, '9:16')?.code, 'too_far'); assert.equal(expandBlock(src, '9:16'), null); assert.equal(expandBlock(src, '21:9')?.code, 'invalid_aspect');
assert.equal(photoBlock({ width: 9000, height: 1000 })?.code, 'photo_too_large'); assert.equal(photoBlock({ width: 8192, height: 8192 }), null); assert.equal(photoBlock(null), null);
assert.equal(eraseMaskBlock(0.99)?.code, 'mask_too_large'); assert.equal(eraseMaskBlock(0.001), null); assert.equal(eraseMaskBlock(undefined), null);
ok('Expand canvas (centred, under 25 MP), same / too-far shapes, photos past 8192 px, whole-photo erase masks');
console.log('PASS image-photo-tools');
