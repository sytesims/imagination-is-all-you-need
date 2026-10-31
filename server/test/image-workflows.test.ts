// Unified Create Image, step 1 (2026-10-22): the image workflow recipes (shared/workflows.ts) and GET /api/image-workflows.
// Covers: the registry parses against the live tools (boot validation finds nothing), a broken tool double is caught (unknown model, slot the
// tool doesn't take, control with no field, mode switch mismatch), the endpoint (shape, ETag / 304, cache header), and for EVERY recipe:
// quote parity: GET /api/tools/<runner>/price with the bar's params equals what POST /api/tools/<runner>/jobs charges (locks, modeWhenFile,
// perOutput), on the open default (local, free) and on a hosted model (fal Nano Banana 2 with a fake key, mock backend: nothing is called).
// Run: npx tsx test/image-workflows.test.ts   (own mock server :9171, temp data dir, no network)
import { testPort } from './_ports.js'; import assert from 'node:assert/strict'; import { spawn, spawnSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { validateImageWorkflows, imageWorkflowsPayload, WORKFLOW_IDS, needsLine } from '../src/shared/workflows.ts';
import { IMAGE_FEATURES, editTagOf } from '../src/shared/imageFeatures.ts';
const ROOT = path.resolve(import.meta.dirname, '..'); const PORT = testPort(9171); const B = `http://localhost:${PORT}`; const D = fs.mkdtempSync(path.join(os.tmpdir(), 'imgwf-'));
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_BILLING_MODE: '' };
const ok = (m: string) => console.log('ok ' + m);

// ---- 1. pure: the registry against a tool double ----
{
  const relightDouble = { id: 'app-relight', route: '/tools/app-relight', inputs: [{ name: 'image', kind: 'file', required: true }, { name: 'prompt', kind: 'text' }, ...['direction', 'lightX', 'lightY', 'lightQuality', 'brightness', 'color'].map((n) => ({ name: n, kind: 'select' }))],
    providers: ['api-nano-banana', 'no-such-model'], app: { gallery: { locked: { types: '["edit"]' }, required: ['image'], fields: [{ name: 'direction' }, { name: 'lightX' }, { name: 'lightY' }, { name: 'lightQuality' }, { name: 'brightness' }, { name: 'color' }, { name: 'extraKnob' }], modeWhenFile: { image: '["generate"]' } } } };
  const errs = validateImageWorkflows((id) => (id === 'app-relight' ? relightDouble : undefined) as any);
  const rl = errs.filter((e) => e.startsWith('relight:'));
  assert.ok(rl.some((e) => /no-such-model/.test(e)), 'unknown model id caught'); assert.ok(rl.some((e) => /extraKnob has no control/.test(e)), 'tool field without a control caught');
  assert.ok(rl.some((e) => /switches mode on image/.test(e)), 'modeWhenFile mismatch caught');
  assert.ok(errs.some((e) => /^face-swap: runner tool app-face-swap is not registered/.test(e)), 'missing runner caught');
  const fsDouble = { id: 'app-face-swap', inputs: [{ name: 'image', kind: 'file', required: true }, { name: 'face', kind: 'text' }], providers: ['api-nano-banana'], app: { gallery: { locked: { types: '["edit"]' }, required: ['image', 'face'], fields: [] } } };
  assert.ok(validateImageWorkflows((id) => (id === 'app-face-swap' ? fsDouble : undefined) as any).some((e) => /slot face → face is a text, not a file/.test(e)), 'slot that is not a file caught');
  assert.equal(needsLine([], null), 'Prompt'); assert.equal(editTagOf('api-nano-banana').label, 'Edits · up to 4 images'); assert.equal(editTagOf('api-recraft').label, 'Text only');
  assert.ok(WORKFLOW_IDS.every((id) => IMAGE_FEATURES.some((f) => f.id === id)), 'every recipe is an image feature');
  ok(`validator catches bad recipes (${rl.length} relight problems on the double)`);
}

