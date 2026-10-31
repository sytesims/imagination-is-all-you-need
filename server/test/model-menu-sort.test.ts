// Model menu filters + sort (web/src/shared/modelMenuSort.ts) and our quality order (server/src/shared/qualityRank.ts).
// Run: npx tsx test/model-menu-sort.test.ts   (no server, no network)
import assert from 'node:assert/strict';
import { chipsFor, matchesChips, cheapestOf, sortModels, newestScore, gpuStateOf, matchesQuery, familiesOf, familyFrom, shownOf, localBlocker, localScore, localFirst, featuredLocalFirst } from '../../web/src/shared/modelMenuSort.ts';
import { specOf, priceOf, usdRange, cardFactsOf, cardDetailsOf, listRateOf } from '../../web/src/shared/modelSpec.ts';
import { QUALITY_ORDER, qualityRank } from '../src/shared/qualityRank.ts';
import { CATALOGUE, FAMILY_BLURB, THREE_D_BEST_FOR } from '../src/shared/modelRank.ts';
import { MODELS } from '../src/shared/modelIds.ts';
const ok = (m: string) => console.log('ok ' + m);

const place = (id: string, status = 'ready', extra: any = {}) => ({ id, label: id, billedTo: id, status, credits: null, reason: null, reasonCode: null, routes: [], engines: [],
  group: id === 'local' ? 'gpu' : id === 'comfy-cloud' ? 'comfy' : 'api', ...extra }) as any;
const model = (key: string, maker: string, runsOn: any[], extra: any = {}) => ({ key, name: key, maker, makerName: maker.toUpperCase(), family: key, medium: 'image', openWeights: false,
  engines: [key], runsOn, ...extra }) as any;
const pp = (runOn: string, usd: number) => ({ runOn, runOnLabel: runOn, credits: Math.round(usd * 100), cost: { estUsd: usd }, routeId: null });
const rq = (places: any[], extra: any = {}) => ({ model: 'x', ok: true, status: 200, priceRange: places.length ? { places } : null, ...extra });

const A = model('a', 'openai', [place('comfy-cloud'), place('openai')]);
const B = model('b', 'google', [place('comfy-cloud'), place('fal', 'needs-key'), place('google')], { releasedAt: '2026-09-01' });
const C = model('c', 'bfl', [place('local'), place('bfl')], { isNew: true });
const D = model('d', 'bfl', [place('local', 'not-installed', { action: { kind: 'download', text: 'Download' } })], { releasedAt: '2025-11-25' });
const E = model('e', 'qwen', [place('comfy-cloud')]);
const list = [A, B, C, D, E];

// 1. Chips per tab
assert.deepEqual(chipsFor(list, 'all').map(c => [c.id, c.count]), [['bfl', 2], ['google', 1], ['openai', 1], ['qwen', 1]]);
assert.deepEqual(chipsFor(list.filter(m => m.runsOn.some((r: any) => r.group === 'api')), 'api').map(c => c.label), ['BFL', 'fal', 'Google', 'OpenAI']);
assert.deepEqual(chipsFor(list, 'gpu').map(c => c.label), ['Installed', 'Needs download']);
assert.equal(gpuStateOf(C), 'installed'); assert.equal(gpuStateOf(D), 'download'); assert.equal(gpuStateOf(A), null);
assert.deepEqual(list.filter(m => matchesChips(m, 'all', ['bfl', 'qwen'])).map(m => m.key), ['c', 'd', 'e'], 'multi-select: any chosen maker');
assert.deepEqual(list.filter(m => matchesChips(m, 'api', ['fal'])).map(m => m.key), ['b'], 'a provider chip matches a needs-key place too');
assert.deepEqual(list.filter(m => matchesChips(m, 'all', [])).length, 5, 'no chip on = everything');
ok('chips: makers (All/Comfy), providers (API), Installed · Needs download (Local); multi-select');

