// A studio turned off in Plugins leaves no dead ends (2026-11-07): web/src/shared/studioLinks.ts finds the studio a link opens, from the
// server's tool → studio map (GET /api/ui toolStudio = tools/builtin.ts BUILTIN_TOOL_STUDIO). The router shows "<Studio> is off" for it, and
// the header tabs, hand-offs (Turn to video, Continue, Send to…), Explore and Workflows cards hide (shared/plugins.ts linkOn, router Link).
// Run: npx tsx test/studio-links.test.ts   (no server, no network)
import assert from 'node:assert/strict';
import { studioOfHref, studiosOfHref } from '../../web/src/shared/studioLinks.ts';
import { BUILTIN_TOOL_STUDIO, GALLERY_BASE_STUDIO } from '../src/tools/builtin.ts';
import { frameHandoffHref, lipSyncHandoffHref, toolHandoffHref, recreateHref, directShotHref } from '../../web/src/shared/workflowLinks.ts';
const ok = (m: string) => console.log('ok ' + m);
const map: Record<string, string> = Object.fromEntries(BUILTIN_TOOL_STUDIO);
const s = (href: string) => studioOfHref(href, map);

// the four pages and their workflows
assert.equal(s('/image'), 'studio-image'); assert.equal(s('/image?workflow=relight&fromJob=j1'), 'studio-image', 'the Image page itself');
assert.equal(s('/video'), 'studio-video'); assert.equal(s('/video/'), 'studio-video'); assert.equal(s('/video?workflow=extend'), 'studio-video');
assert.equal(s('/video?workflow=stitch'), null, 'Stitch (ffmpeg here, no studio tool) stays open');
assert.equal(s('/audio'), 'studio-audio'); assert.equal(s('/audio?workflow=translate'), 'studio-audio');
assert.equal(s('/3d'), 'studio-3d'); assert.equal(s('/3d?workflow=turntable'), 'studio-3d');
ok('Image, Video, Audio and 3D pages belong to their studio');

// Edit's workflows live on the Video page but belong to the Edit studio
for (const w of ['reframe', 'finish', 'footage-fx', 'prompt-edit']) assert.equal(s(`/video?workflow=${w}`), 'studio-edit', w);
assert.equal(s('/video?workflow=lip-sync'), 'studio-audio', 'Lip Sync runs the voice tool (Audio)');
ok('a workflow belongs to the studio of the tool it runs (Edit on the Video page, Lip Sync on Audio)');

// the hand-off links the viewer builds
assert.equal(s(frameHandoffHref('j1', 0, 'last')), 'studio-video', 'Continue');
assert.equal(s(frameHandoffHref('j1', 0, 2.5, true)), 'studio-video', 'Use frame');
assert.equal(s(lipSyncHandoffHref('j1')), 'studio-audio', 'Make it talk');
assert.equal(s(`/video?fromJob=j1&as=image&out=0`), 'studio-video', 'Turn to video');
assert.equal(s(toolHandoffHref({ id: 'app-relight' }, 'fromJob=j1&out=0')), 'studio-image', 'Relight opens the Image page');
assert.equal(s(toolHandoffHref({ id: 'finish' }, 'fromJob=j1&out=0')), 'studio-edit', 'Send to Finish');
assert.equal(s(directShotHref('j1')), 'studio-3d');
assert.equal(s(recreateHref({ id: 'j1', toolId: 'audio', input: { types: ['music'] } })!), 'studio-audio');
assert.equal(s(recreateHref({ id: 'j1', toolId: 'h3-video' })!), 'studio-video');
ok('Turn to video, Continue, Use frame, Make it talk, Send to, Direct a Shot and Recreate find their studio');

// /tools/<id> pages: own tools, aliases and the Apps gallery
assert.equal(s('/tools/soundtrack?from=j1&out=0'), 'studio-audio'); assert.equal(s('/tools/face-swap'), 'studio-video', 'an alias');
assert.equal(s('/tools/app-inpaint?fromJob=j1'), 'apps-gallery');
assert.equal(s('/tools/not-a-tool'), null, 'unknown tool: no studio (the 404 stays)');
ok('/tools/<id>: own tools, aliases, gallery apps; unknown ids belong to none');

// pages no studio owns never hide
for (const h of ['/', '/assets', '/jobs/j1', '/canvas', '/film', '/workflows', '/workflows/relight', '/plugins', '/settings#conn-fal', '/tools', 'https://github.com/x', '#top', '/models/flux'])
  assert.equal(s(h), null, h);
assert.equal(studioOfHref('/video', {}), null, 'an older server without toolStudio: everything counts as on');
ok('Assets, a job, Canvas, Film, Workflows, Plugins, outside links: no studio; no map: nothing hides');

// a gallery recipe needs its base's studio too (toolNeeds): Brush Edit (app-inpaint) runs Create Image
const needs: Record<string, string> = Object.fromEntries(GALLERY_BASE_STUDIO);
assert.deepEqual(studiosOfHref('/tools/app-inpaint?fromJob=j1', map, needs), ['apps-gallery', 'studio-image']);
assert.deepEqual(studiosOfHref('/image?workflow=relight', map, needs), ['studio-image'], 'the Image page runs Create Image');
assert.deepEqual(studiosOfHref('/assets', map, needs), []);
ok('gallery recipes need the Apps gallery and their base studio');

// every studio has at least one tool in the map (a new studio needs no web change)
for (const id of ['studio-video', 'studio-image', 'studio-audio', 'studio-3d', 'studio-edit', 'apps-gallery']) assert.ok(Object.values(map).includes(id), id);
ok('the map covers every studio');
