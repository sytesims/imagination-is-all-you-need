// Explore's "One app, every way to run" (2026-11-01, web/src/ui/explore/ExploreRun.tsx, data EXPLORE_RUN in shared/exploreShowcase.ts). Covers:
//  - three places in the app's place words, each with a See it link to a real screen, and a price example that names a real model and place;
//  - the counts come from the workflow lists themselves (never typed), the template line never one number for both;
//  - plain copy (no "our"/"we", no "Mac", no "any model"), mounted right under the hero with the order tests still holding.
// Run: npx tsx test/explore-run.test.ts   (no server, no network)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path';
const ok = (m: string) => console.log('ok ' + m);
const ROOT = path.resolve(import.meta.dirname, '../..'); const WEB = path.join(ROOT, 'web/src');
const { EXPLORE_RUN } = await import('../src/shared/exploreShowcase.ts');
const { LOCAL_LABEL } = await import('../src/shared/modelIds.ts');

assert.deepEqual(EXPLORE_RUN.places.map((p) => p.id), ['local', 'comfy-cloud', 'comfy-router']);
assert.equal(EXPLORE_RUN.places[0].name, LOCAL_LABEL, 'Your computer, the app’s own word');
for (const p of EXPLORE_RUN.places) {
  assert.match(p.see.href, /^\/(settings#conn-local|video\?model=[\w.-]+)$/, `${p.id}: See it opens a real screen`);
  if (p.see.href.startsWith('/video')) assert.equal(p.see.href, `/video?model=${p.example.modelKey}`, `${p.id}: See it opens the model its price names`);
}
ok('three places, each with a See it link and a price example');

const copy = JSON.stringify(EXPLORE_RUN);
assert.doesNotMatch(copy, /\b(our|ours|we|us)\b/i, 'users install this app: no our / we'); assert.doesNotMatch(copy, /\bMac\b|any model|every model|\b10[0-9]\b|125/, 'never Mac, any model or an exact template number');
assert.match(EXPLORE_RUN.templates, /30 bundled, over 120 credited/);
ok('plain copy; the template line says bundled and credited apart');

const ui = fs.readFileSync(path.join(WEB, 'ui/explore/ExploreRun.tsx'), 'utf8');
for (const k of ['WORKFLOW_IDS.length', 'VIDEO_WORKFLOWS.length', 'AUDIO_WORKFLOW_IDS.length', "w.status === 'ready'", "startsWith('app-')", "t.id === 'camera'"]) assert.ok(ui.includes(k), `counts from the lists: ${k}`);
assert.match(ui, /listPrice\(/, 'prices in the picker’s own words'); assert.match(ui, /prefersReducedMotion\(\)/, 'reduced motion: no stepping');
ok('counts and prices are read, never typed');

const home = fs.readFileSync(path.join(WEB, 'ui/Home.tsx'), 'utf8');
assert.match(home, /<XpHero \/>\s*<div className="xp-in"><XpRun tools=\{tools\} \/><XpWork \/><\/div>/, 'right under the hero, before Made for your work');
ok('mounted under the hero');
assert.doesNotMatch(ui, /\?run=|runVariant|RunA|RunC|xr-tile|xr-band/, 'one layout (option B): no preview switch left');
assert.match(ui, /tablist[\s\S]*apop bp apop-runon xr-pop[\s\S]*xr-go/, 'the places beside the real Run on picker look, the price on Generate');
const css = fs.readFileSync(path.join(WEB, 'ui/explore/exploreRun.css'), 'utf8'); assert.doesNotMatch(css, /xr-tile|xr-band|xr-bchip|xr-cline|xr-v-/, 'no CSS left from options A or C');
ok('option B only');