// 2. Cheapest place per tab
const quotes: Record<string, any> = {
  a: rq([pp('comfy-cloud', 0.08), pp('openai', 0.05)]),
  b: rq([pp('comfy-cloud', 0.05), pp('google', 0.06)], { setupOptions: [{ runOn: 'fal', action: 'add_key', credits: 3 }] }),
  c: rq([pp('bfl', 0.02)]),
  e: { pending: true },
};
assert.deepEqual(cheapestOf(A, quotes.a, 'all'), { usd: 0.05, place: 'openai', placeLabel: 'OpenAI', setup: null });
assert.deepEqual(cheapestOf(A, quotes.a, 'comfy'), { usd: 0.08, place: 'comfy-cloud', placeLabel: 'Comfy Cloud', setup: null }, 'a tab only counts its own places');
assert.deepEqual(cheapestOf(B, quotes.b, 'all'), { usd: 0.03, place: 'fal', placeLabel: 'fal', setup: 'key' }, 'a place that needs a key is priced at that place');
assert.equal(cheapestOf(C, quotes.c, 'all')?.place, 'local', 'Local is free');
assert.equal(cheapestOf(C, quotes.c, 'api')?.usd, 0.02);
assert.deepEqual(cheapestOf(D, null, 'all'), { usd: 0, place: 'local', placeLabel: 'Your computer', setup: 'download' });
assert.equal(cheapestOf(E, quotes.e, 'all'), null, 'no answer yet = unknown');
assert.equal(cheapestOf(E, rq([], { demo: true, runOn: 'comfy-cloud', credits: 0 }), 'all'), null, 'a sample run is not a price');
assert.deepEqual(cheapestOf(E, { ok: true, status: 200, runOn: 'comfy-cloud', credits: 4, cost: { estUsd: 0.04 } }, 'all')?.usd, 0.04, 'older answer without priceRange: its own price');
assert.deepEqual(cheapestOf(B, quotes.b, 'api', ['google'])?.place, 'google', 'API tab with provider chips on: cheapest among those providers');
// a tie: the place that runs now beats the one that needs a key
assert.equal(cheapestOf(B, rq([pp('google', 0.03)], { setupOptions: [{ runOn: 'fal', action: 'add_key', credits: 3 }] }), 'all')?.place, 'google');
ok('cheapest place: per tab, needs-key places priced there, GPU free (download flagged), samples and pending = unknown, ties prefer ready');

// 3. Sort orders
const price = (m: any) => cheapestOf(m, quotes[m.key] ?? null, 'all');
assert.deepEqual(sortModels(list, 'price', { price }).map(m => m.key), ['c', 'd', 'b', 'a', 'e'], 'free ready, free download, $0.03 key, $0.05, unknown last');
assert.deepEqual(sortModels(list, 'recommended').map(m => m.key), ['a', 'b', 'c', 'd', 'e']);
const now = Date.parse('2026-10-23');
assert.deepEqual(sortModels(list, 'newest', { now }).map(m => m.key), ['c', 'b', 'd', 'a', 'e'], 'isNew (≈ a month ago) > Sep 2026 > Nov 2025 > undated in recommended order');
assert.equal(newestScore({ releasedAt: 'nonsense', isNew: false }), null);
const ranks = new Map([['e', 1], ['a', 3]]);
assert.deepEqual(sortModels(list, 'quality', { rank: m => ranks.get(m.key) ?? null }).map(m => m.key), ['e', 'a', 'b', 'c', 'd'], 'ranked first, unranked last in recommended order');
assert.deepEqual(sortModels(list, 'quality', { rank: () => null }).map(m => m.key), ['a', 'b', 'c', 'd', 'e'], 'no ranking data: recommended order');
const tie = [model('t1', 'x', []), model('t2', 'x', []), model('t3', 'x', [])];
assert.deepEqual(sortModels(tie, 'price', { price: () => ({ usd: 0.04, place: 'fal', placeLabel: 'fal', setup: null }) }).map(m => m.key), ['t1', 't2', 't3'], 'equal prices keep the recommended order');
assert.deepEqual(sortModels([A], 'price', { price }).map(m => m.key), ['a'], 'one row');
ok('sort: price (cheapest place, unknown last), newest, best quality (unranked last), stable ties');

