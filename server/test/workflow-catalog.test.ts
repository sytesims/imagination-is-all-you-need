// Workflows page catalogue (2026-10-27, redesign options ?wf=a|b|c): server/src/shared/workflowCatalog.ts.
// Every entry: one category, a real tool, an href that opens that tool's tab, model keys the tool offers, media that ships.
// Every chain step is a real entry; every skill a chain names ships under skills/. Search and counts behave.
// Run: npx tsx test/workflow-catalog.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path';
process.env.OPENHIGGSFIELD_BACKEND = 'mock';
const ok = (m: string) => console.log('ok ' + m);
const ROOT = path.resolve(import.meta.dirname, '../..');
const { WF_ENTRIES, WF_CATS, WF_CHAINS, wfEntryById, matchesQuery, entryHay, chainHay, catCounts } = await import('../src/shared/workflowCatalog.ts');
const { featuredByKey, runByJob } = await import('../src/shared/featured.ts');
const { showcaseById } = await import('../src/shared/showcase.ts');
await import('../src/tools/apps.ts'); const { getTool } = await import('../src/tools/registry.ts'); const { toolModels } = await import('../src/routing/modelRegistry.ts');
const keysOf = (id: string) => new Set(toolModels(id).map((m: any) => m.key));

assert.equal(new Set(WF_ENTRIES.map((e) => e.id)).size, WF_ENTRIES.length, 'unique ids');
assert.ok(WF_ENTRIES.length >= 30, `many workflows (${WF_ENTRIES.length})`);
const cats = new Set(WF_CATS.map((c) => c.id));
for (const e of WF_ENTRIES) {
  assert.ok(cats.has(e.cat), `${e.id}: a known category`);
  assert.ok(!e.tags.some((t) => cats.has(t as any) && t !== e.cat), `${e.id}: tags never name a second category`);
  const plugin = fs.existsSync(path.join(ROOT, 'plugins', e.toolId)); const t: any = getTool(e.toolId); assert.ok(plugin || (t && t.status !== 'soon'), `${e.id}: ${e.toolId} is a real tool (or a shipped plugin)`);
  assert.match(e.href, /^\/(image|audio|3d|video)(\?|$)/, `${e.id}: opens a tab (${e.href})`);
  const keys = keysOf(e.toolId);
  for (const k of e.models) assert.ok(keys.has(k), `${e.id}: model ${k} offered by ${e.toolId}`);
  if (e.featured) assert.ok(featuredByKey(e.featured), `${e.id}: featured ${e.featured} ships`);
  if (e.showcase) assert.ok(showcaseById(e.showcase), `${e.id}: showcase ${e.showcase} ships`);
  assert.ok(e.featured || e.showcase || e.art || e.hubId, `${e.id}: has media or our own art`);
  assert.doesNotMatch(`${e.name} ${e.line}`, /coming soon/i, `${e.id}: no coming-soon wording`);
}
ok(`${WF_ENTRIES.length} workflows: one category each, real tools, tab links, offered models, shipped media`);
const counts = catCounts(WF_ENTRIES); assert.equal(counts.reduce((a, c) => a + c.n, 0), WF_ENTRIES.length, 'counts add up');
assert.deepEqual(catCounts(WF_ENTRIES.filter((e) => e.cat === 'music')).map((c) => c.id), ['music'], 'empty categories left out');
ok(`${counts.length} categories, counts add up, empty ones hidden`);
for (const c of WF_CHAINS) {
  /* the K-drama scene is one real take (no invented Extend step), so it is the one single-step chain */
  assert.ok(c.steps.length >= 2 || c.id === 'kdrama', `${c.id}: at least two steps`);
  for (const s of c.steps) { const e = wfEntryById(s.entry); assert.ok(e, `${c.id}: step ${s.entry} is a real workflow`);
    if (s.model) assert.ok(keysOf(e!.toolId).has(s.model), `${c.id}: ${s.model} offered on ${e!.toolId}`); }
  for (const s of c.steps) for (const j of s.jobs ?? []) assert.ok(runByJob(j), `${c.id}: step run ${j} is recorded (featured.ts)`);
  if (c.skill) assert.ok(fs.existsSync(path.join(ROOT, 'skills', c.skill, 'SKILL.md')), `${c.id}: skill ${c.skill} ships`);
  if (c.featured) assert.ok(featuredByKey(c.featured), `${c.id}: featured ${c.featured}`);
}
ok(`${WF_CHAINS.length} chains: real steps, offered models, shipped skills`);
const find = (q: string) => WF_ENTRIES.filter((e) => matchesQuery(entryHay(e), q)).map((e) => e.id);
assert.ok(find('talking').includes('v-lip-sync'), 'talking finds Make it talk'); assert.ok(find('lip sync').includes('v-lip-sync'));
assert.ok(find('upscale').includes('i-upscale') && find('upscale').includes('v-upscale'), 'upscale finds both');
assert.deepEqual(find('zzqx nothing'), [], 'no results'); assert.equal(find('').length, WF_ENTRIES.length, 'empty query = all');
assert.ok(WF_CHAINS.filter((c) => matchesQuery(chainHay(c), 'sketch film')).some((c) => c.id === 'sketch-film'), 'goal search finds a chain');
ok('search by goal, by tag and with no results');
// chains name what we really ran (2026-10-27): the presenter on Qwen3 TTS + InfiniteTalk, the K-drama scene on MiniMax H3 (its own clip)
{ const c = (id: string) => WF_CHAINS.find((x) => x.id === id)!;
  assert.deepEqual(c('presenter').steps.map((s) => s.model ?? null), ['gpt-image-2.5-flare', 'qwen3-tts', 'infinitetalk-wan-2.1']);
  assert.deepEqual(c('presenter').steps.map((s) => s.jobs), [['df027961', '160c5f7a'], ['952f0862'], ['3f3fa8b8']], 'presenter: the four real runs');
  assert.equal(runByJob('df027961')!.model, 'GPT Image 2.5 Flare'); assert.equal(runByJob('3f3fa8b8')!.model, 'InfiniteTalk (Wan 2.1)');
  assert.ok(!c('presenter').steps.some((s: any) => s.showcase), 'presenter: no unrelated showcase picture');
  assert.equal(c('kdrama').featured, 'h3-kdrama-script'); assert.equal(featuredByKey('h3-kdrama-script')!.modelKey, 'minimax-h3'); assert.equal(c('kdrama').steps[0].model, 'minimax-h3');
  assert.ok(!c('kdrama').steps.some((s) => s.entry === 'v-extend'), 'K-drama: no Extend step (that scene was never extended)');
  assert.deepEqual(c('kdrama').steps.map((s) => s.jobs), [['fb0b44ca']]);
  assert.deepEqual(c('picture-3d').steps.map((s) => s.model ?? null), ['gpt-image-2.5-flare', 'cloud-tripo-31', null], 'Picture → 3D: Flare + Tripo 3.1, as Mossbun ran');
  assert.equal(c('picture-3d').steps[2].jobs, undefined, 'the turntable step stays unproven');
  /* a step says "Made here" only with a recorded run: every chain whose featured clip is shown has a run on every step but the unproven ones */
  assert.ok(c('long-take').steps.every((s) => s.jobs?.length), 'long take: both steps ran');
  ok('chains name the models and job ids of our real runs; nothing invented'); }
