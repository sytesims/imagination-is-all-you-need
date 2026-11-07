// Board document v2 (2026-11-06, Canvas move to React Flow, phase 2): fromTldraw on a synthetic tldraw board with every shape type we
// have (lossless except the listed drops), docToFlow / flowToDoc round trip, the saved summary identical for a v1 board and its v2 twin,
// v2 validation, and the v2 round trip through PUT / GET (rollback snapshot kept on the first v2 save, never sent back).
// Run: cd server && npx tsx test/canvas-board-doc.test.ts   (temp data dir, no network, no server port)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.OPENHIGGSFIELD_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-board-doc-'));
process.env.OPENHIGGSFIELD_BACKEND = 'mock';
const D = await import('../src/shared/boardDoc.ts');
const CB = await import('../src/canvasBoards.ts');
const { summarizeSnapshot, registerCanvasAgent } = await import('../src/canvasAgent.ts');
const Fastify = (await import('fastify')).default;
const ok = (m: string) => console.log('ok ' + m);

// ---- a synthetic version-1 board (the shape of getSnapshot(editor.store).document) with every shape type ----
const shape = (id: string, type: string, index: string, x: number, y: number, props: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  ({ x, y, rotation: 0, isLocked: false, opacity: 1, meta: {}, id, type, parentId: 'page:page', index, typeName: 'shape', props, ...extra });
const rich = (...paras: string[]) => ({ type: 'doc', content: paras.map((t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] })) });
const bind = (id: string, arrow: string, to: string, terminal: 'start' | 'end') =>
  ({ id, typeName: 'binding', type: 'arrow', fromId: arrow, toId: to, meta: {}, props: { terminal, normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false, snap: 'none' } });
const aux = (o: Record<string, unknown>) => ({ w: 320, h: 300, text: '', url: '', poster: '', mediaKind: '', label: '', title: 'Upload', ...o });
const store: Record<string, any> = {};
const add = (...rs: any[]) => { for (const r of rs) store[r.id] = r; };
add({ gridSize: 10, name: '', meta: {}, id: 'document:document', typeName: 'document' }, { meta: {}, id: 'page:page', name: 'Page 1', index: 'a1', typeName: 'page' });
const gen = { w: 340, h: 430, flow: 'create', medium: 'image', model: 'nano-banana-2', prompt: 'A lighthouse at dusk', status: 'done', jobId: 'job_g1',
  takes: [{ url: '/files/job_g1-out0.png', kind: 'image', poster: '' }, { url: '' }], quote: { credits: 12, cost: { estUsd: 0.12 } } };
