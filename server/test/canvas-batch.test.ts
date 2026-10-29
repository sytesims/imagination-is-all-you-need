// Canvas batches (server/src/shared/canvasBatch.ts + web/src/canvas/batchBuild.ts): all-or-nothing validation, temporary refs, a group
// layout where nothing overlaps, the one dock line, and the board side: ONE history mark (a single Undo removes the whole batch) and a
// bail back to it when any item fails. A stub editor stands in for tldraw. Run: cd server && npx tsx test/canvas-batch.test.ts
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
for (let a = 0; a < fr.length; a++) for (let b = a + 1; b < fr.length; b++) { const p = fr[a], q = fr[b]; assert.ok(p.y + p.h <= q.y || q.y + q.h <= p.y, `frames ${p.i} and ${q.i} overlap`); }
for (const bx of boxes) { const it = big[bx.i]; const f = it.frame ? big.findIndex((x) => x.ref === it.frame) : it.ref === 'm' ? big.findIndex((x) => x.ref === 'f4') : -1; if (f < 0) continue;
  const b = L.frames[f]; assert.ok(bx.x >= b.x && bx.y >= b.y && bx.x + bx.w <= b.x + b.w && bx.y + bx.h <= b.y + b.h, `item ${bx.i} sits inside its frame`); }
const hero = boxes.filter((b) => big[b.i].frame === 'f1'); assert.equal(new Set(hero.map((b) => b.y)).size, 2, 'eight cards wrap into two rows of up to six');
assert.ok(L.size.w > 0 && L.size.h > 0 && boxes.every((b) => b.x >= 100 && b.y >= 200 && b.x + b.w <= 100 + L.size.w + 1 && b.y + b.h <= 200 + L.size.h + 1), 'the group fits the size the board looks for');
assert.deepEqual(batchLayout(big, { x: 100, y: 200 }), L, 'the same batch always lays out the same');
ok('layout: one band per frame, loose cards after, rows of six, nothing overlaps, explicit spots kept, deterministic');

assert.equal(batchLine({ cards: 12, notes: 0, frames: 3 }), 'Added 12 cards in 3 frames');
assert.equal(batchLine({ cards: 1, notes: 6, frames: 1 }), 'Added 1 card and 6 notes in 1 frame');
assert.equal(batchLine({ cards: 0, notes: 0, frames: 2 }), 'Added 2 frames');
ok('the one dock line');

// ---- the board side with a stub editor: one history mark (one Undo), refs wired, a failure bails back and nothing stays ----
function stubEditor() {
  const shapes = new Map<string, any>(); const marks: string[] = []; const bails: string[] = []; let runs = 0; let snap: Map<string, any> | null = null;
  const ed: any = {
    shapes, marks, bails, get runs() { return runs; },
    markHistoryStoppingPoint: (n: string) => { marks.push(n); snap = new Map([...shapes].map(([k, v]) => [k, { ...v }])); return `mark-${marks.length}`; },
    bailToMark: (m: string) => { bails.push(m); shapes.clear(); for (const [k, v] of snap ?? []) shapes.set(k, v); },
    run: (fn: () => void) => { runs++; fn(); },
    createShape: (s: any) => { shapes.set(s.id, { parentId: 'page:page', ...s }); },
    sendToBack: () => undefined, createBindings: (b: any[]) => { for (const x of b) shapes.set(`binding:${shapes.size}`, { ...x, typeName: 'binding' }); },
    getShape: (id: string) => shapes.get(id), reparentShapes: (ids: string[], p: string) => { for (const id of ids) { const s = shapes.get(id); if (s) s.parentId = p; } },
    getShapePageBounds: (id: string) => { const s = shapes.get(id); if (!s) return null; const w = s.props?.w ?? 260, h = s.props?.h ?? 260; return { minX: s.x, minY: s.y, maxX: s.x + w, maxY: s.y + h, midY: s.y + h / 2 }; },
  };
  return ed;
}
const deps = (check?: (f: string[], t: string) => void) => ({ flowOf: (w: string) => (w === 'nope' ? (() => { throw new Error('Unknown workflow "nope".'); })() : w), providerOf: () => undefined, check: (f: any, t: any) => check?.(f, t), spot: () => ({ x: 0, y: 0 }) });
const items12: BatchItem[] = [{ kind: 'add_frame', ref: 'f', name: 'Set' }, ...Array.from({ length: 12 }, (_, i): BatchItem => ({ kind: 'add_card', ref: `c${i}`, workflow: i % 2 ? 'video' : 'create', prompt: `p${i}`, frame: 'f', ...(i % 2 ? { inputs_from: [`c${i - 1}`] } : {}) }))];
const e1 = stubEditor(); const made = buildBatch(e1, items12, batchLayout(items12, { x: 0, y: 0 }), deps());
assert.deepEqual(e1.marks, ['agent batch'], 'ONE history mark: a single Undo removes the whole batch'); assert.equal(e1.runs, 1, 'every shape in one editor.run'); assert.equal(e1.bails.length, 0);
assert.equal(made.cards.length, 12); assert.equal(made.frames.length, 1); assert.equal(made.arrows.length, 6, 'each clip wired from the picture before it');
assert.ok(made.cards.every((id) => e1.shapes.get(id).parentId === made.refs.f), 'cards sit in their frame');
assert.ok(made.cards.every((id) => e1.shapes.get(id).props.status === 'draft'), 'drafts only: nothing runs');
const card3 = e1.shapes.get(made.refs.c3); assert.equal(card3.props.prompt, 'p3'); assert.equal(card3.props.flow, 'video');
const e2 = stubEditor(); e2.createShape({ id: 'shape:keep', type: 'note', x: 0, y: 0, props: {} });
assert.throws(() => buildBatch(e2, [{ kind: 'add_card', ref: 'a', workflow: 'create' }, { kind: 'add_card', ref: 'b', workflow: 'music', inputs_from: ['a'] }], { at: {}, frames: {} },
  deps((f, t) => { throw new Error('Music bed takes text, and “a” makes a picture.'); })), /takes text/);
assert.equal(e2.bails.length, 1, 'an illegal connection bails back to the mark'); assert.deepEqual([...e2.shapes.keys()], ['shape:keep'], 'nothing of the batch stays; what was there before is untouched');
const e3 = stubEditor(); assert.throws(() => buildBatch(e3, [{ kind: 'add_card', workflow: 'create' }, { kind: 'add_card', workflow: 'nope' }], { at: {}, frames: {} }, deps()), /Unknown workflow/);
assert.equal(e3.marks.length, 0, 'a wrong workflow is caught before anything is made'); assert.equal(e3.shapes.size, 0);
ok('board side: one mark and one run for 12 cards (single Undo), refs wired, drafts only; a bad item leaves nothing behind');
console.log('canvas-batch: all ok');
process.exit(0); // tldraw keeps timers alive in node
