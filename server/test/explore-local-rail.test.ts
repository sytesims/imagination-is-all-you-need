// Explore "Made on your computer. Free." (2026-11-01): the rail of local LTX clips.
//  - every clip is a featured entry that ran on the user's own computer (runOn local, route local:…), is a video file that ships under
//    web/public/showcase with its poster, and its chip reads "<model> · Your computer · Free";
//  - the rail can't show a cloud run or a still, even if one is added to its keys;
//  - the page renders it (Home.tsx) with the shared RunChip, and the phone hero clip fills the hero (no 16:9 strip over an empty band).
// Run: npx tsx test/explore-local-rail.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path';
import { EXPLORE_LOCAL, exploreLocalClips } from '../src/shared/exploreShowcase.ts';
import { featuredByKey } from '../src/shared/featured.ts';
import { chipOfFeatured, chipText } from '../src/shared/runChip.ts';
import { LOCAL_LABEL } from '../src/shared/modelIds.ts';
const ok = (m: string) => console.log('ok ' + m);
const ROOT = path.resolve(import.meta.dirname, '../..'); const PUB = path.join(ROOT, 'web/public');

const clips = exploreLocalClips();
assert.ok(clips.length >= 3, 'the rail has clips'); assert.equal(clips.length, EXPLORE_LOCAL.keys.length, 'every listed key is a local clip (none silently dropped)');
for (const f of clips) {
  assert.equal(f.runOn, 'local', `${f.key}: ran on your computer`);
  assert.ok(!f.route || /^local:/.test(f.route), `${f.key}: a local route`); assert.ok(!f.costUsd, `${f.key}: no price`);
  assert.match(f.out.url, /\.mp4$/, `${f.key}: a clip`);
  for (const u of [f.out.url, f.out.poster]) assert.ok(fs.existsSync(path.join(PUB, u)), `${f.key}: ${u} ships`);
  const c = chipOfFeatured(f); assert.equal(c.place, LOCAL_LABEL); assert.equal(c.price, 'Free'); assert.equal(chipText(c), `${f.model} · Your computer · Free`);
}
ok(`${clips.length} local clips, each "model · Your computer · Free"`);

/* the filter: a cloud run or a still never reaches the rail */
const keys = EXPLORE_LOCAL.keys.slice();
try {
  EXPLORE_LOCAL.keys.push('ltx-pro-painter', 'sc-032054ec');
  assert.equal(featuredByKey('ltx-pro-painter')?.runOn, 'comfy-cloud'); assert.ok(featuredByKey('sc-032054ec'));
  assert.deepEqual(exploreLocalClips().map((f) => f.key), keys, 'a cloud clip and a still are left out');
} finally { EXPLORE_LOCAL.keys.splice(0, EXPLORE_LOCAL.keys.length, ...keys); }
ok('only local, free clips render');

const home = fs.readFileSync(path.join(ROOT, 'web/src/ui/Home.tsx'), 'utf8');
assert.match(home, /<RealResults \/>/, 'Explore renders the rail'); assert.match(home, /exploreLocalClips\(\)/); assert.match(home, /<RunChip\b/, 'the shared chip');
const css = fs.readFileSync(path.join(ROOT, 'web/src/ui/explore/exploreShowcase.css'), 'utf8');
assert.match(css, /\.xph \.sfilm-bleed \.sfilm-stage\{[^}]*aspect-ratio:auto/, 'phone hero: the clip fills the hero');
ok('Home renders the rail with RunChip; the phone hero fills');
