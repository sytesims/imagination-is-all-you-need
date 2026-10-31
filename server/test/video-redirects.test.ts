// One Video page (2026-10-23): Edit Video, Motion Control, Lip Sync and every video tool page open /video?workflow=<id>;
// old URLs (with their query and hash) redirect there, every workflow runs on a registered tool, and send-to links skip the redirect hop.
// Run: npx tsx test/video-redirects.test.ts
import assert from 'node:assert/strict';
const { VIDEO_WORKFLOWS, VIDEO_REDIRECTS, VIDEO_PAGE, OLD_VIDEO_PAGE, VIDEO_TOOL, videoRedirect, videoWorkflowHref, videoWorkflowById, videoWorkflowOfTool, isPanelWorkflow } = await import('../src/shared/videoWorkflows.ts');
const { IMAGE_REDIRECTS } = await import('../src/shared/imageFeatures.ts');
const { redirectTarget, toolHandoffHref, toolOpenHref } = await import('../../web/src/shared/workflowLinks.ts');
const ok = (m: string) => console.log('ok ' + m);

// every workflow runs on a registered tool, ids are unique, each has three How it works steps and its inputs
await import('../src/tools/apps.ts'); const { listTools } = await import('../src/tools/registry.ts');
/** tools that come from plugins/ at server start (not in the registry this test loads) */
const PLUGIN_TOOLS = new Set(['cutout']);
const tools = new Map((listTools() as any[]).map((t) => [t.id, t]));
assert.equal(new Set(VIDEO_WORKFLOWS.map((w) => w.id)).size, VIDEO_WORKFLOWS.length, 'unique ids');
for (const w of VIDEO_WORKFLOWS) {
  if (w.surface === 'edit-hub') assert.equal(w.toolId, '', 'Edit Video is a list, no tool of its own');
  else if (isPanelWorkflow(w)) assert.equal(w.toolId, 'compose', 'Stitch runs POST /api/compose, not a registry tool');
  else assert.ok(tools.has(w.toolId) || PLUGIN_TOOLS.has(w.toolId), `${w.id}: tool ${w.toolId} is registered`);
  assert.equal(w.how.length, 3, `${w.id}: three How it works steps`); assert.ok(w.inputs.length > 0, `${w.id}: inputs listed`);
}
assert.equal(VIDEO_WORKFLOWS[0].id, 'create'); assert.equal(VIDEO_WORKFLOWS[0].toolId, 'h3-video'); assert.equal(videoWorkflowHref('create'), VIDEO_PAGE);
for (const id of ['edit-video', 'motion-control', 'lip-sync', 'reshoot', 'extend', 'object-swap', 'restyle', 'camera-moves', 'transitions']) assert.ok(videoWorkflowById(id), `${id} is a workflow`);
assert.equal(videoWorkflowById('motion-control')!.toolId, 'motion-transfer'); assert.equal(videoWorkflowById('lip-sync')!.toolId, 'voice');
assert.equal(videoWorkflowById('nope'), undefined); assert.equal(videoWorkflowById('')!.id, 'create');
ok(`${VIDEO_WORKFLOWS.length} video workflows, each on a registered tool (Lip Sync on voice, Motion Control on motion-transfer)`);

// old pages → the Video page with the workflow, query + hash kept, case and trailing slash tolerated
const OLD: [old: string, wf: string][] = [['/tools/edit-video', 'edit-video'], ['/tools/motion-transfer', 'motion-control'], ['/tools/reshoot', 'reshoot'], ['/tools/h3-extend', 'extend'],
  ['/tools/object-swap', 'object-swap'], ['/tools/face-swap', 'object-swap'], ['/tools/restyle', 'restyle'], ['/tools/upscale', 'upscale'], ['/tools/reframe', 'reframe'], ['/tools/remove-bg', 'remove-bg'],
  ['/tools/cutout', 'cutout'], ['/tools/sdr-hdr', 'sdr-hdr'], ['/tools/fps-boost', 'fps-boost'], ['/tools/depth-map', 'depth-map'], ['/tools/camera', 'camera-moves'], ['/tools/photo-fx', 'photo-fx'],
  ['/tools/app-orbit-shot', 'orbit-shot'], ['/tools/app-transition', 'transitions'], ['/tools/app-ugc-ad', 'ugc-ad'], ['/tools/app-anime-restyle', 'anime-restyle'], ['/tools/app-video-upscale', 'draft-upscale']];
