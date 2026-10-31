// Video tab feeds (2026-10-26): "each workflow in the video tab should show the generations for videos and based on projects". One helper
// (shared/videoFeed.ts) decides which jobs each Video workflow's feed lists, on the server (GET /api/jobs?videoFeed=) and for the page's live
// jobs (web feedFilter matches). Covers every workflow and flow shortcut, Lip Sync on the shared voice tool, All workflows, the project
// filter, aliases, pictures / sounds / 3D renders staying out, and the honest empty words.
// Run: npx tsx test/video-feed-scopes.test.ts   (temp data dir, no server, no network)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'videofeeds-')); process.env.OPENHIGGSFIELD_DATA_DIR = D; process.env.OPENHIGGSFIELD_ENV_FILE = path.join(D, 'none.env'); process.env.OPENHIGGSFIELD_BACKEND = 'mock';
const { VIDEO_WORKFLOWS, VIDEO_FLOW_SHORTCUTS } = await import('../src/shared/videoWorkflows.ts');
const { videoFeedOf, inVideoFeed, isVideoJob, VIDEO_FEED_IDS, ALL_VIDEO_FEED } = await import('../src/shared/videoFeed.ts');
const { serverParams, matches, emptyTextFor, videoScope, FILTER_DEFAULT } = await import('../../web/src/ui/next/feed/feedFilter.ts');
const ok = (m: string) => console.log('ok ' + m);

const RUNS = VIDEO_WORKFLOWS.filter((w) => w.toolId); // every workflow with a tool (Edit Video is a hub)
let n = 0; const job = (o: any) => ({ id: `j${++n}`, status: 'done', provider: 'mock', input: {}, outputs: [{ label: 'out', url: `/files/j${n}.mp4` }], resultUrl: `/files/j${n}.mp4`, createdAt: 1_000 + n, ...o }) as any;
const lip = (o: any = {}) => job({ toolId: 'voice', input: { types: '["lipsync"]' }, ...o });

// ---- every workflow lists its own tool's videos and nothing else ----
const own = new Map(RUNS.map((w) => [w.id, w.id === 'lip-sync' ? lip() : job({ toolId: w.toolId })]));
const extra = { tts: job({ toolId: 'voice', input: { types: '["tts"]' }, outputs: [{ label: 'a', url: '/files/s.mp3' }], resultUrl: '/files/s.mp3' }), image: job({ toolId: 'create-image', outputs: [{ label: 'i', url: '/files/i.png' }], resultUrl: '/files/i.png' }),
  dub: job({ toolId: 'voice', input: { types: '["voiceover"]' } }) /* Audio tab: a voiceover laid over a clip (video out) */, turntable: job({ toolId: 'three-d-turntable' }), shot: job({ toolId: 'make-it-real' }), fxStill: job({ toolId: 'photo-fx', outputs: [{ label: 'i', url: '/files/still.png' }], resultUrl: '/files/still.png' }) };
for (const w of RUNS) for (const [wid, j] of own) assert.equal(inVideoFeed(j, w.id), wid === w.id, `${w.name} feed ${wid === w.id ? 'lists' : 'leaves out'} a ${wid} video`);
for (const w of RUNS) for (const [k, j] of Object.entries(extra)) assert.equal(inVideoFeed(j, w.id), false, `${w.name} feed leaves out ${k}`);
ok(`each of the ${RUNS.length} Video workflows lists only its own tool's videos (no speech, pictures, Photo FX stills or 3D renders)`);

// ---- running, queued and failed runs belong to their workflow too (no output yet) ----
for (const w of RUNS) for (const status of ['queued', 'running', 'failed', 'blocked']) { const j = w.id === 'lip-sync' ? lip({ status, outputs: [], resultUrl: null }) : job({ toolId: w.toolId, status, outputs: [], resultUrl: null });
  assert.equal(inVideoFeed(j, w.id), true, `${w.name}: a ${status} run is listed`); assert.equal(inVideoFeed(j, ALL_VIDEO_FEED), true, `All workflows: a ${status} ${w.name} run`); }
assert.equal(isVideoJob(job({ toolId: 'voice', input: { types: ['tts'] }, status: 'running', outputs: [], resultUrl: null })), false, 'a speech run still going is not a video');
assert.equal(isVideoJob(job({ toolId: 'voice', provider: 'comfy-ltx25-lipsync', status: 'running', outputs: [], resultUrl: null })), true, 'a lip-sync model’s run without types is still Lip Sync');
assert.equal(isVideoJob(job({ toolId: 'create-image', status: 'running', outputs: [], resultUrl: null })), false, 'an image run still going is not a video');
ok('queued / running / failed / blocked runs show in their workflow and in All workflows; speech and image runs never do');

