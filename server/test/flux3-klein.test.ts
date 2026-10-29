// FLUX 3 [klein] wiring, 2026-10-27. In-process, mock backend, temp data + models dir (sparse files only), no network, no renders.
// Covers: credits name the DISTILLED official templates; the four klein graphs are valid against the object-info fixture (every node class
// known, every link points at a real node and output slot, required inputs present) and load the Mac-runnable int8_convrot upsampler;
// the download set (files, sizes, links, gated note); Mac classification (needs download, never "doesn't run on a Mac"); the upsampler
// option (on by default, off = raw prompt, branch and file dropped, so the job runs without the 9.75 GB file); the Layout to Render painter;
// layout boxes (the boxes API: empty = same prompt and graph; boxes → CreateBoundingBoxes + Flux3LayoutPrompt locally, box rows on FLUX 3 Image).
// Run: npx tsx test/flux3-klein.test.ts
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'flux3k-')); const MODELS = path.join(D, 'models');
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0',
  OPENHIGGSFIELD_COMFY_MODELS_DIR: MODELS, OPENHIGGSFIELD_ENFORCE_WEIGHTS: '1', OPENHIGGSFIELD_LOCAL_AVAILABLE: '1', OPENHIGGSFIELD_DISK_FREE_GB: '500' });
for (const k of ['COMFY_BASE_URL', 'OPENHIGGSFIELD_HW_MOCK']) delete process.env[k];
globalThis.fetch = (async (u: unknown) => { throw new Error(`network blocked in this test: ${String(u).slice(0, 80)}`); }) as typeof fetch;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ok = (m: string) => console.log('ok ' + m);

const { GRID_WORKFLOWS } = await import('../src/shared/workflowSources.ts');
const { buildPlan } = await import('../src/comfy/plans.ts');
const K = await import('../src/comfy/flux3Klein.ts');
const HW = await import('../src/hardware.ts'); const R = await import('../src/hardware/requirements.ts');
const { macBlockedFiles } = await import('../src/hardware/macWeights.ts');
const { getTool } = await import('../src/tools/registry.ts'); const { routesFor } = await import('../src/routing/routes.ts'); const { option, placeAction } = await import('../src/routing/select.ts');
const { weightsForWorkflows } = await import('../src/modelWeights.ts');
const { capsFor } = await import('../src/shared/imageCaps.ts');

const WFS = ['create-image-flux3klein-t2i-api.json', 'create-image-flux3klein-edit-api.json', 'create-image-flux3klein-inpaint-api.json', 'create-image-flux3klein-multiref-api.json'];
const UNET = 'flux3-image-klein-int8-convrot.safetensors', TE = 'qwen3vl_4b_int8_convrot.safetensors', UP = 'qwen3.5_9b_flux3_prompt_upsampler_int8_convrot.safetensors', VAE = 'flux2-vae.safetensors';
const SIZES: Record<string, number> = { [UNET]: 5827874779, [TE]: 4858559240, [UP]: 9748113996 };
const OI = JSON.parse(fs.readFileSync(path.join(ROOT, 'readiness/stub/object_info.json'), 'utf8')) as Record<string, any>;
const isLink = (v: unknown): v is [string, number] => Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && Number.isInteger(v[1]);
/** A graph is valid when every node class is in the object-info fixture, every link points at a node and an output slot it has, and every required input is set. */
export function checkGraph(g: Record<string, any>, label: string) {
  for (const [id, n] of Object.entries<any>(g)) {
    const spec = OI[n.class_type]; assert.ok(spec, `${label}: ${id} ${n.class_type} is a known node`);
    for (const [k, v] of Object.entries<any>(n.inputs)) if (isLink(v)) { const src = g[v[0]]; assert.ok(src, `${label}: ${id}.${k} → missing node ${v[0]}`);
      assert.ok(v[1] < (OI[src.class_type].output?.length ?? 0), `${label}: ${id}.${k} → ${v[0]}:${v[1]} is a real output of ${src.class_type}`); }
    for (const k of Object.keys(spec.input?.required ?? {})) { const t = spec.input.required[k][0];
      if (t === 'COMFY_AUTOGROW_V3' || t === 'COMFY_DYNAMICCOMBO_V3') continue; // group inputs (images.image0, sampling_mode.*)
      assert.ok(k in n.inputs, `${label}: ${id} ${n.class_type} has required input ${k}`); }
  }
}

