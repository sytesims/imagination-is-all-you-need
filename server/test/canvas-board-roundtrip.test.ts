// Board round trip while both engines run behind the switch (2026-11-06): a version-1 (tldraw) board → board document v2 (fromTldraw) →
// the React Flow engine's store and back (rf/docMap.ts) → tldraw again (docToTldraw), loaded into a REAL tldraw store (tldraw's
// own records pass its validation), and read back with fromTldraw: nothing kept is lost or moved.
// Run: cd server && npx tsx test/canvas-board-roundtrip.test.ts
import assert from 'node:assert/strict';
const D = await import('../src/shared/boardDoc.ts');
const { docToStore, storeToDoc } = await import('../../web/src/canvas/rf/docMap.ts');
const { createTLStore, defaultShapeUtils, defaultBindingUtils, BaseBoxShapeUtil } = await import('tldraw');
const A = await import('../../web/src/canvas/auxModel.ts');
const { NODE_TYPES } = await import('../../web/src/canvas/nodeTypes.ts');
const { draftProps } = await import('../../web/src/canvas/cardModel.ts');
const ok = (m: string) => console.log('ok ' + m);

/* tldraw validates its own records (note, frame, arrow, bookmark and their bindings and assets); our node types carry their props unchanged
   (stand-in utils here, so the test needs no views) */
const stub = (type: string) => class extends (BaseBoxShapeUtil as any) { static override type = type; getDefaultProps() { return { w: 100, h: 100 }; } component() { return null; } indicator() { return null; } };
const UTILS = [...defaultShapeUtils, ...NODE_TYPES.map(stub)];
const tlStore = () => createTLStore({ shapeUtils: UTILS as any, bindingUtils: defaultBindingUtils });
const schema = tlStore().schema.serialize();

// ---- a version-1 board as tldraw saves it: a frame with a card and a note in it, cards, links (one snapped), a sticky, a bookmark ----
const base = (id: string, type: string, x: number, y: number, props: any, extra: any = {}) => ({ x, y, rotation: 0, isLocked: false, opacity: 1, meta: {}, id, type, parentId: 'page:page', index: 'a1', typeName: 'shape', props, ...extra });
const rich = (t: string) => D.richTextOf(t);
const note = (o: any) => ({ color: 'orange', richText: rich(''), size: 'm', font: 'sans', align: 'start', verticalAlign: 'start', labelColor: 'black', growY: 0, fontSizeAdjustment: 1, url: '', scale: 1, textLastEditedBy: null, ...o });
const arrow = (id: string, idx: string, snap = false) => base(id, 'arrow', 0, 0, { kind: 'arc', elbowMidPoint: 0.5, dash: 'draw', size: 's', fill: 'none', color: 'grey', labelColor: 'black', bend: 10, start: { x: 0, y: 0 }, end: { x: 100, y: 0 },
  arrowheadStart: 'none', arrowheadEnd: 'arrow', richText: { type: 'doc', content: [{ type: 'paragraph' }] }, labelPosition: 0.5, font: 'sans', scale: 1 }, { index: idx, meta: snap ? { snap: true } : {} });
const bind = (id: string, from: string, to: string, terminal: 'start' | 'end') => ({ meta: {}, id, type: 'arrow', fromId: from, toId: to, typeName: 'binding', props: { isPrecise: false, isExact: false, normalizedAnchor: { x: terminal === 'start' ? 1 : 0, y: 0.5 }, snap: 'none', terminal } });
const v1 = tlStore();
v1.put([
  { gridSize: 10, name: '', meta: {}, id: 'document:document', typeName: 'document' } as any, { meta: {}, id: 'page:page', name: 'Page 1', index: 'a1', typeName: 'page' } as any,
  base('shape:frame', 'frame', 100, 100, { w: 1200, h: 700, name: 'Three looks', color: 'black' }, { index: 'a1', meta: { by: 'agent' } }),
  base('shape:gen', 'ohf-gen', 40, 60, { ...draftProps({ prompt: 'A lighthouse at dusk' }) }, { parentId: 'shape:frame', index: 'a1', meta: { name: 'Hero' } }),
  base('shape:fnote', 'note', 500, 60, note({ richText: rich('In the frame\nsecond line'), scale: 1.3 }), { parentId: 'shape:frame', index: 'a2', meta: { by: 'agent' } }),
  base('shape:gen2', 'ohf-gen', 1500, 100, { ...draftProps({ prompt: 'Animate it' }), status: 'done', jobId: 'job_1', takes: [{ jobId: 'job_1', url: '/files/job_1-out0.png', kind: 'image', poster: '' }] }, { index: 'a2' }),
  base('shape:up', 'ohf-upload', -400, 100, { ...A.auxProps('upload'), url: '/files/upl-1.png', poster: '/files/upl-1.png', mediaKind: 'image', label: 'chair.png' }, { index: 'a3' }),
  base('shape:sticky', 'note', 0, 1000, note({ color: 'yellow', richText: rich('Hello board'), size: 'l', growY: 40 }), { index: 'a4' }),
  base('shape:bm', 'bookmark', 400, 1000, { w: 300, h: 320, assetId: 'asset:bm', url: 'https://example.com/page' }, { index: 'a5' }),
  { id: 'asset:bm', typeName: 'asset', type: 'bookmark', meta: {}, props: { src: 'https://example.com/page', title: 'Example', description: 'A page', image: '', favicon: '' } } as any,
  arrow('shape:l1', 'a6', true), arrow('shape:l2', 'a7'),
  bind('binding:1s', 'shape:l1', 'shape:up', 'start'), bind('binding:1e', 'shape:l1', 'shape:gen', 'end'), bind('binding:2s', 'shape:l2', 'shape:gen', 'start'), bind('binding:2e', 'shape:l2', 'shape:gen2', 'end'),
] as any);
const snap1 = v1.getStoreSnapshot('document');

