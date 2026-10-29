/**
 * The 3D tools (2026-10-23, shared/threeD.ts has the workflows, models and price keys):
 *  - `three-d` (page /tools/3d): Image to 3D. One image in, a GLB out. Output kind '3d' (input.outKind): stored and served like every other
 *    output (/files/<job>-out0.glb, model/gltf-binary), listed in jobs, history and Assets.
 *  - `three-d-turntable` (hidden; /tools/3d?workflow=turntable): the browser records an orbit of a 3D result from the viewer and uploads it;
 *    this tool keeps it as a normal MP4 video result, free (ffmpeg on this computer, no provider).
 *
 *  Model                   Place                                   Price (published, read 2026-10-23)                         Licence
 *  Tripo 3.1               Comfy partner node TripoImageToModelNodeV2  42.2–126.6 Comfy credits ($0.20–$0.60) by texture/geometry  Tripo terms (hosted)
 *                          on Comfy Cloud (official template api_tripo3_1_image_to_model), Comfy key
 *  TRELLIS.2               fal-ai/trellis-2, fal key                $0.25 / $0.30 / $0.35 at 512 / 1024 / 1536                  MIT (weights + code)
 *  Hunyuan 3D 3.1 Pro      fal-ai/hunyuan-3d/v3.1/pro/image-to-3d   $0.375; PBR +$0.15; a set face count +$0.15                Tencent Hunyuan 3D (hosted on fal; the
 *                                                                                                                              community licence excludes EU, UK, KR)
 *  Pixal3D + TRELLIS.2     Local, official template 3d_pixal3d_trellis2_image_to_model    free once its 15.2 GB of files are downloaded
 *                          Listed only: never runs or downloads until the user approves a download (COMING_SOON reason says so).
 *
 *  Nothing here was run against a paid API: request bodies follow the providers' schemas (fal OpenAPI, the ComfyUI node's object_info) and are
 *  checked in test/three-d.test.ts. Without a key every hosted route makes a labelled sample (our own GLB, server/samples/result-3d.glb).
 */
import path from 'node:path';
import { copyFile } from 'node:fs/promises';
import type { ToolDef } from './types.js';
import type { Job } from '../jobs.js';
import type { RouteDef, RouteAttempt } from '../routing/types.js';
import { DATA_DIR } from '../config.js';
import { probe } from '../media.js';
import { runFfmpeg, mediaDuration, videoSize } from '../ffmpeg.js';
import { registerProvider } from '../providers.js';
import { registerLicense, registerLicenseComponents, registerWorkflowLicense } from '../licenses.js';
import { HOSTED_BY_ID, type HostedPrice } from '../shared/hostedPrices.js';
import { EXTRA_ROUTES, COMING_SOON, FAL_ENV } from '../routing/routes.js';
import { NATIVE_DIRECT } from '../routing/directRoutes.js';
import { keyValue } from '../routing/keys.js';
import { mockRun, mockFailOf, seedOf } from './shared.js';
import { imageDataUri } from './imageUpscaleModels.js';
import { THREE_D_TOOL, TURNTABLE_TOOL, THREE_D_PAGE, threeDRoute, threeDModel, normalizeSettings, threeDPriceKey, usdByKey, FACE_COUNT, PIXAL3D_FILES, fmtGB, THREE_D_MODEL_IDS, type Faces } from '../shared/threeD.js';

const D = '2026-10-23' as const;
type In = Record<string, any>;
const HUNYUAN_LICENCE = 'https://' + 'github.com/Tencent-Hunyuan/Hunyuan3D-2.1/blob/main/LICENSE';
const COMFY_PRICING = 'https://docs.comfy.org/tutorials/partner-nodes/pricing';
const page = (slug: string) => `https://fal.ai/models/${slug}`;
const facesOf = (f: Faces | string | undefined) => (f && f !== 'auto' ? FACE_COUNT[f as Exclude<Faces, 'auto'>] ?? null : null);
const seed31 = (i: In) => (Number.isInteger(i.seed) ? Math.abs(i.seed) % 2147483648 : 42);

// ---------- licences ----------
registerLicense({ id: 'tripo-terms', name: 'Tripo terms of service (hosted API)', osi: false, url: 'https://www.tripo3d.ai/terms', terms: ['Hosted model: you run it through Comfy with your Comfy key; Tripo’s terms cover the output.'] } as any);
registerLicense({ id: 'tencent-hunyuan-3d', name: 'Tencent Hunyuan 3D Community License (does not apply in the EU, UK and South Korea)', osi: false, url: 'https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1/blob/main/LICENSE',
  terms: ['“This license agreement does not apply in the European Union, United Kingdom and South Korea.”', 'Over 1 million monthly active users needs a licence from Tencent.', 'Hosted runs on fal also follow fal’s terms.'] } as any);
