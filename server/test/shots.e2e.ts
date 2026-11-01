// Shots (app-shots, 2026-10-21): one photo → up to 9 camera angles of the same subject, one image per angle, each with its own prompt.
// Covers: listing (angle chips, open model first, the optional multiple-angles LoRA route), validation (missing photo, bad file type, unknown
// angle, nothing charged), quote = N × the one-image price (and perShot fields), mock submit to done with N labelled outputs (local and fal),
// the ComfyUI plan (one pass per angle, own prompt + seed; LoRA graph on comfy-qwen-angles), and the own-accounts spend log.
// Run: PATH=/opt/homebrew/bin:$PATH npx tsx test/shots.e2e.ts   (own mock server :9162, temp data dir, mock keys + a fake fal key, no network)
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'); const PORT = testPort(9162); const B = `http://localhost:${PORT}`; const D = fs.mkdtempSync(path.join(os.tmpdir(), 'shots-'));
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_BILLING_MODE: '' };
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PATH: `/opt/homebrew/bin:${process.env.PATH}`, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock',
  OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_ROUTING_LIVE: '', OPENHIGGSFIELD_FAL_KEY: 'fal-test-key-not-real' /* lets the fal route be chosen; the mock backend never calls fal */,
  OPENHIGGSFIELD_MOCK_DELAY_MS: '100', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_USE_LOCAL: '1', OPENHIGGSFIELD_HOSTED: '' }, stdio: 'ignore', detached: true });
const get = async (u: string) => { const r = await fetch(B + u); return Object.assign((await r.json()) as any, { _status: r.status }); };
const PHOTO = fs.readFileSync(path.join(ROOT, 'samples/sample-character.png'));
const job = async (f: Record<string, string>, img: [Buffer, string, string] | null = [PHOTO, 'photo.png', 'image/png']) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v);
  if (img) fd.append('image', new Blob([img[0]], { type: img[2] }), img[1]);
  const r = await fetch(`${B}/api/tools/app-shots/jobs`, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() as any }; };
