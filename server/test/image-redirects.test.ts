// Image menu → Create Image workflows (QA #2, #13, #14): Relight, Face Swap, Person Swap, Character Sheet and Product Shot open
// /tools/create-image?workflow=<id>, their old pages redirect there with the query kept (?fromJob=…, ?recreate=…), send-to links skip the
// redirect hop, and the Workflows page has an image Upscale card beside "Video Upscale".
// Run: npx tsx test/image-redirects.test.ts
import assert from 'node:assert/strict';
const { IMAGE_REDIRECTS, MENU_FEATURES, featureById } = await import('../src/shared/imageFeatures.ts');
const { redirectTarget, withSearch, toolHandoffHref, toolOpenHref, workflowOpenHref, workflowCardTools, workflowCardName } = await import('../../web/src/shared/workflowLinks.ts');
const ok = (m: string) => console.log('ok ' + m);

const FIVE: [feature: string, toolId: string, old: string[]][] = [
  ['relight', 'app-relight', ['/tools/app-relight']],
  ['face-swap', 'app-face-swap', ['/tools/app-face-swap']],
  ['person-swap', 'app-person-swap', ['/tools/person-swap', '/tools/app-person-swap', '/tools/character-swap']],
  ['character-sheet', 'app-character-sheet', ['/tools/app-character-sheet']],
  ['product-shot', 'app-product-shot', ['/tools/app-product-shot']],
];
for (const [id, toolId, old] of FIVE) {
  const want = `/tools/create-image?workflow=${id}`; const f = featureById(id)!;
  assert.equal(f.route, want, `${id}: menu route`); assert.ok(MENU_FEATURES.some((m) => m.id === id && m.route === want), `${id}: in the Image menu`);
  assert.equal(workflowOpenHref(toolId), want, `${id}: workflowOpenHref agrees`);
  for (const p of old) {
    assert.equal(IMAGE_REDIRECTS[p], want, `${p} redirects`);
    assert.equal(redirectTarget(p, '?fromJob=j1&out=2', '', IMAGE_REDIRECTS), `${want}&fromJob=j1&out=2`, `${p}: fromJob kept`);
    assert.equal(redirectTarget(`${p}/`, '?recreate=j9', '#x', IMAGE_REDIRECTS), `${want}&recreate=j9#x`, `${p}/: recreate + hash kept`);
    assert.equal(redirectTarget(p.toUpperCase(), '', '', IMAGE_REDIRECTS), want, `${p}: case-insensitive, no query`);
  }
}
ok('5 workflows: menu → Create Image ?workflow=<id>; every old path redirects there with query and hash kept');

// 2026-10-23: Brush Edit, Camera Angles and Camera & Lens moved into the bar: their pages (and the app-* aliases) redirect with fromJob / recreate / refUrl kept
const THREE: [feature: string, toolId: string | null, old: string[]][] = [
  ['brush-edit', 'app-inpaint', ['/tools/brush-edit', '/tools/app-inpaint', '/tools/inpaint']],
  ['camera-angles', 'app-shots', ['/tools/camera-angles', '/tools/app-shots', '/tools/shots']],
  ['camera-lens', null, ['/tools/camera-lens']],
];
for (const [id, toolId, old] of THREE) {
  const want = `/tools/create-image?workflow=${id}`; assert.equal(featureById(id)!.route, want, `${id}: menu route`); assert.ok(MENU_FEATURES.some((m) => m.id === id && m.route === want), `${id}: in the Image menu`);
  if (toolId) assert.equal(workflowOpenHref(toolId), want, `${id}: card link`);
  for (const p of old) {
    assert.equal(IMAGE_REDIRECTS[p], want, `${p} redirects`);
    assert.equal(redirectTarget(p, '?fromJob=j1&out=2', '', IMAGE_REDIRECTS), `${want}&fromJob=j1&out=2`, `${p}: fromJob kept`);
    assert.equal(redirectTarget(p, '?recreate=j9', '', IMAGE_REDIRECTS), `${want}&recreate=j9`, `${p}: recreate kept`);
    assert.equal(redirectTarget(p, '?refUrl=%2Ffiles%2Fa.png', '', IMAGE_REDIRECTS), `${want}&refUrl=%2Ffiles%2Fa.png`, `${p}: refUrl kept`);
  }
}
assert.equal(toolHandoffHref({ id: 'app-inpaint', route: '/tools/brush-edit' }, 'fromJob=j1&out=0'), '/tools/create-image?workflow=brush-edit&fromJob=j1&out=0', 'Inpaint hand-off skips the redirect hop');
ok('Brush Edit, Camera Angles, Camera & Lens: old pages and app-* aliases redirect to the bar with fromJob / recreate / refUrl kept');

// /tools/face-swap stays the video Object Swap alias (App.tsx), not an image redirect
assert.equal(IMAGE_REDIRECTS['/tools/face-swap'], undefined); assert.equal(redirectTarget('/tools/create-image', '?x=1', '', IMAGE_REDIRECTS), null);
assert.equal(withSearch('/tools/create-image?mode=edit', ''), '/tools/create-image?mode=edit'); assert.equal(withSearch('/a', 'b=1'), '/a?b=1'); assert.equal(withSearch('/a', '?b=1'), '/a?b=1');
assert.equal(redirectTarget('/tools/edit-image', '?image=u', '', IMAGE_REDIRECTS), '/tools/create-image?mode=edit&image=u'); assert.equal(IMAGE_REDIRECTS['/tools/image-upscale'], '/tools/create-image?workflow=upscale');
ok('non-image paths untouched; edit-image and Upscale redirects unchanged');

// Send to (#13): hand-offs to Relight / image Upscale go straight to Create Image with the workflow; other tools keep their page
assert.equal(toolHandoffHref({ id: 'app-relight', route: '/tools/app-relight' }, 'fromJob=j1&out=0'), '/tools/create-image?workflow=relight&fromJob=j1&out=0');
assert.equal(toolHandoffHref({ id: 'image-upscale' }, 'fromJob=j1&out=0'), '/tools/create-image?workflow=upscale&fromJob=j1&out=0');
assert.equal(toolHandoffHref({ id: 'h3-video', route: '/video' }, 'fromJob=j1&out=0'), '/video?fromJob=j1&out=0');
assert.equal(toolOpenHref({ id: 'app-inpaint', route: '/tools/brush-edit' }), '/tools/create-image?workflow=brush-edit');
ok('send-to links: Relight and image Upscale open Create Image with the workflow and the image hand-off');

// Workflows page (#14): an image Upscale card, and the video one is "Video Upscale"
{
  await import('../src/tools/apps.ts'); const { listTools } = await import('../src/tools/registry.ts');
  const cards = workflowCardTools(listTools() as any[]); const ids = cards.map((t) => t.id);
  assert.ok(ids.includes('image-upscale'), 'image Upscale card'); assert.ok(ids.includes('upscale'), 'video Upscale card');
  assert.equal(workflowCardName({ id: 'upscale', name: 'Upscale' }), 'Video Upscale'); assert.equal(workflowCardName({ id: 'image-upscale', name: 'Upscale' }), 'Upscale');
  assert.equal(new Set(cards.map((t) => workflowCardName(t).toLowerCase())).size, cards.length, 'one card per name');
  assert.equal(workflowOpenHref('image-upscale'), '/tools/create-image?workflow=upscale');
  ok(`Workflows page: ${cards.length} cards incl. image Upscale (opens Create Image) and Video Upscale`);
}
