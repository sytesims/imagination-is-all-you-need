// Brand on Product Shot, Phone Photo and UGC Ad (2026-11-01, subtle: shared/brandKit BRAND_APPS / BRAND_ACCENTS / brandAccentWords / BRAND_LOGO_SPOT).
// Picking a brand puts its logo on the result (our code: adPackLogo.ts stampAdLogos, small, bottom right; video: the viewer's Add logo) and
// changes nothing in the prompt; "Use brand colours" (brandColours=1) adds only a few small accents in the palette, never the backdrop.
// Covers: default = prompt unchanged + the logo record; colours on = the accent words only (PRODUCT_KEEP first, Phone Photo in {detail} not
// "who", no backdrop / mood words); a kit with no logo = no logo record; the logo really composited, small; no double-add (submit + peek);
// model / mode / price unchanged; Recreate gives back the typed words, the kit and the colours switch.
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

// made-up kits: one with a logo (the built-in's file), one without
const kit = { ...BK.BUILTIN_KIT, builtIn: false, id: 'mossbun', name: 'Mossbun & Co.', mood: 'calm, cosy',
  colors: [{ hex: '#9CAF88', name: 'Moss', role: 'primary' }, { hex: '#D8C3A5', name: '', role: 'secondary' }, { hex: '#B5552B', name: 'Rust', role: 'accent' }] } as any;
const bare = { ...kit, id: 'bare', name: 'Bare Co.', logo: null, logos: { main: null, light: null, dark: null, icon: null } } as any;
setKv('brandKits', [kit, bare]);
const IDS = ['app-product-shot', 'app-phone-photo', 'app-ugc-ad'] as const;
const accents = (id: string) => BK.brandAccentWords(kit, BK.BRAND_ACCENTS[id]);

// ---- 1. the helper and the media rules ----
{
  assert.equal(accents('app-product-shot'), 'a few small props or accents in moss (sage green), warm sand and rust');
  assert.equal(accents('app-phone-photo'), 'one small item of clothing or an object in moss (sage green), warm sand and rust');
  assert.equal(accents('app-ugc-ad'), 'a few small set details in moss (sage green), warm sand and rust');
  assert.equal(BK.brandAccentWords({ colors: [] }, 'x in'), '', 'no colours: nothing');
  assert.equal(BK.brandAccentWords(BK.BUILTIN_KIT, 'x in').split(',').length + BK.brandAccentWords(BK.BUILTIN_KIT, 'x in').split(' and ').length - 1, 3, 'at most 3 colours');
  for (const id of IDS) { assert.ok(BK.BRAND_OWN_WORDS.has(id)); assert.ok(BK.brandAccentLead(id)); assert.ok(!BK.BRAND_AD_APPS.has(id)); assert.doesNotMatch(accents(id), /backdrop|background|mood|calm|cosy/); }
  assert.equal(BK.brandAccentLead('app-ad-pack'), ''); assert.equal(BK.brandAccentLead('create-image'), ''); assert.equal(BK.brandAccentLead('constructor'), '');
  assert.equal(BK.brandMediaFor('app-product-shot'), 'image'); assert.equal(BK.brandMediaFor('app-phone-photo'), 'image'); assert.equal(BK.brandMediaFor('app-ugc-ad'), 'video');
  assert.equal(BK.brandMediaFor('constructor'), null, 'no prototype keys'); assert.equal(BK.brandMediaFor('app-relight'), null);
  ok('brandAccentWords, media rules');
}

