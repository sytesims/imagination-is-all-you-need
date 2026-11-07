/**
 * Layers: the shared tables it adds itself (imported once with the built-in tools (tools/builtin.ts)): its two places (your computer, Comfy Cloud), the
 * Comfy Cloud workflow entry and its runner route, the Comfy Cloud price row (an estimate until one measured run: priceUnmeasured, the same
 * gate every Comfy Cloud workflow follows, routing/cloudRun.ts), model names, and licences.
 */
import { registerProvider } from '../providers.js';
import { registerWorkflowLicense, registerLicenseComponents, LICENSES } from '../licenses.js';
import { registerModelInfo } from '../models.js';
import { MODEL_CATALOG } from '../shared/modelCatalog.js';
import { CLOUD_WORKFLOWS } from '../comfy/cloudWorkflows.js';
import { CLOUD_RUNNER_ROUTES } from '../routing/runnable.js';
import { NATIVE_DIRECT } from '../routing/directRoutes.js';
import { addTwin } from '../routing/routes.js';
import { HOSTED_PRICES, HOSTED_BY_ID, cloudGpuUsd, type HostedPrice } from '../shared/hostedPrices.js';
import { FOOTAGE_FX_WORKFLOW } from '../shared/footageFx.js';
import { LAYERS_LOCAL, LAYERS_CLOUD, LAYERS_CLOUD_ROUTE, LAYERS_TOOL, LAYERS_WORKFLOW, LAYERS_MAX_SECONDS, LAYERS_FPS, LAYERS_MODEL_LINE } from './constants.js';
import { layersPlan } from './plan.js';
import { pieces } from './graph.js';

/** Comfy Cloud GPU-seconds, from the Comfy Cloud test of 2026-11-07: one 2-second piece (48 frames, one name) tracked in about 18 s. More names
 *  per piece are not measured yet. BiRefNet and Depth Anything 3 over the whole clip: guessed at 2 GPU-seconds per second of clip. */
export const LAYERS_GPU_SEC = { piece: 18, perSecond: 2 } as const;
/** What a Comfy Cloud run is quoted (and charged) for, in GPU-seconds: pieces × the per-piece estimate + the per-second part. The clip runs at
 *  up to 24 fps (tool.ts), so a quote that only knows the seconds counts 24 frames per second. No clean background on Comfy Cloud yet. */
export function layersBillSeconds(i: Record<string, any>): number {
  const sec = Math.min(LAYERS_MAX_SECONDS, Math.max(0.5, Number(i.duration) || 5));
  const frames = Number(i.frames) > 0 ? Number(i.frames) : Math.round(sec * LAYERS_FPS);
  return Math.round((pieces(frames).length * LAYERS_GPU_SEC.piece + sec * LAYERS_GPU_SEC.perSecond) * 100) / 100;
}

const SAM = { model: 'SAM 3.1 (sam3.1_multiplex_fp16, Comfy-Org/sam3.1) · finds and tracks each object', license: 'SAM License', commercial: 'restricted' as const, url: 'https://github.com/facebookresearch/sam3/blob/main/LICENSE', licenseId: 'sam-license' };
const PARTS = [
  { ...SAM, terms: LICENSES['sam-license']?.terms },
  { model: 'BiRefNet (birefnet.safetensors, Comfy-Org/BiRefNet; ZhengPeng7/BiRefNet) · soft edges', license: 'MIT', commercial: 'yes' as const, url: 'https://huggingface.co/ZhengPeng7/BiRefNet', licenseId: 'mit' },
  { model: 'Depth Anything 3 Small (depth_anything_3_small.safetensors, Comfy-Org/Depth-Anything-3; ByteDance-Seed) · depth and layer order', license: 'Apache-2.0', commercial: 'yes' as const, url: 'https://huggingface.co/Comfy-Org/Depth-Anything-3', licenseId: 'apache-2.0' },
  { model: 'Depth Anything 3 Mono-Large (depth_anything_3_mono_large.safetensors, Comfy-Org/Depth-Anything-3) · depth on Comfy Cloud (the official template’s default)', license: 'Apache-2.0 (Hugging Face tag; upstream terms of the Large checkpoints not yet checked)', commercial: 'yes' as const, url: 'https://huggingface.co/Comfy-Org/Depth-Anything-3', licenseId: 'apache-2.0' },
  { model: 'Clean background: Footage Effects Vanish on your computer (LTX-2.5 + Clean Plate IC-LoRA); Comfy Cloud skips it for now; Lightricks', license: 'LTX-2.x Community License', commercial: 'restricted' as const, url: 'https://github.com/Lightricks/LTX-2/blob/main/LICENSE-2_x', licenseId: 'ltx-2x-community' },
  { model: 'Video to layers graph (workflows/layers-split-api.json): our own, core ComfyUI nodes, after the official Comfy-Org templates (SAM 3 video segmentation, BiRefNet remove background, Depth Anything 3 video depth)', license: 'MIT', commercial: 'yes' as const, url: 'https://github.com/Comfy-Org/workflow_templates', licenseId: 'mit' },
];