add(
  shape('shape:frame', 'frame', 'a1', 100, 100, { w: 900, h: 600, name: 'Looks', color: 'black' }),
  shape('shape:gen', 'ohf-gen', 'a1', 20, 40, gen, { parentId: 'shape:frame', meta: { name: 'Poster' } }),
  shape('shape:note1', 'note', 'a2', 400, 40, { color: 'orange', size: 'm', richText: rich('In the frame', 'two lines'), scale: 1, growY: 0 }, { parentId: 'shape:frame', meta: { by: 'agent' } }),
  shape('shape:res', 'ohf-result', 'a2', 1100, 100, { w: 360, h: 203, kind: 'image', jobId: 'job_r1', url: '/files/job_r1-out0.png', poster: '/files/job_r1-out0.png', title: 'A lighthouse', model: 'Nano Banana 2.1', place: 'Comfy Cloud', price: 'Sample', time: '4s' }),
  shape('shape:prompt', 'ohf-prompt', 'a3', 0, 800, aux({ w: 300, h: 230, text: 'warm light, 35mm', title: 'Prompt' })),
  shape('shape:upload', 'ohf-upload', 'a4', 400, 800, aux({ url: '/files/upl-1.png', poster: '/files/upl-1.png', mediaKind: 'image', label: 'chair.png' }), { meta: { name: 'Chair' } }),
  shape('shape:onote', 'ohf-note', 'a5', 800, 800, aux({ w: 300, h: 230, text: 'my own words', title: 'Note' })),
  shape('shape:compare', 'ohf-compare', 'a6', 1200, 800, aux({ w: 520, h: 360, title: 'Compare' })),
  shape('shape:group', 'ohf-group', 'a7', 0, 1300, aux({ w: 700, h: 400, title: 'Group' })),
  shape('shape:ad', 'ohf-ad', 'a8', 800, 1300, { w: 360, h: 520, headlines: ['Sit back', '', ''], offer: '20% off', button: 'Shop now', brandId: '', size: '4x5', pick: 0, platforms: ['meta'], layout: 'bottom', safeZones: true }),
  shape('shape:sticky', 'note', 'a9', 1300, 1300, { color: 'yellow', size: 'l', richText: rich('Hello board'), scale: 1.5, growY: 10 }),
  shape('shape:text', 'text', 'aA', 1300, 1700, { color: 'black', size: 's', w: 240, richText: rich('A label'), scale: 1, autoSize: true }),
  shape('shape:emptyNote', 'note', 'aB', 1600, 1700, { color: 'blue', richText: rich(''), scale: 1, growY: 0 }),
  shape('shape:img', 'image', 'aC', 0, 2000, { w: 200, h: 150, assetId: 'asset:img', playing: true, url: '', crop: null, flipX: false, flipY: false, altText: '' }),
  shape('shape:vid', 'video', 'aD', 300, 2000, { w: 320, h: 180, assetId: 'asset:vid', time: 0, playing: false, url: '', altText: '' }),
  shape('shape:noFile', 'image', 'aE', 700, 2000, { w: 100, h: 100, assetId: 'asset:gone' }),
  shape('shape:bm', 'bookmark', 'aF', 1000, 2000, { w: 300, h: 320, assetId: 'asset:bm', url: 'https://example.com/page' }),
  shape('shape:pen', 'draw', 'aG', 0, 0, { segments: [], color: 'black' }),
  shape('shape:geo', 'geo', 'aH', 2000, 2000, { w: 400, h: 300, geo: 'rectangle' }),
  shape('shape:inGeo', 'ohf-prompt', 'a1', 10, 20, aux({ text: 'inside a box', title: 'Prompt' }), { parentId: 'shape:geo' }),
  /* links: snapped (magnet) and drawn by hand; both ends bound */
  shape('shape:link1', 'arrow', 'aI', 0, 0, { kind: 'arc' }, { meta: { snap: true } }),
  bind('binding:1s', 'shape:link1', 'shape:upload', 'start'), bind('binding:1e', 'shape:link1', 'shape:gen', 'end'),
  shape('shape:link2', 'arrow', 'aJ', 0, 0, { kind: 'arc' }, { parentId: 'shape:frame' }),
  bind('binding:2s', 'shape:link2', 'shape:prompt', 'start'), bind('binding:2e', 'shape:link2', 'shape:gen', 'end'),
  shape('shape:link3', 'arrow', 'aK', 0, 0, {}),
  bind('binding:3s', 'shape:link3', 'shape:gen', 'start'), bind('binding:3e', 'shape:link3', 'shape:res', 'end'),
  /* a loose arrow (one end free) and one to a pen stroke: dropped */
  shape('shape:free', 'arrow', 'aL', 0, 0, {}), bind('binding:fs', 'shape:free', 'shape:gen', 'start'),
  shape('shape:toPen', 'arrow', 'aM', 0, 0, {}), bind('binding:ps', 'shape:toPen', 'shape:res', 'start'), bind('binding:pe', 'shape:toPen', 'shape:pen', 'end'),
  { id: 'asset:img', typeName: 'asset', type: 'image', meta: {}, props: { name: 'sketch.png', src: '/files/upl-abc.png', w: 200, h: 150, mimeType: 'image/png', isAnimated: false } },
  { id: 'asset:vid', typeName: 'asset', type: 'video', meta: {}, props: { name: 'clip.mp4', src: '/files/upl-clip.mp4', w: 320, h: 180, mimeType: 'video/mp4', isAnimated: true } },
  { id: 'asset:bm', typeName: 'asset', type: 'bookmark', meta: {}, props: { src: 'https://example.com/page', title: 'Example', description: 'A page', image: '', favicon: '' } },
);
const v1 = { schema: { schemaVersion: 2, sequences: { 'com.tldraw.store': 5 } }, store };
const before = structuredClone(v1);

