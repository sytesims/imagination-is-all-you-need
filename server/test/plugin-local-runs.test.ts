// Plugins run for real on your own ComfyUI (docs/PLUGINS.md). Free, single-process: temp plugins dir, mock backend,
// a fake ComfyUI transport (no server, GPU, keys or network).
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-local-runs-')); const P = path.join(D, 'plugins'); const DATA = path.join(D, 'data');
fs.mkdirSync(P); fs.mkdirSync(DATA);
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: DATA, OPENHIGGSFIELD_PLUGINS_DIR: P, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'absent.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'absent-filming.json'), COMFY_BASE_URL: '' });
for (const k of ['COMFY_API_KEY', 'COMFY_RUNNER_TOKEN', 'OPENHIGGSFIELD_COMFY_API_KEY', 'OPENHIGGSFIELD_CAPTURE_GRAPHS']) delete process.env[k];
globalThis.fetch = (async () => { throw new Error('network forbidden'); }) as typeof fetch;

const REPO = path.resolve(import.meta.dirname, '../..');
fs.cpSync(path.join(REPO, 'plugins/cutout'), path.join(P, 'cutout'), { recursive: true });
const write = (id: string, files: Record<string, unknown>) => { fs.mkdirSync(path.join(P, id)); for (const [f, v] of Object.entries(files)) fs.writeFileSync(path.join(P, id, f), JSON.stringify(v, null, 1)); };
const manifest = (id: string, extra: Record<string, unknown> = {}) => ({ schema: 1, id, name: id, category: 'Image', description: 'test plugin', input: 'image', license: { id: 'mit' },
  components: [{ kind: 'model', name: 'm', license: 'mit', url: 'https://example.com' }], presets: [{ id: 'soft', label: 'Soft', prompt: 'soft' }, { id: 'hard', label: 'Hard', prompt: 'hard' }],
  inputs: { prompt: true, resolutions: ['720p', '1080p'], fields: [{ name: 'strength', kind: 'select', default: 'medium', options: [{ value: 'light' }, { value: 'medium' }] }, { name: 'steps2', kind: 'number', default: 8 }] },
  pricing: { gpuSecPerSec: { '720p': 4, '1080p': 8 } }, workflow: 'workflow.json', nodeMap: 'node-map.json', ...extra });
const imgGraph = {
  '1': { class_type: 'LoadImage', inputs: { image: 'in.png' } }, '2': { class_type: 'PrimitiveInt', inputs: { value: 0 } },
  '6': { class_type: 'CLIPTextEncode', inputs: { text: '', clip: ['3', 0] } }, '7': { class_type: 'EmptySize', inputs: { size: '720p' } },
  '9': { class_type: 'KSampler', inputs: { seed: ['2', 0], denoise: 0.5, steps: 4, sampler_name: 'euler' } }, '11': { class_type: 'SaveImage', inputs: { images: ['9', 0], filename_prefix: 'x' } },
};
const imgMap = { inputs: { image: { node: '1', field: 'image' }, prompt: { node: '6', field: 'text' }, seed: { node: '9', field: 'seed' }, resolution: { node: '7', field: 'size', map: { '720p': 'hd', '1080p': 'fhd' } } },
  fields: { strength: { node: '9', field: 'denoise', map: { light: 0.3, medium: 0.6 } }, steps2: { node: '9', field: 'steps' } }, presets: { hard: [{ node: '9', field: 'sampler_name', value: 'dpmpp' }] }, output: { node: '11' } };
write('img-look', { 'plugin.json': manifest('img-look'), 'workflow.json': imgGraph, 'node-map.json': imgMap });
const vidGraph = { '1': { class_type: 'LoadVideo', inputs: { file: 'a.mp4' } }, '4': { class_type: 'Fx', inputs: { amount: 1, text: '' } }, '6': { class_type: 'SaveVideo', inputs: { video: ['4', 0] } }, '9': { class_type: 'SaveVideo', inputs: { video: ['4', 1] } } };
const vidMap = { inputs: { video: { node: '1', field: 'file' }, prompt: { node: '4', field: 'text' } }, output: { node: '6' }, extraOutputs: [{ node: '9', label: 'Mask' }] };
write('vid-fx', { 'plugin.json': manifest('vid-fx', { category: 'Video', input: 'video', inputs: { prompt: true } }), 'workflow.json': vidGraph, 'node-map.json': vidMap });
write('no-map', { 'plugin.json': manifest('no-map', { nodeMap: undefined, inputs: {} }), 'workflow.json': imgGraph });
write('sneaky-graph', { 'plugin.json': manifest('sneaky-graph'), 'workflow.json': { ...imgGraph, '1': { class_type: 'LoadImage', inputs: { image: { __file: '/etc/hosts' } } } }, 'node-map.json': imgMap });
write('sneaky-map', { 'plugin.json': manifest('sneaky-map'), 'workflow.json': imgGraph, 'node-map.json': { ...imgMap, presets: { hard: [{ node: '9', field: 'sampler_name', value: { __file: '/etc/hosts' } }] } } });
write('bad-extra', { 'plugin.json': manifest('bad-extra'), 'workflow.json': imgGraph, 'node-map.json': { ...imgMap, extraOutputs: [{ node: '99', label: 'Nope' }] } });
write('bad-output', { 'plugin.json': manifest('bad-output', { output: 'video' }), 'workflow.json': imgGraph, 'node-map.json': imgMap });

