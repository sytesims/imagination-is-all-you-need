// Stitch (Video page timeline, 2026-10-27): the panel's plain logic (web/src/ui/video/stitchLogic.ts) and how the workflow is wired: order, add up
// to 20, trims clamped like the server, total length, the film's frame, the compose body Export posts, saved drafts, Recreate, Add to Stitch.
// Run: npx tsx test/stitch-panel.test.ts   (no server, no network)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'stitch-panel-')); process.env.OPENHIGGSFIELD_DATA_DIR ??= D; process.env.OPENHIGGSFIELD_ENV_FILE ??= path.join(D, 'none.env'); process.env.OPENHIGGSFIELD_BACKEND = 'mock';
const L = await import('../../web/src/ui/video/stitchLogic.ts');
const { videoWorkflowById, videoWorkflowHref, isPanelWorkflow, stitchAddHref, VIDEO_WORKFLOWS } = await import('../src/shared/videoWorkflows.ts');
const { videoFeedOf, inVideoFeed, videoWorkflowNameOf } = await import('../src/shared/videoFeed.ts');
const { clampTrim: serverClamp, parseTrims } = await import('../src/agentBudget.ts');
const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../web/src');
const ok = (m: string) => console.log('ok ' + m);
const clip = (o: Partial<import('../../web/src/ui/video/stitchLogic.ts').StitchClip> = {}) => ({ key: L.clipKey(), url: '/files/a.mp4', name: 'a.mp4', dur: 6, w: 1280, h: 720, trim: null, ...o });

