/** Mention chips (web/src/shared/mentionTokens.ts): which @ tokens show as chips and which warn. Run: npx tsx test/mention-chips.test.ts */
import assert from 'node:assert/strict';
import { mentionSegments, refMentions, refState, hasRefMention } from '../../web/src/shared/mentionTokens';
import { applyRefGrammar } from '../src/shared/promptRefs.js';

const toks = (t: string, c?: any) => refMentions(t, c).map((m) => [m.raw, m.kind, m.index, m.state]);
const two = { image: 2, video: 1, audio: 1 };

// tokens, spaces, case
assert.deepEqual(toks('put @image1 in @IMAGE2', two), [['@image1', 'image', 1, 'ok'], ['@IMAGE2', 'image', 2, 'ok']]);
assert.deepEqual(toks('@Image 1 and @Video 1 with @audio1', two), [['@Image 1', 'image', 1, 'ok'], ['@Video 1', 'video', 1, 'ok'], ['@audio1', 'audio', 1, 'ok']]);
assert.deepEqual(toks('@img2 @video @audio', two), [['@img2', 'image', 2, 'ok'], ['@video', 'video', 1, 'ok'], ['@audio', 'audio', 1, 'ok']]);
// bare @image, other words, emails-ish and partial words are no reference
assert.deepEqual(toks('@image @imagery @images1 @ghost @image1x', two), []);
assert.deepEqual(toks('@image 1st take', two), []); // "1st" is a word, not a number
// out of range, zero, none attached, stale
assert.deepEqual(toks('@image3 @image0 @video2 @audio2', two).map((x) => x[3]), ['missing', 'missing', 'missing', 'missing']);
assert.equal(refState('image', 3, two).tip, 'No image 3 attached');
assert.equal(refState('video', 2, two).tip, 'No video 2 attached');
assert.deepEqual(toks('@image1', { image: 0 }).map((x) => x[3]), ['missing']);
assert.deepEqual(toks('was @image? here', two), [['@image?', 'image', null, 'stale']]);
// unknown counts (result viewer): neutral chips
assert.deepEqual(toks('@image9').map((x) => x[3]), ['unknown']);
// adjacent punctuation
assert.deepEqual(toks('(@image1), "@image2". @video1! @audio1.', two).map((x) => x[0]), ['@image1', '@image2', '@video1', '@audio1']);
// a "?" right after is not a mention (it marks a removed one, "@image?"); the server's rewrite skips it too, so no chip promises a link
assert.deepEqual(toks('is it @audio1?', two), []);
assert.equal(applyRefGrammar('is it @audio1?', 'kling-v3', two), 'is it @audio1?');
assert.deepEqual(toks('@image1,@image2;@video1:', two).map((x) => x[0]), ['@image1', '@image2', '@video1']);
// unicode around (the server's own boundary: a non-ASCII letter ends the token, like it does for the rewrite)
assert.deepEqual(toks('café @image1 ✨ @image2é 日本 @Image 2', two).map((x) => x[0]), ['@image1', '@image2', '@Image 2']);
// segments rebuild the text exactly and keep offsets
const p = 'Swap 🎩 from @Image 1 onto @video1, add @image3 (@ghost #orbit)';
const segs = mentionSegments(p, two, { others: true });
assert.equal(segs.map((s) => s.text).join(''), p);
for (const s of segs) assert.equal(p.slice(s.start, s.end), s.text);
assert.deepEqual(segs.filter((s) => s.ref).map((s) => [s.text, s.ref!.state]), [['@Image 1', 'ok'], ['@video1', 'ok'], ['@image3', 'missing']]);
assert.deepEqual(segs.filter((s) => s.other).map((s) => s.text), ['@ghost', '#orbit']);
assert.equal(mentionSegments(p, two).some((s) => s.other), false); // composer: no other tints
// empty / nullish
assert.deepEqual(mentionSegments('', two), []);
assert.deepEqual(mentionSegments(undefined as any), []);
assert.equal(hasRefMention('no refs @ghost'), false);
assert.equal(hasRefMention('see @image1'), true);
// a very long prompt: every mention found, quickly, text intact
const long = Array.from({ length: 5000 }, (_, i) => `shot ${i} uses @image${(i % 3) + 1} and @Video 1.`).join(' ');
const t0 = Date.now(); const ls = mentionSegments(long, two);
assert.ok(Date.now() - t0 < 1000, 'long prompt parses under 1 s');
assert.equal(ls.map((s) => s.text).join(''), long);
assert.equal(ls.filter((s) => s.ref).length, 10000);
assert.equal(ls.filter((s) => s.ref?.state === 'missing').length, Math.floor(5000 / 3) + (5000 % 3 >= 3 ? 1 : 0));
// the chips match what the server rewrites: every "ok" chip is rewritten to the model's token, never left as "@…"
const kling = applyRefGrammar('@image1 @Image 2 @video1', 'kling-v3', two);
assert.ok(!/@/.test(kling), kling);
console.log('mention-chips ok');
