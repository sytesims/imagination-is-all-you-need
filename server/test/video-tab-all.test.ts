// Video tab shows every video (user, 2026-10-26): "the Video tab shows all video related generations", running ones included. A Motion Control
// run was invisible on the Video tab's landing (Create Video listed only its own clips). Now the landing lists every video from every workflow
// (VIDEO_LANDING_FEED = all), running and queued first; Filter › Type comes from the workflow picker's categories; one Video feed always
// ("one Video feed always, workflow only changes the bar"): a workflow never filters; live jobs started anywhere join at once.
// Run: npx tsx test/video-tab-all.test.ts   (temp data dir, no server, no network)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'videotab-')); process.env.OPENHIGGSFIELD_DATA_DIR = D; process.env.OPENHIGGSFIELD_ENV_FILE = path.join(D, 'none.env'); process.env.OPENHIGGSFIELD_BACKEND = 'mock';
const { VIDEO_WORKFLOWS, VIDEO_WORKFLOW_CATEGORIES } = await import('../src/shared/videoWorkflows.ts');
const { VIDEO_LANDING_FEED, VIDEO_FEED_GROUPS, VIDEO_FEED_IDS, ALL_VIDEO_FEED, videoFeedOf, inVideoFeed, isVideoJob, videoWorkflowNameOf } = await import('../src/shared/videoFeed.ts');
const { serverParams, matches, liveExtras, mergeLiveJobs, videoScope, emptyTextFor, typeGroups, FILTER_DEFAULT } = await import('../../web/src/ui/next/feed/feedFilter.ts');
const WEB = path.resolve(import.meta.dirname, '../../web/src'); const src = (f: string) => fs.readFileSync(path.join(WEB, f), 'utf8');
const ok = (m: string) => console.log('ok ' + m);
let n = 0; const job = (o: any) => ({ id: `j${++n}`, status: 'done', provider: 'mock', input: {}, outputs: [{ label: 'out', url: `/files/j${n}.mp4` }], resultUrl: `/files/j${n}.mp4`, createdAt: 1_000 + n, updatedAt: 1_000 + n, ...o }) as any;
const running = (o: any) => job({ status: 'running', outputs: [], resultUrl: null, progress: 0.4, ...o });

// ---- the landing is every video ----
assert.equal(VIDEO_LANDING_FEED, ALL_VIDEO_FEED);
const studio = src('ui/video/VideoStudio.tsx'); assert.match(studio, /<VideoFeed\b[^>]*workflowId=\{VIDEO_LANDING_FEED\}/, 'Create Video (the landing) renders the All feed');
const LAND = videoScope(VIDEO_LANDING_FEED); assert.deepEqual(serverParams(FILTER_DEFAULT, null, LAND), { videoFeed: 'all', order: 'desc' });
ok('the Video tab landing asks the server for every video (videoFeed=all)');

// ---- a running Motion Control run started elsewhere appears in the landing feed at once ----
const mt = running({ toolId: 'motion-transfer', id: 'mt1', createdAt: 500, updatedAt: 9_000 });
const own = [job({ toolId: 'h3-video', id: 'c1' })];
const live = mergeLiveJobs(own, [mt], []); assert.ok(live.some((j) => j.id === 'mt1'), 'the active poller’s run joins the page’s live jobs');
const ctx = { seen: new Set(['c1']), at: 10_000, hasMore: false, since: 0, gone: new Set<string>(), f: FILTER_DEFAULT, project: null, scope: LAND, patch: {} };
assert.deepEqual(liveExtras(live, ctx).jobs.map((j) => j.id), ['mt1'], 'the running motion-transfer job is in the landing feed before any reload');
assert.equal(matches(mt, FILTER_DEFAULT, null, LAND), true); assert.equal(inVideoFeed(mt, VIDEO_LANDING_FEED), true);
assert.equal(liveExtras(live, { ...ctx, scope: videoScope('create') }).jobs.length, 0, 'Create Video’s own feed (the Create chip) leaves it out');
assert.deepEqual(liveExtras(live, { ...ctx, scope: videoScope('group:motion') }).jobs.map((j) => j.id), ['mt1'], 'the Motion chip lists it');
assert.deepEqual(liveExtras(live, { ...ctx, f: { ...FILTER_DEFAULT, group: 'group:motion' } }).jobs.map((j) => j.id), ['mt1'], 'Filter › Type › Motion lists it');
assert.equal(liveExtras(live, { ...ctx, f: { ...FILTER_DEFAULT, group: 'group:create' } }).jobs.length, 0, 'Filter › Type › Create leaves it out');
const q = running({ toolId: 'object-swap', id: 'sw1', status: 'queued' }); assert.deepEqual(liveExtras(mergeLiveJobs([], [q, mt], []), ctx).jobs.map((j) => j.id).sort(), ['mt1', 'sw1'], 'queued runs too');
assert.equal(liveExtras(mergeLiveJobs([], [running({ toolId: 'create-image', id: 'img1' })], []), ctx).jobs.length, 0, 'an image run started elsewhere stays out');
ok('a running Motion Control job (and a queued Object Swap) started elsewhere shows in the landing feed with no reload; image runs stay out');

