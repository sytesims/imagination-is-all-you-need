// Hosted image shapes (2026-10-24, shared/hostedAspects.ts + shared/imageCaps.ts): every hosted image model offers its own shape list, and
// 1. each offered shape (and Auto where offered) passes checkImageCaps and becomes a valid request value on each of the model's routes: the
//    Comfy Router body (the value lies in the docs' enum, typed here from the local docs.comfy.org copy, Router page "Schema → Input"), the fal
//    edit bodies, BFL direct; a shape off the list is refused by the route's block (nothing is sent snapped);
// 2. a route with fewer shapes than the model narrows the bar (imageChoices routeShapes) and refuses the rest (unavailableFor);
// 3. prices: shape-independent models quote the same for every shape; FLUX.2 on Comfy Router is priced on the exact size the body sends
//    (started megapixels; 1K = the old quote for every shape), quote = charge;
// 4. the Create Image tool's aspect field lists every shape any model offers; the shared popover grouping pairs wide and tall shapes.
// Run: npx tsx test/hosted-aspects.test.ts   (pure, no server, no keys, no network)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'hostasp-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'env'), OPENHIGGSFIELD_BACKEND: 'mock', COMFY_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', OPENHIGGSFIELD_BFL_API_KEY: '' });
const ok = (m: string) => console.log('ok ' + m);
const PNG = path.join(ROOT, 'samples/sample-keyframe.png');

const { IMAGE_CAPS, checkImageCaps, ALL_IMAGE_ASPECTS } = await import('../src/shared/imageCaps.ts');
const { ROUTER_MODELS } = await import('../src/routing/routerModels.ts');
const A = await import('../src/shared/hostedAspects.ts');
const { FAL_EDIT_BODIES, FAL_EDIT_ROUTES } = await import('../src/tools/imageFalModels.ts');
const { routesFor } = await import('../src/routing/routes.ts');
const { bflFlux3ImageRequest, oneMp } = await import('../src/hostedRequests.ts');
const { falImageInput } = await import('../src/providers/fal.ts');
const { replicateImageInput } = await import('../src/providers/replicate.ts');
const { priceOf } = await import('../src/shared/pricing.ts');
const { getTool } = await import('../src/tools/registry.ts');
const { option } = await import('../src/routing/select.ts');
const { groupAspects, imageChoices } = await import('../src/shared/imageSnap.ts');

// ---- the docs' enums (local docs.comfy.org copy, development/comfy-router/models/<page>/code.md, read 2026-10-24) ----
const IDEO_V4_RES = ['2048x2048', '1440x2880', '2880x1440', '1664x2496', '2496x1664', '1792x2240', '2240x1792', '1440x2560', '2560x1440', '1600x2560', '2560x1600', '1728x2304', '2304x1728',
  '1296x3168', '3168x1296', '1152x2944', '2944x1152', '1248x3328', '3328x1248', '1280x3072', '3072x1280']; // ideogram/ideogram-v4 resolution
