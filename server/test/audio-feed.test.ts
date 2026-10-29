// Audio tab on the shared result feed (2026-10-27, UX audit batch A): the Audio results are the same feed as Image and Video (ui/next/feed:
// useFeedState, FeedGallery, FeedCard, FeedToolbar, SelectBar, the shared viewer), with the shared AudioCard as each finished card's body.
// The list comes from GET /api/jobs?audioFeed= (shared/audioFeed.ts: every Audio workflow's results, lip sync left out). Opening a sound shows it
// in the viewer over the page (?view=<id>), never /jobs/<id>; the first page shows a grid-shaped skeleton, never "No sounds yet"; a paused card
// keeps its length ("0:01 / 0:40"); the viewer plays with the card's own player row, not the browser's controls.
// Run: npx tsx test/audio-feed.test.ts   (temp data dir, no server, no network)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'audiofeed-')); process.env.OPENHIGGSFIELD_DATA_DIR = D; process.env.OPENHIGGSFIELD_ENV_FILE = path.join(D, 'none.env'); process.env.OPENHIGGSFIELD_BACKEND = 'mock';
const { inAudioFeed, audioWorkflowOfJob, AUDIO_FEED_GROUPS, ALL_AUDIO_FEED } = await import('../src/shared/audioFeed.ts');
const { serverParams, matches, audioScope, emptyTextFor, FILTER_DEFAULT } = await import('../../web/src/ui/next/feed/feedFilter.ts');
const WEB = path.resolve(import.meta.dirname, '../../web/src'); const src = (f: string) => fs.readFileSync(path.join(WEB, f), 'utf8');
const ok = (m: string) => console.log('ok ' + m);
let n = 0; const job = (o: any) => ({ id: `a${++n}`, status: 'done', provider: 'mock', input: {}, outputs: [{ label: 'out', url: `/files/a${n}.m4a` }], resultUrl: `/files/a${n}.m4a`, createdAt: 1_000 + n, updatedAt: 1_000 + n, ...o }) as any;

// ---- which jobs are Audio's ----
const song = job({ toolId: 'audio', input: { types: ['music'] } }); const sfx = job({ toolId: 'audio', input: { types: '["sfx"]' } }); const cover = job({ toolId: 'audio', input: { mode: 'cover' } });
const vo = job({ toolId: 'voice', input: { types: ['voiceover'], audioOnly: true } }); const addSound = job({ toolId: 'soundtrack', input: { types: ['v2s'] }, outputs: [{ url: '/files/v.mp4' }], resultUrl: '/files/v.mp4' });
const lips = job({ toolId: 'voice', input: { types: ['lipsync'] }, outputs: [{ url: '/files/l.mp4' }], resultUrl: '/files/l.mp4' }); const clip = job({ toolId: 'h3-video' }); const old = job({ toolId: 'audio', input: {} });
assert.equal(audioWorkflowOfJob(song), 'music'); assert.equal(audioWorkflowOfJob(sfx), 'sfx', 'types as JSON text'); assert.equal(audioWorkflowOfJob(cover), 'cover', 'input.mode');
for (const j of [song, sfx, cover, vo, addSound, old]) assert.ok(inAudioFeed(j, ALL_AUDIO_FEED), `${j.toolId} ${JSON.stringify(j.input)} is in Audio`);
assert.ok(!inAudioFeed(lips), 'lip sync is Video\'s'); assert.ok(!inAudioFeed(clip), 'a video tool is not Audio\'s');
assert.ok(inAudioFeed(song, 'group:music') && inAudioFeed(cover, 'group:music') && !inAudioFeed(sfx, 'group:music'));
assert.ok(inAudioFeed(vo, 'group:voice') && inAudioFeed(addSound, 'group:for-video') && !inAudioFeed(old, 'group:sfx'));
assert.deepEqual(AUDIO_FEED_GROUPS.map(g => g.id), ['all', 'group:music', 'group:sfx', 'group:voice', 'group:for-video']);
ok('audioFeed: every Audio workflow (music, sfx, cover, voice, sound for a video, older runs), lip sync and video tools left out; chips narrow');

// ---- the feed's query and live test ----
const S = audioScope();
assert.deepEqual(serverParams(FILTER_DEFAULT, null, S), { audioFeed: 'all', order: 'desc' });
assert.deepEqual(serverParams({ ...FILTER_DEFAULT, group: 'group:voice', show: 'failed' }, null, S), { audioFeed: 'group:voice', status: 'failed,blocked', order: 'desc' });
assert.deepEqual(serverParams({ ...FILTER_DEFAULT, group: 'group:motion' }, null, S), { audioFeed: 'all', order: 'desc' }, 'a Type from another tab reads as All');
assert.deepEqual(serverParams({ ...FILTER_DEFAULT, source: 'featured' }, null, S), { featured: '1', media: 'audio', status: 'done', order: 'desc' });
assert.ok(matches(song, FILTER_DEFAULT, null, S) && !matches(lips, FILTER_DEFAULT, null, S) && !matches(clip, FILTER_DEFAULT, null, S));
assert.ok(matches({ status: 'running' } as any, FILTER_DEFAULT, null, S), 'a placeholder while it uploads joins');
assert.equal(emptyTextFor({ ...FILTER_DEFAULT, show: 'liked' }, null, S), 'No liked sounds yet. Open a result and press the heart.');
ok('Audio scope: GET /api/jobs?audioFeed=, Type chips, Failed, Featured; live jobs tested the same way on the page');

