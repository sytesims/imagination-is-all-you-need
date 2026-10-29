// Media picker projects (2026-10-25). Own mock server on a temp data dir.
//  - POST /api/media with projectId tags the upload; the same file uploaded in two projects is in both (one entry, content-hashed).
//  - GET /api/media?project=<id>|none|all filters Uploads, Generations and Liked; items carry projectIds[].
//  - A job submitted with projectId lands in that project (every tool), and its uploaded input is listed under that project.
//  - POST /api/media/project moves an upload (its set becomes just that project); deleting a project drops it (→ No project).
// Run: npx tsx test/picker-projects.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '' };
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'pproj-')); const DATA = fs.mkdtempSync(path.join(D, 'data-')); const PORT = testPort(8806); const B = `http://localhost:${PORT}`;
const ok = (m: string) => console.log('ok ' + m);
const REF = path.join(import.meta.dirname, 'fixtures/ref-512.png');
const IMG2 = path.join(D, 'blue.png'); execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=512x512:rate=1', '-frames:v', '1', IMG2]);
const IMG3 = path.join(D, 'grad.png'); execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=600x600:rate=1', '-frames:v', '1', IMG3]);

const srv: ChildProcess = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: DATA, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '100', OPENHIGGSFIELD_USE_LOCAL: '0' },
  stdio: ['ignore', fs.openSync(path.join(D, 'srv.log'), 'a'), fs.openSync(path.join(D, 'srv.log'), 'a')], detached: true });
const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
const json = async (m: string, u: string, b: unknown) => { const r = await fetch(B + u, { method: m, headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, body: await r.json().catch(() => null) as any }; };
const post = async (u: string, f: Record<string, string>, files: [string, string, string][] = []) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v);
  for (const [k, p, t] of files) fd.append(k, new Blob([fs.readFileSync(p)], { type: t }), path.basename(p)); const r = await fetch(B + u, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() as any }; };
