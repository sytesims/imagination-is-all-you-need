// Add a workflow, step 2 (workflowModels.ts): the model files a workflow you added loads, have / missing against your ComfyUI's /object_info
// (a fake one here), links from the app's model list or pasted, and the mock download landing in <models folder>/<folder>/<file>.
// Free, single process: temp data, plugins and models folders, mock backend, no ComfyUI, no network.
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { createHash } from 'node:crypto';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-models-')); const P = path.join(D, 'plugins'); const DATA = path.join(D, 'data'); const MODELS = path.join(D, 'models');
fs.mkdirSync(P); fs.mkdirSync(DATA);
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: DATA, OPENHIGGSFIELD_PLUGINS_DIR: P, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'absent.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'absent-filming.json'),
  COMFY_BASE_URL: '', OPENHIGGSFIELD_DOWNLOAD_MOCK_MS: '60' });
for (const k of ['OPENHIGGSFIELD_USER_PLUGINS_DIR', 'OPENHIGGSFIELD_COMFY_MODELS_DIR', 'OPENHIGGSFIELD_ENFORCE_WEIGHTS', 'OPENHIGGSFIELD_DISK_FREE_GB', 'COMFY_API_KEY', 'COMFY_RUNNER_TOKEN', 'OPENHIGGSFIELD_COMFY_API_KEY']) delete process.env[k];
globalThis.fetch = (async () => { throw new Error('network forbidden'); }) as typeof fetch;

const REPO = path.resolve(import.meta.dirname, '../..'); const MANIFEST = path.join(REPO, 'readiness/manifest/models.json');
const sha = (f: string) => createHash('sha256').update(fs.readFileSync(f)).digest('hex'); const manifestBefore = sha(MANIFEST);
const WM = await import('../src/workflowModels.ts');
const { saveWorkflow } = await import('../src/workflowImport.ts');
const { loadPlugins } = await import('../src/plugins.ts');
const { getTool } = await import('../src/tools/registry.ts');
const { setComfyObjectInfo } = await import('../src/comfyNodes.ts');
const { weightsGate } = await import('../src/hardware/requirements.ts');
const DL = await import('../src/hardware/downloads.ts');
const Fastify = (await import('fastify')).default;
const { registerWorkflowImport } = await import('../src/routesWorkflowImport.ts');