const LUMA = ['3:1', '2:1', '21:9', '16:9', '3:2', '4:3', '1:1', '3:4', '2:3', '9:16', '1:2', '1:3']; // luma_2/uni-1(-max) aspect_ratio
const KLING = ['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3', '21:9', 'auto']; // kling/kling-image-o1 aspect_ratio
const KREA = ['1:1', '4:5', '3:4', '2:3', '9:16', '5:4', '4:3', '3:2', '16:9', '21:9']; // krea/krea-3 aspect_ratio (omit = automatic)
const RUNWAY = ['1920:1080', '1080:1920', '1024:1024', '1360:768', '1080:1080', '1168:880', '1440:1080', '1080:1440', '1808:768', '2112:912']; // runway/gen4-image ratio
const GROK = ['1:1', '3:4', '4:3', '9:16', '16:9', '2:3', '3:2', '9:19.5', '19.5:9', '9:20', '20:9', '1:2', '2:1', 'auto']; // xai/grok-imagine-image-2-0 aspect_ratio
const FLUX3 = ['auto', '21:9', '2:1', '16:9', '3:2', '7:5', '4:3', '5:4', '1:1', '4:5', '3:4', '5:7', '2:3', '9:16', '1:2', '9:21']; // black-forest-labs/flux-3-image aspect_ratio
const RECRAFT_1K = ['1024x1024', '1536x768', '768x1536', '1280x832', '832x1280', '1216x896', '896x1216', '1152x896', '896x1152', '832x1344', '1280x896', '896x1280', '1344x768', '768x1344']; // recraft.ai appendix
const RECRAFT_2K = ['2048x2048', '3072x1536', '1536x3072', '2560x1664', '1664x2560', '2432x1792', '1792x2432', '2304x1792', '1792x2304', '1664x2688', '2560x1792', '1792x2560', '2688x1536', '1536x2688'];
const ratio = (s: string) => { const [w, h] = s.split(/[x:]/).map(Number); return w / h; };

/** model → [the body field, the values the docs allow, the full docs list the model must cover (every value offered)]. */
type Spec = { field: (b: any) => unknown; allowed: (v: unknown) => boolean; covers?: string[]; omitOnAuto?: boolean };
const inList = (xs: string[]) => (v: unknown) => xs.includes(String(v));
const SPECS: Record<string, Spec> = {
  'api-ideogram': { field: (b) => b.resolution, allowed: inList(IDEO_V4_RES), covers: IDEO_V4_RES, omitOnAuto: true },
  'api-ideogram-45': { field: (b) => b.size, allowed: (v) => /^\d+x\d+$/.test(String(v)) && IDEO_V4_RES.includes(String(v)), omitOnAuto: true },
  'api-luma-image': { field: (b) => b.aspect_ratio, allowed: inList(LUMA), covers: LUMA },
  'api-luma-uni1-max': { field: (b) => b.aspect_ratio, allowed: inList(LUMA), covers: LUMA },
  'api-kling-image': { field: (b) => b.aspect_ratio, allowed: inList(KLING), covers: KLING },
  'api-krea': { field: (b) => b.aspect_ratio, allowed: inList(KREA), covers: KREA, omitOnAuto: true },
  'api-runway-image': { field: (b) => b.ratio, allowed: inList(RUNWAY), covers: RUNWAY },
  'api-grok-image': { field: (b) => b.aspect_ratio, allowed: inList(GROK), covers: GROK },
  'api-flux3-image': { field: (b) => b.aspect_ratio, allowed: inList(FLUX3), covers: FLUX3 },
  'api-recraft': { field: (b) => b.size, allowed: inList(RECRAFT_1K), covers: RECRAFT_1K },
  'api-recraft-41': { field: (b) => b.size, allowed: inList(RECRAFT_1K), covers: RECRAFT_1K },
  'api-recraft-41-pro': { field: (b) => b.size, allowed: inList(RECRAFT_2K), covers: RECRAFT_2K },
  'api-flux2': { field: (b) => [b.width, b.height], allowed: (v: any) => v.every((n: number) => Number.isInteger(n) && n >= 256 && n <= 2048) },
  'api-flux2-max': { field: (b) => [b.width, b.height], allowed: (v: any) => v.every((n: number) => Number.isInteger(n) && n >= 256 && n <= 2048) },
};

