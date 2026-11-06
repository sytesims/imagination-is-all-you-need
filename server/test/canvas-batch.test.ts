// Canvas batches (server/src/shared/canvasBatch.ts + web/src/canvas/batchBuild.ts): all-or-nothing validation, temporary refs, a group
// layout where nothing overlaps, the one dock line, and the board side: ONE history mark (a single Undo removes the whole batch) and a
// bail back to it when any item fails. A stub BoardApi stands in for the board. Run: cd server && npx tsx test/canvas-batch.test.ts
import assert from 'node:assert/strict';
import { validateBatch, batchLayout, batchLine, BATCH_MAX, BATCH_GRID, type BatchItem } from '../src/shared/canvasBatch.ts';
import { buildBatch } from '../../web/src/canvas/batchBuild.ts';
const ok = (m: string) => console.log('ok ' + m);

// ---- all or nothing: the first bad item refuses the whole batch, with a plain reason ----
const good: BatchItem[] = [{ kind: 'add_frame', ref: 'f', name: 'Shots' }, { kind: 'add_card', ref: 'a', workflow: 'create', frame: 'f' }, { kind: 'add_card', ref: 'b', workflow: 'video', inputs_from: ['a'], frame: 'f' },
  { kind: 'add_note', ref: 'n', text: 'Warm light', frame: 'f' }, { kind: 'connect', from_id: 'shape:old', to_id: 'b' }, { kind: 'move_into', ids: ['shape:old'], frame_id: 'f' }];
assert.equal(validateBatch(good), null);
assert.equal(validateBatch(good, (id) => id === 'shape:old'), null, 'real ids are checked against the board');
assert.match(validateBatch(good, () => false)!, /Item 5.*no node “shape:old”/);
assert.match(validateBatch([])!, /at least one/);
assert.match(validateBatch(Array.from({ length: BATCH_MAX + 1 }, () => ({ kind: 'add_note', text: 'x' }) as BatchItem))!, /at most 80/);
assert.match(validateBatch([{ kind: 'run' as any }])!, /can't go in a batch/);
assert.match(validateBatch([{ kind: 'add_card', ref: 'a', workflow: 'create' }, { kind: 'add_card', ref: 'a', workflow: 'create' }])!, /used twice/);
assert.match(validateBatch([{ kind: 'add_card', workflow: 'video', inputs_from: ['k'] }, { kind: 'add_card', ref: 'k', workflow: 'create' }])!, /made later/);
assert.match(validateBatch([{ kind: 'add_card', workflow: 'create', inputs_from: ['nope'] }])!, /neither a ref .* nor a node id/);
assert.match(validateBatch([{ kind: 'add_card', ref: 'shape:x', workflow: 'create' }])!, /a ref is a short name/);
assert.match(validateBatch([{ kind: 'add_card', ref: 'a', workflow: 'create' }, { kind: 'move_into', ids: ['a'], frame_id: 'a' }])!, /not a frame/);
assert.match(validateBatch([{ kind: 'add_card', ref: 'a', workflow: 'create' }, { kind: 'connect', from_id: 'a', to_id: 'a' }])!, /feed itself/);
assert.match(validateBatch([{ kind: 'add_note', text: ' ' }])!, /needs some text/);
assert.match(validateBatch([{ kind: 'add_card', workflow: '' }])!, /name a workflow/);
ok('validation: all or nothing, refs before use, no duplicates, real ids on the board, plain reasons');

// ---- layout: frames are bands, loose items a band of their own, nothing overlaps, explicit spots kept ----
const big: BatchItem[] = [
  { kind: 'add_frame', ref: 'f1', name: 'Hero' }, ...Array.from({ length: 8 }, (_, i): BatchItem => ({ kind: 'add_card', ref: `a${i}`, workflow: 'create', frame: 'f1' })),
  { kind: 'add_frame', ref: 'f2', name: 'Notes' }, ...Array.from({ length: 3 }, (_, i): BatchItem => ({ kind: 'add_note', ref: `n${i}`, text: 'idea', frame: 'f2' })),
  { kind: 'add_frame', ref: 'f3', name: 'Empty' },
  ...Array.from({ length: 4 }, (_, i): BatchItem => ({ kind: 'add_card', workflow: 'music' })), { kind: 'add_card', workflow: 'create', at: { x: -5000, y: -5000 } },
  { kind: 'add_card', ref: 'm', workflow: 'create' }, { kind: 'add_frame', ref: 'f4', name: 'Moved' }, { kind: 'move_into', ids: ['m'], frame_id: 'f4' },
];
const L = batchLayout(big, { x: 100, y: 200 }); const G = BATCH_GRID;
const boxes = Object.entries(L.at).map(([i, c]) => { const it = big[Number(i)]; const s = it.kind === 'add_note' ? G.noteSize : 0; return { i: Number(i), x: c.x - (s || G.cardW) / 2, y: c.y - (s || G.cardH) / 2, w: s || G.cardW, h: s || G.cardH }; });
assert.equal(boxes.length, 8 + 3 + 4 + 1, 'every item without a spot got one (the one with `at` keeps its own)'); assert.equal(L.at[big.findIndex((x) => x.at)], undefined);
for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) { const p = boxes[a], q = boxes[b];
  assert.ok(p.x + p.w <= q.x || q.x + q.w <= p.x || p.y + p.h <= q.y || q.y + q.h <= p.y, `items ${p.i} and ${q.i} overlap`); }