// ---- the server list ----
const { jobs } = await import('../src/jobs.ts'); const { filterJobList } = await import('../src/routesEdge.ts');
for (const j of [song, sfx, vo, addSound, lips, clip]) jobs.set(j.id, j);
const list = (qq: any) => { const r = filterJobList(qq); assert.ok(!('error' in r), JSON.stringify(r)); return (r as any).all.map((j: any) => j.id).sort() as string[]; };
assert.deepEqual(list({ audioFeed: 'all' }), [song.id, sfx.id, vo.id, addSound.id].sort());
assert.deepEqual(list({ audioFeed: 'group:sfx' }), [sfx.id]);
assert.ok('error' in filterJobList({ audioFeed: 'group:nope' }), 'unknown audio feed → 400');
ok('GET /api/jobs?audioFeed=all lists every Audio result (a clip from Sound for a video too), not lip sync or videos; group:<chip> narrows');

// ---- the page renders the shared feed ----
const page = src('ui/audio/AudioPage.tsx'); const feed = src('ui/audio/AudioFeed.tsx');
assert.match(page, /import AudioFeed from '\.\/AudioFeed'/); assert.match(page, /<AudioFeed jobs=\{p\.jobs\} \/>/);
for (const shared of ['useFeedState(', 'useFeedViewer(', '<FeedGallery', '<FeedCard', '<FeedToolbar', '<SelectBar', '<GenTile', '<AudioCard', '<ResultView variant="viewer"', '<FailedViewer', 'useLiveJobs('])
  assert.ok(feed.includes(shared), `AudioFeed uses the shared ${shared}`);
/* Generate (2026-10-29): the shared DockGenerate (Image's and Video's size, price token and states), never a bespoke button, and no tall Audio-only slot */
assert.ok(page.includes('<DockGenerate '), 'Audio uses the shared DockGenerate'); assert.doesNotMatch(page, /className=\{`ic-gen gen-btn gen-dock[^`]*ap-gen/, 'no bespoke Audio Generate');
assert.doesNotMatch(src('ui/audio/audioPage.css'), /\.ic-gen\.gen-btn\{align-self:stretch/, 'Generate keeps the shared 120×80 slot');
const code = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
assert.doesNotMatch(code(feed + page.slice(page.indexOf('// ---------------- the feed'))), /\/jobs\/|navigate\(|useAudioHistory|listJobsPage/, 'no /jobs/<id> navigation and no own history fetch in the feed');
assert.match(feed, /onOpen=\{from => v\.open\(j\.id, 0, from\)\}/, 'the card opens the in-page viewer (?view=<id>)');
assert.match(feed, /firstLoad = feed\.loading && !shown\.length/, 'loaded flag: until the first page lands'); assert.match(feed, /override=\{firstLoad \? <AudioFeedSkeleton/, 'the skeleton, never the empty line, while loading');
assert.match(feed, /from=\{\['mine', 'featured'\]\}/, 'no Uploads in Audio\'s From');
ok('AudioFeed: shared toolbar, cards, select bar, viewer; no /jobs/ navigation; skeleton until loaded');

// ---- the card and the viewer's player ----
const { durLabel } = await import('../../web/src/shared/AudioCard.tsx').catch(() => ({ durLabel: null as any }));
if (durLabel) { assert.equal(durLabel(false, false, 0, 40), '0:40'); assert.equal(durLabel(false, false, 1.4, 40), '0:01 / 0:40', 'paused part-way keeps the length');
  assert.equal(durLabel(false, true, 12, 40), '0:12 / 0:40'); assert.equal(durLabel(true, false, 3, 40), '--:--'); assert.equal(durLabel(false, false, 0, 0), '--:--'); }
else assert.match(src('shared/AudioCard.tsx'), /`\$\{clockText\(t\)\} \/ \$\{durClock\(d\)\}`/);
const rv = src('shared/ResultViewer.tsx'); const va = rv.slice(rv.indexOf('export function ViewerAudio'), rv.indexOf('const clock ='));
assert.doesNotMatch(va, /\bcontrols\b/, 'no browser controls'); assert.doesNotMatch(va, /decorative/, 'the waveform is a real seek slider'); assert.match(va, /rvx-aplay/); assert.match(va, /durLabel\(/);
ok('cards show "0:01 / 0:40" when paused; the viewer plays with the card\'s player row and a seekable waveform');

// ---- first paint ----
const app = src('App.tsx'); assert.match(app, /loading-audio/); assert.match(src('styles.css'), /\.loading\.loading-audio \.skel-tiles\{grid-template-columns:repeat\(auto-fill,minmax\(260px,1fr\)\)/);
ok('the Audio tab\'s first-paint skeleton uses the feed\'s grid');
fs.rmSync(D, { recursive: true, force: true }); process.exit(0);