// ---- v1 → v2 → the React Flow store → v2 ----
const doc1 = D.fromTldraw(snap1); assert.equal(Object.values(doc1.dropped ?? {}).reduce((a, b) => a + b, 0), 0, 'nothing dropped');
const st = docToStore(doc1);
assert.equal(st.nodes.find((n) => n.id === 'shape:fnote')!.type, 'note', 'a sticky is a note in the store (BoardApi words)');
assert.equal(D.richTextPlain(st.nodes.find((n) => n.id === 'shape:fnote')!.props.richText), 'In the frame\nsecond line');
assert.equal(st.nodes.find((n) => n.id === 'shape:frame')!.type, 'frame');
const byId = Object.fromEntries(st.nodes.map((n) => [n.id, n]));
const doc2 = storeToDoc(st.nodes.map((n) => n.id), byId, st.links);
assert.equal(D.boardDocError(doc2), null, 'the saved v2 is valid');
const strip = (d: any) => ({ nodes: d.nodes.map((n: any) => ({ ...n, z: undefined, meta: { ...n.meta, from: undefined } })).sort((a: any, b: any) => (a.id < b.id ? -1 : 1)), links: d.links.map((l: any) => ({ id: l.id, from: l.from, to: l.to, snap: !!l.snap })) });
assert.deepEqual(strip(doc2), strip(doc1), 'store round trip keeps every node, prop, parent and link');
ok('v1 → v2 → store → v2 keeps everything');

// ---- v2 → tldraw: loads into a real tldraw store (validated) and reads back the same ----
const tl = D.docToTldraw(doc2, schema);
const back = tlStore(); back.loadStoreSnapshot(tl as any);
const recs = Object.values(back.getStoreSnapshot('document').store) as any[];
assert.equal(recs.filter((r) => r.typeName === 'shape' && r.type === 'arrow').length, 2); assert.equal(recs.filter((r) => r.typeName === 'binding').length, 4);
assert.equal((back.get('shape:gen' as any) as any).parentId, 'shape:frame', 'frame children stay in their frame');
assert.equal((back.get('shape:sticky' as any) as any).props.growY, 40); assert.equal((back.get('shape:fnote' as any) as any).props.scale, 1.3);
assert.equal((back.get('shape:l1' as any) as any).meta.snap, true, 'a snapped link stays snapped');
const doc3 = D.fromTldraw(back.getStoreSnapshot('document'));
assert.deepEqual(strip(doc3), strip(doc2), 'v2 → tldraw → v2 is the same board');
ok('v2 → tldraw loads with tldraw validation and reads back the same');

// ---- a card made on the React Flow engine (full default props) also loads in tldraw ----
const made = { ...doc2, nodes: [...doc2.nodes, { id: 'shape:new', type: 'ohf-gen', x: 0, y: 2000, w: 340, h: 430, z: doc2.nodes.length, props: { ...draftProps() }, meta: {} },
  { id: 'shape:newnote', type: D.STICKY_TYPE, x: 600, y: 2000, w: 200, h: 200, z: doc2.nodes.length + 1, props: { text: 'new', color: 'nonsense', size: 'm', scale: 1 }, meta: {} }] };
const back2 = tlStore(); back2.loadStoreSnapshot(D.docToTldraw(made as any, schema) as any);
assert.equal((back2.get('shape:newnote' as any) as any).props.color, 'yellow', 'an unknown colour falls back');
ok('new nodes and odd values still load in tldraw');
assert.equal(D.indexKey(0), 'a0'); assert.equal(D.indexKey(61), 'az'); assert.equal(D.indexKey(62), 'b00'); assert.ok(D.indexKey(62) > D.indexKey(61));
ok('index keys sort');
console.log('canvas-board-roundtrip: all ok');
process.exit(0); // the board engine keeps timers alive in node