// ---- fromTldraw: every kept shape, ids, types and props as they were ----
const doc = D.fromTldraw(v1);
assert.deepEqual(v1, before, 'the converter never changes its input');
assert.equal(doc.format, 'iiayn-board'); assert.equal(doc.version, 2);
const by = Object.fromEntries(doc.nodes.map((n) => [n.id, n]));
const OHF = ['shape:gen', 'shape:res', 'shape:prompt', 'shape:upload', 'shape:onote', 'shape:compare', 'shape:group', 'shape:ad', 'shape:inGeo'];
for (const id of OHF) { assert.deepEqual(by[id].props, store[id].props, `${id}: props byte-for-byte`); assert.deepEqual(by[id].meta, store[id].meta, `${id}: meta kept`); assert.equal(by[id].type, store[id].type); }
assert.equal(JSON.stringify(by['shape:gen'].props), JSON.stringify(store['shape:gen'].props), 'key order kept too');
assert.deepEqual([by['shape:gen'].w, by['shape:gen'].h, by['shape:ad'].w, by['shape:ad'].h], [340, 430, 360, 520]);
assert.deepEqual(doc.nodes.map((n) => n.id), ['shape:frame', 'shape:gen', 'shape:note1', 'shape:res', 'shape:prompt', 'shape:upload', 'shape:onote', 'shape:compare',
  'shape:group', 'shape:ad', 'shape:sticky', 'shape:text', 'shape:emptyNote', 'shape:img', 'shape:vid', 'shape:bm', 'shape:inGeo'], 'draw order: a frame, then its children, then the rest');
assert.deepEqual(doc.nodes.map((n) => n.z), doc.nodes.map((_, i) => i));
ok('ohf cards (gen, result, prompt, upload, note, compare, group, ad): ids, types, props and meta kept; draw order with frame children after the frame');

assert.deepEqual(by['shape:frame'], { id: 'shape:frame', type: 'ohf-frame', x: 100, y: 100, w: 900, h: 600, z: 0, props: { name: 'Looks', color: 'black' }, meta: { from: 'frame' } });
assert.deepEqual([by['shape:gen'].parentId, by['shape:gen'].x, by['shape:gen'].y], ['shape:frame', 20, 40], 'frame children keep their relative x, y');
assert.deepEqual(by['shape:note1'], { id: 'shape:note1', type: 'ohf-sticky', x: 400, y: 40, w: 200, h: 200, z: 2, parentId: 'shape:frame',
  props: { text: 'In the frame\ntwo lines', color: 'orange', size: 'm', scale: 1 }, meta: { by: 'agent', from: 'note' } });
assert.deepEqual([by['shape:sticky'].w, by['shape:sticky'].h, by['shape:sticky'].props.text, by['shape:sticky'].props.color, by['shape:sticky'].props.size], [300, 315, 'Hello board', 'yellow', 'l']);
assert.deepEqual([by['shape:text'].type, by['shape:text'].props.text, by['shape:text'].meta.from, by['shape:text'].w], ['ohf-sticky', 'A label', 'text', 240]);
assert.deepEqual(by['shape:img'], { id: 'shape:img', type: 'ohf-upload', x: 0, y: 2000, w: 200, h: 150, z: 13, meta: { from: 'image' },
  props: { w: 200, h: 150, text: '', url: '/files/upl-abc.png', poster: '/files/upl-abc.png', mediaKind: 'image', label: 'sketch.png', title: 'Upload' } });
