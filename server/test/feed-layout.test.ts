// Create Image feed sections (web/src/ui/next/feed/feedLayout.ts): compare groups as their own sections, singles that come right
// before a group end their row with a filler (regression: a single result after a Compare run became a full-width cropped banner).
// Run: npx tsx test/feed-layout.test.ts   (no server, no network)
import assert from 'node:assert/strict';
import { feedSections } from '../../web/src/ui/next/feed/feedLayout.ts';
const ok = (m: string) => console.log('ok ' + m);

type J = { id: string; compare?: { id: string } | null; n?: number };
const s = (id: string, n = 1): J => ({ id, n }); const c = (id: string, g: string): J => ({ id, compare: { id: g } });
const tiles = (j: J) => Array.from({ length: j.n ?? 1 }, (_, k) => `${j.id}#${k}`);
const shape = (shown: J[]) => feedSections(shown, tiles).map(x => `${x.group ?? 'S'}:${x.tiles.length}${x.fill ? '|' : ''}`);

// newest first: a single landed after a 4-model compare
assert.deepEqual(shape([s('a'), c('c1', 'G'), c('c2', 'G'), c('c3', 'G'), c('c4', 'G')]), ['S:1|', 'G:4']);
ok('single then compare: the single ends its row (no full-width stretch), the group keeps its 4 tiles');
assert.deepEqual(shape([s('b', 4), c('c1', 'G'), c('c2', 'G')]), ['S:4|', 'G:2']);
ok('a 4-image batch before a group ends its row');
assert.deepEqual(shape([s('x'), c('c1', 'G'), c('c2', 'G'), s('y'), s('z')]), ['S:1|', 'G:2', 'S:2']);
ok('single, compare, singles: only the section before the group gets a filler (the last one has the feed’s own)');
assert.deepEqual(shape([c('a1', 'A'), c('a2', 'A'), c('b1', 'B'), c('b2', 'B'), c('b3', 'B')]), ['A:2', 'B:3']);
ok('two compare groups in a row stay two sections, no filler between them');
assert.deepEqual(shape([s('p'), s('q'), s('r')]), ['S:3']);
assert.deepEqual(shape([]), []);
ok('only singles: one section, no extra filler; empty feed: nothing');
assert.deepEqual(shape([c('a1', 'A'), s('m'), c('b1', 'B')]), ['A:1', 'S:1|', 'B:1']);
assert.deepEqual(feedSections([c('a1', 'A'), c('a2', 'A')], tiles)[0].jobs.map(j => j.id), ['a1', 'a2']);
ok('a single between two groups ends its row; group sections keep their jobs in order');