// 4. Our quality order: every key is a real image model, no repeats; generate vs edit order; sort uses it
const keys = new Set(Object.keys(MODELS));
for (const mode of ['generate', 'edit'] as const) {
  const order = QUALITY_ORDER[mode];
  assert.equal(new Set(order).size, order.length, `${mode}: a model listed twice`);
  for (const k of order) { assert.ok(keys.has(k), `${mode}: unknown model key ${k}`); assert.equal((MODELS as any)[k].medium, 'image', `${mode}: ${k} is not an image model`); assert.ok(CATALOGUE[k], `${mode}: ${k} has no catalogue entry`); }
}
assert.equal(qualityRank(QUALITY_ORDER.generate[0], 'generate'), 1);
assert.equal(qualityRank('seedvr2-image', 'generate'), null, 'upscalers are not in the order');
assert.equal(qualityRank('gpt-image-2.5-sunburst', 'edit'), 1, 'Sunburst leads the editing order');
assert.notDeepEqual(QUALITY_ORDER.generate.slice(0, 5), QUALITY_ORDER.edit.slice(0, 5), 'edit order differs from generate');
const qm = ['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst', 'seedvr2-image', 'nano-banana-2.1'].map(k => model(k, 'x', []));
assert.deepEqual(sortModels(qm, 'quality', { rank: m => qualityRank(m.key, 'generate') }).map(m => m.key), ['gpt-image-2.5-flare', 'nano-banana-2.1', 'gpt-image-2.5-sunburst', 'seedvr2-image'], 'generate order, unlisted last in recommended order');
assert.deepEqual(sortModels(qm, 'quality', { rank: m => qualityRank(m.key, 'edit') }).map(m => m.key), ['gpt-image-2.5-sunburst', 'nano-banana-2.1', 'gpt-image-2.5-flare', 'seedvr2-image'], 'edit order, unlisted last');
ok('quality order: real image models, no repeats, edit order differs (Sunburst first), unlisted last');