const until = async (id: string) => { for (let i = 0; i < 600; i++) { const j = await get(`/api/jobs/${id}`); if (['done', 'failed', 'needs_decision', 'blocked', 'canceled'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 100)); } throw new Error('timeout ' + id); };
const urls = async (q: string) => (await get(`/api/media?${q}&type=image&pageSize=100`)).items.map((x: any) => x.url) as string[];
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 500)); }
  const A = (await json('POST', '/api/projects', { name: 'Alpha' })).body.id as string; const Bp = (await json('POST', '/api/projects', { name: 'Beta' })).body.id as string;
  const Kid = (await json('POST', '/api/projects', { name: 'Alpha kid', parentId: A })).body.id as string; assert.ok(A && Bp && Kid);

  // ---- uploads: tagged at upload, both projects for the same bytes, untagged = No project ----
  let refUrl = ''; let img2Url = '';
  { const old = await post('/api/media', {}, [['file', IMG2, 'image/png']]); assert.equal(old.status, 200, JSON.stringify(old.body)); img2Url = old.body.items[0].url;
    const a = await post(`/api/media?projectId=${A}`, {}, [['file', REF, 'image/png']]); assert.equal(a.status, 200, JSON.stringify(a.body)); refUrl = a.body.items[0].url;
    const b = await post('/api/media', { projectId: Bp }, [['file', REF, 'image/png']]); assert.equal(b.body.items[0].url, refUrl, 'same bytes → same entry');
    const bogus = await post('/api/media?projectId=nope', {}, [['file', IMG3, 'image/png']]); assert.equal(bogus.status, 200, 'an unknown project is ignored, the upload still works');
    assert.deepEqual(await urls(`tab=uploads&project=${A}`), [refUrl]); assert.deepEqual(await urls(`tab=uploads&project=${Bp}`), [refUrl]);
    assert.deepEqual((await urls('tab=uploads&project=none')).sort(), [img2Url, bogus.body.items[0].url].sort(), 'old / untagged uploads are No project');
    assert.equal((await urls('tab=uploads&project=all')).length, 3); assert.equal((await urls('tab=uploads')).length, 3, 'no project param = all');
    assert.deepEqual((await get(`/api/media?tab=uploads&type=image&project=${A}`)).items[0].projectIds.sort(), [A, Bp].sort());
    assert.deepEqual(await urls(`tab=uploads&project=${Kid}`), [], 'empty project → empty list');
    ok('uploads: tagged to the current project; same file in two projects is one entry in both; old uploads are No project'); }

  // ---- jobs: projectId at submit (two different tools), generations + liked filter, job inputs follow the job ----
  let jobA = ''; let jobB = '';
  { const r1 = await post('/api/tools/image-upscale/jobs', { types: '["x2"]', rights: '1', projectId: Kid }, [['image', IMG3, 'image/png']]); assert.equal(r1.status, 200, JSON.stringify(r1.body)); jobA = r1.body.id;
    const r2 = await post('/api/tools/create-image/jobs', { types: 'generate', prompt: 'a red fox in snow', projectId: Bp }); assert.equal(r2.status, 200, JSON.stringify(r2.body)); jobB = r2.body.id;
    const r3 = await post('/api/tools/create-image/jobs', { types: 'generate', prompt: 'a lighthouse', projectId: '' }); assert.equal(r3.status, 200, JSON.stringify(r3.body));
    const js = await Promise.all([jobA, jobB, r3.body.id].map(until)); js.forEach((j) => assert.equal(j.status, 'done', j.error));
    assert.equal(js[0].projectId, Kid, 'upscale job filed in the project it was sent with'); assert.equal(js[1].projectId, Bp, 'create-image job filed'); assert.ok(!js[2].projectId, 'empty projectId → no project');
    const gK = await get(`/api/media?tab=generations&type=image&project=${Kid}`); assert.ok(gK.total >= 1 && gK.items.every((x: any) => x.jobId === jobA), JSON.stringify(gK.items));
    const gN = await get('/api/media?tab=generations&type=image&project=none'); assert.ok(gN.items.every((x: any) => x.jobId === r3.body.id) && gN.total >= 1);
    assert.ok((await urls(`tab=uploads&project=${Kid}`)).length === 1, 'the job’s own upload is listed under its project');
    await json('POST', `/api/jobs/${jobB}/favourite`, { on: true });
    const lB = await get(`/api/media?tab=liked&type=image&project=${Bp}`); const lA = await get(`/api/media?tab=liked&type=image&project=${A}`);
    if (lB.total) { assert.equal(lA.total, 0, 'liked filtered by project'); ok('liked tab filtered by project'); }
    ok('jobs submitted with projectId land there (upscale + create-image); generations filter by project/none; job input listed in the job’s project'); }

  // ---- move to project: upload set replaced; jobs via setProject; counts ----
  { const m = await json('POST', '/api/media/project', { url: refUrl, projectId: Kid }); assert.equal(m.status, 200, JSON.stringify(m.body)); assert.deepEqual(m.body.projectIds, [Kid]);
    assert.deepEqual(await urls(`tab=uploads&project=${A}`), []); assert.ok((await urls(`tab=uploads&project=${Kid}`)).includes(refUrl));
    const n = await json('POST', '/api/media/project', { url: img2Url, projectId: null }); assert.equal(n.status, 200); assert.deepEqual(n.body.projectIds, []);
    assert.equal((await json('POST', '/api/media/project', { url: refUrl, projectId: 'nope' })).status, 400, 'unknown project → 400');
    assert.equal((await json('POST', '/api/media/project', { url: '/files/none.png', projectId: A })).status, 404, 'not an upload → 404');
    // a file known only as a job input can be moved too
    const jobIn = (await get(`/api/media?tab=uploads&type=image&project=${Kid}`)).items.find((x: any) => x.url !== refUrl)?.url as string; assert.ok(jobIn, "job input entry (folded with the untagged upload of the same bytes)");
    const mi = await json('POST', '/api/media/project', { url: jobIn, projectId: A }); assert.equal(mi.status, 200, JSON.stringify(mi.body)); assert.ok((await urls(`tab=uploads&project=${A}`)).includes(mi.body.url));
    assert.ok(!(await urls(`tab=uploads&project=${Kid}`)).includes(mi.body.url), 'moved out of the old project');
    { const IMG4 = path.join(D, 'mand.png'); execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'mandelbrot=size=520x520:rate=1', '-frames:v', '1', IMG4]);
      const r = await post('/api/tools/image-upscale/jobs', { types: '["x2"]', rights: '1' }, [['image', IMG4, 'image/png']]); assert.equal(r.status, 200, JSON.stringify(r.body)); await until(r.body.id);
      const only = (await get('/api/media?tab=uploads&type=image&project=none&pageSize=100')).items.find((x: any) => x.jobId === r.body.id)?.url as string; assert.ok(only, 'job-only input listed as No project');
      const mv = await json('POST', '/api/media/project', { url: only, projectId: Bp }); assert.equal(mv.status, 200, JSON.stringify(mv.body));
      assert.ok((await urls(`tab=uploads&project=${Bp}`)).includes(only)); assert.ok(!(await urls('tab=uploads&project=none')).includes(only));
      assert.equal((await urls('tab=uploads&project=all')).filter((u) => u === only).length, 1, 'still one entry'); }
    ok('POST /api/media/project moves an upload (also one known only as a job input); 400 unknown project, 404 not an upload'); }

  // ---- deleted project: items fall back to No project ----
  { const before = await urls('tab=uploads&project=none'); assert.equal((await fetch(`${B}/api/projects/${A}`, { method: 'DELETE' })).status, 200);
    const after = await urls('tab=uploads&project=none'); assert.ok(after.length === before.length + 1, `${before.length} → ${after.length}`);
    assert.deepEqual(await urls(`tab=uploads&project=${A}`), []);
    ok('deleting a project drops it from uploads (→ No project)'); }
  console.log('picker-projects: all ok');
} finally { try { process.kill(-srv.pid!, 'SIGTERM'); } catch { /* gone */ } }
