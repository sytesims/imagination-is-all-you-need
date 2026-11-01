// Brand on Product Shot, Phone Photo and UGC Ad (2026-11-01, shared/brandKit BRAND_APPS / BRAND_SCENE / brandSceneWords): the kit's colours and
// mood go on the scene each app builds (backdrop and props, clothes and things around, set and wardrobe), never on the product or the person.
// Covers: the three composes with a kit (Product Shot keeps PRODUCT_KEEP before the brand words, Phone Photo uses the {detail} slot, not "who"),
// an empty typed prompt still gets the words, no kit = the prompt as before, applyBrandToFields adds no second phrase (submit + prompt peek),
// model / mode / price unchanged, and Recreate gives back the typed words untouched.
// Run: npx tsx test/brand-apps.test.ts   (in-process, temp data dir, mock backend, no network)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-apps-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock' });
const ok = (m: string) => console.log('ok ' + m);
const BK = await import('../src/shared/brandKit.ts');
const { setKv } = await import('../src/db.ts');
const { applyBrandToFields } = await import('../src/brandKits.ts');
const { getTool } = await import('../src/tools/registry.ts');
const { appQuoteParams } = await import('../src/tools/apps.ts');
const { PRODUCT_KEEP } = await import('../src/tools/appRows.ts');
const { promptPeek, greyPng } = await import('../src/routesPromptPeek.ts');
fs.writeFileSync(path.join(D, 'p1.png'), greyPng(512, 512)); // a real PNG the parser can read
const { formFromInput } = await import('../src/routesPrefill.ts');

// a made-up kit
const kit = { ...BK.BUILTIN_KIT, id: 'mossbun', name: 'Mossbun & Co.', mood: 'calm, cosy',
  colors: [{ hex: '#9CAF88', name: 'Moss', role: 'primary' }, { hex: '#D8C3A5', name: '', role: 'secondary' }, { hex: '#B5552B', name: 'Rust', role: 'accent' }] } as any;
setKv('brandKits', [kit]);

// ---- 1. the helper and the media rules ----
{
  assert.equal(BK.brandSceneWords(kit, 'backdrop, surfaces and props'), 'backdrop, surfaces and props in moss (sage green) and warm sand with rust accents, a calm, cosy mood');
  assert.equal(BK.brandSceneWords({ colors: [], mood: '' }, 'x'), '', 'an empty kit adds nothing');
  assert.equal(BK.brandSceneWords({ colors: [], mood: 'bold' }, 'x'), 'a bold mood');
  assert.equal(BK.brandSceneWords({ colors: [{ hex: '#B5552B', name: 'Rust', role: 'accent' }], mood: '' }, 'set'), 'set in rust', 'accents only');
  assert.equal(BK.brandMediaFor('app-product-shot'), 'image'); assert.equal(BK.brandMediaFor('app-phone-photo'), 'image'); assert.equal(BK.brandMediaFor('app-ugc-ad'), 'video');
  assert.equal(BK.brandMediaFor('app-ad-pack'), 'image'); assert.equal(BK.brandMediaFor('constructor'), null, 'no prototype keys'); assert.equal(BK.brandMediaFor('app-relight'), null);
  for (const id of ['app-product-shot', 'app-phone-photo', 'app-ugc-ad']) { assert.ok(BK.BRAND_OWN_WORDS.has(id)); assert.ok(BK.BRAND_SCENE[id]); assert.ok(!BK.BRAND_LOGO_APPS.has(id), `${id}: no logo promised`); }
  assert.ok(BK.BRAND_LOGO_APPS.has('app-ad-pack'));
  ok('brandSceneWords, media rules');
}