// ---- the fresher copy wins; a run that finished elsewhere turns into its result ----
const stale = { ...mt, updatedAt: 1 }; const done = { ...mt, status: 'done', updatedAt: 9_500, outputs: [{ url: '/files/mt1.mp4' }] };
assert.equal(mergeLiveJobs([stale], [mt], []).find((j) => j.id === 'mt1')!.updatedAt, 9_000, 'a fresher poll replaces the page’s copy');
assert.equal(mergeLiveJobs([mt], [], [done]).find((j) => j.id === 'mt1')!.status, 'done', 'finished elsewhere → done (the feed reloads on it)');
assert.equal(mergeLiveJobs([done], [{ ...mt, updatedAt: 1 }], []).find((j) => j.id === 'mt1')!.status, 'done', 'an older poll never brings a finished run back');
assert.equal(mergeLiveJobs(own, [own[0]], []).length, 1, 'one job per id');
ok('live merge: one job per id, fresher wins, a finished run turns into its result');

// ---- filter chips: derived from the workflow picker's categories, one scope definition ----
assert.equal(VIDEO_FEED_GROUPS[0].id, 'all');
assert.deepEqual(VIDEO_FEED_GROUPS.map((g) => g.label), ['All', 'Create', 'Motion', 'Swap', 'Edit', 'Upscale', 'Camera', 'Apps', 'Sound', 'Uploads'], 'the groups, in order');
assert.deepEqual(typeGroups(VIDEO_FEED_GROUPS).map((g) => g.id.replace('group:', '')), ['all', 'create', 'motion', 'swap', 'edit', 'upscale', 'camera', 'apps', 'sound'], 'Filter › Type ids (fd-type-*): Uploads is a From choice');
const CATS = new Set(VIDEO_WORKFLOW_CATEGORIES.map((c) => c.id));
const SETS: Record<string, string[]> = { swap: ['object-swap', 'two-person-swap'], upscale: ['upscale', 'draft-upscale'], sound: [], uploads: [] };
for (const g of VIDEO_FEED_GROUPS.slice(1)) { assert.ok(VIDEO_FEED_IDS.includes(g.id), `${g.id} is a server videoFeed id`); const d = videoFeedOf(g.id)!; const key = g.id.slice('group:'.length);
  assert.deepEqual(g.workflows, CATS.has(key) ? [...VIDEO_WORKFLOWS.filter((w) => w.category === key && w.toolId).map((w) => w.id), ...(key === 'edit' ? ['two-person-swap'] : [])] : SETS[key], `${g.label}: selectable workflows plus historical two-person swaps`);
  for (const w of VIDEO_WORKFLOWS.filter((x) => x.toolId)) { const j = w.id === 'lip-sync' ? job({ toolId: 'voice', input: { types: '["lipsync"]' } }) : job({ toolId: w.toolId });
    assert.equal(inVideoFeed(j, d), g.workflows.includes(w.id), `${g.label} chip ${g.workflows.includes(w.id) ? 'lists' : 'leaves out'} ${w.name}`); } }