for (const [old, wf] of OLD) {
  const want = `${VIDEO_PAGE}?workflow=${wf}`;
  assert.equal(VIDEO_REDIRECTS[old], want, `${old} redirects`);
  assert.equal(redirectTarget(old, '?fromJob=j1&out=2', '', VIDEO_REDIRECTS), `${want}&fromJob=j1&out=2`, `${old}: fromJob kept`);
  assert.equal(redirectTarget(`${old}/`, '?preset=push-slow', '#x', VIDEO_REDIRECTS), `${want}&preset=push-slow#x`, `${old}/: preset + hash kept`);
  assert.equal(redirectTarget(old.toUpperCase(), '', '', VIDEO_REDIRECTS), want, `${old}: case-insensitive`);
}
// no clash with the image table (the image Remove Background is /tools/app-remove-bg)
for (const k of Object.keys(VIDEO_REDIRECTS)) assert.equal(IMAGE_REDIRECTS[k], undefined, `${k} is not also an image redirect`);
assert.equal(VIDEO_REDIRECTS['/video'], undefined, 'the Video page itself does not redirect'); ok(`${OLD.length} old video pages redirect to their workflow with query and hash kept`);

// Director removed (2026-10-23): /tools/cinema, its /tools/director alias and any sub-path open Create Video with the query and hash kept
for (const old of ['/tools/cinema', '/tools/director']) {
  assert.equal(VIDEO_REDIRECTS[old], VIDEO_PAGE, `${old} → Create Video`);
  assert.equal(redirectTarget(old, '?fromJob=j1&mode=generate', '#x', VIDEO_REDIRECTS), `${VIDEO_PAGE}?fromJob=j1&mode=generate#x`, `${old}: query + hash kept`);
  assert.equal(redirectTarget(`${old.toUpperCase()}/`, '', '', VIDEO_REDIRECTS), VIDEO_PAGE, `${old}/: case + trailing slash`);
  assert.equal(videoRedirect(`${old}/story`, '?view=story&story=s1', '#h'), `${VIDEO_PAGE}?view=story&story=s1#h`, `${old}/<x>: sub-path, query + hash kept`);
}
assert.equal(videoRedirect('/tools/cinemax', ''), null, 'only the Director paths'); assert.equal(VIDEO_REDIRECTS['/tools/app-orbit-shot'], `${VIDEO_PAGE}?workflow=orbit-shot`, 'Orbit Shot (built on Director) keeps its workflow');
const cinema = tools.get('cinema'); assert.ok(cinema, 'the Director tool stays registered for the API, MCP and old jobs'); assert.equal(cinema.listed, false, 'Director is hidden from listings');
assert.notEqual(tools.get('app-orbit-shot')?.listed, false, 'Orbit Shot stays listed though its base is hidden');
ok('Director pages redirect to Create Video; the tool stays registered, unlisted');

