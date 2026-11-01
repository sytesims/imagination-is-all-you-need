// Add a workflow (workflowImport.ts + routesWorkflowImport.ts): drop in a ComfyUI workflow, it becomes a workflow in its tab with no restart.
// Free, single process: temp data + plugins folders, mock backend, no ComfyUI, no network.
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-import-')); const P = path.join(D, 'plugins'); const DATA = path.join(D, 'data'); const USER = path.join(DATA, 'plugins');
fs.mkdirSync(P); fs.mkdirSync(DATA);
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: DATA, OPENHIGGSFIELD_PLUGINS_DIR: P, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'absent.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'absent-filming.json'), COMFY_BASE_URL: '' });
delete process.env.OPENHIGGSFIELD_USER_PLUGINS_DIR;
for (const k of ['COMFY_API_KEY', 'COMFY_RUNNER_TOKEN', 'OPENHIGGSFIELD_COMFY_API_KEY']) delete process.env[k];
globalThis.fetch = (async () => { throw new Error('network forbidden'); }) as typeof fetch;

const REPO = path.resolve(import.meta.dirname, '../..');
const wf = (f: string) => JSON.parse(fs.readFileSync(path.join(REPO, 'workflows', f), 'utf8'));
fs.cpSync(path.join(REPO, 'plugins/cutout'), path.join(P, 'cutout'), { recursive: true });

const { guessMapping, readWorkflow, builtInObjectInfo, saveWorkflow, removeWorkflow, slugId, MAX_WORKFLOW_BYTES, EXPORT_HELP } = await import('../src/workflowImport.ts');
const { loadPlugins, pluginStatus } = await import('../src/plugins.ts');
const { getTool } = await import('../src/tools/registry.ts');
const { USER_PLUGINS_DIR } = await import('../src/config.ts');
const { VIDEO_WORKFLOWS } = await import('../src/shared/videoWorkflows.ts');
const { pluginWfEntries, pluginMenuRows, pluginBadge } = await import('../src/shared/pluginPlacement.ts');
const { buildPlan, hasPlan } = await import('../src/comfy/plans.ts');
const Fastify = (await import('fastify')).default;
const { registerWorkflowImport } = await import('../src/routesWorkflowImport.ts');

