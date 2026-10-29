// Living audio cards (2026-10-25): web shared/audioVizLogic.ts gives each audio result a generated cover (palette from the prompt's genre and
// mood words, motif by kind, the same for a job everywhere) and the beat detector the bean dances to.
// Run: npx tsx test/audio-viz-logic.test.ts   (no server, no network)
import assert from 'node:assert/strict';
import { moodOf, energyOf, coverOf, audioKindOf, audioKindOfJob, hashStr, BeatTracker, barLevels, energyOfBins, peakLevel, PALETTES } from '../../web/src/shared/audioVizLogic.ts';
const ok = (m: string) => console.log('ok ' + m);

// ---- palette from the prompt ----
assert.equal(moodOf('Lo-fi hip hop beat, warm vinyl crackle, rainy night study vibes'), 'dusk');
assert.equal(moodOf('Epic orchestral cinematic trailer with thunderous drums and soaring brass'), 'ember');
assert.equal(moodOf('Upbeat SYNTHWAVE with neon arpeggios, 80s drums'), 'neon', 'any case');
assert.equal(moodOf('Calm ambient piano for meditation'), 'mist');
assert.equal(moodOf('Acoustic folk guitar by the campfire'), 'earth');
assert.equal(moodOf('heavy metal riffs'), 'fire');
assert.equal(moodOf('happy summer pop'), 'sunrise');
assert.equal(moodOf('Tender romantic love ballad'), 'bloom', 'a soft rose palette for love songs'); assert.equal(moodOf('wistful, bittersweet and hopeful'), 'dawn', 'a soft lavender palette for wistful songs');
assert.equal(moodOf(''), 'brand'); assert.equal(moodOf(null), 'brand'); assert.equal(moodOf('a glass of water'), 'brand', 'no genre words: our orange');
assert.equal(moodOf('synthesizer'), 'neon', 'word stems count'); assert.equal(moodOf('sparked'), 'brand', 'no partial-word hits ("park" is not "dark")');
for (const p of Object.values(PALETTES)) for (const c of [p.a, p.b, p.c]) assert.match(c, /^#[0-9A-F]{6}$/i);
ok('palette follows genre / mood words, brand orange otherwise');

assert.ok(energyOf('fast driving punchy drums') > 0.8); assert.ok(energyOf('slow calm soft lullaby') < 0.2); assert.equal(energyOf('a song'), 0.5);
assert.ok(energyOf('fast '.repeat(50)) <= 1 && energyOf('calm '.repeat(50)) >= 0, 'clamped 0..1');
ok('energy from tempo words, clamped');

// ---- cover: deterministic, kind-specific ----
const a1 = coverOf({ seed: 'job1', prompt: 'lofi chill', kind: 'music' }), a2 = coverOf({ seed: 'job1', prompt: 'lofi chill', kind: 'music' });
assert.deepEqual(a1, a2, 'same job → same cover');
assert.notDeepEqual(coverOf({ seed: 'job2', prompt: 'lofi chill', kind: 'music' }), a1, 'another job → another layout');
assert.equal(a1.mood, 'dusk'); assert.equal(a1.palette, PALETTES.dusk);
assert.ok(a1.rings.length >= 5 && a1.lines.length >= 2 && a1.sparks.length === 0, 'music: vinyl rings + flowing lines');
const v = coverOf({ seed: 'j', prompt: 'Welcome to the show', kind: 'voice' }); assert.equal(v.rings.length, 0); assert.equal(v.lines.length, 3, 'voice: 3 sound arcs'); assert.equal(v.mood, 'brand');
const s = coverOf({ seed: 'j', prompt: 'explosion', kind: 'sfx' }); assert.ok(s.lines.length >= 10 && s.sparks.length === 6, 'sfx: rays + sparks');
for (const c of [a1, v, s]) { for (const b of c.blobs) assert.ok(b.x >= 0 && b.x <= 320 && b.y >= 0 && b.y <= 180 && b.r > 0); for (const d of c.lines) assert.ok(!/NaN|Infinity/.test(d)); }
const long = coverOf({ seed: 'x', prompt: 'epic '.repeat(5000), kind: 'music' }); assert.equal(long.mood, 'ember'); assert.ok(long.lines.length <= 5, 'a huge prompt stays bounded');
assert.equal(hashStr('abc'), hashStr('abc')); assert.notEqual(hashStr('abc'), hashStr('abd'));
ok('cover is deterministic per job, motif per kind, bounded for long prompts');

// ---- kind ----
assert.equal(audioKindOf({ toolId: 'audio', workflow: 'music' }), 'music');
assert.equal(audioKindOf({ toolId: 'audio', workflow: 'sfx' }), 'sfx');
assert.equal(audioKindOf({ toolId: 'soundtrack', workflow: 'soundtrack-sound' }), 'sfx');
assert.equal(audioKindOf({ toolId: 'soundtrack', workflow: 'soundtrack-music' }), 'music');
assert.equal(audioKindOf({ toolId: 'voice', workflow: 'voiceover' }), 'voice');
assert.equal(audioKindOf({ toolId: 'voice', workflow: 'translate' }), 'voice');
assert.equal(audioKindOf({ toolId: 'voice' }), 'voice');
assert.equal(audioKindOf({}), 'music');
assert.equal(audioKindOfJob({ toolId: 'audio', input: { types: ['sfx'] } }), 'sfx');
assert.equal(audioKindOfJob({ toolId: 'soundtrack', input: { mode: 'v2s' } }), 'sfx');
assert.equal(audioKindOfJob(null), 'music');
ok('kind from workflow / mode / tool');

// ---- beat detection thresholds ----
{
  const b = new BeatTracker({ idleBeatMs: 0 }); let t = 0; const beats: number[] = [];
  const feed = (e: number) => { if (b.update(e, t)) beats.push(t); t += 16; };
  for (let i = 0; i < 60; i++) feed(0.3);                  // steady: never a beat
  assert.equal(beats.length, 0, 'a steady level is not a beat');
  feed(0.6); assert.equal(beats.length, 1, 'a jump past ratio × average is a beat');
  feed(0.7); assert.equal(beats.length, 1, 'no second beat inside minGapMs');
  for (let i = 0; i < 20; i++) feed(0.3); feed(0.65); assert.equal(beats.length, 2, 'next onset after the gap counts');
  const q = new BeatTracker({ idleBeatMs: 0 }); let u = 0, n = 0; q.update(0.02, u);
  for (let i = 0; i < 100; i++) { u += 16; if (q.update(i % 10 === 0 ? 0.1 : 0.02, u)) n++; }
  assert.equal(n, 0, 'below the floor: near-silence never beats');
  const r = new BeatTracker({ idleBeatMs: 0 }); assert.equal(r.update(0.9, 0), false, 'the first frame only seeds the average');
  assert.equal(r.update(NaN, 16), false, 'NaN is treated as silence');
  // a 120 BPM kick: one beat per 500 ms
  const k = new BeatTracker({ idleBeatMs: 0 }); let w = 0, kicks = 0; for (let i = 0; i < 250; i++) { w = i * 16; if (k.update(i % 31 === 0 ? 0.8 : 0.25, w)) kicks++; }
  assert.ok(kicks >= 6 && kicks <= 9, `~8 kicks in 4 s, got ${kicks}`);
  // steady loud hum: the idle bob keeps the bean moving, but no faster than idleBeatMs
  const h = new BeatTracker(); let hb = 0; for (let i = 0; i <= 125; i++) if (h.update(0.4, i * 16)) hb++;
  assert.ok(hb >= 2 && hb <= 4, `idle bob ~every 640 ms over 2 s, got ${hb}`);
  h.reset(); assert.equal(h.avg, -1);
}
ok('beat detection: ratio, floor, min gap, idle bob');

// ---- analyser maths ----
const bins = new Uint8Array(128); assert.equal(energyOfBins(bins), 0); bins.fill(255); assert.equal(energyOfBins(bins), 1);
assert.equal(energyOfBins(bins, 10, 5), 0, 'empty range');
const lv = barLevels(bins, 48); assert.equal(lv.length, 48); assert.ok(lv.every(x => x >= 0 && x <= 1));
const quiet = barLevels(new Uint8Array(128), 48); assert.ok(quiet.every(x => x === 0));
const reuse = new Array(48).fill(0); assert.equal(barLevels(bins, 48, reuse), reuse, 'reuses the output array (no garbage per frame)');
assert.equal(barLevels(bins, 8).length, 8); assert.equal(barLevels(bins, 256).length, 256);
const lowOnly = new Uint8Array(128); lowOnly[1] = 200; lowOnly[2] = 200; const ll = barLevels(lowOnly, 48); assert.ok(ll[0] > 0 && ll[47] === 0, 'lows on the left');
assert.ok(peakLevel([], 0, 0, 0) > 0, 'no peaks: a calm shimmer'); assert.ok(peakLevel([0.2, 1], 9, 10, 0) >= 0.75 && peakLevel([0.2, 1], 9, 10, 0) <= 1);
ok('bar levels, loudness');