// 5. The quiet menu (2026-10-24): search words, families, a family's price
{ const g = model('g1', 'google', [place('comfy-cloud')], { makerName: 'Google', family: 'Nano Banana', caps: { edit: true, maxResolution: '4K' }, bestFor: 'Clear text, steady characters, 4K' });
  const g2 = model('g2', 'google', [place('comfy-cloud')], { makerName: 'Google', family: 'Nano Banana', caps: { edit: false, maxResolution: '2K' } });
  const q = model('q1', 'alibaba-qwen', [place('local'), place('comfy-cloud')], { makerName: 'Alibaba', family: 'Qwen', caps: { edit: true } });
  assert.ok(matchesQuery(g, 'google') && matchesQuery(g, 'GOOGLE 4k') && matchesQuery(g, 'edit') && matchesQuery(g, 'text'), 'maker, capability and keyword words');
  assert.ok(!matchesQuery(g2, 'edit') && !matchesQuery(g2, '4k'), 'no edit / 4K on a model without them');
  assert.ok(matchesQuery(q, 'free') && !matchesQuery(g, 'free'), '"free" = runs on your own computer');
  assert.ok(matchesQuery(g2, 'clear text', 'Google image models: clear text'), 'the family line is searchable');
  assert.deepEqual(familiesOf([g, q, g2]).map(f => [f.family, f.models.length]), [['Nano Banana', 2], ['Qwen', 1]], 'families in first-seen order');
  // the family row reads what its version rows show (ModelMenu rightOf → shownOf), never a place a row doesn't show (2026-10-31: LTX said Free)
  assert.deepEqual(['Free', '≈ $0.08', '$1.72', '≈ up to $0.05', '$1,234.50', 'Sample', 'Turn on', null].map(shownOf),
    [{ usd: 0, free: true }, { usd: 0.08, free: false }, { usd: 1.72, free: false }, { usd: 0.05, free: false }, { usd: 1234.5, free: false }, null, null, null], 'a row token → its shown price');
  const $ = (usd: number) => ({ usd, free: false }); const free = { usd: 0, free: true };
  assert.deepEqual(familyFrom([$(0.07), $(0.05)]), { free: false, usd: 0.05 }, 'from = the cheapest version row');
  assert.deepEqual(familyFrom([$(0.14), $(1.72), $(0.9), $(0.3)]), { free: false, usd: 0.14 }, 'a version with a Local place its row does not show (LTX-2.5 22B on Comfy) is not Free');
  assert.deepEqual(familyFrom([free, $(1.43)]), { free: true, usd: 0 }, 'Free only when a version row itself says Free (Wan 2.2 5B)');
  assert.deepEqual(familyFrom([null, $(0.3)]), { free: false, usd: 0.3 }, 'a row with no price (Turn on, Sample, blocked, loading) is left out');
  assert.deepEqual(familyFrom([null, undefined]), { free: false, usd: null }, 'no version shows a price: none');
  for (const [k, v] of [...Object.entries(FAMILY_BLURB), ...Object.entries(THREE_D_BEST_FOR)]) assert.ok(v.length <= 50 && !/\b(free|local|comfy|fal|\$)/i.test(v), `${k}: short, no place or price (${v})`); }
ok('quiet menu: search matches makers, capabilities, keywords and "free"; families group versions; a family is Free or from the cheapest of its version rows; family lines ≤ 50 chars');
// Your computer says Free only when it runs now (2026-10-31: LTX-2.5 22B said Free with 42.7 GB to fetch and 42.3 GB free)
{ const L = (status: string, extra: any = {}) => place('local', status, extra);
  assert.equal(localBlocker(L('ready')), null, 'ready: Free');
  const w = (r: any) => { const b = localBlocker(r); return b && `${b.word} / ${b.sub}`; };
  assert.equal(w(L('not-installed', { action: { kind: 'download', text: 'Download 42.7 GB', missingBytes: 42.7e9 } })), 'Download 43 GB / Free once ready');
  assert.equal(w(L('not-installed', { action: { kind: 'download', text: 'Download files' } })), 'Download / Free once ready');
  assert.equal(w(L('not-installed', { reasonCode: 'not_enough_disk', reason: "This model's files need 42.7 GB of disk space; 42.3 GB is free.", missingBytes: 42.7e9 })), 'Needs 43 GB space / Free once ready', 'not enough disk: from the structured bytes, not the sentence');
  assert.equal(w(L('not-installed', { reasonCode: 'not_enough_disk' })), 'Needs disk space / Free once ready');
  assert.equal(w(L('not-installed', { reasonCode: 'not_enough_disk', missingBytes: 3.2e9 })), 'Needs 3.2 GB space / Free once ready');
  assert.equal(w(L('off', { action: { kind: 'turn_on', text: 'Turn on' } })), 'Turn on / Free once ready');
  assert.equal(w(L('not-installed', { reasonCode: 'nodes_missing', action: { kind: 'install_node', text: 'Install node' } })), 'Install add-on / Free once ready');
  assert.equal(w(L('not-installed', { reasonCode: 'local_unreachable', action: { kind: 'set_up_gpu', text: 'Set up GPU' } })), 'Set up / Free once ready');
  assert.equal(w(L('unavailable', { reasonCode: 'unsupported_weights' })), 'Needs NVIDIA / Your computer', 'a blocker the user cannot fix: no "once ready"');
  assert.equal(w(L('not-installed', { reasonCode: 'too_heavy' })), 'Too big for this GPU / Your computer');
  for (const r of [L('not-installed', { reasonCode: 'not_enough_disk', missingBytes: 42.7e9 }), L('off'), L('not-installed', { reasonCode: 'too_heavy' })]) { const b = localBlocker(r)!;
    assert.ok(!/^Free\b/.test(b.word) && !/\bMac\b/.test(b.word + b.sub) && b.word.length <= 20, `short, never Free, never Mac: ${b.word}`);
    assert.equal(shownOf(b.word), null, `a blocked Local row shows no price: ${b.word}`); }
  assert.deepEqual(familyFrom([shownOf(localBlocker(L('not-installed', { reasonCode: 'not_enough_disk', missingBytes: 42.7e9 }))!.word), { usd: 0.3, free: false }]), { free: false, usd: 0.3 }, 'a family with only a blocked Local row is never Free'); }
