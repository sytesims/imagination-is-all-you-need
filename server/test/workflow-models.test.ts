// Every workflow × every model it offers can really run (2026-10-23). GET /api/image-workflows lists, per mode, only the models whose quote
// passes with the recipe's locked settings (shared/workflows.ts splitWorkflowModels + workflowCompat.ts); the rest are `unavailable` with a reason.
// For EVERY ready workflow, mode and offered model, GET /api/tools/<runner>/price with the bar's params (workflowQuoteQueries: the photos that
// mode sends, control defaults, the mask) must answer 200 (quote = charge, so an offered model is never refused); every greyed model must
// answer 400 (the reason is honest). Pinned: Character Sheet + a photo greys FLUX 3 Klein and FLUX.2 klein 4B (their edits follow the photo).
// No keys: a key-needing model is still offered (setup is not incompatibility).
// Run: npx tsx test/workflow-models.test.ts   (own mock server :9193, temp data dir, no keys, no network)
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { workflowQuoteQueries, type WorkflowRecipe } from '../src/shared/workflows.ts';
const ROOT = path.resolve(import.meta.dirname, '..'); const PORT = testPort(9193); const B = `http://localhost:${PORT}`; const D = fs.mkdtempSync(path.join(os.tmpdir(), 'wfmodels-'));
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_BILLING_MODE: '' };
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'env'), OPENHIGGSFIELD_BACKEND: 'mock',
  OPENHIGGSFIELD_MOCK_KEYS: '', OPENHIGGSFIELD_ROUTING_LIVE: '', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_USE_LOCAL: '1', OPENHIGGSFIELD_HOSTED: '' }, stdio: ['ignore', 'ignore', 'pipe'], detached: true });
