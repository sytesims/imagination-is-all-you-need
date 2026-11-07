// Copy / paste and drops on the React Flow board (Canvas release 1; web/src/canvas/rf/clipboard.ts and portDrop.ts). On a real board store,
// no browser: a copy keeps the links between the copied cards (and only those), a paste makes new shape: ids, works on another board, keeps
// frames around their cards, is one undo step, and a card that was running comes back as a draft that keeps its takes. Then the drop rules:
// the wrong kind is refused in words, an empty port fills, a filled one asks (↵ replace only, ⇧ rerun, ⌥ new card), links vs media URLs.
// Run: cd server && npx tsx test/canvas-clipboard.test.ts
import assert from 'node:assert/strict';
if (!(globalThis as any).crypto) (globalThis as any).crypto = (await import('node:crypto')).webcrypto;
const { BoardStore } = await import('../../web/src/canvas/rf/store.ts');
const { makeRfBoard } = await import('../../web/src/canvas/rf/boardApiRf.ts');
const C = await import('../../web/src/canvas/rf/clipboard.ts');
const D = await import('../../web/src/canvas/rf/portDrop.ts');
const ok = (m: string) => console.log('ok ' + m);
const mk = () => { const store = new BoardStore({ nodes: [], links: [] }); return makeRfBoard(store, { rf: null, el: null, inputs: new Set() }); };

// ---- a small board: A → B → C, and a note D on its own ----
const a = mk();
let A = '', Bc = '', Cc = '', N = '', F = '';
a.mark('build'); a.batch(() => {
  A = a.addNode({ type: 'ohf-gen', x: 0, y: 0, props: { prompt: 'Red coat', status: 'done', jobId: 'job_a', takes: [{ url: '/files/a.png', kind: 'image' }] } });
  Bc = a.addNode({ type: 'ohf-gen', x: 500, y: 0, props: { prompt: 'Animate it', status: 'running', jobId: 'job_b', takes: [{ url: '/files/b0.mp4', kind: 'video' }] }, meta: { batch: ['job_b', 'job_b2'] } });
  Cc = a.addNode({ type: 'ohf-gen', x: 1000, y: 0, props: { prompt: 'Upscale', status: 'draft' } });
  N = a.addNode({ type: 'note', x: 0, y: 600, props: {} });
  a.addLink(A, Bc); a.addLink(Bc, Cc);
});

// copy A and B only: the A→B link comes along, B→C doesn't
const clip = C.copyClip(a, [A, Bc])!;
assert.equal(clip.nodes.length, 2); assert.equal(clip.links.length, 1); assert.deepEqual([clip.links[0].from, clip.links[0].to], [A, Bc]);
const running = clip.nodes.find((n) => n.id === Bc)!;
assert.equal(running.props.status, 'draft', 'a running card is copied as a draft'); assert.equal(running.props.jobId, ''); assert.equal(running.meta.batch, undefined);
assert.equal(running.props.takes.length, 1, 'it keeps its takes');
assert.equal(a.getNode(Bc)!.props.status, 'running', 'the original keeps running');
ok('copy: the cards and only the links between them; a running card becomes a draft with its takes');

// through the system clipboard as text, and back
const text = C.clipText(clip); const back = C.readClip(text)!; assert.deepEqual(back, clip);
assert.equal(C.readClip('just some words'), null); assert.equal(C.readClip('{"nodes":[]}'), null); assert.equal(C.readClip('{bad json'), null);

// paste on ANOTHER board: new ids, link rewired, placed at the pointer, one undo step
const b = mk();
const map = C.pasteClip(b, back, { at: { x: 2000, y: 3000 } });
const ids = Object.values(map); assert.equal(ids.length, 2); for (const id of ids) { assert.match(id, /^shape:[A-Za-z0-9_-]{21}$/); assert.ok(id !== A && id !== Bc, 'new ids'); }
assert.equal(b.links().length, 1); assert.deepEqual([b.links()[0].from, b.links()[0].to], [map[A], map[Bc]], 'the link joins the new cards');
assert.deepEqual([b.getNode(map[A])!.x, b.getNode(map[A])!.y], [2000, 3000]); assert.equal(b.getNode(map[Bc])!.x, 2500, 'the layout is kept');
assert.equal(b.getNode(map[Bc])!.props.status, 'draft'); assert.equal(b.getNode(map[Bc])!.props.takes[0].url, '/files/b0.mp4');
assert.equal(b.getNode(map[A])!.props.status, 'done', 'a finished card stays finished with its result');
assert.deepEqual(new Set(b.selection()), new Set(ids), 'the pasted cards are selected');
b.undo(); assert.equal(b.nodes().length, 0, 'one undo removes the whole paste'); assert.equal(b.links().length, 0);
b.redo(); assert.equal(b.nodes().length, 2); assert.equal(b.links().length, 1);
ok('paste across boards: new shape: ids, links rewired, layout kept, one undo step');