ok('Your computer: Free only when ready; else the blocker (Download 43 GB, Needs 43 GB space, Turn on, Needs NVIDIA) and no price');

// 6. Local first (2026-10-26, every menu): free local models lead All models and Featured; Featured keeps its cloud highlight after them
{ const cloud = model('cloud', 'google', [place('comfy-cloud')]); const cloud2 = model('cloud2', 'openai', [place('openai')]);
  const home = model('home', 'lightricks', [place('local')]); // runs only on your computer, ready
  const both = model('both', 'minimax', [place('local'), place('comfy-cloud')], { autoRunOn: 'comfy-cloud' }); // ready locally, runs in the cloud by default
  const dl = model('dl', 'bfl', [place('local', 'not-installed', { action: { kind: 'download' } }), place('bfl')]);
  assert.deepEqual([home, both, dl, cloud].map(localScore), [0, 1, 2, 3], 'free and local by default < ready locally < needs a download < cloud only');
  assert.deepEqual(localFirst([cloud, dl, both, cloud2, home]).map(m => m.key), ['home', 'both', 'dl', 'cloud', 'cloud2'], 'local first, then the server order');
  assert.deepEqual(featuredLocalFirst([cloud, cloud2], [cloud, home, cloud2]).map(m => m.key), ['home', 'cloud', 'cloud2'], 'the best local model leads Featured');
  assert.deepEqual(featuredLocalFirst([cloud, both], [cloud, both, home]).map(m => m.key), ['home', 'cloud', 'both'], 'a better local model beats a featured one that runs in the cloud by default');
  assert.deepEqual(featuredLocalFirst([cloud, home], [cloud, home]).map(m => m.key), ['home', 'cloud'], 'a featured local model moves to the top');
  assert.deepEqual(featuredLocalFirst([cloud], [cloud, dl]).map(m => m.key), ['cloud'], 'a model that still needs a download is not pushed into Featured');
  assert.deepEqual(featuredLocalFirst([cloud], [cloud, home], home).map(m => m.key), ['cloud'], 'the workflow default above is already local: unchanged');
  assert.deepEqual(featuredLocalFirst([], [home]), [], 'no Featured list: none made up'); }
ok('local first: score, All models order, Featured leads with a free local model and keeps its cloud highlight');

