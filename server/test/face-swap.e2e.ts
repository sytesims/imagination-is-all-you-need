// Face Swap (app-face-swap, 2026-10-21): image face swap on Create Image's edit mode. Target photo (`image`) + face (`face`), optional touch-ups.
// Covers: listing (labels, required slots, open model first, licences), validation (missing target / face, bad file type, nothing charged),
// the Qwen-Image-Edit-2509 two-image graph (plans.ts: multiref workflow, prompt on the positive encoder), mock submit to done (labelled
// sample with the face inset), and the spend log in own-accounts mode (local route free; fal Nano Banana 2 edit at its list price).
// Run: PATH=/opt/homebrew/bin:$PATH npx tsx test/face-swap.e2e.ts   (own mock server :9161, temp data dir, mock keys + a fake fal key, no network)
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const PORT = testPort(9161); const B = `http://localhost:${PORT}`; const D = fs.mkdtempSync(path.join(os.tmpdir(), 'faceswap-'));
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_BILLING_MODE: '' };
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PATH: `/opt/homebrew/bin:${process.env.PATH}`, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock',
  OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_ROUTING_LIVE: '', OPENHIGGSFIELD_FAL_KEY: 'fal-test-key-not-real' /* a fal route needs a key to be chosen; the mock backend never calls fal (no OPENHIGGSFIELD_ROUTING_LIVE) */, OPENHIGGSFIELD_MOCK_DELAY_MS: '100', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_USE_LOCAL: '1', OPENHIGGSFIELD_HOSTED: '' }, stdio: 'ignore', detached: true });
const get = async (u: string) => (await (await fetch(B + u)).json()) as any;
const TARGET = fs.readFileSync(path.join(ROOT, 'samples/sample-keyframe.png')); const FACE = fs.readFileSync(path.join(ROOT, 'samples/sample-character.png'));
const job = async (f: Record<string, string>, files: Record<string, [Buffer, string, string]> = {}) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v);
  for (const [k, [b, name, type]] of Object.entries(files)) fd.append(k, new Blob([b], { type }), name);
  const r = await fetch(`${B}/api/tools/app-face-swap/jobs`, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() as any }; };
