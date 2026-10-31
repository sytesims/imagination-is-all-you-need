// Image tab shows every image (2026-10-26, the Video tab's All view for the Image tab): plain Create (the landing) lists All images, every job whose
// OUTPUT is an image from any tool, tab, Canvas or MCP (Create, Edit, Brush Edit, Expand, Upscale, Character Sheet, Image to layers, Soul, saved
// video frames, Photo FX stills, 3D posters), running first; Filter › Type is defined once (imageFeed IMAGE_FEED_GROUPS); a workflow never filters;
// Filter › From › Uploads (Image and Video) lists your own files from the media library, not jobs.
// Run: npx tsx test/image-tab-all.test.ts   (temp data dir, no server, no network)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'imagetab-')); process.env.OPENHIGGSFIELD_DATA_DIR = D; process.env.OPENHIGGSFIELD_ENV_FILE = path.join(D, 'none.env'); process.env.OPENHIGGSFIELD_BACKEND = 'mock';
const { IMAGE_FEATURES } = await import('../src/shared/imageFeatures.ts');
const { WORKFLOW_CATEGORY_OF } = await import('../src/shared/workflows.ts');
const { IMAGE_LANDING_FEED, IMAGE_FEED_GROUPS, IMAGE_FEED_IDS, ALL_IMAGE_FEED, imageFeedOf, inImageFeed, isImageJob, imageWorkflowNameOf } = await import('../src/shared/imageFeed.ts');
const { UPLOADS_GROUP } = await import('../src/shared/mediaFeed.ts');
const { VIDEO_FEED_GROUPS, inVideoFeed, isVideoJob } = await import('../src/shared/videoFeed.ts');
const { serverParams, matches, liveExtras, mergeLiveJobs, imageScope, emptyTextFor, feedCompare, typeGroups, FILTER_DEFAULT } = await import('../../web/src/ui/next/feed/feedFilter.ts');
const WEB = path.resolve(import.meta.dirname, '../../web/src'); const src = (f: string) => fs.readFileSync(path.join(WEB, f), 'utf8');
const ok = (m: string) => console.log('ok ' + m);
let n = 0; const img = (o: any) => ({ id: `i${++n}`, status: 'done', provider: 'mock', input: {}, outputs: [{ label: 'out', url: `/files/i${n}.png` }], resultUrl: `/files/i${n}.png`, createdAt: 1_000 + n, updatedAt: 1_000 + n, ...o }) as any;
const vid = (o: any) => img({ outputs: [{ url: `/files/v${n}.mp4` }], resultUrl: `/files/v${n}.mp4`, ...o });
const running = (o: any) => img({ status: 'running', outputs: [], resultUrl: null, progress: 0.4, ...o });

// ---- the rule: output is an image, whatever made it ----
const every = {
  create: img({ toolId: 'create-image' }), edit: img({ toolId: 'create-image', input: { types: '["edit"]' } }), inpaint: img({ toolId: 'app-inpaint' }), expand: img({ toolId: 'app-expand' }),
  upscale: img({ toolId: 'image-upscale' }), sheet: img({ toolId: 'app-character-sheet' }), layers: img({ toolId: 'app-image-layers' }), soul: img({ toolId: 'soul' }),
  frame: img({ toolId: 'video-frame', provider: 'local-ffmpeg' }), photoFx: img({ toolId: 'photo-fx' }), poster: img({ toolId: 'plan-a-shot' }), canvas: img({ toolId: 'create-image', input: { source: 'canvas' } }),
  lens: img({ toolId: 'create-image', input: { camera: '{"body":"x"}' } }), relight: img({ toolId: 'app-relight' }), product: img({ toolId: 'app-product-shot' }),
};
for (const [k, j] of Object.entries(every)) { assert.equal(isImageJob(j), true, `${k} is an image`); assert.equal(inImageFeed(j, IMAGE_LANDING_FEED), true, `${k} is in All images`); assert.equal(isVideoJob(j), false, `${k} is not a video`); }
const notImg = { clip: vid({ toolId: 'h3-video' }), fxClip: vid({ toolId: 'photo-fx' }), song: img({ toolId: 'audio', outputs: [{ url: '/files/s.mp3' }], resultUrl: '/files/s.mp3' }), model3d: img({ toolId: 'three-d', outputs: [{ url: '/files/m.glb' }], resultUrl: '/files/m.glb' }) };
for (const [k, j] of Object.entries(notImg)) assert.equal(inImageFeed(j, IMAGE_LANDING_FEED), false, `${k} stays out of the Image tab`);
// running (no output yet): what the tool makes
for (const t of ['create-image', 'soul', 'image-upscale', 'app-relight', 'app-expand', 'app-image-layers', 'app-character-sheet']) { assert.equal(isImageJob(running({ toolId: t })), true, `${t} running is an image`); assert.equal(isVideoJob(running({ toolId: t })), false, `${t} running is not a video`); }
for (const t of ['h3-video', 'motion-transfer', 'photo-fx', 'audio', 'app-music-bed', 'three-d']) assert.equal(isImageJob(running({ toolId: t })), false, `${t} running is not an image`);
assert.equal(isVideoJob(running({ toolId: 'app-music-bed' })), false, 'a sound app is never a video while running');
ok('All images = every job whose output is an image (Create, Edit, Brush Edit, Expand, Upscale, Character Sheet, layers, Soul, saved frames, Photo FX stills, 3D posters, Canvas); running by tool; clips, sound and 3D models stay out');