// ---- 1. every offered shape → a valid request value on the Comfy Router route ----
const DEFAULT5 = ['1:1', '16:9', '9:16', '4:3', '3:4'];
let n = 0;
for (const [id, spec] of Object.entries(SPECS)) {
  const c = IMAGE_CAPS[id]; const rm = ROUTER_MODELS[id]; assert.ok(c && rm, `${id}: caps and a Router body`);
  assert.ok(c.aspects.length > 5 || id === 'api-luma-image' && c.aspects.length === 12, `${id}: more than the old five shapes (${c.aspects.length})`);
  assert.ok(!c.unverified.includes('aspects'), `${id}: its shapes come from a source`);
  const seen = new Set<string>();
  for (const res of c.resolutions) for (const a of [...c.aspects, ...(c.allowAuto ? ['auto'] : [])]) {
    const chk = checkImageCaps(id, { aspect: a, imageResolution: res }); assert.ok(chk.ok, `${id} ${a} ${res}: checkImageCaps takes it`);
    if (a === 'auto') assert.equal((chk as any).aspect, c.nativeAuto ? 'auto' : c.defaultAspect, `${id}: Auto stays the API's auto`);
    const job = { types: ['generate'], prompt: 'p', aspect: (chk as any).aspect, imageResolution: res, quality: c.defaultTier ?? 'med' };
    assert.equal(rm.block?.(job) ?? null, null, `${id} ${a}: the route takes it`);
    const body: any = await rm.body(job, 0); const v = spec.field(body);
    if (a === 'auto' && spec.omitOnAuto) assert.equal(v, undefined, `${id}: Auto leaves the shape out`);
    else { assert.ok(spec.allowed(v), `${id} ${a} ${res}: ${JSON.stringify(v)} is a docs value`); if (typeof v === 'string') seen.add(v); }
    if (a !== 'auto' && typeof v === 'string' && /^\d+[x:]\d+(\.\d+)?$/.test(v) && !/:/.test(a) === false) assert.ok(Math.abs(Math.log(ratio(v) / ratio(a.replace('19.5', '19.5')))) < 0.035, `${id}: ${a} → ${v} keeps the shape`);
    n++;
  }
  if (spec.covers) assert.deepEqual([...seen].sort(), [...spec.covers].sort(), `${id}: every docs value is offered`);
  // a shape off the list is refused by the route (never snapped)
  const off = ['7:3', '13:7'].find((x) => !c.aspects.includes(x))!;
  assert.ok(rm.block?.({ types: ['generate'], prompt: 'p', aspect: off }), `${id}: ${off} refused by the route`);
  await assert.rejects(rm.body({ types: ['generate'], prompt: 'p', aspect: off }, 0), `${id}: the body refuses ${off} too`);
  assert.equal(checkImageCaps(id, { aspect: off }).ok, false, `${id}: checkImageCaps refuses ${off}`);
}
ok(`Comfy Router bodies: ${n} shape × resolution cases map to the docs' values; every docs value is offered; off-list shapes refused`);

// FLUX.2: the exact size, same pixel count per shape, inside 256–2048, close to the shape
for (const a of A.FLUX2_ASPECTS) for (const res of ['1K', '2K']) { const s = A.flux2Size(a, res); assert.ok(s.width % 16 === 0 && s.height % 16 === 0, `FLUX.2 ${a} ${res}: multiples of 16`);
  assert.ok(Math.abs(Math.log(s.width / s.height / ratio(a))) < 0.03, `FLUX.2 ${a} ${res}: ${s.width}×${s.height} keeps the shape`);
  if (res === '1K') assert.equal(A.flux2StartedMp(s), 2, `FLUX.2 ${a} 1K: 2 started MP like the square`); }
ok('FLUX.2 sizes: every shape at 1K is 2 started megapixels (the old quote); 2K is the square size or capped at 2048 px');