const fr = Object.entries(L.frames).map(([i, b]) => ({ i: Number(i), ...b })); assert.equal(fr.length, 4);
for (let a = 0; a < fr.length; a++) for (let b = a + 1; b < fr.length; b++) { const p = fr[a], q = fr[b]; assert.ok(p.x + p.w <= q.x || q.x + q.w <= p.x || p.y + p.h <= q.y || q.y + q.h <= p.y, `frames ${p.i} and ${q.i} overlap`); }
assert.equal(new Set(fr.map((b) => b.y)).size, 1, 'frames sit side by side, left to right (not stacked bands)');
for (const bx of boxes) { const it = big[bx.i]; const f = it.frame ? big.findIndex((x) => x.ref === it.frame) : it.ref === 'm' ? big.findIndex((x) => x.ref === 'f4') : -1; if (f < 0) continue;
  const b = L.frames[f]; assert.ok(bx.x >= b.x && bx.y >= b.y && bx.x + bx.w <= b.x + b.w && bx.y + bx.h <= b.y + b.h, `item ${bx.i} sits inside its frame`); }
const hero = boxes.filter((b) => big[b.i].frame === 'f1'); assert.equal(new Set(hero.map((b) => b.y)).size, 3, 'eight cards make a compact grid of three columns');
assert.equal(new Set(hero.map((b) => b.x)).size, 3);
assert.ok(L.size.w > 0 && L.size.h > 0 && boxes.every((b) => b.x >= 100 && b.y >= 200 && b.x + b.w <= 100 + L.size.w + 1 && b.y + b.h <= 200 + L.size.h + 1), 'the group fits the size the board looks for');
assert.deepEqual(batchLayout(big, { x: 100, y: 200 }), L, 'the same batch always lays out the same');
ok('layout: frames side by side, loose cards after, compact grids, nothing overlaps, explicit spots kept, deterministic');