let stderr = ''; srv.stderr!.on('data', (b) => { stderr += String(b); });
const ok = (m: string) => console.log('ok ' + m);
type R = WorkflowRecipe & { modelInfo: Record<string, { name: string | null }> };
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  const wfs = ((await (await fetch(`${B}/api/image-workflows`)).json()) as { workflows: R[] }).workflows.filter((w) => w.status === 'ready');
  assert.ok(wfs.length >= 9, `ready workflows listed (${wfs.length})`);
  const price = async (tool: string, provider: string, q: Record<string, string>) => { const r = await fetch(`${B}/api/tools/${tool}/price?${new URLSearchParams({ ...q, provider })}`); return { status: r.status, body: await r.json() as any }; };
  const fails: string[] = []; let pairs = 0; let off = 0;
  for (const w of wfs) for (const [mode, ps] of Object.entries(w.models)) {
    assert.ok(ps.length > 0, `${w.id} ${mode}: at least one model can run it`);
    for (const p of ps) { pairs++; const rs = await Promise.all(workflowQuoteQueries(w, mode, p).map((q) => price(w.runner.toolId, p, q)));
      if (!rs.some((r) => r.status === 200)) fails.push(`${w.id} ${mode} ${p}: offered but the quote says ${rs[0].status} ${rs[0].body?.error}`); }
    for (const u of w.unavailable?.[mode] ?? []) { off++; assert.ok(!ps.includes(u.id), `${w.id} ${mode} ${u.id}: not both offered and greyed`); assert.ok(u.reason.length > 8, `${w.id} ${u.id}: has a reason`);
      const rs = await Promise.all(workflowQuoteQueries(w, mode, u.id).map((q) => price(w.runner.toolId, u.id, q)));
      if (rs.some((r) => r.status === 200)) fails.push(`${w.id} ${mode} ${u.id}: greyed ("${u.reason}") but the quote passes`); }
  }
  assert.deepEqual(fails, [], fails.join('\n'));
  ok(`${pairs} offered workflow × mode × model pairs all quote; ${off} greyed pairs all refused`);

  // Input prep (2026-10-23): the models whose edits follow the photo run Character Sheet once the bar fits the photo to 4:3 (offered, with the menu note)
  const cs = wfs.find((w) => w.id === 'character-sheet')! as R & { prep?: Record<string, Record<string, { fit: string; note: string }>> };
  const PREPPED = ['comfy-flux3-klein', 'comfy-klein4b', 'comfy-qwen-image', 'comfy-flux2dev'].filter((p) => cs.models.generate.includes(p) || cs.models.edit.includes(p) || cs.unavailable?.edit?.some((x) => x.id === p));
  assert.ok(PREPPED.includes('comfy-flux3-klein') && PREPPED.includes('comfy-klein4b'), `the follow-photo models are on Character Sheet (${PREPPED})`);
  for (const p of PREPPED) {
    assert.ok(cs.models.edit.includes(p), `${p} is offered with a photo (the bar fits it to 4:3 first)`); assert.ok(!cs.unavailable?.edit?.some((x) => x.id === p), `${p} no longer greyed`);
    assert.deepEqual(cs.prep?.edit?.[p], { fit: '4:3', note: 'Fits your photo to 4:3 first' }, `${p}: the menu says it fits the photo`); }
  assert.ok(!cs.prep?.generate, 'text-only sheets need no prep');
  const r0 = await price('app-character-sheet', 'comfy-flux3-klein', { image: '1' }); assert.equal(r0.status, 400, 'a photo of unknown / other shape is still refused (the bar must fit it)');
  const r1 = await price('app-character-sheet', 'comfy-flux3-klein', { image: '1', photoWidth: '1080', photoHeight: '1920' }); assert.equal(r1.status, 400, 'a 9:16 photo is refused');
  const r2 = await price('app-character-sheet', 'comfy-flux3-klein', { image: '1', photoWidth: '2560', photoHeight: '1920' }); assert.equal(r2.status, 200, `a fitted 4:3 photo quotes (${r2.body?.error})`);
  const r3 = await price('app-character-sheet', 'comfy-flux3-klein', { image: '1', photoAspect: '4:3' }); assert.equal(r3.status, 200, 'photoAspect=4:3 quotes');
  ok(`Character Sheet: ${PREPPED.length} follow-photo models offered with a photo once fitted to 4:3 (quote 400 → 200 with the fitted shape)`);
  // pre-flight endpoint: the same problems the bar lists, in order (inputs → model → setup → money)
  const pf = async (tool: string, q: Record<string, string>) => (await (await fetch(`${B}/api/tools/${tool}/preflight?${new URLSearchParams(q)}`)).json()) as any;
  { const a = await pf('app-character-sheet', { provider: 'comfy-flux3-klein', image: '1', photoWidth: '1080', photoHeight: '1920' });
    assert.equal(a.ok, false); assert.equal(a.problems[0].code, 'photo_shape', JSON.stringify(a.problems)); assert.equal(a.problems[0].fix.kind, 'fit-photo'); assert.deepEqual(a.problems[0].fix.args, { slot: 'image', aspect: '4:3' });
    assert.equal(a.problems[0].alt.kind, 'crop-photo'); assert.ok(!a.problems.some((x: any) => x.code === 'model_cant_run'), 'the shape is said once, as a photo fix');
    const b = await pf('app-character-sheet', { provider: 'comfy-flux3-klein', image: '1', photoWidth: '2560', photoHeight: '1920' }); assert.ok(!b.problems.some((x: any) => x.stage === 'inputs' || x.stage === 'model'), `fitted: no input/model problem (${JSON.stringify(b.problems)})`);
    const c = await pf('app-face-swap', { provider: 'comfy-qwen-image' }); assert.deepEqual(c.problems.filter((x: any) => x.stage === 'inputs').map((x: any) => x.code), ['photo_missing', 'photo_missing'], 'Face Swap: both photos');
    assert.deepEqual(c.problems.filter((x: any) => x.code === 'photo_missing').map((x: any) => x.fix.args.slot), ['image', 'face']);
    const d = await pf('app-inpaint', { image: '1', photoWidth: '900', photoHeight: '600' }); assert.deepEqual(d.problems.filter((x: any) => x.stage === 'inputs').map((x: any) => x.code), ['mask_missing', 'prompt_missing'], JSON.stringify(d.problems));
    const e = await pf('app-character-sheet', { provider: 'api-nano-banana' }); assert.deepEqual(e.problems.map((x: any) => x.code).filter((c: string) => c === 'prompt_missing'), ['prompt_missing'], 'no photo and no text: describe the character');
    const st = e.problems.map((x: any) => x.stage); assert.deepEqual(st, [...st].sort((x: string, y: string) => ['inputs', 'model', 'setup', 'money'].indexOf(x) - ['inputs', 'model', 'setup', 'money'].indexOf(y)), 'ordered by stage');
    assert.ok(typeof e.quote === 'object', 'the quote comes back unchanged'); }
  ok('GET /api/tools/:id/preflight: photo_shape with fit / crop, both Face Swap photos, mask + prompt, ordered');
  // the submit checks the uploaded photo's real shape: a 4:3 photo runs on FLUX 3 Klein (mock: nothing charged), a 9:16 one is snapped to the nearest shape and runs (run policy); imagePrep + imageOriginal are kept for the viewer
  { const { spawnSync } = await import('node:child_process'); const mk = (w: number, h: number) => { const f = path.join(D, `p${w}x${h}.png`); spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=0x808080:s=${w}x${h}`, '-frames:v', '1', f]); return new Blob([fs.readFileSync(f)], { type: 'image/png' }); };
    const sub = async (img: Blob, extra: Record<string, string | Blob> = {}) => { const fd = new FormData(); fd.append('image', img, 'photo.png'); fd.append('provider', 'comfy-flux3-klein'); fd.append('prompt', 'a knight'); for (const [k, v] of Object.entries(extra)) typeof v === 'string' ? fd.append(k, v) : fd.append(k, v, `${k}.png`);
      const r = await fetch(`${B}/api/tools/app-character-sheet/jobs`, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() as any }; };
    const tall = await sub(mk(270, 480)); assert.ok(tall.status < 300, `9:16 runs, snapped to the nearest shape (run policy, 2026-10-28) (${tall.status} ${JSON.stringify(tall.body).slice(0, 160)})`);
    const fit = await sub(mk(640, 480), { imagePrep: JSON.stringify({ kind: 'fit', aspect: '4:3' }), imageOriginal: mk(270, 480) }); assert.ok(fit.status < 300, `fitted 4:3 runs (${fit.status} ${JSON.stringify(fit.body).slice(0, 200)})`);
    const id = fit.body.id ?? fit.body.job?.id; const j = await (await fetch(`${B}/api/jobs/${id}`)).json() as any;
    assert.equal(j.input?.imagePrep?.kind, 'fit'); assert.equal(j.input?.imagePrep?.aspect, '4:3'); assert.match(String(j.input?.imagePrep?.originalUrl), /^\/files\//, 'the photo as picked is kept for the viewer'); }
  ok('submit: a fitted 4:3 photo runs Character Sheet on FLUX 3 Klein, a 9:16 one is refused; imagePrep recorded');
  // Product Shot: a photo also switches to edit, but its aspect follows the model, so the follow-photo models stay
  const ps = wfs.find((w) => w.id === 'product-shot')!; assert.ok(ps.models.edit.includes('comfy-flux3-klein'), 'Product Shot keeps FLUX 3 Klein with a photo (aspect fits the model)');
  // no keys on this server: hosted models are still offered (needs a key ≠ can't run it)
  assert.ok(cs.models.edit.includes('api-nano-banana'), 'a key-needing model is still offered');
  ok('optional-photo workflows: Product Shot keeps follow-photo models; key-needing models stay offered');
  assert.ok(!/\[image-workflows\]/.test(stderr), 'boot validation is clean');
  console.log('PASS workflow-models');
} finally { try { process.kill(-srv.pid!, 'SIGTERM'); } catch { /* */ } }
