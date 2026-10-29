// Canvas boards (2026-10-24, step 1): /api/canvas/boards CRUD, "Untitled board N" names, the tldraw snapshot round trip, rev conflicts,
// uploads kept as /files/ references (inline data: media refused), media GC and backups seeing board files, and the board's project.
// Run: npx tsx test/canvas-boards.test.ts   (temp data dir, no network, no server port)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.OPENHIGGSFIELD_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-boards-'));
const Fastify = (await import('fastify')).default;
const CB = await import('../src/canvasBoards.ts');
const { liveRefs } = await import('../src/mediaGc.ts');
const L = await import('../src/library.ts');
const ok = (m: string) => console.log('ok ' + m);

const app = Fastify(); CB.registerCanvasBoards(app); await app.ready();
const req = async (method: string, url: string, body?: unknown, ct = 'application/json') => {
  const r = await app.inject({ method: method as any, url, ...(body !== undefined ? { payload: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'content-type': ct } } : {}) });
  return { status: r.statusCode, body: r.body ? JSON.parse(r.body) : null };
};

// ---- names and CRUD ----
assert.equal(CB.nextBoardName([]), 'Untitled board 1');
assert.equal(CB.nextBoardName(['Untitled board 1', 'Moodboard', 'Untitled board 7', ' Untitled board 3 ']), 'Untitled board 8');
assert.deepEqual((await req('GET', '/api/canvas/boards')).body, { items: [] }, 'empty list');
const a = await req('POST', '/api/canvas/boards', {}); assert.equal(a.status, 201); assert.equal(a.body.name, 'Untitled board 1'); assert.equal(a.body.rev, 0); assert.equal(a.body.snapshot, null); assert.equal(a.body.projectId, null); assert.match(a.body.id, /^brd_[0-9a-f]{16}$/);
const b = await req('POST', '/api/canvas/boards'); assert.equal(b.body.name, 'Untitled board 2', 'no body works too');
const c = await req('POST', '/api/canvas/boards', { name: '  Lighthouse   storyboard  ' }); assert.equal(c.body.name, 'Lighthouse storyboard', 'name trimmed, spaces collapsed');
const long = await req('POST', '/api/canvas/boards', { name: 'x'.repeat(200) }); assert.equal(long.body.name.length, CB.MAX_NAME);
const ids = (await req('GET', '/api/canvas/boards')).body.items.map((x: any) => x.id); assert.equal(ids.length, 4);
assert.equal((await req('GET', '/api/canvas/boards/nope')).status, 404);
const rn = await req('PATCH', `/api/canvas/boards/${a.body.id}`, { name: 'Moodboard' }); assert.equal(rn.status, 200); assert.equal(rn.body.name, 'Moodboard');
assert.equal((await req('PATCH', `/api/canvas/boards/${a.body.id}`, { name: '   ' })).body.code, 'invalid_name');
assert.equal((await req('PATCH', `/api/canvas/boards/${a.body.id}`, {})).body.code, 'invalid_patch');
assert.equal((await req('PATCH', '/api/canvas/boards/nope', { name: 'x' })).status, 404);
assert.equal((await req('DELETE', `/api/canvas/boards/${long.body.id}`)).body.ok, true);
assert.equal((await req('GET', `/api/canvas/boards/${long.body.id}`)).status, 404, 'deleted');
assert.equal((await req('DELETE', `/api/canvas/boards/${long.body.id}`)).status, 404, 'delete twice');
assert.equal((await req('POST', '/api/canvas/boards')).body.name, 'Untitled board 3', 'the next free number');
ok('names, create, list, get, rename, delete');

// ---- snapshot round trip (the shape of getSnapshot(editor.store).document: { store: { id: record }, schema }) ----
const snap = {
  schema: { schemaVersion: 2, sequences: { 'com.tldraw.store': 5, 'com.tldraw.shape.ohf-result': 0, 'com.tldraw.asset.image': 5 } },
  store: {
    'document:document': { gridSize: 10, name: '', meta: {}, id: 'document:document', typeName: 'document' },
    'page:page': { meta: {}, id: 'page:page', name: 'Page 1', index: 'a1', typeName: 'page' },
    'shape:card1': { x: 0, y: 0, rotation: 0, isLocked: false, opacity: 1, meta: {}, id: 'shape:card1', type: 'ohf-result', parentId: 'page:page', index: 'a1', typeName: 'shape',
      props: { w: 360, h: 203, kind: 'image', jobId: 'job1', url: '/files/job1-out0.png', poster: '/files/job1-out0.png', title: 'A lighthouse', model: 'Nano Banana 2.1', place: 'Comfy Cloud', price: 'Sample', time: '4s' } },
    'shape:pic': { x: 400, y: 0, rotation: 0, isLocked: false, opacity: 1, meta: {}, id: 'shape:pic', type: 'image', parentId: 'page:page', index: 'a2', typeName: 'shape', props: { w: 200, h: 200, assetId: 'asset:up1', playing: true, url: '', crop: null, flipX: false, flipY: false, altText: '' } },
    'asset:up1': { id: 'asset:up1', typeName: 'asset', type: 'image', meta: {}, props: { name: 'sketch.png', src: '/files/upl-abc123.png', w: 200, h: 200, mimeType: 'image/png', isAnimated: false } },
  },
};
await new Promise((r) => setTimeout(r, 5)); /* a later timestamp than the boards made above */
const s1 = await req('PUT', `/api/canvas/boards/${b.body.id}`, { snapshot: snap, rev: 0 }); assert.equal(s1.status, 200); assert.equal(s1.body.rev, 1); assert.equal(s1.body.shapes, 2);
const g = await req('GET', `/api/canvas/boards/${b.body.id}`); assert.deepEqual(g.body.snapshot, snap, 'snapshot comes back exactly'); assert.equal(g.body.rev, 1); assert.equal(g.body.shapes, 2);
assert.equal((await req('GET', '/api/canvas/boards')).body.items[0].id, b.body.id, 'newest save first');
const s2 = await req('PUT', `/api/canvas/boards/${b.body.id}`, { snapshot: snap }); assert.equal(s2.body.rev, 2, 'no rev = last writer');
const stale = await req('PUT', `/api/canvas/boards/${b.body.id}`, { snapshot: snap, rev: 1 }); assert.equal(stale.status, 409); assert.equal(stale.body.code, 'rev_conflict'); assert.equal(stale.body.rev, 2);
const beacon = await req('POST', `/api/canvas/boards/${b.body.id}/save`, JSON.stringify({ snapshot: snap, rev: 2 }), 'text/plain'); assert.equal(beacon.status, 200, 'keepalive save as text/plain'); assert.equal(beacon.body.rev, 3);
for (const bad of [undefined, {}, { snapshot: [] }, { snapshot: { store: {} } }, { snapshot: { schema: {} } }]) assert.equal((await req('PUT', `/api/canvas/boards/${b.body.id}`, bad ?? {})).body.code, 'invalid_snapshot');
assert.equal((await req('PUT', '/api/canvas/boards/nope', { snapshot: snap })).status, 404);
ok('snapshot round trip, rev, rev conflict 409, keepalive save, bad bodies');