registerWorkflowLicense(LAYERS_WORKFLOW, ['sam-license', 'mit', 'apache-2.0']);
registerLicenseComponents(LAYERS_TOOL, PARTS as any);
registerProvider({ id: LAYERS_LOCAL, name: LAYERS_MODEL_LINE, kind: 'open-weights', via: `local ComfyUI, workflows/${LAYERS_WORKFLOW} (+ Footage Effects Vanish for the clean background)`,
  workflows: [LAYERS_WORKFLOW, FOOTAGE_FX_WORKFLOW], docUrl: 'https://docs.comfy.org/tutorials/utility/video-segment-sam3', licenseParts: ['sam-license', 'mit', 'apache-2.0'],
  nodes: ['SAM3_Detect', 'SAM3_VideoTrack', 'SAM3_TrackToMask', 'RemoveBackground', 'DA3Inference', 'DA3Render'] } as any);
registerProvider({ id: LAYERS_CLOUD, name: `${LAYERS_MODEL_LINE} · Comfy Cloud`, kind: 'hosted', license: 'sam-license', licenseUrl: SAM.url, docUrl: 'https://docs.comfy.org/tutorials/utility/video-segment-sam3',
  via: `Comfy Cloud workflow job (API v2): our own graph workflows/${LAYERS_WORKFLOW}, core nodes only, in 2-second pieces; price: an estimate from one measured piece`,
  workflows: [LAYERS_WORKFLOW], stages: [['uploading', 'Uploading your clip'], ['submitted', 'Submitted to Comfy Cloud'], ['rendering', 'Splitting on Comfy Cloud'], ['downloading', 'Downloading the layers']] } as any);
registerModelInfo(LAYERS_LOCAL, { name: `${LAYERS_MODEL_LINE}`, speed: 'medium', quality: 'good', hint: 'Free on your computer · up to 15 s, up to 4 objects', badges: ['new'] } as any);
registerModelInfo(LAYERS_CLOUD, { name: `${LAYERS_MODEL_LINE} · Comfy Cloud`, speed: 'fast', quality: 'good', hint: 'On rented graphics cards · up to 15 s, up to 4 objects', badges: ['new'] } as any);
for (const id of [LAYERS_LOCAL, LAYERS_CLOUD]) MODEL_CATALOG[id] = { name: LAYERS_MODEL_LINE, family: 'Video to layers',
  description: 'SAM 3.1 finds and tracks each thing you name, BiRefNet cleans the edges, Depth Anything 3 measures depth and orders the layers, and Footage Effects’ Vanish makes the clean background.',
  tech: 'SAM3_Detect on the first frame → one SAM3_VideoTrack (one object per name) → BiRefNet band refine (our own ffmpeg step) → DA3 Small depth, normalised over the clip → layers in depth order.' } as any;

