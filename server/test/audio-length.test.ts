// Audio length and Recreate (audit 2026-10-31, batch 4: B1, B2, B3). Pure: no server, no network.
// The one length rule (lengthFor: Auto's length, else the picked one snapped), the shortest hidden default, and what Recreate brings back (lyrics,
// Instrumental, length, Auto). Run: npx tsx test/audio-length.test.ts
import assert from 'node:assert/strict';
import { lengthFor, shortestLength, recreateAudio, autoLength } from '../../web/src/shared/lyricsLength.ts';
import { audioWorkflowById } from '../src/shared/audioWorkflows.ts';
import { AUDIO_LENGTHS, audioTool } from '../src/tools/media.ts';
const ok = (m: string) => console.log('ok ' + m);
const music = audioWorkflowById('music')!; const YUE2 = AUDIO_LENGTHS['comfy-yue2']; const ACE = AUDIO_LENGTHS['comfy-acestep'];

// ---- 1. B1: one rule, Auto first ----
// the bug: a hidden 600 s, then YuE2 with Auto on and no lyrics: the chip read "Auto · 6:00" while the menu said 30 s
assert.equal(lengthFor(YUE2, 600, autoLength('', YUE2).seconds), 30, 'Auto on YuE2 with no lyrics: 30 s, not the snapped 360');
assert.equal(lengthFor(YUE2, 600, null), 360, 'Auto off: the nearest allowed length');
assert.equal(lengthFor(YUE2, 120, null), 120, 'an allowed pick stays');
assert.equal(lengthFor(YUE2, 45, null), 30, 'ties keep the shorter (30 vs 60 from 45)');
assert.equal(lengthFor(YUE2, 120, 60), 60, 'Auto wins over the picked length');
assert.equal(lengthFor(YUE2, 120, 47), 120, 'an Auto length the model lacks is ignored (never sent)');
assert.equal(lengthFor([], 600, 30), null, 'a model with no length (Seed Audio): nothing');
assert.deepEqual(AUDIO_LENGTHS['api-seed-audio'], [], 'Seed Audio takes no length');
for (const [p, xs] of Object.entries(AUDIO_LENGTHS)) for (const cur of [1, 10, 47, 361, 600]) for (const auto of [null, autoLength('la\nla\nla', xs).seconds]) {
  const v = lengthFor(xs, cur, auto); if (xs.length) assert.ok(xs.includes(v!), `${p}: ${cur} → ${v} is a length the model allows (quote = run)`); else assert.equal(v, null);
  if (v != null) assert.equal(lengthFor(xs, v, auto), v, `${p}: stable (one pass settles it)`); }
ok('lengthFor: Auto, else the pick snapped; always an allowed length; stable');

// ---- 2. B1: the hidden default is the shortest allowed length ----
const toolDurs = (audioTool as any).app.durations as number[];
assert.equal(Math.max(...toolDurs), 600, 'the tool list is the union (up to ACE-Step 600 s)');
assert.equal(shortestLength(toolDurs, 5), Math.min(...toolDurs), 'default: the shortest, never 600');
assert.equal(shortestLength([60, 10, 30], 5), 10, 'unsorted');
assert.equal(shortestLength(null, 5), 5); assert.equal(shortestLength([], 7), 7);
ok('hidden default: the shortest allowed length');

// ---- 3. B3: Recreate brings the lyrics back ----
const SONG = '[Verse]\nRain on the platform\nCounting the windows\n[Chorus]\nHold the light';
const cur = { lyrics: 'someone else\'s draft', instrumental: true, lengthControl: true };
{ const x = recreateAudio(music.lyrics, 'comfy-yue2', { lyrics: SONG, duration: 120 }, YUE2, cur);
  assert.equal(x.lyrics, SONG, 'the job\'s lyrics replace the draft'); assert.equal(x.instrumental, false, 'lyrics sent: not instrumental');
  assert.equal(x.duration, 120); assert.equal(x.auto, false, 'Auto would pick 60 s for these lyrics: a fixed 120 s keeps the rerun the same'); }
{ const d = autoLength(SONG, ACE).seconds; const x = recreateAudio(music.lyrics, 'comfy-acestep', { lyrics: SONG, duration: d }, ACE, cur);
  assert.equal(x.auto, true, 'the job\'s length is what Auto picks: Auto stays on'); assert.equal(x.duration, d); }
{ const x = recreateAudio(music.lyrics, 'comfy-acestep', { lyrics: '', duration: 30 }, ACE, { ...cur, instrumental: false });
  assert.equal(x.instrumental, true, 'no lyrics on a model that makes instrumentals: Instrumental on'); assert.equal(x.lyrics, '');
  assert.equal(x.auto, undefined, 'Instrumental: Auto is not offered, left as is'); }
{ const x = recreateAudio(music.lyrics, 'api-sonilo-music', { lyrics: '', duration: 60 }, AUDIO_LENGTHS['api-sonilo-music'], cur);
  assert.equal(x.lyrics, undefined, 'a model with no lyrics: the draft is left alone'); assert.equal(x.instrumental, undefined); assert.equal(x.duration, 60); }
{ const x = recreateAudio(music.lyrics, 'api-seed-audio', { lyrics: '', duration: 10 }, [], { ...cur, lengthControl: false });
  assert.equal(x.duration, null, 'Seed Audio: no length comes back'); assert.equal(x.auto, undefined); }
{ const x = recreateAudio(music.lyrics, 'comfy-yue2', { lyrics: SONG, duration: 600 }, YUE2, cur);
  assert.equal(x.duration, null, 'a length the model lacks is not restored (the length rule snaps it)'); assert.equal(x.lyrics, SONG); }
{ const cover = audioWorkflowById('cover')!; const x = recreateAudio(cover.lyrics, 'comfy-yue2', { lyrics: SONG, duration: 42 }, [], { ...cur, lengthControl: false });
  assert.equal(x.lyrics, SONG, 'Cover: lyrics come back'); assert.equal(x.instrumental, false); }
ok('Recreate: lyrics, Instrumental, length and Auto come back');
