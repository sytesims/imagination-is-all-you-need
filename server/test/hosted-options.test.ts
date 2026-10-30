// Hosted image model options (2026-10-24): the documented fields we now offer, each checked against the local docs.comfy.org copy
// (development/comfy-router/models/<page>/code.md "Schema → Input", development/comfy-router/pricing.md, tutorials/partner-nodes/pricing.md):
// 1. Krea 3: 1K / 2K × thinking fast / high / ultra (tiers low / med / high, "Fast / Think more / Think most"); ultra is 2K only; the body sends
//    thinking_mode; each cell's quote is the Router price rounded up (quote = charge); another model's tier isn't carried over on a switch.
// 2. FLUX 3 Image: 0.75K (768sq) and 1.5K (1.5k) next to 1K / 2K / 4K, priced 12.37 / 21.12; the BFL route (1k / 2k / 4k) refuses them.
// 3. Luma UNI-1 / Max: Look auto | manga → style.  4. Runway Gen-4 Image: up to 3 photos as referenceImages[].uri data URIs, same price.
// 5. Recraft V4 / V4.1 / V4.1 Pro: Style controls → controls.artistic_level / no_text / background_color.rgb / colors[].rgb.
// 6. FLUX.2 [pro] / [max]: prompt_upsampling follows the switch, on by default (the docs default).
// Every option goes through the Create Image tool's parseInput (the job endpoint's checks) and then the Router body.
// Run: npx tsx test/hosted-options.test.ts   (pure, no server, no keys, no network)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'hostopt-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'env'), OPENHIGGSFIELD_BACKEND: 'mock', COMFY_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '',
  OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', OPENHIGGSFIELD_BFL_API_KEY: '' });
const ok = (m: string) => console.log('ok ' + m);
fs.copyFileSync(path.join(ROOT, 'samples/sample-keyframe.png'), path.join(D, 'ref1.png'));
for (const k of [2, 3, 4]) fs.copyFileSync(path.join(D, 'ref1.png'), path.join(D, `ref${k}.png`));

const { IMAGE_CAPS, checkImageCaps, creditsPerImage, priceMatrix } = await import('../src/shared/imageCaps.ts');
const { ROUTER_MODELS, kreaThinking, FLUX3_RES } = await import('../src/routing/routerModels.ts');
const { readModelOptions } = await import('../src/shared/imageOptions.ts');
const { routesFor } = await import('../src/routing/routes.ts');
const { priceOf } = await import('../src/shared/pricing.ts');
const { getTool } = await import('../src/tools/registry.ts');
const { settingsOnSwitch } = await import('../src/shared/imageSnap.ts');
const tool = getTool('create-image')!;
/** Comfy credits (docs) → our credits per image: $ = comfy / 211, 1 credit = $0.01, rounded up (hostedPrices.ts usdToCredits). */
const cr = (comfy: number) => Math.ceil(Math.round((Math.round((comfy / 211) * 1e5) / 1e5) * 100 * 1e6) / 1e6);
const parse = async (f: Record<string, string>, files: Record<string, string[]> = {}) => (await tool.parseInput({ types: JSON.stringify([files.image ? 'edit' : 'generate']), prompt: 'a lighthouse at dusk', ...f }, files as any)) as any;
const body = (id: string, i: any) => ROUTER_MODELS[id].body(i, 0) as Promise<any>;
const quote = (id: string, i: any) => priceOf({ toolId: 'create-image', rates: {}, quality: '720p', provider: id, tier: i.tier ?? null, imageRes: i.imageResolution, aspect: i.aspect, refImages: 0 }).credits;