// ---- flow shortcuts open their workflow's feed; Edit Video = every edit; aliases ----
const parent: Record<string, string> = { loop: 'create', morph: 'transitions', 'exploded-view': 'photo-fx', 'new-angle': 'reshoot' };
for (const s of VIDEO_FLOW_SHORTCUTS) if (parent[s.id]) assert.equal(videoFeedOf(s.id)?.id, parent[s.id], `${s.name} opens ${parent[s.id]}'s feed`);
assert.equal(videoFeedOf('direct-a-shot'), null, 'Direct a Shot lives on the 3D page: no Video feed');
assert.equal(inVideoFeed(job({ toolId: 'h3-video', input: { loop: '1', provider: 'comfy-ltx25-video' } }), 'loop'), true, 'a Loop clip (local LTX-2.5) is in Create Video / Loop');
assert.equal(inVideoFeed(job({ toolId: 'app-transition', input: { preset: 'morph' } }), 'morph'), true, 'a Morph is in Transitions');
const hub = videoFeedOf('edit-video')!; assert.ok(hub.toolIds!.includes('h3-extend') && hub.toolIds!.includes('footage-fx') && !hub.toolIds!.includes('h3-video'), 'Edit Video = every edit tool');
assert.equal(inVideoFeed(job({ toolId: 'face-swap' }), 'object-swap'), true, 'an old face-swap id is Object Swap'); assert.equal(inVideoFeed(job({ toolId: 'hdr' }), 'sdr-hdr'), true, 'hdr alias');
assert.equal(videoFeedOf('nope'), null); assert.ok(VIDEO_FEED_IDS.includes('all') && VIDEO_FEED_IDS.includes('lip-sync') && VIDEO_FEED_IDS.includes('loop'));
ok('Loop / Morph / Exploded view / New angle open their workflow’s feed; Edit Video lists every edit; old alias ids count');

// ---- All workflows: every video, none of the other tabs' results ----
for (const j of own.values()) assert.equal(inVideoFeed(j, ALL_VIDEO_FEED), true, `All workflows lists ${j.toolId}`);
/* The rule is "output is video", not the tool's tab (user, 2026-10-26: the Video tab shows ALL video related generations): a voiceover laid over a
 * clip (dub) and the 3D tab's video renders (turntable, make-it-real) are videos, so All lists them; speech, pictures and stills stay out. */
const VIDEO_EXTRA = new Set(['dub', 'turntable', 'shot']);
for (const [k, j] of Object.entries(extra)) assert.equal(inVideoFeed(j, ALL_VIDEO_FEED), VIDEO_EXTRA.has(k), `All workflows ${VIDEO_EXTRA.has(k) ? 'lists' : 'leaves out'} ${k}`);
assert.equal(inVideoFeed(job({ toolId: 'app-translate-video' }), ALL_VIDEO_FEED), true, 'a video from a tool with no workflow of its own still shows in All');
ok('All workflows lists every video output (any tool, any tab: a voiceover over a clip, 3D renders) and leaves out pictures, sounds and stills');