// ---- 2. the composes (the tools' own parseInput, as the submit runs them) ----
const ps: any = getTool('app-product-shot'), pp: any = getTool('app-phone-photo'), ugc: any = getTool('app-ugc-ad');
const run = async (t: any, fields: Record<string, string>, files: Record<string, string[]> = {}) => {
  const f = { rights: '1', ...fields }; const brand = applyBrandToFields(t.id, f); assert.ok(!brand || !('error' in brand));
  if (brand && !('error' in brand)) assert.equal(brand.applied, false, `${t.id}: no phrase appended`);
  const r = await t.parseInput(f, files); assert.ok(!('error' in r) || typeof r.error !== 'string', `${t.id}: ${r.error}`); return { r, f };
};
const scene = (id: string) => BK.brandSceneWords(kit, BK.BRAND_SCENE[id]);
{
  const typed = 'a glass bottle of hand cream';
  const a = await run(ps, { prompt: typed, scene: 'studio-white', provider: 'api-nano-banana' }, { image: ['p1.png'] });
  const b = await run(ps, { prompt: typed, scene: 'studio-white', provider: 'api-nano-banana', brandKit: 'mossbun' }, { image: ['p1.png'] });
  const pa = String(a.r.prompt), pb = String(b.r.prompt);
  assert.ok(pb.startsWith(pa), 'the brand words come after the scene'); assert.ok(pb.endsWith(scene('app-product-shot')), pb);
  assert.ok(pb.indexOf(PRODUCT_KEEP) >= 0 && pb.indexOf(PRODUCT_KEEP) < pb.indexOf('moss'), 'PRODUCT_KEEP leads, the product keeps its colours');
  assert.equal(b.f.prompt, typed, 'applyBrandToFields leaves the typed words alone');
  assert.equal(pb.split('moss').length, 2, 'brand words once');
  assert.equal(b.r.brandKitId, 'mossbun'); assert.equal(a.r.brandKitId, undefined);
  assert.equal(b.r.appPrompt, typed, 'the typed words kept as typed');
  for (const k of ['provider', 'types', 'mode', 'aspect', 'imageResolution', 'style']) assert.deepEqual(b.r[k], a.r[k], `Product Shot ${k} unchanged`);
  assert.ok(String(b.r.finalPrompt).includes(scene('app-product-shot')), `Enhance keeps the brand words: ${b.r.finalPrompt}`);
  // text only (no photo): still the brand words, no PRODUCT_KEEP
  const c = await run(ps, { prompt: typed, scene: 'studio-white', brandKit: 'mossbun' });
  assert.ok(!String(c.r.prompt).includes(PRODUCT_KEEP) && String(c.r.prompt).endsWith(scene('app-product-shot')));
  // photo only, nothing typed: still on-brand
  const e = await run(ps, { prompt: '', scene: 'studio-white', brandKit: 'mossbun' }, { image: ['p1.png'] });
  assert.ok(String(e.r.prompt).endsWith(scene('app-product-shot')), `empty typed prompt: ${e.r.prompt}`);
  ok(`Product Shot: ${pb}`);
}
{
  const who = 'a fictional woman in her thirties laughing in a café';
  for (const provider of ['api-gpt-image', 'api-nano-banana', 'comfy-klein4b']) {
    const a = await run(pp, { prompt: who, provider }); const b = await run(pp, { prompt: who, provider, brandKit: 'mossbun' });
    const pb = String(b.r.prompt); const words = scene('app-phone-photo');
    assert.ok(pb.includes(words), `${provider}: ${pb}`); assert.ok(!String(a.r.prompt).includes('moss'), 'no kit: unchanged');
    assert.ok(pb.indexOf(words) > pb.indexOf('hair'), `${provider}: in the detail slot (after the skin / hair words), not in "who"`);
    assert.ok(pb.indexOf(who.slice(1)) >= 0 && !pb.slice(0, pb.indexOf(who.slice(1)) + who.length).includes('moss'), 'who stays as typed');
    for (const k of ['provider', 'types', 'mode', 'aspect', 'style']) assert.deepEqual(b.r[k], a.r[k], `Phone Photo ${k} unchanged`);
  }
  const e = await run(pp, { prompt: '', brandKit: 'mossbun' }); assert.ok(String(e.r.prompt).includes(scene('app-phone-photo')), 'empty typed prompt');
  ok('Phone Photo: brand words in {detail} on GPT / Nano Banana / FLUX');
}
{
  const typed = 'a cosy wool scarf';
  const a = await run(ugc, { prompt: typed, presenter: 'home-sofa', hook: 'question' }); const b = await run(ugc, { prompt: typed, presenter: 'home-sofa', hook: 'question', brandKit: 'mossbun' });
  const pa = String(a.r.prompt), pb = String(b.r.prompt);
  assert.ok(pb.startsWith(pa) && pb.endsWith(scene('app-ugc-ad')), pb); assert.ok(pb.indexOf('moss') > pb.indexOf(typed), 'after the hook and the product');
  for (const k of ['provider', 'types', 'mode', 'aspect', 'duration']) assert.deepEqual(b.r[k], a.r[k], `UGC Ad ${k} unchanged`);
  const withPhoto = await run(ugc, { prompt: typed, brandKit: 'mossbun' }, { image: ['p1.png'] }); assert.ok(String(withPhoto.r.prompt).endsWith(scene('app-ugc-ad')));
  ok(`UGC Ad: ${pb}`);
}

// ---- 3. price unchanged (the quote's params ignore the kit), prompt peek shows the same single brand words ----
{
  for (const [t, f] of [[ps, { prompt: 'x', scene: 'studio-white' }], [pp, { prompt: 'x' }], [ugc, { prompt: 'x' }]] as const) {
    { const { brandKit: _k, ...q } = appQuoteParams(t, { ...f, brandKit: 'mossbun' }); assert.deepEqual(q, appQuoteParams(t, { ...f } as any), `${t.id}: quote params unchanged`); }
    const a: any = await promptPeek(t, { ...f } as any, {}); const b: any = await promptPeek(t, { ...f, brandKit: 'mossbun' } as any, {});
    assert.ok(a.ok && b.ok, `${t.id} peek: ${a.error ?? b.error}`); assert.equal(b.provider, a.provider); assert.equal(b.model, a.model);
    assert.ok(b.prompt.includes(scene(t.id)), `${t.id} peek: ${b.prompt}`); assert.equal(b.prompt.split(scene(t.id)).length, 2, `${t.id}: once`);
    assert.ok(!b.prompt.includes('colour palette of'), `${t.id}: no end-of-prompt phrase`); assert.ok(!a.prompt.includes('moss'));
  }
  ok('quote params, model and prompt peek unchanged except the scene words');
}

// ---- 4. Recreate: the typed words come back as typed, Brand back on ----
{
  const typed = 'a glass bottle of hand cream';
  const b = await run(ps, { prompt: typed, scene: 'studio-white', brandKit: 'mossbun' }, { image: ['p1.png'] });
  const brand = applyBrandToFields(ps.id, { brandKit: 'mossbun', prompt: typed }) as any;
  const { form }: any = formFromInput(ps, { id: 'j1', toolId: ps.id, provider: b.r.provider, input: { ...b.r, brand } } as any, { sameSeed: false });
  assert.equal(form.prompt, typed, `Recreate: ${form.prompt}`); assert.equal(form.brandKit, 'mossbun');
  ok('Recreate: typed words untouched, brand kept');
}

// ---- 5. unknown kit: still refused ----
{ const r: any = applyBrandToFields('app-product-shot', { brandKit: 'nope', prompt: 'x' }); assert.equal(r.issue.code, 'brand_kit_not_found'); ok('unknown kit refused'); }
fs.rmSync(D, { recursive: true, force: true });