const { loadPlugins } = await import('../src/plugins.ts');
const { getTool } = await import('../src/tools/registry.ts');
const { buildPlan, hasPlan, setIn, F } = await import('../src/comfy/plans.ts');
const { runNative } = await import('../src/comfy/runNative.ts');
const { runWithProvider } = await import('../src/providers.ts');
const { buildWorkflowExport } = await import('../src/workflowExport.ts');
const { setMockDelayMs } = await import('../src/tools/shared.ts');
try {
  const st = Object.fromEntries((await loadPlugins()).map((s) => [s.id, s]));
  for (const id of ['cutout', 'img-look', 'vid-fx', 'no-map']) assert.ok(st[id]?.ok, `${id} loads: ${st[id]?.errors.join('; ')}`);
  assert.equal(st['sneaky-graph'].ok, false); assert.match(st['sneaky-graph'].errors.join(' '), /workflow must not contain "__file"/);
  assert.equal(st['sneaky-map'].ok, false); assert.match(st['sneaky-map'].errors.join(' '), /nodeMap must not contain "__file"/);
  assert.equal(st['bad-extra'].ok, false); assert.match(st['bad-extra'].errors.join(' '), /extraOutputs\[0\]: node "99" is not in the workflow/);
  assert.equal(st['bad-output'].ok, false); assert.match(st['bad-output'].errors.join(' '), /output is "video" but the output node 11 \(SaveImage\) saves image/);
  assert.ok(!getTool('sneaky-graph') && !getTool('sneaky-map'), 'refused plugins register no app');
  console.log('ok load: __file graphs/node maps refused with clear errors, extraOutputs + output kind validated');

  const img = path.join(DATA, 'up.png'); fs.copyFileSync(path.join(REPO, 'server/test/fixtures/ref-512.png'), img);
  const imgInput = { imagePath: img, prompt: 'raw', finalPrompt: 'Soft. a red bike', seed: 4242, resolution: '1080p', fields: { strength: 'light', steps2: 12 }, types: ['hard'] };
  const ij = { id: 'pj-img', toolId: 'img-look', provider: 'comfy-open', input: imgInput };
  assert.equal(hasPlan(ij), true); assert.equal(hasPlan({ ...ij, provider: 'router-kling' }), false, 'only on the comfy-open provider');
  assert.equal(hasPlan({ ...ij, toolId: 'no-map' }), false, 'no node map → no plan (sample)');
  const ip = buildPlan(ij); const g = ip.passes[0].graph;
  assert.equal(ip.outKind, 'image'); assert.equal(ip.muxSourceAudio, false); assert.equal(ip.passes[0].output, '11'); assert.equal(ip.passes[0].workflow, 'plugins/img-look/workflow.json');
  assert.deepEqual(g['1'].inputs.image, F(img), 'the job\'s own file as an upload placeholder');
  assert.equal(g['6'].inputs.text, 'Soft. a red bike', 'finalPrompt wins over prompt');
  assert.equal(g['2'].inputs.value, 4242, 'seed linked to a Primitive sets the primitive'); assert.deepEqual(g['9'].inputs.seed, ['2', 0]);
  assert.equal(g['7'].inputs.size, 'fhd'); assert.equal(g['9'].inputs.denoise, 0.3); assert.equal(g['9'].inputs.steps, 12); assert.equal(g['9'].inputs.sampler_name, 'dpmpp');
  assert.equal(imgGraph['6'].inputs.text, '', 'the loaded workflow is never mutated');
  assert.equal(buildPlan({ ...ij, input: { ...imgInput, finalPrompt: undefined } }).passes[0].graph['6'].inputs.text, 'raw', 'prompt when there is no finalPrompt');
  assert.equal(JSON.stringify(g).match(/__file/g)?.length, 1, 'only one upload: the job\'s image');

  const vid = path.join(DATA, 'clip.mp4'); fs.writeFileSync(vid, 'not really a video');
  const vj = { id: 'pj-vid', toolId: 'vid-fx', provider: 'comfy-open', input: { videoPath: vid, prompt: 'glow', types: ['soft'], keepAudio: true } };
  const vp = buildPlan(vj);
  assert.equal(vp.outKind, 'video'); assert.equal(vp.muxSourceAudio, true); assert.deepEqual(vp.passes[0].graph['1'].inputs.file, F(vid)); assert.equal(vp.passes[0].graph['4'].inputs.text, 'glow');
  assert.deepEqual(vp.passes[0].extraOutputs, [{ node: '9', label: 'Mask' }]);
  assert.equal(buildPlan({ ...vj, input: { ...vj.input, keepAudio: false } }).muxSourceAudio, false);
  console.log('ok plans: image + video plugins map file placeholders, prompt, seed, resolution, fields, presets, outKind, extra outputs');

  // Cutout: the same plan as the retired hard-coded builder (copied here as the reference).
  const old = (job: any) => { const dir = path.join(P, 'cutout'); const m = JSON.parse(fs.readFileSync(path.join(dir, 'node-map.json'), 'utf8')); const gg = JSON.parse(fs.readFileSync(path.join(dir, 'workflow.json'), 'utf8')); const i = job.input;
    setIn(gg, m.inputs.video.node, m.inputs.video.field, F(i.videoPath));
    for (const [k, spec] of Object.entries<any>(m.fields ?? {})) { const v = i.fields?.[k]; if (v == null) continue; for (const s of [spec].flat()) setIn(gg, s.node, s.field, s.map ? s.map[v] : Number(v)); }
    for (const s of m.presets?.[i.types?.[0]] ?? []) setIn(gg, s.node, s.field, s.value);
    return { tool: job.toolId, outKind: 'video', post: { kind: 'each' }, muxSourceAudio: i.keepAudio !== false, notes: [], passes: [{ label: 'Result', workflow: 'plugins/cutout/workflow.json', graph: gg, output: m.output.node, extraOutputs: m.extraOutputs, expect: { fields: i.fields ?? {}, preset: i.types?.[0] } }] }; };
  for (const input of [{ videoPath: vid, types: ['white'], fields: { detail: 'fine', edgeSoftness: 9 } }, { videoPath: vid, types: ['green'], fields: { detail: 'fast', edgeSoftness: 1 }, keepAudio: false }, { videoPath: vid, types: ['black'], fields: {} }]) {
    const cj = { id: 'pj-cut', toolId: 'cutout', provider: 'comfy-open', input };
    assert.equal(hasPlan(cj), true); assert.deepEqual(JSON.parse(JSON.stringify(buildPlan(cj))), JSON.parse(JSON.stringify(old(cj))), `cutout plan unchanged for ${input.types[0]}`);
  }
  console.log('ok cutout: plan identical to the old hard-coded builder');

  // Mock backend: still a sample, the would-be graph saved, and the workflow export says so.
  setMockDelayMs(1);
  const job: any = { id: 'pj-mock', toolId: 'img-look', provider: 'comfy-open', status: 'queued', progress: 0, outputs: [], warnings: [], createdAt: Date.now(), input: { ...imgInput, outKind: 'image' } };
  await runWithProvider(job, getTool('img-look')!);
  for (let k = 0; k < 200 && job.status !== 'done' && job.status !== 'failed'; k++) await new Promise((r) => setTimeout(r, 25));
  assert.equal(job.status, 'done', `mock job finishes (${job.error ?? ''})`); assert.equal(job.simulated, true, 'a sample, nothing ran');
  const saved = JSON.parse(fs.readFileSync(path.join(DATA, 'pj-mock-graph.json'), 'utf8'));
  assert.equal(saved['1'].inputs.image, 'up.png', 'sample graph names the file, no placeholder'); assert.equal(saved['6'].inputs.text, 'Soft. a red bike');
  const ex = await buildWorkflowExport(job);
  assert.equal(ex.available, true); assert.equal(ex.exact, false); assert.match(ex.headline, /^Sample — nothing ran/); assert.deepEqual(ex.graphs[0], saved); assert.equal(ex.passes[0].workflow, 'plugins/img-look/workflow.json');
  console.log('ok mock: sample result, <jobId>-graph.json written, workflow export labelled "Sample — nothing ran"');

  // A stubbed ComfyUI receives the mapped graph: only the job's file is uploaded, its name lands in the Load node.
  const uploads: string[] = []; const sent: any[] = [];
  const transport = { upload: async (f: string) => { uploads.push(f); return `uploaded_${path.basename(f)}`; },
    run: async (graph: any) => { sent.push(graph); return { promptId: 'stub', outputs: { '11': [{ filename: 'r.png', subfolder: '', type: 'output', kind: 'images' }] } }; },
    download: async (_o: any, dest: string) => { fs.copyFileSync(img, dest); return dest; } };
  const real: any = { id: 'pj-real', toolId: 'img-look', provider: 'comfy-open', status: 'queued', progress: 0, outputs: [], warnings: [], createdAt: Date.now(), input: { ...imgInput, outKind: 'image' } };
  await runNative(real, transport as any);
  assert.deepEqual(uploads, [img]); assert.equal(sent.length, 1);
  assert.equal(sent[0]['1'].inputs.image, 'uploaded_up.png'); assert.equal(sent[0]['6'].inputs.text, 'Soft. a red bike'); assert.equal(sent[0]['2'].inputs.value, 4242); assert.equal(sent[0]['9'].inputs.sampler_name, 'dpmpp');
  assert.equal(real.status, 'done', `real run done (${real.error ?? ''})`); assert.equal(real.outputs.length, 1); assert.match(real.outputs[0].url, /\.png$/);
  console.log('ok stub ComfyUI: mapped graph submitted, one upload (the job\'s file), image result stored');
} finally { setMockDelayMs(null); fs.rmSync(D, { recursive: true, force: true }); }
