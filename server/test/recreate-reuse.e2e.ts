// E2E (own mock server :8894, temp data dir): Recreate without re-upload. GET /api/jobs/:id/prefill (action=recreate) returns
// submit {fromJob, reuseInputs:"<file fields>"}; POST /api/tools/:id/jobs with the form fields + that submit (no files) re-attaches the
// source job's own input files (copied under the new job id), parentId = source. Relight (image) and OpenSoul (refs). Run: npx tsx test/recreate-reuse.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const PORT = testPort(8894); const B = `http://localhost:${PORT}`;
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'reuse-'));
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '200', OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_USE_LOCAL: '1', OPENHIGGSFIELD_SEED_COMMUNITY: '0' }, stdio: 'ignore', detached: true });
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'reusef-')); const p1 = path.join(T, 'a.png'), p2 = path.join(T, 'b.png'), p3 = path.join(T, 'c.png');
for (const [f, src] of [[p1, 'testsrc'], [p2, 'smptebars'], [p3, 'rgbtestsrc']]) execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `${src}=size=512x512`, '-frames:v', '1', f]);
const get = async (u: string) => { const r = await fetch(B + u); return { status: r.status, body: await r.json() as any }; };
const submit = async (tool: string, f: Record<string, string>, files: [string, string][] = []) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v); for (const [k, p] of files) fd.append(k, new Blob([fs.readFileSync(p)]), path.basename(p)); const r = await fetch(`${B}/api/tools/${tool}/jobs`, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() as any }; };
const done = async (id: string) => { for (let i = 0; i < 300; i++) { const j = (await get(`/api/jobs/${id}`)).body; if (['done', 'failed', 'blocked', 'canceled'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 100)); } throw new Error('timeout ' + id); };
const bytes = (u: string) => fs.readFileSync(path.join(D, u.replace(/^\/files\//, '')));
const recreate = async (id: string) => { const p = (await get(`/api/jobs/${id}/prefill?action=recreate&sameSeed=1`)).body; return { p, body: { ...p.form, ...p.submit } as Record<string, string> }; };
try {
  for (let i = 0; i < 90; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  // ---- Relight: image input reused ----
  let relight: any;
  { const r0 = await submit('app-relight', { prompt: 'warm sunset light' }, [['image', p1]]); assert.equal(r0.status, 200, JSON.stringify(r0.body)); relight = await done(r0.body.id); assert.equal(relight.status, 'done');
    const { p, body } = await recreate(relight.id); assert.deepEqual(p.submit, { fromJob: relight.id, reuseInputs: 'image' }); assert.deepEqual(Object.keys(p.files), ['image']); assert.ok(p.notes.some((n: string) => /No re-upload/.test(n)));
    const r1 = await submit('app-relight', body); assert.equal(r1.status, 200, JSON.stringify(r1.body)); const j1 = await done(r1.body.id); assert.equal(j1.status, 'done');
    const full = (await get(`/api/jobs/${j1.id}/prefill?action=recreate`)).body; void full;
    assert.equal(j1.parentId, relight.id); assert.equal(j1.input.prompt, relight.input.prompt); assert.equal(j1.input.seed, relight.input.seed);
    const a = (await get(`/api/jobs/${relight.id}/prefill?action=recreate`)).body.files.image[0], b = (await get(`/api/jobs/${j1.id}/prefill?action=recreate`)).body.files.image[0];
    assert.notEqual(a, b, 'copied under the new job id'); assert.match(b, new RegExp(`^/files/${j1.id}-imager0\\.png$`)); assert.ok(bytes(a).equals(bytes(b)), 'same image, no re-upload');
    console.log(`ok Relight recreate: submit ${JSON.stringify(p.submit)} → ${j1.id} (parentId ${j1.parentId}), image reused as ${b}`); }
  // ---- OpenSoul: refs reused ----
  { const r0 = await submit('soul', { prompt: 'portrait in a red coat', preset: 'none' }, [['refs', p1], ['refs', p2]]); assert.equal(r0.status, 200, JSON.stringify(r0.body)); const s0 = await done(r0.body.id); assert.equal(s0.status, 'done');
    const { p, body } = await recreate(s0.id); assert.deepEqual(p.submit, { fromJob: s0.id, reuseInputs: 'refs' }); assert.equal(p.files.refs.length, 2);
    const r1 = await submit('soul', body); assert.equal(r1.status, 200, JSON.stringify(r1.body)); const s1 = await done(r1.body.id); assert.equal(s1.status, 'done'); assert.equal(s1.parentId, s0.id);
    const b = (await get(`/api/jobs/${s1.id}/prefill?action=recreate`)).body.files.refs; assert.equal(b.length, 2);
    for (let k = 0; k < 2; k++) assert.ok(bytes(p.files.refs[k]).equals(bytes(b[k])), `ref ${k} same bytes, same order`);
    console.log(`ok OpenSoul recreate: submit ${JSON.stringify(p.submit)} → ${s1.id}, 2 refs reused in order`); }
  // ---- an upload in that field wins; errors ----
  { const r = await submit('app-relight', { prompt: 'x', fromJob: relight.id, reuseInputs: 'image' }, [['image', p3]]); assert.equal(r.status, 200); const j = await done(r.body.id);
    const u = (await get(`/api/jobs/${j.id}/prefill?action=recreate`)).body.files.image[0]; assert.ok(bytes(u).equals(fs.readFileSync(p3)), 'explicit upload wins');
    const e1 = await submit('app-relight', { prompt: 'x', fromJob: relight.id, reuseInputs: 'video' }); assert.equal(e1.status, 400); assert.equal(e1.body.issues[0].field, 'reuseInputs');
    const ci = await submit('create-image', { types: '["generate"]', provider: 'comfy-zimage-turbo', route: 'local:comfy-zimage-turbo', prompt: 'a mug' }); const cj = await done(ci.body.id);
    const e2 = await submit('app-relight', { prompt: 'x', fromJob: cj.id, reuseInputs: 'image' }); assert.equal(e2.status, 400); assert.equal(e2.body.code, 'nothing_to_reuse'); assert.equal(e2.body.refund.charged, false);
    const e3 = await submit('app-relight', { prompt: 'x', fromJob: 'nope', reuseInputs: 'image' }); assert.equal(e3.status, 400); assert.equal(e3.body.issues[0].field, 'fromJob');
    const all = await submit('app-relight', { prompt: 'x', fromJob: relight.id, reuseInputs: 'all' }); assert.equal(all.status, 200, JSON.stringify(all.body));
    console.log('ok upload in the field wins; 400 reuseInputs not a file input, 400 nothing_to_reuse (nothing charged), 400 unknown fromJob; reuseInputs=all'); }
  // ---- a blocked source job can be recreated without re-upload too; output hand-off unchanged ----
  { const r0 = await submit('app-relight', { prompt: 'x', simulate: 'nsfw' }, [['image', p2]]); const b0 = await done(r0.body.id); assert.equal(b0.status, 'blocked');
    const { p, body } = await recreate(b0.id); assert.deepEqual(p.submit, { fromJob: b0.id, reuseInputs: 'image' }); delete body.simulate;
    const r1 = await submit('app-relight', body); assert.equal(r1.status, 200, JSON.stringify(r1.body)); assert.equal((await done(r1.body.id)).status, 'done');
    const h = await submit('app-relight', { prompt: 'y', fromJob: relight.id }); assert.equal(h.status, 200, 'fromJob without reuseInputs = the output hand-off as before'); const hj = await done(h.body.id);
    const hu = (await get(`/api/jobs/${hj.id}/prefill?action=recreate`)).body.files.image[0]; assert.ok(bytes(hu).equals(bytes(relight.outputs[0].url)), 'output used as the input');
    console.log('ok recreate of a blocked job reuses its input; fromJob without reuseInputs still hands off the output'); }
  console.log('ALL OK');
} finally { try { process.kill(-srv.pid!, 'SIGTERM'); } catch { /* */ } fs.rmSync(D, { recursive: true, force: true }); fs.rmSync(T, { recursive: true, force: true }); }