try {
  // ---- 1. credits: distilled templates, never the base ones ----
  {
    const cells = Object.entries(GRID_WORKFLOWS).flatMap(([f, m]) => (m['flux-3-klein'] ? [[f, m['flux-3-klein']] as const] : []));
    assert.ok(cells.length >= 2, 'klein is credited in the grid');
    for (const [f, w] of cells) { if (w.source !== 'official') continue;
      assert.match(String(w.url), /image_flux3_klein_distilled_(t2i|image_edit)\.json$/, `${f}: credits a distilled template`); assert.match(w.name, /Distilled/, `${f}: name says Distilled`); }
    assert.match(String(GRID_WORKFLOWS['create-image']['flux-3-klein'].url), /image_flux3_klein_distilled_t2i\.json$/);
    assert.match(String(GRID_WORKFLOWS['edit-image']['flux-3-klein'].url), /image_flux3_klein_distilled_image_edit\.json$/);
    ok('credits: image_flux3_klein_distilled_t2i / _distilled_image_edit');
  }

  // ---- 2. graphs: valid against the object-info fixture, Mac-runnable files only ----
  for (const w of WFS) {
    const g = JSON.parse(fs.readFileSync(path.join(ROOT, 'workflows', w), 'utf8')); checkGraph(g, w);
    const files = Object.values<any>(g).flatMap((n) => Object.values<any>(n.inputs).filter((v) => typeof v === 'string' && /\.safetensors$/.test(v)));
    assert.deepEqual([...new Set(files)].sort(), [UNET, TE, UP, VAE].sort(), `${w}: loads exactly the four klein files`);
    assert.deepEqual(macBlockedFiles(files), [], `${w}: no file a Mac can't load`); assert.ok(!files.some((f) => /w4a8/.test(f)), `${w}: no w4a8 upsampler`);
  }
  ok('graphs: 4 klein graphs valid (classes, links, required inputs); int8_convrot upsampler, nothing Mac-blocked');

  // ---- 3. download set: what "needs download" shows ----
  {
    const ws = weightsForWorkflows(WFS); const by = Object.fromEntries(ws.map((x) => [x.file, x]));
    assert.deepEqual(Object.keys(by).sort(), [UNET, TE, UP, VAE].sort());
    for (const f of [UNET, TE, UP]) { assert.equal(by[f].sizeBytes, SIZES[f], `${f} size`); assert.equal(by[f].folder, f === UNET ? 'diffusion_models' : 'text_encoders');
      assert.equal(by[f].url, `https://huggingface.co/black-forest-labs/flux-3-image-klein-comfy/resolve/main/${f === UNET ? 'diffusion_models' : 'text_encoders'}/${f}`); assert.equal(by[f].pageUrl, 'https://huggingface.co/black-forest-labs/flux-3-image-klein-comfy'); }
    const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'readiness/manifest/models.json'), 'utf8'));
    for (const f of [UNET, TE, UP]) { const row = man.models.find((m: any) => m.file === f); assert.match(String(row.head_status), /gated/); assert.match(String(row.note ?? ''), /Gated|gated/, `${f}: gated note`); }
    assert.ok(!man.models.some((m: any) => /flux3_prompt_upsampler_w4a8/.test(m.file)), 'w4a8 upsampler gone from the manifest');
    for (const w of WFS) assert.equal(man.workflows[`workflows/${w}`].mps, 'amber', `${w}: amber on a Mac (int8 ConvRot, slow), not red`);
    const total = SIZES[UNET] + SIZES[TE] + SIZES[UP]; assert.ok(total > 20e9 && total < 21e9, '≈ 20.4 GB to download (the VAE is shared with FLUX.2)');
  }
  ok('download set: 3 gated BFL files, 20.43 GB (+ the shared 0.34 GB VAE)');

  // ---- 4. Mac: needs download, not "too heavy" ----
  fs.mkdirSync(path.join(MODELS, 'vae'), { recursive: true }); fs.writeFileSync(path.join(MODELS, 'vae', VAE), ''); fs.truncateSync(path.join(MODELS, 'vae', VAE), 336213556); // sparse: the VAE FLUX.2 already put there
  const t = getTool('create-image')!;
  for (const prof of ['mac36', 'mac64']) {
    HW.setHardwareOverride(prof); R.clearRequirementsCache();
    for (const input of [{ mode: 'generate', types: ['generate'] }, { mode: 'edit', types: ['edit'] }]) {
      const q = R.requirementsFor(t, K.FLUX3_KLEIN_PROVIDER, input)!; assert.deepEqual(q.macBlockedFiles, [], `${prof}: nothing Mac-blocked`); assert.notEqual(q.mps, 'red');
      const f = R.fitFor(t, K.FLUX3_KLEIN_PROVIDER, input); assert.notEqual(f.verdict, 'too_heavy', `${prof} ${input.mode}: not too heavy (${f.verdict}/${f.reasonCode})`); assert.notEqual(f.reasonCode, 'unsupported_weights');
      assert.deepEqual(q.missingFiles!.map((x) => x.file).sort(), [UNET, TE, UP].sort(), `${prof}: missing = the three BFL files`);
      const gate = R.weightsGate(t, K.FLUX3_KLEIN_PROVIDER, input)!; assert.equal(gate.code, 'weights_missing'); assert.equal(gate.missingBytes, SIZES[UNET] + SIZES[TE] + SIZES[UP]); assert.ok(gate.downloadable);
      const loc = routesFor(K.FLUX3_KLEIN_PROVIDER, t).find((r) => r.kind === 'local')!; const o = option(t, loc, input);
      assert.equal(o.available, true, `${prof}: the local route is offered (${o.reason})`); const a = placeAction(t, K.FLUX3_KLEIN_PROVIDER, input, o)!;
      assert.equal(a?.action, 'download', `${prof}: its one action is Download`); assert.match(a.actionText, /^Download 20\.4 GB$/);
    }
  }
  ok('mac36 / mac64: local klein = weights_missing (Download 20.4 GB), never too_heavy / unsupported_weights');

  // ---- 5. upsampler option: on by default; off = raw prompt, no TextGenerate, no upsampler file needed ----
  {
    assert.deepEqual(capsFor(K.FLUX3_KLEIN_PROVIDER)?.extras && { r: capsFor(K.FLUX3_KLEIN_PROVIDER)!.extras!.promptRewrite, d: capsFor(K.FLUX3_KLEIN_PROVIDER)!.extras!.promptRewriteDefault }, { r: true, d: true }, 'the shared "rewrite my prompt" option, on by default');
    const job = (input: Record<string, any>) => buildPlan({ id: 't', toolId: 'create-image', provider: K.FLUX3_KLEIN_PROVIDER, input: { seed: 1, prompt: 'a red fox', ...input } } as any).passes[0];
    const cases: [string, Record<string, any>][] = [['generate', {}], ['edit', { mode: 'edit', imagePath: '/tmp/a.png' }], ['inpaint', { mode: 'inpaint', imagePath: '/tmp/a.png', maskPath: '/tmp/m.png' }], ['multiref', { mode: 'edit', imagePath: '/tmp/a.png', refPaths: ['/tmp/a.png', '/tmp/b.png'] }]];
    for (const [name, inp] of cases) {
      const on = job(inp); const off = job({ ...inp, promptRewrite: false }); const off0 = job({ ...inp, promptRewrite: '0' });
      const gOn = on.graph as Record<string, any>; const gOff = off.graph as Record<string, any>; checkGraph(gOn, `${name} on`); checkGraph(gOff, `${name} off`);
      const cls = (g: Record<string, any>) => Object.values<any>(g).map((n) => n.class_type);
      assert.ok(cls(gOn).includes('TextGenerate'), `${name}: upsampler on by default`); assert.equal(on.expect.upsampler, true);
      assert.ok(!cls(gOff).includes('TextGenerate'), `${name} off: no TextGenerate`); assert.equal(off.expect.upsampler, false);
      assert.ok(!JSON.stringify(gOff).includes(UP), `${name} off: the upsampler file isn't loaded`); assert.deepEqual(off0.graph, off.graph, `${name}: promptRewrite '0' = false`);
      const sw = Object.values<any>(gOff).find((n) => n.class_type === 'ComfySwitchNode'); const taken = sw.inputs[sw.inputs.switch ? 'on_true' : 'on_false'];
      assert.ok(isLink(taken) && gOff[taken[0]].class_type === 'PrimitiveStringMultiline' && gOff[taken[0]].inputs.value === 'a red fox', `${name} off: the switch passes the raw prompt`);
      assert.equal(on.workflow, off.workflow);
    }
    HW.setHardwareOverride('mac64'); R.clearRequirementsCache();
    const qOff = R.requirementsFor(t, K.FLUX3_KLEIN_PROVIDER, { mode: 'generate', types: ['generate'], promptRewrite: false })!;
    assert.deepEqual(qOff.missingFiles!.map((x) => x.file).sort(), [UNET, TE].sort(), 'off: the upsampler is not a needed file');
    // the user opts out and has the model + encoder but not the upsampler: the job runs (no weights gate)
    for (const [dir, f] of [['diffusion_models', UNET], ['text_encoders', TE]]) { fs.mkdirSync(path.join(MODELS, dir), { recursive: true }); fs.writeFileSync(path.join(MODELS, dir, f), ''); fs.truncateSync(path.join(MODELS, dir, f), SIZES[f]); }
    R.clearRequirementsCache();
    assert.equal(R.weightsGate(t, K.FLUX3_KLEIN_PROVIDER, { mode: 'generate', types: ['generate'], promptRewrite: false }), null, 'off + upsampler missing: runs');
    assert.equal(R.weightsGate(t, K.FLUX3_KLEIN_PROVIDER, { mode: 'generate', types: ['generate'], promptRewrite: '0' }), null, "off ('0') + upsampler missing: runs");
    const gOn = R.weightsGate(t, K.FLUX3_KLEIN_PROVIDER, { mode: 'generate', types: ['generate'] })!; assert.equal(gOn.code, 'weights_missing'); assert.deepEqual(gOn.missingFiles.map((x) => x.file), [UP], 'on: only the upsampler is missing');
    const loc = routesFor(K.FLUX3_KLEIN_PROVIDER, t).find((r) => r.kind === 'local')!; const offIn = { mode: 'generate', types: ['generate'], promptRewrite: false };
    assert.equal(placeAction(t, K.FLUX3_KLEIN_PROVIDER, offIn, option(t, loc, offIn)), null, 'off: nothing to set up, the local route runs');
    assert.equal(placeAction(t, K.FLUX3_KLEIN_PROVIDER, { mode: 'generate', types: ['generate'] }, option(t, loc, { mode: 'generate', types: ['generate'] }))?.actionText, 'Download 9.7 GB', 'on: Download the upsampler only');
  }
  ok('upsampler: on by default; promptRewrite off/0 → raw prompt, TextGenerate + upsampler file cut; runs without the 9.75 GB file');

  // ---- 6. Layout to Render: FLUX 3 Klein paints the first frame when it can run here ----
  {
    const S = await import('../src/shared/makeItReal.ts'); const { MODELS: MODEL_DEFS, engineModelKey } = await import('../src/shared/modelIds.ts'); const { flux3PainterReady } = await import('../src/routesMakeItReal.ts');
    for (const p of Object.values(S.FIRST_FRAME_PAINTERS)) assert.equal(p.name, MODEL_DEFS[engineModelKey(p.tool, p.provider)].name, `${p.provider}: the real model name`);
    assert.equal(S.firstFramePainter({}).provider, 'comfy-klein4b'); assert.equal(S.firstFramePainter({ flux3Ready: true }).provider, 'comfy-flux3-klein'); assert.equal(S.firstFramePainter({ who: true }).provider, 'comfy-flux3-klein');
    HW.setHardwareOverride('mac64'); R.clearRequirementsCache();
    assert.equal(flux3PainterReady(), false, 'the upsampler is still missing: FLUX.2 [klein] 4B paints');
    fs.writeFileSync(path.join(MODELS, 'text_encoders', UP), ''); fs.truncateSync(path.join(MODELS, 'text_encoders', UP), SIZES[UP]); R.clearRequirementsCache();
    assert.equal(flux3PainterReady(), true, 'all four files on disk: FLUX 3 Klein paints');
    fs.truncateSync(path.join(MODELS, 'text_encoders', UP), 1000); R.clearRequirementsCache(); assert.equal(flux3PainterReady(), false, 'a file still downloading: not ready');
    HW.setHardwareOverride('cpu'); R.clearRequirementsCache(); fs.truncateSync(path.join(MODELS, 'text_encoders', UP), SIZES[UP]);
    assert.equal(flux3PainterReady(), false, 'too heavy here (no GPU): not ready');
    const saved = process.env.OPENHIGGSFIELD_COMFY_MODELS_DIR; delete process.env.OPENHIGGSFIELD_COMFY_MODELS_DIR; HW.setHardwareOverride('mac64'); R.clearRequirementsCache();
    assert.equal(flux3PainterReady(), false, 'files unknown (no models folder): not ready'); process.env.OPENHIGGSFIELD_COMFY_MODELS_DIR = saved;
  }
  ok('painter: FLUX 3 Klein when its local files are all here and it fits; else FLUX.2 [klein] 4B; names = MODELS');

  // ---- 7. layout boxes ----
  {
    const LB = await import('../src/shared/layoutBoxes.ts'); const { ROUTER_MODELS } = await import('../src/routing/routerModels.ts');
    // parsing
    for (const v of [undefined, '', '[]', []]) assert.deepEqual(LB.parseLayoutBoxes(v), { ok: true, boxes: [] }, `empty: ${JSON.stringify(v)}`);
    const B = [{ label: 'a red kite', box: [50, 600, 300, 900] }, { label: '  a  dog ', box: [600.4, 100, 950, 400] }];
    assert.deepEqual(LB.parseLayoutBoxes(JSON.stringify(B)), { ok: true, boxes: [{ label: 'a red kite', box: [50, 600, 300, 900] }, { label: 'a dog', box: [600, 100, 950, 400] }] });
    for (const bad of ['{', '{}', JSON.stringify([{ box: [0, 0, 10, 10] }]), JSON.stringify([{ label: 'x', box: [0, 0, 10] }]), JSON.stringify([{ label: 'x', box: [0, 0, 1001, 10] }]), JSON.stringify([{ label: 'x', box: [500, 0, 400, 10] }]),
      JSON.stringify([{ label: 'x', box: [0, 10, 10, 10] }]), JSON.stringify([{ label: 'x'.repeat(301), box: [0, 0, 10, 10] }]), JSON.stringify(Array.from({ length: 21 }, () => ({ label: 'x', box: [0, 0, 10, 10] })))])
      assert.equal(LB.parseLayoutBoxes(bad).ok, false, `refused: ${bad.slice(0, 40)}`);
    const boxes = (LB.parseLayoutBoxes(B) as any).boxes;
    // local graphs: empty = the box nodes are bypassed and pruned (same graph as before); boxes = CreateBoundingBoxes → Flux3LayoutPrompt on the prompt path
    const plan = (input: Record<string, any>) => buildPlan({ id: 't', toolId: 'create-image', provider: K.FLUX3_KLEIN_PROVIDER, input: { seed: 1, prompt: 'a beach <obj_1> <obj_2>', ...input } } as any).passes[0];
    const BOX_CLS = /^(CreateBoundingBoxes|Flux3LayoutPrompt)$/;
    const cases: [string, Record<string, any>, string][] = [['generate', {}, '18:17'], ['edit', { mode: 'edit', imagePath: '/tmp/a.png' }, '60'], ['inpaint', { mode: 'inpaint', imagePath: '/tmp/a.png', maskPath: '/tmp/m.png' }, '60'], ['multiref', { mode: 'edit', imagePath: '/tmp/a.png', refPaths: ['/tmp/a.png', '/tmp/b.png'] }, '60']];
    for (const [name, inp, promptNode] of cases) for (const rw of [{}, { promptRewrite: false }]) {
      const none = plan({ ...inp, ...rw }); const empty = plan({ ...inp, ...rw, layoutBoxes: [] }); const g0 = none.graph as Record<string, any>;
      assert.deepEqual(empty.graph, none.graph, `${name}: an empty list = no list`); assert.deepEqual(empty.expect, none.expect);
      assert.ok(!Object.values<any>(g0).some((n) => BOX_CLS.test(n.class_type)), `${name}: no boxes → no box nodes`); assert.equal(none.expect.layoutBoxes, undefined); checkGraph(g0, `${name} no boxes`);
      const consumers = Object.values<any>(g0).flatMap((n) => Object.values<any>(n.inputs).filter((v) => isLink(v) && v[0] === promptNode)); assert.ok(consumers.length >= 1, `${name}: the prompt feeds the model directly`);
      // the file's graph minus the two box nodes, pruned the same way, has the same node classes
      const file = JSON.parse(fs.readFileSync(path.join(ROOT, 'workflows', none.workflow), 'utf8')); const cls = (g: Record<string, any>) => Object.values<any>(g).map((n) => n.class_type).filter((c) => !BOX_CLS.test(c));
      assert.ok(cls(g0).every((c) => cls(file).includes(c)), `${name}: nothing new besides the boxes`);
      const withB = plan({ ...inp, ...rw, layoutBoxes: boxes }); const g = withB.graph as Record<string, any>; checkGraph(g, `${name} boxes`);
      const cbb = Object.entries<any>(g).find(([, n]) => n.class_type === 'CreateBoundingBoxes')!; const lp = Object.entries<any>(g).find(([, n]) => n.class_type === 'Flux3LayoutPrompt')!;
      assert.deepEqual(JSON.parse(cbb[1].inputs.bboxes), [{ type: 'obj', bbox: [50, 600, 300, 900], desc: 'a red kite' }, { type: 'obj', bbox: [600, 100, 950, 400], desc: 'a dog' }], `${name}: BFL elements, in order`);
      assert.deepEqual(cbb[1].inputs.editor_state, { __value__: [] }, `${name}: the list widget wrapped for the API`);
      assert.deepEqual(lp[1].inputs.prompt, [promptNode, 0]); assert.deepEqual(lp[1].inputs.element, [cbb[0], 2]);
      assert.ok(Object.values<any>(g).some((n) => Object.values<any>(n.inputs).some((v) => isLink(v) && v[0] === lp[0])), `${name}: the layout prompt feeds the model`);
      assert.equal(withB.expect.layoutBoxes, 2); assert.equal(g[promptNode].inputs.value, 'a beach <obj_1> <obj_2>', `${name}: the prompt text itself is unchanged`);
    }
    // the boxes API on Create Image
    const t = getTool('create-image')!; const parse = (f: Record<string, string>) => t.parseInput({ types: '["generate"]', prompt: 'a beach', ...f } as any, {} as any) as Promise<any>;
    const a = await parse({ provider: K.FLUX3_KLEIN_PROVIDER }); const b = await parse({ provider: K.FLUX3_KLEIN_PROVIDER, boxes: '[]' });
    assert.ok(!a.error && !b.error, `${a.error ?? b.error}`); assert.equal(a.layoutBoxes, undefined); assert.equal(b.layoutBoxes, undefined); assert.equal(b.finalPrompt, a.finalPrompt);
    const c = await parse({ provider: K.FLUX3_KLEIN_PROVIDER, boxes: JSON.stringify(B) }); assert.deepEqual(c.layoutBoxes, boxes); assert.equal(c.finalPrompt, a.finalPrompt, 'the prompt stays as typed; the boxes go in by node');
    assert.match((await parse({ provider: K.FLUX3_KLEIN_PROVIDER, boxes: '[{"label":"x"}]' })).error, /Layout box 1/);
    assert.match((await parse({ provider: 'comfy-klein4b', boxes: JSON.stringify(B) })).error, /FLUX 3 Klein and FLUX 3 Image; this model has none/);
    assert.equal((await parse({ provider: 'comfy-klein4b', boxes: '[]' })).error, undefined, 'an empty list is fine on any model');
    const big = await parse({ provider: 'api-flux3-image', prompt: 'x'.repeat(9000), boxes: JSON.stringify(Array.from({ length: 20 }, () => ({ label: 'y'.repeat(300), box: [0, 0, 10, 10] }))) }); assert.match(big.error, /up to 15000/);
    // hosted: FLUX 3 Image appends the partner node's rows; hosted klein places refuse a job with boxes (they'd drop them)
    const body = (input: Record<string, any>) => ROUTER_MODELS['api-flux3-image'].body({ prompt: 'a beach', finalPrompt: 'a beach', mode: 'generate', types: ['generate'], aspect: '1:1', imageResolution: '1K', ...input }, 0);
    assert.equal((await body({})).prompt, 'a beach'); assert.equal((await body({ layoutBoxes: [] })).prompt, 'a beach', 'Router: empty = the prompt unchanged');
    assert.equal((await body({ layoutBoxes: boxes })).prompt, 'a beach [{"id":"box_1","bbox":[50,600,300,900],"desc":"a red kite"},{"id":"box_2","bbox":[600,100,950,400],"desc":"a dog"}]');
    const hosted = routesFor(K.FLUX3_KLEIN_PROVIDER, t).filter((r) => r.kind !== 'local' && !r.comingSoon); assert.ok(hosted.length >= 2);
    for (const r of hosted) { assert.equal(r.unavailableFor?.({ layoutBoxes: boxes }), LB.LAYOUT_BOXES_LOCAL_ONLY, `${r.routeId}: refuses boxes`); assert.notEqual(r.unavailableFor?.({ layoutBoxes: [] }) ?? null, LB.LAYOUT_BOXES_LOCAL_ONLY); }
  }
  ok('boxes: parsed + checked; empty = same prompt and graph (box nodes pruned); boxes → CreateBoundingBoxes + Flux3LayoutPrompt (4 graphs, upsampler on/off); FLUX 3 Image rows; hosted klein refuses');
} finally { HW.setHardwareOverride(null); fs.rmSync(D, { recursive: true, force: true }); }
console.log('flux3-klein: all checks passed');