// ---- 2. the composes (the tools' own parseInput, as the submit runs them) ----
const ps: any = getTool('app-product-shot'), pp: any = getTool('app-phone-photo'), ugc: any = getTool('app-ugc-ad');
const run = async (t: any, fields: Record<string, string>, files: Record<string, string[]> = {}) => {
  const f = { rights: '1', ...fields }; const brand = applyBrandToFields(t.id, f); assert.ok(!brand || !('error' in brand));
  if (brand && !('error' in brand)) assert.equal(brand.applied, false, `${t.id}: no phrase appended`);
  const r = await t.parseInput(f, files); assert.ok(!('error' in r) || typeof r.error !== 'string', `${t.id}: ${r.error}`); return { r, f };
};
const same = (a: any, b: any, keys: string[], what: string) => { for (const k of keys) assert.deepEqual(b[k], a[k], `${what} ${k} unchanged`); };
{
  const typed = 'a glass bottle of hand cream'; const base = { prompt: typed, scene: 'studio-white', provider: 'api-nano-banana' }; const img = { image: ['p1.png'] };
  const a = await run(ps, base, img); const b = await run(ps, { ...base, brandKit: 'mossbun' }, img); const c = await run(ps, { ...base, brandKit: 'mossbun', brandColours: '1' }, img);
  assert.equal(b.r.prompt, a.r.prompt, 'Brand on, colours off: the prompt is unchanged'); assert.equal(b.r.finalPrompt, a.r.finalPrompt);
  assert.deepEqual(b.r.adLogo, { kit: 'mossbun', corner: 'br', size: 'S' }, 'the logo goes on the result, small, bottom right'); assert.equal(a.r.adLogo, undefined);
  const pc = String(c.r.prompt); assert.equal(pc, `${a.r.prompt}; ${accents('app-product-shot')}`, 'colours on: the accents last');
  assert.ok(pc.indexOf(PRODUCT_KEEP) < pc.indexOf('moss'), 'PRODUCT_KEEP leads'); assert.match(pc, /white studio backdrop/, 'the scene keeps its backdrop'); assert.doesNotMatch(pc.slice(pc.indexOf('moss') - 40), /backdrop in|mood/);
  assert.equal(c.r.brandColours, true); assert.equal(b.r.brandColours, undefined); assert.equal(c.f.prompt, typed, 'applyBrandToFields leaves the typed words alone');
  assert.ok(String(c.r.finalPrompt).includes(accents('app-product-shot')), `Enhance keeps the accent words: ${c.r.finalPrompt}`);
  for (const x of [b, c]) { same(a.r, x.r, ['provider', 'types', 'mode', 'aspect', 'imageResolution', 'style'], 'Product Shot'); assert.equal(x.r.appPrompt, typed); assert.equal(x.r.brandKitId, 'mossbun'); }
  const nl = await run(ps, { ...base, brandKit: 'bare' }, img); assert.equal(nl.r.adLogo, undefined, 'a kit with no logo: no logo record'); assert.equal(nl.r.prompt, a.r.prompt);
  const e = await run(ps, { prompt: '', scene: 'studio-white', brandKit: 'mossbun', brandColours: '1' }, img); assert.ok(String(e.r.prompt).endsWith(accents('app-product-shot')), `empty typed prompt: ${e.r.prompt}`);
  const t2 = await run(ps, { prompt: typed, brandKit: 'mossbun', brandColours: '1' }); assert.ok(!String(t2.r.prompt).includes(PRODUCT_KEEP) && String(t2.r.prompt).endsWith(accents('app-product-shot')), 'text only');
  const off = await run(ps, { ...base, brandColours: '1' }, img); assert.equal(off.r.prompt, a.r.prompt, 'the switch without a kit does nothing'); assert.equal(off.r.adLogo, undefined);
  ok(`Product Shot: ${pc}`);
}
{
  const who = 'a fictional woman in her thirties laughing in a café';
  for (const provider of ['api-gpt-image', 'api-nano-banana', 'comfy-klein4b']) {
    const a = await run(pp, { prompt: who, provider }); const b = await run(pp, { prompt: who, provider, brandKit: 'mossbun' }); const c = await run(pp, { prompt: who, provider, brandKit: 'mossbun', brandColours: '1' });
    assert.equal(b.r.prompt, a.r.prompt, `${provider}: colours off = unchanged`); assert.deepEqual(b.r.adLogo, { kit: 'mossbun', corner: 'br', size: 'S' });
    const pc = String(c.r.prompt); const w = accents('app-phone-photo');
    assert.ok(pc.includes(w), `${provider}: ${pc}`); assert.ok(pc.indexOf(w) > pc.indexOf('hair'), `${provider}: in the {detail} slot, not in "who"`);
    assert.ok(!pc.slice(0, pc.indexOf(who.slice(1)) + who.length).includes('moss'), 'who stays as typed'); assert.doesNotMatch(pc, /mood|cosy/);
    same(a.r, c.r, ['provider', 'types', 'mode', 'aspect', 'style'], 'Phone Photo');
  }
  const e = await run(pp, { prompt: '', brandKit: 'mossbun', brandColours: '1' }); assert.ok(String(e.r.prompt).includes(accents('app-phone-photo')), 'empty typed prompt');
  ok('Phone Photo: logo record; colours in {detail} on GPT / Nano Banana / FLUX');
}
{
  const typed = 'a cosy wool scarf'; const base = { prompt: typed, presenter: 'home-sofa', hook: 'question' };
  const a = await run(ugc, base); const b = await run(ugc, { ...base, brandKit: 'mossbun' }); const c = await run(ugc, { ...base, brandKit: 'mossbun', brandColours: '1' });
  assert.equal(b.r.prompt, a.r.prompt, 'colours off = unchanged'); assert.equal(b.r.adLogo, undefined, 'video: no baked logo (the viewer’s Add logo)'); assert.equal(b.r.brandKitId, 'mossbun');
  assert.equal(String(c.r.prompt), `${a.r.prompt}; ${accents('app-ugc-ad')}`);
  same(a.r, c.r, ['provider', 'types', 'mode', 'aspect', 'duration'], 'UGC Ad');
  ok(`UGC Ad: ${c.r.prompt}`);
}

