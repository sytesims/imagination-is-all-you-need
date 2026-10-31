import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { featuredByKey, featuredRecreateHref } from '../src/shared/featured.js';

const home = readFileSync(new URL('../../web/src/ui/Home.tsx', import.meta.url), 'utf8');
const source = readFileSync(new URL('../../web/src/ui/explore/ExplorePresenter.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../web/src/ui/explore/explorePresenter.css', import.meta.url), 'utf8');
assert.match(home, /<XpSheets\s*\/>\s*<XpPresenter\s*\/>\s*<XpLooks\s*\/>/, 'portrait-to-speech follows character creation');
assert.doesNotMatch(home, /<XpTrending\b/, 'the retired Trends section stays hidden');
const f = featuredByKey('presenter-talk')!;
assert.equal(f.model, 'InfiniteTalk (Wan 2.1)');
assert.ok(f.before && f.input.speechUrl);
assert.equal(f.out.width, f.out.height, 'existing square result is not cropped for a portrait card');
for (const media of [f.before.url, f.out.url, f.out.poster, String(f.input.speechUrl)]) {
  assert.ok(existsSync(new URL(`../../web/public${media}`, import.meta.url)), `existing input/output exists: ${media}`);
}
assert.match(featuredRecreateHref(f.key)!, /workflow=lip-sync/);
assert.match(source, /<ChapterText id="presenter"/, 'the same chapter component used by Image to layers');
assert.match(source, /cta=\{\{ label: 'Make it talk'/, 'primary action starts the Lip Sync workflow');
assert.match(source, /rec=\{href\} recLabel="Recreate this one"/, 'the quieter action recreates this exact example');
assert.match(source, /name: 'Portrait'[\s\S]*name: 'Voice'[\s\S]*name: 'Talking avatar'/, 'same three-step hierarchy as Image to layers');
assert.match(source, /controls hoverSound restartOnSound/, 'shared video and sound controls, no custom playback implementation');
assert.match(source, /placeOfRoute\(f\.route\)/, 'run location comes from the featured record');
assert.match(css, /\.xpa-film \.sfilm-media\{object-fit:contain\}/);
console.log('ok presenter placement, shipped portrait/speech/video, native square frame, real model, Lip Sync recreation');
