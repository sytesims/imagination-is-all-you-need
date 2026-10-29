// Saved video frames in Assets (2026-10-26). Own mock server on a temp data dir (never the live app, no paid calls).
//  - POST /api/media/frame makes a finished "video-frame" job: listed in Assets (GET /api/jobs, media=image) with the "Video frame" label and
//    parentId = the source video's job (the viewer's "Made from"); the same frame twice = one item; 0 frames = nothing extra.
//  - Not an "Enhanced" item; listed once in the picker (Uploads, not Generations).
//  - Trash rules are the jobs' own: trash hides it from Assets and the picker, restore brings it back, delete forever removes the PNG and its row.
// Run: npx tsx test/video-frame-assets.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '' };
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'vframe-assets-')); const DATA = fs.mkdtempSync(path.join(D, 'data-')); const PORT = testPort(8811); const B = `http://localhost:${PORT}`;
const ok = (m: string) => console.log('ok ' + m);
const CLIP = path.join(D, 'grey.mp4');
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'nullsrc=s=320x180:r=12:d=2,format=yuv420p,geq=lum=\'20+8*N\':cb=128:cr=128', '-frames:v', '24', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', CLIP]);
const srv: ChildProcess = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: DATA, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '100', OPENHIGGSFIELD_USE_LOCAL: '0', OPENHIGGSFIELD_SEED_COMMUNITY: '0' },
  stdio: ['ignore', fs.openSync(path.join(D, 'srv.log'), 'a'), fs.openSync(path.join(D, 'srv.log'), 'a')], detached: true });
const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
const send = async (m: string, u: string, body?: any) => { const r = await fetch(B + u, { method: m, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => null) as any }; };
const form = async (u: string, f: Record<string, string>, files: [string, string, string][] = []) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v);
  for (const [k, p, t] of files) fd.append(k, new Blob([fs.readFileSync(p)], { type: t }), path.basename(p)); const r = await fetch(B + u, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() as any }; };