const D = '2026-11-06' as HostedPrice['checkedAt'];
if (!HOSTED_BY_ID[LAYERS_CLOUD]) {
  const row: HostedPrice = { providerId: LAYERS_CLOUD, model: `Video to layers (${LAYERS_MODEL_LINE}) on Comfy Cloud`, unit: 'second', usd: cloudGpuUsd(1) /* per GPU-second: the quote counts them (layersBillSeconds) */, sourceUrl: 'https://www.comfy.org/cloud/pricing',
    checkedAt: D, estimated: true, priceUnmeasured: true,
    note: `Price not measured yet: an estimate. One measured Comfy Cloud run (2026-11-07): tracking a 2-second piece (48 frames, one name) took about ${LAYERS_GPU_SEC.piece} GPU-seconds, so a clip is quoted ${LAYERS_GPU_SEC.piece} GPU-seconds per 2-second piece plus about ${LAYERS_GPU_SEC.perSecond} per second for BiRefNet and Depth Anything 3. Comfy Cloud bills active GPU time (0.39 credits per GPU-second, 211 credits = $1), model load included. More names per piece are not measured yet; the full run is not measured yet either. No clean background on Comfy Cloud yet.` };
  HOSTED_PRICES.push(row); HOSTED_BY_ID[LAYERS_CLOUD] = row;
}
NATIVE_DIRECT[LAYERS_CLOUD] = { label: 'Comfy Cloud', sourceUrl: 'https://docs.comfy.org/tutorials/utility/video-segment-sam3', checkedAt: '2026-11-07', typicalLatencySec: 180, latencyEstimated: true, latencySource: 'estimated', output: 'video',
  priceInput: (i: Record<string, any>) => ({ ...i, duration: layersBillSeconds(i) }), caps: { maxSeconds: LAYERS_MAX_SECONDS, objects: 4 } } as any;
CLOUD_WORKFLOWS[LAYERS_CLOUD_ROUTE] = { routeId: LAYERS_CLOUD_ROUTE, provider: LAYERS_CLOUD, standalone: true, target: 'cloud', label: 'Video to layers · Comfy Cloud',
  graphs: [LAYERS_WORKFLOW],
  requires: { nodes: [...new Set(['LoadVideo', 'GetVideoComponents', 'CheckpointLoaderSimple', 'ImageFromBatch', 'CLIPTextEncode', 'SAM3_Detect', 'MaskToImage', 'SAM3_VideoTrack',
    'SAM3_TrackToMask', 'SaveImage', 'LoadBackgroundRemovalModel', 'RemoveBackground', 'LoadDA3Model', 'DA3Inference', 'DA3Render'])],
    models: [{ loader: 'CheckpointLoaderSimple', field: 'ckpt_name', file: 'sam3.1_multiplex_fp16.safetensors' }, { loader: 'LoadBackgroundRemovalModel', field: 'bg_removal_name', file: 'birefnet.safetensors' },
      { loader: 'LoadDA3Model', field: 'model_name', file: 'depth_anything_3_mono_large.safetensors' }] },
  plan: (j) => layersPlan(j, 'cloud') };
CLOUD_RUNNER_ROUTES.add(LAYERS_CLOUD_ROUTE);
/** One card, two places: Comfy Cloud is a place of the local model (like Footage Effects), with its own price rule; held while unmeasured
 *  only when OPENHIGGSFIELD_ALLOW_UNMEASURED_CLOUD=0 (the shared gate, routing/select.ts). */
addTwin({ model: LAYERS_LOCAL, twin: LAYERS_CLOUD, tools: [LAYERS_TOOL], aliasOk: true, heldUntilMeasured: true, priceInput: (i) => ({ ...i, duration: layersBillSeconds(i) }),
  caps: { localOnly: false, maxSeconds: LAYERS_MAX_SECONDS, objects: 4, note: 'SAM 3.1, BiRefNet and Depth Anything 3 on Comfy Cloud, in 2-second pieces; the clean background runs on your computer for now. Up to 15 s, up to 4 objects.' } });