const until = async (id: string) => { for (let i = 0; i < 300; i++) { const j = await get(`/api/jobs/${id}`); if (['done', 'failed', 'needs_decision', 'blocked', 'canceled'].includes(j.status)) return j; await new Promise((r) => setTimeout(r, 100)); } throw new Error('timeout'); };
const ok = (m: string) => console.log('ok ' + m);
const ALL = ['front', 'three-quarter-left', 'three-quarter-right', 'side', 'back', 'low', 'high', 'close-up', 'wide']; // the nine defaults
const EVERY = [...ALL, 'over-shoulder', 'full-body']; // 2026-11-01: two opt-in views
const FAL = 'fal:fal-ai/nano-banana-2/edit';
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }

  // ---- listing ----
  const t = (await get('/api/tools')).find((x: any) => x.id === 'app-shots'); assert.ok(t, 'app-shots listed');
  assert.equal(t.name, 'Camera Angles'); assert.equal(t.media, 'image'); assert.equal(t.route, '/tools/camera-angles'); // renamed from Shots (2026-10-22); id app-shots kept
  const shotsIn = t.inputs.find((i: any) => i.name === 'shots'); assert.equal(shotsIn.kind, 'list'); assert.deepEqual(shotsIn.options, EVERY); assert.equal(shotsIn.max, 11);
  assert.deepEqual(JSON.parse(shotsIn.default), ALL, 'default = the nine'); assert.ok(shotsIn.choices.every((c: any) => c.label && c.description && !('prompt' in c)), 'chips carry label + description, not the prompt');
  assert.equal(t.inputs.find((i: any) => i.name === 'image').label, 'Photo'); assert.equal(t.inputs.find((i: any) => i.name === 'image').required, true);
  assert.deepEqual(t.providers.map((p: any) => p.id), ['comfy-qwen-image', 'api-nano-banana', 'comfy-flux3-klein', 'api-gpt-image', 'api-seedream', 'api-flux2', 'api-luma-image', 'api-kling-image', 'comfy-qwen21', 'comfy-qwen21-turbo', 'comfy-klein4b', 'comfy-flux2dev', 'comfy-qwen-angles'], 'no-new-weights default first, every edit model whose route sends the image, LoRA route last (2026-10-22)');
  assert.equal(t.app.gallery.perOutput.max, 11);
  ok(`listing: ${shotsIn.options.length} angle chips, models ${t.providers.map((p: any) => p.id).join(' > ')}`);

  // ---- validation ----
  const noImg = await job({ rights: '1' }, null); assert.equal(noImg.status, 400); assert.equal(noImg.body.issues[0].field, 'image'); assert.equal(noImg.body.issues[0].code, 'required'); assert.equal(noImg.body.refund.charged, false);
  const badImg = await job({ rights: '1' }, [Buffer.from('nope'), 'photo.gif', 'image/gif']); assert.equal(badImg.status, 400); assert.equal(badImg.body.code, 'upload_format', badImg.body.error); assert.equal(badImg.body.issues[0].field, 'image'); // the upload gate (uploadSecurity.ts) refuses it before the tool sees it
  const badShot = await job({ rights: '1', shots: '["front","sideways"]' }); assert.equal(badShot.status, 400); assert.equal(badShot.body.issues[0].field, 'shots'); assert.ok(!/sideways/.test(badShot.body.error), 'never echoes the raw value');
  const empty = await job({ rights: '1', shots: '[]' }); assert.equal(empty.status, 400); assert.equal(empty.body.issues[0].code, 'required');
  ok(`validation: no photo → ${noImg.body.error} · bad type → ${badImg.body.error} · unknown angle → 400 · none picked → ${empty.body.error}`);

  // ---- quote = N × one image (fal Nano Banana 2 edit: $0.08 → ✦8 per image) ----
  const qp = (shots?: string[]) => `/api/tools/app-shots/price?provider=api-nano-banana&route=${encodeURIComponent(FAL)}&image=1${shots ? `&shots=${encodeURIComponent(JSON.stringify(shots))}` : ''}`;
  const one = await get(qp(['front'])); assert.equal(one.route, FAL); assert.equal(one.credits, 8); assert.equal(one.shotCount, 1);
  for (const n of [3, 5, 9]) { const q = await get(qp(ALL.slice(0, n))); assert.equal(q.credits, 8 * n, `${n} angles = ${n} × 8`); assert.equal(q.shotCount, n); assert.equal(q.perShotCredits, 8); assert.equal(q.cost.estUsd, 0.08 * n); }
  const all = await get(qp()); assert.equal(all.credits, 72, 'no angles sent = all nine'); assert.equal(all.shotCount, 9);
  const kq = await get(`/api/tools/app-shots/price?provider=comfy-flux3-klein&route=${encodeURIComponent('direct:bfl/flux-3-image-klein')}&image=1&shots=${encodeURIComponent(JSON.stringify(ALL.slice(0, 4)))}`); assert.equal(kq.credits, 4 * kq.perShotCredits); assert.equal(kq.shotCount, 4);
  const lq = await get('/api/tools/app-shots/price?provider=comfy-qwen-image&image=1'); assert.equal(lq.credits, 0); assert.equal(lq.route, 'local:comfy-qwen-image');
  ok(`quote: 1 → ✦${one.credits}, 9 → ✦${all.credits} ($${all.cost.estUsd}); FLUX 3 Klein 4 → ✦${kq.credits}; local Qwen free`);

  // ---- mock submit, local open default: N outputs labelled by angle, grid order, own prompts ----
  const pick = ['wide', 'front', 'close-up']; // sent out of order → grid order
  const r1 = await job({ rights: '1', provider: 'comfy-qwen-image', prompt: 'a woman in a yellow raincoat', shots: JSON.stringify(pick) }); assert.equal(r1.status, 200, JSON.stringify(r1.body));
  const j1 = await until(r1.body.id); assert.equal(j1.status, 'done', j1.error); assert.equal(j1.route, 'local:comfy-qwen-image');
  assert.deepEqual(j1.outputs.map((o: any) => o.label), ['Front', 'Close-up', 'Wide']); assert.equal(j1.input.n, 3); assert.deepEqual(j1.input.shots.map((s: any) => s.id), ['front', 'close-up', 'wide']);
  assert.ok(j1.input.shots.every((s: any) => /yellow raincoat/.test(s.prompt)), 'subject in every prompt'); assert.ok(/close-up/i.test(j1.input.shots[1].prompt));
  for (const o of j1.outputs) assert.ok(fs.statSync(path.join(D, path.basename(o.url))).size > 1000, `${o.label} written`);
  assert.deepEqual(JSON.parse(j1.input.appFields.shots), ['front', 'close-up', 'wide'], 'stored for Recreate');
  ok(`mock submit (local): ${j1.outputs.length} outputs ${j1.outputs.map((o: any) => o.label).join(', ')}`);

  // ---- fal route, all nine: 9 labelled samples, charged 9 × 8 ----
  const r2 = await job({ rights: '1', provider: 'api-nano-banana', route: FAL }); assert.equal(r2.status, 200, JSON.stringify(r2.body)); assert.equal(r2.body.cost, 72, 'submit charge = quote');
  const j2 = await until(r2.body.id); assert.equal(j2.status, 'done', j2.error); assert.equal(j2.route, FAL); assert.equal(j2.outputs.length, 9);
  assert.deepEqual(j2.outputs.map((o: any) => o.label), ['Front', '¾ left', '¾ right', 'Side', 'Back', 'Low angle', 'High angle', 'Close-up', 'Wide']);
  const zip = await fetch(`${B}/api/jobs/download.zip?ids=${j2.id}`); assert.equal(zip.status, 200); assert.ok((await zip.arrayBuffer()).byteLength > 9000, 'Download all (zip) has the nine images');
  ok(`mock submit (fal): 9 outputs, ✦${r2.body.cost}, zip ok`);

  // ---- ComfyUI plans: one pass per angle; the LoRA route loads the multiple-angles graph ----
  Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock' }); const P = await import('../src/comfy/plans.ts'); const IMG = path.join(ROOT, 'samples/sample-character.png');
  const plan: any = P.buildPlan({ id: 'sh-plan', toolId: 'app-shots', provider: 'comfy-qwen-image', input: { ...j1.input, baseTool: 'create-image', mode: 'edit', imagePath: IMG, refPaths: [IMG], seed: 100 } } as any);
  assert.equal(plan.passes.length, 3); assert.deepEqual(plan.passes.map((p: any) => p.label), ['Front', 'Close-up', 'Wide']); assert.deepEqual(plan.passes.map((p: any) => p.expect.seed), [100, 101, 102]);
  for (const [k, p] of plan.passes.entries()) { const ks = Object.values<any>(p.graph).find((n) => n.class_type === 'KSampler'); assert.equal(p.graph[ks.inputs.positive[0]].inputs.prompt, j1.input.shots[k].prompt.replace(/\bimage 1\b/g, "Picture 1")) /* the graph gets Qwen Edit's own reference word */; assert.equal(ks.inputs.seed, 100 + k); }
  assert.equal(plan.passes[0].workflow, 'create-image-qwen-edit2509-api.json');
  const lp: any = P.buildPlan({ id: 'sh-lora', toolId: 'app-shots', provider: 'comfy-qwen-angles', input: { ...j1.input, baseTool: 'create-image', mode: 'edit', imagePath: IMG, refPaths: [IMG], seed: 7 } } as any);
  assert.equal(lp.passes[0].workflow, 'shots-qwen-edit2509-angles-api.json'); assert.ok(Object.values<any>(lp.passes[0].graph).some((n) => n.class_type === 'LoraLoaderModelOnly' && n.inputs.lora_name === 'Qwen-Edit-2509-Multiple-angles.safetensors'));
  ok('comfy plans: one pass per angle (own prompt, seed + k); comfy-qwen-angles → shots-qwen-edit2509-angles-api.json with the LoRA');

  // ---- LoRA route runs in mock too (local) ----
  const r3 = await job({ rights: '1', provider: 'comfy-qwen-angles', shots: '["side","back"]' }); assert.equal(r3.status, 200, JSON.stringify(r3.body)); const j3 = await until(r3.body.id);
  assert.equal(j3.status, 'done', j3.error); assert.equal(j3.route, 'local:comfy-qwen-angles'); assert.deepEqual(j3.outputs.map((o: any) => o.label), ['Side', 'Back']);
  ok('LoRA route: mock run done with 2 outputs');

  // ---- own-accounts spend log ----
  const sp = await get('/api/spend?tool=app-shots'); const row = (id: string) => sp.items.find((x: any) => x.jobId === id); assert.equal(sp.billingMode, 'own-accounts');
  assert.equal(row(j1.id)?.billedTo, 'local'); assert.equal(row(j1.id)?.estUsd, 0); assert.equal(row(j2.id)?.billedTo, 'fal'); assert.equal(row(j2.id)?.estUsd, 0.72); assert.equal(row(j2.id)?.credits, 72); assert.equal(row(j2.id)?.status, 'done');
  ok(`spend log: local $0; fal 9 angles $${row(j2.id).estUsd}`);
  console.log('PASS shots');
} finally { try { process.kill(-srv.pid!, 'SIGTERM'); } catch { /* */ } }