const until = async (id: string) => { for (let i = 0; i < 900; i++) { const j = await get(`/api/jobs/${id}`); if (['done', 'failed', 'needs_decision', 'blocked', 'canceled'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 100)); } throw new Error('timeout'); };
const assets = async (q = '') => (await get(`/api/jobs?cursor=${q}`)).items as any[];
const frames = async (q = '') => (await assets(q)).filter((j) => j.toolId === 'video-frame');
const pickerUploads = async () => (await get('/api/media?tab=uploads&type=image&pageSize=200')).items as any[];
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 500)); }
  assert.equal((await get('/api/health')).backend, 'mock');
  assert.equal((await frames()).length, 0, 'no frames saved: none listed');
  // a video result to take frames from
  const r = await form('/api/tools/h3-video/jobs', { prompt: 'waves on a pier', provider: 'comfy-ltx25-video', types: '["t2v"]', duration: '5' }); assert.equal(r.status, 200, JSON.stringify(r.body));
  const j = await until(r.body.id); assert.equal(j.status, 'done', j.error);
  const before = (await assets()).length;
  ok(`0 frames: Assets lists only the ${before} result(s)`);
  // ---- save a frame of the result ----
  const f = await send('POST', '/api/media/frame', { jobId: j.id, out: 0, at: 'last' }); assert.equal(f.status, 200, JSON.stringify(f.body));
  const fid = f.body.item.jobId; assert.ok(fid, 'the frame names its Assets item');
  let list = await frames(); assert.equal(list.length, 1); const a = list[0];
  assert.equal(a.id, fid); assert.equal(a.status, 'done'); assert.equal(a.resultUrl, f.body.item.url); assert.equal(a.parentId, j.id, 'Made from = the source video');
  assert.equal(a.feature?.label, 'Video frame'); assert.match(a.input.prompt, /^Last frame · waves on a pier/); assert.equal(a.input.videoUrl, j.outputs[0].url);
  assert.equal(a.enhanced, false, 'not an Enhanced item'); assert.ok((await assets('&media=image')).some((x) => x.id === fid), 'under Images');
  assert.ok(!(await assets('&media=video')).some((x) => x.id === fid)); assert.ok(!(await assets('&enhanced=1')).some((x) => x.id === fid));
  const again = await send('POST', '/api/media/frame', { jobId: j.id, out: 0, at: 'last' }); assert.equal(again.body.item.jobId, fid); assert.equal((await frames()).length, 1, 'same frame twice = one item');
  const gens = (await get('/api/media?tab=generations&pageSize=200')).items as any[]; assert.ok(!gens.some((x: any) => x.jobId === fid), 'not a picker Generation');
  assert.equal((await pickerUploads()).filter((x) => x.url === a.resultUrl).length, 1, 'once in the picker Uploads');
  ok(`frame → Assets item ${fid} (Video frame, made from ${j.id}, Images, not Enhanced); saved twice = one; picker lists it once`);
  // ---- from an upload (no source job) ----
  const up = await form('/api/media', {}, [['file', CLIP, 'video/mp4']]); const fu = await send('POST', '/api/media/frame', { url: up.body.items[0].url, at: 'first' }); assert.equal(fu.status, 200);
  const u = (await frames()).find((x) => x.id === fu.body.item.jobId); assert.ok(u); assert.equal(u.parentId, null); assert.equal(u.input.videoUrl, up.body.items[0].url);
  // many frames: one item each, newest first
  for (const t of [0.25, 0.5, 0.75, 1, 1.25]) assert.equal((await send('POST', '/api/media/frame', { url: up.body.items[0].url, at: t })).status, 200);
  list = await frames(); assert.equal(list.length, 7, 'seven frames'); assert.ok(list.every((x, i) => i === 0 || list[i - 1].createdAt >= x.createdAt), 'newest first');
  ok('upload frame (no parent, source url kept); 7 frames → 7 items');
  // ---- trash rules: the jobs' own ----
  const file = path.join(DATA, a.resultUrl.replace(/^\/files\//, ''));
  assert.equal((await send('DELETE', `/api/jobs/${fid}`)).status, 200); assert.ok(!(await frames()).some((x) => x.id === fid), 'trashed: out of Assets');
  assert.ok(!(await pickerUploads()).some((x) => x.url === a.resultUrl), 'trashed: out of the picker'); assert.ok(fs.existsSync(file), 'file kept while in Trash');
  const tr = await get('/api/assets?section=trash'); assert.ok((tr.items ?? tr).some((x: any) => x.id === fid), 'in Trash');
  assert.equal((await send('POST', `/api/jobs/${fid}/restore`)).status, 200); assert.ok((await frames()).some((x) => x.id === fid)); assert.ok((await pickerUploads()).some((x) => x.url === a.resultUrl), 'restored: back in the picker');
  // trashed then saved again: the same item comes back
  await send('DELETE', `/api/jobs/${fid}`); const back = await send('POST', '/api/media/frame', { jobId: j.id, out: 0, at: 'last' }); assert.equal(back.body.item.jobId, fid); assert.ok((await frames()).some((x) => x.id === fid));
  // delete forever: the PNG and its picker row go
  await send('DELETE', `/api/jobs/${fid}`); const p = await send('DELETE', `/api/trash/${fid}`); assert.equal(p.status, 200, JSON.stringify(p.body));
  assert.ok(!fs.existsSync(file), 'PNG removed'); assert.ok(!(await pickerUploads()).some((x) => x.url === a.resultUrl), 'picker row removed'); assert.equal((await get(`/api/jobs/${j.id}`)).status, 'done', 'the source video stays');
  ok('trash hides it (Assets + picker), restore brings it back, saving again restores it, delete forever removes the PNG and its row');
  console.log('video-frame-assets e2e: all ok');
} finally { try { process.kill(-srv.pid!, 'SIGTERM'); } catch { /* gone */ } }