assert.deepEqual([by['shape:vid'].type, by['shape:vid'].props.url, by['shape:vid'].props.poster, by['shape:vid'].props.mediaKind, by['shape:vid'].meta.from], ['ohf-upload', '/files/upl-clip.mp4', '', 'video', 'video']);
assert.deepEqual(by['shape:bm'].props, { url: 'https://example.com/page', title: 'Example', description: 'A page', image: '', favicon: '' }); assert.equal(by['shape:bm'].type, 'ohf-link');
assert.deepEqual([by['shape:inGeo'].parentId, by['shape:inGeo'].x, by['shape:inGeo'].y], [undefined, 2010, 2020], 'under a dropped shape: moved to the page, same place');
ok('tldraw note/text → ohf-sticky (plain text, colour), frame → ohf-frame, image/video → ohf-upload, bookmark → ohf-link; meta.from says what each was');

assert.deepEqual(doc.links, [
  { id: 'shape:link1', from: 'shape:upload', to: 'shape:gen', order: 'aI', snap: true },
  { id: 'shape:link2', from: 'shape:prompt', to: 'shape:gen', order: 'aJ' },
  { id: 'shape:link3', from: 'shape:gen', to: 'shape:res', order: 'aK' }]);
assert.deepEqual(doc.dropped, { image: 1, draw: 1, geo: 1, arrow: 2 });
const tldrawShapes = Object.values(store).filter((r: any) => r.typeName === 'shape').length;
assert.equal(doc.nodes.length + doc.links.length + Object.values(doc.dropped!).reduce((a, b) => a + b, 0), tldrawShapes, 'every tldraw shape is a node, a link or counted as dropped');
assert.equal(CB.shapeCount(v1), tldrawShapes, 'a v1 board counts as many items as before');
ok('arrow + 2 bindings → one link (snap kept); loose arrows, arrows to a pen stroke, pen, geo and a picture with no file dropped and counted');

// ---- edge cases: empty, odd input, many shapes ----
for (const x of [null, undefined, 3, 'x', [], {}, { store: null }, { store: [] }]) assert.deepEqual(D.fromTldraw(x), { format: 'iiayn-board', version: 2, nodes: [], links: [], dropped: {} });
assert.deepEqual(D.fromTldraw({ document: { store } }).nodes.length, doc.nodes.length, '{ document: { store } } is read too');
const cyc = D.fromTldraw({ store: { 'shape:a': shape('shape:a', 'frame', 'a1', 0, 0, {}, { parentId: 'shape:b' }), 'shape:b': shape('shape:b', 'frame', 'a2', 0, 0, {}, { parentId: 'shape:a' }) } });
assert.equal(cyc.nodes.length, 2, 'a parent loop never hangs or loses a node'); assert.equal(D.boardDocError(cyc), null);
const many: Record<string, any> = {}; for (let i = 0; i < 400; i++) many[`shape:n${i}`] = shape(`shape:n${i}`, 'ohf-result', `a${String(i).padStart(4, '0')}`, i * 10, 0, { w: 10, h: 10, url: '' });
const manyDoc = D.fromTldraw({ store: many }); assert.equal(manyDoc.nodes.length, 400); assert.equal(manyDoc.nodes[399].id, 'shape:n399');
ok('empty / odd input gives an empty board; parent loops are safe; 400 shapes keep their order');

// ---- docToFlow / flowToDoc ----
const flow = D.docToFlow(doc);
assert.ok(flow.nodes.findIndex((n) => n.id === 'shape:frame') < flow.nodes.findIndex((n) => n.id === 'shape:gen'), 'parents before children');
assert.ok(flow.nodes.find((n) => n.id === 'shape:frame')!.zIndex < 0 && flow.nodes.find((n) => n.id === 'shape:group')!.zIndex < 0, 'frames and groups behind');
assert.deepEqual(flow.edges[0], { id: 'shape:link1', source: 'shape:upload', target: 'shape:gen', type: 'link', data: { snap: true, order: 'aI' } });
const { dropped: _d, ...plain } = doc;
assert.deepEqual(D.flowToDoc(flow.nodes, flow.edges), plain, 'flowToDoc(docToFlow(doc)) gives the doc back');
const shuffled = [...flow.nodes].reverse(); const again = D.flowToDoc(shuffled, flow.edges);
assert.deepEqual(again.nodes.map((n) => n.id), doc.nodes.map((n) => n.id), 'draw order comes from zIndex, not the list order');
const measured = D.flowToDoc([{ ...flow.nodes[3], width: undefined as any, height: undefined as any, measured: { width: 111, height: 222 } }], []);
assert.deepEqual([measured.nodes[0].w, measured.nodes[0].h], [111, 222], 'size falls back to what the renderer measured');
const abs = Object.fromEntries(D.absoluteBoxes(doc).map((b) => [b.id, b]));
assert.deepEqual([abs['shape:gen'].x, abs['shape:gen'].y, abs['shape:inGeo'].x], [120, 140, 2010]);
ok('docToFlow: parents first, frames behind, links as edges; flowToDoc is its inverse; absoluteBoxes');