// ---- 3. the logo really goes on, small, bottom right; the plain picture kept ----
{
  const { stampAdLogos } = await import('../src/adPackLogo.ts'); const { videoSize } = await import('../src/ffmpeg.ts');
  const job: any = { id: 'jl', status: 'done', stage: 'done', progress: 100, input: { adLogo: { kit: 'mossbun', corner: 'br', size: 'S' } }, outputs: [{ url: '/files/p1.png' }], resultUrl: '/files/p1.png' };
  await stampAdLogos(job);
  assert.equal(job.outputs[0].plainUrl, '/files/p1.png'); assert.equal(job.outputs[0].url, '/files/jl-out0-ad.png'); assert.ok(fs.existsSync(path.join(D, 'jl-out0-ad.png')));
  assert.deepEqual(await videoSize(path.join(D, 'jl-out0-ad.png')), { width: 512, height: 512 });
  const { adLogoBox, adLogoStamp } = await import('../src/shared/adPack.ts');
  const box = adLogoBox(512, 512, 'br', { w: 1, h: 1 }, undefined, 'S'); assert.ok(box.w <= Math.ceil(512 * 0.08) && box.x > 400 && box.y > 400, `small, bottom right: ${JSON.stringify(box)}`);
  const st = adLogoStamp({ kit: 'mossbun', corner: 'br', size: 'S' }); assert.equal(st.settings.size, 'S'); assert.equal(st.settings.spot, 'br'); assert.deepEqual(st.inset, { top: 0, right: 0, bottom: 0, left: 0 }, 'no platform frame');
  assert.equal(adLogoStamp({ corner: 'tl', placement: 'meta-4x5' }).settings.size, 'M', 'Ad Pack unchanged');
  ok('logo composited by code (small, bottom right), plain picture kept, Adjust logo opens at the same spot');
}

// ---- 4. price unchanged (the quote's params ignore the kit), prompt peek shows the same words once ----
{
  for (const [t, f] of [[ps, { prompt: 'x', scene: 'studio-white' }], [pp, { prompt: 'x' }], [ugc, { prompt: 'x' }]] as const) {
    for (const extra of [{ brandKit: 'mossbun' }, { brandKit: 'mossbun', brandColours: '1' }]) {
      const { brandKit: _k, brandColours: _c, ...q } = appQuoteParams(t, { ...f, ...extra } as any); assert.deepEqual(q, appQuoteParams(t, { ...f } as any), `${t.id}: quote params unchanged`);
    }
    const a: any = await promptPeek(t, { ...f } as any, {}); const b: any = await promptPeek(t, { ...f, brandKit: 'mossbun' } as any, {}); const c: any = await promptPeek(t, { ...f, brandKit: 'mossbun', brandColours: '1' } as any, {});
    assert.ok(a.ok && b.ok && c.ok, `${t.id} peek: ${a.error ?? b.error ?? c.error}`); assert.equal(b.provider, a.provider); assert.equal(c.model, a.model);
    assert.equal(b.prompt, a.prompt, `${t.id} peek: colours off = unchanged`);
    assert.equal(c.prompt.split(accents(t.id)).length, 2, `${t.id}: accents once`); assert.ok(!c.prompt.includes('colour palette of'), `${t.id}: no end-of-prompt phrase`);
  }
  ok('quote params, model and prompt peek unchanged except the accent words when asked');
}

// ---- 5. Recreate: the typed words, the kit and the colours switch come back ----
{
  const typed = 'a glass bottle of hand cream';
  for (const colours of [false, true]) {
    const fields: Record<string, string> = { prompt: typed, scene: 'studio-white', brandKit: 'mossbun', ...(colours ? { brandColours: '1' } : {}) };
    const b = await run(ps, fields, { image: ['p1.png'] }); const brand = applyBrandToFields(ps.id, { ...fields }) as any;
    const { form }: any = formFromInput(ps, { id: 'j1', toolId: ps.id, provider: b.r.provider, input: { ...b.r, brand } } as any, { sameSeed: false });
    assert.equal(form.prompt, typed, `Recreate: ${form.prompt}`); assert.equal(form.brandKit, 'mossbun'); assert.equal(form.brandColours, colours ? '1' : undefined);
  }
  ok('Recreate: typed words untouched, kit and colours switch kept');
}

// ---- 6. unknown kit: still refused ----
{ const r: any = applyBrandToFields('app-product-shot', { brandKit: 'nope', prompt: 'x' }); assert.equal(r.issue.code, 'brand_kit_not_found'); ok('unknown kit refused'); }
fs.rmSync(D, { recursive: true, force: true });