// ---- 1. Krea 3 ----
{ const c = IMAGE_CAPS['api-krea'];
  assert.deepEqual(c.resolutions, ['1K', '2K']); assert.deepEqual(c.qualityTiers, ['low', 'med', 'high']); assert.equal(c.defaultTier, 'low', 'starts on Fast (the docs default)');
  assert.deepEqual(Object.values(c.tierNames!).map((x) => x.label), ['Fast', 'Think more', 'Think most']);
  const DOCS: Record<string, number | null> = { 'low:1K': 9.0519, 'low:2K': 18.1038, 'med:1K': 15.0865, 'med:2K': 24.1384, 'high:1K': null, 'high:2K': 78.4498 }; // Router pricing, Per generation by resolution
  const M = priceMatrix('api-krea')!;
  for (const [k, comfy] of Object.entries(DOCS)) { const [t, r] = k.split(':') as any;
    assert.equal(M[t][r], comfy == null ? null : cr(comfy), `menu price ${k}`); assert.equal(creditsPerImage('api-krea', t, r), comfy == null ? null : cr(comfy));
    const cap = checkImageCaps('api-krea', { quality: t, imageResolution: r, aspect: '1:1' });
    if (comfy == null) { assert.ok(cap.ok, 'Think most at 1K is made at 2K (D5), not refused'); assert.equal((cap as any).imageResolution, '2K'); assert.match(String((cap as any).notes), /Think most needs 2K, so it was made at 2K/); continue; }
    assert.ok(cap.ok);
    const i = await parse({ provider: 'api-krea', quality: t, imageResolution: r, aspect: '16:9' }); assert.ok(!i.error, i.error);
    const b = await body('api-krea', i); assert.equal(b.thinking_mode, { low: 'fast', med: 'high', high: 'ultra' }[t as string]); assert.equal(b.resolution, r.toLowerCase());
    assert.equal(quote('api-krea', i), cr(comfy!), `quote = docs price ${k}`); }
  assert.deepEqual([cr(9.0519), cr(18.1038), cr(15.0865), cr(24.1384), cr(78.4498)], [5, 9, 8, 12, 38], 'the credits shown');
  assert.equal(kreaThinking({ quality: 'med' }), 'fast', 'an old job (no tier) ran fast, so a rerun stays fast');
  assert.equal(quote('api-krea', { imageResolution: '1K' }), cr(9.0519), 'and is priced fast');
  assert.match(ROUTER_MODELS['api-krea'].block!({ tier: 'high', imageResolution: '1K' })!, /Think most needs 2K/);
  await assert.rejects(body('api-krea', { tier: 'high', imageResolution: '1K' }), /needs 2K/);
  // a switch from GPT Image "high" to Krea doesn't land on Think most (78 credits): it starts on Fast
  const sw = settingsOnSwitch(c as any, { editing: false, n: 1, cur: { quality: 'high', imageResolution: '2K' } }); assert.equal(sw.quality, 'low'); assert.equal(sw.imageResolution, '2K');
  const sw2 = settingsOnSwitch(IMAGE_CAPS['api-gpt-image'] as any, { editing: false, n: 1, cur: { quality: 'high' } }); assert.equal(sw2.quality, 'high', 'plain quality models still keep the pick');
  ok('Krea 3: 1K / 2K × Fast / Think more / Think most, ultra 2K only, thinking_mode sent, quote = Router price (5 / 9, 8 / 12, – / 38)'); }

// ---- 2. FLUX 3 Image ----
{ const c = IMAGE_CAPS['api-flux3-image'];
  assert.deepEqual(c.resolutions, ['0.75K', '1K', '1.5K', '2K', '4K']); assert.equal(c.defaultResolution, '1K');
  const DOCS: Record<string, [number, string]> = { '0.75K': [12.37, '768sq'], '1K': [14.48, '1k'], '1.5K': [21.12, '1.5k'], '2K': [30.17, '2k'], '4K': [183.15, '4k'] }; // partner pricing + Router resolution enum
  for (const [r, [comfy, sent]] of Object.entries(DOCS)) {
    const i = await parse({ provider: 'api-flux3-image', imageResolution: r, aspect: '16:9' }); assert.ok(!i.error, i.error);
    assert.equal((await body('api-flux3-image', i)).resolution, sent, `${r} → ${sent}`); assert.equal(FLUX3_RES[r as '1K'], sent);
    assert.equal(quote('api-flux3-image', i), cr(comfy), `${r} quote`); }
  assert.deepEqual([cr(12.37), cr(21.12)], [6, 11]);
  const bfl = routesFor('api-flux3-image').find((r) => r.routeId === 'direct:bfl/flux-3-image')!;
  for (const r of ['0.75K', '1.5K']) assert.match(bfl.unavailableFor!({ imageResolution: r } as any)!, /runs on Comfy Router/);
  assert.equal(bfl.unavailableFor!({ imageResolution: '2K' } as any), null);
  const e = await parse({ provider: 'api-flux3-image', imageResolution: '1.5K', aspect: 'auto' }, { image: ['ref1.png'] }); assert.ok(!e.error, e.error);
  { const e4: any = checkImageCaps('api-flux3-image', { imageResolution: '4K', mode: 'edit' }); assert.equal(e4.imageResolution, '2K', 'edits still stop at 2K: 4K is made at 2K (D5)'); assert.match(String(e4.notes), /closest size/); }
  ok('FLUX 3 Image: 0.75K (768sq, 6 credits) and 1.5K (1.5k, 11 credits) sent and quoted; the BFL route leaves them to Comfy Router'); }