const until = async (id: string) => { for (let i = 0; i < 300; i++) { const j = await get(`/api/jobs/${id}`); if (['done', 'failed', 'needs_decision', 'blocked', 'canceled'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 100)); } throw new Error('timeout'); };
const ok = (m: string) => console.log('ok ' + m);
const both = { image: [TARGET, 'target.png', 'image/png'] as [Buffer, string, string], face: [FACE, 'face.png', 'image/png'] as [Buffer, string, string] };
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }

  // ---- listing ----
  const t = (await get('/api/tools')).find((x: any) => x.id === 'app-face-swap'); assert.ok(t, 'app-face-swap listed');
  assert.equal(t.name, 'Face Swap'); assert.equal(t.media, 'image'); assert.equal(t.route, '/tools/app-face-swap');
  const inp = (n: string) => t.inputs.find((i: any) => i.name === n);
  assert.equal(inp('image')?.label, 'Target photo'); assert.equal(inp('image')?.required, true); assert.equal(inp('face')?.label, 'Face'); assert.equal(inp('face')?.required, true); assert.equal(inp('face')?.kind, 'file');
  assert.equal(inp('prompt')?.required, false, 'touch-ups are optional');
  assert.deepEqual(t.providers.map((p: any) => p.id), ['comfy-qwen-image', 'api-nano-banana', 'comfy-flux3-klein', 'api-gpt-image', 'api-seedream', 'api-flux2', 'api-luma-image', 'api-kling-image', 'comfy-qwen21']); // 2026-10-22: every model whose route takes 2+ images (hosted caps raised to the Router limits) assert.equal(t.preferredProvider ?? t.qualityOrder?.[0], 'comfy-qwen-image', 'open weights are the quality pick');
  assert.deepEqual(t.app.gallery.required, ['image', 'face']);
  const lic = await get('/api/licenses'); assert.ok(JSON.stringify(lic).includes('Qwen-Image-Edit-2509'), 'licences list the open default');
  ok(`listing: ${t.inputs.map((i: any) => i.name).join(', ')}; models ${t.providers.map((p: any) => p.id).join(' > ')}`);

  // ---- validation (400, nothing charged) ----
  const noFace = await job({ rights: '1' }, { image: both.image }); assert.equal(noFace.status, 400); assert.equal(noFace.body.issues[0].field, 'face'); assert.equal(noFace.body.issues[0].code, 'required'); assert.equal(noFace.body.refund.charged, false);
  const noTarget = await job({ rights: '1' }, { face: both.face }); assert.equal(noTarget.status, 400); assert.equal(noTarget.body.issues[0].field, 'image'); assert.equal(noTarget.body.issues[0].code, 'required');
  const badFace = await job({ rights: '1' }, { image: both.image, face: [Buffer.from('GIF89a not really'), 'face.gif', 'image/gif'] }); assert.equal(badFace.status, 400, JSON.stringify(badFace.body));
  assert.ok(/PNG or JPG/i.test(badFace.body.error), badFace.body.error);
  const badTarget = await job({ rights: '1' }, { image: [Buffer.from('not an image'), 'target.txt', 'text/plain'], face: both.face }); assert.equal(badTarget.status, 400, JSON.stringify(badTarget.body));
  ok(`validation: missing face → ${noFace.body.error} · missing target → ${noTarget.body.error} · bad type → ${badFace.body.error}`);

  // ---- mock submit on the open default (local Qwen edit 2509, Use local on): two images in order, labelled sample ----
  const r1 = await job({ rights: '1', provider: 'comfy-qwen-image', prompt: 'warmer skin tone' }, both); assert.equal(r1.status, 200, JSON.stringify(r1.body));
  const j1 = await until(r1.body.id); assert.equal(j1.status, 'done', j1.error); assert.equal(j1.route, 'local:comfy-qwen-image');
  assert.equal(j1.input.mode, 'edit'); assert.equal(j1.input.refUrls.length, 2, 'target + face'); assert.ok(/target/.test(j1.input.refUrls[0]) || j1.input.imageUrl === j1.input.refUrls[0], 'image 1 = target');
  assert.ok(/image 2/.test(j1.input.prompt) && /warmer skin tone/.test(j1.input.prompt), j1.input.prompt);
  assert.equal(j1.outputs.length, 1); assert.equal(j1.outputs[0].label, 'Face swap'); assert.ok(fs.statSync(path.join(D, path.basename(j1.outputs[0].url))).size > 1000, 'sample image written');
  ok(`mock submit (local): done, output "${j1.outputs[0].label}", prompt starts "${j1.input.prompt.slice(0, 60)}…"`);

  // ---- ComfyUI plan: the multi-image Qwen graph, prompt on the positive encoder, unused image 3 dropped ----
  Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock' }); const P = await import('../src/comfy/plans.ts'); const T = path.join(ROOT, 'samples/sample-keyframe.png'), FC = path.join(ROOT, 'samples/sample-character.png');
  const plan: any = P.buildPlan({ id: 'fs-plan', toolId: 'app-face-swap', provider: 'comfy-qwen-image', input: { ...j1.input, baseTool: 'create-image', mode: 'edit', imagePath: T, refPaths: [T, FC] } } as any);
  const g = plan.passes[0].graph; assert.equal(plan.passes[0].workflow, 'create-image-qwen-edit2509-multiref-api.json');
  const ks = Object.values<any>(g).find((n) => n.class_type === 'KSampler'); const pos = g[ks.inputs.positive[0]]; assert.ok(/Picture 2/.test(pos.inputs.prompt) && !/image 2/.test(pos.inputs.prompt), 'prompt on the positive encoder, in Qwen-Edit-2509\'s own words (Picture N, shared/promptRefs.ts)');
  assert.ok(pos.inputs.image2, 'face wired as image2'); assert.ok(!pos.inputs.image3 && !g['80'], 'unused image 3 dropped');
  ok('comfy plan: create-image-qwen-edit2509-multiref-api.json, prompt → positive encoder, image2 = face');

  // ---- own-accounts spend log: local = free; hosted Nano Banana 2 edit on fal (mock key) = $0.08 ----
  const q = await get('/api/tools/app-face-swap/price?provider=api-nano-banana&route=fal:fal-ai/nano-banana-2/edit&image=1&refs=2'); // pinned: with mock keys the Comfy partner node (tier 1) would win Auto; with real keys it is not wired assert.equal(q.route, 'fal:fal-ai/nano-banana-2/edit'); assert.equal(q.credits, 8); assert.equal(q.cost.billedTo, 'fal');
  const r2 = await job({ rights: '1', provider: 'api-nano-banana', route: 'fal:fal-ai/nano-banana-2/edit' }, both); assert.equal(r2.status, 200, JSON.stringify(r2.body)); assert.equal(r2.body.billingMode, 'own-accounts');
  const j2 = await until(r2.body.id); assert.equal(j2.status, 'done', j2.error); assert.equal(j2.route, 'fal:fal-ai/nano-banana-2/edit'); assert.equal(j2.outputs[0].label, 'Face swap');
  const sp = await get('/api/spend?tool=app-face-swap'); const row = (id: string) => sp.items.find((x: any) => x.jobId === id);
  assert.equal(sp.billingMode, 'own-accounts'); assert.equal(row(j1.id)?.billedTo, 'local'); assert.equal(row(j1.id)?.estUsd, 0);
  assert.equal(row(j2.id)?.billedTo, 'fal'); assert.equal(row(j2.id)?.estUsd, 0.08); assert.equal(row(j2.id)?.status, 'done');
  ok(`spend log: local $0, fal Nano Banana 2 edit $${row(j2.id).estUsd} (quote ✦${q.credits})`);
  console.log('PASS face-swap');
} finally { try { process.kill(-srv.pid!, 'SIGTERM'); } catch { /* */ } }