registerLicense({ id: 'dinov3', name: 'DINOv3 License (Meta)', osi: false, url: 'https://ai.meta.com/resources/models-and-libraries/dinov3-license/' });
registerWorkflowLicense('three-d-tripo31-i2m-api.json', ['proprietary']);
registerLicenseComponents(THREE_D_TOOL, [
  { model: 'Tripo 3.1 (Comfy partner node TripoImageToModelNodeV2, hosted)', license: 'Tripo terms of service', commercial: 'see terms', url: 'https://www.tripo3d.ai/terms' },
  { model: 'TRELLIS.2 (Microsoft, fal-ai/trellis-2)', license: 'MIT', commercial: 'yes', url: 'https://huggingface.co/microsoft/TRELLIS.2-4B' },
  { model: 'Hunyuan 3D 3.1 Pro (Tencent, fal-ai/hunyuan-3d/v3.1/pro/image-to-3d)', license: 'Tencent Hunyuan 3D Community License; not in the EU, UK or South Korea', commercial: 'restricted', url: 'https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1/blob/main/LICENSE' },
  { model: 'Pixal3D + TRELLIS.2 local template (Comfy-Org repack: Pixal3D, TRELLIS.2, MoGe-2, BiRefNet)', license: 'MIT', commercial: 'yes', url: 'https://huggingface.co/Comfy-Org/Pixal3D' },
  { model: 'DINOv3 ViT-L (in the Pixal3D template)', license: 'DINOv3 License', commercial: 'see terms', url: 'https://ai.meta.com/resources/models-and-libraries/dinov3-license/' },
] as any);

// ---------- prices (1 credit = $0.01; quote = charge: every price key has its own rate) ----------
const price = (providerId: string, model: string, modelId: string, sourceUrl: string, note: string): HostedPrice => {
  const by = usdByKey(modelId); return { providerId, model, unit: 'run', usd: by[threeDPriceKey(threeDModel(modelId)!.defaults)], usdByQuality: by, sourceUrl, checkedAt: D, estimated: false, note } as HostedPrice; };
export const THREE_D_PRICES: HostedPrice[] = [
  price('cloud-tripo-31', 'Tripo 3.1 Image to Model (Comfy partner node)', 'cloud-tripo-31', COMFY_PRICING, 'Comfy credits at 211 = $1: texture off / standard / detailed × geometry standard / detailed = 42.2 / 84.4 · 63.3 / 105.5 · 84.4 / 126.6. PBR and face limit are free.'),
  price('fal:fal-ai/trellis-2', 'TRELLIS.2 (fal)', 'fal-trellis2', page('fal-ai/trellis-2'), '"$0.25 for 512p resolution, $0.30 for 1024p resolution and $0.35 for 1536p resolution."'),
  price('fal:fal-ai/hunyuan-3d/v3.1/pro/image-to-3d', 'Hunyuan 3D 3.1 Pro (fal)', 'fal-hunyuan3d-31', page('fal-ai/hunyuan-3d/v3.1/pro/image-to-3d'), '"$0.375 per generation." "Enabling PBR materials adds $0.15." "Custom face count adds $0.15."'),
];
for (const p of THREE_D_PRICES) HOSTED_BY_ID[p.providerId] = p;