// ---- 3. Luma UNI-1 / Max ----
for (const id of ['api-luma-image', 'api-luma-uni1-max']) {
  assert.deepEqual(IMAGE_CAPS[id].options!.options.map((o) => o.key), ['style']);
  assert.equal((await body(id, await parse({ provider: id, aspect: '1:1' }))).style, 'auto', 'default auto');
  const m = await parse({ provider: id, aspect: '1:1', opt_style: 'manga' }); assert.deepEqual(m.options, { style: 'manga' });
  assert.equal((await body(id, m)).style, 'manga');
  assert.match((await parse({ provider: id, aspect: '1:1', opt_style: 'anime' })).error, /Look: pick one of Auto, Manga/);
  assert.equal(quote(id, m), quote(id, { imageResolution: '1K' }), 'same price');
}
assert.match((await parse({ provider: 'api-krea', aspect: '1:1', opt_style: 'manga' })).error, /no style option/, 'a model without the option refuses it');
ok('Luma UNI-1 / Max: Look Auto | Manga → style, same price; other models refuse it');
// 2026-10-25: Luma edit = type image_edit, the first photo in `source`, the others in image_ref (≤8: 9 photos in all); generate unchanged; edit priced at
// the Router's image-edit rate (9.1574 / 21.733 credits vs 8.5244 / 21.1, development/comfy-router/pricing "Image generation and then image edit").
{ const { priceMode } = await import('../src/shared/pricing.ts');
  for (const [id, gen, edit] of [['api-luma-image', 8.5244, 9.1574], ['api-luma-uni1-max', 21.1, 21.733]] as const) {
    const g = await body(id, await parse({ provider: id, aspect: '16:9' })); assert.equal(g.type, 'image'); assert.equal(g.source, undefined); assert.equal(g.image_ref, undefined, 'prompt only: no images');
    const one = await parse({ provider: id, aspect: '16:9' }, { image: ['ref1.png'] }); assert.ok(!one.error, one.error); const b1 = await body(id, one);
    assert.equal(b1.type, 'image_edit'); assert.equal(b1.source.media_type, 'image/png'); assert.ok(b1.source.data.length > 100); assert.equal(b1.image_ref, undefined, 'one photo: source only'); assert.equal(b1.aspect_ratio, '16:9');
    const four = await parse({ provider: id, aspect: 'auto' }, { image: ['ref1.png'], refs: ['ref2.png', 'ref3.png', 'ref4.png'] }); const b4 = await body(id, { ...four, aspectAuto: true });
    assert.equal(b4.type, 'image_edit'); assert.ok(b4.source.data); assert.equal(b4.image_ref.length, 3, 'the other photos go in image_ref'); assert.equal(b4.aspect_ratio, undefined, 'Match photo: aspect left out');
    assert.equal(ROUTER_MODELS[id].maxRefs, 9); const ten = { ...one, refPaths: Array.from({ length: 10 }, () => one.refPaths[0]) };
    assert.match(ROUTER_MODELS[id].block!(ten)!, /up to 9 reference images; you added 10/, '1 source + 8 refs at most');
    assert.equal(ROUTER_MODELS[id].block!({ ...one, refPaths: Array.from({ length: 9 }, () => one.refPaths[0]) }), null, '9 photos fine');
    assert.match(ROUTER_MODELS[id].block!({ ...one, types: ['inpaint'], maskPath: one.refPaths[0] })!, /doesn't take a mask/);
    const g0 = await body(id, { ...one, types: ['edit'], refPaths: [], imagePath: undefined }); assert.equal(g0.type, 'image', 'edit with no photo: a plain generation');
    assert.equal(priceMode(one), 'edit');
    const q = (mode: string) => priceOf({ toolId: 'create-image', rates: {}, quality: '720p', provider: id, imageRes: '1K', mode, refImages: 0 }).credits;
    assert.equal(q('generate'), cr(gen)); assert.equal(q('edit'), cr(edit), 'edit priced at the image-edit rate');
  }
  ok('Luma UNI-1 / Max edit: type image_edit, source + ≤8 image_ref, edit price; generate unchanged'); }

// ---- 4. Runway Gen-4 Image ----
{ const c = IMAGE_CAPS['api-runway-image']; assert.equal(c.supports.maxRefs, 3); assert.equal(ROUTER_MODELS['api-runway-image'].maxRefs, 3);
  const i = await parse({ provider: 'api-runway-image', aspect: '1920:1080' }, { image: ['ref1.png'], refs: ['ref2.png', 'ref3.png'] }); assert.ok(!i.error, i.error);
  const b = await body('api-runway-image', i); assert.equal(b.ratio, '1920:1080'); assert.equal(b.referenceImages.length, 3);
  for (const r of b.referenceImages) assert.match(r.uri, /^data:image\/png;base64,/, 'a data URI (the docs: HTTPS URL or data URI), so no public link is needed');
  assert.equal((await body('api-runway-image', await parse({ provider: 'api-runway-image', aspect: '1024:1024' }))).referenceImages, undefined, 'prompt only: none sent');
  const four = await parse({ provider: 'api-runway-image', aspect: '1920:1080' }, { image: ['ref1.png'], refs: ['ref2.png', 'ref3.png', 'ref4.png'] }); assert.match(four.error, /up to 3 images/);
  { const ra: any = checkImageCaps('api-runway-image', { mode: 'edit', aspect: 'auto' }); assert.ok(ra.ok && c.edit!.aspects.includes(ra.aspect), 'a ratio is required (no Auto): Auto picks a listed ratio'); }
  assert.equal(priceOf({ toolId: 'create-image', rates: {}, quality: '720p', provider: 'api-runway-image', imageRes: '1K', refImages: 3 }).credits, cr(24.1384), 'same price with photos (24.1384, no reference surcharge listed)');
  ok('Runway Gen-4 Image: up to 3 photos as data-URI referenceImages, ratio required, same price'); }

// ---- 5. Recraft V4 / V4.1 / V4.1 Pro ----
for (const id of ['api-recraft', 'api-recraft-41', 'api-recraft-41-pro']) {
  assert.equal((await body(id, await parse({ provider: id, aspect: '1:1' }))).controls, undefined, 'nothing picked: no controls');
  const i = await parse({ provider: id, aspect: '1:1', opt_artisticLevel: '4', opt_noText: '1', opt_background: '#ff6a00', opt_colors: '#112233,#AABBCC' }); assert.ok(!i.error, i.error);
  assert.deepEqual((await body(id, i)).controls, { artistic_level: 4, no_text: true, background_color: { rgb: [255, 106, 0] }, colors: [{ rgb: [17, 34, 51] }, { rgb: [170, 187, 204] }] });
  assert.deepEqual((await body(id, await parse({ provider: id, aspect: '1:1', opt_artisticLevel: '0' }))).controls, { artistic_level: 0 }, 'level 0 is a real pick');
  assert.equal(quote(id, i), quote(id, { imageResolution: IMAGE_CAPS[id].defaultResolution }), 'same price');
}
for (const [f, v, re] of [['opt_artisticLevel', '6', /0 to 5/], ['opt_background', 'orange', /colour like/], ['opt_colors', '#111111,#222222,#333333,#444444', /up to 3/], ['opt_noText', 'maybe', /on or off/]] as const)
  assert.match((await parse({ provider: 'api-recraft', aspect: '1:1', [f]: v })).error, re, `${f}=${v} refused`);
assert.equal(readModelOptions(IMAGE_CAPS['api-recraft'].options, { opt_noText: '0' }).ok, true);
ok('Recraft V4 / V4.1 / V4.1 Pro: artistic level, no text, background colour and up to 3 colours → controls, checked, same price');

// ---- 6. FLUX.2 [pro] / [max] ----
for (const id of ['api-flux2', 'api-flux2-max']) {
  assert.equal(IMAGE_CAPS[id].extras?.promptRewriteDefault, true);
  const on = await parse({ provider: id, aspect: '1:1' }); assert.equal(on.promptRewrite, true, 'default on (docs default true)');
  assert.equal((await body(id, on)).prompt_upsampling, true);
  const off = await parse({ provider: id, aspect: '1:1', promptRewrite: '0' }); assert.equal(off.promptRewrite, false);
  assert.equal((await body(id, off)).prompt_upsampling, false, 'off: the prompt goes as written');
  assert.equal(quote(id, off), quote(id, { ...on }), 'same price either way');
}
{ const w = await parse({ provider: 'api-wan-image', aspect: '1:1' }); assert.notEqual(w.promptRewrite, true, 'Wan / Qwen stay off unless asked');
  assert.match((await parse({ provider: 'api-krea', aspect: '1:1', promptRewrite: '1' })).error, /no prompt rewrite/); }
ok('FLUX.2 [pro] / [max]: prompt_upsampling on by default, off when the switch is off; Wan / Qwen unchanged');
fs.rmSync(D, { recursive: true, force: true });
