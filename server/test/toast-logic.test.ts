// Toasts (2026-10-25): the success mapping, repeat merging, the 3-card stack with "+N", life and the dock-avoiding lift.
// Pure: no server, no network. Run: npx tsx test/toast-logic.test.ts
import assert from 'node:assert/strict';
import { toastKind, addToast, visibleToasts, titleWithCount, lifeOf, splitMessage, toastBottom, VISIBLE, KEEP, type ToastItem } from '../../web/src/shared/toastLogic.ts';
const ok = (m: string) => console.log('ok ' + m);

// ---- 1. kind: info that says something got done is success; explicit kinds and refusals are kept ----
for (const t of ['Prompt copied', 'Saved “Moody”', 'Moved to Trash', 'Trash emptied · 3 removed', 'Background removed', 'Profile saved', 'Restored 2 to Assets', 'Generation finished'])
  assert.equal(toastKind(t), 'success', t);
for (const t of ['Couldn’t copy the link', 'The mask wasn’t saved with that run', 'Your saved mask was cleared', 'That project was deleted', 'Re-roll is available for runs started in this session', 'Running locally', 'Cancelled', 'Export started'])
  assert.equal(toastKind(t), 'info', t);
assert.equal(toastKind('Prompt copied', 'warn'), 'warn', 'an explicit kind wins');
assert.equal(toastKind('Saved', 'error'), 'error');
assert.equal(toastKind('Anything', 'success'), 'success');
ok('kind mapping');

// ---- 2. merge repeats, keep order, drop the oldest non-error past KEEP ----
const base = (title: string, kind: ToastItem['kind'] = 'success') => ({ title, kind, ms: 4000 });
let xs: ToastItem[] = []; let id = 0;
const push = (t: ReturnType<typeof base>) => { const r = addToast(xs, t, id + 1); if (!r.merged) id = r.id; xs = r.items; return r; };
push(base('Saved')); const r2 = push(base('Saved')); const r3 = push(base('Saved'));
assert.equal(xs.length, 1); assert.equal(xs[0].count, 3); assert.ok(r2.merged && r3.merged); assert.equal(r3.id, xs[0].id, 'the merged card restarts its timer');
assert.equal(titleWithCount(xs[0]), 'Saved ×3');
push(base('Saved', 'error')); assert.equal(xs.length, 2, 'same words, different kind: a new card');
xs[0] = { ...xs[0], out: true }; push(base('Saved')); assert.equal(xs.length, 3, 'a card on its way out does not absorb a repeat');
xs = []; id = 0; push(base('boom', 'error'));
for (let i = 0; i < KEEP + 3; i++) push(base('n' + i, 'info'));
assert.equal(xs.length, KEEP); assert.ok(xs.some(x => x.title === 'boom'), 'errors outlive info when trimming');
ok('merge and trim');

// ---- 3. stack: newest VISIBLE show, the rest wait behind "+N" ----
xs = []; id = 0; for (const t of ['a', 'b', 'c', 'd', 'e']) push(base(t));
let v = visibleToasts(xs); assert.deepEqual(v.shown.map(x => x.title), ['c', 'd', 'e']); assert.equal(v.hidden, 2); assert.equal(VISIBLE, 3);
v = visibleToasts(xs, true); assert.equal(v.shown.length, 5); assert.equal(v.hidden, 0);
xs = xs.map(x => x.title === 'e' ? { ...x, out: true } : x); v = visibleToasts(xs);
assert.deepEqual(v.shown.map(x => x.title), ['b', 'c', 'd', 'e'], 'the leaving card keeps its place while the next waits in'); assert.equal(v.hidden, 1);
assert.deepEqual(visibleToasts([]), { shown: [], hidden: 0 });
ok('stack +N');

// ---- 4. life 4–10 s, split ----
assert.equal(lifeOf({ kind: 'success' }), 4000); assert.equal(lifeOf({ kind: 'warn' }), 6000); assert.equal(lifeOf({ kind: 'error' }), 8000);
assert.equal(lifeOf({ kind: 'info', action: {} }), 8000); assert.equal(lifeOf({ kind: 'error', detail: 'x' }), 10000);
assert.deepEqual(splitMessage('Link copied. Only you can open it.'), { title: 'Link copied', sub: 'Only you can open it.' });
assert.deepEqual(splitMessage('Prompt copied'), { title: 'Prompt copied' });
ok('life and split');

// ---- 5. lift above the dock / tab bar / filmstrip; ignore what is beside, high up or full-page ----
const view = { w: 1440, h: 900 };
assert.equal(toastBottom([], view, 420, 24), 24, 'nothing below: the base inset');
assert.equal(toastBottom([{ top: 760, bottom: 884, left: 280, right: 1160 }], view, 420, 24), 152, 'dock: 900 - 760 + 12');
assert.equal(toastBottom([{ top: 760, bottom: 884, left: 0, right: 300 }], view, 420, 24), 24, 'a bar beside the column');
assert.equal(toastBottom([{ top: 100, bottom: 400, left: 0, right: 1440 }], view, 420, 24), 24, 'a bar high on the page');
assert.equal(toastBottom([{ top: 0, bottom: 900, left: 0, right: 1440 }], view, 420, 24), 24, 'a full-page modal is not a bar');
assert.equal(toastBottom([{ top: 0, bottom: 0, left: 0, right: 0 }], view, 420, 24), 24, 'hidden');
assert.equal(toastBottom([{ top: 760, bottom: 884, left: 280, right: 1160 }, { top: 790, bottom: 900, left: 0, right: 1440 }], view, 420, 24), 152, 'the highest bar wins');
assert.equal(toastBottom([{ top: 600, bottom: 780, left: 0, right: 390 }, { top: 780, bottom: 844, left: 0, right: 390 }], { w: 390, h: 844 }, 366, 12), 256, 'phone: dock above the tab bar');
ok('dock lift');
