// The composer bar's fold rules (web/src/shared/chipFit.ts; shared/dockFit useChipFit runs them on the DOM of every bar).
// Run: npx tsx test/composer-fit.test.ts   (no server, no network)
import assert from 'node:assert/strict';
import { foldOrder, runFit, worthFolding, priOf, fitPri, FOLD_BUTTON_W, type FitItem } from '../../web/src/shared/chipFit.ts';
const ok = (m: string) => console.log('ok ' + m);

type It = FitItem & { id: string };
const it = (id: string, width: number, o: Partial<FitItem> = {}): It => ({ id, width, pri: 'normal', rank: 0, index: 0, dest: 'more', ...o });

// ---- 1. priorities: keep never folds; low first; then rank; then the last in the row ----
{
  const items = [it('light', 220, { pri: 'keep', index: 0 }), it('scene', 150, { index: 1 }), it('shape', 90, { index: 2 }), it('eye', 32, { pri: 'low', index: 3 }),
    it('brand', 180, { pri: 'keep', index: 4 }), it('seed', 120, { pri: 'low', index: 5 }), it('lang', 120, { rank: 4, index: 6 }), it('enh', 32, { rank: 1, index: 7 })];
  assert.deepEqual(foldOrder(items).map(i => i.id), ['seed', 'eye', 'shape', 'scene', 'enh', 'lang'], 'low first (last in row first), then normal by rank then row order; keep never');
  assert.equal(priOf(undefined), 'normal'); assert.equal(priOf('nonsense'), 'normal'); assert.equal(priOf('keep'), 'keep');
  assert.deepEqual(fitPri('keep'), { 'data-fit': 'keep' });
  ok('fold order: priority, rank, row order; keep never folds');
}

// ---- 2. a control no wider than its fold button only folds once that button shows ----
assert.equal(worthFolding(FOLD_BUTTON_W, false), false, '32px eye into a hidden 32px "···": nothing saved');
assert.equal(worthFolding(FOLD_BUTTON_W, true), true, '"···" already shows: the eye\'s whole width comes back');
assert.equal(worthFolding(80, false), true, 'a wider control is worth folding');
ok('never trade a 32px control for a 32px button');

// ---- 3. the loop on a simulated row: widths, a gap, fold buttons that appear with their first folded control ----
function sim(avail: number, fixed: number, items: It[]) {
  const gap = 4; const on = new Set<It>();
  const shown = (d: string) => [...on].some(i => i.dest === d);
  const used = () => fixed + items.filter(i => !on.has(i)).reduce((s, i) => s + i.width + gap, 0) + ['more', 'settings'].filter(shown).length * (FOLD_BUTTON_W + gap);
  const folded = runFit(items, { over: () => used() > avail, fold: (i, f) => { if (f) on.add(i); else on.delete(i); }, destShown: i => shown(i.dest) });
  return { folded: folded.map(i => i.id).sort(), fits: used() <= avail };
}
{
  /* Relight: workflow + model (measured at its fixed min) = 250; the Light chip is the main control */
  const row = () => [it('light', 222, { pri: 'keep', index: 0 }), it('eye', 32, { pri: 'low', index: 1 })];
  assert.deepEqual(sim(600, 250, row()), { folded: [], fits: true }, 'room: nothing folds');
  assert.deepEqual(sim(500, 250, row()), { folded: [], fits: false }, 'tight: the Light chip stays and the eye does not swap for "···" (the caller truncates instead)');
  /* Audio with an active brand: Brand keeps its place; the low-use extras go */
  const audio = () => [it('takes', 60, { rank: 2, index: 1, dest: 'settings' }), it('enh', 32, { rank: 1, index: 2, dest: 'settings' }), it('brand', 183, { pri: 'keep', index: 3 }), it('eye', 32, { pri: 'low', index: 4 })];
  const r = sim(540, 270, audio());
  assert.ok(!r.folded.includes('brand'), 'an active Brand never folds'); assert.ok(r.fits, 'the row fits');
  assert.deepEqual(r.folded, ['enh', 'takes'], 'takes folds; then the 32px sparkle can follow it into the Settings button that now shows');
  assert.deepEqual(sim(580, 270, audio()).folded, ['takes'], 'a little more room: only takes folds; the sparkle stays');
  ok('simulated rows: main control and active Brand stay');
}
{
  /* give back: a small control folded first only swapped for its button; once a wider one had to go, the small one comes back */
  const items = [it('wide', 140, { index: 0 }), it('small', 40, { pri: 'low', index: 1 })];
  const r = sim(290, 120, items);
  assert.deepEqual(r.folded, ['wide'], 'the small one is given back after the wide one folded'); assert.ok(r.fits);
  ok('give back what fits again');
}
{
  /* stable: the result depends on the widths only; the same row twice gives the same folds (no sticky state) */
  const mk = () => [it('a', 100, { index: 0 }), it('b', 100, { index: 1 }), it('c', 100, { pri: 'low', index: 2 })];
  assert.deepEqual(sim(400, 150, mk()), sim(400, 150, mk()));
  assert.deepEqual(sim(1000, 150, mk()).folded, [], 'a wide row again: everything back');
  ok('same widths, same folds');
}