// query-shaped old links: the Motion Control tab, Lip Sync on the voice page, Edit Video sub-routes
assert.equal(videoRedirect('/video', '?tab=motion'), '/video?workflow=motion-control');
assert.equal(videoRedirect('/video/', '?tab=motion&fromJob=j1', '#r'), '/video?workflow=motion-control&fromJob=j1#r');
assert.equal(videoRedirect('/video', '?tab=create&recreate=j2'), '/video?recreate=j2', 'other old tab values just drop the tab');
assert.equal(videoRedirect('/video', '?workflow=reshoot'), null, 'a new URL is left alone'); assert.equal(videoRedirect('/video', ''), null);
assert.equal(videoRedirect('/tools/voice', '?mode=lipsync'), '/video?workflow=lip-sync&mode=lipsync');
assert.equal(videoRedirect('/tools/voice', '?mode=lipsync&fromJob=j3'), '/video?workflow=lip-sync&mode=lipsync&fromJob=j3');
assert.equal(videoRedirect('/tools/voice', '?mode=voiceover'), null, 'the other voice modes stay on the Audio page'); assert.equal(videoRedirect('/tools/voice', ''), null);
assert.equal(videoRedirect('/tools/edit-video/reshoot', ''), '/video?workflow=reshoot'); assert.equal(videoRedirect('/tools/edit-video/h3-extend', '?a=1'), '/video?workflow=extend&a=1');
assert.equal(videoRedirect('/tools/edit-video/whatever', ''), '/video?workflow=edit-video');
assert.equal(videoRedirect('/image', '?tab=motion'), null, 'other pages untouched');
ok('?tab=motion, /tools/voice?mode=lipsync and /tools/edit-video/<x> redirect; everything else is left alone');

// the Video page's address (2026-10-31): /video; the old /tools/h3-video keeps working with every query param, the tool id stays h3-video
assert.equal(VIDEO_PAGE, '/video'); assert.equal(OLD_VIDEO_PAGE, '/tools/h3-video'); assert.equal(VIDEO_TOOL, 'h3-video');
assert.equal(tools.get('h3-video')?.route, '/video', 'Create Video (tool h3-video) lives at /video');
assert.equal(videoRedirect('/tools/h3-video', ''), '/video'); assert.equal(videoRedirect('/tools/h3-video/', '?'), '/video');
assert.equal(videoRedirect('/tools/h3-video', '?model=kling-v3&mode=i2v', '#x'), '/video?model=kling-v3&mode=i2v#x', 'model + mode + hash kept');
for (const q of ['?template=vt-1', '?recreate=j1', '?fromJob=j1&as=image&out=0&t=last&cont=1', '?picker=1', '?workflow=extend&recreate=v2', '?prompt=a%20fox%20%26%20a%20hen'])
  assert.equal(videoRedirect('/TOOLS/H3-VIDEO', q), `/video${q}`, `${q} kept`);
assert.equal(videoRedirect('/tools/h3-video', '?tab=motion&fromJob=j1'), '/video?workflow=motion-control&fromJob=j1', 'the old Motion Control tab still lands on its workflow');
assert.equal(videoRedirect('/tools/h3-video', '?workflow=two-person-swap&recreate=r1'), '/video?workflow=two-person-swap&recreate=r1', 'a retired two-person run keeps its warning');
for (const q of ['', '?model=kling-v3', '?workflow=extend&recreate=v2']) assert.equal(videoRedirect('/video', q), null, `/video${q} is final (no loop)`);
ok('/tools/h3-video?… → /video?… with every query param kept; /video never redirects');

// links skip the redirect hop: a video tool opens its workflow; Lip Sync and the Edit Video list are not a tool's default
assert.equal(toolOpenHref({ id: 'reshoot', route: '/tools/reshoot' }), '/video?workflow=reshoot');
assert.equal(toolOpenHref({ id: 'motion-transfer', route: '/tools/motion-transfer' }), '/video?workflow=motion-control');
assert.equal(toolOpenHref({ id: 'h3-video', route: '/video' }), '/video');
assert.equal(toolOpenHref({ id: 'voice', route: '/tools/voice' }), '/tools/voice', 'the voice tool keeps the Audio page');
assert.equal(toolHandoffHref({ id: 'h3-extend', route: '/tools/h3-extend' }, 'fromJob=j1&out=0'), '/video?workflow=extend&fromJob=j1&out=0');
assert.equal(videoWorkflowOfTool('voice'), undefined); assert.equal(videoWorkflowOfTool('camera')!.id, 'camera-moves');
ok('send-to and open links go straight to the workflow');