// paste on the same board again: offset, no clash, the originals untouched
const again = C.pasteClip(a, clip, { offset: 40 }); assert.equal(a.nodes().length, 6); assert.equal(a.getNode(again[A])!.x, 40);
assert.equal(a.links().length, 3, 'A→B, B→C, and the copy’s own link');
const dup = C.duplicateSelection(a); assert.equal(dup.length, 2, 'duplicate = the selection (the pasted pair) beside itself');
ok('paste in place and duplicate: offset copies with their link');

// a frame takes what sits in it
const f = mk(); f.mark('frame'); let K = '';
f.batch(() => { F = f.addNode({ type: 'frame', x: 100, y: 100, props: { w: 800, h: 600, name: 'Shots' } }); K = f.addNode({ type: 'ohf-gen', x: 200, y: 200, props: { prompt: 'In the frame' } }); });
f.setParent([K], F);
const fc = C.copyClip(f, [F])!; assert.equal(fc.nodes.length, 2, 'the frame and its card'); assert.equal(fc.nodes.find((n) => n.id === K)!.parent, F);
const fm = C.pasteClip(f, fc, { offset: 1000 }); assert.equal(f.parentOf(fm[K]), fm[F], 'the pasted card sits in the pasted frame');
assert.equal(f.boundsOf(fm[K])!.x, 1200, 'and keeps where it was relative to it');
ok('a frame is copied with its cards inside');

// cut: copy + one undoable delete
assert.ok(C.copyClip(a, [N])); a.mark('cut'); a.removeNodes([N]); assert.equal(a.getNode(N), null); a.undo(); assert.ok(a.getNode(N));

// ---- drop rules ----
assert.deepEqual(D.portDropPlan({ kind: 'image', filled: false }, 'video'), { do: 'refuse', why: 'This port takes a picture' });
assert.deepEqual(D.portDropPlan({ kind: 'audio', filled: true }, 'image'), { do: 'refuse', why: 'This port takes a sound' });
assert.deepEqual(D.portDropPlan({ kind: 'image', filled: false }, null), { do: 'refuse', why: 'This port takes a picture' }, 'a PDF is refused too');
assert.deepEqual(D.portDropPlan({ kind: 'image', filled: false }, 'image'), { do: 'fill' });
assert.deepEqual(D.portDropPlan({ kind: 'video', filled: true }, 'video'), { do: 'ask' });
assert.equal(D.choiceForKey({ key: 'Enter' }), 'replace', 'Enter: the default, Replace only'); assert.equal(D.choiceForKey({ key: 'Shift' }), 'rerun'); assert.equal(D.choiceForKey({ key: 'Alt' }), 'new');
assert.equal(D.choiceForKey({ key: 'Escape' }), 'cancel'); assert.equal(D.choiceForKey({ key: 'x' }), null);
assert.deepEqual(D.rerunIds('c1', ['n1', 'c2', 'c1', 'c3'], (id) => id.startsWith('c')), ['c1', 'c2', 'c3'], 'rerun: this card + the generate cards after it');
assert.deepEqual(D.urlPlan('https://example.com/shot.JPG?x=1'), { as: 'media', kind: 'image' }); assert.deepEqual(D.urlPlan('https://cdn.site/clip.mp4'), { as: 'media', kind: 'video' });
assert.deepEqual(D.urlPlan('https://example.com/article'), { as: 'link' }); assert.equal(D.asUrl('hello https://x.com'), null); assert.equal(D.asUrl(' https://x.com/a '), 'https://x.com/a');
assert.equal(D.kindOfType('audio/mpeg'), 'audio'); assert.equal(D.kindOfType('', 'take.webm'), 'video'); assert.equal(D.kindOfType('application/pdf', 'a.pdf'), null);
ok('drop rules: wrong kind refused in words, empty fills, filled asks (↵ ⇧ ⌥), media links vs pages');
console.log('\nall canvas clipboard checks passed');
process.exit(0);
