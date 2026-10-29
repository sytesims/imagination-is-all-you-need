// E2E (own mock server :8945, useLocal on, temp data dir): the new optional image fields on Product Shot (image = product photo),
// UGC Ad (image = product photo) and Transitions (lastFrame = end image). Fields only: they are listed with labels, accepted, stored and
// re-attached on recreate; Transitions switch to flf when lastFrame is uploaded (app.gallery.modeWhenFile); the other mode switches (edit / r2v) are a later batch.
// Run: npx tsx test/app-image-inputs.e2e.ts
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const PORT = testPort(8945); const B = `http://localhost:${PORT}`;
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'aii-')), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '150', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_USE_LOCAL: '1', COMFY_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '' }, stdio: 'ignore', detached: true });
const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
const PNG = fs.readFileSync(path.join(ROOT, 'samples/sample-product.png')); const PNG2 = fs.readFileSync(path.join(ROOT, 'samples/sample-keyframe.png'));
const job = async (tool: string, f: Record<string, string>, imgs: Record<string, Buffer> = {}) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v); for (const [k, b] of Object.entries(imgs)) fd.append(k, new Blob([b], { type: 'image/png' }), `${k}.png`);
  const r = await fetch(`${B}/api/tools/${tool}/jobs`, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() as any }; };
const until = async (id: string) => { for (let i = 0; i < 300; i++) { const j = await get(`/api/jobs/${id}`); if (['done', 'failed', 'needs_decision', 'blocked', 'canceled'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 100)); } throw new Error('timeout'); };
const ok = (m: string) => console.log('ok ' + m);
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  const tools = Object.fromEntries((await get('/api/tools')).map((t: any) => [t.id, t])); const inp = (t: string, n: string) => tools[t].inputs.find((i: any) => i.name === n);
  for (const [t, n, l] of [['app-product-shot', 'image', 'Product photo'], ['app-ugc-ad', 'image', 'Product photo (optional)'], ['app-transition', 'image', 'Start image'], ['app-transition', 'lastFrame', 'End image']]) {
    assert.equal(inp(t, n)?.label, l, `${t}.${n} label`); }
  assert.equal(inp('app-product-shot', 'image').required, false); assert.equal(inp('app-ugc-ad', 'image').required, false); assert.equal(inp('app-transition', 'lastFrame').required, true); // LOW-ROWS: Transitions = start + end pair
  ok('schemas: app-product-shot.image, app-ugc-ad.image, app-transition.lastFrame (optional, labelled)');

  const mode = (j: any) => j.input.mode ?? j.input.types?.[0];
  const p0 = await job('app-product-shot', { prompt: 'a ceramic mug' }); assert.equal(p0.status, 200, JSON.stringify(p0.body)); const d0 = await until(p0.body.id); assert.equal(d0.status, 'done');
  const p1 = await job('app-product-shot', { prompt: 'a ceramic mug', rights: '1' }, { image: PNG }); assert.equal(p1.status, 200, JSON.stringify(p1.body)); const d1 = await until(p1.body.id);
  assert.equal(d1.status, 'done'); assert.equal(mode(d0), 'generate'); assert.equal(mode(d1), 'edit', 'LOW-ROWS B23-1: a product photo switches to Edit image');
  const pf1 = await get(`/api/jobs/${d1.id}/prefill?action=recreate`); assert.equal(pf1.form.prompt, 'a ceramic mug');
  ok(`Product Shot: image accepted (mode ${mode(d1)}), prefill files ${JSON.stringify(pf1.files)}`);

  const u0 = await job('app-ugc-ad', { prompt: 'a reusable water bottle' }); assert.equal(u0.status, 200, JSON.stringify(u0.body)); const e0 = await until(u0.body.id);
  const u1 = await job('app-ugc-ad', { prompt: 'a reusable water bottle', rights: '1' }, { image: PNG }); assert.equal(u1.status, 200, JSON.stringify(u1.body)); const e1 = await until(u1.body.id);
  assert.equal(e1.status, 'done'); assert.equal(mode(e0), 't2v'); assert.equal(mode(e1), 'r2v', 'LOW-ROWS B27-1: a UGC Ad product photo makes it reference to video');
  const pfu = await get(`/api/jobs/${e1.id}/prefill?action=recreate`);
  ok(`UGC Ad: image accepted (mode ${mode(e1)}), prefill files ${JSON.stringify(pfu.files)}`);

  const t0 = await job('app-transition', { prompt: 'day to night', rights: '1' }, { image: PNG }); assert.equal(t0.status, 400, 'LOW-ROWS: end image required'); assert.equal(t0.body.issues?.[0]?.field, 'lastFrame');
  const t1 = await job('app-transition', { prompt: 'day to night', rights: '1' }, { image: PNG, lastFrame: PNG2 }); assert.equal(t1.status, 200, JSON.stringify(t1.body)); const f1 = await until(t1.body.id);
  assert.equal(f1.status, 'done'); assert.equal(mode(f1), 'flf', 'BUG-HUNT-3 S3: an uploaded lastFrame switches Transitions to Start + end frame');
  const pft = await get(`/api/jobs/${f1.id}/prefill?action=recreate`); assert.ok(pft.files.image?.length);
  ok(`Transitions: image + lastFrame accepted (mode ${mode(f1)}), prefill files ${JSON.stringify(pft.files)}`);
  console.log('PASS app-image-inputs');
} finally { try { process.kill(-srv.pid!, 'SIGTERM'); } catch { /* */ } }
