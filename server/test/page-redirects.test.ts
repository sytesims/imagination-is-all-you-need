// Clean addresses (2026-10-31): Image, Audio and 3D live at /image, /audio and /3d, like Video at /video (shared/pages.ts).
// Old /tools/create-image, /tools/audio and /tools/3d links (and the old sub-tool pages) land on the new address with every query param and
// the hash kept; the new addresses never redirect (no loop); the tool ids stay create-image, audio and three-d.
// Run: npx tsx test/page-redirects.test.ts
import assert from 'node:assert/strict';
const P = await import('../src/shared/pages.ts');
const { IMAGE_REDIRECTS, featureForPath } = await import('../src/shared/imageFeatures.ts');
const { VIDEO_REDIRECTS, videoRedirect } = await import('../src/shared/videoWorkflows.ts');
const { audioRedirectTarget, audioRoute } = await import('../src/shared/audioWorkflows.ts');
const { threeDRedirectTarget, threeDRoute } = await import('../src/shared/threeD.ts');
const { redirectTarget, recreateHref, toolOpenHref, pageToolId } = await import('../../web/src/shared/workflowLinks.ts');
const ok = (m: string) => console.log('ok ' + m);

/** The web router's chain (web/src/platform/router.tsx canonTo / canonPath), minus the self-host and /apps aliases. */
const REDIRECTS = { ...IMAGE_REDIRECTS, ...VIDEO_REDIRECTS };
const route = (p: string, s = '', h = '') => redirectTarget(p, s, h, REDIRECTS) ?? videoRedirect(p, s, h) ?? audioRedirectTarget(p, s, h) ?? threeDRedirectTarget(p, s, h);

// one place says where each page lives; the tool ids are unchanged
assert.deepEqual([P.IMAGE_PAGE, P.VIDEO_PAGE, P.AUDIO_PAGE, P.THREE_D_PAGE], ['/image', '/video', '/audio', '/3d']);
assert.deepEqual([P.IMAGE_TOOL, P.VIDEO_TOOL, P.AUDIO_TOOL, P.THREE_D_TOOL], ['create-image', 'h3-video', 'audio', 'three-d']);
await import('../src/tools/apps.ts'); const { getTool } = await import('../src/tools/registry.ts');
for (const [id, page] of Object.entries(P.TOOL_PAGES)) {
  assert.equal(getTool(id)?.route, page, `tool ${id} lives at ${page}`); assert.equal(P.toolPage(id), page); assert.equal(P.pageTool(page), id); assert.equal(P.pageTool(`${page}/`), id);
}
assert.equal(P.toolPage('voice'), '/tools/voice', 'other tools keep /tools/<id>'); assert.equal(P.pageTool('/tools/create-image'), undefined); assert.equal(P.pageTool('/images'), undefined);
assert.equal(featureForPath('/image')?.id, 'create-image', 'the Image page is Create Image');
ok('pages.ts: /image, /video, /audio, /3d; tool ids and registry routes match');

