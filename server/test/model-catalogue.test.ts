/** Model catalogue (shared/modelRank.ts, MODEL-PICKER-REVIEW task 2), in-process: every model the app offers has an entry; ranks are unique
 *  per medium; API models rank above local ones; best-for copy follows the copy rules; the listings carry the fields; Coming soon for models
 *  that are not on Comfy Router (task 12). Run: npx tsx test/model-catalogue.test.ts (temp data dir, mock backend, no keys). */
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'modelcat-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0',
  OPENHIGGSFIELD_MOCK_KEYS: '', OPENHIGGSFIELD_USE_LOCAL: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_BFL_API_KEY: '' });
const { listTools, getTool } = await import('../src/tools/registry.js');
const R = await import('../src/routing/modelRegistry.js');
const { MODELS, runOnOfRoute } = await import('../src/shared/modelIds.js');
const { CATALOGUE, variantsOf } = await import('../src/shared/modelRank.js');
const { routesFor, COMING_SOON } = await import('../src/routing/routes.js');
const { NOT_ON_ROUTER } = await import('../src/routing/routerModels.js');
let ok = 0; const t = async (n: string, fn: () => unknown) => { await fn(); ok++; console.log('ok', n); };

// every model a tool offers (not plugin-derived), plus the whole static table
const offered = new Map<string, { tools: string[]; runOns: Set<string> }>();
for (const tool of listTools()) for (const m of R.toolModels(tool)) { if (m.def.derived) continue; const o = offered.get(m.key) ?? { tools: [], runOns: new Set<string>() }; offered.set(m.key, o);
  o.tools.push(tool.id); for (const x of R.modelRoutes(tool, m)) o.runOns.add(runOnOfRoute(x.route)); }
const media = ['image', 'video', 'audio'] as const;