// ---- validation ----
assert.equal(D.boardDocError(plain), null); assert.equal(D.isBoardDoc(plain), true);
const broken = (f: (d: any) => void) => { const d = structuredClone(plain) as any; f(d); return D.boardDocError(d); };
assert.match(broken((d) => { d.version = 3; })!, /not a board document/);
assert.match(broken((d) => { d.nodes = {}; })!, /nodes and links/);
assert.match(broken((d) => { d.nodes[0].id = 'node1'; })!, /shape:/);
assert.match(broken((d) => { d.nodes[1].id = d.nodes[0].id; })!, /used twice/);
assert.match(broken((d) => { d.nodes[0].x = 'x'; })!, /numbers/);
assert.match(broken((d) => { d.nodes[0].props = null; })!, /props/);
assert.match(broken((d) => { d.nodes[1].parentId = 'shape:nope'; })!, /not on the board/);
assert.match(broken((d) => { d.links[0].id = d.nodes[0].id; })!, /used twice/);
assert.match(broken((d) => { d.links[0].to = 5; })!, /from and to/);
ok('v2 validation: format, lists, ids, numbers, props, parents, links');

// ---- the saved summary: identical for the v1 board and its v2 twin ----
const s1 = summarizeSnapshot(v1), s2 = summarizeSnapshot(plain);
assert.deepEqual(s2, s1, 'same summary from either format');
const sum = Object.fromEntries(s1.map((n: any) => [n.id, n]));
assert.deepEqual(s1.map((n: any) => n.id), ['shape:frame', 'shape:gen', 'shape:note1', 'shape:res', 'shape:upload', 'shape:group', 'shape:sticky', 'shape:text', 'shape:img', 'shape:vid']);
/* release 2: the old group card is read as a Group (boardGroups.migrateGroups); nothing's centre sits in it here */
assert.deepEqual(sum['shape:group'], { id: 'shape:group', type: 'frame', kind: 'frame', title: 'Group', children: [] });
assert.deepEqual(sum['shape:gen'], { id: 'shape:gen', type: 'card', kind: 'image', workflow: 'create', model: 'nano-banana-2', prompt: 'A lighthouse at dusk', name: 'Poster', title: 'Poster', status: 'done',
  inputs: ['shape:upload', 'shape:prompt'], missing: null, results: [{ url: '/files/job_g1-out0.png', kind: 'image', poster: '' }], price: { usd: 0.12, credits: 12, label: '≈ $0.12', demo: false, local: false, runnable: true }, jobId: 'job_g1' });
assert.deepEqual(sum['shape:frame'], { id: 'shape:frame', type: 'frame', kind: 'frame', title: 'Looks', children: ['shape:gen', 'shape:note1'] });
assert.deepEqual(sum['shape:note1'], { id: 'shape:note1', type: 'note', kind: 'note', title: 'In the frame\ntwo lines', by: 'agent', frame: 'shape:frame' });
assert.deepEqual(sum['shape:text'], { id: 'shape:text', type: 'note', kind: 'text', title: 'A label', by: 'you', frame: null });
assert.deepEqual(sum['shape:img'], { id: 'shape:img', type: 'picture', kind: 'image', title: 'sketch.png', results: [{ url: '/files/upl-abc.png', kind: 'image' }] });
assert.deepEqual(sum['shape:vid'], { id: 'shape:vid', type: 'clip', kind: 'video', title: 'clip.mp4', results: [{ url: '/files/upl-clip.mp4', kind: 'video' }] });
assert.deepEqual(sum['shape:upload'], { id: 'shape:upload', type: 'upload', kind: 'image', name: 'Chair', title: 'Chair', results: [{ url: '/files/upl-1.png', kind: 'image', poster: '/files/upl-1.png' }] });
assert.equal(sum['shape:res'].type, 'result'); assert.deepEqual(summarizeSnapshot(null), []);
ok('summary: the same BoardNode list for a v1 board and its v2 twin (cards with inputs and price, results, uploads, pictures, clips, notes, frames)');