const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, env: { ...process.env, ...NOKEYS, PORT: String(PORT), OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_KEYS: '1', OPENHIGGSFIELD_ROUTING_LIVE: '',
  OPENHIGGSFIELD_FAL_KEY: 'fal-test-key-not-real' /* a fal route needs a key to be chosen; the mock backend never calls fal */, OPENHIGGSFIELD_MOCK_DELAY_MS: '100', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_USE_LOCAL: '1', OPENHIGGSFIELD_HOSTED: '' }, stdio: ['ignore', 'ignore', 'pipe'], detached: true });
let stderr = ''; srv.stderr!.on('data', (b) => { stderr += String(b); });
const get = async (u: string, h: Record<string, string> = {}) => { const r = await fetch(B + u, { headers: h }); return { status: r.status, headers: r.headers, body: r.status === 304 ? null : await r.json() as any }; };
const IMG = fs.readFileSync(path.join(ROOT, 'samples/sample-keyframe.png')); const FACE = fs.readFileSync(path.join(ROOT, 'samples/sample-character.png'));
const PHOTO = ['remove-bg', 'expand', 'erase', 'try-on'];
const tmpPng = (name: string, vf: string, size: string) => { const f = path.join(D, name); const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `color=c=${vf}:s=${size}`, '-frames:v', '1', f]); assert.equal(r.status, 0, `ffmpeg ${name}`); return fs.readFileSync(f); };
/** a small painted dab (Brush Edit / Erase), a mask over the whole photo, a photo past 8192 px */
const MASK = (() => { const f = path.join(D, 'mask.png'); spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=1280x720', '-vf', 'drawbox=x=600:y=300:w=80:h=80:color=white:t=fill', '-frames:v', '1', f]); return fs.readFileSync(f); })();
const WHITE = tmpPng('white.png', 'white', '1280x720'); const HUGE = tmpPng('huge.png', 'gray', '9000x1000');
const submit = async (tool: string, f: Record<string, string>, files: Record<string, Buffer>) => { const fd = new FormData(); for (const [k, v] of Object.entries(f)) fd.append(k, v);
  for (const [k, b] of Object.entries(files)) fd.append(k, new Blob([b], { type: 'image/png' }), `${k}.png`);
  const r = await fetch(`${B}/api/tools/${tool}/jobs`, { method: 'POST', body: fd }); return { status: r.status, body: await r.json() as any }; };
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  assert.ok(!/\[image-workflows\]/.test(stderr), `boot validation is clean: ${stderr.match(/\[image-workflows\][\s\S]*/)?.[0]}`);

  // ---- 2. the endpoint ----
  const r = await get('/api/image-workflows'); assert.equal(r.status, 200); const W: any[] = r.body.workflows;
  assert.deepEqual(W.map((w) => w.id), WORKFLOW_IDS); assert.deepEqual(r.body.categories.map((c: any) => c.label), ['All', 'Edit', 'People', 'Product', 'Camera']);
  const etag = r.headers.get('etag')!; assert.ok(etag && /max-age=\d+/.test(r.headers.get('cache-control') ?? ''), 'ETag + max-age');
  assert.equal((await get('/api/image-workflows', { 'if-none-match': etag })).status, 304, 'If-None-Match → 304');
  const tools = Object.fromEntries(((await get('/api/tools')).body as any[]).map((t) => [t.id, t]));
  const local = imageWorkflowsPayload((id) => (tools[id] ? { ...tools[id], app: tools[id].app } : undefined) as any);
  for (const w of W) {
    assert.ok(tools[w.runner.toolId], `${w.id}: runner ${w.runner.toolId} listed`); assert.ok(w.name && w.tagline && w.needs && w.generateLabel, `${w.id}: copy`);
    assert.ok(w.aliases.toolId === w.runner.toolId && w.aliases.routes.includes(w.route), `${w.id}: aliases`);
    const listed = new Set(tools[w.runner.toolId].providers.map((p: any) => p.id)); for (const ps of Object.values<string[]>(w.models)) for (const p of ps) assert.ok(listed.has(p), `${w.id}: ${p} offered by the runner`);
    for (const s of w.slots) assert.ok(tools[w.runner.toolId].inputs.some((i: any) => i.name === s.sendsAs), `${w.id}: slot ${s.name}`);
    // offered + greyed (`unavailable`: can't run the recipe as locked, test/workflow-models.test.ts) = the listed tool's models for that mode, in its order
    const lm = local.workflows.find((x: any) => x.id === w.id)!.models;
    assert.deepEqual(Object.fromEntries(Object.entries<string[]>(lm).map(([m, ps]) => [m, ps.filter((p) => w.models[m]?.includes(p) || w.unavailable?.[m]?.some((u: any) => u.id === p))])), lm, `${w.id}: same models from the listed tool`);
    for (const [m, ps] of Object.entries<string[]>(w.models)) assert.deepEqual(ps, lm[m].filter((p) => ps.includes(p)), `${w.id} ${m}: offered models keep the tool's order`);
  }
  const rl = W.find((w) => w.id === 'relight'); assert.equal(rl.status, 'ready'); assert.equal(rl.generateLabel, 'Relight'); assert.deepEqual(rl.slots.map((s: any) => [s.name, s.required]), [['image', true]]);
  assert.deepEqual(rl.controls.find((c: any) => c.field === 'direction').options.map((o: any) => o.value), ['top', 'front', 'right', 'left', 'back', 'bottom'], 'direction grid includes rim (back)');
  assert.equal(rl.controls.find((c: any) => c.field === 'brightness').max, 100); assert.ok(rl.modelInfo['api-nano-banana'].workflow.line, 'model workflow credit');
  const fsw = W.find((w) => w.id === 'face-swap'); assert.equal(fsw.status, 'ready'); assert.deepEqual(fsw.slots.map((s: any) => [s.name, s.required, s.missing]), [['image', true, 'Add a target photo'], ['face', true, 'Add a face']]);
  assert.equal(fsw.generateLabel, 'Swap face');
  // step 3 (2026-10-22): Person Swap, Character Sheet, Product Shot and Upscale join the bar; step 4 (2026-10-23): Brush Edit, Camera Angles, Camera & Lens too
  assert.deepEqual(W.filter((w) => w.status === 'ready').map((w) => w.id).sort(), ['ad-pack', 'brush-edit', 'camera-angles', 'camera-lens', 'character-sheet', 'erase', 'expand', 'face-swap', 'image-layers', 'material-swap', 'person-swap', 'product-shot', 'relight', 'remove-bg', 'try-on', 'upscale']);
  assert.deepEqual(W.filter((w) => w.status !== 'ready').map((w) => w.id), [], 'nothing opens its own page any more');
  const be = W.find((w) => w.id === 'brush-edit'); assert.equal(be.surface, 'mask'); assert.equal(be.runner.toolId, 'app-inpaint'); assert.equal(be.generateLabel, 'Edit area');
  assert.equal(be.prompt.mode, 'required'); assert.equal(be.prompt.placeholder, 'Describe the change in the painted area'); assert.deepEqual(be.slots.map((s: any) => [s.name, s.required]), [['image', true]]);
  assert.deepEqual(be.models.inpaint, tools['app-inpaint'].providers.map((p: any) => p.id), 'Brush Edit lists only the mask models (the tool\'s own list)');
  assert.ok(be.models.inpaint.includes('fal-bria-genfill') && !be.models.inpaint.includes('api-nano-banana'), 'mask models only: Bria GenFill yes, Nano Banana 2 no');
  assert.ok(be.aliases.routes.includes('/tools/brush-edit') && be.aliases.routes.includes('/tools/app-inpaint'), 'old Brush Edit routes are aliases');
  const ca = W.find((w) => w.id === 'camera-angles'); assert.equal(ca.surface, 'multi-output'); assert.equal(ca.output.count, 'perOption');
  assert.deepEqual(ca.controls[0].options.map((o: any) => o.value), ['front', 'three-quarter-left', 'three-quarter-right', 'side', 'back', 'low', 'high', 'close-up', 'wide'], 'nine angle chips');
  assert.ok(ca.models.edit.includes('comfy-qwen-angles'), 'the local angles LoRA route stays offered');
  const cl = W.find((w) => w.id === 'camera-lens'); assert.equal(cl.surface, 'rig'); assert.equal(cl.runner.toolId, 'create-image'); assert.deepEqual(cl.slots, []);
  assert.deepEqual(cl.controls.map((c: any) => c.field), ['cameraBody', 'lens', 'focal', 'aperture', 'film', 'lighting', 'era']);
  assert.ok(cl.controls.every((c: any) => c.options?.length), 'every rig control lists its options'); assert.deepEqual(cl.controls.filter((c: any) => c.optional).map((c: any) => c.field), ['film', 'lighting', 'era']);
  assert.equal(cl.controls.find((c: any) => c.field === 'focal').default, '35'); assert.equal(cl.controls.find((c: any) => c.field === 'aperture').options[0].label, 'f/0.95');
  const ps = W.find((w) => w.id === 'person-swap'); assert.deepEqual(ps.slots.map((s: any) => [s.label, s.sendsAs, s.required]), [['Target', 'image', true], ['Person', 'person', true]]); assert.equal(ps.generateLabel, 'Swap person');
  const cs = W.find((w) => w.id === 'character-sheet'); assert.deepEqual(cs.slots.map((s: any) => [s.label, s.required]), [['Your photo', false]]); assert.equal(cs.generateLabel, 'Make sheet');
  assert.equal(cs.fixedNote, undefined); assert.deepEqual(cs.controls.map((c: any) => c.field), ['layout']); // 2026-10-25: the Layout chip replaced "3 panels · 4:3" assert.deepEqual(cs.prompt.requiredWithout, { slot: 'image', missing: 'Describe the character' }); assert.equal(cs.locked.aspect, '4:3');
  assert.ok(cs.models.edit.length && cs.models.generate.length, 'a photo switches to the edit models');
  assert.match(cs.modelInfo['api-nano-banana'].workflowByMode.edit.line, /Image Edit/, 'with a photo, the credit is the edit template');
  const pshot = W.find((w) => w.id === 'product-shot'); assert.equal(pshot.generateLabel, 'Make shot'); assert.deepEqual(pshot.groups.map((g: any) => g.id), ['scene', 'shape']);
  assert.deepEqual(pshot.controls.find((c: any) => c.field === 'scene').options.map((o: any) => o.value).slice(0, 2), ['studio-white', 'studio-colour']);
  assert.ok(pshot.modelInfo['api-nano-banana'].aspects.generate.includes('16:9'), 'aspects per model');
  const up = W.find((w) => w.id === 'upscale'); assert.equal(up.runner.toolId, 'image-upscale'); assert.equal(up.category, 'edit'); assert.equal(up.generateLabel, 'Upscale'); assert.equal(up.prompt.mode, 'hidden');
  assert.deepEqual(up.controls[0].options.map((o: any) => o.label), ['×2', '×4', '×8', '×16']); assert.equal(up.controls[0].default, '4');
  assert.deepEqual(up.models.upscale, tools['image-upscale'].providers.map((p: any) => p.id), 'the page\'s model order'); assert.equal(up.modelInfo['comfy-nomos2'].name, '4x Nomos2');
  // photo tools (2026-10-23): Remove Background, Expand, Erase Object, Virtual Try-On on fal-only models
  const rb = W.find((w) => w.id === 'remove-bg'); assert.deepEqual(rb.models.edit, ['fal-bria-rmbg', 'fal-ideogram-rmbg']); assert.equal(rb.prompt.mode, 'hidden'); assert.equal(rb.generateLabel, 'Cut out');
  assert.equal(rb.modelInfo['fal-bria-rmbg'].name, 'Bria RMBG 2.0'); assert.match(rb.modelInfo['fal-bria-rmbg'].workflow.line, /Official Comfy template · Bria: Remove Image Background/); assert.equal(rb.source.kind, 'official');
  assert.match(rb.modelInfo['fal-ideogram-rmbg'].workflow.line, /^Ours · fal-ai\/ideogram\/remove-background on fal/);
  const ex = W.find((w) => w.id === 'expand'); assert.deepEqual(ex.models.edit, ['fal-bria-expand', 'fal-ideogram-reframe']); assert.equal(ex.prompt.mode, 'optional');
  assert.deepEqual(ex.controls.map((c: any) => [c.field, c.default]), [['target', '1:1']]); assert.deepEqual(ex.controls[0].options.map((o: any) => o.value), ['1:1', '4:5', '5:4', '3:4', '4:3', '2:3', '3:2', '9:16', '16:9']);
  const er = W.find((w) => w.id === 'erase'); assert.equal(er.surface, 'mask'); assert.deepEqual(er.models.inpaint, ['fal-bria-eraser', 'fal-object-removal']); assert.equal(er.prompt.mode, 'hidden'); assert.equal(er.needs, '1 photo + mask');
  const to = W.find((w) => w.id === 'try-on'); assert.equal(to.category, 'people'); assert.deepEqual(to.slots.map((s: any) => [s.label, s.sendsAs, s.required, s.missing]), [['Person', 'image', true, 'Add a person'], ['Garment', 'garment', true, 'Add a garment']]);
  assert.deepEqual(to.controls.map((c: any) => [c.field, c.options.map((o: any) => o.value)]), [['category', ['auto', 'tops', 'bottoms', 'one-pieces']], ['garmentPhoto', ['auto', 'model', 'flat-lay']]]);
  assert.deepEqual(to.models.edit, ['fal-fashn-tryon', 'router-bria-tryon' /* Comfy Router, 2026-10-27 */]);
  assert.deepEqual(up.extras, ['upscale-examples']); assert.equal(r.body.categories.length, 5, 'tabs stay ≤ 5');
  ok(`GET /api/image-workflows: ${W.length} recipes (${W.map((w) => `${w.id}:${w.status}`).join(', ')}), ETag ${etag}, 304 on revalidate`);

  // ---- 3. per recipe: parse + quote = charge ----
  const SHOTS = '["front","side"]';
  const plan = (w: any, provider: string, withOptional: boolean) => {
    const files: Record<string, Buffer> = {}; const q: Record<string, string> = { provider };
    for (const s of w.slots) if (s.required || withOptional) { files[s.sendsAs] = s.name === 'face' || s.name === 'person' || s.name === 'garment' ? FACE : IMG; q[s.sendsAs] = '1'; }
    if (files.image) q.image = '1'; const nImg = Object.keys(files).length; if (nImg > 1) q.refs = String(nImg);
    const mode = Object.entries(w.modes.whenSlot ?? {}).find(([k]) => files[k])?.[1] as string | undefined ?? w.modes.default;
    const form: Record<string, string> = { provider, rights: '1', prompt: 'a test subject' };
    if (w.id === 'camera-angles') { q.shots = SHOTS; form.shots = SHOTS; }
    if (w.id === 'camera-lens') { Object.assign(form, { types: '["generate"]', cameraBody: 'full-frame-cine', lens: 'modern-prime', focal: '50', aperture: '2.8' }); q.types = 'generate'; }
    if (w.id === 'brush-edit' || w.id === 'erase') { files.mask = MASK; q.mask = '1'; }
    if (w.id === 'expand') { q.target = form.target = '9:16'; } // the 16:9 sample photo on a tall canvas
    if (w.id === 'try-on') { q.category = form.category = 'tops'; q.garmentPhoto = form.garmentPhoto = 'flat-lay'; }
    if (w.id === 'upscale') { q.scale = '4'; form.scale = '4'; delete form.prompt; q.width = String(IMG.readUInt32BE(16)); q.height = String(IMG.readUInt32BE(20)); } // the bar sends the photo's size (per-MP prices)
    else if (w.runner.toolId === 'create-image') q.mode = mode; else if (!w.modes.whenSlot) q.types = mode;
    if (w.id === 'product-shot') { q.scene = form.scene = 'marble'; q.aspect = form.aspect = '16:9'; }
    return { files, q, form, mode };
  };
  let n = 0;
  for (const w of W) for (const withOptional of w.slots.some((s: any) => !s.required) ? [false, true] : [false]) {
    const { mode } = plan(w, '', withOptional); const models: string[] = w.models[mode];
    for (const provider of PHOTO.includes(w.id) ? models /* every fal model of the photo tools */ : w.id === 'upscale' ? [models[0], 'comfy-nomos2', 'fal-topaz-wonder'] /* Comfy Router, Local, fal (mock: nothing is called) */ : [models[0], ...(models.includes('api-nano-banana') && models[0] !== 'api-nano-banana' ? ['api-nano-banana'] : [])]) {
      const { files, q, form } = plan(w, provider, withOptional);
      const quote = await get(`/api/tools/${w.runner.toolId}/price?${new URLSearchParams(q)}`); assert.equal(quote.status, 200, `${w.id} ${provider} quote: ${JSON.stringify(quote.body).slice(0, 300)}`);
      const s = await submit(w.runner.toolId, form, files); assert.equal(s.status, 200, `${w.id} ${provider} submit: ${JSON.stringify(s.body).slice(0, 300)}`);
      const credits = quote.body.credits ?? quote.body.listCredits;
      assert.equal(s.body.cost, credits, `${w.id} ${provider}${withOptional ? ' +photo' : ''}: quote ${credits} = charge ${s.body.cost} (route ${quote.body.route} / ${s.body.provider})`);
      const job = (await get(`/api/jobs/${s.body.id}`)).body; const jm = job.input?.mode ?? job.input?.types?.[0];
      if (w.id === 'upscale') assert.equal(job.input.scale, 4, 'upscale: ×4'); else if (w.runner.toolId !== 'create-image') assert.equal(jm, mode, `${w.id}: runs in ${mode}`);
      if (w.locked.aspect) assert.equal(job.input.aspect, w.locked.aspect, `${w.id}: locked aspect`);
      if (w.id === 'camera-angles') assert.equal(job.input.n, 2, 'perOutput: two angles');
      if (w.id === 'brush-edit') { assert.ok(job.input.maskUrl, 'the mask is sent'); assert.equal(jm, 'inpaint'); }
      if (PHOTO.includes(w.id)) assert.equal(quote.body.route, job.route ?? s.body.route, `${w.id}: the quoted fal route runs`);
      if (w.id === 'remove-bg') assert.equal(job.input.transparent, true, 'cut-outs are flagged transparent (checkerboard in the viewer)');
      if (w.id === 'expand') assert.deepEqual(job.input.expand.canvas, [1280, 2276], 'expand: 16:9 photo centred on a 9:16 canvas');
      if (w.id === 'try-on') { assert.equal(job.input.category, 'tops'); assert.equal(job.input.garmentPhoto, 'flat-lay'); assert.equal(job.input.refUrls?.length, 2, 'person + garment'); }
      n++; ok(`${w.id} · ${provider}${withOptional ? ' + optional photo' : ''}: mode ${jm}, quote ✦${credits} = charge ✦${s.body.cost}`);
    }
  }
  assert.ok(n >= 12, `${n} parity checks`);
  // Camera Angles: the per-image price × angles is the charge, for 1, 2 and 9 angles, on a hosted model and the local angles LoRA
  { const ca = W.find((w) => w.id === 'camera-angles');
    for (const provider of ['api-nano-banana', 'comfy-qwen-angles']) { let one: number | null = null;
      for (const ids of [['front'], ['front', 'side'], ca.controls[0].options.map((o: any) => o.value)]) { const shots = JSON.stringify(ids);
        const q = await get(`/api/tools/app-shots/price?${new URLSearchParams({ provider, image: '1', types: 'edit', shots })}`); assert.equal(q.status, 200);
        const s = await submit('app-shots', { provider, rights: '1', prompt: 'a long subject '.repeat(40), shots }, { image: IMG }); assert.equal(s.status, 200, JSON.stringify(s.body).slice(0, 200));
        const credits = q.body.credits ?? q.body.listCredits; assert.equal(s.body.cost, credits, `${provider} ${ids.length} angles: quote = charge`);
        assert.equal(q.body.shotCount ?? ids.length, ids.length); if (ids.length === 1) one = credits; else assert.equal(credits, (one ?? 0) * ids.length, `${provider}: ${ids.length} × the one-angle price`);
        const job = (await get(`/api/jobs/${s.body.id}`)).body; assert.equal(job.input.n, ids.length); }
      ok(`camera-angles · ${provider}: 1 / 2 / 9 angles, quote = charge = angles × ✦${one}`); }
    const none = await submit('app-shots', { provider: 'api-nano-banana', rights: '1', shots: '[]' }, { image: IMG }); assert.equal(none.status, 400, '0 angles is refused'); assert.equal(none.body.code ?? none.body.issues?.[0]?.code, 'required'); }
  // Brush Edit: no mask → refused before anything runs (the bar says "Paint the area first")
  { const r0 = await submit('app-inpaint', { provider: 'api-gpt-image', rights: '1', prompt: 'a red umbrella' }, { image: IMG }); assert.equal(r0.status, 400, 'no mask → 400'); ok('brush-edit: no mask is refused (400), nothing charged'); }
  // Photo tools: the blocks the bar shows are also the server's (400, nothing charged)
  { const bad = async (tool: string, f: Record<string, string>, fl: Record<string, Buffer>, code: string, re: RegExp) => { const r0 = await submit(tool, { rights: '1', ...f }, fl);
      assert.equal(r0.status, 400, `${tool} ${code}: ${JSON.stringify(r0.body).slice(0, 200)}`); assert.equal(r0.body.issues?.[0]?.code ?? r0.body.code, code); assert.match(r0.body.error, re); };
    await bad('app-expand', { provider: 'fal-bria-expand', target: '16:9' }, { image: IMG }, 'same_aspect', /already 16:9/);
    await bad('app-expand', { provider: 'fal-bria-expand', target: '21:9' }, { image: IMG }, 'invalid', /New shape: pick one of/);
    await bad('app-erase', { provider: 'fal-bria-eraser' }, { image: IMG }, 'required', /Add a mask: paint over what to erase/);
    await bad('app-erase', { provider: 'fal-object-removal' }, { image: IMG, mask: WHITE }, 'mask_too_large', /covers the whole photo/);
    await bad('app-try-on', { provider: 'fal-fashn-tryon' }, { image: FACE }, 'required', /Add a garment/);
    await bad('app-try-on', { provider: 'fal-fashn-tryon' }, { garment: FACE }, 'required', /Add a person/);
    await bad('app-try-on', { provider: 'fal-fashn-tryon', category: 'shoes' }, { image: FACE, garment: FACE }, 'invalid', /pick one of auto, tops, bottoms, one-pieces/);
    await bad('app-remove-bg', { provider: 'fal-bria-rmbg' }, { image: HUGE }, 'photo_too_large', /9000×1000; the most is 8192/);
    ok('photo tools: Expand same shape / unknown shape, Erase no mask / whole-photo mask, Try-On missing slot / unknown category, a photo past 8192 px are refused (400)'); }
  console.log('PASS image-workflows');
} finally { try { process.kill(-srv.pid!, 'SIGTERM'); } catch { /* */ } }
