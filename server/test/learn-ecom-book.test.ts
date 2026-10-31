// The e-commerce pop-up book (2026-10-24): web/src/learn/ecomChapters.ts (chapters, Try-it links), ecomArt.ts (picture slots),
// diagrams.ts (hotspot anchors), the /learn/ai-ecommerce route as its own lazy chunk, the Explore card, and the ?prompt= prefill.
// Run: npx tsx test/learn-ecom-book.test.ts
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const { CHAPTERS, tryHref, tryHrefWith, BOOK_PATH } = await import('../../web/src/learn/ecomChapters.ts');
const { ECOM_ART, ART_CAPTION } = await import('../../web/src/learn/ecomArt.ts');
const { IMAGE_FEATURES } = await import('../src/shared/imageFeatures.ts');
const { AUDIO_PAGE, AUDIO_WORKFLOW_IDS } = await import('../src/shared/audioWorkflows.ts');
const { VIDEO_PAGE } = await import('../src/shared/videoWorkflows.ts');
const ok = (m: string) => console.log('ok ' + m);
const web = (p: string) => readFileSync(new URL(`../../web/${p}`, import.meta.url), 'utf8');

assert.equal(BOOK_PATH, '/learn/ai-ecommerce');
assert.ok(CHAPTERS.length >= 6 && CHAPTERS.length <= 8, '6 to 8 chapters');
assert.deepEqual(CHAPTERS.map((c) => c.n), CHAPTERS.map((_, i) => i + 1), 'numbered in order');
assert.equal(new Set(CHAPTERS.map((c) => c.id)).size, CHAPTERS.length, 'unique ids');
ok(`${CHAPTERS.length} chapters`);

// Try it: an existing tool page, the chapter's prompt, a model the page knows; local models first (H3 for video, priced on the page)
const TOOL_PAGES = new Set(['/image', VIDEO_PAGE, AUDIO_PAGE]);
const LOCAL = new Set(['z-image-turbo', 'flux-2-klein-4b', 'qwen-image-2.1', 'qwen-image-2.1-turbo', 'yue2']);
const VIDEO_OK = new Set(['minimax-h3']);
for (const c of CHAPTERS) {
  assert.ok(c.lesson.length >= 2 && c.prompts.length >= 2 && c.prompts.length <= 3, `${c.id}: lesson and 2-3 prompts`);
  assert.ok(c.why && c.cost.local && c.cost.cloud && c.cost.time, `${c.id}: tip and cost hint`);
  assert.ok(c.hotspots.length >= 2 && c.hotspots.length <= 4, `${c.id}: 2-4 hotspots`);
  c.prompts.forEach((_, i) => {
    const u = new URL(tryHrefWith(c, i), 'http://x');
    assert.ok(TOOL_PAGES.has(u.pathname), `${c.id}: ${u.pathname} is a tool page`);
    assert.equal(u.searchParams.get('prompt'), c.prompts[i], `${c.id}: prompt ${i + 1} goes in`);
    const m = u.searchParams.get('model'); assert.ok(m && (LOCAL.has(m) || (u.pathname === VIDEO_PAGE && VIDEO_OK.has(m))), `${c.id}: model ${m} is local (or H3 for video)`);
    const wf = u.searchParams.get('workflow');
    if (wf) assert.ok(u.pathname === AUDIO_PAGE ? AUDIO_WORKFLOW_IDS.includes(wf) : IMAGE_FEATURES.some((f) => f.route === `/image?workflow=${wf}`), `${c.id}: workflow ${wf} exists`);
    const mode = u.searchParams.get('mode'); if (mode) assert.ok(IMAGE_FEATURES.some((f) => f.route === `/image?mode=${mode}`), `${c.id}: mode ${mode} exists`);
  });
  assert.equal(tryHref(c), tryHrefWith(c, 0));
  for (const m of c.more ?? []) assert.ok(/^\/(tools\/[\w-]+|image|audio|3d|video|canvas|spend)(\?|$)/.test(m.to), `${c.id}: more link ${m.to}`);
}
ok('every Try it opens an existing tool page with its prompt and a local model');