// old addresses → the new one, every query param and the hash kept, case and trailing slash tolerated
const MOVED: [old: string, search: string, hash: string, want: string][] = [
  ['/tools/create-image', '', '', '/image'],
  ['/tools/create-image', '?model=nano-banana-2&look=golden-haze', '#x', '/image?model=nano-banana-2&look=golden-haze#x'],
  ['/TOOLS/CREATE-IMAGE/', '?workflow=relight&recreate=j1', '', '/image?workflow=relight&recreate=j1'],
  ['/tools/create-image', '?mode=edit&fromJob=j2&out=1&as=ref', '', '/image?mode=edit&fromJob=j2&out=1&as=ref'],
  ['/tools/create-image', '?prompt=a%20fox%20%26%20a%20hen&preset=p1&showcase=s1', '', '/image?prompt=a%20fox%20%26%20a%20hen&preset=p1&showcase=s1'],
  ['/tools/audio', '', '', '/audio'],
  ['/tools/audio', '?workflow=sfx&model=elevenlabs-sound-effects', '#y', '/audio?workflow=sfx&model=elevenlabs-sound-effects#y'],
  ['/tools/audio/', '?workflow=translate&recreate=a4', '', '/audio?workflow=translate&recreate=a4'],
  ['/tools/audio', '?mode=voice&from=j3', '#z', `${audioRoute('voiceover')}&from=j3#z`],
  ['/tools/audio', '?mode=music', '', audioRoute('music')],
  ['/tools/3d', '', '', '/3d'],
  ['/tools/3d', '?workflow=turntable&recreate=d2', '#w', '/3d?workflow=turntable&recreate=d2#w'],
  ['/Tools/3D/', '?workflow=image-to-3d&fromJob=a&out=1', '', '/3d?workflow=image-to-3d&fromJob=a&out=1'],
];
for (const [old, s, h, want] of MOVED) assert.equal(route(old, s, h), want, `${old}${s}${h}`);
ok(`${MOVED.length} old Image / Audio / 3D links land on the new address with their query and hash`);

// the old sub-tool pages land straight on the new address with their workflow
const SUB: [old: string, search: string, want: string][] = [
  ['/tools/app-relight', '?fromJob=j1', '/image?workflow=relight&fromJob=j1'], ['/tools/image-upscale', '?fromJob=j1&out=0', '/image?workflow=upscale&fromJob=j1&out=0'],
  ['/tools/edit-image', '?image=u', '/image?mode=edit&image=u'], ['/soul', '', '/image'], ['/tools/app-inpaint', '', '/image?workflow=brush-edit'],
  ['/tools/voice', '?mode=translate', audioRoute('translate')], ['/tools/soundtrack', '?mode=v2s', audioRoute('soundtrack-sound')],
  ['/tools/three-d', '?fromJob=j1', '/3d?fromJob=j1'], ['/tools/turntable', '', threeDRoute('turntable')], ['/tools/plan-a-shot', '?preset=open-city', `${threeDRoute('plan-a-shot')}&preset=open-city`],
];
for (const [old, s, want] of SUB) assert.equal(route(old, s), want, `${old}${s}`);
ok(`${SUB.length} old sub-tool pages land on /image, /audio or /3d with their workflow`);

// the new addresses are final: nothing redirects them again (no loop, no extra history entry)
for (const page of ['/image', '/audio', '/3d']) for (const q of ['', '?model=x', '?workflow=relight&recreate=j1', '?fromJob=j1&out=0', '?view=a'])
  assert.equal(route(page, q), null, `${page}${q} is final`);
for (const [old, s, h] of MOVED) { const to = route(old, s, h)!; const u = new URL(to, 'http://x'); assert.equal(route(u.pathname, u.search, u.hash), null, `${to} is final`); }
ok('/image, /audio and /3d never redirect; every redirect target is final');

// links the app makes: Recreate, open and the page's tool
assert.equal(recreateHref({ id: 'i1', toolId: 'create-image', input: {} }), '/image?recreate=i1');
assert.equal(recreateHref({ id: 'a1', toolId: 'audio', input: { types: ['sfx'] } }), '/audio?workflow=sfx&recreate=a1');
assert.equal(recreateHref({ id: 'd1', toolId: 'three-d', input: {} }), '/3d?workflow=image-to-3d&recreate=d1');
assert.equal(toolOpenHref({ id: 'create-image' }), '/image'); assert.equal(toolOpenHref({ id: 'audio' }), '/audio'); assert.equal(toolOpenHref({ id: 'three-d' }), '/3d');
assert.equal(pageToolId('/image', ''), 'create-image'); assert.equal(pageToolId('/audio', '?workflow=sfx'), 'audio'); assert.equal(pageToolId('/3d', ''), 'three-d');
assert.equal(pageToolId('/tools/voice', ''), 'voice', 'other tools: the path');
ok('Recreate, open links and the page tool use the new addresses');
console.log('PASS page-redirects');