await t('every model in the app (each tool\'s models and every MODELS key) has a catalogue entry; no entry for an unknown model', () => {
  for (const k of [...offered.keys(), ...Object.keys(MODELS)]) assert.ok(CATALOGUE[k], `${k}: no catalogue entry (shared/modelRank.ts)`);
  for (const k of Object.keys(CATALOGUE)) assert.ok(MODELS[k], `catalogue entry ${k} is not a model key`);
  console.log(`   ${offered.size} offered models, ${Object.keys(CATALOGUE).length} entries`);
});
await t('ranks: integers, unique per medium', () => {
  for (const md of media) { const seen = new Map<number, string>();
    for (const [k, c] of Object.entries(CATALOGUE)) { if (MODELS[k].medium !== md) continue; assert.ok(Number.isInteger(c.rank) && c.rank > 0, `${k}: rank ${c.rank}`);
      assert.ok(!seen.has(c.rank), `${md}: rank ${c.rank} used by ${seen.get(c.rank)} and ${k}`); seen.set(c.rank, k); } }
});
await t('API models rank above Local ones, per medium; home matches the routes', () => {
  for (const md of media) { const es = Object.entries(CATALOGUE).filter(([k]) => MODELS[k].medium === md);
    const api = es.filter(([, c]) => c.home === 'api').map(([, c]) => c.rank); const gpu = es.filter(([, c]) => c.home === 'gpu').map(([, c]) => c.rank);
    assert.ok(api.length && gpu.length, md); assert.ok(Math.max(...api) < Math.min(...gpu), `${md}: API ranks up to ${Math.max(...api)}, GPU from ${Math.min(...gpu)}`); }
  for (const [k, o] of offered) { const c = CATALOGUE[k];
    if (c.home === 'gpu') assert.ok(o.runOns.has('local'), `${k}: home gpu but no local route`);
    else assert.ok([...o.runOns].some((r) => r !== 'local') /* coming-soon routes count */, `${k}: home api but no hosted route`); }
});
await t('displayName and bestFor: set; bestFor one plain line ≤ 42 characters, no app state, place, price or licence words', () => {
  const banned = /licen[cs]e|apache|\bmit\b|cc[ -]by|non-?commercial|open weights|default for|\bcomfy\b|\bfal\b|replicate|your gpu|locally|this computer|\bfree\b|\$|credits?\b|cheap|price|research/i;
  // one known exception (Image to layers, 2026-10-24): the download-only local model's menu line names the download, and image-layers.test checks it. Pinned to that exact line so nothing else slips through.
  const READINESS_LINE: Record<string, string> = { 'qwen-image-layered': 'Needs download (30.1 GB) · free layers locally' };
  for (const [k, c] of Object.entries(CATALOGUE)) {
    if (READINESS_LINE[k]) { assert.equal(c.bestFor, READINESS_LINE[k], `${k}: the pinned readiness line changed; bring it back under the rules below`); continue; }
    assert.ok(c.displayName.trim(), `${k}: displayName`); assert.ok(c.bestFor.trim(), `${k}: bestFor`);
    assert.ok(c.bestFor.length <= 42, `${k}: bestFor is ${c.bestFor.length} chars: "${c.bestFor}"`); assert.ok(!/[\n.]$/.test(c.bestFor), `${k}: one line, no full stop`);
    assert.doesNotMatch(c.bestFor, banned, `${k}: "${c.bestFor}"`); }
  // the real version is shown: the bare family names the review flagged carry their version
  for (const [k, want] of [['seedance-2.0', 'Seedance 2.0'], ['veo-3.1', 'Veo 3.1'], ['kling-v3', 'Kling 3.0 Omni']]) assert.equal(CATALOGUE[k].displayName, want);
});
await t('featured: API only, at most 5 per medium; variantOf names a model of the same medium; aliases are lower-case words', () => {
  for (const md of media) { const f = Object.entries(CATALOGUE).filter(([k, c]) => MODELS[k].medium === md && c.featured); assert.ok(f.length >= 1 && f.length <= 5, `${md}: ${f.length} featured`);
    for (const [k, c] of f) assert.equal(c.home, 'api', `${k}: featured but not an API model`); }
  for (const [k, c] of Object.entries(CATALOGUE)) { if (c.variantOf) { assert.ok(CATALOGUE[c.variantOf], `${k}: variantOf ${c.variantOf}`); assert.equal(MODELS[c.variantOf].medium, MODELS[k].medium); assert.ok(variantsOf(c.variantOf).includes(k)); }
    for (const a of c.aliases ?? []) assert.equal(a, a.toLowerCase(), `${k}: alias ${a}`); }
  assert.deepEqual(variantsOf('z-image-turbo').sort(), ['opensoul', 'z-image']);
});
await t('listings carry the catalogue: /api/tools models[] (modelsBlock) and /api/models/registry', () => {
  const tool = getTool('create-image')!; const ms = R.modelsBlock(tool, []);
  assert.ok(ms.length > 10);
  for (const m of ms) { for (const f of ['displayName', 'bestFor', 'rank', 'home', 'featured', 'popular', 'aliases', 'releasedAt', 'maker', 'caps', 'variantOf', 'variants']) assert.ok(f in m, `${m.key}: ${f}`);
    assert.equal(m.rank, CATALOGUE[m.key].rank); assert.equal(m.bestFor, CATALOGUE[m.key].bestFor); assert.equal(typeof m.caps.summary === 'string' || m.caps.summary === null, true); }
  const gpt = ms.find((m) => m.key === 'gpt-image'); assert.ok(gpt.featured && gpt.maker === 'openai' && /Edit/.test(gpt.caps.summary), JSON.stringify(gpt.caps));
  assert.equal(ms.find((m) => m.key === 'flux-2-dev').releasedAt, '2025-11-25'); // sourced dates only (releaseDates.ts)
  const v = R.modelsBlock(getTool('h3-video')!, []).find((m) => m.key === 'seedance-2.0'); assert.match(v.caps.summary, /1080p · 4–15 s · Sound/);
  const reg = R.registryView(); const z = reg.models.find((m: any) => m.key === 'z-image'); assert.equal(z.catalogue.variantOf, 'z-image-turbo'); assert.equal(z.catalogue.home, 'gpu');
});
await t('API-first order today: Create Image models by rank put every API model before every GPU model', () => {
  const ms = R.modelsBlock(getTool('create-image')!, []).sort((a: any, b: any) => a.rank - b.rank); const homes = ms.map((m: any) => m.home).join(',');
  assert.match(homes, /^(api,)+(gpu,?)+$/, homes); assert.equal(ms[0].key, 'gpt-image-2.5-flare'); // newest flagship first (2026-10-22)
  console.log('   create-image:', ms.map((m: any) => m.displayName).join(' · '));
});
await t('task 12: every model NOT_ON_ROUTER is Coming soon (COMING_SOON), never Ready — keys or not', () => {
  for (const id of Object.keys(NOT_ON_ROUTER)) { assert.ok(COMING_SOON[id], `${id} not in COMING_SOON`); const r = routesFor(id)[0]; assert.ok(r.comingSoon, `${id}: native route not coming soon`); }
  for (const [toolId, key] of [['create-image', 'hunyuan-image-3.5'], ['create-image', 'meta-muse-image'], ['voice', 'fish-audio-s2.1-pro'], ['audio', 'sonilo-music']] /* HeyGen Voice runs on Comfy Router since 2026-10-31 (heygen/starfish) */) {
    const m = R.modelsBlock(getTool(toolId)!, []).find((x: any) => x.key === key); assert.ok(m, `${toolId}/${key}`); assert.equal(m.state, 'coming-soon', `${toolId}/${key}: ${m.state}`); }
});
await t('2026-10-31: HeyGen Voice is no longer Coming soon; the four new Router video models are API rows with a catalogue entry', () => {
  assert.equal(NOT_ON_ROUTER['api-heygen-tts'], undefined); assert.equal(COMING_SOON['api-heygen-tts'], undefined); assert.ok(!routesFor('api-heygen-tts')[0].comingSoon);
  const hv = R.modelsBlock(getTool('voice')!, []).find((x: any) => x.key === 'heygen-voice'); assert.ok(hv, 'voice/heygen-voice'); assert.notEqual(hv.state, 'coming-soon', `heygen-voice: ${hv.state}`);
  const vids = R.modelsBlock(getTool('h3-video')!, []);
  for (const [key, variantOf] of [['veo-3.1-lite', 'veo-3.1'], ['wan-3.0-prime', 'wan-3.0'], ['p-video-2', undefined], ['grok-imagine-video-1.5-lite', undefined]] as const) {
    const m = vids.find((x: any) => x.key === key); assert.ok(m, `h3-video/${key}`); assert.equal(m.home, 'api', `${key} home`); assert.ok(m.displayName && m.bestFor, `${key}: name + best-for`);
    assert.notEqual(m.section, 'featured', `${key}: never featured on arrival`); assert.ok(!m.lifecycle, `${key}: no lifecycle`); if (variantOf) assert.equal(m.variantOf, variantOf, `${key} variantOf`); }
  for (const key of ['veo-3.1', 'veo-3.1-fast']) { const m = vids.find((x: any) => x.key === key); assert.ok(m, key); assert.notEqual(m.lifecycle, 'retiring', `${key}: the released Router id is not retiring`); }
});
await t('task 5: models[] carry a section, sorted Featured → API → Local → Coming soon, rank inside; ≤ 5 featured; isNew from releasedAt', () => {
  for (const tool of listTools()) {
    const order = R.sectionOrderFor(tool); // Video Upscale: Local first (shared/videoUpscale.ts VUP_ORDER), every other tool SECTION_ORDER
    const ms = R.modelsBlock(tool, []); if (!ms.length) continue;
    for (const m of ms) assert.ok(order.includes(m.section), `${tool.id}/${m.key}: section ${m.section}`);
    for (let i = 1; i < ms.length; i++) { const a = ms[i - 1], b = ms[i]; const d = order.indexOf(a.section) - order.indexOf(b.section);
      assert.ok(d < 0 || (d === 0 && (a.rank ?? 999) <= (b.rank ?? 999)), `${tool.id}: ${a.key} (${a.section}, ${a.rank}) before ${b.key} (${b.section}, ${b.rank})`); }
    const f = ms.filter((m: any) => m.section === 'featured'); assert.ok(f.length <= R.FEATURED_MAX, `${tool.id}: ${f.length} featured`);
    for (const m of f) { assert.equal(m.home, 'api', `${tool.id}/${m.key}: featured but home ${m.home}`); assert.notEqual(m.lifecycle, 'retiring', `${tool.id}/${m.key}: retiring featured`); }
    for (const m of ms.filter((x: any) => x.section === 'soon')) assert.equal(m.rowStatus.kind, 'coming_soon', `${tool.id}/${m.key}: soon but ${m.rowStatus.kind}`);
    for (const m of ms) assert.equal(typeof m.isNew, 'boolean');
  }
  const ci = R.modelsBlock(getTool('create-image')!, []); assert.deepEqual(ci.filter((m: any) => m.section === 'featured').map((m: any) => m.key), ['gpt-image-2.5-flare', 'nano-banana-2.1', 'gpt-image', 'nano-banana-2', 'seedream-5.0-pro']);
  assert.ok(ci.findIndex((m: any) => m.section === 'gpu') > ci.findIndex((m: any) => m.key === 'wan-image-2.5'), 'Local models after the API models');
  const day = 86_400_000, now = Date.parse('2026-10-22T00:00:00Z');
  assert.equal(R.isNewModel('2026-09-01', now), true); assert.equal(R.isNewModel('2026-08-01', now), false); assert.equal(R.isNewModel(null, now), false); assert.equal(R.isNewModel(new Date(now + day).toISOString(), now), false);
});
console.log(`ALL OK model-catalogue (${ok})`); process.exit(0);