// ---- the landing, live jobs from anywhere, running first ----
assert.equal(IMAGE_LANDING_FEED, ALL_IMAGE_FEED);
const LAND = imageScope(IMAGE_LANDING_FEED); assert.deepEqual(serverParams(FILTER_DEFAULT, null, LAND), { imageFeed: 'all', order: 'desc' });
assert.deepEqual(serverParams(FILTER_DEFAULT, 'p1', imageScope('relight')), { imageFeed: 'relight', order: 'desc', project: 'p1' });
assert.equal(imageScope('nope').imageFeed, 'all', 'an unknown id falls back to All images');
const elsewhere = running({ toolId: 'app-expand', id: 'ex1', createdAt: 10, updatedAt: 9_000 }); const clipRun = running({ toolId: 'h3-video', id: 'v1' });
const own = [img({ toolId: 'create-image', id: 'c1', createdAt: 5_000 })];
const live = mergeLiveJobs(own, [elsewhere, clipRun], []);
const ctx = { seen: new Set(['c1']), at: 10_000, hasMore: false, since: 0, gone: new Set<string>(), f: FILTER_DEFAULT, project: null, scope: LAND, patch: {} };
assert.deepEqual(liveExtras(live, ctx).jobs.map((j) => j.id), ['ex1'], 'an Expand run started elsewhere joins at once; the video run does not');
assert.equal(matches(elsewhere, FILTER_DEFAULT, null, imageScope('group:edit')), true); assert.equal(matches(elsewhere, FILTER_DEFAULT, null, imageScope('group:upscale')), false);
const order = [own[0], elsewhere, img({ toolId: 'create-image', id: 'q1', status: 'queued', createdAt: 1 }), img({ toolId: 'create-image', id: 'd9', createdAt: 9_999 })].sort(feedCompare(-1)).map((j) => j.id);
assert.deepEqual(order, ['ex1', 'q1', 'd9', 'c1'], 'running, then queued, then newest first');
const ic = src('ui/next/ImageCanvas.tsx');
assert.match(ic, /useLiveJobs\(p\.jobs\)/, 'the Image feed watches every active job'); assert.match(ic, /useFeedState\(live, \{ scope: SCOPE \}\)/);
assert.match(ic, /const SCOPE: FeedScope = imageScope\(ALL_IMAGE_FEED\)/, 'one feed always: only Filter narrows it (user, 2026-10-26)');
assert.deepEqual(serverParams({ ...FILTER_DEFAULT, group: 'group:frames' }, null, LAND), { imageFeed: 'group:frames', order: 'desc' }, 'Filter › Type › Frames');
ok('the Image tab landing asks for imageFeed=all; runs started anywhere join live; running → queued → newest');

