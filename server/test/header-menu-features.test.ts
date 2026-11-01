// Header mega panel Features column (Image / Video / Audio / 3D): at most 10 rows in the hand-picked order (web/src/ui/headerMenus.ts
// MENU_FEATURE_ORDER), every listed id is a real image feature / video workflow, and an unknown id is skipped quietly.
// Run: npx tsx test/header-menu-features.test.ts
import assert from 'node:assert/strict';
const { MENU_FEATURE_ORDER, MAX_FEATURES, menuFeatureRows } = await import('../../web/src/ui/headerMenus.ts');
const { IMAGE_FEATURES } = await import('../src/shared/imageFeatures.ts');
const { VIDEO_WORKFLOWS, VIDEO_FLOW_SHORTCUTS } = await import('../src/shared/videoWorkflows.ts');
const ok = (m: string) => console.log('ok ' + m);

assert.equal(MAX_FEATURES, 10);
assert.deepEqual(MENU_FEATURE_ORDER.image, ['create-image', 'edit-image', 'upscale', 'relight', 'character-sheet', 'face-swap', 'product-shot', 'camera-angles']);
// Explore rework (2026-10-26): the real flows first; Direct a Shot, Loop, Morph, Exploded view and New angle are flow shortcuts (VIDEO_FLOW_SHORTCUTS)
assert.deepEqual(MENU_FEATURE_ORDER.video, ['create', 'direct-a-shot', 'loop', 'morph', 'exploded-view', 'new-angle', 'motion-control', 'object-swap', 'lip-sync', 'extend']);
assert.deepEqual(MENU_FEATURE_ORDER['3d'], ['plan-a-shot', 'image-to-3d', 'text-to-3d', 'multiview-to-3d', 'turntable'], '3D: Direct a Shot first; roadmap rows only in the picker');
assert.equal(MENU_FEATURE_ORDER.audio, null, 'Audio keeps its own order');
for (const id of MENU_FEATURE_ORDER.image!) assert.ok(IMAGE_FEATURES.some((f) => f.id === id), `image feature ${id} exists`);
for (const id of MENU_FEATURE_ORDER.video!) assert.ok([...VIDEO_WORKFLOWS, ...VIDEO_FLOW_SHORTCUTS].some((w) => w.id === id), `video workflow or flow shortcut ${id} exists`);
for (const w of VIDEO_FLOW_SHORTCUTS) { assert.ok(!VIDEO_WORKFLOWS.some((x) => x.id === w.id), `${w.id}: a shortcut id never shadows a workflow`); assert.match(w.href, /^\/(tools\/|video\?|3d\?)/, `${w.id}: opens a tool page`); }
ok('every configured id exists');

const rows = (ids: string[]) => ids.map((key) => ({ key }));
const vid = rows([...VIDEO_WORKFLOWS, ...VIDEO_FLOW_SHORTCUTS].map((w) => w.id).reverse());
assert.deepEqual(menuFeatureRows('video', vid).map((r) => r.key), MENU_FEATURE_ORDER.video, 'config order wins over the list order');
assert.deepEqual(menuFeatureRows('video', rows(['loop', 'gone', 'create'])).map((r) => r.key), ['create', 'loop'], 'missing ids skipped quietly');
assert.deepEqual(menuFeatureRows('video', []), [], 'empty list');
assert.deepEqual(menuFeatureRows('audio', rows(['a', 'b', 'c'])).map((r) => r.key), ['a', 'b', 'c'], 'no config: list order kept');
assert.equal(menuFeatureRows('audio', rows(Array.from({ length: 20 }, (_, i) => `x${i}`))).length, MAX_FEATURES, 'capped at 10');
assert.equal(menuFeatureRows('image', rows([...MENU_FEATURE_ORDER.image!, 'create-image'])).length, MENU_FEATURE_ORDER.image!.length, 'a duplicate key shows once');
ok('rows: order, skip, cap');

// Audio (2026-10-24): the Audio menu lists the audio workflows (shared/audioWorkflows.ts) in their own order, each opening /audio?workflow=<id>
const { AUDIO_WORKFLOW_IDS, audioRoute } = await import('../src/shared/audioWorkflows.ts');
const aud = rows(AUDIO_WORKFLOW_IDS);
assert.deepEqual(menuFeatureRows('audio', aud).map((r) => r.key), AUDIO_WORKFLOW_IDS.slice(0, MAX_FEATURES), 'audio workflows, in their order');
assert.equal(audioRoute('voiceover'), '/audio?workflow=voiceover');
ok('audio menu: the audio workflows');

// Canvas (2026-10-24): a plain header tab after 3D, its own lazy chunk; the Shell builds it from headerMenus CANVAS_NAV
const { CANVAS_NAV } = await import('../../web/src/ui/headerMenus.ts');
assert.equal(CANVAS_NAV.to, '/canvas'); assert.equal(CANVAS_NAV.label, 'Canvas');
const { readFileSync } = await import('node:fs'); const web = (p: string) => readFileSync(new URL(`../../web/src/${p}`, import.meta.url), 'utf8');
const shell = web('ui/Shell.tsx'); assert.ok(shell.indexOf('CANVAS_NAV.to, CANVAS_NAV.label') > shell.indexOf('<MediaTrigger id="3d"'), 'Canvas comes after 3D');
const chunks = web('platform/routeChunks.ts'); assert.match(chunks, /canvas: once\(\(\) => import\('\.\.\/canvas\/CanvasPage'\)\)/); assert.match(chunks, /'\/canvas': 'canvas'/);
assert.ok(!/from 'tldraw'/.test(shell + chunks + web('App.tsx') + web('platform/router.tsx')), 'tldraw is imported only inside web/src/canvas');
ok('canvas tab: after 3D, lazy chunk, no tldraw outside the canvas folder');