// the paid options the book names stay few (at most two cloud image models)
const cloudImage = new Set(CHAPTERS.flatMap((c) => (c.more ?? []).map((m) => new URL(m.to, 'http://x').searchParams.get('model')).filter((m): m is string => !!m && !LOCAL.has(m))));
assert.ok(cloudImage.size <= 2, `cloud image models named: ${[...cloudImage]}`);
ok('at most two cloud image models');

// hotspots: unique per chapter, each has an anchor in its diagram; the tour only looks at real hotspots
const diag = web('src/learn/diagrams.ts');
for (const c of CHAPTERS) {
  const ids = c.hotspots.map((h) => h.id); assert.equal(new Set(ids).size, ids.length, `${c.id}: unique hotspot ids`);
  const block = diag.slice(diag.indexOf(`case '${c.diagram}':`)); const body = block.slice(0, block.indexOf('break;'));
  for (const id of ids) assert.match(body, new RegExp(`A\\('${id}'`), `${c.id}: anchor for ${id}`);
  for (const s of c.tour) { if (s.at) assert.ok(ids.includes(s.at), `${c.id}: tour shot at ${s.at}`); assert.ok(s.caption && s.seconds > 0); }
  for (const a of c.art) assert.ok(a in ECOM_ART && ART_CAPTION[a], `${c.id}: art slot ${a}`);
}
ok('hotspot anchors, tour shots and art slots line up');

// art: one data file maps slot → image URL; a filled slot points at a same-origin file that exists
for (const [slot, url] of Object.entries(ECOM_ART)) if (url) { assert.match(url, /^\/learn\/ecom\/[\w-]+\.(webp|png|jpe?g)$/, slot); assert.ok(existsSync(new URL(`../../web/public${url}`, import.meta.url)), `${slot} file`); }
ok('art slots');

// route: its own lazy chunk; nothing imports the book statically
const chunks = web('src/platform/routeChunks.ts');
assert.match(chunks, /learnEcom: once\(\(\) => import\('\.\.\/learn\/EcomBook'\)\)/); assert.match(chunks, /'\/learn\/ai-ecommerce': 'learnEcom'/);
assert.match(web('src/platform/router.tsx'), /'\/learn\/ai-ecommerce': \['AI for e-commerce', LearnEcom/);
for (const f of ['src/App.tsx', 'src/ui/Home.tsx', 'src/platform/router.tsx']) assert.doesNotMatch(web(f), /from '\.\.?\/(learn\/)?(EcomBook|bookEngine)'/, `${f} has no static import of the book`);
assert.doesNotMatch(web('src/learn/EcomBook.tsx'), /^import (?!type )[^\n]*from '\.\/bookEngine'/m, 'three.js loads on demand inside the chunk');
ok('/learn/ai-ecommerce is a lazy chunk');

// Explore: the footer's Learn column links the book as Guides (shared/footerLinks.ts, which Home's footer renders)
const { footerCols } = await import('../../web/src/shared/footerLinks.ts'); const learn = footerCols('https://x').find(([h]) => h === 'Learn')?.[1] ?? [];
assert.deepEqual(learn[0], ['Guides', BOOK_PATH], 'the footer links the book (Learn, Guides)');
assert.match(web('src/ui/Home.tsx'), /footerCols\(/, 'Explore renders the shared footer columns');
ok('Explore footer link');

// prefill: ?prompt= fills the bar (and is removed from the URL), nothing else
const pre = web('src/shared/usePrefill.ts'); assert.match(pre, /const pText = q\.get\('prompt'\)/); assert.match(pre, /q\.delete\('prompt'\)|\['prompt'(, '\w+')*\]\.forEach\(k => q\.delete\(k\)\)/, '?prompt= is removed from the URL (c30b30e2: with aspect and duration, in one forEach)'); assert.match(pre, /refUrl\|prompt(\|aspect\|duration)?(\|recipe)?(\|attach)?\)=/, 'a later ?prompt= on the same page re-runs the prefill (c30b30e2 added aspect / duration)');
ok('?prompt= prefill');