// ---- PUT / GET round trip ----
const app = Fastify(); CB.registerCanvasBoards(app); registerCanvasAgent(app); await app.ready();
const req = async (method: string, url: string, body?: unknown) => {
  const r = await app.inject({ method: method as any, url, ...(body !== undefined ? { payload: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {}) });
  return { status: r.statusCode, body: r.body ? JSON.parse(r.body) : null };
};
const b = (await req('POST', '/api/canvas/boards', { name: 'Twin' })).body;
const p1 = await req('PUT', `/api/canvas/boards/${b.id}`, { snapshot: v1, rev: 0 }); assert.equal(p1.status, 200); assert.equal(p1.body.shapes, tldrawShapes);
const savedV1 = (await req('GET', `/api/canvas/boards/${b.id}/agent/summary`)).body; assert.equal(savedV1.live, false);
const p2 = await req('PUT', `/api/canvas/boards/${b.id}`, { snapshot: plain, rev: 1 }); assert.equal(p2.status, 200, JSON.stringify(p2.body)); assert.equal(p2.body.shapes, plain.nodes.length + plain.links.length);
const g = (await req('GET', `/api/canvas/boards/${b.id}`)).body;
assert.deepEqual(g.snapshot, plain, 'v2 comes back exactly'); assert.equal(g.rev, 2); assert.equal('legacySnapshot' in g, false, 'the rollback copy is never sent to the page');
assert.deepEqual(CB.getBoard(b.id)!.legacySnapshot, v1, 'the first v2 save keeps the old tldraw snapshot');
assert.deepEqual((await req('GET', `/api/canvas/boards/${b.id}/agent/summary`)).body.nodes, savedV1.nodes, 'agent summary of the saved board: same before and after the move');
const p3 = await req('PUT', `/api/canvas/boards/${b.id}`, { snapshot: { ...plain, nodes: plain.nodes.slice(0, 2) }, rev: 2 }); assert.equal(p3.status, 200);
assert.deepEqual(CB.getBoard(b.id)!.legacySnapshot, v1, 'later v2 saves keep the first rollback copy');
assert.equal((await req('GET', '/api/canvas/boards')).body.items.find((x: any) => x.id === b.id).shapes, 2 + plain.links.length);
const fresh = (await req('POST', '/api/canvas/boards', {})).body;
assert.equal((await req('PUT', `/api/canvas/boards/${fresh.id}`, { snapshot: plain })).status, 200); assert.equal(CB.getBoard(fresh.id)!.legacySnapshot, undefined, 'a board born v2 has no rollback copy');
for (const bad of [{ snapshot: { ...plain, version: 3 } }, { snapshot: { ...plain, nodes: [{ id: 'x' }] } }, { snapshot: { format: 'iiayn-board', version: 2 } }]) {
  const r = await req('PUT', `/api/canvas/boards/${fresh.id}`, bad); assert.equal(r.status, 400); assert.equal(r.body.code, 'invalid_snapshot'); }
const inline = structuredClone(plain) as any; inline.nodes.find((n: any) => n.id === 'shape:upload').props.url = 'data:image/png;base64,AAAA';
const ri = await req('PUT', `/api/canvas/boards/${fresh.id}`, { snapshot: inline }); assert.equal(ri.body.code, 'inline_media'); assert.match(ri.body.error, /nodes\[\d+\]\.props\.url/);
ok('PUT / GET: v2 saved and returned exactly; rollback copy kept on the first v2 save only and never sent; saved summary unchanged; bad v2 and inline media refused');
await app.close();
console.log('canvas-board-doc: all ok');
