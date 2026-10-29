// Media picker shows ALL matching generations (2026-10-26; user: "Motion Control's picker doesn't show all my generations"). In process, temp data dir.
//  - GET /api/media generations, type=video: every finished video of every feature (Direct a Shot mockups and Render takes, cloud and local jobs),
//    a cache-busting "?v=" URL and an older job that kept only resultUrl included; images left out; failed / deleted jobs left out; total + paging honest
//  - the web picker asks for everything (no hidden "Recent" 12-item cap), starts on All projects, shows the count, and Esc / clicks work over a sheet
// Run: npx tsx test/media-picker-all.test.ts
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'mpall-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'none.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_SEED_COMMUNITY: '0', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json') });
const ok = (m: string) => console.log('ok ' + m);
const { jobs } = await import('../src/jobs.ts'); const { listMedia } = await import('../src/mediaLibrary.ts');
const put = (id: string, toolId: string, files: string[], o: Record<string, any> = {}) => { for (const f of files) fs.writeFileSync(path.join(D, f.split('?')[0]), 'x');
  jobs.set(id, { id, toolId, status: 'done', createdAt: 1000 + jobs.size, finishedAt: 2000 + jobs.size, outputs: files.map((f, k) => ({ label: `Out ${k}`, url: `/files/${f}` })), resultUrl: files[0] ? `/files/${files[0]}` : null, input: { prompt: id }, ...o } as any); };
for (let k = 0; k < 30; k++) put(`vid${k}`, k % 3 ? 'h3-video' : 'camera', [`vid${k}-out0.mp4`]);
put('mock1', 'plan-a-shot', ['mock1-out0.mp4', 'mock1-out1.mp4']); put('take1', 'make-it-real', ['take1-out0.mp4']); put('cloud1', 'h3-video', ['cloud1-out0.mp4?v=2'], { routing: { route: 'comfy-router:router-kling' } });
put('old1', 'restyle', [], { outputs: [], resultUrl: '/files/old1-out0.mp4' }); fs.writeFileSync(path.join(D, 'old1-out0.mp4'), 'x');
put('img1', 'create-image', ['img1-out0.png']); put('fail1', 'h3-video', ['fail1-out0.mp4'], { status: 'failed' });
const all = await listMedia({ tab: 'generations', type: 'video', pageSize: 100 });
const ids = new Set(all.items.map((x: any) => x.jobId));
assert.equal(all.total, 30 + 2 + 1 + 1 + 1, `every finished video (${all.total})`); for (const id of ['mock1', 'take1', 'cloud1', 'old1', 'vid0', 'vid29']) assert.ok(ids.has(id), id);
assert.ok(!ids.has('img1') && !ids.has('fail1'), 'images and failed jobs left out');
const p1 = await listMedia({ tab: 'generations', type: 'video', pageSize: 48 }); assert.equal(p1.items.length, 35); assert.equal(p1.hasMore, false);
const p2 = await listMedia({ tab: 'generations', type: 'video', pageSize: 20, page: 2 }); assert.equal(p2.items.length, 15); assert.equal(p2.total, 35);
assert.ok(all.items[0].createdAt >= all.items[all.items.length - 1].createdAt, 'newest first');
ok('library: all 35 finished videos (mockups, takes, cloud with ?v=, resultUrl-only), no images / failed; paging and total honest; newest first');
const src = fs.readFileSync(path.join(import.meta.dirname, '..', '..', 'web', 'src', 'shared', 'MediaPicker.tsx'), 'utf8');
assert.doesNotMatch(src, /RECENT_N|scope === 'recent'/, 'no hidden Recent cap'); assert.match(src, /pageSize: String\(PAGE\)/); assert.match(src, /projByTab\[tab\] \?\? 'all'/, 'starts on All projects');
assert.match(src, /data-testid="mpk-count"/, 'a visible count'); assert.match(src, /data-apop-keep/, 'clicks in the picker keep a sheet underneath open'); assert.match(src, /useDismiss\(true/, 'Esc closes the picker first');
ok('picker: asks for every match (paged), starts on All projects, shows the count; clicks over a sheet keep it open; Esc on the shared stack');
console.log('media-picker-all: all ok');