// ACE-Step 1.5 is not installed on the maintainer's Mac and has never run: nothing pins it as the music pick
{ const pins = [...WF_ENTRIES.flatMap((e) => e.models), ...WF_CHAINS.flatMap((c) => c.steps.map((s) => s.model))];
  assert.ok(!pins.includes('ace-step-1.5'), 'no workflow or chain step leads with ACE-Step 1.5');
  assert.equal(wfEntryById('a-music')!.models[0], 'yue2'); assert.equal(WF_CHAINS.find((x) => x.id === 'music-video')!.steps[0].model, 'yue2');
  ok('music leads with YuE2 (installed, has runs), not ACE-Step'); }
// The Workflows PAGE shows the user's picks (2026-10-28): 8 featured in order, then the kept ones; everything else stays in the catalogue
// (its tab, menus, links, search, MCP), off this page only.
{ const { WF_PAGE_FEATURED, WF_PAGE_KEEP, onWorkflowsPage, isFeaturedOnPage } = await import('../src/shared/workflowCatalog.ts');
  assert.deepEqual(WF_PAGE_FEATURED, ['chain:sketch-film', 'chain:long-take', 'v-create', 'i-character-sheet', 'v-motion-control', 'v-object-swap', 'i-image-layers', 'i-upscale'], 'the featured row, in the user’s order');
  assert.deepEqual(WF_PAGE_KEEP, ['chain:kdrama', 'v-extend', 'v-direct-a-shot', 'i-try-on', 'a-music', 'a-cover', 'a-sfx', 'a-soundtrack-music', 'a-soundtrack-sound'], 'the kept ones');
  const all = [...WF_PAGE_FEATURED, ...WF_PAGE_KEEP]; assert.equal(new Set(all).size, all.length, 'no pick twice');
  for (const id of all) assert.ok(id.startsWith('chain:') ? WF_CHAINS.some((c) => `chain:${c.id}` === id) : wfEntryById(id), `${id}: a real workflow or chain`);
  for (const id of ['chain:presenter', 'chain:product-ad', 'v-loop', 'fx-vanish', 'i-relight', 'd-image-to-3d']) { assert.equal(onWorkflowsPage(id), false, `${id}: off the page`); assert.ok(id.startsWith('chain:') ? WF_CHAINS.some((c) => `chain:${c.id}` === id) : wfEntryById(id), `${id}: still in the catalogue`); }
  assert.ok(isFeaturedOnPage('v-create') && !isFeaturedOnPage('v-extend'));
  /* no two cards on the page show the same example clip (2026-11-01: Extend and Direct a Shot no longer repeat the long take's and Sketch → Film's) */
  const clips = all.map((id) => (id.startsWith('chain:') ? WF_CHAINS.find((c) => `chain:${c.id}` === id)!.featured : wfEntryById(id)!.featured)).filter(Boolean);
  assert.equal(new Set(clips).size, clips.length, `each card its own example: ${clips.join(', ')}`);
  assert.equal(wfEntryById('i-try-on')!.models[0], 'bria-virtual-tryon', 'Try-On leads with Bria on Comfy Router');
  ok(`page picks: ${WF_PAGE_FEATURED.length} featured + ${WF_PAGE_KEEP.length} kept; ${WF_ENTRIES.length + WF_CHAINS.length - all.length} others stay in the catalogue`); }
