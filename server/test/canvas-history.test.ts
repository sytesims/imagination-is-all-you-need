// Canvas undo / redo on the React Flow engine (web/src/canvas/rf/history.ts + store.ts + boardApiRf.ts, 2026-11-06): patch-based steps,
// a whole drag is one step, an agent op is a named step, removing a card takes its links in the same step, and above all an Undo never
// removes a result a job wrote (written with history 'ignore'). The board API runs over the store with no browser (no camera needed).
// Run: cd server && npx tsx test/canvas-history.test.ts
import assert from 'node:assert/strict';
if (!(globalThis as any).crypto) (globalThis as any).crypto = (await import('node:crypto')).webcrypto;
const { History, fieldDiff, withFields } = await import('../../web/src/canvas/rf/history.ts');
const { BoardStore } = await import('../../web/src/canvas/rf/store.ts');
const { makeRfBoard } = await import('../../web/src/canvas/rf/boardApiRf.ts');
const ok = (m: string) => console.log('ok ' + m);

// ---- field diffs: top-level fields, props and meta one key deeper ----
assert.deepEqual(fieldDiff({ id: 'a', x: 1, y: 2, props: { p: 'a', takes: [] }, meta: {} }, { id: 'a', x: 5, y: 2, props: { p: 'b', takes: [] }, meta: { name: 'N' } }),
  { x: [1, 5], 'props.p': ['a', 'b'], 'meta.name': [undefined, 'N'] });
assert.deepEqual(withFields({ id: 'a', x: 1, props: { p: 'a', q: 1 }, meta: { name: 'N' } }, { x: 2, 'props.p': 'z', 'meta.name': undefined }), { id: 'a', x: 2, props: { p: 'z', q: 1 }, meta: {} });
ok('field diff and apply');

// ---- the board over the store ----
const mk = () => { const store = new BoardStore({ nodes: [], links: [] }); const board = makeRfBoard(store, { rf: null, el: null, inputs: new Set() }); return { store, board }; };
const gen = (board: any, x = 0) => { board.mark('new generate card'); let id = ''; board.batch(() => { id = board.addNode({ type: 'ohf-gen', x, y: 0, props: { prompt: '' } }); }); return id; };
const job = (board: any, id: string) => board.batch(() => board.patchNode(id, { props: { status: 'done', jobId: 'job_1', takes: [{ url: '/files/job_1-out0.png', kind: 'image' }] } }), { history: 'ignore' });

// 1. new card, the job runs and its result lands (ignored), Undo: the card and its result stay
{ const { board } = mk(); const id = gen(board); board.batch(() => board.patchNode(id, { props: { status: 'running', jobId: 'job_1' } }), { history: 'ignore' }); job(board, id);
  board.undo(); const n: any = board.getNode(id); assert.ok(n, 'the card with a result stays'); assert.equal(n.props.takes.length, 1); assert.equal(n.props.status, 'done');
  ok('undo after a run never removes the card holding its result'); }

// 2. move, then the job lands, then Undo: only the move goes back; the result stays
{ const { board } = mk(); const id = gen(board); board.mark('move'); for (let x = 1; x <= 30; x++) board.patchNode(id, { x: x * 10 }); job(board, id);
  board.undo(); const n: any = board.getNode(id); assert.equal(n.x, 0, 'the whole drag is one step'); assert.equal(n.props.takes.length, 1, 'the result stays'); assert.equal(n.props.status, 'done');
  board.redo(); assert.equal((board.getNode(id) as any).x, 300); assert.equal((board.getNode(id) as any).props.takes.length, 1);
  ok('a drag is one step; undo and redo leave the result alone'); }

// 3. a person's prompt edit (recorded) and the job's write (ignored) on the same card: Undo puts back the prompt only
{ const { board } = mk(); const id = gen(board); board.mark('edit'); board.patchNode(id, { props: { prompt: 'a lighthouse' } }); job(board, id);
  board.undo(); const n: any = board.getNode(id); assert.equal(n.props.prompt, ''); assert.equal(n.props.takes.length, 1); ok('undo restores only the fields that step changed'); }

// 4. delete a card with links: one step; Undo brings back the card and its links
{ const { board } = mk(); const a = gen(board), b = gen(board, 500), c = gen(board, 1000); board.mark('connect'); board.addLink(a, b); board.addLink(b, c);
  assert.equal(board.links().length, 2); board.mark('delete'); board.removeNodes([b]);
  assert.equal(board.getNode(b), null); assert.equal(board.links().length, 0, 'its links went with it');
  board.undo(); assert.ok(board.getNode(b)); assert.equal(board.links().length, 2, 'undo brings both links back'); assert.deepEqual(board.linksInto(c).map((l: any) => l.from), [b]);
  ok('delete with links is one step, and undoes whole'); }

// 5. an agent op is a named step; a failed batch bails back to its mark
{ const { board, store } = mk(); const keep = gen(board); const m = board.mark('agent: batch'); board.batch(() => { gen(board, 400); gen(board, 800); });
  assert.equal(board.nodes().length, 3); board.bailToMark(m); assert.equal(board.nodes().length, 1); assert.ok(board.getNode(keep)); assert.equal(store.history.canRedo(), false);
  board.mark('agent: add_card'); gen(board, 400); board.undo(); assert.equal(board.nodes().length, 1); ok('agent steps undo as one; bail drops them'); }

