// E2E (own mock server :8895, temp data dir): result overlay backend needs. Community seed (idempotent, someone else's, out of your
// lists), B1 element from an output / video frame, B2 add an image to an element, B4 neighbours, B5 output metadata, B6 primary
// next action, deep links, and the cloud-h3 quote. Run: npx tsx test/result-overlay.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const PORT = testPort(8895); const B = `http://localhost:${PORT}`;
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'ovl-'));
const start = () => spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '200', OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_USE_LOCAL: '1' }, stdio: 'ignore', detached: true });
const stop = async (p: ChildProcess) => { try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* gone */ } for (let i = 0; i < 50; i++) { try { await fetch(`${B}/api/health`); } catch { return; } await new Promise((r) => setTimeout(r, 200)); } };
const ready = async () => { for (let i = 0; i < 90; i++) { try { if ((await fetch(`${B}/api/health`)).ok) return; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); } throw new Error('server did not start'); };
let srv = start();
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'ovlf-')); const png = path.join(T, 'r.png'), mp4 = path.join(T, 'a.mp4');
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=854x480:rate=24', '-t', '4', '-pix_fmt', 'yuv420p', mp4]);
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=512x512', '-frames:v', '1', png]);
const raw = async (m: string, u: string, b?: unknown) => { const r = await fetch(B + u, { method: m, redirect: 'manual', headers: b === undefined ? {} : { 'content-type': 'application/json' }, body: b === undefined ? undefined : JSON.stringify(b) }); const t = await r.text(); let body: any = t; try { body = JSON.parse(t); } catch { /* html */ } return { status: r.status, body, headers: r.headers }; };
const get = (u: string) => raw('GET', u);
const form = async (u: string, f: Record<string, string>, files: [string, string][] = []) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v); for (const [k, p] of files) fd.append(k, new Blob([fs.readFileSync(p)]), path.basename(p)); const r = await fetch(B + u, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() as any }; };
const done = async (id: string) => { for (let i = 0; i < 300; i++) { const j = (await get(`/api/jobs/${id}`)).body; if (['done', 'failed', 'blocked', 'canceled'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 100)); } throw new Error('timeout ' + id); };
const dims = (f: string) => execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f]).toString().trim().split('\n')[0];
const fileOf = (u: string) => path.join(D, u.replace(/^\/files\//, ''));
const IMG = { types: '["generate"]', provider: 'comfy-zimage-turbo', route: 'local:comfy-zimage-turbo' };
try {
  await ready();
  // ---- Community seed ----
  let seedIds: string[] = [];
  { const s = (await get('/api/community/shots?limit=100')).body; const seeds = s.items.filter((x: any) => x.author && x.author !== 'you');
    assert.ok(seeds.length >= 10, `seeded shots: ${seeds.length}`); seedIds = seeds.map((x: any) => x.id);
    const vids = seeds.filter((x: any) => /\.mp4$/.test(x.previewUrl)), imgs = seeds.filter((x: any) => /\.(jpe?g|png)$/.test(x.previewUrl));
    assert.ok(imgs.length >= 6 && vids.length >= 4, `images ${imgs.length}, videos ${vids.length}`);
    // /examples/* is web/public, served by Vite (dev) or the web build (web/dist, prod): this API-only server has neither, so check the file the URL names; anything else over HTTP
    const served = async (u: string) => (u.startsWith('/examples/') ? fs.existsSync(path.join(ROOT, '../web/public', decodeURIComponent(u.split('?')[0]))) : (await fetch(B + u)).status === 200);
    for (const v of vids) { assert.match(v.posterUrl, /\.jpg$/, 'video seed has a poster'); assert.ok(await served(v.posterUrl), v.posterUrl); assert.ok(await served(v.previewUrl), v.previewUrl); }
    assert.ok(seeds.every((x: any) => x.likes === 0), 'round 1: seeds start at 0 real likes');
    const sj = (await get(`/api/jobs/${vids[0].id}`)).body; assert.equal(sj.status, 'done'); assert.equal(sj.owner, 'community:openhiggsfield'); assert.equal(sj.isOwner, false);
    assert.equal(sj.outputs[0].kind, 'video'); assert.ok(sj.outputs[0].width > 0 && sj.outputs[0].durationSec > 0); assert.match(sj.outputs[0].posterUrl, /\.jpg$/);
    const mine = (await get('/api/jobs?limit=500')).body as any[]; assert.ok(!mine.some((j) => seedIds.includes(j.id)), 'seed jobs are not in your /api/jobs');
    const assets = (await get('/api/assets')).body as any[]; assert.ok(!assets.some((j) => seedIds.includes(j.id)), 'seed jobs are not in your Assets');
    const home = (await get('/api/community?sort=new&limit=100')).body.items.filter((x: any) => x.kind === 'shared' || x.kind === 'sample'); assert.ok(home.length >= 10 && home.every((x: any) => x.author !== 'you'));
    console.log(`ok community seed: ${seeds.length} shots (${imgs.length} images, ${vids.length} videos with posters), someone else's, not in your jobs/Assets`); }
  // ---- B5 output metadata ----
  const ci = await form('/api/tools/create-image/jobs', { ...IMG, prompt: 'a red mug' }); assert.equal(ci.status, 200, JSON.stringify(ci.body)); const img = await done(ci.body.id); assert.equal(img.status, 'done');
  const sw = await form('/api/tools/object-swap/jobs', { prompt: 'swap the mug', route: 'local:comfy-open' }, [['video', mp4], ['refs', png]]); assert.equal(sw.status, 200, JSON.stringify(sw.body)); const vid = await done(sw.body.id); assert.equal(vid.status, 'done');
  { const o = img.outputs[0]; assert.ok(o.label && o.url, 'label/url kept'); assert.equal(o.kind, 'image'); assert.ok(o.width > 0 && o.height > 0, JSON.stringify(o)); assert.equal(o.durationSec, null); assert.equal(o.posterUrl, o.url);
    const v = vid.outputs[0]; assert.equal(v.kind, 'video'); assert.ok(v.width > 0 && v.height > 0 && v.durationSec > 0, JSON.stringify(v)); assert.ok(v.posterUrl);
    const pr = await fetch(B + v.posterUrl); assert.equal(pr.status, 200); assert.match(pr.headers.get('content-type') ?? '', /image\/jpeg/);
    const again = (await get(`/api/jobs/${vid.id}`)).body.outputs[0]; assert.deepEqual(again, v, 'cached, stable');
    const listed = ((await get('/api/jobs?limit=50')).body as any[]).find((j) => j.id === vid.id); assert.equal(listed.outputs[0].width, v.width, 'lists carry it too once probed');
    assert.equal((await get('/api/media/poster?url=/files/nope.mp4')).status, 404);
    console.log(`ok B5 outputs: image ${o.width}×${o.height}; video ${v.width}×${v.height} ${v.durationSec}s poster ${v.posterUrl}`); }
  // ---- B1 element from an output / frame ----
  let elId = '';
  { const a = await raw('POST', '/api/elements', { fromJob: img.id, output: 0, name: 'Mug', kind: 'product' }); assert.equal(a.status, 200, JSON.stringify(a.body));
    assert.match(a.body.url, /^\/files\/el-/); assert.notEqual(a.body.url, img.outputs[0].url); assert.equal(a.body.frame, 'image'); assert.deepEqual(a.body.images, [a.body.url]); assert.equal(a.body.sources[0].jobId, img.id);
    assert.equal(dims(fileOf(a.body.url)), `${img.outputs[0].width},${img.outputs[0].height}`, 'saved the output, not the input');
    const f = await raw('POST', '/api/elements', { fromJob: vid.id, output: 0, t: 1, name: 'Frame' }); assert.equal(f.status, 200, JSON.stringify(f.body)); assert.equal(f.body.frame, 'frame'); assert.match(f.body.url, /\.jpg$/); assert.equal(f.body.sources[0].t, 1);
    assert.equal(dims(fileOf(f.body.url)), `${vid.outputs[0].width},${vid.outputs[0].height}`);
    const c = await raw('POST', '/api/elements', { fromJob: vid.id, output: 0, t: 999 }); assert.equal(c.status, 200); assert.match(c.body.note, /clamped/); assert.ok(c.body.sources[0].t < vid.outputs[0].durationSec);
    const m = await form('/api/elements', { fromJob: vid.id, output: '0', t: '0.5', name: 'Multipart frame' }); assert.equal(m.status, 200, JSON.stringify(m.body)); assert.equal(m.body.frame, 'frame');
    for (const [b, code, field] of [[{ fromJob: img.id, output: 3 }, 400, 'output'], [{ fromJob: vid.id, output: 0, t: -1 }, 400, 't'], [{ fromJob: vid.id, output: 'x' }, 400, 'output'], [{ fromJob: 'nope', output: 0 }, 404, 'fromJob']] as [object, number, string][]) {
      const r = await raw('POST', '/api/elements', b); assert.equal(r.status, code, JSON.stringify(b)); assert.equal(r.body.issues[0].field, field); }
    const legacy = await form('/api/elements', { name: 'upload' }, [['image', png]]); assert.equal(legacy.status, 200); assert.deepEqual(legacy.body.images, [legacy.body.url]);
    elId = a.body.id; console.log('ok B1 element from output (image copy) and from a video frame at t (ffmpeg, clamped), errors listed per field'); }
  // ---- B2 add images ----
  { const r = await raw('POST', `/api/elements/${elId}/images`, { fromJob: vid.id, output: 0, t: 0.5 }); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.images.length, 2); assert.equal(r.body.url, r.body.images[0], 'cover unchanged'); assert.equal(r.body.added.frame, 'frame');
    const u = await form(`/api/elements/${elId}/images`, {}, [['image', png]]); assert.equal(u.status, 200); assert.equal(u.body.images.length, 3);
    assert.equal((await raw('POST', '/api/elements/nope/images', { fromJob: img.id })).status, 404);
    assert.equal((await raw('POST', `/api/elements/${elId}/images`, {})).status, 400);
    const listed = ((await get('/api/elements')).body as any[]).find((e) => e.id === elId); assert.equal(listed.images.length, 3);
    for (let i = 0; i < 9; i++) await form(`/api/elements/${elId}/images`, {}, [['image', png]]);
    assert.equal((await form(`/api/elements/${elId}/images`, {}, [['image', png]])).status, 409, 'max 12 images');
    console.log('ok B2 add an image (frame or upload) to an element; 404 unknown, 400 empty, 409 when full'); }
  // ---- B4 neighbours ----
  { const ids: string[] = []; for (const p of ['n1', 'n2', 'n3']) { const r = await form('/api/tools/create-image/jobs', { ...IMG, prompt: p }); ids.push(r.body.id); await done(r.body.id); }
    const list = ((await get('/api/jobs?tool=create-image')).body as any[]).map((j) => j.id); const i = list.indexOf(ids[1]);
    const n = (await get(`/api/jobs/${ids[1]}/neighbours?tool=create-image`)).body; assert.deepEqual(n, { jobId: ids[1], inList: true, prev: list[i - 1], next: list[i + 1], position: i + 1, total: list.length });
    assert.deepEqual((await get(`/api/jobs/${ids[1]}/neighbors?tool=create-image`)).body, n, 'US spelling');
    const first = (await get(`/api/jobs/${list[0]}/neighbours?tool=create-image`)).body; assert.equal(first.prev, null);
    const last = (await get(`/api/jobs/${list[list.length - 1]}/neighbours?tool=create-image`)).body; assert.equal(last.next, null);
    const out = (await get(`/api/jobs/${vid.id}/neighbours?tool=create-image`)).body; assert.equal(out.inList, false); assert.equal(out.prev, null);
    assert.equal((await get('/api/jobs/nope/neighbours')).status, 404); assert.equal((await get(`/api/jobs/${ids[1]}/neighbours?from=garbage`)).status, 400);
    console.log('ok B4 neighbours = GET /api/jobs order with the same filters; ends null; not-in-list; 404/400'); }
  // ---- B6 primary next action ----
  { const ni = (await get(`/api/jobs/${img.id}/next-actions`)).body; const prim = ni.items.filter((x: any) => x.primary);
    assert.equal(prim.length, 1); assert.equal(prim[0].tool, 'h3-video'); assert.equal(ni.primary.action, 'turn-to-video'); assert.ok(ni.items.every((x: any) => typeof x.primary === 'boolean'));
    const nv = (await get(`/api/jobs/${vid.id}/next-actions`)).body; assert.ok(nv.items.every((x: any) => x.primary === false)); assert.equal(nv.primary.action, 'recreate'); assert.match(nv.primary.route, new RegExp(`recreate=${vid.id}`));
    const bl = await form('/api/tools/create-image/jobs', { ...IMG, prompt: 'x', simulate: 'nsfw' }); await done(bl.body.id); const nb = (await get(`/api/jobs/${bl.body.id}/next-actions`)).body; assert.equal(nb.primary.action, 'retry');
    console.log('ok B6 primary: image → Turn to video (item primary:true), video → Recreate, blocked → Retry'); }
  // ---- deep links ----
  { const web = fs.existsSync(path.resolve(ROOT, '../web/dist/index.html')); const r = await fetch(`${B}/jobs/${vid.id}?shot=${vid.id}`);
    if (web) { assert.equal(r.status, 200); assert.match(r.headers.get('content-type') ?? '', /text\/html/); } else assert.equal(r.status, 404);
    const tok = (await raw('POST', `/api/jobs/${vid.id}/share`)).body.token; const s = await raw('GET', `/share/${tok}`); assert.equal(s.status, 302); assert.equal(s.headers.get('location'), `/s/${tok}`);
    const share = (await get(`/api/share/${tok}`)).body; assert.equal(share.outputs[0].kind, 'video'); assert.ok(share.outputs[0].width > 0);
    console.log(`ok deep links: /jobs/:id → ${web ? 'SPA index.html' : '404 (no web build)'}; /share/:token → /s/:token; share API carries output metadata`); }
  // ---- cloud-h3 quote: valid mirrors runnable (MOCK_KEYS=1 → key configured → valid) ----
  { const q = (await get('/api/models/quote?model=cloud-h3')).body; assert.equal(typeof q.credits, 'number'); assert.equal(q.valid, q.runnable !== false, JSON.stringify(q).slice(0, 300)); assert.equal(q.valid, true);
    // quote = charge for the H3 video models (the quote used to re-plan on create-image with an 8 s default: 64 vs a 48 charge)
    for (const [m, extra] of [['cloud-h3', ''], ['cloud-h3', 'seconds=10'], ['api-minimax-h3', ''], ['api-minimax-h3', 'duration=10']] as const) {
      const qq = (await get(`/api/models/quote?model=${m}${extra ? '&' + extra : ''}`)).body; const f: Record<string, string> = { prompt: 'a cat walks', provider: m, types: '["t2v"]' }; if (extra) { const [k, v] = extra.split('='); f[k] = v; }
      const sub = await form('/api/tools/h3-video/jobs', f); assert.equal(sub.status, 200, JSON.stringify(sub.body)); assert.equal(sub.body.cost, qq.credits, `${m} ${extra}: quote ${qq.credits} = charge ${sub.body.cost}`); }
    console.log(`ok cloud-h3 quote ${q.credits} credits, valid ${q.valid} (with a key); quote = charge for cloud-h3 / api-minimax-h3 (default, seconds, duration)`); }
  // ---- seed idempotent across restarts; a trashed seed stays gone ----
  { assert.equal((await raw('DELETE', `/api/jobs/${seedIds[0]}`)).status, 200);
    await stop(srv); srv = start(); await ready();
    const s = (await get('/api/community/shots?limit=100')).body.items.filter((x: any) => x.author && x.author !== 'you');
    assert.equal(s.length, seedIds.length - 1, 'no duplicates after restart, trashed seed not re-added'); assert.ok(!s.some((x: any) => x.id === seedIds[0]));
    console.log('ok seed idempotent across restart; a trashed seed item stays trashed'); }
  console.log('ALL OK');
} finally { await stop(srv); fs.rmSync(D, { recursive: true, force: true }); fs.rmSync(T, { recursive: true, force: true }); }