// ---------- request bodies (exported for the schema test) ----------
const photo = (i: In) => String(i.imagePath ?? i.refPaths?.[0] ?? '');
export const THREE_D_BODIES = {
  /** fal-ai/trellis-2: image_url (required), resolution 512 | 1024 | 1536 (the price), texture_size 1024 | 2048 | 4096, decimation_target (vertices, 5,000–2,000,000), seed. */
  trellis2: async (i: In) => { const s = normalizeSettings('fal-trellis2', i); const f = facesOf(s.faces);
    return { image_url: await imageDataUri(photo(i)), resolution: s.detail === 'low' ? 512 : s.detail === 'high' ? 1536 : 1024, texture_size: s.texture === 'hd' ? 4096 : 2048, remesh: true,
      ...(f ? { decimation_target: Math.max(5000, Math.round(f / 2)) /* ~2 faces per vertex */ } : {}), ...(Number.isInteger(i.seed) ? { seed: Math.abs(i.seed) % 2147483648 } : {}) }; },
  /** fal-ai/hunyuan-3d/v3.1/pro/image-to-3d: input_image_url (required), generate_type Normal (textured), enable_pbr (+$0.15), face_count 40,000–1,500,000 (+$0.15; left out = 500k, free). */
  hunyuan31: async (i: In) => { const s = normalizeSettings('fal-hunyuan3d-31', i); const f = facesOf(s.faces);
    return { input_image_url: await imageDataUri(photo(i)), generate_type: 'Normal', enable_pbr: s.texture === 'pbr', ...(f ? { face_count: Math.max(40_000, f) } : {}) }; },
};
/** The Tripo 3.1 graph (API format), from the official Comfy template api_tripo3_1_image_to_model: LoadImage → Tripo: Image to Model → Save 3D Model.
 *  Inputs as the node's object_info lists them (TripoImageToModelNodeV2, ComfyUI 0.41.x). `image` is the uploaded asset reference. */
export function tripoGraph(i: In, image: unknown) {
  const s = normalizeSettings('cloud-tripo-31', i); const f = facesOf(s.faces);
  return {
    '1': { class_type: 'LoadImage', inputs: { image } },
    '2': { class_type: 'TripoImageToModelNodeV2', inputs: { image: ['1', 0], model_version: 'v3.1-20260211', texture: s.texture !== 'off', pbr: s.texture === 'pbr', model_seed: seed31(i), texture_seed: seed31(i),
      orientation: 'default', texture_quality: s.texture === 'hd' ? 'detailed' : 'standard', texture_alignment: 'original_image', face_limit: f ?? -1, quad: false /* quad meshes come back as FBX only */,
      geometry_quality: s.detail === 'high' ? 'detailed' : 'standard', smart_low_poly: false, auto_size: true } },
    '3': { class_type: 'SaveGLB', inputs: { mesh: ['2', 1], filename_prefix: '3d/openhiggsfield' } },
  };
}
/** Run Tripo on Comfy Cloud (comfy/cloudV2.ts transport): upload the photo, submit the graph once, poll, save the GLB. Real whenever the Comfy key is set. */
async function runTripoCloud(job: Job, r: RouteDef, attempt: RouteAttempt) {
  const { ComfyCloudV2, CloudError, cloudFailure } = await import('../comfy/cloudV2.js'); const { cloudBase } = await import('../routing/cloudRun.js');
  const c = new ComfyCloudV2(cloudBase(), keyValue(r)!, `${job.id}-a${attempt.n}`);
  try {
    job.stage = 'uploading'; const asset = await c.upload(photo(job.input));
    job.stage = 'submitted';
    const res = await c.run(tripoGraph(job.input, asset), { partnerAuth: true, timeoutMs: 20 * 60_000, isCanceled: () => (job.status as string) === 'canceled',
      onSubmitted: (id) => { attempt.requestId = id; job.cloudJobId = id; (job.requestIds ??= []).push(id); }, onProgress: (p) => { job.stage = p.phase === 'queued' ? 'submitted' : 'rendering'; if (p.known) job.progress = p.percent; } });
    const outs = Object.values(res.outputs).flat() as any[];
    const glb = outs.find((o) => /\.glb$/i.test(String(o.filename ?? ''))) ?? outs.find((o) => /gltf/i.test(String(o.content_type ?? ''))) ?? outs.find((o) => /3d|model/i.test(String(o.kind ?? '')));
    if (!glb) throw new CloudError('cloud_job_failed', 'the run finished without a 3D model.', null, true, 'no glb output');
    job.stage = 'downloading'; const name = `${job.id}-out0.glb`; await c.download(glb, path.join(DATA_DIR, name));
    job.outputs = [{ label: '3D model', url: `/files/${name}` }]; job.resultUrl = job.outputs[0].url; job.status = 'done'; job.stage = 'done'; job.progress = 100; job.eta = 0;
  } catch (e) {
    if ((job.status as string) === 'canceled') return;
    if (e instanceof CloudError) throw cloudFailure(job, e, 'cloud-tripo-31');
    throw e;
  }
}

// ---------- model cards and routes ----------
registerProvider({ id: 'cloud-tripo-31', name: 'Tripo 3.1', kind: 'hosted', via: 'Comfy partner node TripoImageToModelNodeV2 on Comfy Cloud (official template api_tripo3_1_image_to_model), Comfy key; sample output without a key',
  docUrl: 'https://docs.comfy.org/tutorials/partner-nodes/tripo/model-generation', workflows: ['three-d-tripo31-i2m-api.json'], license: 'tripo-terms', licenseUrl: 'https://www.tripo3d.ai/terms', nodes: ['TripoImageToModelNodeV2'] } as any);