// 6. frames: a child keeps its place on screen when it moves into a frame; removing the frame removes what sits in it
{ const { board } = mk(); const f = board.addNode({ type: 'frame', x: 100, y: 100, props: { w: 800, h: 600, name: 'F' } }); const id = gen(board, 300);
  board.setParent([id], f); const n: any = board.getNode(id); assert.equal(n.parentId, f); assert.equal(n.x, 200); assert.deepEqual(board.childrenOf(f), [id]);
  assert.equal(board.boundsOf(id)!.x, 300, 'same place on the board'); board.mark('del'); board.removeNodes([f]); assert.equal(board.nodes().length, 0); board.undo(); assert.equal(board.nodes().length, 2);
  ok('frames: relative positions, children go and come back with the frame'); }

// 7. a result card the job placed (made with history 'ignore') never undoes; redo is cleared by a new change
{ const h = new History(); h.mark('a'); h.write('n', null, { id: 'x', props: {} }, true); h.write('n', null, { id: 'r', props: { jobId: 'j' } }, false);
  const u = h.undo()!; assert.deepEqual(u.apply.map((a) => a.id), ['x']); assert.equal(h.canRedo(), true); h.write('n', null, { id: 'y', props: {} }, true); assert.equal(h.canRedo(), false);
  ok('ignored writes are never in a step; a new change clears redo'); }
// ---- undo during a run (release 1): job-owned fields are never in a step; a whole card put back carries their latest values ----
const run = (board: any, id: string, jobId = 'job_r') => board.batch(() => board.patchNode(id, { props: { status: 'running', jobId } }), { history: 'ignore' });
// 8. undoing the creation of a RUNNING card asks first; "no" leaves it; "yes" cancels the run and removes it; redo brings it back with its run
{ const store = new BoardStore({ nodes: [], links: [] }); const asked: string[][] = []; const cancelled: string[] = []; const restored: string[][] = []; let answer = false;
  const board: any = makeRfBoard(store, { rf: null, el: null, inputs: new Set() }, { confirmRemoveRunning: async (ids) => { asked.push(ids); return answer; }, cancelRun: (id) => cancelled.push(id), onRestore: (ids) => restored.push(ids) });
  const id = gen(board); run(board, id);
  board.undo(); await new Promise((r) => setTimeout(r, 5)); assert.deepEqual(asked, [[id]], 'it asks'); assert.ok(board.getNode(id), '"no" keeps the card'); assert.equal(board.getNode(id).props.status, 'running');
  answer = true; board.undo(); await new Promise((r) => setTimeout(r, 5)); assert.equal(board.getNode(id), null, '"yes" removes it'); assert.deepEqual(cancelled, [id], 'and cancels its run');
  /* the job ends while the card is gone: nothing to write to. Redo puts the card back still following its job (the page re-watches it) */
  board.redo(); const n = board.getNode(id); assert.ok(n); assert.equal(n.props.status, 'running', 'its run state, not the draft it was made as'); assert.equal(n.props.jobId, 'job_r');
  assert.deepEqual(restored.at(-1), [id], 'the page hears it came back (and follows the job again)');
  ok('undo of a running card asks "Cancel the run and remove?"; redo brings it back following its job'); }
// 9. delete a card while it runs, the result lands on nothing; undo the delete: the card comes back with its latest job fields, never stuck
{ const { board } = mk(); const id = gen(board); run(board, id); board.batch(() => board.patchNode(id, { props: { status: 'done', takes: [{ url: '/files/a.png', kind: 'image' }], take: 0 } }), { history: 'ignore' });
  run(board, id, 'job_2'); /* run it again */ board.mark('delete'); board.removeNodes([id]);
  board.undo(); const n: any = board.getNode(id); assert.equal(n.props.jobId, 'job_2'); assert.equal(n.props.takes.length, 1, 'the versions it had come back too');
  ok('undoing a delete brings the card back with its versions and its current run'); }
// 10. a person's edit made while the card ran, then undo: only the edit goes back; status / takes / jobId are never undone
{ const { board } = mk(); const id = gen(board); run(board, id); board.mark('rename'); board.patchNode(id, { meta: { name: 'Koi' }, props: { status: 'running', take: 0 } });
  board.batch(() => board.patchNode(id, { props: { status: 'done', takes: [{ url: '/files/k.png', kind: 'image' }] } }), { history: 'ignore' });
  board.undo(); const n: any = board.getNode(id); assert.equal(n.meta.name, undefined, 'the rename went back'); assert.equal(n.props.status, 'done', 'the result stays'); assert.equal(n.props.takes.length, 1);
  board.redo(); assert.equal(board.getNode(id).meta.name, 'Koi'); assert.equal(board.getNode(id).props.status, 'done');
  ok('job-owned fields are never part of an undo step'); }
// 11. undo-creation of a card whose run already FINISHED still keeps it (no question asked)
{ const store = new BoardStore({ nodes: [], links: [] }); let asked = 0; const board: any = makeRfBoard(store, { rf: null, el: null, inputs: new Set() }, { confirmRemoveRunning: async () => { asked++; return true; } });
  const id = gen(board); run(board, id); job(board, id); board.undo(); await new Promise((r) => setTimeout(r, 5)); assert.equal(asked, 0); assert.ok(board.getNode(id)); ok('a finished card is kept without asking'); }
console.log('canvas-history: all ok');
process.exit(0); // the board modules keep a timer (catalog refresh) alive
