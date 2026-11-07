// One Group box (Canvas release 2, step 1; user decisions 2026-11-07). No browser, no server port:
//  - old boards move over on load: every old group card (ohf-group, membership by position) becomes a Group (ohf-frame) holding what sat
//    inside it by the centre rule, for a version-2 board and a version-1 (tldraw) board alike; frames keep their own children; nested
//    groups nest; positions on the page don't move; the agent's saved summary lists the Group with its children;
//  - on a real board store: a Group's steps (in run order), "linked" (the run button shows only then), its auto name, ⌘G making a Group
//    around the selection, and dropping a card in or out of a Group by its centre;
//  - the total (decision 9): free steps $0, a paid step with no price apart ("+ 1 without a price"), samples "Sample".
// Run: cd server && npx tsx test/canvas-group.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.OPENHIGGSFIELD_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-group-'));
process.env.OPENHIGGSFIELD_BACKEND = 'mock';
if (!(globalThis as any).crypto) (globalThis as any).crypto = (await import('node:crypto')).webcrypto;
const D = await import('../src/shared/boardDoc.ts');
const G = await import('../src/shared/boardGroups.ts');
const P = await import('../src/shared/flowPrice.ts');
const { summarizeSnapshot } = await import('../src/canvasAgent.ts');
const { BoardStore } = await import('../../web/src/canvas/rf/store.ts');
const { makeRfBoard } = await import('../../web/src/canvas/rf/boardApiRf.ts');
const { docToStore } = await import('../../web/src/canvas/rf/docMap.ts');
const M = await import('../../web/src/canvas/groupModel.ts');
const ok = (m: string) => console.log('ok ' + m);

// ---- an old version-2 board (as release 1 saved it): two group cards, one nested in the other's box, a frame with a child, links ----
const n = (id: string, type: string, x: number, y: number, w: number, h: number, z: number, extra: Record<string, unknown> = {}) =>
  ({ id, type, x, y, w, h, z, props: type === 'ohf-group' ? { w, h, text: '', title: 'Group' } : { w, h, prompt: id, status: 'draft' }, meta: {}, ...extra });
const old = { format: 'iiayn-board', version: 2, links: [{ id: 'shape:l1', from: 'shape:g1', to: 'shape:g2', order: 'a1' }], nodes: [
  n('shape:big', 'ohf-group', 0, 0, 1200, 800, 0),
  n('shape:small', 'ohf-group', 700, 100, 450, 600, 1),
  n('shape:frm', 'ohf-frame', 2000, 0, 600, 400, 2, { props: { name: 'Ideas', color: 'black' } }),
  n('shape:g1', 'ohf-gen', 40, 90, 340, 430, 3),
  n('shape:g2', 'ohf-gen', 760, 160, 340, 430, 4),
  n('shape:out', 'ohf-gen', 1500, 90, 340, 430, 5),
  n('shape:kid', 'ohf-gen', 20, 20, 340, 300, 6, { parentId: 'shape:frm' }),
  /* a card whose box overlaps the big group but whose centre is outside: stays on the board */
  n('shape:edge', 'ohf-gen', 1100, 600, 340, 430, 7),
] };
const before = structuredClone(old);
const doc = D.boardDocOf(old);
assert.deepEqual(old, before, 'the migration never changes its input');
const by = Object.fromEntries(doc.nodes.map((x) => [x.id, x]));
assert.equal(doc.nodes.filter((x) => x.type === 'ohf-group').length, 0, 'no old group card is left');
assert.deepEqual([by['shape:big'].type, by['shape:big'].props, by['shape:big'].meta.from], ['ohf-frame', { name: '', color: 'black' }, 'group'], 'an old group is a Group with an auto name');
assert.equal(by['shape:g1'].parentId, 'shape:big', 'a card centred in the big group is its child');
assert.equal(by['shape:small'].parentId, 'shape:big', 'the small group sits in the big one');
assert.equal(by['shape:g2'].parentId, 'shape:small', 'a card goes into the smallest group that holds its centre');
assert.deepEqual([by['shape:g2'].x, by['shape:g2'].y], [60, 60], 'its x, y become relative to its group (page place unchanged)');
assert.equal(by['shape:out'].parentId, undefined); assert.equal(by['shape:edge'].parentId, undefined, 'centre outside: stays on the board');
assert.equal(by['shape:kid'].parentId, 'shape:frm', 'a frame keeps its own child');
const page = Object.fromEntries(D.absoluteBoxes(doc).map((b) => [b.id, [b.x, b.y]]));
const pageBefore = Object.fromEntries(D.absoluteBoxes(before as any).map((b) => [b.id, [b.x, b.y]]));
assert.deepEqual(page, pageBefore, 'nothing moves on the page');
const z = new Map(doc.nodes.map((x) => [x.id, x.z]));
for (const x of doc.nodes) if (x.parentId) assert.ok(z.get(x.parentId)! < x.z, `${x.id}: its parent draws first`);
assert.deepEqual(doc.links, old.links, 'links kept');
assert.equal(D.boardDocError(doc), null, 'still a valid board document');
assert.strictEqual(G.migrateGroups(doc), doc, 'a board with no old group comes back as it was');
ok('old version-2 board: group cards become Groups by the centre rule (nested, frames kept, nothing moves, parents first, valid)');

