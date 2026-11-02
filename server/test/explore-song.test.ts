// Explore "Write a song. Watch it dance." (2026-11-02): our YuE2 song and SyteSim's dance ship, the chip says where it ran, Make your own opens Music.
// Run: npx tsx test/explore-song.test.ts
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { EXPLORE_SONG, EXPLORE_SHOWCASE_LINKS } from '../src/shared/exploreShowcase.js';

const home = readFileSync(new URL('../../web/src/ui/Home.tsx', import.meta.url), 'utf8');
const source = readFileSync(new URL('../../web/src/ui/explore/ExploreSong.tsx', import.meta.url), 'utf8');
const S = EXPLORE_SONG;
assert.equal(S.dancer.dances.length, 5, 'five dances'); assert.equal(S.dancer.dances[0].id, 'bounce', 'the happy bounce first'); assert.notEqual(S.dancer.dances[0].id, 'turn', 'never the back-facing one first');
for (const [u, max] of [[S.song.url, 1_200_000], [S.dancer.still, 100_000], ...S.dancer.dances.flatMap((d) => [[d.webm, 450_000], [d.mov, 450_000]] as const)] as const) {
  const f = new URL(`../../web/public${u}`, import.meta.url); assert.ok(existsSync(f), `missing ${u}`); assert.ok(statSync(f).size < max, `${u} stays small`);
}
assert.equal(S.song.model, 'YuE2');
const cta = new URL(S.cta.href, 'http://x'); assert.equal(cta.pathname, '/audio'); assert.equal(cta.searchParams.get('workflow'), 'music');
assert.equal(cta.searchParams.get('model'), 'yue2'); assert.equal(cta.searchParams.get('prompt'), S.song.style);
assert.ok(EXPLORE_SHOWCASE_LINKS().includes(S.cta.href), 'Make your own is checked with the other Explore links');
assert.match(home, /<XpKoi \/>\s*(?:\{\/\*[^*]*\*\/\}\s*)?<XpSong \/>\s*<\/div>/, 'the song closes the first act, after the cartoon'); assert.doesNotMatch(source, /songsection/, 'one layout, no gate');
assert.match(source, /place: LOCAL_LABEL, price: chipUsd\(0\)/, 'the shared run chip: YuE2 · Your computer · Free');
assert.match(source, /<RunChip\b/); assert.match(source, /useWaveform/);
assert.match(source, /prefersReducedMotion/, 'reduced motion keeps SyteSim a still');
assert.match(source, /hevc \? d\.mov : d\.webm/, 'HEVC with alpha for Safari, WebM for the rest');
assert.match(source, /S\.dancer\.repeats/, 'each dance repeats, then the next one'); assert.match(source, /load\(k, c\.idx \+ 1\)/, 'the next dance loads behind the one in front');
assert.match(source, /useDirectedSound\(\{ root: box, media: \(\) => audio\.current, sound: playing, explicit: true \}\)/, 'the page sound director owns the song: explicit while it plays, no sound asked for when paused');
assert.match(source, /<audio[^>]*\bmuted\b/, 'the song mounts muted; only the director unmutes it');
// See how we made it: six steps from the real runs, small files with no metadata, honest prices, the edit plainly not a model, no reference picture
const M = S.making;
assert.deepEqual(M.steps.map((x) => x.role), ['Design the character', 'Character sheet', 'Pose on a green screen', 'Five dances', 'Green removed', 'The song']);
assert.deepEqual(M.steps.flatMap((x) => x.jobs), ['f4a2e4f5', 'c93e3bfb', 'f29b13cb', '010377b4', 'ed10d1bd', 'c6525d78', '51c3c7ae', 'a29b84b2'], 'every paid run named by its job');
for (const x of M.steps) for (const [u, max] of [[x.img, 60_000], [x.clip, 1_000_000]] as const) if (u) {
  const f = new URL(`../../web/public${u}`, import.meta.url); assert.ok(existsSync(f), `missing ${u}`); assert.ok(statSync(f).size < max, `${u} stays small`);
  const b = readFileSync(f); assert.ok(!b.includes('Exif') && !b.includes('XMP ') && !b.includes('Lavf'), `${u}: no metadata`); }
const edit = M.steps[4]; assert.ok(edit.manual && !edit.model && edit.usd === 0 && /not an app step/i.test(edit.note ?? ''), 'the green removal says it was done in the edit, no model');
assert.equal(M.steps[3].runs, 5); assert.ok(M.steps[3].est, 'the dances are an estimate'); assert.equal(M.steps[5].model, 'YuE2'); assert.equal(M.steps[5].usd, 0);
assert.ok(M.steps.slice(0, 3).every((x) => x.usd > 0.02 && x.usd < 0.04), 'the pictures as billed');
assert.equal(M.total, `≈ $${M.usd.toFixed(2)}`); assert.equal(M.total, '≈ $0.58');
assert.match(source, /<Popover\b[^>]*testId="xp-song-making"/, 'the shared Popover: a panel on desktop, a bottom sheet on a phone');
assert.match(source, /x\.clip && !still/, 'reduced motion: stills only');
assert.match(source, /testid="xp-song-how"/, 'the glowing pill on the song card opens it'); assert.match(source, /testid="xp-song-steps"[\s\S]*\+\{MORE\} steps[\s\S]*\{S\.making\.total\} total/, 'the run line: the song\'s own run, then "+5 steps · ≈ $0.58 total"');
assert.match(source, /Dances · \{DANCES\.model\}/, 'the dancer credits the dances\' model'); assert.match(source, /className="xsgm-role"><span className="xsgm-n">/, 'step numbers sit with the title, never on the picture');
console.log('ok explore song: media shipped and small, YuE2 · Your computer · Free, Make your own opens Music with the style, five dances in turn, the song closes the first act, the sound director, reduced motion, the six-step making-of');
