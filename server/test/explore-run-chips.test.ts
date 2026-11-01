// Explore run chips (2026-11-01): every result on Explore shows one shared chip, "model · where it ran · price", built from real runs.
//  - shared/runChip.ts: the place words come from modelIds.ts (Router and Comfy Cloud runs read "Comfy Cloud", a local run "Your computer"),
//    a local run is Free, an estimate gets "≈", an unknown price is left out, extra runs show as "+N";
//  - every Explore example (the featured entries the page shows, the films, the looks) has a model label and a route;
//  - every section draws it with the one shared component (web/src/shared/RunChip.tsx), no look-alike copies.
// Run: npx tsx test/explore-run-chips.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path';
import { chipOfFeatured, chipOfRun, chipOfChain, chipText, chipPlace, chipUsd } from '../src/shared/runChip.ts';
import { featuredByKey, MOSSBUN_3D_RUN, OUR_COMPUTER, type FeaturedItem } from '../src/shared/featured.ts';
import { LOCAL_LABEL } from '../src/shared/modelIds.ts';
import { EXPLORE_HERO, EXPLORE_STILL, EXPLORE_KOI, EXPLORE_SWAP, EXPLORE_LAYERS, EXPLORE_SHEETS, EXPLORE_FILM, EXPLORE_WORK, EXPLORE_FILMS, EXPLORE_3D, EXPLORE_LOOKS } from '../src/shared/exploreShowcase.ts';
const ok = (m: string) => console.log('ok ' + m);
const WEB = path.resolve(import.meta.dirname, '../../web/src');

// ---- the helper ----
assert.equal(chipPlace(OUR_COMPUTER), LOCAL_LABEL); assert.equal(chipPlace('Comfy Router'), 'Comfy Cloud'); assert.equal(chipPlace('in your browser'), 'In your browser');
assert.equal(chipUsd(0), 'Free'); assert.equal(chipUsd(1.716), '$1.72'); assert.equal(chipUsd(0.28, true), '≈ $0.28'); assert.equal(chipUsd(0.0821), '$0.08', 'Explore’s two decimals ($0.08 each stays)');
const local = { ...featuredByKey('ltx-rain-city')! }; assert.equal(local.runOn, 'local'); assert.deepEqual([chipOfFeatured(local).place, chipOfFeatured(local).price], [LOCAL_LABEL, 'Free'], 'a local run: Your computer · Free');
assert.equal(chipOfFeatured({ ...featuredByKey('ltx-pro-painter')!, costUsd: undefined } as FeaturedItem).price, null, 'unknown price: left out, never guessed');
assert.equal(chipText(chipOfChain(MOSSBUN_3D_RUN, [{ jobId: 'x', model: 'GPT Image 2.5 Flare', place: 'Comfy Router', costUsd: 0.02 }])), 'Tripo 3.1 +1 · Comfy Cloud · ≈ $0.32');
ok('helper: place words, Free, ≈, two decimals, unknown left out, +N');

// ---- every Explore example: a model label and a route ----
const keys = [EXPLORE_HERO.key, EXPLORE_STILL.take.key, EXPLORE_KOI.key, ...EXPLORE_SWAP.runs.map((r) => r.key), EXPLORE_LAYERS.key, ...EXPLORE_SHEETS.cast.map((c) => c.key),
  EXPLORE_FILM.key, EXPLORE_3D.key, 'presenter-talk', ...EXPLORE_WORK.items.map((i) => i.priceKey)];
for (const k of keys) { const f = featuredByKey(k); assert.ok(f, `${k}: a featured entry`); const c = chipOfFeatured(f!);
  assert.ok(c.model.trim(), `${k}: a model label`); assert.ok(c.place.trim(), `${k}: where it ran`);
  if (f!.runOn !== 'local') { assert.match(f!.route ?? '', /^comfy-(router|cloud):/, `${k}: its route`); assert.equal(c.place, 'Comfy Cloud', `${k}: Router and Comfy Cloud runs read Comfy Cloud`); assert.match(c.price ?? '', /^(≈ )?\$\d+\.\d\d$/, `${k}: its price`); } }
for (const f of [EXPLORE_FILMS.feature, EXPLORE_FILMS.comedy, EXPLORE_FILMS.teaser, EXPLORE_FILMS.horror, EXPLORE_FILMS.counterOffer, EXPLORE_FILMS.lighthouse]) {
  assert.ok(f.chip.model && f.chip.place, `${f.key}: a model label and a place`); assert.match(f.chip.price ?? '', /^(≈ )?\$\d+\.\d\d$/, `${f.key}: its price`); }
for (const l of EXPLORE_LOOKS.looks) assert.ok(l.model, `${l.id}: a model label`);
for (const r of EXPLORE_3D.steps) assert.ok(chipOfRun({ jobId: r.job, model: 'x', place: 'Comfy Cloud', costUsd: 0 }).place, `${r.step}: a place`);
/* the "Made for your work" prices stay as they were */
const work = Object.fromEntries(EXPLORE_WORK.items.map((i) => [i.id, chipText(chipOfFeatured(featuredByKey(i.priceKey)!, { model: i.model, note: i.per || undefined }))]));
assert.deepEqual(work, { 'material-swap': 'Nano Banana 2 · Comfy Cloud · $0.08 · each', 'ad-pack': 'GPT Image 2 · Comfy Cloud · $0.20 · for 3', 'image-layers': 'Seedream 5.0 Flash · Comfy Cloud · $0.33' });
ok(`${keys.length} featured examples + ${6} films + ${EXPLORE_LOOKS.looks.length} looks: each has a model label and a route`);

// ---- one shared component on every section ----
const read = (f: string) => fs.readFileSync(path.join(WEB, f), 'utf8');
for (const f of ['ui/explore/ExploreShowcase.tsx', 'ui/explore/ExploreWork.tsx', 'ui/explore/Explore3D.tsx', 'ui/explore/ExploreFilms.tsx', 'ui/explore/ExplorePresenter.tsx'])
  assert.match(read(f), /import \{ RunChip \} from '\.\.\/\.\.\/shared\/RunChip'/, `${f}: the shared RunChip`);
const xs = read('ui/explore/ExploreShowcase.tsx');
for (const fn of ['XpHero', 'XpStill', 'XpKoi', 'XpSwap', 'XpLayers', 'XpSheets', 'XpFilm', 'XpLooks']) {
  const at = xs.indexOf(`export function ${fn}()`); assert.ok(at > 0, fn); const body = xs.slice(at, xs.indexOf('\n}\n', at));
  assert.ok(/<RunChip\b/.test(body) || /HeroCredit/.test(body), `${fn}: draws the shared chip`); }
assert.doesNotMatch(read('ui/explore/ExploreWork.tsx'), /xv-pill/, 'Made for your work: no look-alike pills left');
ok('one shared RunChip in every section');
