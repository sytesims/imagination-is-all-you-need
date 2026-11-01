// Create Image feed sections (web/src/ui/next/feed/feedLayout.ts): compare groups as their own sections, singles that come right
// before a group end their row with a filler (regression: a single result after a Compare run became a full-width cropped banner).
// Run: npx tsx test/feed-layout.test.ts   (no server, no network)
import assert from 'node:assert/strict';
import { feedSections, withSetPlaces, setOpenByDefault, groupSets, setWords, setProgress, parseSetFold, withSetFold, SET_FOLD_MAX } from '../../web/src/ui/next/feed/feedLayout.ts';
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

// a set still being sent: every place shows from the first frame (no lone card, no row that grows one card at a time)
{ type S = { id: string; compare: { id: string; n: number; i: number } };
  const m = (id: string, i: number, n = 4): S => ({ id, compare: { id: 'G', n, i } }); const make = (i: number): S => ({ id: `wait${i}`, compare: { id: 'G', n: 4, i } });
  assert.deepEqual(withSetPlaces([m('', 0)], make).map(x => x.id), ['', 'wait1', 'wait2', 'wait3']);
  assert.deepEqual(withSetPlaces([m('c', 2), m('a', 0)], make).map(x => x.id), ['a', 'wait1', 'c', 'wait3']);
  assert.deepEqual(withSetPlaces([m('a', 0), m('b', 1), m('c', 2), m('d', 3)], make).map(x => x.id), ['a', 'b', 'c', 'd']);
  assert.deepEqual(withSetPlaces([m('a', 1, 2)], make).map(x => x.id), ['wait0', 'a']); }
ok('a set being sent shows all its places at once, in order; a full set gets no extra cards');

// collapsible sets (2026-11-01): open while running and for the latest run; older finished sets start folded; the reader's choice wins
{ type F = { id: string; status: string; createdAt: number; compare?: { id: string; n: number; i: number; kind?: string } | null };
  const m = (id: string, g: string, t: number, status = 'done', i = 0, n = 2): F => ({ id, status, createdAt: t, compare: { id: g, n, i } }); const one = (id: string, t: number): F => ({ id, status: 'done', createdAt: t });
  assert.equal(setOpenByDefault({ running: true, latest: false }), true); assert.equal(setOpenByDefault({ running: false, latest: true }), true); assert.equal(setOpenByDefault({ running: false, latest: false }), false);
  ok('default rule: running or latest is open, an older finished set is folded');
  const feed = [one('s', 50), m('a1', 'A', 40), m('a2', 'A', 40, 'done', 1), m('b1', 'B', 30, 'running'), m('b2', 'B', 30, 'done', 1), m('c1', 'C', 10), m('c2', 'C', 10, 'done', 1)];
  const choice: Record<string, boolean> = {}; const isOpen = (g: string, info: { running: boolean; latest: boolean }) => choice[g] ?? setOpenByDefault(info);
  const shape2 = () => feedSections(feed, j => [j.id], isOpen).map(x => `${x.group ?? 'S'}${x.folded ? '-' : ''}${x.fill ? '|' : ''}`);
  assert.deepEqual(shape2(), ['S|', 'A', 'B', 'C-']);
  ok('A is the latest (open), B runs (open), C is older and finished (folded); the single before an open set ends its row');
  choice.A = false; assert.deepEqual(shape2(), ['S', 'A-|', 'B', 'C-']);
  ok('a folded set flows inline like a tile: no filler before it, and it ends its row before an open set');
  choice.B = false; assert.deepEqual(shape2(), ['S', 'A-', 'B-', 'C-']);
  ok('the reader can fold a running set (its card shows the progress); all folded: one flowing row, no fillers');
  assert.deepEqual(feedSections([m('x', 'X', 5), m('y', 'Y', 9)], j => [j.id], (_g, i) => setOpenByDefault(i)).map(x => !!x.folded), [true, false]);
  ok('latest means the newest set by its jobs’ time, whatever the sort');
  assert.deepEqual(feedSections(feed, j => [j.id]).map(x => !!x.folded), [false, false, false, false]);
  ok('no fold rule given (old callers): every set open, as before');
  assert.deepEqual(setWords([{ compare: { id: 'G', n: 4, i: 0, kind: 'swatch' } }]), { title: 'Material Swap', count: '4 swatches', n: 4 });
  assert.deepEqual(setWords([{ compare: { id: 'G', n: 3, i: 0 } }]), { title: 'Compare models', count: '3 models', n: 3 });
  assert.deepEqual(setProgress([m('a', 'G', 1, 'done', 0, 4), m('b', 'G', 1, 'running', 1, 4), m('c', 'G', 1, 'failed', 2, 4)]), { done: 1, failed: 1, running: 1, total: 4 });
  ok('a folded card’s words and progress');
  assert.deepEqual(groupSets([one('p', 9), m('b2', 'B', 8, 'done', 1), one('q', 7), m('b1', 'B', 6, 'done', 0)]).map(j => j.id), ['p', 'b1', 'b2', 'q']);
  const retry = { ...m('r', 'B', 9, 'done', 0), input: { retryOf: 'b1' } }; assert.deepEqual(groupSets([retry, m('b1', 'B', 6, 'failed', 0), m('b2', 'B', 6, 'done', 1)] as any[]).map((j: any) => j.id), ['r', 'b2']);
  ok('groupSets: a set sits at its first member’s place, in set order; a retry takes the retried run’s place');
  assert.deepEqual(parseSetFold('{"A":false,"B":true,"bad key!":true,"C":1}'), { A: false, B: true }); assert.deepEqual(parseSetFold('nope'), {}); assert.deepEqual(parseSetFold(null), {}); assert.deepEqual(parseSetFold('[1]'), {});
  const many = withSetFold({}, Array.from({ length: SET_FOLD_MAX + 5 }, (_, k) => `s${k}`), false); assert.equal(Object.keys(many).length, SET_FOLD_MAX); assert.equal(many.s0, undefined); assert.equal(many[`s${SET_FOLD_MAX + 4}`], false);
  assert.deepEqual(Object.keys(withSetFold({ a: true, b: true }, ['a'], false)), ['b', 'a']);
  ok('stored choices: bad data is ignored, the newest choice moves last, the oldest drop off past the cap'); }