const KNOWN_LORA = 'CoolShot_2000s_qwen.safetensors'; // in the app's model list (civitai link + size)
const LORAS = ['style-a.safetensors', 'style-b.safetensors', 'style-c.safetensors', 'style-d.safetensors', 'style-e.safetensors', KNOWN_LORA];
const graph: Record<string, any> = {
  '1': { class_type: 'UnetLoaderGGUF', inputs: { unet_name: 'wan/foo-Q4.gguf' } },
  '2': { class_type: 'DualCLIPLoader', inputs: { clip_name1: 'clip_l.safetensors', clip_name2: 't5xxl.safetensors', type: 'flux' } },
  '3': { class_type: 'VAELoader', inputs: { vae_name: 'ae.safetensors' } },
  '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'base.ckpt' } },
  ...Object.fromEntries(LORAS.map((l, i) => [`${10 + i}`, { class_type: 'LoraLoader', inputs: { lora_name: l, strength_model: 1, strength_clip: 1, model: [i ? `${9 + i}` : '1', 0], clip: ['2', 0] } }])),
  '20': { class_type: 'LoraLoaderModelOnly', inputs: { lora_name: 'style-a.safetensors', strength_model: 0.5, model: ['15', 0] } }, // the same file a second time
  '21': { class_type: 'MyCustomLoader', inputs: { lora_name: 'custom-thing.safetensors', note: 'not a model.txt' } }, // a custom node with the standard input name
  '30': { class_type: 'CLIPTextEncode', inputs: { text: 'a cat in a hat.safetensors', clip: ['15', 1] } }, // a prompt that looks like a file is not a model
  '31': { class_type: 'EmptyLatentImage', inputs: { width: 512, height: 512, batch_size: 1 } },
  '32': { class_type: 'KSampler', inputs: { seed: 1, steps: 4, cfg: 1, sampler_name: 'euler', scheduler: 'simple', denoise: 1, model: ['20', 0], positive: ['30', 0], negative: ['30', 0], latent_image: ['31', 0] } },
  '33': { class_type: 'VAEDecode', inputs: { samples: ['32', 0], vae: ['3', 0] } },
  '34': { class_type: 'SaveImage', inputs: { images: ['33', 0], filename_prefix: 'x' } },
};
/** A fake /object_info: what this "ComfyUI" has. Legacy combos and one V3 COMBO. */
const fakeInfo = (loras: string[], custom = false) => ({
  ...(custom ? { MyCustomLoader: { input: { required: { note: ['STRING', {}] } } } } : {}),
  UnetLoaderGGUF: { input: { required: { unet_name: [['other.gguf']] } } },
  DualCLIPLoader: { input: { required: { clip_name1: [['clip_l.safetensors', 't5xxl.safetensors']], clip_name2: [['clip_l.safetensors', 't5xxl.safetensors']], type: [['flux', 'sd3']] } } },
  VAELoader: { input: { required: { vae_name: ['COMBO', { options: ['ae.safetensors', 'pixel_space'] }] } } },
  CheckpointLoaderSimple: { input: { required: { ckpt_name: [[]] } } },
  LoraLoader: { input: { required: { lora_name: [loras] } } }, LoraLoaderModelOnly: { input: { required: { lora_name: [loras] } } },
  CLIPTextEncode: { input: { required: { text: ['STRING', {}] } } }, KSampler: { input: { required: { seed: ['INT', {}] } } }, SaveImage: { input: {} }, VAEDecode: { input: {} }, EmptyLatentImage: { input: {} },
});
const by = (v: any, f: string) => v.files.find((r: any) => r.file === f);