// ---- left to right (2026-11-03): chair → 2×2 swatches → 2×2 chairs, each beside its swatch ----
{
  const g = BATCH_GRID; const card = (cx: number, cy: number) => ({ x: cx - g.cardW / 2, y: cy - g.cardH / 2, w: g.cardW, h: g.cardH });
  const chair = { x: 0, y: 0, w: 320, h: 360 }; const board: Record<string, any> = { 'shape:chair': chair };
  const ctx = (anchor: any = null) => ({ boxOf: (id: string) => board[id] ?? null, anchor, taken: Object.values(board) });
  const gridOf = (L: any, n: number) => Array.from({ length: n }, (_, i) => L.at[i]);
  // round 1: four swatches, no inputs: a 2×2 right of the anchor (the chair), centred on it
  const r1: BatchItem[] = Array.from({ length: 4 }, (_, i) => ({ kind: 'add_card', ref: `s${i}`, workflow: 'create' }));
  const L1 = batchLayout(r1, { x: -5000, y: 9000 }, ctx(chair)); const s = gridOf(L1, 4);
  assert.equal(new Set(s.map((p) => p.x)).size, 2); assert.equal(new Set(s.map((p) => p.y)).size, 2, 'four cards: two columns, two rows');
  assert.equal(Math.min(...s.map((p) => p.x - g.cardW / 2)), chair.x + chair.w + g.gap, 'just right of the chair');
  assert.ok(Math.abs((L1.box.y + L1.box.h / 2) - (chair.y + chair.h / 2)) <= 1, 'centred on it');
  s.forEach((p, i) => { board[`shape:s${i}`] = card(p.x, p.y); });
  // round 2: each chair fed by the shared chair + its own swatch: the same slot as its swatch, one step right
  const r2: BatchItem[] = Array.from({ length: 4 }, (_, i) => ({ kind: 'add_card', ref: `c${i}`, workflow: 'material-swap', inputs_from: i === 3 ? [`shape:s${i}`, 'shape:chair'] : ['shape:chair', `shape:s${i}`] }));
  const L2 = batchLayout(r2, { x: -5000, y: 9000 }, ctx(null)); const c = gridOf(L2, 4); const sx = Math.max(...s.map((p) => p.x + g.cardW / 2));
  c.forEach((p, i) => { assert.equal(p.y, s[i].y, `chair ${i} on its swatch's row`); assert.equal(p.x - s[i].x, sx - Math.min(...s.map((q) => q.x - g.cardW / 2)) + g.gap, `chair ${i} mirrors its swatch's column`); });
  for (const b of Object.values(board)) for (const p of c) { const q = card(p.x, p.y); assert.ok(q.x >= b.x + b.w || q.x + q.w <= b.x || q.y >= b.y + b.h || q.y + q.h <= b.y, 'never on top of a card'); }
  // one input each but no own one (all share it): a compact grid right of the input instead
  const r3: BatchItem[] = Array.from({ length: 3 }, (_, i) => ({ kind: 'add_card', workflow: 'video', inputs_from: ['shape:s1'] }));
  const L3 = batchLayout(r3, { x: 0, y: 0 }, ctx(null)); assert.equal(Math.min(...gridOf(L3, 3).map((p) => p.x - g.cardW / 2)), board['shape:s1'].x + g.cardW + g.gap, 'right of the right-most input');
  // something already there: the group moves off it
  const block = { x: L3.box.x, y: L3.box.y, w: 200, h: 200 }; board['shape:block'] = block;
  const L4 = batchLayout(r3, { x: 0, y: 0 }, ctx(null)); for (const p of gridOf(L4, 3)) { const q = card(p.x, p.y); assert.ok(q.x >= block.x + block.w || q.x + q.w <= block.x || q.y >= block.y + block.h || q.y + q.h <= block.y, 'moved off what was there'); }
  delete board['shape:block'];
  // explicit `at` is kept exactly, whatever the board says
  const r5: BatchItem[] = [{ kind: 'add_card', workflow: 'create', at: { x: 7, y: 9 }, inputs_from: ['shape:chair'] }, { kind: 'add_card', workflow: 'create' }];
  const L5 = batchLayout(r5, { x: 0, y: 0 }, ctx(chair)); assert.equal(L5.at[0], undefined, 'an item with `at` is not moved (buildBatch uses its own spot)');
  // no context: the origin is the top-left, as before
  const L6 = batchLayout(r1, { x: 100, y: 200 }); assert.equal(Math.min(...gridOf(L6, 4).map((p) => p.x - g.cardW / 2)), 100); assert.equal(Math.min(...gridOf(L6, 4).map((p) => p.y - g.cardH / 2)), 200);
  ok('left to right: right of the chair, mirrored 2×2, right of inputs, off what is there, explicit `at` kept');
}

assert.equal(batchLine({ cards: 12, notes: 0, frames: 3 }), 'Added 12 cards in 3 frames');
assert.equal(batchLine({ cards: 1, notes: 6, frames: 1 }), 'Added 1 card and 6 notes in 1 frame');
assert.equal(batchLine({ cards: 0, notes: 0, frames: 2 }), 'Added 2 frames');
ok('the one dock line');

