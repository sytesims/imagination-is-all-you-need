// The agent reviews its own versions (shared/takeReview.ts + canvasReview.ts): the badge words, the free quick checks (blank, dark,
// near-copy, wrong shape, too small), deterministic sample reviews for the mock sandbox, the recommendation line, and that a review never
// changes the active version (the user's pick wins). Real pictures go through ffmpeg on this computer; nothing is sent anywhere.
// Run: cd server && npx tsx test/canvas-review.test.ts
import assert from 'node:assert/strict';
import { badgeText, judgeStats, sampleReview, recommend, withReviews, hamming, SAMPLE_REVIEWS, type TakeReview } from '../src/shared/takeReview.ts';
import { reviewVersions, fileOfUrl, pixelStats } from '../src/canvasReview.ts';
const ok = (m: string) => console.log('ok ' + m);

// ---- badges ----
assert.equal(badgeText({ verdict: 'fits', reason: 'the face matches the sheet', by: 'agent' }), 'Fits. The face matches the sheet');
assert.equal(badgeText({ verdict: 'check', reason: 'daylight, but the beat happens at night', by: 'sample' }), 'Check: daylight, but the beat happens at night · sample review');
assert.match(badgeText({ verdict: 'check', reason: 'it looks blank', by: 'checks' }), /quick checks on your computer$/);
ok('badges: Fits / Check: reason, and who looked (sample, quick checks, the agent)');

// ---- free quick checks ----
const base = { mean: 120, std: 40, hash: 'f0f0f0f0f0f0f0f0', width: 1344, height: 768 };
assert.deepEqual(judgeStats(base, { earlier: [], aspect: '16:9' }).verdict, 'fits');
assert.match(judgeStats({ ...base, std: 1 }, { earlier: [] }).reason, /blank/);
assert.match(judgeStats({ ...base, mean: 8 }, { earlier: [] }).reason, /nearly black/);
assert.match(judgeStats(base, { earlier: ['f0f0f0f0f0f0f0f1'] }).reason, /near-copy/, 'one bit apart: a near-copy');
assert.equal(judgeStats(base, { earlier: ['0f0f0f0f0f0f0f0f'] }).verdict, 'fits', 'a different picture is fine');
assert.match(judgeStats({ ...base, width: 1024, height: 1024 }, { earlier: [], aspect: '16:9' }).reason, /isn't 16:9/);
assert.match(judgeStats({ ...base, width: 400, height: 225 }, { earlier: [] }).reason, /small/);
assert.equal(judgeStats(base, { earlier: [] }).by, 'checks'); assert.equal(hamming('0', 'f'), 4);
ok('quick checks: blank, near-black, near-copy, wrong shape, too small; otherwise fits');

// ---- deterministic samples (mock sandbox) ----
assert.deepEqual(sampleReview(0, 0), sampleReview(0, 0)); assert.equal(sampleReview(0, 0).by, 'sample');
assert.deepEqual([0, 1, 2].map((v) => sampleReview(1, v).verdict), [0, 1, 2].map((v) => SAMPLE_REVIEWS[(2 + v) % SAMPLE_REVIEWS.length].verdict));
assert.deepEqual(await reviewVersions(['/samples/a.png', '/samples/b.png'], { shot: 3, mode: 'sample' }), [sampleReview(3, 0), sampleReview(3, 1)]);
ok('sample reviews are the same every time (fixtures by shot and version)');

// ---- real pictures through ffmpeg (free, on this computer) ----
assert.ok(fileOfUrl('/samples/sample-keyframe.png')); assert.equal(fileOfUrl('/samples/../package.json'), null, 'no path escapes'); assert.equal(fileOfUrl('https://x.test/a.png'), null);
const st = await pixelStats(fileOfUrl('/samples/sample-keyframe.png')!); assert.ok(st && st.hash.length === 16 && st.std > 0 && st.width! > 0);
const rv = await reviewVersions(['/samples/sample-keyframe.png', '/samples/sample-character.png', '/samples/sample-keyframe.png', '/files/missing.png'], { shot: 0, mode: 'checks' });
assert.equal(rv.length, 4); assert.ok(rv.every((r) => r.by === 'checks'));
assert.match(rv[2].reason, /near-copy/, 'the same picture again is flagged'); assert.match(rv[3].reason, /couldn't open/, 'a missing file is a calm check, not a crash');
ok('quick checks on real files: hash, near-copy found, missing file handled');

// ---- the recommendation, and the user's pick wins ----
const R = (verdict: 'fits' | 'check', reason: string): TakeReview => ({ verdict, reason, by: 'agent' });
assert.deepEqual(recommend('Shot 2 · The hero', [R('check', 'the face drifts'), R('fits', "Mina's face matches and the lamp is lit")]), { pick: 2, line: "Shot 2 · The hero: I'd pick v2: Mina's face matches and the lamp is lit." });
assert.deepEqual(recommend('Shot 1', [R('fits', 'right place and mood')]), { pick: 1, line: 'Shot 1: v1 fits (right place and mood).' });
assert.equal(recommend('Shot 3', [R('check', 'an extra hand')]).pick, null); assert.match(recommend('Shot 3', [R('check', 'an extra hand')]).line, /needs a look \(an extra hand\)\. Recreate makes another/);
assert.equal(recommend('Shot 4', [R('fits', 'a'), R('fits', 'b')]).pick, 1, 'a later re-roll doesn’t move the pick when the first one fits');
const card = { take: 0, takes: [{ url: 'a' }, { url: 'b' }] as { url: string; review?: TakeReview }[] };
const reviewed = withReviews(card.takes, [{ version: 1, verdict: 'check', reason: 'x' }, { version: 2, verdict: 'fits', reason: 'y' }], 2, 'agent');
assert.equal(reviewed[1].review?.rec, true); assert.equal(reviewed[0].review?.rec, false);
assert.equal(card.take, 0, 'a review never moves the active version: the user picked v1 and keeps it');
const user = { ...card, takes: reviewed, take: 0 }; const again = withReviews(user.takes, [], undefined, 'agent');
assert.deepEqual(again, reviewed, 'no new review: badges and the pick dot stay'); assert.equal(user.take, 0);
assert.equal(withReviews(reviewed, [], null, 'agent').some((t) => t.review?.rec), false, 'recommend null clears the dot');
ok('recommendation: "I\'d pick v2: …" or "needs a look"; badges and the dot never change the active version');
console.log('canvas-review: all ok');