try {
  // ---- 1. graph → needed files ----
  const need = WM.neededFiles(graph);
  assert.deepEqual(need.map((f) => `${f.folder}/${f.file}`), ['diffusion_models/wan/foo-Q4.gguf', 'text_encoders/clip_l.safetensors', 'text_encoders/t5xxl.safetensors', 'vae/ae.safetensors', 'checkpoints/base.ckpt',
    ...LORAS.map((l) => `loras/${l}`), 'loras/custom-thing.safetensors'], 'every loader, in node order, the GGUF one and a custom loader with the standard input name; prompts and settings are not models');
  assert.deepEqual(need.find((f) => f.file === 'style-a.safetensors')?.nodes, ['10', '20'], 'the same file loaded twice is one row naming both nodes');
  assert.equal(need.filter((f) => f.folder === 'loras').length, 7, 'six-plus LoRAs all listed');
  assert.deepEqual(WM.neededFiles({ '1': { class_type: 'LoadImage', inputs: { image: 'a.png' } }, '2': { class_type: 'SaveImage', inputs: { images: ['1', 0] } } }), [], 'no model loaders: nothing needed');
  assert.deepEqual(WM.neededFiles({ '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'sub\\dir\\m.safetensors' } } }).map((f) => f.file), ['sub/dir/m.safetensors'], 'Windows separators become /');

  const { mainModelOf } = await import('../src/pluginGraph.ts');
  assert.equal(mainModelOf(graph), 'foo-Q4', 'the diffusion model loader first, in plain words'); assert.equal(mainModelOf({ '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'sd\\flux1-dev.safetensors' } } }), 'flux1-dev');
  assert.equal(mainModelOf({ '1': { class_type: 'LoadImage', inputs: { image: 'a.png' } } }), null, 'no main loader: unclear');
  assert.equal(WM.sizeWords(4e8, 2), '0.4 GB + 2 files of unknown size'); assert.equal(WM.sizeWords(0, 1), '1 file of unknown size'); assert.equal(WM.sizeWords(4e8, 0), '0.4 GB');

  // ---- path checks ----
  for (const bad of ['../evil.safetensors', 'a/../../evil.safetensors', '/abs.safetensors', 'C:/x.safetensors', 'a//b.safetensors', './x.safetensors', 'x.txt', 'a\0b.safetensors'])
    assert.equal(WM.safeModelPath('loras', bad), false, `refuses ${JSON.stringify(bad)}`);
  for (const bad of ['../loras', 'loras/x', '', 'a b']) assert.equal(WM.safeModelPath(bad, 'x.safetensors'), false, `refuses folder ${JSON.stringify(bad)}`);
  assert.equal(WM.safeModelPath('diffusion_models', 'wan/foo.safetensors'), true, 'a subfolder is fine');

  // ---- link validation ----
  const ok = (u: string) => { const r = WM.checkModelLink(u); assert.ok('url' in r, `${u}: ${'error' in r ? r.error : ''}`); return (r as any).url as string; };
  const no = (u: string) => assert.ok('error' in WM.checkModelLink(u), `refuses ${u}`);
  assert.equal(ok('https://huggingface.co/org/repo/resolve/main/sub/x.safetensors'), 'https://huggingface.co/org/repo/resolve/main/sub/x.safetensors');
  assert.equal(ok('https://huggingface.co/org/repo/blob/main/x.safetensors'), 'https://huggingface.co/org/repo/resolve/main/x.safetensors', 'a /blob/ page becomes its /resolve/ file');
  assert.equal(ok('https://civitai.com/api/download/models/123456?type=Model&format=SafeTensor&token=SECRET'), 'https://civitai.com/api/download/models/123456?type=Model&format=SafeTensor', 'a token in the link is dropped');
  assert.equal(ok('https://civitai.com/models/999/some-lora?modelVersionId=4242'), 'https://civitai.com/api/download/models/4242', 'a model page with its version → the download link');
  for (const u of ['http://huggingface.co/org/repo/resolve/main/x.safetensors', 'https://huggingface.co.evil.com/org/repo/resolve/main/x.safetensors', 'https://evil.com/huggingface.co/x.safetensors',
    'https://huggingface.co/org/repo', 'https://civitai.com/models/999', 'https://user:pw@huggingface.co/o/r/resolve/main/x.safetensors', 'file:///etc/passwd', 'javascript:alert(1)', 'not a link', '',
    'https://huggingface.co:444/o/r/resolve/main/x.safetensors']) no(u);

  // ---- save the workflow (as Add a workflow does) ----
  await loadPlugins();
  const saved = await saveWorkflow({ workflow: graph, name: 'Many Loras', tab: 'image', category: 'edit', prompt: '30.text', seed: '32.seed', output: '34' });
  assert.ok(saved.ok, JSON.stringify(saved)); const tool = getTool('many-loras') as any; assert.ok(tool?.plugin?.user);
  const noLoaders = await saveWorkflow({ workflow: { '1': { class_type: 'EmptyLatentImage', inputs: { width: 64, height: 64, batch_size: 1 } }, '2': { class_type: 'VAEDecode', inputs: { samples: ['1', 0] } }, '3': { class_type: 'SaveImage', inputs: { images: ['2', 0] } } }, name: 'No Loaders', tab: 'image', category: 'edit', output: '3' });
  assert.ok(noLoaders.ok);
  const lic = (id: string) => JSON.parse(fs.readFileSync(path.join(DATA, 'plugins', id, 'plugin.json'), 'utf8'));
  assert.equal(lic('no-loaders').license.id, 'no-loaders-licence', 'each added workflow declares its own "Your own" licence (it loads on its own after a restart)'); assert.ok(lic('no-loaders').licenses?.length);

  // ---- 2. have / missing against a fake object_info ----
  setComfyObjectInfo(fakeInfo(['style-a.safetensors', 'style-b.safetensors']));
  let v = WM.needsOf(tool, (await import('../src/comfyNodes.ts')).comfyLoaderOptionsNow());
  assert.equal(v.comfy, 'ok'); assert.equal(v.downloadId, 'workflow:many-loras');
  assert.equal(by(v, 'clip_l.safetensors').state, 'have'); assert.equal(by(v, 'ae.safetensors').state, 'have', 'V3 COMBO options read');
  assert.equal(by(v, 'style-a.safetensors').state, 'have'); assert.equal(by(v, 'style-c.safetensors').state, 'missing');
  assert.equal(by(v, 'wan/foo-Q4.gguf').state, 'missing'); assert.equal(by(v, 'base.ckpt').state, 'missing', 'an empty list = none there');
  assert.equal(by(v, 'custom-thing.safetensors').state, 'unknown', 'a loader ComfyUI does not have: unknown, not missing'); assert.equal(by(v, 'custom-thing.safetensors').nodeMissing, true);
  assert.equal(v.missing, 6);
  const all = WM.needsOf(tool, { options: WM.neededFiles(graph).reduce((o: any, f) => { for (const l of f.loaders) ((o[l.classType] ??= {})[l.input] ??= []).push(f.file); return o; }, {}), nodes: new Set(Object.keys(fakeInfo([])).concat('MyCustomLoader')) });
  assert.equal(all.missing, 0, 'all files present'); assert.ok(all.files.every((r) => r.state === 'have'));
  const none = await WM.workflowNeeds(getTool('no-loaders') as any); assert.deepEqual(none.files, []); assert.equal(none.missing, 0);

  // ---- 3. manifest link fill ----
  const k = by(v, KNOWN_LORA); assert.match(k.url, /^https:\/\/civitai\.com\/api\/download\/models\/\d+$/); assert.equal(k.linkFrom, 'list'); assert.ok(k.bytes > 0, 'size from the model list');
  assert.equal(by(v, 'clip_l.safetensors').linkFrom, 'list'); assert.equal(by(v, 'style-c.safetensors').url, null, 'unknown file: no link until you paste one');

  // ---- ComfyUI not running / not set ----
  setComfyObjectInfo(null); v = WM.needsOf(tool, null);
  assert.equal(v.comfy, 'not_set'); assert.ok(v.files.every((r) => r.state === 'unknown'), 'no ComfyUI and no models folder: nothing is called missing'); assert.equal(v.missing, 0);

  // ---- 5. the Generate gate (enforced like the built-in weights gate) ----
  setComfyObjectInfo(fakeInfo(['style-a.safetensors', 'style-b.safetensors'], true));
  assert.equal(weightsGate(tool, 'comfy-open'), null, 'mock backend without ENFORCE_WEIGHTS: reports only, like the built-ins');
  process.env.OPENHIGGSFIELD_ENFORCE_WEIGHTS = '1';
  const g = weightsGate(tool, 'comfy-open') as any; assert.equal(g?.code, 'weights_missing'); assert.equal(g.message, '6 model files aren’t in your ComfyUI yet. Get them under Needs on this page: wan/foo-Q4.gguf, base.ckpt, style-c.safetensors, style-d.safetensors and 2 more.');
  assert.equal(g.downloadId, 'workflow:many-loras'); assert.equal(g.downloadable, false, 'some have no link yet');
  setComfyObjectInfo(fakeInfo(['style-a.safetensors', 'style-b.safetensors'])); assert.equal((weightsGate(tool, 'comfy-open') as any)?.code, 'nodes_missing', 'a missing custom loader node is said first (the built-in rule)');
  setComfyObjectInfo(null); assert.equal(weightsGate(tool, 'comfy-open'), null, 'ComfyUI not running: nothing blocked on a guess');
  setComfyObjectInfo(fakeInfo(['style-a.safetensors', 'style-b.safetensors'], true));

  // ---- 4. links: routes, validation, saved in the workflow's own folder ----
  const app = Fastify(); registerWorkflowImport(app); await app.ready();
  let r = await app.inject({ method: 'GET', url: '/api/workflows/many-loras/models' }); assert.equal(r.statusCode, 200); assert.equal(r.json().missing, 6);
  assert.equal((await app.inject({ method: 'GET', url: '/api/workflows/cutout-nope/models' })).statusCode, 404);
  r = await app.inject({ method: 'PUT', url: '/api/workflows/many-loras/models', payload: { folder: 'loras', file: 'style-c.safetensors', url: 'https://evil.com/x.safetensors' } });
  assert.equal(r.statusCode, 400); assert.match(r.json().error, /Only Hugging Face and Civitai/);
  r = await app.inject({ method: 'PUT', url: '/api/workflows/many-loras/models', payload: { folder: 'loras', file: 'not-in-graph.safetensors', url: 'https://huggingface.co/o/r/resolve/main/x.safetensors' } }); assert.equal(r.statusCode, 404);
  r = await app.inject({ method: 'PUT', url: '/api/workflows/many-loras/models', payload: { folder: 'loras', file: '../../evil.safetensors', url: 'https://huggingface.co/o/r/resolve/main/x.safetensors' } }); assert.equal(r.statusCode, 404, 'only files the graph loads');
  const links: [string, string][] = [['diffusion_models', 'wan/foo-Q4.gguf'], ['checkpoints', 'base.ckpt'], ...['c', 'd', 'e'].map((x) => ['loras', `style-${x}.safetensors`] as [string, string])];
  for (const [folder, file] of links) { r = await app.inject({ method: 'PUT', url: '/api/workflows/many-loras/models', payload: { folder, file, url: `https://huggingface.co/o/r/blob/main/${file.split('/').pop()}` } }); assert.equal(r.statusCode, 200, r.body); }
  assert.equal(by(r.json(), 'style-c.safetensors').linkFrom, 'yours'); assert.match(by(r.json(), 'style-c.safetensors').url, /\/resolve\/main\/style-c\.safetensors$/);
  const mj = JSON.parse(fs.readFileSync(path.join(tool.plugin.dir, 'models.json'), 'utf8')); assert.ok(mj.files['loras/style-c.safetensors'], 'saved next to workflow.json');
  assert.equal(sha(MANIFEST), manifestBefore, 'the repo\'s model list is never written');

  // ---- path traversal in a graph: listed, flagged, never downloaded or linked ----
  const evil = await saveWorkflow({ workflow: { ...graph, '10': { class_type: 'LoraLoader', inputs: { ...graph['10'].inputs, lora_name: '../../../evil.safetensors' } } }, name: 'Evil Path', tab: 'image', category: 'edit', output: '34' });
  assert.ok(evil.ok); const ev = WM.needsOf(getTool('evil-path') as any, null); assert.equal(by(ev, '../../../evil.safetensors').badPath, true);
  assert.ok(!WM.workflowDownloadRows(getTool('evil-path') as any).some((x) => x.file.includes('..')), 'a bad path is never in a download');
  const sv = WM.saveModelLink(getTool('evil-path') as any, 'loras', '../../../evil.safetensors', 'https://huggingface.co/o/r/resolve/main/x.safetensors'); assert.equal(sv.ok, false); assert.equal((sv as any).code, 400);

  // ---- 6. download: no models folder, then the mock download landing in <models>/<folder>/<file> ----
  let c = DL.downloadCheck({ downloadId: 'workflow:many-loras' }); assert.equal(c.code, 'no_models_dir');
  assert.throws(() => DL.downloadCheck({ downloadId: 'workflow:cutout' }), /No workflow you added/, 'only workflows you added');
  fs.mkdirSync(MODELS); process.env.OPENHIGGSFIELD_COMFY_MODELS_DIR = MODELS;
  c = DL.downloadCheck({ downloadId: 'workflow:many-loras' }); assert.equal(c.code, 'no_url', 'with a models folder the custom loader\'s file is known missing, and has no link yet'); assert.deepEqual(c.extra.files, ['custom-thing.safetensors']);
  assert.equal(WM.saveModelLink(tool, 'loras', 'custom-thing.safetensors', 'https://civitai.com/api/download/models/77').ok, true);
  process.env.OPENHIGGSFIELD_DISK_FREE_GB = '0.01'; c = DL.downloadCheck({ downloadId: 'workflow:many-loras' }); assert.equal(c.code, 'not_enough_disk', 'the known LoRA alone is bigger than 10 MB');
  c = DL.downloadCheck({ downloadId: 'workflow:many-loras' }); assert.equal(c.code, 'not_enough_disk'); assert.match(String(c.message), /^Needs [\d.]+ GB \+ 6 files of unknown size; [\d.]+ GB of disk space is free\.$/, 'pasted links have no size: said, not hidden');
  delete process.env.OPENHIGGSFIELD_DISK_FREE_GB;
  // one file on its own (same downloader), before the rest
  const one = DL.startDownload({ downloadId: 'workflow:many-loras', files: ['base.ckpt'] }); assert.equal(one.downloadId, 'workflow:many-loras|checkpoints/base.ckpt'); assert.equal(one.files.length, 1);
  assert.equal((await DL.waitDownload(one.id))?.status, 'done'); assert.ok(fs.statSync(path.join(MODELS, 'checkpoints/base.ckpt')).isFile());
  assert.throws(() => DL.downloadCheck({ downloadId: 'workflow:many-loras', files: ['../../evil.safetensors'] }), /doesn’t need that file/);
  c = DL.downloadCheck({ downloadId: 'workflow:many-loras' }); assert.equal(c.code, null, String(c.message));
  assert.deepEqual(c.plan.files.map((f) => `${f.folder}/${f.file}`).sort(), ['diffusion_models/wan/foo-Q4.gguf', ...['c', 'd', 'e'].map((x) => `loras/style-${x}.safetensors`), `loras/${KNOWN_LORA}`, 'loras/custom-thing.safetensors'].sort(), 'only the missing files');
  assert.equal((weightsGate(tool, 'comfy-open') as any)?.code, 'weights_missing');
  assert.equal(weightsGate(tool, 'comfy-open', { downloadWeights: '1' }), null, '"Download with this run": every file has a link, so the run downloads first (the built-in flow)');
  const jm = (await import('../src/hardware/stages.ts')).jobMissing({ route: 'local:comfy-open', toolId: 'many-loras', input: {} } as any) as any;
  assert.equal(jm.downloadId, 'workflow:many-loras'); assert.equal(jm.files.length, 6, 'the job\'s download step uses the same files');
  const d = DL.startDownload({ downloadId: 'workflow:many-loras' }); assert.equal(d.downloadId, 'workflow:many-loras'); assert.equal(d.label, 'Many Loras');
  const done = await DL.waitDownload(d.id); assert.equal(done?.status, 'done', done?.error ?? '');
  assert.ok(fs.statSync(path.join(MODELS, 'diffusion_models/wan/foo-Q4.gguf')).isFile(), 'subfolder kept under its folder');
  assert.ok(fs.statSync(path.join(MODELS, 'loras', KNOWN_LORA)).isFile());
  assert.ok(!fs.existsSync(path.join(D, 'evil.safetensors')) && !fs.readdirSync(D).some((f) => f.endsWith('.safetensors')), 'nothing outside the models folder');
  v = WM.needsOf(tool, (await import('../src/comfyNodes.ts')).comfyLoaderOptionsNow()); assert.equal(v.missing, 0, 'files on disk in the models folder count as there');
  assert.equal(weightsGate(tool, 'comfy-open'), null, 'nothing missing: Generate runs');
  assert.equal(DL.downloadCheck({ downloadId: 'workflow:many-loras' }).code, 'nothing_to_download');
  await app.close();
  console.log('workflow-models: ok');
} finally { setComfyObjectInfo(undefined); fs.rmSync(D, { recursive: true, force: true }); }