// ---- chips: defined once, from the workflow picker's categories ----
assert.deepEqual(IMAGE_FEED_GROUPS.map((g) => g.label), ['All', 'Create', 'Edit', 'Upscale', 'People', 'Product', 'Camera', 'Effects', '3D', 'Frames', 'Uploads'], 'the groups, in order');
assert.deepEqual(typeGroups(IMAGE_FEED_GROUPS).map((g) => g.id.replace('group:', '')), ['all', 'create', 'edit', 'upscale', 'people', 'product', 'camera', 'effects', '3d', 'frames'], 'Filter › Type ids (fd-type-*): Uploads is a From choice');
for (const cat of ['people', 'product', 'camera']) assert.deepEqual(IMAGE_FEED_GROUPS.find((g) => g.id === `group:${cat}`)!.workflows, IMAGE_FEATURES.filter((f) => WORKFLOW_CATEGORY_OF[f.id] === cat).map((f) => f.id), `${cat}: the picker's category`);
for (const g of IMAGE_FEED_GROUPS.slice(1)) assert.ok(IMAGE_FEED_IDS.includes(g.id), `${g.id} is a server imageFeed id`);
const chip = (j: any) => IMAGE_FEED_GROUPS.slice(1).filter((g) => inImageFeed(j, g.id)).map((g) => g.label);
assert.deepEqual(chip(every.create), ['Create']); assert.deepEqual(chip(every.soul), ['Create']); assert.deepEqual(chip(every.canvas), ['Create']);
assert.deepEqual(chip(every.edit), ['Edit']); assert.deepEqual(chip(every.inpaint), ['Edit']); assert.deepEqual(chip(every.expand), ['Edit']); assert.deepEqual(chip(every.layers), ['Edit']);
assert.deepEqual(chip(every.upscale), ['Edit', 'Upscale'], 'an upscale is also an Edit'); assert.deepEqual(chip(every.sheet), ['People']); assert.deepEqual(chip(every.product), ['Product']);
assert.deepEqual(chip(every.lens), ['Camera']); assert.deepEqual(chip(every.photoFx), ['Effects']); assert.deepEqual(chip(every.poster), ['3D']); assert.deepEqual(chip(every.frame), ['Frames']);
assert.equal(imageWorkflowNameOf(every.frame), 'Video frame'); assert.equal(imageWorkflowNameOf(every.inpaint), 'Brush Edit'); assert.equal(imageWorkflowNameOf(every.edit), 'Edit Image'); assert.equal(imageWorkflowNameOf(every.photoFx), 'Photo FX');
assert.equal(emptyTextFor(FILTER_DEFAULT, null, imageScope('group:upscale')), 'No upscaled images yet.'); assert.equal(emptyTextFor(FILTER_DEFAULT, 'p', imageScope('relight')), 'No Relight images in this project yet.');
assert.equal(emptyTextFor(FILTER_DEFAULT, null, LAND), 'No images yet.'); assert.equal(imageFeedOf('group:nope'), null);
ok('Type All · Create · Edit · Upscale · People · Product · Camera · Effects · 3D · Frames · Uploads; every image tool sits in its chip');

// ---- a workflow only changes the bar: no toggle, no reset; its chip is outlined as a hint ----
assert.equal(inImageFeed(every.relight, 'relight'), true); assert.equal(inImageFeed(every.create, 'relight'), false); assert.equal(inImageFeed(every.lens, 'camera-lens'), true); assert.equal(inImageFeed(every.lens, 'create-image'), false);
assert.doesNotMatch(ic, /<ScopeSwitch/, 'no This workflow / All images switch in the Image tab'); assert.doesNotMatch(ic, /\[wfFeed\]\)/, 'picking a workflow never resets the chip');
assert.doesNotMatch(ic, /FeedGroupChips|hintGroup|imageScopeOf\(group\)|useState<string>\(ALL_IMAGE_FEED\)/, 'no chip row, no hint outline, no local group state');
assert.match(ic, /<FeedToolbar f=\{filt\} setF=\{setFilt\} groups=\{IMAGE_FEED_GROUPS\} noun="images"/, 'the shared toolbar: Filter › Type is the Image groups');
ok('one feed always: a workflow changes the bar only; Filter › Type narrows the feed');

