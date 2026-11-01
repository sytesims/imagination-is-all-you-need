// Feed captions, titles and screen-reader labels read a prompt as plain words (2026-11-01): plainPrompt (shared/typedPrompt.ts) turns
// @image2 / @Video 1 / @audio1 chips and a model's own tokens into "picture 2", "video 1", "audio 1", never changing the stored prompt;
// the shared FeedCaption shows it. Run: npx tsx test/plain-prompt-caption.test.ts
import assert from 'node:assert/strict';
const { plainPrompt } = await import('../src/shared/typedPrompt.ts');

// 1. plainPrompt
assert.equal(plainPrompt('put the coat from @image2 on the dancer in @video1'), 'put the coat from picture 2 on the dancer in video 1');
assert.equal(plainPrompt('@image1, @image2 and @audio1.'), 'picture 1, picture 2 and audio 1.', 'punctuation right after a tag is kept');
assert.equal(plainPrompt('the cat (@Image 1) dances to @Audio 2!'), 'the cat (picture 1) dances to audio 2!', 'capitals and "@Image 1" with a space');
assert.equal(plainPrompt('swap in @img3'), 'swap in picture 3');
assert.equal(plainPrompt('keep the motion of @video'), 'keep the motion of the video', 'a bare @video is the clip');
assert.equal(plainPrompt('the face from @image?'), 'the face from the removed picture', 'a removed photo');
assert.equal(plainPrompt('email me @images or @image'), 'email me @images or @image', 'a bare @image and other words are not references');
assert.equal(plainPrompt('<Picture 2> waves in <<<video_1>>>'), 'picture 2 waves in video 1', "a model's own tokens");
assert.equal(plainPrompt('a red fox\n  in the snow'), 'a red fox in the snow', 'one line');
assert.equal(plainPrompt(''), ''); assert.equal(plainPrompt(undefined), ''); assert.equal(plainPrompt(null), ''); assert.equal(plainPrompt(42), '');
assert.equal(plainPrompt('a red fox in the snow'), 'a red fox in the snow', 'plain words as typed');
{ const stored = { prompt: 'the woman from @image1' }; plainPrompt(stored.prompt); assert.equal(stored.prompt, 'the woman from @image1', 'display only'); }
console.log('ok plainPrompt');

// 2. where a prompt is shown as plain text (titles, aria labels, one-line subtitles): each goes through plainPrompt (web imports CSS, so read the source)
import fs from 'node:fs'; import path from 'node:path';
const rd = (f: string) => fs.readFileSync(path.resolve(import.meta.dirname, '../../web/src', f), 'utf8');
assert.match(rd('shared/FeedCaption.tsx'), /const t = plainPrompt\(title\);[\s\S]*<b title=\{t\}>\{t\}<\/b>/, 'the shared feed caption (Image, Video)');
{ const card = rd('ui/next/feed/FeedCard.tsx'); assert.match(card, /const said = plainPrompt\(prompt\)/); assert.doesNotMatch(card, /\$\{prompt \|\| j\.id\}/, 'FeedCard aria labels use the plain words'); }
assert.match(rd('ui/next/ImageCanvas.tsx'), /<span>\{plainPrompt\(prompt\)\}<\/span>/, 'a set card\'s meta line');
assert.match(rd('shared/GenTile.tsx'), /plainPrompt\(typedPromptOf\(j\.input\)\)/, 'the running tile and job rows');
assert.match(rd('shared/activeJobs.ts'), /plainPrompt\(typedPromptOf\(/, 'the done notification');
assert.match(rd('platform/History.tsx'), /plainPrompt\(typedPromptOf\(j\?\.input\)\)/, 'History pin label');
assert.match(rd('ui/audio/AudioFeed.tsx'), /prompt: plainPrompt\(prompt\)[\s\S]*subtitle=\{plainPrompt\(prompt\) \|\| null\}/, 'Audio card title and subtitle');
assert.doesNotMatch(rd('ui/video/KeyframeStrip.tsx'), /@image2|&lt;Picture 2&gt;/, 'the Keyframes tip says it in plain words');
console.log('ok plain-word call sites');
console.log('ALL OK');