// 7. The preview card's spec for image models (shared/modelSpec.ts)
{ assert.equal(usdRange([0.1, 0.1004]), '$0.10', 'equal once rounded: one figure');
  const z = model('z-image-turbo', 'tongyi', [place('local'), place('comfy-cloud', 'ready', { credits: 1 })], { engines: ['comfy-zimage-turbo'] });
  const zp = specOf(z)[0]; assert.equal(zp.value, 'Free'); assert.match(zp.title ?? '', /^Free on your computer; \$[\d.]+ \/img in the cloud$/, `free locally, the cloud price on hover (${zp.title})`);
  const up = model('real-esrgan', 'tencent', [place('local')], { engines: ['comfy-realesrgan'], caps: { summary: null } });
  const tool = { app: { imageUpscale: { maxSide: 8192, maxSideByProvider: {}, factorsByProvider: { 'comfy-realesrgan': [2, 4, 8] } } } };
  assert.deepEqual(specOf(up, { tool }).map(c => `${c.label}=${c.value}`), ['Price=Free', 'Scale=×2 ×4 ×8', 'References=1 image', 'Up to=8192 px'], 'an upscaler: its factors and cap');
  const bare = model('x', 'x', [place('comfy-cloud', 'ready', { credits: 4 })], { engines: ['nope'], caps: { maxResolution: '2K', maxRefs: 3 } });
  assert.deepEqual(specOf(bare).map(c => `${c.label}=${c.value}`), ['Price=$0.04 /img', 'Size=2K', 'References=3', 'Shapes=—'], 'an image model without a caps row: the catalogue caps, priced per image');
  assert.equal(priceOf(model('l', 'x', [place('local')], { engines: ['nope'] })), 'Free'); }
ok('Models page spec: image price per image, free-local price with the cloud price on hover, upscaler factors, catalogue caps fallback');

// 8. The menu's preview card: 2–3 plain facts per medium, every detail row, and the list rate always says where it applies (shared/modelSpec.ts)
{ const h3 = model('minimax-h3', 'minimax', [place('local'), place('comfy-cloud')], { medium: 'video', engines: ['cloud-h3'], caps: { maxResolution: '768p', minSeconds: 4, maxSeconds: 15, sound: true, summary: null } });
  const tool = { app: { videoLimits: { 'cloud-h3': { resolutions: ['768p', '480p'], minSeconds: 5, maxSeconds: 15, audio: { supported: true }, refMax: { image: 1 }, aspects: ['auto', '16:9', '9:16'] } } } };
  assert.deepEqual(cardFactsOf(h3, { tool }).map(f => f.text), ['Up to 15 s', '480p or 768p', 'Makes its own sound'], 'video: length, the engine\'s sizes, sound');
  const d = cardDetailsOf(h3, { tool });
  assert.ok(d.some(r => r.label === 'Attach' && r.value === 'Up to 1 image'), 'details: attachments in words');
  assert.ok(d.some(r => r.label === 'Shapes' && r.value === '16:9, 9:16, or Auto'), 'details: every shape, nothing cut');
  const img = model('gpt-image-2.5-flare', 'openai', [place('comfy-cloud')], { engines: ['nope'], caps: { maxResolution: '4K', maxRefs: 16, edit: true, mask: true, summary: null } });
  assert.deepEqual(cardFactsOf(img).map(f => f.text), ['Up to 4K', 'Edits from up to 16 images', 'Paint over a spot to change it'], 'image: size, edits, mask');
  const music = model('minimax-music-3', 'minimax', [place('comfy-cloud')], { medium: 'audio', engines: ['cloud-minimax-music'], caps: { kind: 'music', summary: 'Music' } });
  const atool = { app: { providerModes: { 'cloud-minimax-music': ['music'] }, lyricsModes: ['music'], durationsByProvider: { 'cloud-minimax-music': [30, 60, 300] } } };
  assert.deepEqual(cardFactsOf(music, { tool: atool }).map(f => f.text), ['Songs with vocals', 'Up to 5 min'], 'music: what it makes and its longest length');
  assert.doesNotMatch(CATALOGUE['minimax-music-3'].bestFor, /6 minutes/, 'Music 3 makes up to 5 minutes (Comfy docs)');
  const r = listRateOf(model('h3', 'minimax', [place('comfy-cloud')], { medium: 'video', engines: ['api-minimax-h3'] }));
  assert.ok(r && /\/s$/.test(r.text) && r.where === 'Comfy Router (partner node)', `the list rate names where it applies (${JSON.stringify(r)})`); }
ok('preview card facts: video length, sizes and sound; image size, edits and mask; music length; details rows; the list rate says where');