// order: move, add (capped at 20)
assert.deepEqual(L.moveClip(['a', 'b', 'c', 'd'], 0, 2), ['b', 'c', 'a', 'd']); assert.deepEqual(L.moveClip(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b']);
assert.deepEqual(L.moveClip(['a', 'b'], 1, 9), ['a', 'b'].slice(0, 1).concat('b'), 'past the end stays last'); assert.deepEqual(L.moveClip(['a', 'b'], 5, 0), ['a', 'b'], 'unknown index: unchanged');
const nineteen = Array.from({ length: 19 }, () => clip()); const r = L.addClips(nineteen, [clip(), clip(), clip()]); assert.equal(r.list.length, 20); assert.equal(r.dropped, 2);
assert.equal(L.addClips([], [clip()]).dropped, 0); assert.equal(L.MAX_CLIPS, 20);
ok('reorder and add: up to 20 clips, the rest reported as left out');

// trims: clamped inside the clip, whole-clip trims are none, and the same rule as the server's
assert.equal(L.clampTrim({ start: 0, end: 6 }, 6), null, 'the whole clip is no trim'); assert.deepEqual(L.clampTrim({ start: 2, end: 99 }, 10), { start: 2, end: 10 }, 'a trim past the end stops at the end');
assert.deepEqual(L.clampTrim({ start: 9.99, end: 12 }, 10), { start: 9.9, end: 10 }, 'at least 0.1 s kept'); assert.deepEqual(L.clampTrim({ start: -3, end: 2 }, 6), { start: 0, end: 2 });
for (const [t, d] of [[{ start: 1, end: 3.5 }, 6], [{ start: 2, end: 99 }, 10], [{ start: 0, end: 6 }, 6], [{ start: 5.95, end: 7 }, 6]] as const) {
  const web = L.clampTrim(t, d); const srv = serverClamp({ in: t.start, out: t.end }, d); assert.deepEqual(web && { in: web.start, out: web.end }, srv, `web and server agree on ${JSON.stringify(t)} of ${d} s`); }
assert.equal(L.playLen(clip({ dur: 10, trim: { start: 2, end: 99 } })), 8); assert.equal(L.totalLen([clip({ trim: { start: 1, end: 3.5 } }), clip(), clip({ dur: 2 })]), 10.5);
assert.equal(L.secText(4.5), '4.5 s'); assert.equal(L.secText(10), '10 s'); assert.equal(L.secText(89), '1:29'); assert.equal(L.clock(18.5), '0:19');
ok('trims: clamped to the clip like the server (agentBudget clampTrim), total length counts only the kept parts');

// the film: Auto keeps the first clip's frame; a shape is made from its short side (reframe); clips of another shape get bars, a crop or a blur
assert.deepEqual(L.filmSize({ w: 1280, h: 720 }, 'auto'), { w: 1280, h: 720 }); assert.deepEqual(L.filmSize({ w: 1280, h: 720 }, '9:16'), { w: 720, h: 1280 });
assert.deepEqual(L.filmSize({ w: 360, h: 640 }, '16:9'), { w: 640, h: 360 }); assert.deepEqual(L.filmSize({ w: 1280, h: 720 }, '1:1'), { w: 720, h: 720 }); assert.equal(L.filmSize(undefined, '1:1'), null);
assert.deepEqual(L.filmSize({ w: 3840, h: 2160 }, '9:16'), { w: 1080, h: 1920 }, 'capped at 1080 on the short side');
assert.equal(L.fitOf({ w: 360, h: 640 }, { w: 1280, h: 720 }), 'bars'); assert.equal(L.fitOf({ w: 1920, h: 1080 }, { w: 1280, h: 720 }), 'same'); assert.equal(L.fitOf({ w: 0, h: 0 }, { w: 1280, h: 720 }), 'same');
assert.equal(L.fitOf({ w: 360, h: 640 }, { w: 1280, h: 720 }, 'fill'), 'crop'); assert.equal(L.fitOf({ w: 360, h: 640 }, { w: 1280, h: 720 }, 'blur'), 'blur');
ok('film frame: Auto keeps the first clip’s size, 16:9 / 9:16 / 1:1 come from its short side (max 1080); mixed shapes are flagged bars / crop / blur');

// the editor's timeline: transitions overlap, cards on black add their length, cards over the picture don't
const t3 = [clip({ dur: 3 }), clip({ dur: 2 }), clip({ dur: 4 })];
const base = { ...L.EMPTY_DRAFT, clips: t3, end: { ...L.EMPTY_DRAFT.end, on: false } };
assert.equal(L.planOf(base).total, 9, 'cuts: the clips added up');
assert.equal(L.planOf({ ...base, transition: 'crossfade', transitionSec: 0.5 }).total, 8, 'two crossfades of 0.5 s: 1 s shorter');
assert.equal(L.planOf({ ...base, transition: 'dip', transitionSec: 1.5 }).overlap, 0.9, 'a dip is capped at 45 % of the shortest clip (2 s)');
assert.equal(L.planOf({ ...base, end: { ...L.EMPTY_DRAFT.end, on: true, mode: 'black', sec: 2.5 } }).total, 11.5, 'an end card on black adds its length');
assert.equal(L.planOf({ ...base, title: { ...L.EMPTY_DRAFT.title, on: true, text: 'Hi', mode: 'over', sec: 2 } }).total, 9, 'a title over the first clip adds nothing');
assert.deepEqual(L.planOf({ ...base, title: { ...L.EMPTY_DRAFT.title, on: true, text: 'Hi', mode: 'over', sec: 2 } }).overTitle, [0, 2]);
assert.equal(L.planOf({ ...base, title: { ...L.EMPTY_DRAFT.title, on: true, text: '  ', mode: 'black', sec: 2 } }).total, 9, 'an empty title is no card');
assert.equal(L.EMPTY_DRAFT.end.text, 'Imagination is all you need.'); assert.equal(L.EMPTY_DRAFT.end.on, true);
ok('timeline: crossfades and dips shorten the film by their overlap (capped by the shortest clip), cards on black add their length, over-cards and empty cards don’t');

// Export's body and what it still needs
assert.equal(L.missingStep({ clips: [] }), 'Add clips'); assert.equal(L.missingStep({ clips: [clip(), clip({ missing: true })] }), 'Remove the missing clip'); assert.equal(L.missingStep({ clips: [clip()] }), null);
const d0 = { ...L.EMPTY_DRAFT, clips: [clip({ url: '/files/x.mp4', trim: { start: 1, end: 3 } }), clip({ url: '/files/y.mp4' })], music: { url: '/files/m.mp3', name: 'm' }, voice: { url: '/files/v.wav', name: 'v' }, aspect: '9:16' as const };
const b = L.composeBody(d0);
assert.deepEqual(b.clips, ['/files/x.mp4', '/files/y.mp4']); assert.deepEqual(b.trims, [{ in: 1, out: 3 }, null]); assert.equal(b.audio, '/files/m.mp3'); assert.equal(b.voice, '/files/v.wav'); assert.equal(b.aspect, '9:16');
assert.equal(b.keepClipAudio, true); assert.equal(b.fadeOutSec, 1); assert.equal(b.videoFade, true); assert.match(b.title, /^Stitch · 2 clips · 10.5 s$/, 'the default end card (2.5 s on black) counts');
assert.equal(b.fit, 'fill'); assert.equal(b.cropX, 0.5); assert.equal(b.transition, 'cut'); assert.equal('transitionSec' in b, false); assert.equal(b.normalize, true); assert.equal(b.duck, true);
assert.equal(b.musicVolume, 0.6); assert.equal(b.voiceVolume, 1); assert.equal(b.clipVolume, 1); assert.deepEqual(b.endCard, { text: 'Imagination is all you need.', style: 'clean', mode: 'black', sec: 2.5 }); assert.equal(b.titleCard, null);
const b1 = L.composeBody({ ...L.EMPTY_DRAFT, clips: [clip()], aspect: 'auto', fade: false, keepAudio: false });
assert.equal('trims' in b1, false, 'no trims key without a trim'); assert.equal('aspect' in b1, false, 'Auto sends no aspect'); assert.equal('audio' in b1, false); assert.equal(b1.fadeOutSec, 0); assert.equal(b1.videoFade, false); assert.equal(b1.keepClipAudio, false); assert.match(b1.title, /1 clip ·/);
assert.ok(!('error' in parseTrims(b.trims, b.clips.length)), 'the server takes the trims Export sends');
const { parseEditor } = await import('../src/agentBudget.ts'); const ed = parseEditor(b as any); assert.ok(!('error' in ed), JSON.stringify(ed)); assert.equal((ed as any).end.text, 'Imagination is all you need.');
ok('Export: one POST /api/compose body (clips in order, trims aligned with nulls, music, voice, shape, clip sound, fade, mix, transition, cards) the server accepts');

// drafts: odd data falls back; Recreate rebuilds the timeline from a compose job
const p = L.parseDraft({ clips: [{ url: '/files/a.mp4', trim: { start: 2, end: 1 } }, { url: 'https://evil/x.mp4' }, null, { url: '/files/b.mp4', dur: 'x' }], music: { url: 'javascript:1' }, aspect: '4:3', keepAudio: 'yes' });
assert.equal(p.clips.length, 2, 'only /files/ clips'); assert.equal(p.clips[0].trim, null, 'a backwards trim is dropped'); assert.equal(p.clips[1].dur, 0); assert.equal(p.music, null); assert.equal(p.aspect, 'auto'); assert.equal(p.keepAudio, true);
assert.equal(L.parseDraft(Array.from({ length: 30 }, () => ({}))).clips.length, 0); assert.equal(L.parseDraft({ clips: Array.from({ length: 30 }, () => ({ url: '/files/a.mp4' })) }).clips.length, 20); assert.deepEqual(L.parseDraft(null).clips, []);
const rec = L.draftFromJob({ clipUrls: ['/files/a.mp4', '/files/b.mp4'], clipJobIds: ['j1', null], trims: [{ in: 1, out: 2 }, null], audioUrl: '/files/m.mp3', voiceUrl: null, aspect: '1:1', keepClipAudio: true, videoFade: false, fadeOutSec: 0 })!;
assert.equal(rec.clips.length, 2); assert.deepEqual(rec.clips[0].trim, { start: 1, end: 2 }); assert.equal(rec.clips[0].jobId, 'j1'); assert.equal(rec.music?.url, '/files/m.mp3'); assert.equal(rec.voice, null); assert.equal(rec.aspect, '1:1'); assert.equal(rec.fade, false);
assert.equal(L.draftFromJob({}), null); assert.equal(L.draftFromJob(null), null);
assert.equal(rec.end.on, false, 'an older stitched video had no end card'); assert.equal(p.end.on, true, 'a new draft has the default end card');
const rec2 = L.draftFromJob({ clipUrls: ['/files/a.mp4'], transition: 'dip', transitionSec: 0.8, fit: 'blur', mix: { clip: 0.5, music: 1.2, voice: 1.5, duck: false, duckAmount: 0.3, musicLoop: false }, titleCard: { text: 'Hello', style: 'bold', mode: 'black', sec: 3 }, endCard: null, captions: 4 })!;
assert.equal(rec2.transition, 'dip'); assert.equal(rec2.transitionSec, 0.8); assert.equal(rec2.fit, 'blur'); assert.deepEqual(rec2.mix, { clip: 0.5, music: 1.2, voice: 1.5, duck: false, duckAmount: 0.3 }); assert.equal(rec2.musicLoop, false);
assert.deepEqual(rec2.title, { on: true, text: 'Hello', style: 'bold', mode: 'black', sec: 3 }); assert.equal(rec2.end.on, false); assert.equal(rec2.captions.on, true);
const odd = L.parseDraft({ mix: { clip: 9, music: -1, duckAmount: 'x' }, transition: 'wipe', fit: 'stretch', title: { on: true, text: 'x'.repeat(500), style: 'neon', sec: 99 } });
assert.equal(odd.mix.clip, 2); assert.equal(odd.mix.music, 0); assert.equal(odd.mix.duckAmount, 0.6); assert.equal(odd.transition, 'cut'); assert.equal(odd.fit, 'fill'); assert.equal(odd.title.text.length, 120); assert.equal(odd.title.style, 'clean'); assert.equal(odd.title.sec, 6);
ok('drafts: only /files/ media, at most 20 clips, unknown values fall back; Recreate rebuilds a stitched video’s timeline and its editor settings');

// wiring: a Video workflow with its own panel, always available, its feed lists compose jobs, Add to Stitch link, App renders the panel
const w = videoWorkflowById('stitch')!; assert.ok(w && isPanelWorkflow(w) && w.toolId === 'compose' && w.category === 'edit');
assert.equal(VIDEO_WORKFLOWS.filter((x) => isPanelWorkflow(x)).length, 1); assert.equal(stitchAddHref('ab c'), `${videoWorkflowHref('stitch')}&add=ab%20c`);
const cj = { id: 'k1', toolId: 'compose', provider: 'local-ffmpeg', status: 'done', outputs: [{ label: 'Stitched video', url: '/files/k1-ad.mp4' }], resultUrl: '/files/k1-ad.mp4', input: {}, createdAt: 1 } as any;
assert.equal(inVideoFeed(cj, 'stitch'), true); assert.equal(inVideoFeed({ ...cj, toolId: 'h3-video' }, 'stitch'), false); assert.equal(videoWorkflowNameOf(cj), 'Stitch'); assert.ok(videoFeedOf('stitch'));
const app = fs.readFileSync(path.join(WEB, 'App.tsx'), 'utf8'); assert.match(app, /isPanelWorkflow\(vwf\)\)[^\n]*<StitchPanel /, 'App renders the Stitch panel inside the Video page');
const hist = fs.readFileSync(path.join(WEB, 'platform/History.tsx'), 'utf8'); assert.match(hist, /am-stitch-\$\{j\.id\}[\s\S]{0,200}stitchAddHref\(j\.id\)/, 'Assets ⋯ menu: Add to Stitch on video results');
const panel = fs.readFileSync(path.join(WEB, 'ui/video/StitchPanel.tsx'), 'utf8');
for (const shared of ['pickMedia', 'AudioCard', 'TrimRange', 'DockGenerate', 'BarPopover', 'Segmented', 'PopSwitch', 'VideoThumb', 'VideoWorkflowChip', 'useHostedVideoFeed', 'drawCue', 'captionStyle']) assert.ok(panel.includes(shared), `the panel reuses the shared ${shared}`);
assert.match(fs.readFileSync(path.join(WEB, 'ui/video/stitch.css'), 'utf8'), /prefers-reduced-motion:no-preference/, 'motion only when the user allows it');
ok('wiring: Stitch is a Video workflow with its own panel (shared components), its feed lists stitched videos, Add to Stitch in Assets');
console.log('ALL OK stitch-panel');
