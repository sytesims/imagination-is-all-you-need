// Generate Video shows results like Create Image (2026-10-24): the Video tab renders the shared result feed (ui/next/feed: FeedCard,
// FeedGallery, useFeedState, the shared viewer), not its own stage or grid; Image uses the same card; the feed lists one tool's clips
// (toolId scope); clip cards take their shape, poster and length from the job.
// Run: npx tsx test/video-feed.test.ts   (no server, no network)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path';
import { serverParams, matches, emptyTextFor, FILTER_DEFAULT } from '../../web/src/ui/next/feed/feedFilter.ts';
import { videoOutOf, askedAr, videoTag } from '../../web/src/ui/next/feed/feedMedia.ts';
const ok = (m: string) => console.log('ok ' + m);
const WEB = path.resolve(import.meta.dirname, '../../web/src'); const src = (f: string) => fs.readFileSync(path.join(WEB, f), 'utf8');

// ---- the Video tab renders the shared feed ----
const studio = src('ui/video/VideoStudio.tsx'); const vfeed = src('ui/video/VideoFeed.tsx'); const image = src('ui/next/ImageCanvas.tsx');
assert.match(studio, /<VideoFeed\b/, 'VideoStudio renders VideoFeed'); assert.doesNotMatch(studio, /vs-hgrid|vs-hist-stage|vs-htile/, 'no old stage or own grid');
assert.doesNotMatch(studio + vfeed, /vs-empty|show up here|EmptyState/, 'no separate empty page: the feed is always the feed (2026-10-27)');
for (const shared of ['FeedCard', 'FeedGallery', 'useFeedState', 'useFeedViewer', 'FeedToolbar', 'SelectBar', 'GenTile', 'FeedCaption', 'FailedViewer'])
  assert.match(vfeed, new RegExp(`\\b${shared}\\b`), `VideoFeed uses the shared ${shared}`);
assert.match(vfeed, /<ResultView variant="viewer"/, 'a clip opens in the shared result viewer');
for (const shared of ['<FeedCard', '<FeedGallery', 'useFeedState(', 'useFeedViewer(']) assert.ok(image.includes(shared), `Create Image uses the same ${shared}`);
ok('Video renders the shared feed (card, gallery, toolbar, select bar, viewer); Image uses the same card and gallery');

// ---- the viewer keeps the old stage's actions ----
const app = src('tools/app/AppTool.tsx');
for (const id of ['vv-more', 'vv-same-seed', 'vv-render-final', 'extend-${n}s']) assert.ok(app.includes(id), `viewer action ${id}`);
const h3 = app.slice(app.indexOf("if (tool.id === 'h3-video') {"), app.indexOf("if (tool.id === 'create-image') {"));
assert.match(h3, /viewerActions=\{videoViewerActions\}/); assert.doesNotMatch(h3, /stage=\{stageEl\}/, 'no "Your result is ready" stage on Video');
ok('Generate more, Re-run same seed, Render final and +5s / +10s sit in the viewer');

// ---- a one-tool feed (toolId scope) ----
const V = { toolId: 'h3-video', media: 'video' as const };
assert.deepEqual(serverParams(FILTER_DEFAULT, null, V), { toolId: 'h3-video', order: 'desc' });
assert.equal(serverParams(FILTER_DEFAULT, null).features, '*', 'Image keeps every image feature');
assert.equal(serverParams({ ...FILTER_DEFAULT, show: 'failed' }, 'p1', V).status, 'failed,blocked'); assert.equal(serverParams({ ...FILTER_DEFAULT, show: 'failed' }, 'p1', V).project, 'p1');
const job = (o: any) => ({ id: 'j', status: 'done', toolId: 'h3-video', input: { prompt: 'a fox' }, ...o }) as any;
assert.equal(matches(job({}), FILTER_DEFAULT, null, V), true); assert.equal(matches(job({ toolId: 'create-image' }), FILTER_DEFAULT, null, V), false, 'another tool’s job stays out');
assert.equal(emptyTextFor(FILTER_DEFAULT, null, V), 'No clips yet.'); assert.match(emptyTextFor({ ...FILTER_DEFAULT, show: 'liked' }, null, V), /No liked clips/);
ok('the Video feed lists only its own clips, with the same filters (liked, failed, project, search)');

// ---- clip cards: shape, poster, length, chip ----
const out = videoOutOf(job({ outputs: [{ kind: 'video', url: '/files/a.mp4', width: 720, height: 1280, durationSec: 5, posterUrl: '/api/media/poster?url=%2Ffiles%2Fa.mp4' }] }))!;
assert.equal(out.url, '/files/a.mp4'); assert.equal(out.ar, 720 / 1280); assert.equal(out.sec, 5); assert.match(out.poster, /^\/api\/media\/poster/);
const bare = videoOutOf(job({ resultUrl: '/files/b.mp4', input: { aspect: '1:1', duration: 10 } }))!; assert.equal(bare.ar, 1); assert.equal(bare.sec, 10); assert.equal(bare.poster, '/api/media/poster?url=%2Ffiles%2Fb.mp4');
assert.equal(videoOutOf(job({ status: 'running' })), null); assert.equal(askedAr(job({ input: { aspect: '9:16' } })), 9 / 16); assert.equal(askedAr(job({ input: {} })), 16 / 9);
assert.equal(videoTag(job({ input: { mode: 't2v' } })), '', 'plain text to video: no chip'); assert.equal(videoTag(job({ input: { mode: 'i2v' } })), 'Image to video');
assert.equal(videoTag(job({ input: { mode: 't2v', cameraMove: 'dolly-in' } })), 'Dolly in');
ok('a clip card takes its shape (9:16, 1:1, 16:9), poster and length from the job; running cards keep the asked shape; the chip names the look or mode');