// ---- uploads stay references: inline data: media is refused; board files count as live for media GC ----
const inline = structuredClone(snap) as any; inline.store['asset:up1'].props.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
const r = await req('PUT', `/api/canvas/boards/${b.body.id}`, { snapshot: inline }); assert.equal(r.status, 400); assert.equal(r.body.code, 'inline_media'); assert.match(r.body.error, /store\.asset:up1\.props\.src/);
const vid = structuredClone(snap) as any; vid.store['shape:card1'].props.url = 'data:video/mp4;base64,AAAA'; assert.equal((await req('PUT', `/api/canvas/boards/${b.body.id}`, { snapshot: vid })).body.code, 'inline_media');
const text = structuredClone(snap) as any; text.store['shape:card1'].props.title = 'see data:text/plain,hello'; assert.equal((await req('PUT', `/api/canvas/boards/${b.body.id}`, { snapshot: text })).status, 200, 'plain text mentioning data: is fine');
assert.equal(CB.inlineMediaPath(snap), null); assert.equal(CB.inlineMediaPath({ a: ['x', { b: 'data:audio/wav;base64,AA' }] }), 'a[1].b');
const live = liveRefs(); assert.ok(live.has('upl-abc123.png') && live.has('job1-out0.png'), 'a file on a board is never swept as unreferenced');
ok('uploads kept as /files/ references, data: media refused, media GC keeps board files');

// ---- the board's project (Assets drawer filter; step 2 files new results there) ----
const p = L.createProject('Lighthouse film');
const sp = await req('PATCH', `/api/canvas/boards/${c.body.id}`, { projectId: p.id }); assert.equal(sp.status, 200); assert.equal(sp.body.projectId, p.id); assert.equal(sp.body.name, 'Lighthouse storyboard', 'name kept');
assert.equal((await req('GET', `/api/canvas/boards/${c.body.id}`)).body.projectId, p.id, 'remembered');
assert.equal((await req('PATCH', `/api/canvas/boards/${c.body.id}`, { projectId: 'nope' })).body.code, 'unknown_project');
assert.equal((await req('PATCH', `/api/canvas/boards/${c.body.id}`, { projectId: 42 })).body.code, 'unknown_project');
assert.equal((await req('PATCH', `/api/canvas/boards/${c.body.id}`, { name: 'Renamed' })).body.projectId, p.id, 'rename keeps the project');
L.deleteProject(p.id); assert.equal((await req('GET', `/api/canvas/boards/${c.body.id}`)).body.projectId, null, 'a deleted project reads as All generations');
const p2 = L.createProject('Other'); await req('PATCH', `/api/canvas/boards/${c.body.id}`, { projectId: p2.id });
assert.equal((await req('PATCH', `/api/canvas/boards/${c.body.id}`, { projectId: null })).body.projectId, null, 'back to All generations');
ok('board project: set, keep on rename, unknown refused, deleted reads null, clear');

// ---- many shapes ----
const big = structuredClone(snap) as any; for (let i = 0; i < 300; i++) big.store[`shape:n${i}`] = { ...snap.store['shape:card1'], id: `shape:n${i}`, x: i * 10 };
const sb = await req('PUT', `/api/canvas/boards/${c.body.id}`, { snapshot: big }); assert.equal(sb.status, 200); assert.equal(sb.body.shapes, 302);
ok('300+ shapes save');
/* link previews (2026-10-27): only public web addresses are read; this computer and private networks are refused without a request */
for (const bad of ['http://127.0.0.1:8787/api/health', 'http://localhost:9440/', 'http://10.0.0.5/', 'http://192.168.1.2/x', 'http://[::1]/', 'file:///etc/passwd', 'ftp://example.com/', 'not a url', 'http://router.local/'])
  assert.equal(await CB.publicUrl(bad), null, `refused: ${bad}`);
assert.equal((await req('GET', '/api/canvas/unfurl?url=' + encodeURIComponent('http://127.0.0.1:1/'))).status, 400, 'the route refuses a local address');
assert.equal((await req('GET', '/api/canvas/unfurl')).status, 400, 'no url');
ok('link previews: local and private addresses are refused');
await app.close();
console.log('canvas-boards: all ok');