// ---- the web feed: query, live-job test, project, empty words ----
const MC = videoScope('motion-control');
assert.deepEqual(serverParams(FILTER_DEFAULT, null, MC), { videoFeed: 'motion-control', order: 'desc' });
assert.deepEqual(serverParams(FILTER_DEFAULT, 'p1', videoScope('lip-sync')), { videoFeed: 'lip-sync', order: 'desc', project: 'p1' });
assert.equal(serverParams({ ...FILTER_DEFAULT, show: 'failed' }, 'p1', MC).status, 'failed,blocked'); assert.equal(serverParams({ ...FILTER_DEFAULT, show: 'liked' }, null, MC).liked, '1');
assert.equal(videoScope('bogus').videoFeed, 'create', 'an unknown id falls back to Create Video');
const mc = job({ toolId: 'motion-transfer', projectId: 'p1' });
assert.equal(matches(mc, FILTER_DEFAULT, 'p1', MC), true); assert.equal(matches(mc, FILTER_DEFAULT, 'p2', MC), false, 'another project’s clip stays out');
assert.equal(matches(mc, FILTER_DEFAULT, null, MC), true, 'no project picked = every project');
assert.equal(matches({ ...mc, toolId: 'h3-video' }, FILTER_DEFAULT, 'p1', MC), false, 'Create Video’s clip stays out of Motion Control');
assert.equal(matches(extra.tts, FILTER_DEFAULT, null, videoScope('lip-sync')), false, 'speech stays out of Lip Sync, live too');
assert.equal(matches({ ...job({ toolId: 'voice' }), id: '' }, FILTER_DEFAULT, 'p1', videoScope('lip-sync')), true, 'the placeholder while it uploads shows');
assert.equal(emptyTextFor(FILTER_DEFAULT, 'p1', MC), 'No Motion Control videos in this project yet.');
assert.equal(emptyTextFor(FILTER_DEFAULT, null, MC), 'No Motion Control videos yet.');
assert.equal(emptyTextFor(FILTER_DEFAULT, 'p1', videoScope('all')), 'No videos in this project yet.');
assert.equal(emptyTextFor(FILTER_DEFAULT, 'p1', videoScope('create')), 'No generated videos in this project yet.');
assert.match(emptyTextFor({ ...FILTER_DEFAULT, show: 'liked' }, 'p1', MC), /No favourite Motion Control videos in this project yet/);
ok('the web feed sends videoFeed + project, tests live jobs the same way, and says “No Motion Control videos in this project yet”');

// ---- the server list: GET /api/jobs?videoFeed=…&project=… (filterJobList) ----
const { jobs } = await import('../src/jobs.ts'); const lib = await import('../src/library.ts'); const { filterJobList } = await import('../src/routesEdge.ts');
const pA = lib.createProject('Spring'); const pB = lib.createProject('Music video');
const seeded: any[] = [];
for (const w of RUNS) for (const [pid, status] of [[pA.id, 'done'], [pB.id, 'done'], [pA.id, 'running'], [pA.id, 'failed']] as const) {
  const j = w.id === 'lip-sync' ? lip({ status, ...(status !== 'done' ? { outputs: [], resultUrl: null } : {}) }) : job({ toolId: w.toolId, status, ...(status !== 'done' ? { outputs: [], resultUrl: null } : {}) });
  jobs.set(j.id, j); lib.setProject(j.id, pid); seeded.push({ ...j, wf: w.id, pid }); }
for (const j of Object.values(extra)) { jobs.set(j.id, j); lib.setProject(j.id, pA.id); }
const list = (q: any) => { const r = filterJobList(q); assert.ok(!('error' in r), JSON.stringify(r)); return (r as any).all.map((j: any) => j.id) as string[]; };
for (const w of RUNS) {
  const want = (pid: string | null, st: string[]) => seeded.filter((s) => s.wf === w.id && (!pid || s.pid === pid) && st.includes(s.status)).map((s) => s.id).sort();
  assert.deepEqual(list({ videoFeed: w.id, status: 'done,queued,running,needs_decision', project: pA.id }).sort(), want(pA.id, ['done', 'running']), `${w.name} in Spring`);
  assert.deepEqual(list({ videoFeed: w.id, status: 'done,queued,running,needs_decision', project: pB.id }).sort(), want(pB.id, ['done', 'running']), `${w.name} in Music video`);
  assert.deepEqual(list({ videoFeed: w.id, status: 'failed,blocked' }).sort(), want(null, ['failed']), `${w.name} failed runs`);
}
const allA = list({ videoFeed: 'all', project: pA.id }); assert.equal(allA.length, RUNS.length * 3 + VIDEO_EXTRA.size, 'All workflows in Spring: every workflow’s 3 runs plus the other tabs’ video outputs');
for (const [k, j] of Object.entries(extra)) assert.equal(allA.includes(j.id), VIDEO_EXTRA.has(k), `All workflows ${VIDEO_EXTRA.has(k) ? 'lists' : 'leaves out'} ${k}`);
const newest = list({ videoFeed: 'all', project: pB.id, order: 'desc' }); assert.deepEqual(newest, [...newest].sort((a, b) => jobs.get(b)!.createdAt - jobs.get(a)!.createdAt), 'newest first');
assert.ok('error' in filterJobList({ videoFeed: 'bogus' }), 'unknown videoFeed → 400');
ok('GET /api/jobs?videoFeed= lists each workflow’s runs per project (done + running, failed under Failed), All workflows lists every video, newest first');
fs.rmSync(D, { recursive: true, force: true }); process.exit(0);