// ---- Uploads: one chip in both tabs, the media library, never jobs ----
assert.equal(IMAGE_FEED_GROUPS.at(-1)!.id, UPLOADS_GROUP); assert.equal(VIDEO_FEED_GROUPS.at(-1)!.id, UPLOADS_GROUP); assert.equal(VIDEO_FEED_GROUPS.at(-1)!.label, 'Uploads');
for (const j of [...Object.values(every), vid({ toolId: 'h3-video' })]) { assert.equal(inImageFeed(j, UPLOADS_GROUP), false); assert.equal(inVideoFeed(j, UPLOADS_GROUP), false); }
const scope = src('ui/next/feed/FeedScope.tsx');
assert.match(scope, /fetchMedia\(\{ tab: 'uploads', type: media/, 'Uploads reads GET /api/media?tab=uploads (no second store)');
assert.match(ic, /useUploads\('image', pj\.pid, filt, upOn\)/); assert.match(src('ui/video/VideoFeed.tsx'), /useUploads\('video', pj\.pid, filt, upOn\)/);
const { uploadUses, uploadTag } = await import('../../web/src/ui/next/feed/uploadLinks.ts');
assert.deepEqual(uploadUses({ type: 'image', url: '/files/upl-a.png' }).map((u: any) => u.k), ['ref', 'start', 'upscale']);
assert.deepEqual(uploadUses({ type: 'video', url: '/files/upl-b.mp4' }).map((u: any) => u.k), ['motion', 'extend', 'upscale']);
assert.match(uploadUses({ type: 'image', url: '/files/upl-a.png' })[1].href, /^\/video\?refUrl=%2Ffiles%2Fupl-a\.png&as=start$/);
assert.match(uploadUses({ type: 'video', url: '/files/upl-b.mp4' })[0].href, /workflow=motion-control&refUrl=%2Ffiles%2Fupl-b\.mp4$/);
assert.equal(uploadTag({ label: 'Video frame' }), 'Video frame'); assert.equal(uploadTag({ label: null }), 'Upload');
const { recordUpload, listMedia } = await import('../src/mediaLibrary.ts');
fs.writeFileSync(path.join(D, 'upl-aaaa.png'), 'png'); fs.writeFileSync(path.join(D, 'upl-bbbb.mp4'), 'mp4');
recordUpload({ id: 'upl-aaaa', url: '/files/upl-aaaa.png', name: 'me.png', type: 'image', createdAt: 1 }); recordUpload({ id: 'upl-bbbb', url: '/files/upl-bbbb.mp4', name: 'walk.mp4', type: 'video', createdAt: 2 });
assert.deepEqual((await listMedia({ tab: 'uploads', type: 'image' })).items.map((i: any) => i.name), ['me.png']);
assert.deepEqual((await listMedia({ tab: 'uploads', type: 'video' })).items.map((i: any) => i.name), ['walk.mp4']);
/* a job's result given to another run (Save frame's source clip) is a generation, never an upload */
{ const { jobs: J } = await import('../src/jobs.ts'); fs.writeFileSync(path.join(D, 'abcd1234-out0.mp4'), 'another clip');
  J.set('fr1', { id: 'fr1', toolId: 'video-frame', status: 'done', input: { videoUrl: '/files/abcd1234-out0.mp4' }, outputs: [], createdAt: 3, updatedAt: 3 } as any);
  assert.deepEqual((await listMedia({ tab: 'uploads', type: 'video' })).items.map((i: any) => i.name), ['walk.mp4'], 'a generated clip used as an input stays out of Uploads'); J.delete('fr1'); }
ok('Filter › From › Uploads in Image and Video: your files from the media library (image / video), marked as uploads, with Use in… hand-offs');

// ---- the server list honours imageFeed ----
const { jobs } = await import('../src/jobs.ts'); const { filterJobList } = await import('../src/routesEdge.ts');
const seeded = [every.create, every.frame, every.photoFx, running({ toolId: 'app-relight', id: 'rl-run' }), notImg.clip, notImg.fxClip, every.upscale];
for (const j of seeded) jobs.set(j.id, j);
const list = (qq: any) => { const r = filterJobList(qq); assert.ok(!('error' in r), JSON.stringify(r)); return (r as any).all.map((j: any) => j.toolId) as string[]; };
assert.deepEqual(list({ imageFeed: 'all', status: 'done,queued,running,needs_decision' }).sort(), ['app-relight', 'create-image', 'image-upscale', 'photo-fx', 'video-frame']);
assert.deepEqual(list({ imageFeed: 'group:frames' }), ['video-frame']); assert.deepEqual(list({ imageFeed: 'relight', status: 'running' }), ['app-relight']);
assert.deepEqual(list({ imageFeed: 'group:uploads' }), [], 'uploads are not jobs');
const bad = filterJobList({ imageFeed: 'nope' }); assert.ok('error' in bad && bad.error.field === 'imageFeed');
ok('GET /api/jobs?imageFeed=all lists every image incl. frames, Photo FX stills and a running Relight; chips and workflows narrow; unknown → 400');