// Credits for the picks (2026-10-28 audit): each kept workflow's lead names its graph or its hosted model, never "Ours · AGPL" for someone else's model
{ const { appWorkflowFor } = await import('../src/shared/appWorkflows.ts'); const { audioWorkflowCredit } = await import('../src/shared/audioWorkflows.ts');
  const want: [string, string, string, string | null][] = [['h3-video', 'comfy-h3', 'official', 'h3-t2v-api.json'], ['h3-extend', 'comfy-h3-extend', 'ours', 'h3-extend-api.json'],
    ['object-swap', 'comfy-h3-charswap', 'community', 'object-swap-h3-charswap-api.json'], ['plan-a-shot', 'local-previz', 'community', 'ltx25-layout-to-render-api.json'], ['motion-transfer', 'router-kling-edit', 'ours', null]];
  for (const [t, p, src, file] of want) { const w = appWorkflowFor(t, p); assert.equal(w?.source, src, `${t} ${p}`); assert.equal(w?.file ?? null, file, `${t} ${p} file`); if (file) assert.ok(fs.existsSync(path.join(ROOT, 'workflows', file)), file); }
  const bria = appWorkflowFor('app-try-on', 'router-bria-tryon')!; assert.match(bria.name, /Bria/); assert.match(bria.author, /^Bria/); assert.match(bria.licence, /Bria terms/); assert.match(String(bria.url), /docs\.comfy\.org\/.+virtual-tryon/);
  assert.match(appWorkflowFor('motion-transfer', 'router-kling-edit')!.licence, /Kling terms/, 'a hosted model is under its maker’s terms');
  assert.equal(audioWorkflowCredit('cover', 'comfy-yue2')?.file, 'audio-yue2-cover-api.json', 'Cover credits the cover template'); assert.equal(audioWorkflowCredit('sfx', 'comfy-stable-audio')?.file, 'audio-sfx-api.json');
  assert.equal(audioWorkflowCredit('soundtrack-sound', 'comfy-mmaudio')?.file, 'soundtrack-mmaudio-api.json');
  ok('picks: credits for Create Video, Extend, Character Swap, Direct a Shot, Motion Control, Try-On, Cover, Sound effects, Sound for a video'); }

// The Workflows page cards' own pictures (2026-10-28): every card with an example has one, each ships in the repo (a fresh install shows it),
// a 720×600 lossy WebP (the card's 6:5 at 2×), small, no metadata; the cards with no example (the five audio cards) keep our drawing.
{ const { WF_CARD_THUMBS, WF_CARD_BEFORE, WF_PAGE_FEATURED, WF_PAGE_KEEP } = await import('../src/shared/workflowCatalog.ts');
  const PUB = path.join(ROOT, 'web', 'public'); let total = 0;
  for (const id of [...WF_PAGE_FEATURED, ...WF_PAGE_KEEP]) {
    const e: any = id.startsWith('chain:') ? WF_CHAINS.find((c) => `chain:${c.id}` === id) : wfEntryById(id); assert.ok(e, `${id}: a real card`);
    const u = WF_CARD_THUMBS[id]; assert.equal(!!u, !!(e.featured || e.showcase || e.example), `${id}: a card picture exactly when it has a shipped example`);
    if (e.example) { assert.equal(e.example.after, u, `${id}: the sheet's example is the card's picture`); assert.equal(e.example.before, WF_CARD_BEFORE[id], `${id}: and its before`);
      assert.match(e.example.run.jobId, /^[0-9a-f]{8}$/); assert.ok(e.example.run.model && e.example.run.place && e.example.run.costUsd > 0, `${id}: the real run behind it`); }
    for (const v of [u, WF_CARD_BEFORE[id]].filter(Boolean) as string[]) { assert.match(v, /^\/examples\/workflows\/[\w-]+\.webp$/, `${id}: a shipped WebP`);
    const p = path.join(PUB, v); assert.ok(fs.existsSync(p), `${v} ships`); const b = fs.readFileSync(p); total += b.length;
    assert.equal(b.subarray(8, 16).toString(), 'WEBPVP8 ', `${v}: a plain lossy WebP (no metadata chunks)`);
    assert.deepEqual([b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff], [720, 600], `${v}: 720×600`);
    assert.ok(b.length <= 60_000, `${v}: ≤ 60 KB`); } }
  assert.ok(total <= 480_000, `card pictures stay small (${total} bytes)`);
  ok(`${Object.keys(WF_CARD_THUMBS).length} card pictures: shipped 720×600 WebPs, no metadata, ${Math.round(total / 1000)} KB in all`); }