NATIVE_DIRECT['cloud-tripo-31'] = { label: 'Comfy Cloud · Tripo partner node', endpoint: 'POST https://cloud.comfy.org/api/v2/jobs (graph: LoadImage → TripoImageToModelNodeV2 → SaveGLB)', sourceUrl: COMFY_PRICING,
  typicalLatencySec: 90, latencyEstimated: true, latencySource: 'estimated: Tripo generations take about 1–2 minutes', output: '3d', cloudRun: runTripoCloud, modes: ['image-to-3d'] };
const falCard = (id: string, name: string, slug: string, docs: string, license: string, licenseUrl: string) => {
  registerProvider({ id, name, kind: 'hosted-direct', apiKeyEnv: FAL_ENV, via: `fal ${slug} (key in ${FAL_ENV}; sample output without a key)`, docUrl: docs, license, licenseUrl } as any);
  COMING_SOON[id] = 'Runs on fal';
};
falCard('fal-trellis2', 'TRELLIS.2', 'fal-ai/trellis-2', page('fal-ai/trellis-2'), 'mit', 'https://huggingface.co/microsoft/TRELLIS.2-4B');
falCard('fal-hunyuan3d-31', 'Hunyuan 3D 3.1', 'fal-ai/hunyuan-3d/v3.1/pro/image-to-3d', page('fal-ai/hunyuan-3d/v3.1/pro/image-to-3d'), 'tencent-hunyuan-3d', HUNYUAN_LICENCE);
const falRoute = (modelId: string, slug: string, label: string, sec: number, body: (i: In) => Promise<Record<string, unknown>>): RouteDef => ({
  routeId: `fal:${slug}`, kind: 'fal', modelId, endpoint: slug, priceRef: `fal:${slug}`, sourceUrl: `${page(slug)}/api`, checkedAt: D, typicalLatencySec: sec, latencyEstimated: true,
  latencySource: 'estimated: fal publishes no per-model latency', envKey: FAL_ENV, envAliases: ['FAL_KEY'], label: `${label} via fal`, output: '3d', modes: ['image-to-3d'], request: (job) => body(job.input) });
export const THREE_D_ROUTES: RouteDef[] = [
  falRoute('fal-trellis2', 'fal-ai/trellis-2', 'TRELLIS.2', 60, THREE_D_BODIES.trellis2),
  falRoute('fal-hunyuan3d-31', 'fal-ai/hunyuan-3d/v3.1/pro/image-to-3d', 'Hunyuan 3D 3.1 Pro', 120, THREE_D_BODIES.hunyuan31),
];
for (const r of THREE_D_ROUTES) (EXTRA_ROUTES[r.modelId] ??= []).push(r);
export const PIXAL3D_GB = fmtGB(PIXAL3D_FILES.reduce((a, f) => a + f.bytes, 0));
registerProvider({ id: 'comfy-pixal3d-trellis2', name: 'Pixal3D + TRELLIS.2', kind: 'open-weights', via: `local ComfyUI, official template 3d_pixal3d_trellis2_image_to_model (needs ${PIXAL3D_GB} of files; not downloaded)`,
  docUrl: 'https://github.com/Comfy-Org/workflow_templates/blob/main/templates/3d_pixal3d_trellis2_image_to_model.json', licenseParts: ['mit', 'dinov3'], nodes: ['Trellis2ShapeStage', 'Trellis2TextureStage', 'Pixal3DConditioning'] } as any);
/** Listed with its download size; it never runs (or downloads) until the user approves the download and a runner is added. */
COMING_SOON['comfy-pixal3d-trellis2'] = `Needs a download first (${PIXAL3D_GB}, ${PIXAL3D_FILES.length} files)`;
registerProvider({ id: 'local-turntable', name: 'Turntable (recorded in your browser)', kind: 'open-weights', via: 'This computer: the browser records the 3D viewer, ffmpeg saves an MP4 (no ComfyUI, no provider)', workflows: [], license: 'agpl-3.0-or-later', licenseParts: ['agpl-3.0-or-later'] } as any);
NATIVE_DIRECT['local-turntable'] = { noComfy: true, label: 'Your computer · free' };

