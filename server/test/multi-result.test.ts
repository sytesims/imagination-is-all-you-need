// Jobs with several results (2026-10-25): the pure rules behind the shared card + viewer (web shared/multiResultRules.ts): which
// presentation a workflow gets, the items (done / failed / running, in angle order), labels and badge text, the card mosaic, grid columns
// and the saved-grid layout.
// Run: npx tsx test/multi-result.test.ts   (no server, no network)
import assert from 'node:assert/strict';
import { presentationOf, kindOf, resultItems, resultItemsOf, itemLabel, countText, badgeText, cardModeOf, mosaicOf, gridCols, sheetLayout, sheetCell, digitPick, PRESENTATIONS } from '../../web/src/shared/multiResultRules.ts';
const ok = (m: string) => console.log('ok ' + m);

// ---- which presentation ----
assert.equal(kindOf({ toolId: 'app-shots', input: { shots: [{ id: 'front', label: 'Front' }] } }), 'angles');
assert.equal(kindOf({ toolId: 'app-image-layers', input: { layers: true } }), 'layers');
assert.equal(kindOf({ toolId: 'app-character-sheet', input: {} }), 'sheet');
assert.equal(kindOf({ toolId: 'create-image', input: { n: 4 } }), 'batch');
assert.equal(kindOf({ toolId: 'h3-video', outputs: [{ url: '/files/a.mp4' }, { url: '/files/b.mp4' }] }), 'takes');
assert.equal(presentationOf({ toolId: 'app-image-layers', input: { layers: true } }).fit, 'contain', 'layers show whole');
assert.equal(PRESENTATIONS.layers.alpha, true); assert.equal(PRESENTATIONS.layers.saveGrid, false); assert.equal(PRESENTATIONS.layers.strip, false);
assert.equal(PRESENTATIONS.sheet.card, 'hero'); assert.equal(PRESENTATIONS.sheet.fit, 'contain'); assert.equal(PRESENTATIONS.angles.compare, true);
ok('presentation per workflow');

// ---- items: angle order, a missing angle, still making ----
const shots = ['Front', '¾ left', '¾ right', 'Side'].map((label, k) => ({ id: `s${k}`, label }));
const done = { toolId: 'app-shots', status: 'done', input: { shots }, outputs: [{ url: '/files/x-out0.png', label: 'Front' }, { url: '/files/x-out1.png', label: 'Side', width: 1280, height: 720 }, { url: '/files/x-out2.png', label: '¾ left' }] };
const it = resultItems(done);
assert.deepEqual(it.map((x) => x.label), ['Front', '¾ left', '¾ right', 'Side'], 'angle order, not output order');
assert.deepEqual(it.map((x) => x.state), ['done', 'done', 'failed', 'done']);
assert.deepEqual(it.map((x) => x.out), [0, 2, null, 1], 'each keeps its output number');
assert.equal(it[3].w, 1280);
assert.equal(badgeText(it, PRESENTATIONS.angles), '3 of 4 angles');
const running = resultItems({ ...done, status: 'running', outputs: done.outputs.slice(0, 1) });
assert.deepEqual(running.map((x) => x.state), ['done', 'running', 'running', 'running']);
const batch = resultItems({ toolId: 'create-image', status: 'running', input: { n: 4 }, outputs: [] });
assert.equal(batch.length, 4); assert.ok(batch.every((x) => x.state === 'running'));
assert.equal(resultItems({ toolId: 'create-image', status: 'done', input: {}, outputs: [], resultUrl: '/files/r.png' }).length, 1, 'a single result');
assert.equal(resultItems({ toolId: 'h3-video', status: 'done', outputs: [{ url: '/files/a.mp4' }, { url: '/files/a.m4a' }] }).length, 1, 'audio tracks are not results');
const job = { ...done }; assert.equal(resultItemsOf(job), resultItemsOf(job), 'same array for the same job object (memoised cards)');
ok('items');

// ---- labels and badges ----
assert.equal(itemLabel(it[1], 1, PRESENTATIONS.angles), '¾ left');
assert.equal(itemLabel({ ...it[1], label: 'Generate 2' }, 1, PRESENTATIONS.batch), 'Image 2', 'batch: no model labels');
assert.equal(itemLabel({ ...it[1], label: '' }, 0, PRESENTATIONS.takes), 'Clip 1');
assert.equal(countText(9, PRESENTATIONS.angles), '9 angles'); assert.equal(countText(1, PRESENTATIONS.batch), '1 image'); assert.equal(countText(6, PRESENTATIONS.layers), '6 layers');
ok('labels');

// ---- card ----
assert.deepEqual(mosaicOf(2), { show: 2, more: 0, layout: 'm2' }); assert.deepEqual(mosaicOf(3), { show: 3, more: 0, layout: 'm3' });
assert.deepEqual(mosaicOf(9), { show: 4, more: 5, layout: 'm4' }); assert.deepEqual(mosaicOf(16), { show: 4, more: 12, layout: 'm4' });
assert.equal(cardModeOf(PRESENTATIONS.angles, 16 / 9, 9), 'mosaic');
assert.equal(cardModeOf(PRESENTATIONS.sheet, 16 / 9, 2), 'hero', 'a sheet is never chopped');
assert.equal(cardModeOf(PRESENTATIONS.batch, 21 / 9, 2), 'hero', 'two panoramas: no half-width slivers');
assert.equal(cardModeOf(PRESENTATIONS.batch, 21 / 9, 4), 'mosaic', 'four panoramas tile 2×2 uncut');
ok('card');

// ---- grid ----
for (const [n, ar, cols] of [[9, 16 / 9, 3], [9, 1, 3], [9, 3 / 4, 3], [4, 1, 2], [4, 16 / 9, 2], [2, 1, 2], [2, 21 / 9, 1], [6, 1, 3], [16, 1, 4], [1, 1, 1]] as const)
  assert.equal(gridCols(n, ar), cols, `${n} results at ${ar.toFixed(2)} → ${cols} columns`);
const L = sheetLayout(9, 3, 300, 200, 10, 20, 30);
assert.equal(L.w, 20 * 2 + 3 * 300 + 2 * 10); assert.equal(L.h, 20 * 2 + 3 * (200 + 30) + 2 * 10); assert.deepEqual(L.cells[4], { x: 20 + 310, y: 20 + 240 });
const big = sheetCell(21 / 9, 1, 16, 768, 8192); assert.ok(big.h * 16 <= 8192 - 200, 'the canvas stays under the browser limit');
assert.equal(sheetCell(1, 3, 3).w, 768);
ok('grid');

// ---- keys ----
assert.equal(digitPick('3', 9), 2); assert.equal(digitPick('0', 10), 9); assert.equal(digitPick('0', 9), null); assert.equal(digitPick('7', 4), null); assert.equal(digitPick('a', 4), null);
ok('number keys');