try {
  assert.equal(USER_PLUGINS_DIR, USER, 'workflows you add live in <data>/plugins by default');
  await loadPlugins(); assert.ok(getTool('cutout'), 'the shipped plugin loads');

  // ---- mapping guesses on real graphs ----
  const t2i = guessMapping(wf('create-image-zimage-turbo-api.json'), 'create-image-zimage-turbo-api.json');
  assert.equal(t2i.input, 'none'); assert.equal(t2i.output, 'image'); assert.equal(t2i.tab, 'image');
  assert.deepEqual(t2i.pick, { input: '', prompt: '57:27.text', seed: '57:3.seed', output: '9' }, 'text to image: the CLIPTextEncode on the sampler\'s positive, KSampler seed, SaveImage');
  assert.deepEqual(t2i.extras.filter((x) => x.on).map((x) => `${x.key}@${x.node}.${x.field}`), ['width@57:13.width', 'height@57:13.height', 'sampleSteps@57:3.steps'], 'width, height and steps on by default');
  assert.equal(t2i.name, 'Create Image Zimage Turbo');

  const edit = guessMapping(wf('create-image-qwen-edit2509-api.json'));
  assert.equal(edit.input, 'image'); assert.equal(edit.pick.input, '78.image'); assert.equal(edit.pick.output, '469', 'SaveImageAdvanced is a save node');
  assert.equal(edit.pick.prompt, '433:111.prompt', 'image edit: the encoder on positive wins over the negative one');
  assert.equal(edit.pick.seed, '433:3.seed'); assert.ok(edit.extras.some((x) => x.key === 'negative' && x.node === '433:110'), 'the negative prompt is offered as a setting');

  const vid = guessMapping(wf('depth-map-dav2-api.json'));
  assert.equal(vid.input, 'video'); assert.equal(vid.output, 'video'); assert.equal(vid.tab, 'video'); assert.equal(vid.category, 'edit');
  assert.deepEqual(vid.pick, { input: '1.file', prompt: '', seed: '', output: '5' }, 'LoadVideo file → SaveVideo, no prompt or seed');

  const vhs = guessMapping({
    '1': { class_type: 'VHS_LoadVideo', inputs: { video: 'clip.mp4', frame_load_cap: 0 } }, '2': { class_type: 'CLIPTextEncode', inputs: { text: 'neon', clip: ['5', 0] } },
    '3': { class_type: 'CLIPTextEncode', inputs: { text: 'blurry', clip: ['5', 0] } }, '4': { class_type: 'KSampler', inputs: { seed: 7, steps: 20, cfg: 6, positive: ['2', 0], negative: ['3', 0], model: ['5', 0], latent_image: ['1', 0] } },
    '5': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'x' } }, '6': { class_type: 'VHS_VideoCombine', inputs: { images: ['4', 0], frame_rate: 24 } }, '7': { class_type: 'PreviewImage', inputs: { images: ['4', 0] } } });
  assert.deepEqual(vhs.pick, { input: '1.video', prompt: '2.text', seed: '4.seed', output: '6' }, 'VHS: video loader, positive text, KSampler seed, Video Combine before Preview');
  assert.equal(vhs.output, 'video'); assert.deepEqual(vhs.choices.output.map((c) => c.node), ['6', '7']);
  assert.ok(vhs.extras.some((x) => x.key === 'fps' && x.field === 'frame_rate'));

  const prim = guessMapping({
    '1': { class_type: 'PrimitiveInt', inputs: { value: 99 } }, '2': { class_type: 'PrimitiveStringMultiline', inputs: { value: 'a red bike' } },
    '3': { class_type: 'CLIPTextEncode', inputs: { text: ['2', 0], clip: ['9', 0] } }, '4': { class_type: 'KSampler', inputs: { seed: ['1', 0], steps: ['8', 0], positive: ['3', 0], negative: ['3', 0] } },
    '8': { class_type: 'PrimitiveInt', inputs: { value: 12 } }, '9': { class_type: 'CLIPLoader', inputs: {} }, '10': { class_type: 'SaveImage', inputs: { images: ['4', 0] } } });
  assert.deepEqual(prim.pick, { input: '', prompt: '3.text', seed: '4.seed', output: '10' }, 'Primitive seed and prompt: mapped on the sampler / encoder, written through to the Primitive');
  assert.ok(!prim.choices.prompt.some((c) => c.node === '2'), 'the Primitive a text node reads is not listed twice');
  assert.deepEqual(prim.extras.find((x) => x.key === 'sampleSteps'), { key: 'sampleSteps', label: 'Steps', node: '4', field: 'steps', kind: 'number', value: 12, on: true, min: 1, max: 200 });
  console.log('ok guesses: text to image, image edit, LoadVideo, VHS, Primitive seed');

  // ---- reading files ----
  const ui = fs.readFileSync(path.join(REPO, 'workflows/templates/image_z_image_turbo.json'), 'utf8');
  const noInfo = readWorkflow(ui, null); assert.ok('error' in noInfo && noInfo.help === EXPORT_HELP, 'saved format without a node list: the export help');
  const conv = readWorkflow(ui, { info: builtInObjectInfo()!, from: 'built-in' });
  assert.ok(!('error' in conv), 'the official saved-format template converts'); if (!('error' in conv)) {
    assert.equal(conv.format, 'ui'); assert.equal(conv.convertedWith, 'built-in');
    const want = wf('create-image-zimage-turbo-api.json'); const got = conv.graph;
    assert.deepEqual(Object.fromEntries(Object.entries(got).map(([k, v]) => [k, v.class_type])), Object.fromEntries(Object.entries(want).map(([k, v]: any) => [k, v.class_type])), 'same nodes as the repo\'s API export');
    assert.deepEqual(got['57:3'].inputs.positive, ['57:27', 0]); assert.equal(got['57:3'].inputs.steps, 8, 'widget values land on the right inputs (control_after_generate skipped)');
  }
  assert.ok('error' in readWorkflow({ nodes: [{ id: 1, type: 'SomeCustomNode', mode: 0 }], links: [] }, { info: builtInObjectInfo()!, from: 'built-in' }), 'unknown node types: refused, not guessed');
  assert.match((readWorkflow('{not json', null) as any).error, /valid JSON/);
  assert.match((readWorkflow('x'.repeat(MAX_WORKFLOW_BYTES + 1), null) as any).error, /too big/);
  assert.match((readWorkflow({ '1': { class_type: 'LoadImage', inputs: { image: { __file: '/etc/hosts' } } } }, null) as any).error, /__file/);
  assert.ok(!('error' in readWorkflow({ prompt: wf('depth-map-dav2-api.json') }, null)), 'a /prompt body ({ prompt: graph }) is read too');
  console.log('ok read: API, saved format (converted / help), size cap, __file, bad JSON');

  // ---- save → loaded at once ----
  const base = { workflow: wf('depth-map-dav2-api.json'), name: 'My Depth Pass', tab: 'video', category: 'edit', input: '1.file', output: '5', license: 'Your own', source: 'https://example.com/depth' };
  assert.equal(slugId('../../etc/passwd'), 'etc-passwd', 'only a-z, 0-9 and dashes reach the disk');
  let r = await saveWorkflow(base); assert.ok(r.ok, JSON.stringify(r));
  const dir = path.join(USER, 'my-depth-pass'); assert.deepEqual(fs.readdirSync(dir).sort(), ['node-map.json', 'plugin.json', 'workflow.json'], 'three JSON files, never a handler');
  const man = JSON.parse(fs.readFileSync(path.join(dir, 'plugin.json'), 'utf8')); assert.equal(man.handler, undefined); assert.equal(man.licenses[0].name, 'Your own'); assert.equal(man.homepageUrl, 'https://example.com/depth');
  const t = getTool('my-depth-pass'); assert.ok(t, 'registered with no restart'); assert.equal(t!.plugin?.user, true);
  assert.ok(VIDEO_WORKFLOWS.some((w) => w.id === 'my-depth-pass' && w.category === 'edit'), 'in the Video tab\'s workflow list (picker, menu, search)');
  assert.ok(pluginWfEntries([t as any]).some((e) => e.id === 'v-my-depth-pass' && e.tags.includes('added by you')), 'on the Workflows page');
  assert.equal(pluginBadge(t as any)?.user, true);
  assert.ok(pluginStatus().find((s) => s.id === 'my-depth-pass')?.user);
  assert.ok(fs.readdirSync(USER).every((f) => !f.startsWith('.add-')), 'no leftover temp folder');

  // text to image (no photo): runs without one, prompt + chosen settings mapped
  r = await saveWorkflow({ workflow: wf('create-image-zimage-turbo-api.json'), name: 'Quick Picture', tab: 'image', category: 'edit', prompt: '57:27.text', seed: '57:3.seed', output: '9', extras: ['width', 'sampleSteps', 'bogus'] });
  assert.ok(r.ok, JSON.stringify(r)); const qp = getTool('quick-picture')!;
  assert.equal(qp.app?.input, 'none'); assert.ok(!qp.inputs.some((i) => i.name === 'image'), 'no photo slot');
  assert.deepEqual(pluginMenuRows([qp as any], 'image').map((x) => x.key), ['quick-picture'], 'in the Image menu');
  const parsed: any = await qp.parseInput({ types: '["default"]', prompt: 'a lighthouse', width: '832', sampleSteps: '6' }, {});
  assert.ok(!parsed.error, parsed.error); assert.equal(parsed.outKind, 'image');
  const job = { id: 'wi-1', toolId: 'quick-picture', provider: 'comfy-open', input: { ...parsed, seed: 5 } };
  assert.equal(hasPlan(job), true); const g = buildPlan(job).passes[0].graph;
  assert.equal(g['57:27'].inputs.text, 'a lighthouse'); assert.equal(g['57:13'].inputs.width, 832); assert.equal(g['57:3'].inputs.steps, 6); assert.equal(g['57:3'].inputs.seed, 5);
  assert.equal(g['57:13'].inputs.height, 1024, 'settings left off keep the workflow\'s own value');
  // an empty prompt keeps the workflow's own text (it never blanks it), and that text prefills the prompt box
  const own = wf('create-image-zimage-turbo-api.json')['57:27'].inputs.text; assert.ok(typeof own === 'string' && own.trim(), 'the sample graph has its own prompt');
  assert.equal(qp.plugin?.defaultPrompt, own, 'the graph\'s own prompt is offered to prefill the box');
  for (const empty of ['', '   ']) {
    const pe: any = await qp.parseInput({ types: '["default"]', prompt: empty }, {}); assert.ok(!pe.error, pe.error);
    const ge = buildPlan({ id: 'wi-2', toolId: 'quick-picture', provider: 'comfy-open', input: { ...pe, seed: 5 } }).passes[0];
    assert.equal(ge.graph['57:27'].inputs.text, own, `an empty prompt (${JSON.stringify(empty)}) keeps the workflow's own text`); assert.equal(ge.expect.prompt, undefined, 'and expects no prompt');
  }
  console.log('ok save: folder written, loaded at once, placed in its tab, the Workflows page and the menus; text-only run maps prompt + settings; an empty prompt keeps the graph\'s');

  // ---- refusals ----
  const bad = async (b: any, re: RegExp, msg: string) => { const x = await saveWorkflow({ ...base, ...b }); assert.ok(!x.ok, msg); assert.match((x as any).error + ' ' + ((x as any).errors ?? []).join(' '), re, msg); };
  await bad({}, /already added/, 'the same name twice');
  await bad({ name: 'Cutout' }, /built-in/, 'a shipped plugin\'s id');
  await bad({ name: 'Upscale' }, /built-in/, 'a built-in tool\'s id');
  await bad({ name: '!!' }, /at least two/, 'a name with no letters');
  await bad({ name: 'x'.repeat(61) }, /name/, 'a too-long name');
  await bad({ name: 'Other', input: '99.file' }, /isn’t in this workflow/, 'a node that is not a choice');
  await bad({ name: 'Other', tab: 'video', category: 'people' }, /groups/, 'a category from another tab');
  await bad({ name: 'Other', source: 'javascript:alert(1)' }, /http/, 'a non-web source link');
  await bad({ name: 'Other', workflow: { ...wf('depth-map-dav2-api.json'), '1': { class_type: 'LoadVideo', inputs: { file: { __file: '/etc/hosts' } } } } }, /__file/, '__file in the graph');
  await bad({ name: 'Other', workflow: { '1': { class_type: 'LoadImage', inputs: { image: 'a.png' } } }, input: '1.image', output: undefined }, /no node that saves/, 'no save node');
  assert.ok(!fs.existsSync(path.join(USER, 'other')) && !fs.existsSync(path.join(P, 'other')), 'nothing written for a refused save');
  // a hand-made folder with a handler in the data folder never loads
  fs.mkdirSync(path.join(USER, 'sneaky')); fs.cpSync(dir, path.join(USER, 'sneaky'), { recursive: true });
  fs.writeFileSync(path.join(USER, 'sneaky', 'handler.mjs'), 'export default {}');
  fs.writeFileSync(path.join(USER, 'sneaky', 'plugin.json'), JSON.stringify({ ...man, id: 'sneaky', handler: 'handler.mjs' }));
  const { addPluginFolder } = await import('../src/plugins.ts');
  const sn = await addPluginFolder(path.join(USER, 'sneaky')); assert.equal(sn.ok, false); assert.match(sn.errors.join(' '), /never runs code/); assert.ok(!getTool('sneaky'));
  console.log('ok refusals: duplicate, built-in clash, bad name, foreign node, wrong category, bad link, __file, no output, handler in the data folder');

  // ---- routes ----
  const app = Fastify(); registerWorkflowImport(app); await app.ready();
  let res = await app.inject({ method: 'POST', url: '/api/workflows/import', payload: { workflow: wf('create-image-qwen-edit2509-api.json'), fileName: 'qwen-edit.json' } });
  assert.equal(res.statusCode, 200); const pv = res.json(); assert.equal(pv.format, 'api'); assert.equal(pv.guess.pick.input, '78.image'); assert.equal(pv.missingNodes, null, 'unknown without a ComfyUI'); assert.ok(pv.tabs.find((x: any) => x.id === 'video').categories.some((c: any) => c.id === 'edit' && c.label));
  res = await app.inject({ method: 'POST', url: '/api/workflows/import', payload: { workflow: JSON.parse(ui) } });
  assert.equal(res.statusCode, 200, 'saved format converted with the built-in node list when ComfyUI is not running'); assert.equal(res.json().convertedWith, 'built-in');
  res = await app.inject({ method: 'POST', url: '/api/workflows/import', payload: { workflow: { hello: 1 } } }); assert.equal(res.statusCode, 400);
  res = await app.inject({ method: 'POST', url: '/api/workflows/import', headers: { 'content-type': 'application/json' }, payload: JSON.stringify({ workflow: 'x'.repeat(MAX_WORKFLOW_BYTES + 400_000) }) }); assert.equal(res.statusCode, 413, 'body over the cap');
  res = await app.inject({ method: 'POST', url: '/api/workflows', payload: { ...base, name: 'Route Made' } }); assert.equal(res.statusCode, 201); assert.equal(res.json().toolId, 'route-made'); assert.ok(getTool('route-made'));
  res = await app.inject({ method: 'POST', url: '/api/workflows', payload: { ...base, name: 'Route Made' } }); assert.equal(res.statusCode, 400); assert.equal(res.json().field, 'name');
  res = await app.inject({ method: 'DELETE', url: '/api/workflows/cutout' }); assert.equal(res.statusCode, 403, 'shipped folders are never deleted'); assert.ok(fs.existsSync(path.join(P, 'cutout')));
  res = await app.inject({ method: 'DELETE', url: '/api/workflows/nope' }); assert.equal(res.statusCode, 404);
  res = await app.inject({ method: 'DELETE', url: '/api/workflows/route-made' }); assert.equal(res.statusCode, 200);
  assert.ok(!getTool('route-made') && !fs.existsSync(path.join(USER, 'route-made')), 'removed: out of the registry, folder gone');
  await app.close();

  // ---- remove ----
  assert.deepEqual(removeWorkflow('my-depth-pass'), { ok: true }); assert.ok(!getTool('my-depth-pass')); assert.ok(!fs.existsSync(dir));
  assert.ok(!VIDEO_WORKFLOWS.some((w) => w.id === 'my-depth-pass'), 'gone from the Video list'); assert.ok(VIDEO_WORKFLOWS.some((w) => w.id === 'cutout'), 'the shipped one stays');
  assert.equal(removeWorkflow('cutout').ok, false);
  // a restart loads what you added
  await import('../src/tools/registry.ts').then(({ unregisterTool }) => { for (const s of pluginStatus()) if (s.toolId) unregisterTool(s.toolId); });
  const again = await loadPlugins(); assert.ok(again.find((s) => s.id === 'quick-picture')?.ok, 'still there after a restart'); assert.equal(again.find((s) => s.id === 'quick-picture')?.user, true);
  console.log('ok routes + remove: import preview, 413 cap, save, 403 for shipped, delete, reload after restart');
} finally { fs.rmSync(D, { recursive: true, force: true }); }