// ---------- the tools ----------
const IMAGE_RX = /\.(png|jpe?g|webp)$/i;
export const threeDTool: ToolDef = {
  id: THREE_D_TOOL, name: '3D', category: '3D', status: 'new', route: THREE_D_PAGE, ui: 'three-d',
  description: 'Turn one picture into a textured 3D model (GLB). Tripo 3.1 through Comfy by default; TRELLIS.2 and Hunyuan 3D on fal.',
  inputs: [
    { name: 'image', kind: 'file', required: true, accept: 'image/png,image/jpeg,image/webp', label: 'Image' },
    { name: 'types', kind: 'list', required: true, options: ['image-to-3d'] },
    { name: 'detail', kind: 'select', options: ['low', 'standard', 'high'], default: 'standard', label: 'Detail' },
    { name: 'texture', kind: 'select', options: ['off', 'standard', 'hd', 'pbr'], default: 'standard', label: 'Texture' },
    { name: 'faces', kind: 'select', options: ['auto', '10k', '50k', '200k'], default: 'auto', label: 'Face count' },
    { name: 'format', kind: 'select', options: ['glb'], default: 'glb', label: 'Format' },
    { name: 'seed', kind: 'number' },
  ],
  presets: [{ id: 'image-to-3d', label: 'Image to 3D', prompt: '', group: 'Mode' }],
  app: { kind: '3d', input: 'image', prompt: false, providerModes: Object.fromEntries(THREE_D_MODEL_IDS.map((id) => [id, ['image-to-3d']])), threeD: true },
  workflows: ['three-d-tripo31-i2m-api.json'], model: 'Tripo 3.1 (Comfy) · TRELLIS.2 · Hunyuan 3D 3.1 (fal) · Pixal3D + TRELLIS.2 (Local)',
  gpuSecPerSec: { standard: 60 }, providers: [...THREE_D_MODEL_IDS],
  stages: [['uploading', 'Uploading'], ['shaping', 'Building the shape'], ['texturing', 'Painting the texture'], ['saving', 'Saving the GLB']],
  routeInput: (i) => ({ resolution: threeDPriceKey(i), outKind: '3d', types: ['image-to-3d'], mode: 'image-to-3d' }),
  async parseInput(fields, files) {
    let types: string[] = []; try { types = JSON.parse(fields.types || '["image-to-3d"]'); } catch { types = (fields.types || 'image-to-3d').split(','); }
    if (types[0] && types[0] !== 'image-to-3d') { const msg = 'Only Image to 3D runs here for now; the other 3D workflows are coming soon.'; return { error: msg, code: 'invalid_type', issues: [{ code: 'invalid_type', field: 'types', message: msg }] } as any; }
    const provider = fields.provider || 'cloud-tripo-31';
    if (!threeDModel(provider)) { const msg = `${provider} isn't a 3D model. Pick Tripo 3.1, TRELLIS.2 or Hunyuan 3D 3.1.`; return { error: msg, code: 'unsupported', issues: [{ code: 'unsupported', field: 'provider', message: msg }] } as any; }
    const img = files.image?.[0];
    if (!img) return { error: 'Add an image to turn into 3D.', issues: [{ code: 'required', field: 'image', message: 'Add an image.' }] } as any;
    if (!IMAGE_RX.test(img) || !(await probe(path.join(DATA_DIR, img)))) return { error: 'Use a PNG, JPG or WebP image.', issues: [{ code: 'format', field: 'image', message: 'Use a PNG, JPG or WebP image.' }] } as any;
    for (const [f, ok] of [['detail', ['low', 'standard', 'high']], ['texture', ['off', 'standard', 'hd', 'pbr']], ['faces', ['auto', '10k', '50k', '200k']], ['format', ['glb']]] as const)
      if (fields[f] && !(ok as readonly string[]).includes(fields[f])) { const msg = `${f[0].toUpperCase()}${f.slice(1)}: pick one of ${ok.join(', ')}.`; return { error: msg, issues: [{ code: 'invalid', field: f, message: msg }] } as any; }
    const s = normalizeSettings(provider, fields); const warnings: string[] = [];
    const asked = { detail: fields.detail, texture: fields.texture, faces: fields.faces };
    for (const k of ['detail', 'texture', 'faces'] as const) if (asked[k] && asked[k] !== s[k]) warnings.push(`${threeDModel(provider)!.name} doesn't offer ${k} "${asked[k]}", so it runs with "${s[k]}".`);
    return { types: ['image-to-3d'], mode: 'image-to-3d', outKind: '3d', prompt: '', finalPrompt: '', ...s, format: 'glb', resolution: threeDPriceKey(s), duration: 1,
      seed: seedOf(fields.seed), simulate: mockFailOf(fields), imagePath: path.join(DATA_DIR, img), imageUrl: `/files/${img}`, refPaths: [path.join(DATA_DIR, img)], refUrls: [`/files/${img}`], outputLabel: '3D model', warnings };
  },
  run: (job) => mockRun(job, threeDTool.stages, ['3D model'], 5000),
};
(threeDTool as any).media = '3d';

