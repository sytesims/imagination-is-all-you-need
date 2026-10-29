// One Video page (2026-10-23): Edit Video, Motion Control, Lip Sync and every video tool page open /tools/h3-video?workflow=<id>;
// old URLs (with their query and hash) redirect there, every workflow runs on a registered tool, and send-to links skip the redirect hop.
// Run: npx tsx test/video-redirects.test.ts
import assert from 'node:assert/strict';
const { VIDEO_WORKFLOWS, VIDEO_REDIRECTS, VIDEO_PAGE, videoRedirect, videoWorkflowHref, videoWorkflowById, videoWorkflowOfTool, isPanelWorkflow } = await import('../src/shared/videoWorkflows.ts');
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
assert.equal(VIDEO_REDIRECTS['/tools/h3-video'], undefined, 'the Video page itself does not redirect'); ok(`${OLD.length} old video pages redirect to their workflow with query and hash kept`);

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
assert.equal(videoRedirect('/tools/h3-video', '?tab=motion'), '/tools/h3-video?workflow=motion-control');
assert.equal(videoRedirect('/tools/h3-video/', '?tab=motion&fromJob=j1', '#r'), '/tools/h3-video?workflow=motion-control&fromJob=j1#r');
assert.equal(videoRedirect('/tools/h3-video', '?tab=create&recreate=j2'), '/tools/h3-video?recreate=j2', 'other old tab values just drop the tab');
assert.equal(videoRedirect('/tools/h3-video', '?workflow=reshoot'), null, 'a new URL is left alone'); assert.equal(videoRedirect('/tools/h3-video', ''), null);
assert.equal(videoRedirect('/tools/voice', '?mode=lipsync'), '/tools/h3-video?workflow=lip-sync&mode=lipsync');
assert.equal(videoRedirect('/tools/voice', '?mode=lipsync&fromJob=j3'), '/tools/h3-video?workflow=lip-sync&mode=lipsync&fromJob=j3');
assert.equal(videoRedirect('/tools/voice', '?mode=voiceover'), null, 'the other voice modes stay on the Audio page'); assert.equal(videoRedirect('/tools/voice', ''), null);
assert.equal(videoRedirect('/tools/edit-video/reshoot', ''), '/tools/h3-video?workflow=reshoot'); assert.equal(videoRedirect('/tools/edit-video/h3-extend', '?a=1'), '/tools/h3-video?workflow=extend&a=1');
assert.equal(videoRedirect('/tools/edit-video/whatever', ''), '/tools/h3-video?workflow=edit-video');
assert.equal(videoRedirect('/tools/create-image', '?tab=motion'), null, 'other pages untouched');
ok('?tab=motion, /tools/voice?mode=lipsync and /tools/edit-video/<x> redirect; everything else is left alone');

// links skip the redirect hop: a video tool opens its workflow; Lip Sync and the Edit Video list are not a tool's default
assert.equal(toolOpenHref({ id: 'reshoot', route: '/tools/reshoot' }), '/tools/h3-video?workflow=reshoot');
assert.equal(toolOpenHref({ id: 'motion-transfer', route: '/tools/motion-transfer' }), '/tools/h3-video?workflow=motion-control');
assert.equal(toolOpenHref({ id: 'h3-video', route: '/tools/h3-video' }), '/tools/h3-video');
assert.equal(toolOpenHref({ id: 'voice', route: '/tools/voice' }), '/tools/voice', 'the voice tool keeps the Audio page');
assert.equal(toolHandoffHref({ id: 'h3-extend', route: '/tools/h3-extend' }, 'fromJob=j1&out=0'), '/tools/h3-video?workflow=extend&fromJob=j1&out=0');
assert.equal(videoWorkflowOfTool('voice'), undefined); assert.equal(videoWorkflowOfTool('camera')!.id, 'camera-moves');
ok('send-to and open links go straight to the workflow');
