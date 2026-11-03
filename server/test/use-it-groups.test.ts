// The viewer's "Use it in…" groups (web/src/shared/useItGroups.ts, 2026-11-03): a hand-off sits under the page it opens, so video tools
// (Camera Moves, Photo FX, Turn into a video, UGC Ad, Orbit Shot) are under "Make it move", never "Edit the picture".
// Run: npx tsx test/use-it-groups.test.ts   (no server, no network)
import assert from 'node:assert/strict';
import { useItGroupOf, USE_IT_TITLE } from '../../web/src/shared/useItGroups.ts';
import { toolHandoffHref } from '../../web/src/shared/workflowLinks.ts';
const ok = (m: string) => console.log('ok ' + m);
const g = (id: string) => useItGroupOf(id, toolHandoffHref({ id, route: `/tools/${id}` }, 'fromJob=j1&out=0'));

for (const id of ['camera', 'photo-fx', 'h3-video', 'app-transition', 'app-ugc-ad', 'app-orbit-shot']) assert.equal(g(id), 'Video', `${id} → Make it move`);
ok('video tools: Make it move');
for (const id of ['app-character-sheet', 'app-product-shot', 'app-face-swap', 'app-remove-bg', 'app-expand', 'app-erase', 'app-image-vector', 'app-image-layers', 'image-upscale']) assert.equal(g(id), 'Picture', `${id} → Edit the picture`);
ok('picture tools (Image to vector and Image to layers too): Edit the picture');
assert.equal(g('three-d'), '3D');
assert.equal(useItGroupOf('voice', '/tools/voice?fromJob=j1'), 'Sound'); assert.equal(useItGroupOf('x', '/audio?workflow=translate'), 'Sound');
assert.equal(useItGroupOf('upscale', '/tools/upscale?fromJob=j1'), 'Video', 'an old /tools link still sorts by its tool');
assert.deepEqual(Object.values(USE_IT_TITLE), ['Edit the picture', 'Make it move', 'Sound and voice', '3D']);
ok('3D, sound, old links; titles in plain words');