// ---- the same on a version-1 (tldraw) board ----
const shape = (id: string, type: string, index: string, x: number, y: number, props: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  ({ x, y, rotation: 0, isLocked: false, opacity: 1, meta: {}, id, type, parentId: 'page:page', index, typeName: 'shape', props, ...extra });
const v1 = { schema: {}, store: {
  'shape:grp': shape('shape:grp', 'ohf-group', 'a1', 100, 100, { w: 800, h: 500, text: '', title: 'Group' }),
  'shape:a': shape('shape:a', 'ohf-gen', 'a2', 140, 180, { w: 340, h: 430, prompt: 'A', status: 'draft' }),
  'shape:b': shape('shape:b', 'ohf-gen', 'a3', 2000, 180, { w: 340, h: 430, prompt: 'B', status: 'draft' }),
} };
const d1 = D.boardDocOf(v1); const b1 = Object.fromEntries(d1.nodes.map((x) => [x.id, x]));
assert.equal(b1['shape:grp'].type, 'ohf-frame'); assert.equal(b1['shape:a'].parentId, 'shape:grp'); assert.deepEqual([b1['shape:a'].x, b1['shape:a'].y], [40, 80]);
assert.equal(b1['shape:b'].parentId, undefined);
assert.equal(D.fromTldraw(v1).nodes.find((x) => x.id === 'shape:grp')!.type, 'ohf-group', 'fromTldraw itself still reads the board as it is');
const sum = summarizeSnapshot(v1) as any[]; const g = sum.find((x) => x.id === 'shape:grp');
assert.deepEqual([g.type, g.title, g.children], ['frame', 'Group', ['shape:a']], 'the agent sees a Group with its child');
ok('old version-1 board: the same; the agent summary lists the Group and what it holds');

// ---- on a real board store: steps, linked, name, run ids ----
const T = (x: any) => String(x.props?.prompt ?? '');
const mk = (d: any) => { const s = docToStore(d); const store = new BoardStore({ nodes: s.nodes, links: s.links }); return makeRfBoard(store, { rf: null, el: null, inputs: new Set() }); };
const b = mk(doc);
assert.deepEqual(M.groupSteps(b, 'shape:big' as any), ['shape:g1', 'shape:g2'], 'steps at any depth, in run order (g1 feeds g2)');
assert.equal(M.groupLinked(b, 'shape:big' as any), true); assert.equal(M.groupLinked(b, 'shape:small' as any), false, 'g1 → g2 runs out of the small group: not linked inside it');
assert.equal(M.showsRun(M.groupFacts(b, 'shape:big' as any, T)), true, 'a linked Group with steps shows Run the flow');
assert.equal(M.showsRun(M.groupFacts(b, 'shape:small' as any, T)), false, 'an unlinked Group shows no run button');
assert.equal(M.showsRun(M.groupFacts(b, 'shape:frm' as any, T)), false);
assert.equal(M.groupName(b, 'shape:frm' as any, T), 'Ideas', 'a typed name wins');
assert.notEqual(M.groupName(b, 'shape:big' as any, T), 'Group', 'an empty name takes the first step’s title');
assert.equal(M.stepsWords(0), 'No steps yet'); assert.equal(M.stepsWords(1), '1 step'); assert.equal(M.stepsWords(3), '3 steps');
b.patchNode('shape:g1' as any, { props: { status: 'running' } });
assert.deepEqual(M.flowRunIds(b, 'shape:big' as any), ['shape:g2'], 'a running step is waited for, not run again');
b.patchNode('shape:g1' as any, { props: { status: 'draft' } });
ok('Group facts: steps in run order, linked (run button) vs unlinked (none), typed vs auto name, running steps left out');

// ---- ⌘G: a Group around the selection, the cards move in; one undo step ----
const e = mk({ format: 'iiayn-board', version: 2, nodes: [n('shape:x', 'ohf-gen', 0, 0, 340, 430, 0), n('shape:y', 'ohf-gen', 500, 0, 340, 430, 1)], links: [{ id: 'shape:xy', from: 'shape:x', to: 'shape:y', order: 'a1' }] });
e.select(['shape:x', 'shape:y']); const gid = M.createGroupNode(e);
assert.equal(e.getNode(gid)!.type, 'frame'); assert.deepEqual(e.childrenOf(gid).sort(), ['shape:x', 'shape:y']);
const gb = e.boundsOf(gid)!; assert.ok(gb.y <= -M.GROUP_TOP + 1, 'room for the header strip above the cards');
assert.deepEqual([e.boundsOf('shape:x')!.x, e.boundsOf('shape:x')!.y], [0, 0], 'the cards stay where they were');
assert.equal(M.showsRun(M.groupFacts(e, gid, T)), true);
e.undo(); assert.equal(e.getNode(gid), null, 'one undo removes the Group'); assert.equal(e.parentOf('shape:x' as any), null, 'and the cards are back on the board');
ok('⌘G: a Group around the selection with room for its strip, cards inside and unmoved, one undo step');

// ---- drop in / out by the centre ----
e.redo(); const inside = e.getNode(gid)!;
e.mark('move'); e.patchNode('shape:y' as any, { x: 3000 }); assert.equal(M.settleIntoGroups(e, ['shape:y' as any]), 1); assert.equal(e.parentOf('shape:y' as any), null, 'dragged out: it leaves');
assert.equal(M.showsRun(M.groupFacts(e, gid, T)), false, 'its link now runs out of the Group: no run button');
const z0 = e.addNode({ type: 'ohf-gen', x: gb.x + 40, y: gb.y + 90, props: { w: 340, h: 430, status: 'draft' } }); assert.equal(M.settleIntoGroups(e, [z0]), 1);
assert.equal(e.parentOf(z0), gid, 'dropped with its centre inside: it goes in'); assert.ok(inside);
assert.equal(M.settleIntoGroups(e, [gid]), 0, 'a Group never goes inside itself');
ok('drag: a card goes into a Group by its centre and leaves when dragged out; the run button follows the links');

// ---- totals (decision 9) ----
const paid = (usd: number) => ({ usd, quote: { credits: usd * 100, cost: { estUsd: usd } } });
const local = { usd: 0, quote: { localRun: true, cost: { billedTo: 'local', estUsd: 0 } } };
const none = { usd: null, quote: { runnable: true, credits: null } };
const demo = { usd: 0, quote: { demo: true } };
assert.equal(P.flowTotalWords(P.flowTotal([paid(0.12), paid(0.42)])), '$0.54');
assert.equal(P.flowTotalWords(P.flowTotal([paid(0.12), paid(0.42), none])), '$0.54 + 1 without a price', 'a step with no price is apart');
assert.equal(P.flowTotalWords(P.flowTotal([paid(0.42), local, local])), '$0.42', 'free steps count $0');
assert.equal(P.flowTotalWords(P.flowTotal([local])), 'Free'); assert.equal(P.flowTotalWords(P.flowTotal([none])), 'No price yet');
assert.equal(P.flowTotalWords(P.flowTotal([demo, demo])), 'Sample');
assert.equal(P.unpricedPaid(none), true); assert.equal(P.unpricedPaid(local), false); assert.equal(P.unpricedPaid(demo), false); assert.equal(P.unpricedPaid({ ...none, problem: 'x' }), false);
assert.equal(P.noPriceLine(1), '1 step has no price yet'); assert.equal(P.noPriceLine(2), '2 steps have no price yet');
assert.equal(P.quoteUsd({ runnable: false, credits: 5 }), null, 'a step that can’t run here has no price');
ok('totals: priced add up, free $0, no price apart ("+ 1 without a price"), samples say Sample');
process.exit(0);