// ---- the board side with a stub board (BoardApi): one history mark (one Undo), refs wired, a failure bails back and nothing stays ----
function stubBoard() {
  const shapes = new Map<string, any>(); const marks: string[] = []; const bails: string[] = []; let runs = 0; let snap: Map<string, any> | null = null; let n = 0;
  const bounds = (id: string) => { const s = shapes.get(id); if (!s) return null; const w = s.props?.w ?? 260, h = s.props?.h ?? 260; return { x: s.x, y: s.y, w, h, minX: s.x, minY: s.y, maxX: s.x + w, maxY: s.y + h, midX: s.x + w / 2, midY: s.y + h / 2, center: { x: s.x + w / 2, y: s.y + h / 2 } }; };
  const b: any = {
    shapes, marks, bails, get runs() { return runs; },
    mark: (l: string) => { marks.push(l); snap = new Map([...shapes].map(([k, v]) => [k, { ...v }])); return `mark-${marks.length}`; },
    bailToMark: (m: string) => { bails.push(m); shapes.clear(); for (const [k, v] of snap ?? []) shapes.set(k, v); },
    batch: (fn: () => void) => { runs++; fn(); },
    addNode: (s: any) => { const id = `shape:n${++n}`; shapes.set(id, { id, parentId: 'page:page', ...s }); return id; },
    toBack: () => undefined,
    addLink: (from: string, to: string) => { if (!bounds(from) || !bounds(to)) return null; const id = `shape:l${++n}`; shapes.set(id, { id, type: 'link', from, to }); return id; },
    getNode: (id: string) => (shapes.get(id)?.type === 'link' ? null : shapes.get(id) ?? null), boundsOf: bounds,
    setParent: (ids: string[], p: string) => { for (const id of ids) { const s = shapes.get(id); if (s) s.parentId = p; } },
  };
  return b;
}
const deps = (check?: (f: string[], t: string) => void) => ({ flowOf: (w: string) => (w === 'nope' ? (() => { throw new Error('Unknown workflow "nope".'); })() : w), providerOf: () => undefined, check: (f: any, t: any) => check?.(f, t), spot: () => ({ x: 0, y: 0 }) });
const items12: BatchItem[] = [{ kind: 'add_frame', ref: 'f', name: 'Set' }, ...Array.from({ length: 12 }, (_, i): BatchItem => ({ kind: 'add_card', ref: `c${i}`, workflow: i % 2 ? 'video' : 'create', prompt: `p${i}`, frame: 'f', ...(i % 2 ? { inputs_from: [`c${i - 1}`] } : {}) }))];
const e1 = stubBoard(); const made = buildBatch(e1, items12, batchLayout(items12, { x: 0, y: 0 }), deps());
assert.deepEqual(e1.marks, ['agent batch'], 'ONE history mark: a single Undo removes the whole batch'); assert.equal(e1.runs, 1, 'every node in one board.batch'); assert.equal(e1.bails.length, 0);
assert.equal(made.cards.length, 12); assert.equal(made.frames.length, 1); assert.equal(made.arrows.length, 6, 'each clip wired from the picture before it');
assert.ok(made.cards.every((id) => e1.shapes.get(id).parentId === made.refs.f), 'cards sit in their frame');
assert.ok(made.cards.every((id) => e1.shapes.get(id).props.status === 'draft'), 'drafts only: nothing runs');
const card3 = e1.shapes.get(made.refs.c3); assert.equal(card3.props.prompt, 'p3'); assert.equal(card3.props.flow, 'video');
const e2 = stubBoard(); e2.shapes.set('shape:keep', { id: 'shape:keep', type: 'note', x: 0, y: 0, props: {} });
assert.throws(() => buildBatch(e2, [{ kind: 'add_card', ref: 'a', workflow: 'create' }, { kind: 'add_card', ref: 'b', workflow: 'music', inputs_from: ['a'] }], { at: {}, frames: {} },
  deps((f, t) => { throw new Error('Music bed takes text, and “a” makes a picture.'); })), /takes text/);
assert.equal(e2.bails.length, 1, 'an illegal connection bails back to the mark'); assert.deepEqual([...e2.shapes.keys()], ['shape:keep'], 'nothing of the batch stays; what was there before is untouched');
const e3 = stubBoard(); assert.throws(() => buildBatch(e3, [{ kind: 'add_card', workflow: 'create' }, { kind: 'add_card', workflow: 'nope' }], { at: {}, frames: {} }, deps()), /Unknown workflow/);
assert.equal(e3.marks.length, 0, 'a wrong workflow is caught before anything is made'); assert.equal(e3.shapes.size, 0);
ok('board side: one mark and one run for 12 cards (single Undo), refs wired, drafts only; a bad item leaves nothing behind');
console.log('canvas-batch: all ok');
process.exit(0); // the board engine keeps timers alive in node