// Edits on the Router (images in): Match photo and picked shapes
{ const lm: any = await ROUTER_MODELS['api-luma-image'].body({ types: ['edit'], prompt: 'p', aspect: '1:1', aspectAuto: true, refPaths: [PNG] }, 0); assert.equal(lm.aspect_ratio, undefined, 'Luma edit on Match photo: no aspect_ratio');
  const lp: any = await ROUTER_MODELS['api-luma-image'].body({ types: ['edit'], prompt: 'p', aspect: '3:1', refPaths: [PNG] }, 0); assert.equal(lp.aspect_ratio, '3:1');
  const kl: any = await ROUTER_MODELS['api-kling-image'].body({ types: ['edit'], prompt: 'p', aspect: 'auto', aspectAuto: true, refPaths: [PNG] }, 0); assert.equal(kl.aspect_ratio, 'auto');
  const f3: any = await ROUTER_MODELS['api-flux3-image'].body({ types: ['edit'], prompt: 'p', aspect: '9:21', refPaths: [PNG], imageResolution: '2K' }, 0); assert.equal(f3.aspect_ratio, '9:21');
  const i45: any = await ROUTER_MODELS['api-ideogram-45'].body({ types: ['edit'], prompt: 'p', aspect: 'auto', aspectAuto: true, refPaths: [PNG] }, 0); assert.equal(i45.size, 'source');
  for (const id of ['api-luma-image', 'api-ideogram-45', 'api-flux3-image', 'api-grok-image', 'api-kling-image']) { const e = IMAGE_CAPS[id].edit ?? IMAGE_CAPS[id] /* Kling: the same 8 + Auto on edits */; assert.ok(e.allowAuto, `${id}: an edit offers Match photo / Auto`);
    for (const a of e.aspects) assert.ok(checkImageCaps(id, { aspect: a, mode: 'edit', refs: 1 }).ok, `${id} edit ${a}`); } }
ok('Router edits: Match photo leaves the shape to the photo (Luma: left out, Ideogram 4.5: size source, Kling / FLUX 3: auto); picked shapes are sent');

