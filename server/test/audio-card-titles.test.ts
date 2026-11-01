// Audio card titles (2026-11-01). Pure, in process; no data dir, no browser.
//  - shared/shortTitle: a short title from a song prompt (a leading language tag skipped, the first phrase, ≤ 4 words / 24 chars on the card)
//  - the job's own title first (an example's), the prompt as one dim line under it; shortModelName keeps the chip row on one line
//  - the card: one title line, one prompt line, the chip row full width, the waveform pinned to the bottom (every card one height)
// Run: npx tsx test/audio-card-titles.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path';
const ok = (m: string) => console.log('ok ' + m);
const { shortTitle, resultTitle, shortModelName } = await import('../src/shared/shortTitle.ts');
const t = (p: string) => shortTitle(p, 4, 24);

// the six sounds the app ships (their prompts, as typed)
assert.equal(t('indie folk, hushed tenor, nylon guitar, soft percussion, slow build'), 'Indie folk');
assert.equal(t('English, magical music box, celesta, soft felt piano, warm strings, whimsical, wonder, gentle, dreamy, childlike, film score, soft female humming'), 'Magical music box');
assert.equal(t('English, cinematic film score, soaring strings, soft choir, music box, celesta, wonder, grand, uplifting, warm, emotional, swelling, soft female humming'), 'Cinematic film score');
assert.equal(t('English, haunting lullaby, eerie soft female vocal, siren, music box, slow, minor key, dark ambient, reverb'), 'Haunting lullaby');
assert.equal(t('Upbeat lo-fi hip hop with warm piano chords and soft vinyl crackle'), 'Upbeat lo-fi hip hop');
assert.equal(t('Heavy rain on a tin roof with distant rolling thunder'), 'Heavy rain');
ok('the six shipped prompts: a few plain words, no "English," lead');

// edges: empty, very short, only a language, several languages, very long, other languages
assert.equal(t(''), ''); assert.equal(t('   '), ''); assert.equal(t('Hi'), 'Hi');
assert.equal(t('English'), 'English', 'a language alone stays (nothing else to say)');
assert.equal(t('English and Spanish, reggaeton pop, summer'), 'Reggaeton pop'); assert.equal(t('japanese, city pop, 80s'), 'City pop');
const long = t('a very long sound design prompt for a rainy night market scene with sizzling woks and scooters on wet asphalt '.repeat(4));
assert.ok(long.length <= 24 && long.split(' ').length <= 4, long);
assert.ok(t('x'.repeat(200)).length <= 24, 'one very long word is cut with …');
assert.equal(t('lluvia suave sobre un tejado de zinc, truenos lejanos'), 'Lluvia suave');
assert.equal(t('雨の音、遠くの雷'), '雨の音', 'CJK commas split clauses');
assert.equal(t('Lo-fi piano and vinyl crackle'), 'Lo-fi piano', 'a cut never ends on half a pair');
assert.equal(shortTitle('Strings and choir, a film score'), 'Strings and choir', 'a whole pair stays');
ok('edges: empty, short, language only, long, Spanish, Japanese, pairs');

// the job's own title first (an example's), then the prompt, then the workflow
assert.equal(resultTitle({ title: 'Hold the light, an indie folk song', prompt: 'indie folk, hushed tenor', feature: 'Music' }, 24), 'Hold the light');
assert.equal(resultTitle({ title: 'Rain on a tin roof', prompt: 'Heavy rain on a tin roof', feature: 'Sound effects' }, 24), 'Rain on a tin roof');
assert.equal(resultTitle({ prompt: 'English, haunting lullaby, eerie', feature: 'Music' }, 24), 'Haunting lullaby');
assert.equal(resultTitle({ prompt: '', feature: 'Cover a song' }, 24), 'Cover a song');
assert.equal(resultTitle({ prompt: 'Cinematic close-up portrait of a fisherman at dawn' }), 'Cinematic close-up portrait', 'other tiles keep 32 chars');
ok('own title first, then the prompt, then the workflow');

// a model's short form for the chip row (the full name stays in the tooltip)
assert.equal(shortModelName('Seed Audio 1.0 Multilingual'), 'Seed Audio 1.0'); assert.equal(shortModelName('ElevenLabs Sound Effects'), 'ElevenLabs SFX');
assert.equal(shortModelName('InfiniteTalk (Wan 2.1) · Comfy Cloud'), 'InfiniteTalk'); assert.equal(shortModelName('YuE2'), 'YuE2');
assert.equal(shortModelName('MiniMax Music 3'), 'MiniMax Music 3'); assert.equal(shortModelName(''), ''); assert.equal(shortModelName(null), '');
ok('short model names');

const W = path.resolve(import.meta.dirname, '../../web/src'); const rd = (p: string) => fs.readFileSync(path.join(W, p), 'utf8');
const feed = rd('ui/audio/AudioFeed.tsx'); const card = rd('shared/AudioCard.tsx'); const css = rd('shared/audioCard.css'); const page = rd('ui/audio/audioPage.css');
assert.match(feed, /resultTitle\(\{ title: \(j as any\)\.title \|\| \(j as any\)\.example\?\.title, prompt/, 'own title, then the example\'s, then the prompt');
assert.match(feed, /subtitle=\{prompt \|\| null\} model=\{shortModelName\(model\)\} modelTitle=\{model\}/);
assert.match(card, /className="ac-sub" data-testid=\{`\$\{testId\}-sub`\} title=\{sub\}/, 'the full prompt on hover');
assert.match(card, /title=\{modelTitle && modelTitle !== model \? modelTitle : undefined\}/, 'the full model name on hover');
assert.match(css, /\.ac-tile \.ac-title\{display:block;[^}]*white-space:nowrap/, 'one title line'); assert.match(css, /\.ac-sub\{[^}]*white-space:nowrap;text-overflow:ellipsis/);
assert.match(css, /\.ac-tile \.ac-row\{margin-top:auto\}/, 'the waveform sits at the bottom');
assert.match(page, /:has\(\.ic-tile-feat\) \.ac-title\{padding-right:64px\}/, 'only the title line makes room for "Example"');
ok('the card: title, dim prompt line, full-width chips, waveform at the bottom');