// Sound: Add sound and Voice Studio laid over a clip (no Video workflow of their own); Lip Sync stays Motion's; speech never
const addSound = job({ toolId: 'soundtrack', input: { types: '["v2s"]', provider: 'comfy-mmaudio' } }); const voOver = job({ toolId: 'voice', input: { types: '["voiceover"]', videoUrl: '/files/in.mp4' } });
const speech = job({ toolId: 'voice', input: { types: '["tts"]' }, outputs: [{ url: '/files/s.mp3' }], resultUrl: '/files/s.mp3' });
assert.equal(inVideoFeed(addSound, 'group:sound'), true); assert.equal(inVideoFeed(voOver, 'group:sound'), true);
assert.equal(inVideoFeed(job({ toolId: 'voice', input: { types: '["lipsync"]' } }), 'group:sound'), false, 'Lip Sync is Motion, not Sound');
assert.equal(inVideoFeed(voOver, 'group:motion'), false, 'a voiceover is not Motion'); assert.equal(inVideoFeed(speech, 'group:sound'), false); assert.equal(inVideoFeed(speech, 'group:motion'), false, 'speech never in Motion');
assert.equal(inVideoFeed(job({ toolId: 'object-swap' }), 'group:edit'), true, 'a swap is also an Edit'); assert.equal(inVideoFeed(job({ toolId: 'face-swap' }), 'group:swap'), true, 'alias');
assert.equal(videoFeedOf('group:nope'), null);
assert.equal(emptyTextFor(FILTER_DEFAULT, null, videoScope('group:apps')), 'No app videos yet.'); assert.equal(emptyTextFor(FILTER_DEFAULT, 'p1', videoScope('group:upscale')), 'No upscaled videos in this project yet.');
assert.equal(emptyTextFor(FILTER_DEFAULT, null, videoScope('group:sound')), 'No videos with new sound yet.');
assert.equal(emptyTextFor({ ...FILTER_DEFAULT, group: 'group:apps' }, null, LAND), 'No app videos yet.', 'the same words from Filter › Type');
ok('Type All · Create · Motion · Swap · Edit · Upscale · Camera · Apps · Sound: named sets over the workflow ids (Sound adds Add sound / Voice Studio), plain empty words');

// ---- the rule is "output is video", not the tool's tab ----
assert.equal(isVideoJob(addSound), true, 'Add sound (MMAudio on a clip) is a video'); assert.equal(isVideoJob(job({ toolId: 'compose', provider: 'local-ffmpeg' })), true, 'Stitch');
assert.equal(isVideoJob(voOver), true, 'a voiceover laid over a clip'); assert.equal(isVideoJob(job({ toolId: 'make-it-real' })), true, 'a 3D Render');
assert.equal(isVideoJob(job({ toolId: 'three-d', outputs: [{ url: '/files/m.glb' }], resultUrl: '/files/m.glb' })), false, 'a 3D model is not');
assert.equal(isVideoJob(running({ toolId: 'soundtrack' })), true, 'Add sound while running'); assert.equal(isVideoJob(running({ toolId: 'voice', input: { types: '["voiceover"]', videoUrl: '/files/in.mp4' } })), true, 'a voiceover over a clip while running');
assert.equal(isVideoJob(running({ toolId: 'voice', input: { types: '["voiceover"]', audioOnly: true, outKind: 'audio' } })), false, 'a voiceover with no clip is speech');
assert.equal(isVideoJob(running({ toolId: 'audio' })), false, 'music while running'); assert.equal(isVideoJob(running({ toolId: 'make-it-real' })), true); assert.equal(isVideoJob(running({ toolId: 'three-d' })), false);
assert.equal(videoWorkflowNameOf(addSound), 'Add sound'); assert.equal(videoWorkflowNameOf(voOver), 'Voiceover'); assert.equal(videoWorkflowNameOf(job({ toolId: 'compose' })), 'Stitch'); assert.equal(videoWorkflowNameOf(job({ toolId: 'make-it-real' })), 'Render');
ok('any job whose output is a video is in All: Add sound, Stitch, a voiceover over a clip, 3D Render; models and speech stay out');

// ---- the server list honours the chips ----
const { jobs } = await import('../src/jobs.ts'); const { filterJobList } = await import('../src/routesEdge.ts');
const seeded = [job({ toolId: 'h3-video' }), job({ toolId: 'motion-transfer' }), running({ toolId: 'motion-transfer' }), job({ toolId: 'object-swap' }), job({ toolId: 'upscale' }), job({ toolId: 'create-image', outputs: [{ url: '/files/i.png' }], resultUrl: '/files/i.png' })];
for (const j of seeded) jobs.set(j.id, j);
const list = (qq: any) => { const r = filterJobList(qq); assert.ok(!('error' in r), JSON.stringify(r)); return (r as any).all.map((j: any) => j.toolId) as string[]; };
assert.deepEqual(list({ videoFeed: 'all', status: 'done,queued,running,needs_decision' }).sort(), ['h3-video', 'motion-transfer', 'motion-transfer', 'object-swap', 'upscale']);
assert.deepEqual(list({ videoFeed: 'group:motion', status: 'done,queued,running' }), ['motion-transfer', 'motion-transfer']);
assert.deepEqual(list({ videoFeed: 'group:edit' }).sort(), ['object-swap', 'upscale']);
ok('GET /api/jobs?videoFeed=all lists every video incl. the running Motion Control run; group:<category> narrows');