// ---- 2. routes with fewer shapes ----
{ // BFL direct FLUX 3: the same enum; Auto leaves it out (the API default auto)
  for (const a of A.FLUX3_ASPECTS) assert.equal(bflFlux3ImageRequest({ prompt: 'p', aspectRatio: a, imageRes: '1K' }).body.aspect_ratio, a, `BFL FLUX 3 ${a}`);
  assert.equal(bflFlux3ImageRequest({ prompt: 'p', aspectRatio: 'auto', imageRes: '1K' }).body.aspect_ratio, undefined, 'BFL FLUX 3 Auto: left out');
  // fal edits: Grok takes 9 + auto, Kling the same 8 + auto as the Router
  for (const a of A.GROK_EDIT_ASPECTS) assert.equal((await FAL_EDIT_BODIES.grok({ prompt: 'p', aspect: a, refPaths: [PNG] })).aspect_ratio, a, `fal Grok edit ${a}`);
  assert.equal((await FAL_EDIT_BODIES.grok({ prompt: 'p', aspect: '1:1', aspectAuto: true, refPaths: [PNG] })).aspect_ratio, 'auto', 'fal Grok Match photo → auto');
  for (const a of A.KLING_IMAGE_ASPECTS) assert.equal((await FAL_EDIT_BODIES.klingO1({ prompt: 'p', aspect: a, refPaths: [PNG] })).aspect_ratio, a, `fal Kling ${a}`);
  assert.deepEqual([...IMAGE_CAPS['api-grok-image'].edit!.aspects].sort(), [...A.GROK_EDIT_ASPECTS].sort(), 'Grok edits offer the fal list only');
  const grokFal = FAL_EDIT_ROUTES.find((r) => r.routeId === 'fal:xai/grok-imagine-image/v2.0/edit')!;
  assert.ok(grokFal.unavailableFor!({ types: ['edit'], mode: 'edit', aspect: '20:9', refPaths: [PNG] }), 'fal Grok refuses 20:9');
  assert.equal(grokFal.unavailableFor!({ types: ['edit'], mode: 'edit', aspect: '2:1', refPaths: [PNG] }), null);
  for (const slug of ['fal:luma/agent/uni-1/v1/edit', 'fal:ideogram/v4.5/edit']) { const r = FAL_EDIT_ROUTES.find((x) => x.routeId === slug)!;
    assert.ok(r.unavailableFor!({ types: ['edit'], mode: 'edit', aspect: '16:9', refPaths: [PNG] }), `${slug}: a picked shape runs elsewhere (this route keeps the photo's shape)`);
    assert.equal(r.unavailableFor!({ types: ['edit'], mode: 'edit', aspect: 'auto', refPaths: [PNG] }), null, `${slug}: Match photo fine`); }
  // FLUX.2 [pro]: fal sends the shape at ≤ 1 MP; Replicate keeps its five
  for (const a of A.FLUX2_ASPECTS) { const b: any = falImageInput('fal-ai/flux-2-pro', { prompt: 'p', aspectRatio: a }); assert.ok(b.image_size.width * b.image_size.height <= 1e6, `fal FLUX.2 [pro] ${a}: ≤ 1 MP`);
    assert.ok(Math.abs(Math.log(b.image_size.width / b.image_size.height / ratio(a))) < 0.04, `fal FLUX.2 [pro] ${a}: keeps the shape`); }
  const rep = routesFor('api-flux2').find((r) => r.kind === 'replicate')!; assert.deepEqual(rep.caps?.aspects, A.REPLICATE_FLUX2_ASPECTS);
  for (const a of A.FLUX2_ASPECTS) assert.equal(!!rep.unavailableFor!({ aspect: a }), !A.REPLICATE_FLUX2_ASPECTS.includes(a), `Replicate FLUX.2 ${a}`);
  assert.equal(replicateImageInput('black-forest-labs/flux-2-pro', { prompt: 'p', aspectRatio: '9:16' }).aspect_ratio, '9:16');
  // BFL direct FLUX.2 [flex] / [klein]: any shape at ≤ 1 MP, ≥ 64 px a side
  for (const a of A.FLUX2_ASPECTS) { const s = oneMp(a); assert.ok(s.width >= 64 && s.height >= 64 && s.width * s.height <= 1e6, `BFL oneMp ${a}`); }
  // the bar: a picked route with fewer shapes narrows the list (Auto kept only where the route takes it)
  const g = imageChoices(IMAGE_CAPS['api-grok-image'] as any, { editing: true, routeShapes: grokFal.caps as any }); assert.deepEqual(g.aspects, ['Auto', ...IMAGE_CAPS['api-grok-image'].edit!.aspects]);
  const gGen = imageChoices(IMAGE_CAPS['api-grok-image'] as any, { editing: false, routeShapes: grokFal.caps as any }); assert.equal(gGen.aspects.length, 14, 'an edit-only route never narrows a prompt-only run');
  const f2 = imageChoices(IMAGE_CAPS['api-flux2'] as any, { editing: false, routeShapes: rep.caps as any }); assert.deepEqual(f2.aspects, A.REPLICATE_FLUX2_ASPECTS);
  const lu = imageChoices(IMAGE_CAPS['api-luma-image'] as any, { editing: true, routeShapes: FAL_EDIT_ROUTES.find((x) => x.routeId === 'fal:luma/agent/uni-1/v1/edit')!.caps as any }); assert.deepEqual(lu.aspects, ['Auto']);
  assert.equal(imageChoices(IMAGE_CAPS['api-grok-image'] as any, { editing: false }).aspects[0], 'Auto', 'Auto first');
}
ok('routes with fewer shapes: fal Grok edit (9 + auto), Luma / Ideogram 4.5 fal edits (photo shape only), Replicate FLUX.2 (5) narrow the bar and refuse the rest; BFL FLUX 3 / FLUX.2 flex take the full list');

// ---- 3. prices ----
const tool = getTool('create-image')!;
const credits = (id: string, input: Record<string, any>) => { const r = routesFor(id, tool).find((x) => x.kind === 'comfy-router')!; return option(tool, r, { outKind: 'image', types: ['generate'], n: 1, ...input }).credits; };
for (const id of Object.keys(SPECS).filter((x) => !/flux2/.test(x))) { const c = IMAGE_CAPS[id];
  for (const res of c.resolutions) for (const t of c.qualityTiers.length ? c.qualityTiers : [null]) { const base = credits(id, { imageResolution: res, tier: t });
    for (const a of [...c.aspects, ...(c.allowAuto ? ['auto'] : [])]) assert.equal(credits(id, { aspect: a, imageResolution: res, tier: t }), base, `${id} ${a} ${res} ${t}: same price for every shape`); } }