/** Turntable: the recorded orbit (field `video`, WebM or MP4 from the browser) → an MP4 (H.264, even size, ≤ 10 s), linked back to its 3D job. */
export const turntableTool: ToolDef = {
  id: TURNTABLE_TOOL, name: 'Turntable video', category: '3D', status: 'new', route: threeDRoute('turntable'), ui: 'three-d', listed: false,
  description: 'Spin your 3D model and keep it as a video. Free: recorded in your browser.',
  inputs: [{ name: 'video', kind: 'file', required: true, accept: 'video/webm,video/mp4' }, { name: 'sourceJob', kind: 'text' }, { name: 'seconds', kind: 'number' }, { name: 'types', kind: 'list', options: ['turntable'] }],
  presets: [{ id: 'turntable', label: 'Turntable video', prompt: '', group: 'Mode' }],
  app: { kind: 'video', providerModes: { 'local-turntable': ['turntable'] } },
  workflows: [], gpuSecPerSec: { source: 0 }, providers: ['local-turntable'], stages: [['saving', 'Saving the video']],
  routeInput: () => ({ types: ['turntable'], mode: 'turntable' }),
  async parseInput(fields, files) {
    const v = files.video?.[0]; if (!v) return { error: 'Record a turntable first.', issues: [{ code: 'required', field: 'video', message: 'Record a turntable first.' }] } as any;
    /* a browser recording (MediaRecorder WebM) often has no duration in its header: then the frames must still decode, and the length is the one the page recorded */
    const probed = await mediaDuration(path.join(DATA_DIR, v)).catch(() => 0); const size = probed > 0 ? null : await videoSize(path.join(DATA_DIR, v)).catch(() => null);
    const secs = probed > 0 ? probed : size ? Math.max(0, Math.min(10, Number(fields.seconds) || 6)) : 0;
    if (!(secs > 0.5)) return { error: 'That recording could not be read. Try again.', issues: [{ code: 'format', field: 'video', message: 'That recording could not be read.' }] } as any;
    const { jobs } = await import('../jobs.js'); const src = fields.sourceJob ? jobs.get(fields.sourceJob) : undefined;
    if (fields.sourceJob && (!src || src.status !== 'done')) return { error: 'The 3D result this turntable is for was not found.', issues: [{ code: 'not_found', field: 'sourceJob', message: 'That 3D result was not found.' }] } as any;
    return { types: ['turntable'], mode: 'turntable', outKind: 'video', prompt: '', videoPath: path.join(DATA_DIR, v), videoUrl: `/files/${v}`, duration: Math.min(10, Math.round(secs * 10) / 10), resolution: 'source',
      sourceJob: src?.id ?? null, glbUrl: src?.resultUrl ?? null, imageUrl: (src as any)?.threeD?.posterUrl ?? null, outputLabel: 'Turntable', warnings: [] };
  },
  async run(job) {
    job.status = 'running'; job.stage = 'saving'; job.progress = 10;
    const name = `${job.id}-out0.mp4`; const out = path.join(DATA_DIR, name);
    const code = await runFfmpeg(['-y', '-v', 'error', '-i', job.input.videoPath, '-t', '10', '-an', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-movflags', '+faststart', out]);
    if (code !== 0) { if (/\.mp4$/i.test(job.input.videoPath)) await copyFile(job.input.videoPath, out); else { job.status = 'failed'; job.errorType = 'temporary'; job.error = 'The recording could not be saved as a video. Nothing was charged; try again.'; return; } }
    job.outputs = [{ label: 'Turntable', url: `/files/${name}` }]; job.resultUrl = job.outputs[0].url; job.status = 'done'; job.stage = 'done'; job.progress = 100; job.eta = 0;
    if (job.input.sourceJob) { const { jobs } = await import('../jobs.js'); const src = jobs.get(job.input.sourceJob); if (src) (src as any).threeD = { ...((src as any).threeD ?? {}), turntableUrl: job.resultUrl, turntableJob: job.id }; }
  },
};
(turntableTool as any).media = '3d';