// ---- cards name their workflow; the workflow switch defaults to This workflow ----
assert.equal(videoWorkflowNameOf(job({ toolId: 'motion-transfer' })), 'Motion Control'); assert.equal(videoWorkflowNameOf(job({ toolId: 'face-swap' })), 'Object / Person Swap', 'alias');
assert.equal(videoWorkflowNameOf(job({ toolId: 'voice', input: { types: ['lipsync'] } })), 'Lip Sync'); assert.equal(videoWorkflowNameOf(job({ toolId: 'h3-video' })), 'Create Video');
assert.equal(videoWorkflowNameOf(job({ toolId: 'app-translate-video' })), null, 'no workflow: the card keeps its own tag');
const vf = src('ui/video/VideoFeed.tsx');
/* Filter › Type / From / Show, the toolbar and the live merge are the shared tab-feed pieces (ui/next/feed: FeedToolbar, FeedScope; also the Image tab's) */
const scopeSrc = src('ui/next/feed/FeedScope.tsx');
assert.doesNotMatch(vf, /ScopeSwitch|setAllWf|\[workflowId\]\)/, 'no This workflow / All videos switch and no reset when the workflow changes');
assert.doesNotMatch(scopeSrc, /ScopeSwitch|scope-this|all-workflows|FeedGroupChips/, 'the switch and the chip row are gone');
assert.doesNotMatch(vf, /FeedGroupChips|useState<string>\(ALL_VIDEO_FEED\)|hintGroup|videoHintGroupOf/, 'no chip row, no local group state, no hint outline');
assert.match(vf, /<FeedToolbar f=\{filt\} setF=\{setFilt\} groups=\{VIDEO_FEED_GROUPS\} noun="videos"/, 'one toolbar: Filter › Type is the Video groups');
assert.match(vf, /const upOn = filt\.source === 'uploads'/, 'Uploads is Filter › From');
assert.match(vf, /const tagOf = \(j: JobState\) => videoWorkflowNameOf\(j as any\) \?\? videoTag\(j\)/, 'every card names its workflow');
assert.match(vf, /useLiveJobs\(jobs\)/, 'the feed watches every active job'); assert.match(scopeSrc, /useActiveJobs\(\)/); assert.match(scopeSrc, /mergeLiveJobs\(jobs, act\.jobs, act\.finished\)/);
assert.match(vf, /inVideoFeed\(v\.viewJob as any, barWf\)/, 'run-again actions only on clips of the bar’s workflow');
ok('one Video feed: cards show their workflow name; no switch, no chip row, no hint; Filter › Type / From narrow it');
// ---- one feed order for Image, Video and Audio: running, then queued, then done by date ----
const { feedCompare, liveRank } = await import('../../web/src/ui/next/feed/feedFilter.ts');
const mix = [job({ id: 'd-new', createdAt: 900 }), job({ id: 'q-old', status: 'queued', createdAt: 100 }), job({ id: 'r-old', status: 'running', createdAt: 50 }), job({ id: 'q-new', status: 'queued', createdAt: 800 }),
  job({ id: 'd-old', createdAt: 10 }), job({ id: 'r-new', status: 'running', createdAt: 700 }), { id: '', status: 'queued', toolId: 'h3-video' } as any];
assert.deepEqual([...mix].sort(feedCompare(-1)).map((j) => j.id), ['', 'r-new', 'r-old', 'q-new', 'q-old', 'd-new', 'd-old'], 'newest first: placeholder + running, queued, done');
assert.deepEqual([...mix].sort(feedCompare(1)).map((j) => j.id), ['r-old', 'r-new', '', 'q-old', 'q-new', 'd-old', 'd-new'], 'oldest first keeps the live groups on top');
assert.equal(liveRank({ id: 'x', status: 'needs_decision' } as any), 0, 'a run waiting on you counts as running');
assert.match(src('ui/next/feed/useFeed.ts'), /all\.sort\(feedCompare\(dir\)\)/, 'the shared feed (Image, Video) uses it');
const audio = src('ui/audio/AudioFeed.tsx'); assert.match(audio, /useFeedState\(/, 'Audio is on the same shared feed (useFeed sorts it)');
ok('feed order (Image, Video, Audio): running, then queued, then the rest by date');

// ---- Audio: live from anywhere, like Video ----
assert.match(audio, /useLiveJobs\(jobs\)/, 'Audio merges the active-jobs poller and finished runs (shared FeedScope useLiveJobs, as Video)');
const aLive = mergeLiveJobs([], [running({ toolId: 'soundtrack', id: 'st1' })], []); assert.equal(aLive[0].id, 'st1', 'a run started elsewhere joins Audio');
ok('Audio watches the shared active-jobs poller: runs started elsewhere, or running at page load, update live');
fs.rmSync(D, { recursive: true, force: true }); process.exit(0);
