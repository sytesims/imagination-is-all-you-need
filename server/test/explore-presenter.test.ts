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
assert.match(source, /Portrait[\s\S]*Voice[\s\S]*Talking video/, 'one row: portrait + voice → talking video');
assert.match(source, /useWaveform/, 'the voice card draws the real speech clip');
assert.match(source, /<ShowcaseFilm[^>]*controls/, 'shared video and sound controls, no custom playback implementation');
assert.match(source, /videoWorkflowHref\('lip-sync'\)[^>]*>Make it talk/, 'primary action starts the Lip Sync workflow');
assert.match(source, /to=\{rec\}[^>]*>or recreate this one/, 'the quieter action recreates this exact example');
assert.match(source, /placeOfRoute\(f\.route\)/, 'run location comes from the featured record');
assert.match(css, /\.xpa-film\{[^}]*aspect-ratio:1/, "the square result sits in a square card, so nothing is cropped");
console.log('ok presenter row: shipped portrait, speech and video, square frame, real model, Lip Sync and recreate links');