for (const id of ['api-flux2', 'api-flux2-max']) { const h = (await import('../src/shared/hostedPrices.ts')).HOSTED_BY_ID[id]; const m = h.mpImage!;
  for (const res of ['1K', '2K'] as const) { const sq = credits(id, { aspect: '1:1', imageResolution: res }); assert.equal(credits(id, { imageResolution: res }), sq, `${id} ${res}: no shape = the square`);
    for (const a of A.FLUX2_ASPECTS) { const body: any = await ROUTER_MODELS[id].body({ types: ['generate'], prompt: 'p', aspect: a, imageResolution: res }, 0);
      const mp = Math.ceil((body.width * body.height) / 1e6 - 1e-9); const want = Math.ceil(Math.round(((m.first + (mp - 1) * m.extra) / 211 / 0.01) * 1e6) / 1e6);
      const got = credits(id, { aspect: a, imageResolution: res }); assert.ok(Math.abs(got! - want) <= 1, `${id} ${a} ${res}: quote ${got} = the sent size's ${mp} MP (${want})`);
      if (res === '1K') assert.equal(got, sq, `${id} ${a} 1K: unchanged from the old quote`); else assert.ok(got! <= sq, `${id} ${a} 2K: never above the square`);
      assert.equal(priceOf({ toolId: 'create-image', rates: {}, quality: '720p', provider: id, imageRes: res, aspect: a }).credits, got, `${id} ${a} ${res}: the web price (priceOf) = the route quote`); } } }
ok('prices: shape-independent models quote the same for every shape; FLUX.2 on Comfy Router quotes the started megapixels of the exact size it sends (1K unchanged, 2K long shapes lower)');

// ---- 4. the tool's aspect field and the popover grouping ----
{ const field = [...((tool as any).inputs ?? []), ...((tool as any).fields ?? [])].find((f: any) => f.name === "aspect"); const vals = field.options.map((o: any) => String(o?.value ?? o));
  for (const c of Object.values(IMAGE_CAPS)) for (const a of [...c.aspects, ...(c.edit?.aspects ?? [])]) assert.ok(vals.includes(a), `tool aspect field lists ${a}`);
  assert.equal(new Set(ALL_IMAGE_ASPECTS).size, ALL_IMAGE_ASPECTS.length, 'no duplicates');
  // models left on the default five: only the coming-soon ones and the one-photo tools
  const five = Object.entries(IMAGE_CAPS).filter(([id, c]) => /^(api|direct)-/.test(id) && c.aspects.join() === DEFAULT5.join()).map(([id]) => id);
  assert.deepEqual(five.sort(), ['api-hunyuan-image', 'api-meta-muse', 'api-seedream-layers-flash', 'api-seedream-layers-pro'].sort(), `hosted models still on the default five: ${five.join(', ')}`);
  if (groupAspects) { const opts = A.IDEOGRAM_ASPECTS.map((a) => ({ a, r: ratio(a) })); const g = groupAspects(opts, () => false, (o: any) => o.r)!;
    assert.equal(g.top.length, 1); for (const [w, t] of g.pairs) { assert.ok(w && t, 'Ideogram: every wide shape has its tall twin'); assert.ok(Math.abs(w.r * t.r - 1) < 0.02); }
    assert.equal(groupAspects(opts.slice(0, 8), () => false, (o: any) => o.r), null, '8 or fewer: a plain list'); }
}
ok(`Create Image aspect field lists every shape; only coming-soon / layer models keep the default five${groupAspects ? '; the shared popover pairs wide | tall' : ' (popover grouping not loadable here)'}`);
console.log('ALL OK hosted-aspects');
